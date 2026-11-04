"""Citas terminadas: busca enlaces de resultados en su ficha, con cupo diario.

La ventana de recogida empieza hoy y los resultados se publican después de la
cita. Esta cola relee las fichas de los últimos días sin pasar por el inventario:
solo añade documentos con `rol=resultados`, nunca fechas, estados ni ausencias.
Se relee antes lo que no tiene resultados y lleva más tiempo sin comprobar; quien
ya los tiene sigue en cola porque un enlace previo a la cita puede no serlo.
"""

from datetime import timedelta
from urllib.error import HTTPError

from . import atletismo_fca, atletismo_rfea

DIAS = 30
CUPOS = {'fca': 12, 'fga': 8, 'rfea': 4}  # Citas por pasada. RFEA son dos peticiones por cita.


def _fca(c, obtener):
    return atletismo_fca.leer_ficha(obtener(c['url']), c['id'], c['url'])


def _fga(c, obtener):
    from . import atletismo_fga
    ficha = atletismo_fga.leer_ficha(obtener(c['url']), url=c['url'])
    if ficha['id'] != c['id']:
        raise ValueError('FGA: la ficha no corresponde a la cita guardada')
    return ficha['metadatos']['documentos']


def _rfea(c, obtener):
    ficha = atletismo_rfea.leer_ficha(obtener(c['url']), url=c['url'])
    if ficha['id'] != c['id']:
        raise ValueError('RFEA: la ficha no corresponde a la cita guardada')
    documentos, sfid = list(ficha['metadatos']['documentos']), ficha['metadatos']['sfid']
    if len(sfid) == 1:
        url = 'https://atletismorfea.es/ajax/championship-documents/' + sfid[0]
        documentos.extend(atletismo_rfea.leer_documentos(obtener(url), url=url))
    return documentos


LECTORES = {'fca': _fca, 'fga': _fga, 'rfea': _rfea}


def _resultados(documentos):
    return [d for d in documentos if d.get('rol') == 'resultados']


def cola(conocidas, comprobadas, excluidas, hoy):
    limite = (hoy - timedelta(days=DIAS)).isoformat()
    citas = [c for c in conocidas if limite <= c['fin'] < hoy.isoformat() and c['id'] not in excluidas
             and c.get('url') and not c.get('lectura_ambigua') and c['estado'] not in ('cancelado', 'aplazado')]
    return sorted(citas, key=lambda c: (bool(_resultados(c['metadatos'].get('documentos', []))),
                                        comprobadas.get(c['id'], ''), c['inicio'], c['id']))


def leer(fuente, conocidas, comprobadas, excluidas, hoy, obtener, ahora):
    """Un fallo conserva lo guardado; un 403/429 o el presupuesto cortan la cola."""
    citas = cola(conocidas, comprobadas, excluidas, hoy)
    vivas = {c['id'] for c in citas}
    informe = {'candidatas': len(citas), 'leidas': 0, 'fallidas': [], 'hallados': {},
               'comprobadas': {i: f for i, f in comprobadas.items() if i in vivas}}
    for c in citas[:CUPOS[fuente]]:
        try:
            documentos = LECTORES[fuente](c, obtener)
            informe['leidas'] += 1
        except HTTPError as error:
            informe['fallidas'].append({'id': c['id'], 'motivo': f'HTTP {error.code}'})
            if error.code in (403, 429):
                break
            documentos = []
        except (OSError, ValueError) as error:
            informe['fallidas'].append({'id': c['id'], 'motivo': f'{type(error).__name__}: {error}'[:200]})
            if 'presupuesto' in str(error):
                break
            documentos = []
        informe['comprobadas'][c['id']] = ahora
        if nuevos := _resultados(documentos):
            informe['hallados'][c['referencia']] = nuevos
    return informe
