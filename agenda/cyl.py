"""Agenda cultural de Castilla y León: una fila por función, obra (`id_evento`) + fecha.

La fuente no da ID de función ni de recinto: la función es (`id_evento`,
`fecha_inicio`), una entrada de programación sin continuidad si cambia la fecha
(se retira y aparece otra), y el recinto, localidad + nombre. La obra es
siempre una `actividad` unida por `celebracion_de`: es el objetivo estable para
seguir una programación. El recinto guarda sus coordenadas WGS84 y el
municipio lo acreditan los límites del IGN.
"""

from datetime import date, datetime
import math
import re
from zoneinfo import ZoneInfo

from . import nucleo, tiempos


FUENTE = 'cyl'
CONJUNTO = 'eventos-de-la-agenda-cultural-categorizados-y-geolocalizados'
URL = ('https://analisis.datosabiertos.jcyl.es/api/explore/v2.1/catalog/datasets/'
       f'{CONJUNTO}/records?order_by=id_evento%2Cfecha_inicio')
CATALOGO = ('https://datos.gob.es/es/catalogo/'
            'a07002862-relacion-de-eventos-de-la-agenda-cultural-categorizados-y-geolocalizados')
FAMILIA, URL_RECOGIDA = 'opendatasoft', URL
TIPO_EXTERNO = 'funcion_obra_fecha_v1'
FECHAS = ('fecha_inicio', 'fecha_fin')
TEMAS = {'Teatro títeres monólogo': 'teatro', 'Danza': 'danza', 'Exposición': 'exposiciones',
         'Club de lectura': 'literatura', 'Cuentacuentos': 'literatura', 'Presentación': 'literatura',
         'Narración oral para adultos': 'literatura', 'Cine o audiovisual': 'cine'}
CATEGORIAS = {'Conciertos': 'musica', 'Exposiciones': 'exposiciones'}
# «19:30», «19:30 h.», «9:00h.», «19.30 horas»; el resto queda como texto.
HORA = re.compile(r'\s*(\d{1,2})[:.](\d{2})\s*(?:h\.?|horas)?\s*')
EVIDENCIA = ('id_evento', 'titulo', 'categoria', 'tematica', 'fecha_inicio', 'fecha_fin',
             'hora_inicio', 'hora_fin', 'enlace_contenido', 'id_localidad', 'lugar_celebracion')
RECINTO = ('id_localidad', 'lugar_celebracion', 'calle', 'cp', 'nombre_localidad',
           'codigo_provincia', 'latitud', 'longitud')


def identidad(fila):
    """Función = obra + día; vacía si falta alguno (familias.recorrer lo rechaza)."""
    obra, dia = fila.get('id_evento'), fila.get('fecha_inicio')
    return f'{obra}@{dia}' if obra and dia else ''


CAMPO_ID = identidad


def inventario(filas):
    return sorted(identidad(f) for f in filas)


def obra(funcion):
    """Obra de una función inventariada: sus filas se actualizan aunque caigan fuera de la ventana."""
    return funcion.partition('@')[0]


def coordenadas(fila):
    try:
        latitud, longitud = float(fila['latitud']), float(fila['longitud'])
    except (KeyError, TypeError, ValueError):
        return {}
    if not (math.isfinite(latitud) and math.isfinite(longitud)
            and -90 <= latitud <= 90 and -180 <= longitud <= 180):
        return {}
    return {'coordenadas': {'latitud': latitud, 'longitud': longitud}}


def hora(texto):
    m = HORA.fullmatch(texto or '')
    if not m or not 0 <= int(m[1]) <= 23 or not 0 <= int(m[2]) <= 59:
        return None
    valor = f'{int(m[1]):02d}:{m[2]}'
    return None if valor == '00:00' else valor  # Medianoche marca días sin hora.


def programacion(fila):
    inicio = date.fromisoformat(fila['fecha_inicio']).isoformat()
    fin = date.fromisoformat(fila.get('fecha_fin') or inicio).isoformat()
    texto = ' – '.join(h.strip() for h in (fila.get('hora_inicio'), fila.get('hora_fin')) if h and h.strip())
    cuando = {'inicio': tiempos.extremo(inicio), 'fin': tiempos.extremo(fin),
              'fin_exclusivo': False, 'horario_textual': texto or None}
    h = hora(fila.get('hora_inicio')) if inicio == fin else None
    if h:
        extremo = tiempos.extremo(inicio, h, 'Europe/Madrid')
        extremo['instante'] = datetime.fromisoformat(inicio + 'T' + h).replace(
            tzinfo=ZoneInfo('Europe/Madrid')).isoformat()
        cuando['inicio'] = extremo
    return {'cuando': tiempos.validar(cuando), 'programacion': 'programado', 'ejecucion': 'desconocido',
            'modalidad': 'intervalo' if inicio != fin else 'cita', 'estado_original': None}


