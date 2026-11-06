"""Copa del Rey y Champions con muestras reales recortadas: agenda, sin resultados."""

from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from agenda import almacen, cadencias, deportes, espn, operacion, proveedores, publicacion, temporadas
from agenda.control import Repositorio
from agenda.transicion import ampliar
from test_adaptadores_deportivos import importar, muestra
from test_agenda import construir, ficha


AHORA = '2026-11-01T12:00:00Z'


def eventos(coleccion, datos=None):
    return publicacion.proyectar(importar(coleccion, datos))


class Registro(unittest.TestCase):
    def test_cada_coleccion_esta_en_todos_los_registros(self):
        for coleccion, proveedor, liga in (('copa-del-rey', 'espn-copa-del-rey', 'esp.copa_del_rey'),
                                           ('champions', 'espn-champions', 'uefa.champions')):
            with self.subTest(coleccion):
                self.assertEqual(temporadas.CATALOGO[coleccion][1:], (proveedor, 'fecha'))
                self.assertEqual(proveedores.principal(coleccion), proveedor)
                self.assertEqual(proveedores.fuente_nucleo(proveedor), 'espn-futbol')
                self.assertEqual(cadencias.COLECCIONES[coleccion], 'calendario')
                self.assertEqual(espn.COLECCIONES[proveedor], ('soccer', liga))
                self.assertEqual(deportes.COLECCIONES[proveedor], ('futbol', liga))

    def test_las_previas_de_champions_siguen_fuera(self):
        pagina = muestra('espn-champions')
        pagina['leagues'][0]['slug'] = 'uefa.champions_qual'
        with self.assertRaises(ValueError):
            deportes.importar(None, 'espn-champions', pagina, AHORA)


class Partidos(unittest.TestCase):
    def test_prorroga_y_penaltis_no_quedan_en_estado_desconocido(self):
        pagina = muestra('espn-copa-del-rey')
        nombres = {e['competitions'][0]['status']['type']['name'] for e in pagina['events']}
        self.assertEqual(nombres, {'STATUS_FULL_TIME', 'STATUS_FINAL_AET', 'STATUS_FINAL_PEN'})
        valores = [e['programacion']['valor'] for e in eventos('espn-copa-del-rey')['eventos']]
        self.assertEqual({v['programacion'] for v in valores}, {'programado'})

    def test_el_codigo_de_capa_no_es_el_slug_de_espn(self):
        for coleccion, codigo in (('espn-copa-del-rey', 'copa-del-rey'), ('espn-champions', 'champions')):
            with self.subTest(coleccion):
                p = eventos(coleccion)
                codigos = {c for e in p['entidades'].values() for c in e.get('codigos', ())}
                self.assertEqual(codigos, {codigo})

    def test_ronda_e_ida_vuelta_llegan_a_la_publicacion(self):
        copa = eventos('espn-copa-del-rey')['eventos']
        self.assertEqual({str(e['ronda_torneo']) for e in copa},
                         {str({'codigo': 'first-round', 'nombre': 'Primera eliminatoria'})})
        rondas = [e['ronda_torneo'] for e in eventos('espn-champions')['eventos']]
        self.assertIn({'codigo': 'semifinals', 'nombre': 'Semifinales', 'ida_vuelta': 'vuelta'}, rondas)

    def test_ronda_desconocida_conserva_el_codigo_sin_inventar_nombre(self):
        pagina = muestra('espn-copa-del-rey')
        for e in pagina['events']:
            e['season']['slug'] = 'ronda-nueva'
        self.assertEqual({e['ronda_torneo']['codigo'] for e in eventos('espn-copa-del-rey', pagina)['eventos']},
                         {'ronda-nueva'})
        self.assertFalse(any('nombre' in e['ronda_torneo'] for e in eventos('espn-copa-del-rey', pagina)['eventos']))

    def test_una_ronda_incompleta_no_rechaza_la_importacion(self):
        sin_vuelta = muestra('espn-champions')
        del sin_vuelta['events'][0]['competitions'][0]['leg']
        importar('espn-champions', muestra('espn-champions'), importar('espn-champions', sin_vuelta))

    def test_las_ligas_no_cambian(self):
        self.assertFalse(any('ronda_torneo' in e for e in eventos('espn-nba')['eventos']))
        self.assertFalse(any('ronda_torneo' in e for e in eventos('espn-primera')['eventos']))


