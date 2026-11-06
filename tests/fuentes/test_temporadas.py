"""Cierre y planificación de agenda sin confundir cobertura y resultados."""

from copy import deepcopy
from datetime import datetime, timedelta, timezone
import unittest

from agenda import cadencias, temporadas


CREADA = '2026-10-26T12:00:00Z'
ANTES_FIN = '2026-12-08T23:59:59Z'
CIERRE = '2026-12-09T12:00:00Z'
FINAL = '2026-12-10T12:00:00Z'
ALCANCE = {'inicio': '2026-03-06', 'fin': '2026-12-06',
    'evidencia': {'url': 'https://calendario.test/2026', 'documento': 'calendario-oficial'},
    'fin_confirmado': True, 'cobertura_completa': True,
    'fases_completas': True, 'programa_completo': True}


def temporada(coleccion='f1', referencia='2026', **kwargs):
    return temporadas.nueva(coleccion, referencia, CREADA, **kwargs)


def cerrada():
    return temporadas.exitosa(temporadas.exitosa(temporada(), CIERRE, ALCANCE), FINAL, ALCANCE)


class CicloTemporadas(unittest.TestCase):
    def test_referencia_no_inventa_limites_y_temporadas_independientes(self):
        actual = temporada('nba', '2026-27', seleccion={'year': 2027})
        siguiente = temporada('nba', '2027-28', seleccion={'year': 2028})
        self.assertNotEqual(actual['id'], siguiente['id'])
        self.assertEqual(actual['seleccion'], {'year': 2027})
        self.assertIsNone(actual['inicio'])
        self.assertIsNone(actual['fin'])
        self.assertFalse(actual['fin_confirmado'])
        self.assertTrue(temporadas.vencida(actual, CREADA))

    def test_cierre_necesita_margen_y_dos_comprobaciones_separadas(self):
        t = temporadas.exitosa(temporada(), ANTES_FIN, ALCANCE)
        self.assertEqual(t['estado'], 'activa')
        t = temporadas.exitosa(t, CIERRE, ALCANCE)
        self.assertEqual(t['estado'], 'en_cierre')
        original = deepcopy(t)
        temprano = temporadas.exitosa(t, '2026-12-09T13:00:00Z', ALCANCE)
        self.assertEqual(temprano['estado'], 'en_cierre')
        t = temporadas.exitosa(temprano, FINAL, ALCANCE)
        self.assertEqual(t['estado'], 'cerrada')
        self.assertIsNone(t['proxima_revision'])
        self.assertFalse(temporadas.vencida(t, '2027-01-01T00:00:00Z'))
        self.assertEqual(len(t['historial']), 1)
        self.assertEqual(original['estado'], 'en_cierre')

    def test_no_cierra_por_fecha_ultima_conocida_o_cobertura_parcial(self):
        for flag in ('fin_confirmado', 'cobertura_completa', 'fases_completas', 'programa_completo'):
            with self.subTest(flag=flag):
                alcance = {**ALCANCE, flag: False}
                t = temporadas.exitosa(temporada(), CIERRE, alcance)
                t = temporadas.exitosa(t, FINAL, alcance)
                self.assertEqual(t['estado'], 'activa')
                self.assertIsNone(t['en_cierre_desde'])
                self.assertIsNotNone(t['proxima_revision'])

    def test_respuesta_parcial_no_hereda_completitud_y_reinicia_cierre(self):
        t = temporadas.exitosa(temporada(), CIERRE, ALCANCE)
        parcial = temporadas.exitosa(t, '2026-12-09T13:00:00Z', {}, incidencias=[{'tipo': 'pagina_ausente'}])
        self.assertEqual(parcial['fin'], ALCANCE['fin'])
        self.assertEqual(parcial['limites_evidencia'], ALCANCE['evidencia'])
        self.assertFalse(parcial['cobertura_completa'])
        self.assertFalse(parcial['fin_confirmado'])
        self.assertEqual(parcial['estado'], 'activa')
        self.assertIsNone(parcial['en_cierre_desde'])
        final = temporadas.exitosa(parcial, FINAL, ALCANCE)
        self.assertEqual(final['estado'], 'en_cierre')
        self.assertEqual(final['en_cierre_desde'], temporadas.marca(FINAL))

    def test_aplazamiento_pendiente_impide_cierre(self):
        t = temporadas.exitosa(temporada(), CIERRE, ALCANCE,
            incidencias=[{'tipo': 'aplazado_sin_fecha', 'evento': 'cita-1'}])
        self.assertEqual(t['estado'], 'activa')
        t = temporadas.exitosa(t, FINAL, ALCANCE)
        self.assertEqual(t['estado'], 'en_cierre')

    def test_limite_nuevo_no_reutiliza_evidencia_anterior(self):
        t = temporadas.exitosa(temporada(), CREADA, ALCANCE)
        sin_prueba = {**ALCANCE, 'fin': '2026-12-13'}
        del sin_prueba['evidencia']
        with self.assertRaisesRegex(ValueError, 'evidencia'):
            temporadas.exitosa(t, CIERRE, sin_prueba)
        self.assertEqual(t['fin'], '2026-12-06')

    def test_temporada_siguiente_anunciada_no_depende_de_la_cerrada(self):
        vieja = cerrada()
        alcance = {**ALCANCE, 'inicio': '2027-03-05', 'fin': '2027-12-05',
            'evidencia': {'url': 'https://calendario.test/2027'}}
        nueva = temporadas.nueva('f1', '2027', FINAL)
        nueva = temporadas.exitosa(nueva, FINAL, alcance)
        self.assertEqual(nueva['estado'], 'anunciada')
        self.assertFalse(temporadas.vencida(nueva, FINAL))
        self.assertTrue(temporadas.vencida(nueva, '2026-12-17T12:00:00Z'))
        self.assertEqual(vieja['estado'], 'cerrada')
        self.assertIsNone(vieja['proxima_revision'])

    def test_cerrada_solo_se_reabre_con_motivo_y_no_pierde_historial(self):
        t = cerrada()
        for motivo in ('', '   ', None):
            with self.subTest(motivo=motivo), self.assertRaisesRegex(ValueError, 'motivo'):
                temporadas.reabrir(t, '2026-12-11T12:00:00Z', motivo)
        for operacion in (
            lambda: temporadas.exitosa(t, '2026-12-11T12:00:00Z', ALCANCE),
            lambda: temporadas.fallida(t, '2026-12-11T12:00:00Z', 'fallo'),
        ):
            with self.assertRaisesRegex(ValueError, 'Reabrir'):
                operacion()
        reabierta = temporadas.reabrir(t, '2026-12-11T12:00:00Z', 'Corrección oficial de horario')
        self.assertTrue(temporadas.vencida(reabierta, '2026-12-11T12:00:00Z'))
        self.assertEqual([h['accion'] for h in reabierta['historial']], ['cerrar', 'reabrir'])
        self.assertEqual(t['estado'], 'cerrada')

    def test_respuesta_antigua_no_hace_retroceder_comprobacion(self):
        t = temporadas.exitosa(temporada(), CIERRE, ALCANCE)
        for operacion in (
            lambda: temporadas.exitosa(t, CREADA, ALCANCE),
            lambda: temporadas.fallida(t, CREADA, 'respuesta tardía'),
            lambda: temporadas.reabrir(t, CREADA, 'Corrección'),
        ):
            with self.assertRaisesRegex(ValueError, 'anterior'):
                operacion()


