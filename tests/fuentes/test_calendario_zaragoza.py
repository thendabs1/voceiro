"""Zaragoza: obra con funciones, recintos con coordenadas, inventario por función y paginación."""

import json
import unittest
from unittest.mock import patch

from agenda import nucleo, presencia, recogida, zaragoza
from agenda.publicacion import proyectar
from test_calendario_cultura import AHORA, LUEGO, muestra
from test_limites import provincias


class Zaragoza(unittest.TestCase):
    def test_funciones_obra_recinto_y_horarios(self):
        filas = muestra('zaragoza')
        n = zaragoza.importar(None, filas, AHORA)
        p = proyectar(n)
        self.assertEqual(len(p['eventos']), sum(len(f['subEvent']) for f in filas))
        por_titulo = {}
        for e in p['eventos']:
            por_titulo.setdefault(e['nombres']['es'], []).append(e)
        # Solo la obra con varias funciones crea actividad; cada función la alcanza.
        obras = [e for e in p['entidades'].values() if e['tipo'] == 'actividad']
        self.assertEqual(len(obras), 1)
        visitas = por_titulo['VISITAS TEATRALIZADAS LA HUELLA DEL MUDÉJAR']
        self.assertEqual(len(visitas), 4)
        self.assertTrue(all(nucleo.clave(obras[0]) in e['objetivos'] for e in visitas))
        nomina, = por_titulo['Next level: Entiende tu nómina']
        cuando = nomina['programacion']['valor']['cuando']
        self.assertEqual(cuando['inicio']['hora_local'], '17:00')
        self.assertTrue(cuando['inicio']['instante'].endswith('+01:00'))
        # «Desarrollo personal» no acredita tema; el curso sigue publicado con su formato.
        self.assertEqual((nomina['temas'], nomina['formatos']), ([], ['curso-taller']))
        cierzo, = por_titulo['CIERZO Y SED, EL CORAZON DE IBERIA']
        cuando = cierzo['programacion']['valor']['cuando']
        self.assertEqual(cierzo['programacion']['valor']['modalidad'], 'intervalo')
        self.assertEqual(cuando['inicio']['precision'], 'fecha')
        self.assertTrue(cuando['dias_semana'])
        self.assertEqual(cuando['horario_textual'], 'Martes 17:00; Domingo 21:30; Lunes 21:15')
        self.assertEqual(cuando['dias_semana'], [0, 1, 6])
        futbol, = por_titulo['Fútbol sala Corona 26-27']
        self.assertEqual(futbol['temas'], ['deportes'])
        recintos = {e['nombres']['es']: e for e in p['entidades'].values() if e['tipo'] == 'lugar'}
        self.assertEqual(len(recintos), 4)
        with_coords = [k for k, o in n['observaciones'].items() if 'coordenadas' in o['bloques']]
        self.assertEqual(len({n['observaciones'][k]['referencia'] for k in with_coords}), 3)
        self.assertEqual(n['fuentes']['zaragoza']['atribucion'][:42], 'Origen de los datos: Ayuntamiento de Zarag')
        self.assertTrue(all(o['bloques']['actualizado_origen'] for o in n['observaciones'].values()
                            if 'programacion' in o['bloques']))
        # Repetir la misma respuesta no crea observaciones ni documentos.
        otra = zaragoza.importar(n, filas, LUEGO)
        self.assertEqual(otra['observaciones'].keys(), n['observaciones'].keys())
        self.assertEqual(otra['documentos'].keys(), n['documentos'].keys())

    def test_inventario_por_funcion_retira_una_sesion_sin_tocar_la_obra(self):
        filas = muestra('zaragoza')
        n = zaragoza.importar(None, filas, AHORA)
        ids = zaragoza.inventario(filas)
        self.assertEqual(len(ids), 7)
        n = presencia.registrar(n, 'zaragoza', ids, AHORA, zaragoza.URL)
        quitada = filas[1]['subEvent'][0]['id']
        n = presencia.registrar(n, 'zaragoza', [i for i in ids if i != str(quitada)], LUEGO, zaragoza.URL)
        p = proyectar(n)
        self.assertEqual(len(p['eventos']), 6)
        self.assertEqual(sum(e['tipo'] == 'actividad' for e in p['entidades'].values()), 1)

    def test_paginacion_rows_start_ordenada_y_errores(self):
        filas = muestra('zaragoza')
        paginas = [json.dumps({'totalCount': 4, 'start': 0, 'rows': 500, 'result': filas})]
        with patch('agenda.recogida.descargar', side_effect=paginas) as descargar:
            seleccion, url, ids = recogida.cultura('zaragoza', '2026-10-27', '2026-10-27')
        self.assertIn('sort=id+asc', descargar.call_args.args[0])
        self.assertIn('srsname=wgs84', descargar.call_args.args[0])
        self.assertEqual(ids, zaragoza.inventario(filas))
        self.assertEqual(len(seleccion), 3)  # La visita de septiembre–octubre 30 sí; el resto cae fuera.
        with patch('agenda.recogida.descargar', return_value=json.dumps(
                {'totalCount': 4, 'start': 500, 'rows': 500, 'result': filas})):
            with self.assertRaisesRegex(ValueError, 'Página Zaragoza inesperada'):
                recogida.cultura('zaragoza')

    def test_cambio_de_funcion_no_es_evidencia_del_recinto_ni_de_la_obra(self):
        n = zaragoza.importar(None, muestra('zaragoza'), AHORA)
        compartidas = lambda m: {k: list(e['evidencias']) for k, e in m['entidades'].items()
                                 if e['tipo'] in ('lugar', 'actividad')}
        filas = muestra('zaragoza')
        visitas = next(f for f in filas if f['id'] == 312997)
        visitas['lastUpdated'] = '2026-10-26T09:00:00'
        visitas['subEvent'][0]['startDate'] = visitas['subEvent'][0]['endDate'] = '2026-09-26T00:00:00'
        b = zaragoza.importar(n, filas, LUEGO)
        self.assertGreater(len(b['observaciones']), len(n['observaciones']))
        # Cuatro funciones, un recinto: una sola evidencia, que no cambia con ellas.
        self.assertEqual(compartidas(b), compartidas(n))
        self.assertTrue(all(len(v) == 1 for v in compartidas(n).values()))
        # La fecha de actualización del origen se publica una vez por fuente: la más reciente.
        self.assertEqual(proyectar(b)['fuentes']['zaragoza']['actualizado_origen'],
                         max(f['lastUpdated'] for f in filas))
        self.assertNotIn('actualizado_origen', json.dumps(proyectar(b)['eventos']))

    def test_cita_conocida_aplazada_fuera_de_la_ventana_se_actualiza(self):
        n = zaragoza.importar(None, muestra('zaragoza'), AHORA)
        filas = muestra('zaragoza')
        nomina = next(f for f in filas if f['id'] == 312317)
        for d in (nomina, nomina['subEvent'][0]):
            d['startDate'] = d['endDate'] = '2027-01-20T00:00:00'
        pagina = json.dumps({'totalCount': 4, 'start': 0, 'rows': 500, 'result': filas})
        conocidos = {r['id_externo'] for r in n['referencias'].values() if r['tipo_externo'] == 'subevent_id'}
        with patch('agenda.recogida.descargar', return_value=pagina):
            sin, _, _ = recogida.cultura('zaragoza', '2026-10-27', '2026-10-27')
            seleccion, url, _ = recogida.cultura('zaragoza', '2026-10-27', '2026-10-27', conocidos)
        self.assertNotIn(nomina, sin)
        self.assertIn(nomina, seleccion)
        p = proyectar(zaragoza.importar(n, seleccion, LUEGO, url))
        e, = [e for e in p['eventos'] if e['nombres']['es'] == 'Next level: Entiende tu nómina']
        self.assertEqual(e['programacion']['valor']['cuando']['inicio']['fecha'], '2027-01-20')

    def test_recintos_se_ubican_por_su_punto(self):
        import tempfile
        from shared.territorios.limites import Limites
        with tempfile.TemporaryDirectory() as tmp:
            m, _ = provincias(tmp, {'50': [('50297', -1.1, 41.5, 0.4)]})
            p = proyectar(zaragoza.importar(None, muestra('zaragoza'), AHORA),
                          limites_municipales=Limites(m, tmp))
        estados = {e['nombres']['es']: e.get('ubicacion_estado') for e in p['entidades'].values()
                   if e['tipo'] == 'lugar'}
        self.assertEqual(sorted(estados.values(), key=str), [None, 'resuelto', 'resuelto', 'resuelto'])
        con_municipio = [e for e in p['eventos'] if e['territorios']]
        self.assertEqual(len(con_municipio), 6)  # La temporada de fútbol sala no trae geometría.
        self.assertTrue(all(e['territorios'][0]['territorio'] == 'es:municipio:50297' for e in con_municipio))

    def test_rechaza_obra_sin_identidad_y_funcion_sin_id(self):
        fila = muestra('zaragoza')[0]
        with self.assertRaisesRegex(ValueError, 'sin identidad o título'):
            zaragoza.importar(None, [{**fila, 'id': None}], AHORA)
        otra = muestra('zaragoza')[2]
        otra['subEvent'][0]['openingHours'] = [{'dayOfWeek': 'Sin determinar', 'startTime': '17:00'}]
        cuando = zaragoza.programacion(otra['subEvent'][0], otra)['cuando']
        self.assertNotIn('dias_semana', cuando)
        self.assertEqual(cuando['horario_textual'], 'Sin determinar 17:00')
        otra['subEvent'][0]['openingHours'][0]['dayOfWeek'] = 'Festivo'
        with self.assertRaisesRegex(ValueError, 'Día de semana'):
            zaragoza.programacion(otra['subEvent'][0], otra)
        fila['subEvent'][0]['id'] = None
        with self.assertRaisesRegex(ValueError, 'Función Zaragoza sin identidad'):
            zaragoza.importar(None, [fila], AHORA)
