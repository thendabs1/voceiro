"""Importador del subconjunto Site API ATP/WTA contrastado."""

from copy import deepcopy
from datetime import datetime
from decimal import Decimal

from . import nucleo, tiempos


def importar(anterior, pagina, circuito, observado, url=None):
    if circuito not in ('atp', 'wta') or not isinstance(pagina.get('events'), list):
        raise ValueError('Se requiere una respuesta Site API ATP/WTA')
    c = nucleo.Constructor(anterior)
    fuente = 'espn-' + circuito
    c.n['fuentes'][fuente] = {'nombre': 'ESPN ' + circuito.upper(), 'url': 'https://www.espn.com/tennis/',
        'atribucion': 'ESPN', 'licencia': None, 'modo': 'recogida_manual' if url else 'muestra_local',
        'condiciones': 'Recogida sistemática y republicación pendientes',
        'capacidades': ['calendario', 'resultados']}
    # Fragmentos originales con contexto y URL. Un cambio de marcador no
    # duplica todas las observaciones del resto del scoreboard en Turso.
    doc = c.documento(fuente, {'leagues': pagina.get('leagues')}, url=url, clase='fragmento_site_api')
    liga = (pagina.get('leagues') or [{}])[0]
    if liga.get('slug') != circuito:
        raise ValueError('El circuito no coincide con la respuesta')
    # Identidad editorial del circuito, independiente del proveedor. No cambia
    # los IDs existentes de torneos, cuadros, encuentros o participantes.
    circuito_obj, ec = c.entidad(fuente, 'circuito', circuito, {}, 'agrupacion', 'circuito',
        {'en': circuito.upper()}, doc, '/leagues/0', observado,
        identidad=nucleo.identificador('circuito-tenis', circuito),
        bloques={'codigo_consulta': circuito})
    c.tema(circuito_obj, 'tenis', ec, 'espn:' + circuito + ':circuito-revisado-v1')

    def entero(valor):
        d = Decimal(str(valor))
        if not d.is_finite() or d != d.to_integral_value():
            raise ValueError('Marcador de tenis no entero')
        return int(d)

    def persona(datos, ruta):
        # GUID acreditado: no se separa un ID de pareja para inventar personas.
        if not datos.get('guid') or not datos.get('displayName'):
            raise ValueError('Persona de tenis sin GUID o nombre acreditado')
        return c.entidad(fuente, 'athlete_guid', datos['guid'], {}, 'participante', 'persona',
                         {'en': datos['displayName']}, doc, ruta, observado)[0]

    vistos = set()
    for ie, torneo in enumerate(pagina['events']):
        cabecera = {k: deepcopy(v) for k, v in torneo.items() if k != 'groupings'}
        doc_t = c.documento(fuente, {'torneo': cabecera}, url=url, clase='fragmento_site_api')
        ruta_e = '/torneo'
        edicion, ee = c.entidad(fuente, 'tournament_uid', torneo['uid'], {}, 'agrupacion', 'edicion',
            {'en': torneo['name']}, doc_t, ruta_e, observado)
        c.relacion('es_parte_de', edicion, circuito_obj, ee)
        # No se deduce un torneo recurrente recortando «-2026» del ID.
        for ig, grupo in enumerate(torneo.get('groupings', [])):
            g = grupo['grouping']
            ruta_g = '/grupo'
            doc_g = c.documento(fuente, {'torneo_uid': torneo['uid'],
                'grupo': {k: deepcopy(v) for k, v in g.items() if k != 'competitions'}},
                url=url, clase='fragmento_site_api')
            cuadro, eg = c.entidad(fuente, 'grouping', g['id'], {'torneo_uid': torneo['uid']},
                'agrupacion', 'cuadro', {'en': g['displayName']}, doc_g, ruta_g, observado,
                bloques={'modalidad_original': {k: deepcopy(v) for k, v in g.items() if k != 'competitions'}})
            c.relacion('es_parte_de', cuadro, edicion, eg)
            for im, m in enumerate(grupo['competitions']):
                if m['uid'] in vistos:
                    raise ValueError('Encuentro repetido en la respuesta')
                vistos.add(m['uid'])
                ruta = '/encuentro'
                doc = c.documento(fuente, {'torneo_uid': torneo['uid'], 'cuadro_id': g['id'],
                    'encuentro': deepcopy(m)}, url=url, clase='fragmento_site_api')
                tipo = m.get('status', {}).get('type', {})
                estado = tipo.get('name')
                confirmado = m.get('timeValid') is True
                inicio = tiempos.extremo()
                if confirmado:
                    dt = datetime.fromisoformat(m['date'])
                    tiempos.instante(m['date'])
                    inicio = tiempos.extremo(dt.date().isoformat(), dt.time().isoformat(), utc=m['date'])
                cuando = {'inicio': inicio, 'fin': tiempos.extremo(), 'fin_exclusivo': None,
                          'horario_textual': tipo.get('detail')}
                estados = {'STATUS_SCHEDULED': ('programado', 'sin_empezar'),
                    'STATUS_IN_PROGRESS': ('programado', 'en_curso'),
                    'STATUS_FINAL': ('programado', 'terminado'),
                    'STATUS_RETIRED': ('programado', 'terminado'),
                    'STATUS_WALKOVER': ('desconocido', 'terminado'),
                    'STATUS_POSTPONED': ('aplazado', 'desconocido'),
                    'STATUS_CANCELED': ('cancelado', 'desconocido')}
                programacion, ejecucion = estados.get(estado, ('desconocido', 'desconocido'))
                competidores = m['competitors']
                if len(competidores) != 2:
                    raise ValueError('El lector contrastado requiere dos lados de tenis')
                nombres = [(p.get('athlete') or p.get('roster') or {}).get('displayName') for p in competidores]
                if not all(nombres):
                    raise ValueError('Encuentro sin nombres de origen')
                evento, em = c.entidad(fuente, 'match_uid', m['uid'], {}, 'evento', 'encuentro',
                    {'en': ' — '.join(nombres)}, doc, ruta, observado, bloques={
                        'programacion': {'cuando': cuando, 'programacion': programacion, 'ejecucion': ejecucion},
                        'lugar': deepcopy(m.get('venue')), 'fecha_original': m.get('date'),
                        'time_valid_original': m.get('timeValid'), 'estado_original': deepcopy(tipo)})
                c.relacion('pertenece_a', evento, cuadro, em)
                c.tema(evento, 'tenis', em, 'espn:' + circuito + ':flujo-tenis-revisado-v1')
                participaciones, ganador = [], None
                for ip, p in enumerate(competidores):
                    ruta_p = ruta + f'/competitors/{ip}'
                    if p['type'] == 'athlete':
                        # Las plazas TBD usan IDs negativos reutilizados. Se
                        # conserva el literal en la participación, sin persona.
                        pendiente = str(p.get('id', '')).startswith('-') and p['athlete'].get('displayName') == 'TBD'
                        participante = None if pendiente else persona(p['athlete'], ruta_p + '/athlete')
                        for tipo_externo, campo in (('athlete_uid', 'uid'), ('athlete_id', 'id')):
                            if participante and p.get(campo):
                                c.entidad(fuente, tipo_externo, p[campo], {}, 'participante', 'persona',
                                    {'en': p['athlete']['displayName']}, doc, ruta_p, observado,
                                    identidad=participante['id'])
                    elif p['type'] == 'team':
                        integrantes = p['roster']['athletes']
                        if len(integrantes) != 2:
                            raise ValueError('Pareja sin dos integrantes acreditadas')
                        pendiente = str(p.get('id', '')).startswith('-') and all(
                            a.get('displayName') == 'TBD' and not a.get('guid') for a in integrantes)
                        participante = None
                        if not pendiente:
                            participante, _ = c.entidad(fuente, 'pair_uid', p['uid'], {},
                                'participante', 'pareja', {'en': p['roster']['displayName']}, doc, ruta_p, observado)
                            for ia, atleta in enumerate(integrantes):
                                integrante = persona(atleta, ruta_p + f'/roster/athletes/{ia}')
                                c.relacion('compuesta_por', participante, integrante, em, ambito=evento)
                    else:
                        raise ValueError('Tipo de competidor no contrastado')
                    participacion = c.participar(evento, fuente + ':' + p['uid'], participante,
                        nombres[ip], 'competidor', em, orden=p.get('order'))
                    participaciones.append(participacion)
                    if p.get('winner') is True:
                        if ganador is not None:
                            raise ValueError('Más de un ganador declarado')
                        ganador = participacion
                # Semántica de sets de la muestra FINAL. Otros códigos y formatos
                # conservan el original; no se normaliza un superdesempate como juegos.
                if estado != 'STATUS_FINAL':
                    continue
                if not all(p.get('linescores') for p in competidores):
                    continue
                if len(competidores[0]['linescores']) != len(competidores[1]['linescores']):
                    raise ValueError('Parciales de tenis incompletos')
                parciales, sets = [], [0, 0]
                for orden, valores in enumerate(zip(*(p['linescores'] for p in competidores)), 1):
                    # La notación 1-0 con desempate de partido no está acreditada
                    # como un set convencional: queda íntegra en el documento.
                    if all(entero(v['value']) <= 1 for v in valores) and any('tiebreak' in v for v in valores):
                        parciales = []
                        break
                    lineas = []
                    for ip, v in enumerate(valores):
                        metricas = {'tenis.juegos': entero(v['value'])}
                        if 'tiebreak' in v:
                            metricas['tenis.puntos_desempate'] = entero(v['tiebreak'])
                        lineas.append({'participacion': participaciones[ip], 'metricas': metricas})
                        if v.get('winner') is True:
                            sets[ip] += 1
                    parciales.append({'id': str(orden), 'tipo': 'set', 'orden': orden,
                                      'padre': None, 'lineas': lineas})
                if not parciales:
                    continue
                rid = nucleo.identificador('resultado-tenis', doc, m['uid'])
                c.n['resultados'][rid] = {'id': rid, 'evento': evento, 'observacion': em,
                    'condicion': 'final', 'condicion_original': estado, 'ganador': ganador,
                    'lineas': [{'participacion': p, 'metricas': {'tenis.sets_ganados': sets[ip]}}
                               for ip, p in enumerate(participaciones)], 'parciales': parciales}
                c.n['observaciones'][em]['bloques']['resultado'] = rid
    return c.terminar()
