"""Versiones y sesiones de documentos FGA con descargas simuladas de bytes."""
from copy import deepcopy
from hashlib import sha256
import json
import unittest
from unittest.mock import patch

from bs4 import BeautifulSoup

from agenda import atletismo, atletismo_fga as f, atletismo_recogida as r, publicacion
from test_atletismo_fga import AHORA, html, ficha, evento_de_ficha

OTRA = '2026-11-05T12:00:00+01:00'


class DocumentosFGA(unittest.TestCase):
    def recogida(self, contenido):
        original = html('fga-0101-813fd655cc9a.html')
        url = 'https://atletismo.gal/competicions/control/'
        revisadas = deepcopy(f.lecturas_documentales())
        for u in revisadas:
            revisadas[u]['sha256'] = sha256(b'%PDF-\xff\x00revisado').hexdigest()
        llamadas = []

        def obtener(u, *, binario=False):
            llamadas.append((u, binario))
            if binario:
                if isinstance(contenido, Exception):
                    raise contenido
                return contenido
            if u.startswith(f.API):
                return json.dumps([{'id': 99497, 'title': 'Control', 'main_date': '2025-02-16',
                                    'all_dates': ['2025-02-16']}])
            if u.startswith(f.BASE + '?'):
                return f'''<div id="competitionList"><article class="type-competition post-99497">
                    <div class="space-x-2"><div><span>16/02/2025</span></div></div>
                    <h2><a href="{url}">Control</a></h2></article></div>'''
            return original

        with patch.object(f, 'lecturas_documentales', return_value=revisadas):
            entrada, informe = r.recoger('fga', '2025-02-16', '2025-02-16', descargar=obtener)
        return entrada, informe, llamadas

    def test_bytes_iguales_hash_y_lectura_y_fallo_transitorio_estables(self):
        entrada, informe, llamadas = self.recogida(b'%PDF-\xff\x00revisado')
        e, = entrada['eventos']
        self.assertEqual(e['metadatos']['actividad']['valor'], 'control')
        self.assertEqual(len(e['programa']), 2)
        documentos = [d for d in e['metadatos']['documentos'] if d['rol'] == 'circular']
        self.assertTrue(all(d['hash'] == sha256(b'%PDF-\xff\x00revisado').hexdigest() for d in documentos))
        self.assertEqual(len([u for u, b in llamadas if b]), 2)
        self.assertEqual(len(llamadas), len(set(llamadas)))
        self.assertEqual(informe['peticiones'], 5)
        self.assertTrue(informe['aplicar_ausencias'])
        caida, informe_caida, _ = self.recogida(OSError('PDF caído'))
        self.assertEqual(caida, entrada)
        self.assertTrue(informe_caida['aplicar_ausencias'])
        self.assertTrue(any('descarga fallida' in a['motivo'] for a in informe_caida['avisos']))
        n = atletismo.importar(None, entrada, AHORA)
        otra = atletismo.importar(n, caida, OTRA)
        self.assertEqual(set(n['observaciones']), set(otra['observaciones']))

    def test_bytes_distintos_no_aplican_lectura_ni_hash_y_no_bloquean_ausencias(self):
        entrada, informe, _ = self.recogida(b'%PDF-\xff\x00sustituido')
        e, = entrada['eventos']
        self.assertEqual(e['metadatos']['actividad'], {'valor': 'desconocida'})
        self.assertEqual(e['metadatos']['alcance'], {'tipo': 'desconocido'})
        self.assertNotIn('titulos', e['metadatos'])
        self.assertNotIn('programa', e)
        self.assertEqual(len([d for d in e['metadatos']['documentos'] if d['rol'] == 'circular']), 2)
        self.assertTrue(all('hash' not in d for d in e['metadatos']['documentos']))
        self.assertTrue(any('bytes distintos' in a['motivo'] for a in informe['avisos']))
        self.assertTrue(informe['aplicar_ausencias'])

    def test_ficha_pura_sin_verificacion_no_copia_lectura(self):
        x = f.leer_ficha(html('fga-0101-813fd655cc9a.html'))
        self.assertEqual(x['programa'], [])
        self.assertEqual(x['metadatos']['actividad'], {'valor': 'desconocida'})

    def test_sesiones_99497_sin_circulares_no_se_publican_y_pueden_volver(self):
        e = evento_de_ficha('fga-0101-813fd655cc9a.html')
        pagina = {'version': 1, 'fuente': 'fga', 'eventos': [e]}
        otra_cita = {**e, 'id': 'otra-cita', 'nombre': 'Otro control',
                     'url': 'https://atletismo.gal/competicions/otro/'}
        n = atletismo.importar(None, {**pagina, 'eventos': [e, otra_cita]}, AHORA)
        otra_fuente = {'version': 1, 'fuente': 'fca', 'eventos': [{
            **e, 'id': 'otra', 'nombre': 'Otra competición', 'url': 'https://fcatletisme.cat/event/otra/',
            'metadatos': {}, 'inicio': '2025-02-16', 'fin': '2025-02-16'}]}
        n = atletismo.importar(n, otra_fuente, AHORA)
        s = BeautifulSoup(html('fga-0101-813fd655cc9a.html'), 'html.parser')
        for enlace in s.select('a[href]'):
            if enlace['href'] in f.lecturas_documentales():
                enlace.decompose()
        nueva = f.leer_ficha(str(s), url=e['url'], lecturas=f.lecturas_documentales())
        sin = {k: v for k, v in e.items() if k != 'programa'}
        sin['metadatos'] = nueva['metadatos']
        actualizado = atletismo.importar(n, {**pagina, 'eventos': [sin]}, OTRA)
        self.assertTrue(set(n['observaciones']) <= set(actualizado['observaciones']))
        eventos = publicacion.proyectar(actualizado)['eventos']
        self.assertEqual(sorted(len(x.get('programa', [])) for x in eventos), [0, 2, 2])
        # Importar otra cita de la misma fuente no reactiva las sesiones retiradas.
        vacia = atletismo.importar(actualizado, {**pagina, 'eventos': []}, OTRA)
        self.assertEqual(vacia['fuentes']['fga']['sesiones_ausentes'], actualizado['fuentes']['fga']['sesiones_ausentes'])
        restaurado = atletismo.importar(vacia, pagina, '2026-11-06T12:00:00+01:00')
        self.assertNotIn('sesiones_ausentes', restaurado['fuentes']['fga'])
        self.assertTrue(all(len(x['programa']) == 2 for x in publicacion.proyectar(restaurado)['eventos']))

    def test_memoria_por_pasada_y_ritmo_tambien_para_bytes_y_fallos(self):
        def leer(desde, hasta, obtener, **kwargs):
            for _ in range(2):
                self.assertEqual(obtener('https://atletismo.gal/uno.pdf', binario=True), b'\xff\x00')
                with self.assertRaises(OSError):
                    obtener('https://atletismo.gal/roto.pdf', binario=True)
            obtener(f.BASE)
            return {'version': 1, 'fuente': 'fga', 'eventos': []}, {'pendientes': [], 'completo': True}

        def descargar(url, *, binario=False):
            if url.endswith('roto.pdf'):
                raise OSError('PDF caído')
            return b'\xff\x00' if binario else ''

        with patch.object(r, 'galicia', side_effect=leer), \
                patch.object(r.recogida, 'descargar', side_effect=descargar) as descarga, \
                patch.object(r.time, 'sleep') as pausa, patch.object(r.time, 'monotonic', return_value=0):
            _, informe = r.recoger('fga', '2025-02-16', '2025-02-16')
        self.assertEqual(descarga.call_count, 3)
        self.assertEqual(informe['peticiones'], 3)
        self.assertEqual(pausa.call_args_list, [unittest.mock.call(2.5), unittest.mock.call(2.5)])

    def test_solo_retira_sesion_que_desaparece_del_programa(self):
        e = evento_de_ficha('fga-0101-813fd655cc9a.html')
        pagina = {'version': 1, 'fuente': 'fga', 'eventos': [e]}
        n = atletismo.importar(None, pagina, AHORA)
        e['programa'] = e['programa'][:1]
        nuevo = atletismo.importar(n, pagina, OTRA)
        self.assertEqual(len(publicacion.proyectar(nuevo)['eventos'][0]['programa']), 1)
