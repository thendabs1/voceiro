"""Adaptador FGA: publicaciones nativas, evidencia y cobertura por superficie.

No descarga documentos: usa sus enlaces y, donde existe, la lectura documental
revisada del catálogo local. El resto queda desconocido o pendiente de revisión.
"""
from calendar import monthrange
from datetime import date, datetime
from functools import lru_cache
import json
from pathlib import Path
import re
from urllib.error import HTTPError
from urllib.parse import urlencode, urljoin, urlsplit

from bs4 import BeautifulSoup

from . import atletismo as a

BASE = 'https://atletismo.gal/competicions/'
API = 'https://atletismo.gal/wp-json/fga/v1/competitions'
AMBITOS = ('Autonómico', 'Nacional', 'Internacional')
ESPANA = re.compile(r'\bcamp(?:ionato|eonato) de espa[ñn]a\b', re.I)
PROPIA = re.compile(r'federaci[oó]n galega de atletismo|\bFGA\b')
AJENAS = ((re.compile(r'\bRFEA\b|federaci[oó]n espa[ñn]ola de atletismo', re.I), 'rfea'),
          (re.compile(r'european athletics', re.I), 'ea'), (re.compile(r'world athletics', re.I), 'wa'))


class FechasDudosas(ValueError):
    pass


def evidencia(url, localizador, literal, superficie='ficha'):
    return {'superficie': superficie, 'url': url, 'localizador': localizador, 'literal': literal}


def url_publica(valor, base=BASE):
    if not isinstance(valor, str) or not valor.strip():
        return None
    url = urljoin(base, valor.strip())
    try:
        p = urlsplit(url)
        p.port
        if p.scheme not in ('http', 'https') or not p.hostname or p.username or p.password or any(c.isspace() for c in url):
            return None
    except ValueError:
        return None
    return url


def identidad(articulo):
    ids = [c[5:] for c in articulo.get('class', []) if re.fullmatch(r'post-\d+', c)]
    if len(ids) != 1:
        raise ValueError('FGA: publicación sin identidad inequívoca')
    return ids[0]


def fechas(literales):
    """Conserva los días declarados: el guion no acredita los intermedios."""
    if not literales or any(not re.fullmatch(r'\d{2}/\d{2}/\d{4}|-', x) for x in literales):
        raise FechasDudosas('fechas ausentes o ilegibles')
    try:
        dias = [datetime.strptime(x, '%d/%m/%Y').date() for x in literales if x != '-']
    except ValueError as error:
        raise FechasDudosas('fecha no válida') from error
    if not dias or dias != sorted(dias) or (dias[-1] - dias[0]).days > 90:
        raise FechasDudosas('fechas incompatibles (orden o duración superior a 91 días)')
    if '-' in literales and (len(literales) % 2 != 1 or set(literales[1::2]) != {'-'}):
        raise FechasDudosas('separadores de fecha no reconocidos')
    return sorted({d.isoformat() for d in dias})


def temporalidad(literales, url, localizador):
    dias = fechas(literales)
    return {'texto': ' '.join(literales), 'dias': dias, 'precision': 'dia',
            'estado': 'desconocido', 'evidencia': evidencia(url, localizador, ' '.join(literales))}


def relacion(url, ambitos, entidades, nombre):
    """Propio o reflejo por autoridad, con el calendario de reserva.

    Lo decide quién organiza, que la ficha suele declarar. Una organización ajena
    pesa más que la etiqueta: un Campeonato de España en Galicia está en el
    calendario gallego y sigue siendo de la RFEA. Si no consta, se usa la etiqueta,
    que solo sirve desde 2026: sin «Autonómico», la cita no es del calendario gallego.
    """
    ajena = next((codigo for e in entidades if not PROPIA.search(e)
                  for patron, codigo in AJENAS if patron.search(e)), None)
    if ajena and not any(PROPIA.search(e) for e in entidades):
        return {'relacion': 'reflejo', 'de': ajena, 'evidencia': evidencia(url, 'Organización', ', '.join(entidades))}
    if ambitos and 'Autonómico' not in ambitos:
        return {'relacion': 'reflejo', 'evidencia': evidencia(url, 'etiquetas', ', '.join(sorted(ambitos)))}
    if ESPANA.search(nombre) and not any(PROPIA.search(e) for e in entidades):
        return {'relacion': 'reflejo', 'evidencia': evidencia(url, 'h1', nombre)}
    if 'Autonómico' in ambitos:
        return {'relacion': 'propio', 'evidencia': evidencia(url, 'etiquetas', 'Autonómico')}
    return {'relacion': 'desconocido'}


