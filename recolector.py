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
import tempfile
import html
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from collections import defaultdict
import concurrent.futures

import requests
import feedparser
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context
from urllib.parse import urlparse
from zoneinfo import ZoneInfo
from curl_cffi import requests as curl_requests
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
N_FEED              = 60
DIAS_RETENCION      = 15    # working set: días que el runner deduplica y reescribe
DIAS_ARCHIVO        = 365   # entradas que el manifest lista y R2 conserva
VENTANA_GRACIA_DIAS = 3     # días recientes que se reescriben (hoy + 2)
MAX_WORKERS         = 8
TIMEOUT             = 25
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
GN_MAX_ITEMS      = 80
GN_DIAS_MAX       = 14
GN_SLEEP          = 0.3

DATOS_DIR         = 'public/datos'
MANIFEST_PATH     = 'public/datos/manifest.json'
STATE_PATH        = 'state.json'
DENO_RELAY_BASE = 'https://secret-worm-9453.thendabs1.deno.net/rss?u='
RELAY_DOMAINS = {
    'diariodepontevedra.es',
    'elprogreso.es',
    'capitalmadrid.com',
    'diariocritico.com',
    'efe.com',
    'elchapuzasinformatico.com',
    'hipertextual.com',
    'ctxt.es',
    'granadadigital.es',
    'sevillaactualidad.com',
    'murciaeconomia.com',
    'idealista.com',
    'elnacional.com',
    'washingtonpost.com',
    'politico.eu',
    'politico.com',
}
# ── Filtros anti-basura para scraping ──
BAD_WORDS = {
    'suscríbete', 'suscribete', 'newsletter', 'contacto',
    'aviso legal', 'privacidad', 'cookies', 'iniciar sesión',
    'iniciar sesion', 'regístrate', 'registrate', 'publicidad',
    'quiénes somos', 'quienes somos', 'términos y condiciones',
    'política de privacidad', 'politica de privacidad',
    'comentarios', 'comparte', 'compartir', 'síguenos', 'siguenos',
    'lo más leído', 'lo mas leido', 'más leídas', 'mas leidas',
    'en directo', 'ver más', 'ver mas', 'leer más', 'leer mas',
    'ver todos', 'ver todas', 'todos los artículos',
}
_QUERY_RUIDO = {
    'utm_source','utm_medium','utm_campaign','utm_term','utm_content',
    'fbclid','gclid','mc_cid','mc_eid','igshid','_ga','_gl',
    'ref','referrer','rss','at_medium','at_campaign',
}
BAD_PATH_SEGMENTS = (
    '/tag/', '/tags/', '/autor/', '/autores/', '/author/',
    '/seccion/', '/secciones/', '/category/', '/categoria/',
    '/newsletter', '/suscri', '/contact', '/contacto',
    '/aviso-legal', '/privacidad', '/privacy', '/terms',
    '/login', '/register', '/cuenta', '/perfil',
    '/comentarios', '/rss', '/publicidad', '/anunciate',
    '/quienes-somos', '/equipo', '/staff',
)

# Slug de noticia: minúsculas, números y guiones
SLUG_RE = re.compile(r'^[a-z0-9][a-z0-9\-]{15,}$')

# Medios que exponen API REST de WordPress (wp-json/wp/v2/posts)
WP_API_DOMAINS = {
    'muyinteresante.okdiario.com',
    'cambio16.com',
    # Añadir más aquí según se confirmen
}
# ─────────────────────────────────────────────────────────────
# SESIÓN HTTP CON SSL PERMISIVO
# ─────────────────────────────────────────────────────────────



def _crear_sesion():
    s = curl_requests.Session(impersonate="chrome")
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
def _hash_payload(payload):
    """
    Hash MD5 corto del payload SIN el campo 'generado' (metadata volátil).
    El hash refleja SOLO el contenido real (medios + noticias del día).
    """
    estatico = {k: v for k, v in payload.items() if k != 'generado'}
    blob = json.dumps(
        estatico, ensure_ascii=False, separators=(',', ':'), sort_keys=True
    ).encode('utf-8')
    return hashlib.md5(blob).hexdigest()[:10]


def _limpiar_cdata(s):
    """Quita <![CDATA[...]]> y decodifica entidades HTML."""
    if not s:
        return ''
    s = str(s).strip()
    # Quitar CDATA
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
    # Decodificar entidades HTML (&apos; &quot; &amp; &#39; etc.)
    s = html.unescape(s)
    # Colapsar espacios múltiples
    s = re.sub(r'\s+', ' ', s).strip()
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

    usar_relay = medio['d'] in RELAY_DOMAINS
    fetch_url = DENO_RELAY_BASE + url if usar_relay else url

    try:
        r = SESSION.get(fetch_url, timeout=TIMEOUT)
        if r.status_code != 200:
            tag = 'RELAY' if usar_relay else 'RSS'
            print(f"  [{tag} {r.status_code}] {medio['n']}: {fetch_url}")
            return None
        items = _parse_feed(r.content)
        if items:
            if usar_relay:
                print(f"  [RELAY ok] {medio['n']}: {len(items)} items")
            return items
        snippet = (r.content[:200] or b'').decode('utf-8', 'ignore')
        tag = 'RELAY' if usar_relay else 'RSS'
        print(f"  [{tag} empty] {medio['n']}: {fetch_url}  "
              f"ctype={r.headers.get('content-type')!r}  "
              f"bytes={len(r.content)}  head={snippet[:80]!r}")
        return None
    except Exception as e:
        print(f"  [RSS!] {medio['n']}: {type(e).__name__}: {e}")
    return None

