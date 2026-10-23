"""Extracción y selección de fuentes, con acceso directo o mediante el relay."""

from datetime import datetime, timedelta, timezone
from urllib.parse import quote, urlparse

from bs4 import BeautifulSoup
from curl_cffi import requests as curl_requests
from medios import HEADERS, fuentes_de, google_news_url
import feedparser

from . import config
from .fechas import (
    _dia_de_url,
    _extract_item_date,
    _fechas_jsonld,
    _parse_iso_flexible,
    _rss_date_to_iso,
    _to_iso_madrid,
)
from .texto import (
    SLUG_RE,
    _clave_url,
    _dominio_de_url,
    _es_valido,
    _host_de,
    _limpiar_cdata,
    _limpiar_titular_gn,
    _normalizar_url,
)


def _crear_sesion():
    s = curl_requests.Session(impersonate="chrome")
    s.headers.update(HEADERS)
    return s


SESSION = _crear_sesion()


def _parse_feed_lxml(content):
    """Fallback: parsea el feed con lxml (más permisivo que feedparser)."""
    try:
        from lxml import etree
    except ImportError:
        return []
    try:
        parser = etree.XMLParser(recover=True, huge_tree=True,
                                 resolve_entities=False, no_network=True)
        root = etree.fromstring(content, parser=parser)
    except Exception:
        return []
    if root is None:
        return []

    def local(tag):
        return tag.split('}', 1)[1].lower() if '}' in tag else tag.lower()

    tag = local(root.tag)
    if tag == 'rss' or tag == 'rdf':
        entries = root.findall('.//item')
    elif tag == 'feed':
        entries = [el for el in root.iter() if local(el.tag) == 'entry']
    else:
        return []

    out = []
    for e in entries[:config.N_FEED]:
        t = l = raw_date = ''
        for el in e.iter():
            ln = local(el.tag)
            if ln == 'title' and not t:
                t = _limpiar_cdata(el.text or '')
            elif ln == 'link' and not l:
                l = (el.text or '').strip() or el.get('href', '').strip()
            elif ln in ('pubdate', 'published', 'updated', 'date') and not raw_date:
                raw_date = (el.text or '').strip()
        if not t or not l:
            continue
        fecha_pub = _rss_date_to_iso(raw_date) if raw_date else ''
        out.append({'titular': t, 'enlace': l, 'fecha_pub': fecha_pub})
    return out


def _parse_feed(content):
    feed = feedparser.parse(content)
    out = []
    for e in feed.entries[:config.N_FEED]:
        t = _limpiar_cdata(e.get('title') or '')
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
        out.append({'titular': t, 'enlace': l, 'fecha_pub': fecha_pub})

    # Fallback: si feedparser no sacó nada, intentar lxml
    if not out:
        out = _parse_feed_lxml(content)
    return out


def _get_xml(medio, url, relay, tag):
    """GET de un feed o sitemap, directo o por el relay de Deno.
    Devuelve (respuesta, None) o (None, estado)."""
    # El relay lee el destino con searchParams.get("u"), que decodifica:
    # sin codificar, una URL con &/? propios se cortaría.
    fetch_url = config.DENO_RELAY_BASE + quote(url, safe='') if relay else url
    if relay:
        tag = 'RELAY'
    try:
        r = SESSION.get(fetch_url, timeout=config.TIMEOUT)
    except Exception as e:
        print(f"  [{tag}!] {medio['n']}: {type(e).__name__}: {e}")
        return None, type(e).__name__
    if r.status_code != 200:
        print(f"  [{tag} {r.status_code}] {medio['n']}: {fetch_url}")
        return None, f'HTTP {r.status_code}'
    return r, None


def _log_vacio(medio, tag, r):
    snippet = (r.content[:200] or b'').decode('utf-8', 'ignore')
    print(f"  [{tag} empty] {medio['n']}: {r.url}  "
          f"ctype={r.headers.get('content-type')!r}  "
          f"bytes={len(r.content)}  head={snippet[:80]!r}")


def _rss(medio, url, relay=False):
    r, estado = _get_xml(medio, url, relay, 'RSS')
    if r is None:
        return None, estado
    try:
        items = _parse_feed(r.content)
    except Exception as e:
        print(f"  [RSS!] {medio['n']}: {type(e).__name__}: {e}")
        return None, type(e).__name__
    if items:
        if relay:
            print(f"  [RELAY ok] {medio['n']}: {len(items)} items")
        return items, 'ok'
    _log_vacio(medio, 'RELAY' if relay else 'RSS', r)
    return None, 'vacío'


