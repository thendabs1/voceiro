"""Agenda municipal de Zaragoza: obra (`id`) con funciones (`subEvent.id`) y recintos con ID.

Cada función es un evento con identidad propia; la obra es una `actividad`
unida por `celebracion_de` solo cuando tiene más de una función. El recinto
guarda sus coordenadas WGS84 y el municipio lo acreditan los límites del IGN.
Mezcla actividades no culturales (cursos, empleo): el clasificador al publicar
las deja sin tema salvo lo que acredita su tabla (tablas/zaragoza.json).
"""

from datetime import date, datetime
import math
from zoneinfo import ZoneInfo

from . import nucleo, tiempos


FUENTE = 'zaragoza'
URL = 'https://www.zaragoza.es/sede/servicio/cultura/evento/list.json?srsname=wgs84'
CATALOGO = 'https://www.zaragoza.es/web/espacio-de-datos/servicio/catalogo/282'
FAMILIA, URL_RECOGIDA = 'zaragoza', URL
CAMPO_ID, TIPO_EXTERNO = 'id', 'subevent_id'
FECHAS = ('startDate', 'endDate')
DIAS = {'Lunes': 0, 'Martes': 1, 'Miércoles': 2, 'Jueves': 3, 'Viernes': 4, 'Sábado': 5, 'Domingo': 6}


def inventario(filas):
    """La presencia se acredita por función: una obra puede perder una sesión."""
    return sorted(str(s['id']) for f in filas for s in f.get('subEvent') or [])


def coordenadas(lugar):
    punto = (lugar.get('geometry') or {})
    try:
        longitud, latitud = (float(v) for v in punto['coordinates'])
    except (KeyError, TypeError, ValueError):
        return {}
    if (punto.get('type') != 'Point' or not math.isfinite(latitud) or not math.isfinite(longitud)
            or not -90 <= latitud <= 90 or not -180 <= longitud <= 180):
        return {}
    return {'coordenadas': {'latitud': latitud, 'longitud': longitud}}


def programacion(funcion, obra):
    inicio = date.fromisoformat(funcion['startDate'][:10]).isoformat()
    fin = date.fromisoformat((funcion.get('endDate') or funcion['startDate'])[:10]).isoformat()
    horas = [h for h in funcion.get('openingHours') or [] if h.get('startTime')]
    texto = '; '.join(f"{h.get('dayOfWeek') or ''} {h['startTime']}".strip()
                      + (f"–{h['endTime']}" if h.get('endTime') else '') for h in horas)
    # startDate/endDate son días a medianoche: no acreditan horas.
    cuando = {'inicio': tiempos.extremo(inicio), 'fin': tiempos.extremo(fin),
              'fin_exclusivo': False, 'horario_textual': texto or None}
    if inicio == fin and len(horas) == 1:
        try:
            extremo = tiempos.extremo(inicio, datetime.strptime(horas[0]['startTime'], '%H:%M').strftime('%H:%M'),
                                      'Europe/Madrid')
            tiempos.validar_extremo(extremo)
        except ValueError:
            pass  # Una hora ilegible queda solo en el texto.
        else:
            extremo['instante'] = datetime.fromisoformat(inicio + 'T' + extremo['hora_local']).replace(
                tzinfo=ZoneInfo('Europe/Madrid')).isoformat()
            cuando['inicio'] = extremo
    dias = [h.get('dayOfWeek') for h in horas]
    if any(d not in DIAS and d != 'Sin determinar' for d in dias):
        raise ValueError('Día de semana Zaragoza desconocido')
    if inicio != fin and dias and all(d in DIAS for d in dias):
        # «Sin determinar» deja el horario solo como texto, sin días inferidos.
        cuando['dias_semana'] = sorted({DIAS[d] for d in dias})
    return {'cuando': tiempos.validar(cuando), 'programacion': 'programado', 'ejecucion': 'desconocido',
            'modalidad': 'intervalo' if inicio != fin else 'cita', 'estado_original': None}


