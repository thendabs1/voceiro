"""Agenda del calendario oficial: GP y sesiones MotoGP, sin emisiones o resultados."""

import json
from urllib.parse import urlencode

from . import deporte, recogida


BASE = 'https://api.pulselive.motogp.com/motogp/v1/events'


def estado(valor):
    if valor in ('CANCELLED', 'CANCELED'):
        return 'cancelado'
    if valor in ('POSTPONED', 'DELAYED'):
        return 'aplazado'
    return 'programado' if valor in ('NOT-STARTED', 'LIVE', 'STARTED', 'FINISHED') else 'desconocido'


def importar(anterior, pagina, observado, url=None, temporada=None):
    eventos = pagina if isinstance(pagina, list) else [pagina]
    if len(eventos) > 200 or any(not isinstance(e, dict) or not e.get('kind') for e in eventos):
        raise ValueError('Calendario MotoGP inválido')
    a = deporte.Agenda(anterior, 'motogp', 'MotoGP', 'https://www.motogp.com/en/calendar',
                       'motociclismo', observado, bool(url))
    campeonato = a.grupo('campeonato', 'motogp', 'competicion', 'MotoGP', codigo='motogp')
    for e in deporte.unicos(eventos, 'id'):
        if e['kind'] != 'GP':
            continue
        datos_temporada = e.get('season') or {}
        year = deporte.temporada(datos_temporada.get('year'))
        if temporada is not None and year != str(temporada):
            raise ValueError('Temporada MotoGP distinta de la solicitada')
        zona = deporte.zona_iana(e.get('time_zone'))
        # La respuesta declara horas locales con offset y una zona para el GP.
        deporte.intervalo(e.get('date_start'), e.get('date_end'), zona=zona)
        edicion = a.grupo('season_id', datos_temporada.get('id'), 'edicion', year,
                         padre=campeonato, relacion='es_edicion_de')
        grupo = a.grupo('grand_prix_id', e['id'], 'gran_premio', e.get('name'), padre=edicion)
        enlace = a.url + '/' + year
        principal, _ = a.evento('grand_prix_calendar_id', e['id'], 'actividad_continua', e.get('name'),
            deporte.dias(e.get('date_start'), e.get('date_end'), zona=zona), padre=grupo,
            estado=estado(e.get('status')), sitio=e.get('circuit'), url=enlace,
            bloques={'agenda': {'rol': 'principal', 'grupo': grupo, 'criterio_dias': 'circuito'},
                'limites_proveedor': {'inicio': e.get('date_start'), 'fin': e.get('date_end'), 'zona': zona}})
        for s in deporte.unicos(deporte.filas({'broadcasts': e.get('broadcasts') or []}, 'broadcasts', 200), 'id'):
            categoria = s.get('category') or {}
            if s.get('type') != 'SESSION' or categoria.get('name') != 'MotoGP':
                continue
            tipo = deporte.literal(s.get('shortname'), 'tipo de sesión MotoGP')
            a.evento('session_id', s['id'], 'sesion', e['name'].strip() + ' — ' + deporte.literal(s.get('name')),
                deporte.intervalo(s.get('date_start'), s.get('date_end'), fin_igual_desconocido=True, zona=zona),
                padre=grupo, estado=estado(s.get('status')), sitio=e.get('circuit'), url=enlace,
                bloques={'agenda': {'rol': 'sesion', 'principal': principal, 'tipo_sesion': tipo}})
    return a.terminar()


def recoger(temporada):
    year = deporte.temporada(temporada)
    url = BASE + '?' + urlencode({'seasonYear': year})
    pagina = json.loads(recogida.descargar(url))
    if not isinstance(pagina, list):
        raise ValueError('Respuesta de temporada MotoGP sin lista de eventos')
    return pagina, url
