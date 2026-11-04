"""Índices reales; las mutaciones ejercitan fallos, nunca inferencias deportivas."""
from copy import deepcopy
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from bs4 import BeautifulSoup
from agenda import atletismo_circulares as c

M = Path(__file__).with_name('muestras_calendario') / 'atletismo' / 'circulares'


def html(nombre):
    return (M / nombre).read_text()


class IndicesCirculares(unittest.TestCase):
    def test_huellas_de_capturas(self):
        for r in json.loads((M / 'manifest.json').read_text()):
            self.assertEqual(sha256((M / r['archivo']).read_bytes()).hexdigest(), r['sha256'])

    def test_rfea_literal_errata_y_contador_acumulado(self):
        e, siguiente, total = c.leer_rfea(html('rfea-0.html'), c.INDICES['rfea'])
        self.assertEqual((len(e), total), (5, 1152))
        self.assertEqual(siguiente, c.INDICES['rfea'] + '?page=1')
        circular = next(x for x in e if '113/20026' in x['nombre'])
        self.assertIn('113/20026', circular['declaraciones'][0]['literal'])
        self.assertEqual(circular['numero'], '195-2026')
        self.assertEqual(circular['fecha'], '2026-11-03')
        e, siguiente, _ = c.leer_rfea(html('rfea-1.html'), siguiente)
        self.assertEqual(len(e), 5)
        self.assertTrue(siguiente.endswith('?page=2'))

    def test_fga_anexos_y_continuacion_publicada(self):
        e, siguiente, total = c.leer_fga(html('fga-0.html'), c.INDICES['fga'])
        self.assertEqual(len(e), 35)
        self.assertIsNone(total)
        self.assertEqual(siguiente, c.INDICES['fga'] + '?paper_page=1')
        anexo = next(x for x in e if x['numero'] == '171-2026')
        self.assertEqual(anexo['nombre'], 'Anexo circular 156-2026. XXXIV Campionato Xunta de Galicia de Clubs Sub-20')
        self.assertEqual(anexo['declaraciones'][0]['literal'], anexo['nombre'])
        self.assertEqual(anexo['fecha'], '2026-10-08')

    def test_circular_historica_publicada_sin_archivo_no_se_inventa_y_columna_rota_falla(self):
        pagina = html('rfea-209.html')
        url = c.INDICES['rfea'] + '?page=209'
        entradas, _, _ = c.leer_rfea(pagina, url)
        sin = next(e for e in entradas if e['numero'] == '107-2022')
        self.assertIsNone(sin['url'])
        self.assertIn('sin archivo', sin['avisos'][0])
        s = BeautifulSoup(pagina, 'html.parser')
        tr = next(tr for tr in s.select('tbody tr') if '107-2022' in tr.get_text())
        tr.select_one('td.views-field-field-circular-file').decompose()
        with self.assertRaises(ValueError):
            c.leer_rfea(str(s), url)

    def test_fga_sin_enlace_y_final_explicito_sin_confundirlo_con_esquema_roto(self):
        url = c.INDICES['fga'] + '?paper_page=43'
        entradas, _, _ = c.leer_fga(html('fga-43.html'), url)
        sin = next(e for e in entradas if e['numero'] == '4-2016')
        self.assertIsNone(sin['url'])
        self.assertIn('sin enlace', sin['avisos'][0])
        _, siguiente, _ = c.leer_fga(html('fga-79.html'), url.replace('43', '79'))
        self.assertTrue(siguiente.endswith('?paper_page=80'))
        self.assertEqual(c.leer_fga(html('fga-80.html'), siguiente), ([], None, None))
        with self.assertRaises(ValueError):
            c.leer_fga(html('fga-80.html').replace('Non se se atoparon circulares.', 'Error'), siguiente)

    def test_reglaments_no_inventa_numero_fecha_ni_vigencia_por_archivo(self):
        e, archivos = c.leer_reglaments(html('fca-reglaments.html'), c.REGLAMENTS)
        normativa = next(x for x in e if 'normativacompeticio2024.pdf' in x['url'])
        self.assertIsNone(normativa['numero'])
        self.assertIsNone(normativa['fecha'])
        self.assertEqual(normativa['nombre'], '· Normativa de Competició')
        self.assertEqual(len(archivos), 10)
        self.assertEqual(c.configuracion_fca(html('fca-circulars.html')), ('52', 379))

    def test_fca_api_de_la_categoria_publicada_y_ultima_pagina_real(self):
        manifest = json.loads((M / 'manifest.json').read_text())
        for archivo, cantidad in [('fca-api-1.json', 100), ('fca-api-4.json', 80)]:
            u = next(x['url'] for x in manifest if x['archivo'] == archivo)
            entradas, paginas, total = c.leer_fca_api(html(archivo), u, '52')
            self.assertEqual((len(entradas), paginas, total), (cantidad, 4, 380))
            self.assertTrue(all(e['numero'] is not None for e in entradas))
        # La numeración histórica se copia, sin convertir «03» en otro año.
        pagina = json.loads(html('fca-api-1.json'))
        titulo = pagina['body'][0]['title']['rendered']
        for literal, numero in [('Comunicat 29/03: Normativa', '29/03'),
                                ('Circular 28.2/2022: Clubs', '28.2/2022'),
                                ('Circular 12bis/2018: Clubs', '12bis/2018')]:
            pagina['body'][0]['title']['rendered'] = literal
            entradas, _, _ = c.leer_fca_api(json.dumps(pagina), u.replace('page=4', 'page=1'), '52')
            self.assertEqual(entradas[0]['numero'], numero)
        pagina['body'][0]['title']['rendered'] = titulo
        pagina['body'][0]['categories'] = [999]
        with self.assertRaises(ValueError):
            c.leer_fca_api(json.dumps(pagina), u.replace('page=4', 'page=1'), '52')

    def test_presupuestos_separados_sin_incrementarlos(self):
        for fuente, limite in [('rfea', 400), ('fga', 200), ('fca', 200)]:
            def sin_fin(fuente, obtener):
                for n in range(limite + 1):
                    obtener(f'https://ejemplo.test/{n}')
            with patch.object(c, 'leer_indice', side_effect=sin_fin), \
                    patch.object(c.recogida, 'descargar', return_value='') as red, \
                    patch.object(c.time, 'sleep'):
                with self.assertRaisesRegex(ValueError, 'presupuesto'):
                    c.recoger(fuente)
            self.assertEqual(red.call_count, limite)

    def test_esquemas_rotos_y_paginacion_ajena_saltada_o_ambigua(self):
        for lector, nombre, url, marca in [(c.leer_rfea, 'rfea-0.html', c.INDICES['rfea'], 'views-field-field-circular-name'),
                (c.leer_fga, 'fga-0.html', c.INDICES['fga'], 'paperList'),
                (c.leer_reglaments, 'fca-reglaments.html', c.REGLAMENTS, 'td-page-content')]:
            with self.subTest(lector=lector), self.assertRaises(ValueError):
                lector(html(nombre).replace(marca, 'roto'), url)
        for siguiente in ('?page=0', '?page=2', 'https://otro.test/?page=1', '/otra?page=1', '?combine=x&page=1'):
            with self.subTest(siguiente=siguiente), self.assertRaises(ValueError):
                c.leer_rfea(html('rfea-0.html').replace('?page=1', siguiente), c.INDICES['rfea'])

    def test_barrido_rfea_valida_total_antes_de_entregar_y_no_guarda_prefijo(self):
        paginas = {}
        for n in (0, 1):
            s = BeautifulSoup(html(f'rfea-{n}.html'), 'html.parser')
            s.select_one('.views-summary').string = f'{5 * (n + 1)} de 10'
            if n == 1:
                s.select_one('.pager').decompose()
            paginas[c.INDICES['rfea'] + ('?page=1' if n else '')] = str(s)
        indice = c.recoger('rfea', descargar=paginas.__getitem__)
        self.assertEqual((len(indice['entradas']), indice['peticiones']), (10, 2))
        paginas[c.INDICES['rfea'] + '?page=1'] = paginas[c.INDICES['rfea'] + '?page=1'].replace('10 de 10', '10 de 11')
        with self.assertRaisesRegex(ValueError, 'total cambiante'):
            c.recoger('rfea', descargar=paginas.__getitem__)

    def test_solo_enlaza_url_explicita_sin_inferir_por_numero_titulo_o_documento_compartido(self):
        entradas, _, _ = c.leer_fga(html('fga-0.html'), c.INDICES['fga'])
        e = entradas[0]
        eventos = [{'id': '1', 'nombre': e['nombre'], 'metadatos': {'documentos': []}},
                   {'id': '2', 'metadatos': {'documentos': [{'url': e['url']}, {'url': e['url']}]}}]
        antes = deepcopy(eventos)
        asociaciones = c.enlazar(eventos, {'entradas': entradas})
        self.assertEqual([a['id'] for a in asociaciones], ['2'])
        self.assertEqual(eventos, antes)

    def test_proteccion_para_y_no_reemplaza_el_archivo_anterior(self):
        with tempfile.TemporaryDirectory() as carpeta:
            ruta = Path(carpeta) / 'indice.json'
            anterior = {'observado': '2026-01-01T00:00:00+00:00', 'completo': True, 'fuente': 'rfea'}
            ruta.write_text(json.dumps(anterior))
            for codigo in (403, 429):
                with patch.object(c.recogida, 'descargar', side_effect=HTTPError(c.INDICES['rfea'], codigo, 'límite', {}, None)) as red:
                    with self.assertRaises(HTTPError):
                        c.main(['--fuente', 'rfea', '--salida', str(ruta)])
                self.assertEqual(red.call_count, 1)
                self.assertEqual(json.loads(ruta.read_text()), anterior)

    def test_cadencia_semanal_evitas_barridos_diarios(self):
        with tempfile.TemporaryDirectory() as carpeta:
            ruta = Path(carpeta) / 'indice.json'
            ruta.write_text(json.dumps({'observado': datetime.now(timezone.utc).isoformat(), 'completo': True, 'fuente': 'rfea'}))
            with patch.object(c, 'recoger') as red:
                c.main(['--fuente', 'rfea', '--salida', str(ruta)])
                red.assert_not_called()


if __name__ == '__main__':
    unittest.main()
