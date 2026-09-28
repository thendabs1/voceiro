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
N_FEED            = 60
DIAS_RETENCION    = 15
MAX_WORKERS       = 8
TIMEOUT           = 15
TZ_MADRID = ZoneInfo('Europe/Madrid')

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


# ─────────────────────────────────────────────────────────────
# EXTRACCIÓN DE FECHAS POR TITULAR (scraping)
# ─────────────────────────────────────────────────────────────
def _extract_item_date(tag):
    """
    Extrae la fecha de un titular concreto durante el scraping.
    Cascada:
      1) <time datetime="..."> en el titular o en sus 3 padres
      2) atributos data-* con fecha/epoch en los 3 niveles
      3) texto relativo ("hace 2 horas")
      4) bloque <article> contenedor con <time> o meta[itemprop=datePublished]
    """
    # ── 1) <time> cercano (3 niveles) ───────────────────
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

    # ── 2) atributos data-* ─────────────────────────────
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
            # epoch (segundos o milisegundos)
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

    # ── 3) texto relativo ───────────────────────────────
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

    # ── 4) bloque <article> contenedor ──────────────────
    node = tag
    for _ in range(5):
        if node is None:
            break
        if getattr(node, 'name', None) == 'article':
            # time
            t_el = node.find('time')
            if t_el:
                raw = t_el.get('datetime') or t_el.get_text(' ', strip=True)
                iso = _rss_date_to_iso(raw)
                if iso:
                    return iso
            # meta itemprop
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
    """
    Scraping básico del listado: extrae titulares de h1/h2/h3 con enlace.
    La fecha se busca POR TITULAR (nunca se usa la fecha de la portada,
    porque eso daría la misma hora a todos los ítems).
    """
    url = f"https://{medio['d']}"
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
    medios_sin_fecha = []      # medios donde ningún titular tiene fecha_pub

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        for medio, noticias, fuente in ex.map(obtener_titulares, medios):
            if noticias:
                todas.extend(noticias)
                if fuente == 'RSS':
                    contador_rss += 1
                else:
                    contador_scrape += 1
                con_fecha = sum(1 for n in noticias if n.get('fecha_pub'))
                if con_fecha == 0:
                    medios_sin_fecha.append(medio['n'])
                print(f"✓ {medio['n']} ({fuente}): {len(noticias)} titulares"
                      f" · {con_fecha}/{len(noticias)} con fecha real")
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

    if medios_sin_fecha:
        print(f"\n── ⚠ Medios con titulares pero sin NINGUNA fecha real ({len(medios_sin_fecha)}) ──")
        for n in medios_sin_fecha:
            print(f"  · {n}")
        print("  → Candidatos a buscar feed RSS específico")

    print("\n✅ Listo")


if __name__ == '__main__':
    main()
