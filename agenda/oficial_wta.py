"""Calendario anual oficial WTA: torneos, sin cuadros, jugadoras o resultados."""

from datetime import date
import json
from urllib.parse import urlencode

from . import deporte, nucleo, recogida


BASE = 'https://api.wtatennis.com/tennis/tournaments/'
URL = 'https://www.wtatennis.com/tournaments'
MAX_PAGINAS = 10
TAMANO_PAGINA = 100
CAMPOS = ('year', 'title', 'startDate', 'endDate', 'city', 'country', 'level', 'status')


def _extraer(fila, year):
    if not isinstance(fila, dict) or str(fila.get('year')) != year:
        raise ValueError('Torneo WTA fuera de la temporada solicitada')
    grupo = fila.get('tournamentGroup') or {}
    identidad = deporte.literal(grupo.get('id'), 'ID oficial de torneo WTA')
    nombre = deporte.literal(fila.get('title') or grupo.get('name'), 'nombre WTA')
    inicio = date.fromisoformat(fila['startDate']).isoformat() if fila.get('startDate') else None
    fin = date.fromisoformat(fila['endDate']).isoformat() if fila.get('endDate') else None
    deporte.dias(inicio, fin)
    if str(fila.get('level', '')).upper() == 'ITF':
        raise ValueError('La selección WTA excluye ITF')
    return {**{k: fila.get(k) for k in CAMPOS}, 'title': nombre,
            'tournamentGroup': {'id': identidad, 'name': grupo.get('name')},
            'startDate': inicio, 'endDate': fin}


def validar(pagina, temporada=None):
    if not isinstance(pagina, dict):
        raise ValueError('Calendario WTA inválido')
    year = deporte.temporada(temporada or pagina.get('year'))
    if str(pagina.get('year')) != year:
        raise ValueError('Temporada WTA distinta de la solicitada')
    filas = deporte.filas(pagina, 'content', MAX_PAGINAS * TAMANO_PAGINA)
    total = (pagina.get('pageInfo') or {}).get('numEntries')
    if type(total) is not int or total != len(filas):
        raise ValueError('Calendario anual WTA incompleto')
    salida, vistos = [], set()
    for fila in filas:
        dato = _extraer(fila, year)
        identidad = dato['tournamentGroup']['id']
        if identidad in vistos:
            raise ValueError('Torneo WTA repetido en la temporada')
        vistos.add(identidad)
        salida.append(dato)
    return year, salida


def recoger(temporada):
    year = deporte.temporada(temporada)
    filas, visto, total = [], set(), None
    # `year` no filtra esta API. El calendario oficial usa `from` y `to`.
    for pagina in range(MAX_PAGINAS):
        url = BASE + '?' + urlencode({'page': pagina, 'pageSize': TAMANO_PAGINA,
            'from': year + '-01-01', 'to': year + '-12-31', 'excludeLevels': 'ITF'})
        dato = json.loads(recogida.descargar(url))
        info = dato.get('pageInfo') or {}
        cuenta = info.get('numEntries')
        if (info.get('page') != pagina or type(cuenta) is not int or cuenta < 0
                or cuenta > MAX_PAGINAS * TAMANO_PAGINA or total is not None and cuenta != total):
            raise ValueError('Paginación WTA incompleta o cambiante')
        total = cuenta
        contenido = deporte.filas(dato, 'content', TAMANO_PAGINA)
        for fila in contenido:
            extraida = _extraer(fila, year)
            identidad = extraida['tournamentGroup']['id']
            if identidad in visto:
                raise ValueError('Torneo WTA repetido entre páginas')
            visto.add(identidad)
            filas.append(extraida)
        if len(filas) == total:
            resultado = {'year': year, 'pageInfo': {'numEntries': total}, 'content': filas}
            validar(resultado, year)
            return resultado, BASE
        if not contenido or len(filas) > total:
            raise ValueError('Calendario WTA truncado')
    raise ValueError('El calendario WTA supera el máximo de páginas')


def describir(pagina, url=None):
    year, torneos = validar(pagina)
    completos = bool(torneos) and all(t['startDate'] and t['endDate'] for t in torneos)
    return {'referencia': year, 'seleccion': {'year': year, 'excludeLevels': ['ITF']},
        'inicio': min((t['startDate'] for t in torneos if t['startDate']), default=None),
        'fin': max((t['endDate'] for t in torneos if t['endDate']), default=None),
        'evidencia': {'url': url or BASE, 'campos': ['pageInfo.numEntries', 'content.year',
            'content.tournamentGroup.id', 'content.startDate', 'content.endDate']},
        'fin_confirmado': completos, 'cobertura_completa': bool(torneos),
        'fases_completas': bool(torneos), 'programa_completo': completos}


def importar(anterior, pagina, observado, url=None, temporada=None):
    year, torneos = validar(pagina, temporada)
    a = deporte.Agenda(anterior, 'wta', 'WTA oficial', URL, 'tenis', observado, bool(url))
    circuito = a.grupo('circuito', 'wta', 'circuito', 'WTA', codigo='wta',
                      identidad=nucleo.identificador('circuito-tenis', 'wta'))
    for t in torneos:
        identidad = t['tournamentGroup']['id']
        enlace = f'https://www.wtatennis.com/tournaments/{identidad}/{year}/overview'
        edicion = a.grupo('tournament_edition', year, 'edicion', t['title'],
            contexto={'tournament_group_id': identidad}, padre=circuito)
        estado = {'upcoming': 'programado', 'current': 'programado', 'past': 'programado',
            'cancelled': 'cancelado', 'canceled': 'cancelado', 'postponed': 'aplazado'}.get(t.get('status'), 'desconocido')
        a.evento('tournament_calendar', identidad + '/' + year, 'actividad_continua', t['title'],
            deporte.dias(t['startDate'], t['endDate']), padre=edicion, estado=estado,
            sitio={'name': t.get('city'), 'country': t.get('country')}, url=enlace,
            bloques={'temporada_declarada': year, 'nivel': t.get('level')})
    return a.terminar()
