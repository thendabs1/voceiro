"""Adaptador de la agenda JSON de Cultura de Galicia, con paginación acotada."""

from datetime import date, datetime, timezone
import json
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from .modelo import clave


FUENTE = 'cultura-galicia'
URL = 'https://www.cultura.gal/v1/axenda/eventos.json'
ZONA = ZoneInfo('Europe/Madrid')
FUENTES = {FUENTE: {
    'nombre': 'Axenda de Cultura de Galicia', 'url': 'https://www.cultura.gal',
    'catalogo': 'https://abertos.xunta.gal/catalogo/cultura-ocio-deporte/-/dataset/0045/axenda-cultura-galicia',
    'licencia': 'CC BY-SA 4.0', 'licencia_url': 'https://creativecommons.org/licenses/by-sa/4.0/',
    'atribucion': 'Xunta de Galicia — Axenda de Cultura de Galicia',
    'capacidades': ['calendario'],
}}
CAMPOS = ('id,nid,traducionId,dataActualizacion,data,dataOrixinal,estado,'
          'lugarCelebracion,titulo,tipoEvento,ciclo,url,idioma,eventoOnline,urlEventoOnline')


def _id(valor):
    if isinstance(valor, bool) or not str(valor).isdigit() or int(valor) <= 0:
        raise ValueError(f'ID de Galicia inválido: {valor!r}')
    return str(valor)


def _fecha(valor):
    """Preserva fechas y avisa de horas inexistentes o ambiguas por el horario."""
    if not valor:
        return None, 'desconocida', []
    if len(valor) == 10:
        return date.fromisoformat(valor).isoformat(), 'dia', []
    local = datetime.fromisoformat(valor)
    if local.tzinfo:
        return local.isoformat(), 'hora', []
    variantes = []
    for fold in (0, 1):
        candidata = local.replace(tzinfo=ZONA, fold=fold)
        vuelta = candidata.astimezone(timezone.utc).astimezone(ZONA)
        if vuelta.replace(tzinfo=None) == local and candidata.isoformat() not in variantes:
            variantes.append(candidata.isoformat())
    if len(variantes) != 1:
        return None, 'desconocida', ['hora_local_ambigua' if variantes else 'hora_local_inexistente']
    avisos = ['hora_cero_sin_confirmar'] if local.time().isoformat() == '00:00:00' else []
    return variantes[0], 'hora', avisos


def _cuando(datos):
    datos = datos or {}
    inicio, precision, avisos = _fecha(datos.get('dataInicio'))
    fin, precision_fin, avisos_fin = _fecha(datos.get('dataFin'))
    avisos += avisos_fin
    if not inicio or precision != precision_fin or fin == inicio:
        fin = None
    return {'inicio': inicio, 'fin': fin, 'precision': precision,
            'zona': 'Europe/Madrid', 'fin_exclusivo': None,
            'avisos': sorted(set(avisos))}


