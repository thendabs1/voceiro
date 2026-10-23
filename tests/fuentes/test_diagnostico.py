"""El diagnóstico debe distinguir estructura, extracción vacía y fallo real."""
import argparse
import contextlib
import io
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

import diagnosticar_dominio as D
import salud_fuentes as S
from test_recolector import MEDIO, items, respuesta


class Diagnostico(unittest.TestCase):
    def test_descubre_atom_relativo_sin_duplicados_y_jsonld_anidado(self):
        html = '''<title>Portada</title><article><h2>Noticia</h2><time>Hoy</time></article>
        <link rel="alternate" type="application/atom+xml" href="../atom.xml">
        <link rel="alternate" type="application/atom+xml" href="../atom.xml">
        <link rel="alternate" type="application/rss+xml" href="javascript:alert(1)">
        <script type="application/ld+json">{"@graph":[{"@type":["NewsArticle","Article"]}]}</script>
        <script type="application/ld+json">roto</script>'''
        estructura = D.inspeccionar(html, 'https://ejemplo.test/seccion/')
        self.assertEqual(estructura['feeds_descubiertos'], [('rss', 'https://ejemplo.test/atom.xml')])
        self.assertEqual(estructura['jsonld_tipos'], ['Article', 'NewsArticle'])
        self.assertEqual(estructura['jsonld_invalidos'], 1)
        self.assertEqual(estructura['etiquetas']['article'], 1)

    def test_dominio_nuevo_prueba_scrape_y_feed_descubierto(self):
        r = respuesta(b'<link rel="alternate" type="application/rss+xml" href="/feed">')
        with patch.object(D, 'todos_los_medios', return_value=[]), patch.object(D.fuentes.SESSION, 'get', return_value=r), patch.object(D, 'probar', return_value={'estado': 'ok'}) as probar:
            informe = D.diagnosticar('https://ejemplo.test/')
        self.assertEqual([c.args[1] for c in probar.call_args_list],
                         [('scrape', 'https://ejemplo.test/'), ('rss', 'https://ejemplo.test/feed')])
        self.assertEqual(informe['http']['estado'], 200)

    def test_pagina_caida_no_impide_probar_fuentes_catalogadas(self):
        with patch.object(D, 'todos_los_medios', return_value=[MEDIO]), patch.object(D.fuentes.SESSION, 'get', side_effect=TimeoutError()), patch.object(D, 'probar', return_value={'estado': 'vacío'}) as probar:
            informe = D.diagnosticar('https://ejemplo.test/')
        self.assertIn('TimeoutError', informe['error_pagina'])
        self.assertEqual(probar.call_count, 3)

    def test_limite_evita_barridos_sin_tope(self):
        with patch.object(D, 'todos_los_medios', return_value=[MEDIO]), patch.object(D.fuentes.SESSION, 'get', return_value=respuesta()), patch.object(D, 'probar', return_value={'estado': 'vacío'}) as probar:
            informe = D.diagnosticar('https://ejemplo.test/', limite=2)
        self.assertEqual(probar.call_count, 2)
        self.assertEqual(informe['fuentes_omitidas'], 1)

    def test_tipo_explicito_no_descarga_portada(self):
        with patch.object(D.fuentes.SESSION, 'get', side_effect=AssertionError('No descargar')), patch.object(D, 'probar', return_value={'estado': 'ok'}) as probar:
            D.diagnosticar('https://ejemplo.test/news.xml', tipo='sitemap')
        self.assertEqual(probar.call_args.args[1], ('sitemap', 'https://ejemplo.test/news.xml'))

    def test_url_invalida_se_rechaza(self):
        for url in ('ejemplo.test', 'file:///etc/passwd', 'https://usuario:clave@ejemplo.test'):
            with self.subTest(url=url), self.assertRaises(argparse.ArgumentTypeError):
                D.url_http(url)

    def test_salud_distingue_escasez_y_antiguedad_y_limita_muestras(self):
        for cantidad, dias, estado in ((2, 0, 'pocos'), (5, 0, 'ok'), (5, 5, 'rancia')):
            lote = items(cantidad)
            fecha = (datetime.now(S.config.TZ_MADRID) - timedelta(days=dias)).isoformat()
            for it in lote:
                it['fecha_pub'] = fecha
            with self.subTest(estado=estado), patch.object(S.fuentes, '_probar_fuente', return_value=(lote, 'ok')):
                fila = S.probar(MEDIO, ('rss', 'https://ejemplo.test/feed'), muestras=1)
            self.assertEqual(fila['estado'], estado)
            self.assertEqual(fila['con_fecha'], cantidad)
            self.assertEqual(len(fila['muestras']), 1)

    def test_salud_rechaza_filtro_vacio_invalido_o_sin_fuentes(self):
        for argumentos in (['--tipos', 'inexistente'], ['--dominios', 'desconocido.test'], ['--tipos', 'wp']):
            with self.subTest(args=argumentos), patch('sys.argv', ['salud_fuentes.py', *argumentos]), patch.object(S, 'todos_los_medios', return_value=[MEDIO]), contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as exc:
                S.main()
            self.assertEqual(exc.exception.code, 2)

    def test_salud_modo_estricto_y_exportacion_de_fallos(self):
        with tempfile.TemporaryDirectory() as carpeta:
            destino = Path(carpeta) / 'salud.json'
            with patch('sys.argv', ['salud_fuentes.py', '--tipos', 'rss', '--json', str(destino), '--exigir-ok']), patch.object(S, 'todos_los_medios', return_value=[MEDIO]), patch.object(S.fuentes, '_probar_fuente', return_value=(None, 'HTTP 403')), patch.dict(S.os.environ, {'GITHUB_STEP_SUMMARY': str(Path(carpeta) / 'resumen.md')}), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(S.main(), 1)
            self.assertIn('HTTP 403', destino.read_text())
            self.assertIn('HTTP 403', (Path(carpeta) / 'resumen.md').read_text())

    def test_cli_exporta_informe_aunque_no_haya_fuentes_validas(self):
        with tempfile.TemporaryDirectory() as carpeta:
            destino = Path(carpeta) / 'diagnostico.json'
            for estado, codigo in (('vacío', 1), ('pocos', 1), ('ok', 0)):
                with self.subTest(estado=estado), patch('sys.argv', ['diagnosticar_dominio.py', 'https://ejemplo.test/', '--json', str(destino)]), patch.object(D, 'diagnosticar', return_value={'fuentes': [{'estado': estado}]}), contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(D.main(), codigo)
                self.assertIn(estado, destino.read_text())
