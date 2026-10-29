"""Núcleo en R2: objetos por huella, manifiesto confirmado con la revisión y migración."""

from copy import deepcopy
import gzip
from hashlib import md5
import io
import json
import os
import unittest
from unittest.mock import patch

from botocore.exceptions import ClientError

from agenda import almacen, espn_tenis, feb, madrid, nucleo, nucleo_r2, turso
from agenda.compactar import compactar
from agenda.transicion import ampliar
from turso_http import ErrorTurso
from test_agenda import construir, ficha, AHORA, DESPUES
from test_calendario_compactar import con_madrid, madrid_cambiado
from test_calendario_cultura import muestra as muestra_cultura
from test_calendario_publicacion import html_feb, tenis
from test_calendario_turso import Servidor


class R2Falso:
    """Subconjunto de S3 con ETag y escrituras condicionales, como R2."""

    def __init__(self):
        self.objetos, self.puts = {}, []

    @staticmethod
    def _error(codigo):
        return ClientError({'Error': {'Code': codigo}}, 'operacion')

    def get_object(self, Bucket, Key):
        if Key not in self.objetos:
            raise self._error('NoSuchKey')
        cuerpo, etag = self.objetos[Key]
        return {'Body': io.BytesIO(cuerpo), 'ETag': etag}

    def put_object(self, Bucket, Key, Body, ContentType=None, IfMatch=None, IfNoneMatch=None):
        # Objetos inmutables: el núcleo nunca sobrescribe.
        assert IfNoneMatch == '*' and IfMatch is None, Key
        actual = self.objetos.get(Key)
        if (IfNoneMatch == '*' and actual) or (IfMatch and (not actual or actual[1] != IfMatch)):
            raise self._error('PreconditionFailed')
        etag = '"' + md5(Body).hexdigest() + '"'
        self.objetos[Key] = (Body, etag)
        self.puts.append(Key)
        return {'ETag': etag}


def deportes_y_madrid():
    calendario = con_madrid(muestra_cultura('madrid'))
    n = espn_tenis.importar(calendario['nucleo'], tenis(), 'wta', AHORA)
    calendario['nucleo'] = feb.importar(n, html_feb(), AHORA)
    return calendario


class Partir(unittest.TestCase):
    def test_ida_y_vuelta_y_un_fichero_por_fuente(self):
        n = compactar(deportes_y_madrid()['nucleo'])
        ficheros = nucleo_r2.partir(n)
        self.assertEqual(set(ficheros), set(n['fuentes']))
        self.assertEqual(nucleo_r2.unir(n, ficheros), n)
        for fuente, datos in ficheros.items():
            self.assertTrue(all(d['fuente'] == fuente for d in datos['documentos'].values()))
            self.assertTrue(all(r['proveedor'] == fuente for r in datos['referencias'].values()))

    def test_una_entidad_de_dos_fuentes_es_un_error(self):
        n = deportes_y_madrid()['nucleo']
        evento = next(r['destino'] for r in n['referencias'].values() if r['proveedor'] == 'madrid')
        otra = next(f for f in n['fuentes'] if f != 'madrid')
        n['referencias']['cruce'] = {'id': 'cruce', 'proveedor': otra, 'tipo_externo': 'prueba',
                                     'contexto': {}, 'id_externo': '1', 'destino': evento}
        with self.assertRaisesRegex(ValueError, 'dos fuentes'):
            nucleo_r2.partir(n)

    def test_el_catalogo_va_en_el_esqueleto_y_v1_lo_eleva(self):
        n = compactar(deportes_y_madrid()['nucleo'])
        ficheros = nucleo_r2.partir(n)
        # Sin catálogo: reclasificar no reescribe las fuentes cuyas entidades no cambian.
        self.assertFalse(any('catalogo' in d for d in ficheros.values()))
        # Un fichero v1 (migración) pudo llevar un catálogo que el esqueleto aún no tenía.
        nuevo = deepcopy(n['catalogo'])
        nuevo['version'] += 1
        ficheros['madrid'].update(version=1, catalogo=nuevo)
        self.assertEqual(nucleo_r2.unir(n, ficheros)['catalogo'], nuevo)

    def test_nunca_en_el_bucket_publico(self):
        with patch.dict(os.environ, {'AGENDA_R2_BUCKET': 'voceiro-datos', 'R2_BUCKET': 'voceiro-datos'}):
            with self.assertRaisesRegex(ValueError, 'público'):
                nucleo_r2.cliente_de_entorno()


