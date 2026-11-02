"""Conciliación revisada de principales persistidos, preservando evidencia e ID."""
from copy import deepcopy
import unittest
from unittest.mock import patch

from agenda import atletismo, atletismo_coincidencias as c, atletismo_conciliacion as conciliacion
from agenda import nucleo, nucleo_r2, publicacion
from test_atletismo_coincidencias import entrada, AHORA


class Conciliacion(unittest.TestCase):
    def anteriores(self):
        a = entrada('fga', '113279', nombre='XLIX Carreira Pedestre Popular do San Martiño',
                    lugar={'nombre': 'Ourense'})
        b = entrada('rfea', '69339', nombre='XLIX Carreira Popular do San Martiño',
                    lugar={'nombre': 'San Martiño'})
        with patch.object(c, 'revisiones_identidad', return_value=[]):
            n = atletismo.importar(None, a, AHORA)
            n = atletismo.importar(n, b, AHORA)
        return n, a, b

    def test_conserva_id_originales_padres_filtros_y_conflictos_y_es_idempotente(self):
        anterior, a, b = self.anteriores()
        copia = deepcopy(anterior)
        original = next(r['destino']['id'] for r in anterior['referencias'].values()
                        if r['proveedor'] == 'fga' and r['tipo_externo'] == 'competicion')
        n, informe = conciliacion.conciliar(anterior)
        self.assertEqual(anterior, copia)
        self.assertEqual(n['documentos'], anterior['documentos'])
        self.assertEqual(n['observaciones'], anterior['observaciones'])
        e, = publicacion.proyectar(n)['eventos']
        self.assertEqual(e['id'], original)
        self.assertTrue(e['lugar']['conflicto'])
        self.assertEqual(len(e['fuentes']), 2)
        for fuente in ('fga', 'rfea'):
            vista, = publicacion.proyectar(n, fuentes=[fuente])['eventos']
            self.assertEqual(vista['id'], original)
            self.assertFalse(vista['lugar']['conflicto'])
        self.assertEqual(c.incidencias(n), [])
        grupos = {g['id'] for g in anterior['entidades'].values() if g['tipo'] == 'agrupacion'}
        self.assertTrue(grupos <= {g['id'] for g in n['entidades'].values()})
        self.assertEqual(n, conciliacion.conciliar(n)[0])
        recargada = nucleo_r2.unir(n, nucleo_r2.partir(n))
        self.assertEqual(recargada, n)
        for p in (a, b):
            n = atletismo.importar(n, p, '2026-11-03T20:00:00+01:00')
        self.assertEqual(publicacion.proyectar(n)['eventos'][0]['id'], original)
        self.assertEqual(len(publicacion.proyectar(n)['eventos']), 1)
        self.assertEqual([r['estado'] for r in informe].count('conciliada'), 1)

    def test_otra_referencia_no_revisada_impide_absorber_su_identidad(self):
        n, _, _ = self.anteriores()
        ref = next(r for r in n['referencias'].values() if r['proveedor'] == 'rfea'
                   and r['tipo_externo'] == 'competicion')
        extra = deepcopy(ref)
        extra.update(id='otra-referencia', id_externo='otro-id')
        n['referencias'][extra['id']] = extra
        with self.assertRaisesRegex(ValueError, 'otras referencias'):
            conciliacion.conciliar(n)

    def test_sesiones_y_politicas_requieren_revision_adicional(self):
        n, a, _ = self.anteriores()
        a['eventos'][0]['programa'] = [{'id': 'salida', 'nombre': 'Salida',
            'tipo_sesion': 'carrera', 'inicio': '2026-11-01', 'fin': '2026-11-01'}]
        n = atletismo.importar(n, a, '2026-11-03T20:00:00+01:00')
        with self.assertRaisesRegex(ValueError, 'sesiones'):
            conciliacion.conciliar(n)
        n, _, _ = self.anteriores()
        ref = next(r for r in n['referencias'].values() if r['proveedor'] == 'fga'
                   and r['tipo_externo'] == 'competicion')
        constructor = nucleo.Constructor(n)
        constructor.preferir(ref['destino'], 'lugar', ref['id'], 'Revisión anterior')
        with self.assertRaisesRegex(ValueError, 'politicas'):
            conciliacion.conciliar(constructor.terminar())


if __name__ == '__main__':
    unittest.main()
