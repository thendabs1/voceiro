"""OCBlacktop desde servidor: calendario WRC por temporada, sin resultados."""

import json
import os

from . import deporte, recogida


BASE = 'https://api.ocblacktop.com/v1/wrc/seasons/'


def importar(anterior, pagina, observado, url=None, temporada=None):
    if not isinstance(pagina, dict) or pagina.get('sportId') != 'wrc':
        raise ValueError('Se requiere una temporada WRC de OCBlacktop')
    year = deporte.temporada(pagina.get('year'))
    if temporada is not None and str(temporada) != year:
        raise ValueError('Temporada WRC distinta de la solicitada')
    rallies = deporte.filas(pagina, 'rallies', 100)
    total = pagina.get('roundCount')
    if total is not None and (type(total) is not int or total != len(rallies)):
        raise ValueError('Temporada WRC incompleta')
    a = deporte.Agenda(anterior, 'ocblacktop-wrc', 'OCBlacktop WRC', 'https://ocblacktop.com/api/wrc',
                       'automovilismo', observado, bool(url))
    campeonato = a.grupo('campeonato', 'wrc', 'competicion', 'WRC', codigo='wrc')
    edicion = a.grupo('season_id', pagina.get('id'), 'edicion', year,
                     padre=campeonato, relacion='es_edicion_de')
    for r in deporte.unicos(rallies, 'id'):
        propia = r.get('season') or {}
        if str(propia.get('year')) != year or propia.get('id') != pagina['id']:
            raise ValueError('Rally fuera de la temporada WRC solicitada')
        estado = {'cancelled': 'cancelado', 'canceled': 'cancelado', 'postponed': 'aplazado',
            'scheduled': 'programado', 'in_progress': 'programado', 'completed': 'programado'}.get(r.get('status'), 'desconocido')
        a.evento('rally_id', r['id'], 'actividad_continua', r.get('name'),
            deporte.dias(r.get('dateStart'), r.get('dateEnd')), padre=edicion, estado=estado,
            sitio=r.get('location'), bloques={'ronda': r.get('round')})
    return a.terminar()


def recoger(temporada, clave=None):
    year = deporte.temporada(temporada)
    token = clave or os.environ.get('OCBLACKTOP_API_KEY')
    if not token:
        raise ValueError('Falta OCBLACKTOP_API_KEY en el servidor')
    url = BASE + year
    pagina = json.loads(recogida.descargar(url, cabeceras={'x-api-key': token}))
    return pagina, url
