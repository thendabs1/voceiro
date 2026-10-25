"""Clasificación editorial, migración y reclasificación sin inventar observaciones."""

from copy import deepcopy
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from agenda import almacen, vidmar_f1
from agenda.clasificacion import aplicar, cargar_catalogo, temas_de, validar
from agenda.modelo import integrar
from agenda.turso import Almacen, ConflictoCalendario
from calendario import main
from test_agenda import AHORA, DESPUES, construir, ficha
from test_calendario_almacen import ics, SESION
from test_calendario_turso import Servidor


def sin_clasificacion(calendario):
    antiguo = deepcopy(calendario)
    antiguo.pop('clasificacion', None)
    return antiguo


def convertir_v2(db):
    """Construye una base del contrato anterior, con sus registros e historial."""
    for tabla in ('agenda_evento_tema', 'agenda_tema_padres', 'agenda_temas',
                  'agenda_clasificacion_revisiones'):
        db.execute(f'DROP TABLE {tabla}')
    db.execute('UPDATE agenda_esquema SET version=2')


class Clasificacion(unittest.TestCase):
    def test_tema_explicitado_y_padres_sin_buscar_en_titulos(self):
        a = construir([ficha(), ficha(201, titulo='Teatro, tenis y F1',
            tipoEvento={'tid': 999, 'nome': 'Tipo nuevo'})])
        teatro = a['vinculos']['cultura-galicia:101']
        desconocido = a['vinculos']['cultura-galicia:201']
        self.assertEqual(temas_de(a, teatro), ['cultura', 'teatro'])
        self.assertEqual(temas_de(a, teatro, False), ['teatro'])
        self.assertEqual(temas_de(a, desconocido), [])
        evidencia = a['clasificacion']['asignaciones'][teatro][0]
        self.assertEqual(evidencia['registro'], 'cultura-galicia:101')
        self.assertEqual(evidencia['grupo'], 'cultura-galicia:actividad:14')
        self.assertEqual(a['registros']['cultura-galicia:201']['original']['tipoEvento']['nome'], 'Tipo nuevo')

    def test_f1_usa_la_coleccion_declarada_sin_inventar_territorio(self):
        a = integrar(None, vidmar_f1.leer(ics(SESION)), vidmar_f1.FUENTES, AHORA)
        evento = a['eventos'][0]
        self.assertEqual(temas_de(a, evento['id']), ['automovilismo', 'deportes'])
        self.assertEqual(evento['regiones'], [])

    def test_desaparicion_del_tipo_recalcula_sin_retener_asignacion_obsoleta(self):
        a = construir([ficha(), ficha(201)])
        b = construir([ficha(tipoEvento={'tid': 999, 'nome': 'Desconocido'})], a, DESPUES)
        self.assertEqual(temas_de(b, b['vinculos']['cultura-galicia:101']), [])
        self.assertEqual(temas_de(b, b['vinculos']['cultura-galicia:201']), ['cultura', 'teatro'])
        self.assertEqual(b['registros']['cultura-galicia:201']['ultima_recogida'], AHORA)

    def test_mapeos_son_del_proveedor_y_del_tipo_de_grupo(self):
        a = construir([ficha(tipoEvento=None, ciclo={'tid': 50, 'nome': 'Teatro'})])
        self.assertEqual(temas_de(a, a['eventos'][0]['id']), [])
        a = sin_clasificacion(construir([ficha()]))
        a['registros']['cultura-galicia:101']['fuente'] = 'otro-proveedor'
        self.assertEqual(aplicar(a)['clasificacion']['asignaciones'], {})

    def test_rechaza_ciclos_destinos_inexistentes_y_ids_de_mapeo_duplicados(self):
        for cambio in ('ciclo', 'padre', 'mapeo'):
            catalogo = cargar_catalogo()
            if cambio == 'ciclo':
                catalogo['conceptos']['deportes']['padres'] = ['tenis']
            elif cambio == 'padre':
                catalogo['conceptos']['tenis']['padres'] = ['inexistente']
            else:
                catalogo['correspondencias'].append(deepcopy(catalogo['correspondencias'][0]))
            with self.subTest(cambio=cambio), self.assertRaises(ValueError):
                validar(catalogo)