def importar(anterior, filas, observado, url=URL):
    if not isinstance(filas, list):
        raise ValueError('CyL requiere eventos completos')
    c = nucleo.Constructor(anterior)
    c.n['fuentes'][FUENTE] = {**c.n['fuentes'].get(FUENTE, {}),
        'nombre': 'Agenda cultural de Castilla y León', 'url': CATALOGO,
        'atribucion': 'Junta de Castilla y León · datos normalizados por Voceiro',
        'licencia': 'CC BY 4.0', 'licencia_url': 'https://creativecommons.org/licenses/by/4.0/',
        'capacidades': ['calendario'], 'modo': 'recogida_manual',
        'condiciones': 'Licencia del catálogo datos.gob.es/a07002862; atribución al original'}
    vistos, funciones = {}, {}
    for fila in filas:
        fid, titulo = identidad(fila), (fila.get('titulo') or '').strip()
        if not fid or not titulo:
            raise ValueError('Evento CyL sin identidad o título')
        if fid in vistos:
            if vistos[fid] != fila:
                raise ValueError('Función CyL repetida con contenido distinto')
            continue
        vistos[fid] = fila
        funciones.setdefault(str(fila['id_evento']), []).append(fila)
    for id_obra, filas_obra in funciones.items():
        actividad = None
        for fila in filas_obra:
            titulo = fila['titulo'].strip()
            # Solo los campos que usa el calendario: descripción o imágenes
            # crearían evidencia nueva sin cambio de cita.
            doc = c.documento(FUENTE, {k: fila[k] for k in EVIDENCIA if k in fila}, url, 'fragmento_evento_api')
            evento, evidencia = c.entidad(FUENTE, TIPO_EXTERNO, identidad(fila), {}, 'evento', 'desconocida',
                {'es': titulo}, doc, '/', observado,
                bloques={'programacion': programacion(fila),
                         'lugar': {'nombre': fila.get('lugar_celebracion'), 'direccion': fila.get('calle'),
                                   'municipio_literal': fila.get('nombre_localidad')},
                         'url_evento': fila.get('enlace_contenido'),
                         'tipo_original': {'categoria': fila.get('categoria'), 'tematica': fila.get('tematica')}})
            # Sin correspondencia queda sin tema, como Galicia: `cultura` no es «desconocido»
            # y una correspondencia posterior se añade, no sustituye a esta.
            tema = TEMAS.get(fila.get('tematica')) or CATEGORIAS.get(fila.get('categoria'))
            if tema:
                c.tema(evento, tema, evidencia, 'cyl:tematica:revisado-v1')
            if actividad is None:
                # Documento propio: el cambio de una función no es evidencia nueva de la obra.
                obra_doc = c.documento(FUENTE, {'id_evento': fila['id_evento'], 'titulo': titulo}, url,
                                       'fragmento_obra_api')
                actividad, _ = c.entidad(FUENTE, 'evento_id', id_obra, {}, 'actividad', 'obra',
                                         {'es': titulo}, obra_doc, '/id_evento', observado)
            c.relacion('celebracion_de', evento, actividad, evidencia)
            nombre = (fila.get('lugar_celebracion') or '').strip()
            if fila.get('id_localidad') and nombre:
                # Sin ID de recinto: localidad + nombre, compartido entre funciones.
                lugar_doc = c.documento(FUENTE, {k: fila[k] for k in RECINTO if k in fila}, url,
                                        'fragmento_lugar_api')
                l, _ = c.entidad(FUENTE, 'lugar_localidad_nombre', f"{fila['id_localidad']}:{nombre}", {},
                                 'lugar', 'recinto', {'es': nombre}, lugar_doc, '/', observado,
                                 bloques=coordenadas(fila))
                c.relacion('se_celebra_en', evento, l, evidencia)
    return c.terminar()
