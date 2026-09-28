# recolector.py
"""
Recolector de titulares de Voceiro.

Fases:
  1. Pedir el RSS oficial de cada medio (KNOWN_FEEDS) → hasta N_FEED titulares
  2. Si no hay feed, intentar scraping básico del HTML
  3. Deduplicar contra el histórico y fusionar
  4. Podar por ventana de retención
  5. Escribir public/datos.json y public/index.html
  6. Reporte final: medios sin titulares (para añadir feeds después)

Incluye parche SSL mínimo (OP_LEGACY_SERVER_CONNECT + SECLEVEL=1).
NO bajar de SECLEVEL=1 ni forzar TLSv1: rompe muchos medios que sí funcionan.
"""

import json
import os
import re
import ssl
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
import concurrent.futures

import requests
import feedparser
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context
from zoneinfo import ZoneInfo

from medios import MEDIA_CATALOG, HEADERS, KNOWN_FEEDS, todos_los_medios


# ─────────────────────────────────────────────────────────────
# CONFIGURACIÓN
# ─────────────────────────────────────────────────────────────
N_FEED            = 60      # titulares máximos a leer por medio
DIAS_RETENCION    = 15      # ventana del histórico en días
MAX_WORKERS       = 8       # hilos paralelos
TIMEOUT           = 15      # segundos por petición
TZ_MADRID = ZoneInfo('Europe/Madrid')

GRUPOS_INCLUIDOS = []

DATOS_PATH = 'public/datos.json'


# ─────────────────────────────────────────────────────────────
# SESIÓN HTTP CON SSL PERMISIVO
# ─────────────────────────────────────────────────────────────
class LegacySSLAdapter(HTTPAdapter):
    """
    Permite TLS con servidores antiguos que Python 3.11+ rechaza por defecto.
    IMPORTANTE: no bajar de SECLEVEL=1 ni forzar minimum_version=TLSv1.
    """
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
    """Convierte un datetime (naive o aware) a ISO 8601 en hora de Madrid."""
    if dt is None:
        return ''
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    try:
        return dt.astimezone(TZ_MADRID).isoformat(timespec='seconds')
    except Exception:
        return ''


def _rss_date_to_iso(raw):
    """
    Normaliza cualquier cadena de fecha (RFC 822, ISO 8601, formato local)
    a ISO 8601 con zona horaria de Madrid.
    """
    if not raw:
        return ''
    raw = str(raw).strip()
    if not raw:
        return ''

    # 1) ISO 8601 (2026-09-28T19:30:00Z / +02:00 / sin zona)
    try:
        dt = datetime.fromisoformat(raw.replace('Z', '+00:00'))
        return _to_iso_madrid(dt)
    except (ValueError, AttributeError):
        pass

    # 2) RFC 822/2822 (Mon, 28 Sep 2026 19:30:00 GMT)
    try:
        dt = parsedate_to_datetime(raw)
        if dt is not None:
            return _to_iso_madrid(dt)
    except (TypeError, ValueError):
        pass

    # 3) Formato local DD/MM/YYYY [HH:MM[:SS]]
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
    """Clave de ordenación real (datetime aware)."""
    for key in ('fecha_pub', 'fecha'):
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
# FASE 1 · OBTENER TITULARES DE UN MEDIO
# ─────────────────────────────────────────────────────────────
def _parse_feed(content):
    """Devuelve lista de dicts {titular, enlace, fecha_pub} del feed."""
    feed = feedparser.parse(content)
    out = []
    for e in feed.entries[:N_FEED]:
        t = (e.get('title') or '').strip()
        l = (e.get('link') or '').strip()
        if not t or not l:
            continue

        fecha_pub = ''

        # 1) Intentar con el string de fecha
        raw = e.get('published') or e.get('updated') or ''
        if raw:
            fecha_pub = _rss_date_to_iso(raw)

        # 2) Fallback: usar la versión parseada de feedparser
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


