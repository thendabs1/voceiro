"""Agenda oficial de Primera/Segunda por jornadas seleccionadas; sin marcadores."""

from datetime import date, datetime, timedelta
import json
import re
from zoneinfo import ZoneInfo

from . import deporte, recogida, tiempos


URL = 'https://www.laliga.com'
COMPETICIONES = {'primera': ('laliga-easports', 'primera-division', 'LALIGA EA SPORTS'),
                 'segunda': ('laliga-hypermotion', 'segunda-division', 'LALIGA HYPERMOTION')}
MAX_JORNADAS = 20
HEADERS = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
                         '(KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'}


def _competicion(valor):
    if valor not in COMPETICIONES:
        raise ValueError('Competición LaLiga desconocida')
    return COMPETICIONES[valor]


def _url(year, competicion, jornada):
    slug, _, _ = _competicion(competicion)
    return f'{URL}/{slug}/resultados/{year}-{str(int(year) + 1)[-2:]}/jornada-{jornada}'


def _equipo(valor):
    if not isinstance(valor, dict):
        raise ValueError('Equipo LaLiga inválido')
    nombre = deporte.literal(valor.get('nickname') or valor.get('boundname') or valor.get('name'), 'equipo LaLiga')
    identidad = valor.get('id')
    if (identidad is None or str(identidad).startswith('-') or identidad == 0
            or valor.get('slug') == 'por-determinar'
            or nombre.upper() in ('TBD', 'POR DEFINIR', 'POR DETERMINAR', 'PENDIENTE')):
        identidad = None
    else:
        identidad = deporte.literal(identidad, 'ID de equipo LaLiga')
    return {'id': identidad, 'nombre': nombre}


def _cuando(partido):
    fecha, hora = partido.get('date'), partido.get('time')
    if hora:
        if not fecha or tiempos.instante(fecha) != tiempos.instante(hora):
            raise ValueError('Fecha y horario LaLiga discrepantes')
        return deporte.intervalo(hora)
    # Un timestamp sin `time` puede ser una fecha aún pendiente de fijación.
    return deporte.dias(fecha) if isinstance(fecha, str) and len(fecha) == 10 else deporte.intervalo()


def _estado(valor):
    return {'PreMatch': 'programado', 'FullTime': 'programado', 'InPlay': 'programado',
            'HalfTime': 'programado', 'Postponed': 'aplazado', 'Cancelled': 'cancelado',
            'Canceled': 'cancelado', 'Suspended': 'aplazado'}.get(valor, 'desconocido')


def _extraer_partido(p, year, competicion):
    slug, _, _ = _competicion(competicion)
    if (p.get('subscription') or {}).get('slug') != slug + '-' + year:
        raise ValueError('Partido LaLiga fuera de la competición/temporada solicitada')
    _cuando(p)
    return {'id': deporte.literal(p.get('id'), 'partido LaLiga'),
        'home_team': _equipo(p.get('home_team')), 'away_team': _equipo(p.get('away_team')),
        'date': p.get('date'), 'time': p.get('time'), 'programacion': _estado(p.get('status')),
        'venue': {'name': (p.get('venue') or {}).get('name')},
        'slug': deporte.literal(p.get('slug'), 'enlace de partido LaLiga')}


def _jornada(dato):
    if not isinstance(dato, dict) or type(dato.get('week')) is not int or dato['week'] <= 0:
        raise ValueError('Jornada LaLiga inválida')
    return {'id': deporte.literal(dato.get('id'), 'ID de jornada LaLiga'), 'week': dato['week'],
            'name': deporte.literal(dato.get('name'), 'jornada LaLiga'), 'date': dato.get('date')}


def leer(texto, temporada, competicion, jornada=None):
    year = deporte.temporada(temporada)
    _, liga, _ = _competicion(competicion)
    m = re.search(r'<script\b[^>]*\bid=["\']__NEXT_DATA__["\'][^>]*>(.*?)</script\s*>', texto, re.S)
    if not m:
        raise ValueError('Página LaLiga sin datos de programación')
    datos = json.loads(m[1])
    p = (datos.get('props') or {}).get('pageProps') or {}
    if (datos.get('page') != '/subhome/results' or p.get('statusCode') != 200
            or p.get('competition') != liga or str(p.get('season')) != year):
        raise ValueError('Página LaLiga de otra competición/temporada o página de error')
    seleccion = _jornada(p.get('gameweek'))
    if jornada is not None and seleccion['week'] != jornada:
        raise ValueError('LaLiga devolvió otra jornada')
    jornadas = [_jornada(g) for g in deporte.filas(p, 'gameweekList', 70)]
    if len({g['id'] for g in jornadas}) != len(jornadas) or len({g['week'] for g in jornadas}) != len(jornadas):
        raise ValueError('Catálogo de jornadas LaLiga repetido')
    if not any(g['id'] == seleccion['id'] and g['week'] == seleccion['week'] for g in jornadas):
        raise ValueError('Jornada LaLiga ajena al catálogo')
    partidos = [_extraer_partido(m, year, competicion) for m in deporte.unicos(
        deporte.filas(p, 'matches', 20), 'id')]
    return {'jornada': seleccion, 'jornadas': jornadas, 'partidos': partidos}


