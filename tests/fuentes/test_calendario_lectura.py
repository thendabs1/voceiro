"""Publicación SQL real y atómica con los adaptadores culturales y deportivos."""
from copy import deepcopy
import json
import sqlite3
import unittest
from unittest.mock import patch

from agenda import espn_tenis, feb
from agenda.lectura import preparar, planificar
from agenda.publicacion import proyectar, main
from agenda.transicion import ampliar
from test_agenda import construir, ficha
from test_calendario_publicacion import tenis, html_feb, AHORA


class LecturaSQL(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        n = ampliar(construir([ficha()]))['nucleo']
        n = espn_tenis.importar(n, tenis(), 'wta', AHORA)
        cls.n = feb.importar(n, html_feb(), AHORA)
        cls.publica = proyectar(cls.n, ['cultura-galicia'], AHORA)
        cls.preparada = preparar(cls.publica)

    def setUp(self):
        self.db = sqlite3.connect(':memory:', isolation_level=None)
        self.addCleanup(self.db.close)
        self.db.execute('PRAGMA foreign_keys=ON')
        self.db.execute('CREATE TABLE agenda_esquema(id INTEGER PRIMARY KEY,version INTEGER,revision INTEGER)')
        self.db.execute('INSERT INTO agenda_esquema VALUES (1,4,12)')

    def publicar(self, preparada=None, revision=12, extra=()):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            for sql, args in [*planificar(preparada or self.preparada, revision), *extra]:
                self.db.execute(sql, args)
            self.db.execute('COMMIT')
        except Exception:
            self.db.execute('ROLLBACK')
            raise

    def test_seleccion_publica_no_filtra_solo_tarjetas_y_conserva_ids(self):
        self.publicar()
        volcado = '\n'.join(self.db.iterdump())
        self.assertNotIn('espn-wta', volcado)
        self.assertNotIn('feb', volcado)
        tarjetas = [json.loads(f[0]) for f in self.db.execute('SELECT tarjeta_json FROM agenda_lectura_eventos')]
        self.assertEqual([t['id'] for t in tarjetas], [e['id'] for e in self.publica['eventos']])
        self.assertNotIn('observaciones', tarjetas[0])
        self.assertEqual(self.db.execute('SELECT revision FROM agenda_esquema').fetchone(), (12,))

    def test_detalle_deportes_conserva_parejas_resultados_y_objetivos(self):
        p = proyectar(self.n, list(self.n['fuentes']), AHORA)
        self.publicar(preparar(p))
        detalles = {i: json.loads(d) for i, d in self.db.execute('SELECT id,detalle_json FROM agenda_lectura_eventos')}
        for evento in p['eventos']:
            detalle = detalles[evento['id']]
            self.assertEqual(detalle['evento'], evento)
            self.assertEqual(set(detalle['entidades']), set(evento['objetivos']))
        self.assertTrue(any(d['evento']['resultado'] for d in detalles.values()))
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_revision_antigua_no_crea_ni_modifica_la_lectura(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.publicar(revision=11)
        self.assertFalse(self.db.execute("SELECT name FROM sqlite_master WHERE name LIKE 'agenda_lectura_%'").fetchall())
        self.publicar()
        previo = '\n'.join(self.db.iterdump())
        with self.assertRaises(sqlite3.IntegrityError):
            self.publicar(revision=11)
        self.assertEqual('\n'.join(self.db.iterdump()), previo)

    def test_error_intermedio_revierte_y_publicacion_nueva_retira_lo_que_ya_no_es_publico(self):
        self.publicar()
        previo = '\n'.join(self.db.iterdump())
        with self.assertRaises(sqlite3.OperationalError):
            self.publicar(extra=[('INSERT INTO tabla_inexistente VALUES (1)', ())])
        self.assertEqual('\n'.join(self.db.iterdump()), previo)
        vacia = proyectar(self.n, [], AHORA)
        self.publicar(preparar(vacia))
        for tabla in ('eventos', 'entidades', 'facetas', 'tramos'):
            self.assertEqual(self.db.execute(f'SELECT count(*) FROM agenda_lectura_{tabla}').fetchone()[0], 0)

    def test_no_se_publica_revision_sin_seleccion_explicita(self):
        with self.assertRaises(Exception):
            preparar(proyectar(self.n))
        original = deepcopy(self.preparada)
        planificar(self.preparada, 12)
        self.assertEqual(original, self.preparada)

    def test_cli_publica_sql_con_revision_cargada_y_fuentes_explicitas(self):
        with patch('agenda.turso.Almacen') as almacen:
            remoto = almacen.return_value
            remoto.cargar.return_value = {'nucleo': self.n}
            remoto.revision = 12
            main(['--turso', '--fuentes', 'cultura-galicia', '--lectura-sql'])
            self.assertEqual(remoto.cliente.transaccion.call_count, 1)
            pasos = remoto.cliente.transaccion.call_args.args[0]
            for sql, args in pasos:
                self.db.execute(sql, args)
            self.assertEqual(self.db.execute('SELECT origen_revision FROM agenda_lectura_control').fetchone(), (12,))
