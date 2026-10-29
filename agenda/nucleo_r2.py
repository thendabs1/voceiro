"""Núcleo en R2 privado: un objeto inmutable por fuente, nombrado por su huella.

Ninguna entidad cruza fuentes, así que cada objeto es un trozo completo del
núcleo. Turso guarda el resto (piloto, control deportivo, lectura y revisión) y
el manifiesto {fuente: huella} en la fila MARCA, que se confirma en la misma
transacción que la revisión. Guardar sube primero los objetos nuevos y después
confirma el manifiesto: si Turso falla, los objetos quedan huérfanos y la
revisión sigue identificando el núcleo anterior.
"""

import argparse
from copy import deepcopy
import gzip
from hashlib import sha256
import json
import os

from . import nucleo

PREFIJO = 'nucleo/v2/'
# v1: un fichero mutable por fuente más un índice; solo se lee para migrar.
PREFIJO_V1 = 'nucleo/v1/'
INDICE_V1 = PREFIJO_V1 + 'indice.json'
# Fila de agenda_estado con el manifiesto: Turso sin R2 se niega a guardar el núcleo.
MARCA = 'nucleo_r2'
VERSION_MARCA = 2
# Documento por fuente; v2 sin catálogo (vive en el esqueleto SQL, confirmado con la revisión).
VERSION = 2


def clave(fuente, huella):
    return f'{PREFIJO}{fuente}/{huella}.json.gz'


def leer_marca(valor_json):
    """Manifiesto {fuente: huella} de la marca; una marca v1 exige migrar."""
    marca = json.loads(valor_json)
    if marca.get('version') != VERSION_MARCA:
        raise ValueError('Núcleo R2 v1: lanzar la operación migrar-nucleo (python -m agenda.nucleo_r2 --migrar)')
    if marca.get('prefijo') != PREFIJO or not all(
            isinstance(h, str) and len(h) == 64 and set(h) <= set('0123456789abcdef')
            for h in marca['fuentes'].values()):
        raise ValueError('Marca de núcleo R2 inválida')
    return marca