def a_v1(servidor, r2, catalogo=None):
    """Lleva una base ya en R2 v2 al estado de producción anterior: ficheros v1, esquema 4."""
    marca, = servidor.db.execute('SELECT valor_json FROM agenda_estado WHERE clave=?', (nucleo_r2.MARCA,)).fetchone()
    ficheros = nucleo_r2.Ficheros(r2, 'voceiro-agenda').cargar(json.loads(marca)['fuentes'])
    esqueleto, = servidor.db.execute("SELECT valor_json FROM agenda_estado WHERE clave='calendario'").fetchone()
    for fuente, datos in ficheros.items():
        datos.update(version=1, catalogo=catalogo or json.loads(esqueleto)['nucleo']['catalogo'])
        r2.objetos[nucleo_r2.PREFIJO_V1 + fuente + '.json.gz'] = (
            gzip.compress(nucleo.json_canonico(datos).encode(), mtime=0), '"v1"')
    r2.objetos[nucleo_r2.INDICE_V1] = (json.dumps({'version': 1, 'fuentes': sorted(ficheros)}).encode(), '"i"')
    for k in [k for k in r2.objetos if k.startswith(nucleo_r2.PREFIJO)]:
        del r2.objetos[k]
    servidor.db.execute('UPDATE agenda_estado SET valor_json=? WHERE clave=?', (json.dumps(
        {'bucket': 'voceiro-agenda', 'prefijo': nucleo_r2.PREFIJO_V1}), nucleo_r2.MARCA))
    servidor.db.execute('UPDATE agenda_esquema SET version=4, revision=revision+1')


