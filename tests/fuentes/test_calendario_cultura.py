"""Agendas culturales y relaciones públicas: muestras retenidas, sin red."""

from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from agenda import almacen, almacen_nucleo, kulturklik, madrid, nucleo, recogida, tiempos
from agenda.publicacion import proyectar
from agenda.transicion import ampliar
from calendario import main
from test_agenda import construir, ficha


MUESTRAS = Path(__file__).with_name('muestras_calendario')
AHORA = '2026-10-25T12:00:00+01:00'
LUEGO = '2026-10-26T12:00:00+01:00'


def muestra(nombre):
    return json.loads((MUESTRAS / (nombre + '.json')).read_text())


class AgendasCulturales(unittest.TestCase):
    def test_madrid_identidad_recinto_y_funciones_sin_expansion(self):
        filas = muestra('madrid')
        n = madrid.importar(None, filas, AHORA)
        p = proyectar(n)
        self.assertEqual(len(p['eventos']), 4)
        self.assertTrue(any(r['tipo'] == 'se_celebra_en' for r in p['relaciones']))
        largo = next(e for e in p['eventos'] if e['nombres']['es'] == '1984')
        c = largo['programacion']['valor']['cuando']
        self.assertEqual(c['dias_semana'], [1, 2, 3, 4, 5, 6])
        self.assertIsNone(c['inicio']['hora_local'])
        self.assertFalse(tiempos.en_intervalo(c, '2027-05-17', '2027-05-18'))  # lunes
        self.assertTrue(tiempos.en_intervalo(c, '2027-05-18', '2027-05-19'))
        # Cambian título, fecha e índice CKAN, pero se conserva ID-EVENTO.
        cambio = deepcopy(filas)
        cambio[0].update(TITULO='Título revisado', FECHA='2027-01-28 00:00:00.0', **{'FECHA-FIN': '2027-01-28 23:59:00.0', '_id': 999})
        b = madrid.importar(n, cambio, LUEGO)
        self.assertEqual(n['entidades'].keys(), b['entidades'].keys())
        self.assertGreater(len(b['observaciones']), len(n['observaciones']))
        # El índice de fila CKAN, la descripción o el precio no son evidencia de la cita.
        ruido = deepcopy(filas)
        for i, f in enumerate(ruido):
            f.update(_id=1000 + i, DESCRIPCION='Texto nuevo', PRECIO='5 euros')
        c = madrid.importar(n, ruido, LUEGO)
        self.assertEqual(c['documentos'].keys(), n['documentos'].keys())
        self.assertEqual(c['observaciones'].keys(), n['observaciones'].keys())

    def test_madrid_no_acredita_obras_y_suspende_las_guardadas(self):
        filas = muestra('madrid')
        n = madrid.importar(None, filas, AHORA)
        self.assertFalse(any(e['tipo'] == 'actividad' for e in n['entidades'].values()))
        # Núcleo guardado por la versión anterior, que unía cada evento a su URL-ACTIVIDAD.
        c = nucleo.Constructor(n)
        for fila in filas:
            ficha_madrid = madrid.identidad_url(fila.get('URL-ACTIVIDAD'))
            if not ficha_madrid:
                continue
            evento = next(r['destino'] for r in c.n['referencias'].values()
                          if r['tipo_externo'] == 'ID-EVENTO' and r['id_externo'] == str(fila['ID-EVENTO']))
            evidencia = c.n['entidades'][nucleo.clave(evento)]['evidencias'][-1]
            a, _ = c.entidad(madrid.FUENTE, 'actividad_vgnextoid', ficha_madrid, {}, 'actividad', 'ficha',
                {'es': fila['TITULO-ACTIVIDAD']}, c.n['observaciones'][evidencia]['documento'],
                '/URL-ACTIVIDAD', AHORA)
            c.relacion('celebracion_de', evento, a, evidencia)
        antiguo = c.terminar()
        # Fila sin cambios: la observación del evento es la misma y seguiría vigente.
        nuevo = madrid.importar(antiguo, filas, LUEGO)
        celebraciones = [r for r in nuevo['relaciones'].values() if r['tipo'] == 'celebracion_de']
        self.assertEqual(len(celebraciones), 2)
        self.assertTrue(all(r['suspendida'] for r in celebraciones))
        self.assertTrue(almacen_nucleo.planificar(antiguo, nuevo))
        self.assertFalse(any(k.startswith('actividad:') for e in proyectar(nuevo)['eventos']
                             for k in e['objetivos']))
        self.assertEqual(almacen_nucleo.planificar(nuevo, madrid.importar(nuevo, filas, LUEGO)), [])

    def test_madrid_exclusiones_y_horas_cero_no_inventan_citas(self):
        fila = muestra('madrid')[0]
        p = madrid.programacion(fila)
        self.assertEqual(p['cuando']['inicio']['hora_local'], '18:00')
        self.assertIsNotNone(p['cuando']['inicio']['instante'])
        fila.update(**{'LARGA-DURACION': '1', 'DIAS-EXCLUIDOS': '27/1/2027;28/1/2027;'})
        c = madrid.programacion(fila)['cuando']
        self.assertFalse(tiempos.en_intervalo(c, '2027-01-27', '2027-01-28'))
        self.assertIsNone(c['inicio']['hora_local'])
        fila['DIAS-EXCLUIDOS'] += '11;'
        c = madrid.programacion(fila)['cuando']
        self.assertEqual(c['restricciones_pendientes'], ['11'])
        self.assertEqual(c['inicio']['certeza_fecha'], 'provisional')
        self.assertFalse(tiempos.en_intervalo(c, '2027-01-27', '2027-01-28'))

    def test_kulturklik_id_bilingue_horarios_textuales_y_nora_separado(self):
        n = kulturklik.importar(None, muestra('kulturklik'), AHORA)
        p = proyectar(n)
        self.assertEqual(len(p['eventos']), 3)
        evento = next(e for e in p['eventos'] if 'Anastacia' in e['nombres']['es'])
        self.assertIn('eu', evento['nombres'])
        c = evento['programacion']['valor']['cuando']
        self.assertEqual(c['inicio']['fecha'], '2026-10-25')
        self.assertIsNone(c['inicio']['instante'])
        self.assertIsNone(c['inicio']['hora_local'])
        self.assertEqual(c['horario_textual'], {'es': '21:00', 'eu': '21:00'})
        municipio = next(e for e in n['entidades'].values() if e['tipo'] == 'territorio' and e['nombres']['es'] == 'Pamplona/Iruña')
        self.assertIn(nucleo.clave(municipio), evento['objetivos'])
        referencia = next(r for r in n['referencias'].values() if r['destino'] == nucleo.objetivo('territorio', municipio['id']))
        self.assertEqual(referencia['tipo_externo'], 'municipio_nora')
        self.assertEqual(referencia['id_externo'], '476')
        self.assertEqual(referencia['contexto'], {'provincia_nora': '31'})
        self.assertFalse(any(e['tipo'] == 'lugar' for e in n['entidades'].values()))

    def test_id_duplicado_con_datos_distintos_rechaza_toda_la_importacion(self):
        for modulo in (madrid, kulturklik):
            filas = muestra(modulo.FUENTE)
            copia = deepcopy(filas[0])
            copia['TITULO' if modulo == madrid else 'nameEs'] = 'Otro'
            with self.assertRaisesRegex(ValueError, 'repetido'):
                modulo.importar(None, [filas[0], copia], AHORA)

    def test_cli_sqlite_conserva_piloto_y_reabre_las_dos_fuentes(self):
        with tempfile.TemporaryDirectory() as tmp:
            ruta = Path(tmp) / 'agenda.sqlite'
            piloto = construir([ficha()])
            with almacen.abrir(ruta) as db:
                almacen.guardar(db, piloto)
            main(['--db', str(ruta), '--entrada-madrid', str(MUESTRAS / 'madrid.json'),
                  '--entrada-kulturklik', str(MUESTRAS / 'kulturklik.json')])
            with almacen.abrir(ruta) as db:
                guardado = almacen.cargar(db)
                self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
            self.assertEqual({k:v for k,v in guardado.items() if k != 'nucleo'}, piloto)
            self.assertEqual(len(proyectar(guardado['nucleo'])['eventos']), 8)
            self.assertEqual(len(proyectar(guardado['nucleo'], ['madrid'])['eventos']), 4)
            self.assertNotIn('kulturklik', json.dumps(proyectar(guardado['nucleo'], ['madrid'])))

    def test_recinto_a_municipio_se_consulta_y_publica_con_evidencia(self):
        n = ampliar(construir([ficha()]))['nucleo']
        p = proyectar(n)
        municipio = next(e for e in p['entidades'].values() if e['tipo'] == 'territorio')
        recinto = next(e for e in p['entidades'].values() if e['tipo'] == 'lugar')
        self.assertTrue(any(r['tipo'] == 'ubicado_en' and r['origen']['id'] == recinto['id'] for r in p['relaciones']))
        # Solo el recinto acredita la cadena; no depender del enlace directo del evento.
        for r in n['relaciones'].values():
            if r['tipo'] == 'se_celebra_en' and r['destino']['tipo'] == 'territorio':
                r['suspendida'] = True
        self.assertEqual(len(nucleo.consultar(n, '2026-10-26', '2026-10-27', territorio=nucleo.objetivo('territorio', municipio['id']))), 1)
        self.assertIn(nucleo.clave(municipio), proyectar(n)['eventos'][0]['objetivos'])

    def test_fallo_en_segunda_agenda_no_escribe_la_primera(self):
        with tempfile.TemporaryDirectory() as tmp:
            ruta = Path(tmp) / 'agenda.sqlite'
            piloto = construir([ficha()])
            with almacen.abrir(ruta) as db:
                almacen.guardar(db, piloto)
            invalida = Path(tmp) / 'invalida.json'
            invalida.write_text('[{"id":"sin-nombre"}]')
            with self.assertRaisesRegex(ValueError, 'sin identidad o nombre'):
                main(['--db', str(ruta), '--entrada-madrid', str(MUESTRAS / 'madrid.json'),
                      '--entrada-kulturklik', str(invalida)])
            with almacen.abrir(ruta) as db:
                self.assertEqual(almacen.cargar(db), piloto)


