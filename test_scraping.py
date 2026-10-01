# test_scraping_v2.py
"""
Test de scraping v2 — añade E7 (búsqueda por enlaces con patrón /noticias/).
Uso: python test_scraping_v2.py https://www.revistamongolia.com/
     python test_scraping_v2.py https://www.sport.es/
"""
import sys
import re
import json
from urllib.parse import urlparse
from bs4 import BeautifulSoup
from curl_cffi import requests

TIMEOUT = 20
N_ITEMS = 60
MIN_LEN = 20
MAX_LEN = 250

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

BAD_PATH_SEGMENTS = (
    '/tag/', '/tags/', '/autor/', '/autores/', '/author/',
    '/seccion/', '/secciones/', '/category/', '/categoria/',
    '/newsletter', '/suscri', '/contact', '/contacto',
    '/aviso-legal', '/privacidad', '/privacy', '/terms',
    '/login', '/register', '/cuenta', '/perfil',
    '/comentarios', '/rss', '/publicidad', '/anunciate',
    '/quienes-somos', '/equipo', '/staff',
)


def _norm(s):
    return re.sub(r'\s+', ' ', (s or '')).strip()


def _dominio(url):
    try:
        d = urlparse(url).netloc.lower()
        return d[4:] if d.startswith('www.') else d
    except Exception:
        return ''


def _abs(href, base):
    if href.startswith('//'):
        return 'https:' + href
    if href.startswith('/'):
        p = urlparse(base)
        return f"{p.scheme}://{p.netloc}{href}"
    return href


def es_valido(texto, href, dominio):
    texto = _norm(texto)
    if len(texto) < MIN_LEN or len(texto) > MAX_LEN:
        return False
    if texto.isdigit():
        return False
    low = texto.lower()
    if any(w in low for w in BAD_WORDS):
        return False
    if href.startswith('#') or href.startswith('javascript:'):
        return False
    lh = href.lower()
    if any(seg in lh for seg in BAD_PATH_SEGMENTS):
        return False
    d = _dominio(href)
    if d and d != dominio and not d.endswith('.' + dominio):
        return False
    return True


def extraer_fecha(nodo):
    if nodo is None:
        return ''
    cur = nodo
    for _ in range(6):
        if cur is None:
            break
        try:
            for t in cur.find_all('time', limit=3):
                raw = t.get('datetime') or t.get_text(' ', strip=True)
                iso = _fecha_desde(raw)
                if iso:
                    return iso
        except Exception:
            pass
        try:
            m = cur.find('meta', attrs={'itemprop': 'datePublished'})
            if m and m.get('content'):
                iso = _fecha_desde(m['content'])
                if iso:
                    return iso
        except Exception:
            pass
        if hasattr(cur, 'attrs') and cur.attrs:
            for attr in ('data-timestamp', 'data-time', 'data-date',
                         'data-datetime', 'data-published', 'data-pubdate'):
                v = cur.attrs.get(attr)
                if not v:
                    continue
                v = str(v).strip()
                if v.isdigit():
                    try:
                        ts = int(v)
                        if ts > 1e12:
                            ts //= 1000
                        import datetime as _dt
                        return _dt.datetime.fromtimestamp(
                            ts, tz=_dt.timezone.utc).isoformat(timespec='seconds')
                    except Exception:
                        pass
                else:
                    iso = _fecha_desde(v)
                    if iso:
                        return iso
        try:
            txt = cur.get_text(' ', strip=True).lower()
            m = re.search(r'hace\s+(\d+)\s*'
                          r'(minuto|minutos|min|hora|horas|h|d[ií]a|d[ií]as|d|semana|semanas|mes|meses)',
                          txt)
            if m:
                import datetime as _dt
                from zoneinfo import ZoneInfo
                n = int(m.group(1))
                u = m.group(2)
                if u.startswith('min'):
                    d = _dt.timedelta(minutes=n)
                elif u.startswith('h'):
                    d = _dt.timedelta(hours=n)
                elif u.startswith('sem'):
                    d = _dt.timedelta(weeks=n)
                elif u.startswith('mes'):
                    d = _dt.timedelta(days=n * 30)
                else:
                    d = _dt.timedelta(days=n)
                return (_dt.datetime.now(ZoneInfo('Europe/Madrid')) - d).isoformat(timespec='seconds')
        except Exception:
            pass
        cur = getattr(cur, 'parent', None)
    return ''


MESES = {'ene':1,'feb':2,'mar':3,'abr':4,'may':5,'jun':6,'jul':7,'ago':8,
         'sep':9,'oct':10,'nov':11,'dic':12,'jan':1,'apr':4,'aug':8,'dec':12}


def _fecha_desde(txt):
    if not txt:
        return ''
    txt = str(txt).strip()
    m = re.search(r'(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})', txt)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}T{m.group(4)}:{m.group(5)}:00+02:00"
    m = re.search(r'(\d{1,2})[/-](\d{1,2})[/-](\d{4})', txt)
    if m:
        d, mo, y = m.groups()
        return f"{y}-{int(mo):02d}-{int(d):02d}T00:00:00+02:00"
    m = re.search(r'(\d{1,2})\s+([a-záéíóú]{3,})\s+(\d{4})', txt.lower())
    if m:
        d, mes, y = m.groups()
        if mes[:3] in MESES:
            mo = MESES[mes[:3]]
            return f"{y}-{mo:02d}-{int(d):02d}T00:00:00+02:00"
    return ''


