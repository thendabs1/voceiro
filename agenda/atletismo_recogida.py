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
from urllib.parse import urlencode

from bs4 import BeautifulSoup

from . import atletismo, atletismo_nivel_ii, recogida


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


def rfea(desde, hasta, obtener):
    base = atletismo.FUENTES['rfea'][1]
    portada = BeautifulSoup(obtener(base), 'html.parser')
    temporadas = {o.get_text(strip=True): o.get('value')
                  for o in portada.select('.calendar-field-season option')}
    # Los meses adyacentes acreditan los extremos, incluso al cambiar de año.
    inicio = (desde.replace(day=1) - timedelta(days=1)).replace(day=1)
    fin = (hasta.replace(day=28) + timedelta(days=4)).replace(day=1)
    consultas, fichas, datos, respuestas, seleccionadas = {}, {}, {}, {}, set()
    for _ in range(12):
        for mes in meses(inicio, fin):
            if mes in consultas:
                continue
            temporada = temporadas.get(str(mes.year))
            if not temporada or not str(temporada).isdigit():
                raise ValueError(f'RFEA no publica la temporada {mes.year} necesaria para comprobar extremos')
            timestamp = int(datetime(mes.year, mes.month, 1, tzinfo=timezone.utc).timestamp())
            url = f'https://atletismorfea.es/ajax/calendario/{timestamp}/Deportivo/0/0/0/0/{temporada}/0/0/0'
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
            pendientes.append({'id': e['id'], 'motivo': 'días no consecutivos', 'dias': dias})
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


def galicia(desde, hasta, obtener):
    revisadas = json.loads(Path(__file__).with_name('atletismo-citas-revisadas.json').read_text())
    if revisadas.get('version') != 1:
        raise ValueError('Registro de citas revisadas desconocido')
    datos, urls = {}, []
    for mes in meses(desde, hasta):
        url = atletismo.FUENTES['fga'][1] + '?' + urlencode({'cp_date': mes.strftime('%d/%m/%Y')})
        html = obtener(url)
        s = BeautifulSoup(html, 'html.parser')
        if s.select('.pagination a, .page-numbers, .load-more'):
            raise ValueError('FGA anuncia paginación aún no contrastada')
        for e in atletismo.leer_galicia(html):
            if e['id'] in datos and datos[e['id']] != e:
                raise ValueError('FGA cambió una competición entre meses')
            datos[e['id']] = e
        urls.append(url)
    padres = {e['metadatos']['circuito_declarado']['url']
              for e in datos.values() if e['metadatos'].get('circuito_declarado')}
    agrupaciones, grupos, eventos, pendientes = [], {}, [], []
    for e in datos.values():
        if e['url'] in padres:
            grupos[e['url']] = e['id']
            agrupaciones.append({k: e[k] for k in ('id', 'nombre', 'url')} | {'clase': 'circuito'})
    for url in sorted(padres - grupos.keys()):
        s = BeautifulSoup(obtener(url), 'html.parser')
        articulo = s.select_one('main article.type-competition')
        ids = [c[5:] for c in (articulo.get('class', []) if articulo else []) if re.fullmatch(r'post-\d+', c)]
        nombre = atletismo.texto(s.select_one('main h1'))
        if len(ids) != 1 or not nombre:
            raise ValueError('FGA: agrupación enlazada sin identidad acreditada')
        grupos[url] = ids[0]
        # El vínculo acredita una colección. Su nombre no decide si es un
        # circuito deportivo o un plan de tecnificación.
        agrupaciones.append({'id': ids[0], 'nombre': nombre, 'url': url, 'clase': 'coleccion'})
    for e in datos.values():
        if e['url'] in grupos or e['fin'] < desde.isoformat() or e['inicio'] > hasta.isoformat():
            continue
        padre = e['metadatos'].get('circuito_declarado')
        revision = revisadas['fga'].get(e['id'])
        if padre and padre['url'] not in grupos or (re.search(r'circu[ií]t|circuito', e['nombre'], re.I)
                                                    and not padre and not revision):
            pendientes.append({'id': e['id'], 'url': e['url'], 'motivo': 'agrupación o jornadas por acreditar'})
            continue
        if padre:
            e['grupo'] = grupos[padre['url']]
        if revision:
            if not revision.get('criterio') or e['url'] not in revision.get('evidencias', []):
                raise ValueError('Cita revisada sin evidencia aplicable')
            e['metadatos']['actividad_revisada'] = revision
        e['metadatos'].update(atletismo.leer_ficha_galicia(obtener(e['url'])))
        eventos.append(e)
    return {'version': 1, 'fuente': 'fga', 'eventos': eventos, 'agrupaciones': agrupaciones}, {
        'consultas': urls, 'pendientes': pendientes, 'completo': not pendientes}


