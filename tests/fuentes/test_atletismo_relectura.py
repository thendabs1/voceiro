"""Relectura de terminadas: añade enlaces de resultados sin tocar la lectura guardada."""
from copy import deepcopy
from datetime import date
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from agenda import almacen, atletismo, atletismo_bloque, atletismo_coincidencias, atletismo_recogida as r
from agenda import atletismo_relectura as relectura, publicacion

AHORA = '2026-11-02T20:00:00+01:00'
DESPUES = '2026-11-03T20:00:00+01:00'
HOY = date(2026, 11, 20)
URL = 'https://atletismo.gal/competicions/cross-ensayo/'
DOCUMENTO = {'url': 'https://atletismo.gal/wp-content/uploads/resultados.pdf', 'nombre': 'Resultados',
             'rol': 'resultados', 'evidencia': {'superficie': 'ficha', 'url': URL,
                                                'localizador': 'Resultados/a', 'literal': 'Resultados'}}


def cita(identificador='1', fin='2026-11-15', **extra):
    return {'fuente': 'fca', 'id': identificador, 'url': f'https://fcatletisme.cat/event/{identificador}/', 'inicio': fin,
            'fin': fin, 'estado': 'desconocido', 'metadatos': {}, 'referencia': 'ref-' + identificador, **extra}


def pagina():
    return {'version': 1, 'fuente': 'fga', 'agrupaciones': [
        {'id': 'circuito', 'nombre': 'Circuito de ensayo', 'clase': 'circuito', 'url': 'https://atletismo.gal/competicions/circuito/'}],
        'eventos': [{'id': '1', 'nombre': 'Cross ensayo', 'url': URL, 'inicio': '2026-11-01', 'fin': '2026-11-02',
                     'grupo': 'circuito', 'lugar': {'nombre': 'Lugo'},
                     'programa': [{'id': 'manana', 'nombre': 'Mañana', 'tipo_sesion': 'jornada', 'inicio': '2026-11-01'}]}]}


class Cola(unittest.TestCase):
    def test_prefiere_lo_que_no_tiene_resultados_y_lleva_mas_sin_comprobar(self):
        con = cita('con', metadatos={'documentos': [DOCUMENTO]})
        citas = [con, cita('reciente'), cita('antigua'), cita('nueva')]
        orden = relectura.cola(citas, {'reciente': '2026-11-19', 'antigua': '2026-11-10', 'con': '2026-11-01'}, (), HOY)
        self.assertEqual([c['id'] for c in orden], ['nueva', 'antigua', 'reciente', 'con'])

    def test_deja_fuera_lo_que_no_ha_terminado_caducado_retirado_o_ambiguo(self):
        citas = [cita('hoy', '2026-11-20'), cita('vieja', '2026-10-20'), cita('retirada'), cita('sin-url', url=None),
                 cita('cancelada', estado='cancelado'), cita('aplazada', estado='aplazado'),
                 cita('ambigua', lectura_ambigua=True), cita('limite', '2026-10-21')]
        self.assertEqual([c['id'] for c in relectura.cola(citas, {}, {'retirada'}, HOY)], ['limite'])

    def test_lee_con_cupo_solo_resultados_y_avanza_la_cola(self):
        citas = [cita(str(i)) for i in range(15)]
        documentos = [{**DOCUMENTO, 'rol': 'reglamento', 'url': 'https://a.test/r.pdf'}, DOCUMENTO]
        with patch.dict(relectura.LECTORES, {'fca': lambda c, obtener: documentos}):
            informe = relectura.leer('fca', citas, {'viejo': '2026-10-01'}, (), HOY, None, AHORA)
        self.assertEqual((informe['candidatas'], informe['leidas']), (15, 12))
        self.assertEqual(informe['hallados']['ref-0'], [DOCUMENTO])
        self.assertEqual(len(informe['comprobadas']), 12)  # Lo que salió de la ventana se olvida.

    def test_fallo_de_una_ficha_sigue_y_un_bloqueo_corta_sin_marcarla(self):
        def lector(c, obtener):
            if c['id'] == '1':
                raise OSError('caída')
            if c['id'] == '2':
                raise HTTPError(c['url'], 403, 'prohibido', {}, None)
            return []
        with patch.dict(relectura.LECTORES, {'fca': lector}):
            informe = relectura.leer('fca', [cita('1'), cita('2'), cita('3')], {}, (), HOY, None, AHORA)
        self.assertEqual(sorted(informe['comprobadas']), ['1'])
        self.assertEqual([f['id'] for f in informe['fallidas']], ['1', '2'])

    def test_presupuesto_agotado_corta_sin_romper_la_lectura(self):
        def lector(c, obtener):
            raise ValueError('Atletismo agotó su presupuesto; no se importa una recogida parcial')
        with patch.dict(relectura.LECTORES, {'fca': lector}):
            informe = relectura.leer('fca', [cita('1'), cita('2')], {}, (), HOY, None, AHORA)
        self.assertEqual(len(informe['fallidas']), 1)


