"""Índices SQL del núcleo; la validación es común a SQLite y Turso."""

from copy import deepcopy

from . import nucleo
from .tiempos import instante


TABLAS = {c: 'agenda_' + c for c in nucleo.COLECCIONES}
TABLAS.update(politicas='agenda_nucleo_politicas', selecciones='agenda_nucleo_selecciones')
NOMBRES = set(TABLAS.values()) | {'agenda_tiempos'}
CONSULTAS = [(f'SELECT datos_json FROM {tabla} ORDER BY 1', ()) for tabla in TABLAS.values()]


def filas(coleccion, datos):
    for k, d in datos.items():
        if coleccion == 'entidades':
            columnas, valores, claves = ('tipo', 'id', 'clase'), (d['tipo'], d['id'], d['clase']), ('tipo', 'id')
        elif coleccion == 'documentos':
            columnas, valores, claves = ('id', 'fuente'), (k, d['fuente']), ('id',)
        elif coleccion == 'referencias':
            destino = d['destino'] or {}
            columnas = ('id', 'proveedor', 'tipo_externo', 'contexto_json', 'id_externo', 'tipo_destino', 'destino')
            valores = (k, d['proveedor'], d['tipo_externo'], nucleo.json_canonico(d['contexto']),
                       d['id_externo'], destino.get('tipo'), destino.get('id'))
            claves = ('id',)
        elif coleccion == 'observaciones':
            columnas = ('id', 'referencia', 'documento', 'observado', 'ultima_observacion')
            valores = tuple(d[c] for c in columnas)
            claves = ('id',)
        elif coleccion == 'relaciones':
            columnas = ('id', 'tipo', 'origen_tipo', 'origen', 'destino_tipo', 'destino', 'ambito_tipo', 'ambito')
            valores = (k, d['tipo'], d['origen']['tipo'], d['origen']['id'],
                       d['destino']['tipo'], d['destino']['id'],
                       (d['ambito'] or {}).get('tipo'), (d['ambito'] or {}).get('id'))
            claves = ('id',)
        elif coleccion == 'participaciones':
            columnas = ('id', 'evento_tipo', 'evento', 'participante_tipo', 'participante')
            valores = (k, 'evento', d['evento']['id'],
                       (d['participante'] or {}).get('tipo'), (d['participante'] or {}).get('id'))
            claves = ('id',)
        elif coleccion in ('resultados', 'clasificaciones'):
            campo = 'evento' if coleccion == 'resultados' else 'ambito'
            columnas = ('id', campo + '_tipo', campo, 'observacion')
            valores = (k, d[campo]['tipo'], d[campo]['id'], d['observacion'])
            claves = ('id',)
        else:
            columnas = ('id', 'objetivo_tipo', 'objetivo', 'bloque')
            valores = (k, d['objetivo']['tipo'], d['objetivo']['id'], d['bloque'])
            claves = ('id',)
        yield k, columnas + ('datos_json',), valores + (nucleo.json_canonico(d),), claves


def tiempos(n):
    salida = {}
    for s in n.get('selecciones', {}).values():
        if s['bloque'] == 'programacion' and s['seleccion']['valor']:
            c = s['seleccion']['valor']['cuando']
            a, b, d = c['inicio'], c['fin'], s['objetivo']
            confirmado = a['certeza_fecha'] == 'confirmado'
            fin_confirmado = b['certeza_fecha'] == 'confirmado'
            # No indexar instantes con hora provisional como horarios exactos.
            ai = instante(a['instante']).isoformat() if (a['instante'] and confirmado
                   and a['certeza_hora'] == 'confirmado') else None
            bi = instante(b['instante']).isoformat() if (b['instante'] and fin_confirmado
                   and b['certeza_hora'] == 'confirmado') else None
            salida[nucleo.clave(d)] = (d['tipo'], d['id'], a['fecha'] if confirmado else None,
                ai, b['fecha'] if fin_confirmado else None, bi, nucleo.json_canonico(c))
    return salida


