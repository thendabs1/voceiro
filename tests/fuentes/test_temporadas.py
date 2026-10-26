"""Cierre y planificación de agenda sin confundir cobertura y resultados."""

from copy import deepcopy
from datetime import datetime, timedelta, timezone
import unittest

from agenda import temporadas


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
