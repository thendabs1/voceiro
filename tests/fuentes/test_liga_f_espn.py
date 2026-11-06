"""Liga F como colección ESPN de agenda: registro y publicación sin marcadores."""

import unittest

from agenda import cadencias, deportes, espn, proveedores, publicacion, temporadas
from test_adaptadores_deportivos import importar, muestra


class LigaF(unittest.TestCase):
    def test_registros_y_control_de_temporada_conservan_la_politica_actual(self):
        self.assertEqual(temporadas.CATALOGO['liga-f'], ('Liga F', 'espn-liga-f', 'fecha'))
        self.assertEqual(espn.COLECCIONES['espn-liga-f'], ('soccer', 'esp.w.1'))
        self.assertEqual(deportes.COLECCIONES['espn-liga-f'], ('futbol', 'esp.w.1'))
        self.assertEqual(proveedores.principal('liga-f'), 'espn-liga-f')
        self.assertEqual(proveedores.fuente_nucleo('espn-liga-f'), 'espn-futbol')
        self.assertEqual(proveedores.modo('espn-liga-f'), 'fecha')
        self.assertEqual(cadencias.perfil('liga-f'), cadencias.perfil('primera'))
        t = temporadas.nueva('liga-f', '2026', '2026-11-06T12:00:00Z')
        self.assertEqual(t['principal'], 'espn-liga-f')
        self.assertEqual(t['politica'], temporadas.POLITICA)
        alcance = proveedores.describir('espn-liga-f', muestra('espn-liga-f'))
        self.assertEqual(alcance['seleccion'], {'year': '2026'})
        self.assertFalse(alcance['fin_confirmado'] or alcance['cobertura_completa'])

    def test_publica_el_codigo_liga_f_y_la_cita_sin_resultado_ni_ronda(self):
        n = importar('espn-liga-f')
        p = publicacion.proyectar(n)
        codigos = {c for e in p['entidades'].values() for c in e.get('codigos', ())}
        self.assertEqual(codigos, {'liga-f'})
        self.assertEqual(len(p['eventos']), 1)
        self.assertEqual(p['eventos'][0]['clase'], 'encuentro')
        self.assertIsNone(p['eventos'][0]['resultado'])
        self.assertNotIn('ronda_torneo', p['eventos'][0])
        self.assertFalse(n['resultados'] or n['clasificaciones'])

    def test_rechaza_otra_liga_en_el_mismo_importador(self):
        with self.assertRaisesRegex(ValueError, 'Liga ESPN'):
            deportes.importar(None, 'espn-liga-f', muestra('espn-primera'), '2026-11-06T12:00:00Z')


if __name__ == '__main__':
    unittest.main()
