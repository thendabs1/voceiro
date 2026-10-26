"""Casos del contrato v2 contra muestras retenidas y SQL real, sin red."""

from contextlib import closing
from copy import deepcopy
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from agenda import almacen, almacen_nucleo, espn_tenis, feb, nucleo, tiempos, vidmar_f1
from agenda.transicion import ampliar
from agenda.turso import Almacen, ConflictoCalendario
from agenda.modelo import integrar
from calendario import main
from test_agenda import construir, ficha, AHORA, DESPUES
from test_calendario_almacen import ics, DIAS
from test_calendario_turso import Servidor


MUESTRAS = Path(__file__).with_name('muestras_calendario')
OBSERVADO = '2026-10-25T12:00:00+01:00'
SIGUIENTE = '2026-10-26T12:00:00+01:00'


def muestra(nombre):
    return json.loads((MUESTRAS / nombre).read_text())


def importar_feb():
    return feb.importar(None, muestra('feb-revisada.json'), OBSERVADO)


def importar_tenis():
    return espn_tenis.importar(None, muestra('espn-wta.json'), 'wta', OBSERVADO)


def destino(n, tipo_externo, externo, contexto=None):
    return next(r['destino'] for r in n['referencias'].values()
                if r['tipo_externo'] == tipo_externo and r['id_externo'] == externo
                and (contexto is None or r['contexto'] == contexto))


