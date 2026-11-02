"""Comparación entre federaciones durante la importación, sin consultas de red.

Los nombres normalizados sirven para comparar, nunca para construir identidades.
La referencia de la primera cita conserva su identidad en futuras recogidas.
"""
from collections import Counter
from functools import lru_cache
from hashlib import sha256
import json
from pathlib import Path
import re
import unicodedata
from urllib.parse import urlsplit

from . import nucleo

VERSION = 3
FUENTES = {'rfea', 'fga', 'fca'}
PALABRAS = {'campionat': 'campeonato', 'campionato': 'campeonato', 'espanya': 'espana',
            'cros': 'cross', 'carreira': 'carrera', 'cursa': 'carrera', 'marxa': 'marcha',
            'clubs': 'clubes', 'masters': 'master', 'curta': 'corta', 'xornada': 'jornada'}
OMITIR = {'de', 'del', 'do', 'da', 'd', 'en', 'a', 'o', 'la', 'el', 'les', 'los', 'las', 'per', 'por'}


@lru_cache(maxsize=10000)
def normalizar(texto):
    s = ''.join(c for c in unicodedata.normalize('NFD', texto.lower()) if unicodedata.category(c) != 'Mn')
    s = re.sub(r'campo\s+a\s+traves', 'cross', s)
    s = re.sub(r'(?<=\d)(?=[a-z])|(?<=[a-z])(?=\d)', ' ', s)
    return ' '.join(PALABRAS.get(t, t) for t in re.findall(r'[a-z0-9]+', s) if t not in OMITIR)


def nombre_comparable(texto):
    # Etiqueta administrativa exacta, no palabras ni paréntesis deportivos.
    texto = re.sub(r'\(\s*RFEA\s*\)', '', texto, flags=re.I)
    texto = ''.join(c for c in unicodedata.normalize('NFD', texto.lower())
                    if unicodedata.category(c) != 'Mn')
    # 103a / 60è / 27ª: conservar el número de edición. No tocar 10km o Sub16.
    texto = re.sub(r'\b(\d+)(?:a|e|o|ª|º)\b', r'\1', texto)
    return normalizar(texto)


@lru_cache(maxsize=1)
def revisiones_identidad():
    datos = json.loads(Path(__file__).with_name('atletismo-conciliaciones.json').read_text(encoding='utf-8'))
    if datos.get('version') != 1:
        raise ValueError('Versión de conciliaciones desconocida')
    from datetime import date
    revisiones, vistas = [], set()
    for r in datos['conciliaciones']:
        refs = {(f, str(i)) for f, i in r['referencias'].items()}
        date.fromisoformat(r['revision']['fecha'])
        if (r['id'] in vistas or len(refs) < 2 or set(r['referencias']) - FUENTES
                or r['conservar'] not in r['referencias']
                or not r['revision'].get('criterio') or not r['revision'].get('evidencias')):
            raise ValueError('Conciliación sin revisión o referencias válidas')
        if any(refs & {(f, str(i)) for f, i in anterior['referencias'].items()} for anterior in revisiones):
            raise ValueError('Referencia en más de una conciliación')
        vistas.add(r['id'])
        revisiones.append(r)
    return revisiones


def comparar_referencias(a, b):
    comparacion = comparar(a, b)
    par = {(e.get('fuente'), str(e['id'])) for e in (a, b)}
    revision = next((r for r in revisiones_identidad()
                     if len(par) == 2 and par <= {(f, str(i)) for f, i in r['referencias'].items()}), None)
    if revision:
        # La decisión acredita identidad, no la vigencia de fechas o modalidades.
        datos = [] if comparacion['misma_fecha'] else ['fechas diferentes o incompletas']
        ma, mb = modalidades(a), modalidades(b)
        if ma and mb and ma != mb:
            datos.append('modalidades diferentes')
        return {**comparacion, 'estado': 'automatica', 'motivos': [],
                'datos_revisar': datos, 'revision_identidad': revision}
    return comparacion


def sede(e):
    sitio = e.get('lugar') or {}
    # El municipio explícito es preferible al nombre de una instalación.
    return normalizar(sitio.get('city') or sitio.get('municipio_literal') or sitio.get('nombre') or '')


def url_competicion(url):
    if not isinstance(url, str):
        return None
    try:
        u = urlsplit(url)
        host = (u.hostname or '').removeprefix('www.')
    except ValueError:
        return None
    rutas = {'atletismorfea.es': '/calendario/campeonato/',
             'atletismo.gal': '/competicions/', 'fcatletisme.cat': '/event/'}
    if u.scheme not in ('http', 'https') or host not in rutas or not u.path.startswith(rutas[host]):
        return None
    # Solo fichas de competiciones; nunca una portada de organizador compartida.
    if not u.path[len(rutas[host]):].strip('/') or u.query or u.username or u.password:
        return None
    return host + u.path.rstrip('/')


def enlaces(e):
    return {u for u in (url_competicion(e.get('url')),
                        url_competicion((e.get('metadatos') or {}).get('web_organizador'))) if u}


