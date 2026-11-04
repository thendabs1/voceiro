"""Recogidas federativas acotadas. No publica ni habilita fuentes públicas.

Cada lector entrega el mismo contrato de atletismo.importar. Las federaciones
conservan identidad, cobertura y errores independientes de sus coincidencias.
"""
from calendar import monthrange
from datetime import date, datetime, timedelta, timezone
from hashlib import sha256
import json
from pathlib import Path
import re
import subprocess
import tempfile
import time
from urllib.error import HTTPError
from urllib.parse import quote, urlencode

from bs4 import BeautifulSoup

from . import atletismo, atletismo_calendario_pdf, atletismo_coincidencias as coincidencias, atletismo_modalidades, atletismo_nivel_ii, atletismo_rfea, recogida


# Ficha y documentos por cita, más meses y filtros: unas 300 en temporada alta.
PRESUPUESTO_RFEA = 400


def meses(desde, hasta):
    d = desde.replace(day=1)
    while d <= hasta:
        yield d
        d = (d.replace(day=28) + timedelta(days=4)).replace(day=1)


def ventana(inicio, fin):
    desde = date.fromisoformat(inicio) if inicio else date.today()
    hasta = date.fromisoformat(fin) if fin else desde + timedelta(days=60)
    if not 0 <= (hasta - desde).days <= 90:
        raise ValueError('Atletismo requiere una ventana de 1 a 91 días')
    return desde, hasta


def rfea(desde, hasta, obtener, *, conocidas=()):
    return atletismo_rfea.recoger(desde, hasta, obtener, conocidas=conocidas)


def _rfea_mensual(desde, hasta, obtener, *, tipo='Deportivo', categoria='0', adyacentes=True):
    base = atletismo.FUENTES['rfea'][1]
    portada = BeautifulSoup(obtener(base), 'html.parser')
    temporadas = {o.get_text(strip=True): o.get('value')
                  for o in portada.select('.calendar-field-season option')}
    # Los meses adyacentes acreditan los extremos, incluso al cambiar de año.
    inicio = ((desde.replace(day=1) - timedelta(days=1)).replace(day=1) if adyacentes else desde.replace(day=1))
    fin = ((hasta.replace(day=28) + timedelta(days=4)).replace(day=1) if adyacentes else hasta.replace(day=1))
    consultas, fichas, datos, respuestas, seleccionadas = {}, {}, {}, {}, set()
    for _ in range(12):
        for mes in meses(inicio, fin):
            if mes in consultas:
                continue
            temporada = temporadas.get(str(mes.year))
            if not temporada or not str(temporada).isdigit():
                raise ValueError(f'RFEA no publica la temporada {mes.year} necesaria para comprobar extremos')
            timestamp = int(datetime(mes.year, mes.month, 1, tzinfo=timezone.utc).timestamp())
            url = f'https://atletismorfea.es/ajax/calendario/{timestamp}/{quote(tipo)}/0/0/0/{categoria}/{temporada}/0/0/0'
            respuesta = json.loads(obtener(url))
            if not isinstance(respuesta, list):
                raise ValueError('RFEA no devuelve comandos Drupal')
            respuestas[mes] = respuesta
            consultas[mes] = url
        # Seleccionar primero por días de la ventana. Los meses adyacentes
        # sirven para cerrar esas citas, no para descargar todas sus fichas.
        for mes, respuesta in respuestas.items():
            for comando in respuesta:
                if comando.get('selector') != '#calendar_container':
                    continue
                s = BeautifulSoup(comando.get('data', ''), 'html.parser')
                for dia in s.select('.calendar-day'):
                    fecha = mes.replace(day=int(atletismo.texto(dia.select_one('.monthday'))))
                    if desde <= fecha <= hasta:
                        seleccionadas.update(atletismo.enlace('rfea', a['href'])
                                             for a in dia.select('.calendar-item > a[href]'))
        for u in sorted(seleccionadas):
            if u not in fichas:
                fichas[u] = obtener(u)
        datos = {}
        for mes, respuesta in respuestas.items():
            citas = atletismo.leer_rfea(mes.strftime('%Y-%m'), respuesta, fichas, urls=seleccionadas)
            for cita in citas:
                previa = datos.setdefault(cita['id'], {**cita, 'dias_observados': []})
                if any(previa[k] != cita[k] for k in ('nombre', 'url', 'lugar', 'metadatos')):
                    raise ValueError('RFEA cambió una competición entre meses de la misma recogida')
                previa['dias_observados'].extend(cita['dias_observados'])
        ultimo = fin.replace(day=monthrange(fin.year, fin.month)[1])
        relevantes = [e for e in datos.values() if any(
            desde.isoformat() <= d <= hasta.isoformat() for d in e['dias_observados'])]
        limite_izquierdo = any(inicio.isoformat() in e['dias_observados'] for e in relevantes)
        limite_derecho = any(ultimo.isoformat() in e['dias_observados'] for e in relevantes)
        if not limite_izquierdo and not limite_derecho:
            break
        if limite_izquierdo:
            inicio = (inicio - timedelta(days=1)).replace(day=1)
        if limite_derecho:
            fin = (fin.replace(day=28) + timedelta(days=4)).replace(day=1)
    else:
        raise ValueError('RFEA: no se pudieron cerrar los extremos en doce ampliaciones')
    eventos, pendientes = [], []
    for e in datos.values():
        dias = sorted(set(e.pop('dias_observados')))
        if dias[-1] < desde.isoformat() or dias[0] > hasta.isoformat():
            continue
        if any(date.fromisoformat(b) - date.fromisoformat(a) != timedelta(days=1)
               for a, b in zip(dias, dias[1:])):
            pendientes.append({'id': e['id'], 'motivo': 'días no consecutivos', 'dias': dias,
                               'inicio': dias[0], 'fin': dias[-1]})
            continue
        eventos.append({**e, 'inicio': dias[0], 'fin': dias[-1],
                        'metadatos': {**e['metadatos'], 'duracion_confirmada': True}})
    return {'version': 1, 'fuente': 'rfea', 'eventos': eventos}, {
        'consultas': list(consultas.values()), 'pendientes': pendientes, 'completo': not pendientes}