def _parse_news_sitemap(content):
    """Sitemap de Google News → items. Si es un índice, devuelve
    ('index', [urls hijas]) para que el llamante siga el de noticias."""
    try:
        from lxml import etree
        parser = etree.XMLParser(recover=True, huge_tree=True,
                                 resolve_entities=False, no_network=True)
        root = etree.fromstring(content, parser=parser)
    except Exception:
        return []
    if root is None:
        return []

    def local(tag):
        return tag.split('}', 1)[1] if isinstance(tag, str) and '}' in tag else tag

    tag = local(root.tag)
    if tag == 'sitemapindex':
        locs = [el.text.strip() for el in root.iter()
                if local(el.tag) == 'loc' and el.text]
        return ('index', locs)
    if tag != 'urlset':
        return []

    out = []
    for u in root:
        if local(u.tag) != 'url':
            continue
        loc = tit = fecha = ''
        for el in u.iter():
            ln = local(el.tag)
            if ln == 'loc' and not loc:
                loc = (el.text or '').strip()
            elif ln == 'title' and not tit:
                tit = _limpiar_cdata(el.text or '')
            elif ln == 'publication_date' and not fecha:
                fecha = _rss_date_to_iso(el.text or '')
        if loc and tit:
            out.append({'titular': tit, 'enlace': loc, 'fecha_pub': fecha})
    # Los sitemaps no garantizan orden: más recientes primero
    out.sort(key=lambda x: x['fecha_pub'] or '', reverse=True)
    return out[:config.N_FEED]


def _news_sitemap(medio, url, relay=False):
    r, estado = _get_xml(medio, url, relay, 'SITEMAP')
    if r is None:
        return None, estado
    items = _parse_news_sitemap(r.content)
    if isinstance(items, tuple):
        hijos = items[1]
        hijo = next((h for h in hijos if 'news' in h.lower()),
                    hijos[0] if hijos else None)
        if not hijo:
            return None, 'índice vacío'
        r, estado = _get_xml(medio, hijo, relay, 'SITEMAP')
        if r is None:
            return None, estado
        items = _parse_news_sitemap(r.content)
        if isinstance(items, tuple):
            return None, 'índice anidado'
    if items:
        return items, 'ok'
    _log_vacio(medio, 'SITEMAP', r)
    return None, 'vacío'


def _scrape(medio, url=None, relay=False, verify=True):
    url = url or f"https://{medio['d']}"
    # Por el relay, `url` sigue siendo la base para resolver los enlaces
    fetch_url = config.DENO_RELAY_BASE + quote(url, safe='') if relay else url
    tag = 'SCRAPE RELAY' if relay else 'SCRAPE'
    try:
        r = SESSION.get(fetch_url, timeout=config.TIMEOUT, allow_redirects=True,
                        verify=verify)
        if r.status_code != 200:
            print(f"  [{tag} {r.status_code}] {medio['n']}")
            return None, f'HTTP {r.status_code}'
        soup = BeautifulSoup(r.text, 'lxml')
        dominio = medio['d']

        items_e1 = _scrape_headings(soup, url, dominio)
        items_e7 = _scrape_slugs(soup, url, dominio)

        unicos = {}
        orden = 0
        for it in items_e1 + items_e7:
            u = it['enlace']
            if u not in unicos:
                it['pos'] = orden
                orden += 1
                unicos[u] = it
            elif not unicos[u].get('fecha_pub') and it.get('fecha_pub'):
                unicos[u] = it

        out = list(unicos.values())
        fechas_ld = _fechas_jsonld(soup)
        for it in out:
            if not it.get('fecha_pub'):
                it['fecha_pub'] = fechas_ld.get(_clave_url(it['enlace']), '')
            # Solo el día: no es fecha real, pero acota la estimada
            it['dia_url'] = _dia_de_url(it['enlace'])
        out.sort(key=lambda x: (0 if x.get('fecha_pub') else 1, x.get('pos', 999)))
        if out:
            return out[:config.N_FEED], 'ok'
        return None, 'vacío'
    except Exception as e:
        print(f"  [{tag}!] {medio['n']}: {type(e).__name__}: {e}")
        return None, type(e).__name__