def _dedup(items):
    vistos = set()
    out = []
    for it in items:
        if it['enlace'] in vistos:
            continue
        vistos.add(it['enlace'])
        out.append(it)
    return out


# ─── ESTRATEGIAS ───
def e1_headings(soup, base, dom):
    out = []
    for t in soup.find_all(['h1','h2','h3'], limit=80):
        a = t.find('a', href=True)
        if not a:
            continue
        txt = _norm(a.get_text(' ', strip=True))
        if len(txt) < 30:
            continue
        out.append({'titular': txt, 'enlace': _abs(a['href'], base),
                    'fecha_pub': extraer_fecha(t)})
        if len(out) >= N_ITEMS:
            break
    return _dedup(out)


def e2_headings_filtros(soup, base, dom):
    out = []
    for t in soup.find_all(['h1','h2','h3'], limit=150):
        a = t.find('a', href=True)
        if not a:
            continue
        txt = _norm(a.get_text(' ', strip=True))
        href = _abs(a['href'], base)
        if not es_valido(txt, href, dom):
            continue
        out.append({'titular': txt, 'enlace': href, 'fecha_pub': extraer_fecha(t)})
        if len(out) >= N_ITEMS:
            break
    return _dedup(out)


def e3_articles(soup, base, dom):
    out = []
    for art in soup.find_all('article', limit=120):
        a = art.find('a', href=True)
        if not a:
            continue
        h = art.find(['h1','h2','h3','h4'])
        txt = _norm(h.get_text(' ', strip=True) if h else a.get_text(' ', strip=True))
        href = _abs(a['href'], base)
        if not es_valido(txt, href, dom):
            continue
        out.append({'titular': txt, 'enlace': href, 'fecha_pub': extraer_fecha(art)})
        if len(out) >= N_ITEMS:
            break
    return _dedup(out)


# ─── E7 (NUEVA) ───
SLUG_OK = re.compile(r'^[a-z0-9][a-z0-9\-]{15,}$')


def e7_enlaces_por_slug(soup, base, dom):
    """
    Busca cualquier <a> cuyo href apunte a una noticia por el slug.
    No depende de headings ni de <article>.
    """
    out = []
    for a in soup.find_all('a', href=True, limit=600):
        txt = _norm(a.get_text(' ', strip=True))
        href = _abs(a['href'], base)
        if not es_valido(txt, href, dom):
            continue
        # Analizar el slug
        path = urlparse(href).path.rstrip('/')
        if not path:
            continue
        slug = path.rsplit('/', 1)[-1]
        # Descartar si no parece un slug de noticia
        if not SLUG_OK.match(slug):
            continue
        # Debe tener al menos 2 guiones
        if slug.count('-') < 2:
            continue
        # Descartar slugs numéricos
        if slug.replace('-', '').isdigit():
            continue
        out.append({'titular': txt, 'enlace': href, 'fecha_pub': extraer_fecha(a)})
        if len(out) >= N_ITEMS:
            break
    return _dedup(out)

def e8_wp_api(base, dom):
    """Prueba la API REST de WordPress estándar."""
    # Extraer el origen del dominio
    p = urlparse(base)
    api_url = f"{p.scheme}://{p.netloc}/wp-json/wp/v2/posts?per_page=60"
    try:
        r = requests.get(api_url, impersonate="chrome", timeout=TIMEOUT)
        if r.status_code != 200:
            return []
        data = r.json()
    except Exception:
        return []
    out = []
    for post in data:
        title = (post.get('title') or {}).get('rendered', '')
        link = post.get('link', '')
        date = post.get('date', '')
        if not title or not link:
            continue
        out.append({
            'titular': _norm(title),
            'enlace': link,
            'fecha_pub': date + '+02:00' if date else '',
        })
        if len(out) >= N_ITEMS:
            break
    return out
     
ESTRATEGIAS = [
    ('E1 headings (baseline)', e1_headings),
    ('E2 headings+filtros',    e2_headings_filtros),
    ('E3 article+heading',     e3_articles),
    ('E7 enlaces por slug',    e7_enlaces_por_slug),
    ('E8 WP API REST',         e8_wp_api),
]


def main():
    if len(sys.argv) < 2:
        print("Uso: python test_scraping_v2.py URL")
        sys.exit(1)

    url = sys.argv[1]
    dom = _dominio(url)

    r = requests.get(url, impersonate="chrome", timeout=TIMEOUT)
    print(f"URL:     {url}")
    print(f"Status:  {r.status_code}")
    print(f"Bytes:   {len(r.content)}")
    print(f"<time>:  {r.text.count('<time')}")
    print(f"<article>: {r.text.count('<article')}")
    print()

    soup = BeautifulSoup(r.text, 'lxml')
    for nombre, fn in ESTRATEGIAS:
        try:
            items = fn(soup, url, dom)
        except Exception as e:
            print(f"  {nombre:28s}  ERROR: {type(e).__name__}: {e}")
            continue
        con_fecha = sum(1 for it in items if it.get('fecha_pub'))
        print(f"  {nombre:28s}  titulares={len(items):3d}  con_fecha={con_fecha:3d}")
        # Mostrar 3 ejemplos
        for it in items[:3]:
            f = it.get('fecha_pub', '')[:16]
            print(f"      · [{f}] {it['titular'][:80]}")


if __name__ == '__main__':
    main()
