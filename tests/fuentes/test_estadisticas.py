import sqlite3
import unittest
from datetime import date
from unittest.mock import patch

import estadisticas as tarea
from cosecha import estadisticas as est


def run(ts, ok=True, dominio='a.test', **kw):
    return {'ts': f'2026-10-23T{ts}:00+02:00', 'dominio': dominio, 'ok': 1 if ok else 0,
            'fuente': kw.get('fuente', 'RSS' if ok else ''), 'n_items': kw.get('n', 10 if ok else 0),
            'con_fecha': kw.get('con_fecha', 5 if ok else 0), 'ms': kw.get('ms', 100),
            'error': kw.get('error', ''), 'intentos': kw.get('intentos', 'RSS:ok' if ok else 'RSS:HTTP 403')}


class Runs(unittest.TestCase):
    def test_rachas_rescates_e_intentos(self):
        filas = [run('10:00'), run('10:10', ok=False), run('10:20', ok=False),
                 run('10:30', fuente='Google News', intentos='RSS:HTTP 403 > Google News:ok'),
                 run('10:40', ok=False, error='TimeoutError: x')]
        medios, rec = est.resumen_runs(list(reversed(filas)))
        m = medios['a.test']
        self.assertEqual((m['pasadas'], m['ok'], m['rescates']), (5, 2, 1))
        self.assertEqual(m['fuentes'], {'RSS': 1, 'Google News': 1})
        self.assertEqual(m['intentos'], {'Google News': {'ok': 1},
                                         'RSS': {'HTTP 403': 4, 'ok': 1}})
        self.assertEqual(m['cadenas'], {'RSS:HTTP 403 > Google News:ok': 1})
        self.assertEqual((m['racha_fallos'], m['racha_fallos_min']), (2, 20))
        self.assertEqual((m['primera_ok'], m['ultima_ok'], m['ultimo_estado']),
                         ('10:00', '10:30', 'fallo'))
        self.assertEqual(m['errores'], {'TimeoutError: x': 1})
        self.assertEqual(m['con_fecha_pct'], 50)
        self.assertEqual(rec, {'pasadas': 5, 'primera': '10:00', 'ultima': '10:40',
                               'intervalo_p50': 10, 'huecos': 0, 'hueco_max': 10})

    def test_huecos_del_recolector_y_pocos(self):
        filas = [run('10:00'), run('10:10', dominio='b.test', intentos='RSS:3 > Scraping:ok'),
                 run('11:00')]
        medios, rec = est.resumen_runs(filas)
        self.assertEqual((rec['huecos'], rec['hueco_max']), (1, 50))
        self.assertEqual(medios['b.test']['intentos']['RSS'], {'pocos': 1})
        self.assertEqual(medios['b.test']['rescates'], 1)

    def test_ventana_entre_pasadas_buenas(self):
        # Una fallida en medio alarga la ventana de la estimada siguiente.
        filas = [run('00:00'), run('01:00'), run('02:00'), run('03:00', ok=False), run('04:00'),
                 run('00:00', dominio='b.test')]
        medios, _ = est.resumen_runs(filas)
        self.assertEqual(medios['a.test']['ventana_min'], {'p50': 60, 'p90': 120, 'max': 120})
        self.assertIsNone(medios['b.test']['ventana_min'])


