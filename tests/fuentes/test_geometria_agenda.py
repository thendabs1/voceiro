"""Cruces por límites: huecos, fronteras, contradicciones y procedencia, sin red."""

from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest

from shared.territorios.geometria import LimitesMunicipales
from shared.territorios import importadores
from scripts.generar_correspondencias_agenda import preparar


AHORA = '2026-10-27T09:59:56+00:00'
PRUEBA = {'fuente': 'Prueba', 'documento': 'https://ejemplo.test/catalogo',
          'sha256': 'a' * 64, 'comprobado': AHORA}


def cuadrado(x=0, y=0, lado=1):
    return [[x, y], [x + lado, y], [x + lado, y + lado], [x, y + lado], [x, y]]


def feature(codigo='01059', anillos=None):
    return {'type': 'Feature', 'properties': {'ine': codigo},
            'geometry': {'type': 'Polygon', 'coordinates': anillos or [cuadrado()]}}


def coleccion(*features):
    return {'type': 'FeatureCollection', 'features': list(features)}


def punto(lon=0.5, lat=0.5, nombre='Vitoria-Gasteiz', provincia='1'):
    return importadores.puntos_kulturklik({'items': [{
        'id': 'evento', 'municipalityNoraCode': '46', 'provinceNoraCode': provincia,
        'municipalityEs': nombre, 'municipalityLatitude': str(lat), 'municipalityLongitude': str(lon)}]}, PRUEBA)[0]


class Geometria(unittest.TestCase):
    def test_no_asigna_el_municipio_mas_cercano_y_respeta_fronteras(self):
        mapa = LimitesMunicipales(coleccion(feature()))
        self.assertEqual(mapa.resolver(0.5, 0.5)['territorio'], 'es:municipio:01059')
        for lon, lat in ((0, 0.5), (0.0001, 0.5), (-0.0001, 0.5), (1, 1)):
            r = mapa.resolver(lon, lat)
            self.assertEqual(r['estado'], 'pendiente')
            self.assertIsNone(r['territorio'])
            self.assertEqual(r['motivo'], 'cerca_del_limite')
        self.assertEqual(mapa.resolver(10, 10)['motivo'], 'fuera_de_cobertura')

    def test_huecos_islas_y_recintos_solapados(self):
        f = feature(anillos=[cuadrado(), cuadrado(0.4, 0.4, 0.2)])
        f['geometry'] = {'type': 'MultiPolygon', 'coordinates': [f['geometry']['coordinates'], [cuadrado(2, 2)]]}
        mapa = LimitesMunicipales(coleccion(f))
        self.assertIsNone(mapa.resolver(0.5, 0.5)['territorio'])
        self.assertEqual(mapa.resolver(2.5, 2.5)['territorio'], 'es:municipio:01059')
        mapa = LimitesMunicipales(coleccion(feature(), feature('01001')))
        self.assertEqual(mapa.resolver(0.5, 0.5)['estado'], 'conflicto')
        self.assertIsNone(mapa.resolver(0.5, 0.5)['territorio'])

    def test_codigos_ine_puntos_geometria_y_crs_invalidos_se_rechazan(self):
        mapa = LimitesMunicipales(coleccion(feature()))
        for punto_malo in ((True, 1), (float('nan'), 1), (0, 91), (181, 0), ('0', 0)):
            with self.subTest(punto=punto_malo), self.assertRaises(ValueError):
                mapa.resolver(*punto_malo)
        for f in (feature('1059'), feature('99999'), feature(anillos=[cuadrado()[:-1]]),
                  feature(anillos=[[[0, 0], [1, 1], [2, 2], [0, 0]]])):
            with self.assertRaises(ValueError):
                LimitesMunicipales(coleccion(f))
        with self.assertRaises(ValueError):
            LimitesMunicipales({**coleccion(feature()), 'crs': 'EPSG:25830'})


