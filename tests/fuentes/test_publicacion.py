"""Integración de los módulos de cosecha: publicar, reutilizar y releer."""

import contextlib
from datetime import datetime, timedelta
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from cosecha import catalogo, config, formatos, historico, publicacion


class PublicacionLocal(unittest.TestCase):
    def test_portada_slices_indices_y_state_conservan_noticias_entre_runs(self):
        ahora = datetime.now(config.TZ_MADRID).replace(hour=12, minute=0, second=0, microsecond=0)
        recogida = (ahora - timedelta(minutes=10)).isoformat()
        medios = {
            'a.test': {'n': 'A', 'grupo': 'Pruebas', 'type': 'diario', 'lang': 'es'},
            'b.test': {'n': 'B', 'grupo': 'Pruebas', 'type': 'diario', 'lang': 'es'},
        }
        noticias = [{
            'dominio': d, 'medio': m['n'], 'grupo': m['grupo'], 'tipo': m['type'],
            'lang': 'es', 'titular': 'El municipio aprueba el presupuesto',
            'enlace': f'https://{d}/noticia', 'fuente': 'RSS',
            'fecha_pub': (ahora - timedelta(hours=1)).isoformat(), 'fecha': recogida,
        } for d, m in medios.items()]
        with tempfile.TemporaryDirectory() as temporal, \
                patch.multiple(config, DATOS_DIR=temporal,
                               MANIFEST_PATH=str(Path(temporal, 'manifest.json')),
                               INVENTARIO_PATH=str(Path(temporal, 'inventario.json')),
                               STATE_PATH=str(Path(temporal, 'state.json'))), \
                patch.object(catalogo, '_MEDIOS_POR_DOMINIO', medios), \
                patch.object(publicacion, '_FICHEROS_ESCRITOS', set()), \
                contextlib.redirect_stdout(io.StringIO()):
            portada = publicacion.generar_portada(noticias, ahora)
            inv = publicacion.generar_troceados(noticias, ahora, portada)
            historico.guardar_state(ahora.isoformat(), {'a.test': recogida})
            manifest = json.loads(Path(config.MANIFEST_PATH).read_text())
            self.assertEqual(manifest['catalogo']['b.test']['n'], 'B')
            self.assertEqual(manifest['guardado']['n'], 1)  # una noticia, dos medios
            self.assertEqual(portada['n'], 1)
            self.assertEqual(set(inv['dias'][0]['dominios']), {'a.test', 'b.test'})
            self.assertTrue(all(Path(temporal, f).is_file()
                                for f in formatos._ficheros_de_inventario(inv)))

            releidas = historico.cargar_historico_payload()
            self.assertEqual(releidas['ultimo_exito_por_medio'], {'a.test': recogida})
            self.assertEqual({n['enlace'] for n in releidas['noticias']},
                             {'https://a.test/noticia', 'https://www.b.test/noticia'})
            self.assertTrue(all(n['fecha'] == recogida for n in releidas['noticias']))

            publicacion._FICHEROS_ESCRITOS.clear()
            despues = ahora + timedelta(minutes=5)
            portada2 = publicacion.generar_portada(noticias, despues)
            inv2 = publicacion.generar_troceados(noticias, despues, portada2, inventario_prev=inv)
            self.assertEqual(portada2['file'], portada['file'])
            self.assertEqual(inv2['dias'], inv['dias'])
            self.assertEqual({Path(p).name for p in publicacion._FICHEROS_ESCRITOS},
                             {'manifest.json', 'inventario.json'})