def normalizar(fila, idioma):
    identificador = _id(fila['id'])
    idioma = fila.get('idioma') or idioma
    if idioma not in ('gl', 'es') or not (fila.get('titulo') or '').strip():
        raise ValueError(f'Idioma o título inválido en Galicia: {identificador}')
    regiones, grupos, relaciones = {}, {}, []
    lugar = fila.get('lugarCelebracion') or {}
    municipio = lugar.get('concello') or {}
    if municipio.get('tid') and municipio.get('nome'):
        region = clave(FUENTE, 'municipio:' + _id(municipio['tid']))
        regiones[region] = {
            'tipo': 'municipio', 'nombres': {idioma: municipio['nome']},
            'padres': [], 'fuente': FUENTE,
            # La fuente usa CPRO+CMUN+DC. Conservar también el dígito de control.
            'identificadores': {'ine_cpro_cmun_dc': str(municipio.get('cod_ine') or '')},
        }
    if fila.get('nid'):
        grupo = clave(FUENTE, 'ficha:' + _id(fila['nid']))
        grupos[grupo] = {'tipo': 'ficha', 'nombres': {idioma: fila['titulo']}, 'fuente': FUENTE}
        relaciones.append({'tipo': 'celebracion_de', 'destino': grupo})
    for campo, tipo in (('tipoEvento', 'actividad'), ('ciclo', 'ciclo')):
        valor = fila.get(campo) or {}
        if valor.get('tid') and valor.get('nome'):
            grupo = clave(FUENTE, tipo + ':' + _id(valor['tid']))
            grupos[grupo] = {'tipo': tipo, 'nombres': {idioma: valor['nome']}, 'fuente': FUENTE}
    estado = fila.get('estado')
    estado = estado.get('chave') if isinstance(estado, dict) else estado
    estado = {None: 'programado', 'cancelled': 'cancelado', 'postponed': 'aplazado'}.get(estado, 'desconocido')
    coordenadas = lugar.get('localizacion') or {}
    datos = {
        'titulos': {idioma: fila['titulo'].strip()}, 'cuando': _cuando(fila.get('data')),
        'estado': estado,
        'lugar': {'nombre': lugar.get('nome'), 'id_externo': lugar.get('espazoId'),
                  'municipio': municipio.get('nome'),
                  'coordenadas': {'latitud': coordenadas.get('latitude'),
                                  'longitud': coordenadas.get('lonxitude')},
                  'online': bool(fila.get('eventoOnline')), 'url_online': fila.get('urlEventoOnline')},
        'regiones': list(regiones),
        'grupos': [g for g in grupos if grupos[g]['tipo'] != 'ficha'],
        'relaciones': relaciones,
    }
    if fila.get('dataOrixinal'):
        datos['cuando_original'] = _cuando(fila['dataOrixinal'])
    return {
        'fuente': FUENTE, 'id_externo': identificador,
        'equivalentes': [_id(fila['traducionId'])] if fila.get('traducionId') else [],
        'url': fila.get('url'), 'idioma': idioma,
        # Fecha del proveedor: no es fecha de publicación ni de celebración.
        'modificado_declarado': fila.get('dataActualizacion'),
        'datos': datos, 'regiones': regiones, 'grupos': grupos, 'original': fila,
    }


def leer_pagina(payload):
    if not isinstance(payload, dict) or not isinstance(payload.get('listaAxenda'), list):
        raise ValueError('Respuesta de Galicia sin listaAxenda')
    total = payload.get('totalResultados')
    if isinstance(total, bool) or not isinstance(total, int) or total < 0:
        raise ValueError('Respuesta de Galicia sin total válido')
    return payload['listaAxenda'], total


def _descargar(url):
    solicitud = Request(url, headers={'Accept': 'application/json',
                                      'User-Agent': 'Voceiro/agenda (https://voceiro.eu)'})
    with urlopen(solicitud, timeout=25) as respuesta:
        contenido = respuesta.read(4_000_001)
    if len(contenido) > 4_000_000:
        raise ValueError('Página de Galicia demasiado grande')
    return json.loads(contenido)


def recoger(inicio, fin, idioma='gl', descargar=None, limite=1000, max_paginas=20):
    """Falla si el inventario cambia durante la paginación o está incompleto."""
    inicio, fin = date.fromisoformat(inicio), date.fromisoformat(fin)
    if not 0 <= (fin - inicio).days <= 90 or idioma not in ('gl', 'es'):
        raise ValueError('Intervalo (máximo 91 días) o idioma inválido')
    if not 1 <= limite <= 1000 or not 1 <= max_paginas <= 20:
        raise ValueError('Límite de recogida inválido')
    descargar = descargar or _descargar
    registros, ids, esperado = [], set(), None
    for pagina in range(max_paginas):
        url = URL + '?' + urlencode({'idioma': idioma, 'inicio': inicio.isoformat(),
            'fin': fin.isoformat(), 'limite': limite, 'paxina': pagina, 'campos': CAMPOS})
        filas, total = leer_pagina(descargar(url))
        if esperado is not None and esperado != total:
            raise ValueError('Cambió el total de Galicia durante la recogida; repetir')
        esperado = total
        if not filas and len(ids) != esperado:
            raise ValueError('Página vacía antes de completar Galicia')
        for fila in filas:
            registro = normalizar(fila, idioma)
            if registro['id_externo'] in ids:
                raise ValueError('ID repetido durante la paginación de Galicia')
            ids.add(registro['id_externo'])
            registros.append(registro)
        if len(ids) == esperado:
            return registros
        if len(ids) > esperado:
            raise ValueError('Galicia devolvió más registros que el total declarado')
    raise ValueError('Galicia supera el límite de páginas; reducir el intervalo')
