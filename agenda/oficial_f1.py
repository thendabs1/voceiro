"""Agenda oficial F1: listado anual y programa acotado de grandes premios."""

from datetime import date, datetime, timedelta
from functools import lru_cache
import json
import re
from urllib.parse import urlencode, urlsplit
from zoneinfo import ZoneInfo

from . import deporte, recogida


URL = 'https://www.formula1.com'
BASE = 'https://api.formula1.com/v1/editorial-eventlisting/events'
CAMPO_CLAVE_PUBLICA = 'NEXT_PUBLIC_GLOBAL_EVENTTRACKER_APIKEY'
GET_HEADERS = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
                           '(KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'}
CAMPOS_GP = ('meetingKey', 'meetingName', 'meetingOfficialName', 'meetingStartDate',
    'meetingEndDate', 'meetingTimezone', 'gmtOffset', 'circuitKey', 'circuitOfficialName',
    'circuitLocation', 'meetingCountryName', 'url', 'roundText', 'isTestEvent', 'type', 'status')
CAMPOS_SESION = ('meetingSessionKey', 'shortName', 'description', 'startTime', 'endTime',
                 'gmtOffset', 'timezone', 'state')
# Alias publicado por IANA (tzdb/backward), presente en el GP de Austin.
ALIASES_IANA = {'US/Central': 'America/Chicago'}


def _zona(valor):
    return deporte.zona_iana(ALIASES_IANA.get(valor, valor))


def _flight(texto):
    """Lee los arrays JSON publicados por Next; nunca evalúa JavaScript."""
    partes = []
    decoder = json.JSONDecoder()
    for m in re.finditer(r'self\.__next_f\.push\(', texto):
        try:
            dato, _ = decoder.raw_decode(texto[m.end():])
        except ValueError:
            raise ValueError('Estado JSON F1 inválido') from None
        if isinstance(dato, list) and len(dato) == 2 and dato[0] == 1 and isinstance(dato[1], str):
            partes.append(dato[1])
    if not partes:
        raise ValueError('La página F1 no contiene su estado JSON')
    return ''.join(partes)


@lru_cache(maxsize=2)
def _clave_publica(year):
    # Configuración pública de la web; no es una clave privada de cuenta.
    texto = _flight(recogida.descargar(URL + '/en/racing/' + year, cabeceras=GET_HEADERS))
    m = re.search('"' + CAMPO_CLAVE_PUBLICA + '":"([^"\\\\]+)"', texto)
    if not m:
        raise ValueError('La web F1 no declara su configuración pública de calendario')
    return m[1]


def _caminar(dato):
    if isinstance(dato, dict):
        yield dato
        for valor in dato.values():
            yield from _caminar(valor)
    elif isinstance(dato, list):
        for valor in dato:
            yield from _caminar(valor)


def leer_programa(texto, identidad, temporada):
    encontrados = []
    for linea in _flight(texto).splitlines():
        m = re.match(r'[a-f0-9]+:(.*)', linea)
        if not m:
            continue
        try:
            dato = json.loads(m[1])
        except ValueError:
            continue  # Referencias y módulos de Next no son objetos de agenda.
        for candidato in _caminar(dato):
            if 'meetingSessions' in candidato and str(candidato.get('meetingKey')) == str(identidad):
                if str(candidato.get('season')) != str(temporada):
                    raise ValueError('Programa F1 de otra temporada')
                encontrados.append([{k: s.get(k) for k in CAMPOS_SESION}
                    for s in deporte.filas(candidato, 'meetingSessions', 20)])
    if not encontrados or any(dato != encontrados[0] for dato in encontrados[1:]):
        raise ValueError('Programa F1 ausente o contradictorio para el GP solicitado')
    return encontrados[0]


def _estado(valor):
    if valor in ('cancelled', 'canceled'):
        return 'cancelado'
    if valor in ('postponed', 'delayed'):
        return 'aplazado'
    return 'programado' if valor in ('upcoming', 'current', 'live', 'completed', 'past') else 'desconocido'