def cataluna(desde, hasta, obtener):
    base = 'https://fcatletisme.cat/wp-json/tribe/events/v1/events'
    parametros = {'start_date': desde.isoformat(), 'end_date': hasta.isoformat(), 'per_page': 100}
    paginas, urls = [], []
    for numero in range(1, 101):
        url = base + '?' + urlencode({**parametros, 'page': numero})
        p = json.loads(obtener(url))
        if not isinstance(p, dict) or type(p.get('total_pages')) is not int:
            raise ValueError('FCA sin paginación acreditada')
        urls.append(url)
        paginas.append(p)
        if p['total_pages'] == 0 and p.get('total') == 0 and p.get('events') == []:
            if numero != 1:
                raise ValueError('FCA cambió el total entre páginas')
            return {'version': 1, 'fuente': 'fca', 'eventos': []}, {'consultas': urls, 'completo': True, 'pendientes': []}
        if numero == p['total_pages']:
            eventos = atletismo.leer_cataluna(paginas)
            return {'version': 1, 'fuente': 'fca', 'eventos': eventos}, {'consultas': urls, 'completo': True, 'pendientes': []}
    raise ValueError('FCA excede el límite de cien páginas')


def galicia(desde, hasta, obtener, *, conocidas=()):
    from .atletismo_fga import recoger
    return recoger(desde, hasta, obtener, conocidas=conocidas)


def wa_configuracion():
    datos = json.loads(Path(__file__).with_name('atletismo-wa-seleccion.json').read_text())
    juegos = json.loads(Path(__file__).with_name('atletismo-wa-juegos.json').read_text())
    if datos.get('version') != 1 or juegos.get('version') != 1:
        raise ValueError('Versión editorial WA desconocida')
    grupos = {int(i): [circuito] for i, circuito in datos['grupos'].items()}
    revisiones = juegos.get('juegos')
    if not isinstance(revisiones, list):
        raise ValueError('WA: registro editorial de Juegos inválido')
    por_id = {str(j['id']): j for j in revisiones}
    if len(por_id) != len(revisiones):
        raise ValueError('WA: Juegos editoriales repetidos')
    return grupos, por_id


def wa_unidad(grupo, desde, hasta, obtener):
    """Una consulta por grupo y ventana, completa y validada antes de usarla."""
    base = atletismo.FUENTES['wa'][1]
    vistos, eventos, consultas, total = set(), [], [], None
    for offset in range(0, 100000, 100):
        url = base + '?' + urlencode({'startDate': desde.isoformat(), 'endDate': hasta.isoformat(),
                                      'competitionGroupId': grupo, 'offset': offset})
        s = BeautifulSoup(obtener(url), 'html.parser').select_one('script#__NEXT_DATA__')
        if s is None or not s.string:
            raise ValueError('WA: falta JSON __NEXT_DATA__')
        pagina = json.loads(s.string)['props']['pageProps']['initialEvents']
        parametros = pagina.get('parameters') or {}
        if (str(parametros.get('competitionGroupId')) != str(grupo)
                or parametros.get('startDate') != desde.isoformat()
                or parametros.get('endDate') != hasta.isoformat()
                or parametros.get('offset') != offset):
            raise ValueError('WA: el servidor no aplicó los filtros solicitados')
        if type(pagina.get('hits')) is not int or pagina['hits'] < 0:
            raise ValueError('WA: total inválido')
        if total is None:
            total = pagina['hits']
        elif pagina['hits'] != total:
            raise ValueError('WA: total cambiante entre páginas')
        resultados = pagina.get('results')
        if not isinstance(resultados, list) or len(resultados) != min(100, total - offset):
            raise ValueError('WA: página incompleta')
        for e in resultados:
            i = str(e['id'])
            if i in vistos:
                raise ValueError('WA: ID repetido dentro del grupo y ventana')
            vistos.add(i)
            eventos.append(e)
        consultas.append(url)
        if len(eventos) == total:
            return eventos, consultas
    raise ValueError('WA excede el límite de mil páginas')


