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

GRUPOS_INCLUIDOS = []

# Google News fallback
GN_MAX_ITEMS      = 30
GN_DIAS_MAX       = 14
GN_SLEEP          = 0.3

DATOS_PATH        = 'public/datos.json'
DATOS_DIR         = 'public/datos'
MANIFEST_PATH     = 'public/datos/manifest.json'


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


def _fecha_orden(n):
    for key in ('fecha_pub', 'fecha_estimada', 'fecha'):
        val = n.get(key)
        if not val:
            continue
        try:
            dt = datetime.fromisoformat(val)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=TZ_MADRID)
            return dt
        except (ValueError, TypeError):
            continue
    return datetime.min.replace(tzinfo=timezone.utc)


# ─────────────────────────────────────────────────────────────
# FASE 1 · OBTENER TITULARES
# ─────────────────────────────────────────────────────────────
def _parse_feed(content):
    feed = feedparser.parse(content)
    out = []
    for e in feed.entries[:N_FEED]:
        t = (e.get('title') or '').strip()
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

        out.append({
            'titular':   t,
            'enlace':    l,
            'fecha_pub': fecha_pub,
        })
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
        t = (e.get('title') or '').strip()
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
            try:
                dt = datetime.fromisoformat(it['fecha_pub'])
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=TZ_MADRID)
            except (ValueError, TypeError):
                continue
            if dt < corte:
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
                try:
                    t_prev_medio = datetime.fromisoformat(iso_prev)
                    if t_prev_medio.tzinfo is None:
                        t_prev_medio = t_prev_medio.replace(tzinfo=TZ_MADRID)
                except (ValueError, TypeError):
                    t_prev_medio = None

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
    if not os.path.exists(DATOS_PATH):
        return {'noticias': [], 'generado': None, 'ultimo_exito_por_medio': {}}
    try:
        with open(DATOS_PATH, encoding='utf-8') as f:
            data = json.load(f)
            if 'ultimo_exito_por_medio' not in data:
                data['ultimo_exito_por_medio'] = {}
            return data
    except Exception as e:
        print(f"[historico] no se pudo leer: {e}")
        return {'noticias': [], 'generado': None, 'ultimo_exito_por_medio': {}}


def fusionar_historico(nuevas, viejas, dias):
    corte = datetime.now(TZ_MADRID) - timedelta(days=dias)
    idx = {}

    for n in viejas:
        try:
            f = datetime.fromisoformat(n.get('fecha', ''))
            if f.tzinfo is None:
                f = f.replace(tzinfo=TZ_MADRID)
        except ValueError:
            continue
        if f < corte:
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
        idx[key] = n

    todos = list(idx.values())
    todos.sort(key=_fecha_orden, reverse=True)
    return todos


# ─────────────────────────────────────────────────────────────
# FASE 3a · SALIDA COMPATIBLE (datos.json formato viejo)
# ─────────────────────────────────────────────────────────────
def generar_json_compat(noticias, ultimo_exito_por_medio, ahora):
    os.makedirs('public', exist_ok=True)
    payload = {
        'generado':               ahora.isoformat(timespec='seconds'),
        'generado_legible':       ahora.strftime('%d/%m/%Y %H:%M'),
        'dias_retencion':         DIAS_RETENCION,
        'n_feed':                 N_FEED,
        'total':                  len(noticias),
        'ultimo_exito_por_medio': ultimo_exito_por_medio or {},
        'noticias':               noticias,
    }
    with open(DATOS_PATH, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))
    kb = os.path.getsize(DATOS_PATH) / 1024
    print(f"[compat] {DATOS_PATH} · {kb:.1f} KB · {len(noticias)} noticias")


# ─────────────────────────────────────────────────────────────
# FASE 3b · SALIDA TROCEADA (datos/manifest.json + días)
# ─────────────────────────────────────────────────────────────
def _fecha_visible_iso(n):
    """Devuelve la ISO de la fecha visible (pub > estimada > recolección)."""
    for key in ('fecha_pub', 'fecha_estimada', 'fecha'):
        v = n.get(key)
        if v:
            return v
    return ''


def _dia_iso(iso_str, fallback):
    """Extrae 'YYYY-MM-DD' en zona Madrid, o `fallback` si no se puede."""
    if not iso_str:
        return fallback
    try:
        dt = datetime.fromisoformat(iso_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=TZ_MADRID)
        dt = dt.astimezone(TZ_MADRID)
        return dt.strftime('%Y-%m-%d')
    except (ValueError, TypeError):
        return fallback


def _noticia_a_formato_corto(n):
    return {
        'd': n.get('dominio', ''),
        't': n.get('titular', ''),
        'u': n.get('enlace', ''),
        'p': n.get('fecha_pub', ''),
        'e': n.get('fecha_estimada', ''),
        'c': n.get('fecha', ''),
        'f': n.get('fuente', ''),
    }


def _tabla_medios_de(items):
    """Construye la tabla {dominio: {n,g,t,l,tags}} a partir de las noticias."""
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
    return medios


def generar_troceados(noticias, ahora):
    """Genera datos/manifest.json + datos/YYYY-MM-DD.json en formato corto."""
    os.makedirs(DATOS_DIR, exist_ok=True)
    hoy_str = ahora.strftime('%Y-%m-%d')
    generado_iso = ahora.isoformat(timespec='seconds')

    # Agrupar por día visible
    por_dia = defaultdict(list)
    for n in noticias:
        iso_visible = _fecha_visible_iso(n)
        dia = _dia_iso(iso_visible, hoy_str)
        por_dia[dia].append(n)

    ficheros = []
    total_kb = 0.0

    for dia in sorted(por_dia.keys(), reverse=True):
        items = por_dia[dia]
        items.sort(key=_fecha_orden, reverse=True)

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

    # Limpiar ficheros huérfanos (días fuera de la lista)
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
        try:
            t_prev_global = datetime.fromisoformat(generado_prev)
            if t_prev_global.tzinfo is None:
                t_prev_global = t_prev_global.replace(tzinfo=TZ_MADRID)
        except (ValueError, TypeError):
            t_prev_global = None

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

    # ─── Estadísticas ───
    con_pub = sum(1 for n in finales if n.get('fecha_pub'))
    con_est = sum(1 for n in finales
                  if not n.get('fecha_pub') and n.get('fecha_estimada'))
    sin_fecha = len(finales) - con_pub - con_est
    print(f"\n── Cobertura de fechas ──")
    print(f"  Con fecha real:     {con_pub}")
    print(f"  Con fecha estimada: {con_est}")
    print(f"  Sin fecha ninguna:  {sin_fecha}")

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
    generar_json_compat(finales, ultimo_exito_nuevo, t_now)
    generar_troceados(finales, t_now)
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
