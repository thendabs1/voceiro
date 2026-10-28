"""Regresiones de agenda al cambiar relaciones y días de grandes premios."""

from copy import deepcopy
import unittest

from agenda import deporte, nucleo, publicacion, tiempos
from test_adaptadores_deportivos import DESPUES, OBSERVADO, importar, muestra


def proyectar(n):
    return publicacion.proyectar(n, list(n['fuentes']), generado=DESPUES)


class Actualizaciones(unittest.TestCase):
    def test_cambio_de_fase_sustituye_pertenencia_y_conserva_historial(self):
        for coleccion in ('espn-primera', 'espn-nba', 'feb-endesa'):
            with self.subTest(coleccion=coleccion):
                datos = muestra(coleccion)
                anterior = importar(coleccion, datos)
                if coleccion.startswith('espn-'):
                    datos['events'][0]['season'].update(type=999, slug='fase-corregida')
                else:
                    datos['fase'] = {'id': '999', 'nombre': 'fase-corregida'}
                nuevo = importar(coleccion, datos, anterior, DESPUES)
                p = proyectar(nuevo)
                for e in p['eventos']:
                    fases = [p['entidades'][k]['nombres']['und'] for k in e['objetivos']
                             if p['entidades'][k]['clase'] == 'fase']
                    self.assertEqual(fases, ['fase-corregida'])
                self.assertLess(set(anterior['observaciones']), set(nuevo['observaciones']))
                self.assertLessEqual(set(anterior['relaciones']), set(nuevo['relaciones']))
                self.assertEqual({e['id'] for e in proyectar(anterior)['eventos']},
                                 {e['id'] for e in p['eventos']})

    def test_cambio_de_padre_de_edicion_no_deja_dos_competiciones(self):
        def constructor(anterior=None):
            return deporte.Agenda(anterior, 'prueba', 'Prueba', 'https://ejemplo.test',
                                  'baloncesto', DESPUES if anterior else OBSERVADO)
        a = constructor()
        padres = [a.grupo('competicion', i, 'competicion', i) for i in ('A', 'B')]
        edicion = a.grupo('edicion', '2026', 'edicion', '2026', padre=padres[0], relacion='es_edicion_de')
        anterior = a.terminar()
        b = constructor(anterior)
        b.grupo('edicion', '2026', 'edicion', '2026', padre=padres[1], relacion='es_edicion_de')
        nuevo = b.terminar()
        relaciones = [r for r in nuevo['relaciones'].values()
                      if r['origen'] == edicion and nucleo.vigente(nuevo, r)]
        self.assertEqual([r['destino'] for r in relaciones], [padres[1]])
        self.assertEqual(anterior['referencias'], nuevo['referencias'])

    def test_equipo_sin_id_se_resuelve_sin_duplicar_lado_en_siete_colecciones(self):
        for coleccion in ('espn-primera', 'espn-segunda', 'espn-nba', 'espn-wnba',
                          'feb-endesa', 'feb-primera', 'feb-challenge'):
            with self.subTest(coleccion=coleccion):
                completo = muestra(coleccion)
                incompleto = deepcopy(completo)
                if coleccion.startswith('espn-'):
                    incompleto['events'][0]['competitions'][0]['competitors'][0]['team'].pop('uid')
                else:
                    incompleto['partidos'][0]['local'].pop('id')
                anterior = importar(coleccion, incompleto)
                nuevo = importar(coleccion, completo, anterior, DESPUES)
                p = proyectar(nuevo)
                for e in p['eventos']:
                    self.assertEqual(sorted(p['papel'] for p in e['participaciones']), ['local', 'visitante'])
                if coleccion.startswith('espn-'):
                    equipos = [c['team'] for e in completo['events'] for c in e['competitions'][0]['competitors']]
                    campo = 'uid'
                else:
                    equipos = [p[lado] for p in completo['partidos'] for lado in ('local', 'visitante')]
                    campo = 'id'
                self.assertEqual(sum(part['participante'] is not None for e in p['eventos'] for part in e['participaciones']),
                                 sum(e.get(campo) is not None for e in equipos))
                self.assertLessEqual(set(anterior['participaciones']), set(nuevo['participaciones']))

    def test_equipo_sustituido_y_lados_intercambiados_con_nombre_de_evento_igual(self):
        datos = muestra('espn-nba')
        anterior = importar('espn-nba', datos)
        competidores = datos['events'][0]['competitions'][0]['competitors']
        clave = lambda e: {nucleo.clave(p['participante']) for p in e['participaciones']}
        viejos = clave(proyectar(anterior)['eventos'][0])
        competidores[0]['team']['uid'] = 's:40~l:46~t:prueba-sustitucion'
        for c in competidores:
            c['homeAway'] = 'away' if c['homeAway'] == 'home' else 'home'
        nuevo = importar('espn-nba', datos, anterior, DESPUES)
        e = proyectar(nuevo)['eventos'][0]
        self.assertEqual(len(e['participaciones']), 2)
        # Un equipo sustituido y el otro conservado, sea cual sea el orden publicado.
        self.assertEqual(len(clave(e) & viejos), 1)
        orden = deepcopy(datos)
        orden['events'][0]['competitions'][0]['competitors'].reverse()
        repetido = importar('espn-nba', orden, nuevo, '2026-10-28T12:00:00+01:00')
        self.assertEqual(set(nuevo['observaciones']), set(repetido['observaciones']))
        self.assertEqual(set(nuevo['documentos']), set(repetido['documentos']))

    def test_rechaza_dos_equipos_iguales_y_competicion_de_otro_evento(self):
        datos = muestra('espn-nba')
        partido = datos['events'][0]['competitions'][0]
        partido['competitors'][1]['team']['uid'] = partido['competitors'][0]['team']['uid']
        with self.assertRaisesRegex(ValueError, 'ambos lados'):
            importar('espn-nba', datos)
        datos = muestra('espn-primera')
        datos['events'][0]['competitions'][0]['uid'] = 'otro-evento~c:1'
        with self.assertRaisesRegex(ValueError, 'espacio'):
            importar('espn-primera', datos)

    def test_actualizaciones_contradictorias_en_mismo_instante_se_rechazan(self):
        for cambiar in ('fase', 'equipo'):
            with self.subTest(cambiar=cambiar):
                datos = muestra('espn-nba')
                anterior = importar('espn-nba', datos)
                if cambiar == 'fase':
                    datos['events'][0]['season'].update(type=3, slug='post-season')
                else:
                    datos['events'][0]['competitions'][0]['competitors'][0]['team'].pop('uid')
                with self.assertRaisesRegex(ValueError, 'mismo instante'):
                    importar('espn-nba', datos, anterior, OBSERVADO)

    def test_feb_fecha_conservada_no_se_reconfirma_hasta_recibirla_otra_vez(self):
        completo = muestra('feb-endesa')
        anterior = importar('feb-endesa', completo)
        sin_fechas = deepcopy(completo)
        for p in sin_fechas['partidos']:
            p['fecha_hora'] = None
        nuevo = importar('feb-endesa', sin_fechas, anterior, DESPUES)
        for e in proyectar(nuevo)['eventos']:
            marca = e['programacion']['valor']['fecha_conservada']
            self.assertEqual(marca['comprobado'], OBSERVADO)
            self.assertIn(marca['observacion'], anterior['observaciones'])
        repetido = importar('feb-endesa', sin_fechas, nuevo, '2026-10-28T12:00:00+01:00')
        self.assertEqual(set(nuevo['documentos']), set(repetido['documentos']))
        confirmado = importar('feb-endesa', completo, repetido, '2026-10-29T12:00:00+01:00')
        for e in proyectar(confirmado)['eventos']:
            self.assertNotIn('fecha_conservada', e['programacion']['valor'])