def wa_evento(e, circuitos, juegos):
    i = str(e['id'])
    inicio, fin = e.get('startDate'), e.get('endDate')
    if e.get('undeterminedCompetitionPeriod') is not None or not inicio or not fin:
        return None, {'id': i, 'nombre': e.get('name'), 'motivo': 'periodo indeterminado o fechas ausentes',
                      'inicio': inicio, 'fin': fin}
    revision = None
    if any(g in (5, 329) for g in circuitos):
        revision = juegos.get(i)
        if not revision:
            return None, {'id': i, 'nombre': e.get('name'), 'motivo': 'Juegos sin fechas editoriales de atletismo',
                          'inicio': inicio, 'fin': fin}
        if not revision.get('evidencia') or not revision.get('url'):
            raise ValueError('WA: Juegos sin evidencia editorial')
        inicio, fin = revision['inicio'], revision['fin']
    date.fromisoformat(inicio)
    date.fromisoformat(fin)
    if fin < inicio:
        raise ValueError('WA: fin anterior al inicio')
    was = e.get('wasUrl')
    return {'id': i, 'nombre': e['name'], 'url': atletismo.enlace('wa', was) if was else atletismo.FUENTES['wa'][1],
            'inicio': inicio, 'fin': fin, 'lugar': {'nombre': e.get('venue')},
            'grupos': sorted({c['id'] for grupo in circuitos for c in circuitos[grupo]}),
            'metadatos': {**({'iaafId': e['iaafId']} if e.get('iaafId') is not None else {}),
                **({'fechas_juegos': revision} if revision else {}),
                'area': e.get('area'),
                'rankingCategory': e.get('rankingCategory'), 'competitionSubgroup': e.get('competitionSubgroup'),
                'disciplines': e.get('disciplines'), 'season': e.get('season'),
                'hasResults': e.get('hasResults'), 'hasStartlist': e.get('hasStartlist'),
                'grupos_wa': sorted(circuitos)}}, None


def wa(desde, hasta, obtener):
    seleccion, juegos = wa_configuracion()
    datos, grupos_por_id, consultas = {}, {}, []
    for grupo in seleccion:
        resultados, urls = wa_unidad(grupo, desde, hasta, obtener)
        consultas.extend(urls)
        for e in resultados:
            i = str(e['id'])
            if i in datos:
                # Una ficha puede variar en campos secundarios entre consultas;
                # sus extremos sí deben ser coherentes en la misma lectura.
                if any(datos[i].get(k) != e.get(k) for k in ('name', 'startDate', 'endDate', 'undeterminedCompetitionPeriod')):
                    raise ValueError('WA: cita contradictoria entre grupos')
            else:
                datos[i] = e
            grupos_por_id.setdefault(i, set()).add(grupo)
    eventos, pendientes = [], []
    for i, e in datos.items():
        cita, pendiente = wa_evento(e, {g: seleccion[g] for g in grupos_por_id[i]}, juegos)
        if pendiente:
            pendientes.append(pendiente)
        else:
            eventos.append(cita)
    usados = {g for gs in grupos_por_id.values() for g in gs}
    circuitos = {c['id']: c for g in sorted(usados) for c in seleccion[g]}
    agrupaciones = [{'id': c['id'], 'nombre': c['nombre'], 'clase': 'circuito',
                     'codigo_consulta': c['codigo_consulta'], 'url': atletismo.FUENTES['wa'][1]}
                    for c in circuitos.values()]
    return {'version': 1, 'fuente': 'wa', 'eventos': eventos, 'agrupaciones': agrupaciones}, {
        'consultas': consultas, 'pendientes': pendientes, 'completo': not pendientes}


LECTORES = {'rfea': rfea, 'fga': galicia, 'fca': cataluna, 'wa': wa}


def url_ficha(fuente, cita):
    if fuente == 'fca':
        return 'https://fcatletisme.cat/wp-json/tribe/events/v1/events/' + cita['id']
    return cita['url']


def ficha_cataluna(cita, contenido, obtener):
    p = json.loads(contenido)
    if not isinstance(p, dict) or str(p.get('id')) != cita['id']:
        raise ValueError('FCA: la ficha no corresponde a la cita guardada')
    if p.get('status') != 'publish' or p.get('hide_from_listings') is not False:
        return {'ausencia': 'fuera del listado'}
    return {'entrada': {'eventos': atletismo.leer_cataluna([{'total': 1, 'total_pages': 1, 'events': [p]}])}}


