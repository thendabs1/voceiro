"""Núcleo sin historial: se guarda lo vigente y lo que una decisión vigente necesita."""

from contextlib import closing
from copy import deepcopy
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from agenda import almacen, feb, madrid, nucleo, presencia, turso
from agenda.compactar import compactar
from agenda.publicacion import proyectar
from agenda.transicion import ampliar
from test_agenda import construir, ficha, AHORA, DESPUES
from test_calendario_cultura import muestra as muestra_cultura
from test_calendario_nucleo import destino, importar_feb, muestra, SIGUIENTE
from test_calendario_turso import Servidor


GENERADO = '2026-10-27T00:00:00+00:00'
TERCERO = '2026-10-27T12:00:00+01:00'


def con_madrid(filas, anterior=None, observado=AHORA):
    calendario = anterior or ampliar(construir([ficha()]))
    calendario = deepcopy(calendario)
    calendario['nucleo'] = madrid.importar(calendario['nucleo'], filas, observado)
    return calendario


def madrid_cambiado():
    filas = deepcopy(muestra_cultura('madrid'))
    filas[0]['TITULO'] += ' (cambio de título)'
    return filas


class Compactar(unittest.TestCase):
    def test_retira_versiones_sustituidas_y_conserva_identidad_y_publicacion(self):
        a = importar_feb()
        x = muestra('feb-revisada.json')
        x['partidos'][0]['fecha_hora'] = '27/10/2026 - 19:30'
        b = feb.importar(a, x, SIGUIENTE)
        c = compactar(b)
        self.assertLess(len(c['observaciones']), len(b['observaciones']))
        self.assertEqual(c['documentos'].keys(), {o['documento'] for o in c['observaciones'].values()})
        self.assertEqual(nucleo.ultimas(c), nucleo.ultimas(b))
        fijadas = ({s['seleccion'].get('observacion') for s in b['selecciones'].values()}
                   | {r['observacion'] for r in b['resultados'].values()}
                   | {k['observacion'] for k in b['clasificaciones'].values()})
        self.assertLessEqual(c['observaciones'].keys(), nucleo.ultimas(b) | fijadas)
        for coleccion in ('referencias', 'entidades', 'selecciones', 'resultados', 'clasificaciones'):
            self.assertEqual(c[coleccion].keys(), b[coleccion].keys())
        self.assertEqual(proyectar(c, generado=GENERADO), proyectar(b, generado=GENERADO))
        self.assertEqual(compactar(c), c)

    def test_conserva_empates_del_mismo_instante(self):
        n = importar_feb()
        o = next(n['observaciones'][i] for i in sorted(nucleo.ultimas(n))
                 if 'programacion' in n['observaciones'][i]['bloques'])
        r = n['referencias'][o['referencia']]
        e = n['entidades'][nucleo.clave(r['destino'])]
        c = nucleo.Constructor(n)
        doc = c.documento('feb', {'traduccion': 'otra ficha del mismo instante'})
        bloques = {k: v for k, v in o['bloques'].items() if k not in ('nombres', 'clase')}
        _, empate = c.entidad(r['proveedor'], r['tipo_externo'], r['id_externo'], r['contexto'],
                              e['tipo'], e['clase'], {'gl': 'Partido'}, doc, '/traduccion',
                              o['ultima_observacion'], bloques)
        n = c.terminar()
        compactado = compactar(n)
        self.assertIn(o['id'], compactado['observaciones'])
        self.assertIn(empate, compactado['observaciones'])

    def test_una_traduccion_omitida_despues_sigue_publicada(self):
        n = importar_feb()
        o = next(n['observaciones'][i] for i in sorted(nucleo.ultimas(n))
                 if 'programacion' in n['observaciones'][i]['bloques'])
        r = n['referencias'][o['referencia']]
        e = n['entidades'][nucleo.clave(r['destino'])]
        bloques = {k: v for k, v in o['bloques'].items() if k not in ('nombres', 'clase')}
        for observado, nombres in ((SIGUIENTE, {'es': 'Partido', 'eu': 'Partida'}), (TERCERO, {'es': 'Partido'})):
            c = nucleo.Constructor(n)
            doc = c.documento('feb', {'nombres': nombres})
            c.entidad(r['proveedor'], r['tipo_externo'], r['id_externo'], r['contexto'],
                      e['tipo'], e['clase'], nombres, doc, '/nombres', observado, bloques)
            n = c.terminar()
        compactado = compactar(n)
        k = nucleo.clave(r['destino'])
        self.assertEqual(proyectar(compactado, generado=GENERADO)['entidades'][k]['nombres']['eu'], 'Partida')
        self.assertEqual(proyectar(compactado, generado=GENERADO), proyectar(n, generado=GENERADO))

    def test_conserva_la_observacion_que_sostiene_un_conflicto(self):
        a = importar_feb()
        d = destino(a, 'partido', '2522807')
        c = nucleo.Constructor(a)
        doc = c.documento('feb', {'senal': 'otra referencia comprobada'})
        original = nucleo.seleccionar(a, d, 'programacion')
        distinta = deepcopy(original['valor'])
        distinta['cuando']['inicio']['hora_local'] = '22:00:00'
        c.entidad('feb', 'contraste', '1', {}, 'evento', 'encuentro', {'es': 'Partido'},
                  doc, '/senal', SIGUIENTE, {'programacion': distinta}, identidad=d['id'])
        b = c.terminar()
        # La fuente original cambia otra vez: siguen en desacuerdo y se mantiene el valor aceptado.
        x = muestra('feb-revisada.json')
        x['partidos'][0]['fecha_hora'] = '27/10/2026 - 19:30'
        b = feb.importar(b, x, TERCERO)
        seleccion = nucleo.seleccionar(b, d, 'programacion')
        self.assertTrue(seleccion['conflicto'])
        self.assertEqual(seleccion['valor'], original['valor'])
        self.assertNotIn(seleccion['observacion'], nucleo.ultimas(b))
        compactado = compactar(b)
        self.assertIn(seleccion['observacion'], compactado['observaciones'])
        recalculado = deepcopy(compactado)
        nucleo.recalcular_selecciones(recalculado)
        self.assertEqual(recalculado['selecciones'], compactado['selecciones'])

    def test_conserva_solo_el_inventario_vigente(self):
        n = con_madrid(muestra_cultura('madrid'))['nucleo']
        ids = sorted(r['id_externo'] for r in n['referencias'].values()
                     if r['proveedor'] == 'madrid' and r['tipo_externo'] == madrid.TIPO_EXTERNO)
        n = presencia.registrar(n, 'madrid', ids, AHORA, madrid.URL)
        anterior = n['fuentes']['madrid']['respuesta_completa']['documento']
        n = presencia.registrar(n, 'madrid', ids[:1], DESPUES, madrid.URL, aceptar_caida=True)
        vigente = n['fuentes']['madrid']['respuesta_completa']['documento']
        compactado = compactar(n)
        self.assertIn(vigente, compactado['documentos'])
        self.assertNotIn(anterior, compactado['documentos'])
        self.assertEqual(presencia.referencias_ausentes(compactado), presencia.referencias_ausentes(n))


