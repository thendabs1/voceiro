"""Agenda municipal de Madrid: ID-EVENTO, actividad y recinto acreditados.

No usa el índice de CKAN ni título/fecha como identidad. Una programación
prolongada se conserva como intervalo con sus restricciones, sin expandirla.
"""

from datetime import date, datetime
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo

from . import nucleo, tiempos


FUENTE = 'madrid'
URL = 'https://datos.madrid.es/api/3/action/datastore_search?resource_id=300107-2-agenda-actividades-eventos-csv'
CATALOGO = 'https://datos.madrid.es/dataset/300107-0-agenda-actividades-eventos'
TEMAS = {'TeatroPerformance': 'teatro', 'Musica': 'musica', 'DanzaBaile': 'danza',
         'CineActividadesAudiovisuales': 'cine', 'Exposiciones': 'exposiciones',
         'RecitalesPresentacionesActosLiterarios': 'literatura', 'ClubesLectura': 'literatura',
         'ActividadesDeportivas': 'deportes'}
CAMPOS = ('ID-EVENTO', 'TITULO', 'FECHA', 'FECHA-FIN', 'HORA', 'LARGA-DURACION', 'DIAS-SEMANA',
          'DIAS-EXCLUIDOS', 'CONTENT-URL', 'TITULO-ACTIVIDAD', 'URL-ACTIVIDAD', 'URL-INSTALACION',
          'NOMBRE-INSTALACION', 'CLASE-VIAL-INSTALACION', 'NOMBRE-VIA-INSTALACION', 'NUM-INSTALACION',
          'DISTRITO-INSTALACION', 'BARRIO-INSTALACION', 'CODIGO-POSTAL-INSTALACION', 'LATITUD', 'LONGITUD', 'TIPO')
DIAS = {'L': 0, 'M': 1, 'X': 2, 'J': 3, 'V': 4, 'S': 5, 'D': 6}


def identidad_url(url):
    """Clave publicada vgnextoid; el canal y el protocolo no identifican la ficha."""
    if not url:
        return None
    partes = urlsplit(url)
    if partes.hostname not in ('madrid.es', 'www.madrid.es'):
        return None
    valores = parse_qs(partes.query).get('vgnextoid', [])
    return valores[0] if len(valores) == 1 and valores[0] else None


def programacion(fila):
    inicio = date.fromisoformat(fila['FECHA'][:10]).isoformat()
    fin = date.fromisoformat(fila['FECHA-FIN'][:10]).isoformat() if fila.get('FECHA-FIN') else None
    larga = str(fila.get('LARGA-DURACION')) == '1'
    hora = (fila.get('HORA') or '').strip()
    # FECHA/FECHA-FIN son días, sus 00:00/23:59 no acreditan horarios.
    cuando = {'inicio': tiempos.extremo(inicio), 'fin': tiempos.extremo(fin),
              'fin_exclusivo': False if fin else None, 'horario_textual': hora or None}
    if hora and not larga and (not fin or fin == inicio):
        try:
            extremo = tiempos.extremo(inicio, datetime.strptime(hora, '%H:%M').strftime('%H:%M'), 'Europe/Madrid')
            tiempos.validar_extremo(extremo)
        except ValueError:
            pass  # Un horario textual/ambiguo no se convierte en hora confirmada.
        else:
            extremo['instante'] = datetime.fromisoformat(inicio + 'T' + extremo['hora_local']).replace(
                tzinfo=ZoneInfo('Europe/Madrid')).isoformat()
            cuando['inicio'] = extremo
    dias = (fila.get('DIAS-SEMANA') or '').strip()
    if larga and dias:
        tokens = [d.strip() for d in dias.split(',')]
        if any(d not in DIAS for d in tokens):
            raise ValueError('Días de semana Madrid desconocidos')
        cuando['dias_semana'] = sorted({DIAS[d] for d in tokens})
    excluidos = (fila.get('DIAS-EXCLUIDOS') or '').strip()
    if excluidos:
        fechas, pendientes = set(), []
        for d in excluidos.split(';'):
            if not d.strip():
                continue
            try:
                fechas.add(datetime.strptime(d.strip(), '%d/%m/%Y').date().isoformat())
            except ValueError:
                pendientes.append(d.strip())
        cuando['dias_excluidos'] = sorted(fechas)
        if pendientes:
            # No ofrecer un día como cita cuando sus exclusiones no se entienden.
            cuando['inicio']['certeza_fecha'] = 'provisional'
            cuando['restricciones_pendientes'] = pendientes
    return {'cuando': tiempos.validar(cuando), 'programacion': 'programado',
            'ejecucion': 'desconocido', 'modalidad': 'intervalo' if larga or fin and fin != inicio else 'cita',
            'estado_original': None}