class GrandesPremios(unittest.TestCase):
    def test_f1_no_convierte_utc_en_dias_oficiales_sin_zona(self):
        datos = muestra('espn-f1')
        gp = datos['events'][0]
        gp.update(date='2026-11-20T00:30:00Z', endDate='2026-11-22T04:00:00Z')
        fechas = ['2026-11-20T00:30:00Z', '2026-11-20T04:00:00Z', '2026-11-21T00:30:00Z',
                  '2026-11-21T04:00:00Z', '2026-11-22T04:00:00Z']
        for sesion, fecha in zip(gp['competitions'], fechas):
            sesion.update(date=fecha, startDate=fecha)
        e = proyectar(importar('espn-f1', datos))['eventos'][0]
        self.assertIsNone(e['programacion']['valor']['cuando']['inicio']['fecha'])
        self.assertTrue(all(s['programacion']['valor']['cuando']['inicio']['instante'] for s in e['programa']))
        # Cuando el origen declara días civiles, se conservan sin trasladarlos a UTC.
        gp.update(date='2026-11-19', endDate='2026-11-21')
        e = proyectar(importar('espn-f1', datos))['eventos'][0]
        self.assertEqual(e['programacion']['valor']['cuando']['inicio']['fecha'], '2026-11-19')
        self.assertEqual(e['programacion']['valor']['cuando']['fin']['fecha'], '2026-11-21')

    def test_dias_en_zona_y_sesiones_durante_cambio_de_hora(self):
        zona = deporte.zona_iana('AMERICA/LOS_ANGELES')
        dias = deporte.dias('2026-11-20T00:30:00Z', '2026-11-22T04:00:00Z', zona=zona)
        self.assertEqual(dias['inicio']['fecha'], '2026-11-19')
        self.assertEqual(dias['fin']['fecha'], '2026-11-21')
        zona = deporte.zona_iana('EUROPE/MADRID')
        sesion = deporte.intervalo('2026-10-25T02:30:00+02:00', '2026-10-25T02:30:00+01:00', zona=zona)
        self.assertLess(tiempos.instante(sesion['inicio']['instante']), tiempos.instante(sesion['fin']['instante']))
        with self.assertRaisesRegex(ValueError, 'discrepantes'):
            deporte.intervalo('2026-10-25T12:00:00+02:00', zona=zona)
        with self.assertRaisesRegex(ValueError, 'Fin anterior'):
            deporte.dias('2026-11-20T20:00:00Z', '2026-11-20T10:00:00Z')

    def test_motogp_conserva_zona_iana_y_rechaza_offset_incompatible(self):
        datos = muestra('motogp')
        p = proyectar(importar('motogp', datos))['eventos'][0]
        self.assertEqual(p['programacion']['valor']['cuando']['inicio']['fecha'], '2026-10-30')
        for s in p['programa']:
            self.assertEqual(s['programacion']['valor']['cuando']['inicio']['zona'], 'Asia/Kuala_Lumpur')
        datos['time_zone'] = 'EUROPE/MADRID'
        with self.assertRaisesRegex(ValueError, 'discrepantes'):
            importar('motogp', datos)
        datos['time_zone'] = 'ASIA/ZONA_INVENTADA'
        with self.assertRaisesRegex(ValueError, 'Zona'):
            importar('motogp', datos)
        datos.pop('time_zone')
        p = proyectar(importar('motogp', datos))['eventos'][0]
        self.assertIsNone(p['programacion']['valor']['cuando']['inicio']['fecha'])
        self.assertTrue(p['programa'][0]['programacion']['valor']['cuando']['inicio']['instante'])

    def test_fin_equivalente_con_otro_offset_no_fabrica_duracion_cero(self):
        cuando = deporte.intervalo('2026-10-30T12:00:00+02:00', '2026-10-30T10:00:00Z',
                                   fin_igual_desconocido=True)
        self.assertEqual(cuando['fin']['precision'], 'desconocida')

    def test_programa_ausente_conserva_sesiones_con_su_comprobacion_anterior(self):
        datos = muestra('motogp')
        anterior = importar('motogp', datos)
        datos['broadcasts'] = []
        nuevo = importar('motogp', datos, anterior, DESPUES)
        gp = proyectar(nuevo)['eventos'][0]
        self.assertEqual(len(gp['programa']), 8)
        self.assertTrue(all(f['comprobado'] == DESPUES for f in gp['fuentes']))
        self.assertTrue(all(f['comprobado'] == OBSERVADO for s in gp['programa'] for f in s['fuentes']))
        self.assertTrue(all(s['programacion']['valor']['programacion'] == 'programado' for s in gp['programa']))


if __name__ == '__main__':
    unittest.main()
