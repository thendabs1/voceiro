"""Transacciones HTTP contra SQLite real: rollback, concurrencia y coste evitable."""

import io
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from agenda import almacen
from agenda.turso import Almacen, ConflictoCalendario
from agenda.modelo import integrar
from calendario import main
from turso_http import Cliente, ErrorTurso, argumento, valor
from test_agenda import AHORA, DESPUES, construir, ficha


class Servidor:
    """Subconjunto de Hrana con condiciones y SQL real, sin red ni credenciales."""
    def __init__(self):
        self.db = sqlite3.connect(':memory:', isolation_level=None)
        self.consultas = []
        self.peticiones = 0
        self.perder_respuesta = False

    def abrir(self, peticion, timeout):
        self.peticiones += 1
        if peticion.full_url.endswith('/dump'):
            return io.BytesIO('\n'.join(self.db.iterdump()).encode())
        cuerpo = json.loads(peticion.data)
        resultados, errores = [], []

        def condicion(c):
            if c['type'] == 'ok':
                return resultados[c['step']] is not None
            if c['type'] == 'not':
                return not condicion(c['cond'])
            if c['type'] == 'and':
                return all(condicion(v) for v in c['conds'])
            raise AssertionError(c)

        for paso in cuerpo['requests'][0]['batch']['steps']:
            if paso.get('condition') and not condicion(paso['condition']):
                resultados.append(None)
                errores.append(None)
                continue
            sentencia = paso['stmt']
            sql, args = sentencia['sql'], [valor(v) for v in sentencia.get('args', [])]
            self.consultas.append((sql, args))
            antes = self.db.total_changes
            try:
                cursor = self.db.execute(sql, args)
                filas = cursor.fetchall()
                resultados.append({'rows': [[{'type': 'null'} if v is None else
                    {'type': 'integer', 'value': str(v)} if isinstance(v, int) else
                    {'type': 'text', 'value': v} for v in fila] for fila in filas],
                    'rows_read': len(filas), 'rows_written': self.db.total_changes - antes})
                errores.append(None)
            except sqlite3.Error as error:
                resultados.append(None)
                errores.append({'code': error.sqlite_errorname})
        if self.db.in_transaction:
            self.db.rollback()  # close del stream también revierte un BEGIN sin COMMIT.
        if self.perder_respuesta:
            raise TimeoutError()
        return io.BytesIO(json.dumps({'results': [
            {'type': 'ok', 'response': {'type': 'batch', 'result': {
                'step_results': resultados, 'step_errors': errores}}},
            {'type': 'ok', 'response': {'type': 'close'}}]}).encode())


