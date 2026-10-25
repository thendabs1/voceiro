"""Catálogo INE reproducible desde su XLSX; no consulta la red ni usa credenciales.

python scripts/generar_territorios.py --municipios /ruta/diccionario26.xlsx
python scripts/generar_territorios.py --check
"""

import argparse
from hashlib import sha256
import json
from pathlib import Path
import re
from xml.etree import ElementTree as ET
from zipfile import ZipFile


RAIZ = Path(__file__).resolve().parents[1]
CARPETA = RAIZ / 'shared' / 'territorios'
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def leer_municipios(ruta):
    with ZipFile(ruta) as archivo:
        textos = [''.join(n.itertext()) for n in ET.fromstring(
            archivo.read('xl/sharedStrings.xml')).findall('s:si', NS)]
        filas = ET.fromstring(archivo.read('xl/worksheets/sheet1.xml')).findall('s:sheetData/s:row', NS)
        datos = []
        for fila in filas:
            celdas = {}
            for c in fila:
                valor = c.findtext('s:v', default='', namespaces=NS)
                celdas[re.sub(r'[0-9]', '', c.attrib['r'])] = textos[int(valor)] if c.get('t') == 's' else valor
            datos.append(celdas)
    if [datos[1].get(c) for c in 'ABCDE'] != ['CODAUTO', 'CPRO', 'CMUN', 'DC', 'NOMBRE']:
        raise ValueError('Cabecera INE inesperada')
    municipios, vistos = [], set()
    administracion = json.loads((CARPETA / 'administracion.json').read_text())
    provincias = {p: a for p, _, a in administracion['provincias']}
    for fila in datos[2:]:
        a, p, m, dc, nombre = (fila.get(c, '') for c in 'ABCDE')
        codigo = p + m
        if (not re.fullmatch(r'[0-9]{5}', codigo) or not re.fullmatch(r'[0-9]', dc)
                or p not in provincias or provincias[p] != a or not nombre or codigo in vistos):
            raise ValueError('Municipio INE inválido o repetido')
        vistos.add(codigo)
        municipios.append([codigo, dc, nombre])
    if set(provincias) != {m[0][:2] for m in municipios}:
        raise ValueError('Faltan provincias en el catálogo municipal')
    return sorted(municipios)


def javascript(administracion):
    return ('// Generado por scripts/generar_territorios.py desde administracion.json. No editar.\n'
            + 'export const ADMINISTRACION = '
            + json.dumps(administracion, ensure_ascii=False, separators=(',', ':')) + ';\n'
            + 'export const PROVINCIAS = Object.fromEntries(ADMINISTRACION.provincias.map(([c, n]) => [c, n]));\n')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--municipios', type=Path)
    p.add_argument('--check', action='store_true')
    args = p.parse_args()
    if args.check and args.municipios:
        p.error('--check no modifica el catálogo')
    administracion = json.loads((CARPETA / 'administracion.json').read_text())
    js = javascript(administracion)
    destino = CARPETA / 'administracion.js'
    if args.check:
        if destino.read_text() != js:
            raise ValueError('Ejecutar python scripts/generar_territorios.py')
    else:
        if args.municipios:
            # Primera instantánea contrastada. Otra edición necesita revisar vigencias y alias.
            if '1 de enero de 2026' not in _titulo(args.municipios):
                raise ValueError('Revisar la edición INE antes de actualizar el catálogo')
            contenido = {'version': 1, 'fecha_referencia': '2026-01-01',
                'fuente': 'https://www.ine.es/daco/daco42/codmun/diccionario26.xlsx',
                'sha256': sha256(args.municipios.read_bytes()).hexdigest(),
                'municipios': leer_municipios(args.municipios)}
            texto = json.dumps({k: v for k, v in contenido.items() if k != 'municipios'}, ensure_ascii=False, indent=2)
            texto = texto[:-2] + ',\n  "municipios": [\n' + ',\n'.join(
                '    ' + json.dumps(m, ensure_ascii=False) for m in contenido['municipios']) + '\n  ]\n}\n'
            (CARPETA / 'municipios.json').write_text(texto)
        destino.write_text(js)


def _titulo(ruta):
    with ZipFile(ruta) as archivo:
        textos = [''.join(n.itertext()) for n in ET.fromstring(
            archivo.read('xl/sharedStrings.xml')).findall('s:si', NS)]
        celda = ET.fromstring(archivo.read('xl/worksheets/sheet1.xml')).find('s:sheetData/s:row/s:c', NS)
        return textos[int(celda.find('s:v', NS).text)]


if __name__ == '__main__':
    main()
