"""Núcleo en R2 por fuente: ida y vuelta, escrituras mínimas, conflictos y reparación."""

from copy import deepcopy
from hashlib import md5
import io
import os
import unittest
from unittest.mock import patch

from botocore.exceptions import ClientError

from agenda import espn_tenis, feb, madrid, nucleo, nucleo_r2, turso
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

    def test_unir_toma_el_catalogo_mas_reciente(self):
        # Reclasificar puede dejar ficheros con un catálogo que Turso aún no confirmó.
        n = compactar(deportes_y_madrid()['nucleo'])
        ficheros = nucleo_r2.partir(n)
        nuevo = deepcopy(n['catalogo'])
        nuevo['version'] += 1
        ficheros['madrid']['catalogo'] = nuevo
        self.assertEqual(nucleo_r2.unir(n, ficheros)['catalogo'], nuevo)

    def test_nunca_en_el_bucket_publico(self):
        with patch.dict(os.environ, {'AGENDA_R2_BUCKET': 'voceiro-datos', 'R2_BUCKET': 'voceiro-datos'}):
            with self.assertRaisesRegex(ValueError, 'público'):
                nucleo_r2.cliente_de_entorno()


class AlmacenR2(unittest.TestCase):
    def setUp(self):
        self.servidor = Servidor()
        self.addCleanup(self.servidor.db.close)
        parche = patch('turso_http.urlopen', self.servidor.abrir)
        parche.start()
        self.addCleanup(parche.stop)
        self.r2 = R2Falso()
        # Estado de partida: núcleo en Turso, como hoy en producción.
        sql = self.nuevo(ficheros=False)
        sql.guardar(deportes_y_madrid())
        nucleo_r2.migrar(self.nuevo(ficheros=False), self.ficheros())

    def ficheros(self):
        return nucleo_r2.Ficheros(self.r2, 'voceiro-agenda')

    def nuevo(self, ficheros=None):
        remoto = turso.Almacen('libsql://agenda.test', 'token-simulado',
                               ficheros=self.ficheros() if ficheros is None else ficheros)
        remoto.inicializar()
        remoto.cargar()
        return remoto

    def test_migrar_conserva_el_nucleo_y_turso_sin_r2_se_niega(self):
        esperado = compactar(deportes_y_madrid()['nucleo'])
        self.assertEqual(self.nuevo().cargar()['nucleo'], esperado)
        self.assertIn(nucleo_r2.INDICE, self.r2.objetos)
        with self.assertRaisesRegex(ValueError, 'está en R2'):
            self.nuevo(ficheros=False)

    def test_migracion_repetible_y_copia_de_turso_rechazada(self):
        self.servidor.db.execute("DELETE FROM agenda_estado WHERE clave=?", (nucleo_r2.MARCA,))
        nucleo_r2.migrar(self.nuevo(ficheros=False), self.ficheros())
        self.assertEqual(self.nuevo().cargar()['nucleo'], compactar(deportes_y_madrid()['nucleo']))
        with self.assertRaisesRegex(ValueError, 'R2'):
            self.nuevo().copia('/nunca/se/escribe.sqlite')

    def test_fichero_fuera_del_indice_no_bloquea(self):
        # Escritura anterior a medias: ficheros subidos, índice sin crear.
        del self.r2.objetos[nucleo_r2.INDICE]
        ficheros = self.ficheros()
        ficheros.guardar(nucleo_r2.partir(compactar(deportes_y_madrid()['nucleo'])))
        self.assertEqual(self.nuevo().cargar()['nucleo'], compactar(deportes_y_madrid()['nucleo']))

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
            calendario['nucleo'] = madrid.importar(calendario['nucleo'], madrid_cambiado(), DESPUES)
            with self.assertRaises(turso.ConflictoCalendario):
                viejo.guardar(calendario, solo_nucleo=True)

    def test_solo_sube_la_fuente_cambiada_y_repetir_no_escribe(self):
        remoto = self.nuevo()
        calendario = remoto.cargar()
        self.r2.puts.clear()
        cambiado = deepcopy(calendario)
        cambiado['nucleo'] = madrid.importar(cambiado['nucleo'], madrid_cambiado(), DESPUES)
        remoto.guardar(cambiado, solo_nucleo=True)
        self.assertEqual(self.r2.puts, [nucleo_r2.PREFIJO + 'madrid.json.gz'])
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

    def test_otro_escritor_en_r2_provoca_conflicto(self):
        remoto = self.nuevo()
        calendario = remoto.cargar()
        clave = nucleo_r2.PREFIJO + 'madrid.json.gz'
        cuerpo, _ = self.r2.objetos[clave]
        self.r2.objetos[clave] = (cuerpo, '"de-otro-escritor"')
        cambiado = deepcopy(calendario)
        cambiado['nucleo'] = madrid.importar(cambiado['nucleo'], madrid_cambiado(), DESPUES)
        with self.assertRaises(turso.ConflictoCalendario):
            remoto.guardar(cambiado, solo_nucleo=True)

    def test_si_turso_falla_tras_r2_la_siguiente_pasada_lo_rehace(self):
        remoto = self.nuevo()
        cambiado = deepcopy(remoto.cargar())
        cambiado['nucleo'] = madrid.importar(cambiado['nucleo'], madrid_cambiado(), DESPUES)
        self.servidor.db.execute("CREATE TRIGGER fallo BEFORE UPDATE ON agenda_esquema "
                                 "BEGIN SELECT RAISE(ABORT, 'fallo simulado'); END")
        with self.assertRaises(ErrorTurso):
            remoto.guardar(cambiado, solo_nucleo=True)
        self.servidor.db.execute('DROP TRIGGER fallo')
        # R2 ya tiene la recogida; Turso conserva su revisión y la pasada siguiente sigue.
        siguiente = self.nuevo()
        recargado = siguiente.cargar()
        self.assertEqual(recargado['nucleo'], compactar(cambiado['nucleo']))
        recargado['nucleo'] = madrid.importar(recargado['nucleo'], madrid_cambiado(), '2026-10-26T20:00:00+01:00')
        siguiente.guardar(recargado, solo_nucleo=True)
        self.assertEqual(self.nuevo().cargar()['nucleo'], compactar(recargado['nucleo']))


if __name__ == '__main__':
    unittest.main()
