"""Punto → municipio INE con los límites del IGN por provincia (limites.json).

Carga solo las provincias cuya caja contiene el punto, desde una carpeta local
o, si falta, desde R2 (verificando la huella del manifiesto). Mismas reglas que
geometria.py: nunca el municipio más cercano; cerca del límite o en dos recintos
queda pendiente o en conflicto. Sin límites disponibles, `limites_no_disponibles`.
"""

import gzip
import hashlib
import json
import os
from pathlib import Path

from . import CARPETA
from .geometria import LimitesMunicipales, _punto

MANIFIESTO = CARPETA / 'limites.json'
CACHE = Path.home() / '.cache' / 'voceiro' / 'limites'


class Limites:
    def __init__(self, manifiesto=None, directorio=None, obtener=None):
        self.m = manifiesto if manifiesto is not None else json.loads(MANIFIESTO.read_text(encoding='utf-8'))
        self.directorio = Path(directorio) if directorio else None
        self.obtener = obtener  # clave R2 → bytes
        self.mapas = {}

    def _provincia(self, codigo):
        if codigo in self.mapas:
            return self.mapas[codigo]
        info = self.m['provincias'][codigo]
        ruta = self.directorio / info['archivo'] if self.directorio else None
        cuerpo = ruta.read_bytes() if ruta and ruta.exists() else None
        if cuerpo is not None and hashlib.sha256(cuerpo).hexdigest() != info['sha256']:
            cuerpo = None  # Copia de otra revisión: se vuelve a descargar.
        if cuerpo is None and self.obtener:
            cuerpo = self.obtener(self.m['prefijo_r2'] + info['archivo'])
            if hashlib.sha256(cuerpo).hexdigest() != info['sha256']:
                raise ValueError('Límites de provincia distintos del manifiesto: ' + codigo)
            if ruta:
                ruta.parent.mkdir(parents=True, exist_ok=True)
                ruta.write_bytes(cuerpo)
        if cuerpo is None:
            self.mapas[codigo] = None
        else:
            datos = json.loads(gzip.decompress(cuerpo))
            self.mapas[codigo] = (LimitesMunicipales(datos, self.m['margen_revision_m']), datos['features'])
        return self.mapas[codigo]

    def resolver(self, longitud, latitud):
        longitud, latitud = _punto([longitud, latitud])
        margen = self.m['margen_revision_m'] / 111_195 * 2  # Holgura en grados, también en longitud.
        provincias = [c for c, p in sorted(self.m['provincias'].items())
                      if p['caja'][0] - margen <= longitud <= p['caja'][2] + margen
                      and p['caja'][1] - margen <= latitud <= p['caja'][3] + margen]
        resultado = {'estado': 'pendiente', 'territorio': None, 'candidatos': [], 'tipo': 'ubicacion',
                     'referencia': {'sistema': 'coordenadas:wgs84', 'codigo': f'{latitud},{longitud}',
                                    'contexto': {}},
                     'revision': {'fuente': self.m['fuente'], 'comprobado': self.m['comprobado'],
                                  'version': self.m['version']},
                     'evidencias': [], 'margen_revision_m': self.m['margen_revision_m']}
        cargadas = {c: self._provincia(c) for c in provincias}
        if any(v is None for v in cargadas.values()):
            return {**resultado, 'motivo': 'limites_no_disponibles',
                    'provincias': sorted(c for c, v in cargadas.items() if v is None)}
        candidatos, cerca = {}, False
        for codigo, (mapa, features) in cargadas.items():
            r = mapa.resolver(longitud, latitud)
            cerca = cerca or r['motivo'] == 'cerca_del_limite'
            info = self.m['provincias'][codigo]
            for ine, indices in r['recintos'].items():
                candidatos.setdefault('es:municipio:' + ine, []).extend(
                    {'fuente': self.m['fuente'], 'documento': info['url'], 'sha256': info['sha256'],
                     'ruta': f'/features/{i}', 'comprobado': self.m['comprobado'],
                     'dato': dict(features[i]['properties']), 'punto_consultado': [longitud, latitud],
                     'margen_revision_m': self.m['margen_revision_m']} for i in indices)
        resultado['candidatos'] = [{'territorio': t, 'evidencias': e} for t, e in sorted(candidatos.items())]
        resultado['evidencias'] = [e for t in sorted(candidatos) for e in candidatos[t]]
        if len(candidatos) > 1:
            return {**resultado, 'estado': 'conflicto', 'motivo': 'recintos_solapados'}
        if cerca or not candidatos:
            return {**resultado, 'motivo': 'cerca_del_limite' if cerca else 'fuera_de_cobertura'}
        return {**resultado, 'estado': 'resuelto', 'territorio': next(iter(candidatos)),
                'motivo': 'punto_en_recinto_municipal'}


def cargar(directorio=None):
    """Carpeta VOCEIRO_LIMITES (o ~/.cache/voceiro/limites) y R2 si hay credenciales."""
    obtener = None
    if all(os.environ.get(k) for k in ('R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET')):
        import boto3
        cliente = boto3.client('s3', endpoint_url=f'https://{os.environ["R2_ACCOUNT_ID"]}.r2.cloudflarestorage.com',
            aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],
            aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'], region_name='auto')

        def obtener(clave):
            return cliente.get_object(Bucket=os.environ['R2_BUCKET'], Key=clave)['Body'].read()
    return Limites(directorio=directorio or os.environ.get('VOCEIRO_LIMITES') or CACHE, obtener=obtener)
