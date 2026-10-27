"""Límites del IGN por provincia: carga perezosa, huellas, fronteras y proyección de recintos."""

import gzip
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from agenda import madrid
from agenda.publicacion import proyectar
from shared.territorios.limites import Limites
from test_calendario_cultura import muestra

AHORA = '2026-10-25T12:00:00+01:00'


def cuadrado(x, y, lado):
    return [[[x, y], [x + lado, y], [x + lado, y + lado], [x, y + lado], [x, y]]]


def provincias(carpeta, recintos):
    """recintos: {provincia: [(ine, x, y, lado)]} → manifiesto con archivos gz en carpeta."""
    m = {'version': 1, 'fuente': 'IGN prueba', 'comprobado': '2026-10-27T10:00:00+00:00',
         'margen_revision_m': 50, 'prefijo_r2': 'territorios/limites/prueba/', 'provincias': {}}
    cuerpos = {}
    for provincia, lista in recintos.items():
        datos = {'type': 'FeatureCollection', 'features': [
            {'type': 'Feature', 'properties': {'ine': ine, 'nombre_ign': ine},
             'geometry': {'type': 'Polygon', 'coordinates': cuadrado(x, y, lado)}} for ine, x, y, lado in lista]}
        cuerpo = gzip.compress(json.dumps(datos).encode(), mtime=0)
        archivo = provincia + '.geojson.gz'
        cuerpos[m['prefijo_r2'] + archivo] = cuerpo
        if carpeta:
            (Path(carpeta) / archivo).write_bytes(cuerpo)
        xs = [x for _, x, _, l in lista] + [x + l for _, x, _, l in lista]
        ys = [y for _, _, y, l in lista] + [y + l for _, _, y, l in lista]
        m['provincias'][provincia] = {'archivo': archivo, 'url': 'https://ign.test/' + provincia,
            'sha256': hashlib.sha256(cuerpo).hexdigest(), 'caja': [min(xs), min(ys), max(xs), max(ys)]}
    return m, cuerpos


