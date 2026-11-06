"""Publicaciones RFEA: ficha, documentos y etiquetas literales del calendario.

Un filtro positivo acredita solo su etiqueta. Las ausencias no clasifican y un
mismo documento en dos fichas no establece ninguna relación entre ellas.
"""
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
import json
import re
from urllib.error import HTTPError
from urllib.parse import quote, urljoin, urlsplit

from bs4 import BeautifulSoup

from . import atletismo as a

BASE = a.FUENTES['rfea'][1]
ESPANA = re.compile(r'\bcampeonato de espa[ñn]a\b', re.I)


def evidencia(url, localizador, literal, superficie='ficha'):
    return {'superficie': superficie, 'url': url, 'localizador': localizador, 'literal': literal}


def url_publica(valor, base):
    if not isinstance(valor, str) or not valor.strip() or valor.startswith('#'):
        return None
    url = urljoin(base, valor.strip())
    try:
        p = urlsplit(url)
        p.port
        if p.scheme != 'https' or not p.hostname or p.username or p.password or any(c.isspace() for c in url):
            return None
    except ValueError:
        return None
    return url


def rol(nombre, url):
    # La familia nativa rfea_norma manda sobre el nombre del archivo.
    if '/rfea_norma/' in url:
        return 'normas'
    for patron, valor in ((r'normas|normativa', 'normas'), (r'reglamento', 'reglamento'),
            (r'informaci[oó]n.?t[eé]cnica', 'informacion_tecnica'), (r'horario', 'horario'),
            (r'inscrit|admitid', 'inscritos'), (r'resultado', 'resultados'),
            (r'\bacta\b', 'acta'), (r'circular', 'circular')):
        if re.search(patron, nombre, re.I):
            return valor
    return 'otro'


def documento(nombre, url, origen, localizador, superficie='ficha'):
    return {'nombre': nombre, 'url': url, 'rol': rol(nombre, url),
            'evidencia': evidencia(origen, localizador, nombre, superficie)}


