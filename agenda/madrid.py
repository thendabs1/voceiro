"""Agenda municipal de Madrid: ID-EVENTO y recinto acreditados.

No usa el índice de CKAN ni título/fecha como identidad. Una programación
prolongada se conserva como intervalo con sus restricciones, sin expandirla.
URL-ACTIVIDAD no acredita una obra: suele ser un contenedor («Actividades en
el Centro Cultural…») o un ciclo, y su título queda en la evidencia.
"""

from datetime import date, datetime
import math
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo

from . import nucleo, tiempos


FUENTE = 'madrid'
URL = 'https://datos.madrid.es/api/3/action/datastore_search?resource_id=300107-2-agenda-actividades-eventos-csv'
CATALOGO = 'https://datos.madrid.es/dataset/300107-0-agenda-actividades-eventos'
FAMILIA, URL_RECOGIDA = 'ckan', URL
CAMPO_ID = TIPO_EXTERNO = 'ID-EVENTO'
FECHAS = ('FECHA', 'FECHA-FIN')
CAMPOS = ('ID-EVENTO', 'TITULO', 'FECHA', 'FECHA-FIN', 'HORA', 'LARGA-DURACION', 'DIAS-SEMANA',
          'DIAS-EXCLUIDOS', 'CONTENT-URL', 'TITULO-ACTIVIDAD', 'URL-ACTIVIDAD', 'URL-INSTALACION',
          'NOMBRE-INSTALACION', 'CLASE-VIAL-INSTALACION', 'NOMBRE-VIA-INSTALACION', 'NUM-INSTALACION',
          'DISTRITO-INSTALACION', 'BARRIO-INSTALACION', 'CODIGO-POSTAL-INSTALACION', 'LATITUD', 'LONGITUD', 'TIPO',
          'GRATUITO', 'AUDIENCIA')
# Campos en bruto para clasificar al publicar (precio y público). PRECIO es texto libre
# largo y GRATUITO ya dice lo filtrable.
ORIGEN = ('GRATUITO', 'AUDIENCIA')
DIAS = {'L': 0, 'M': 1, 'X': 2, 'J': 3, 'V': 4, 'S': 5, 'D': 6}


def coordenadas(fila):
    """Posición declarada del recinto; el municipio se acredita con límites oficiales."""
    try:
        latitud, longitud = float(fila['LATITUD']), float(fila['LONGITUD'])
    except (KeyError, TypeError, ValueError):
        return {}
    if not (math.isfinite(latitud) and math.isfinite(longitud)
            and -90 <= latitud <= 90 and -180 <= longitud <= 180):
        return {}
    return {'coordenadas': {'latitud': latitud, 'longitud': longitud}}


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
    c.n['fuentes'][FUENTE] = {**c.n['fuentes'].get(FUENTE, {}),
        'nombre': 'Agenda de Madrid', 'url': CATALOGO,
        'atribucion': 'Ayuntamiento de Madrid · datos normalizados por Voceiro',
        'licencia': 'CC BY 4.0', 'licencia_url': 'https://creativecommons.org/licenses/by/4.0/',
        'capacidades': ['calendario'], 'modo': 'recogida_manual',
        'condiciones': 'Atribución y enlace al original; actualización diaria del proveedor'}
    # Las celebraciones que unían eventos a URL-ACTIVIDAD se suspenden, también
    # fuera de esta recogida; relación y evidencia se conservan.
    fichas = {nucleo.clave(r['destino']) for r in c.n['referencias'].values()
              if r['proveedor'] == FUENTE and r['tipo_externo'] == 'actividad_vgnextoid'}
    for r in c.n['relaciones'].values():
        if r['tipo'] == 'celebracion_de' and nucleo.clave(r['destino']) in fichas:
            r['suspendida'] = True
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
        # `_id` (fila CKAN), descripción o el texto del precio crearían evidencia sin cambio de cita.
        doc = c.documento(FUENTE, {k: fila[k] for k in CAMPOS if k in fila}, url, 'fragmento_registro_ckan')
        lugar = {'nombre': fila.get('NOMBRE-INSTALACION'), 'url': fila.get('URL-INSTALACION'),
                 'direccion': ' '.join(str(fila.get(k) or '') for k in
                    ('CLASE-VIAL-INSTALACION', 'NOMBRE-VIA-INSTALACION', 'NUM-INSTALACION')).strip()}
        evento, evidencia = c.entidad(FUENTE, 'ID-EVENTO', identidad, {}, 'evento', 'desconocida',
            {'es': fila['TITULO']}, doc, '/', observado,
            bloques={'programacion': programacion(fila), 'lugar': lugar,
                     'url_evento': fila.get('CONTENT-URL'), 'tipo_original': fila.get('TIPO'),
                     'origen': {k: fila[k] for k in ORIGEN if fila.get(k) not in (None, '')}})
        # Relación solo cuando existe la identidad publicada de la instalación.
        recinto = identidad_url(fila.get('URL-INSTALACION'))
        if recinto and lugar['nombre']:
            # Documento propio del recinto, compartido por sus eventos: un cambio
            # de cita no es evidencia nueva de la instalación.
            instalacion = c.documento(FUENTE, {k: fila[k] for k in ('URL-INSTALACION', 'NOMBRE-INSTALACION',
                'LATITUD', 'LONGITUD') if k in fila}, url, 'fragmento_instalacion_ckan')
            l, _ = c.entidad(FUENTE, 'instalacion_vgnextoid', recinto, {}, 'lugar', 'recinto',
                {'es': lugar['nombre']}, instalacion, '/URL-INSTALACION', observado, bloques=coordenadas(fila))
            c.relacion('se_celebra_en', evento, l, evidencia)
    return c.terminar()
