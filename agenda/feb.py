"""Importación de una extracción FEB revisada, sin cliente HTTP ni publicación.

El HTML retenido está recortado: no se presenta como un parser del portal.
La muestra declara qué hechos se extrajeron y guarda sus fragmentos originales.
"""

from copy import deepcopy
from datetime import date, datetime

from . import nucleo, tiempos


FUENTE = 'feb'
FUENTES = {FUENTE: {'nombre': 'Federación Española de Baloncesto',
    'url': 'https://baloncestoenvivo.feb.es/', 'atribucion': 'FEB', 'licencia': None,
    'condiciones': 'Muestra de investigación; recogida sistemática y republicación pendientes',
    'capacidades': ['calendario', 'resultados', 'clasificaciones'],
    'modo': 'extraccion_revisada'}}


def importar(anterior, muestra, observado):
    if muestra.get('version_muestra') != 1 or muestra.get('proveedor') != FUENTE:
        raise ValueError('Se requiere una extracción FEB revisada v1')
    c = nucleo.Constructor(anterior)
    c.n['fuentes'].update(deepcopy(FUENTES))
    recogida = muestra.get('modo') == 'recogida_html'
    if recogida:
        c.n['fuentes'][FUENTE]['modo'] = 'recogida_manual'
        c.n['fuentes'][FUENTE]['condiciones'] = 'Recogida manual; republicación y automatización periódica pendientes'
    doc = c.documento(FUENTE, muestra, url=muestra.get('url'),
        clase='recogida_html' if recogida else 'extraccion_revisada_con_fragmentos')
    g, t, f = (muestra[k] for k in ('competicion', 'edicion', 'fase'))
    if any(not isinstance(x['id'], str) or not x['id'].isdigit() for x in (g, t, f)):
        raise ValueError('IDs FEB literales inválidos')
    if not muestra.get('fragmentos') or not muestra.get('fecha_captura_original'):
        raise ValueError('Extracción sin evidencia retenida ni fecha original')
    date.fromisoformat(muestra['fecha_captura_original'])

    def entidad(tipo_externo, datos, contexto, tipo, clase, ruta):
        return c.entidad(FUENTE, tipo_externo, datos['id'], contexto, tipo, clase,
                         {'es': datos['nombre']}, doc, ruta, observado)

    competicion, eg = entidad('competicion', g, {}, 'agrupacion', 'competicion', '/competicion')
    c.tema(competicion, 'baloncesto', eg, 'feb:competicion-baloncesto-v1')
    edicion, et = entidad('temporada', t, {'g': g['id']}, 'agrupacion', 'edicion', '/edicion')
    fase, ef = entidad('fase', f, {'g': g['id'], 't': t['id']}, 'agrupacion', 'fase', '/fase')
    c.relacion('es_edicion_de', edicion, competicion, et)
    c.relacion('es_parte_de', fase, edicion, ef)
    for indice, p in enumerate(muestra['partidos']):
        ruta = f'/partidos/{indice}'
        inicio = datetime.strptime(p['fecha_hora'], '%d/%m/%Y - %H:%M') if p.get('fecha_hora') else None
        # Los encuentros jugados del calendario general no declaran la hora.
        # La fecha de jornada tampoco demuestra el día concreto del encuentro.
        cuando = {'inicio': tiempos.extremo(inicio.date().isoformat(), inicio.time().isoformat())
                            if inicio else tiempos.extremo(),
                  'fin': tiempos.extremo(), 'fin_exclusivo': None, 'horario_textual': p['fecha_hora']}
        nombres = [p[lado]['nombre'] for lado in ('local', 'visitante')]
        evento, ep = c.entidad(FUENTE, 'partido', p['id'], {}, 'evento', 'encuentro',
            {'es': ' — '.join(nombres)}, doc, ruta, observado, bloques={
                'programacion': {'cuando': cuando, 'programacion': 'desconocido', 'ejecucion': 'desconocido'},
                'lugar': deepcopy(p.get('pista'))})
        c.relacion('pertenece_a', evento, fase, ep)
        c.tema(evento, 'baloncesto', ep, 'feb:flujo-baloncesto-revisado-v1')
        participaciones = []
        for lado in ('local', 'visitante'):
            datos, participante = p[lado], None
            if datos.get('id'):
                participante, _ = entidad('equipo', datos, {}, 'participante', 'equipo', ruta + '/' + lado)
            participaciones.append(c.participar(evento, 'feb:' + lado, participante,
                datos['nombre'], lado, ep))
        # Un 0-0 de ficha pendiente no basta. Solo se importa el marcador
        # contrastado en resultados; no se deduce la condición FINAL.
        marcador = p.get('marcador_resultados')
        if marcador is not None:
            if len(marcador) != 2:
                raise ValueError('Marcador FEB incompleto')
            rid = nucleo.identificador('resultado-feb', doc, p['id'])
            lineas = lambda valores: [{'participacion': i, 'metricas': {'baloncesto.puntos': v}}
                                       for i, v in zip(participaciones, valores)]
            parciales = []
            for orden, cuarto in enumerate(p.get('cuartos', []), 1):
                if len(cuarto) != 2:
                    raise ValueError('Cuarto FEB incompleto')
                parciales.append({'id': str(orden), 'tipo': 'cuarto', 'orden': orden,
                                  'padre': None, 'lineas': lineas(cuarto)})
            c.n['resultados'][rid] = {'id': rid, 'evento': evento, 'observacion': ep,
                'condicion': 'desconocido', 'condicion_original': 'marcador en vista de resultados',
                'lineas': lineas(marcador), 'parciales': parciales, 'ganador': None}
            c.n['observaciones'][ep]['bloques']['resultado'] = rid
    tabla = muestra.get('clasificacion')
    if tabla:
        _, ec = c.entidad(FUENTE, 'tabla_clasificacion', f['id'], {'g': g['id'], 't': t['id']},
            'agrupacion', 'fase', {'es': f['nombre']}, doc, '/clasificacion', observado,
            identidad=fase['id'])
        cid = nucleo.identificador('clasificacion-feb', doc, g['id'], t['id'], f['id'])
        filas = []
        for orden, fila in enumerate(tabla['filas'], 1):
            participante = None
            if fila.get('id'):
                participante, _ = entidad('equipo', fila, {}, 'participante', 'equipo',
                                           f'/clasificacion/filas/{orden - 1}')
            filas.append({'participante': participante, 'literal': fila['nombre'],
                'posicion': fila.get('posicion'), 'orden': orden, 'metricas': deepcopy(fila['metricas'])})
        c.n['clasificaciones'][cid] = {'id': cid, 'ambito': fase, 'observacion': ec,
            'corte': None, 'jornada': None,
            'alcance': 'tabla_observada' if recogida else 'muestra_parcial', 'filas': filas}
        c.n['observaciones'][ec]['bloques']['clasificacion'] = cid
    return c.terminar()