def recoger(temporada, competicion='primera', inicio=None, fin=None):
    year = deporte.temporada(temporada)
    _competicion(competicion)
    desde = date.fromisoformat(inicio) if inicio else datetime.now(ZoneInfo('Europe/Madrid')).date()
    hasta = date.fromisoformat(fin) if fin else desde + timedelta(days=13)
    if not 0 <= (hasta - desde).days <= 90:
        raise ValueError('Ventana LaLiga inválida; máximo 91 días')
    enlace = _url(year, competicion, 1)
    primera = leer(recogida.descargar(enlace, cabeceras=HEADERS), year, competicion, 1)
    catalogo = primera['jornadas']
    seleccionadas = []
    # Las fechas de jornada solo planifican GET, nunca se asignan a partidos.
    # El margen cubre viernes/lunes habituales; no acredita todos los aplazados.
    for g in catalogo:
        if not g['date']:
            continue
        dia = date.fromisoformat(g['date'][:10])
        if desde - timedelta(days=4) <= dia <= hasta + timedelta(days=4):
            seleccionadas.append(g['week'])
    if len(seleccionadas) > MAX_JORNADAS:
        raise ValueError('La selección LaLiga supera el presupuesto de jornadas')
    paginas = []
    for jornada in seleccionadas:
        dato = primera if jornada == 1 else leer(recogida.descargar(
            _url(year, competicion, jornada), cabeceras=HEADERS), year, competicion, jornada)
        if dato['jornadas'] != catalogo:
            raise ValueError('Cambió el catálogo LaLiga durante la recogida')
        paginas.append({'jornada': dato['jornada'], 'partidos': dato['partidos']})
    salida = {'year': year, 'competicion': competicion, 'jornadas': catalogo, 'paginas': paginas,
              'seleccion': {'inicio': desde.isoformat(), 'fin': hasta.isoformat(), 'jornadas': seleccionadas}}
    validar(salida, year, competicion)
    return salida, enlace


def validar(pagina, temporada=None, competicion=None):
    if not isinstance(pagina, dict):
        raise ValueError('Agenda LaLiga inválida')
    year = deporte.temporada(temporada or pagina.get('year'))
    liga = competicion or pagina.get('competicion')
    _competicion(liga)
    if str(pagina.get('year')) != year or pagina.get('competicion') != liga:
        raise ValueError('Agenda LaLiga de otra temporada/competición')
    catalogo = [_jornada(g) for g in deporte.filas(pagina, 'jornadas', 70)]
    seleccion = pagina.get('seleccion') or {}
    solicitadas = seleccion.get('jornadas')
    paginas = deporte.filas(pagina, 'paginas', MAX_JORNADAS)
    if not isinstance(solicitadas, list) or len(set(solicitadas)) != len(solicitadas):
        raise ValueError('Selección LaLiga inválida')
    if sorted(p['jornada']['week'] for p in paginas) != sorted(solicitadas):
        raise ValueError('Agenda LaLiga sin todas las jornadas solicitadas')
    vistos = set()
    for p in paginas:
        jornada = _jornada(p.get('jornada'))
        if not any(g['id'] == jornada['id'] and g['week'] == jornada['week'] for g in catalogo):
            raise ValueError('Página LaLiga fuera del catálogo de jornadas')
        for partido in deporte.filas(p, 'partidos', 20):
            identidad = deporte.literal(partido.get('id'), 'ID partido LaLiga')
            if identidad in vistos:
                raise ValueError('Partido LaLiga repetido entre jornadas')
            vistos.add(identidad)
            _cuando(partido)
    return year, liga, paginas


def describir(pagina, url=None, competicion=None):
    year, liga, paginas = validar(pagina, competicion=competicion)
    seleccion = pagina['seleccion']
    completos = [str(p['jornada']['id']) for p in paginas if p['partidos']
        and all(_cuando(m)['inicio']['precision'] != 'desconocida' for m in p['partidos'])]
    ids = [str(p['jornada']['id']) for p in paginas]
    return {'referencia': year, 'seleccion': {'year': year, 'competicion': liga, **seleccion},
        'inicio': None, 'fin': None, 'fin_confirmado': False,
        'cobertura_completa': False, 'calendario_completo': False, 'fases_completas': False,
        'programa_completo': bool(ids) and set(ids) <= set(completos),
        'programa': {'inicio': seleccion['inicio'], 'fin': seleccion['fin'], 'ids': ids, 'completos': completos},
        'jornadas_catalogo': pagina['jornadas'], 'ventana_completa': False,
        'evidencia': {'url': url or _url(year, liga, 1), 'campos': ['season', 'competition',
            'gameweekList', 'gameweek.id', 'matches.id', 'matches.date', 'matches.time']}}


def importar(anterior, pagina, observado, url=None, temporada=None, competicion=None):
    year, liga, paginas = validar(pagina, temporada, competicion)
    slug, codigo, nombre = _competicion(liga)
    a = deporte.Agenda(anterior, 'laliga', 'LALIGA oficial', URL, 'futbol', observado, bool(url))
    campeonato = a.grupo('competition_slug', codigo, 'competicion', nombre, codigo=codigo)
    edicion = a.grupo('temporada', year, 'edicion', year + '/' + str(int(year) + 1),
                     contexto={'competition': codigo}, padre=campeonato, relacion='es_edicion_de')
    for p in paginas:
        g = p['jornada']
        fase = a.grupo('gameweek_id', g['id'], 'fase', g['name'],
            contexto={'competition': codigo, 'year': year}, padre=edicion)
        for m in p['partidos']:
            equipos = [{**m[campo], 'papel': papel} for campo, papel in
                       (('home_team', 'local'), ('away_team', 'visitante'))]
            a.evento('match_id', m['id'], 'encuentro', ' — '.join(e['nombre'] for e in equipos),
                _cuando(m), padre=fase, estado=m['programacion'], sitio=m.get('venue'),
                url=URL + '/partido/' + m['slug'], equipos=equipos,
                bloques={'temporada_declarada': year,
                    'limites_proveedor': {'date': m.get('date'), 'time': m.get('time')}})
    return a.terminar()
