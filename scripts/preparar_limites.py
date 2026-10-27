"""Prepara los límites municipales del IGN por provincia y, con --subir, los publica en R2.

Fuente: servicio WFS INSPIRE de unidades administrativas del IGN (BDDAE),
GeoJSON en longitud/latitud. Un archivo por provincia con `properties.ine`;
polígonos sin simplificar (coordenadas redondeadas a 1e-7°, ≈1 cm). El
manifiesto `shared/territorios/limites.json` conserva URL, huella, caja y
municipios de cada archivo; la lectura los descarga de R2 solo si los necesita.
"""

import argparse
from datetime import datetime, timezone
import gzip
import hashlib
import json
import os
from pathlib import Path
import sys
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from shared.territorios import CARPETA, cargar

SERVICIO = 'https://www.ign.es/wfs-inspire/unidades-administrativas'
FILTRO = ('<fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0" '
          'xmlns:au="http://inspire.ec.europa.eu/schemas/au/4.0">'
          '<fes:PropertyIsLike wildCard="*" singleChar="." escapeChar="!">'
          '<fes:ValueReference>au:nationalCode</fes:ValueReference>'
          '<fes:Literal>{prefijo}*</fes:Literal></fes:PropertyIsLike></fes:Filter>')


def url_provincia(autonomia, provincia):
    # nationalCode = 34 (España) + comunidad + provincia + código INE municipal.
    return SERVICIO + '?' + urlencode({
        'service': 'WFS', 'version': '2.0.0', 'request': 'GetFeature',
        'typeNames': 'au:AdministrativeUnit', 'outputFormat': 'application/geo+json',
        'srsName': 'http://www.opengis.net/def/crs/OGC/1.3/CRS84',
        'FILTER': FILTRO.format(prefijo='34' + autonomia + provincia + provincia)})


def descargar(url, intentos=3):
    for intento in range(intentos):
        try:
            with urlopen(Request(url, headers={'User-Agent': 'voceiro-territorios'}), timeout=600) as r:
                return r.read()
        except OSError:
            if intento == intentos - 1:
                raise
            time.sleep(10 * (intento + 1))


def redondear(valor):
    return [redondear(v) for v in valor] if isinstance(valor, list) else round(valor, 7)


def normalizar(datos, provincia, catalogo):
    """Solo municipios de la instantánea INE; el resto se informa, nunca se asigna."""
    if datos.get('type') != 'FeatureCollection' or not isinstance(datos.get('features'), list):
        raise ValueError('Respuesta IGN sin GeoJSON: ' + provincia)
    features, descartados = [], []
    for f in datos['features']:
        p = f.get('properties') or {}
        codigo = str(p.get('nationalCode') or '')
        nivel = (p.get('nationalLevelName') or {}).get('LocalisedCharacterString')
        nombre = (((p.get('name') or {}).get('GeographicalName') or {}).get('spelling') or {}).get(
            'SpellingOfName', {}).get('text')
        g = f.get('geometry') or {}
        if len(codigo) != 11 or not codigo.isdigit() or codigo[6:8] != provincia or nivel != 'Municipio':
            raise ValueError(f'Unidad IGN inesperada en {provincia}: {codigo} {nivel}')
        if g.get('type') not in ('Polygon', 'MultiPolygon'):
            raise ValueError('Geometría IGN no soportada: ' + codigo)
        if not catalogo.resolver('ine:municipio', codigo[6:]):
            descartados.append({'codigo_ign': codigo, 'nombre': nombre})
            continue
        features.append({'type': 'Feature', 'properties': {'ine': codigo[6:], 'nombre_ign': nombre},
                         'geometry': {'type': g['type'], 'coordinates': redondear(g['coordinates'])}})
    features.sort(key=lambda f: f['properties']['ine'])
    return {'type': 'FeatureCollection', 'features': features}, descartados


