"""Índices oficiales completos, independientes de la recogida diaria de citas.

Barrido semanal explícito: RFEA publica cinco filas por página. No se suman sus
peticiones al mensual. Solo los enlaces de ficha asocian documentos con citas.
La numeración y las declaraciones de sustitución se conservan sin corregirlas.
"""
from datetime import date, datetime, timezone
import json
from pathlib import Path
import re
import time
from urllib.parse import parse_qs, urlencode, urljoin, urlsplit

from bs4 import BeautifulSoup

from . import atletismo_calendario_pdf as calendario, recogida

INDICES = {'rfea': calendario.INDICE.split('?')[0],
           'fga': 'https://atletismo.gal/circulares/',
           'fca': 'https://fcatletisme.cat/circulars/'}
REGLAMENTS = 'https://fcatletisme.cat/reglaments/'
CADENCIA_DIAS = 7


def texto(nodo):
    return ' '.join(nodo.get_text(' ', strip=True).split()) if nodo else ''


def enlace(valor, base, *, mismo_sitio=False):
    if not isinstance(valor, str) or not valor.strip() or valor.startswith('#'):
        raise ValueError('Circulares: enlace vacío')
    u = urljoin(base, valor)
    p = urlsplit(u)
    if (p.scheme not in ('http', 'https') or not p.hostname or p.username or p.password
            or any(c.isspace() for c in u) or mismo_sitio and p.netloc != urlsplit(base).netloc):
        raise ValueError('Circulares: URL no pública o fuera del índice')
    return u


def declaraciones(literal, url, localizador):
    # Se registra el literal completo; no se resuelve un destino por número ni
    # se repara, por ejemplo, «113/20026».
    return [{'literal': literal, 'evidencia': {'superficie': 'indice', 'url': url,
             'localizador': localizador, 'literal': literal}}] if re.search(
                 r'modifica|sustituy|substitu|anexo circular|annex circular', literal, re.I) else []


def entrada(nombre, numero, fecha, url, origen, localizador, **otros):
    if not nombre:
        raise ValueError('Circulares: entrada sin título literal')
    return {'nombre': nombre, 'numero': numero, 'fecha': fecha, 'url': url,
            'declaraciones': declaraciones(nombre, origen, localizador),
            'evidencia': {'superficie': 'indice', 'url': origen,
                          'localizador': localizador, 'literal': nombre}, **otros}


def siguiente(url, destino, parametro):
    u = enlace(destino, url, mismo_sitio=True)
    actual, proxima = urlsplit(url), urlsplit(u)
    a, b = parse_qs(actual.query), parse_qs(proxima.query)
    pagina = a.pop(parametro, ['0'])
    nueva = b.pop(parametro, [])
    if (proxima.path != actual.path or a != b or len(nueva) != 1
            or not nueva[0].isdigit() or int(nueva[0]) != int(pagina[0]) + 1):
        raise ValueError('Circulares: paginación incoherente')
    return u


def leer_rfea(html, url):
    filas, proxima = calendario.leer_indice(html, url, permitir_sin_archivo=True)
    s = BeautifulSoup(html, 'html.parser')
    resumen = s.select_one('.views-summary')
    m = re.fullmatch(r'(\d+) de (\d+)', texto(resumen))
    numero_pagina = int(parse_qs(urlsplit(url).query).get('page', ['0'])[0])
    if (not m or not filas or int(m[1]) != numero_pagina * 5 + len(filas)
            or len(filas) != min(5, int(m[2]) - numero_pagina * 5)):
        raise ValueError('Circulares RFEA: total o esquema del índice no reconocido')
    entradas = []
    for n, (f, tr) in enumerate(zip(filas, s.select('table tbody tr')), 1):
        if not f['numero']:
            raise ValueError('Circulares RFEA: entrada sin número literal')
        e = entrada(f['nombre'], f['numero'], f['fecha'], f['url'], url, f'tbody/tr[{n}]',
                    archivo=f['archivo'], fecha_literal=texto(tr.select_one('time')))
        # La declaración también puede estar en el rótulo del archivo.
        e['declaraciones'] += declaraciones(f['archivo'], url, f'tbody/tr[{n}]/.documento_nombre')
        if e['url'] is None:
            e['avisos'] = ['El índice publica la circular sin archivo; no se inventa su URL']
        entradas.append(e)
    return entradas, siguiente(url, proxima, 'page') if proxima else None, int(m[2])


