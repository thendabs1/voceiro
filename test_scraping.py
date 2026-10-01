# test_scraping.py
"""
Diagnóstico de scraping. Prueba 6 estrategias contra medios problemáticos
(sin fecha real o sin titulares) y reporta cuál extrae más titulares
válidos y más fechas reales, sin meter basura.

Uso:
  python test_scraping.py
  python test_scraping.py --only rtve.es,publico.es
  python test_scraping.py --limit 10
"""

import argparse
import json
import re
import sys
from collections import Counter
from urllib.parse import urlparse

from bs4 import BeautifulSoup

try:
    from recolector import SESSION, TIMEOUT
except Exception:
    from curl_cffi import requests as cffi_requests
    SESSION = cffi_requests.Session(impersonate="chrome")
    TIMEOUT = 15

try:
    from medios import LISTING_URLS
except Exception:
    LISTING_URLS = {}


# ─────────────────────────────────────────────────────────────
# MEDIOS A PROBAR
# ─────────────────────────────────────────────────────────────
TARGETS = [
    # Scraping con titulares pero SIN fecha
    'cambio16.com', 'mientrastanto.org', 'nuevarevista.net',
    'rtve.es', 'vozpopuli.com', 'eleconomista.es',
    'alternativaseconomicas.coop',
    'diaridegirona.cat', 'rac1.cat', 'regio7.cat', 'eitb.eus',
    'eldiadevalladolid.com', 'latribunadealbacete.es', 'huelvaya.es',
    'telemadrid.es', 'elmostrador.cl', 'ilmessaggero.it',
    'ilsole24ore.com', 'corriere.it', 'irishtimes.com',
    'thehindu.com', 'telemundo.com', 'eldesconcierto.cl',
    'elperiodico.com', 'sport.es', '2playbook.com',
    'telegraph.co.uk', 'washingtonpost.com', 'haaretz.com',
    'publico.es',
    # Sin titulares
    'colpisa.com', 'cuartopoder.es', 'diagonalperiodico.net',
    'investigacionyciencia.es', 'critic.cat', 'revistamongolia.com',
    'crtvg.gal', 'radiovoz.com', 'xornaldeferrol.com',
    'noticiasdenavarra.es', 'valenciaactua.es', 'abcnews.com',
    'edition.cnn.com', 'elsiglodeuropa.es', 'niusdiario.es',
    'muyinteresante.es',
]

MIN_LEN = 25
MAX_LEN = 250
N_ITEMS = 60


# ─────────────────────────────────────────────────────────────
# FILTROS ANTI-BASURA
# ─────────────────────────────────────────────────────────────
BAD_WORDS = {
    'suscríbete', 'suscribete', 'newsletter', 'contacto',
    'aviso legal', 'privacidad', 'cookies', 'política de cookies',
    'iniciar sesión', 'iniciar sesion', 'regístrate', 'registrate',
    'publicidad', 'quiénes somos', 'quienes somos',
    'términos y condiciones', 'terminos y condiciones',
    'política de privacidad', 'politica de privacidad',
    'comentarios', 'comentar', 'comparte', 'compartir',
    'síguenos', 'siguenos', 'lo más leído', 'lo mas leido',
    'más leídas', 'mas leidas', 'última hora', 'ultima hora',
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
    '/quienes-somos', '/aviso-legal',
)


def _norm(s):
    return re.sub(r'\s+', ' ', (s or '')).strip()


def _dominio(url):
    if not url:
        return ''
    try:
        d = urlparse(url).netloc.lower()
        return d[4:] if d.startswith('www.') else d
    except Exception:
        return ''


def _normalizar_url(href, base_url):
    if href.startswith('//'):
        return 'https:' + href
    if href.startswith('/'):
        p = urlparse(base_url)
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
    low_href = href.lower()
    if any(seg in low_href for seg in BAD_PATH_SEGMENTS):
        return False
    dom_href = _dominio(href)
    if dom_href and dom_href != dominio and not dom_href.endswith('.' + dominio):
        return False
    return True


# ─────────────────────────────────────────────────────────────
# EXTRACCIÓN DE FECHA (mejorada)
# ─────────────────────────────────────────────────────────────
MESES = {
    'ene': 1, 'feb': 2, 'mar': 3, 'abr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'ago': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dic': 12,
    'jan': 1, 'apr': 4, 'aug': 8, 'dec': 12,
}


