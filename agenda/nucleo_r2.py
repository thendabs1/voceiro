"""Núcleo en R2 privado: un fichero por fuente con su estado vigente.

Ninguna entidad cruza fuentes, así que cada fichero es un trozo completo del
núcleo. Turso guarda el resto (piloto, control deportivo, lectura y revisión).
Orden de guardado: ficheros cambiados en R2 (escritura condicional por ETag) y
después la transacción de Turso; si esta falla, la siguiente pasada parte de R2.
"""

import argparse
from copy import deepcopy
import gzip
from hashlib import sha256
import json
import os

from . import nucleo

PREFIJO = 'nucleo/v1/'
INDICE = PREFIJO + 'indice.json'
# Fila de agenda_estado que dice que el núcleo vive en R2: Turso sin R2 se niega a guardarlo.
MARCA = 'nucleo_r2'
VERSION = 1


class ConflictoNucleo(RuntimeError):
    pass


def partir(n):
    """{fuente: datos} con todo lo que pertenece a cada fuente; un cruce es un error."""
    dueno = {}
    for r in n['referencias'].values():
        if r['destino'] is None:
            continue
        k = nucleo.clave(r['destino'])
        if dueno.setdefault(k, r['proveedor']) != r['proveedor']:
            raise ValueError(f'Entidad con referencias de dos fuentes: {k}')
    sin_fuente = n['entidades'].keys() - dueno.keys()
    if sin_fuente:
        raise ValueError(f'Entidad sin referencia de ninguna fuente: {min(sin_fuente)}')
    # Cada fichero lleva el catálogo: si una escritura queda a medias, unir() toma el
    # de versión mayor y las entidades de cualquier fichero siguen validando.
    ficheros = {f: {'version': VERSION, 'fuente': f, 'datos_fuente': deepcopy(datos),
                    'catalogo': deepcopy(n['catalogo']), **{c: {} for c in nucleo.COLECCIONES}}
                for f, datos in n['fuentes'].items()}

    def de(*objetivos):
        fuentes = {dueno[nucleo.clave(o)] for o in objetivos if o}
        if len(fuentes) != 1:
            raise ValueError('Relación entre fuentes distintas: ' + ', '.join(sorted(fuentes)))
        return fuentes.pop()

    for c, datos in n.items():
        if c not in nucleo.COLECCIONES:
            continue
        for i, d in datos.items():
            if c == 'documentos':
                fuente = d['fuente']
            elif c == 'referencias':
                fuente = d['proveedor']
            elif c == 'observaciones':
                fuente = n['referencias'][d['referencia']]['proveedor']
            elif c == 'entidades':
                fuente = dueno[i]
            elif c == 'relaciones':
                fuente = de(d['origen'], d['destino'], d['ambito'])
            elif c == 'participaciones':
                fuente = de(d['evento'], d['participante'])
            elif c == 'resultados':
                fuente = de(d['evento'])
            elif c == 'clasificaciones':
                fuente = de(d['ambito'])
            else:
                fuente = de(d['objetivo'])
            ficheros[fuente][c][i] = deepcopy(d)
    return ficheros


def unir(esqueleto, ficheros):
    """Núcleo completo a partir del esqueleto (versión, catálogo) y los ficheros."""
    # Los catálogos solo crecen (versión mayor, sin retirar IDs): vale el más reciente.
    catalogo = max([esqueleto['catalogo'], *(d['catalogo'] for d in ficheros.values())],
                   key=lambda c: c['version'])
    n = {'version': esqueleto['version'], 'catalogo': deepcopy(catalogo), 'fuentes': {},
         **{c: {} for c in nucleo.COLECCIONES}}
    for fuente, datos in sorted(ficheros.items()):
        if datos.get('version') != VERSION or datos.get('fuente') != fuente:
            raise ValueError(f'Fichero de núcleo incompatible: {fuente}')
        n['fuentes'][fuente] = deepcopy(datos['datos_fuente'])
        for c in nucleo.COLECCIONES:
            n[c].update(deepcopy(datos[c]))
    # El mismo orden que la carga paginada de Turso: la publicación no depende de él,
    # pero así un cambio de almacén no reordena nada.
    for c in nucleo.COLECCIONES:
        n[c] = dict(sorted(n[c].items()))
    return n


def _cuerpo(datos):
    return nucleo.json_canonico(datos).encode()


def cliente_de_entorno():
    """Cliente S3 del bucket privado; se niega a escribir en el bucket público."""
    import boto3
    from botocore.config import Config
    bucket = os.environ['AGENDA_R2_BUCKET']
    if bucket == os.environ.get('R2_BUCKET'):
        raise ValueError('El núcleo no se guarda en el bucket público de R2_BUCKET')
    cliente = boto3.client('s3', endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ['AGENDA_R2_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AGENDA_R2_SECRET_ACCESS_KEY'], region_name='auto',
        config=Config(retries={'max_attempts': 3, 'mode': 'standard'}))
    return cliente, bucket


