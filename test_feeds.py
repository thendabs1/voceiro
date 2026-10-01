import requests
from curl_cffi import requests as cffi_requests
import feedparser

URLS = [
    ('Diario de Pontevedra RSS', 'https://www.diariodepontevedra.es/rss/'),
    ('El Progreso RSS',          'https://www.elprogreso.es/rss/'),
    ('Cuatro RSS',               'https://www.cuatro.com/rss.xml'),
    ('Telecinco RSS',            'https://www.telecinco.es/rss.xml'),
    ('El Desmarque RSS',         'https://www.eldesmarque.com/rss.xml'),
    ('National Geographic RSS',  'https://www.nationalgeographic.com.es/feeds/rss'),
]

HEADERS_BASE = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
}

HEADERS_FULL = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9,gl;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Connection': 'keep-alive',
}

def test(name, fn):
    try:
        r = fn()
        ctype = r.headers.get('content-type', '')
        items = len(feedparser.parse(r.content).entries)
        print(f"  [{name}] status={r.status_code} ctype={ctype!r} items={items}")
        return r.status_code == 200 and items > 0
    except Exception as e:
        print(f"  [{name}] EXC {type(e).__name__}: {e}")
        return False

for label, url in URLS:
    print(f"\n=== {url} ===")

    # 1. requests con headers base (lo que hace tu recolector ahora)
    test('requests/basic', lambda u=url: requests.get(u, headers=HEADERS_BASE, timeout=15))

    # 2. requests con headers completos de navegador
    test('requests/full', lambda u=url: requests.get(u, headers=HEADERS_FULL, timeout=15))

    # 3. curl_cffi impersonando Chrome
    test('curl_cffi/chrome', lambda u=url: cffi_requests.get(u, impersonate='chrome', timeout=15))

    # 4. curl_cffi chrome124 (a veces los sitios bloquean versiones viejas)
    test('curl_cffi/chrome124', lambda u=url: cffi_requests.get(u, impersonate='chrome124', timeout=15))

    # 5. curl_cffi firefox
    test('curl_cffi/firefox', lambda u=url: cffi_requests.get(u, impersonate='firefox', timeout=15))