def leer_fga(html, url):
    s = BeautifulSoup(html, 'html.parser')
    lista = s.select_one('#paperList')
    fin_de_lista = any(texto(p) == 'Non se se atoparon circulares.' for p in s.select('main p'))
    if (lista is None and fin_de_lista and s.select_one('#paperForm') is not None
            and parse_qs(urlsplit(url).query).get('paper_page', ['0']) != ['0']
            and not s.select('#linkLoadMorePapers, a[href*="paper_page="], .pagination, .page-numbers, .pager')):
        return [], None, None
    if lista is None or s.select('.pagination, .page-numbers, .pager'):
        raise ValueError('Circulares FGA: lista o paginación no reconocida')
    entradas = []
    for n, bloque in enumerate(lista.select('div.group'), 1):
        a = bloque.select_one('a[href]')
        cabecera = a if a is not None else bloque.select_one('div[class~="sm:flex"]')
        spans = cabecera.select('span') if cabecera else []
        fecha = bloque.select_one('div.text-xs')
        if len(spans) != 2 or fecha is None or not texto(spans[0]):
            raise ValueError('Circulares FGA: entrada incompleta')
        dia = datetime.strptime(texto(fecha), '%d/%m/%Y').date().isoformat()
        e = entrada(texto(spans[1]), texto(spans[0]), dia,
            enlace(a['href'], url, mismo_sitio=True) if a is not None else None,
            url, f'#paperList/div.group[{n}]', fecha_literal=texto(fecha))
        if e['url'] is None:
            e['avisos'] = ['El índice publica la circular sin enlace; no se inventa su URL']
        entradas.append(e)
    mas = s.select('#linkLoadMorePapers[href]')
    if (not entradas or len(mas) > 1 or len(lista.select('a[href]')) != sum(e['url'] is not None for e in entradas)
            or len(s.select('a[href*="paper_page="]')) != len(mas)):
        raise ValueError('Circulares FGA: lista vacía o paginación ambigua')
    return entradas, siguiente(url, mas[0]['href'], 'paper_page') if mas else None, None


def configuracion_fca(html):
    s = BeautifulSoup(html, 'html.parser')
    bloques = s.select('.td_block_9')
    if len(bloques) != 1:
        raise ValueError('Circulares FCA: bloque de comunicats no reconocido')
    script = ' '.join(x.get_text() for x in bloques[0].select('script'))
    atributos = re.search(r"\.atts = '(.*?)';", script)
    categoria = re.search(r'"category_id":"(\d+)"', script)
    total = re.search(r'\.found_posts = "(\d+)"', script)
    if not atributos or not categoria or not total:
        raise ValueError('Circulares FCA: faltan categoría o total del índice')
    atts = json.loads(atributos[1])
    if any(atts.get(k) != '' for k in ('post_ids', 'tag_slug', 'autors_id', 'installed_post_types',
                                      'category_ids', 'sub_cat_ajax', 'offset', 'sort')):
        raise ValueError('Circulares FCA: filtros del índice no contrastados')
    return categoria[1], int(total[1])


