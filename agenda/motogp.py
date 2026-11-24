"""Agenda del calendario oficial: GP y sesiones de MotoGP, Moto2 y Moto3, sin emisiones o resultados."""

import json
import re
from urllib.parse import urlencode

from . import deporte, nucleo, recogida


BASE = 'https://api.pulselive.motogp.com/motogp/v1/events'
# Cada categoría es su propia competición, leída del mismo listado anual.
CATEGORIAS = {'motogp': 'MotoGP', 'moto2': 'Moto2', 'moto3': 'Moto3'}
# Sesiones que completan el programa de un GP (temporada 2026).
PROGRAMAS = {'motogp': {'FP1', 'PR', 'FP2', 'Q1', 'Q2', 'SPR', 'WUP', 'RAC'},
             'moto2': {'FP1', 'PR', 'FP2', 'Q1', 'Q2', 'RAC'},
             'moto3': {'FP1', 'PR', 'FP2', 'Q1', 'Q2', 'RAC'}}


def estado(valor):
    if valor in ('CANCELLED', 'CANCELED'):
        return 'cancelado'
    if valor in ('POSTPONED', 'DELAYED'):
        return 'aplazado'
    return 'programado' if valor in ('NOT-STARTED', 'LIVE', 'STARTED', 'FINISHED') else 'desconocido'


def sesiones(e, competicion):
    nombre = CATEGORIAS[competicion]
    return [s for s in e.get('broadcasts') or [] if isinstance(s, dict)
            and s.get('type') == 'SESSION' and (s.get('category') or {}).get('name') == nombre]


def carrera(tipo):
    """RAC, o RAC2, RAC3… cuando la carrera se reanuda tras una bandera roja."""
    return bool(re.fullmatch(r'RAC\d*', tipo or ''))


def _numero(tipo):
    """Orden de la carrera: RAC es la 1, RAC2 la 2…"""
    return int(tipo[3:] or 1)


def tipos_programa(e, competicion):
    """Tipos de sesión del GP; una carrera reanudada sigue siendo la carrera."""
    return {'RAC' if carrera(s.get('shortname')) else s.get('shortname') for s in sesiones(e, competicion)}


def _sesiones_previas(anterior, fuente):
    """Tipo de cada sesión guardada, por GP (clave de su agrupación), según su última lectura."""
    if not anterior:
        return {}
    refs = {i: r['id_externo'] for i, r in anterior['referencias'].items()
            if r['proveedor'] == fuente and r['tipo_externo'] == 'session_id'}
    salida = {}
    for i in nucleo.ultimas(anterior):
        o = anterior['observaciones'][i]
        if o['referencia'] in refs and (padre := o['bloques'].get('pertenencia')):
            salida.setdefault(nucleo.clave(padre), {})[refs[o['referencia']]] = (
                o['bloques'].get('agenda') or {}).get('tipo_sesion')
    return salida


def importar(anterior, pagina, observado, url=None, temporada=None, competicion='motogp'):
    eventos = pagina if isinstance(pagina, list) else [pagina]
    if len(eventos) > 200 or any(not isinstance(e, dict) or not e.get('kind') for e in eventos):
        raise ValueError('Calendario MotoGP inválido')
    nombre = CATEGORIAS[competicion]
    a = deporte.Agenda(anterior, competicion, nombre, 'https://www.motogp.com/en/calendar',
                       'motociclismo', observado, bool(url))
    campeonato = a.grupo('campeonato', competicion, 'competicion', nombre, codigo=competicion)
    # Una carrera que su GP ya no trae porque llega otra en su lugar (RAC por RAC2 al
    # reanudarla) deja de publicarse (presencia.py) y vuelve si otra respuesta la trae,
    # como en atletismo. operacion.py solo acepta como ausente lo que se retira aquí.
    previas = _sesiones_previas(anterior, competicion)
    retiradas = frozenset(((anterior or {}).get('fuentes', {}).get(competicion) or {}).get('sesiones_ausentes', []))
    sustituidas, todas = set(), set()
    for e in deporte.unicos(eventos, 'id'):
        if e['kind'] != 'GP':
            continue
        datos_temporada = e.get('season') or {}
        year = deporte.temporada(datos_temporada.get('year'))
        if temporada is not None and year != str(temporada):
            raise ValueError('Temporada MotoGP distinta de la solicitada')
        # El calendario es el de MotoGP: Moto2 y Moto3 solo están donde publican sesiones.
        if competicion != 'motogp' and not sesiones(e, competicion):
            continue
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
        recibidas = {}
        for s in deporte.unicos(deporte.filas({'broadcasts': e.get('broadcasts') or []}, 'broadcasts', 200), 'id'):
            categoria = s.get('category') or {}
            if s.get('type') != 'SESSION' or categoria.get('name') != nombre:
                continue
            tipo = deporte.literal(s.get('shortname'), 'tipo de sesión ' + nombre)
            a.evento('session_id', s['id'], 'sesion', e['name'].strip() + ' — ' + deporte.literal(s.get('name')),
                deporte.intervalo(s.get('date_start'), s.get('date_end'), fin_igual_desconocido=True, zona=zona),
                padre=grupo, estado=estado(s.get('status')), sitio=e.get('circuit'), url=enlace,
                bloques={'agenda': {'rol': 'sesion', 'principal': principal, 'tipo_sesion': tipo}})
            recibidas[deporte.literal(s['id'])] = tipo
        todas.update(recibidas)
        # Solo carreras, y con relevo: otra posterior en la respuesta (aunque ya estuviera
        # guardada: RAC y RAC2 pueden convivir antes de caer RAC) o tantas nuevas como
        # faltan. Un programa vacío o recortado (también con una RAC2) conserva lo guardado.
        guardadas = {i: t for i, t in previas.get(nucleo.clave(grupo), {}).items() if i not in retiradas}
        faltan = guardadas.keys() - recibidas.keys()
        nuevas = [i for i in recibidas.keys() - guardadas.keys() if carrera(recibidas[i])]
        ultima = max((_numero(t) for t in recibidas.values() if carrera(t)), default=0)
        if all(carrera(guardadas[i]) for i in faltan) and (
                len(nuevas) >= len(faltan) or all(_numero(guardadas[i]) < ultima for i in faltan)):
            sustituidas |= faltan
    # Lo recibido en cualquier GP no falta; lo que ya no tiene referencia no se arrastra.
    conocidas = {i for gp in previas.values() for i in gp}
    ausentes = ((retiradas | sustituidas) & conocidas) - todas
    if ausentes:
        a.c.n['fuentes'][competicion]['sesiones_ausentes'] = sorted(ausentes)
    return a.terminar()


def recoger(temporada):
    year = deporte.temporada(temporada)
    url = BASE + '?' + urlencode({'seasonYear': year})
    pagina = json.loads(recogida.descargar(url))
    if not isinstance(pagina, list):
        raise ValueError('Respuesta de temporada MotoGP sin lista de eventos')
    return pagina, url
