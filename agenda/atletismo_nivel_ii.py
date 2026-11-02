"""Inventario Nivel II sin inventar IDs desde títulos, fechas o filas del PDF.

La extracción es completa; solo las filas con identidad revisada producen una
entrada para atletismo.importar. La huella identifica contenido, nunca una cita.
"""
from datetime import datetime
from hashlib import sha256
import json
from pathlib import Path
import re
import subprocess
from uuid import uuid4

from . import atletismo, atletismo_coincidencias as coincidencias, deporte

URL = 'https://atletismorfea.es/sites/default/files/2025-03/CalendarioNivel_II_general.pdf'
TIPOS = {'AL', 'ST', 'Cross', 'Marcha', 'Ruta', 'Trail Running'}


def huella(fila):
    return sha256(json.dumps(fila, ensure_ascii=False, sort_keys=True,
                             separators=(',', ':')).encode()).hexdigest()


def leer(texto, paginas_esperadas):
    """Texto de pdftotext -layout; falla ante páginas o líneas sin interpretar."""
    paginas = texto.split('\f')
    if not paginas[-1].strip():
        paginas.pop()
    if not paginas or len(paginas) != paginas_esperadas:
        raise ValueError('Nivel II: número de páginas incompleto')
    fechas = re.findall(r'Actualizado a:\s*(\d{1,2}/\d{1,2}/\d{4})', texto)
    temporadas = set(re.findall(r'Calendario Pruebas Nivel II (\d{4})', texto))
    if len(set(fechas)) != 1 or len(temporadas) != 1:
        raise ValueError('Nivel II: falta actualización o temporada inequívoca')
    actualizado = datetime.strptime(fechas[0], '%d/%m/%Y').date().isoformat()
    temporada = temporadas.pop()
    filas = []
    for numero, pagina in enumerate(paginas, 1):
        recibidas = 0
        for linea in pagina.splitlines():
            if not linea.strip():
                continue
            if (re.fullmatch(r'\s*Calendario Pruebas Nivel II \d{4}\s*', linea)
                    or re.fullmatch(r'\s*Actualizado a:\s*\d{1,2}/\d{1,2}/\d{4}\s*', linea)
                    or re.fullmatch(r'\s*Fed\s+Fecha\s+Tipo\s+Nombre de la competición\s+Instalación\s+Ciudad\s*', linea)):
                continue
            m = re.fullmatch(r'\s*(?:([A-Z]{3})\s+)?(\d{1,2}/\d{1,2}/\d{4})\s+(.*)', linea)
            if not m:
                raise ValueError(f'Nivel II: línea sin interpretar en página {numero}: {linea.strip()}')
            fecha = datetime.strptime(m[2], '%d/%m/%Y').date().isoformat()
            if not fecha.startswith(temporada + '-'):
                raise ValueError('Nivel II: fecha fuera de la temporada declarada')
            campos = re.split(r'\s{2,}', m[3].strip())
            tipo = campos.pop(0) if campos[0] in TIPOS else ''
            # En esta distribución, un tipo ausente deja libre toda su columna.
            if (not tipo and m.start(3) < 32) or len(campos) not in (2, 3):
                raise ValueError(f'Nivel II: columnas ambiguas en página {numero}')
            nombre, ciudad = campos[0], campos[-1]
            fila = {'federacion_literal': m[1] or '', 'fecha': fecha,
                    'tipo_literal': tipo, 'nombre': nombre,
                    'instalacion': campos[1] if len(campos) == 3 else '', 'ciudad': ciudad}
            filas.append({'huella': huella(fila), 'pagina': numero, 'fila': fila})
            recibidas += 1
        if not recibidas:
            raise ValueError(f'Nivel II: página {numero} sin filas')
    return {'version': 1, 'url': URL, 'temporada': temporada, 'actualizado': actualizado,
            'paginas': len(paginas), 'huella_texto': sha256(texto.encode()).hexdigest(), 'filas': filas}