class Paginacion(unittest.TestCase):
    def test_madrid_completa_paginas_antes_de_filtrar_ventana(self):
        filas = muestra('madrid')[:2]
        paginas = [json.dumps({'success': True, 'result': {'total': 2, 'records': [fila]}}) for fila in filas]
        with patch('agenda.recogida.descargar', side_effect=paginas) as descargar:
            seleccion, _ = recogida.cultura('madrid', '2027-01-27', '2027-01-27')
        self.assertEqual(len(seleccion), 1)
        self.assertEqual(descargar.call_count, 2)
        self.assertIn('offset=1', descargar.call_args.args[0])

    def test_kulturklik_paginado_sin_perder_ni_duplicar_eventos(self):
        filas = muestra('kulturklik')
        paginas = [json.dumps({'totalItems': 3, 'currentPage': i + 1, 'items': [f]}) for i, f in enumerate(filas)]
        with patch('agenda.recogida.descargar', side_effect=paginas):
            seleccion, _ = recogida.cultura('kulturklik', '2026-10-25', '2026-10-25')
        self.assertEqual(len(seleccion), 3)

    def test_pagina_repetida_cambio_de_total_y_descarga_cortada_no_dan_resultado_parcial(self):
        fila = muestra('kulturklik')[0]
        primera = {'totalItems': 2, 'currentPage': 1, 'items': [fila]}
        for segunda in ({'totalItems': 2, 'currentPage': 2, 'items': [fila]},
                        {'totalItems': 3, 'currentPage': 2, 'items': []},
                        {'totalItems': 2, 'currentPage': 2, 'items': []}):
            with patch('agenda.recogida.descargar', side_effect=[json.dumps(primera), json.dumps(segunda)]):
                with self.assertRaises(ValueError):
                    recogida.cultura('kulturklik')