class ModeloDeportivo(unittest.TestCase):
    def test_feb_competicion_edicion_horario_sin_zona_resultado_y_clasificacion(self):
        n = importar_feb()
        partido = destino(n, 'partido', '2522807')
        seleccion = nucleo.seleccionar(n, partido, 'programacion')['valor']
        self.assertEqual(seleccion['cuando']['inicio']['fecha'], '2026-10-24')
        self.assertEqual(seleccion['cuando']['inicio']['hora_local'], '17:00:00')
        self.assertIsNone(seleccion['cuando']['inicio']['instante'])
        self.assertIsNone(seleccion['cuando']['inicio']['zona'])
        self.assertEqual(seleccion['ejecucion'], 'desconocido')
        self.assertEqual(len(n['resultados']), 1)  # El 0-0 provisional no se convierte en resultado.
        r = next(iter(n['resultados'].values()))
        self.assertEqual([l['metricas']['baloncesto.puntos'] for l in r['lineas']], [67, 69])
        self.assertEqual(len(r['parciales']), 4)
        self.assertEqual(r['condicion'], 'desconocido')
        self.assertIsNone(r['ganador'])
        visitante = next(p for p in n['participaciones'].values()
                         if p['evento'] == partido and p['papel'] == 'visitante')
        self.assertIsNone(visitante['participante'])
        self.assertEqual(visitante['literal'], 'HOZONO GLOBAL JAIRIS')
        tabla = next(iter(n['clasificaciones'].values()))
        self.assertIsNone(tabla['jornada'])
        self.assertEqual(tabla['alcance'], 'muestra_parcial')
        self.assertEqual(tabla['filas'][0]['metricas']['baloncesto.porcentaje_victorias'], '100.0')
        competicion = destino(n, 'competicion', '4')
        self.assertEqual(len(nucleo.eventos_alcanzados(n, competicion)), 2)
        self.assertEqual(len(nucleo.consultar(n, '2026-10-24', '2026-10-26', tema='deportes')), 2)
        self.assertEqual([e['entidad']['id'] for e in nucleo.consultar(n, '2026-10-24', '2026-10-25')],
                         [partido['id']])

    def test_ediciones_contextualizadas_no_se_unen_por_anno(self):
        n = importar_feb()
        otra = muestra('feb-revisada.json')
        otra['competicion'] = {'id': '1', 'nombre': 'PRIMERA FEB'}
        otra['fase'] = {'id': 'otra-fase', 'nombre': 'Fase sintética de aceptación'}
        otra['fase']['id'] = '123456'
        otra['partidos'], otra['clasificacion'] = [], None
        n = feb.importar(n, otra, SIGUIENTE)
        a = destino(n, 'temporada', '2026', {'g': '4'})
        b = destino(n, 'temporada', '2026', {'g': '1'})
        self.assertNotEqual(a, b)
        self.assertEqual(nucleo.eventos_alcanzados(n, b), [])

    def test_tenis_individual_dobles_tbd_y_parciales(self):
        n = importar_tenis()
        self.assertEqual(sum(e['tipo'] == 'evento' for e in n['entidades'].values()), 3)
        self.assertEqual(len(n['resultados']), 2)
        parejas = [e for e in n['entidades'].values() if e['clase'] == 'pareja']
        self.assertEqual(len(parejas), 2)
        composiciones = [r for r in n['relaciones'].values() if r['tipo'] == 'compuesta_por']
        self.assertEqual(len(composiciones), 4)
        for r in composiciones:
            self.assertEqual(r['ambito']['tipo'], 'evento')
            self.assertEqual(len(nucleo.eventos_alcanzados(n, r['destino'])), 1)
        doble = destino(n, 'match_uid', 's:850~l:900~e:345-2026~c:185604')
        individual = destino(n, 'match_uid', 's:850~l:900~e:345-2026~c:186929')
        r = next(r for r in n['resultados'].values() if r['evento'] == individual)
        self.assertEqual(len(r['parciales']), 2)
        self.assertEqual([l['metricas'].get('tenis.puntos_desempate')
                          for l in r['parciales'][1]['lineas']], [1, 7])
        self.assertTrue(all(p['papel'] == 'competidor' for p in n['participaciones'].values()))
        # El horario TBD no ocupa el 26 como si la fecha civil estuviera acreditada.
        self.assertEqual(nucleo.consultar(n, '2026-10-26', '2026-10-27'), [])
        self.assertEqual([e['entidad']['id'] for e in nucleo.consultar(n, '2026-10-19', '2026-10-20',
                                                                  tema='deportes')], [doble['id']])

    def test_sin_inventar_personas_desde_un_id_de_pareja(self):
        x = muestra('espn-wta.json')
        grupo = next(g for e in x['events'] for g in e['groupings'] if g['grouping']['id'] == '4')
        del grupo['competitions'][0]['competitors'][0]['roster']['athletes'][0]['guid']
        with self.assertRaisesRegex(ValueError, 'GUID'):
            espn_tenis.importar(None, x, 'wta', OBSERVADO)

    def test_repetir_muestra_no_inventa_observaciones_resultados_ni_identidades(self):
        a = importar_feb()
        self.assertEqual(feb.importar(a, muestra('feb-revisada.json'), OBSERVADO), a)
        b = feb.importar(a, muestra('feb-revisada.json'), SIGUIENTE)
        for campo in ('entidades', 'referencias', 'documentos', 'resultados', 'clasificaciones'):
            self.assertEqual(a[campo], b[campo])
        self.assertEqual(set(a['observaciones']), set(b['observaciones']))
        self.assertEqual({o['ultima_observacion'] for o in b['observaciones'].values()}, {SIGUIENTE})

    def test_uid_y_guid_de_persona_resuelven_la_misma_identidad(self):
        n = importar_tenis()
        uid = destino(n, 'athlete_uid', 's:850~l:900~a:11554')
        guid = destino(n, 'athlete_guid', '748d2ec7-3b73-377b-8056-25351ef72268')
        self.assertEqual(uid, guid)

    def test_una_persona_en_individual_y_pareja_sin_extender_a_su_compannera(self):
        x = muestra('espn-wta.json')
        doble = next(g['competitions'][0] for e in x['events'] for g in e['groupings']
                     if g['grouping']['id'] == '4')
        persona = doble['competitors'][0]['roster']['athletes'][0]
        individual = x['events'][0]['groupings'][0]['competitions'][0]
        individual['competitors'][0]['athlete'] = deepcopy(persona)
        n = espn_tenis.importar(None, x, 'wta', OBSERVADO)
        d = destino(n, 'athlete_guid', persona['guid'])
        self.assertEqual(len(nucleo.eventos_alcanzados(n, d)), 2)
        companera = destino(n, 'athlete_guid', doble['competitors'][0]['roster']['athletes'][1]['guid'])
        self.assertEqual(len(nucleo.eventos_alcanzados(n, companera)), 1)

    def test_cambio_de_hora_conserva_objetivo_historial_y_ausentes(self):
        a = importar_feb()
        x = muestra('feb-revisada.json')
        x['partidos'] = [x['partidos'][0]]
        x['partidos'][0]['fecha_hora'] = '27/10/2026 - 19:30'
        b = feb.importar(a, x, SIGUIENTE)
        self.assertEqual(destino(a, 'partido', '2522807'), destino(b, 'partido', '2522807'))
        self.assertEqual(sum(e['tipo'] == 'evento' for e in b['entidades'].values()), 2)
        self.assertLess(len(a['observaciones']), len(b['observaciones']))
        with self.assertRaisesRegex(ValueError, 'anterior'):
            feb.importar(b, muestra('feb-revisada.json'), OBSERVADO)


