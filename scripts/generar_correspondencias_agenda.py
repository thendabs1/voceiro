"""Prepara cruces municipales desde descargas locales; no consulta ni publica nada.

El manifiesto lista archivos con lector, url y fuente: kulturklik, geoeuskadi
o idena. Las coordenadas se resuelven fuera del camino de lectura.
La salida se revisa antes de sustituir el catálogo versionado.
"""

import argparse
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from shared.territorios import importadores
from shared.territorios.relacionador import Relacionador


def preparar(manifiesto, base, carpeta):
    cruces, puntos, mapas = [], [], []
    comprobado = manifiesto['comprobado']
    for entrada in manifiesto['entradas']:
        cuerpo = (carpeta / entrada['archivo']).read_bytes()
        if entrada.get('sha256') and hashlib.sha256(cuerpo).hexdigest() != entrada['sha256']:
            raise ValueError('Descarga distinta de la revisión del manifiesto: ' + entrada['archivo'])
        lector = entrada['lector']
        datos, prueba = importadores.leer(cuerpo, entrada['url'], entrada['fuente'], comprobado)
        if lector == 'kulturklik':
            puntos.extend(importadores.puntos_kulturklik(datos, prueba))
        elif lector in ('geoeuskadi', 'idena'):
            mapas.append(importadores.limites(datos, prueba, lector))
        else:
            raise ValueError('Lector territorial desconocido: ' + lector)
    geograficos, pendientes = importadores.cruzar_puntos(puntos, mapas)
    cruces.extend(geograficos)
    por_id = {}
    for cruce in cruces:
        anterior = por_id.setdefault(cruce['id'], cruce)
        if anterior['territorio'] != cruce['territorio']:
            raise ValueError('Catálogos con ubicaciones contradictorias: ' + cruce['id'])
        if anterior is not cruce:
            anterior['evidencias'].extend(cruce['evidencias'])
    # No sustituir manuales ni cruces de otras revisiones. Una evidencia que
    # discrepe queda como conflicto en el relacionador, nunca gana por orden.
    anteriores = {c['id']: c for c in base['correspondencias']}
    refs_pendientes = {json.dumps(p['referencia'], sort_keys=True) for p in pendientes}
    for c in anteriores.values():
        if c['id'] in por_id and c['territorio'] != por_id[c['id']]['territorio']:
            raise ValueError('Un cruce anterior cambia de municipio: revisión explícita de ' + c['id'])
        if c['metodo'] == 'coordenadas_municipales_en_limites_oficiales' and (
                json.dumps(c['referencia'], sort_keys=True) in refs_pendientes):
            raise ValueError('Un cruce anterior ya no está acreditado: revisión explícita de ' + c['id'])
    anteriores.update(por_id)
    nuevas_refs = {json.dumps(c['referencia'], sort_keys=True) for c in cruces}
    pendientes_previos = {json.dumps(p['referencia'], sort_keys=True): p for p in base['pendientes']
                         if json.dumps(p['referencia'], sort_keys=True) not in nuevas_refs}
    pendientes_previos.update({json.dumps(p['referencia'], sort_keys=True): {
        'referencia': p['referencia'], 'motivo': ','.join(p['motivos']), 'evidencias': p['evidencias']}
        for p in pendientes})
    salida = {**base, 'version': base['version'] + 1,
        'alcance': 'Recintos de Madrid con comprobación manual y municipios Kulturklik contrastados '
                   'con límites oficiales. Revisión local; sin vigencia histórica.',
        'correspondencias': list(anteriores.values()),
        'pendientes': list(pendientes_previos.values())}
    Relacionador(salida)  # Validación del contrato y destinos antes de escribir.
    return salida, {'cruces': len(por_id), 'municipios_kulturklik': len(geograficos),
                    'pendientes_kulturklik': pendientes}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('manifiesto', type=Path)
    ap.add_argument('--base', type=Path, default=Path(__file__).resolve().parents[1]
                    / 'shared/territorios/correspondencias.json')
    ap.add_argument('--salida', type=Path, required=True)
    ap.add_argument('--informe', type=Path, required=True)
    ap.add_argument('--carpeta', type=Path, help='Carpeta de las descargas (por defecto junto al manifiesto)')
    args = ap.parse_args()
    salida, informe = preparar(json.loads(args.manifiesto.read_text()), json.loads(args.base.read_text()),
                               args.carpeta or args.manifiesto.parent)
    args.salida.write_text(json.dumps(salida, ensure_ascii=False, indent=2) + '\n')
    args.informe.write_text(json.dumps(informe, ensure_ascii=False, indent=2) + '\n')
    print(f'Cruces preparados: {informe["cruces"]}; municipios Kulturklik: '
          f'{informe["municipios_kulturklik"]}; pendientes: {len(informe["pendientes_kulturklik"])}')


if __name__ == '__main__':
    main()