class Anadir(unittest.TestCase):
    def setUp(self):
        self.n = atletismo.importar(None, pagina(), AHORA)
        self.c = next(c for c in atletismo_coincidencias.actuales(self.n) if c['id'] == '1')
        self.nuevo = atletismo.anadir_documentos(self.n, 'fga', {self.c['referencia']: [DOCUMENTO]}, DESPUES)

    @classmethod
    def sin_marcas(cls, dato):
        """Quita lo que identifica la lectura; lo demás debe quedar igual."""
        ignorar = {'observado', 'comprobado', 'observacion', 'referencia', 'documento', 'documentos', 'sha256',
                   'resultados_enlazados', 'procedencia'}
        if isinstance(dato, dict):
            return {k: cls.sin_marcas(v) for k, v in dato.items() if k not in ignorar}
        return [cls.sin_marcas(v) for v in dato] if isinstance(dato, list) else dato

    def vista(self, n):
        return publicacion.proyectar(n, fuentes=['fga'], generado='2026-11-05T00:00:00+00:00')['eventos']

    def test_la_cita_conserva_capa_circuito_y_sesiones(self):
        antes, despues = self.vista(self.n), self.vista(self.nuevo)
        self.assertEqual(self.sin_marcas(despues), self.sin_marcas(antes))
        e = despues[0]
        self.assertEqual(len(e['programa']), 1)
        self.assertGreaterEqual(len(e['objetivos']), 3)  # Cita, su programa, circuito y capa.
        self.assertEqual(e['objetivos'], antes[0]['objetivos'])
        self.assertEqual(e['temas'], antes[0]['temas'])

    def test_el_documento_llega_al_detalle_sin_ambiguedad(self):
        c = next(c for c in atletismo_coincidencias.actuales(self.nuevo) if c['id'] == '1')
        self.assertEqual(c['metadatos']['documentos'], [DOCUMENTO])
        self.assertFalse(c['lectura_ambigua'])
        e = publicacion.proyectar(self.nuevo, fuentes=['fga'], generado='2026-11-05T00:00:00+00:00')['eventos'][0]
        self.assertIn(DOCUMENTO, e['atletismo']['variantes'][0]['valor']['documentos'])
        self.assertTrue(e['atletismo']['resultados_enlazados'])
        self.assertIsNone(e['resultado'])

    def test_repetir_el_mismo_enlace_no_crea_otra_lectura(self):
        otra = atletismo.anadir_documentos(self.nuevo, 'fga', {self.c['referencia']: [DOCUMENTO]},
                                           '2026-11-04T20:00:00+01:00')
        self.assertEqual(otra['observaciones'], self.nuevo['observaciones'])

    def test_no_altera_el_nucleo_recibido_ni_sin_hallazgos(self):
        antes = deepcopy(self.n)
        atletismo.anadir_documentos(self.n, 'fga', {self.c['referencia']: [DOCUMENTO]}, DESPUES)
        self.assertEqual(self.n, antes)
        self.assertIs(atletismo.anadir_documentos(self.n, 'fga', {}, DESPUES), self.n)

    def test_una_lectura_posterior_de_la_ficha_sigue_mandando(self):
        n = atletismo.importar(self.nuevo, pagina(), '2026-11-04T20:00:00+01:00')
        self.assertEqual(len(publicacion.proyectar(n, fuentes=['fga'])['eventos']), 1)


class Senal(unittest.TestCase):
    @staticmethod
    def variante(fecha, rol='resultados'):
        return {'valor': {'documentos': [{'rol': rol}]}, 'programacion': {'cuando': {'inicio': {'fecha': fecha}}}}

    def test_un_enlace_previo_a_la_cita_no_acredita_resultados(self):
        hoy = '2026-11-05'
        self.assertFalse(atletismo_bloque.resultados_enlazados([self.variante('2026-11-07')], hoy))
        self.assertTrue(atletismo_bloque.resultados_enlazados([self.variante('2026-11-05')], hoy))
        self.assertFalse(atletismo_bloque.resultados_enlazados([self.variante('2026-11-01', 'reglamento')], hoy))
        self.assertTrue(atletismo_bloque.resultados_enlazados(
            [self.variante('2026-11-07'), self.variante('2026-11-01')], hoy))


class Recogida(unittest.TestCase):
    def test_dos_pasadas_guardan_el_enlace_y_el_cursor(self):
        terminada = date.today().toordinal() - 3
        fecha = date.fromordinal(terminada).isoformat()
        evento = {'id': '1', 'nombre': 'Cross ensayo', 'url': URL, 'inicio': fecha, 'fin': fecha}
        vacia = {'version': 1, 'fuente': 'fga', 'eventos': []}
        informe = {'fuente': 'fga', 'inicio': '2026-11-01', 'fin': '2026-11-30', 'peticiones': 0, 'citas': 0,
                   'completo': True, 'pendientes': [], 'aplicar_ausencias': True}
        with tempfile.TemporaryDirectory() as carpeta:
            db = str(Path(carpeta) / 'agenda.db')
            args = ['--db', db, '--fuente', 'fga']
            with patch.object(r, 'galicia', return_value=({**vacia, 'eventos': [evento]}, dict(informe))), \
                    patch.object(r, 'reconsultar', return_value={'ausencias': [], 'reimportadas': []}):
                r.main(args)
            lector = patch.dict(relectura.LECTORES, {'fga': lambda c, obtener: [DOCUMENTO]})
            with lector, patch.object(r, 'galicia', return_value=(deepcopy(vacia), dict(informe))), \
                    patch.object(r, 'reconsultar', return_value={'ausencias': [], 'reimportadas': []}):
                r.main(args)
            with almacen.abrir(db) as conexion:
                n = almacen.cargar(conexion)['nucleo']
                guardado = json.loads(conexion.execute('SELECT valor_json FROM agenda_estado WHERE clave=?',
                                                       ('atletismo-informe-fga',)).fetchone()[0])
        self.assertEqual(sorted(n['fuentes']['fga']['relectura']), ['1'])
        self.assertEqual(guardado['relectura']['leidas'], 1)
        c = atletismo_coincidencias.actuales(n)[0]
        self.assertEqual(c['metadatos']['documentos'], [DOCUMENTO])
        self.assertNotIn('relectura', publicacion.proyectar(n, fuentes=['fga'])['fuentes']['fga'])


if __name__ == '__main__':
    unittest.main()
