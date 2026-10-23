"""Regresiones de publicación: caché coherente y frontend de reserva."""

import os
from pathlib import Path
import re
import shutil
import tempfile
import unittest
from unittest.mock import patch

from scripts.generar_front import generar_html


RAIZ = Path(__file__).resolve().parents[2]


class PublicacionFrontend(unittest.TestCase):
    def setUp(self):
        self.temporal = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporal.cleanup)
        self.raiz = Path(self.temporal.name)
        for carpeta in ('front', 'shared'):
            shutil.copytree(RAIZ / carpeta, self.raiz / carpeta)
        shutil.copyfile(RAIZ / 'plantilla.html', self.raiz / 'plantilla.html')

    def versiones(self):
        public = self.raiz / 'public'
        html = (public / 'index.html').read_text()
        referencias = re.findall(r'(?:src|href)=[\'"]\./(?:app\.js|estilos\.css)\?v=([a-f0-9]+)', html)
        self.assertEqual(len(referencias), 2)
        versiones = set(referencias)
        for ruta in public.rglob('*.js'):
            imports = re.findall(r'''(?:from|import)\s*\(?\s*['"](\.{1,2}/[^'"]+\.js)\?v=([a-f0-9]+)['"]''', ruta.read_text())
            for destino, version in imports:
                self.assertTrue((ruta.parent / destino).is_file(), f'{ruta}: {destino}')
                versiones.add(version)
        self.assertEqual(len(versiones), 1)
        return versiones.pop()

    def test_cambios_en_estilos_idiomas_o_aplicacion_invalidan_la_cache(self):
        generar_html(raiz=self.raiz)
        anterior = self.versiones()
        for ruta in ('front/estilos/01-base-cabecera.css',
                     'front/idiomas/es.js', 'front/app/99-inicio.js'):
            with self.subTest(ruta=ruta):
                fuente = self.raiz / ruta
                fuente.write_text(fuente.read_text() + '\n/* Cambio de versión */\n')
                generar_html(raiz=self.raiz)
                actual = self.versiones()
                self.assertNotEqual(actual, anterior)
                anterior = actual

    def test_publicacion_conserva_codigo_estilos_y_diccionarios(self):
        generar_html(raiz=self.raiz)
        public = self.raiz / 'public'
        front = self.raiz / 'front'

        def sin_version(texto):
            return re.sub(r'''(\.{1,2}/[^'"?]+\.js)\?v=[a-f0-9]{10}''', r'\1', texto)

        # Una comprobación del ensamblado permite ejecutar cada prueba de
        # comportamiento una sola vez, sobre sus fuentes.
        aplicacion = ''.join(p.read_text() for p in sorted((front / 'app').glob('*.js')))
        generado = (public / 'app.js').read_text().partition('\n')[2]
        self.assertEqual(sin_version(generado), aplicacion)
        estilos = (self.raiz / 'shared/tema/paleta.css').read_text()
        estilos += ''.join(p.read_text() for p in sorted((front / 'estilos').glob('*.css')))
        self.assertEqual((public / 'estilos.css').read_text(), estilos)
        for fuente in (front / 'vendor').glob('*'):
            self.assertEqual((public / 'vendor' / fuente.name).read_bytes(), fuente.read_bytes())
        self.assertIn('./vendor/qrcode-1.4.4.js?v=', generado)
        for fuente in (front / 'idiomas').glob('*.js'):
            self.assertEqual(sin_version((public / 'idiomas' / fuente.name).read_text()),
                             fuente.read_text())

    def test_congelar_front_conserva_html_estilos_y_modulos_anteriores(self):
        generar_html(raiz=self.raiz)
        public = self.raiz / 'public'
        anteriores = {p.relative_to(public): p.read_bytes() for p in public.rglob('*') if p.is_file()}
        css = self.raiz / 'front/estilos/01-base-cabecera.css'
        css.write_text(css.read_text() + '\nbody { color: red }\n')
        with patch.dict(os.environ, {'VOCEIRO_FRONT_CONGELADO': '1'}):
            generar_html(raiz=self.raiz)
        actuales = {p.relative_to(public): p.read_bytes() for p in public.rglob('*') if p.is_file()}
        self.assertEqual(actuales, anteriores)