def importar(anterior, filas, observado, url=URL):
    if not isinstance(filas, list):
        raise ValueError('Madrid requiere registros CKAN completos')
    c = nucleo.Constructor(anterior)
    c.n['fuentes'][FUENTE] = {'nombre': 'Agenda de Madrid', 'url': CATALOGO,
        'atribucion': 'Ayuntamiento de Madrid · datos normalizados por Voceiro',
        'licencia': 'CC BY 4.0', 'licencia_url': 'https://creativecommons.org/licenses/by/4.0/',
        'capacidades': ['calendario'], 'modo': 'recogida_manual',
        'condiciones': 'Atribución y enlace al original; actualización diaria del proveedor'}
    vistos = {}
    for fila in filas:
        identidad = str(fila.get('ID-EVENTO') or '')
        if not identidad or not fila.get('TITULO'):
            raise ValueError('Evento Madrid sin identidad o título')
        if identidad in vistos:
            if vistos[identidad] != fila:
                raise ValueError('ID-EVENTO Madrid repetido con contenido distinto')
            continue
        vistos[identidad] = fila
        # Solo los campos que usa el calendario y la ubicación para el territorio:
        # `_id` (fila CKAN), descripción o precio crearían evidencia sin cambio de cita.
        doc = c.documento(FUENTE, {k: fila[k] for k in CAMPOS if k in fila}, url, 'fragmento_registro_ckan')
        lugar = {'nombre': fila.get('NOMBRE-INSTALACION'), 'url': fila.get('URL-INSTALACION'),
                 'direccion': ' '.join(str(fila.get(k) or '') for k in
                    ('CLASE-VIAL-INSTALACION', 'NOMBRE-VIA-INSTALACION', 'NUM-INSTALACION')).strip()}
        evento, evidencia = c.entidad(FUENTE, 'ID-EVENTO', identidad, {}, 'evento', 'desconocida',
            {'es': fila['TITULO']}, doc, '/', observado,
            bloques={'programacion': programacion(fila), 'lugar': lugar,
                     'url_evento': fila.get('CONTENT-URL'), 'tipo_original': fila.get('TIPO')})
        # Relación solo cuando existe la identidad publicada de actividad/instalación.
        actividad = identidad_url(fila.get('URL-ACTIVIDAD'))
        if actividad and fila.get('TITULO-ACTIVIDAD'):
            a, _ = c.entidad(FUENTE, 'actividad_vgnextoid', actividad, {}, 'actividad', 'ficha',
                {'es': fila['TITULO-ACTIVIDAD']}, doc, '/URL-ACTIVIDAD', observado)
            c.relacion('celebracion_de', evento, a, evidencia)
        recinto = identidad_url(fila.get('URL-INSTALACION'))
        if recinto and lugar['nombre']:
            l, _ = c.entidad(FUENTE, 'instalacion_vgnextoid', recinto, {}, 'lugar', 'recinto',
                {'es': lugar['nombre']}, doc, '/URL-INSTALACION', observado)
            c.relacion('se_celebra_en', evento, l, evidencia)
        tipo = fila.get('TIPO') or ''
        tema = next((t for codigo, t in TEMAS.items()
                     if tipo == '/contenido/actividades/' + codigo
                     or tipo.startswith('/contenido/actividades/' + codigo + '/')), 'cultura')
        c.tema(evento, tema, evidencia, 'madrid:TIPO:revisado-v1')
    return c.terminar()
