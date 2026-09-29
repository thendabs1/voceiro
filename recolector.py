# recolector.py
"""
Recolector de titulares de Voceiro.

Fases:
  1. Pedir el RSS oficial de cada medio (KNOWN_FEEDS) → hasta N_FEED titulares
  2. Si no hay feed, scraping del listado (LISTING_URLS o home)
  3. Fallback a Google News si RSS y scraping fallan (GN_FALLBACK_DOMAINS)
  4. Estimar fecha de los scrapeados nuevos usando el intervalo entre runs
     (por medio, no global — ver `ultimo_exito_por_medio`)
  5. Deduplicar contra el histórico y fusionar
  6. Podar por ventana de retención
  7. Escribir:
        · public/datos.json            (formato viejo, compatibilidad)
        · public/datos/manifest.json   (índice del troceado nuevo)
        · public/datos/YYYY-MM-DD.json (un fichero por día, formato corto)
        · public/index.html
  8. Reporte final

Formato corto de noticia (ficheros diarios):
  d: dominio · t: titular · u: enlace · p: fecha_pub
  e: fecha_estimada · c: fecha recolección · f: fuente

Tabla de medios (una por fichero diario, sin duplicación por noticia):
  n: nombre · g: grupo · t: tipo · l: lang · tags: lista

Agrupación por día:
  - La fecha de agrupación prioriza fecha_pub si NO es futura.
  - Si fecha_pub es futura (> ahora + 6h) → se usa fecha_estimada o fecha
    (para no crear ficheros con fechas futuras por eventos programados).
  - Cualquier noticia con fecha de agrupación fuera de la ventana de
    retención se descarta.
"""

import hashlib
import json
import os
import re
import ssl
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from collections import defaultdict
import concurrent.futures

import requests
import feedparser
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context
from zoneinfo import ZoneInfo

from medios import MEDIA_CATALOG, HEADERS, KNOWN_FEEDS, todos_los_medios
try:
    from medios import (
        LISTING_URLS,
        google_news_url,
        GN_FALLBACK_DOMAINS,
        GN_QUERY_OVERRIDES,
    )
except ImportError:
    LISTING_URLS = {}
    GN_FALLBACK_DOMAINS = set()
    GN_QUERY_OVERRIDES = {}
    def google_news_url(d, lang='es', extra_q=None):
        return None


# ─────────────────────────────────────────────────────────────
# CONFIGURACIÓN
# ─────────────────────────────────────────────────────────────
N_FEED            = 60
DIAS_RETENCION    = 15
MAX_WORKERS       = 8
TIMEOUT           = 15
TZ_MADRID = ZoneInfo('Europe/Madrid')

# Intervalo por defecto si no hay datos.json previo (primer run)
INTERVALO_DEFAULT_SEG = 3600        # 1 hora
INTERVALO_MIN_SEG     = 60          # no menos de 1 min
INTERVALO_MAX_SEG     = 24 * 3600   # no más de 24 h

# Horizonte de "futuro legítimo": si fecha_pub está dentro de este margen
# respecto a ahora, se considera programada. Si está más allá, se
# considera futura y se usa otra fecha para agrupar.
HORIZONTE_FUTURO_HORAS = 6

GRUPOS_INCLUIDOS = []

# Google News fallback
GN_MAX_ITEMS      = 30
GN_DIAS_MAX       = 14
GN_SLEEP          = 0.3

DATOS_DIR         = 'public/datos'
MANIFEST_PATH     = 'public/datos/manifest.json'
STATE_PATH        = 'state.json'


