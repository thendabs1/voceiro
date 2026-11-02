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

from . import atletismo, deporte

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


def resolver(inventario, revisiones):
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
            e = atletismo.equivalencias().get(('rfea', i))
            if not e:
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
    pendientes = [f for f in inventario['filas'] if f['huella'] not in resueltas]
    sin_aplicar = [r['id'] for r in revisiones['revisiones'] if r['huella'] not in resueltas]
    return {'entrada': {'version': 1, 'fuente': 'rfea', 'eventos': eventos},
            'pendientes': pendientes, 'revisiones_no_aplicadas': sin_aplicar,
            'completo': not pendientes and not sin_aplicar}


def main():
    import argparse
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--pdf', required=True, help='PDF público descargado; necesita Poppler (pdfinfo/pdftotext)')
    ap.add_argument('--salida', required=True, help='Inventario de revisión, no entrada de importación')
    ap.add_argument('--revisiones', help='Registro de identidades y fechas revisadas')
    ap.add_argument('--entrada', help='Guardar solo las citas resueltas para --entrada-atletismo')
    args = ap.parse_args()
    if bool(args.revisiones) != bool(args.entrada):
        ap.error('--revisiones y --entrada deben indicarse juntos')
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
        resultado = resolver(inventario, json.loads(Path(args.revisiones).read_text(encoding='utf-8')))
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
