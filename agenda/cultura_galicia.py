"""Adaptador de la agenda JSON de Cultura de Galicia, con paginación acotada."""

from datetime import date, datetime, timezone
import json
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from uuid import NAMESPACE_URL, uuid5
from zoneinfo import ZoneInfo

from .modelo import clave
from . import nucleo, tiempos


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
          'lugarCelebracion,titulo,tipoEvento,ciclo,url,idioma,eventoOnline,urlEventoOnline,'
          'tipoPublico,tipoEntrada')
# Se conservan las firmas externas del piloto: cambiar de lector no crea IDs.
TIPO_EXTERNO = 'evento_piloto'
URL_RECOGIDA = URL
INVENTARIO_COMPLETO = False  # La respuesta acredita una ventana y un idioma.


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


def recoger_ventana(inicio, fin, descargar):
    """Producción solo en gallego; una ventana completa no es inventario global."""
    registros = recoger(inicio, fin, 'gl', descargar=lambda url: json.loads(descargar(url)))
    if any(r['idioma'] != 'gl' for r in registros):
        raise ValueError('La recogida de Galicia debe estar en gallego')
    return [r['original'] for r in registros]


def bloques(registro):
    """Evidencia común para la transición guardada y las recogidas nativas."""
    d, original = registro['datos'], registro['original']
    programacion = {'cuando': tiempos.desde_legado(d['cuando']),
        'programacion': d['estado'], 'ejecucion': 'desconocido',
        'estado_original': d['estado']}
    salida = {'programacion': programacion, 'lugar': d['lugar'],
        'url_evento': registro.get('url'), 'tipo_original': original.get('tipoEvento'),
        'origen': {k: original[k] for k in ('tipoPublico', 'tipoEntrada', 'eventoOnline') if k in original}}
    if d.get('cuando_original'):
        salida['cuando_original'] = tiempos.desde_legado(d['cuando_original'])
    etiquetas = [{'id': i, 'nombres': g['nombres']} for i, g in sorted(registro['grupos'].items())
                 if g['tipo'] == 'ciclo']
    if etiquetas:
        salida['etiquetas'] = etiquetas
    return salida


def importar(anterior, filas, observado, url=URL):
    """Importa al núcleo sin escribir el piloto ni fusionar identidades previas."""
    if not isinstance(filas, list):
        raise ValueError('Galicia requiere una lista de celebraciones en gallego')
    c = nucleo.Constructor(anterior)
    c.n['fuentes'][FUENTE] = {**c.n['fuentes'].get(FUENTE, {}), **FUENTES[FUENTE],
        'ingesta': 'nucleo', 'idiomas_recogida': ['gl']}
    vistos = set()
    for fila in filas:
        r = normalizar(fila, 'gl')
        if r['idioma'] != 'gl':
            raise ValueError('La recogida de Galicia debe estar en gallego')
        ref = clave(FUENTE, r['id_externo'])
        if ref in vistos:
            raise ValueError('Celebración de Galicia repetida')
        vistos.add(ref)
        alias = {ref, *(clave(FUENTE, i) for i in r['equivalentes'])}
        existentes = {c.n['referencias'][a]['destino']['id'] for a in alias if a in c.n['referencias']}
        if len(existentes) > 1:
            raise ValueError('Equivalencia entre eventos ya separados de Galicia')
        identidad = next(iter(existentes)) if existentes else str(uuid5(
            NAMESPACE_URL, 'https://voceiro.eu/agenda/' + min(alias)))
        doc = c.documento(FUENTE, {k: fila[k] for k in CAMPOS.split(',') if k in fila},
                          r.get('url') or url, 'fragmento_evento_api')
        evento, evidencia = c.entidad(FUENTE, TIPO_EXTERNO, r['id_externo'], {},
            'evento', 'desconocida', r['datos']['titulos'], doc, '/', observado,
            bloques=bloques(r), identidad=identidad, referencia=ref)
        for a in alias - {ref}:
            if a not in c.n['referencias']:
                c.n['referencias'][a] = {'id': a, 'proveedor': FUENTE,
                    'tipo_externo': TIPO_EXTERNO, 'contexto': {},
                    'id_externo': a[len(FUENTE) + 1:], 'destino': evento}
        # El gallego es la referencia de recogida. Una corrección editorial
        # conserva su prioridad; los alias castellanos no deciden el horario.
        for bloque in ('programacion', 'lugar'):
            politica = c.n['politicas'].get(nucleo.identificador('seleccion', evento, bloque), {})
            if politica.get('modo') != 'editorial':
                c.preferir(evento, bloque, ref, 'Recogida de Galicia solo en gallego')
        lugar, recinto = r['datos']['lugar'], None
        if lugar.get('id_externo') not in (None, '') and lugar.get('nombre'):
            recinto, _ = c.entidad(FUENTE, 'recinto_piloto', str(lugar['id_externo']), {},
                'lugar', 'recinto', {'gl': lugar['nombre']}, doc, '/lugarCelebracion', observado,
                bloques={'literal': lugar})
            c.relacion('se_celebra_en', evento, recinto, evidencia)
        for i, region in r['regiones'].items():
            territorio, _ = c.entidad(FUENTE, 'territorio_piloto', i, {}, 'territorio',
                region['tipo'], region['nombres'], doc, '/lugarCelebracion/concello', observado,
                bloques={'identificadores': region['identificadores']}, identidad=i)
            c.relacion('se_celebra_en', evento, territorio, evidencia)
            if recinto:
                c.relacion('ubicado_en', recinto, territorio, evidencia)
        for i, grupo in r['grupos'].items():
            if grupo['tipo'] != 'ficha':
                continue
            obra, _ = c.entidad(FUENTE, 'grupo_piloto', i, {}, 'actividad', 'ficha', grupo['nombres'],
                doc, '/nid', observado, identidad=i)
            relacion = c.relacion('celebracion_de', evento, obra, evidencia)
            c.n['relaciones'][relacion]['suspendida'] = False
    return c.terminar()