class Cadencias(unittest.TestCase):
    def test_catalogo_completo_y_perfiles(self):
        self.assertEqual(set(cadencias.COLECCIONES), set(temporadas.CATALOGO))
        self.assertEqual({c for c, p in cadencias.COLECCIONES.items() if p == 'gran-premio'},
                         {'f1', 'motogp', 'wrc'})

    def test_perfiles_base_cerca_y_competicion_con_margen(self):
        for coleccion in temporadas.CATALOGO:
            for citas, horas in (
                ([], 72),
                ([('2026-11-03', None)], 72),  # A ocho días.
                ([('2026-11-02', None)], 24),  # Límite de siete días incluido.
                ([('2026-10-24', '2026-10-28')],
                 6 if coleccion in ('f1', 'motogp', 'wrc') else 24),
                ([('2026-10-26', None)],
                 6 if coleccion in ('f1', 'motogp', 'wrc') else 24),
                ([('2026-10-20', '2026-10-26')],
                 6 if coleccion in ('f1', 'motogp', 'wrc') else 24),
                ([('2026-10-20', None), (None, None)], 72),
            ):
                with self.subTest(coleccion=coleccion, citas=citas):
                    self.assertEqual(cadencias.horas_temporada(
                        coleccion, temporadas.momento(CREADA).date(), citas), horas)
                    t = temporadas.exitosa(temporada(coleccion), CREADA, {}, citas=citas)
                    self.assertEqual(t['proxima_revision'], temporadas.despues(
                        CREADA, hours=horas - cadencias.MARGEN_HORAS))

    def test_programacion_pendiente_no_acelera_y_otra_incidencia_si(self):
        pendientes = [{'tipo': tipo} for tipo in
                      ('programacion_pendiente', 'programacion_pendiente_conservada')]
        for coleccion in ('f1', 'atp'):
            for incidencias, horas in ((pendientes, 72),
                                      (pendientes + [{'tipo': 'programa_incompleto'}], 24)):
                with self.subTest(coleccion=coleccion, incidencias=incidencias):
                    t = temporadas.exitosa(temporada(coleccion), CREADA, {}, incidencias)
                    self.assertEqual(t['proxima_revision'], temporadas.despues(CREADA, hours=horas - 3))

    def test_politica_antigua_no_impone_frecuencias(self):
        t = temporada('atp')
        t['politica'].update(revision_proxima_horas=1, revision_lejana_horas=999)
        for citas, horas in (([], 69), ([('2026-10-26', '2026-11-01')], 21)):
            with self.subTest(citas=citas):
                nuevo = temporadas.exitosa(t, CREADA, {}, citas=citas)
                self.assertEqual(nuevo['proxima_revision'], temporadas.despues(CREADA, hours=horas))
        self.assertNotIn('revision_proxima_horas', temporadas.POLITICA)
        self.assertNotIn('revision_lejana_horas', temporadas.POLITICA)

    def test_margen_absorbe_retraso_hasta_tick_normal(self):
        retraso = '2026-10-26T04:50:00Z'
        for coleccion, citas, siguiente in (
            ('f1', [('2026-10-26', None)], '2026-10-26T10:30:00Z'),
            ('atp', [('2026-10-26', None)], '2026-10-27T04:30:00Z'),
            ('atp', [], '2026-10-29T04:30:00Z'),
        ):
            with self.subTest(coleccion=coleccion, citas=citas):
                t = temporadas.nueva(coleccion, '2026', retraso)
                t = temporadas.exitosa(t, retraso, {}, citas=citas)
                self.assertTrue(temporadas.vencida(t, siguiente))