# ─────────────────────────────────────────────────────────────
# SESIÓN HTTP CON SSL PERMISIVO
# ─────────────────────────────────────────────────────────────
class LegacySSLAdapter(HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        ctx = create_urllib3_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        try:
            ctx.options |= 0x4
        except Exception:
            pass
        try:
            ctx.set_ciphers('DEFAULT@SECLEVEL=1')
        except ssl.SSLError:
            pass
        kwargs['ssl_context'] = ctx
        return super().init_poolmanager(*args, **kwargs)


def _crear_sesion():
    s = requests.Session()
    adapter = LegacySSLAdapter()
    s.mount('https://', adapter)
    s.mount('http://', adapter)
    s.headers.update(HEADERS)
    return s


SESSION = _crear_sesion()


# ─────────────────────────────────────────────────────────────
# UTILIDADES DE FECHA
# ─────────────────────────────────────────────────────────────
def _to_iso_madrid(dt):
    if dt is None:
        return ''
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    try:
        return dt.astimezone(TZ_MADRID).isoformat(timespec='seconds')
    except Exception:
        return ''

def _limpiar_cdata(s):
    """Quita envoltorios <![CDATA[...]]> que algunos RSS dejan en el título."""
    if not s:
        return ''
    s = str(s).strip()
    changed = True
    while changed:
        changed = False
        if s.startswith('<![CDATA['):
            s = s[9:]
            changed = True
        if s.endswith(']]>'):
            s = s[:-3]
            changed = True
        s = s.strip()
    return s

def _rss_date_to_iso(raw):
    if not raw:
        return ''
    raw = str(raw).strip()
    if not raw:
        return ''

    try:
        dt = datetime.fromisoformat(raw.replace('Z', '+00:00'))
        return _to_iso_madrid(dt)
    except (ValueError, AttributeError):
        pass

    try:
        dt = parsedate_to_datetime(raw)
        if dt is not None:
            return _to_iso_madrid(dt)
    except (TypeError, ValueError):
        pass

    m = re.match(r'^(\d{1,2})[/-](\d{1,2})[/-](\d{4})'
                 r'(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?', raw)
    if m:
        d, mo, y, h, mi, se = m.groups()
        try:
            dt = datetime(int(y), int(mo), int(d),
                          int(h or 0), int(mi or 0), int(se or 0),
                          tzinfo=TZ_MADRID)
            return _to_iso_madrid(dt)
        except ValueError:
            pass

    return ''


def _parse_iso_flexible(val):
    """Convierte string ISO a datetime con tz. Devuelve None si no se puede."""
    if not val:
        return None
    try:
        dt = datetime.fromisoformat(val)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=TZ_MADRID)
        return dt
    except (ValueError, TypeError):
        return None


def _fecha_orden(n):
    """Fecha para ordenar visualmente: prioriza pub > estimada > recolección."""
    for key in ('fecha_pub', 'fecha_estimada', 'fecha'):
        dt = _parse_iso_flexible(n.get(key))
        if dt is not None:
            return dt
    return datetime.min.replace(tzinfo=timezone.utc)


def _fecha_agrupacion_dt(n, ahora=None):
    """
    Fecha que determina a qué día pertenece la noticia.
    - Si fecha_pub existe y NO es futura (> ahora + HORIZONTE) → fecha_pub.
    - Si fecha_pub es futura → fecha_estimada o fecha.
    - Si no hay fecha_pub → fecha_estimada o fecha.
    Devuelve None si no hay ninguna fecha válida.
    """
    if ahora is None:
        ahora = datetime.now(TZ_MADRID)
    horizonte = ahora + timedelta(hours=HORIZONTE_FUTURO_HORAS)

    for key in ('fecha_pub', 'fecha_estimada', 'fecha'):
        dt = _parse_iso_flexible(n.get(key))
        if dt is None:
            continue
        if dt > horizonte:
            continue  # futura → no sirve para agrupar, probar la siguiente
        return dt
    return None


def _fecha_visible_iso(n, ahora=None):
    """Fecha de agrupación en ISO. Se usa para decidir el día del fichero."""
    dt = _fecha_agrupacion_dt(n, ahora)
    if dt is None:
        return ''
    return dt.isoformat(timespec='seconds')


# ─────────────────────────────────────────────────────────────
# FASE 1 · OBTENER TITULARES
# ─────────────────────────────────────────────────────────────
def _parse_feed_lxml(content):
    """Fallback: parsea el feed con lxml (más permisivo que feedparser)."""
    try:
        from lxml import etree
    except ImportError:
        return []
    try:
        parser = etree.XMLParser(recover=True, huge_tree=True,
                                 resolve_entities=False, no_network=True)
        root = etree.fromstring(content, parser=parser)
    except Exception:
        return []
    if root is None:
        return []

    def local(tag):
        return tag.split('}', 1)[1].lower() if '}' in tag else tag.lower()

    tag = local(root.tag)
    if tag == 'rss' or tag == 'rdf':
        entries = root.findall('.//item')
    elif tag == 'feed':
        entries = [el for el in root.iter() if local(el.tag) == 'entry']
    else:
        return []

    out = []
    for e in entries[:N_FEED]:
        t = l = raw_date = ''
        for el in e.iter():
            ln = local(el.tag)
            if ln == 'title' and not t:
                t = _limpiar_cdata(el.text or '')
            elif ln == 'link' and not l:
                l = (el.text or '').strip() or el.get('href', '').strip()
            elif ln in ('pubdate', 'published', 'updated', 'date') and not raw_date:
                raw_date = (el.text or '').strip()
        if not t or not l:
            continue
        fecha_pub = _rss_date_to_iso(raw_date) if raw_date else ''
        out.append({'titular': t, 'enlace': l, 'fecha_pub': fecha_pub})
    return out