class PartidoMovido(unittest.TestCase):
    """ESPN conserva el ID y mueve el partido; un día leído no acredita los demás."""

    def setUp(self):
        carpeta = tempfile.TemporaryDirectory()
        self.addCleanup(carpeta.cleanup)
        ruta = Path(carpeta.name) / 'calendario.sqlite'
        with almacen.abrir(ruta) as db:
            almacen.guardar(db, ampliar(construir([ficha()])))
        db = sqlite3.connect(ruta, isolation_level=None)
        self.addCleanup(db.close)
        self.repo = Repositorio(db=db)
        self.repo.inicializar()

    def pasada(self, pagina, ahora, fechas):
        t = next(iter(self.repo.temporadas('copa-del-rey')))
        t = {**t, 'proxima_revision': None}
        with patch.object(proveedores, 'recoger', return_value=(pagina, 'https://ejemplo.test')):
            return operacion.ejecutar_temporada(self.repo, t, ahora, fechas=fechas, forzar=True)

    def test_moverlo_a_un_dia_no_leido_no_tumba_la_pasada(self):
        self.repo.registrar(temporadas.nueva('copa-del-rey', '2026', AHORA, seleccion={'year': '2026'}))
        pagina = muestra('espn-copa-del-rey')
        self.assertNotEqual(self.pasada(pagina, AHORA, ['2026-11-10'])['estado'], 'fallida')
        vacia = {**pagina, 'events': pagina['events'][1:]}
        r = self.pasada(vacia, '2026-11-03T12:00:00Z', ['2026-11-10'])
        self.assertNotEqual(r['estado'], 'fallida')
        t = next(iter(self.repo.temporadas('copa-del-rey')))
        self.assertEqual([i['tipo'] for i in t['incidencias'] if i['tipo'] == 'ausente_de_su_fecha'],
                         ['ausente_de_su_fecha'])
        self.assertTrue(all(c['completa'] for c in self.repo.cobertura(t['id'])))
        self.assertEqual(len(self.repo.eventos(t['id'])), 3)

    def test_la_ausencia_dura_hasta_que_el_partido_reaparece(self):
        self.repo.registrar(temporadas.nueva('copa-del-rey', '2026', AHORA, seleccion={'year': '2026'}))
        pagina = muestra('espn-copa-del-rey')
        self.pasada(pagina, AHORA, ['2026-11-10'])
        recortada = {**pagina, 'events': pagina['events'][1:]}
        self.pasada(recortada, '2026-11-03T12:00:00Z', ['2026-11-10'])
        # La misma lectura recortada ya no lo compara, pero sigue bloqueando el cierre.
        self.pasada(recortada, '2026-11-04T12:00:00Z', ['2026-11-10'])
        t = next(iter(self.repo.temporadas('copa-del-rey')))
        self.assertEqual([i['tipo'] for i in t['incidencias'] if 'evento' in i], ['programacion_pendiente_conservada'])
        self.assertEqual(sum(bool(e.get('ausente_de_su_fecha')) for e in self.repo.eventos(t['id'])), 1)
        # Reaparece en otro día con el mismo ID: la marca se va sola.
        self.pasada({**pagina, 'events': pagina['events'][:1]}, '2026-11-05T12:00:00Z', ['2026-11-18'])
        t = next(iter(self.repo.temporadas('copa-del-rey')))
        self.assertFalse([i for i in t['incidencias'] if 'evento' in i])
        self.assertFalse(any(e.get('ausente_de_su_fecha') for e in self.repo.eventos(t['id'])))

    def test_una_cobertura_antigua_no_resucita_un_partido_ya_movido(self):
        self.repo.registrar(temporadas.nueva('copa-del-rey', '2026', AHORA, seleccion={'year': '2026'}))
        pagina = muestra('espn-copa-del-rey')
        self.pasada(pagina, AHORA, ['2026-11-10'])
        self.pasada(pagina, '2026-11-02T12:00:00Z', ['2026-11-18'])
        self.pasada({**pagina, 'events': []}, '2026-11-03T12:00:00Z', ['2026-11-10'])
        t = next(iter(self.repo.temporadas('copa-del-rey')))
        self.assertFalse([i for i in t['incidencias'] if 'evento' in i])
        self.assertFalse(any(e.get('ausente_de_su_fecha') for e in self.repo.eventos(t['id'])))

    def consumir(self, peticiones):
        self.repo.escribir([('INSERT INTO agenda_control_consumo VALUES (?,?,?,?)',
                             ('espn', AHORA[:10], peticiones, '{}'))])

    def test_el_cupo_diario_recorta_la_pasada_sin_perder_lo_leido(self):
        t = self.repo.registrar(temporadas.nueva('nba', '2027', AHORA, seleccion={'year': '2027'}))
        self.consumir(56)
        with patch.object(proveedores, 'recoger', return_value=(muestra('espn-nba'), 'https://ejemplo.test')) as recoger:
            r = operacion.ejecutar_temporada(self.repo, t, AHORA)
        self.assertEqual(recoger.call_count, 8)
        self.assertNotEqual(r['estado'], 'fallida')
        self.assertEqual(len({c['unidad'] for c in self.repo.cobertura(t['id'])}), 8)

    def test_las_fechas_explicitas_tambien_respetan_el_cupo(self):
        t = self.repo.registrar(temporadas.nueva('nba', '2027', AHORA, seleccion={'year': '2027'}))
        self.consumir(63)
        with patch.object(proveedores, 'recoger', return_value=(muestra('espn-nba'), 'https://ejemplo.test')) as recoger:
            r = operacion.ejecutar_temporada(self.repo, t, AHORA, fechas=['2026-11-01', '2026-11-02'], forzar=True)
        self.assertEqual(recoger.call_count, 1)
        self.assertNotEqual(r['estado'], 'fallida')
        self.assertEqual({c['unidad'] for c in self.repo.cobertura(t['id'])}, {'2026-11-01'})

    def test_sin_cupo_la_pasada_espera_sin_contar_como_error(self):
        t = self.repo.registrar(temporadas.nueva('nba', '2027', AHORA, seleccion={'year': '2027'}))
        self.consumir(64)
        with patch.object(proveedores, 'recoger') as recoger:
            r = operacion.ejecutar_temporada(self.repo, t, AHORA)
        recoger.assert_not_called()
        self.assertEqual((r['estado'], r['motivo']), ('omitida', 'cupo del día agotado'))
        self.assertEqual(next(iter(self.repo.temporadas('nba')))['errores_consecutivos'], 0)

    def test_el_modo_temporada_sigue_rechazando_una_lista_recortada(self):
        previa = [{'unidad': '2026', 'recurso': 'calendario', 'proveedor': 'motogp', 'eventos': ['a']}]
        i = operacion._incidencias(previa, [], [], ['2026'], AHORA)
        self.assertEqual(i[0]['tipo'], 'ausentes_en_respuesta')


if __name__ == '__main__':
    unittest.main()