def ficha_galicia(cita, contenido, obtener):
    from . import atletismo_fga as fga
    try:
        ficha = fga.leer_ficha(contenido, url=cita['url'])
    except fga.FechasDudosas as error:
        return {'pendiente': str(error)}
    if ficha['id'] != cita['id']:
        raise ValueError('FGA: la ficha no corresponde a la cita guardada')
    t = ficha['metadatos']['temporalidad']
    entrada, informe = galicia(date.fromisoformat(t['dias'][0]), date.fromisoformat(t['dias'][-1]), obtener)
    if informe.get('conservar_lectura'):
        return {'bloqueo': True}
    if not informe.get('aplicar_ausencias', False):
        return {'pendiente': 'superficie parcial; se conserva la última lectura'}
    eventos = [e for e in entrada['eventos'] if e['id'] == cita['id']]
    if not eventos:
        return {'ausencia': 'ficha sin listado en sus fechas'}
    return {'entrada': {'eventos': eventos, 'agrupaciones': entrada['agrupaciones']}}


def ficha_rfea(cita, contenido, obtener):
    s = BeautifulSoup(contenido, 'html.parser')
    ajustes = s.select_one('script[data-drupal-selector="drupal-settings-json"]')
    if not ajustes or json.loads(ajustes.string)['path']['currentPath'] != 'championship/' + cita['id']:
        raise ValueError('RFEA: la ficha no corresponde a la cita guardada')
    # La ficha no publica el año: se oculta hasta que una ventana la vuelva a leer.
    return {'ausencia': 'trasladada: ' + (atletismo.texto(s.select_one('.c_e_date')) or 'sin fecha')}


FICHAS = {'rfea': ficha_rfea, 'fga': ficha_galicia, 'fca': ficha_cataluna}


def retirada(fuente, error):
    if error.code in (404, 410):
        return True
    if fuente != 'fca' or error.code != 400:
        return False
    # Tribe valida el ID: un evento borrado no es un parámetro válido.
    try:
        cuerpo = json.loads(error.read())
    except (ValueError, OSError):
        return False
    return cuerpo.get('code') == 'rest_invalid_param' and 'id' in ((cuerpo.get('data') or {}).get('params') or {})