def _parse_feed(content):
    feed = feedparser.parse(content)
    out = []
    for e in feed.entries[:N_FEED]:
        t = _limpiar_cdata(e.get('title') or '')
        l = (e.get('link') or '').strip()
        if not t or not l:
            continue
        fecha_pub = ''
        raw = e.get('published') or e.get('updated') or ''
        if raw:
            fecha_pub = _rss_date_to_iso(raw)
        if not fecha_pub:
            st = e.get('published_parsed') or e.get('updated_parsed')
            if st:
                try:
                    dt = datetime(*st[:6], tzinfo=timezone.utc)
                    fecha_pub = _to_iso_madrid(dt)
                except Exception:
                    pass
        out.append({'titular': t, 'enlace': l, 'fecha_pub': fecha_pub})

    # Fallback: si feedparser no sacó nada, intentar lxml
    if not out:
        out = _parse_feed_lxml(content)
    return out


def _extract_item_date(tag):
    """Intenta extraer la fecha real de un titular concreto del listado."""
    # <time> cercano
    node = tag
    for _ in range(3):
        if node is None:
            break
        try:
            t_el = node.find('time')
            if t_el:
                raw = t_el.get('datetime') or t_el.get_text(' ', strip=True)
                iso = _rss_date_to_iso(raw)
                if iso:
                    return iso
        except AttributeError:
            pass
        node = getattr(node, 'parent', None)

    # data-*
    node = tag
    for _ in range(3):
        if node is None or not hasattr(node, 'attrs') or not node.attrs:
            break
        for attr in ('data-timestamp', 'data-time', 'data-date',
                     'data-datetime', 'data-published', 'data-pubdate'):
            val = node.attrs.get(attr)
            if not val:
                continue
            val_str = str(val).strip()
            if val_str.isdigit():
                try:
                    ts = int(val_str)
                    if ts > 1e12:
                        ts = ts / 1000
                    dt = datetime.fromtimestamp(ts, tz=timezone.utc)
                    return _to_iso_madrid(dt)
                except (ValueError, OSError, OverflowError):
                    pass
            else:
                iso = _rss_date_to_iso(val_str)
                if iso:
                    return iso
        node = getattr(node, 'parent', None)

    # texto relativo
    node = tag
    for _ in range(3):
        if node is None:
            break
        try:
            txt = node.get_text(' ', strip=True).lower()
        except AttributeError:
            txt = ''
        m = re.search(
            r'hace\s+(\d+)\s*'
            r'(minuto|minutos|min|hora|horas|h|d[ií]a|d[ií]as|d|'
            r'semana|semanas|mes|meses)',
            txt
        )
        if m:
            n_val = int(m.group(1))
            unit = m.group(2)
            if unit.startswith('min'):
                delta = timedelta(minutes=n_val)
            elif unit.startswith('h'):
                delta = timedelta(hours=n_val)
            elif unit.startswith('sem'):
                delta = timedelta(weeks=n_val)
            elif unit.startswith('mes'):
                delta = timedelta(days=n_val * 30)
            else:
                delta = timedelta(days=n_val)
            dt = datetime.now(TZ_MADRID) - delta
            return dt.isoformat(timespec='seconds')
        node = getattr(node, 'parent', None)

    # <article> contenedor
    node = tag
    for _ in range(5):
        if node is None:
            break
        if getattr(node, 'name', None) == 'article':
            t_el = node.find('time')
            if t_el:
                raw = t_el.get('datetime') or t_el.get_text(' ', strip=True)
                iso = _rss_date_to_iso(raw)
                if iso:
                    return iso
            meta_el = node.find('meta', attrs={'itemprop': 'datePublished'})
            if meta_el and meta_el.get('content'):
                iso = _rss_date_to_iso(meta_el.get('content'))
                if iso:
                    return iso
            break
        node = getattr(node, 'parent', None)

    return ''


def _rss(medio):
    url = KNOWN_FEEDS.get(medio['d'])
    if not url:
        return None
    try:
        r = SESSION.get(url, timeout=TIMEOUT)
        if r.status_code != 200:
            print(f"  [RSS {r.status_code}] {medio['n']}: {url}")
            return None
        items = _parse_feed(r.content)
        if items:
            return items
        # Diagnóstico: por qué devolvió vacío
        snippet = (r.content[:200] or b'').decode('utf-8', 'ignore')
        print(f"  [RSS empty] {medio['n']}: {url}  "
              f"ctype={r.headers.get('content-type')!r}  "
              f"bytes={len(r.content)}  head={snippet[:80]!r}")
        return None
    except Exception as e:
        print(f"  [RSS!] {medio['n']}: {type(e).__name__}: {e}")
    return None