class ErroresTemporadas(unittest.TestCase):
    def test_fallo_conserva_ultima_valida_y_limites(self):
        t = temporadas.exitosa(temporada(), CREADA, ALCANCE)
        r = temporadas.fallida(t, '2026-10-27T12:00:00Z', 'respuesta truncada', estado_http=503)
        for campo in ('ultima_valida', 'inicio', 'fin', 'limites_evidencia', 'cobertura_completa'):
            self.assertEqual(r[campo], t[campo])
        self.assertEqual(r['errores_consecutivos'], 1)
        self.assertFalse(temporadas.vencida(r, '2026-10-27T12:00:00Z'))
        self.assertTrue(temporadas.vencida(r, '2026-10-27T12:30:00Z'))

    def test_401_y_403_necesitan_reapertura_explicita(self):
        for codigo in (401, 403):
            with self.subTest(codigo=codigo):
                t = temporadas.fallida(temporada(), CREADA, 'Access denied', estado_http=codigo)
                self.assertTrue(t['bloqueada'])
                self.assertIsNone(t['proxima_revision'])
                self.assertFalse(temporadas.vencida(t, FINAL))
                self.assertEqual(temporadas.plan_fechas(t, FINAL, []), [])
                with self.assertRaisesRegex(ValueError, 'Reabrir'):
                    temporadas.exitosa(t, FINAL, ALCANCE)
                r = temporadas.reabrir(t, FINAL, 'Acceso restablecido')
                self.assertTrue(temporadas.vencida(r, FINAL))

    def test_retry_after_segundos_y_fecha_http_respetan_espera(self):
        for cabecera, esperado in (
            ('7200', '2026-10-26T14:00:00+00:00'),
            ('Mon, 26 Oct 2026 15:00:00 GMT', '2026-10-26T15:00:00+00:00'),
            ('Mon, 26 Oct 2026 10:00:00 -0500', '2026-10-26T15:00:00+00:00'),
        ):
            with self.subTest(cabecera=cabecera):
                t = temporadas.fallida(temporada(), CREADA, 'cuota', estado_http=429, retry_after=cabecera)
                self.assertEqual(temporadas.momento(t['proxima_revision']), datetime.fromisoformat(esperado))
        t = temporadas.fallida(temporada(), CREADA, 'cuota', estado_http=429,
                              retry_after='cabecera inválida')
        self.assertEqual(temporadas.momento(t['proxima_revision']),
                         temporadas.momento(CREADA) + timedelta(minutes=30))