class AlmacenR2(unittest.TestCase):
    def setUp(self):
        self.servidor = Servidor()
        self.addCleanup(self.servidor.db.close)
        parche = patch('turso_http.urlopen', self.servidor.abrir)
        parche.start()
        self.addCleanup(parche.stop)
        self.r2 = R2Falso()
        # Estado de partida: núcleo en Turso, como antes de la primera migración.
        sql = self.nuevo(ficheros=False)
        sql.guardar(deportes_y_madrid())
        nucleo_r2.migrar(self.nuevo(ficheros=False), self.ficheros())

    def ficheros(self):
        return nucleo_r2.Ficheros(self.r2, 'voceiro-agenda')

    def nuevo(self, ficheros=None, migrando=False):
        remoto = turso.Almacen('libsql://agenda.test', 'token-simulado',
                               ficheros=self.ficheros() if ficheros is None else ficheros)
        remoto.inicializar(migrando=migrando)
        if not migrando:
            remoto.cargar()
        return remoto

    def esquema(self):
        return self.servidor.db.execute('SELECT version, revision FROM agenda_esquema').fetchone()

    def cambiar(self, calendario, momento=DESPUES):
        cambiado = deepcopy(calendario)
        cambiado['nucleo'] = madrid.importar(cambiado['nucleo'], madrid_cambiado(), momento)
        return cambiado

    def test_migrar_conserva_el_nucleo_y_turso_sin_r2_se_niega(self):
        remoto = self.nuevo()
        self.assertEqual(remoto.cargar()['nucleo'], compactar(deportes_y_madrid()['nucleo']))
        self.assertEqual(set(remoto.manifiesto), set(remoto.cargar()['nucleo']['fuentes']))
        self.assertEqual(set(self.r2.objetos), {nucleo_r2.clave(f, h) for f, h in remoto.manifiesto.items()})
        self.assertEqual(self.esquema()[0], almacen.VERSION_ESQUEMA)
        with self.assertRaisesRegex(ValueError, 'está en R2'):
            self.nuevo(ficheros=False)

    def test_migracion_repetible_sin_escrituras_y_copia_de_turso_rechazada(self):
        self.r2.puts.clear()
        antes = self.esquema()
        self.assertIsNone(nucleo_r2.migrar(self.nuevo(ficheros=False, migrando=True), self.ficheros()))
        self.assertEqual((self.r2.puts, self.esquema()), ([], antes))
        with self.assertRaisesRegex(ValueError, 'R2'):
            self.nuevo().copia('/nunca/se/escribe.sqlite')

    def test_migra_desde_v1_sin_tocarlo_y_cierra_el_paso_a_clientes_antiguos(self):
        esperado = self.nuevo().cargar()['nucleo']
        catalogo = deepcopy(esperado['catalogo'])
        catalogo['version'] += 1
        a_v1(self.servidor, self.r2, catalogo)
        v1 = {k: v for k, v in self.r2.objetos.items() if k.startswith(nucleo_r2.PREFIJO_V1)}
        with self.assertRaisesRegex(ValueError, 'migrar-nucleo'):
            self.nuevo()
        revision = self.esquema()[1]
        n = nucleo_r2.migrar(self.nuevo(ficheros=False, migrando=True), self.ficheros())
        self.assertEqual(self.esquema(), (almacen.VERSION_ESQUEMA, revision + 1))
        # Vale el R2 v1 vigente (con su catálogo más nuevo), no las tablas SQL congeladas.
        self.assertEqual(self.nuevo().cargar()['nucleo'], {**esperado, 'catalogo': catalogo})
        self.assertEqual(n['catalogo'], catalogo)
        self.assertEqual({k: v for k, v in self.r2.objetos.items() if k.startswith(nucleo_r2.PREFIJO_V1)}, v1)
        # Barrera: un cliente que espera el esquema 4 ya no carga.
        with patch.object(almacen, 'VERSION_ESQUEMA', 4):
            with self.assertRaisesRegex(ValueError, 'incompatible'):
                turso.Almacen('libsql://agenda.test', 'token', ficheros=self.ficheros()).cargar()

    def test_un_almacen_sql_cargado_antes_de_migrar_no_guarda_despues(self):
        servidor = Servidor()
        self.addCleanup(servidor.db.close)
        with patch('turso_http.urlopen', servidor.abrir):
            def sql():
                remoto = turso.Almacen('libsql://otra.test', 'token', ficheros=False)
                remoto.inicializar()
                remoto.cargar()
                return remoto
            sql().guardar(deportes_y_madrid())
            viejo = sql()
            calendario = viejo.cargar()
            nucleo_r2.migrar(sql(), nucleo_r2.Ficheros(R2Falso(), 'voceiro-agenda'))
            with self.assertRaises(turso.ConflictoCalendario):
                viejo.guardar(self.cambiar(calendario), solo_nucleo=True)

    def test_solo_sube_la_fuente_cambiada_y_repetir_no_escribe(self):
        remoto = self.nuevo()
        calendario = remoto.cargar()
        anterior = dict(remoto.manifiesto)
        self.r2.puts.clear()
        cambiado = self.cambiar(calendario)
        remoto.guardar(cambiado, solo_nucleo=True)
        self.assertEqual(self.r2.puts, [nucleo_r2.clave('madrid', remoto.manifiesto['madrid'])])
        self.assertEqual({f for f in anterior if anterior[f] != remoto.manifiesto[f]}, {'madrid'})
        self.assertEqual(self.nuevo().cargar()['nucleo'], compactar(cambiado['nucleo']))
        # Ninguna fila del núcleo en Turso: solo esqueleto, revisión y marca.
        self.assertEqual(self.servidor.db.execute(
            "SELECT count(*) FROM agenda_observaciones").fetchone()[0], len(compactar(
                deportes_y_madrid()['nucleo'])['observaciones']))
        self.r2.puts.clear()
        consultas = len(self.servidor.consultas)
        otro = self.nuevo()
        otro.guardar(otro.cargar(), solo_nucleo=True)
        self.assertEqual(self.r2.puts, [])
        self.assertFalse(any(sql.startswith(('INSERT', 'UPDATE', 'DELETE'))
                             for sql, _ in self.servidor.consultas[consultas:]))

    def test_si_turso_falla_tras_r2_la_revision_sigue_identificando_el_nucleo(self):
        lector = self.nuevo()
        antes, revision = lector.cargar(), self.esquema()[1]
        remoto = self.nuevo()
        cambiado = self.cambiar(remoto.cargar())
        self.servidor.db.execute("CREATE TRIGGER fallo BEFORE UPDATE ON agenda_esquema "
                                 "BEGIN SELECT RAISE(ABORT, 'fallo simulado'); END")
        with self.assertRaises(ErrorTurso):
            remoto.guardar(cambiado, solo_nucleo=True)
        self.servidor.db.execute('DROP TRIGGER fallo')
        # El objeto nuevo queda huérfano; misma revisión, mismo núcleo para cualquier lector.
        self.assertGreater(len(self.r2.objetos), len(lector.manifiesto))
        despues = self.nuevo()
        self.assertEqual((despues.cargar(), despues.revision, despues.manifiesto),
                         (antes, revision, lector.manifiesto))
        # Reintentar desde una carga nueva reutiliza el objeto ya subido.
        self.r2.puts.clear()
        despues.guardar(self.cambiar(despues.cargar()), solo_nucleo=True)
        self.assertEqual(self.r2.puts, [])
        self.assertEqual(self.nuevo().cargar()['nucleo'], compactar(cambiado['nucleo']))

    def test_dos_escritores_de_la_misma_revision_solo_confirma_uno(self):
        a, b = self.nuevo(), self.nuevo()
        de_a = self.cambiar(a.cargar())
        de_b = self.cambiar(b.cargar(), '2026-10-26T20:00:00+01:00')
        subir = b.ficheros.subir

        def a_confirma_entre_medias(*args):
            a.guardar(de_a, solo_nucleo=True)
            return subir(*args)
        with patch.object(b.ficheros, 'subir', a_confirma_entre_medias):
            with self.assertRaises(turso.ConflictoCalendario):
                b.guardar(de_b, solo_nucleo=True)
        final = self.nuevo()
        self.assertEqual((final.cargar()['nucleo'], final.manifiesto), (compactar(de_a['nucleo']), a.manifiesto))

    def test_respuesta_perdida_al_confirmar_releer_trae_manifiesto_y_revision_juntos(self):
        remoto = self.nuevo()
        cambiado = self.cambiar(remoto.cargar())
        revision = self.esquema()[1]
        subir = remoto.ficheros.subir

        def y_perder(*args):
            manifiesto = subir(*args)
            self.servidor.perder_respuesta = True
            return manifiesto
        with patch.object(remoto.ficheros, 'subir', y_perder):
            with self.assertRaises(Exception):
                remoto.guardar(cambiado, solo_nucleo=True)
        self.servidor.perder_respuesta = False
        releido = self.nuevo()
        self.assertEqual((releido.cargar()['nucleo'], releido.revision),
                         (compactar(cambiado['nucleo']), revision + 1))
        self.assertNotEqual(releido.manifiesto, remoto.manifiesto)

    def test_objeto_ausente_o_corrupto_no_se_carga(self):
        remoto = self.nuevo()
        clave = nucleo_r2.clave('madrid', remoto.manifiesto['madrid'])
        cuerpo, etag = self.r2.objetos[clave]
        self.r2.objetos[clave] = (gzip.compress(b'{}', mtime=0), etag)
        with self.assertRaisesRegex(ValueError, 'corrupto'):
            self.nuevo()
        del self.r2.objetos[clave]
        with self.assertRaisesRegex(ValueError, 'Falta'):
            self.nuevo()
        # Un objeto ajeno con la misma clave tampoco se acepta al subir.
        self.r2.objetos[clave] = (gzip.compress(b'{}', mtime=0), etag)
        with self.assertRaisesRegex(ValueError, 'corrupto'):
            self.ficheros().subir(nucleo_r2.partir(compactar(deportes_y_madrid()['nucleo'])), {})