def planificar(anterior, nuevo):
    if anterior == nuevo:
        return []
    if nuevo is None:
        raise ValueError('No se puede descartar el núcleo al guardar desde un cliente antiguo')
    nucleo.validar(nuevo)
    previo = anterior or {}
    if previo.get('catalogo') and previo['catalogo'] != nuevo['catalogo']:
        if (nuevo['catalogo']['version'] <= previo['catalogo']['version']
                or previo['catalogo']['conceptos'].keys() - nuevo['catalogo']['conceptos'].keys()):
            raise ValueError('Un catálogo corregido conserva IDs y necesita una versión mayor')
    esperado = deepcopy(nuevo)
    esperado['selecciones'] = deepcopy(previo.get('selecciones', {}))
    nucleo.recalcular_selecciones(esperado)
    if esperado['selecciones'] != nuevo['selecciones']:
        raise ValueError('Las selecciones deben corresponder a sus fuentes, políticas y estado previo')
    pasos = []
    for c, tabla in TABLAS.items():
        viejos, nuevos = previo.get(c, {}), nuevo[c]
        if c not in ('politicas', 'selecciones') and viejos.keys() - nuevos.keys():
            raise ValueError('El núcleo conserva identidades, evidencia e historial')
        if c in ('politicas', 'selecciones'):
            for i in viejos.keys() - nuevos.keys():
                pasos.append((f'DELETE FROM {tabla} WHERE id=?', (i,)))
        for k, columnas, valores, claves in filas(c, nuevos):
            if viejos.get(k) == nuevos[k]:
                continue
            if c == 'entidades' and k in viejos and viejos[k]['clase'] != nuevos[k]['clase']:
                raise ValueError('La clase de una identidad no se cambia al guardar')
            campos_identidad = {'relaciones': ('tipo', 'origen', 'destino', 'ambito'),
                                'participaciones': ('evento', 'slot', 'participante')}.get(c, ())
            if k in viejos and any(viejos[k][campo] != nuevos[k][campo] for campo in campos_identidad):
                raise ValueError('Una relación o participación no cambia de objetivo con el mismo ID')
            if c == 'observaciones' and k in viejos:
                antes, despues = viejos[k], nuevos[k]
                if ({a: v for a, v in antes.items() if a != 'ultima_observacion'} !=
                        {a: v for a, v in despues.items() if a != 'ultima_observacion'}
                        or instante(despues['ultima_observacion']) < instante(antes['ultima_observacion'])):
                    raise ValueError('Una observación conserva su contenido y no retrocede')
            if c in ('documentos', 'resultados', 'clasificaciones') and k in viejos:
                raise ValueError('Un documento o resultado conserva su contenido e historial')
            if c == 'referencias' and k in viejos and viejos[k] != nuevos[k]:
                raise ValueError('Conciliación de identidades pendiente de revisión explícita')
            cambios = ', '.join(f'{a}=excluded.{a}' for a in columnas if a not in claves)
            sql = (f'INSERT INTO {tabla} ({", ".join(columnas)}) VALUES '
                   f'({", ".join("?" for _ in columnas)}) ON CONFLICT ({", ".join(claves)}) '
                   f'DO UPDATE SET {cambios}')
            pasos.append((sql, valores))
    viejos_t, nuevos_t = tiempos(previo), tiempos(nuevo)
    for k in viejos_t.keys() - nuevos_t.keys():
        pasos.append(('DELETE FROM agenda_tiempos WHERE tipo=? AND objetivo=?', viejos_t[k][:2]))
    for k, valores in nuevos_t.items():
        if viejos_t.get(k) != valores:
            pasos.append(('INSERT INTO agenda_tiempos VALUES (?, ?, ?, ?, ?, ?, ?) '
                'ON CONFLICT(tipo, objetivo) DO UPDATE SET inicio_fecha=excluded.inicio_fecha, '
                'inicio_instante=excluded.inicio_instante, fin_fecha=excluded.fin_fecha, '
                'fin_instante=excluded.fin_instante, datos_json=excluded.datos_json', valores))
    return pasos