class PersistenciaTurso(unittest.TestCase):
    def setUp(self):
        self.servidor = Servidor()
        self.addCleanup(self.servidor.db.close)
        self.parche = patch('turso_http.urlopen', self.servidor.abrir)
        self.parche.start()
        self.addCleanup(self.parche.stop)
        self.remoto = self.nuevo()

    def nuevo(self):
        remoto = Almacen('libsql://agenda.test', 'token-simulado')
        remoto.inicializar()
        remoto.cargar()
        return remoto

    def test_reapertura_observaciones_ausencias_y_relaciones_sin_reescribir(self):
        a = construir([ficha(), ficha(201)])
        self.remoto.guardar(a)
        remoto = self.nuevo()
        self.assertEqual(remoto.cargar(), a)
        self.servidor.consultas.clear()
        b = construir([ficha()], remoto.anterior, DESPUES)
        remoto.guardar(b)
        escrituras = [sql for sql, _ in self.servidor.consultas
                      if sql.startswith(('INSERT', 'UPDATE', 'DELETE'))]
        self.assertEqual(len(escrituras), 5)  # guardia sin alta, recogida, observación, estado y revisión.
        self.assertFalse(any('agenda_evento_' in sql for sql in escrituras))
        self.assertFalse(any('datos_json' in sql for sql in escrituras))
        self.assertEqual(self.nuevo().cargar(), b)
        self.assertEqual(self.servidor.db.execute('SELECT count(*) FROM agenda_revisiones').fetchone()[0], 2)
        self.assertEqual(b['registros']['cultura-galicia:201']['ultima_recogida'], AHORA)

    def test_fallo_intermedio_revierte_recogida_y_todos_los_cambios(self):
        a = construir([ficha()])
        self.remoto.guardar(a)
        roto = construir([ficha(titulo='Cambio')], a, DESPUES)
        roto['eventos'][0]['regiones'].append('inexistente')
        with self.assertRaises(ErrorTurso):
            self.remoto.guardar(roto)
        self.assertEqual(self.nuevo().cargar(), a)
        self.assertEqual(self.servidor.db.execute('SELECT count(*) FROM agenda_recogidas').fetchone()[0], 1)
        self.assertEqual(self.servidor.db.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_dos_escritores_no_pisan_actualizaciones(self):
        segundo = self.nuevo()
        a = construir([ficha()])
        self.remoto.guardar(a)
        with self.assertRaises(ConflictoCalendario):
            segundo.guardar(construir([ficha(201)]))
        self.assertEqual(self.nuevo().cargar(), a)
        segundo.cargar()
        b = construir([ficha(201)], segundo.anterior, DESPUES)
        segundo.guardar(b)
        self.assertEqual(len(self.nuevo().cargar()['eventos']), 2)

    def test_respuesta_perdida_no_repite_una_escritura_confirmada(self):
        a = construir([ficha()])
        self.servidor.perder_respuesta = True
        peticiones = self.servidor.peticiones
        with self.assertRaisesRegex(ErrorTurso, 'comprobar estado'):
            self.remoto.guardar(a)
        self.assertEqual(self.servidor.peticiones, peticiones + 1)
        self.servidor.perder_respuesta = False
        self.assertEqual(self.nuevo().cargar(), a)
        self.assertEqual(self.servidor.db.execute('SELECT count(*) FROM agenda_recogidas').fetchone()[0], 1)

    def test_exportacion_fallida_se_recupera_sin_consultar_fuentes(self):
        with tempfile.TemporaryDirectory() as carpeta, patch.dict(os.environ, {
                'CALENDARIO_TURSO_URL': 'libsql://agenda.test', 'CALENDARIO_TURSO_TOKEN': 'token-simulado'}):
            entrada, salida = Path(carpeta) / 'entrada.json', Path(carpeta) / 'salida.json'
            entrada.write_text(json.dumps({'totalResultados': 1, 'listaAxenda': [ficha()]}))
            with patch('calendario.guardar', side_effect=OSError('Disco lleno')):
                with self.assertRaises(OSError):
                    main(['--turso', '--entrada', str(entrada), '--salida', str(salida)])
            with patch('calendario.recoger', side_effect=AssertionError('Sin red')):
                main(['--turso', '--exportar', '--salida', str(salida)])
            self.assertEqual(json.loads(salida.read_text()), self.nuevo().cargar())

    def test_rechaza_base_ajena_y_version_futura(self):
        self.servidor.db.execute('UPDATE agenda_esquema SET version=99')
        with self.assertRaisesRegex(ValueError, 'incompatible'):
            self.remoto.cargar()
        self.servidor.db.execute('CREATE TABLE ajena(id)')
        with self.assertRaisesRegex(ValueError, 'dedicada'):
            self.remoto.inicializar()

    def test_otras_disciplinas_y_agendas_conservan_ambitos_sin_deducir_territorio(self):
        a = construir([ficha()])
        registros = []
        for disciplina, nombre in (('baloncesto', 'Partido'), ('atletismo', 'Final de 100 m')):
            fuente = 'prueba-' + disciplina
            grupos = {f'{fuente}:{tipo}': {'tipo': tipo, 'nombres': {'es': tipo},
                       'fuente': fuente} for tipo in ('competicion', 'temporada', 'fase')}
            grupos[fuente + ':temporada']['relaciones'] = [
                {'tipo': 'temporada_de', 'destino': fuente + ':competicion'}]
            registro = {'fuente': fuente, 'id_externo': '42',
                'original': {'disciplina': disciplina, 'sin_hora_confirmada': True},
                'datos': {'titulos': {'es': nombre},
                    'cuando': {'inicio': '2026-11-01', 'fin': None, 'precision': 'dia', 'zona': None},
                    'estado': 'programado', 'grupos': list(grupos), 'regiones': [], 'relaciones': []},
                'grupos': grupos, 'regiones': {}}
            registros.append(registro)
        calendario = integrar(a, registros, {r['fuente']: {'capacidades': ['calendario']}
                                             for r in registros}, DESPUES)
        self.remoto.guardar(calendario)
        restaurado = self.nuevo().cargar()
        self.assertEqual(restaurado, calendario)
        self.assertEqual(len(restaurado['eventos']), 3)
        self.assertNotEqual(restaurado['vinculos']['prueba-baloncesto:42'],
                            restaurado['vinculos']['prueba-atletismo:42'])
        self.assertTrue(all(not e['regiones'] for e in restaurado['eventos']
                            if e['datos_de'].startswith('prueba-')))

    def test_batch_incompleto_no_se_presenta_como_confirmado(self):
        with patch('turso_http.urlopen', return_value=io.BytesIO(b'{"results":[]}')):
            with self.assertRaisesRegex(ErrorTurso, 'incompleta'):
                self.remoto.guardar(construir([ficha()]))

    def test_modificar_la_lectura_no_modifica_la_instantanea_para_comparar(self):
        self.remoto.guardar(construir([ficha()]))
        leido = self.remoto.cargar()
        leido['eventos'][0]['titulos']['gl'] = 'Revisado'
        self.remoto.guardar(leido)
        self.assertEqual(self.nuevo().cargar()['eventos'][0]['titulos']['gl'], 'Revisado')

    def test_copia_completa_reabre_el_historial_y_no_pisa_la_anterior_si_falla(self):
        a = construir([ficha()])
        self.remoto.guardar(a)
        b = construir([ficha(titulo='Corregido')], a, DESPUES)
        self.remoto.guardar(b)
        with tempfile.TemporaryDirectory() as carpeta:
            ruta = Path(carpeta) / 'copia.sqlite'
            self.remoto.copia(ruta)
            with almacen.abrir(ruta) as db:
                self.assertEqual(almacen.cargar(db), b)
                self.assertEqual(db.execute('SELECT count(*) FROM agenda_revisiones').fetchone()[0], 2)
            anterior = ruta.read_bytes()
            with patch.object(self.remoto.cliente, 'dump', return_value='SQL truncado'):
                with self.assertRaises(sqlite3.Error):
                    self.remoto.copia(ruta)
            self.assertEqual(ruta.read_bytes(), anterior)

    def test_codificacion_y_limites_antes_de_enviar(self):
        self.assertEqual(argumento(1.5), {'type': 'float', 'value': 1.5})
        self.assertEqual(argumento(b'a'), {'type': 'blob', 'base64': 'YQ=='})
        self.assertEqual(valor({'type': 'blob', 'base64': 'YQ=='}), b'a')
        with self.assertRaises(ValueError):
            Cliente('https://usuario:clave@agenda.test', 'token')
        with patch.object(self.remoto.cliente, 'MAX_ENVIO', 1):
            with self.assertRaisesRegex(ErrorTurso, 'demasiado grande'):
                self.remoto.guardar(construir([ficha()]))


class MigracionLocal(unittest.TestCase):
    def test_migra_boceto_v1_sin_perder_fechas_originales_ni_historial(self):
        a = construir([ficha()])
        with tempfile.TemporaryDirectory() as carpeta:
            ruta = Path(carpeta) / 'v1.sqlite'
            with almacen.abrir(ruta) as db:
                almacen.guardar(db, a)
                ref, registro = next(iter(a['registros'].items()))
                db.execute('UPDATE agenda_registros SET datos_json=? WHERE ref=?',
                           (json.dumps(registro), ref))
                db.execute('DROP TABLE agenda_esquema')
                db.execute('PRAGMA user_version=1')
            with almacen.abrir(ruta) as db:
                self.assertEqual(almacen.cargar(db), a)
                self.assertEqual(db.execute('SELECT count(*) FROM agenda_revisiones').fetchone()[0], 1)
                almacen.guardar(db, construir([ficha()], a, DESPUES))
                self.assertEqual(db.execute('SELECT count(*) FROM agenda_revisiones').fetchone()[0], 1)

    def test_recogida_antigua_no_reemplaza_observacion_mas_reciente(self):
        a = construir([ficha()], ahora=DESPUES)
        with self.assertRaisesRegex(ValueError, 'anterior'):
            construir([ficha(titulo='Antiguo')], a, AHORA)