def caja(features):
    xs, ys = [], []
    for f in features:
        poligonos = f['geometry']['coordinates']
        for poligono in [poligonos] if f['geometry']['type'] == 'Polygon' else poligonos:
            for x, y in poligono[0]:
                xs.append(x)
                ys.append(y)
    return [min(xs), min(ys), max(xs), max(ys)]


def preparar(carpeta, provincias=None):
    catalogo = cargar()
    admin = json.loads((CARPETA / 'administracion.json').read_text(encoding='utf-8'))
    municipios = json.loads((CARPETA / 'municipios.json').read_text(encoding='utf-8'))['municipios']
    salida = {}
    descartados, faltan = [], []
    for provincia, nombre, autonomia in admin['provincias']:
        if provincias and provincia not in provincias:
            continue
        url = url_provincia(autonomia, provincia)
        datos, fuera = normalizar(json.loads(descargar(url)), provincia, catalogo)
        descartados.extend(fuera)
        esperados = {c for c, _, _ in municipios if c[:2] == provincia}
        vistos = {f['properties']['ine'] for f in datos['features']}
        faltan.extend(sorted(esperados - vistos))
        cuerpo = gzip.compress(json.dumps(datos, ensure_ascii=False, separators=(',', ':')).encode(),
                               compresslevel=9, mtime=0)
        archivo = provincia + '.geojson.gz'
        (carpeta / archivo).write_bytes(cuerpo)
        salida[provincia] = {'archivo': archivo, 'url': url, 'sha256': hashlib.sha256(cuerpo).hexdigest(),
                             'bytes': len(cuerpo), 'municipios': len(vistos), 'caja': caja(datos['features'])}
        print(f'{provincia} {nombre}: {len(vistos)} municipios, {len(cuerpo) // 1024} KB'
              + (f'; faltan {len(esperados - vistos)}' if esperados - vistos else ''), flush=True)
    return salida, descartados, faltan


def subir(carpeta, manifiesto):
    import boto3
    cliente = boto3.client('s3', endpoint_url=f'https://{os.environ["R2_ACCOUNT_ID"]}.r2.cloudflarestorage.com',
        aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'], region_name='auto')
    for info in manifiesto['provincias'].values():
        cliente.put_object(Bucket=os.environ['R2_BUCKET'], Key=manifiesto['prefijo_r2'] + info['archivo'],
                           Body=(carpeta / info['archivo']).read_bytes(), ContentType='application/gzip')


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('carpeta', type=Path, help='Carpeta local de los archivos por provincia')
    ap.add_argument('--provincias', help='Códigos separados por comas (por defecto todas)')
    ap.add_argument('--subir', action='store_true', help='Publicar los archivos en R2 (credenciales R2_*)')
    ap.add_argument('--manifiesto', type=Path, default=CARPETA / 'limites.json')
    args = ap.parse_args()
    args.carpeta.mkdir(parents=True, exist_ok=True)
    comprobado = datetime.now(timezone.utc).isoformat(timespec='seconds')
    provincias, descartados, faltan = preparar(args.carpeta, set(args.provincias.split(',')) if args.provincias else None)
    manifiesto = {'version': 1, 'fuente': 'Instituto Geográfico Nacional · Unidades administrativas INSPIRE (BDDAE)',
                  'licencia': 'CC BY 4.0', 'licencia_url': 'https://www.ign.es/resources/licencia/Condiciones_licenciaUso_IGN.pdf',
                  'servicio': SERVICIO, 'comprobado': comprobado, 'margen_revision_m': 50,
                  'prefijo_r2': 'territorios/limites/' + comprobado[:10] + '/',
                  'provincias': provincias, 'descartados': descartados, 'faltan': faltan}
    if args.subir:
        subir(args.carpeta, manifiesto)
    args.manifiesto.write_text(json.dumps(manifiesto, ensure_ascii=False, indent=2) + '\n')
    print(f'{len(provincias)} provincias; {sum(p["municipios"] for p in provincias.values())} municipios; '
          f'{len(faltan)} sin límite; {len(descartados)} unidades fuera del INE')


if __name__ == '__main__':
    main()
