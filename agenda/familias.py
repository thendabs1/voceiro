"""Familias de API: recorren una respuesta completa paginada; no conocen el núcleo.

Cada familia devuelve todas las filas y el inventario de identidades, o lanza:
un cambio de total, una identidad repetida o ausente, una página vacía antes
del total o más de MAX_PAGINAS nunca producen un resultado parcial. Un total
cero es un vacío acreditado por la propia API.
"""

import json
from urllib.parse import urlencode

MAX_PAGINAS = 40
FILAS = 500


def _url(base, params):
    return base + ('&' if '?' in base else '?') + urlencode(params)


def recorrer(descargar, base, campo, pagina):
    """`pagina.url(base, n, leidas)` pide la página n; `pagina.leer` devuelve (items, total)."""
    filas, vistos, total = [], set(), None
    for n in range(1, MAX_PAGINAS + 1):
        items, cuenta = pagina.leer(json.loads(descargar(pagina.url(base, n, len(filas)))), n)
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
            return filas, sorted(vistos)
        if not items or len(filas) > total:
            raise ValueError('Recogida cultural incompleta')
    raise ValueError(f'La agenda cultural supera el máximo de {MAX_PAGINAS} páginas')


class Ckan:
    """datastore_search de CKAN: limit/offset con orden estable por `_id`."""

    @staticmethod
    def url(base, n, leidas):
        return _url(base, {'limit': FILAS, 'offset': leidas, 'sort': '_id asc'})

    @staticmethod
    def leer(dato, n):
        if dato.get('success') is not True:
            raise ValueError('CKAN devolvió un error')
        return dato['result']['records'], dato['result']['total']


class Euskadi:
    """API de datos abiertos de Euskadi: _elements/_page con eco de la página."""

    @staticmethod
    def url(base, n, leidas):
        return _url(base, {'_elements': FILAS, '_page': n})

    @staticmethod
    def leer(dato, n):
        if dato.get('currentPage') != n:
            raise ValueError('Página Kulturklik inesperada')
        return dato['items'], dato['totalItems']


class Zaragoza:
    """Sede electrónica de Zaragoza: rows/start (máximo 500) con orden estable por id."""

    @staticmethod
    def url(base, n, leidas):
        return _url(base, {'rows': FILAS, 'start': leidas, 'sort': 'id asc'})

    @staticmethod
    def leer(dato, n):
        if dato.get('start') != (n - 1) * FILAS:
            raise ValueError('Página Zaragoza inesperada')
        return dato['result'], dato['totalCount']


FAMILIAS = {'ckan': Ckan, 'euskadi': Euskadi, 'zaragoza': Zaragoza}