def leer_listado(html, *, url=BASE, pendientes=None):
    s = BeautifulSoup(html, 'html.parser')
    lista = s.select_one('#competitionList')
    if lista is None or s.select('.pagination a, .page-numbers, .load-more'):
        raise ValueError('FGA: listado ausente o paginación no contrastada')
    eventos, vistos = [], set()
    for art in lista.select('article.type-competition'):
        i = identidad(art)
        if i in vistos:
            raise ValueError('FGA: ID repetido en el listado')
        vistos.add(i)
        titulo = art.select_one('h2 a[href]')
        if titulo is None or not a.texto(titulo) or not url_publica(titulo['href']):
            raise ValueError('FGA: publicación sin enlace o título')
        enlace = a.enlace('fga', titulo['href'])
        try:
            t = temporalidad([a.texto(x) for x in art.select('div.space-x-2 > div > span')], enlace, 'listado/fechas')
        except FechasDudosas as error:
            if pendientes is None:
                raise
            pendientes.append({'id': i, 'url': enlace, 'motivo': str(error), 'cuarentena': True})
            continue
        padre = art.select_one('h2 + a[href]')
        eventos.append({'id': i, 'nombre': a.texto(titulo), 'url': enlace,
            'inicio': t['dias'][0], 'fin': t['dias'][-1],
            'lugar': {'nombre': a.texto(art.select_one('div.basis-5\\/12'))},
            'metadatos': {'modalidad_literal': a.texto(art.select_one('div.space-x-2 > span')),
                'etiquetas_listado': [a.texto(x) for x in art.select('div.space-x-2 > span')],
                'ambitos_literales': sorted({x['alt'] for x in art.select('img[alt]') if x['alt'] in AMBITOS}),
                'delegaciones': [c.removeprefix('delegation-') for c in art.get('class', []) if c.startswith('delegation-')],
                'circuito_declarado': {'nombre': a.texto(padre), 'url': a.enlace('fga', padre['href'])} if padre else None,
                'temporalidad': t}})
    return eventos


def leer_api(contenido):
    datos = json.loads(contenido)
    if not isinstance(datos, list):
        raise ValueError('FGA: API sin lista de publicaciones')
    salida = {}
    for e in datos:
        if (not isinstance(e, dict) or type(e.get('id')) is not int or e['id'] <= 0
                or not isinstance(e.get('title'), str) or not e['title'].strip()
                or not isinstance(e.get('all_dates'), list)
                or not isinstance(e.get('main_date'), str)):
            raise ValueError('FGA: esquema API no reconocido')
        i = str(e['id'])
        if i in salida:
            raise ValueError('FGA: ID repetido en API')
        # Una fecha inválida es anomalía del registro, no un cambio del esquema.
        salida[i] = e
    return salida


def rol(nombre, seccion):
    n = nombre.casefold()
    if seccion == 'Resultados' or 'resultado' in n:
        return 'resultados'
    for patron, valor in ((r'clasificaci', 'clasificacion'), (r'regulamento|reglamento', 'reglamento'),
            (r'normativa|normas', 'normas'), (r'horario|cadencias|cámara|camara', 'horario'),
            (r'inscrit|admitid|listaxe', 'inscritos'), (r'circular', 'circular')):
        if re.search(patron, n):
            return valor
    return 'informacion_tecnica' if seccion == 'Información' else 'otro'


@lru_cache(maxsize=1)
def lecturas_documentales():
    return json.loads(Path(__file__).with_name('atletismo-fga-documentos.json').read_text(encoding='utf-8'))