def reconsultar(fuente, conocidas, entrada, informe, desde, hasta, obtener, observado):
    """Citas guardadas en la ventana que una lectura completa ya no trae.

    Se pide su ficha: si da otra fecha, se reimporta; si no la sostiene o ya
    no existe, la cita deja de publicarse sin cancelarse. Solo el 404/410 de
    la propia ficha acredita la retirada; otros errores interrumpen la fuente
    y conservan la última lectura buena.

    Una cita que el listado deja pendiente con otras fechas no se reconsulta:
    deja de publicarse, porque su fecha guardada ya está desmentida. Si la
    lectura trae menos de la mitad de lo conocido (al menos cinco ausentes),
    se trata como lectura rota: falla sin retirar nada.
    """
    if fuente in ('fga', 'rfea') and not informe.get('aplicar_ausencias', True):
        return {'ausencias': [], 'reimportadas': []}
    leidas = {str(x['id']) for x in (*entrada['eventos'], *informe['pendientes'], *entrada.get('agrupaciones', []))}
    pendientes = {str(x['id']): x for x in informe['pendientes']}
    en_ventana = [c for c in conocidas if c['fin'] >= desde.isoformat() and c['inicio'] <= hasta.isoformat()]
    faltan = [c for c in en_ventana if c['id'] not in leidas]
    if len(faltan) >= 5 and 2 * len(faltan) > len(en_ventana):
        raise ValueError(f'{fuente}: la lectura no trae {len(faltan)} de {len(en_ventana)} citas conocidas; '
                         'no se retira nada')
    ausencias, reimportadas = [], []

    def desmentida(c, p, motivo):
        # Pendiente con otras fechas (del listado o de su ficha): la guardada ya no vale.
        if 'inicio' not in p or (p['inicio'], p['fin']) == (c['inicio'], c['fin']):
            return False
        ausencias.append({'id': c['id'], 'url': c['url'], 'comprobado': observado,
                          'motivo': f"fechas cambiadas ({p['inicio']} – {p['fin']}); {motivo}"})
        return True

    for c in conocidas:
        p = pendientes.get(c['id'])
        if p and desmentida(c, p, p['motivo']):
            continue
        if c['id'] in leidas or c['fin'] < desde.isoformat() or c['inicio'] > hasta.isoformat():
            continue
        if fuente == 'wa':
            seleccion, juegos = wa_configuracion()
            grupos_wa = c['metadatos'].get('grupos_wa') or []
            if not grupos_wa or grupos_wa[0] not in seleccion:
                raise ValueError('WA: cita guardada sin grupo de consulta')
            amplio_desde = date.fromisoformat(c['inicio']) - timedelta(days=365)
            amplio_hasta = date.fromisoformat(c['fin']) + timedelta(days=365)
            hallada, presentes = None, {}
            for grupo_wa in grupos_wa:
                if grupo_wa not in seleccion:
                    raise ValueError('WA: grupo guardado fuera de la selección')
                resultados, urls = wa_unidad(grupo_wa, amplio_desde, amplio_hasta, obtener)
                informe['consultas'].extend(urls)
                encontrada = next((e for e in resultados if str(e['id']) == c['id']), None)
                if encontrada:
                    if hallada and any(hallada.get(k) != encontrada.get(k)
                                       for k in ('name', 'startDate', 'endDate', 'undeterminedCompetitionPeriod')):
                        raise ValueError('WA: cita contradictoria en la reconsulta')
                    hallada = encontrada
                    presentes[grupo_wa] = seleccion[grupo_wa]
            if hallada is None:
                ausencias.append({'id': c['id'], 'url': c['url'], 'comprobado': observado,
                                  'motivo': 'no aparece en la reconsulta amplia'})
                continue
            nueva, pendiente = wa_evento(hallada, presentes, juegos)
            if pendiente:
                informe['pendientes'].append(pendiente)
                informe['completo'] = False
                desmentida(c, pendiente, pendiente['motivo'])
                continue
            entrada['eventos'].append(nueva)
            existentes = {g['id'] for g in entrada.get('agrupaciones', [])}
            for circuito in {c['id']: c for lista in presentes.values() for c in lista}.values():
                if circuito['id'] not in existentes:
                    entrada.setdefault('agrupaciones', []).append({
                        'id': circuito['id'], 'nombre': circuito['nombre'], 'clase': 'circuito',
                        'codigo_consulta': circuito['codigo_consulta'], 'url': atletismo.FUENTES['wa'][1]})
            reimportadas.append(c['id'])
            continue
        try:
            contenido = obtener(url_ficha(fuente, c))
        except HTTPError as error:
            if not retirada(fuente, error):
                raise
            ausencias.append({'id': c['id'], 'url': c['url'], 'comprobado': observado,
                              'motivo': f'ficha retirada (HTTP {error.code})'})
            continue
        r = FICHAS[fuente](c, contenido, obtener)
        if r.get('bloqueo'):
            # La fuente ha dejado de responder: nada de esta pasada acredita ausencias.
            informe['pendientes'].append({'id': c['id'], 'url': c['url'], 'motivo': 'lectura bloqueada en la reconsulta'})
            informe.update(completo=False, aplicar_ausencias=False, conservar_lectura=True)
            return {'ausencias': [], 'reimportadas': []}
        if 'pendiente' in r:
            # Queda para revisar y la recogida, incompleta; con las mismas fechas
            # se conserva la última lectura.
            informe['pendientes'].append({'id': c['id'], 'url': c['url'], 'motivo': r['pendiente'],
                                          **{k: r[k] for k in ('inicio', 'fin') if k in r}})
            informe['completo'] = False
            desmentida(c, r, r['pendiente'])
        elif 'ausencia' in r:
            ausencias.append({'id': c['id'], 'url': c['url'], 'motivo': r['ausencia'], 'comprobado': observado})
        else:
            nueva = r['entrada']
            vistas = {g['id'] for g in entrada.get('agrupaciones', [])}
            entrada.setdefault('agrupaciones', []).extend(g for g in nueva.get('agrupaciones', []) if g['id'] not in vistas)
            entrada['eventos'].extend(nueva['eventos'])
            reimportadas.append(c['id'])
    return {'ausencias': ausencias, 'reimportadas': reimportadas}