def _scrape(medio):
    url = LISTING_URLS.get(medio['d']) or f"https://{medio['d']}"
    try:
        r = SESSION.get(url, timeout=TIMEOUT, allow_redirects=True)
        if r.status_code != 200:
            print(f"  [SCRAPE {r.status_code}] {medio['n']}")
            return None
        soup = BeautifulSoup(r.text, 'lxml')

        vistos = set()
        out = []
        for tag in soup.find_all(['h1', 'h2', 'h3'], limit=80):
            a = tag.find('a', href=True)
            if not a:
                continue
            texto = a.get_text(' ', strip=True)
            if len(texto) < 30:
                continue
            href = a['href']
            if href.startswith('/'):
                href = url + href
            elif href.startswith('//'):
                href = 'https:' + href
            elif not href.startswith('http'):
                continue
            if href in vistos:
                continue
            vistos.add(href)

            item_date = _extract_item_date(tag)
            out.append({
                'titular':   texto,
                'enlace':    href,
                'fecha_pub': item_date,
                'pos':       len(out),
            })
            if len(out) >= N_FEED:
                break
        return out or None
    except Exception as e:
        print(f"  [SCRAPE!] {medio['n']}: {type(e).__name__}: {e}")
    return None


# ─────────────────────────────────────────────────────────────
# FASE 1c · GOOGLE NEWS (fallback)
# ─────────────────────────────────────────────────────────────
def _limpiar_titular_gn(titulo, source_name):
    if not titulo or not source_name:
        return titulo
    sufijo = ' - ' + source_name
    if titulo.endswith(sufijo):
        return titulo[:-len(sufijo)].strip()
    return titulo


def _parse_gn_feed(content):
    feed = feedparser.parse(content)
    out = []
    for e in feed.entries[:GN_MAX_ITEMS * 2]:
        t = _limpiar_cdata(e.get('title') or '')
        l = (e.get('link') or '').strip()
        if not t or not l:
            continue

        source_name = ''
        source_url = ''
        src = e.get('source')
        if isinstance(src, dict):
            source_name = (src.get('title') or '').strip()
            source_url = (src.get('href') or '').strip()
        elif src:
            source_name = str(src).strip()

        fecha_pub = ''
        raw = e.get('published') or e.get('updated') or ''
        if raw:
            fecha_pub = _rss_date_to_iso(raw)
        if not fecha_pub:
            st = e.get('published_parsed') or e.get('updated_parsed')
            if st:
                try:
                    dt = datetime(*st[:6], tzinfo=timezone.utc)
                    fecha_pub = _to_iso_madrid(dt)
                except Exception:
                    pass

        out.append({
            'titular':     _limpiar_titular_gn(t, source_name),
            'enlace':      l,
            'fecha_pub':   fecha_pub,
            'source_name': source_name,
            'source_url':  source_url,
        })
    return out


def _dominio_de_url(url):
    if not url:
        return ''
    try:
        from urllib.parse import urlparse
        d = (urlparse(url).netloc or '').lower()
        if d.startswith('www.'):
            d = d[4:]
        return d
    except Exception:
        return ''


def _google_news(medio):
    domain = medio['d']
    if domain not in GN_FALLBACK_DOMAINS:
        return None

    lang = medio.get('lang', 'es')
    extra_q = GN_QUERY_OVERRIDES.get(domain)
    url = google_news_url(domain, lang, extra_q)
    if not url:
        return None

    try:
        r = SESSION.get(url, timeout=TIMEOUT)
        if r.status_code != 200:
            print(f"  [GN {r.status_code}] {medio['n']}")
            return None
        items = _parse_gn_feed(r.content)
        if not items:
            print(f"  [GN empty] {medio['n']}")
            return None

        corte = datetime.now(TZ_MADRID) - timedelta(days=GN_DIAS_MAX)
        filtrados = []
        for it in items:
            if not it.get('fecha_pub'):
                continue
            dt = _parse_iso_flexible(it['fecha_pub'])
            if dt is None or dt < corte:
                continue

            dom_src = _dominio_de_url(it.get('source_url', ''))
            if dom_src and not (
                dom_src == domain
                or dom_src.endswith('.' + domain)
                or domain.endswith('.' + dom_src)
            ):
                continue

            filtrados.append(it)
            if len(filtrados) >= GN_MAX_ITEMS:
                break

        if not filtrados:
            return None
        return filtrados

    except Exception as e:
        print(f"  [GN!] {medio['n']}: {type(e).__name__}: {e}")
        return None


def obtener_titulares(medio):
    items = _rss(medio)
    fuente = 'RSS'

    if not items:
        items = _scrape(medio)
        fuente = 'Scraping'

    if not items:
        items = _google_news(medio)
        fuente = 'Google News'

    if not items:
        return (medio, [], None)

    ahora = datetime.now(TZ_MADRID).isoformat(timespec='seconds')
    noticias = []
    for it in items:
        noticias.append({
            'medio':          medio['n'],
            'dominio':        medio['d'],
            'grupo':          medio['grupo'],
            'tipo':           medio.get('type', ''),
            'lang':           medio.get('lang', ''),
            'tags':           medio.get('tags', []),
            'titular':        it['titular'],
            'enlace':         it['enlace'],
            'fecha_pub':      it.get('fecha_pub', ''),
            'fecha_estimada': '',
            'fuente':         fuente,
            'fecha':          ahora,
            '_pos':           it.get('pos'),
        })

    return (medio, noticias, fuente)


