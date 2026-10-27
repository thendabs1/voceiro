"""Publicación SQL real y atómica con los adaptadores culturales y deportivos."""
from copy import deepcopy
import json
import sqlite3
import unittest
from unittest.mock import patch

from agenda import espn_tenis, feb, kulturklik, madrid
from agenda.lectura import estado, preparar, planificar
from agenda.publicacion import proyectar, main
from agenda.transicion import ampliar
from test_agenda import construir, ficha
from test_calendario_publicacion import tenis, html_feb, AHORA
from test_calendario_cultura import muestra, LUEGO


def sin_comprobado(v):
    if isinstance(v, list):
        return [sin_comprobado(x) for x in v]
    if isinstance(v, dict):
        return {k: sin_comprobado(x) for k, x in v.items() if k != 'comprobado'}
    return v


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

    def publicar(self, preparada=None, revision=12, extra=(), previo=None):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            for sql, args in [*planificar(preparada or self.preparada, revision, previo), *extra]:
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
            self.assertEqual(detalle['evento'], sin_comprobado(evento))
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
            # Sin lectura previa: una consulta del estado y un reemplazo completo.
            remoto.cliente.transaccion.side_effect = lambda pasos, escritura=True: None if escritura else [{'rows': []}]
            main(['--turso', '--fuentes', 'cultura-galicia', '--lectura-sql'])
            escrituras = [c for c in remoto.cliente.transaccion.call_args_list if c.kwargs.get('escritura', True)]
            self.assertEqual(len(escrituras), 1)
            pasos = escrituras[0].args[0]
            for sql, args in pasos:
                self.db.execute(sql, args)
            self.assertEqual(self.db.execute('SELECT origen_revision FROM agenda_lectura_control').fetchone(), (12,))

    def tablas(self, db=None):
        db = db or self.db
        return {t: sorted(db.execute(f'SELECT * FROM agenda_lectura_{t}').fetchall())
                for t in ('control', 'eventos', 'facetas', 'tramos', 'entidades', 'huellas')}

    def previo(self):
        return estado(lambda pasos: [self.db.execute(sql, args).fetchall() for sql, args in pasos])

    def completa(self, preparada):
        """Base nueva con la lectura entera, para comparar con la diferencial."""
        otra = LecturaSQL('test_detalle_deportes_conserva_parejas_resultados_y_objetivos')
        otra.setUp()
        otra.publicar(preparada)
        return otra.tablas()

    def con_otro_evento(self):
        p = deepcopy(self.preparada)
        e = p['eventos'][0]
        p['eventos'].append(['otro', *e[1:]])
        p['facetas'] += [['otro', *f[1:]] for f in p['facetas'] if f[0] == e[0]]
        p['tramos'] += [[*t[:3], 'otro'] for t in p['tramos'] if t[3] == e[0]]
        p['entidades'].append(['participante:otra', 'participante', ' otra ', '{}'])
        return p

    def test_sin_cambios_la_publicacion_diferencial_solo_renueva_el_control(self):
        self.assertIsNone(self.previo())
        self.publicar()
        antes = self.tablas()
        pasos = planificar(self.preparada, 12, self.previo())
        tocadas = [sql for sql, _ in pasos if 'agenda_lectura_control' not in sql and not sql.lstrip().startswith('CREATE')]
        self.assertEqual(tocadas, [])
        self.publicar(previo=self.previo())
        self.assertEqual(self.tablas(), antes)

    def test_recoger_otra_vez_lo_mismo_no_reescribe_nada(self):
        # «Comprobado» avanza en cada pasada, también en el origen de las resoluciones de recintos.
        def recoger(n, ahora):
            for modulo in (madrid, kulturklik):
                n = modulo.importar(n, muestra(modulo.__name__.rsplit('.', 1)[-1]), ahora)
            return n
        primera = recoger(None, AHORA)
        segunda = recoger(primera, LUEGO)
        fuentes = sorted(primera['fuentes'])
        self.publicar(preparar(proyectar(primera, fuentes, AHORA)))
        pasos = planificar(preparar(proyectar(segunda, fuentes, LUEGO)), 12, self.previo())
        tocadas = [sql for sql, _ in pasos if 'agenda_lectura_control' not in sql and not sql.lstrip().startswith('CREATE')]
        self.assertEqual(tocadas, [])

    def test_cambios_y_retiradas_dejan_la_misma_lectura_que_un_reemplazo_completo(self):
        ampliada = self.con_otro_evento()
        self.publicar(ampliada)
        cambiada = deepcopy(ampliada)
        cambiada['eventos'][0][1] += 'cambio '
        pasos = planificar(cambiada, 12, self.previo())
        eventos = [args[0] for sql, args in pasos if sql.startswith('INSERT INTO agenda_lectura_eventos')]
        self.assertEqual(eventos, [cambiada['eventos'][0][0]])
        self.publicar(cambiada, previo=self.previo())
        self.assertEqual(self.tablas(), self.completa(cambiada))
        self.publicar(self.preparada, previo=self.previo())
        self.assertEqual(self.tablas(), self.completa(self.preparada))
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_lectura_previa_desfasada_no_modifica_nada(self):
        self.publicar()
        previo = self.previo()
        self.publicar(self.con_otro_evento(), previo=previo)
        antes = self.tablas()
        with self.assertRaises(sqlite3.IntegrityError):
            self.publicar(self.preparada, previo=previo)
        self.assertEqual(self.tablas(), antes)