def _dominio_de(url):
    """Devuelve el dominio sin www."""
    try:
        from urllib.parse import urlparse
        d = urlparse(url).netloc.lower()
        return d[4:] if d.startswith('www.') else d
    except Exception:
        return ''

def _limpiar_query(url):
    """Quita parámetros de tracking. Mantiene el resto intacto."""
    if not url:
        return url
    try:
        p = urlparse(url)
        if not p.query:
            return url
        from urllib.parse import parse_qsl, urlencode, urlunparse
        keep = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
                if k.lower() not in _QUERY_RUIDO]
        if not keep:
            return urlunparse((p.scheme, p.netloc, p.path, p.params, '', ''))
        return urlunparse((p.scheme, p.netloc, p.path, p.params, urlencode(keep), ''))
    except Exception:
        return url
def _host_de(url):
    """Devuelve el netloc tal cual vino (con www si lo traía)."""
    if not url:
        return ''
    try:
        return (urlparse(url).netloc or '').lower()
    except Exception:
        return ''



def _normalizar_url(href, base_url):
    """Convierte href relativo a absoluto usando urljoin."""
    try:
        from urllib.parse import urljoin
        return urljoin(base_url, href)
    except Exception:
        return href


def _es_valido(texto, href, dominio):
    """Filtro anti-basura: longitud, palabras prohibidas, rutas y dominio."""
    if len(texto) < 20 or len(texto) > 250:
        return False
    if texto.isdigit():
        return False
    low = texto.lower()
    if any(w in low for w in BAD_WORDS):
        return False
    if href.startswith('#') or href.startswith('javascript:'):
        return False
    low_href = href.lower()
    if any(seg in low_href for seg in BAD_PATH_SEGMENTS):
        return False
    dom_href = _dominio_de(href)
    if dom_href and dom_href != dominio and not dom_href.endswith('.' + dominio):
        return False
    return True


def _scrape(medio):
    url = LISTING_URLS.get(medio['d']) or f"https://{medio['d']}"
    try:
        r = SESSION.get(url, timeout=TIMEOUT, allow_redirects=True)
        if r.status_code != 200:
            print(f"  [SCRAPE {r.status_code}] {medio['n']}")
            return None
        soup = BeautifulSoup(r.text, 'lxml')
        dominio = medio['d']

        items_e1 = _scrape_headings(soup, url, dominio)
        items_e7 = _scrape_slugs(soup, url, dominio)

        unicos = {}
        orden = 0
        for it in items_e1 + items_e7:
            u = it['enlace']
            if u not in unicos:
                it['pos'] = orden
                orden += 1
                unicos[u] = it
            elif not unicos[u].get('fecha_pub') and it.get('fecha_pub'):
                unicos[u] = it

        out = list(unicos.values())
        out.sort(key=lambda x: (0 if x.get('fecha_pub') else 1, x.get('pos', 999)))
        return out[:N_FEED] or None
    except Exception as e:
        print(f"  [SCRAPE!] {medio['n']}: {type(e).__name__}: {e}")
    return None


def _scrape_headings(soup, base_url, dominio):
    """E1: headings h1/h2/h3 con enlace, con filtros anti-basura."""
    out = []
    for tag in soup.find_all(['h1', 'h2', 'h3'], limit=150):
        a = tag.find('a', href=True)
        if not a:
            continue
        texto = a.get_text(' ', strip=True)
        href = _normalizar_url(a['href'], base_url)
        if not _es_valido(texto, href, dominio):
            continue
        out.append({
            'titular':   texto,
            'enlace':    href,
            'fecha_pub': _extract_item_date(tag),
        })
        if len(out) >= N_FEED:
            break
    return out


def _scrape_slugs(soup, base_url, dominio):
    """E7: cualquier <a> cuyo href apunte a un slug de noticia."""
    out = []
    for a in soup.find_all('a', href=True, limit=600):
        texto = a.get_text(' ', strip=True)
        href = _normalizar_url(a['href'], base_url)
        if not _es_valido(texto, href, dominio):
            continue
        path = urlparse(href).path.rstrip('/')
        if not path:
            continue
        slug = path.rsplit('/', 1)[-1]
        if not SLUG_RE.match(slug):
            continue
        if slug.count('-') < 2:
            continue
        if slug.replace('-', '').isdigit():
            continue
        out.append({
            'titular':   texto,
            'enlace':    href,
            'fecha_pub': _extract_item_date(a),
        })
        if len(out) >= N_FEED:
            break
    return out

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

