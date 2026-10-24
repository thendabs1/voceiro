"""Persistencia real en SQLite y contraste ICS, con respuestas de red simuladas."""

from copy import deepcopy
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from agenda import almacen, vidmar_f1
from agenda.modelo import integrar
from calendario import main
from test_agenda import AHORA, DESPUES, construir, ficha


def ics(*eventos):
    return '\r\n'.join(['BEGIN:VCALENDAR', 'VERSION:2.0',
                        *[f'BEGIN:VEVENT\r\n{e}\r\nEND:VEVENT' for e in eventos],
                        'END:VCALENDAR', ''])


SESION = ('UID:sesion-estable\r\nSUMMARY:Race\\, title\r\n'
          'DTSTART:20261025T200000Z\r\nDTEND:20261025T220000Z\r\n'
          'DTSTAMP:20261024T120000Z\r\nSEQUENCE:0\r\nLOCATION:Somewhere')
DIAS = ('UID:pruebas\r\nSUMMARY:Testing\r\nDTSTART;VALUE=DATE:20260126\r\n'
        'DTEND;VALUE=DATE:20260131\r\nCATEGORIES:Testing')


class ICS(unittest.TestCase):
    def test_dias_utc_plegado_alarmas_y_ausencia_de_geografia_inferida(self):
        alarma = ('\r\nBEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Reminder\r\n'
                  'TRIGGER:-PT15M\r\nEND:VALARM')
        filas = vidmar_f1.leer(ics(SESION.replace('Race\\, title', 'Race\\,\r\n  title') + alarma, DIAS))
        self.assertEqual(len(filas), 2)
        self.assertEqual(filas[0]['datos']['titulos']['en'], 'Race, title')
        self.assertEqual(filas[0]['datos']['cuando']['inicio'], '2026-10-25T20:00:00+00:00')
        self.assertEqual(filas[0]['datos']['estado'], 'desconocido')
        self.assertEqual(filas[0]['regiones'], {})
        self.assertEqual(filas[1]['datos']['cuando']['fin'], '2026-01-31')
        self.assertEqual(filas[1]['datos']['cuando']['precision'], 'dia')
        self.assertTrue(filas[1]['datos']['cuando']['fin_exclusivo'])
        self.assertIn('BEGIN:VALARM', filas[0]['original']['lineas_vevent'])

    def test_cambios_con_secuencia_cero_mantienen_id_y_cancelacion_explicita(self):
        a = integrar(None, vidmar_f1.leer(ics(SESION)), vidmar_f1.FUENTES, AHORA)
        cambio = SESION.replace('SUMMARY:Race\\, title', 'SUMMARY:Another title').replace(
            '20261025T200000Z', '20261025T210000Z') + '\r\nSTATUS:CANCELLED'
        b = integrar(a, vidmar_f1.leer(ics(cambio)), vidmar_f1.FUENTES, DESPUES)
        self.assertEqual(a['eventos'][0]['id'], b['eventos'][0]['id'])
        self.assertEqual(b['eventos'][0]['estado'], 'cancelado')
        self.assertEqual(b['eventos'][0]['cuando']['inicio'], '2026-10-25T21:00:00+00:00')

    def test_rechaza_recurrencias_tz_locales_duplicados_y_truncados(self):
        ejemplos = [ics(SESION, SESION), ics(SESION)[:-20],
                    ics(SESION).replace('VERSION:2.0', 'VERSION:2.0\r\nMETHOD:CANCEL'),
                    ics(SESION.replace('DTSTART:20261025T200000Z',
                                      'DTSTART;TZID=Europe/Madrid:20261025T200000')),
                    ics(SESION.replace('DTEND:20261025T220000Z', 'DTEND:20261025T190000Z')),
                    ics(SESION + '\r\nSUMMARY:Repeated')]
        for propiedad in ('RRULE:FREQ=DAILY', 'RECURRENCE-ID:20261025T200000Z',
                          'EXDATE:20261025T200000Z', 'RDATE:20261026T200000Z', 'DURATION:PT2H'):
            ejemplos.append(ics(SESION + '\r\n' + propiedad))
        for texto in ejemplos:
            with self.subTest(texto=texto), self.assertRaises(ValueError):
                vidmar_f1.leer(texto)