class Contrato(unittest.TestCase):
    def test_ciclos_entre_edicion_y_fase_rechazados(self):
        n = importar_feb()
        r = next(r for r in n['relaciones'].values() if r['tipo'] == 'es_parte_de')
        c = nucleo.Constructor(n)
        c.relacion('es_parte_de', r['destino'], r['origen'], r['evidencias'][0])
        with self.assertRaisesRegex(ValueError, 'Ciclo'):
            c.terminar()

    def test_conflictos_no_se_resuelven_por_orden_de_proveedor(self):
        a = importar_feb()
        d = destino(a, 'partido', '2522807')
        c = nucleo.Constructor(a)
        doc = c.documento('feb', {'senal': 'otra referencia comprobada'})
        original = nucleo.seleccionar(a, d, 'programacion')['valor']
        distinta = deepcopy(original)
        distinta['cuando']['inicio']['hora_local'] = '22:00:00'
        _, o = c.entidad('feb', 'contraste', '1', {}, 'evento', 'encuentro', {'es': 'Partido'},
                        doc, '/senal', SIGUIENTE, {'programacion': distinta}, identidad=d['id'])
        b = c.terminar()
        seleccion = nucleo.seleccionar(b, d, 'programacion')
        self.assertTrue(seleccion['conflicto'])
        self.assertEqual(seleccion['valor'], original)
        k = nucleo.identificador('seleccion', d, 'programacion')
        b['politicas'][k] = {'id': k, 'objetivo': d, 'bloque': 'programacion', 'modo': 'referencia',
                            'referencia': b['observaciones'][o]['referencia'], 'motivo': 'Contraste revisado'}
        nucleo.recalcular_selecciones(b)
        nucleo.validar(b)
        self.assertEqual(nucleo.seleccionar(b, d, 'programacion')['valor'], distinta)
        self.assertFalse(nucleo.seleccionar(b, d, 'programacion')['conflicto'])

    def test_metricas_invalidas_ambitos_y_parciales_ajenos_rechazados(self):
        for cambio in ('metrica', 'decimal', 'participacion', 'ciclo', 'ambito'):
            n = importar_feb()
            r = next(iter(n['resultados'].values()))
            if cambio == 'metrica':
                r['lineas'][0]['metricas'] = {'points': 67}
            elif cambio == 'decimal':
                next(iter(n['clasificaciones'].values()))['filas'][0]['metricas'][
                    'baloncesto.porcentaje_victorias'] = 100.0
            elif cambio == 'participacion':
                r['lineas'][0]['participacion'] = next(p['id'] for p in n['participaciones'].values()
                                                      if p['evento'] != r['evento'])
            elif cambio == 'ciclo':
                r['parciales'][0]['padre'] = r['parciales'][0]['id']
            else:
                next(iter(n['clasificaciones'].values()))['ambito'] = r['evento']
            with self.subTest(cambio=cambio), self.assertRaises(ValueError):
                nucleo.validar(n)