def _wp_api(medio):
    """Consulta la API REST de WordPress si el dominio está marcado."""
    if medio['d'] not in WP_API_DOMAINS:
        return None
    url = f"https://{medio['d']}/wp-json/wp/v2/posts?per_page={N_FEED}"
    try:
        r = SESSION.get(url, timeout=TIMEOUT)
        if r.status_code != 200:
            print(f"  [WP-API {r.status_code}] {medio['n']}")
            return None
        data = r.json()
        if not isinstance(data, list):
            print(f"  [WP-API bad-json] {medio['n']}")
            return None
        out = []
        for post in data:
            title = (post.get('title') or {}).get('rendered', '')
            link = post.get('link', '')
            date = post.get('date', '')
            if not title or not link:
                continue
            fecha_pub = ''
            if date:
                # WP date viene en hora local del servidor (Europe/Madrid)
                if '+' not in date and 'Z' not in date:
                    date = date + '+02:00'
                fecha_pub = _rss_date_to_iso(date)
            out.append({
                'titular':   _limpiar_cdata(title),
                'enlace':    link,
                'fecha_pub': fecha_pub,
            })
            if len(out) >= N_FEED:
                break
        if out:
            print(f"  [WP-API ok] {medio['n']}: {len(out)} items")
        return out or None
    except Exception as e:
        print(f"  [WP-API!] {medio['n']}: {type(e).__name__}: {e}")
    return None

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
        items = _wp_api(medio)
        if items:
            fuente = 'WP-API'

    if not items and medio['d'] not in RELAY_DOMAINS:
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
            '_host':          _host_de(it['enlace']),
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
        key = (n['dominio'], n['titular'])
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
def _reconstruir_fecha(raw, dia):
    """Acepta HH:MM (nuevo) o ISO completo (viejo). Devuelve ISO o ''."""
    if not raw:
        return ''
    if 'T' in raw and len(raw) > 10:
        return raw  # formato viejo, ya es ISO
    if ':' in raw and len(raw) <= 5:
        return f"{dia}T{raw}:00+02:00"
    return raw

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
                dia = d.get('fecha', '')
                generado_iso_del_fichero = d.get('generado', '')
                medios_tabla = d.get('medios', {}) or {}
                for n in d.get('noticias', []) or []:
                    dom = n.get('d', '')
                    m_info = medios_tabla.get(dom, {}) or {}
                
                    # Fecha: formato viejo (ISO completo) o nuevo (HH:MM)
                    p_raw = n.get('p', '')
                    e_raw = n.get('e', '')
                    c_raw = n.get('c', '') or generado_iso_del_fichero
                
                    p_iso = _reconstruir_fecha(p_raw, dia)
                    e_iso = _reconstruir_fecha(e_raw, dia)
                
                    # URL: formato viejo (completa) o nuevo (path)
                    u_raw = n.get('u', '')
                    if u_raw.startswith('http://') or u_raw.startswith('https://'):
                        u_iso = u_raw
                    elif u_raw.startswith('/'):
                        u_iso = f"https://{dom}{u_raw}"
                    else:
                        u_iso = u_raw
                
                    noticias.append({
                        'medio':          m_info.get('n', ''),
                        'dominio':        dom,
                        'grupo':          m_info.get('g', ''),
                        'tipo':           m_info.get('t', ''),
                        'lang':           m_info.get('l', ''),
                        'tags':           m_info.get('tags', []) or [],
                        'titular':        n.get('t', ''),
                        'enlace':         u_iso,
                        'fecha_pub':      p_iso,
                        'fecha_estimada': e_iso,
                        'fuente':         n.get('f', ''),
                        'fecha':          c_raw,
                        '_host':          m_info.get('h', ''),
                    })

                    # ── Reconstruir los 'alt' como noticias independientes ──
                    # Sin esto, los titulares repetidos que viven en 'a' se
                    # pierden entre runs y el día al que pertenecen salta.
                    for alt_item in (n.get('a') or []):
                        dom_alt = alt_item.get('d', '')
                        u_alt   = alt_item.get('u', '')
                        if not u_alt:
                            continue

                        m_alt = medios_tabla.get(dom_alt, {}) or {}

                        if u_alt.startswith('http://') or u_alt.startswith('https://'):
                            enlace_alt = u_alt
                        elif u_alt.startswith('/'):
                            host_alt = m_alt.get('h') or f"www.{dom_alt}"
                            enlace_alt = f"https://{host_alt}{u_alt}"
                        else:
                            enlace_alt = u_alt

                        noticias.append({
                            'medio':          m_alt.get('n', ''),
                            'dominio':        dom_alt,
                            'grupo':          m_alt.get('g', ''),
                            'tipo':           m_alt.get('t', ''),
                            'lang':           m_alt.get('l', ''),
                            'tags':           m_alt.get('tags', []) or [],
                            'titular':        n.get('t', ''),
                            'enlace':         enlace_alt,
                            'fecha_pub':      p_iso,
                            'fecha_estimada': e_iso,
                            'fuente':         n.get('f', ''),
                            'fecha':          c_raw,
                            '_host':          m_alt.get('h', ''),
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
            {'d': o.get('dominio', ''),
             'u': _url_corta(o.get('enlace', ''), o.get('dominio', ''))}
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
        idx[(n['dominio'], n['titular'])] = n

    for n in nuevas:
        key = (n['dominio'], n['titular'])
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
def _hhmm(iso):
    """De '2026-10-01T15:58:22+02:00' devuelve '15:58'. Vacío si no hay."""
    if not iso:
        return ''
    dt = _parse_iso_flexible(iso)
    if dt is None:
        return ''
    try:
        return dt.astimezone(TZ_MADRID).strftime('%H:%M')
    except Exception:
        return ''


def _url_corta(url, dominio):
    """Si la URL es del mismo dominio, devuelve solo el path."""
    if not url:
        return ''
    try:
        p = urlparse(url)
        host = (p.netloc or '').lower()
        if host.startswith('www.'):
            host = host[4:]
        if host == dominio or host.endswith('.' + dominio):
            path = p.path or '/'
            if p.query:
                from urllib.parse import parse_qsl, urlencode
                keep = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
                        if k.lower() not in _QUERY_RUIDO]
                if keep:
                    path += '?' + urlencode(keep)
            return path
        return url
    except Exception:
        return url



def _dia_iso(iso_str, fallback):
    """Extrae 'YYYY-MM-DD' en zona Madrid, o `fallback` si no se puede."""
    dt = _parse_iso_flexible(iso_str)
    if dt is None:
        return fallback
    dt = dt.astimezone(TZ_MADRID)
    return dt.strftime('%Y-%m-%d')


def _noticia_a_formato_corto(n, dia=None):
    out = {
        'd': n.get('dominio', ''),
        't': n.get('titular', ''),
        'u': _url_corta(n.get('enlace', ''), n.get('dominio', '')),
        'f': n.get('fuente', ''),
    }
    p_iso = n.get('fecha_pub', '')
    e_iso = n.get('fecha_estimada', '')

    if dia is None:
        # Portada: siempre ISO completo
        p = p_iso
        e = e_iso
    else:
        # Diario: HH:MM si es del mismo día, ISO completo si no
        p = ''
        if p_iso:
            if p_iso[:10] != dia:
                p = p_iso
            else:
                p = _hhmm(p_iso)
        e = _hhmm(e_iso) if e_iso else ''

    if p:
        out['p'] = p
    if e:
        out['e'] = e
    alt = n.get('alt')
    if alt:
        out['a'] = alt
    return out


def _tabla_medios_de(items):
    """Construye {dominio: {n,g,t,l,tags,h}} a partir de las noticias."""
    medios = {}
    hosts = {}
    for n in items:
        d = n.get('dominio')
        if not d:
            continue
        if d not in medios:
            medios[d] = {
                'n':    n.get('medio', ''),
                'g':    n.get('grupo', ''),
                't':    n.get('tipo', ''),
                'l':    n.get('lang', ''),
                'tags': n.get('tags', []),
            }
        h = n.get('_host')
        if h and d not in hosts:
            hosts[d] = h
    for d, h in hosts.items():
        medios[d]['h'] = h
    return dict(sorted(medios.items()))


def _orden_estable(n):
    """Clave de orden determinista: fecha DESC, luego dominio, luego titular."""
    dt = _fecha_orden(n)
    return (-dt.timestamp(), n.get('dominio', ''), n.get('titular', ''))

def generar_troceados(noticias, ahora, portada_info=None, entradas_archivo=None):
    """Genera datos/manifest.json + datos/YYYY-MM-DD-<hash>.json.

    Días dentro de VENTANA_GRACIA_DIAS (hoy + N días atrás) se reescriben
    si su contenido cambia. Días más antiguos se congelan: se reutiliza el
    fichero existente sin recalcular hash ni contenido.
    """
    hoy_str = ahora.strftime('%Y-%m-%d')
    generado_iso = ahora.isoformat(timespec='seconds')

    # Indexar ficheros existentes por fecha para el freeze
    # { 'YYYY-MM-DD': ('YYYY-MM-DD-<hash>.json', '<hash>') }
    existentes_por_dia = {}
    for nombre in os.listdir(DATOS_DIR):
        m = re.match(r'^(\d{4}-\d{2}-\d{2})-([a-f0-9]{10})\.json$', nombre)
        if m:
            existentes_por_dia[m.group(1)] = (nombre, m.group(2))

    por_dia = defaultdict(list)
    for n in noticias:
        iso_agrup = _fecha_visible_iso(n, ahora)
        dia = _dia_iso(iso_agrup, hoy_str)
        por_dia[dia].append(n)

    ficheros = []
    total_kb = 0.0
    escritos = 0
    reusados = 0
    congelados = 0

    for dia in sorted(por_dia.keys(), reverse=True):
        items = por_dia[dia]
        items.sort(key=_orden_estable)

        # ¿Está congelado este día?
        try:
            fecha_dia = datetime.strptime(dia, '%Y-%m-%d').date()
            dias_atras = (ahora.date() - fecha_dia).days
        except ValueError:
            dias_atras = 0
        congelado = dias_atras > VENTANA_GRACIA_DIAS

        if congelado and dia in existentes_por_dia:
            # Reutilizar sin tocar
            filename, hash_ = existentes_por_dia[dia]
            path = os.path.join(DATOS_DIR, filename)
            try:
                with open(path, encoding='utf-8') as f:
                    d = json.load(f)
                n_items = len(d.get('noticias', []))
            except Exception:
                n_items = 0
            try:
                size_kb = os.path.getsize(path) / 1024
            except OSError:
                size_kb = 0.0
            total_kb += size_kb
            congelados += 1
            ficheros.append({
                'fecha':   dia,
                'file':    filename,
                'n':       n_items,
                'hash':    hash_,
                'kb':      round(size_kb, 1),
                'es_hoy':  False,
                'reusado': True,
                'congelado': True,
            })
            continue

        # Día editable: calcular payload y hash como antes
        payload = {
            'fecha':    dia,
            'generado': generado_iso,
            'medios':   _tabla_medios_de(items),
            'noticias': [_noticia_a_formato_corto(n, dia) for n in items],
        }

        hash_ = _hash_payload(payload)
        filename = f'{dia}-{hash_}.json'
        path = os.path.join(DATOS_DIR, filename)

        size_estimado = None
        if os.path.exists(path):
            reusados += 1
            reusado = True
        else:
            blob = json.dumps(payload, ensure_ascii=False,
                              separators=(',', ':')).encode('utf-8')
            with open(path, 'wb') as f:
                f.write(blob)
            size_estimado = len(blob) / 1024
            escritos += 1
            reusado = False

        if size_estimado is None:
            try:
                size_estimado = os.path.getsize(path) / 1024
            except OSError:
                size_estimado = 0.0
        total_kb += size_estimado

        ficheros.append({
            'fecha':   dia,
            'file':    filename,
            'n':       len(items),
            'hash':    hash_,
            'kb':      round(size_estimado, 1),
            'es_hoy':  dia == hoy_str,
            'reusado': reusado,
        })

    # ── Añadir los días de archivo (fuera de la ventana de trabajo) ──
    fechas_trabajo = {f['fecha'] for f in ficheros}
    añadidos_archivo = 0
    for e in (entradas_archivo or []):
        if e['fecha'] in fechas_trabajo:
            continue  # ya lo hemos regenerado arriba
        ficheros.append({
            'fecha':     e['fecha'],
            'file':      e['file'],
            'n':         e.get('n', 0),
            'hash':      e.get('hash', ''),
            'kb':        e.get('kb', 0),
            'es_hoy':    False,
            'reusado':   True,
            'congelado': True,
            'archivo':   True,
        })
        añadidos_archivo += 1

    # Orden descendente por fecha y recorte al techo del archivo
    ficheros.sort(key=lambda x: x['fecha'], reverse=True)
    if len(ficheros) > DIAS_ARCHIVO:
        recortados = len(ficheros) - DIAS_ARCHIVO
        ficheros = ficheros[:DIAS_ARCHIVO]
        print(f"[troceado] {recortados} días recortados del archivo (>{DIAS_ARCHIVO})")

    manifest = {
        'generado':         generado_iso,
        'generado_legible': ahora.strftime('%d/%m/%Y %H:%M'),
        'dias_retencion':   DIAS_RETENCION,
        'dias_archivo':     DIAS_ARCHIVO,
        'ventana_gracia':   VENTANA_GRACIA_DIAS,
        'n_feed':           N_FEED,
        'total':            len(noticias),
        'hoy':              hoy_str,
        'ficheros':         ficheros,
    }
    if portada_info:
        manifest['portada'] = portada_info
    with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, separators=(',', ':'))

    # ── Limpieza de huérfanos (local) ──
    validos = {f['file'] for f in ficheros}
    validos.add('manifest.json')
    if portada_info:
        validos.add(portada_info['file'])
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
    congel_txt = f" · {congelados} congelados" if congelados else ""
    print(f"[troceado] {len(ficheros)} ficheros · "
          f"{escritos} escritos · {reusados} reusados{congel_txt} · "
          f"{añadidos_archivo} de archivo · "
          f"{total_kb:.1f} KB total{extra}")



