"""Aplicación del contrato a datos guardados: códigos, pruebas y conflictos."""

from copy import deepcopy
import json
from pathlib import Path
import unittest

from agenda import kulturklik, madrid, nucleo
from agenda.publicacion import proyectar
from agenda.revision import revisar
from agenda.transicion import ampliar
from shared.territorios.relacionador import Relacionador
from test_agenda import construir, ficha


RAIZ = Path(__file__).resolve().parents[2]
MUESTRAS = Path(__file__).with_name('muestras_calendario')
AHORA = '2026-10-25T12:00:00+01:00'


def muestra(nombre):
    return json.loads((MUESTRAS / (nombre + '.json')).read_text())


class CrucesRevisados(unittest.TestCase):
    def test_madrid_reutiliza_recintos_guardados_sin_cambiar_su_identidad(self):
        n = madrid.importar(None, muestra('madrid'), AHORA)
        anterior = deepcopy(n)
        p = proyectar(n)
        self.assertEqual(n, anterior)
        self.assertEqual(len(p['eventos']), 4)
        self.assertTrue(all(e['territorios'][0]['territorio'] == 'es:municipio:28079' for e in p['eventos']))
        recintos = [e for e in p['entidades'].values() if e['tipo'] == 'lugar']
        self.assertEqual(len(recintos), 3)
        for e in recintos:
            self.assertNotIn('territorio_comun', e)  # El recinto no es el municipio.
            self.assertEqual(e['ubicacion_estado'], 'resuelto')
            r = e['ubicacion_resoluciones'][0]
            self.assertEqual(r['tipo'], 'ubicacion')
            self.assertTrue(r['origen'][0]['documento'] in n['documentos'])
            self.assertEqual(r['evidencias'][0]['dato']['relation'].split('vgnextoid=')[1], r['referencia']['codigo'])
            self.assertIn('/Municipio/Madrid/', r['evidencias'][0]['dato']['address']['district']['@id'])
            self.assertEqual(len(r['evidencias'][0]['sha256']), 64)

    def test_madrid_no_resuelve_otro_recinto_por_nombre_proveedor_o_postal(self):
        fila = muestra('madrid')[0]
        fila['URL-INSTALACION'] = 'https://www.madrid.es/?vgnextoid=otro'
        p = proyectar(madrid.importar(None, [fila], AHORA))
        self.assertEqual(p['eventos'][0]['territorios'], [])
        e = next(e for e in p['entidades'].values() if e['tipo'] == 'lugar')
        self.assertEqual(e['ubicacion_estado'], 'pendiente')
        self.assertEqual(e['ubicacion_motivo'], 'sin_correspondencia')

    def test_kulturklik_preserva_el_espacio_publicado_y_el_desajuste_con_nora(self):
        n = kulturklik.importar(None, muestra('kulturklik'), AHORA)
        anterior = deepcopy(n)
        p = proyectar(n)
        self.assertEqual(n, anterior)
        self.assertEqual({t['territorio'] for e in p['eventos'] for t in e['territorios']},
                         {'es:municipio:31201', 'es:municipio:01059'})
        municipios = [e for e in p['entidades'].values() if e['tipo'] == 'territorio']
        self.assertEqual(len(municipios), 2)
        for e in municipios:
            self.assertEqual(e['territorio_estado'], 'resuelto')
            r = e['territorio_resoluciones'][0]
            self.assertEqual(r['referencia']['sistema'], 'kulturklik:municipio_nora')
            self.assertEqual(r['motivo'], 'correspondencia_acreditada')
            self.assertGreaterEqual(len(r['evidencias']), 2)
            self.assertEqual(len(r['candidatos']), 1)
            self.assertTrue(any(e.get('geometria_sha256') for e in r['evidencias']))
            self.assertIn('provincia_nora', r['referencia']['contexto'])
        relacionador = Relacionador()
        for ref in ({'sistema': 'kulturklik:municipio_nora', 'codigo': '476'},
                    {'sistema': 'nora:municipio', 'codigo': '476', 'contexto': {'provincia': '31'}},
                    {'sistema': 'nora:municipio', 'codigo': '059', 'contexto': {'provincia': '01'}}):
            self.assertIsNone(relacionador.resolver_referencia(ref)['territorio'])

    def test_galicia_conserva_control_y_no_prioriza_un_identificador_incompatible(self):
        n = ampliar(construir([ficha()]))['nucleo']
        o = next(o for o in n['observaciones'].values() if 'identificadores' in o['bloques'])
        for codigo, estado in (('36038', 'resuelto'), ('28079', 'conflicto'), ('99999', 'pendiente')):
            with self.subTest(codigo=codigo):
                o['bloques']['identificadores']['ine'] = codigo
                p = proyectar(n)
                e = next(e for e in p['entidades'].values() if e['tipo'] == 'territorio')
                self.assertEqual(e['territorio_estado'], estado)
                self.assertEqual(len(e['territorio_resoluciones']), 2)
                self.assertEqual(bool(p['eventos'][0]['territorios']), estado == 'resuelto')

    def test_galdakao_con_coordenadas_en_usansolo_no_se_asigna_y_conserva_pruebas(self):
        r = Relacionador().resolver_referencia({'sistema': 'kulturklik:municipio_nora',
            'codigo': '183', 'contexto': {'provincia_nora': '48'}})
        self.assertEqual(r['estado'], 'pendiente')
        self.assertIsNone(r['territorio'])
        self.assertEqual(r['motivo'], 'denominacion_contradice_recinto')
        self.assertTrue(any(e['dato'].get('municipalityEs') == 'Galdakao' for e in r['evidencias']))
        self.assertTrue(any(e['dato'].get('MUN_MUNI') == '916' for e in r['evidencias']))

    def test_conflicto_de_observaciones_conserva_las_referencias_sin_publicar_una(self):
        c = nucleo.Constructor()
        c.n['fuentes']['prueba'] = {'nombre': 'Prueba'}
        doc = c.documento('prueba', {'prueba': True})
        for codigo in ('36038', '28079'):
            c.entidad('prueba', 'municipio', codigo, {}, 'territorio', 'municipio', {'es': 'Literal'},
                doc, '/' + codigo, AHORA, bloques={'identificadores': {'ine': codigo}}, identidad='comun')
        p = proyectar(c.terminar())
        e = next(iter(p['entidades'].values()))
        self.assertEqual(e['territorio_estado'], 'conflicto')
        self.assertIsNone(e['territorio_comun'])
        self.assertEqual({r['referencia']['codigo'] for r in e['territorio_resoluciones']}, {'36038', '28079'})

    def test_informe_por_fuente_cubre_temas_y_ubicacion_sin_recoger(self):
        n = ampliar(construir([ficha()]))['nucleo']
        n = madrid.importar(n, muestra('madrid'), AHORA)
        n = kulturklik.importar(n, muestra('kulturklik'), AHORA)
        anterior = deepcopy(n)
        informe = revisar(n)
        self.assertEqual(n, anterior)
        self.assertEqual(informe['fuentes']['cultura-galicia']['ubicacion'], {'resuelto': 1})
        self.assertEqual(informe['fuentes']['madrid']['ubicacion'], {'resuelto': 4})
        self.assertEqual(informe['fuentes']['kulturklik']['ubicacion'], {'resuelto': 3})
        self.assertEqual(len(informe['pendientes']), 0)
        # La conferencia no acredita tema (tablas/madrid.json).
        self.assertEqual(informe['fuentes']['madrid']['temas'], {'clasificados': 3, 'pendientes': 1})
        self.assertEqual(revisar(n, ['madrid'])['pendientes'], [])
        self.assertNotIn('kulturklik', json.dumps(revisar(n, ['madrid'])))


