"""Subconjunto ICS observado en Vidmar: fechas y UTC, sin recurrencias.

No es un lector universal de iCalendar. Un cambio fuera de este contrato
aborta la pasada para conservar la última recogida buena.
"""

from datetime import datetime, timezone
import re
from urllib.request import Request, urlopen

from .modelo import clave, validar_cuando


FUENTE = 'vidmar-f1'
URL = 'https://f1.vidmar.net/calendar.ics'
FUENTES = {FUENTE: {
    'nombre': 'F1 Calendar — David Vidmar', 'url': 'https://f1.vidmar.net/',
    'flujo': URL, 'atribucion': 'David Vidmar — F1 Calendar',
    'licencia': None, 'condiciones': 'Republicación pendiente de verificar',
    'capacidades': ['calendario'],
}}
MAX_BYTES = 2_000_000
COLECCION = clave(FUENTE, 'calendario')


def _texto(valor):
    return re.sub(r'\\([nN,;\\])', lambda m: '\n' if m[1] in ('n', 'N') else m[1], valor)


def _fecha(propiedad):
    parametros, valor = propiedad
    if parametros == {'VALUE': 'DATE'} and re.fullmatch(r'\d{8}', valor):
        return datetime.strptime(valor, '%Y%m%d').date().isoformat(), 'dia'
    if parametros in ({}, {'VALUE': 'DATE-TIME'}) and re.fullmatch(r'\d{8}T\d{6}Z', valor):
        return datetime.strptime(valor, '%Y%m%dT%H%M%SZ').replace(tzinfo=timezone.utc).isoformat(), 'hora'
    raise ValueError('Fecha ICS no soportada: se requiere DATE o una hora UTC')


def _normalizar(lineas):
    propiedades = {}
    for linea in lineas:
        cabecera, separador, valor = linea.partition(':')
        if not separador:
            raise ValueError('Propiedad ICS sin separador')
        partes = cabecera.split(';')
        nombre = partes[0].upper()
        parametros = {}
        for parte in partes[1:]:
            k, sep, v = parte.partition('=')
            if not sep or k.upper() in parametros:
                raise ValueError('Parámetro ICS inválido')
            parametros[k.upper()] = v
        propiedades.setdefault(nombre, []).append((parametros, valor))
    if any(c in propiedades for c in ('RRULE', 'RDATE', 'EXDATE', 'RECURRENCE-ID', 'DURATION')):
        raise ValueError('Recurrencia, excepción o duración ICS no soportada')

    def unico(nombre, requerido=False):
        valores = propiedades.get(nombre, [])
        if len(valores) > 1 or (requerido and not valores):
            raise ValueError(f'Propiedad ICS ausente o repetida: {nombre}')
        return valores[0] if valores else None

    uid_prop = unico('UID', True)
    if uid_prop[0] or not uid_prop[1].strip():
        raise ValueError('UID ICS inválido')
    uid = uid_prop[1]  # No normalizar, traducir ni reconstruir desde el título.
    titulo_prop = unico('SUMMARY', True)
    if titulo_prop[0] or not titulo_prop[1].strip():
        raise ValueError('SUMMARY ICS sin título o con parámetros no soportados')
    inicio, precision = _fecha(unico('DTSTART', True))
    fin_prop = unico('DTEND')
    fin, precision_fin = _fecha(fin_prop) if fin_prop else (None, precision)
    if precision != precision_fin:
        raise ValueError('Inicio y fin ICS con precisiones diferentes')
    cuando = {'inicio': inicio, 'fin': fin, 'precision': precision,
              'zona': 'UTC' if precision == 'hora' else None, 'fin_exclusivo': True}
    validar_cuando(cuando)
    if fin is not None and fin == inicio:
        raise ValueError('DTEND ICS debe ser posterior a DTSTART')
    estado_prop = unico('STATUS')
    estado = {'CONFIRMED': 'programado', 'CANCELLED': 'cancelado',
              'TENTATIVE': 'provisional'}.get(estado_prop[1].upper() if estado_prop else '', 'desconocido')
    # Sin STATUS no se infiere que una sesión pasada se haya celebrado.
    grupos = {COLECCION: {'tipo': 'coleccion', 'nombres': {'en': 'F1 Calendar'}, 'fuente': FUENTE}}
    for _, categorias in propiedades.get('CATEGORIES', []):
        for categoria in re.split(r'(?<!\\),', categorias):
            categoria = _texto(categoria)
            if categoria:
                grupos[clave(FUENTE, 'categoria:' + categoria)] = {
                    'tipo': 'actividad', 'nombres': {'en': categoria}, 'fuente': FUENTE}
    lugar = unico('LOCATION')
    modificado = unico('LAST-MODIFIED')
    sello = unico('DTSTAMP')
    secuencia = unico('SEQUENCE')
    if secuencia and (secuencia[0] or not secuencia[1].isdigit()):
        raise ValueError('SEQUENCE ICS inválida')
    return {
        'fuente': FUENTE, 'id_externo': uid, 'equivalentes': [],
        'modificado_declarado': _fecha(modificado)[0] if modificado else None,
        'sello_declarado': _fecha(sello)[0] if sello else None,
        'secuencia_declarada': int(secuencia[1]) if secuencia else None,
        'datos': {'titulos': {'en': _texto(titulo_prop[1])}, 'cuando': cuando,
                  'estado': estado, 'lugar': {'nombre': _texto(lugar[1]) if lugar else None},
                  'regiones': [], 'grupos': list(grupos), 'relaciones': []},
        'regiones': {}, 'grupos': grupos,
        'original': {'lineas_vevent': lineas},
    }


