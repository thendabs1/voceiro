"""Clasificador al publicar: tablas por fuente sobre los campos en bruto."""

from copy import deepcopy
import unittest

from agenda import clasificador, kulturklik, zaragoza
from agenda.clasificacion import cargar_catalogo
from agenda.publicacion import proyectar
from test_agenda import AHORA
from test_calendario_cultura import muestra


def madrid(tipo, gratuito=None, audiencia=None):
    origen = {k: v for k, v in (('GRATUITO', gratuito), ('AUDIENCIA', audiencia)) if v is not None}
    return {'tipo_original': '/contenido/actividades/' + tipo, 'origen': origen}


class Tablas(unittest.TestCase):
    def test_todas_validan_contra_el_catalogo(self):
        self.assertEqual(set(clasificador.cargar()), {'madrid', 'cyl', 'kulturklik', 'zaragoza'})

    def test_un_tema_fuera_del_catalogo_es_un_error(self):
        tabla = deepcopy(clasificador.cargar()['madrid'])
        tabla['campos']['TIPO']['valores']['Musica']['temas'] = ['jazz']
        with self.assertRaisesRegex(ValueError, 'desconocido'):
            clasificador.validar(tabla, cargar_catalogo()['conceptos'])


class Clasificar(unittest.TestCase):
    def test_exposicion_sin_disciplina_es_cultura_y_la_charla_queda_sin_tema(self):
        r = clasificador.clasificar('madrid', [madrid('Exposiciones', '1')])
        self.assertEqual((r['temas'], r['formatos'], r['precio']), (['cultura'], ['exposicion'], 'gratis'))
        r = clasificador.clasificar('madrid', [madrid('ConferenciasColoquios', '0')])
        self.assertEqual((r['temas'], r['formatos'], r['precio']), ([], ['charla-encuentro'], 'pago'))

    def test_arbol_de_portal_hereda_del_padre_y_lo_desconocido_no_inventa(self):
        self.assertEqual(clasificador.clasificar('madrid', [madrid('Musica/Flamenco')])['temas'], ['musica'])
        r = clasificador.clasificar('madrid', [madrid('Nueva/Rama')])
        self.assertEqual((r['temas'], r['formatos'], r['sin_revisar']), ([], [], [('TIPO', 'Nueva/Rama')]))

    def test_dos_campos_se_suman_y_gana_el_tema_mas_concreto(self):
        # «Presentación» sola no acredita literatura; la categoría sí.
        r = clasificador.clasificar('cyl', [{'tipo_original': {'categoria': 'Libros y Lectura',
                                                               'tematica': 'Presentación'}}])
        self.assertEqual((r['temas'], r['formatos']), (['literatura'], ['charla-encuentro']))
        r = clasificador.clasificar('kulturklik', [{'tipo_original': {'id': 7}}])
        self.assertEqual(r['temas'], ['cultura-popular', 'literatura'])

    def test_deporte_en_un_curso_es_practica_deportiva(self):
        b = {'tipo_original': 'Cursos y talleres', 'origen': {'category': [{'id': 25, 'title': 'Deporte'}]}}
        r = clasificador.clasificar('zaragoza', [b])
        self.assertEqual((r['temas'], r['formatos']), (['deportes'], ['practica-deportiva']))

    def test_precio_por_texto_tarifas_e_indicador(self):
        def cyl(precio):
            return clasificador.clasificar('cyl', [{'tipo_original': {}, 'origen': {'precio': precio}}])['precio']
        casos = {'Gratuito': 'gratis', 'Entrada gratuita': 'gratis', 'CAMPAÑA ESCOLAR ( 0 euros )': 'gratis',
                 '3 euros': 'pago', 'Adulto: 5euros / Menor 25: 3euros': 'pago',
                 'Gratuito para menores; adultos 3 euros': 'mixto', 'Según programa': None}
        self.assertEqual({t: cyl(t) for t in casos}, casos)
        kk = lambda p: clasificador.clasificar('kulturklik', [{'tipo_original': {'id': 1},
                                                               'origen': {'priceEs': p}}])['precio']
        self.assertEqual([kk('Doakoa'), kk('Gratis (inscripción)'), kk('Inscripción'), kk('10 / 12 €')],
                         ['gratis', 'gratis', None, 'pago'])
        tarifa = lambda v: {'fareGroup': 'x', 'hasCurrencyValue': v}
        zgz = lambda *t: clasificador.clasificar('zaragoza', [{'origen': {'price': list(t)}}])['precio']
        self.assertEqual([zgz(tarifa(0)), zgz(tarifa(2)), zgz(tarifa(0), tarifa(2)), zgz()],
                         ['gratis', 'pago', 'mixto', None])

    def test_publico_declarado_sin_deducir(self):
        r = clasificador.clasificar('madrid', [madrid('Musica', audiencia='/usuario/Niños,/usuario/Familias')])
        self.assertEqual(r['publico'], ['familias', 'infancia'])
        r = clasificador.clasificar('madrid', [madrid('Musica', audiencia='/usuario/Mujeres')])
        self.assertEqual(r['publico'], [])


class Proyeccion(unittest.TestCase):
    def test_publica_ejes_e_informa_sin_tocar_el_nucleo(self):
        n = kulturklik.importar(None, muestra('kulturklik'), AHORA)
        n = zaragoza.importar(n, muestra('zaragoza'), AHORA)
        antes, informe = deepcopy(n), {}
        p = proyectar(n, informe=informe)
        self.assertEqual(n, antes)
        self.assertFalse(any(e['temas'] for e in n['entidades'].values()))  # Los lectores ya no clasifican.
        self.assertTrue(all(e['formatos'] for e in p['eventos'] if e['fuentes'][0]['fuente'] == 'kulturklik'))
        self.assertEqual(set(informe), {'kulturklik', 'zaragoza'})
        self.assertIn('artes-visuales', p['catalogo']['conceptos'])
        lineas = clasificador.informe(informe)
        self.assertTrue(lineas[0].startswith('[agenda] Clasificación kulturklik: 3 eventos; tema'))


if __name__ == '__main__':
    unittest.main()