class Tiempo(unittest.TestCase):
    def test_dias_exclusivos_y_fin_desconocido(self):
        c = {'inicio': tiempos.extremo('2026-10-24'), 'fin': tiempos.extremo('2026-10-26'),
             'fin_exclusivo': True, 'horario_textual': None}
        self.assertTrue(tiempos.en_intervalo(c, '2026-10-25', '2026-10-26'))
        self.assertFalse(tiempos.en_intervalo(c, '2026-10-26', '2026-10-27'))
        c['fin'] = tiempos.extremo()
        self.assertFalse(tiempos.en_intervalo(c, '2026-10-25', '2026-10-26'))

    def test_cambio_horario_y_desplazamiento_explicito(self):
        with self.assertRaisesRegex(ValueError, 'ambigua'):
            tiempos.validar_extremo(tiempos.extremo('2026-10-25', '02:30:00', 'Europe/Madrid'))
        tiempos.validar_extremo(tiempos.extremo('2026-10-25', '02:30:00', 'Europe/Madrid',
                                               '2026-10-25T02:30:00+02:00'))
        with self.assertRaisesRegex(ValueError, 'inexistente'):
            tiempos.validar_extremo(tiempos.extremo('2026-03-29', '02:30:00', 'Europe/Madrid'))
        with self.assertRaisesRegex(ValueError, 'discrepantes'):
            tiempos.validar_extremo(tiempos.extremo('2026-10-25', '12:00:00', 'Europe/Madrid',
                                                   '2026-10-25T03:00:00+00:00'))

    def test_instante_se_consulta_en_la_zona_del_lector_sin_cambiar_la_fecha_oficial(self):
        e = tiempos.extremo('2026-10-25', '00:30:00', utc='2026-10-25T00:30:00+00:00')
        c = {'inicio': e, 'fin': tiempos.extremo(), 'fin_exclusivo': None}
        self.assertTrue(tiempos.en_intervalo(c, '2026-10-24', '2026-10-25', 'America/New_York'))
        self.assertFalse(tiempos.en_intervalo(c, '2026-10-25', '2026-10-26', 'America/New_York'))
        self.assertEqual(e['fecha'], '2026-10-25')


