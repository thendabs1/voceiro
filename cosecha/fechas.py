"""Fechas de fuentes y noticias: interpretación, estimación y formato corto."""

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urlparse
import json
import re

from . import config
from .texto import _clave_url


def _to_iso_madrid(dt):
    if dt is None:
        return ''
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    try:
        return dt.astimezone(config.TZ_MADRID).isoformat(timespec='seconds')
    except Exception:
        return ''


_MESES = {
    'jan': 'Jan', 'ene': 'Jan', 'gen': 'Jan',
    'feb': 'Feb', 'fev': 'Feb', 'fév': 'Feb',
    'mar': 'Mar',
    'apr': 'Apr', 'abr': 'Apr', 'avr': 'Apr',
    'may': 'May', 'mai': 'May', 'mag': 'May',
    'jun': 'Jun', 'giu': 'Jun',
    'jul': 'Jul', 'lug': 'Jul',
    'aug': 'Aug', 'ago': 'Aug', 'aoû': 'Aug',
    'sep': 'Sep', 'set': 'Sep',
    'oct': 'Oct', 'out': 'Oct', 'ott': 'Oct',
    'nov': 'Nov',
    'dec': 'Dec', 'dic': 'Dec', 'dez': 'Dec', 'des': 'Dec', 'déc': 'Dec',
}
_FECHA_LOCALIZADA_RE = re.compile(
    r'(\d{1,2})\s+(?:de\s+)?([^\W\d_]{3,})\.?\s+(?:de\s+)?(\d{4})[,\s]+'
    r'(\d{1,2}:\d{2}(?::\d{2})?)\s*([+-]\d{4}|gmt|utc|z)?')


_SOLO_DIA_RE = re.compile(
    r'^(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4}'
    r'|(?:[^\W\d_]{3,}\.?,?\s+)?\d{1,2}\s+[^\W\d_]{3,}\.?\s+\d{4})$')


def _solo_dia(raw):
    """¿Trae el día sin hora? Entonces no hay instante que guardar: con la
    hora inventada (00:00, o 02:00 si se lee como UTC) parecería exacta."""
    return bool(_SOLO_DIA_RE.match(str(raw or '').strip()))


def _dia_de_fecha(raw):
    """'AAAA-MM-DD' de una fecha que trae solo el día, o ''. El día sí es
    fiable: acota la estimada y se guarda como `p` sin hora."""
    raw = str(raw or '').strip()
    if not _solo_dia(raw):
        return ''
    m = (re.match(r'^(\d{4})-(\d{2})-(\d{2})$', raw)
         or re.match(r'^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$', raw))
    if m:
        a, b, c = (int(x) for x in m.groups())
        y, mo, d = (a, b, c) if a > 31 else (c, b, a)
    else:
        m = re.search(r'(\d{1,2})\s+([^\W\d_]{3,})\.?\s+(\d{4})$', raw.lower())
        mes = _MESES.get(m.group(2)[:3]) if m else None
        if not mes:
            return ''
        d, y = int(m.group(1)), int(m.group(3))
        mo = datetime.strptime(mes, '%b').month
    try:
        return datetime(y, mo, d).date().isoformat()
    except ValueError:
        return ''


def _fecha_y_dia(raw):
    """(instante ISO, '') o, si la fuente da solo el día, ('', 'AAAA-MM-DD')."""
    iso = _rss_date_to_iso(raw)
    return (iso, '') if iso else ('', _dia_de_fecha(raw))