class Ficheros:
    """Ficheros del núcleo en R2, con el ETag de lo leído para no pisar a otro escritor."""

    def __init__(self, cliente, bucket):
        self.cliente, self.bucket = cliente, bucket
        self.etags, self.huellas = {}, {}
        self.indice = None  # (fuentes, etag) del índice leído.
        self.leidos = self.escritos = self.bytes = 0

    @classmethod
    def de_entorno(cls):
        return cls(*cliente_de_entorno())

    def _leer(self, clave):
        from botocore.exceptions import ClientError
        try:
            respuesta = self.cliente.get_object(Bucket=self.bucket, Key=clave)
        except ClientError as error:
            if error.response.get('Error', {}).get('Code') in ('NoSuchKey', '404'):
                return None, None
            raise
        cuerpo = respuesta['Body'].read()
        self.leidos += 1
        self.bytes += len(cuerpo)
        return cuerpo, respuesta['ETag']

    def _escribir(self, clave, cuerpo, etag, tipo):
        from botocore.exceptions import ClientError
        condicion = {'IfMatch': etag} if etag else {'IfNoneMatch': '*'}
        try:
            respuesta = self.cliente.put_object(Bucket=self.bucket, Key=clave, Body=cuerpo,
                                                ContentType=tipo, **condicion)
        except ClientError as error:
            if error.response.get('Error', {}).get('Code') in ('PreconditionFailed', '412'):
                raise ConflictoNucleo(f'Otro escritor cambió {clave}; releer antes de integrar') from None
            raise
        self.escritos += 1
        self.bytes += len(cuerpo)
        return respuesta['ETag']

    def cargar(self):
        cuerpo, etag = self._leer(INDICE)
        if cuerpo is None:
            raise ValueError('Núcleo R2 sin migrar: python -m agenda.nucleo_r2 --migrar')
        fuentes = json.loads(cuerpo)['fuentes']
        self.indice = (fuentes, etag)
        salida = {}
        for fuente in fuentes:
            cuerpo, etag = self._leer(PREFIJO + fuente + '.json.gz')
            if cuerpo is None:
                raise ValueError(f'Falta el fichero de núcleo de {fuente}')
            plano = gzip.decompress(cuerpo)
            salida[fuente] = json.loads(plano)
            self.etags[fuente], self.huellas[fuente] = etag, sha256(plano).hexdigest()
        return salida

    def guardar(self, ficheros):
        """Sube solo los ficheros cambiados y, si hay fuentes nuevas, el índice."""
        anteriores = self.indice[0] if self.indice else []
        if set(anteriores) - ficheros.keys():
            raise ValueError('Una fuente del núcleo no se retira al guardar')
        for fuente, datos in sorted(ficheros.items()):
            plano = _cuerpo(datos)
            huella = sha256(plano).hexdigest()
            if self.huellas.get(fuente) == huella:
                continue
            clave = PREFIJO + fuente + '.json.gz'
            if fuente not in self.etags:
                # Fichero fuera del índice (escritura anterior a medias): se sustituye.
                self.etags[fuente] = self._leer(clave)[1]
            self.etags[fuente] = self._escribir(clave, gzip.compress(plano, mtime=0),
                                                self.etags[fuente], 'application/gzip')
            self.huellas[fuente] = huella
        fuentes = sorted(ficheros)
        if fuentes != anteriores:
            etag = self.indice[1] if self.indice else self._leer(INDICE)[1]
            etag = self._escribir(INDICE, _cuerpo({'version': VERSION, 'fuentes': fuentes}),
                                  etag, 'application/json')
            self.indice = (fuentes, etag)


def migrar(remoto, ficheros):
    """Copia el núcleo de Turso a R2 y deja la marca; nada más cambia en Turso."""
    from . import almacen
    calendario = remoto.cargar()
    if 'nucleo' not in calendario:
        raise ValueError('No hay núcleo que migrar')
    calendario = almacen.sin_historial(calendario)
    ficheros.guardar(partir(calendario['nucleo']))
    remoto.marcar_r2(ficheros.bucket)
    return calendario


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--migrar', action='store_true', help='Copiar el núcleo de Turso a R2 (una vez)')
    args = ap.parse_args(argv)
    if not args.migrar:
        ap.error('Indicar --migrar')
    from .turso import Almacen
    ficheros = Ficheros.de_entorno()
    remoto = Almacen(ficheros=False)
    remoto.inicializar()
    calendario = migrar(remoto, ficheros)
    n = calendario['nucleo']
    print(f'[agenda] Núcleo migrado a R2: {len(n["fuentes"])} fuentes, {len(n["entidades"])} entidades, '
          f'{ficheros.escritos} ficheros, {ficheros.bytes / 1e6:.2f} MB')


if __name__ == '__main__':
    main()
