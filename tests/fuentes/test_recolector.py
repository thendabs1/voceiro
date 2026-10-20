"""Regresiones de extracción y alternativas, sin red ni escrituras de datos."""
import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

import recolector as R

MEDIO = {'d': 'ejemplo.test', 'n': 'Ejemplo', 'grupo': 'Pruebas',
         'fuentes': [('rss', 'https://ejemplo.test/feed'), ('scrape',), ('gn',)]}
TITULO = 'El municipio aprueba un nuevo presupuesto para el próximo año'


def respuesta(contenido=b'', **extras):
    return SimpleNamespace(status_code=200, content=contenido,
                           text=contenido.decode(), url='https://ejemplo.test/',
                           headers={'content-type': 'text/html'}, **extras)


def items(n):
    return [{'titular': f'{TITULO} {i}', 'enlace': f'https://ejemplo.test/{i}',
             'fecha_pub': ''} for i in range(n)]


class Extraccion(unittest.TestCase):
    def setUp(self):
        # Cualquier petición que no esté simulada debe fallar inmediatamente.
        self.red = patch.object(R.SESSION, 'get', side_effect=AssertionError('Red no permitida'))
        self.red.start()
        self.addCleanup(self.red.stop)

    def test_rss_y_atom_conservan_titulo_enlace_y_instante(self):
        for xml in (
            f'<rss><channel><item><title>{TITULO}</title><link>https://ejemplo.test/a</link>'
            '<pubDate>Tue, 20 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>',
            f'<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>{TITULO}</title>'
            '<link href="https://ejemplo.test/a"/><updated>2026-10-20T10:00:00Z</updated></entry></feed>',
        ):
            with self.subTest(xml=xml[:20]):
                extraidos = R._parse_feed(xml.encode())
                self.assertEqual(len(extraidos), 1)
                self.assertEqual(extraidos[0]['titular'], TITULO)
                self.assertEqual(extraidos[0]['enlace'], 'https://ejemplo.test/a')
                self.assertEqual(datetime.fromisoformat(extraidos[0]['fecha_pub']).timestamp(),
                                 datetime.fromisoformat('2026-10-20T10:00:00+00:00').timestamp())

    def test_feed_recupera_xml_si_feedparser_no_extrae(self):
        xml = f'<rss><channel><item><title>{TITULO}</title><link>https://ejemplo.test/a</link></item></channel></rss>'
        with patch.object(R.feedparser, 'parse', return_value=SimpleNamespace(entries=[])):
            self.assertEqual(R._parse_feed(xml.encode())[0]['titular'], TITULO)

    def test_html_de_bloqueo_no_es_feed(self):
        self.assertEqual(R._parse_feed(b'<html><title>Access denied</title></html>'), [])

    def test_sitemap_indice_elige_news_y_ordena_noticias(self):
        indice = b'<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://ejemplo.test/pages.xml</loc></sitemap><sitemap><loc>https://ejemplo.test/news.xml</loc></sitemap></sitemapindex>'
        noticias = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:n="http://www.google.com/schemas/sitemap-news/0.9">'
        for dia in ('19', '20'):
            noticias += f'<url><loc>https://ejemplo.test/{dia}</loc><n:news><n:title>{TITULO}</n:title><n:publication_date>2026-10-{dia}T10:00:00Z</n:publication_date></n:news></url>'
        noticias += '</urlset>'
        with patch.object(R.SESSION, 'get', side_effect=[respuesta(indice), respuesta(noticias.encode())]) as get:
            extraidos, estado = R._news_sitemap(MEDIO, 'https://ejemplo.test/sitemap.xml')
        self.assertEqual(estado, 'ok')
        self.assertEqual(get.call_args.args[0], 'https://ejemplo.test/news.xml')
        self.assertEqual([it['enlace'] for it in extraidos], ['https://ejemplo.test/20', 'https://ejemplo.test/19'])

    def test_scrape_deduplica_filtra_otro_dominio_y_completa_fecha_jsonld(self):
        url = 'https://ejemplo.test/nuevo-presupuesto-del-municipio'
        html = f'''<h2><a href="/nuevo-presupuesto-del-municipio">{TITULO}</a></h2>
        <a href="/nuevo-presupuesto-del-municipio">{TITULO}</a>
        <h2><a href="https://otro.test/noticia">{TITULO}</a></h2>
        <h2><a href="/contacto">Contacta con nuestra redacción</a></h2>
        <script type="application/ld+json">{{"@graph":[{{"@type":"NewsArticle","url":"{url}","datePublished":"2026-10-20T10:00:00Z"}}]}}</script>'''
        with patch.object(R.SESSION, 'get', return_value=respuesta(html.encode())):
            extraidos, estado = R._scrape(MEDIO)
        self.assertEqual(estado, 'ok')
        self.assertEqual(len(extraidos), 1)
        self.assertEqual(extraidos[0]['enlace'], url)
        self.assertEqual(extraidos[0]['fecha_pub'], '2026-10-20T12:00:00+02:00')

    def test_wp_prefiere_fecha_gmt_tambien_en_invierno(self):
        r = respuesta()
        r.json = lambda: [{'title': {'rendered': 'Presupuesto &amp; cuentas'},
                           'link': 'https://ejemplo.test/a', 'date': '2026-01-20T11:00:00',
                           'date_gmt': '2026-01-20T10:00:00'}]
        with patch.object(R.SESSION, 'get', return_value=r):
            extraidos, estado = R._wp_api(MEDIO)
        self.assertEqual(estado, 'ok')
        self.assertEqual(extraidos[0]['titular'], 'Presupuesto & cuentas')
        self.assertEqual(extraidos[0]['fecha_pub'], '2026-01-20T11:00:00+01:00')

    def test_google_news_descarta_ajenos_y_antiguos(self):
        reciente = datetime.now(R.TZ_MADRID).isoformat()
        base = items(1)[0]
        candidatos = [{**base, 'fecha_pub': reciente, 'source_url': 'https://ejemplo.test'},
                      {**base, 'fecha_pub': reciente, 'source_url': 'https://otroejemplo.test'},
                      {**base, 'fecha_pub': '2000-01-01T00:00:00Z', 'source_url': 'https://ejemplo.test'}]
        with patch.object(R.SESSION, 'get', return_value=respuesta()), patch.object(R, '_parse_gn_feed', return_value=candidatos):
            extraidos, estado = R._google_news(MEDIO)
        self.assertEqual(estado, 'ok')
        self.assertEqual(extraidos, candidatos[:1])

    def test_fallo_http_o_timeout_queda_en_estado(self):
        for respuesta_o_error, esperado in ((SimpleNamespace(status_code=403), 'HTTP 403'),
                                            (TimeoutError('sin respuesta'), 'TimeoutError')):
            with self.subTest(estado=esperado):
                with patch.object(R.SESSION, 'get', side_effect=[respuesta_o_error]):
                    self.assertEqual(R._rss(MEDIO, 'https://ejemplo.test/feed'), (None, esperado))

    def test_relay_codifica_url_completa(self):
        url = 'https://ejemplo.test/feed?a=1&b=2'
        with patch.object(R.SESSION, 'get', return_value=SimpleNamespace(status_code=403)) as get:
            R._probar_fuente(MEDIO, ('rss', url, 'relay'))
        self.assertEqual(get.call_args.args[0], R.DENO_RELAY_BASE + R.quote(url, safe=''))

    def test_fallback_tras_fallo_y_pocos_hasta_fuente_suficiente(self):
        with patch.object(R, '_probar_fuente', side_effect=[(None, 'HTTP 403'), (items(2), 'ok'), (items(5), 'ok')]) as probar:
            _, noticias, fuente, intentos = R.obtener_titulares(MEDIO)
        self.assertEqual(probar.call_count, 3)
        self.assertEqual(len(noticias), 5)
        self.assertEqual(fuente, 'Google News')
        self.assertEqual(intentos, 'RSS:HTTP 403 > Scraping:2 > Google News:ok')

    def test_no_consulta_alternativas_si_primera_es_suficiente(self):
        with patch.object(R, '_probar_fuente', return_value=(items(5), 'ok')) as probar:
            self.assertEqual(R.obtener_titulares(MEDIO)[2], 'RSS')
        self.assertEqual(probar.call_count, 1)

    def test_si_todas_son_escasas_conserva_la_mayor(self):
        with patch.object(R, '_probar_fuente', side_effect=[(items(2), 'ok'), (items(3), 'ok'), (None, 'vacío')]):
            _, noticias, fuente, _ = R.obtener_titulares(MEDIO)
        self.assertEqual(len(noticias), 3)
        self.assertEqual(fuente, 'Scraping')

    def test_todas_fallidas_no_inventa_noticias(self):
        with patch.object(R, '_probar_fuente', return_value=(None, 'vacío')):
            _, noticias, fuente, intentos = R.obtener_titulares(MEDIO)
        self.assertEqual(noticias, [])
        self.assertIsNone(fuente)
        self.assertEqual(intentos, 'RSS:vacío > Scraping:vacío > Google News:vacío')