def _rss_date_to_iso(raw):
    if not raw:
        return ''
    raw = str(raw).strip()
    if not raw or _solo_dia(raw):
        return ''

    try:
        dt = datetime.fromisoformat(raw.replace('Z', '+00:00'))
        return _to_iso_madrid(dt)
    except (ValueError, AttributeError):
        pass

    # RFC 822 con la zona en «+09:00»: parsedate_to_datetime no la entiende,
    # devuelve una fecha sin zona y se leería como UTC.
    raw = re.sub(r'(\d{2}:\d{2}(?::\d{2})?\s*[+-]\d{2}):(\d{2})$', r'\1\2', raw)
    try:
        dt = parsedate_to_datetime(raw)
        if dt is not None:
            return _to_iso_madrid(dt)
    except (TypeError, ValueError):
        pass

    # RFC 822 con día y mes en otro idioma: 'terça, 13 out. 2026 12:27:51 +0100'
    m = _FECHA_LOCALIZADA_RE.search(raw.lower())
    if m:
        d, mes, y, hms, tz = m.groups()
        mes_en = _MESES.get(mes[:3])
        if mes_en:
            try:
                dt = parsedate_to_datetime(
                    f"{d} {mes_en} {y} {hms}" + (f" {tz.upper()}" if tz else ''))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=config.TZ_MADRID)
                return _to_iso_madrid(dt)
            except (TypeError, ValueError):
                pass

    m = re.match(r'^(\d{1,2})[/-](\d{1,2})[/-](\d{4})'
                 r'(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?', raw)
    if m:
        d, mo, y, h, mi, se = m.groups()
        try:
            dt = datetime(int(y), int(mo), int(d),
                          int(h or 0), int(mi or 0), int(se or 0),
                          tzinfo=config.TZ_MADRID)
            return _to_iso_madrid(dt)
        except ValueError:
            pass

    return ''


def _parse_iso_flexible(val):
    """Convierte string ISO a datetime con tz. Devuelve None si no se puede."""
    if not val:
        return None
    try:
        dt = datetime.fromisoformat(val)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=config.TZ_MADRID)
        return dt
    except (ValueError, TypeError):
        return None


def _fecha_orden(n):
    """Fecha para ordenar visualmente: prioriza pub > estimada > recolección."""
    return _fecha_agrupacion_dt(n) or datetime.min.replace(tzinfo=timezone.utc)


def _fecha_agrupacion_dt(n, ahora=None):
    """
    Fecha que determina a qué día pertenece la noticia.
    - Si fecha_pub existe y NO es futura (> recogida + HORIZONTE) → fecha_pub.
    - Si fecha_pub es futura → fecha_estimada o fecha.
    - Si no hay fecha_pub → fecha_estimada o fecha.
    Devuelve None si no hay ninguna fecha válida.

    El horizonte se cuenta desde la primera recogida (`fecha`), no desde
    ahora: así una cita de agenda no salta de día al acercarse, y lo
    decidido no cambia de un run a otro.
    """
    ref = _parse_iso_flexible(n.get('fecha'))
    if ref is None:
        ref = ahora or datetime.now(config.TZ_MADRID)
    horizonte = ref + timedelta(hours=config.HORIZONTE_FUTURO_HORAS)

    for key in ('fecha_pub', 'fecha_estimada', 'fecha'):
        dt = _parse_iso_flexible(n.get(key))
        if dt is None:
            continue
        if dt > horizonte:
            continue  # futura → no sirve para agrupar, probar la siguiente
        return dt
    return None


def _fecha_visible_iso(n, ahora=None):
    """Fecha de agrupación en ISO. Se usa para decidir el día del fichero."""
    dt = _fecha_agrupacion_dt(n, ahora)
    if dt is None:
        return ''
    return dt.isoformat(timespec='seconds')


_UNIDAD_REL = (r'(min(?:uto|uti|ute|ut)?s?|h(?:ora|our)?s?|hores|ore|'
               r'd[ií]as?|days?|giorn[oi]|dies|d|'
               r'semanas?|weeks?|settiman[ae]|setmanes|setmana|'
               r'mes(?:es)?|months?|mes[ei])')
_REL_PREFIJO_RE = re.compile(
    r'\b(?:hace|há|fa|hai)\s+(\d+)\s*' + _UNIDAD_REL + r'\b')
_REL_SUFIJO_RE = re.compile(
    r'\b(\d+)\s*' + _UNIDAD_REL + r'\s+(?:ago|fa)\b')