def _scrape_headings(soup, base_url, dominio):
    """E1: headings h1/h2/h3 con enlace, con filtros anti-basura."""
    out = []
    for tag in soup.find_all(['h1', 'h2', 'h3'], limit=150):
        a = tag.find('a', href=True)
        if not a:
            continue
        texto = a.get_text(' ', strip=True)
        href = _normalizar_url(a['href'], base_url)
        if not _es_valido(texto, href, dominio):
            continue
        out.append({
            'titular':   texto,
            'enlace':    href,
            'fecha_pub': _extract_item_date(tag),
        })
        if len(out) >= config.N_FEED:
            break
    return out


def _scrape_slugs(soup, base_url, dominio):
    """E7: cualquier <a> cuyo href apunte a un slug de noticia."""
    out = []
    for a in soup.find_all('a', href=True, limit=600):
        texto = a.get_text(' ', strip=True)
        href = _normalizar_url(a['href'], base_url)
        if not _es_valido(texto, href, dominio):
            continue
        path = urlparse(href).path.rstrip('/')
        if not path:
            continue
        slug = path.rsplit('/', 1)[-1]
        if not SLUG_RE.match(slug):
            continue
        if slug.count('-') < 2:
            continue
        if slug.replace('-', '').isdigit():
            continue
        out.append({
            'titular':   texto,
            'enlace':    href,
            'fecha_pub': _extract_item_date(a),
        })
        if len(out) >= config.N_FEED:
            break
    return out


def _parse_gn_feed(content):
    feed = feedparser.parse(content)
    out = []
    for e in feed.entries[:config.GN_MAX_ITEMS * 2]:
        t = _limpiar_cdata(e.get('title') or '')
        l = (e.get('link') or '').strip()
        if not t or not l:
            continue

        source_name = ''
        source_url = ''
        src = e.get('source')
        if isinstance(src, dict):
            source_name = (src.get('title') or '').strip()
            source_url = (src.get('href') or '').strip()
        elif src:
            source_name = str(src).strip()

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
            'titular':     _limpiar_titular_gn(t, source_name),
            'enlace':      l,
            'fecha_pub':   fecha_pub,
            'source_name': source_name,
            'source_url':  source_url,
        })
    return out


def _wp_api(medio):
    """Consulta la API REST de WordPress del medio."""
    url = f"https://{medio['d']}/wp-json/wp/v2/posts?per_page={config.N_FEED}"
    try:
        r = SESSION.get(url, timeout=config.TIMEOUT)
        if r.status_code != 200:
            print(f"  [WP-API {r.status_code}] {medio['n']}")
            return None, f'HTTP {r.status_code}'
        data = r.json()
        if not isinstance(data, list):
            print(f"  [WP-API bad-json] {medio['n']}")
            return None, 'JSON inesperado'
        out = []
        for post in data:
            title = (post.get('title') or {}).get('rendered', '')
            link = post.get('link', '')
            date = post.get('date', '')
            date_gmt = post.get('date_gmt', '')
            if not title or not link:
                continue
            fecha_pub = ''
            if date_gmt:
                # date_gmt viene en UTC sin zona; _rss_date_to_iso trata lo
                # naive como UTC, que es justo lo correcto aquí.
                fecha_pub = _rss_date_to_iso(date_gmt)
            elif date:
                # date viene en hora local (Europe/Madrid): offset real del
                # día (CEST o CET), no un '+02:00' fijo.
                if '+' not in date and 'Z' not in date:
                    try:
                        date = datetime.fromisoformat(date).replace(
                            tzinfo=config.TZ_MADRID).isoformat()
                    except ValueError:
                        pass
                fecha_pub = _rss_date_to_iso(date)
            out.append({
                'titular':   _limpiar_cdata(title),
                'enlace':    link,
                'fecha_pub': fecha_pub,
            })
            if len(out) >= config.N_FEED:
                break
        if out:
            print(f"  [WP-API ok] {medio['n']}: {len(out)} items")
            return out, 'ok'
        return None, 'vacío'
    except Exception as e:
        print(f"  [WP-API!] {medio['n']}: {type(e).__name__}: {e}")
        return None, type(e).__name__