def resolver(inventario, revisiones, n=None, *, incorporar_nuevas=False):
    """Separa entradas revisadas y pendientes, sin publicar un prefijo como completo.

    Un cambio de contenido exige revisar su huella y conservar el ID editorial.
    Filas idénticas repetidas permanecen pendientes por su alcance ambiguo.
    """
    if inventario.get('version') != 1 or revisiones.get('version') != 1 or inventario.get('url') != URL:
        raise ValueError('Contrato Nivel II desconocido')
    indice = {}
    for f in inventario['filas']:
        if f['huella'] != huella(f['fila']):
            raise ValueError('Nivel II: fila alterada sin actualizar su huella')
        indice.setdefault(f['huella'], []).append(f)
    eventos, resueltas = [], set()
    for r in deporte.unicos(deporte.filas(revisiones, 'revisiones'), 'id'):
        i = deporte.literal(r['id'])
        if not re.fullmatch(r'nivel-ii:[a-z0-9-]+', i):
            raise ValueError('Nivel II requiere ID editorial en su propio espacio')
        datetime.strptime(r['fecha_revision'], '%Y-%m-%d')
        if not r.get('criterio') or not r.get('evidencias'):
            raise ValueError('Nivel II: identidad sin revisión acreditada')
        h = r['huella']
        if h in resueltas:
            raise ValueError('Nivel II: fila asignada a dos identidades')
        if len(indice.get(h, [])) != 1:
            # Un registro antiguo no autoriza a interpretar una nueva fila ni
            # la ausencia como cancelación. Se informa para reconciliación.
            continue
        if r.get('decision') == 'equivalencia':
            # Con la otra cita ya guardada, la equivalencia es una conciliación.
            if not (atletismo.equivalencias().get(('rfea', i)) or any(
                    c['referencias'].get('rfea') == i for c in coincidencias.revisiones_identidad())):
                raise ValueError('Nivel II: falta equivalencia revisada')
        elif r.get('decision') != 'nueva':
            raise ValueError('Nivel II: falta decidir identidad o equivalencia')
        observacion = indice[h][0]
        f = observacion['fila']
        # Los estados literales del PDF se conservan, no se infieren del título.
        # Una fila aplazada o con duración dudosa no debe aprobarse sin resolverla.
        inicio, fin = r['inicio'], r['fin']
        deporte.dias(inicio, fin)
        estado = r.get('estado')
        if estado not in ('programado', 'aplazado', 'cancelado', 'desconocido'):
            raise ValueError('Nivel II: falta revisión explícita de estado')
        eventos.append({'id': i, 'nombre': f['nombre'], 'url': URL + '#page=' + str(observacion['pagina']),
            'inicio': inicio, 'fin': fin, 'estado': estado,
            'lugar': {'nombre': f['instalacion'], 'city': f['ciudad']},
            'metadatos': {'nivel_rfea': 'II', 'modalidad_literal': f['tipo_literal'],
                'nivel_ii': {'fila': f, 'huella': h, 'actualizado': inventario['actualizado'],
                    'huella_texto': inventario['huella_texto'], 'pagina': observacion['pagina'],
                    'revision': r}}})
        resueltas.add(h)
    # Las filas coincidentes con una cita identificada no necesitan revisión
    # individual. Su ID editorial deriva de esa referencia estable, no del PDF.
    candidatos = []
    conocidos = coincidencias.actuales(n)
    for observacion in inventario['filas']:
        f = observacion['fila']
        if observacion['huella'] in resueltas or len(indice[observacion['huella']]) != 1:
            continue
        e = {'id': 'nivel-ii:candidata', 'nombre': f['nombre'], 'inicio': f['fecha'], 'fin': f['fecha'],
             'lugar': {'nombre': f['instalacion'], 'city': f['ciudad']}, 'url': URL,
             'metadatos': {'modalidad_literal': f['tipo_literal'], 'nivel_rfea': 'II'}}
        guardadas = [c for c in conocidos if c['fuente'] == 'rfea' and c['id'].startswith('nivel-ii:auto-')
                     and not c['lectura_ambigua'] and
                     (c['metadatos'].get('nivel_ii') or {}).get('huella') == observacion['huella']]
        if len(guardadas) == 1:
            e['id'] = guardadas[0]['id']
            candidatos.append((observacion, e, {'cita': guardadas[0]}))
            continue
        decision = coincidencias.decidir('rfea', e, conocidos)
        if decision['estado'] == 'automatica':
            candidatos.append((observacion, e, decision))
    cantidades = {}
    for _, _, d in candidatos:
        destino = d['cita']['destino']['id']
        cantidades[destino] = cantidades.get(destino, 0) + 1
    for observacion, e, d in candidatos:
        if cantidades[d['cita']['destino']['id']] != 1:
            continue
        if e['id'] == 'nivel-ii:candidata':
            e['id'] = 'nivel-ii:auto-' + d['cita']['referencia']
        e['metadatos']['nivel_ii'] = {'fila': observacion['fila'], 'huella': observacion['huella'],
            'actualizado': inventario['actualizado'], 'huella_texto': inventario['huella_texto'],
            'pagina': observacion['pagina'], 'referencia_coincidente':
                (d['cita']['metadatos'].get('nivel_ii') or {}).get('referencia_coincidente') or d['cita']['referencia']}
        e['url'] = URL + '#page=' + str(observacion['pagina'])
        eventos.append(e)
        resueltas.add(observacion['huella'])
    incidencias = []
    if incorporar_nuevas:
        # Las referencias internas viven en el núcleo, junto a su última fila.
        # Una huella permite reconocer una lectura, pero nunca genera el ID.
        anteriores = [c for c in conocidos if c['fuente'] == 'rfea'
                      and c['id'].startswith('nivel-ii:') and c['metadatos'].get('nivel_ii')]
        for observacion in inventario['filas']:
            h, f = observacion['huella'], observacion['fila']
            if h in resueltas:
                continue
            iguales = [c for c in anteriores if c['metadatos']['nivel_ii'].get('huella') == h]
            if len(indice[h]) != 1 or len(iguales) > 1:
                incidencias.append({'huella': h, 'motivo': 'fila o identidad duplicada'})
                continue
            if len(iguales) == 1 and not iguales[0]['lectura_ambigua']:
                # Reutilizar también las identidades editoriales que ya estaban
                # guardadas; la ausencia del registro no autoriza a cambiarlas.
                c = iguales[0]
                eventos.append({'id': c['id'], 'nombre': f['nombre'], 'url': c['url'],
                    'inicio': c['inicio'], 'fin': c['fin'], 'lugar': c['lugar'], 'estado': c['estado'],
                    'metadatos': {**c['metadatos'], 'nivel_ii': {**c['metadatos']['nivel_ii'],
                        'actualizado': inventario['actualizado'], 'huella_texto': inventario['huella_texto'],
                        'pagina': observacion['pagina']}}})
                resueltas.add(h)
                continue
            # No convertir una reprogramación en una nueva competición. El
            # contraste de nombres ignora aquí la fecha deliberadamente: los
            # controles recurrentes también pueden requerir revisión.
            def parecida(a, b):
                ta = set(coincidencias.normalizar(a['nombre']).split())
                tb = set(coincidencias.normalizar(b['nombre']).split())
                numeros_a = {t for t in ta if t.isdigit()}
                numeros_b = {t for t in tb if t.isdigit()}
                return bool(ta and tb and numeros_a == numeros_b
                            and 2 * len(ta & tb) / (len(ta) + len(tb)) >= .9)

            dudosas = [c['id'] for c in anteriores
                       if c['metadatos']['nivel_ii'].get('fila', {}).get('federacion_literal') == f['federacion_literal']
                       and c['inicio'][:4] == f['fecha'][:4] and parecida(f, c)]
            e = {'id': 'nivel-ii:candidata', 'nombre': f['nombre'], 'inicio': f['fecha'], 'fin': f['fecha'],
                 'lugar': {'nombre': f['instalacion'], 'city': f['ciudad']}, 'url': URL,
                 'metadatos': {'modalidad_literal': f['tipo_literal'], 'nivel_rfea': 'II'}}
            decision = coincidencias.decidir('rfea', e, conocidos)
            repetidas = [o['huella'] for o in inventario['filas'] if o['huella'] != h
                         and o['fila']['federacion_literal'] == f['federacion_literal']
                         and parecida(f, o['fila'])]
            if dudosas or repetidas or decision['estado'] != 'nueva' or re.search(
                    r'aprazad|aplazad|suspendid|cancelad', f['nombre'], re.I):
                incidencias.append({'huella': h, 'motivo': 'identidad, alcance o estado por revisar',
                    'referencias': dudosas, 'otras_filas': repetidas,
                    'candidatos': decision.get('candidatos', [])})
                continue
            e['id'] = 'nivel-ii:local-' + uuid4().hex
            e['url'] = URL + '#page=' + str(observacion['pagina'])
            e['estado'] = 'desconocido'
            e['metadatos'].update(duracion_confirmada=False, nivel_ii={
                'fila': f, 'huella': h, 'actualizado': inventario['actualizado'],
                'huella_texto': inventario['huella_texto'], 'pagina': observacion['pagina'],
                'identidad_interna': True, 'criterio': 'fila nueva sin correspondencias ni ambigüedades'})
            eventos.append(e)
            resueltas.add(h)
    pendientes = [f for f in inventario['filas'] if f['huella'] not in resueltas]
    sin_aplicar = [r['id'] for r in revisiones['revisiones'] if r['huella'] not in resueltas]
    return {'entrada': {'version': 1, 'fuente': 'rfea', 'eventos': eventos},
            'pendientes': pendientes, 'revisiones_no_aplicadas': sin_aplicar,
            'incidencias': incidencias,
            'completo': not pendientes and not sin_aplicar}