def _enlace(gp, year):
    ruta = urlsplit(gp.get('url') or '')
    if ruta.scheme or ruta.netloc or not ruta.path.startswith('/en/racing/' + year + '/'):
        raise ValueError('Enlace oficial F1 fuera de la temporada')
    return URL + ruta.path


def _dias(gp):
    zona = _zona(gp.get('meetingTimezone'))
    if not zona:
        return deporte.dias()
    limites = []
    for campo in ('meetingStartDate', 'meetingEndDate'):
        valor = gp.get(campo)
        if not valor:
            limites.append(None)
            continue
        dt = datetime.fromisoformat(valor)
        # El listado publica límites locales del GP y una zona nominal.
        limites.append(dt.astimezone(ZoneInfo(zona)).date().isoformat() if dt.tzinfo else dt.date().isoformat())
    return deporte.dias(*limites)


def _sesion(s, zona):
    zona = _zona(s.get('timezone') or zona)
    limites = []
    for campo in ('startTime', 'endTime'):
        valor = s.get(campo)
        if valor and not datetime.fromisoformat(valor).tzinfo:
            offset = s.get('gmtOffset')
            if not isinstance(offset, str) or not re.fullmatch(r'[+-]\d{2}:\d{2}', offset):
                raise ValueError('Sesión F1 sin offset acreditado')
            valor += offset
        limites.append(valor)
    return deporte.intervalo(*limites, fin_igual_desconocido=True, zona=zona)


def validar(pagina, temporada=None):
    if not isinstance(pagina, dict):
        raise ValueError('Listado F1 inválido')
    year = deporte.temporada(temporada or pagina.get('year'))
    if str(pagina.get('year')) != year or str(pagina.get('seasonFromEventListing')) != year:
        raise ValueError('Listado F1 de otra temporada')
    eventos = deporte.filas(pagina, 'events', 100)
    salida = []
    for gp in deporte.unicos(eventos, 'meetingKey'):
        if gp.get('isTestEvent') is True or gp.get('type') == 'fom-testing':
            continue
        if gp.get('isTestEvent') is not False or gp.get('type') != 'race':
            raise ValueError('Clase de evento F1 fuera del contrato de GP')
        _enlace(gp, year)
        _dias(gp)
        salida.append(gp)
    programas = pagina.get('programas', {})
    if not isinstance(programas, dict) or programas.keys() - {str(g['meetingKey']) for g in salida}:
        raise ValueError('Programa F1 ajeno al calendario')
    for gp in salida:
        filas = deporte.filas({'sesiones': programas.get(str(gp['meetingKey']), [])}, 'sesiones', 20)
        for s in deporte.unicos(filas, 'meetingSessionKey'):
            deporte.literal(s.get('shortName'), 'tipo de sesión F1')
            _sesion(s, gp.get('meetingTimezone'))
    return year, salida


def recoger(temporada, inicio=None, fin=None):
    year = deporte.temporada(temporada)
    desde = date.fromisoformat(inicio) if inicio else datetime.now(ZoneInfo('Europe/Madrid')).date()
    hasta = date.fromisoformat(fin) if fin else desde + timedelta(days=13)
    if not 0 <= (hasta - desde).days <= 90:
        raise ValueError('Ventana de programas F1 inválida; máximo 91 días')
    enlace = BASE + '?' + urlencode({'year': year})
    pagina = json.loads(recogida.descargar(enlace,
        cabeceras={**GET_HEADERS, 'apikey': _clave_publica(year)}))
    _, eventos = validar(pagina, year)
    # La selección de evidencia ocurre antes de devolver datos al almacén.
    salida = {k: pagina.get(k) for k in ('year', 'seasonFromEventListing', 'seasonState',
        'previousSeason', 'nextSeason', 'firstSeason', 'lastSeason')}
    salida['events'] = [{k: g.get(k) for k in CAMPOS_GP} for g in eventos]
    salida['programas'], seleccionados = {}, []
    for gp in eventos:
        c = _dias(gp)
        a, b = c['inicio']['fecha'], c['fin']['fecha']
        if a and b and a <= hasta.isoformat() and b >= desde.isoformat():
            identidad = str(gp['meetingKey'])
            seleccionados.append(identidad)
            html = recogida.descargar(_enlace(gp, year), cabeceras=GET_HEADERS)
            salida['programas'][identidad] = leer_programa(html, identidad, year)
    salida['seleccion_programa'] = {'inicio': desde.isoformat(), 'fin': hasta.isoformat(), 'ids': seleccionados}
    validar(salida, year)
    return salida, enlace


