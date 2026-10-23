"""Limpieza de titulares, dominios y URLs, sin acceso a la red."""

from urllib.parse import urlparse
import hashlib
import html
import json
import re
import unicodedata

from bs4 import BeautifulSoup


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
_QUERY_RUIDO = {
    'utm_source','utm_medium','utm_campaign','utm_term','utm_content',
    'fbclid','gclid','mc_cid','mc_eid','igshid','_ga','_gl',
    'ref','referrer','rss','at_medium','at_campaign',
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
SLUG_RE = re.compile(r'^[a-z0-9][a-z0-9\-]{15,}$')


def _norm_strict(s):
    """Equivalente a normStrict de shared/parser.js.
    'España · Nacionales' → 'espanaacionales'
    """
    if not s:
        return ''
    s = str(s).lower()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return ''.join(c for c in s if c.isascii() and c.isalnum())


def _hash_titular(titular):
    """Hash normalizado de titular (mismo que deduplicar_editorial)."""
    import hashlib, unicodedata
    s = (titular or '').lower()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = ''.join(c for c in s if c.isalnum())
    return hashlib.md5(s.encode('utf-8')).hexdigest()[:16]


def _slug_grupo(grupo):
    """'España · Nacionales' → 'espana-nacionales'."""
    s = (grupo or '').lower()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s or 'sin-grupo'


def _hash_payload(payload):
    """
    Hash MD5 corto del payload SIN el campo 'generado' (metadata volátil).
    El hash refleja SOLO el contenido real (medios + noticias del día).
    """
    estatico = {k: v for k, v in payload.items() if k != 'generado'}
    blob = json.dumps(
        estatico, ensure_ascii=False, separators=(',', ':'), sort_keys=True
    ).encode('utf-8')
    return hashlib.md5(blob).hexdigest()[:10]


def _limpiar_cdata(s):
    """Devuelve el texto del titular sin CDATA, entidades ni etiquetas HTML."""
    if not s:
        return ''
    s = str(s).strip()
    # Quitar CDATA
    changed = True
    while changed:
        changed = False
        if s.startswith('<![CDATA['):
            s = s[9:]
            changed = True
        if s.endswith(']]>'):
            s = s[:-3]
            changed = True
        s = s.strip()
    # Decodificar entidades HTML (&apos; &quot; &amp; &#39; etc.)
    s = html.unescape(s)
    # Algunos feeds y sitemaps incluyen marcado inline dentro del título.
    if '<' in s and '>' in s:
        s = BeautifulSoup(s, 'html.parser').get_text()
    # Colapsar espacios múltiples
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def _clave_url(url):
    """URL sin esquema, www, query ni barra final: para cruzar enlaces."""
    try:
        p = urlparse(url)
    except Exception:
        return url
    host = (p.netloc or '').lower()
    if host.startswith('www.'):
        host = host[4:]
    return host + p.path.rstrip('/')


def _dominio_de(url):
    """Devuelve el dominio sin www."""
    try:
        from urllib.parse import urlparse
        d = urlparse(url).netloc.lower()
        return d[4:] if d.startswith('www.') else d
    except Exception:
        return ''


def _limpiar_query(url):
    """Quita parámetros de tracking. Mantiene el resto intacto."""
    if not url:
        return url
    try:
        p = urlparse(url)
        if not p.query:
            return url
        from urllib.parse import parse_qsl, urlencode, urlunparse
        keep = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
                if k.lower() not in _QUERY_RUIDO]
        if not keep:
            return urlunparse((p.scheme, p.netloc, p.path, p.params, '', ''))
        return urlunparse((p.scheme, p.netloc, p.path, p.params, urlencode(keep), ''))
    except Exception:
        return url


def _host_de(url):
    """Devuelve el netloc tal cual vino (con www si lo traía)."""
    if not url:
        return ''
    try:
        return (urlparse(url).netloc or '').lower()
    except Exception:
        return ''


def _normalizar_url(href, base_url):
    """Convierte href relativo a absoluto usando urljoin."""
    try:
        from urllib.parse import urljoin
        return urljoin(base_url, href)
    except Exception:
        return href


def _es_valido(texto, href, dominio):
    """Filtro anti-basura: longitud, palabras prohibidas, rutas y dominio."""
    if len(texto) < 20 or len(texto) > 250:
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
    dom_href = _dominio_de(href)
    if dom_href and dom_href != dominio and not dom_href.endswith('.' + dominio):
        return False
    return True


def _limpiar_titular_gn(titulo, source_name):
    if not titulo or not source_name:
        return titulo
    sufijo = ' - ' + source_name
    if titulo.endswith(sufijo):
        return titulo[:-len(sufijo)].strip()
    return titulo


def _dominio_de_url(url):
    if not url:
        return ''
    try:
        from urllib.parse import urlparse
        d = (urlparse(url).netloc or '').lower()
        if d.startswith('www.'):
            d = d[4:]
        return d
    except Exception:
        return ''


def _url_corta(url, dominio):
    """Si la URL es del mismo dominio, devuelve solo el path."""
    if not url:
        return ''
    try:
        p = urlparse(url)
        host = (p.netloc or '').lower()
        if host.startswith('www.'):
            host = host[4:]
        if host == dominio or host.endswith('.' + dominio):
            path = p.path or '/'
            if p.query:
                from urllib.parse import parse_qsl, urlencode
                keep = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
                        if k.lower() not in _QUERY_RUIDO]
                if keep:
                    path += '?' + urlencode(keep)
            return path
        return url
    except Exception:
        return url
