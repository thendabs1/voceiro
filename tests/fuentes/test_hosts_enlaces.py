import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest import mock

from cosecha import catalogo, config, formatos, historico
from cosecha.texto import _host_al_leer, _url_corta


class HostsDeEnlaces(unittest.TestCase):
    def test_solo_se_acorta_el_host_del_medio(self):
        self.assertEqual(_url_corta('https://www.as.com/a?b=1', 'as.com'), '/a?b=1')
        self.assertEqual(_url_corta('https://as.com/a', 'as.com'), '/a')
        self.assertEqual(_url_corta('https://chile.as.com/a', 'as.com'), 'https://chile.as.com/a')
        self.assertEqual(_url_corta('https://news.google.com/a', 'as.com'), 'https://news.google.com/a')

    def test_tablas_ignoran_hosts_ajenos_y_subdominios(self):
        items = [{'dominio': 'telecinco.es', '_host': 'www.cuatro.com'},
                 {'dominio': 'telecinco.es', '_host': 'www.telecinco.es'},
                 {'dominio': 'as.com', '_host': 'chile.as.com'}]
        for tabla in (catalogo._tabla_medios_slice(items), formatos._tabla_medios_de(items)):
            self.assertEqual(tabla['telecinco.es']['h'], 'www.telecinco.es')
            self.assertNotIn('h', tabla['as.com'])

    def test_lectura_descarta_host_ajeno_y_conserva_subdominio(self):
        self.assertEqual(_host_al_leer('news.google.com', 'cambio16.com'), 'www.cambio16.com')
        self.assertEqual(_host_al_leer('', 'cambio16.com'), 'www.cambio16.com')
        self.assertEqual(_host_al_leer('rurales.elpais.com.uy', 'elpais.com.uy'), 'rurales.elpais.com.uy')
        self.assertEqual(_host_al_leer('es.motorsport.com', 'es.motorsport.com'), 'es.motorsport.com')

    def test_relectura_recupera_subdominio_y_corrige_host_ajeno(self):
        tabla = {'elpais.com.uy': {'h': 'rurales.elpais.com.uy'}, 'cambio16.com': {'h': 'news.google.com'}}
        dia = datetime.now(config.TZ_MADRID).date().isoformat()
        fichero = {'fecha': dia, 'generado': f'{dia}T10:00:00+01:00', 'medios': tabla, 'noticias': [
            {'d': 'elpais.com.uy', 't': 'A', 'u': '/a', 'f': 'RSS'},
            {'d': 'cambio16.com', 't': 'B', 'u': '/b', 'f': 'RSS'}]}
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, 'dia.json').write_text(json.dumps(fichero), encoding='utf-8')
            inventario = Path(tmp, 'inventario.json')
            inventario.write_text(json.dumps({'dias': [{'fecha': dia, 'all': {'file': 'dia.json'}}]}), encoding='utf-8')
            with mock.patch.multiple(config, DATOS_DIR=tmp, INVENTARIO_PATH=str(inventario),
                                     STATE_PATH=str(Path(tmp, 'state.json'))):
                leidas = historico.cargar_historico_payload()['noticias']
        enlaces = {n['dominio']: n['enlace'] for n in leidas}
        self.assertEqual(enlaces['elpais.com.uy'], 'https://rurales.elpais.com.uy/a')
        self.assertEqual(enlaces['cambio16.com'], 'https://cambio16.com/b')


if __name__ == '__main__':
    unittest.main()