def _fecha_desde_texto(txt):
    """Intenta extraer una fecha ISO de un texto tipo '1 oct 2026'."""
    if not txt:
        return ''
    txt = txt.strip()
    # ISO directo
    m = re.search(r'(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})', txt)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}T{m.group(4)}:{m.group(5)}:00+02:00"
    # dd/mm/yyyy
    m = re.search(r'(\d{1,2})[/-](\d{1,2})[/-](\d{4})', txt)
    if m:
        d, mo, y = m.groups()
        return f"{y}-{int(mo):02d}-{int(d):02d}T00:00:00+02:00"
    # "1 oct 2026"
    m = re.search(r'(\d{1,2})\s+([a-záéíóú]{3,})\s+(\d{4})', txt.lower())
    if m:
        d, mes, y = m.groups()
        if mes[:3] in MESES:
            mo = MESES[mes[:3]]
            return f"{y}-{mo:02d}-{int(d):02d}T00:00:00+02:00"
    return ''


def extraer_fecha(nodo):
    """
    Sube por el árbol buscando la fecha más creíble. Devuelve ISO o ''.
    """
    if nodo is None:
        return ''
    # Subir hasta 6 niveles
    cur = nodo
    for _ in range(6):
        if cur is None:
            break
        # <time datetime>
        try:
            for t in cur.find_all('time', limit=3):
                raw = t.get('datetime') or t.get_text(' ', strip=True)
                iso = _fecha_desde_texto(raw)
                if iso:
                    return iso
        except Exception:
            pass
        # meta[itemprop=datePublished]
        try:
            m = cur.find('meta', attrs={'itemprop': 'datePublished'})
            if m and m.get('content'):
                iso = _fecha_desde_texto(m['content'])
                if iso:
                    return iso
        except Exception:
            pass
        # data-* attributes
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
                            ts, tz=_dt.timezone.utc
                        ).isoformat(timespec='seconds')
                    except Exception:
                        pass
                else:
                    iso = _fecha_desde_texto(v)
                    if iso:
                        return iso
        # JSON-LD embebido
        try:
            for script in cur.find_all('script', type='application/ld+json', limit=2):
                try:
                    data = json.loads(script.string or '{}')
                except Exception:
                    continue
                objs = data if isinstance(data, list) else [data]
                for obj in objs:
                    if not isinstance(obj, dict):
                        continue
                    dp = obj.get('datePublished') or obj.get('dateCreated')
                    if dp:
                        iso = _fecha_desde_texto(str(dp))
                        if iso:
                            return iso
        except Exception:
            pass
        # texto relativo "hace X"
        try:
            txt = cur.get_text(' ', strip=True).lower()
            m = re.search(
                r'hace\s+(\d+)\s*'
                r'(minuto|minutos|min|hora|horas|h|d[ií]a|d[ií]as|d|semana|semanas|mes|meses)',
                txt
            )
            if m:
                import datetime as _dt
                n = int(m.group(1))
                u = m.group(2)
                if u.startswith('min'):
                    delta = _dt.timedelta(minutes=n)
                elif u.startswith('h'):
                    delta = _dt.timedelta(hours=n)
                elif u.startswith('sem'):
                    delta = _dt.timedelta(weeks=n)
                elif u.startswith('mes'):
                    delta = _dt.timedelta(days=n * 30)
                else:
                    delta = _dt.timedelta(days=n)
                from zoneinfo import ZoneInfo
                dt = _dt.datetime.now(ZoneInfo('Europe/Madrid')) - delta
                return dt.isoformat(timespec='seconds')
        except Exception:
            pass
        cur = getattr(cur, 'parent', None)
    return ''


# ─────────────────────────────────────────────────────────────
# ESTRATEGIAS
# ─────────────────────────────────────────────────────────────
def _dedup(items):
    vistos = set()
    out = []
    for it in items:
        u = it.get('enlace', '')
        if u in vistos:
            continue
        vistos.add(u)
        out.append(it)
    return out


def e1_headings(soup, base_url, dominio):
    """Baseline actual del recolector: h1/h2/h3 + <a>, len >= 30."""
    out = []
    for tag in soup.find_all(['h1', 'h2', 'h3'], limit=80):
        a = tag.find('a', href=True)
        if not a:
            continue
        texto = _norm(a.get_text(' ', strip=True))
        if len(texto) < 30:
            continue
        href = _normalizar_url(a['href'], base_url)
        out.append({'titular': texto, 'enlace': href,
                    'fecha_pub': extraer_fecha(tag), 'estrategia': 'E1'})
        if len(out) >= N_ITEMS:
            break
    return _dedup(out)