# ─────────────────────────────────────────────────────────────
# ASIGNACIÓN DE FECHAS ESTIMADAS
# ─────────────────────────────────────────────────────────────
def asignar_fechas_estimadas(todas, historico_keys, t_prev_global, t_now,
                              ultimo_exito_por_medio):
    por_medio = defaultdict(list)

    for n in todas:
        if n.get('fuente') != 'Scraping':
            continue
        if n.get('fecha_pub'):
            continue
        key = (n['medio'], n['titular'])
        if key in historico_keys:
            continue
        por_medio[n['medio']].append(n)

    total_nuevos = 0
    intervalos_por_medio = {}

    for medio, items in por_medio.items():
        dominio = items[0].get('dominio')
        t_prev_medio = None

        if dominio:
            iso_prev = ultimo_exito_por_medio.get(dominio)
            if iso_prev:
                t_prev_medio = _parse_iso_flexible(iso_prev)

        if t_prev_medio is None:
            t_prev_medio = t_prev_global

        if t_prev_medio is not None:
            intervalo = (t_now - t_prev_medio).total_seconds()
        else:
            intervalo = INTERVALO_DEFAULT_SEG
        intervalo = max(INTERVALO_MIN_SEG, min(intervalo, INTERVALO_MAX_SEG))
        intervalos_por_medio[medio] = intervalo

        items.sort(key=lambda x: x.get('_pos') if x.get('_pos') is not None else 999)
        K = len(items)
        for i, n in enumerate(items):
            offset_seg = intervalo * (i + 1) / (K + 1)
            fecha = t_now - timedelta(seconds=offset_seg)
            n['fecha_estimada'] = fecha.isoformat(timespec='seconds')
            total_nuevos += 1

    return total_nuevos, intervalos_por_medio


# ─────────────────────────────────────────────────────────────
# FASE 2 · HISTÓRICO
# ─────────────────────────────────────────────────────────────
def cargar_historico_payload():
    """
    Carga el histórico desde:
      - state.json (solo estado: ultimo_exito_por_medio, generado)
      - public/datos/manifest.json + public/datos/*.json (noticias)
    Reconstruye las noticias al formato largo.
    """
    state = {'generado': None, 'ultimo_exito_por_medio': {}}
    if os.path.exists(STATE_PATH):
        try:
            with open(STATE_PATH, encoding='utf-8') as f:
                s = json.load(f) or {}
                state['generado'] = s.get('generado')
                state['ultimo_exito_por_medio'] = s.get('ultimo_exito_por_medio', {}) or {}
        except Exception as e:
            print(f"[state] no se pudo leer: {e}")

    noticias = []
    if os.path.exists(MANIFEST_PATH):
        try:
            with open(MANIFEST_PATH, encoding='utf-8') as f:
                manifest = json.load(f)
            if not state['generado']:
                state['generado'] = manifest.get('generado')

            for f_info in manifest.get('ficheros', []):
                fn = f_info.get('file')
                if not fn:
                    continue
                path = os.path.join(DATOS_DIR, fn)
                if not os.path.exists(path):
                    continue
                try:
                    with open(path, encoding='utf-8') as f2:
                        d = json.load(f2)
                except Exception:
                    continue
                medios_tabla = d.get('medios', {}) or {}
                for n in d.get('noticias', []) or []:
                    dom = n.get('d', '')
                    m_info = medios_tabla.get(dom, {}) or {}
                    noticias.append({
                        'medio':          m_info.get('n', ''),
                        'dominio':        dom,
                        'grupo':          m_info.get('g', ''),
                        'tipo':           m_info.get('t', ''),
                        'lang':           m_info.get('l', ''),
                        'tags':           m_info.get('tags', []) or [],
                        'titular':        n.get('t', ''),
                        'enlace':         n.get('u', ''),
                        'fecha_pub':      n.get('p', ''),
                        'fecha_estimada': n.get('e', ''),
                        'fuente':         n.get('f', ''),
                        'fecha':          n.get('c', ''),
                    })
        except Exception as e:
            print(f"[historico] no se pudo leer el troceado: {e}")

    print(f"[historico] {len(noticias)} noticias reconstruidas desde {DATOS_DIR}")
    return {
        'noticias': noticias,
        'generado': state['generado'],
        'ultimo_exito_por_medio': state['ultimo_exito_por_medio'],
    }