def recoger(fuente, inicio=None, fin=None, *, descargar=None, max_peticiones=None, cache=None,
            conocidas=(), observado=None):
    max_peticiones = max_peticiones or (PRESUPUESTO_RFEA if fuente == 'rfea' else 200)
    if fuente not in LECTORES or not 1 <= max_peticiones <= 500:
        raise ValueError('Fuente o presupuesto de atletismo desconocidos')
    desde, hasta = ventana(inicio, fin)
    peticiones = 0
    consultas_wa = []
    memoria = {}
    ultimo_fin = None

    def obtener(url, *, binario=False):
        nonlocal peticiones, ultimo_fin
        clave = (url, binario)
        if clave in memoria:
            guardada = memoria[clave]
            if isinstance(guardada, Exception):
                raise guardada
            return guardada
        archivo = None
        ficha = fuente == 'rfea' and '/calendario/campeonato/' in url
        if ficha and cache:
            archivo = Path(cache) / (sha256(url.encode()).hexdigest() + '.json')
            if archivo.exists() and time.time() - archivo.stat().st_mtime < 86400:
                try:
                    guardada = json.loads(archivo.read_text())
                    if guardada.get('url') == url and isinstance(guardada.get('html'), str):
                        return guardada['html']
                except (ValueError, OSError):
                    pass
        if peticiones >= max_peticiones:
            raise ValueError('Atletismo agotó su presupuesto; no se importa una recogida parcial')
        peticiones += 1
        if fuente in ('fga', 'rfea') and descargar is None and ultimo_fin is not None:
            pausa = 2.5 if fuente == 'fga' else 1
            time.sleep(max(0, pausa - (time.monotonic() - ultimo_fin)))
        if fuente == 'wa' and peticiones > 1 and descargar is None:
            time.sleep(1)  # Sin reintentos: un 429 interrumpe la fuente.
        if fuente == 'wa':
            consultas_wa.append(url)
        try:
            html = ((descargar or recogida.descargar)(url, binario=True) if binario
                    else (descargar or recogida.descargar)(url))
        except Exception as error:
            if fuente in ('fga', 'rfea'):
                memoria[clave] = error
            if fuente == 'wa' and isinstance(error, HTTPError):
                error.wa_consultas = consultas_wa[:]
            raise
        finally:
            if fuente in ('fga', 'rfea'):
                ultimo_fin = time.monotonic()
        if fuente in ('fga', 'rfea'):
            memoria[clave] = html
        if archivo:
            s = BeautifulSoup(html, 'html.parser')
            ajustes = s.select_one('script[data-drupal-selector="drupal-settings-json"]')
            if not ajustes or not re.fullmatch(r'championship/\d+', json.loads(ajustes.string)['path']['currentPath']):
                raise ValueError('Ficha RFEA sin identidad; no se guarda en caché')
            from calendario import guardar
            guardar(archivo, {'url': url, 'html': html})
        return html

    entrada, informe = (galicia(desde, hasta, obtener, conocidas=conocidas) if fuente == 'fga'
                        else LECTORES[fuente](desde, hasta, obtener, conocidas=conocidas) if fuente == 'rfea'
                        else LECTORES[fuente](desde, hasta, obtener))
    informe.update(reconsultar(fuente, conocidas, entrada, informe, desde, hasta, obtener,
                               observado or datetime.now(timezone.utc).isoformat(timespec='microseconds')))
    if fuente == 'rfea' and informe.get('bloqueada'):
        # La fuente pidió parar: no se le piden más documentos en esta pasada.
        atletismo_calendario_pdf.conservar(entrada['eventos'], conocidas)
    elif fuente == 'rfea':
        informe['calendario_pdf'] = calendario_pdf(entrada, desde, hasta, obtener, conocidas)
        informe['calendario_pdf'].update(peticiones_indice=sum(not b and '/communication-hub/circulares' in u for u, b in memoria),
                                         peticiones_pdf=sum(b for _, b in memoria))
        informe['completo'] = informe['completo'] and informe['calendario_pdf']['completo']
    if fuente == 'rfea':
        for e in entrada['eventos']:
            if 'fuente' in e.get('metadatos', {}):
                atletismo_rfea.relacion(e)
    return entrada, {'version': 1, 'fuente': fuente, 'inicio': desde.isoformat(), 'fin': hasta.isoformat(),
                      'peticiones': peticiones, 'citas': len(entrada['eventos']), **informe}


def calendario_pdf(entrada, desde, hasta, obtener, conocidas=()):
    """Informe independiente: un documento caído no invalida el mensual."""
    lector = atletismo_calendario_pdf
    informe = {'completo': True, 'consultas_indice': [], 'consultas_pdf': [], 'documentos': [],
               'automaticas': 0, 'a_revision': 0, 'sin_fila': 0, 'avisos': []}
    entradas, url = [], lector.INDICE
    try:
        while url:
            if url in informe['consultas_indice'] or len(informe['consultas_indice']) >= 100:
                raise ValueError('Calendario RFEA: paginación repetida o excesiva')
            informe['consultas_indice'].append(url)
            pagina, url = lector.leer_indice(obtener(url), url)
            entradas.extend(pagina)
    except Exception as error:
        lector.conservar(entrada['eventos'], conocidas)
        informe.update(completo=False, error=f'{type(error).__name__}: {error}'[:500])
        informe['avisos'].append('No se leyó el índice; se conserva el calendario anterior')
    else:
        for temporada in sorted({e['inicio'][:4] for e in entrada['eventos']}):
            eventos = [e for e in entrada['eventos'] if e['inicio'][:4] == temporada]
            try:
                candidata = lector.seleccionar(entradas, temporada)
                informe['consultas_pdf'].append(candidata['url'])
                contenido = obtener(candidata['url'], binario=True)
                with tempfile.TemporaryDirectory() as carpeta:
                    pdf = Path(carpeta) / 'calendario.pdf'
                    pdf.write_bytes(contenido)
                    texto = subprocess.run(['pdftotext', '-layout', str(pdf), '-'], check=True,
                        capture_output=True, text=True, encoding='utf-8', timeout=30).stdout
                lector.confirmar_portada(texto, candidata, temporada)
                inventario = lector.leer(texto)
                if inventario['temporada'] != temporada:
                    raise ValueError('Calendario RFEA: temporada diferente de la portada')
                resultado = lector.enlazar(eventos, inventario, candidata['url'])
            except lector.SinCalendario as error:
                lector.conservar(eventos, conocidas)
                informe['avisos'].append(str(error))
            except Exception as error:
                lector.conservar(eventos, conocidas)
                informe['completo'] = False
                informe['avisos'].append(f'{temporada}: {type(error).__name__}: {error}'[:500])
            else:
                informe['documentos'].append({k: candidata[k] for k in ('numero', 'fecha', 'url')} | {
                    'temporada': temporada, 'actualizado': inventario['actualizado'],
                    'sha256': sha256(contenido).hexdigest(), 'filas': len(inventario['filas'])})
                for k, valor in resultado.items():
                    informe[k] += valor
    return informe