def e2_headings_filtros(soup, base_url, dominio):
    """Headings + filtros anti-basura + límite ampliado."""
    out = []
    for tag in soup.find_all(['h1', 'h2', 'h3'], limit=150):
        a = tag.find('a', href=True)
        if not a:
            continue
        texto = _norm(a.get_text(' ', strip=True))
        href = _normalizar_url(a['href'], base_url)
        if not es_valido(texto, href, dominio):
            continue
        out.append({'titular': texto, 'enlace': href,
                    'fecha_pub': extraer_fecha(tag), 'estrategia': 'E2'})
        if len(out) >= N_ITEMS:
            break
    return _dedup(out)


def e3_articles(soup, base_url, dominio):
    """<article> con heading interno o texto del <a>."""
    out = []
    for art in soup.find_all('article', limit=120):
        a = art.find('a', href=True)
        if not a:
            continue
        # Preferir el heading interno
        h = art.find(['h1', 'h2', 'h3', 'h4'])
        texto = _norm(h.get_text(' ', strip=True) if h else a.get_text(' ', strip=True))
        href = _normalizar_url(a['href'], base_url)
        if not es_valido(texto, href, dominio):
            continue
        out.append({'titular': texto, 'enlace': href,
                    'fecha_pub': extraer_fecha(art), 'estrategia': 'E3'})
        if len(out) >= N_ITEMS:
            break
    return _dedup(out)


def e4_articles_meta(soup, base_url, dominio):
    """<article> + meta[itemprop] + <time>. Misma que E3 pero priorizando meta."""
    out = []
    for art in soup.find_all('article', limit=120):
        # En esta estrategia la fecha la sacamos explícitamente de meta o time
        fecha = ''
        m = art.find('meta', attrs={'itemprop': 'datePublished'})
        if m and m.get('content'):
            fecha = _fecha_desde_texto(m['content'])
        if not fecha:
            t = art.find('time')
            if t:
                fecha = _fecha_desde_texto(t.get('datetime') or t.get_text(' ', strip=True))
        if not fecha:
            continue  # solo nos interesan las que TIENEN fecha
        a = art.find('a', href=True)
        if not a:
            continue
        h = art.find(['h1', 'h2', 'h3', 'h4'])
        texto = _norm(h.get_text(' ', strip=True) if h else a.get_text(' ', strip=True))
        href = _normalizar_url(a['href'], base_url)
        if not es_valido(texto, href, dominio):
            continue
        out.append({'titular': texto, 'enlace': href,
                    'fecha_pub': fecha, 'estrategia': 'E4'})
        if len(out) >= N_ITEMS:
            break
    return _dedup(out)


def e5_articles_jsonld(soup, base_url, dominio):
    """<article> + JSON-LD embebido."""
    out = []
    for art in soup.find_all('article', limit=120):
        fecha = ''
        for script in art.find_all('script', type='application/ld+json', limit=3):
            try:
                data = json.loads(script.string or '{}')
            except Exception:
                continue
            objs = data if isinstance(data, list) else [data]
            for obj in objs:
                if not isinstance(obj, dict):
                    continue
                dp = obj.get('datePublished') or obj.get('dateCreated')
                if dp:
                    fecha = _fecha_desde_texto(str(dp))
                    if fecha:
                        break
            if fecha:
                break
        if not fecha:
            continue
        a = art.find('a', href=True)
        if not a:
            continue
        h = art.find(['h1', 'h2', 'h3', 'h4'])
        texto = _norm(h.get_text(' ', strip=True) if h else a.get_text(' ', strip=True))
        href = _normalizar_url(a['href'], base_url)
        if not es_valido(texto, href, dominio):
            continue
        out.append({'titular': texto, 'enlace': href,
                    'fecha_pub': fecha, 'estrategia': 'E5'})
        if len(out) >= N_ITEMS:
            break
    return _dedup(out)


def e6_combinada(soup, base_url, dominio):
    """E2 + E3 + E4 + E5 fusionadas y deduplicadas por URL."""
    todos = []
    todos += e2_headings_filtros(soup, base_url, dominio)
    todos += e3_articles(soup, base_url, dominio)
    todos += e4_articles_meta(soup, base_url, dominio)
    todos += e5_articles_jsonld(soup, base_url, dominio)
    # Reordenar: primero los que tienen fecha, luego por aparición
    unicos = {}
    for it in todos:
        u = it['enlace']
        if u not in unicos:
            unicos[u] = it
        else:
            # Si el existente no tiene fecha y este sí, sustituir
            if not unicos[u]['fecha_pub'] and it['fecha_pub']:
                unicos[u] = it
    out = list(unicos.values())
    out.sort(key=lambda x: (0 if x['fecha_pub'] else 1))
    return out[:N_ITEMS]