# ─────────────────────────────────────────────────────────────
# DEDUP EDITORIAL · mismo titular en varios medios del grupo
# ─────────────────────────────────────────────────────────────
def deduplicar_editorial(noticias):
    """
    Agrupa noticias por titular normalizado. De cada grupo deja un
    representante (el de mejor fecha) y guarda los demás como campo
    'alt' compacto: [{'d': dominio, 'u': url}, ...]

    Reduce ~25% el JSON y elimina el trabajo de dedup en el frontend.
    """
    import unicodedata
    from collections import defaultdict

    def norm_tit(s):
        s = (s or '').lower()
        s = unicodedata.normalize('NFD', s)
        s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
        return ''.join(c for c in s if c.isalnum())

    def score(n):
        # Preferimos: con fecha_pub > con fecha_estimada > con fecha > resto.
        # Empate → más reciente.
        tiene_pub = 1 if n.get('fecha_pub') else 0
        tiene_est = 1 if n.get('fecha_estimada') else 0
        dt = _fecha_orden(n)
        ts = dt.timestamp() if dt else 0
        return (tiene_pub, tiene_est, ts)

    grupos = defaultdict(list)
    for n in noticias:
        key = norm_tit(n.get('titular', ''))
        if not key:
            # Sin título → no agrupar (id único por objeto)
            grupos[f'__solo_{id(n)}__'].append(n)
            continue
        grupos[key].append(n)

    salida = []
    grupos_colapsados = 0
    items_ocultos = 0

    for key, items in grupos.items():
        if len(items) == 1:
            salida.append(items[0])
            continue

        items.sort(key=score, reverse=True)
        rep = items[0]
        otros = items[1:]

        rep['alt'] = [
            {'d': o.get('dominio', ''), 'u': o.get('enlace', '')}
            for o in otros
        ]
        salida.append(rep)
        grupos_colapsados += 1
        items_ocultos += len(otros)

    if grupos_colapsados:
        print(f"[dedup] {grupos_colapsados} titulares colapsados "
              f"· {items_ocultos} noticias referenciadas como 'alt'")

    return salida
  
def fusionar_historico(nuevas, viejas, dias):
    """
    Fusiona nuevas con viejas y filtra por ventana de retención usando la
    fecha de AGRUPACIÓN (no la de recolección). Descarta:
      - noticias con fecha de agrupación anterior a la ventana
      - noticias sin ninguna fecha válida
    """
    corte = datetime.now(TZ_MADRID) - timedelta(days=dias)
    idx = {}

    # Viejas: filtrar por fecha de agrupación
    for n in viejas:
        f = _fecha_agrupacion_dt(n)
        if f is None or f < corte:
            continue
        idx[(n['medio'], n['titular'])] = n

    for n in nuevas:
        key = (n['medio'], n['titular'])
        old = idx.get(key)
        if old:
            n['fecha'] = old.get('fecha', n['fecha'])
            if not n.get('fecha_pub') and old.get('fecha_pub'):
                n['fecha_pub'] = old['fecha_pub']
            if old.get('fecha_estimada') and not n.get('fecha_estimada'):
                n['fecha_estimada'] = old['fecha_estimada']
        n.pop('_pos', None)

        f = _fecha_agrupacion_dt(n)
        if f is None or f < corte:
            continue

        idx[key] = n

    todos = list(idx.values())
    todos.sort(key=_fecha_orden, reverse=True)
    return todos



def guardar_state(generado_iso, ultimo_exito_por_medio):
    payload = {
        'generado': generado_iso,
        'ultimo_exito_por_medio': ultimo_exito_por_medio or {},
    }
    with open(STATE_PATH, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))
    kb = os.path.getsize(STATE_PATH) / 1024
    print(f"[state] {STATE_PATH} · {kb:.1f} KB")

# ─────────────────────────────────────────────────────────────
# FASE 3b · SALIDA TROCEADA (datos/manifest.json + días)
# ─────────────────────────────────────────────────────────────
def _dia_iso(iso_str, fallback):
    """Extrae 'YYYY-MM-DD' en zona Madrid, o `fallback` si no se puede."""
    dt = _parse_iso_flexible(iso_str)
    if dt is None:
        return fallback
    dt = dt.astimezone(TZ_MADRID)
    return dt.strftime('%Y-%m-%d')


def _noticia_a_formato_corto(n):
    out = {
        'd': n.get('dominio', ''),
        't': n.get('titular', ''),
        'u': n.get('enlace', ''),
        'p': n.get('fecha_pub', ''),
        'e': n.get('fecha_estimada', ''),
        'c': n.get('fecha', ''),
        'f': n.get('fuente', ''),
    }
    alt = n.get('alt')
    if alt:
        out['a'] = alt
    return out