def generar_portada(noticias, ahora, horas=18):
    """Genera portada-<hash>.json y devuelve {file, hash, n, kb}."""
    corte = ahora - timedelta(hours=horas)
    recientes = []
    for n in noticias:
        f = _fecha_agrupacion_dt(n, ahora)
        if f is not None and f >= corte:
            recientes.append(n)
    recientes.sort(key=_fecha_orden, reverse=True)
    recientes = recientes[:2000]

    generado_iso = ahora.isoformat(timespec='seconds')
    payload = {
        'generado': generado_iso,
        'horas':    horas,
        'medios':   _tabla_medios_de(recientes),
        'noticias': [_noticia_a_formato_corto(n) for n in recientes],
    }

    hash_ = _hash_payload(payload)
    filename = f'portada-{hash_}.json'
    path = os.path.join(DATOS_DIR, filename)

    if os.path.exists(path):
        reusado = True
    else:
        blob = json.dumps(payload, ensure_ascii=False,
                          separators=(',', ':')).encode('utf-8')
        with open(path, 'wb') as f:
            f.write(blob)
        reusado = False

    try:
        size_kb = os.path.getsize(path) / 1024
    except OSError:
        size_kb = 0.0

    estado = "reusada" if reusado else "escrita"
    print(f"[portada] {len(recientes)} noticias · {size_kb:.1f} KB · {estado}")

    return {
        'file': filename,
        'hash': hash_,
        'n':    len(recientes),
        'kb':   round(size_kb, 1),
    }

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
# SUBIDA A CLOUDFLARE R2
# ─────────────────────────────────────────────────────────────
import boto3
from botocore.config import Config
import libsql_experimental as libsql