def nivel_ii(n, inicio, fin):
    """Inventario completo del documento, selección de citas por ventana."""
    with tempfile.TemporaryDirectory() as carpeta:
        pdf = Path(carpeta) / 'nivel-ii.pdf'
        pdf.write_bytes(recogida.descargar(atletismo_nivel_ii.URL, binario=True))
        info = subprocess.run(['pdfinfo', str(pdf)], check=True, capture_output=True, text=True, timeout=30).stdout
        paginas = re.search(r'^Pages:\s+(\d+)$', info, re.M)
        if not paginas:
            raise ValueError('Nivel II no acredita número de páginas')
        texto = subprocess.run(['pdftotext', '-layout', str(pdf), '-'], check=True,
                               capture_output=True, text=True, timeout=30).stdout
    inventario = atletismo_nivel_ii.leer(texto, int(paginas[1]))
    if inventario['temporada'] not in {inicio[:4], fin[:4]}:
        raise ValueError('Nivel II publica una temporada ajena a la ventana solicitada')
    revisiones = json.loads(Path(atletismo_nivel_ii.__file__).with_name('atletismo-nivel-ii-revisiones.json').read_text())
    resultado = atletismo_nivel_ii.resolver(inventario, revisiones, n, incorporar_nuevas=True)
    resultado['entrada']['eventos'] = [e for e in resultado['entrada']['eventos']
        if e['fin'] >= inicio and e['inicio'] <= fin]
    # La completitud es la de la ventana; las filas de otras fechas se cuentan aparte.
    fechas = {f['huella']: f['fila']['fecha'] for f in inventario['filas']}
    pendientes = [p for p in resultado['pendientes'] if inicio <= p['fila']['fecha'] <= fin]
    incidencias = [i for i in resultado['incidencias'] if inicio <= fechas[i['huella']] <= fin]
    # Una revisión sin fechas cuenta siempre; con fechas, solo si toca la ventana.
    por_id = {v['id']: v for v in revisiones['revisiones']}
    no_aplicadas = [i for i in resultado['revisiones_no_aplicadas']
                    if not por_id.get(i, {}).get('inicio')
                    or por_id[i]['inicio'] <= fin and por_id[i].get('fin', por_id[i]['inicio']) >= inicio]
    # Una ventana a caballo de dos años no está completa con el documento de uno.
    sin_documento = sorted({inicio[:4], fin[:4]} - {inventario['temporada']})
    return resultado['entrada'], {'temporada': inventario['temporada'], 'actualizado': inventario['actualizado'],
        'filas': len(inventario['filas']), 'temporadas_sin_documento': sin_documento,
        'completo': not pendientes and not no_aplicadas and not sin_documento,
        'citas_ventana': len(resultado['entrada']['eventos']),
        'pendientes': pendientes, 'incidencias': incidencias,
        'pendientes_fuera_ventana': len(resultado['pendientes']) - len(pendientes),
        'revisiones_no_aplicadas': no_aplicadas,
        'revisiones_no_aplicadas_fuera_ventana': len(resultado['revisiones_no_aplicadas']) - len(no_aplicadas)}


