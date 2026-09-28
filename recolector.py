# recolector.py
"""
Recolector de titulares de Voceiro.

Fases:
  1. Pedir el RSS oficial de cada medio (KNOWN_FEEDS) → hasta N_FEED titulares
  2. Si no hay feed, scraping del listado (LISTING_URLS o home)
  3. Estimar fecha de los scrapeados nuevos usando el intervalo entre runs
  4. Deduplicar contra el histórico y fusionar
  5. Podar por ventana de retención
  6. Escribir public/datos.json y public/index.html
  7. Reporte final

Estimación de fechas para scraping:
  - Los listados HTML suelen estar ordenados de más nuevo a más viejo.
  - Si un titular NO estaba en el histórico anterior, apareció entre
    T_prev (generado del datos.json anterior) y T_now.
  - Repartimos los K titulares nuevos de cada medio en ese intervalo
    por su posición, dando fechas plausibles sin inventar intervalos.
"""

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
    from medios import LISTING_URLS
except ImportError:
    LISTING_URLS = {}


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

DATOS_PATH = 'public/datos.json'


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
    # URL: LISTING_URLS si está definida, si no la home
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
                'pos':       len(out),   # ← índice en el listado
            })
            if len(out) >= N_FEED:
                break
        return out or None
    except Exception as e:
        print(f"  [SCRAPE!] {medio['n']}: {type(e).__name__}: {e}")
    return None


def obtener_titulares(medio):
    """Devuelve (medio, lista_noticias, fuente). No calcula fecha_estimada."""
    items = _rss(medio)
    fuente = 'RSS'
    if not items:
        items = _scrape(medio)
        fuente = 'Scraping'
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
            'fecha_estimada': '',                # se calcula después
            'fuente':         fuente,
            'fecha':          ahora,
            '_pos':           it.get('pos'),     # solo informativo (no se guarda)
        })

    return (medio, noticias, fuente)


# ─────────────────────────────────────────────────────────────
# ASIGNACIÓN DE FECHAS ESTIMADAS (solo nuevas scrapeadas sin fecha)
# ─────────────────────────────────────────────────────────────
def asignar_fechas_estimadas(todas, historico_keys, t_prev, t_now):
    """
    Asigna 'fecha_estimada' in-place a los titulares scrapeados que sean
    nuevos (no en historico_keys) y no tengan fecha_pub.

    Distribuye los K titulares nuevos de cada medio en el intervalo
    (t_prev, t_now) por su posición en el listado.
    """
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

    if t_prev is not None:
        intervalo = (t_now - t_prev).total_seconds()
    else:
        intervalo = INTERVALO_DEFAULT_SEG
    intervalo = max(INTERVALO_MIN_SEG, min(intervalo, INTERVALO_MAX_SEG))

    total_nuevos = 0
    for medio, items in por_medio.items():
        # Ordenar por posición en el listado (0 = más reciente)
        items.sort(key=lambda x: x.get('_pos') if x.get('_pos') is not None else 999)
        K = len(items)
        for i, n in enumerate(items):
            # i=0 (más nuevo) → offset pequeño  → fecha cercana a t_now
            # i=K-1 (más viejo) → offset grande → fecha cercana a t_prev
            offset_seg = intervalo * (i + 1) / (K + 1)
            fecha = t_now - timedelta(seconds=offset_seg)
            n['fecha_estimada'] = fecha.isoformat(timespec='seconds')
            total_nuevos += 1

    return total_nuevos, intervalo


# ─────────────────────────────────────────────────────────────
# FASE 2 · HISTÓRICO
# ─────────────────────────────────────────────────────────────
def cargar_historico_payload():
    if not os.path.exists(DATOS_PATH):
        return {'noticias': [], 'generado': None}
    try:
        with open(DATOS_PATH, encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"[historico] no se pudo leer: {e}")
        return {'noticias': [], 'generado': None}


