"""Agenda oficial de F2 y F3: rondas de la web de cada categoría y su programa.

Las dos webs son de la misma plataforma que formula1.com. Su API no admite la
clave pública que publican; el estado Next de cada ronda sí trae el GP y sus
sesiones con la forma de F1. La página de calendario solo enlaza las rondas.
"""

from datetime import date, datetime
import re

from . import deporte, recogida
from .oficial_f1 import CAMPOS_SESION, GET_HEADERS, _dias, _estado, _sesion, objetos


# Proveedor → (código de competición, nombre, web).
CATEGORIAS = {'formula2': ('f2', 'Formula 2', 'https://www.fiaformula2.com'),
              'formula3': ('f3', 'Formula 3', 'https://www.fiaformula3.com')}
CAMPOS_GP = ('meetingKey', 'meetingName', 'meetingOfficialName', 'meetingStartDate',
    'meetingEndDate', 'meetingTimezone', 'circuitKey', 'circuitOfficialName',
    'circuitLocation', 'meetingCountryName', 'url', 'isTestEvent', 'season')
CAMPOS_SESION_FIA = CAMPOS_SESION + ('sessionStatus',)
MAX_RONDAS = 30


def _ruta(year):
    return '/en/racing/' + year + '/'


def leer_calendario(html, year):
    """Rondas enlazadas y números de ronda que acredita su estado JSON."""
    rutas = sorted(set(re.findall(r'href="(' + re.escape(_ruta(year)) + r'[a-z0-9-]+)"', html)))
    if not rutas or len(rutas) > MAX_RONDAS:
        raise ValueError('Calendario sin rondas de la temporada')
    # El estado JSON solo trae algunas rondas (las últimas), con su número.
    numeros = {}
    for o in objetos(html):
        m = re.fullmatch(r'ROUND (\d{1,2})', str(o.get('roundText') or ''))
        if m and o.get('meetingKey') and o.get('url') in rutas:
            numeros[str(o['meetingKey'])] = int(m[1])
    return rutas, numeros


def leer_ronda(html, ruta, year):
    encontrados = []
    for o in objetos(html):
        if 'meetingSessions' in o and o.get('url') == ruta:
            if str(o.get('season')) != year:
                raise ValueError('Ronda de otra temporada')
            gp = {k: o.get(k) for k in CAMPOS_GP}
            gp['sesiones'] = [{k: s.get(k) for k in CAMPOS_SESION_FIA}
                              for s in deporte.filas(o, 'meetingSessions', 20)]
            encontrados.append(gp)
    if not encontrados or any(g != encontrados[0] for g in encontrados[1:]):
        raise ValueError('Ronda ausente o contradictoria en su página')
    return encontrados[0]


def _sesion_fia(s, zona):
    # «TBC» publica horas de relleno (00:00-01:00, en punto): solo vale el día.
    if s.get('sessionStatus') == 'TBC':
        inicio = s.get('startTime')
        if not isinstance(inicio, str):
            raise ValueError('Sesión TBC sin día')
        return deporte.intervalo(date.fromisoformat(inicio[:10]).isoformat())
    # Un fin anterior al inicio es una errata del día (F3 2026, sprint de
    # Spielberg): el inicio sigue acreditado y el fin queda desconocido.
    if s.get('startTime') and s.get('endTime'):
        a, b = datetime.fromisoformat(s['startTime']), datetime.fromisoformat(s['endTime'])
        if (a.tzinfo is None) == (b.tzinfo is None) and b < a:
            s = {**s, 'endTime': None}
    return _sesion(s, zona)


def _enlace(web, gp, year):
    ruta = gp.get('url') or ''
    if not re.fullmatch(re.escape(_ruta(year)) + r'[a-z0-9-]+', ruta):
        raise ValueError('Enlace oficial de ronda fuera de la temporada')
    return web + ruta


def validar(pagina, temporada=None, proveedor='formula2'):
    _, nombre, web = CATEGORIAS[proveedor]
    if not isinstance(pagina, dict) or pagina.get('categoria') != proveedor:
        raise ValueError('Calendario ' + nombre + ' inválido')
    year = deporte.temporada(temporada or pagina.get('year'))
    if str(pagina.get('year')) != year:
        raise ValueError('Calendario ' + nombre + ' de otra temporada')
    salida = []
    for gp in deporte.unicos(deporte.filas(pagina, 'events', MAX_RONDAS), 'meetingKey'):
        if gp.get('isTestEvent') is True:
            continue
        if gp.get('isTestEvent') is not False or str(gp.get('season')) != year:
            raise ValueError('Ronda ' + nombre + ' fuera del contrato de GP')
        _enlace(web, gp, year)
        _dias(gp)
        for s in deporte.unicos(deporte.filas(gp, 'sesiones', 20), 'meetingSessionKey'):
            deporte.literal(s.get('shortName'), 'tipo de sesión ' + nombre)
            _sesion_fia(s, gp.get('meetingTimezone'))
        salida.append(gp)
    numeros = pagina.get('numeros', {})
    if not isinstance(numeros, dict) or numeros.keys() - {str(g['meetingKey']) for g in salida}:
        raise ValueError('Ronda numerada ausente del calendario ' + nombre)
    return year, salida


