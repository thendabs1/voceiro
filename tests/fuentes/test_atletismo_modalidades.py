import json
from pathlib import Path
import re
import unittest

from agenda import atletismo, atletismo_modalidades as m, publicacion

AHORA = '2026-11-03T20:00:00+01:00'
RAIZ = Path(__file__).resolve().parents[2]


def entrada(fuente, identificador, metadatos):
    return {'version': 1, 'fuente': fuente, 'eventos': [{
        'id': identificador, 'nombre': 'IX Cross Ponte Romana 2026', 'inicio': '2026-11-01', 'fin': '2026-11-01',
        'lugar': {'nombre': 'LUGO'}, 'url': atletismo.FUENTES[fuente][1] + '/ensayo', 'metadatos': metadatos}]}


class Modalidades(unittest.TestCase):
    def test_los_codigos_de_la_tabla_son_los_que_admite_la_consulta(self):
        js = (RAIZ / 'shared/calendario/consulta.js').read_text(encoding='utf-8')
        lista = re.search(r'MODALIDADES_ATLETISMO = \[([^\]]*)\]', js)[1]
        self.assertEqual(tuple(re.findall(r"'([a-z-]+)'", lista)), m.tabla()[0])

    def test_literales_reales_de_cada_fuente(self):
        casos = [
            ({'modalidad_literal': 'Short track'}, {'pista-cubierta'}),
            ({'modalidad_literal': 'ST'}, {'pista-cubierta'}),
            ({'modalidad_literal': 'AL'}, {'pista-aire-libre'}),
            ({'modalidad_literal': 'Pista Aire libre'}, {'pista-aire-libre'}),
            ({'modalidad_literal': 'Campo a Través'}, {'cross'}),
            ({'modalidad_literal': 'Pista Curta'}, {'pista-cubierta'}),
            ({'modalidad_literal': 'Trail Running'}, {'trail'}),
            ({'categorias': [{'id': 32, 'nombre': 'Promoció'}, {'id': 24, 'nombre': 'Cros'}]}, {'cross'}),
            ({'categorias': [{'nombre': 'Pista Coberta'}, {'nombre': 'Màster'}]}, {'pista-cubierta'}),
            ({'categorias': [{'nombre': 'Marxa'}, {'nombre': 'Aire Lliure'}]}, {'marcha', 'pista-aire-libre'}),
            ({'categorias': [{'nombre': 'Trail-Muntanya'}]}, {'trail'}),
            ({'disciplines': 'Road Running'}, {'ruta'}),
            ({'disciplines': 'Race Walking, Track and Field, Cross Country'}, {'marcha', 'cross'}),
        ]
        for metadatos, esperado in casos:
            self.assertEqual(m.de(metadatos), (esperado, []), metadatos)

    def test_conocidos_sin_modalidad_y_desconocidos(self):
        for literal in ('Internacional', 'Promoció', 'Màster', 'Track and Field', ''):
            self.assertEqual(m.de({'modalidad_literal': literal}), (set(), []))
        self.assertEqual(m.de({'modalidad_literal': 'Montaña vertical'}), (set(), ['Montaña vertical']))

    def test_nivel_ii_solo_cuenta_si_ninguna_otra_fuente_acredita_modalidad(self):
        nivel_ii = {'modalidad_literal': 'AL', 'nivel_ii': {'huella': 'x'}}
        self.assertEqual(m.de_variantes([nivel_ii, {'modalidad_literal': 'Marcha'}]), ['marcha'])
        self.assertEqual(m.de_variantes([nivel_ii, {'categorias': [{'nombre': 'Promoció'}]}]), ['pista-aire-libre'])
        self.assertEqual(m.de_variantes([{'disciplines': 'Cross Country'}, {'modalidad_literal': 'Ruta'}]), ['ruta', 'cross'])

    def test_la_cita_publicada_lleva_la_union_y_sin_clave_si_no_hay(self):
        n = None
        for fuente, metadatos in (('rfea', {'modalidad_literal': 'Cross'}), ('fga', {'modalidad_literal': 'Campo a Través'}),
                                  ('fca', {'categorias': [{'nombre': 'Promoció'}, {'nombre': 'Cros'}]})):
            n = atletismo.importar(n, entrada(fuente, fuente, metadatos), AHORA)
        [evento] = publicacion.proyectar(n)['eventos']
        self.assertEqual(evento['atletismo']['modalidades'], ['cross'])
        n = atletismo.importar(None, entrada('fca', 'sin', {'categorias': [{'nombre': 'Promoció'}]}), AHORA)
        [evento] = publicacion.proyectar(n)['eventos']
        self.assertNotIn('modalidades', evento['atletismo'])

    def test_la_tabla_rechaza_claves_sin_normalizar_y_codigos_ajenos(self):
        datos = json.loads(m.RUTA.read_text(encoding='utf-8'))
        for literal, codigo in datos['literales'].items():
            self.assertEqual(m.clave(literal), literal)
            self.assertTrue(codigo is None or codigo in datos['modalidades'])


if __name__ == '__main__':
    unittest.main()