class EstadosResolucion(unittest.TestCase):
    def setUp(self):
        self.datos = json.loads((RAIZ / 'shared/territorios/correspondencias.json').read_text())
        self.ref = self.datos['correspondencias'][0]['referencia']

    def test_reune_pruebas_del_mismo_destino_y_no_elige_entre_destinos_incompatibles(self):
        previas = len(Relacionador(self.datos).resolver_ubicacion(self.ref)['evidencias'])
        copia = deepcopy(self.datos['correspondencias'][0])
        copia['id'] += ':otra-prueba'
        self.datos['correspondencias'].append(copia)
        r = Relacionador(self.datos).resolver_ubicacion(self.ref)
        self.assertEqual(r['estado'], 'resuelto')
        self.assertEqual(len(r['candidatos']), 1)
        self.assertEqual(len(r['evidencias']), previas + 1)
        copia['territorio'] = 'es:municipio:36038'
        relacionador = Relacionador(self.datos)
        r = relacionador.resolver_ubicacion(self.ref)
        self.assertEqual(r['estado'], 'conflicto')
        self.assertIsNone(r['territorio'])
        self.assertEqual(len(r['candidatos']), 2)
        r['candidatos'].clear()
        self.assertEqual(len(relacionador.resolver_ubicacion(self.ref)['candidatos']), 2)

    def test_referencia_y_ubicacion_tienen_operaciones_distintas_y_no_inventan_vigencias(self):
        relacionador = Relacionador(self.datos)
        self.assertEqual(relacionador.resolver_referencia(self.ref)['estado'], 'pendiente')
        r = relacionador.resolver_ubicacion(self.ref, fecha='2026-10-25')
        self.assertIsNone(r['territorio'])
        self.assertEqual(r['motivo'], 'vigencia_no_acreditada')
        self.assertEqual(len(r['candidatos']), 1)
        ref = {'sistema': 'ine:municipio:dc', 'codigo': '010590'}
        self.assertEqual(relacionador.resolver_referencia(ref)['territorio'], 'es:municipio:01059')
        for cambio in ({'codigo': 10590}, {'codigo': '10590'}, {'contexto': {'provincia': '01'}},
                       {'edicion': 'otra'}, {'sistema': 'inventado'}):
            self.assertEqual(relacionador.resolver_referencia({**ref, **cambio})['estado'], 'pendiente')

    def test_rechaza_registros_sin_evidencia_destino_o_con_tipo_equivocado(self):
        for campo, valor in (('evidencias', []), ('territorio', 'es:municipio:99999'), ('tipo', 'equivalencia')):
            datos = deepcopy(self.datos)
            datos['correspondencias'][0][campo] = valor
            with self.subTest(campo=campo), self.assertRaises(ValueError):
                Relacionador(datos)