class PlanFechas(unittest.TestCase):
    AHORA = '2026-11-01T12:00:00Z'

    def nueva(self):
        return temporadas.nueva('primera', '2026-27', self.AHORA, politica={'horizonte_dias': 5})

    def cobertura(self, unidad, comprobado=None, proveedor='espn-primera', completa=True):
        return {'unidad': unidad, 'comprobado': comprobado or self.AHORA,
                'proveedor': proveedor, 'completa': completa}

    def test_una_fecha_lejana_caduca_mas_despacio_que_una_cercana(self):
        t = temporadas.nueva('primera', '2026-27', self.AHORA, politica={'horizonte_dias': 14})
        hoy = temporadas.momento(self.AHORA).date()
        dias = [(hoy + timedelta(days=i)).isoformat() for i in range(14)]
        comprobado = (temporadas.momento(self.AHORA) - timedelta(hours=30)).isoformat()
        cobertura = [{'proveedor': t['principal'], 'completa': True, 'unidad': d, 'comprobado': comprobado}
                     for d in dias]
        plan = temporadas.plan_fechas(t, self.AHORA, cobertura)
        self.assertEqual(plan, dias[:cadencias.CERCA_DIAS + 1])
        viejo = (temporadas.momento(self.AHORA) - timedelta(hours=70)).isoformat()
        for c in cobertura:
            c['comprobado'] = viejo
        self.assertEqual(temporadas.plan_fechas(t, self.AHORA, cobertura), dias)

    def test_las_copas_miran_mas_lejos_sin_tocar_la_politica_guardada(self):
        hoy = temporadas.momento(self.AHORA).date()
        for coleccion, dias in (('champions', 28), ('copa-del-rey', 28), ('liga-f', 14), ('nba', 14)):
            with self.subTest(coleccion):
                t = temporadas.nueva(coleccion, '2026-27', self.AHORA)
                self.assertEqual(t['politica']['horizonte_dias'], 14)
                self.assertEqual(temporadas.plan_fechas(t, self.AHORA, [])[-1],
                                 (hoy + timedelta(days=dias - 1)).isoformat())

    def test_presupuesto_acotado_reanuda_por_huecos_sin_repetir_primeros_dias(self):
        t = self.nueva()
        a = temporadas.plan_fechas(t, self.AHORA, [], limite=2)
        self.assertEqual(a, ['2026-11-01', '2026-11-02'])
        cobertura = [self.cobertura(d) for d in a]
        b = temporadas.plan_fechas(t, self.AHORA, cobertura, limite=2)
        self.assertEqual(b, ['2026-11-03', '2026-11-04'])
        cobertura.extend(self.cobertura(d) for d in b)
        c = temporadas.plan_fechas(t, self.AHORA, cobertura, limite=2)
        self.assertEqual(c, ['2026-11-05'])
        cobertura.extend(self.cobertura(d) for d in c)
        self.assertEqual(temporadas.plan_fechas(t, self.AHORA, cobertura), [])

    def test_hueco_precede_a_dia_caducado_y_revalida_despues(self):
        t = self.nueva()
        cobertura = [self.cobertura(d, '2026-10-31T12:00:00Z')
                     for d in ('2026-11-01', '2026-11-02', '2026-11-04', '2026-11-05')]
        self.assertEqual(temporadas.plan_fechas(t, self.AHORA, cobertura, limite=2),
                         ['2026-11-03', '2026-11-01'])

    def test_otro_proveedor_o_unidad_incompleta_no_acreditan_cobertura(self):
        t = self.nueva()
        cobertura = [self.cobertura('2026-11-01', proveedor='otra-fuente'),
                     self.cobertura('2026-11-02', completa=False), self.cobertura('2026-11-03')]
        self.assertEqual(temporadas.plan_fechas(t, self.AHORA, cobertura),
                         ['2026-11-01', '2026-11-02', '2026-11-04', '2026-11-05'])

    def test_misma_unidad_usa_comprobacion_reciente_sin_depender_del_orden(self):
        t = self.nueva()
        cobertura = [self.cobertura('2026-11-01'), self.cobertura('2026-11-01', '2026-10-31T12:00:00Z')]
        a = temporadas.plan_fechas(t, self.AHORA, cobertura)
        b = temporadas.plan_fechas(t, self.AHORA, list(reversed(cobertura)))
        self.assertEqual(a, b)
        self.assertNotIn('2026-11-01', a)

    def test_fin_no_confirmado_no_impide_descubrir_citas_posteriores(self):
        t = self.nueva()
        t['fin'] = '2026-10-31'
        self.assertEqual(temporadas.plan_fechas(t, self.AHORA, [], limite=2),
                         ['2026-11-01', '2026-11-02'])
        self.assertFalse(t['fin_confirmado'])

    def test_temporada_futura_espera_inicio_y_final_confirmado_revisa_ultimo_dia(self):
        t = self.nueva()
        t['inicio'] = '2026-12-01'
        self.assertEqual(temporadas.plan_fechas(t, self.AHORA, []), [])
        t = temporadas.exitosa(t, self.AHORA, {**ALCANCE, 'inicio': '2026-03-01', 'fin': '2026-10-31'})
        self.assertEqual(temporadas.plan_fechas(t, self.AHORA, []), ['2026-10-31'])

    def test_atp_2027_respeta_startdate_sin_inicio_hasta_entrar_en_horizonte(self):
        t = temporadas.nueva('atp', '2027', self.AHORA)
        t['limites_proveedor'] = {'startDate': '2027-01-01T08:00Z'}
        for ahora in (self.AHORA, '2026-12-18T12:00:00Z'):
            with self.subTest(ahora=ahora):
                self.assertEqual(temporadas.plan_fechas(t, ahora, []), [])
        self.assertEqual(temporadas.plan_fechas(t, '2026-12-19T12:00:00Z', []), ['2027-01-01'])
        t['inicio'] = '2027-01-02'  # El inicio acreditado tiene prioridad.
        self.assertEqual(temporadas.plan_fechas(t, '2026-12-19T12:00:00Z', []), [])

    def test_enddate_no_pide_fechas_de_la_temporada_siguiente(self):
        t = temporadas.nueva('atp', '2026', self.AHORA)
        t['limites_proveedor'] = {'startDate': '2026-01-01T08:00Z', 'endDate': '2027-01-01T07:59Z'}
        plan = temporadas.plan_fechas(t, '2026-12-25T12:00:00Z', [])
        self.assertEqual((plan[0], plan[-1]), ('2026-12-25', '2026-12-31'))
        # Pasado endDate solo se sondea el último día: nunca hoy, que sería de otra temporada.
        self.assertEqual(temporadas.plan_fechas(t, '2027-01-01T12:00:00Z', []), ['2026-12-31'])
        t = temporadas.nueva('wnba', '2026', self.AHORA)
        t['limites_proveedor'] = {'endDate': '2026-11-05T07:59Z'}
        self.assertEqual(temporadas.plan_fechas(t, '2026-11-04T12:00:00Z', []), ['2026-11-04'])
        self.assertEqual(temporadas.plan_fechas(t, '2026-11-05T12:00:00Z', []), ['2026-11-04'])

    def test_sonda_tras_enddate_es_semanal_y_no_afecta_a_temporadas_futuras(self):
        t = temporadas.nueva('wnba', '2026', self.AHORA)
        t['limites_proveedor'] = {'endDate': '2026-11-05T07:59Z'}
        cobertura = [{'unidad': '2026-11-04', 'proveedor': t['principal'], 'completa': True,
                      'comprobado': '2026-11-10T00:00:00+00:00'}]
        self.assertEqual(temporadas.plan_fechas(t, '2026-11-16T00:00:00Z', cobertura), [])
        self.assertEqual(temporadas.plan_fechas(t, '2026-11-16T21:00:00Z', cobertura), ['2026-11-04'])
        t = temporadas.nueva('atp', '2027', self.AHORA)
        t['limites_proveedor'] = {'startDate': '2027-01-01T08:00Z', 'endDate': '2028-01-01T07:59Z'}
        self.assertEqual(temporadas.plan_fechas(t, self.AHORA, []), [])

    def test_fin_futuro_confirmado_no_revisa_ultimo_dia_fuera_del_horizonte(self):
        t = temporadas.nueva('atp', '2027', self.AHORA)
        t.update(fin='2027-11-30', fin_confirmado=True, limites_evidencia={'url': 'https://ejemplo.test'},
                 limites_proveedor={'startDate': '2027-01-01T08:00Z'})
        self.assertEqual(temporadas.plan_fechas(t, self.AHORA, []), [])
        self.assertEqual(temporadas.plan_fechas(t, '2026-12-19T12:00:00Z', []), ['2027-01-01'])
        t['inicio'] = '2027-01-01'
        self.assertEqual(temporadas.plan_fechas(t, self.AHORA, []), [])

    def test_caducidad_diaria_del_perfil_ignora_politica_antigua(self):
        for coleccion in ('f1', 'atp'):
            t = temporadas.nueva(coleccion, '2026', self.AHORA, politica={'horizonte_dias': 1})
            t['politica']['revision_proxima_horas'] = 1
            for comprobado, esperado in (('2026-10-31T15:00:01Z', []),
                                         ('2026-10-31T15:00:00Z', ['2026-11-01'])):
                with self.subTest(coleccion=coleccion, comprobado=comprobado):
                    cobertura = [self.cobertura('2026-11-01', comprobado, proveedor=t['principal'])]
                    self.assertEqual(temporadas.plan_fechas(t, self.AHORA, cobertura), esperado)

    def test_sin_trabajo_para_cerrada_pausada_bloqueada_o_presupuesto_agotado(self):
        t = self.nueva()
        self.assertEqual(temporadas.plan_fechas(t, self.AHORA, [], limite=0), [])
        for estado in ('cerrada', 'pausada', 'bloqueada'):
            otro = deepcopy(t)
            if estado == 'bloqueada':
                otro['bloqueada'] = True
            else:
                otro['estado'] = estado
                otro['proxima_revision'] = None
            self.assertEqual(temporadas.plan_fechas(otro, self.AHORA, []), [])
        for limite in (-1, True, '2'):
            with self.subTest(limite=limite), self.assertRaisesRegex(ValueError, 'límite'):
                temporadas.plan_fechas(t, self.AHORA, [], limite=limite)


if __name__ == '__main__':
    unittest.main()