def leer_ficha(html, *, url=BASE):
    s = BeautifulSoup(html, 'html.parser')
    art = s.select_one('main article.type-competition')
    if art is None or art.select_one('h1') is None:
        raise ValueError('FGA: ficha sin publicación')
    i, nombre = identidad(art), a.texto(art.select_one('h1'))
    salida = {'etiquetas_literales': [a.texto(x) for x in art.select('.competition-label__text')],
              'documentos': [], 'alcance': {'tipo': 'desconocido'},
              'actividad': {'valor': 'desconocida'}}
    avisos, secciones = [], {}
    for h in art.select('h2'):
        seccion = a.texto(h)
        if seccion not in ('Información', 'Inscrición', 'Documentos', 'Resultados', 'Ligazóns', 'Organización'):
            continue
        contenedor = h.parent
        secciones[seccion] = contenedor
        if seccion == 'Inscrición':
            inscripcion = {'plazo_textual': ' '.join(a.texto(p) for p in contenedor.select('p')),
                'enlaces': [{'nombre': a.texto(x), 'url': u} for x in contenedor.select('a[href]')
                            if (u := url_publica(x['href'])) and urlsplit(u).scheme == 'https']}
            m = re.fullmatch(r'Datas: (\d{2}/\d{2}/\d{4}) a (\d{2}/\d{2}/\d{4})(?: ás (\d{2}:\d{2}))?', inscripcion['plazo_textual'])
            if m:
                d, f = (datetime.strptime(x, '%d/%m/%Y').date().isoformat() for x in m.group(1, 2))
                from . import deporte
                inscripcion.update(periodo=deporte.dias(d, f), hora_cierre_literal=m[3])
            salida['inscripcion'] = inscripcion
        for x in contenedor.select('.competition-links a[href]'):
            u = url_publica(x['href'])
            if not u or seccion in ('Organización', 'Ligazóns') or seccion == 'Inscrición' and not re.search(r'inscrit|admitid|listaxe', a.texto(x), re.I):
                continue
            d = {'nombre': a.texto(x) or seccion, 'url': u, 'rol': rol(a.texto(x), seccion),
                 'evidencia': evidencia(url, seccion + '/a', a.texto(x) or seccion)}
            if d not in salida['documentos']:
                salida['documentos'].append(d)
    ambitos = set(salida['etiquetas_literales']) & set(AMBITOS)
    if 'Autonómico' in ambitos:
        literal = ', '.join(sorted(ambitos))
        salida['calendarios'] = [{'calendario': 'fga', 'categoria_literal': literal,
                                  'evidencia': evidencia(url, 'etiquetas', literal)}]
    bloque = secciones.get('Organización')
    entidades = [a.texto(x) for x in bloque.select('.font-semibold')] if bloque else []
    if entidades := [e for e in entidades if e]:
        salida['organizacion'] = [{'rol': 'organiza', 'entidad_literal': e, 'evidencia': evidencia(url, 'Organización', e)}
                                  for e in entidades]
    if ESPANA.search(nombre):
        salida['titulos'] = [{'literal': nombre, 'autoridad': 'federacion_espanola', 'base': 'nombre_reservado',
                              'evidencia': evidencia(url, 'h1', nombre)}]
    salida['fuente'] = relacion(url, ambitos, entidades, nombre)
    revisadas, programa = [], []
    for d in salida['documentos']:
        lectura = lecturas_documentales().get(d['url'])
        if not lectura:
            continue
        ev = evidencia(d['url'], lectura['localizador'], lectura['literal'], 'documento')
        if lectura.get('sha256'):
            d['hash'] = lectura['sha256']
        revisadas.append((lectura, ev))
        for k in ('actividad', 'alcance'):
            if k in lectura:
                salida[k] = {**lectura[k], 'evidencia': ev}
        if 'titulos' in lectura:
            salida['titulos'] = [{'literal': t, 'base': 'documento', 'evidencia': ev} for t in lectura['titulos']]
        avisos.extend(lectura.get('pendientes', []))
        programa.extend(lectura.get('programa', []))
    hijos = [a.enlace('fga', x['href']) for x in art.select('.competition-list h2 a[href]')]
    clase = 'coleccion'
    if hijos:
        salida['alcance'] = {'tipo': 'serie', 'evidencia': evidencia(url, 'Competicións', 'Competicións')}
        # La cabecera y los nombres de las hijas no deciden la clase deportiva.
        cuerpo = ' '.join(a.texto(x) for x in art.select('.html-description') if not x.find_parent(class_='competition-list'))
        if (re.search(r'(?:o|este) circu[ií]to[^.]*[,:][^.]*', cuerpo, re.I)
                and len(re.findall(r'\b\d{1,2}/\d{1,2}/\d{4}\b', cuerpo)) >= 2):
            clase = 'circuito'
        if any(l.get('clase') == 'circuito' and len(l.get('jornadas', [])) >= 2 for l, _ in revisadas):
            clase = 'circuito'
        if any(l.get('alcance', {}).get('tipo') == 'publicacion' for l, _ in revisadas):
            salida['alcance'] = next({**l['alcance'], 'evidencia': ev} for l, ev in revisadas if l.get('alcance', {}).get('tipo') == 'publicacion')
    elif salida['documentos'] and all(d['rol'] == 'clasificacion' for d in salida['documentos']):
        salida['alcance'] = {'tipo': 'publicacion', 'evidencia': evidencia(url, 'Documentos', ' / '.join(d['nombre'] for d in salida['documentos']))}
        avisos.append('clasificación publicada: revisar discrepancias de edición en ficha y documentos')
    # La FGA anuncia el estado en el título («Proba Cancelada», «SUSPENDIDO»): en
    # 138 fichas capturadas, 12 de 13. En el cuerpo solo cuenta un aviso parcial
    # explícito; una cláusula de reglamento («poderá ser aprazada») no es un estado.
    estado, literal = 'desconocido', None
    cuerpo = ' '.join(a.texto(x) for x in art.select('.html-description'))
    parcial = r'(?:suspendid[ao]|suspensión|suspension|aprazad[ao]|aplazad[ao]|cancelad[ao]|anulad[ao])[^.;]*(?:xornada de tarde|jornada de tarde|xornada de mañ[aá]|jornada de mañana)'
    for texto, patron, valor in ((nombre + ' ' + cuerpo, parcial, 'suspension_parcial'), (nombre, r'cancelad[ao]|anulad[ao]', 'cancelado'),
                                 (nombre, r'aprazad[ao]|aplazad[ao]', 'aplazado'), (nombre, r'suspendid[ao]', 'suspendido')):
        if m := re.search(patron, texto, re.I):
            estado, literal = valor, m[0]
            break
    cabecera = art.select_one('header') or art
    anterior_h1 = art.select_one('h1').find_previous_sibling()
    enlace_padre = anterior_h1.select_one('a[href]') if anterior_h1 else None
    padre = ({'nombre': a.texto(enlace_padre), 'url': a.enlace('fga', enlace_padre['href'])}
             if enlace_padre else None)
    tokens = [a.texto(x) for x in cabecera.select('span') if re.fullmatch(r'\d{2}/\d{2}/\d{4}|-', a.texto(x))]
    t = temporalidad(tokens, url, 'header/fechas')
    # Un anexo revisado puede distinguir días efectivos del rango de cabecera.
    dias = next((l['dias'] for l, _ in revisadas if 'dias' in l), None)
    if dias:
        if not all(t['dias'][0] <= d <= t['dias'][-1] for d in dias):
            raise FechasDudosas('anexo y fechas de cabecera incompatibles')
        t['dias'] = dias
        t['evidencia'] = next(ev for l, ev in revisadas if 'dias' in l)
    t['estado'] = estado
    if literal:
        t['estado_literal'] = literal
    salida['temporalidad'] = t
    return {'id': i, 'nombre': nombre, 'metadatos': salida, 'hijos': hijos, 'clase': clase,
            'pendientes': avisos, 'soup': s, 'padre': padre, 'programa': programa}