def recoger(temporada, proveedor='formula2'):
    _, _, web = CATEGORIAS[proveedor]
    year = deporte.temporada(temporada)
    enlace = web + '/en/racing/' + year
    rutas, numeros = leer_calendario(recogida.descargar(enlace, cabeceras=GET_HEADERS), year)
    # Todas las rondas en cada pasada: las fechas ISO solo están en su página.
    eventos = [leer_ronda(recogida.descargar(web + r, cabeceras=GET_HEADERS), r, year) for r in rutas]
    salida = {'categoria': proveedor, 'year': year, 'numeros': numeros, 'events': eventos}
    validar(salida, year, proveedor)
    return salida, enlace


def describir(pagina, url=None, proveedor='formula2'):
    year, eventos = validar(pagina, proveedor=proveedor)
    dias = [_dias(g) for g in eventos]
    fechas = bool(eventos) and all(c['inicio']['fecha'] and c['fin']['fecha'] for c in dias)
    # Sin total publicado, la última ronda numerada acredita que no falta ninguna.
    completo = fechas and max(pagina['numeros'].values(), default=0) == len(eventos)
    programa = completo and all(g['sesiones'] and all(s.get('sessionStatus') != 'TBC' for s in g['sesiones'])
                                for g in eventos)
    return {'referencia': year, 'seleccion': {'year': year},
        'inicio': min((c['inicio']['fecha'] for c in dias if c['inicio']['fecha']), default=None),
        'fin': max((c['fin']['fecha'] for c in dias if c['fin']['fecha']), default=None),
        'evidencia': {'url': url or CATEGORIAS[proveedor][2], 'campos': ['events.meetingKey',
            'events.meetingStartDate', 'events.meetingEndDate', 'events.meetingTimezone', 'numeros']},
        'fin_confirmado': completo, 'cobertura_completa': bool(eventos),
        'calendario_completo': completo, 'fases_completas': bool(eventos),
        'programa_completo': programa, 'ids': [str(g['meetingKey']) for g in eventos]}


def importar(anterior, pagina, observado, url=None, temporada=None, proveedor='formula2'):
    codigo, nombre, web = CATEGORIAS[proveedor]
    year, eventos = validar(pagina, temporada, proveedor)
    a = deporte.Agenda(anterior, proveedor, nombre + ' oficial', web + '/en/racing',
                       'automovilismo', observado, bool(url))
    campeonato = a.grupo('campeonato', codigo, 'competicion', nombre, codigo=codigo)
    edicion = a.grupo('temporada', year, 'edicion', year, padre=campeonato, relacion='es_edicion_de')
    for gp in eventos:
        identidad = str(gp['meetingKey'])
        titulo = gp.get('meetingName') or gp.get('meetingOfficialName')
        grupo = a.grupo('meeting_key', identidad, 'gran_premio', titulo, padre=edicion)
        enlace = _enlace(web, gp, year)
        sitio = {'id': gp.get('circuitKey'), 'name': gp.get('circuitOfficialName'),
                 'city': gp.get('circuitLocation'), 'country': gp.get('meetingCountryName')}
        estados = {_estado(s.get('state')) for s in gp['sesiones']}
        principal, _ = a.evento('meeting_calendar_key', identidad, 'actividad_continua', titulo,
            _dias(gp), padre=grupo, estado='cancelado' if estados == {'cancelado'} else 'programado',
            sitio=sitio, url=enlace, bloques={'agenda': {'rol': 'principal', 'grupo': grupo,
                'criterio_dias': 'circuito'}, 'temporada_declarada': year})
        for s in gp['sesiones']:
            a.evento('meeting_session_key', str(s['meetingSessionKey']), 'sesion',
                titulo + ' — ' + s['shortName'], _sesion_fia(s, gp.get('meetingTimezone')),
                padre=grupo, estado=_estado(s.get('state')), sitio=sitio, url=enlace,
                bloques={'agenda': {'rol': 'sesion', 'principal': principal, 'tipo_sesion': s['shortName']}})
    return a.terminar()