class LimitesPorProvincia(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        # Álava y Gipuzkoa contiguas en x = 1.
        self.m, self.cuerpos = provincias(self.tmp.name, {'01': [('01059', 0, 0, 1)], '20': [('20069', 1, 0, 1)]})

    def test_resuelve_con_evidencia_y_solo_carga_la_provincia_necesaria(self):
        limites = Limites(self.m, self.tmp.name)
        r = limites.resolver(0.5, 0.5)
        self.assertEqual((r['estado'], r['territorio'], r['motivo']),
                         ('resuelto', 'es:municipio:01059', 'punto_en_recinto_municipal'))
        self.assertEqual(r['evidencias'][0]['sha256'], self.m['provincias']['01']['sha256'])
        self.assertEqual(r['evidencias'][0]['ruta'], '/features/0')
        self.assertEqual(r['evidencias'][0]['punto_consultado'], [0.5, 0.5])
        self.assertEqual(set(limites.mapas), {'01'})

    def test_frontera_entre_provincias_queda_pendiente_y_fuera_de_cajas_sin_cobertura(self):
        limites = Limites(self.m, self.tmp.name)
        r = limites.resolver(1.0001, 0.5)  # ≈ 11 m del límite: dentro de Gipuzkoa.
        self.assertEqual((r['estado'], r['motivo']), ('pendiente', 'cerca_del_limite'))
        self.assertEqual(set(limites.mapas), {'01', '20'})
        r = limites.resolver(1.5, 0.5)
        self.assertEqual(r['territorio'], 'es:municipio:20069')
        r = limites.resolver(5, 5)
        self.assertEqual((r['estado'], r['motivo']), ('pendiente', 'fuera_de_cobertura'))

    def test_recintos_solapados_dan_conflicto(self):
        m, _ = provincias(self.tmp.name, {'01': [('01059', 0, 0, 1), ('01001', 0.4, 0.4, 0.2)]})
        r = Limites(m, self.tmp.name).resolver(0.5, 0.5)
        self.assertEqual((r['estado'], r['motivo']), ('conflicto', 'recintos_solapados'))
        self.assertEqual([c['territorio'] for c in r['candidatos']], ['es:municipio:01001', 'es:municipio:01059'])

    def test_sin_archivo_ni_r2_no_resuelve_y_r2_verifica_huella_y_guarda_copia(self):
        with tempfile.TemporaryDirectory() as vacia:
            r = Limites(self.m, vacia).resolver(0.5, 0.5)
            self.assertEqual((r['estado'], r['motivo'], r['provincias']), ('pendiente', 'limites_no_disponibles', ['01']))
            with self.assertRaisesRegex(ValueError, 'distintos del manifiesto'):
                Limites(self.m, vacia, obtener=lambda clave: b'otro').resolver(0.5, 0.5)
            pedidas = []
            limites = Limites(self.m, vacia, obtener=lambda clave: pedidas.append(clave) or self.cuerpos[clave])
            self.assertEqual(limites.resolver(0.5, 0.5)['estado'], 'resuelto')
            self.assertEqual(pedidas, ['territorios/limites/prueba/01.geojson.gz'])
            self.assertEqual(Limites(self.m, vacia).resolver(0.5, 0.5)['estado'], 'resuelto')  # Copia local.
        (Path(self.tmp.name) / '01.geojson.gz').write_bytes(b'corrupto')
        r = Limites(self.m, self.tmp.name).resolver(0.5, 0.5)
        self.assertEqual(r['motivo'], 'limites_no_disponibles')  # Copia con otra huella: no se usa.


class RecintosPorCoordenadas(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def proyectar(self, recintos, filas=None):
        m, _ = provincias(self.tmp.name, recintos)
        return proyectar(madrid.importar(None, filas or muestra('madrid'), AHORA),
                         limites_municipales=Limites(m, self.tmp.name))

    def test_madrid_resuelve_recintos_sin_correspondencia_por_su_punto(self):
        fila = muestra('madrid')[0]
        fila['URL-INSTALACION'] = 'https://www.madrid.es/?vgnextoid=otro'
        p = self.proyectar({'28': [('28079', -3.9, 40.3, 0.3)]}, [fila])
        self.assertEqual(p['eventos'][0]['territorios'][0]['territorio'], 'es:municipio:28079')
        e = next(e for e in p['entidades'].values() if e['tipo'] == 'lugar')
        self.assertEqual(e['ubicacion_estado'], 'resuelto')
        motivos = sorted(r['motivo'] for r in e['ubicacion_resoluciones'])
        self.assertEqual(motivos, ['punto_en_recinto_municipal', 'sin_correspondencia'])
        punto = next(r for r in e['ubicacion_resoluciones'] if r['referencia']['sistema'] == 'coordenadas:wgs84')
        self.assertEqual(punto['origen'][0]['fuente'], 'madrid')

    def test_punto_fuera_o_contradictorio_no_se_asigna(self):
        fila = muestra('madrid')[0]
        fila['URL-INSTALACION'] = 'https://www.madrid.es/?vgnextoid=otro'
        p = self.proyectar({'28': [('28006', 0, 0, 1)]}, [fila])
        self.assertEqual(p['eventos'][0]['territorios'], [])
        e = next(e for e in p['entidades'].values() if e['tipo'] == 'lugar')
        self.assertEqual((e['ubicacion_estado'], e['ubicacion_motivo']), ('pendiente', 'fuera_de_cobertura'))
        # Un cruce revisado que contradice el punto no gana por orden: conflicto.
        p = self.proyectar({'28': [('28006', -3.9, 40.3, 0.3)]})
        estados = {e['ubicacion_estado'] for e in p['entidades'].values() if e['tipo'] == 'lugar'}
        self.assertEqual(estados, {'conflicto'})

    def test_sin_limites_la_proyeccion_no_cambia(self):
        n = madrid.importar(None, muestra('madrid'), AHORA)
        lugares = [e for e in proyectar(n)['entidades'].values() if e['tipo'] == 'lugar']
        self.assertTrue(all(len(e['ubicacion_resoluciones']) == 1 for e in lugares))
        fila = muestra('madrid')[0]
        fila['LATITUD'] = 'no'
        self.assertNotIn('coordenadas', madrid.coordenadas(fila))

    def test_publicar_sin_limites_necesarios_falla_antes_de_escribir(self):
        from unittest.mock import patch
        from agenda.publicacion import main
        m, _ = provincias(None, {'28': [('28079', -3.9, 40.3, 0.3)]})
        n = madrid.importar(None, muestra('madrid'), AHORA)
        with patch('agenda.turso.Almacen') as almacen, patch('agenda.publicacion.subir') as subir, \
                patch('shared.territorios.limites.cargar', return_value=Limites(m, self.tmp.name)):
            almacen.return_value.cargar.return_value = {'nucleo': n}
            with self.assertRaisesRegex(ValueError, 'no disponibles para publicar: 28'):
                main(['--turso', '--fuentes', 'madrid', '--publicar'])
            subir.assert_not_called()
