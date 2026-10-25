"""Recogidas explícitas y acotadas; no programa ni publica datos."""

import json
from datetime import date, timedelta
from urllib.parse import urlencode
from urllib.request import Request, urlopen


MAX_BYTES = 4_000_000


def descargar(url):
    req = Request(url, headers={'User-Agent': 'Voceiro/1.0 (+https://voceiro.eu)'})
    with urlopen(req, timeout=25) as respuesta:
        contenido = respuesta.read(MAX_BYTES + 1)
    if len(contenido) > MAX_BYTES:
        raise ValueError('Respuesta demasiado grande; no se importa truncada')
    return contenido.decode('utf-8-sig')


def tenis(circuito):
    if circuito not in ('atp', 'wta'):
        raise ValueError('Circuito de tenis desconocido')
    url = f'https://site.api.espn.com/apis/site/v2/sports/tennis/{circuito}/scoreboard'
    pagina = json.loads(descargar(url))
    if not isinstance(pagina.get('events'), list) or not pagina.get('leagues'):
        raise ValueError('Respuesta de tenis sin eventos o circuito')
    return pagina, url


def feb(temporada, competicion='4'):
    from .feb_html import COMPETICIONES, catalogo, leer
    if not str(temporada).isdigit() or len(str(temporada)) != 4:
        raise ValueError('La temporada FEB necesita su año inicial explícito')
    if competicion not in COMPETICIONES:
        raise ValueError('Competición FEB aún no contrastada')
    base = 'https://baloncestoenvivo.feb.es'
    calendario_url = f'{base}/calendario/{competicion}/{temporada}'
    resultados_url = f'{base}/resultados/{competicion}/{temporada}'
    calendario = descargar(calendario_url)
    resultados = descargar(resultados_url)
    muestra = leer(calendario, resultados, str(temporada), calendario_url, resultados_url, competicion)
    muestra['catalogo_anunciado'] = catalogo(calendario)
    return muestra


def cultura(fuente, inicio=None, fin=None):
    """Pasada completa paginada antes de importar; nunca guardar un prefijo.

    Máximo 40 páginas. Un cambio de total, repetición o página vacía obliga a
    repetir la recogida; la respuesta anterior sigue disponible en Turso/R2.
    """
    from . import madrid, kulturklik
    if fuente not in ('madrid', 'kulturklik'):
        raise ValueError('Agenda cultural desconocida')
    desde = date.fromisoformat(inicio) if inicio else date.today()
    hasta = date.fromisoformat(fin) if fin else desde + timedelta(days=30)
    if not 0 <= (hasta - desde).days <= 90:
        raise ValueError('La ventana cultural debe cubrir entre 1 y 91 días')
    base = madrid.URL if fuente == 'madrid' else kulturklik.URL + '/upcoming'
    filas, vistos, total = [], set(), None
    for pagina in range(1, 41):
        params = {'limit': 500, 'offset': len(filas), 'sort': '_id asc'} if fuente == 'madrid' else {
            '_elements': 500, '_page': pagina}
        url = base + ('&' if '?' in base else '?') + urlencode(params)
        dato = json.loads(descargar(url))
        if fuente == 'madrid':
            if dato.get('success') is not True:
                raise ValueError('CKAN Madrid devolvió un error')
            resultado = dato['result']
            items, cuenta = resultado['records'], resultado['total']
            campo = 'ID-EVENTO'
        else:
            items, cuenta = dato['items'], dato['totalItems']
            campo = 'id'
            if dato.get('currentPage') != pagina:
                raise ValueError('Página Kulturklik inesperada')
        if type(cuenta) is not int or cuenta < 0 or not isinstance(items, list):
            raise ValueError('Paginación cultural inválida')
        if total is None:
            total = cuenta
        if cuenta != total:
            raise ValueError('El total cambió durante la recogida cultural')
        for item in items:
            identidad = str(item.get(campo) or '')
            if not identidad or identidad in vistos:
                raise ValueError('Identidad repetida o ausente entre páginas culturales')
            vistos.add(identidad)
            filas.append(item)
        if len(filas) == total:
            def en_ventana(f):
                a, b = (('FECHA', 'FECHA-FIN') if fuente == 'madrid' else ('startDate', 'endDate'))
                primero, ultimo = f.get(a), f.get(b) or f.get(a)
                if not primero:
                    return True  # Fecha pendiente, sin inventarla.
                return date.fromisoformat(primero[:10]) <= hasta and date.fromisoformat(ultimo[:10]) >= desde
            seleccion = [f for f in filas if en_ventana(f)]
            print(f'[agenda] {fuente}: {len(filas)} registros comprobados; {len(seleccion)} en {desde} → {hasta}')
            return seleccion, base
        if not items or len(filas) > total:
            raise ValueError('Recogida cultural incompleta')
    raise ValueError('La agenda cultural supera el máximo de 40 páginas')