def main():
    import argparse
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--pdf', required=True, help='PDF público descargado; necesita Poppler (pdfinfo/pdftotext)')
    ap.add_argument('--salida', required=True, help='Inventario de revisión, no entrada de importación')
    ap.add_argument('--revisiones', help='Registro de identidades y fechas revisadas')
    ap.add_argument('--entrada', help='Guardar solo las citas resueltas para --entrada-atletismo')
    ap.add_argument('--nucleo', help='Núcleo v2 local para resolver coincidencias automáticamente')
    ap.add_argument('--incorporar-nuevas', action='store_true',
                    help='Asignar IDs internos a filas nuevas inequívocas; importar y conservar el núcleo resultante')
    args = ap.parse_args()
    if bool(args.revisiones) != bool(args.entrada):
        ap.error('--revisiones y --entrada deben indicarse juntos')
    if args.nucleo and not args.revisiones:
        ap.error('--nucleo requiere --revisiones y --entrada')
    if args.incorporar_nuevas and not args.revisiones:
        ap.error('--incorporar-nuevas requiere --revisiones y --entrada')
    info = subprocess.run(['pdfinfo', args.pdf], check=True, capture_output=True, text=True).stdout
    paginas = re.search(r'^Pages:\s+(\d+)$', info, re.M)
    if not paginas:
        raise ValueError('No se pudo acreditar el número de páginas del PDF')
    texto = subprocess.run(['pdftotext', '-layout', args.pdf, '-'], check=True,
                           capture_output=True, text=True, encoding='utf-8').stdout
    inventario = leer(texto, int(paginas[1]))
    inventario['huella_pdf'] = sha256(Path(args.pdf).read_bytes()).hexdigest()
    resultado = None
    if args.revisiones:
        n = json.loads(Path(args.nucleo).read_text(encoding='utf-8')) if args.nucleo else None
        resultado = resolver(inventario, json.loads(Path(args.revisiones).read_text(encoding='utf-8')), n,
                             incorporar_nuevas=args.incorporar_nuevas)
        inventario['resolucion'] = {k: v for k, v in resultado.items() if k != 'entrada'}
    Path(args.salida).write_text(json.dumps(inventario, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if resultado is not None:
        Path(args.entrada).write_text(json.dumps(resultado['entrada'], ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f"Nivel II: {len(inventario['filas'])} filas; "
              f"{len(resultado['entrada']['eventos'])} citas revisadas; "
              f"{len(resultado['pendientes'])} filas pendientes; "
              f"{len(resultado['revisiones_no_aplicadas'])} revisiones sin aplicar")


if __name__ == '__main__':
    main()
