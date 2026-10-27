"""Eventos bilingües de Kulturklik; NORA y horarios textuales sin inferencias."""

from datetime import date

from . import nucleo, tiempos


FUENTE = 'kulturklik'
URL = 'https://api.euskadi.eus/culture/events/v1.0/events'
CATALOGO = 'https://opendata.euskadi.eus/catalogo/-/kulturklik-agenda-cultural/'
TEMAS = {1: 'musica', 2: 'teatro', 3: 'exposiciones', 4: 'danza', 9: 'cine'}


def nombres(fila, campo):
    return {idioma: fila[campo + sufijo].strip() for idioma, sufijo in (('es', 'Es'), ('eu', 'Eu'))
            if isinstance(fila.get(campo + sufijo), str) and fila[campo + sufijo].strip()}


def importar(anterior, filas, observado, url=URL):
    if not isinstance(filas, list):
        raise ValueError('Kulturklik requiere eventos completos')
    c = nucleo.Constructor(anterior)
    c.n['fuentes'][FUENTE] = {'nombre': 'Kulturklik', 'url': CATALOGO,
        'atribucion': 'Gobierno Vasco · Kulturklik · datos normalizados por Voceiro',
        'licencia': 'CC BY 4.0', 'licencia_url': 'https://creativecommons.org/licenses/by/4.0/',
        'capacidades': ['calendario'], 'modo': 'recogida_manual',
        'condiciones': 'Licencia del catálogo datos.gob.es/a16003011-agenda-cultural-proximos-eventos1; atribución al original'}
    vistos = {}
    for fila in filas:
        identidad = str(fila.get('id') or '')
        if not identidad or not nombres(fila, 'name'):
            raise ValueError('Evento Kulturklik sin identidad o nombre')
        if identidad in vistos:
            if vistos[identidad] != fila:
                raise ValueError('ID Kulturklik repetido con contenido distinto')
            continue
        vistos[identidad] = fila
        # La API serializa días a medianoche Z; el horario se publica aparte.
        inicio = date.fromisoformat(fila['startDate'][:10]).isoformat() if fila.get('startDate') else None
        fin = date.fromisoformat(fila['endDate'][:10]).isoformat() if fila.get('endDate') else None
        horas = nombres(fila, 'openingHours')
        cuando = tiempos.validar({'inicio': tiempos.extremo(inicio), 'fin': tiempos.extremo(fin),
            'fin_exclusivo': False if fin else None, 'horario_textual': horas or None})
        programacion = {'cuando': cuando, 'programacion': 'desconocido', 'ejecucion': 'desconocido',
                       'modalidad': 'intervalo' if fin and inicio != fin else 'cita', 'estado_original': None}
        establecimientos = nombres(fila, 'establishment') or nombres(fila, 'place')
        municipios = nombres(fila, 'municipality')
        # Evidencia de los campos utilizados por el calendario, sin copiar HTML,
        # imágenes ni adjuntos ajenos a la lectura. Igual que los fragmentos ESPN.
        campos = ('id', 'type', 'typeEs', 'typeEu', 'nameEs', 'nameEu', 'startDate', 'endDate',
                  'openingHoursEs', 'openingHoursEu', 'sourceUrlEs', 'sourceUrlEu',
                  'municipalityEs', 'municipalityEu', 'municipalityNoraCode', 'provinceNoraCode',
                  'municipalityLatitude', 'municipalityLongitude',
                  'establishmentEs', 'establishmentEu', 'placeEs', 'placeEu')
        doc = c.documento(FUENTE, {k: fila[k] for k in campos if k in fila}, url, 'fragmento_evento_api')
        evento, evidencia = c.entidad(FUENTE, 'event_id', identidad, {}, 'evento', 'desconocida',
            nombres(fila, 'name'), doc, '/', observado,
            bloques={'programacion': programacion,
                     'lugar': {'nombre': establecimientos.get('es') or next(iter(establecimientos.values()), None),
                               'municipio_literal': municipios.get('es') or next(iter(municipios.values()), None)},
                     'url_evento': fila.get('sourceUrlEs') or fila.get('sourceUrlEu'),
                     'tipo_original': {'id': fila.get('type'), 'nombres': nombres(fila, 'type')}})
        municipio = fila.get('municipalityNoraCode')
        provincia = fila.get('provinceNoraCode')
        if municipio and provincia and municipios:
            territorio, _ = c.entidad(FUENTE, 'municipio_nora', str(municipio),
                {'provincia_nora': str(provincia)}, 'territorio', 'municipio', municipios,
                doc, '/municipalityNoraCode', observado,
                bloques={'identificadores': {'nora': str(municipio), 'provincia_nora': str(provincia)}})
            c.relacion('se_celebra_en', evento, territorio, evidencia)
        # Los nombres de recintos no acreditan una identidad compartida: literal conservado.
        c.tema(evento, TEMAS.get(fila.get('type'), 'cultura'), evidencia, 'kulturklik:eventType:revisado-v1')
    return c.terminar()
