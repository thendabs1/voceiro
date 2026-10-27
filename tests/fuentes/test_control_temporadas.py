"""Control durable, presupuestos y confirmación atómica con SQLite y Hrana."""

from copy import deepcopy
import sqlite3
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

from agenda import almacen, deportes, operacion, temporadas
from agenda.control import ConflictoControl, PresupuestoAgotado, Repositorio
from agenda.transicion import ampliar
from agenda.turso import Almacen, ConflictoCalendario
from turso_http import ErrorTurso
from test_adaptadores_deportivos import muestra
from test_agenda import construir, ficha
from test_calendario_turso import Servidor


AHORA = '2026-11-01T12:00:00Z'
DESPUES = '2026-11-01T13:00:00Z'
UNIDAD = '2026-11-01'


class ContratoControl:
    def revision(self):
        return self.repo.consultar('SELECT revision FROM agenda_esquema WHERE id=1')[0][0]

    def nueva(self, referencia='2026-27', **kwargs):
        return self.repo.registrar(temporadas.nueva('primera', referencia, AHORA, **kwargs))

    def comenzar(self, t=None, ahora=AHORA, **kwargs):
        return self.repo.comenzar(t or self.nueva(), ahora, [UNIDAD], **kwargs)

    def reservar(self, t, p, ahora=AHORA):
        self.repo.reservar(t, p, 'https://calendario.test/agenda?dia=' + UNIDAD, ahora)

    def datos(self):
        calendario = self.repo.cargar_calendario()
        calendario['nucleo'] = deportes.importar(calendario['nucleo'], 'espn-primera',
            muestra('espn-primera'), AHORA)
        evento = next(e['id'] for e in calendario['nucleo']['entidades'].values()
                      if e['tipo'] == 'evento' and e['clase'] == 'encuentro')
        return calendario, evento

    def confirmar(self, t, p, calendario=None, evento=None, ahora=AHORA):
        nuevo = temporadas.exitosa(t, ahora, {})
        cobertura = {'unidad': UNIDAD, 'recurso': 'agenda', 'proveedor': p['proveedor'],
                     'comprobado': temporadas.marca(ahora), 'completa': True}
        eventos = [] if evento is None else [{'evento': evento, 'unidad': UNIDAD,
                  'comprobado': temporadas.marca(ahora)}]
        return self.repo.confirmar(t, p, nuevo, calendario, [cobertura], eventos, ahora)

    def test_inicializacion_aditiva_y_control_no_cambian_revision_del_nucleo(self):
        revision = self.revision()
        self.repo.inicializar()
        t, p = self.comenzar()
        self.reservar(t, p)
        self.repo.recibida(p, 503, {}, 123)
        t = self.repo.fallar(t, p, AHORA, 'Servicio temporalmente no disponible')
        self.assertEqual(self.revision(), revision)
        self.assertEqual(self.repo.cargar_calendario(), self.base)
        self.assertEqual(self.repo.obtener(t['id']), t)
        self.assertEqual(self.repo.cobertura(t['id']), [])
        self.assertEqual(self.repo.eventos(t['id']), [])
        self.assertEqual(self.repo.pasadas(t['id'])[0]['estado'], 'fallida')
        self.assertEqual(self.repo.consumo(), [
            {'proveedor': 'espn', 'periodo': '2026-11-01', 'peticiones': 1}])

    def test_confirma_citas_pasada_cobertura_y_eventos_en_un_estado(self):
        t, p = self.comenzar()
        self.reservar(t, p)
        self.repo.recibida(p, 200, {'etag': 'muestra'}, 500)
        calendario, evento = self.datos()
        revision = self.revision()
        t = self.confirmar(t, p, calendario, evento)
        self.assertEqual(self.revision(), revision + 1)
        self.assertEqual(self.repo.cargar_calendario(), calendario)
        self.assertEqual(self.repo.obtener(t['id']), t)
        self.assertEqual(self.repo.pasadas(t['id'])[0]['estado'], 'completa')
        cobertura = self.repo.cobertura(t['id'])
        self.assertEqual([(c['unidad'], c['proveedor']) for c in cobertura], [(UNIDAD, t['principal'])])
        self.assertEqual([e['evento'] for e in self.repo.eventos(t['id'])], [evento])
        self.assertEqual(self.repo.consultar('PRAGMA foreign_key_check'), [])

    def test_confirmacion_sin_cambios_de_datos_conserva_revision_publica(self):
        t, p = self.comenzar()
        self.reservar(t, p)
        self.repo.recibida(p, 200, {}, 500)
        calendario = self.repo.cargar_calendario()
        revision = self.revision()
        t = self.confirmar(t, p, calendario)
        self.assertEqual(self.revision(), revision)
        self.assertEqual(self.repo.obtener(t['id'])['ultima_valida'], temporadas.marca(AHORA))
        self.assertTrue(self.repo.cobertura(t['id'])[0]['completa'])

    def test_fallo_sql_revierte_datos_y_confirmacion_pero_conserva_reserva(self):
        t, p = self.comenzar()
        self.reservar(t, p)
        self.repo.recibida(p, 200, {}, 500)
        calendario, evento = self.datos()
        revision = self.revision()
        self.repo.escribir([("CREATE TRIGGER fallo_documento BEFORE INSERT ON agenda_documentos "
            "BEGIN SELECT RAISE(ABORT,'fallo simulado de escritura'); END", ())])
        with self.assertRaises((sqlite3.IntegrityError, ErrorTurso)):
            self.confirmar(t, p, calendario, evento)
        self.assertEqual(self.revision(), revision)
        self.assertEqual(self.repo.cargar_calendario(), self.base)
        self.assertEqual(self.repo.obtener(t['id']), t)
        self.assertEqual(self.repo.cobertura(t['id']), [])
        self.assertEqual(self.repo.eventos(t['id']), [])
        self.assertEqual(self.repo.pasadas(t['id'])[0]['estado'], 'en_curso')
        self.assertEqual(self.repo.consumo()[0]['peticiones'], 1)
        self.repo.escribir([('DROP TRIGGER fallo_documento', ())])
        self.repo.fallar(t, p, AHORA, 'No se confirmaron las citas')
        self.assertEqual(self.repo.pasadas(t['id'])[0]['estado'], 'fallida')

    def test_citas_concurrentes_no_se_pisan_y_no_se_confirma_cobertura_obsoleta(self):
        t, p = self.comenzar()
        self.reservar(t, p)
        self.repo.recibida(p, 200, {}, 500)
        calendario, evento = self.datos()
        otro = self.otro_repositorio()
        simultaneo = otro.cargar_calendario()
        simultaneo['nucleo'] = deportes.importar(simultaneo['nucleo'], 'espn-nba', muestra('espn-nba'), AHORA)
        otro.escribir([], calendario=simultaneo)
        with self.assertRaises((sqlite3.IntegrityError, ErrorTurso, ConflictoCalendario)):
            self.confirmar(t, p, calendario, evento)
        self.assertEqual(self.repo.cargar_calendario(), simultaneo)
        self.assertEqual(self.repo.cobertura(t['id']), [])
        self.assertEqual(self.repo.eventos(t['id']), [])
        self.assertEqual(self.repo.pasadas(t['id'])[0]['estado'], 'en_curso')

    def test_otra_ejecucion_no_inicia_ni_confirma_sobre_temporada_obsoleta(self):
        inicial = self.nueva()
        otro = self.otro_repositorio()
        antiguo = otro.obtener(inicial['id'])
        t, p = self.comenzar(inicial)
        with self.assertRaises(ConflictoControl):
            otro.comenzar(antiguo, AHORA, [UNIDAD])
        with self.assertRaises(ConflictoControl):
            otro.comenzar(otro.obtener(inicial['id']), AHORA, [UNIDAD])
        self.assertEqual(len(self.repo.pasadas(t['id'])), 1)
        self.assertEqual(self.repo.consumo(), [])

    def test_pasada_interrumpida_se_recupera_sin_permitir_confirmacion_tardia(self):
        t, p = self.comenzar()
        self.reservar(t, p)
        antiguo = deepcopy(p)
        t2, p2 = self.repo.comenzar(t, '2026-11-01T12:16:00Z', [UNIDAD])
        pasadas = {x['id']: x for x in self.repo.pasadas(t['id'])}
        self.assertEqual(pasadas[p['id']]['estado'], 'interrumpida')
        self.assertEqual(pasadas[p2['id']]['estado'], 'en_curso')
        with self.assertRaises(PresupuestoAgotado):
            self.repo.reservar(t, antiguo, 'https://calendario.test/tardia', DESPUES)
        self.assertEqual(self.repo.obtener(t['id']), t2)
        self.assertEqual(self.repo.consumo()[0]['peticiones'], 1)
        self.assertEqual(self.repo.cobertura(t['id']), [])

    def test_presupuesto_diario_sobrevive_reapertura_y_se_comparte_entre_temporadas(self):
        politica = {'max_peticiones_pasada': 1, 'max_peticiones_dia': 1}
        t, p = self.comenzar(self.nueva(politica=politica))
        self.reservar(t, p)
        self.repo.recibida(p, 503, {}, 10)
        self.repo.fallar(t, p, AHORA, 'Servicio caído')
        otro = self.otro_repositorio()
        siguiente = otro.registrar(temporadas.nueva('primera', '2027-28', AHORA, politica=politica))
        siguiente, intento = otro.comenzar(siguiente, DESPUES, [UNIDAD])
        with self.assertRaises(PresupuestoAgotado):
            otro.reservar(siguiente, intento, 'https://calendario.test/otra-temporada', DESPUES)
        self.assertEqual(otro.consumo(), [
            {'proveedor': 'espn', 'periodo': '2026-11-01', 'peticiones': 1}])
        self.assertEqual(otro.pasadas(siguiente['id'])[0]['peticiones'], [])
        otro.fallar(siguiente, intento, DESPUES, 'Presupuesto diario consumido')
        nuevo_dia = '2026-11-02T01:00:00Z'
        siguiente, intento = otro.comenzar(otro.obtener(siguiente['id']), nuevo_dia, ['2026-11-02'])
        otro.reservar(siguiente, intento, 'https://calendario.test/nuevo-dia', nuevo_dia)
        self.assertEqual([c['peticiones'] for c in otro.consumo()], [1, 1])

    def test_reserva_duplicada_no_sobrescribe_registro_ni_supera_limite_de_pasada(self):
        t, p = self.comenzar(self.nueva(politica={'max_peticiones_pasada': 1}))
        copia = deepcopy(p)
        self.reservar(t, p)
        with self.assertRaises((PresupuestoAgotado, ConflictoControl)):
            self.repo.reservar(t, copia, 'https://calendario.test/segunda', AHORA)
        pasada = self.repo.pasadas(t['id'])[0]
        self.assertEqual(len(pasada['peticiones']), 1)
        self.assertEqual(pasada['peticiones'][0]['url'], p['peticiones'][0]['url'])
        self.assertEqual(self.repo.consumo()[0]['peticiones'], 1)

    def test_429_persiste_enfriamiento_y_no_avanza_cobertura(self):
        t, p = self.comenzar()
        self.reservar(t, p)
        self.repo.recibida(p, 429, {'retry-after': '7200'}, 100)
        t = self.repo.fallar(t, p, AHORA, 'Cuota temporal')
        otro = self.otro_repositorio()
        guardada = otro.obtener(t['id'])
        self.assertEqual(guardada, t)
        self.assertEqual(temporadas.momento(guardada['proxima_revision']),
                         temporadas.momento('2026-11-01T14:00:00Z'))
        self.assertFalse(temporadas.vencida(guardada, DESPUES))
        self.assertEqual(otro.cobertura(t['id']), [])

    def test_temporada_cerrada_no_admite_pasadas_hasta_reabrirla(self):
        alcance = {'inicio': '2026-03-06', 'fin': '2026-12-06', 'evidencia': {'url': 'https://oficial.test'},
                   'fin_confirmado': True, 'cobertura_completa': True,
                   'fases_completas': True, 'programa_completo': True}
        t = temporadas.nueva('f1', '2026', AHORA)
        t = temporadas.exitosa(t, '2026-12-09T12:00:00Z', alcance)
        t = temporadas.exitosa(t, '2026-12-10T12:00:00Z', alcance)
        t = self.repo.registrar(t)
        with self.assertRaisesRegex(ValueError, 'cerrada'):
            self.repo.comenzar(t, '2026-12-11T12:00:00Z', ['temporada'])
        self.assertEqual(self.repo.pasadas(t['id']), [])
        self.assertEqual(self.repo.consumo(), [])
        nueva = temporadas.reabrir(t, '2026-12-11T12:00:00Z', 'Corrección oficial')
        nueva = self.repo.cambiar(t, nueva)
        nueva, p = self.repo.comenzar(nueva, '2026-12-11T12:00:00Z', ['temporada'])
        self.assertEqual(p['estado'], 'en_curso')
        self.assertEqual(nueva['historial'][-1]['accion'], 'reabrir')

    def test_cambiar_no_permite_escribir_otra_temporada_con_guardia_ajena(self):
        anterior = self.nueva()
        otra = self.nueva('2027-28')
        modificada = temporadas.reabrir(otra, AHORA, 'Corrección')
        with self.assertRaises(ValueError):
            self.repo.cambiar(anterior, modificada)
        self.assertEqual(self.repo.obtener(otra['id']), otra)

    def test_contraste_conserva_ultima_valida_principal_sin_publicar_cobertura(self):
        t = self.nueva(principal='primera-oficial')
        t, p = self.repo.comenzar(t, AHORA, [UNIDAD], proveedor='espn-primera', contraste=True)
        self.reservar(t, p)
        self.repo.recibida(p, 200, {}, 500)
        cobertura = {'unidad': UNIDAD, 'recurso': 'agenda', 'proveedor': 'espn-primera',
                     'comprobado': temporadas.marca(AHORA), 'completa': True}
        with self.assertRaisesRegex(ValueError, 'contraste'):
            self.repo.confirmar(t, p, t, None, [cobertura], [], AHORA)
        final = self.repo.confirmar(t, p, t, None, [], [], AHORA)
        self.assertEqual(final['ultima_valida'], t['ultima_valida'])
        self.assertEqual(final['estado'], t['estado'])
        self.assertEqual(self.repo.pasadas(t['id'])[0]['estado'], 'contraste')
        self.assertEqual(self.repo.cargar_calendario(), self.base)
        self.assertEqual(self.repo.cobertura(t['id']), [])
        self.assertEqual(temporadas.plan_fechas(final, AHORA, self.repo.cobertura(t['id']), limite=1), [UNIDAD])

    def test_error_en_contraste_no_bloquea_principal_ni_cambia_su_cadencia(self):
        t = self.nueva(principal='primera-oficial')
        t, p = self.repo.comenzar(t, AHORA, [UNIDAD], proveedor='espn-primera', contraste=True)
        self.reservar(t, p)
        self.repo.recibida(p, 403, {}, 50)
        r = self.repo.fallar(t, p, AHORA, 'Fuente de contraste denegada')
        for campo in ('estado', 'bloqueada', 'ultima_valida', 'ultimo_intento', 'proxima_revision'):
            self.assertEqual(r[campo], t[campo])
        self.assertTrue(temporadas.vencida(r, AHORA))
        self.assertEqual(r['ultimo_contraste']['error'], 'Fuente de contraste denegada')
        self.assertEqual(self.repo.pasadas(t['id'])[0]['estado'], 'fallida')

    def test_descubrimiento_fallido_se_reintenta_pronto_y_el_exito_espera_una_semana(self):
        def pasada(ahora, error=None):
            p = self.repo.comenzar_descubrimiento('wrc', 'ocblacktop-wrc', ahora)
            return self.repo.terminar_descubrimiento(p, ahora, error=error, referencia=None if error else '2026')
        d = pasada(AHORA, 'respuesta vacía')
        self.assertEqual((d['errores_consecutivos'], d['proxima_revision']), (1, '2026-11-01T12:30:00.000000+00:00'))
        d = pasada(DESPUES, 'respuesta vacía')
        self.assertEqual((d['errores_consecutivos'], d['proxima_revision']), (2, '2026-11-01T14:00:00.000000+00:00'))
        d = pasada(DESPUES)
        self.assertEqual((d['errores_consecutivos'], d['proxima_revision']), (0, '2026-11-08T13:00:00.000000+00:00'))
        self.assertEqual(self.repo.descubrimiento('wrc'), d)

    def test_temporada_siguiente_sin_publicar_no_es_fallo_y_espera_una_semana(self):
        with patch.object(operacion.proveedores, 'recoger', side_effect=ValueError('sin calendario')):
            self.assertEqual(operacion.descubrir(self.repo, 'wrc', AHORA)[1]['estado'], 'fallida')
            self.assertEqual(self.repo.descubrimiento('wrc')['proxima_revision'], '2026-11-01T12:30:00.000000+00:00')
            self.repo.registrar(temporadas.nueva('wrc', '2026', AHORA))
            t, r = operacion.descubrir(self.repo, 'wrc', AHORA, forzar=True)
        self.assertEqual((t, r['estado']), (None, 'omitida'))
        d = self.repo.descubrimiento('wrc')
        self.assertEqual((d['errores_consecutivos'], d['proxima_revision']), (0, '2026-11-08T12:00:00.000000+00:00'))

    def test_reserva_incierta_en_el_descubrimiento_no_es_temporada_ausente(self):
        def recoger(*args, **kwargs):
            try:
                raise ErrorTurso('comprobar estado')
            except ErrorTurso as error:
                raise PresupuestoAgotado('no se envió la petición') from error
        for coleccion, error in (('wrc', recoger), ('f1', ConflictoControl('pasada sustituida'))):
            with self.subTest(coleccion), patch.object(operacion.proveedores, 'recoger', side_effect=error):
                with self.assertRaises((ErrorTurso, ConflictoControl)):
                    operacion.descubrir(self.repo, coleccion, AHORA)
                self.assertIsNone(self.repo.descubrimiento(coleccion))

    def test_confirmar_rechaza_unidad_o_proveedor_ajenos(self):
        t, p = self.comenzar()
        self.reservar(t, p)
        self.repo.recibida(p, 200, {}, 100)
        for unidad, proveedor in (('2027-01-01', p['proveedor']), (UNIDAD, 'otra-fuente')):
            with self.subTest(unidad=unidad, proveedor=proveedor):
                c = {'unidad': unidad, 'proveedor': proveedor, 'recurso': 'agenda',
                     'comprobado': temporadas.marca(AHORA), 'completa': True}
                with self.assertRaisesRegex(ValueError, 'selección'):
                    self.repo.confirmar(t, p, t, None, [c], [], AHORA)
        self.assertEqual(self.repo.cobertura(t['id']), [])
        self.assertEqual(self.repo.obtener(t['id']), t)