def fusionar_historico(nuevas, viejas, dias):
    corte = datetime.now(TZ_MADRID) - timedelta(days=dias)
    idx = {}

    # 1) Viejas dentro de ventana
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

    # 2) Nuevas: preservar datos de la versión antigua si coincide
    for n in nuevas:
        key = (n['medio'], n['titular'])
        old = idx.get(key)
        if old:
            n['fecha'] = old.get('fecha', n['fecha'])
            if not n.get('fecha_pub') and old.get('fecha_pub'):
                n['fecha_pub'] = old['fecha_pub']
            # Conservar fecha_estimada original si no se ha recalculado
            if old.get('fecha_estimada') and not n.get('fecha_estimada'):
                n['fecha_estimada'] = old['fecha_estimada']
        # Limpiar campo auxiliar antes de persistir
        n.pop('_pos', None)
        idx[key] = n

    todos = list(idx.values())
    todos.sort(key=_fecha_orden, reverse=True)
    return todos


# ─────────────────────────────────────────────────────────────
# FASE 3 · SALIDAS
# ─────────────────────────────────────────────────────────────
def generar_json(noticias):
    os.makedirs('public', exist_ok=True)
    ahora_madrid = datetime.now(TZ_MADRID)
    payload = {
        'generado':         ahora_madrid.isoformat(timespec='seconds'),
        'generado_legible': ahora_madrid.strftime('%d/%m/%Y %H:%M'),
        'dias_retencion':   DIAS_RETENCION,
        'n_feed':           N_FEED,
        'total':            len(noticias),
        'noticias':         noticias,
    }
    with open(DATOS_PATH, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))
    kb = os.path.getsize(DATOS_PATH) / 1024
    print(f"[json] {DATOS_PATH} · {kb:.1f} KB · {len(noticias)} noticias")


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
    sin_resultado = []
    medios_sin_fecha = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        for medio, noticias, fuente in ex.map(obtener_titulares, medios):
            if noticias:
                todas.extend(noticias)
                if fuente == 'RSS':
                    contador_rss += 1
                else:
                    contador_scrape += 1
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
    print(f"Histórico previo: {len(historico)} noticias")

    t_prev = None
    generado_prev = payload_prev.get('generado')
    if generado_prev:
        try:
            t_prev = datetime.fromisoformat(generado_prev)
            if t_prev.tzinfo is None:
                t_prev = t_prev.replace(tzinfo=TZ_MADRID)
        except (ValueError, TypeError):
            t_prev = None

    t_now = datetime.now(TZ_MADRID)
    if t_prev:
        delta_min = (t_now - t_prev).total_seconds() / 60
        print(f"Run anterior: {generado_prev} (hace {delta_min:.1f} min)")
    else:
        print("Sin run previo — usando intervalo por defecto")

    historico_keys = {(n['medio'], n['titular']) for n in historico}

    # ─── Asignar fechas estimadas a los scrapeados nuevos ───
    print("\n── Estimando fechas para scraping ──")
    total_estimados, intervalo_usado = asignar_fechas_estimadas(
        todas, historico_keys, t_prev, t_now
    )
    print(f"Intervalo usado: {intervalo_usado/60:.1f} min")
    print(f"Titulares nuevos con fecha estimada: {total_estimados}")

    # ─── Fusionar con histórico ───
    print("\n── Fusionando ──")
    finales = fusionar_historico(todas, historico, DIAS_RETENCION)
    print(f"Total en histórico: {len(finales)}")

    # ─── Estadísticas finales ───
    con_pub = sum(1 for n in finales if n.get('fecha_pub'))
    con_est = sum(1 for n in finales if not n.get('fecha_pub') and n.get('fecha_estimada'))
    sin_fecha = len(finales) - con_pub - con_est
    print(f"\n── Cobertura de fechas ──")
    print(f"  Con fecha real:     {con_pub}")
    print(f"  Con fecha estimada: {con_est}")
    print(f"  Sin fecha ninguna:  {sin_fecha}")

    generar_json(finales)
    generar_html(datetime.now(TZ_MADRID).strftime('%d/%m/%Y %H:%M'), len(finales))

    if sin_resultado:
        print(f"\n── ⚠ Medios sin titulares ({len(sin_resultado)}) ──")
        for n in sin_resultado:
            print(f"  · {n}")

    print("\n✅ Listo")


if __name__ == '__main__':
    main()