R2_ACCOUNT_ID = os.environ.get('R2_ACCOUNT_ID', '')
R2_ACCESS_KEY = os.environ.get('R2_ACCESS_KEY_ID', '')
R2_SECRET_KEY = os.environ.get('R2_SECRET_ACCESS_KEY', '')
R2_BUCKET     = os.environ.get('R2_BUCKET', 'voceiro-datos')
TURSO_URL   = os.environ.get('TURSO_DATABASE_URL', '')
TURSO_TOKEN = os.environ.get('TURSO_AUTH_TOKEN', '')

def _r2_client():
    """Crea un cliente S3 contra R2. Devuelve None si faltan credenciales."""
    if not (R2_ACCOUNT_ID and R2_ACCESS_KEY and R2_SECRET_KEY):
        return None
    print(f"[r2-debug] account_len={len(R2_ACCOUNT_ID)} "
      f"account_repr={R2_ACCOUNT_ID!r} "
      f"key_len={len(R2_ACCESS_KEY)} "
      f"secret_len={len(R2_SECRET_KEY)}")

    return boto3.client(
        service_name='s3',
        endpoint_url=f'https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com',
        aws_access_key_id=R2_ACCESS_KEY,
        aws_secret_access_key=R2_SECRET_KEY,
        region_name='auto',
        config=Config(retries={'max_attempts': 3, 'mode': 'standard'}),
    )