def marca(bucket, manifiesto):
    return nucleo.json_canonico({'version': VERSION_MARCA, 'bucket': bucket, 'prefijo': PREFIJO,
                                 'fuentes': dict(sorted(manifiesto.items()))})


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
    ficheros = {f: {'version': VERSION, 'fuente': f, 'datos_fuente': deepcopy(datos),
                    **{c: {} for c in nucleo.COLECCIONES}}
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
    # Solo los ficheros v1 llevan catálogo (migración); los catálogos solo crecen.
    catalogo = max([esqueleto['catalogo'], *(d['catalogo'] for d in ficheros.values() if 'catalogo' in d)],
                   key=lambda c: c['version'])
    n = {'version': esqueleto['version'], 'catalogo': deepcopy(catalogo), 'fuentes': {},
         **{c: {} for c in nucleo.COLECCIONES}}
    for fuente, datos in sorted(ficheros.items()):
        if datos.get('version') not in (1, VERSION) or datos.get('fuente') != fuente:
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
    """Objetos inmutables del núcleo en R2; qué objeto está vigente lo dice Turso."""

    def __init__(self, cliente, bucket):
        self.cliente, self.bucket = cliente, bucket
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
                return None
            raise
        cuerpo = respuesta['Body'].read()
        self.leidos += 1
        self.bytes += len(cuerpo)
        return cuerpo

    def _verificado(self, clave_objeto, huella):
        cuerpo = self._leer(clave_objeto)
        if cuerpo is None:
            raise ValueError(f'Falta el objeto de núcleo {clave_objeto}')
        plano = gzip.decompress(cuerpo)
        if sha256(plano).hexdigest() != huella:
            raise ValueError(f'Objeto de núcleo corrupto: {clave_objeto}')
        return plano

    def _subir(self, fuente, plano, huella):
        from botocore.exceptions import ClientError
        clave_objeto = clave(fuente, huella)
        cuerpo = gzip.compress(plano, mtime=0)
        try:
            self.cliente.put_object(Bucket=self.bucket, Key=clave_objeto, Body=cuerpo,
                                    ContentType='application/gzip', IfNoneMatch='*')
        except ClientError as error:
            if error.response.get('Error', {}).get('Code') not in ('PreconditionFailed', '412'):
                raise
            # Ya existe (reintento o contenido repetido): vale si es el mismo.
            self._verificado(clave_objeto, huella)
            return
        self.escritos += 1
        self.bytes += len(cuerpo)

    def cargar(self, manifiesto):
        """Exactamente los objetos del manifiesto confirmado, con su huella comprobada."""
        return {f: json.loads(self._verificado(clave(f, h), h)) for f, h in sorted(manifiesto.items())}

    def subir(self, ficheros, manifiesto):
        """Sube los objetos que no están en el manifiesto y devuelve el nuevo, sin confirmarlo."""
        if set(manifiesto) - ficheros.keys():
            raise ValueError('Una fuente del núcleo no se retira al guardar')
        nuevo = {}
        for fuente, datos in sorted(ficheros.items()):
            plano = _cuerpo(datos)
            nuevo[fuente] = sha256(plano).hexdigest()
            if manifiesto.get(fuente) != nuevo[fuente]:
                self._subir(fuente, plano, nuevo[fuente])
        return nuevo

    def cargar_v1(self):
        """Ficheros del formato v1 (índice más un fichero mutable por fuente)."""
        cuerpo = self._leer(INDICE_V1)
        if cuerpo is None:
            raise ValueError('Falta el índice del núcleo v1')
        salida = {}
        for fuente in json.loads(cuerpo)['fuentes']:
            cuerpo = self._leer(PREFIJO_V1 + fuente + '.json.gz')
            if cuerpo is None:
                raise ValueError(f'Falta el fichero de núcleo v1 de {fuente}')
            salida[fuente] = json.loads(gzip.decompress(cuerpo))
        return salida


def migrar(remoto, ficheros):
    """Lleva el núcleo a objetos v2 desde las tablas de Turso o desde R2 v1; repetible.

    Una sola transacción confirma manifiesto, versión de esquema y revisión: hasta
    entonces sigue vigente el estado anterior. No borra nada de v1 ni de Turso.
    Devuelve el núcleo migrado, o None si ya estaba en v2.
    """
    from . import almacen
    version, revision, esqueleto, valor_marca = remoto.estado_nucleo()
    if valor_marca and json.loads(valor_marca).get('version') == VERSION_MARCA:
        ficheros.cargar(leer_marca(valor_marca)['fuentes'])  # Comprueba que están todos.
        return None
    if valor_marca:
        # v1: vale el R2 vigente, no las tablas SQL congeladas desde la primera migración.
        n = unir(esqueleto['nucleo'], ficheros.cargar_v1())
        nucleo.validar(n)
    else:
        calendario = remoto.cargar()
        if 'nucleo' not in calendario:
            raise ValueError('No hay núcleo que migrar')
        n = almacen.sin_historial(calendario)['nucleo']
        revision = remoto.revision
    remoto.activar_r2(ficheros.bucket, ficheros.subir(partir(n), {}), revision, n['catalogo'])
    return n


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--migrar', action='store_true', help='Llevar el núcleo a objetos v2 (una vez, repetible)')
    args = ap.parse_args(argv)
    if not args.migrar:
        ap.error('Indicar --migrar')
    from .turso import Almacen
    ficheros = Ficheros.de_entorno()
    remoto = Almacen(ficheros=False)
    remoto.inicializar(migrando=True)
    n = migrar(remoto, ficheros)
    if n is None:
        print('[agenda] Núcleo ya en v2: objetos comprobados, nada que migrar')
        return
    print(f'[agenda] Núcleo migrado a R2 v2: {len(n["fuentes"])} fuentes, {len(n["entidades"])} entidades, '
          f'{ficheros.escritos} objetos, {ficheros.bytes / 1e6:.2f} MB')


if __name__ == '__main__':
    main()