def modalidades(e):
    m = e.get('metadatos') or {}
    literales = [m.get('modalidad_literal') or '', *(x.get('nombre') or '' for x in (m.get('categorias') or []))]
    tabla = {'al': 'al', 'pista aire libre': 'al', 'aire lliure': 'al',
             'st': 'st', 'short track': 'st', 'pista corta': 'st', 'pista coberta': 'st',
             'cross': 'cross', 'ruta': 'ruta', 'marcha': 'marcha',
             'trail': 'trail', 'trail running': 'trail'}
    return {tabla[normalizar(x)] for x in literales if normalizar(x) in tabla}


def comparar(a, b):
    enlace = bool(enlaces(a) & enlaces(b))
    fechas = bool(a.get('inicio') and a.get('fin') and
                  (a['inicio'], a['fin']) == (b.get('inicio'), b.get('fin')))
    if enlace:
        # La ficha enlazada identifica la competición. Un título más amplio,
        # su traducción o las fechas discrepantes no crean otra identidad.
        # Las discrepancias de datos se revisan después de compartir el ID.
        ma, mb = modalidades(a), modalidades(b)
        datos = ([] if fechas else ['fechas diferentes o incompletas'])
        if ma and mb and ma != mb:
            datos.append('modalidades diferentes')
        return {'estado': 'automatica', 'enlace_directo': True, 'nombre': None,
                'misma_fecha': fechas, 'misma_sede': bool(sede(a) and sede(a) == sede(b)),
                'datos_revisar': datos, 'motivos': [], 'version': VERSION}
    solapan = all(e.get('inicio') and e.get('fin') for e in (a, b)) and max(a['inicio'], b['inicio']) <= min(a['fin'], b['fin'])
    if not enlace and not solapan:
        # Dos controles semanales con el mismo título y recinto pueden ser
        # citas distintas. Las actualizaciones de IDs conocidos se comprueban
        # aparte, incluso cuando se trasladan fuera de su ventana anterior.
        return {'estado': 'distintas', 'enlace_directo': False, 'nombre': None,
                'misma_fecha': False, 'misma_sede': None, 'motivos': ['fechas sin solapamiento'], 'version': VERSION}
    ta, tb = set(nombre_comparable(a['nombre']).split()), set(nombre_comparable(b['nombre']).split())
    ta.discard((a.get('inicio') or '')[:4])
    tb.discard((b.get('inicio') or '')[:4])
    parecido = 2 * len(ta & tb) / (len(ta) + len(tb)) if ta and tb else 0
    lugar = bool(sede(a) and sede(a) == sede(b))
    numeros_a = {t for t in ta if t.isdigit() or re.fullmatch(r'[ivxlcdm]+', t)} - {(a.get('inicio') or '')[:4]}
    numeros_b = {t for t in tb if t.isdigit() or re.fullmatch(r'[ivxlcdm]+', t)} - {(b.get('inicio') or '')[:4]}
    # Distancia, edición y edades escritas en el título no se borran al comparar.
    numeros = numeros_a == numeros_b
    dimensiones = {'master', 'absoluto', 'masculino', 'femenino', 'mixto', 'individual', 'clubes', 'relevos', 'promocion'}
    categorias = (ta & dimensiones) == (tb & dimensiones)
    distancias = re.findall(r'\b(\d+) (km|m)\b', normalizar(a['nombre'])) == re.findall(r'\b(\d+) (km|m)\b', normalizar(b['nombre']))
    ma, mb = modalidades(a), modalidades(b)
    modalidad = not ma or not mb or ma == mb
    compuesto = any(re.search(r'\([^)]*(?:internacional|campeonato|campionat)|\s[+/]\s', e['nombre'], re.I)
                    for e in (a, b))
    motivos = []
    if not fechas:
        motivos.append('fechas diferentes o incompletas')
    if not lugar:
        motivos.append('sedes diferentes o incompletas')
    if not numeros:
        motivos.append('distancia, edad o edición diferentes')
    if not categorias or not distancias:
        motivos.append('categoría, formato o distancia de distinto alcance')
    if not modalidad:
        motivos.append('modalidades diferentes')
    if compuesto:
        motivos.append('posible relación entre conjunto y partes')
    automatica = fechas and lugar and numeros and categorias and distancias and modalidad and not compuesto and len(ta & tb) >= 3 and parecido >= .9
    if automatica:
        estado = 'automatica'
    elif enlace or parecido >= .65 and (fechas or lugar):
        estado = 'revisar'
        if not motivos:
            motivos.append('nombre insuficientemente coincidente')
    else:
        estado = 'distintas'
    return {'estado': estado, 'enlace_directo': enlace, 'nombre': round(parecido, 4),
            'misma_fecha': fechas, 'misma_sede': lugar, 'motivos': motivos, 'version': VERSION}