def leer_fca_api(contenido, url, categoria):
    """REST público de la categoría que publica circulars/, con totales WP."""
    p = json.loads(contenido)
    if (not isinstance(p, dict) or p.get('status') != 200
            or not isinstance(p.get('headers'), dict) or not isinstance(p.get('body'), list)):
        raise ValueError('Circulares FCA: esquema REST no reconocido')
    h = {k.lower(): v for k, v in p['headers'].items()}
    total, paginas = int(h['x-wp-total']), int(h['x-wp-totalpages'])
    pagina = int(parse_qs(urlsplit(url).query)['page'][0])
    if paginas != (total + 99) // 100 or len(p['body']) != min(100, total - (pagina - 1) * 100):
        raise ValueError('Circulares FCA: paginación incoherente')
    entradas = []
    for f in p['body']:
        if (type(f.get('id')) is not int or categoria not in map(str, f.get('categories', []))
                or not isinstance(f.get('title', {}).get('rendered'), str)):
            raise ValueError('Circulares FCA: entrada incompleta o ajena a comunicats')
        nombre = texto(BeautifulSoup(f['title']['rendered'], 'html.parser'))
        numero = re.search(r'(?:Comunicat|Circular)\s+(\d+(?:\.\d+)?(?:bis)?\s*/\s*\d{2,4})(?!\d)', nombre, re.I)
        entradas.append(entrada(nombre, numero[1] if numero else None,
            date.fromisoformat(f['date'][:10]).isoformat(), enlace(f['link'], url, mismo_sitio=True),
            url, f'body[id={f["id"]}]', id=str(f['id']), fecha_literal=f['date']))
    return entradas, paginas, total


def leer_reglaments(html, url):
    s = BeautifulSoup(html, 'html.parser')
    cuerpo = s.select_one('.td-page-content')
    if cuerpo is None or not cuerpo.select('table a[href]') or cuerpo.select('.page-numbers, .pagination, .td_block_wrap'):
        raise ValueError('Reglaments FCA: esquema o paginación no reconocido')
    arxiu = [h for h in cuerpo.select('h1, h2, h3, h4, h5, h6') if 'Arxiu Reglaments' in texto(h)]
    if url == REGLAMENTS and (len(arxiu) != 1 or not arxiu[0].select('a[href]')):
        raise ValueError('Reglaments FCA: archivo anual ausente')
    for h in arxiu:
        for a in h.select('a[href]'):
            u = enlace(a['href'], url, mismo_sitio=True)
            if not re.fullmatch(r'/reglaments-\d{4}(?:-\d{4})?/?', urlsplit(u).path):
                raise ValueError('Reglaments FCA: continuación del archivo no reconocida')
    archivos, entradas = [], []
    for a in cuerpo.select('a[href]'):
        u = enlace(a['href'], url)
        if re.fullmatch(r'/reglaments-(?:\d{4})(?:-\d{4})?/?', urlsplit(u).path):
            archivos.append(enlace(u, url, mismo_sitio=True))
        elif a.find_parent('table'):
            entradas.append(entrada(texto(a), None, None, u, url, f'table/a[{len(entradas) + 1}]'))
    return entradas, archivos


