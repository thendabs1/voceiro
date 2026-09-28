# recolector.py
import json
import os
from datetime import datetime
import concurrent.futures

import requests
import feedparser
from bs4 import BeautifulSoup

from medios import MEDIA_CATALOG, HEADERS, GN_LOCALE, KNOWN_FEEDS


# ── Estrategias de extracción ────────────────────────────────

def _parse_feed_bytes(url, content):
    feed = feedparser.parse(content)
    if not feed.entries:
        return None
    e = feed.entries[0]
    return {'titular': e.get('title','').strip(), 'enlace': e.get('link', url)}


def _google_news(medio):
    hl, gl, ceid = GN_LOCALE.get(medio.get('lang','es'), GN_LOCALE['es'])
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
    data = _google_news(medio); metodo = 'GoogleNews'
    if not data:
        data = _known_feed(medio); metodo = 'RSS'
    if not data:
        data = _scrape(medio); metodo = 'Scraping'
    if not data or not data.get('titular'):
        return None
    return {
        'medio':   medio['n'],
        'dominio': medio['d'],
        'grupo':   medio['grupo'],
        'tipo':    medio.get('type',''),
        'lang':    medio.get('lang',''),
        'tags':    medio.get('tags',[]),
        'titular': data['titular'],
        'enlace':  data['enlace'],
        'metodo':  metodo,
    }


# ── Recolección paralela ─────────────────────────────────────

def recolectar_todos():
    medios = [{**it, 'grupo': g['group']} for g in MEDIA_CATALOG for it in g['items']]
    print(f"Medios a procesar: {len(medios)}")
    out = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
        for r in ex.map(obtener_titular, medios):
            if r:
                print(f"✓ {r['medio']} ({r['metodo']}): {r['titular'][:70]}")
                out.append(r)
    print(f"Total: {len(out)}/{len(medios)}")
    return out


# ── Generación de salidas ────────────────────────────────────

def generar_json(noticias):
    os.makedirs('public', exist_ok=True)
    payload = {
        'generado':         datetime.now().isoformat(timespec='seconds'),
        'generado_legible': datetime.now().strftime('%d/%m/%Y %H:%M'),
        'total':            len(noticias),
        'noticias':         noticias,
    }
    with open('public/datos.json', 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def generar_html(fecha, total):
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, 'plantilla.html'), encoding='utf-8') as f:
        html = f.read()
    html = html.replace('{{FECHA}}', fecha).replace('{{TOTAL}}', str(total))
    with open('public/index.html', 'w', encoding='utf-8') as f:
        f.write(html)


if __name__ == '__main__':
    print("Iniciando recolección…")
    noticias = recolectar_todos()
    fecha = datetime.now().strftime('%d/%m/%Y %H:%M')
    generar_json(noticias)
    generar_html(fecha, len(noticias))
    print("Listo: public/datos.json y public/index.html")
