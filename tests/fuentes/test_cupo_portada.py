"""La portada da espacio a los medios menos prolíficos dentro del límite."""
from datetime import datetime, timedelta
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from cosecha import config, publicacion
from medios import todos_los_medios


class CupoPortada(unittest.TestCase):
    def test_un_feed_abundante_no_expulsa_a_los_demas_medios(self):
        ahora = datetime.now(config.TZ_MADRID).replace(microsecond=0)
        medios = {m['d']: m for m in todos_los_medios()}
        noticias = []
        for d, cantidad in [('as.com', 8), ('marca.com', 2), ('praza.gal', 1)]:
            for i in range(cantidad):
                fecha = ahora - timedelta(minutes=len(noticias) + 1)
                noticias.append({'dominio': d, 'medio': medios[d]['n'], 'grupo': medios[d]['grupo'],
                                  'titular': f'Noticias de {d} sobre el presupuesto {i}',
                                  'enlace': f'https://{d}/noticias/{i}', '_host': d,
                                  'fecha_pub': fecha.isoformat(), 'fecha': fecha.isoformat()})
        with tempfile.TemporaryDirectory() as tmp, patch.object(config, 'DATOS_DIR', tmp), \
                patch.object(publicacion, '_FICHEROS_ESCRITOS', set()):
            for limite, esperados in [(5, {'as.com': 2, 'marca.com': 2, 'praza.gal': 1}),
                                      (2, {'as.com': 1, 'marca.com': 1}),
                                      (20, {'as.com': 8, 'marca.com': 2, 'praza.gal': 1})]:
                with self.subTest(limite=limite):
                    info = publicacion.generar_portada(noticias, ahora, max_items=limite)
                    payload = json.loads(Path(tmp, info['file']).read_text())
                    por_medio = {d: [n['u'] for n in payload['noticias'] if n['d'] == d]
                                 for d in esperados}
                    self.assertEqual({d: len(u) for d, u in por_medio.items()}, esperados)
                    self.assertEqual(len(payload['noticias']), sum(esperados.values()))
                    for urls in por_medio.values():
                        self.assertEqual(urls, [f'/noticias/{i}' for i in range(len(urls))])