def programacion(estado):
    return {'suspendido': 'aplazado', 'suspension_parcial': 'programado'}.get(estado, estado)


def recoger(desde, hasta, obtener, *, conocidas=()):
    from .atletismo_recogida import meses
    superficies, consultas, pendientes, avisos, datos, inventario, fichas = [], [], [], [], {}, {}, {}
    bloqueada = False

    def superficie(tipo, ventana, filtros, urls, leer):
        nonlocal bloqueada
        registro = {'superficie': tipo, 'ventana': ventana, 'filtros': filtros,
                    'consultas': urls, 'ids_observados': [], 'ids_resueltos': [], 'estado': 'no_disponible'}
        superficies.append(registro)
        if bloqueada:
            return None
        try:
            consultas.extend(urls)
            resultado = leer(obtener(urls[0]))
        except FechasDudosas as error:
            registro.update(estado='parcial', error=str(error))
            return {'cuarentena': True}, registro
        except FileNotFoundError as error:
            # Reproducción offline: captura no disponible, nunca una respuesta vacía.
            registro.update(estado='no_disponible', error=str(error))
            return None
        except HTTPError as error:
            registro.update(estado='fallida', error=f'HTTP {error.code}')
            if tipo == 'ficha' and error.code in (404, 410):
                return None
            bloqueada = True
            return None
        except (ValueError, KeyError, TypeError) as error:
            registro.update(estado='fallida', error=f'{type(error).__name__}: {error}'[:500])
            # No se intenta ninguna otra ruta tras protección o esquema roto.
            bloqueada = True
            return None
        return resultado, registro

    for mes in meses(desde, hasta):
        v = {'inicio': mes.isoformat(), 'fin': mes.replace(day=monthrange(mes.year, mes.month)[1]).isoformat()}
        u = API + '?' + urlencode({'month': mes.month, 'year': mes.year})
        r = superficie('api', v, {'month': mes.month, 'year': mes.year}, [u], leer_api)
        if r is None:
            continue
        api, cobertura_api = r
        cobertura_api.update(ids_observados=sorted(api), estado='completa')
        for i, registro_api in api.items():
            if i in inventario and inventario[i] != registro_api:
                pendientes.append({'id': i, 'motivo': 'API contradictoria entre meses', 'cuarentena': True})
                cobertura_api['estado'] = 'parcial'
            inventario[i] = registro_api
        u = BASE + '?' + urlencode([('cp_date', mes.strftime('%d/%m/%Y')), *[('cp_ambit[]', x) for x in ('GAL', 'NAC', 'INT')]])
        antes = len(pendientes)
        r = superficie('html', v, {'cp_date': mes.strftime('%d/%m/%Y'), 'cp_ambit[]': ['GAL', 'NAC', 'INT']}, [u],
                        lambda html: leer_listado(html, url=u, pendientes=pendientes))
        if r is None:
            continue
        eventos, cobertura_html = r
        ids = sorted({e['id'] for e in eventos} | {p['id'] for p in pendientes[antes:]})
        cobertura_html.update(ids_observados=ids, estado='parcial' if len(pendientes) > antes else 'completa')
        for e in eventos:
            if e['id'] in datos and datos[e['id']] != e:
                pendientes.append({'id': e['id'], 'url': e['url'], 'motivo': 'publicación contradictoria entre meses', 'cuarentena': True})
                cobertura_html['estado'] = 'parcial'
            else:
                datos[e['id']] = e
        if set(ids) - set(api):
            cobertura_api['estado'] = 'parcial'
            cobertura_api['error'] = 'IDs del HTML ausentes de la API'
    # Con un inventario obligatorio roto se conserva íntegra la lectura anterior.
    if bloqueada:
        return {'version': 1, 'fuente': 'fga', 'eventos': [], 'agrupaciones': []}, {
            'consultas': consultas, 'superficies': superficies, 'pendientes': pendientes,
            'completo': False, 'conservar_lectura': True, 'aplicar_ausencias': False}
    cuarentena = {p['id'] for p in pendientes if p.get('cuarentena')}
    agrupaciones, eventos, publicaciones, grupos = {}, [], [], {}
    trabajo = [e['url'] for e in datos.values()]
    ids_por_url = {e['url']: e['id'] for e in datos.values()}
    trabajo.extend(e['metadatos']['circuito_declarado']['url'] for e in datos.values() if e['metadatos'].get('circuito_declarado'))
    # WordPress admite consulta por ID; nunca se publica esta URL de resolución.
    # El permalink debe proceder de la respuesta y el post debe coincidir.
    faltantes = set(inventario) - set(datos) - cuarentena
    consultas_id = {f'https://atletismo.gal/?p={i}': i for i in sorted(faltantes)}
    trabajo.extend(consultas_id)
    trabajo = list(dict.fromkeys(trabajo))
    for u in trabajo:
        if ids_por_url.get(u) in cuarentena:
            continue
        r = superficie('ficha', {'inicio': desde.isoformat(), 'fin': hasta.isoformat()}, {}, [u], lambda html: leer_ficha(html, url=u))
        if r is None:
            if bloqueada:
                break
            i = ids_por_url.get(u) or consultas_id.get(u)
            if i:
                superficies[-1]['ids_observados'] = [i]
                cuarentena.add(i)
                pendientes.append({'id': i, 'url': u, 'motivo': 'ficha no disponible', 'cuarentena': True})
            continue
        ficha, cobertura = r
        if ficha.get('cuarentena'):
            i = ids_por_url.get(u) or consultas_id.get(u)
            if i:
                cuarentena.add(i)
                cobertura['ids_observados'] = [i]
                pendientes.append({'id': i, 'url': u, 'motivo': cobertura['error'], 'cuarentena': True})
            continue
        i = ficha['id']
        cobertura.update(ids_observados=[i], ids_resueltos=[i], estado='completa')
        if u in ids_por_url and i != ids_por_url[u]:
            cobertura.update(estado='fallida', error='ficha ajena al ID del listado')
            bloqueada = True
            break
        if u in consultas_id:
            if i != consultas_id[u]:
                cobertura.update(estado='fallida', error='resolución por ID ajena')
                bloqueada = True
                break
            canonical = ficha['soup'].select_one('link[rel=canonical][href]')
            if canonical is None:
                cobertura.update(estado='parcial', error='sin permalink acreditado')
                cuarentena.add(i)
                pendientes.append({'id': i, 'motivo': 'sin permalink acreditado', 'cuarentena': True})
                continue
            try:
                url = a.enlace('fga', canonical['href'])
            except ValueError:
                cobertura.update(estado='parcial', error='permalink fuera de FGA')
                cuarentena.add(i)
                pendientes.append({'id': i, 'motivo': 'permalink fuera de FGA', 'cuarentena': True})
                continue
            # Releer los mismos bytes semánticos con el permalink acreditado.
            ficha = leer_ficha(str(ficha['soup']), url=url)
            t = ficha['metadatos']['temporalidad']
            datos[i] = {'id': i, 'nombre': ficha['nombre'], 'url': url, 'inicio': t['dias'][0], 'fin': t['dias'][-1],
                        'metadatos': {'ambitos_literales': sorted(set(ficha['metadatos']['etiquetas_literales']) & set(AMBITOS)),
                                      'circuito_declarado': ficha['padre']}}
            u = url
        if ficha['padre'] and ficha['padre']['url'] not in trabajo:
            trabajo.append(ficha['padre']['url'])
        if len(trabajo) > 500:
            cobertura.update(estado='fallida', error='cadena de padres incoherente')
            bloqueada = True
            break
        fichas[u] = ficha
        # Un aviso sobre un documento no hace parcial la lectura: si no, un PDF
        # escaneado impediría para siempre retirar citas.
        for motivo in ficha['pendientes']:
            avisos.append({'id': i, 'url': u, 'motivo': motivo})
        if ficha['hijos'] or ficha['metadatos']['alcance']['tipo'] == 'publicacion':
            grupos[u] = i
            agrupaciones[i] = {'id': i, 'nombre': ficha['nombre'], 'url': u, 'clase': ficha['clase']}
            publicaciones.append({'id': i, 'url': u, 'metadatos': ficha['metadatos'], 'hijos': ficha['hijos']})
    if bloqueada:
        return {'version': 1, 'fuente': 'fga', 'eventos': [], 'agrupaciones': []}, {
            'consultas': consultas, 'superficies': superficies, 'pendientes': pendientes,
            'completo': False, 'conservar_lectura': True, 'aplicar_ausencias': False}
    for i, e in datos.items():
        if i in cuarentena or e['url'] in grupos:
            continue
        ficha = fichas[e['url']]
        if ficha['id'] != i:
            raise ValueError('FGA: ficha ajena al ID del listado')
        meta = ficha['metadatos']
        t = meta['temporalidad']
        api = inventario.get(i)
        try:
            fechas_api = sorted({date.fromisoformat(d).isoformat() for d in api['all_dates']}) if api else []
            if api and (date.fromisoformat(api['main_date']).isoformat() not in fechas_api
                        or not fechas_api or (date.fromisoformat(fechas_api[-1]) - date.fromisoformat(fechas_api[0])).days > 90
                        or (fechas_api[0], fechas_api[-1]) != (t['dias'][0], t['dias'][-1])):
                raise FechasDudosas('API y ficha tienen fechas incompatibles')
            if (e['inicio'], e['fin']) != (t['dias'][0], t['dias'][-1]):
                raise FechasDudosas('listado y ficha tienen fechas incompatibles')
        except (ValueError, TypeError) as error:
            pendientes.append({'id': i, 'url': e['url'], 'motivo': str(error), 'cuarentena': True})
            cuarentena.add(i)
            continue
        padre = e['metadatos'].get('circuito_declarado')
        if padre:
            if padre['url'] not in grupos:
                pendientes.append({'id': i, 'url': e['url'], 'motivo': 'función del padre sin acreditar', 'cuarentena': True})
                cuarentena.add(i)
                continue
            e['grupo'] = grupos[padre['url']]
            meta['pertenencias'] = [{'padre_nativo': 'post-' + e['grupo'], 'clase': agrupaciones[e['grupo']]['clase'],
                                    'evidencia': evidencia(e['url'], 'listado/padre', padre['url'])}]
        e['metadatos'].update(meta)
        e['estado'] = programacion(t['estado'])
        if ficha['programa']:
            e['programa'] = ficha['programa']
        if any(desde.isoformat() <= d <= hasta.isoformat() for d in t['dias']):
            eventos.append(e)
    incompatibles = set(agrupaciones) & {c['id'] for c in conocidas}
    if incompatibles:
        for i in sorted(incompatibles):
            pendientes.append({'id': i, 'motivo': 'publicación guardada como cita: requiere corrección revisada; identidad conservada', 'cuarentena': True})
        afectados = incompatibles | {e['id'] for e in eventos if e.get('grupo') in incompatibles}
        cuarentena.update(afectados)
        eventos = [e for e in eventos if e['id'] not in afectados]
        agrupaciones = {i: g for i, g in agrupaciones.items() if i not in incompatibles}
    resueltos = (set(datos) - cuarentena) | set(agrupaciones)
    for s in superficies:
        if s['superficie'] in ('api', 'html'):
            s['ids_resueltos'] = sorted(set(s['ids_observados']) & resueltos)
            if set(s['ids_observados']) & cuarentena or set(s['ids_observados']) - set(datos) - set(agrupaciones):
                s['estado'] = 'parcial'
    completa = not cuarentena and all(s['estado'] == 'completa' for s in superficies)
    return {'version': 1, 'fuente': 'fga', 'eventos': eventos, 'agrupaciones': list(agrupaciones.values())}, {
        'consultas': consultas, 'superficies': superficies, 'publicaciones': publicaciones,
        'pendientes': pendientes, 'avisos': avisos, 'completo': completa and not pendientes, 'aplicar_ausencias': completa}