def importar(anterior, filas, observado, url=URL):
    if not isinstance(filas, list):
        raise ValueError('Zaragoza requiere eventos completos')
    c = nucleo.Constructor(anterior)
    c.n['fuentes'][FUENTE] = {**c.n['fuentes'].get(FUENTE, {}),
        'nombre': 'Agenda de Zaragoza', 'url': CATALOGO,
        'atribucion': 'Origen de los datos: Ayuntamiento de Zaragoza · normalizados por Voceiro',
        'licencia': 'Condiciones generales de reutilización del Ayuntamiento de Zaragoza',
        'licencia_url': 'https://www.zaragoza.es/sede/portal/aviso-legal#condiciones',
        'capacidades': ['calendario'], 'modo': 'recogida_manual',
        'condiciones': 'Citar «Origen de los datos: Ayuntamiento de Zaragoza» y la fecha de última '
                       'actualización (bloque actualizado_origen); no sugerir patrocinio municipal'}
    vistos = {}
    for obra in filas:
        identidad = str(obra.get('id') or '')
        titulo = (obra.get('title') or '').strip()
        if not identidad or not titulo:
            raise ValueError('Evento Zaragoza sin identidad o título')
        if not obra.get('startDate'):
            continue  # Ofertas permanentes antiguas (fin en 2020): sin fecha no son citas.
        if identidad in vistos:
            if vistos[identidad] != obra:
                raise ValueError('ID Zaragoza repetido con contenido distinto')
            continue
        vistos[identidad] = obra
        funciones = obra.get('subEvent') or []
        categorias = [{'id': k.get('id'), 'title': k.get('title')} for k in obra.get('category') or []]
        base = {k: obra[k] for k in ('id', 'title', 'startDate', 'endDate', 'type', 'url', 'lastUpdated')
                if k in obra}
        # Campos en bruto para clasificar al publicar; de cada tarifa, solo grupo e importe.
        origen = {'category': categorias,
                  'population': [{'id': p.get('id'), 'title': p.get('title')} for p in obra.get('population') or []],
                  'price': [{'fareGroup': p.get('fareGroup'), 'hasCurrencyValue': p.get('hasCurrencyValue')}
                            for p in obra.get('price') or []]}
        origen = {k: v for k, v in origen.items() if v}
        actividad = None
        for funcion in funciones:
            fid = str(funcion.get('id') or '')
            if not fid:
                raise ValueError('Función Zaragoza sin identidad')
            if not funcion.get('startDate'):
                continue  # Sin fecha propia no es una cita (una trae un fin anterior a su obra).
            lugar = funcion.get('location') or {}
            recinto = {k: lugar[k] for k in ('id', 'title', 'streetAddress', 'addressLocality', 'geometry')
                       if k in lugar}
            # Solo los campos que usa el calendario: descripción, imágenes o
            # accesibilidad crearían evidencia nueva sin cambio de cita.
            doc = c.documento(FUENTE, {**base, **origen, 'subEvent': {
                **{k: funcion[k] for k in ('id', 'startDate', 'endDate', 'openingHours') if k in funcion},
                'location': recinto}}, url, 'fragmento_evento_api')
            evento, evidencia = c.entidad(FUENTE, TIPO_EXTERNO, fid, {}, 'evento', 'desconocida',
                {'es': titulo}, doc, '/subEvent', observado,
                bloques={'programacion': programacion(funcion, obra),
                         'lugar': {'nombre': recinto.get('title'), 'direccion': recinto.get('streetAddress'),
                                   'municipio_literal': recinto.get('addressLocality')},
                         'url_evento': obra.get('url'), 'tipo_original': obra.get('type'),
                         'actualizado_origen': obra.get('lastUpdated'), 'origen': origen})
            if len(funciones) > 1:
                if actividad is None:
                    # Documento propio: el cambio de una función no es evidencia nueva de la obra.
                    obra_doc = c.documento(FUENTE, {'id': obra['id'], 'title': obra['title']}, url,
                                           'fragmento_obra_api')
                    actividad, _ = c.entidad(FUENTE, 'evento_id', identidad, {}, 'actividad', 'obra',
                                             {'es': titulo}, obra_doc, '/id', observado)
                c.relacion('celebracion_de', evento, actividad, evidencia)
            if recinto.get('id') and recinto.get('title'):
                # Compartido entre funciones: solo sus propios datos lo cambian.
                lugar_doc = c.documento(FUENTE, recinto, url, 'fragmento_lugar_api')
                l, _ = c.entidad(FUENTE, 'lugar_id', str(recinto['id']), {}, 'lugar', 'recinto',
                                 {'es': recinto['title']}, lugar_doc, '/', observado,
                                 bloques=coordenadas(recinto))
                c.relacion('se_celebra_en', evento, l, evidencia)
    return c.terminar()
