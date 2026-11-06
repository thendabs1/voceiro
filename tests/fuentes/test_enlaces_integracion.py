"""Contrato de identidad de enlaces: cosecha → JSON → histórico → navegador.

RSS locales con dominios del catálogo real; no prueban la disponibilidad del medio.
Los expectedFailure conservan el enlace deseado, sin normalizarlo al fallo actual.
"""
import contextlib
from datetime import datetime, timedelta
from html import escape
import io
import json
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from medios import todos_los_medios
from cosecha import config, fuentes, historico, publicacion

RAIZ = Path(__file__).resolve().parents[2]
MEDIOS = {m['d']: m for m in todos_los_medios()}


class EnlacesIntegracion(unittest.TestCase):
    def setUp(self):
        self.ahora = datetime.now(config.TZ_MADRID).replace(hour=12, minute=0, second=0, microsecond=0)
        self.red = patch.object(fuentes.SESSION, 'request', side_effect=AssertionError('Red no permitida'))
        self.red.start()
        self.addCleanup(self.red.stop)

    def recoger(self, dominio, enlaces, titulo=None, dia=0):
        # Se pasa por el extractor RSS y obtener_titulares reales, incluida la captura de _host.
        medio = {**MEDIOS[dominio], 'fuentes': [('rss', f'https://{dominio}/rss.xml')]}
        fecha = self.ahora - timedelta(days=dia, hours=1)
        xml = '<rss><channel>' + ''.join(
            f'<item><title>{escape(titulo or "Actualidad y noticias de " + enlace)}</title>'
            f'<link>{escape(enlace)}</link><pubDate>{fecha.isoformat()}</pubDate></item>'
            for enlace in enlaces) + '</channel></rss>'
        respuesta = SimpleNamespace(status_code=200, content=xml.encode())
        with patch.object(fuentes.SESSION, 'get', return_value=respuesta) as get:
            _, noticias, fuente, _ = fuentes.obtener_titulares(medio)
        get.assert_called_once()
        self.assertEqual(fuente, 'RSS')
        self.assertEqual({n['enlace'] for n in noticias}, set(enlaces))
        return noticias

    def publicar(self, noticias, dia=0):
        fecha = (self.ahora - timedelta(days=dia)).date().isoformat()
        _, _, payload, _ = publicacion._generar_slice(noticias, fecha, '', self.ahora)
        return json.loads(json.dumps(payload))

    def portada(self, noticias):
        with tempfile.TemporaryDirectory() as tmp, patch.object(config, 'DATOS_DIR', tmp), \
                patch.object(publicacion, '_FICHEROS_ESCRITOS', set()), \
                contextlib.redirect_stdout(io.StringIO()):
            info = publicacion.generar_portada(noticias, self.ahora)
            return json.loads(Path(tmp, info['file']).read_text())

    def releer(self, ficheros):
        with tempfile.TemporaryDirectory() as tmp:
            dias = []
            for i, fichero in enumerate(ficheros):
                nombre = f'dia-{i}.json'
                Path(tmp, nombre).write_text(json.dumps(fichero), encoding='utf-8')
                dias.append({'fecha': fichero.get('fecha') or fichero['generado'][:10],
                             'all': {'file': nombre}})
            inventario = Path(tmp, 'inventario.json')
            inventario.write_text(json.dumps({'dias': dias}), encoding='utf-8')
            with patch.multiple(config, DATOS_DIR=tmp, INVENTARIO_PATH=str(inventario),
                                STATE_PATH=str(Path(tmp, 'state.json'))), \
                    contextlib.redirect_stdout(io.StringIO()):
                return historico.cargar_historico_payload()['noticias']

    def front(self, ficheros, orden=None, extender=False):
        r = subprocess.run(['node', 'tests/soporte/reconstruir-enlaces.mjs'], cwd=RAIZ,
                           input=json.dumps({'ficheros': ficheros, 'orden': orden,
                                             'extender': extender}), text=True,
                           capture_output=True, timeout=15)
        self.assertEqual(r.returncode, 0, r.stderr)
        return json.loads(r.stdout)

    def comprobar(self, noticias, ficheros):
        esperado = sorted((n['dominio'], n['enlace']) for n in noticias)
        self.assertEqual(sorted((n['dominio'], n['enlace']) for n in self.releer(ficheros)), esperado)
        republicados = [publicacion._generar_slice(self.releer([f]),
                        f.get('fecha') or f['generado'][:10], '', self.ahora)[2]
                        for f in ficheros]
        for pasada, lote in enumerate((ficheros, republicados)):
            for orden in ([0, 1], [1, 0]) if len(lote) == 2 else ([0],):
                for extender in (False, True):
                    with self.subTest(pasada=pasada, orden=orden, extender=extender):
                        leidas = self.front(lote, orden, extender)
                        self.assertEqual(sorted((n['dominio'], n['enlace']) for n in leidas), esperado)

    def test_www_sin_www_y_subdominios_reales(self):
        noticias = self.recoger('telecinco.es', ['https://www.telecinco.es/noticias/sociedad/presupuesto.html'])
        noticias += self.recoger('as.com', ['https://as.com/futbol/primera/presupuesto-n/',
                                           'https://chile.as.com/futbol/presupuesto-n/',
                                           'https://colombia.as.com/futbol/presupuesto-n/'])
        noticias += self.recoger('elpais.com.uy', ['https://rurales.elpais.com.uy/agro/presupuesto'])
        self.comprobar(noticias, [self.publicar(noticias)])
        self.comprobar(noticias, [self.portada(noticias)])

    def test_host_ajeno_antes_del_propio_no_contamina_las_rutas(self):
        noticias = self.recoger('telecinco.es', ['https://www.cuatro.com/noticias/presupuesto.html',
                                               'https://www.telecinco.es/noticias/presupuesto.html'])
        noticias += self.recoger('cambio16.com', ['https://news.google.com/rss/articles/CBMiCambio16',
                                                'https://cambio16.com/presupuesto/'])
        self.comprobar(noticias, [self.publicar(noticias)])
        self.comprobar(noticias, [self.portada(noticias)])

    def test_google_news_conserva_redirector_y_atribuye_por_source_del_feed(self):
        titulo = 'El Gobierno presenta los presupuestos para el próximo ejercicio'
        enlace = 'https://news.google.com/rss/articles/CBMiCambio16'
        xml = '<rss><channel>' + ''.join(
            f'<item><title>{titulo} - {nombre}</title><link>{enlace}{i or ""}</link>'
            f'<source url="https://{dominio}">{nombre}</source>'
            f'<pubDate>{self.ahora.isoformat()}</pubDate></item>'
            for i, (dominio, nombre) in enumerate([('cambio16.com', 'Cambio16'),
                                                  ('falsocambio16.com', 'Otro medio')])) + '</channel></rss>'
        peticiones = []

        def responder(url, **kwargs):
            peticiones.append(url)
            return SimpleNamespace(status_code=200, content=xml.encode()) if url.startswith(
                'https://news.google.com/') else SimpleNamespace(status_code=403)

        with patch.object(fuentes.SESSION, 'get', side_effect=responder), \
                contextlib.redirect_stdout(io.StringIO()):
            _, noticias, fuente, _ = fuentes.obtener_titulares(MEDIOS['cambio16.com'])
        self.assertEqual(fuente, 'Google News')
        self.assertEqual(len(peticiones), 3)  # WP y scraping fallan antes de GN.
        self.assertEqual([(n['dominio'], n['titular'], n['_host'], n['enlace']) for n in noticias],
                         [('cambio16.com', titulo, 'news.google.com', enlace)])
        self.comprobar(noticias, [self.publicar(noticias)])

    def test_alternativas_con_url_absoluta_y_www_sobreviven_dos_pasadas(self):
        titulo = 'El Gobierno presenta los presupuestos para el próximo ejercicio'
        noticias = self.recoger('elpais.com', ['https://www.elpais.com/espana/presupuestos.html'], titulo)
        noticias += self.recoger('telecinco.es', ['https://www.telecinco.es/noticias/presupuestos.html'], titulo)
        noticias += self.recoger('as.com', ['https://chile.as.com/actualidad/presupuestos-n/'], titulo)
        noticias += self.recoger('cambio16.com', ['https://news.google.com/rss/articles/CBMiPresupuestos'], titulo)
        primero = self.publicar(noticias)
        self.assertEqual(len(primero['noticias']), 1)
        self.assertEqual(len(primero['noticias'][0]['a']), 3)
        self.comprobar(noticias, [primero])
        self.comprobar(noticias, [self.publicar(self.releer([primero]))])

    def test_dos_dias_con_hosts_ajenos_y_subdominios_no_se_contaminan(self):
        hoy = self.recoger('telecinco.es', ['https://www.telecinco.es/noticias/hoy.html'])
        hoy += self.recoger('as.com', ['https://chile.as.com/futbol/hoy-n/'])
        ayer = self.recoger('telecinco.es', ['https://www.cuatro.com/noticias/ayer.html'], dia=1)
        ayer += self.recoger('as.com', ['https://colombia.as.com/futbol/ayer-n/'], dia=1)
        self.comprobar(hoy + ayer, [self.publicar(hoy), self.publicar(ayer, dia=1)])

    @unittest.expectedFailure  # Un único h pierde la distinción www / sin www.
    def test_varios_hosts_propios_del_mismo_medio_conservan_el_original(self):
        noticias = self.recoger('telecinco.es', ['https://www.telecinco.es/noticias/uno.html',
                                               'https://telecinco.es/noticias/dos.html'])
        self.comprobar(noticias, [self.publicar(noticias)])

    @unittest.expectedFailure  # La tabla del representante no guarda el host de la alternativa.
    def test_alternativa_sin_www_no_adquiere_www(self):
        titulo = 'El Gobierno presenta los presupuestos para el próximo ejercicio'
        noticias = self.recoger('elpais.com', ['https://www.elpais.com/espana/presupuestos.html'], titulo)
        noticias += self.recoger('telecinco.es', ['https://telecinco.es/noticias/presupuestos.html'], titulo)
        self.comprobar(noticias, [self.publicar(noticias)])

    @unittest.expectedFailure  # MEDIOS global sustituye el h de otro día antes de hidratar.
    def test_dos_dias_www_y_sin_www_conservan_sus_hosts_en_el_front(self):
        hoy = self.recoger('telecinco.es', ['https://www.telecinco.es/noticias/hoy.html'])
        ayer = self.recoger('telecinco.es', ['https://telecinco.es/noticias/ayer.html'], dia=1)
        self.comprobar(hoy + ayer, [self.publicar(hoy), self.publicar(ayer, dia=1)])
