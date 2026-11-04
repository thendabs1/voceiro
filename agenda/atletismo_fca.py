"""FCA: datos literales de Tribe y de la ficha, sin leer el contenido de documentos.

«Organitzador(s)» es el rótulo contrastado en las fichas FCA para `organizer`.
Las categorías mezclan modalidades y edades: no acreditan calendario ni actividad.
`Reglament` y `Resultats` solo constan en la ficha: Tribe no los publica.
"""
import re
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup

API = 'https://fcatletisme.cat/wp-json/tribe/events/v1/events'
ESPANA = re.compile(r'\bcamp(?:ionat|eonato) d(?:e |[’\'])espa(?:nya|ña)\b', re.I)
ESTADO_TITULO = re.compile(r'\b(?:ajornat|ajornada|suspès|suspesa|cancel·lat|cancel·lada|anul·lat|anul·lada)\b', re.I)
AUTORIDADES = {'Federació Catalana d’Atletisme': 'fca',
               'Real Federación Española de Atletismo': 'rfea',
               'WA (World Athletics)': 'wa', 'EA (European Athletics)': 'ea'}
CAMPOS_FICHA = {'Reglament': 'reglamento', 'Resultats': 'resultados'}


def texto(html):
    """Texto independiente de clases, estilos, saltos y espacios del editor."""
    s = BeautifulSoup(html, 'html.parser')
    for marca in s.select('script, style'):
        marca.decompose()
    return ' '.join(s.get_text(' ', strip=True).split())


def evidencia(url, localizador, literal, superficie='api'):
    return {'superficie': superficie, 'url': url, 'localizador': localizador, 'literal': literal}


def url_publica(valor, base):
    if not isinstance(valor, str) or not valor.strip() or valor.strip().startswith('#'):
        return None
    url = urljoin(base, valor.strip())
    try:
        p = urlsplit(url)
        p.port
        if (p.scheme != 'https' or not p.hostname or p.username or p.password
                or any(c.isspace() for c in url)):
            return None
    except ValueError:
        return None
    return url


def rol(literal):
    """Solo la etiqueta/sección publicada; nunca el nombre del archivo destino."""
    for patron, valor in ((r'\bresultats?\b|\bresultados?\b', 'resultados'),
            (r'\breglament\b|\breglamento\b', 'reglamento'),
            (r'\bnormes?\b|\bnormas?\b|\bnormativa\b', 'normas'),
            (r'\bhorari\b|\bhorario\b|\bprograma\b', 'horario'),
            (r'\binscrit[sa]?\b|\binscritos?\b|\badmes[oa]s?\b|\badmitid[oa]s?\b', 'inscritos'),
            (r'\bclassificaci[oó]\b|\bclasificaci[oó]n\b', 'clasificacion'),
            (r'\bcircular\b', 'circular'), (r'\bacta\b', 'acta'),
            (r'informaci[oó] (?:t[eè]cnica|complement[aà]ria)', 'informacion_tecnica')):
        if re.search(patron, literal, re.I):
            return valor
    return 'otro'


def documentos(html, url, localizador='description', superficie='api', *, base=None):
    s = BeautifulSoup(html, 'html.parser')
    salida = []
    seccion = ''
    for nodo in s.find_all(['h2', 'h3', 'h4', 'dt', 'a']):
        if nodo.name != 'a':
            seccion = texto(str(nodo))
            continue
        destino = url_publica(nodo.get('href'), base or url)
        if not destino:
            continue
        nombre = texto(str(nodo))
        literal = nombre or seccion or 'Enlace sin etiqueta'
        valor = rol(nombre)
        if valor == 'otro' and seccion:
            valor = rol(seccion)
            literal = seccion + (' / ' + nombre if nombre else '')
        d = {'url': destino, 'nombre': nombre or seccion or 'Enlace sin etiqueta', 'rol': valor,
             'evidencia': evidencia(url, localizador, literal, superficie)}
        if not any(x['url'] == destino and x['rol'] == valor for x in salida):
            salida.append(d)
    return salida


def relacion(url, nombre, espana, entidades, web):
    """Propio o reflejo por autoridad, con la misma regla que FGA.

    El título reservado por ley manda aunque la FCA organice o coorganice. Un
    destino RFEA sin resolver (también hay otra edición y 404) no acredita
    reflejo: conserva la señal literal y deja la relación desconocida.
    """
    autoridades = [AUTORIDADES.get(o) for o in entidades]
    ajena = next((a for a in autoridades if a and a != 'fca'), None)
    if ajena and (espana or 'fca' not in autoridades):
        return {'relacion': 'reflejo', 'de': ajena, 'evidencia': evidencia(url, 'organizer', ' / '.join(entidades))}
    if espana:
        return {'relacion': 'reflejo', 'evidencia': evidencia(url, 'title', nombre)}
    if web and urlsplit(web).hostname == 'atletismorfea.es':
        return {'relacion': 'desconocido', 'evidencia': evidencia(url, 'website', web)}
    if 'fca' in autoridades and not ajena:
        return {'relacion': 'propio', 'evidencia': evidencia(url, 'organizer', ' / '.join(entidades))}
    return {'relacion': 'desconocido'}