def _r2_cache_control(filename):
    """Cabecera Cache-Control según el tipo de fichero."""
    if filename == 'manifest.json':
        return 'public, max-age=60'
    if filename.startswith('portada-'):
        return 'public, max-age=60'
    if re.match(r'^\d{4}-\d{2}-\d{2}-[a-f0-9]{10}\.json$', filename):
        return 'public, max-age=31536000, immutable'
    return 'public, max-age=3600'

def subir_a_r2(ficheros_locales):
    client = _r2_client()
    if not client:
        print("[r2] sin credenciales — saltando")
        return 0, 0, 0

    subidos = omitidos = errores = 0
    for path in ficheros_locales:
        nombre = os.path.basename(path)

        # Ficheros volátiles → SIEMPRE sobrescribir
        siempre_subir = (nombre == 'manifest.json'
                         or nombre.startswith('portada-'))

        if not siempre_subir:
            # Ficheros con hash → skip si ya existen
            try:
                client.head_object(Bucket=R2_BUCKET, Key=nombre)
                omitidos += 1
                continue
            except Exception:
                pass

        try:
            with open(path, 'rb') as f:
                client.upload_fileobj(
                    f, R2_BUCKET, nombre,
                    ExtraArgs={
                        'ContentType': 'application/json; charset=utf-8',
                        'CacheControl': _r2_cache_control(nombre),
                    },
                )
            subidos += 1
        except Exception as e:
            print(f"[r2!] {nombre}: {type(e).__name__}: {e}")
            errores += 1

    print(f"[r2] {subidos} subidos · {omitidos} omitidos · {errores} errores")
    return subidos, omitidos, errores