def main(argv=None):
    import argparse
    from copy import deepcopy
    from . import almacen, nucleo
    from .modelo import integrar
    from .transicion import ampliar

    ap = argparse.ArgumentParser(description=__doc__)
    origen = ap.add_mutually_exclusive_group(required=True)
    origen.add_argument('--db', help='SQLite dedicada; no publica')
    origen.add_argument('--turso', action='store_true')
    ap.add_argument('--fuente', choices=LECTORES, required=True)
    ap.add_argument('--inicio')
    ap.add_argument('--fin')
    ap.add_argument('--informe', help='Informe JSON local de cobertura e incidencias')
    ap.add_argument('--cache', default=str(Path.home() / '.cache/voceiro/atletismo'),
                    help='Caché de fichas RFEA durante 24 horas; los meses se consultan siempre')
    args = ap.parse_args(argv)
    desde, hasta = ventana(args.inicio, args.fin)
    observado = datetime.now(timezone.utc).isoformat(timespec='microseconds')

    def preparar(anterior):
        anterior = anterior or integrar(None, [], {}, observado)
        calendario = ampliar(anterior)
        conocidas = [c for c in coincidencias.actuales(calendario['nucleo'])
                     if c['fuente'] == args.fuente and not c['id'].startswith('nivel-ii:')]
        entrada, informe = recoger(args.fuente, desde.isoformat(), hasta.isoformat(), cache=args.cache,
                                   conocidas=conocidas, observado=observado)
        if informe.get('conservar_lectura'):
            return calendario, informe
        n = atletismo.importar(calendario['nucleo'], entrada, observado)
        leidas = list(entrada['eventos'])
        if args.fuente == 'rfea':
            # Documento aparte: si falla, se guarda la lectura mensual y Nivel II
            # conserva su última lectura buena; el paso se señala como fallido.
            try:
                entrada_ii, informe_ii = nivel_ii(n, desde.isoformat(), hasta.isoformat())
            except Exception as error:
                informe_ii = {'completo': False, 'error': f'{type(error).__name__}: {error}'[:500]}
            else:
                n = atletismo.importar(n, entrada_ii, observado)
                leidas += entrada_ii['eventos']
            informe['nivel_ii'] = informe_ii
            informe['completo'] = informe['completo'] and informe_ii['completo']
        n = atletismo.registrar_ausencias(n, args.fuente, informe.get('ausencias'))
        # Literal nuevo: se avisa para ampliar la tabla; no hace incompleta la lectura.
        informe['modalidades_desconocidas'] = sorted({x for e in leidas
                                                      for x in atletismo_modalidades.de(e.get('metadatos'))[1]})
        # Hasta dónde se ha leído la fuente: más allá, el calendario no está vacío sino sin recoger.
        n['fuentes'][args.fuente]['ventana'] = {'inicio': informe['inicio'], 'fin': informe['fin']}
        n['selecciones'] = deepcopy(anterior.get('nucleo', {}).get('selecciones', {}))
        nucleo.recalcular_selecciones(n)
        calendario['nucleo'] = n
        return calendario, informe

    def pasos(informe):
        return [('INSERT INTO agenda_estado(clave,valor_json) VALUES (?,?) '
                 'ON CONFLICT(clave) DO UPDATE SET valor_json=excluded.valor_json',
                 ('atletismo-informe-' + args.fuente, json.dumps({**informe, 'observado': observado}, ensure_ascii=False)))]

    try:
        if args.turso:
            from .turso import abrir
            remoto = abrir()
            remoto.inicializar()
            anterior = remoto.cargar()
            calendario, informe = preparar(anterior)
            remoto.guardar(calendario, solo_nucleo=anterior is not None, pasos_extra=pasos(informe))
        else:
            with almacen.abrir(args.db) as db:
                anterior = almacen.cargar(db)
                calendario, informe = preparar(anterior)
                almacen.guardar(db, calendario, solo_nucleo=anterior is not None, pasos_extra=pasos(informe))
    except HTTPError as error:
        if args.fuente == 'wa' and error.code == 429:
            fallo = {'version': 1, 'fuente': 'wa', 'inicio': desde.isoformat(),
                'fin': hasta.isoformat(), 'completo': False, 'error': 'HTTP 429',
                'retry_after': error.headers.get('Retry-After') if error.headers else None,
                'consultas': getattr(error, 'wa_consultas', []),
                'peticiones': len(getattr(error, 'wa_consultas', []))}
            if args.informe:
                from calendario import guardar
                guardar(args.informe, fallo)
            import sys
            print(json.dumps(fallo, ensure_ascii=False), file=sys.stderr)
        raise
    if args.informe:
        from calendario import guardar
        guardar(args.informe, informe)
    print(json.dumps({**{k: informe[k] for k in ('fuente', 'inicio', 'fin', 'peticiones', 'citas', 'completo')},
                      'ausencias': len(informe.get('ausencias', [])), 'reimportadas': len(informe.get('reimportadas', [])),
                      **({'avisos': informe['avisos']} if informe.get('avisos') else {}),
                      **({'calendario_pdf': {k: v for k, v in informe['calendario_pdf'].items()
                                             if k in ('automaticas', 'a_revision', 'sin_fila', 'avisos')}}
                         if 'calendario_pdf' in informe else {}),
                      **({'modalidades_desconocidas': informe['modalidades_desconocidas']}
                         if informe.get('modalidades_desconocidas') else {})}, ensure_ascii=False))
    if error := informe.get('nivel_ii', {}).get('error'):
        raise SystemExit('Nivel II no se leyó; RFEA mensual guardada: ' + error)
    if not informe.get('calendario_pdf', {}).get('completo', True):
        raise SystemExit('Calendario PDF no se leyó; RFEA mensual guardada')


if __name__ == '__main__':
    main()