class ControlSQLite(ContratoControl, unittest.TestCase):
    def setUp(self):
        carpeta = tempfile.TemporaryDirectory()
        self.addCleanup(carpeta.cleanup)
        self.ruta = Path(carpeta.name) / 'calendario.sqlite'
        self.base = ampliar(construir([ficha()]))
        with almacen.abrir(self.ruta) as db:
            almacen.guardar(db, self.base)
        self.db = sqlite3.connect(self.ruta, isolation_level=None)
        self.addCleanup(self.db.close)
        self.db.execute('PRAGMA foreign_keys=ON')
        self.repo = Repositorio(db=self.db)
        self.repo.inicializar()

    def otro_repositorio(self):
        db = sqlite3.connect(self.ruta, isolation_level=None)
        self.addCleanup(db.close)
        db.execute('PRAGMA foreign_keys=ON')
        repo = Repositorio(db=db)
        repo.inicializar()
        return repo


class ControlTurso(ContratoControl, unittest.TestCase):
    def setUp(self):
        self.servidor = Servidor()
        self.addCleanup(self.servidor.db.close)
        self.servidor.db.execute('PRAGMA foreign_keys=ON')
        parche = patch('turso_http.urlopen', self.servidor.abrir)
        parche.start()
        self.addCleanup(parche.stop)
        remoto = Almacen('libsql://agenda.test', 'token-simulado')
        remoto.inicializar()
        remoto.cargar()
        self.base = ampliar(construir([ficha()]))
        remoto.guardar(self.base)
        self.repo = Repositorio(remoto=remoto)
        self.repo.inicializar()

    def otro_repositorio(self):
        remoto = Almacen('libsql://agenda.test', 'token-simulado')
        remoto.inicializar()
        repo = Repositorio(remoto=remoto)
        repo.inicializar()
        return repo

    def test_reserva_con_respuesta_perdida_no_se_reintenta(self):
        t, p = self.comenzar()
        peticiones = self.servidor.peticiones
        self.servidor.perder_respuesta = True
        with self.assertRaises((PresupuestoAgotado, ErrorTurso)):
            self.reservar(t, p)
        self.assertEqual(self.servidor.peticiones, peticiones + 1)
        self.servidor.perder_respuesta = False
        self.assertEqual(self.repo.consumo()[0]['peticiones'], 1)
        self.assertEqual(len(self.repo.pasadas(t['id'])[0]['peticiones']), 1)

    def test_commit_incierto_no_repite_y_recupera_citas_y_cobertura_juntas(self):
        t, p = self.comenzar()
        self.reservar(t, p)
        self.repo.recibida(p, 200, {}, 500)
        calendario, evento = self.datos()
        peticiones = self.servidor.peticiones
        self.servidor.perder_respuesta = True
        with self.assertRaisesRegex(ErrorTurso, 'comprobar estado'):
            self.confirmar(t, p, calendario, evento)
        self.assertEqual(self.servidor.peticiones, peticiones + 1)
        self.servidor.perder_respuesta = False
        recuperado = self.otro_repositorio()
        self.assertEqual(recuperado.cargar_calendario(), calendario)
        self.assertEqual(recuperado.pasadas(t['id'])[0]['estado'], 'completa')
        self.assertEqual([c['unidad'] for c in recuperado.cobertura(t['id'])], [UNIDAD])
        self.assertEqual([e['evento'] for e in recuperado.eventos(t['id'])], [evento])