def describir(pagina, url=None):
    year, eventos = validar(pagina)
    dias = [_dias(g) for g in eventos]
    intervalos = all(c['inicio']['fecha'] and c['fin']['fecha'] for c in dias)
    seleccion = pagina.get('seleccion_programa') or {'ids': []}
    programas = pagina.get('programas') or {}
    completos = [str(g['meetingKey']) for g in eventos if programas.get(str(g['meetingKey']))
        and all(_sesion(s, g.get('meetingTimezone'))['inicio']['instante']
                for s in programas[str(g['meetingKey'])])]
    seleccionados = seleccion.get('ids', [])
    return {'referencia': year, 'seleccion': {'year': year},
        'inicio': min((c['inicio']['fecha'] for c in dias if c['inicio']['fecha']), default=None),
        'fin': max((c['fin']['fecha'] for c in dias if c['fin']['fecha']), default=None),
        'evidencia': {'url': url or BASE, 'campos': ['seasonFromEventListing', 'events.meetingKey',
            'events.meetingStartDate', 'events.meetingEndDate', 'events.meetingTimezone']},
        'fin_confirmado': bool(eventos) and intervalos, 'cobertura_completa': bool(eventos),
        'calendario_completo': bool(eventos), 'fases_completas': bool(eventos),
        'programa_completo': bool(seleccionados) and set(seleccionados) <= set(completos),
        'programa': {**seleccion, 'completos': completos},
        'ids': [str(g['meetingKey']) for g in eventos],
        'siguiente_temporada': str(pagina['nextSeason']) if pagina.get('nextSeason') else None}


def importar(anterior, pagina, observado, url=None, temporada=None):
    year, eventos = validar(pagina, temporada)
    a = deporte.Agenda(anterior, 'formula1', 'Formula 1 oficial', URL + '/en/racing',
                       'automovilismo', observado, bool(url))
    campeonato = a.grupo('campeonato', 'f1', 'competicion', 'Formula 1', codigo='f1')
    edicion = a.grupo('temporada', year, 'edicion', year, padre=campeonato, relacion='es_edicion_de')
    for gp in eventos:
        identidad = str(gp['meetingKey'])
        nombre = gp.get('meetingName') or gp.get('meetingOfficialName')
        grupo = a.grupo('meeting_key', identidad, 'gran_premio', nombre, padre=edicion)
        enlace = _enlace(gp, year)
        sitio = {'id': gp.get('circuitKey'), 'name': gp.get('circuitOfficialName'),
                 'city': gp.get('circuitLocation'), 'country': gp.get('meetingCountryName')}
        principal, _ = a.evento('meeting_calendar_key', identidad, 'actividad_continua', nombre,
            _dias(gp), padre=grupo, estado=_estado(gp.get('status')), sitio=sitio, url=enlace,
            bloques={'agenda': {'rol': 'principal', 'grupo': grupo, 'criterio_dias': 'circuito'},
                'temporada_declarada': year})
        for s in (pagina.get('programas') or {}).get(identidad, []):
            a.evento('meeting_session_key', str(s['meetingSessionKey']), 'sesion',
                nombre + ' — ' + s['shortName'], _sesion(s, gp.get('meetingTimezone')),
                padre=grupo, estado=_estado(s.get('state')), sitio=sitio, url=enlace,
                bloques={'agenda': {'rol': 'sesion', 'principal': principal, 'tipo_sesion': s['shortName']}})
    return a.terminar()
