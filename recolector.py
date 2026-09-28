import json
import os
import time
from datetime import datetime
import feedparser
import requests
from bs4 import BeautifulSoup
import concurrent.futures

# ── pega aquí tu MEDIA_CATALOG tal cual ────────────────────────────
MEDIA_CATALOG = [
    # ... tu catálogo sin cambios ...
]

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

# Mapa de idioma -> parámetros Google News
GN_LOCALE = {
    'es': ('es', 'ES', 'ES:es'),
    'ca': ('ca', 'ES', 'ES:ca'),
    'gl': ('gl', 'ES', 'ES:gl'),
    'eu': ('eu', 'ES', 'ES:eu'),
    'en': ('en-US', 'US', 'US:en'),
    'fr': ('fr', 'FR', 'FR:fr'),
    'de': ('de', 'DE', 'DE:de'),
    'it': ('it', 'IT', 'IT:it'),
    'pt': ('pt-PT', 'PT', 'PT:pt-150'),
}

# Feeds RSS "oficiales" conocidos (fallback si Google News falla)
KNOWN_FEEDS = {
    'elpais.com': 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada',
    'elmundo.es': 'https://e00-elmundo.uecdn.es/elmundo/rss/portada.xml',
    'abc.es': 'https://www.abc.es/rss/feeds/abc_ultima.xml',
    'lavanguardia.com': 'https://www.lavanguardia.com/rss/home.xml',
    'elperiodico.com': 'https://www.elperiodico.com/es/rss/rss_portada.xml',
    'larazon.es': 'https://www.larazon.es/rss/portada.xml',
    '20minutos.es': 'https://www.20minutos.es/rss/',
    'elconfidencial.com': 'https://rss.elconfidencial.com/espana/',
    'eldiario.es': 'https://www.eldiario.es/rss/',
    'publico.es': 'https://www.publico.es/rss/',
    'elespanol.com': 'https://www.elespanol.com/rss/',
    'okdiario.com': 'https://okdiario.com/feed/',
    'libertaddigital.com': 'https://feeds.feedburner.com/libertaddigital/portada',
    'marca.com': 'https://e00-marca.uecdn.es/rss/portada.xml',
    'as.com': 'https://feeds.as.com/mrss-s/pages/as/site/as.com/portada',
    'mundodeportivo.com': 'https://www.mundodeportivo.com/rss/portada.xml',
    'sport.es': 'https://www.sport.es/es/rss/portada.xml',
    'expansion.com': 'https://e00-expansion.uecdn.es/rss/portada.xml',
    'eleconomista.es': 'https://www.eleconomista.es/rss/rss-portada.php',
    'xataka.com': 'https://feeds.weblogssl.com/xataka2',
    'genbeta.com': 'https://feeds.weblogssl.com/genbeta',
    'rtve.es': 'https://www.rtve.es/api/noticias.rss',
    'cadenaser.com': 'https://cadenaser.com/feed/',
    'cope.es': 'https://www.cope.es/rss/',
    'larazon.es': 'https://www.larazon.es/rss/portada.xml',
    'theguardian.com': 'https://www.theguardian.com/world/rss',
    'nytimes.com': 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
    'bbc.com': 'https://feeds.bbci.co.uk/news/rss.xml',
    'reuters.com': 'https://feeds.reuters.com/reuters/topNews',
    'lemonde.fr': 'https://www.lemonde.fr/rss/une.xml',
    'spiegel.de': 'https://www.spiegel.de/schlagzeilen/tops/index.rss',
    'elpais.com.uy': 'https://www.elpais.com.uy/rss/',
    'clarin.com': 'https://www.clarin.com/rss/lo-ultimo/',
    'lanacion.com.ar': 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/',
    'eltiempo.com': 'https://www.eltiempo.com/rss/colombia.xml',
    'folha.uol.com.br': 'https://feeds.folha.uol.com.br/emcimadahora/rss091.xml',
    # puedes ir añadiendo más...
}


def _parse_feed_content(url, content):
    """feedparser sobre bytes ya descargados (para usar nuestros HEADERS)."""
    feed = feedparser.parse(content)
    if not feed.entries:
        return None
    e = feed.entries[0]
    return {
        'titular': e.get('title', '').strip(),
        'enlace': e.get('link', url),
    }