# ─────────────────────────────────────────────────────────────
# LIMPIEZA DE HUÉRFANOS EN R2
# ─────────────────────────────────────────────────────────────
def limpiar_r2_huerfanos(manifest):
    """Borra de R2 los ficheros que ya no están referenciados en el manifest.
    Version-aware: para cada día conserva solo el hash que aparece en el
    manifest; borra versiones viejas del mismo día y días fuera de retención.
    Red de seguridad: solo borra objetos con >1 h de antigüedad."""
    client = _r2_client()
    if not client:
        return 0

    # Mapa fecha → nombre de fichero válido
    validos_por_dia = {}
    for f in manifest.get('ficheros', []):
        validos_por_dia[f['fecha']] = f['file']

    portada_valida = ''
    if manifest.get('portada') and manifest['portada'].get('file'):
        portada_valida = manifest['portada']['file']

    limite = datetime.now(timezone.utc) - timedelta(hours=1)
    re_dia = re.compile(r'^(\d{4}-\d{2}-\d{2})-([a-f0-9]{10})\.json$')

    borrados = 0
    paginator = client.get_paginator('list_objects_v2')
    for page in paginator.paginate(Bucket=R2_BUCKET):
        for obj in page.get('Contents', []):
            key = obj['Key']

            if key == 'manifest.json':
                continue

            m = re_dia.match(key)
            if m:
                fecha = m.group(1)
                if validos_por_dia.get(fecha) == key:
                    continue  # es el vigente de ese día
                # si no: huérfano (versión vieja o día fuera de retención)
            elif key.startswith('portada-') and key.endswith('.json'):
                if key == portada_valida:
                    continue
            else:
                continue  # formato desconocido, no tocar

            lastmod = obj.get('LastModified')
            if lastmod and lastmod > limite:
                continue  # <1 h: puede estar sirviéndose ahora mismo

            try:
                client.delete_object(Bucket=R2_BUCKET, Key=key)
                borrados += 1
            except Exception as e:
                print(f"[r2-clean!] {key}: {e}")

    print(f"[r2-clean] {borrados} huérfanos borrados de R2")
    return borrados
# ─────────────────────────────────────────────────────────────
# INSERCIÓN EN TURSO
# ─────────────────────────────────────────────────────────────



def insertar_en_turso(noticias, t_prev_iso, t_now_iso):
    """Inserta en Turso las noticias recolectadas desde el último run.

    Antes de insertar, consulta qué enlaces ya existen para evitar
    escrituras innecesarias. INSERT OR IGNORE cuenta como escritura
    aunque ignore la fila, así que reducir intentos reduce la cuota.
    """
    if not (TURSO_URL and TURSO_TOKEN):
        print("[turso] sin credenciales — saltando")
        return 0

    replica_path = os.path.join(tempfile.gettempdir(), "voceiro_replica.db")
    conn = libsql.connect(
        database=replica_path,
        sync_url=TURSO_URL,
        auth_token=TURSO_TOKEN,
    )
    conn.sync()

    try:
        t_now_dt = _parse_iso_flexible(t_now_iso)
        t_prev_dt = _parse_iso_flexible(t_prev_iso) if t_prev_iso else None

        if t_now_dt is None:
            print("[turso] t_now_iso inválido")
            return 0

        corte = t_prev_dt if t_prev_dt is not None else t_now_dt - timedelta(hours=24)

        # 1) Filtrar por fecha de recolección: solo lo de este run
        candidatas = []
        for n in noticias:
            f = _parse_iso_flexible(n.get('fecha'))
            if f is not None and f > corte and n.get('enlace'):
                candidatas.append(n)

        if not candidatas:
            print(f"[turso] nada nuevo (corte {corte.isoformat()})")
            return 0

        # 2) Consultar en Turso qué enlaces ya existen
        cur = conn.cursor()
        enlaces = [n['enlace'] for n in candidatas]
        existentes = set()
        consulta_fallo = False
        CHUNK = 500  # SQLite tiene límite de variables por consulta

        for i in range(0, len(enlaces), CHUNK):
            trozo = enlaces[i:i + CHUNK]
            placeholders = ','.join(['?'] * len(trozo))
            try:
                cur.execute(
                    f"SELECT enlace FROM noticias WHERE enlace IN ({placeholders})",
                    tuple(trozo),
                )
                for row in cur.fetchall():
                    existentes.add(row[0])
            except Exception as e:
                print(f"[turso!] consulta existentes: {e}")
                consulta_fallo = True
                break

        # 3) Filtrar candidatas por lo que ya está
        if consulta_fallo:
            a_insertar = candidatas   # sin optimización: insertamos todo
            ya_existian = 0
        else:
            a_insertar = [n for n in candidatas if n['enlace'] not in existentes]
            ya_existian = len(candidatas) - len(a_insertar)

        print(f"[turso] {len(candidatas)} candidatas · "
              f"{ya_existian} ya en Turso · "
              f"{len(a_insertar)} nuevas")

        if not a_insertar:
            return 0

        # 4) Insertar por lotes
        filas = []
        for n in a_insertar:
            filas.append((
                n.get('dominio', ''),
                n.get('titular', ''),
                n.get('enlace', ''),
                n.get('fecha_pub', ''),
                n.get('fecha_estimada', ''),
                n.get('fuente', ''),
                _dia_iso(_fecha_visible_iso(n), t_now_iso[:10]),
                '',
            ))

        BATCH = 8
        insertados = 0
        for i in range(0, len(filas), BATCH):
            chunk = filas[i:i + BATCH]
            placeholders = ','.join(['(?,?,?,?,?,?,?,?)'] * len(chunk))
            sql = f"""INSERT OR IGNORE INTO noticias
                      (dominio, titular, enlace, fecha_pub, fecha_est, fuente, fecha_dia, hash)
                      VALUES {placeholders}"""
            params = []
            for row in chunk:
                params.extend(row)
            try:
                cur.execute(sql, tuple(params))
                insertados += len(chunk)
            except Exception as e:
                print(f"[turso!] batch {i // BATCH}: {e}")

        conn.commit()
        print(f"[turso] {insertados} insertados")
        return insertados
    finally:
        try:
            conn.close()
        except Exception:
            pass