class Migracion(unittest.TestCase):
    def test_migracion_y_reclasificacion_sin_tocar_ids_originales_ni_historial(self):
        with tempfile.TemporaryDirectory() as carpeta:
            ruta = Path(carpeta) / 'copia.sqlite'
            antiguo = sin_clasificacion(construir([ficha()]))
            with almacen.abrir(ruta) as db:
                almacen.guardar(db, antiguo)
                convertir_v2(db)
                revision = db.execute('SELECT revision FROM agenda_esquema').fetchone()[0]
                historial = db.execute('SELECT * FROM agenda_revisiones').fetchall()
            with almacen.abrir(ruta) as db:
                self.assertEqual(almacen.cargar(db), antiguo)
                self.assertEqual(db.execute('SELECT version, revision FROM agenda_esquema').fetchone(),
                                 (3, revision + 1))
            salida = Path(carpeta) / 'salida.json'
            with patch('calendario.recoger', side_effect=AssertionError('Sin red')):
                main(['--db', str(ruta), '--reclasificar', '--salida', str(salida)])
            with almacen.abrir(ruta) as db:
                nuevo = almacen.cargar(db)
                self.assertEqual(sin_clasificacion(nuevo), antiguo)
                self.assertEqual(db.execute('SELECT * FROM agenda_revisiones').fetchall(), historial)
                self.assertEqual(db.execute('SELECT count(*) FROM agenda_recogidas').fetchone()[0], 1)
                self.assertEqual(db.execute('SELECT tema FROM agenda_evento_tema').fetchall(), [('teatro',)])
                self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
                self.assertEqual(json.loads(salida.read_text()), nuevo)
                cambios = db.total_changes
                almacen.guardar(db, aplicar(nuevo), solo_clasificacion=True)
                self.assertEqual(db.total_changes, cambios)

    def test_migracion_fallida_revierte_tablas_y_version(self):
        with tempfile.TemporaryDirectory() as carpeta:
            ruta = Path(carpeta) / 'copia.sqlite'
            with almacen.abrir(ruta) as db:
                convertir_v2(db)
            with self.assertRaises(RuntimeError):
                with almacen.abrir(ruta):
                    raise RuntimeError('Fallo antes del commit')
            with closing(sqlite3.connect(ruta)) as db:
                self.assertEqual(db.execute('SELECT version FROM agenda_esquema').fetchone()[0], 2)
                self.assertEqual(db.execute("SELECT count(*) FROM sqlite_master WHERE name='agenda_temas'")
                                 .fetchone()[0], 0)

    def test_indice_de_padres_permite_filtrar_deportes_con_temas_hijos(self):
        a = integrar(construir([ficha()]), vidmar_f1.leer(ics(SESION)), vidmar_f1.FUENTES, AHORA)
        with tempfile.TemporaryDirectory() as carpeta, almacen.abrir(Path(carpeta) / 'copia.sqlite') as db:
            almacen.guardar(db, a)
            filas = db.execute('WITH RECURSIVE temas(id) AS (SELECT ? UNION '
                'SELECT p.tema FROM agenda_tema_padres p JOIN temas t ON p.padre=t.id) '
                'SELECT DISTINCT evento FROM agenda_evento_tema WHERE tema IN (SELECT id FROM temas)',
                ('deportes',)).fetchall()
            self.assertEqual(filas, [(a['vinculos']['vidmar-f1:sesion-estable'],)])

    def test_corregir_mapeo_audita_y_rechaza_cambios_encubiertos_de_observacion(self):
        a = construir([ficha()])
        catalogo = cargar_catalogo()
        catalogo['version'] = 2
        catalogo['correspondencias'][0]['tema'] = 'danza'
        b = aplicar(a, catalogo)
        with tempfile.TemporaryDirectory() as carpeta, almacen.abrir(Path(carpeta) / 'copia.sqlite') as db:
            almacen.guardar(db, a)
            almacen.guardar(db, b, solo_clasificacion=True)
            self.assertEqual(db.execute('SELECT tema FROM agenda_evento_tema').fetchall(), [('danza',)])
            self.assertEqual(db.execute('SELECT count(*) FROM agenda_clasificacion_revisiones').fetchone()[0], 2)
            self.assertEqual(db.execute('SELECT count(*) FROM agenda_revisiones').fetchone()[0], 1)
            with self.assertRaisesRegex(ValueError, 'versión mayor'):
                almacen.planificar(b, a, solo_clasificacion=True)
            roto = deepcopy(b)
            roto['actualizado'] = DESPUES
            with self.assertRaisesRegex(ValueError, 'observaciones'):
                almacen.planificar(b, roto, solo_clasificacion=True)


class MigracionTurso(unittest.TestCase):
    def test_migra_y_reclasifica_estado_remoto_con_guardia_y_sin_recogida(self):
        servidor = Servidor()
        self.addCleanup(servidor.db.close)
        with patch('turso_http.urlopen', servidor.abrir):
            remoto = Almacen('libsql://agenda.test', 'simulado')
            remoto.inicializar()
            remoto.cargar()
            antiguo = sin_clasificacion(construir([ficha()]))
            remoto.guardar(antiguo)
            convertir_v2(servidor.db)
            remoto.inicializar()
            a = remoto.cargar()
            segundo = Almacen('libsql://agenda.test', 'simulado')
            segundo.cargar()
            remoto.guardar(aplicar(a), solo_clasificacion=True)
            with self.assertRaises(ConflictoCalendario):
                segundo.guardar(aplicar(a), solo_clasificacion=True)
            self.assertEqual(sin_clasificacion(remoto.cargar()), antiguo)
            self.assertEqual(servidor.db.execute('SELECT count(*) FROM agenda_recogidas').fetchone()[0], 1)
            self.assertEqual(servidor.db.execute('SELECT count(*) FROM agenda_revisiones').fetchone()[0], 1)
            self.assertEqual(servidor.db.execute('SELECT tema FROM agenda_evento_tema').fetchall(), [('teatro',)])


if __name__ == '__main__':
    unittest.main()