LECTORES = {'rfea': rfea, 'fga': galicia, 'fca': cataluna}


def recoger(fuente, inicio=None, fin=None, *, descargar=None, max_peticiones=200, cache=None):
    if fuente not in LECTORES or not 1 <= max_peticiones <= 500:
        raise ValueError('Fuente o presupuesto de atletismo desconocidos')
    desde, hasta = ventana(inicio, fin)
    peticiones = 0

    def obtener(url):
        nonlocal peticiones
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
        if ficha and descargar is None:
            time.sleep(1)  # Sin reintentos: un 429 interrumpe la fuente.
        html = (descargar or recogida.descargar)(url)
        if archivo:
            s = BeautifulSoup(html, 'html.parser')
            ajustes = s.select_one('script[data-drupal-selector="drupal-settings-json"]')
            if not ajustes or not re.fullmatch(r'championship/\d+', json.loads(ajustes.string)['path']['currentPath']):
                raise ValueError('Ficha RFEA sin identidad; no se guarda en caché')
            from calendario import guardar
            guardar(archivo, {'url': url, 'html': html})
        return html

    entrada, informe = LECTORES[fuente](desde, hasta, obtener)
    return entrada, {'version': 1, 'fuente': fuente, 'inicio': desde.isoformat(), 'fin': hasta.isoformat(),
                      'peticiones': peticiones, 'citas': len(entrada['eventos']), **informe}


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
    return resultado['entrada'], {'temporada': inventario['temporada'], 'actualizado': inventario['actualizado'],
        'filas': len(inventario['filas']), 'completo': resultado['completo'],
        'citas_ventana': len(resultado['entrada']['eventos']),
        'pendientes': resultado['pendientes'], 'incidencias': resultado['incidencias'],
        'revisiones_no_aplicadas': resultado['revisiones_no_aplicadas']}


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
        entrada, informe = recoger(args.fuente, desde.isoformat(), hasta.isoformat(), cache=args.cache)
        n = atletismo.importar(calendario['nucleo'], entrada, observado)
        if args.fuente == 'rfea':
            entrada_ii, informe_ii = nivel_ii(n, desde.isoformat(), hasta.isoformat())
            n = atletismo.importar(n, entrada_ii, observado)
            informe['nivel_ii'] = informe_ii
            informe['completo'] = informe['completo'] and informe_ii['completo']
        n['selecciones'] = deepcopy(anterior.get('nucleo', {}).get('selecciones', {}))
        nucleo.recalcular_selecciones(n)
        calendario['nucleo'] = n
        return calendario, informe

    def pasos(informe):
        return [('INSERT INTO agenda_estado(clave,valor_json) VALUES (?,?) '
                 'ON CONFLICT(clave) DO UPDATE SET valor_json=excluded.valor_json',
                 ('atletismo-informe-' + args.fuente, json.dumps({**informe, 'observado': observado}, ensure_ascii=False)))]

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
    if args.informe:
        from calendario import guardar
        guardar(args.informe, informe)
    print(json.dumps({k: informe[k] for k in ('fuente', 'inicio', 'fin', 'peticiones', 'citas', 'completo')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
