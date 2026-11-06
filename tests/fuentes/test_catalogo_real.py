"""Invariantes del catálogo de producción; ningún catálogo de juguete."""
from collections import Counter
import unittest
from urllib.parse import urlsplit

from medios import MEDIA_CATALOG, todos_los_medios
from cosecha import catalogo, config


# Un feed puede vivir fuera de d. Estas excepciones identifican al proveedor,
# no autorizan a reconstruir los enlaces de sus artículos con ese host.
HOSTS_DE_FUENTE_EXTERNOS = {
    ('marca.com', 'e00-marca.uecdn.es'): 'CDN de Unidad Editorial',
    ('expansion.com', 'e00-expansion.uecdn.es'): 'CDN de Unidad Editorial',
    ('elmundo.es', 'e00-elmundo.uecdn.es'): 'CDN de Unidad Editorial',
    ('cincodias.com', 'feeds.elpais.com'): 'Feed del grupo El País',
    ('applesfera.com', 'feeds.weblogssl.com'): 'Feed de Weblogs',
    ('genbeta.com', 'feeds.weblogssl.com'): 'Feed de Weblogs',
    ('xataka.com', 'feeds.weblogssl.com'): 'Feed de Weblogs',
    ('xatakaciencia.com', 'feeds.weblogssl.com'): 'Feed de Weblogs',
    ('libertaddigital.com', 'feeds.feedburner.com'): 'Agregador FeedBurner',
    ('biobiochile.cl', 'feeds.feedburner.com'): 'Agregador FeedBurner',
    ('elnuevoherald.com', 'feeds.mcclatchy.com'): 'Feed de McClatchy',
    ('bbc.com', 'feeds.bbci.co.uk'): 'Feed de BBC',
    ('324.cat', 'api.3cat.cat'): 'API de 3Cat',
    ('invertia.com', 'www.elespanol.com'): 'Sección de El Español',
    ('elandroidelibre.elespanol.com', 'www.elespanol.com'): 'Sección de El Español',
    ('computerhoy.com', 'computerhoy.20minutos.es'): 'Edición en 20 Minutos',
    ('quo.es', 'quo.eldiario.es'): 'Edición en elDiario',
    ('eitb.eus', 'orain.eus'): 'Portal asociado de EITB',
    ('xinhuanet.com', 'english.news.cn'): 'Portal asociado de Xinhua',
    ('abcnews.com', 'abcnews.go.com'): 'Portal de ABC News',
    ('businessinsider.com', 'www.businessinsider.es'): 'Edición española',
    ('edition.cnn.com', 'www.cnn.com'): 'Sitemap de CNN',
    ('dailymail.co.uk', 'www.dailymail.com'): 'Edición .com',
}


class CatalogoReal(unittest.TestCase):
    def test_dominios_unicos_y_metadatos_publicables(self):
        originales = [m for g in MEDIA_CATALOG for m in g['items']]
        duplicados = {d: n for d, n in Counter(m['d'] for m in originales).items() if n > 1}
        self.assertEqual(duplicados, {})
        publicados = catalogo._catalogo_completo()
        self.assertEqual(set(publicados), {m['d'] for m in originales})
        for medio in todos_los_medios():
            d = medio['d']
            with self.subTest(d=d):
                self.assertRegex(d, r'^(?:[a-z0-9]+(?:-[a-z0-9]+)*\.)+[a-z]{2,}$')
                self.assertFalse(d.startswith('www.'))
                self.assertTrue(medio['n'].strip())
                self.assertIn(medio['lang_principal'], medio['langs'])
                self.assertEqual(publicados[d]['n'], medio['n'])
                self.assertEqual(publicados[d]['g'], medio['grupo'])
                self.assertEqual(publicados[d]['t'], medio['type'])
                self.assertEqual(publicados[d]['l'], medio['lang_principal'])
                self.assertEqual(publicados[d]['tags'], medio['tags'])

    def test_fuentes_con_tipo_argumentos_y_urls_validos(self):
        for medio in todos_los_medios():
            with self.subTest(d=medio['d']):
                self.assertTrue(medio['fuentes'])
                for fuente in medio['fuentes']:
                    self.assertIsInstance(fuente, tuple)
                    tipo, *args = fuente
                    self.assertIn(tipo, {'rss', 'sitemap', 'scrape', 'wp', 'gn'})
                    if tipo == 'wp':
                        self.assertEqual(args, [])
                    elif tipo == 'gn':
                        self.assertLessEqual(len(args), 1)
                        self.assertTrue(all(isinstance(q, str) and q.strip() for q in args))
                    else:
                        self.assertLessEqual(len(args), 2)
                        if tipo != 'scrape':
                            self.assertTrue(args)
                        if args:
                            self.assertIsInstance(args[0], str)
                            url = urlsplit(args[0])
                            self.assertIn(url.scheme, {'http', 'https'})
                            self.assertTrue(url.hostname)
                            self.assertIsNone(url.username)
                            self.assertIsNone(url.password)
                        if len(args) == 2:
                            self.assertIn(args[1], {'relay', 'noverify'} if tipo == 'scrape' else {'relay'})

    def test_hosts_de_fuente_coherentes_con_d_o_excepcion_explicita(self):
        excepciones_usadas = set()
        for medio in todos_los_medios():
            for fuente in medio['fuentes']:
                if fuente[0] not in {'rss', 'sitemap', 'scrape'} or len(fuente) == 1:
                    continue
                host = urlsplit(fuente[1]).hostname
                d = medio['d']
                if host == d or host.endswith('.' + d):
                    continue
                with self.subTest(d=d, fuente=fuente):
                    self.assertIn((d, host), HOSTS_DE_FUENTE_EXTERNOS)
                excepciones_usadas.add((d, host))
        self.assertEqual(excepciones_usadas, set(HOSTS_DE_FUENTE_EXTERNOS))

    def test_ediciones_seleccionan_por_catalogo_y_no_por_host_del_articulo(self):
        noticias = [{'dominio': d, 'enlace': url} for d, url in [
            ('telecinco.es', 'https://www.cuatro.com/noticias/a.html'),
            ('as.com', 'https://chile.as.com/futbol/a-n/'),
            ('praza.gal', 'https://praza.gal/politica/a'),
            ('elpais.com.uy', 'https://rurales.elpais.com.uy/agro/a'),
            ('desconocido.es', 'https://desconocido.es/a'),
        ]]
        for edicion, esperados in [('nac', {'telecinco.es', 'as.com'}),
                                   ('gal', {'praza.gal'}), ('int', {'elpais.com.uy'})]:
            with self.subTest(edicion=edicion):
                seleccion = catalogo._filtrar_edicion(noticias, config.EDICIONES[edicion])
                self.assertEqual({n['dominio'] for n in seleccion}, esperados)