def _delta_relativo(txt):
    """timedelta de un texto relativo ('hace 3 horas', '2 hours ago'…)."""
    m = _REL_PREFIJO_RE.search(txt) or _REL_SUFIJO_RE.search(txt)
    if not m:
        return None
    n_val = int(m.group(1))
    unit = m.group(2)
    if unit.startswith('min'):
        return timedelta(minutes=n_val)
    if unit.startswith('h') or unit == 'ore':
        return timedelta(hours=n_val)
    if unit.startswith(('sem', 'week', 'sett', 'setm')):
        return timedelta(weeks=n_val)
    if unit.startswith(('mes', 'month')):
        return timedelta(days=n_val * 30)
    return timedelta(days=n_val)


_FECHA_URL_RES = (
    re.compile(r'/(20\d{2})[/-](0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])(?=[/\-_.]|$)'),
    re.compile(r'[/_-](20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?=[/\-_.]|$)'),
)


def _dia_de_url(href):
    """Día de publicación que viene en la URL ('YYYY-MM-DD') o ''. Uno
    antiguo también vale: acota la estimada a ese día y la noticia cae
    fuera de la ventana, en vez de estimarse como de hoy."""
    try:
        path = urlparse(href).path
    except Exception:
        return ''
    hoy = datetime.now(config.TZ_MADRID).date()
    for rx in _FECHA_URL_RES:
        m = rx.search(path)
        if not m:
            continue
        try:
            dia = datetime(int(m.group(1)), int(m.group(2)), int(m.group(3))).date()
        except ValueError:
            continue
        if dia <= hoy:
            return dia.isoformat()
    return ''


def _fechas_jsonld(soup):
    """{url normalizada: fecha ISO} sacado de los bloques JSON-LD de la página
    (NewsArticle, ItemList…): muchas portadas lo traen aunque no pinten fecha."""
    out = {}

    def visitar(o):
        if isinstance(o, list):
            for x in o:
                visitar(x)
            return
        if not isinstance(o, dict):
            return
        fecha = o.get('datePublished') or o.get('dateCreated')
        url = o.get('url') or o.get('@id')
        if isinstance(o.get('mainEntityOfPage'), dict):
            url = url or o['mainEntityOfPage'].get('@id')
        elif isinstance(o.get('mainEntityOfPage'), str):
            url = url or o['mainEntityOfPage']
        if isinstance(fecha, str) and isinstance(url, str):
            iso = _rss_date_to_iso(fecha)
            if iso:
                out.setdefault(_clave_url(url), iso)
        for v in o.values():
            if isinstance(v, (list, dict)):
                visitar(v)

    for sc in soup.find_all('script', type='application/ld+json'):
        try:
            visitar(json.loads(sc.string or ''))
        except (ValueError, TypeError):
            continue
    return out


_TITULARES = ('h1', 'h2', 'h3', 'h4', 'h5', 'h6')


def _agrupa_varias(node):
    """¿El nodo contiene más de una tarjeta (titulares que enlazan a dos
    sitios distintos, o dos <article>)? Entonces su fecha puede ser de otra
    noticia. El enlace puede ir dentro del titular (<h2><a>) o envolverlo
    (<a><h2>). Un antetítulo sin enlace no cuenta como otra tarjeta."""
    # Un solo recorrido, que corta en la segunda: en un listado grande se
    # sabe en las dos primeras tarjetas.
    articulos = 0
    enlaces = set()
    for d in getattr(node, 'descendants', ()):
        nombre = getattr(d, 'name', None)
        if nombre == 'article':
            articulos += 1
            if articulos > 1:
                return True
        elif nombre in _TITULARES:
            a = d.find('a', href=True) or d.find_parent('a', href=True)
            if a:
                enlaces.add(a['href'])
                if len(enlaces) > 1:
                    return True
    return False


_ATRIBUTOS_FECHA = ('data-timestamp', 'data-time', 'data-date',
                    'data-datetime', 'data-published', 'data-pubdate')


def _fecha_de_atributos(node):
    """ISO del primer atributo data-* con fecha (epoch o texto), o ''."""
    for attr in _ATRIBUTOS_FECHA:
        val = node.attrs.get(attr)
        if not val:
            continue
        val_str = str(val).strip()
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
    return ''