def enriquecer(e):
    """Datos aditivos: no modifica título, fechas, sede ni enlaces del comparador."""
    for campo in ('description', 'website', 'cost'):
        if campo in e and not isinstance(e[campo], str):
            raise ValueError('FCA: esquema no reconocido en ' + campo)
    for campo in ('categories', 'tags', 'organizer'):
        if campo in e and (not isinstance(e[campo], list)
                          or any(not isinstance(x, dict) for x in e[campo])):
            raise ValueError('FCA: esquema no reconocido en ' + campo)
    url = API + '/' + str(e['id'])
    descripcion = e.get('description', '')
    descripcion_texto = texto(descripcion)
    salida = {'documentos': documentos(descripcion, url, base=e['url']),
              'alcance': {'tipo': 'desconocido'}, 'actividad': {'valor': 'desconocida'},
              'fuente': {'relacion': 'desconocido'},
              'temporalidad': {'texto': e['start_date'] + ' / ' + e['end_date'], 'precision': 'dia',
                  'estado': 'desconocido', 'evidencia': evidencia(url, 'start_date / end_date',
                      e['start_date'] + ' / ' + e['end_date'])}}
    if descripcion_texto:
        salida['descripcion'] = {'texto': descripcion_texto, 'evidencia': {'superficie': 'api', 'url': url,
                                                                           'localizador': 'description'}}
    entidades = []
    for n, o in enumerate(e.get('organizer', [])):
        if not isinstance(o.get('organizer'), str):
            raise ValueError('FCA: organizer sin nombre literal')
        entidad = texto(o['organizer'])
        if entidad:
            entidades.append({'rol': 'organiza', 'entidad_literal': entidad,
                'evidencia': evidencia(url, f'organizer[{n}].organizer', entidad)})
    if entidades:
        salida['organizacion'] = entidades
    nombre = texto(e['title'])
    espana = ESPANA.search(nombre)
    salida['fuente'] = relacion(url, nombre, espana, [o['entidad_literal'] for o in entidades], e.get('website', ''))
    if espana:
        salida['titulos'] = [{'literal': nombre, 'autoridad': 'federacion_espanola',
            'base': 'nombre_reservado', 'evidencia': evidencia(url, 'title', nombre)}]
    if e.get('tags'):
        salida['etiquetas'] = [{'id': t['id'], 'nombre': texto(t['name'])} for t in e['tags']]
    if e.get('cost'):
        salida['coste_literal'] = texto(e['cost'])
    sitio = e.get('venue') or {}
    if not isinstance(sitio, dict):
        raise ValueError('FCA: esquema no reconocido en venue')
    # La dirección amplía el detalle; el lugar de la cita mantiene su valor previo.
    if sitio.get('address'):
        salida['sede_detalle'] = {'direccion_literal': texto(sitio['address']),
            'evidencia': evidencia(url, 'venue.address', texto(sitio['address']))}
    return salida


def leer_ficha(html, i, url):
    """Documentos de los campos de la ficha, que debe acreditar el ID de la cita."""
    s = BeautifulSoup(html, 'html.parser')
    if s.select_one(f'.post-{i}.tribe_events') is None or s.select_one('.tribe-events-event-meta') is None:
        raise ValueError('la página no acredita la cita')
    salida = []
    for dt in s.select('.tribe-events-event-meta dt'):
        etiqueta = texto(str(dt)).rstrip(' :')
        dd = dt.find_next_sibling('dd')
        if etiqueta not in CAMPOS_FICHA or dd is None:
            continue
        for a in dd.select('a[href]'):
            destino = url_publica(a['href'], url)
            nombre = texto(str(a)) or etiqueta
            if destino:
                salida.append({'url': destino, 'nombre': nombre, 'rol': CAMPOS_FICHA[etiqueta],
                               'evidencia': evidencia(url, f'dl/{etiqueta}', nombre, 'ficha')})
    return salida


def completar_fichas(eventos, obtener, conocidas=()):
    """Añade lo exclusivo de ficha; un fallo conserva lo anterior y no anula el inventario.

    Un 403 o 429 corta esta superficie, no la lectura de la API. El presupuesto
    agotado sí se propaga: no se importa una recogida parcial.
    """
    anteriores = {c['id']: [d for d in c['metadatos'].get('documentos', [])
                            if d.get('evidencia', {}).get('superficie') == 'ficha']
                  for c in conocidas if c['fuente'] == 'fca' and not c.get('lectura_ambigua')}
    informe, bloqueada = {'leidas': 0, 'documentos': 0, 'fallidas': []}, False
    for e in eventos:
        nuevos = None
        if not bloqueada:
            try:
                nuevos = leer_ficha(obtener(e['url']), e['id'], e['url'])
                informe['leidas'] += 1
                informe['documentos'] += len(nuevos)
            except HTTPError as error:
                bloqueada = error.code in (403, 429)
                informe['fallidas'].append({'id': e['id'], 'motivo': f'HTTP {error.code}'})
            except (OSError, ValueError) as error:
                if 'presupuesto' in str(error):
                    raise
                informe['fallidas'].append({'id': e['id'], 'motivo': f'{type(error).__name__}: {error}'[:200]})
        meta = e['metadatos']
        presentes = {(d['url'], d['rol']) for d in meta['documentos']}
        meta['documentos'] += [d for d in (anteriores.get(e['id'], []) if nuevos is None else nuevos)
                               if (d['url'], d['rol']) not in presentes]
    return informe


def avisos(eventos):
    salida = []
    for e in eventos:
        if ESTADO_TITULO.search(e['nombre']):
            salida.append({'id': e['id'], 'url': e['url'],
                'motivo': 'estado solo en el título; se conserva sin interpretar', 'literal': e['nombre']})
        meta = e['metadatos']
        if meta['fuente']['relacion'] == 'desconocido' and meta.get('web_organizador'):
            web = meta['web_organizador']
            if urlsplit(web).hostname == 'atletismorfea.es':
                salida.append({'id': e['id'], 'url': web,
                    'motivo': 'website RFEA sin resolver a la misma edición; relación desconocida'})
    return salida