def leer(texto):
    if len(texto.encode('utf-8')) > MAX_BYTES:
        raise ValueError('Calendario ICS demasiado grande')
    lineas = []
    for linea in texto.removeprefix('\ufeff').splitlines():
        if linea.startswith((' ', '\t')):
            if not lineas:
                raise ValueError('Continuación ICS sin propiedad')
            lineas[-1] += linea[1:]
        elif linea:
            lineas.append(linea)
    pila, registros, ids, evento, original, cerrado, version = [], [], set(), [], [], False, False
    for linea in lineas:
        control = linea.upper()
        if control.startswith('BEGIN:'):
            componente = control[6:]
            if ((componente == 'VCALENDAR' and (pila or cerrado))
                    or (componente == 'VEVENT' and pila != ['VCALENDAR'])
                    or (componente == 'VALARM' and pila != ['VCALENDAR', 'VEVENT'])
                    or componente not in ('VCALENDAR', 'VEVENT', 'VALARM')):
                raise ValueError('Componente ICS fuera del contrato soportado')
            pila.append(componente)
            if componente == 'VEVENT':
                evento, original = [], []
            elif componente == 'VALARM':
                original.append(linea)
        elif control.startswith('END:'):
            if not pila or pila.pop() != control[4:]:
                raise ValueError('Estructura ICS inválida')
            if control == 'END:VEVENT':
                registro = _normalizar(evento)
                registro['original'] = {'lineas_vevent': original}
                if registro['id_externo'] in ids:
                    raise ValueError('UID repetido en el calendario ICS')
                ids.add(registro['id_externo'])
                registros.append(registro)
                if len(registros) > 2000:
                    raise ValueError('Demasiados eventos ICS')
            elif control == 'END:VCALENDAR':
                cerrado = True
            else:
                original.append(linea)
        elif pila == ['VCALENDAR', 'VEVENT']:
            evento.append(linea)
            original.append(linea)
        elif pila == ['VCALENDAR', 'VEVENT', 'VALARM']:
            original.append(linea)  # Las alarmas no producen citas.
        elif pila == ['VCALENDAR']:
            if control.startswith('VERSION:'):
                if version or control != 'VERSION:2.0':
                    raise ValueError('Versión ICS inválida')
                version = True
            elif control.startswith('METHOD:') and control != 'METHOD:PUBLISH':
                raise ValueError('Método ICS no soportado: solo calendarios publicados')
        else:
            raise ValueError('Contenido fuera del calendario ICS')
    if pila or not cerrado or not version:
        raise ValueError('Calendario ICS incompleto o sin versión 2.0')
    return registros


def recoger():
    solicitud = Request(URL, headers={'Accept': 'text/calendar',
                                      'User-Agent': 'Voceiro/agenda (https://voceiro.eu)'})
    with urlopen(solicitud, timeout=25) as respuesta:
        contenido = respuesta.read(MAX_BYTES + 1)
    if len(contenido) > MAX_BYTES:
        raise ValueError('Calendario ICS demasiado grande')
    return leer(contenido.decode('utf-8'))
