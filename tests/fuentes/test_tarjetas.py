"""Fechas y noticias de tarjetas concretas, sin herencias entre artículos."""
import json
import unittest
from unittest.mock import patch

from cosecha import fuentes, texto
from test_recolector import TITULO, respuesta


class Tarjetas(unittest.TestCase):
    def extraer(self, dominio, html):
        with patch.object(fuentes.SESSION, 'get', return_value=respuesta(html.encode())):
            items, estado = fuentes._scrape({'d': dominio, 'n': dominio})
        self.assertEqual(estado, 'ok')
        return {i['enlace']: i for i in items}

    def test_crtvg_asocia_titulo_enlace_y_dia_y_excluye_navegacion(self):
        html = f'''<p>01/01/2000</p>
        <a href="/portal-transparencia-institucional">Portal de transparencia institucional</a>
        <div class="journal-content-article" data-analytics-asset-title="{TITULO}">
          <div><p>24/10/2026</p><p>Resumen de la noticia</p></div>
          <div><a href="/-/nova-emisi%C3%B3n-da-television">Ver noticia</a></div>
        </div>
        <div class="journal-content-article" data-analytics-asset-title="{TITULO} dos">
          <p>23/10/2026</p><a href="/-/segunda-noticia-da-television">Ver noticia</a>
        </div>
        <div class="journal-content-article" data-analytics-asset-title="{TITULO} tres">
          <a href="/-/tercera-noticia-sin-dia">Ver noticia</a>
        </div>'''
        items = self.extraer('crtvg.gal', html)
        self.assertEqual(len(items), 3)
        a = items['https://crtvg.gal/-/nova-emisi%C3%B3n-da-television']
        self.assertEqual((a['titular'], a['fecha_pub'], a['dia_pub']),
                         (TITULO, '', '2026-10-24'))
        self.assertEqual(items['https://crtvg.gal/-/segunda-noticia-da-television']['dia_pub'],
                         '2026-10-23')
        self.assertEqual(items['https://crtvg.gal/-/tercera-noticia-sin-dia']['dia_pub'], '')

    def test_viejo_topo_dia_de_firma_sin_autor_categoria_ni_otra_tarjeta(self):
        html = f'''<div>
        <header class="article-header"><p class="byline">
          <a href="/categoria/">Españas</a> 24 octubre, 2026 <a href="/autor/">Firma</a>
          </p><h4><a href="/topoexpress/noticia-del-presupuesto">{TITULO}</a></h4></header>
        <header class="article-header"><p class="byline"><a>23 octubre, 2026</a></p>
          <h4><a href="/topoexpress/otra-noticia-del-presupuesto">{TITULO} dos</a></h4></header>
        <header class="article-header"><h4><a href="/libro/novedad-del-catalogo">{TITULO} libro</a></h4></header>
        </div>'''
        items = self.extraer('elviejotopo.com', html)
        self.assertEqual(len(items), 2)
        a = items['https://elviejotopo.com/topoexpress/noticia-del-presupuesto']
        self.assertEqual((a['fecha_pub'], a['dia_pub']), ('', '2026-10-24'))
        self.assertEqual(items['https://elviejotopo.com/topoexpress/otra-noticia-del-presupuesto']['dia_pub'], '')

    def test_fusion_fecha_propia_prioriza_primera_publicacion_y_respeta_url(self):
        ruta = '/politica/noticia-del-presupuesto'
        estado = {'coleccion': {
            'publish_date': '2026-10-24T15:00:00Z',
            'items': [
                {'type': 'story', 'canonical_url': ruta,
                 'first_publish_date': '2026-10-23T10:00:00Z',
                 'publish_date': '2026-10-24T12:00:00Z',
                 'last_updated_date': '2026-10-24T14:00:00Z'},
                {'type': 'story', 'canonical_url': '/politica/otra-noticia-del-presupuesto',
                 'publish_date': '2026-10-22T10:00:00Z'},
                {'type': 'story', 'canonical_url': 'https://otro.test/politica/tercera-noticia',
                 'publish_date': '2026-10-21T10:00:00Z'},
                {'type': 'story', 'canonical_url': '/politica/tercera-noticia',
                 'last_updated_date': '2026-10-24T14:00:00Z'},
            ]}}
        html = (f'<h2><a href="{ruta}">{TITULO}</a></h2>'
                f'<h2><a href="/politica/otra-noticia-del-presupuesto">{TITULO} dos</a></h2>'
                f'<h2><a href="/politica/tercera-noticia">{TITULO} tres</a></h2>'
                f'<script>var Fusion = {{}}; Fusion.contentCache = {json.dumps(estado)};'
                'throw new Error("No ejecutar JavaScript");</script>')
        items = self.extraer('estadao.com.br', html)
        self.assertEqual(items['https://estadao.com.br' + ruta]['fecha_pub'],
                         '2026-10-23T12:00:00+02:00')
        self.assertEqual(items['https://estadao.com.br/politica/otra-noticia-del-presupuesto']['fecha_pub'],
                         '2026-10-22T12:00:00+02:00')
        self.assertEqual(items['https://estadao.com.br/politica/tercera-noticia']['fecha_pub'], '')

    def test_fusion_roto_no_impide_extraer_titulares(self):
        html = (f'<h2><a href="/politica/noticia-del-presupuesto">{TITULO}</a></h2>'
                '<script>Fusion.contentCache = JSON.parse("otro formato");</script>')
        items = self.extraer('estadao.com.br', html)
        self.assertEqual(next(iter(items.values()))['fecha_pub'], '')

    def test_praza_excluye_referencias_y_temas_sin_perder_fecha_propia(self):
        html = f'''<header class="article-summary-header">
          <h2 class="article-summary-headline"><a href="/politica/noticia-reciente">{TITULO}</a></h2>
          <time datetime="2026-10-24T10:00:00Z"></time>
          <div><h3 class="ref-title"><a href="/politica/referencia-de-archivo">{TITULO} archivo</a></h3></div>
        </header><h2><a href="/temas/tema-del-presupuesto">{TITULO} tema</a></h2>
        <header class="article-opinion-summary-header">
          <h2 class="article-opinion-summary-headline"><a href="/opinion/articulo-reciente">{TITULO} opinión</a></h2>
          <time datetime="2026-10-23T10:00:00Z"></time>
        </header>'''
        items = self.extraer('praza.gal', html)
        self.assertEqual(len(items), 2)
        self.assertEqual(items['https://praza.gal/politica/noticia-reciente']['fecha_pub'],
                         '2026-10-24T12:00:00+02:00')
        self.assertEqual(items['https://praza.gal/opinion/articulo-reciente']['fecha_pub'],
                         '2026-10-23T12:00:00+02:00')

    def test_orain_acepta_host_oficial_y_excluye_portales_sin_dia(self):
        html = f'''<h2><a href="https://orain.eus/eu/aktualitatea/2026/10/24/noticia-del-dia/">{TITULO}</a></h2>
        <h2><a href="https://orain.eus/eu/politika/hauteskundeak/">{TITULO} portal</a></h2>
        <h2><a href="https://orain.eus.otro.test/2026/10/24/noticia-del-dia/">{TITULO} ajeno</a></h2>'''
        items = self.extraer('eitb.eus', html)
        self.assertEqual(len(items), 1)
        self.assertEqual(next(iter(items.values()))['dia_url'], '2026-10-24')
        self.assertFalse(texto._es_valido(TITULO, 'https://orain.eus/noticia', 'ejemplo.test'))

    def test_xinhua_inglesa_admite_ruta_numerica_y_descarta_navegacion_y_ajenos(self):
        url = 'https://english.news.cn/20261024/abc123/c.html'
        html = (f'<a href="{url}">{TITULO}</a><a href="{url}"><img/></a>'
                f'<a href="https://english.news.cn/section/world.htm">{TITULO} sección</a>'
                f'<a href="https://otro.test/20261024/abc123/c.html">{TITULO} ajeno</a>')
        items = self.extraer('xinhuanet.com', html)
        self.assertEqual(list(items), [url])
        self.assertEqual(items[url]['dia_url'], '2026-10-24')
        self.assertEqual(items[url]['fecha_pub'], '')

    def test_rss_galicia_digital_excluye_dia_futuro_y_conserva_dia_sin_hora(self):
        xml = '<rss><channel>'
        for dia in ('2205-12-23 +0200', '2026-10-23 +0200'):
            xml += (f'<item><title>{TITULO}</title><link>https://www.galiciadigital.com/noticia.1.php</link>'
                    f'<pubDate>{dia}</pubDate></item>')
        xml += '</channel></rss>'
        with patch.object(fuentes.SESSION, 'get', return_value=respuesta(xml.encode())):
            items, estado = fuentes._rss({'d': 'galiciadigital.com', 'n': 'Galicia Digital'}, 'https://www.galiciadigital.com/_feed/index.rss')
        self.assertEqual(estado, 'ok')
        self.assertEqual(len(items), 1)
        self.assertEqual((items[0]['fecha_pub'], items[0]['dia_pub']), ('', '2026-10-23'))


if __name__ == '__main__':
    unittest.main()