ESTRATEGIAS = [
    ('E1 headings (baseline)', e1_headings),
    ('E2 headings+filtros',    e2_headings_filtros),
    ('E3 article+heading',     e3_articles),
    ('E4 article+meta/time',   e4_articles_meta),
    ('E5 article+jsonld',      e5_articles_jsonld),
    ('E6 combinada',           e6_combinada),
]


# ─────────────────────────────────────────────────────────────
# CONTEO DE BASURA
# ─────────────────────────────────────────────────────────────
def contar_basura(items, dominio):
    n = 0
    for it in items:
        t = it['titular'].lower()
        if any(w in t for w in BAD_WORDS):
            n += 1
            continue
        if len(it['titular']) < MIN_LEN or len(it['titular']) > MAX_LEN:
            n += 1
            continue
        dom = _dominio(it['enlace'])
        if dom and dom != dominio and not dom.endswith('.' + dominio):
            n += 1
    return n


# ─────────────────────────────────────────────────────────────
# PROBAR UN MEDIO
# ─────────────────────────────────────────────────────────────
def probar_medio(dominio):
    url = LISTING_URLS.get(dominio) or f"https://{dominio}"
    resultado = {
        'dominio': dominio,
        'url': url,
        'error': '',
        'estrategias': {},
    }
    try:
        r = SESSION.get(url, timeout=TIMEOUT, allow_redirects=True)
    except Exception as e:
        resultado['error'] = f"{type(e).__name__}: {e}"
        return resultado
    if r.status_code != 200:
        resultado['error'] = f"HTTP {r.status_code}"
        return resultado

    try:
        soup = BeautifulSoup(r.text, 'lxml')
    except Exception as e:
        resultado['error'] = f"BS4: {e}"
        return resultado

    for nombre, fn in ESTRATEGIAS:
        try:
            items = fn(soup, url, dominio)
        except Exception as e:
            items = []
            resultado['estrategias'][nombre] = {
                'total': 0, 'con_fecha': 0, 'basura': 0,
                'error': f"{type(e).__name__}: {e}",
            }
            continue
        con_fecha = sum(1 for it in items if it.get('fecha_pub'))
        basura = contar_basura(items, dominio)
        resultado['estrategias'][nombre] = {
            'total': len(items),
            'con_fecha': con_fecha,
            'basura': basura,
        }
    return resultado


# ─────────────────────────────────────────────────────────────
# REPORTE
# ─────────────────────────────────────────────────────────────
def imprimir_reporte(resultados):
    print("\n" + "=" * 78)
    print("RESULTADOS POR MEDIO")
    print("=" * 78)

    for r in resultados:
        print(f"\n=== {r['dominio']} ===")
        if r['error']:
            print(f"  [ERROR] {r['error']}")
            continue
        for nombre, _ in ESTRATEGIAS:
            s = r['estrategias'].get(nombre)
            if not s:
                continue
            if s.get('error'):
                print(f"  {nombre:28s}  ERROR: {s['error']}")
            else:
                print(f"  {nombre:28s}  titulares={s['total']:3d}  "
                      f"con_fecha={s['con_fecha']:3d}  basura={s['basura']:3d}")

    # Resumen global
    print("\n" + "=" * 78)
    print("RESUMEN")
    print("=" * 78)

    mejoras_fecha = 0
    mejoras_tit = 0
    sin_datos = 0
    for r in resultados:
        if r['error']:
            sin_datos += 1
            continue
        e1 = r['estrategias'].get('E1 headings (baseline)', {})
        e6 = r['estrategias'].get('E6 combinada', {})
        if e6.get('con_fecha', 0) > e1.get('con_fecha', 0):
            mejoras_fecha += 1
        if e6.get('total', 0) > e1.get('total', 0) + 3:
            mejoras_tit += 1

    print(f"Medios probados:                        {len(resultados)}")
    print(f"Medios con más fecha que baseline (E1): {mejoras_fecha}")
    print(f"Medios con más titulares que baseline:  {mejoras_tit}")
    print(f"Medios sin datos (error/timeout/403):   {sin_datos}")


# ─────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='',
                    help='Lista de dominios separados por coma')
    ap.add_argument('--limit', type=int, default=0,
                    help='Procesar solo los N primeros')
    args = ap.parse_args()

    if args.only:
        dominios = [d.strip() for d in args.only.split(',') if d.strip()]
    else:
        dominios = list(TARGETS)

    if args.limit:
        dominios = dominios[:args.limit]

    print(f"Probando {len(dominios)} medios...\n")
    resultados = []
    for i, d in enumerate(dominios, 1):
        print(f"[{i}/{len(dominios)}] {d} ...", flush=True)
        resultados.append(probar_medio(d))

    imprimir_reporte(resultados)


if __name__ == '__main__':
    main()