def leer_ficha(html, *, url):
    s = BeautifulSoup(html, 'html.parser')
    ajustes = s.select_one('script[data-drupal-selector="drupal-settings-json"]')
    camino = json.loads(ajustes.string)['path']['currentPath'] if ajustes else ''
    m = re.fullmatch(r'championship/(\d+)', camino)
    if not m or not s.select_one('.c_e_title') or not s.select_one('.c_e_date'):
        raise ValueError('RFEA: ficha sin identidad, título o fecha')
    # Sin SFID único la cita sigue siendo válida: solo se quedan sin leer sus documentos.
    sfids = sorted({x['data-sfid'] for x in s.select('[data-sfid]')})
    nombre = a.texto(s.select_one('.c_e_title'))
    meta = {k: a.texto(s.select_one(selector)) for k, selector in (
        ('area_literal', '.c_e_area'), ('categoria_literal', '.c_e_cat'), ('fecha_literal', '.c_e_date'))}
    meta.update(sfid=sfids, enlaces_ficha=[], documentos=[], alcance={'tipo': 'desconocido'},
                actividad={'valor': 'desconocida'}, fuente={'relacion': 'desconocido'})
    meta['evidencias_ficha'] = {k: evidencia(url, selector, meta[k]) for k, selector in (
        ('area_literal', '.c_e_area'), ('categoria_literal', '.c_e_cat'), ('fecha_literal', '.c_e_date')) if meta[k]}
    if len(sfids) == 1:
        meta['evidencias_ficha']['sfid'] = evidencia(url, '[data-sfid]', sfids[0])
    for x in s.select('.container-championship a[href], a.c_e_link[href]'):
        u = url_publica(x['href'], url)
        if not u:
            continue
        enlace = {'nombre': a.texto(x) or x.get('title') or 'Enlace', 'url': u}
        if enlace not in meta['enlaces_ficha']:
            meta['enlaces_ficha'].append(enlace)
        # Las pestañas, la web externa y el Excel de pruebas siguen siendo enlaces.
        if (re.search(r'\.(?:pdf|docx?|xlsx?)(?:[?#]|$)|/documentos/', u, re.I)
                or rol(enlace['nombre'], u) != 'otro'):
            d = documento(enlace['nombre'], u, url, 'a[href]')
            if d not in meta['documentos']:
                meta['documentos'].append(d)
    informacion = s.select_one('#c_e_accordion_information')
    if informacion:
        cuerpo = BeautifulSoup(str(informacion), 'html.parser')
        for x in cuerpo.select('a, .c_data_image'):
            x.decompose()
        if literal := a.texto(cuerpo):
            meta['informacion'] = {'literal': literal,
                'evidencia': {'superficie': 'ficha', 'url': url, 'localizador': '#c_e_accordion_information'}}
    inscripcion = s.select_one('#c_e_accordion_registration, #c_e_accordion_inscription, .c_e_inscripcion')
    enlaces = [e for e in meta['enlaces_ficha'] if re.search(r'inscripci[oó]n|inscrib', e['nombre'], re.I)]
    if inscripcion or enlaces:
        meta['inscripcion'] = {'enlaces': enlaces}
        if inscripcion and a.texto(inscripcion):
            meta['inscripcion']['plazo_textual'] = a.texto(inscripcion)
    # Solo un campo declarado: nunca el título ni una cláusula del cuerpo.
    campo = s.select_one('.c_e_status, .c_e_estado')
    t = {'texto': meta['fecha_literal'], 'precision': 'dia', 'estado': 'desconocido',
         'evidencia': evidencia(url, '.c_e_date', meta['fecha_literal'])}
    if campo and (literal := a.texto(campo)):
        t['estado_literal'] = literal
        t['estado'] = {'aplazado': 'aplazado', 'suspendido': 'suspendido', 'cancelado': 'cancelado',
                       'programado': 'programado', 'suspensión parcial': 'suspension_parcial'}.get(literal.casefold(), 'desconocido')
        # Ambas declaraciones proceden de la misma ficha.
        t['evidencia'] = evidencia(url, '.c_e_date; .c_e_status, .c_e_estado', meta['fecha_literal'] + '; ' + literal)
    meta['temporalidad'] = t
    if ESPANA.search(nombre):
        meta['titulos'] = [{'literal': nombre, 'autoridad': 'federacion_espanola', 'base': 'nombre_reservado',
                           'evidencia': evidencia(url, '.c_e_title', nombre)}]
    return {'id': m[1], 'nombre': nombre, 'metadatos': meta}


def leer_documentos(contenido, *, url):
    comandos = json.loads(contenido)
    if not isinstance(comandos, list):
        raise ValueError('RFEA: documentos sin comandos Drupal')
    bloques = [c for c in comandos if c.get('command') == 'insert' and c.get('selector') == '.competition-doc']
    if len(bloques) != 1:
        raise ValueError('RFEA: documentos sin bloque inequívoco')
    s = BeautifulSoup(bloques[0]['data'], 'html.parser')
    if s.select('.pager, .pagination'):
        raise ValueError('RFEA: paginación documental no contrastada')
    tabla = s.select_one('table.tabla_docs_competicion')
    if tabla is None:
        if 'No hay resultados' in a.texto(s):
            return []
        raise ValueError('RFEA: tabla documental ausente')
    salida = []
    for numero, fila in enumerate(tabla.select('tr'), 1):
        if fila.select('th'):
            continue
        celdas = fila.select('td')
        enlaces = fila.select('a[href]')
        if len(celdas) != 2 or len(enlaces) != 1 or not a.texto(celdas[0]):
            raise ValueError('RFEA: fila documental incompleta')
        u = url_publica(enlaces[0]['href'], url)
        if not u:
            raise ValueError('RFEA: URL documental inválida')
        salida.append(documento(a.texto(celdas[0]), u, url, f'tabla_docs_competicion/tr[{numero}]', 'documentos_ajax'))
    return salida


