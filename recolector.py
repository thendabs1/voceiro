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

Incluye parche SSL (OP_LEGACY_SERVER_CONNECT + SECLEVEL=1) para hablar con
servidores antiguos que Python 3.11+ rechaza por defecto.
"""

import json
import os
import ssl
from datetime import datetime, timedelta
import concurrent.futures

import requests
import feedparser
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context

from medios import MEDIA_CATALOG, HEADERS, KNOWN_FEEDS, todos_los_medios


# ─────────────────────────────────────────────────────────────
# CONFIGURACIÓN
# ─────────────────────────────────────────────────────────────
N_FEED            = 60      # titulares máximos a leer por medio
DIAS_RETENCION    = 15      # ventana del histórico en días
MAX_WORKERS       = 8       # hilos paralelos
TIMEOUT           = 15      # segundos por petición

# Opcional: limitar la recolección a ciertos grupos (vacío = todos)
# Ej: ['Galicia', 'España · Nacionales']
GRUPOS_INCLUIDOS = []

DATOS_PATH = 'public/datos.json'


# ─────────────────────────────────────────────────────────────
# SESIÓN HTTP CON SSL PERMISIVO
# ─────────────────────────────────────────────────────────────
class LegacySSLAdapter(HTTPAdapter):
    """
    Permite TLS con servidores antiguos que Python 3.11+ rechaza por defecto:
      - UNSAFE_LEGACY_RENEGOTIATION_DISABLED
      - SSLV3_ALERT_HANDSHAKE_FAILURE
      - SSLCertVerificationError (certificados caducados o mal emitidos)
    """
    def init_poolmanager(self, *args, **kwargs):
        ctx = create_urllib3_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        # OP_LEGACY_SERVER_CONNECT = 0x4
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
        out.append({
            'titular':   t,
            'enlace':    l,
            'fecha_pub': e.get('published') or e.get('updated') or '',
        })
    return out


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
            out.append({'titular': texto, 'enlace': href, 'fecha_pub': ''})
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

    ahora = datetime.now().isoformat(timespec='seconds')
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


def _fecha_orden(n):
    return n.get('fecha_pub') or n.get('fecha') or ''


def fusionar_historico(nuevas, viejas, dias):
    corte = datetime.now() - timedelta(days=dias)
    idx = {}

    # 1) Viejas dentro de ventana
    for n in viejas:
        try:
            f = datetime.fromisoformat(n.get('fecha', ''))
        except ValueError:
            continue
        if f < corte:
            continue
        idx[(n['medio'], n['titular'])] = n

    # 2) Nuevas: si ya estaba, conservamos la fecha original
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
    payload = {
        'generado':         datetime.now().isoformat(timespec='seconds'),
        'generado_legible': datetime.now().strftime('%d/%m/%Y %H:%M'),
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
                print(f"✓ {medio['n']} ({fuente}): {len(noticias)} titulares")
            else:
                sin_resultado.append(medio['n'])
                print(f"✗ {medio['n']}: sin titulares")

    print(f"\nTitulares brutos: {len(todas)}")
    print(f"Medios con resultado: {contador_rss} por RSS · {contador_scrape} por scraping")

    print("\n── Cargando histórico ──")
    historico = cargar_historico()
    print(f"Histórico previo: {len(historico)} noticias")

    print("\n── Fusionando ──")
    finales = fusionar_historico(todas, historico, DIAS_RETENCION)
    print(f"Total en histórico: {len(finales)}")

    generar_json(finales)
    generar_html(datetime.now().strftime('%d/%m/%Y %H:%M'), len(finales))

    if sin_resultado:
        print(f"\n── ⚠ Medios sin titulares ({len(sin_resultado)}) ──")
        for n in sin_resultado:
            print(f"  · {n}")
        print("  → Añadir feed RSS a KNOWN_FEEDS en medios.py")

    print("\n✅ Listo")


if __name__ == '__main__':
    main()