def _google_news(medio):
    """Titular vía Google News RSS filtrando por dominio."""
    lang = GN_LOCALE.get(medio.get('lang', 'es'), GN_LOCALE['es'])
    hl, gl, ceid = lang
    q = f'site:{medio["d"]}'
    url = f'https://news.google.com/rss/search?q={q}&hl={hl}&gl={gl}&ceid={ceid}'
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code == 200:
            return _parse_feed_content(url, r.content)
    except Exception as e:
        print(f"  [GN] {medio['n']}: {e}")
    return None


def _known_feed(medio):
    """RSS conocido y verificado."""
    url = KNOWN_FEEDS.get(medio['d'])
    if not url:
        return None
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code == 200:
            return _parse_feed_content(url, r.content)
    except Exception as e:
        print(f"  [RSS] {medio['n']}: {e}")
    return None


def _scrape(medio):
    """Último recurso: scraping básico del <h1> principal."""
    url = f"https://{medio['d']}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=12)
        if r.status_code != 200:
            return None
        soup = BeautifulSoup(r.text, 'html.parser')
        # buscar el h1 con enlace real (no logo)
        for h in soup.find_all('h1', limit=8):
            a = h.find('a', href=True)
            if not a:
                continue
            texto = a.get_text(' ', strip=True)
            if len(texto) < 25:  # descartar logos/menús
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
    """Estrategia en cascada: Google News -> RSS conocido -> scraping."""
    # 1) Google News (rápido, fiable desde GitHub Actions)
    data = _google_news(medio)
    metodo = 'GoogleNews'
    # 2) RSS oficial
    if not data:
        data = _known_feed(medio)
        metodo = 'RSS'
    # 3) Scraping
    if not data:
        data = _scrape(medio)
        metodo = 'Scraping'

    if not data or not data.get('titular'):
        return None

    return {
        'medio': medio['n'],
        'titular': data['titular'],
        'enlace': data['enlace'],
        'metodo': metodo,
    }


def generar_html(resultados):
    os.makedirs('public', exist_ok=True)
    hora = datetime.now().strftime("%d/%m/%Y %H:%M")

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Resumen de Prensa</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         background:#f4f4f9; color:#111; max-width:820px; margin:0 auto; padding:20px;
         line-height:1.6; font-size:22px; }}
  h1 {{ border-bottom:2px solid #ccc; padding-bottom:10px; }}
  .grupo {{ margin-top:40px; }}
  .grupo-titulo {{ background:#333; color:#fff; padding:10px; border-radius:5px; font-size:24px; }}
  .noticia {{ background:#fff; padding:15px; margin-bottom:15px; border-radius:8px;
             box-shadow:0 2px 4px rgba(0,0,0,.1); }}
  .medio {{ font-weight:bold; color:#555; font-size:18px; text-transform:uppercase; }}
  .meta {{ font-size:13px; color:#888; }}
  a {{ color:#0056b3; text-decoration:none; font-weight:600; display:block; margin-top:5px; }}
  a:hover {{ text-decoration:underline; background:#e6f2ff; }}
  .fecha {{ font-size:16px; color:#666; margin-bottom:30px; }}
</style>
</head>
<body>
<h1>Resumen de Prensa</h1>
<div class="fecha">Última actualización: {hora} · {len(resultados)} titulares</div>
"""

    for grupo in MEDIA_CATALOG:
        nombres = [m['n'] for m in grupo['items']]
        items = [r for r in resultados if r and r['medio'] in nombres]
        if not items:
            continue
        html += f'<div class="grupo"><div class="grupo-titulo">{grupo["group"]}</div>'
        for t in items:
            html += (
                f'<div class="noticia">'
                f'<div class="medio">{t["medio"]} '
                f'<span class="meta">· {t["metodo"]}</span></div>'
                f'<a href="{t["enlace"]}" target="_blank" rel="noopener">{t["titular"]}</a>'
                f'</div>'
            )
        html += '</div>'

    html += "</body></html>"
    with open('public/index.html', 'w', encoding='utf-8') as f:
        f.write(html)


if __name__ == "__main__":
    print("Iniciando recolección...")
    medios = [i for g in MEDIA_CATALOG for i in g['items']]
    print(f"Medios a procesar: {len(medios)}")

    resultados = []
    # menos workers = menos rate-limit
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
        for r in ex.map(obtener_titular, medios):
            if r:
                print(f"✓ {r['medio']} ({r['metodo']}): {r['titular'][:70]}")
                resultados.append(r)
            else:
                # ya se habrá logueado el error específico arriba
                pass

    print(f"\nTotal obtenidos: {len(resultados)}/{len(medios)}")
    generar_html(resultados)
    print("HTML generado en public/index.html")