class Persistencia(unittest.TestCase):
    def test_reapertura_conserva_contrato_identidades_y_revisiones(self):
        with tempfile.TemporaryDirectory() as carpeta:
            ruta = Path(carpeta) / 'agenda.sqlite'
            a = construir([ficha(), ficha(201)])
            with almacen.abrir(ruta) as db:
                almacen.guardar(db, a)
            with almacen.abrir(ruta) as db:
                self.assertEqual(almacen.cargar(db), a)
                b = construir([ficha()], almacen.cargar(db), DESPUES)
                almacen.guardar(db, b)
                self.assertEqual(db.execute('SELECT count(*) FROM agenda_revisiones').fetchone()[0], 2)
            with almacen.abrir(ruta) as db:
                c = construir([ficha(titulo='Corregido')], almacen.cargar(db), DESPUES)
                almacen.guardar(db, c)
                self.assertEqual(db.execute('SELECT count(*) FROM agenda_revisiones').fetchone()[0], 3)
                self.assertEqual(db.execute('SELECT count(*) FROM agenda_recogidas').fetchone()[0], 3)
                self.assertEqual(almacen.cargar(db), c)
                self.assertEqual(c['registros']['cultura-galicia:201']['ultima_recogida'], AHORA)
                self.assertEqual(c['registros']['cultura-galicia:101']['primera_recogida'], AHORA)
                self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
                evento = c['vinculos']['cultura-galicia:101']
                self.assertEqual(db.execute('SELECT inicio FROM agenda_eventos WHERE id=?',
                                            (evento,)).fetchone()[0], '2026-10-26T17:00:00+00:00')
                self.assertEqual(db.execute('SELECT evento FROM agenda_evento_region WHERE region=? ORDER BY evento',
                    ('cultura-galicia:municipio:487',)).fetchall(), [(e['id'],) for e in c['eventos']])

    def test_fallo_a_mitad_revierte_estado_historial_y_relaciones(self):
        with tempfile.TemporaryDirectory() as carpeta:
            ruta = Path(carpeta) / 'agenda.sqlite'
            a = construir([ficha()])
            with almacen.abrir(ruta) as db:
                almacen.guardar(db, a)
            roto = deepcopy(a)
            roto['eventos'][0]['regiones'].append('region-inexistente')
            with self.assertRaises(sqlite3.IntegrityError):
                with almacen.abrir(ruta) as db:
                    almacen.guardar(db, roto)
            with almacen.abrir(ruta) as db:
                self.assertEqual(almacen.cargar(db), a)
                self.assertEqual(db.execute('SELECT count(*) FROM agenda_recogidas').fetchone()[0], 1)

    def test_cli_combina_fuentes_reabre_y_exporta_sin_red(self):
        with tempfile.TemporaryDirectory() as carpeta:
            carpeta = Path(carpeta)
            pagina, calendario_ics = carpeta / 'galicia.json', carpeta / 'f1.ics'
            ruta, salida = carpeta / 'agenda.sqlite', carpeta / 'calendario.json'
            pagina.write_text(json.dumps({'totalResultados': 1, 'listaAxenda': [ficha()]}))
            calendario_ics.write_text(ics(SESION, DIAS))
            main(['--db', str(ruta), '--entrada', str(pagina), '--entrada-ics', str(calendario_ics)])
            with patch('calendario.recoger', side_effect=AssertionError('No debe descargar')):
                main(['--db', str(ruta), '--exportar', '--salida', str(salida)])
            a = json.loads(salida.read_text())
            self.assertEqual(len(a['eventos']), 3)
            self.assertEqual(set(a['fuentes']), {'cultura-galicia', 'vidmar-f1'})
            main(['--db', str(ruta), '--entrada', str(pagina), '--salida', str(salida)])
            b = json.loads(salida.read_text())
            self.assertEqual(a['vinculos'], b['vinculos'])
            with almacen.abrir(ruta) as db:
                self.assertEqual(db.execute("SELECT inicio FROM agenda_eventos WHERE precision='hora' "
                    "AND id=?", (b['vinculos']['vidmar-f1:sesion-estable'],)).fetchone()[0],
                    '2026-10-25T20:00:00+00:00')
                self.assertEqual(db.execute('SELECT count(*) FROM agenda_revisiones').fetchone()[0], 3)

    def test_error_de_segunda_fuente_no_escribe_ninguna(self):
        with tempfile.TemporaryDirectory() as carpeta:
            ruta = Path(carpeta) / 'agenda.sqlite'
            a = construir([ficha()])
            with almacen.abrir(ruta) as db:
                almacen.guardar(db, a)
            with patch('calendario.recoger', return_value=[]), \
                    patch('calendario.vidmar_f1.recoger', side_effect=TimeoutError):
                with self.assertRaises(TimeoutError):
                    main(['--db', str(ruta), '--fuente', 'cultura-galicia', '--fuente', 'vidmar-f1'])
            with almacen.abrir(ruta) as db:
                self.assertEqual(almacen.cargar(db), a)
                self.assertEqual(db.execute('SELECT count(*) FROM agenda_recogidas').fetchone()[0], 1)

    def test_exportacion_fallida_se_recupera_desde_base_confirmada(self):
        with tempfile.TemporaryDirectory() as carpeta:
            carpeta = Path(carpeta)
            ruta, salida, entrada = carpeta / 'agenda.sqlite', carpeta / 'calendario.json', carpeta / 'f1.ics'
            entrada.write_text(ics(SESION))
            with patch('calendario.guardar', side_effect=OSError('Disco de salida no disponible')):
                with self.assertRaises(OSError):
                    main(['--db', str(ruta), '--entrada-ics', str(entrada), '--salida', str(salida)])
            main(['--db', str(ruta), '--salida', str(salida), '--exportar'])
            with almacen.abrir(ruta) as db:
                self.assertEqual(json.loads(salida.read_text()), almacen.cargar(db))
                self.assertEqual(db.execute('SELECT count(*) FROM agenda_recogidas').fetchone()[0], 1)

    def test_base_ajena_o_version_desconocida_no_se_modifican(self):
        with tempfile.TemporaryDirectory() as carpeta:
            for version in (0, 99):
                ruta = Path(carpeta) / f'ajena-{version}.sqlite'
                with sqlite3.connect(ruta) as db:
                    db.execute('CREATE TABLE ajena(id TEXT)')
                    db.execute(f'PRAGMA user_version = {version}')
                with self.assertRaises(ValueError):
                    with almacen.abrir(ruta):
                        self.fail('No debe abrir una base ajena')
                with sqlite3.connect(ruta) as db:
                    self.assertEqual(db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall(),
                                     [('ajena',)])


if __name__ == '__main__':
    unittest.main()