class Persistencia(unittest.TestCase):
    def test_traducciones_y_alias_antiguo_sin_fusionar_fichas_distintas(self):
        a = construir([ficha()])
        a['vinculos']['cultura-galicia:alias-historico'] = a['eventos'][0]['id']
        b = ampliar(a)
        es = ficha(102, traducionId=101, nid=11, idioma='es', titulo='Una obra')
        c = construir([es], b, DESPUES)
        n = c['nucleo']
        self.assertEqual(n['referencias']['cultura-galicia:alias-historico']['destino']['id'],
                         a['eventos'][0]['id'])
        self.assertEqual(len([e for e in n['entidades'].values() if e['tipo'] == 'actividad']), 2)
        self.assertFalse(any(r['tipo'] == 'celebracion_de' and nucleo.vigente(n, r)
                             for r in n['relaciones'].values()))

    def test_reclasificar_actualiza_los_temas_del_nucleo_sin_reobservar_proveedores(self):
        with tempfile.TemporaryDirectory() as carpeta:
            ruta = Path(carpeta) / 'copia.sqlite'
            a = ampliar(construir([ficha()]))
            with almacen.abrir(ruta) as db:
                almacen.guardar(db, a)
            from agenda.clasificacion import cargar_catalogo
            catalogo = cargar_catalogo()
            catalogo['version'] += 1
            catalogo['correspondencias'][0]['tema'] = 'danza'
            with patch('agenda.clasificacion.cargar_catalogo', return_value=catalogo):
                main(['--db', str(ruta), '--reclasificar'])
            with almacen.abrir(ruta) as db:
                b = almacen.cargar(db)
                self.assertEqual(a['nucleo']['observaciones'], b['nucleo']['observaciones'])
                self.assertEqual(db.execute('SELECT count(*) FROM agenda_recogidas').fetchone()[0], 1)
                self.assertEqual(len(nucleo.consultar(b['nucleo'], '2026-10-26', '2026-10-27', tema='danza')), 1)
                self.assertEqual(nucleo.consultar(b['nucleo'], '2026-10-26', '2026-10-27', tema='teatro'), [])

    def test_migrar_v3_sin_modificar_piloto_y_sql_tipado(self):
        with tempfile.TemporaryDirectory() as carpeta:
            ruta = Path(carpeta) / 'copia.sqlite'
            a = construir([ficha()])
            with almacen.abrir(ruta) as db:
                almacen.guardar(db, a)
                # Simular la base v3 real, sin tablas nuevas.
                for tabla in reversed(list(almacen_nucleo.TABLAS.values())):
                    db.execute(f'DROP TABLE {tabla}')
                db.execute('DROP TABLE agenda_tiempos')
                db.execute('UPDATE agenda_esquema SET version=3')
                revision = db.execute('SELECT revision FROM agenda_esquema').fetchone()[0]
                historial = db.execute('SELECT * FROM agenda_revisiones').fetchall()
            with almacen.abrir(ruta) as db:
                self.assertEqual(almacen.cargar(db), a)
                self.assertEqual(db.execute('SELECT version, revision FROM agenda_esquema').fetchone(),
                                 (4, revision + 1))
                b = ampliar(a)
                b['nucleo'] = feb.importar(b['nucleo'], muestra('feb-revisada.json'), OBSERVADO)
                almacen.guardar(db, b, solo_nucleo=True)
                self.assertEqual(almacen.cargar(db), b)
                self.assertEqual(db.execute('SELECT * FROM agenda_revisiones').fetchall(), historial)
                self.assertEqual(db.execute('SELECT count(*) FROM agenda_recogidas').fetchone()[0], 1)
                partido = destino(b['nucleo'], 'partido', '2522807')
                self.assertEqual(db.execute('SELECT inicio_fecha, inicio_instante FROM agenda_tiempos '
                                            'WHERE objetivo=?', (partido['id'],)).fetchone(),
                                 ('2026-10-24', None))
                self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
                cambios = db.total_changes
                almacen.guardar(db, ampliar(b), solo_nucleo=True)
                self.assertEqual(db.total_changes, cambios)
                with self.assertRaisesRegex(ValueError, 'cliente antiguo'):
                    almacen.guardar(db, a)

    def test_migracion_fallida_v3_revierte_tablas_y_version(self):
        with tempfile.TemporaryDirectory() as carpeta:
            ruta = Path(carpeta) / 'v3.sqlite'
            with almacen.abrir(ruta) as db:
                for tabla in reversed(list(almacen_nucleo.TABLAS.values())):
                    db.execute(f'DROP TABLE {tabla}')
                db.execute('DROP TABLE agenda_tiempos')
                db.execute('UPDATE agenda_esquema SET version=3')
            with self.assertRaises(RuntimeError):
                with almacen.abrir(ruta):
                    raise RuntimeError('Abortar antes de confirmar')
            with closing(sqlite3.connect(ruta)) as db:
                self.assertEqual(db.execute('SELECT version FROM agenda_esquema').fetchone()[0], 3)
                self.assertFalse(db.execute("SELECT name FROM sqlite_master WHERE name='agenda_entidades'").fetchall())

    def test_cli_offline_reabre_exporta_v2_y_no_consulta_proveedores(self):
        with tempfile.TemporaryDirectory() as carpeta:
            ruta, salida = Path(carpeta) / 'copia.sqlite', Path(carpeta) / 'nucleo.json'
            with almacen.abrir(ruta) as db:
                almacen.guardar(db, construir([ficha()]))
            with patch('calendario.recoger', side_effect=AssertionError('No debe descargar')):
                main(['--db', str(ruta), '--preparar-nucleo', '--entrada-feb', str(MUESTRAS / 'feb-revisada.json'),
                      '--entrada-tenis', str(MUESTRAS / 'espn-wta.json'), '--circuito', 'wta'])
                main(['--db', str(ruta), '--exportar-nucleo', '--salida', str(salida)])
            n = json.loads(salida.read_text())
            nucleo.validar(n)
            self.assertEqual(n['version'], 2)
            self.assertEqual(sum(e['tipo'] == 'evento' for e in n['entidades'].values()), 5)
            self.assertEqual(sum(r['tipo_externo'] == 'tournament_calendar_uid' for r in n['referencias'].values()), 2)
            self.assertFalse(n['resultados'])
            self.assertFalse(n['clasificaciones'])

    def test_cultura_y_f1_conservan_ids_fechas_y_vocabulario_sin_duplicar_actividades(self):
        a = integrar(construir([ficha(), ficha(201)]), vidmar_f1.leer(ics(DIAS)), vidmar_f1.FUENTES, AHORA)
        b = ampliar(a)
        self.assertEqual({k: v for k, v in b.items() if k != 'nucleo'}, a)
        n = b['nucleo']
        self.assertEqual({e['id'] for e in n['entidades'].values() if e['tipo'] == 'evento'},
                         {e['id'] for e in a['eventos']})
        self.assertFalse(any(e['clase'] == 'actividad' for e in n['entidades'].values()))
        self.assertEqual(len(nucleo.consultar(n, '2026-01-26', '2026-01-31', tema='deportes')), 1)
        self.assertEqual(nucleo.consultar(n, '2026-01-31', '2026-02-01'), [])
        c = construir([ficha(estado={'chave': 'cancelled'})], b, DESPUES)
        self.assertEqual(len(nucleo.consultar(c['nucleo'], '2026-10-26', '2026-10-27', tema='cultura')), 2)

    def test_turso_migracion_escritores_copia_e_historial_inmutable(self):
        servidor = Servidor()
        self.addCleanup(servidor.db.close)
        with patch('turso_http.urlopen', servidor.abrir):
            r = Almacen('libsql://agenda.test', 'simulado')
            r.inicializar()
            r.cargar()
            a = construir([ficha()])
            r.guardar(a)
            servidor.db.execute('UPDATE agenda_esquema SET version=3')
            r.inicializar()
            a = r.cargar()
            s = Almacen('libsql://agenda.test', 'simulado')
            s.cargar()
            b = ampliar(a)
            b['nucleo'] = feb.importar(b['nucleo'], muestra('feb-revisada.json'), OBSERVADO)
            r.guardar(b, solo_nucleo=True)
            with self.assertRaises(ConflictoCalendario):
                s.guardar(ampliar(a), solo_nucleo=True)
            self.assertEqual(r.cargar(), b)
            roto = deepcopy(b)
            o = next(iter(roto['nucleo']['observaciones'].values()))
            o['bloques']['clase'] = 'contenido alterado'
            with self.assertRaisesRegex(ValueError, 'conserva su contenido'):
                r.guardar(roto, solo_nucleo=True)
            self.assertEqual(r.cargar(), b)
            with tempfile.TemporaryDirectory() as carpeta:
                ruta = Path(carpeta) / 'recuperacion.sqlite'
                r.copia(ruta)
                with almacen.abrir(ruta) as db:
                    self.assertEqual(almacen.cargar(db), b)
                    self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])


if __name__ == '__main__':
    unittest.main()