def autoridad(evento):
    """Autoridad acreditada y su evidencia, de lo más explícito a lo más general."""
    meta = evento['metadatos']
    titulos = meta.get('titulos', [])
    autoridades = {t.get('autoridad') for t in titulos} - {None, 'desconocida', 'federacion_espanola'}
    if len(autoridades) == 1:
        valor = autoridades.pop()
        return valor, next(t['evidencia'] for t in titulos if t.get('autoridad') == valor)
    calendarios = [c for c in meta.get('calendarios', []) if c.get('categoria_literal')]
    if calendarios:
        literal = calendarios[-1]['categoria_literal']
        valor = {'RFEA': 'rfea', 'Nacional': 'rfea', 'Nacional 1': 'rfea', 'Internacional 1': 'rfea',
                 'Internacional 2': 'rfea', 'EA': 'ea', 'Autonómico': 'autonomica', 'WA/EA': 'wa/ea'}.get(literal)
        if re.match(r'WA(?:$|[ /]|CCT|CT|IT|RRL|RWT)', literal):
            valor = 'wa' if literal != 'WA/EA' else 'wa/ea'
        if literal in ('COE', 'CIO', 'CSD', 'AIA', 'ECF', 'EMA', 'FISU', 'IAU', 'WMA', 'WMRA'):
            valor = literal.lower()
        if valor:
            return valor, calendarios[-1]['evidencia']
    if reservado := next((t for t in titulos if t.get('autoridad') == 'federacion_espanola'), None):
        return 'rfea', reservado['evidencia']  # Título reservado en el calendario de la propia RFEA.
    area = meta.get('area_literal')
    if area in ('WA', 'EA') and (ev := meta.get('evidencias_ficha', {}).get('area_literal')):
        return area.lower(), ev
    if tipo := meta.get('calendario_tipo'):
        return 'rfea', evidencia(evento['url'], 'calendar-item/a[href]', tipo, 'calendario_web')
    return None, None


def relacion(evento):
    """Propio: está en el calendario RFEA y ninguna autoridad ajena la reclama.

    Las competiciones nacionales e internacionales son «organizadas o autorizadas
    por la RFEA» (Reglamento, arts. 14.1 y 15.1). Reflejo es lo que acredita otra
    autoridad. `Área` no tiene definición escrita: solo WA y EA cuentan, porque nunca
    coincidieron con categorías RFEA en el Calendario en PDF; `Área=RFEA` sí se mezcla.
    """
    valor, ev = autoridad(evento)
    if valor is None:
        return
    meta = evento['metadatos']
    meta['fuente'] = {'relacion': 'propio' if valor == 'rfea' else 'reflejo', 'evidencia': ev}
    if valor not in ('rfea', 'autonomica'):
        meta['fuente']['de'] = valor


# Las categorías mezclan edad, formato y distancia; ninguna se interpreta como
# clasificación. Ranking WA dio cero en sus once opciones (noviembre de 2026).
# Federativo sí declara qué es cada acto. Una concentración necesita además su
# convocatoria: la categoría solo la señala (ver `recoger`).
TECNIFICACION = {'387': 'Concentración', '389': 'PNTD'}
ACTIVIDAD_FEDERATIVA = {'381': 'formacion', '382': 'formacion', '390': 'formacion', '391': 'formacion',
                        '380': 'institucional', '383': 'institucional', '384': 'institucional', '385': 'institucional',
                        '386': 'institucional', '388': 'institucional', '392': 'institucional'}
FEDERATIVAS = {*TECNIFICACION, *ACTIVIDAD_FEDERATIVA}
FEDERATIVO = 'Eventos internas RFEA'


def opciones(html):
    s = BeautifulSoup(html, 'html.parser')
    temporadas = {a.texto(o): o.get('value') for o in s.select('.calendar-field-season option') if o.get('value')}
    categorias = [(o['value'], a.texto(o)) for o in s.select('.calendar-field-category option[value]') if o['value']]
    if not temporadas or not categorias or any(not i.isdigit() or not n for i, n in categorias):
        raise ValueError('RFEA: esquema del formulario de filtros no reconocido')
    if len({i for i, _ in categorias}) != len(categorias) or not set(TECNIFICACION) <= {i for i, _ in categorias}:
        raise ValueError('RFEA: categorías repetidas o filtros técnicos ausentes')
    return temporadas, categorias