def descargar_historico_desde_r2():
    """Descarga de R2 el manifest completo y SOLO los ficheros de la
    ventana de dedup (DIAS_RETENCION). Los días más antiguos quedan en
    R2 y se conservan en el manifest nuevo, pero no se bajan."""
    client = _r2_client()
    if not client:
        print("[r2-download] sin credenciales — saltando")
        return 0

    try:
        obj = client.get_object(Bucket=R2_BUCKET, Key='manifest.json')
        manifest_bytes = obj['Body'].read()
        with open(MANIFEST_PATH, 'wb') as f:
            f.write(manifest_bytes)
        manifest = json.loads(manifest_bytes)
    except Exception as e:
        print(f"[r2-download] no hay manifest en R2: {e}")
        return 0

    corte = (datetime.now(TZ_MADRID) - timedelta(days=DIAS_RETENCION)).strftime('%Y-%m-%d')

    descargados = 0
    for f_info in manifest.get('ficheros', []):
        fn = f_info.get('file')
        if not fn:
            continue
        if f_info.get('fecha', '') < corte:
            continue  # fuera de ventana: no lo bajamos
        path = os.path.join(DATOS_DIR, fn)
        if os.path.exists(path):
            continue
        try:
            obj = client.get_object(Bucket=R2_BUCKET, Key=fn)
            with open(path, 'wb') as f:
                f.write(obj['Body'].read())
            descargados += 1
        except Exception as e:
            print(f"[r2-download!] {fn}: {e}")

    total = len(manifest.get('ficheros', []))
    print(f"[r2-download] {descargados} descargados · "
          f"{total} en manifest · ventana {DIAS_RETENCION} días")
    return descargados
  

# ─────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────
def main():
    os.makedirs(DATOS_DIR, exist_ok=True)
    descargar_historico_desde_r2()
    medios = todos_los_medios()

    if GRUPOS_INCLUIDOS:
        medios = [m for m in medios if m['grupo'] in GRUPOS_INCLUIDOS]
        print(f"[filtro] grupos activos: {GRUPOS_INCLUIDOS}")

    print(f"── Recolectando {len(medios)} medios (hasta {N_FEED} cada uno) ──")

    todas = []
    contador_rss = 0
    contador_scrape = 0
    contador_gn = 0
    contador_wp = 0
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
                elif fuente == 'WP-API':
                    contador_wp += 1
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

    historico_keys = {(n['dominio'], n['titular']) for n in historico}

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
    print(f"  WP-API:       {contador_wp} medios")
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

    # Leer manifest previo (el que bajó descargar_historico_desde_r2)
    # para extraer las entradas de archivo y pasarlas al generador
    entradas_archivo = []
    if os.path.exists(MANIFEST_PATH):
        try:
            with open(MANIFEST_PATH, encoding='utf-8') as f:
                manifest_prev = json.load(f)
            corte_archivo = (t_now - timedelta(days=DIAS_RETENCION)).strftime('%Y-%m-%d')
            entradas_archivo = [
                e for e in manifest_prev.get('ficheros', [])
                if e.get('fecha', '') < corte_archivo
            ]
            print(f"[archivo] {len(entradas_archivo)} entradas fuera de "
                  f"la ventana de {DIAS_RETENCION} días")
        except Exception as e:
            print(f"[archivo] no se pudo leer manifest previo: {e}")

    portada_info = generar_portada(finales, t_now, horas=18)
    generar_troceados(finales, t_now, portada_info, entradas_archivo=entradas_archivo)

    # ─── Subir a R2 ───
    ficheros_locales = [MANIFEST_PATH]
    for f in os.listdir(DATOS_DIR):
        if f.endswith('.json') and f != 'manifest.json':
            ficheros_locales.append(os.path.join(DATOS_DIR, f))
    subir_a_r2(ficheros_locales)

    # ─── Limpiar huérfanos en R2 ───
    with open(MANIFEST_PATH, encoding='utf-8') as f:
        manifest_actual = json.load(f)
    limpiar_r2_huerfanos(manifest_actual)

    # ─── Insertar en D1 ───
    insertar_en_turso(finales, generado_prev, t_now_iso)
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
