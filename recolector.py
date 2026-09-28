# recolector.py
"""
Recolector de titulares de Voceiro.

Fases:
  1. Obtener titular + enlace de cada medio (Google News → RSS → scraping)
  2. Decodificar enlaces de Google News a la URL original del medio
  3. Enriquecer con newspaper3k (texto completo, resumen, palabras clave)
  4. Deduplicar y fusionar con el histórico (ventana configurable)
  5. Escribir public/datos.json y public/index.html
"""

import json
import os
import re
import unicodedata
from datetime import datetime, timedelta
from collections import Counter
import concurrent.futures

import requests
import feedparser
from bs4 import BeautifulSoup

from medios import MEDIA_CATALOG, HEADERS, GN_LOCALE, KNOWN_FEEDS, todos_los_medios


# ─────────────────────────────────────────────────────────────
# CONFIGURACIÓN
# ─────────────────────────────────────────────────────────────
DIAS_RETENCION   = 15       # ventana del histórico
MAX_TEXTO        = 4000     # caracteres máximos del cuerpo por noticia
MAX_WORKERS_LINKS = 5       # hilos para obtener titulares
MAX_WORKERS_ENRICH = 4      # hilos para enriquecer artículos (newspaper3k)

# ─────────────────────────────────────────────────────────────
# DEPENDENCIAS OPCIONALES
# ─────────────────────────────────────────────────────────────
try:
    from googlenewsdecoder import gnewsdecoder
    GN_DECODER_OK = True
except Exception as e:
    print(f"[!] googlenewsdecoder no disponible: {e}")
    GN_DECODER_OK = False

try:
    from newspaper import Article, Config as NPConfig
    NEWSPAPER_OK = True
    NP_CONFIG = NPConfig()
    NP_CONFIG.browser_user_agent = HEADERS['User-Agent']
    NP_CONFIG.request_timeout = 12
    NP_CONFIG.fetch_images = False
    NP_CONFIG.memoize_articles = False
except Exception as e:
    print(f"[!] newspaper3k no disponible: {e}")
    NEWSPAPER_OK = False


# ─────────────────────────────────────────────────────────────
# UTILIDADES DE TEXTO
# ─────────────────────────────────────────────────────────────
_STOP = set("""
el la los las un una unos unas de del al a en con por para que y o u es son se su sus
lo le les no si como más mas pero este esta estos estas ese esa esos esas muy ya hay ser
fue ha han hace había también tambien tan solo sólo sobre entre cuando donde quien
todo toda todos todas otro otra otros otras mismo misma así asi ni
""".split())


def _normalizar(s: str) -> str:
    s = (s or '').lower()
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if unicodedata.category(c) != 'Mn')


def _resumir(texto: str, n: int = 3) -> str:
    """Resumen extractivo: frases con mayor densidad de palabras frecuentes."""
    if not texto:
        return ''
    frases = re.split(r'(?<=[.!?])\s+', texto)
    frases = [f.strip() for f in frases if 40 < len(f.strip()) < 400]
    if len(frases) <= n:
        return ' '.join(frases)
    palabras = re.findall(r'\w+', texto.lower())
    freq = Counter(p for p in palabras if p not in _STOP and len(p) > 3)

    def score(f):
        ws = re.findall(r'\w+', f.lower())
        if not ws:
            return 0
        return sum(freq[w] for w in ws if w not in _STOP) / len(ws)

    scored = sorted(enumerate(frases), key=lambda x: score(x[1]), reverse=True)
    top = sorted(scored[:n])
    return ' '.join(f for _, f in top)


def _palabras_clave(texto: str, n: int = 8):
    if not texto:
        return []
    palabras = re.findall(r'\w{4,}', texto.lower())
    freq = Counter(p for p in palabras if p not in _STOP)
    return [w for w, _ in freq.most_common(n)]