def urls_mes(contenido, mes):
    """Valida mes y estructura incluso cuando no hay fichas seleccionadas."""
    comandos = json.loads(contenido)
    if not isinstance(comandos, list) or any(not isinstance(c, dict) for c in comandos):
        raise ValueError('RFEA: calendario sin comandos Drupal')
    bloques = [c for c in comandos if c.get('command') == 'insert' and c.get('selector') == '#calendar_container']
    if len(bloques) != 1:
        raise ValueError('RFEA: calendario sin bloque inequívoco')
    s = BeautifulSoup(bloques[0]['data'], 'html.parser')
    contiguos = ((mes - timedelta(days=1)).replace(day=1), (mes.replace(day=28) + timedelta(days=4)).replace(day=1))
    marcas = {str(int(datetime(d.year, d.month, 1, tzinfo=timezone.utc).timestamp())) for d in contiguos}
    if {x.get('attr-date') for x in s.select('.calendar_pager a[attr-date]')} != marcas or s.select('.pager, .pagination'):
        raise ValueError('RFEA: mes o paginación incoherente')
    return sorted({a.enlace('rfea', x['href']) for x in s.select('.calendar-item > a[href]')})


def recoger(desde, hasta, obtener, *, conocidas=()):
    from calendar import monthrange
    from .atletismo_recogida import _rfea_mensual, meses

    superficies, avisos = [], []
    bloqueada = False  # Un 403 o 429 corta lo opcional sin perder el inventario ya leído.
    anteriores = {c['id']: c.get('metadatos', {}) for c in conocidas if c.get('fuente') == 'rfea'}
    temporadas, categorias = opciones(obtener(BASE))
    entrada, informe = _rfea_mensual(desde, hasta, obtener)
    datos = {e['id']: e for e in entrada['eventos']}
    consultas = informe['consultas']

    def cobertura(tipo, url, ids, *, filtros=None, estado='completa'):
        registro = {'superficie': tipo, 'ventana': {'inicio': desde.isoformat(), 'fin': hasta.isoformat()},
                    'filtros': filtros or {}, 'consultas': [url], 'ids_observados': sorted(ids),
                    'ids_resueltos': sorted(ids), 'estado': estado}
        superficies.append(registro)
        return registro

    def cobertura_mes(tipo, u, eventos, filtros):
        ts = int(u.split('/ajax/calendario/')[1].split('/')[0])
        mes_consulta = datetime.fromtimestamp(ts, timezone.utc).date()
        urls = urls_mes(obtener(u), mes_consulta)
        registro = cobertura(tipo, u, [e['id'] for e in eventos if e['url'] in urls], filtros=filtros)
        registro.update(urls_observadas=urls, ventana={'inicio': mes_consulta.isoformat(),
            'fin': mes_consulta.replace(day=monthrange(mes_consulta.year, mes_consulta.month)[1]).isoformat()})
        return urls

    def filtro_mes(superficie, tipo, mes, i, etiqueta):
        """Una categoría en un mes. Acredita su etiqueta; una ausencia no acredita nada."""
        nonlocal bloqueada
        ts = int(datetime(mes.year, mes.month, 1, tzinfo=timezone.utc).timestamp())
        u = f'https://atletismorfea.es/ajax/calendario/{ts}/{quote(tipo)}/0/0/0/{i}/{temporadas[str(mes.year)]}/0/0/0'
        consultas.append(u)
        registro = cobertura(superficie, u, [], filtros={'familia': 'categoria', 'id': i, 'etiqueta': etiqueta})
        registro['ventana'] = {'inicio': mes.isoformat(), 'fin': mes.replace(day=monthrange(mes.year, mes.month)[1]).isoformat()}
        try:
            urls = urls_mes(obtener(u), mes)
        except (HTTPError, OSError) as error:
            bloqueada = isinstance(error, HTTPError) and error.code in (403, 429)
            registro.update(estado='fallida', error=f'{type(error).__name__}: {error}'[:500])
            avisos.append({'url': u, 'motivo': 'filtro no disponible; se conservan evidencias positivas anteriores'})
            return registro, None
        registro['urls_observadas'] = urls
        return registro, urls

    for u in list(consultas):
        cobertura_mes('mensual', u, datos.values(), {'tipo': 'Deportivo'})
    deportivas = set(datos)
    # Federativo se lee entero: son pocos actos al año y sus filtros no lo descubren
    # todo (enero de 2024 da concentraciones sin filtrar y ninguna filtrando). Solo
    # se filtra lo que aún no tiene categoría, y cada acto nuevo cuesta una vez.
    federativas, filtros_federativos, intentadas, federativo_leido = set(), {}, [], False

    def obtener_federativo(u):
        if '/ajax/calendario/' in u:
            intentadas.append(u)
        return obtener(u)

    try:
        federativo, parcial = _rfea_mensual(desde, hasta, obtener_federativo, tipo=FEDERATIVO, adyacentes=False)
    except (HTTPError, OSError) as error:
        bloqueada = isinstance(error, HTTPError) and error.code in (403, 429)
        consultas.extend(intentadas)
        for u in intentadas:
            registro = cobertura('federativo', u, [], estado='fallida', filtros={'tipo': 'Federativo'})
            registro['error'] = f'{type(error).__name__}: {error}'[:500]
        avisos.append({'motivo': 'Federativo no disponible; se conservan sus citas anteriores'})
    else:
        federativo_leido = True
        informe['pendientes'].extend(parcial['pendientes'])
        consultas.extend(parcial['consultas'])
        for e in federativo['eventos']:
            if e['id'] in datos and any(datos[e['id']][k] != e[k] for k in ('nombre', 'inicio', 'fin', 'lugar', 'url')):
                avisos.append({'id': e['id'], 'motivo': 'ficha distinta entre Deportivo y Federativo; manda Deportivo'})
                continue
            datos.setdefault(e['id'], e)
            federativas.add(e['id'])
        sin_categoria = {datos[i]['url'] for i in federativas if not any(
            x.get('id') in FEDERATIVAS for x in anteriores.get(i, {}).get('filtros_calendario', []))}
        for u in parcial['consultas']:
            pendientes_mes = sin_categoria & set(cobertura_mes('federativo', u, federativo['eventos'], {'tipo': 'Federativo'}))
            mes = datetime.fromtimestamp(int(u.split('/ajax/calendario/')[1].split('/')[0]), timezone.utc).date()
            for i, etiqueta in categorias:
                if i not in FEDERATIVAS or not pendientes_mes or bloqueada:
                    continue
                registro, urls = filtro_mes('federativo', FEDERATIVO, mes, i, etiqueta)
                if urls is None:
                    continue
                for url_ficha in pendientes_mes & set(urls):
                    filtros_federativos.setdefault(url_ficha, []).append({'familia': 'categoria', 'id': i, 'etiqueta': etiqueta,
                        'evidencia': evidencia(registro['consultas'][0], 'calendar-item/a[href]', etiqueta, 'filtro_calendario')})
                pendientes_mes -= set(urls)
    for i, e in datos.items():
        meta = e['metadatos']
        meta['calendario_tipo'] = 'Deportivo' if i in deportivas else 'Federativo'
        meta['filtros_calendario'] = deepcopy(anteriores.get(i, {}).get('filtros_calendario', []))
        for filtro in filtros_federativos.get(e['url'], []):
            if filtro not in meta['filtros_calendario']:
                meta['filtros_calendario'].append(filtro)
        meta['temporalidad']['dias'] = [(date.fromisoformat(e['inicio']) + timedelta(days=n)).isoformat()
                                       for n in range((date.fromisoformat(e['fin']) - date.fromisoformat(e['inicio'])).days + 1)]
        estado = meta['temporalidad']['estado']
        if estado != 'desconocido':
            e['estado'] = {'suspendido': 'aplazado', 'suspension_parcial': 'programado'}.get(estado, estado)
        cobertura('ficha', e['url'], [i])
        documentos = deepcopy(anteriores.get(i, {}).get('documentos', []))
        if len(meta['sfid']) != 1:
            avisos.append({'id': i, 'url': e['url'], 'motivo': 'sin SFID único; documentos sin leer'})
        elif bloqueada:
            avisos.append({'id': i, 'url': e['url'], 'motivo': 'fuente limitada; se conservan los documentos anteriores'})
        else:
            u = 'https://atletismorfea.es/ajax/championship-documents/' + meta['sfid'][0]
            consultas.append(u)
            registro = cobertura('documentos_ajax', u, [i])
            try:
                documentos = leer_documentos(obtener(u), url=u)
            except (HTTPError, OSError) as error:
                bloqueada = isinstance(error, HTTPError) and error.code in (403, 429)
                registro.update(estado='fallida', ids_resueltos=[], error=f'{type(error).__name__}: {error}'[:500])
                avisos.append({'id': i, 'url': u, 'motivo': 'documentos no disponibles; se conserva la lectura anterior'})
        meta['documentos'].extend(d for d in documentos if d not in meta['documentos'])
        if i in federativas:
            # La tecnificación exige que el enlace declare una convocatoria técnica: no
            # basta el filtro ni la mera existencia de unas normas. No se descargan los
            # PDF. Lo demás lo declara la categoría, y sin ella queda desconocido.
            acreditan = [d for d in meta['documentos'] if (d['rol'] in ('circular', 'reglamento') or re.search(r'convocatoria', d['nombre'], re.I))
                         and re.search(r'concentraci[oó]n|tecnificaci[oó]n|\bPNTD\b', d['nombre'], re.I)]
            declarada = next((x for x in meta['filtros_calendario'] if x.get('id') in ACTIVIDAD_FEDERATIVA), None)
            if acreditan:
                meta['actividad'] = {'valor': 'tecnificacion', 'evidencia': acreditan[0]['evidencia']}
            elif declarada:
                meta['actividad'] = {'valor': ACTIVIDAD_FEDERATIVA[declarada['id']], 'evidencia': declarada['evidencia']}
            elif any(x.get('id') in TECNIFICACION for x in meta['filtros_calendario']):
                # Aviso, no pendiente: se publica igual y no impide retirar citas.
                avisos.append({'id': i, 'url': e['url'], 'motivo': 'filtro técnico sin convocatoria, circular o reglamento acreditativo'})
        if e not in entrada['eventos']:
            entrada['eventos'].append(e)

    # Una sola rotación mensual diaria. Solo meses de la ventana, nunca adyacentes
    # para enriquecer: los adyacentes acreditan exclusivamente los extremos.
    ventana = list(meses(desde, hasta))
    mes = ventana[date.today().toordinal() % len(ventana)]
    pendientes_rotacion = [m.isoformat()[:7] for m in ventana if m != mes]
    for i, etiqueta in categorias:
        if i in FEDERATIVAS or bloqueada:
            continue
        registro, urls = filtro_mes('filtro', 'Deportivo', mes, i, etiqueta)
        if urls is None:
            continue
        for e in entrada['eventos']:
            if e['url'] not in urls:
                continue
            registro['ids_observados'].append(e['id'])
            registro['ids_resueltos'].append(e['id'])
            filtro = {'familia': 'categoria', 'id': i, 'etiqueta': etiqueta,
                      'evidencia': evidencia(registro['consultas'][0], 'calendar-item/a[href]', etiqueta, 'filtro_calendario')}
            lista = e['metadatos']['filtros_calendario']
            if filtro not in lista:
                lista.append(filtro)
    # Si Federativo no se pudo leer, sus citas no están ausentes: se conservan.
    for c in conocidas:
        if (c.get('fuente') == 'rfea' and not c.get('lectura_ambigua') and not federativo_leido
                and c['metadatos'].get('calendario_tipo') == 'Federativo'
                and c['inicio'] <= hasta.isoformat() and c['fin'] >= desde.isoformat()
                and c['id'] not in {e['id'] for e in entrada['eventos']}):
            entrada['eventos'].append(deepcopy({k: c[k] for k in ('id', 'nombre', 'url', 'inicio', 'fin', 'lugar', 'metadatos', 'estado', 'programa') if k in c}))
            avisos.append({'id': c['id'], 'motivo': 'Federativo sin leer; se conserva la cita anterior'})
    informe.update(superficies=superficies, avisos=avisos,
        rotacion_filtros={'mes': mes.isoformat()[:7], 'meses_pendientes': pendientes_rotacion},
        completo=not informe['pendientes'] and not bloqueada and all(s['estado'] == 'completa' for s in superficies),
        bloqueada=bloqueada, aplicar_ausencias=not bloqueada)
    return entrada, informe