class LectoresTerritoriales(unittest.TestCase):
    def test_madrid_exige_identidad_y_municipio_declarados(self):
        f = {'id': '1', 'title': 'Recinto', 'relation': 'https://www.madrid.es/?vgnextoid=clave',
             'address': {'district': {'@id': 'https://datos.madrid.es/egob/kos/Provincia/Madrid/Municipio/Madrid/Distrito/Centro'}}}
        r, = importadores.recintos_madrid({'@graph': [f]}, PRUEBA)
        self.assertEqual(r['territorio'], 'es:municipio:28079')
        self.assertEqual(r['referencia']['codigo'], 'clave')
        self.assertEqual(r['evidencias'][0]['sha256'], PRUEBA['sha256'])
        f['address'] = {'locality': 'MADRID', 'postal-code': '28001'}
        self.assertEqual(importadores.recintos_madrid({'@graph': [f]}, PRUEBA), [])

    def test_geojson_normaliza_solo_los_campos_documentados(self):
        f = feature()
        f['properties'] = {'MUN_PROV': '01', 'MUN_MUNI': '059', 'NOMBRE_CAS': 'Vitoria-Gasteiz'}
        mapa, origenes = importadores.limites(coleccion(f), PRUEBA, 'geoeuskadi')
        self.assertEqual(mapa.resolver(0.5, 0.5)['territorio'], 'es:municipio:01059')
        self.assertEqual(origenes[0]['ruta'], '/features/0')
        mal = deepcopy(f)
        mal['properties'].update(MUN_PROV='0', MUN_MUNI='1059')
        with self.assertRaisesRegex(ValueError, 'Código municipal geoEuskadi inválido'):
            importadores.limites(coleccion(mal), PRUEBA, 'geoeuskadi')
        f['properties'] = {'CMUNICIPIO': 201, 'MUNICIPIO': 'Pamplona/Iruña'}
        d = {**coleccion(f), 'numberMatched': 1,
             'crs': {'type': 'name', 'properties': {'name': 'urn:ogc:def:crs:CRS::84'}}}
        mapa, _ = importadores.limites(d, PRUEBA, 'idena')
        self.assertEqual(mapa.resolver(0.5, 0.5)['territorio'], 'es:municipio:31201')
        d['numberMatched'] = 2
        with self.assertRaisesRegex(ValueError, 'incompleta'):
            importadores.limites(d, PRUEBA, 'idena')

    def test_kulturklik_cruza_codigo_propio_y_no_confunde_coordenadas_municipales_con_recinto(self):
        mapa = LimitesMunicipales(coleccion(feature()))
        entradas = [punto(), punto()]
        entradas[1]['latitud'] = None
        cruces, pendientes = importadores.cruzar_puntos(entradas, [(mapa, [PRUEBA | {'dato': {}}])])
        self.assertEqual(pendientes, [])
        cruce, = cruces
        self.assertEqual(cruce['referencia']['codigo'], '46')
        self.assertEqual(cruce['referencia']['contexto'], {'provincia_nora': '1'})
        self.assertEqual(cruce['territorio'], 'es:municipio:01059')
        self.assertEqual(cruce['evidencias'][1]['punto_consultado'], [0.5, 0.5])
        self.assertEqual(cruce['evidencias'][1]['margen_revision_m'], 50)

    def test_referencias_con_nombre_provincia_o_coordenadas_contradictorias_no_se_confirman(self):
        mapa = LimitesMunicipales(coleccion(feature()))
        mapas = [(mapa, [PRUEBA | {'dato': {}}])]
        for entradas, motivo in (([punto(nombre='Galdakao')], 'denominacion_contradice_recinto'),
                                 ([punto(), punto(nombre='Galdakao')], 'denominacion_contradice_recinto'),
                                 ([punto(provincia='20')], 'provincia_incompatible'),
                                 ([punto(), punto(lon=10)], 'fuera_de_cobertura'),
                                 ([punto(lon=0.0001)], 'cerca_del_limite'),
                                 ([punto(lon=float('nan'))], 'coordenadas_invalidas')):
            with self.subTest(motivo=motivo):
                cruces, pendientes = importadores.cruzar_puntos(entradas, mapas)
                self.assertEqual(cruces, [])
                self.assertIn(motivo, pendientes[0]['motivos'])
                self.assertTrue(pendientes[0]['evidencias'])

    def test_dos_puntos_de_una_referencia_no_eligen_entre_dos_municipios(self):
        mapa = LimitesMunicipales(coleccion(feature(), feature('01001', [cuadrado(2, 2)])))
        datos = [{'dato': {'NOMBRE_CAS': 'Literal'}}] * 2
        cruces, pendientes = importadores.cruzar_puntos([
            punto(nombre='Literal'), punto(2.5, 2.5, nombre='Literal')], [(mapa, datos)])
        self.assertEqual(cruces, [])
        self.assertEqual(pendientes[0]['motivos'], ['coordenadas_contradictorias'])

    def test_generador_valida_huellas_y_reune_catalogos_sin_tocar_la_base(self):
        f = {'id': '1', 'relation': 'https://www.madrid.es/?vgnextoid=clave',
             'address': {'district': {'@id': 'https://datos.madrid.es/egob/kos/Provincia/Madrid/Municipio/Madrid/Distrito/Centro'}}}
        base = {'version': 1, 'correspondencias': [], 'pendientes': []}
        anterior = deepcopy(base)
        with tempfile.TemporaryDirectory() as tmp:
            carpeta = Path(tmp)
            (carpeta / 'recintos.json').write_text(json.dumps({'@graph': [f]}))
            entrada = {'lector': 'madrid', 'archivo': 'recintos.json', 'fuente': 'Prueba', 'url': PRUEBA['documento']}
            m = {'comprobado': AHORA, 'entradas': [entrada, entrada]}
            salida, informe = preparar(m, base, carpeta)
            self.assertEqual(base, anterior)
            self.assertEqual(informe['cruces_catalogos'], 1)
            self.assertEqual(salida['version'], 2)
            self.assertEqual(len(salida['correspondencias'][0]['evidencias']), 2)
            entrada['sha256'] = 'b' * 64
            with self.assertRaisesRegex(ValueError, 'Descarga distinta'):
                preparar(m, base, carpeta)

    def test_generador_no_cambia_silenciosamente_un_cruce_anterior(self):
        f = {'id': '1', 'relation': 'https://www.madrid.es/?vgnextoid=clave',
             'address': {'district': {'@id': 'https://datos.madrid.es/egob/kos/Provincia/Madrid/Municipio/Madrid/Distrito/Centro'}}}
        cruce, = importadores.recintos_madrid({'@graph': [f]}, PRUEBA)
        cruce['territorio'] = 'es:municipio:36038'
        base = {'version': 1, 'correspondencias': [cruce], 'pendientes': []}
        with tempfile.TemporaryDirectory() as tmp:
            carpeta = Path(tmp)
            (carpeta / 'recintos.json').write_text(json.dumps({'@graph': [f]}))
            entrada = {'lector': 'madrid', 'archivo': 'recintos.json', 'fuente': 'Prueba', 'url': PRUEBA['documento']}
            with self.assertRaisesRegex(ValueError, 'revisión explícita'):
                preparar({'comprobado': AHORA, 'entradas': [entrada]}, base, carpeta)