def _fecha_de_time(t_el):
    """(ISO, día) de un <time>. La hora puede ir en un data-* del propio
    <time> aunque el texto diga solo el día (publico.es)."""
    raw = t_el.get('datetime') or t_el.get_text(' ', strip=True)
    iso, dia = _fecha_y_dia(raw)
    return (iso, dia) if iso else (_fecha_de_atributos(t_el) or '', dia)


def _extract_item_date(tag):
    """Intenta extraer la fecha real de un titular concreto del listado.
    Sube por sus contenedores, pero no hasta uno que agrupe varias tarjetas.
    Si solo encuentra el día, lo devuelve como 'AAAA-MM-DD'."""
    dia = ''
    # <time> cercano
    node = tag
    for _ in range(3):
        if node is None or _agrupa_varias(node):
            break
        try:
            t_el = node.find('time')
            if t_el:
                iso, d = _fecha_de_time(t_el)
                if iso:
                    return iso
                dia = dia or d
        except AttributeError:
            pass
        node = getattr(node, 'parent', None)

    # data-*
    node = tag
    for _ in range(3):
        if node is None or not hasattr(node, 'attrs') or not node.attrs \
                or _agrupa_varias(node):
            break
        iso = _fecha_de_atributos(node)
        if iso:
            return iso
        node = getattr(node, 'parent', None)

    # texto relativo
    node = tag
    for _ in range(3):
        if node is None or _agrupa_varias(node):
            break
        try:
            txt = node.get_text(' ', strip=True).lower()
        except AttributeError:
            txt = ''
        delta = _delta_relativo(txt)
        if delta is not None:
            dt = datetime.now(config.TZ_MADRID) - delta
            return dt.isoformat(timespec='seconds')
        node = getattr(node, 'parent', None)

    # <article> contenedor
    node = tag
    for _ in range(5):
        if node is None:
            break
        if getattr(node, 'name', None) == 'article':
            if _agrupa_varias(node):
                break
            t_el = node.find('time')
            if t_el:
                iso, d = _fecha_de_time(t_el)
                if iso:
                    return iso
                dia = dia or d
            meta_el = node.find('meta', attrs={'itemprop': 'datePublished'})
            if meta_el and meta_el.get('content'):
                iso = _rss_date_to_iso(meta_el.get('content'))
                if iso:
                    return iso
            break
        node = getattr(node, 'parent', None)

    return dia


def _estimar_en_ventana(t_prev, t_now, r, dia=''):
    """Instante a la fracción `r` de la ventana (t_prev, t_now], contando
    desde el final. Con el día conocido (de la fuente o de la URL), la
    ventana se recorta a ese día; si el día es anterior a la ventana (p. ej.
    la primera vez que vemos una portada con piezas de ayer), las 12:00 de
    ese día: mejor el día correcto con hora aproximada que hoy con una hora
    inventada. Las cuentas van en UTC: restar horas de Madrid no ve el
    cambio de horario."""
    lo, hi = t_prev.astimezone(timezone.utc), t_now.astimezone(timezone.utc)
    try:
        d = datetime.fromisoformat(dia).date() if dia else None
    except ValueError:
        d = None
    if d is not None and d <= t_now.astimezone(config.TZ_MADRID).date():
        ini = datetime(d.year, d.month, d.day, tzinfo=config.TZ_MADRID)
        sig = d + timedelta(days=1)
        fin = datetime(sig.year, sig.month, sig.day, tzinfo=config.TZ_MADRID)
        lo, hi = max(lo, ini.astimezone(timezone.utc)), min(hi, fin.astimezone(timezone.utc))
        if lo >= hi:
            return ini.replace(hour=12)
    return (hi - (hi - lo) * r).astimezone(config.TZ_MADRID)