def actuales(n):
    salida = []
    if not n:
        return salida
    ultimas = sorted(nucleo.ultimas(n))
    recuento = Counter(n['observaciones'][i]['referencia'] for i in ultimas)
    for i in ultimas:
        o = n['observaciones'][i]
        r = n['referencias'][o['referencia']]
        if r['proveedor'] not in FUENTES or r['tipo_externo'] != 'competicion':
            continue
        b = o['bloques']
        cuando = b['programacion']['cuando']
        salida.append({'fuente': r['proveedor'], 'id': r['id_externo'],
            'nombre': next(iter(b['nombres'].values())), 'url': b.get('url_evento'),
            'inicio': cuando['inicio']['fecha'], 'fin': cuando['fin']['fecha'],
            'estado': b['programacion'].get('programacion', 'desconocido'),
            'lugar': b.get('lugar'), 'metadatos': b.get('atletismo') or {},
            'destino': r['destino'], 'grupo': (b.get('agenda') or {}).get('grupo'),
            'referencia': r['id'], 'lectura_ambigua': recuento[r['id']] > 1})
    return salida


def distribucion(fuente, identificador):
    # Nivel II y las fichas mensuales son distribuciones distintas de RFEA.
    return (fuente, str(identificador).startswith('nivel-ii:'))


def decidir(fuente, evento, conocidos):
    candidatos = []
    for c in conocidos:
        if distribucion(c['fuente'], c['id']) == distribucion(fuente, evento['id']):
            continue
        comparacion = comparar_referencias({**evento, 'fuente': fuente}, c)
        if comparacion['estado'] != 'distintas':
            candidatos.append({'cita': c, 'comparacion': comparacion})
    directos = [c for c in candidatos if c['comparacion']['enlace_directo']
                or c['comparacion'].get('revision_identidad')]
    if directos:
        # El nombre de un meeting puede aparecer en la ficha de su campeonato.
        # Un enlace o revisión explícitos tienen prioridad sobre los parecidos.
        # Si se contradicen entre sí, conservar ambos candidatos para revisión.
        candidatos = directos
    destinos = {c['cita']['destino']['id'] for c in candidatos}
    automaticos = [c for c in candidatos if c['comparacion']['estado'] == 'automatica']
    # Una sola identidad candidata y ninguna variante ambigua. No elegir el
    # parecido mayor cuando varias competiciones pueden corresponder a la cita.
    if len(destinos) == 1 and automaticos and all(not c['cita']['lectura_ambigua'] and c['cita']['grupo'] for c in candidatos):
        elegido = automaticos[0]
        destino = elegido['cita']['destino']
        if not any(distribucion(c['fuente'], c['id']) == distribucion(fuente, evento['id']) and c['destino'] == destino and c['id'] != str(evento['id'])
                   for c in conocidos):
            return {'estado': 'automatica', **elegido}
    return {'estado': 'revisar' if candidatos else 'nueva', 'candidatos': candidatos}


def decidir_lote(n, fuente, eventos):
    conocidos = actuales(n)
    decisiones = {str(e['id']): decidir(fuente, e, conocidos) for e in eventos}
    destinos = Counter(d['cita']['destino']['id'] for d in decisiones.values() if d['estado'] == 'automatica')
    for d in decisiones.values():
        if d['estado'] == 'automatica' and destinos[d['cita']['destino']['id']] > 1:
            d.update(estado='revisar', candidatos=[{'cita': d['cita'], 'comparacion': d['comparacion']}])
    return decisiones


def incidencias(n):
    """Casos pendientes entre identidades distintas, con clave estable por par."""
    conocidos = actuales(n)
    salida = {}
    for pos, a in enumerate(conocidos):
        for b in conocidos[pos + 1:]:
            if distribucion(a['fuente'], a['id']) == distribucion(b['fuente'], b['id']):
                continue
            comparacion = comparar_referencias(a, b)
            if a['destino'] == b['destino'] and comparacion.get('datos_revisar'):
                comparacion = {**comparacion, 'estado': 'revisar', 'motivos': comparacion['datos_revisar']}
            if a['destino'] == b['destino'] and not comparacion['misma_fecha']:
                comparacion = {**comparacion, 'estado': 'revisar', 'motivos': ['discrepancia de fechas en una identidad ya compartida']}
            if comparacion['estado'] == 'distintas':
                continue
            if a['destino'] == b['destino']:
                manual_a = a['metadatos'].get('equivalencia_revisada')
                manual_b = b['metadatos'].get('equivalencia_revisada')
                if comparacion['estado'] == 'automatica' or (manual_a and manual_a == manual_b and comparacion['misma_fecha']):
                    continue
            par = sorted([(a['fuente'], a['id']), (b['fuente'], b['id'])])
            clave = sha256(nucleo.json_canonico(par).encode()).hexdigest()[:24]
            salida[clave] = {'clave': clave, 'citas': sorted([a, b], key=lambda c: (c['fuente'], c['id'])),
                             'comparacion': comparacion,
                             'motivo': 'Identidades ya existentes: requieren conciliación explícita'
                                if comparacion['estado'] == 'automatica' else '; '.join(comparacion['motivos'])}
    return [salida[k] for k in sorted(salida)]