def _tabla_medios_de(items):
    """Construye la tabla {dominio: {n,g,t,l,tags}} a partir de las noticias.
    Se devuelve ordenada alfabéticamente por dominio para estabilidad."""
    medios = {}
    for n in items:
        d = n.get('dominio')
        if not d or d in medios:
            continue
        medios[d] = {
            'n':    n.get('medio', ''),
            'g':    n.get('grupo', ''),
            't':    n.get('tipo', ''),
            'l':    n.get('lang', ''),
            'tags': n.get('tags', []),
        }
    return dict(sorted(medios.items()))


def _orden_estable(n):
    """Clave de orden determinista: fecha DESC, luego dominio, luego titular."""
    dt = _fecha_orden(n)
    return (-dt.timestamp(), n.get('dominio', ''), n.get('titular', ''))


def generar_troceados(noticias, ahora):
    """Genera datos/manifest.json + datos/YYYY-MM-DD.json en formato corto."""
    os.makedirs(DATOS_DIR, exist_ok=True)
    hoy_str = ahora.strftime('%Y-%m-%d')
    generado_iso = ahora.isoformat(timespec='seconds')

    # Agrupar por día de agrupación
    por_dia = defaultdict(list)
    for n in noticias:
        iso_agrup = _fecha_visible_iso(n, ahora)
        dia = _dia_iso(iso_agrup, hoy_str)
        por_dia[dia].append(n)

    ficheros = []
    total_kb = 0.0

    for dia in sorted(por_dia.keys(), reverse=True):
        items = por_dia[dia]
        items.sort(key=_orden_estable)

        payload = {
            'fecha':    dia,
            'generado': generado_iso,
            'medios':   _tabla_medios_de(items),
            'noticias': [_noticia_a_formato_corto(n) for n in items],
        }

        blob = json.dumps(payload, ensure_ascii=False,
                          separators=(',', ':')).encode('utf-8')
        hash_ = hashlib.md5(blob).hexdigest()[:10]

        filename = f'{dia}.json'
        path = os.path.join(DATOS_DIR, filename)
        with open(path, 'wb') as f:
            f.write(blob)

        size_kb = len(blob) / 1024
        total_kb += size_kb

        ficheros.append({
            'fecha':  dia,
            'file':   filename,
            'n':      len(items),
            'hash':   hash_,
            'kb':     round(size_kb, 1),
            'es_hoy': dia == hoy_str,
        })

    manifest = {
        'generado':         generado_iso,
        'generado_legible': ahora.strftime('%d/%m/%Y %H:%M'),
        'dias_retencion':   DIAS_RETENCION,
        'n_feed':           N_FEED,
        'total':            len(noticias),
        'hoy':              hoy_str,
        'ficheros':         ficheros,
    }
    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, separators=(',', ':'))

    # Limpiar ficheros huérfanos
    validos = {f['file'] for f in ficheros}
    validos.add('manifest.json')
    eliminados = 0
    for nombre in os.listdir(DATOS_DIR):
        if not nombre.endswith('.json'):
            continue
        if nombre in validos:
            continue
        try:
            os.remove(os.path.join(DATOS_DIR, nombre))
            eliminados += 1
        except OSError:
            pass

    extra = f" · {eliminados} huérfanos borrados" if eliminados else ""
    print(f"[troceado] {len(ficheros)} ficheros · {total_kb:.1f} KB total{extra}")


# ─────────────────────────────────────────────────────────────
# FASE 3c · HTML
# ─────────────────────────────────────────────────────────────
def generar_html(fecha, total):
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, 'plantilla.html'), encoding='utf-8') as f:
        html = f.read()
    html = html.replace('{{FECHA}}', fecha).replace('{{TOTAL}}', str(total))
    with open('public/index.html', 'w', encoding='utf-8') as f:
        f.write(html)