class GuardarSinHistorial(unittest.TestCase):
    def test_sqlite_borra_versiones_y_repetir_no_escribe(self):
        a = con_madrid(muestra_cultura('madrid'))
        b = con_madrid(madrid_cambiado(), a, DESPUES)
        self.assertLess(len(compactar(b['nucleo'])['observaciones']), len(b['nucleo']['observaciones']))
        with tempfile.TemporaryDirectory() as tmp:
            ruta = Path(tmp) / 'agenda.sqlite'
            with almacen.abrir(ruta) as db:
                almacen.guardar(db, a)
            with almacen.abrir(ruta) as db:
                almacen.guardar(db, b, solo_nucleo=True)
            with almacen.abrir(ruta) as db:
                guardado = almacen.cargar(db)
                self.assertEqual(guardado['nucleo'], compactar(b['nucleo']))
                self.assertEqual(db.execute('SELECT count(*) FROM agenda_observaciones').fetchone()[0],
                                 len(guardado['nucleo']['observaciones']))
                self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
                antes = db.total_changes
                almacen.guardar(db, b, solo_nucleo=True)
                self.assertEqual(db.total_changes, antes)


class CargaPaginadaTurso(unittest.TestCase):
    def setUp(self):
        self.servidor = Servidor()
        self.addCleanup(self.servidor.db.close)
        parche = patch('turso_http.urlopen', self.servidor.abrir)
        parche.start()
        self.addCleanup(parche.stop)

    def nuevo(self):
        remoto = turso.Almacen('libsql://agenda.test', 'token-simulado')
        remoto.inicializar()
        remoto.cargar()
        return remoto

    def test_paginas_pequenas_reconstruyen_el_mismo_estado_sin_historial(self):
        a = con_madrid(muestra_cultura('madrid'))
        b = con_madrid(madrid_cambiado(), a, DESPUES)
        remoto = self.nuevo()
        remoto.guardar(a)
        remoto.guardar(b, solo_nucleo=True)
        with patch.object(turso, 'PAGINA', 3), patch.object(turso, 'PAGINA_DOCUMENTOS', 2):
            peticiones = self.servidor.peticiones
            guardado = self.nuevo().cargar()
            self.assertGreater(self.servidor.peticiones - peticiones, 20)
        self.assertEqual(guardado['nucleo'], compactar(b['nucleo']))
        self.assertEqual(self.servidor.db.execute('SELECT count(*) FROM agenda_observaciones').fetchone()[0],
                         len(guardado['nucleo']['observaciones']))

    def test_otro_escritor_durante_la_carga_la_invalida(self):
        remoto = self.nuevo()
        remoto.guardar(con_madrid(muestra_cultura('madrid')))
        original = turso.Almacen._paginas

        def con_escritor(almacen_, tabla):
            if tabla == 'agenda_documentos':
                self.servidor.db.execute('UPDATE agenda_esquema SET revision=revision+1 WHERE id=1')
            return original(almacen_, tabla)

        with patch.object(turso.Almacen, '_paginas', con_escritor):
            with self.assertRaises(turso.ConflictoCalendario):
                turso.Almacen('libsql://agenda.test', 'token-simulado').cargar()


if __name__ == '__main__':
    unittest.main()