class Titulares(unittest.TestCase):
    payload = {
        'medios': {'a.test': {'g': 'Nacional'}, 'b.test': {'g': 'Nacional'}},
        'noticias': [
            {'d': 'a.test', 't': 'Uno', 'u': '/politica/uno.html', 'f': 'RSS',
             'p': '10:00', 'c': '10:30',
             'a': [{'d': 'b.test', 'u': '/espana/uno', 'p': '00:00', 'c': '10:31'}]},
            {'d': 'a.test', 't': 'Dos', 'u': '/2026/10/23/dos', 'f': 'RSS',
             'p': '12:00', 'c': '11:00'},
            {'d': 'a.test', 't': 'Tres', 'u': '/agenda/tres', 'f': 'RSS',
             'p': '2026-10-30T19:30:00+01:00', 'c': '2026-10-24T01:00:00+02:00'},
            {'d': 'b.test', 't': 'Cuatro', 'u': 'https://otro.test/x', 'f': 'Scraping',
             'e': '09:15', 'c': '09:20'},
        ],
    }

    def test_clases_de_fecha_retraso_y_copias(self):
        medios, total = est.resumen_titulares(self.payload, '2026-10-23')
        a, b = medios['a.test'], medios['b.test']
        self.assertEqual(a['fechas'], {'con_hora': 2, 'futura': 1})
        self.assertEqual(b['fechas'], {'hora_00': 1, 'estimada': 1})
        self.assertEqual(a['retraso_min'], {'p50': 30, 'p90': 30, 'n': 1})
        self.assertEqual((a['adelantadas'], a['adelanto_p50']), (1, 60))
        self.assertEqual(b['fechas_por_fuente'], {'RSS': {'hora_00': 1},
                                                  'Scraping': {'estimada': 1}})
        self.assertEqual((a['compartidos'], b['compartidos']), (1, 1))
        # La copia hereda titular y fuente del representante
        self.assertEqual(b['fuentes'], {'RSS': 1, 'Scraping': 1})
        self.assertEqual(a['secciones'], {'politica': 1, 'agenda': 1})
        self.assertEqual(b['secciones'], {'espana': 1})
        self.assertEqual(b['por_hora'][9] + b['por_hora'][10], 2)
        self.assertEqual((b['primera'], b['ultima']), ('09:15', '10:31'))
        self.assertEqual(total['titulares'], 5)
        self.assertEqual(total['por_grupo'], {'Nacional': {'medios': 2, 'titulares': 5}})
        self.assertEqual(total['compartidos'], 1)

    def test_solo_el_dia_no_cuenta_como_hora(self):
        payload = {'medios': {}, 'noticias': [
            {'d': 'a.test', 't': 'Uno', 'f': 'RSS', 'p': '2026-10-23',
             'e': '09:15', 'c': '09:20'}]}
        a = est.resumen_titulares(payload, '2026-10-23')[0]['a.test']
        self.assertEqual(a['fechas'], {'solo_dia': 1})
        self.assertEqual((a['retraso_min'], a['adelantadas']), (None, 0))
        self.assertEqual(a['por_hora'][9], 1)

    def test_cambio_de_horario_por_instantes(self):
        # 25-10-2026: p en la primera 02:50 (+02:00), recogida en la segunda
        # 02:10 (+01:00): pasan 20 min, no −40.
        payload = {'medios': {}, 'noticias': [
            {'d': 'a.test', 't': 'Uno', 'f': 'RSS',
             'p': '2026-10-25T02:50:00+02:00', 'c': '2026-10-25T02:10:00+01:00'}]}
        a = est.resumen_titulares(payload, '2026-10-25')[0]['a.test']
        self.assertEqual(a['fechas'], {'con_hora': 1})
        self.assertEqual(a['retraso_min'], {'p50': 20, 'p90': 20, 'n': 1})
        self.assertEqual(a['adelantadas'], 0)
        self.assertEqual(a['por_hora'][2], 1)


class Dias(unittest.TestCase):
    def test_dias_y_cerrado(self):
        hoy = date(2026, 10, 24)
        self.assertEqual(est.dias_a_calcular(hoy, 2), ['2026-10-23', '2026-10-22'])
        self.assertFalse(est.cerrado('2026-10-21', hoy))
        self.assertTrue(est.cerrado('2026-10-20', hoy))

    def test_serie_rellena_ceros_solo_con_el_medio_presente(self):
        filas = {'2026-10-22': {'pasadas': 144, 'titulares': 10},
                 '2026-10-23': {'pasadas': 144}}
        s = est.serie(['2026-10-21', '2026-10-22', '2026-10-23'], filas)
        self.assertEqual(s['pasadas'], [None, 144, 144])
        self.assertEqual(s['con_hora'], [None, 0, None])
        self.assertEqual(s['retraso_p50'], [None, None, None])


class LeerRuns(unittest.TestCase):
    """leer_runs contra SQLite con la misma clave que `runs` en Turso."""

    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.addCleanup(self.db.close)
        self.db.execute("""CREATE TABLE runs (
              ts TEXT NOT NULL, dominio TEXT NOT NULL, ok INTEGER NOT NULL,
              fuente TEXT NOT NULL DEFAULT '', n_items INTEGER NOT NULL DEFAULT 0,
              con_fecha INTEGER NOT NULL DEFAULT 0, ms INTEGER NOT NULL DEFAULT 0,
              error TEXT NOT NULL DEFAULT '', intentos TEXT NOT NULL DEFAULT '',
              PRIMARY KEY (ts, dominio)) WITHOUT ROWID""")
        # Tres pasadas de cuatro medios el 23, y pasadas pegadas al 22 y al 24.
        self.del_dia = [(f'2026-10-23T{h}:00+02:00', d)
                        for h in ('00:00', '12:10', '23:50')
                        for d in ('a.test', 'b.test', 'c.test', 'd.test')]
        fuera = [('2026-10-22T23:50:00+02:00', 'a.test'),
                 ('2026-10-24T00:00:00+02:00', 'a.test')]
        self.db.executemany("INSERT INTO runs (ts, dominio, ok) VALUES (?, ?, 1)",
                            self.del_dia + fuera)

    def leer(self, pagina):
        consultas = []

        def consulta(sql, args=()):
            consultas.append(sql)
            return self.db.execute(sql, args).fetchall()

        with patch.object(tarea, 'PAGINA', pagina), \
             patch.object(tarea, '_consulta', consulta):
            filas = tarea.leer_runs('2026-10-23')
        return [(f['ts'], f['dominio']) for f in filas], len(consultas)

    def test_mismas_filas_sin_perder_ni_duplicar(self):
        # 4 y 12 son múltiplos exactos de las 12 filas: la última consulta
        # vuelve vacía. 5 corta páginas en mitad de una misma pasada.
        for pagina in (1, 4, 5, 12, 13):
            with self.subTest(pagina=pagina):
                claves, consultas = self.leer(pagina)
                self.assertEqual(claves, self.del_dia)
                self.assertEqual(consultas, len(self.del_dia) // pagina + 1)


if __name__ == '__main__':
    unittest.main()
