"""Conciliación revisada de principales persistidos, preservando evidencia e ID."""
from copy import deepcopy
import unittest
from unittest.mock import patch

from agenda import atletismo, atletismo_coincidencias as c, atletismo_conciliacion as conciliacion
from agenda import almacen_nucleo, nucleo, nucleo_r2, publicacion
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

    def test_almacen_acepta_solo_el_cambio_de_destino_documentado(self):
        anterior, _, _ = self.anteriores()
        n, informe = conciliacion.conciliar(anterior)
        absorbida, = informe[-1]['absorbidas'] if informe[-1]['estado'] == 'conciliada' else next(
            r['absorbidas'] for r in informe if r['estado'] == 'conciliada')
        entidad = n['entidades'][nucleo.clave(absorbida)]
        self.assertEqual(entidad['conciliada_en'], informe[-1].get('conservada') or next(
            r['conservada'] for r in informe if r['estado'] == 'conciliada'))
        self.assertNotIn(absorbida['id'], {e['id'] for e in publicacion.proyectar(n)['eventos']})
        self.assertTrue(almacen_nucleo.planificar(anterior, n))
        # La absorbida tampoco aparece en las consultas del núcleo.
        self.assertEqual(len(nucleo.consultar(n, '2026-11-01', '2026-11-30')), 1)
        for cambio in ('sin marca', 'revisión ajena al registro', 'otro campo'):
            with self.subTest(cambio=cambio):
                falso = deepcopy(n)
                elegida = next(e for e in falso['entidades'].values() if e.get('conciliaciones'))
                if cambio == 'sin marca':
                    del falso['entidades'][nucleo.clave(absorbida)]['conciliada_en']
                elif cambio == 'revisión ajena al registro':
                    elegida['conciliaciones'][0]['revision'] = {**elegida['conciliaciones'][0]['revision'], 'id': 'inventada'}
                else:
                    ref = next(r for r in falso['referencias'].values()
                               if r['destino'] != anterior['referencias'][r['id']]['destino'])
                    ref['id_externo'] += '-otro'
                with self.assertRaises(ValueError):
                    almacen_nucleo.planificar(anterior, falso)

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

    def test_turso_carga_nueva_simula_o_guarda_una_vez(self):
        anterior, _, _ = self.anteriores()

        class Remoto:
            guardados = []

            def cargar(self):
                return {'version': 1, 'nucleo': deepcopy(anterior)}

            def guardar(self, calendario, **opciones):
                self.guardados.append((calendario, opciones))

        with patch('agenda.turso.abrir', return_value=Remoto()):
            conciliacion.main(['--turso', '--simular'])
            self.assertEqual(Remoto.guardados, [])
            conciliacion.main(['--turso'])
        (calendario, opciones), = Remoto.guardados
        self.assertEqual(opciones, {'solo_nucleo': True})
        self.assertEqual(calendario['version'], 1)
        self.assertEqual(c.incidencias(calendario['nucleo']), [])
        with self.assertRaises(SystemExit):
            conciliacion.main(['--turso', '--salida', 'x.json'])