def _extract_page_date(soup):
    """
    Extrae la fecha de publicación del HTML de una página de portada.
    Mira meta tags comunes primero, luego <time datetime="...">.
    """
    meta_selectors = [
        'meta[property="article:published_time"]',
        'meta[name="article:published_time"]',
        'meta[property="og:published_time"]',
        'meta[itemprop="datePublished"]',
        'meta[name="date"]',
        'meta[name="pubdate"]',
        'meta[name="publishdate"]',
        'meta[name="DC.date"]',
        'meta[name="dc.date"]',
        'meta[name="sailthru.date"]',
        'meta[name="parsely-pub-date"]',
    ]
    for sel in meta_selectors:
        m = soup.select_one(sel)
        if not m:
            continue
        content = (m.get('content') or '').strip()
        iso = _rss_date_to_iso(content)
        if iso:
            return iso
    for t_el in soup.find_all('time', limit=10):
        iso = _rss_date_to_iso((t_el.get('datetime') or '').strip())
        if iso:
            return iso
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
    """Scraping básico: coge titulares de h1/h2/h3 con enlace."""
    url = f"https://{medio['d']}"
    try:
        r = SESSION.get(url, timeout=TIMEOUT, allow_redirects=True)
        if r.status_code != 200:
            print(f"  [SCRAPE {r.status_code}] {medio['n']}")
            return None
        soup = BeautifulSoup(r.text, 'lxml')

        # Fecha "global" de la portada (fallback para todos los ítems)
        page_date = _extract_page_date(soup)

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

            # Intentar encontrar una fecha local al titular
            item_date = ''
            parent = tag.parent
            if parent:
                t_el = parent.find('time', attrs={'datetime': True})
                if t_el:
                    item_date = _rss_date_to_iso(t_el.get('datetime') or '')

            out.append({
                'titular':   texto,
                'enlace':    href,
                'fecha_pub': item_date or page_date,
            })
            if len(out) >= N_FEED:
                break
        return out or None
    except Exception as e:
        print(f"  [SCRAPE!] {medio['n']}: {type(e).__name__}: {e}")
    return None


def obtener_titulares(medio):
    """Devuelve (medio, lista_noticias, fuente)."""
    items = _rss(medio)
    fuente = 'RSS'
    if not items:
        items = _scrape(medio)
        fuente = 'Scraping'
    if not items:
        return (medio, [], None)

    ahora = datetime.now(TZ_MADRID).isoformat(timespec='seconds')
    noticias = [{
        'medio':     medio['n'],
        'dominio':   medio['d'],
        'grupo':     medio['grupo'],
        'tipo':      medio.get('type', ''),
        'lang':      medio.get('lang', ''),
        'tags':      medio.get('tags', []),
        'titular':   it['titular'],
        'enlace':    it['enlace'],
        'fecha_pub': it.get('fecha_pub', ''),
        'fuente':    fuente,
        'fecha':     ahora,
    } for it in items]

    return (medio, noticias, fuente)


# ─────────────────────────────────────────────────────────────
# FASE 2 · HISTÓRICO
# ─────────────────────────────────────────────────────────────
def cargar_historico():
    if not os.path.exists(DATOS_PATH):
        return []
    try:
        with open(DATOS_PATH, encoding='utf-8') as f:
            return json.load(f).get('noticias', [])
    except Exception as e:
        print(f"[historico] no se pudo leer: {e}")
        return []


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

    # 2) Nuevas: conservar datos si ya existían
    for n in nuevas:
        key = (n['medio'], n['titular'])
        old = idx.get(key)
        if old:
            # Conservar la fecha original de recolección
            n['fecha'] = old.get('fecha', n['fecha'])
            # Si la nueva no trae pub date, usar la del histórico
            if not n.get('fecha_pub') and old.get('fecha_pub'):
                n['fecha_pub'] = old['fecha_pub']
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

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        for medio, noticias, fuente in ex.map(obtener_titulares, medios):
            if noticias:
                todas.extend(noticias)
                if fuente == 'RSS':
                    contador_rss += 1
                else:
                    contador_scrape += 1
                # Log de cuántas tienen fecha real
                con_fecha = sum(1 for n in noticias if n.get('fecha_pub'))
                print(f"✓ {medio['n']} ({fuente}): {len(noticias)} titulares"
                      f" · {con_fecha} con fecha real")
            else:
                sin_resultado.append(medio['n'])
                print(f"✗ {medio['n']}: sin titulares")

    print(f"\nTitulares brutos: {len(todas)}")
    con_fecha_total = sum(1 for n in todas if n.get('fecha_pub'))
    sin_fecha_total = len(todas) - con_fecha_total
    print(f"Medios con resultado: {contador_rss} por RSS · {contador_scrape} por scraping")
    print(f"Titulares con fecha real: {con_fecha_total} · sin fecha: {sin_fecha_total}")

    print("\n── Cargando histórico ──")
    historico = cargar_historico()
    print(f"Histórico previo: {len(historico)} noticias")

    print("\n── Fusionando ──")
    finales = fusionar_historico(todas, historico, DIAS_RETENCION)
    print(f"Total en histórico: {len(finales)}")

    generar_json(finales)
    generar_html(datetime.now(TZ_MADRID).strftime('%d/%m/%Y %H:%M'), len(finales))

    if sin_resultado:
        print(f"\n── ⚠ Medios sin titulares ({len(sin_resultado)}) ──")
        for n in sin_resultado:
            print(f"  · {n}")
        print("  → Añadir feed RSS a KNOWN_FEEDS en medios.py")

    print("\n✅ Listo")


if __name__ == '__main__':
    main()