# ─────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────
def main():
    medios = todos_los_medios()

    if GRUPOS_INCLUIDOS:
        medios = [m for m in medios if m['grupo'] in GRUPOS_INCLUIDOS]
        print(f"[filtro] grupos activos: {GRUPOS_INCLUIDOS}")

    print(f"── Recolectando {len(medios)} medios (hasta {N_FEED} cada uno) ──")

    todas = []
    contador_rss = 0
    contador_scrape = 0
    contador_gn = 0
    sin_resultado = []
    medios_sin_fecha = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        for medio, noticias, fuente in ex.map(obtener_titulares, medios):
            if noticias:
                todas.extend(noticias)
                if fuente == 'RSS':
                    contador_rss += 1
                elif fuente == 'Scraping':
                    contador_scrape += 1
                elif fuente == 'Google News':
                    contador_gn += 1
                con_fecha = sum(1 for n in noticias if n.get('fecha_pub'))
                if con_fecha == 0 and fuente != 'RSS':
                    medios_sin_fecha.append(medio['n'])
                print(f"✓ {medio['n']} ({fuente}): {len(noticias)} titulares"
                      f" · {con_fecha}/{len(noticias)} con fecha real")
            else:
                sin_resultado.append(medio['n'])
                print(f"✗ {medio['n']}: sin titulares")

    print(f"\nTitulares brutos: {len(todas)}")

    # ─── Cargar histórico y calcular T_prev ───
    print("\n── Cargando histórico ──")
    payload_prev = cargar_historico_payload()
    historico = payload_prev.get('noticias', [])
    ultimo_exito_prev = payload_prev.get('ultimo_exito_por_medio', {}) or {}
    print(f"Histórico previo: {len(historico)} noticias")
    print(f"Medios con marca de último éxito: {len(ultimo_exito_prev)}")

    t_prev_global = None
    generado_prev = payload_prev.get('generado')
    if generado_prev:
        t_prev_global = _parse_iso_flexible(generado_prev)

    t_now = datetime.now(TZ_MADRID)
    if t_prev_global:
        delta_min = (t_now - t_prev_global).total_seconds() / 60
        print(f"Run anterior: {generado_prev} (hace {delta_min:.1f} min)")
    else:
        print("Sin run previo — usando intervalo por defecto")

    historico_keys = {(n['medio'], n['titular']) for n in historico}

    # ─── Asignar fechas estimadas ───
    print("\n── Estimando fechas para scraping ──")
    total_estimados, intervalos_por_medio = asignar_fechas_estimadas(
        todas, historico_keys, t_prev_global, t_now, ultimo_exito_prev
    )
    print(f"Titulares nuevos con fecha estimada: {total_estimados}")

    if intervalos_por_medio:
        if t_prev_global:
            global_seg = (t_now - t_prev_global).total_seconds()
        else:
            global_seg = INTERVALO_DEFAULT_SEG
        raros = {
            m: s for m, s in intervalos_por_medio.items()
            if abs(s - global_seg) > 60
        }
        if raros:
            print(f"Intervalos específicos por medio ({len(raros)}):")
            for m, seg in sorted(raros.items(), key=lambda x: -x[1])[:10]:
                print(f"  · {m}: {seg/60:.1f} min")

    # ─── Fusionar con histórico ───
    print("\n── Fusionando ──")
    finales = fusionar_historico(todas, historico, DIAS_RETENCION)
    print(f"Total en histórico: {len(finales)}")

    print("\n── Deduplicando mismo titular entre medios ──")
    finales = deduplicar_editorial(finales)
    print(f"Total tras dedup:   {len(finales)}")

    # ─── Estadísticas ───
    con_pub = sum(1 for n in finales if n.get('fecha_pub'))
    con_est = sum(1 for n in finales
                  if not n.get('fecha_pub') and n.get('fecha_estimada'))
    sin_fecha = len(finales) - con_pub - con_est
    print(f"\n── Cobertura de fechas ──")
    print(f"  Con fecha real:     {con_pub}")
    print(f"  Con fecha estimada: {con_est}")
    print(f"  Sin fecha ninguna:  {sin_fecha}")

    # Cuántas noticias quedan descartadas por fecha fuera de ventana
    descartadas_ventana = len(todas) - len(finales) if len(todas) > len(finales) else 0
    if descartadas_ventana > 0:
        print(f"  Descartadas por fuera de ventana: {descartadas_ventana}")

    print(f"\n── Fuentes ──")
    print(f"  RSS:          {contador_rss} medios")
    print(f"  Scraping:     {contador_scrape} medios")
    print(f"  Google News:  {contador_gn} medios")

    # ─── Actualizar marcas de último éxito ───
    ultimo_exito_nuevo = dict(ultimo_exito_prev)
    t_now_iso = t_now.isoformat(timespec='seconds')
    for n in todas:
        dom = n.get('dominio')
        if dom:
            ultimo_exito_nuevo[dom] = t_now_iso

    # ─── Escribir salidas ───
    print()
    generar_troceados(finales, t_now)
    guardar_state(t_now.isoformat(timespec='seconds'), ultimo_exito_nuevo)
    generar_html(t_now.strftime('%d/%m/%Y %H:%M'), len(finales))

    if sin_resultado:
        print(f"\n── ⚠ Medios sin titulares ({len(sin_resultado)}) ──")
        for n in sin_resultado:
            print(f"  · {n}")

    if medios_sin_fecha:
        print(f"\n── ℹ Medios scrapeados sin ninguna fecha real ({len(medios_sin_fecha)}) ──")
        for n in medios_sin_fecha[:15]:
            print(f"  · {n}")

    print("\n✅ Listo")


if __name__ == '__main__':
    main()