class Separacion(unittest.TestCase):
    def unidas(self):
        """RFEA reúne dos títulos y una revisión antigua lo unió a la parte de FCA."""
        rfea = entrada('rfea', '69339', nombre='Campeonato de Promoción y Máster', lugar={'nombre': 'Lugo'})
        fca = entrada('fca', '113279', nombre='Campionat Màster', lugar={'nombre': 'Lugo'})
        revision = {'id': 'prueba', 'referencias': {'fca': '113279', 'rfea': '69339'}, 'conservar': 'fca',
                    'revision': {'fecha': '2026-11-02', 'criterio': 'x', 'evidencias': ['https://example.org']}}
        with patch.object(c, 'revisiones_identidad', return_value=[]):
            n = atletismo.importar(atletismo.importar(None, fca, AHORA), rfea, AHORA)
        with patch.object(c, 'revisiones_identidad', return_value=[revision]):
            n, informe = conciliacion.conciliar(n)
        conservada, absorbida = informe[0]['conservada'], informe[0]['absorbidas'][0]
        registro = {'id': 'separa', 'referencia': {'fuente': 'rfea', 'id': '69339'},
                    'desde': conservada['id'], 'hasta': absorbida['id'], 'contiene': [['fca', '113279']],
                    'revision': {'fecha': '2026-11-04', 'criterio': 'x', 'evidencias': ['https://example.org']}}
        return n, rfea, fca, registro

    def destino(self, n, fuente, identificador):
        return next(r['destino']['id'] for r in n['referencias'].values() if r['tipo_externo'] == 'competicion'
                    and (r['proveedor'], r['id_externo']) == (fuente, identificador))

    def test_devuelve_cada_cita_a_su_identidad_sin_tocar_lo_observado(self):
        anterior, _, _, s = self.unidas()
        n, informe = conciliacion.separar(anterior, [s])
        self.assertEqual(informe[0]['estado'], 'separada')
        self.assertEqual(self.destino(n, 'rfea', '69339'), s['hasta'])
        self.assertEqual(self.destino(n, 'fca', '113279'), s['desde'])
        self.assertEqual(n['observaciones'], anterior['observaciones'])
        self.assertEqual(n['documentos'], anterior['documentos'])
        eventos = {e['id']: e for e in publicacion.proyectar(n)['eventos']}
        self.assertEqual({k: [f['fuente'] for f in e['fuentes']] for k, e in eventos.items()},
                         {s['desde']: ['fca'], s['hasta']: ['rfea']})
        self.assertEqual(nucleo_r2.unir(n, nucleo_r2.partir(n)), n)

    def test_es_idempotente_y_una_cosecha_no_la_deshace(self):
        anterior, rfea, fca, s = self.unidas()
        n, _ = conciliacion.separar(anterior, [s])
        self.assertEqual(conciliacion.separar(n, [s])[1][0]['estado'], 'ya separada')
        for p in (rfea, fca, rfea):
            n = atletismo.importar(n, p, '2026-11-05T20:00:00+01:00')
        self.assertEqual(self.destino(n, 'rfea', '69339'), s['hasta'])
        self.assertEqual(self.destino(n, 'fca', '113279'), s['desde'])
        self.assertEqual(len(publicacion.proyectar(n)['eventos']), 2)

    def test_almacen_exige_la_separacion_registrada_tal_cual(self):
        anterior, _, _, s = self.unidas()
        n, _ = conciliacion.separar(anterior, [s])
        with patch.object(c, 'separaciones', return_value=[s]):
            self.assertTrue(almacen_nucleo.planificar(anterior, n))
        for registro in ([], [{**s, 'hasta': 'otra'}]):
            with patch.object(c, 'separaciones', return_value=registro):
                with self.assertRaisesRegex(ValueError, 'revisión explícita'):
                    almacen_nucleo.planificar(anterior, n)

    def test_falla_ante_un_destino_o_dependencias_no_revisados(self):
        anterior, _, _, s = self.unidas()
        with self.assertRaisesRegex(ValueError, 'destino inesperado'):
            conciliacion.separar(anterior, [{**s, 'desde': 'otra', 'hasta': 'tercera'}])
        n = deepcopy(anterior)
        destino = {'tipo': 'evento', 'id': s['desde']}
        n['participaciones']['x'] = {'id': 'x', 'evento': destino, 'slot': 'a', 'participante': None}
        with patch.object(nucleo, 'validar'):
            with self.assertRaisesRegex(ValueError, 'participaciones'):
                conciliacion.separar(n, [s])

    def test_una_separacion_sin_otra_referencia_no_deja_la_cita_vacia(self):
        anterior, _, _, s = self.unidas()
        n = deepcopy(anterior)
        for r in n['referencias'].values():
            if r['proveedor'] == 'fca' and r['tipo_externo'] == 'competicion':
                r['destino'] = {'tipo': 'evento', 'id': s['hasta']}
        with patch.object(nucleo, 'validar'):
            with self.assertRaisesRegex(ValueError, 'sin referencias'):
                conciliacion.separar(n, [s])

    def test_la_relacion_revisada_no_reabre_issues(self):
        anterior, _, _, s = self.unidas()
        n, _ = conciliacion.separar(anterior, [s])
        with patch.object(c, 'separaciones', return_value=[s]):
            self.assertEqual(c.incidencias(n), [])



if __name__ == '__main__':
    unittest.main()
