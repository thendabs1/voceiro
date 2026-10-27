"""Zaragoza: obra con funciones, recintos con coordenadas, inventario por función y paginación."""

import json
import unittest
from unittest.mock import patch

from agenda import nucleo, presencia, recogida, zaragoza
from agenda.publicacion import proyectar
from test_calendario_cultura import AHORA, LUEGO, muestra


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
        self.assertEqual(nomina['temas'], ['cultura'])
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