def _google_news(medio, extra_q=None):
    domain = medio['d']
    lang = medio.get('lang', 'es')
    url = google_news_url(domain, lang, extra_q)

    try:
        r = SESSION.get(url, timeout=config.TIMEOUT)
        if r.status_code != 200:
            print(f"  [GN {r.status_code}] {medio['n']}")
            return None, f'HTTP {r.status_code}'
        items = _parse_gn_feed(r.content)
        if not items:
            print(f"  [GN empty] {medio['n']}")
            return None, 'vacío'

        corte = datetime.now(config.TZ_MADRID) - timedelta(days=config.GN_DIAS_MAX)
        filtrados = []
        for it in items:
            if not it.get('fecha_pub'):
                continue
            dt = _parse_iso_flexible(it['fecha_pub'])
            if dt is None or dt < corte:
                continue

            dom_src = _dominio_de_url(it.get('source_url', ''))
            if dom_src and not (
                dom_src == domain
                or dom_src.endswith('.' + domain)
                or domain.endswith('.' + dom_src)
            ):
                continue

            filtrados.append(it)
            if len(filtrados) >= config.GN_MAX_ITEMS:
                break

        if not filtrados:
            return None, 'sin recientes del dominio'
        return filtrados, 'ok'

    except Exception as e:
        print(f"  [GN!] {medio['n']}: {type(e).__name__}: {e}")
        return None, type(e).__name__


ETIQUETA_FUENTE = {
    'rss': 'RSS', 'sitemap': 'Sitemap', 'wp': 'WP-API',
    'scrape': 'Scraping', 'gn': 'Google News',
}


def _probar_fuente(medio, f):
    """Ejecuta una fuente ('rss', url[, 'relay']),
    ('scrape'[, url[, 'relay' | 'noverify']])…"""
    tipo, args = f[0], f[1:]
    relay = 'relay' in args[1:]
    if tipo == 'rss':
        return _rss(medio, args[0], relay)
    if tipo == 'sitemap':
        return _news_sitemap(medio, args[0], relay)
    if tipo == 'wp':
        return _wp_api(medio)
    if tipo == 'scrape':
        return _scrape(medio, args[0] if args else None, relay,
                       verify='noverify' not in args[1:])
    if tipo == 'gn':
        return _google_news(medio, args[0] if args else None)
    return None, f'tipo desconocido {tipo!r}'


def obtener_titulares(medio):
    """Prueba las fuentes del medio en orden. Devuelve
    (medio, noticias, fuente, intentos), con `intentos` del tipo
    'RSS:HTTP 403 > Scraping:3 > Google News:ok'."""
    intentos = []
    items, fuente = None, None
    for f in fuentes_de(medio):
        etiqueta = ETIQUETA_FUENTE.get(f[0], f[0])
        got, estado = _probar_fuente(medio, f)
        if got and len(got) >= config.MIN_ITEMS_FUENTE:
            intentos.append(f'{etiqueta}:ok')
            items, fuente = got, etiqueta
            break
        if got:
            # Pocos titulares: nos lo guardamos por si nada lo mejora
            intentos.append(f'{etiqueta}:{len(got)}')
            if not items or len(got) > len(items):
                items, fuente = got, etiqueta
        else:
            intentos.append(f'{etiqueta}:{estado}')
    intentos = ' > '.join(intentos)

    if not items:
        return (medio, [], None, intentos)

    ahora = datetime.now(config.TZ_MADRID).isoformat(timespec='seconds')
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
            'fecha_estimada': '',
            'fuente':         fuente,
            'fecha':          ahora,
            '_pos':           it.get('pos'),
            '_dia_url':       it.get('dia_url', ''),
            '_host':          _host_de(it['enlace']),
        })

    return (medio, noticias, fuente, intentos)


def _timed_obtener(medio):
    """Envuelve obtener_titulares midiendo duración y capturando excepciones.
    Devuelve (medio, noticias, fuente, con_fecha, ms, error, intentos)."""
    import time as _time
    t0 = _time.monotonic()
    try:
        m, noticias, fuente, intentos = obtener_titulares(medio)
        ms = int((_time.monotonic() - t0) * 1000)
        con_fecha = sum(1 for n in noticias if n.get('fecha_pub')) if noticias else 0
        return (m, noticias or [], fuente or '', con_fecha, ms, '', intentos)
    except Exception as e:
        ms = int((_time.monotonic() - t0) * 1000)
        return (medio, [], '', 0, ms, f'{type(e).__name__}: {e}', '')