class IncidenciasDeRespuesta(unittest.TestCase):
    def test_forzar_llega_al_descubrimiento_y_a_cada_temporada(self):
        repo = type('Repo', (), {'temporadas': lambda self, c=None: [{'id': 't', 'coleccion': 'wrc'}]})()
        with patch.object(operacion, 'descubrir', return_value=(None, None)) as descubrir, \
                patch.object(operacion, '_principal_actual', side_effect=lambda r, t, a: t), \
                patch.object(operacion, 'ejecutar_temporada', return_value={}) as revisar:
            operacion.ejecutar(repo, AHORA, colecciones=['wrc'], descubrimiento=True, forzar=True)
        self.assertTrue(descubrir.call_args.kwargs['forzar'])
        self.assertTrue(revisar.call_args.kwargs['forzar'])

    def test_programa_desaparecido_entero_cuenta_como_ausente(self):
        previa = [{'unidad': '2026', 'recurso': 'calendario', 'eventos': ['gp']},
                  {'unidad': '2026', 'recurso': 'programa:gp', 'eventos': ['s1', 's2']}]
        nuevas = [{'unidad': '2026', 'recurso': 'calendario', 'eventos': ['gp']}]
        recibidos = [{'evento': 'gp', 'conflicto': False, 'estado': 'programado', 'inicio': '2026-11-01'}]
        incidencias = operacion._incidencias(previa, nuevas, recibidos, ['2026'], '2026-10-27T00:00:00Z')
        self.assertEqual(incidencias, [{'tipo': 'ausentes_en_respuesta', 'unidad': '2026',
                                        'recurso': 'programa:gp', 'eventos': ['s1', 's2']}])
        # Una unidad que no se pidió en esta pasada no se compara.
        self.assertEqual(operacion._incidencias(previa, nuevas, recibidos, ['2027'], '2026-10-27T00:00:00Z'), [])


if __name__ == '__main__':
    unittest.main()