def leer_indice(fuente, obtener):
    """Valida el inventario íntegro antes de entregarlo; nunca un prefijo."""
    entradas, superficies, vistos = [], [], set()

    def pagina(url, lector):
        resultado = lector(obtener(url), url)
        ids = [e['id'] for e in resultado[0] if 'id' in e]
        filtros = parse_qs(urlsplit(url).query)
        superficies.append({'superficie': 'indice', 'url': url, 'estado': 'completa',
            'filtros': filtros, 'consultas': [url], 'pagina': filtros.get('page', filtros.get('paper_page', [None]))[0],
            'ids_observados': ids, 'ids_resueltos': ids,
            'urls_observadas': [e['url'] for e in resultado[0] if e['url'] is not None], 'entradas': len(resultado[0])})
        for e in resultado[0]:
            clave = ('id', e['id']) if 'id' in e else (
                urlsplit(url).path if fuente == 'fca' else '', e['numero'], e['nombre'], e['url'], e['fecha'])
            if clave in vistos:
                raise ValueError('Circulares: entrada repetida entre páginas')
            vistos.add(clave)
            entradas.append(e)
        return resultado

    url, total = INDICES[fuente], None
    if fuente in ('rfea', 'fga'):
        consultas = set()
        while url:
            if url in consultas:
                raise ValueError('Circulares: página repetida')
            consultas.add(url)
            _, url, anunciado = pagina(url, leer_rfea if fuente == 'rfea' else leer_fga)
            if total is not None and anunciado != total:
                raise ValueError('Circulares: total cambiante entre páginas')
            total = anunciado
            if total is not None and (len(entradas) > total or bool(url) != (len(entradas) < total)):
                raise ValueError('Circulares: paginación incompleta o excesiva')
    else:
        html = obtener(url)
        categoria, total = configuracion_fca(html)
        cabecera = [a['href'] for a in BeautifulSoup(html, 'html.parser').select('.td_block_9 .td_module_8 h3 a[href]')]
        if not cabecera:
            raise ValueError('Circulares FCA: índice sin publicaciones')
        superficies.append({'superficie': 'circulars', 'url': url, 'estado': 'completa',
                            'consultas': [url], 'filtros': {'category_id': categoria}, 'total_anunciado': total, 'entradas': 0})
        for n in range(1, (total + 99) // 100 + 1):
            u = 'https://fcatletisme.cat/wp-json/wp/v2/posts?' + urlencode({
                'categories': categoria, 'per_page': 100, 'page': n, '_envelope': '1',
                '_fields': 'id,date,link,title,categories'})
            leidas, _, anunciado = pagina(u, lambda c, u: leer_fca_api(c, u, categoria))
            if anunciado != total:
                raise ValueError('Circulares FCA: total cambiante frente al índice')
            if n == 1 and cabecera != [e['url'] for e in leidas[:len(cabecera)]]:
                raise ValueError('Circulares FCA: la API no reproduce las publicaciones del índice')
        trabajo = [REGLAMENTS]
        for u in trabajo:
            _, archivos = pagina(u, leer_reglaments)
            trabajo.extend(a for a in archivos if a not in trabajo)
    return {'version': 1, 'fuente': fuente, 'entradas': entradas, 'superficies': superficies, 'completo': True}


def enlazar(eventos, indice):
    """Comparación exacta de URLs ya enlazadas: ni títulos, ni fechas, ni sedes."""
    por_url = {}
    for e in indice['entradas']:
        por_url.setdefault(e['url'], []).append(e)
    asociaciones = {}
    for e in eventos:
        for d in e.get('metadatos', {}).get('documentos', []):
            if d['url'] in por_url:
                asociaciones[(str(e['id']), d['url'])] = {
                    'id': str(e['id']), 'url_documento': d['url'], 'entradas': por_url[d['url']]}
    return list(asociaciones.values())


def recoger(fuente, *, descargar=None):
    inicio, ultimo, peticiones = time.monotonic(), None, 0
    presupuesto = 400 if fuente == 'rfea' else 200

    def obtener(url):
        nonlocal ultimo, peticiones
        if peticiones >= presupuesto:
            raise ValueError('Circulares: presupuesto agotado; índice sin guardar')
        if descargar is None and ultimo is not None:
            time.sleep(max(0, 2.5 - (time.monotonic() - ultimo)))
        peticiones += 1
        try:
            return (descargar or recogida.descargar)(url)
        finally:
            ultimo = time.monotonic()

    resultado = leer_indice(fuente, obtener)
    resultado.update(peticiones=peticiones, segundos=round(time.monotonic() - inicio, 3),
        observado=datetime.now(timezone.utc).isoformat(), cadencia_dias=CADENCIA_DIAS)
    return resultado


def main(argv=None):
    import argparse
    from calendario import guardar
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--fuente', choices=INDICES, required=True)
    ap.add_argument('--salida', required=True, help='JSON local; solo se reemplaza tras validar todo el índice')
    args = ap.parse_args(argv)
    ruta = Path(args.salida)
    if ruta.exists():
        anterior = json.loads(ruta.read_text())
        edad = datetime.now(timezone.utc) - datetime.fromisoformat(anterior['observado'])
        if anterior.get('completo') and anterior.get('fuente') == args.fuente and edad.total_seconds() < CADENCIA_DIAS * 86400:
            print(json.dumps({'fuente': args.fuente, 'cache': True, 'peticiones': 0}))
            return
    resultado = recoger(args.fuente)
    guardar(ruta, resultado)
    print(json.dumps({k: resultado[k] for k in ('fuente', 'peticiones', 'segundos', 'completo')} | {
        'entradas': len(resultado['entradas'])}))


if __name__ == '__main__':
    main()