# ─────────────────────────────────────────────────────────────
# FASE 1 · OBTENER TITULAR + ENLACE
# ─────────────────────────────────────────────────────────────
def _parse_feed_bytes(url, content):
    feed = feedparser.parse(content)
    if not feed.entries:
        return None
    e = feed.entries[0]
    return {'titular': e.get('title', '').strip(), 'enlace': e.get('link', url)}


def _google_news(medio):
    hl, gl, ceid = GN_LOCALE.get(medio.get('lang', 'es'), GN_LOCALE['es'])
    url = f'https://news.google.com/rss/search?q=site:{medio["d"]}&hl={hl}&gl={gl}&ceid={ceid}'
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code == 200:
            return _parse_feed_bytes(url, r.content)
    except Exception as e:
        print(f"  [GN] {medio['n']}: {e}")
    return None


def _known_feed(medio):
    url = KNOWN_FEEDS.get(medio['d'])
    if not url:
        return None
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code == 200:
            return _parse_feed_bytes(url, r.content)
    except Exception as e:
        print(f"  [RSS] {medio['n']}: {e}")
    return None


def _scrape(medio):
    url = f"https://{medio['d']}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=12)
        if r.status_code != 200:
            return None
        soup = BeautifulSoup(r.text, 'html.parser')
        for h in soup.find_all('h1', limit=8):
            a = h.find('a', href=True)
            if not a:
                continue
            texto = a.get_text(' ', strip=True)
            if len(texto) < 25:
                continue
            href = a['href']
            if href.startswith('/'):
                href = url + href
            elif not href.startswith('http'):
                continue
            return {'titular': texto, 'enlace': href}
    except Exception as e:
        print(f"  [SCRAPE] {medio['n']}: {e}")
    return None


def obtener_titular(medio):
    data = _google_news(medio); fuente = 'GoogleNews'
    if not data:
        data = _known_feed(medio); fuente = 'RSS'
    if not data:
        data = _scrape(medio); fuente = 'Scraping'
    if not data or not data.get('titular'):
        return None
    return {
        'medio':    medio['n'],
        'dominio':  medio['d'],
        'grupo':    medio['grupo'],
        'tipo':     medio.get('type', ''),
        'lang':     medio.get('lang', ''),
        'tags':     medio.get('tags', []),
        'titular':  data['titular'].strip(),
        'enlace':   data['enlace'],
        'fuente':   fuente,
        'fecha':    datetime.now().isoformat(timespec='seconds'),
    }


# ─────────────────────────────────────────────────────────────
# FASE 1b · DECODIFICAR ENLACES DE GOOGLE NEWS
# ─────────────────────────────────────────────────────────────
def decodificar_enlace(noticia):
    if noticia.get('fuente') != 'GoogleNews' or not GN_DECODER_OK:
        return noticia
    try:
        r = gnewsdecoder(noticia['enlace'])
        if isinstance(r, dict) and r.get('status') == 'success' and r.get('decoded_url'):
            noticia['enlace_google'] = noticia['enlace']
            noticia['enlace'] = r['decoded_url']
        else:
            noticia['enlace_google'] = noticia['enlace']
    except Exception as e:
        print(f"  [decode] {noticia['medio']}: {e}")
        noticia['enlace_google'] = noticia['enlace']
    return noticia


# ─────────────────────────────────────────────────────────────
# FASE 2 · ENRIQUECER CON NEWSPAPER3K
# ─────────────────────────────────────────────────────────────
def enriquecer(noticia):
    if not NEWSPAPER_OK:
        noticia.setdefault('texto', '')
        noticia.setdefault('resumen', '')
        noticia.setdefault('palabras_clave', [])
        noticia.setdefault('autores', [])
        return noticia
    try:
        art = Article(noticia['enlace'], language=noticia.get('lang') or 'es', config=NP_CONFIG)
        art.download()
        art.parse()
        texto = (art.text or '').strip()
        noticia['texto'] = texto[:MAX_TEXTO]
        noticia['resumen'] = _resumir(texto)
        noticia['palabras_clave'] = _palabras_clave(texto)
        noticia['autores'] = art.authors or []
        if art.publish_date:
            noticia['fecha_pub'] = art.publish_date.isoformat()
    except Exception as e:
        print(f"  [enrich] {noticia['medio']}: {e}")
        noticia.setdefault('texto', '')
        noticia.setdefault('resumen', '')
        noticia.setdefault('palabras_clave', [])
        noticia.setdefault('autores', [])
    return noticia