def asignar_fechas_estimadas(todas, historico_keys, t_prev_global, t_now,
                              ultimo_exito_por_medio):
    """Estimada para los titulares nuevos sin hora de cualquier fuente: los
    reparte por la ventana desde la pasada anterior del medio, en el orden
    de la portada o del feed, y dentro del día si se sabe."""
    por_medio = defaultdict(list)

    for n in todas:
        if n.get('fecha_pub'):
            continue
        key = (n['dominio'], n['titular'])
        if key in historico_keys:
            continue
        por_medio[n['medio']].append(n)

    total_nuevos = 0
    intervalos_por_medio = {}

    for medio, items in por_medio.items():
        dominio = items[0].get('dominio')
        t_prev_medio = None

        if dominio:
            iso_prev = ultimo_exito_por_medio.get(dominio)
            if iso_prev:
                t_prev_medio = _parse_iso_flexible(iso_prev)

        if t_prev_medio is None:
            t_prev_medio = t_prev_global

        if t_prev_medio is not None:
            intervalo = (t_now - t_prev_medio).total_seconds()
        else:
            intervalo = config.INTERVALO_DEFAULT_SEG
        intervalo = max(config.INTERVALO_MIN_SEG, min(intervalo, config.INTERVALO_MAX_SEG))
        intervalos_por_medio[medio] = intervalo
        t_prev = t_now - timedelta(seconds=intervalo)

        items.sort(key=lambda x: x.get('_pos') if x.get('_pos') is not None else 999)
        K = len(items)
        for i, n in enumerate(items):
            fecha = _estimar_en_ventana(t_prev, t_now, (i + 1) / (K + 1),
                                        n.get('dia_pub') or n.get('_dia_url'))
            n['fecha_estimada'] = fecha.isoformat(timespec='seconds')
            total_nuevos += 1

    return total_nuevos, intervalos_por_medio


def _reconstruir_fecha(raw, dia):
    """Acepta HH:MM (nuevo) o ISO completo (viejo). Devuelve ISO o ''.
    Solo el día ('AAAA-MM-DD') no es un instante: ''."""
    if not raw or _es_dia(raw):
        return ''
    if 'T' in raw and len(raw) > 10:
        return raw  # formato viejo, ya es ISO
    if ':' in raw and len(raw) <= 5:
        # HH:MM se escribe en hora de Madrid (_hhmm): offset real de esa
        # fecha (CEST o CET), no un '+02:00' fijo.
        try:
            return datetime.fromisoformat(f"{dia}T{raw}:00").replace(
                tzinfo=config.TZ_MADRID).isoformat()
        except ValueError:
            return ''
    return raw


def _es_dia(raw):
    """¿Es un `p` de solo el día ('AAAA-MM-DD')?"""
    return bool(re.match(r'^\d{4}-\d{2}-\d{2}$', str(raw or '')))


def _hhmm(iso):
    """De '2026-10-01T15:58:22+02:00' devuelve '15:58'. Vacío si no hay."""
    if not iso:
        return ''
    dt = _parse_iso_flexible(iso)
    if dt is None:
        return ''
    try:
        return dt.astimezone(config.TZ_MADRID).strftime('%H:%M')
    except Exception:
        return ''


def _dia_iso(iso_str, fallback):
    """Extrae 'YYYY-MM-DD' en zona Madrid, o `fallback` si no se puede."""
    dt = _parse_iso_flexible(iso_str)
    if dt is None:
        return fallback
    dt = dt.astimezone(config.TZ_MADRID)
    return dt.strftime('%Y-%m-%d')


def _hora_repetida(iso):
    """La hora local se repite al volver al horario de invierno (02:00–02:59
    del último domingo de octubre): en HH:MM no se sabe cuál de las dos es."""
    dt = _parse_iso_flexible(iso)
    if dt is None:
        return False
    local = dt.astimezone(config.TZ_MADRID)
    return local.replace(fold=1 - local.fold).utcoffset() != local.utcoffset()


def _fecha_corta(iso, dia):
    """Portada (dia None): ISO completo. Diario: HH:MM si es de ese día,
    ISO completo si no o si es una hora repetida por el cambio de horario.
    Solo el día se queda como está: en HH:MM sería un 00:00 inventado."""
    if _es_dia(iso):
        return iso
    if not iso or dia is None or iso[:10] != dia or _hora_repetida(iso):
        return iso or ''
    return _hhmm(iso)