# ─────────────────────────────────────────────────────────────
# FASE 3 · HISTÓRICO
# ─────────────────────────────────────────────────────────────
DATOS_PATH = 'public/datos.json'


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
    corte = datetime.now() - timedelta(days=dias)
    idx = {}

    # 1) Añadir las viejas que estén dentro de la ventana
    for n in viejas:
        try:
            f = datetime.fromisoformat(n.get('fecha', ''))
        except ValueError:
            continue
        if f < corte:
            continue
        idx[(n['medio'], n['titular'])] = n

    # 2) Fusionar nuevas (reutiliza enriquecimiento si ya existía)
    for n in nuevas:
        key = (n['medio'], n['titular'])
        old = idx.get(key)
        if old:
            n['fecha'] = old.get('fecha', n['fecha'])  # conservar fecha original
            for campo in ('texto', 'resumen', 'palabras_clave', 'autores', 'fecha_pub'):
                if not n.get(campo) and old.get(campo):
                    n[campo] = old[campo]
        idx[key] = n

    todos = list(idx.values())
    todos.sort(key=lambda x: x.get('fecha', ''), reverse=True)
    return todos


# ─────────────────────────────────────────────────────────────
# FASE 4 · GENERAR SALIDAS
# ─────────────────────────────────────────────────────────────
def generar_json(noticias):
    os.makedirs('public', exist_ok=True)
    payload = {
        'generado':         datetime.now().isoformat(timespec='seconds'),
        'generado_legible': datetime.now().strftime('%d/%m/%Y %H:%M'),
        'dias_retencion':   DIAS_RETENCION,
        'total':            len(noticias),
        'noticias':         noticias,
    }
    with open(DATOS_PATH, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))
    print(f"[json] {DATOS_PATH} · {os.path.getsize(DATOS_PATH)/1024:.1f} KB")


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
    print("── Fase 1: obteniendo titulares ──")
    medios = todos_los_medios()
    print(f"Medios: {len(medios)}")

    noticias = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS_LINKS) as ex:
        for r in ex.map(obtener_titular, medios):
            if r:
                print(f"✓ {r['medio']} ({r['fuente']}): {r['titular'][:70]}")
                noticias.append(r)

    print(f"\n── Fase 1b: decodificando {sum(1 for n in noticias if n['fuente']=='GoogleNews')} enlaces de Google News ──")
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS_LINKS) as ex:
        list(ex.map(decodificar_enlace, noticias))

    print("\n── Fase 2: cargando histórico ──")
    historico = cargar_historico()
    print(f"Histórico previo: {len(historico)} noticias")

    corte = datetime.now() - timedelta(days=DIAS_RETENCION)
    idx_viejas = set()
    for h in historico:
        try:
            if datetime.fromisoformat(h.get('fecha', '')) >= corte:
                idx_viejas.add((h['medio'], h['titular']))
        except ValueError:
            continue

    # 3) Enriquecer solo las nuevas
    a_enriquecer = [n for n in noticias if (n['medio'], n['titular']) not in idx_viejas]
    print(f"\n── Fase 3: enriqueciendo {len(a_enriquecer)} noticias nuevas ──")
    if a_enriquecer:
        with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS_ENRICH) as ex:
            list(ex.map(enriquecer, a_enriquecer))

    print("\n── Fase 4: fusionando con histórico ──")
    finales = fusionar_historico(noticias, historico, DIAS_RETENCION)
    print(f"Total en histórico: {len(finales)}")

    generar_json(finales)
    generar_html(datetime.now().strftime('%d/%m/%Y %H:%M'), len(finales))
    print("✅ Listo")


if __name__ == '__main__':
    main()
