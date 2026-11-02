"""Coincidencias automáticas, ambigüedades y issues sin duplicados."""
from copy import deepcopy
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from agenda import atletismo, atletismo_coincidencias as c, atletismo_revision as revision, publicacion

AHORA = '2026-11-02T20:00:00+01:00'
MUESTRAS = Path(__file__).with_name('muestras_calendario') / 'atletismo'


def entrada(fuente, identificador='uno', **cambios):
    e = {'id': identificador, 'nombre': 'IX Cross Ponte Romana 2026',
         'inicio': '2026-11-01', 'fin': '2026-11-01', 'lugar': {'nombre': 'LUGO'},
         'url': atletismo.FUENTES[fuente][1] + '/ensayo', 'metadatos': {}}
    e.update(cambios)
    return {'version': 1, 'fuente': fuente, 'eventos': [e]}


class Coincidencias(unittest.TestCase):
    def test_tres_fuentes_comparten_cita_y_no_crean_incidencias(self):
        n = None
        for fuente in ('rfea', 'fga', 'fca'):
            n = atletismo.importar(n, entrada(fuente, fuente), AHORA)
        e, = publicacion.proyectar(n)['eventos']
        self.assertEqual({f['fuente'] for f in e['fuentes']}, {'rfea', 'fga', 'fca'})
        self.assertEqual(c.incidencias(n), [])

    def test_misma_cita_se_importa_sin_registro_manual_y_conserva_id_al_cambiar_fecha(self):
        for fuentes in (('rfea', 'fga'), ('fga', 'rfea')):
            n = atletismo.importar(None, entrada(fuentes[0]), AHORA)
            id_inicial = publicacion.proyectar(n)['eventos'][0]['id']
            p = entrada(fuentes[1], 'dos', nombre='IX Cross Ponte Romana', lugar={'nombre': 'Lugo'})
            n = atletismo.importar(n, p, AHORA)
            vista = publicacion.proyectar(n)
            self.assertEqual(len(vista['eventos']), 1)
            self.assertEqual(vista['eventos'][0]['id'], id_inicial)
            self.assertEqual({f['fuente'] for f in vista['eventos'][0]['fuentes']}, set(fuentes))
            self.assertEqual(c.incidencias(n), [])
            p['eventos'][0].update(inicio='2026-11-02', fin='2026-11-02')
            n = atletismo.importar(n, p, '2026-11-03T20:00:00+01:00')
            self.assertEqual(len(publicacion.proyectar(n)['eventos']), 1)
            self.assertEqual(publicacion.proyectar(n)['eventos'][0]['id'], id_inicial)
            self.assertEqual(len(c.incidencias(n)), 1)
            variantes = publicacion.proyectar(n)['eventos'][0]['atletismo']['variantes']
            self.assertTrue(any(v['valor'].get('coincidencia_automatica') for v in variantes))

    def test_enlace_directo_real_catalan_conserva_discrepancias_de_sede(self):
        paginas = json.loads((MUESTRAS / 'fca.json').read_text())
        e = next(e for e in atletismo.leer_cataluna(paginas) if e['id'] == '83648')
        rfea = entrada('rfea', 'italica', nombre='XLIV Cross Internacional de Italica',
                       inicio='2026-11-08', fin='2026-11-08', lugar={'nombre': 'SEVILLA'},
                       url=e['metadatos']['web_organizador'])
        n = atletismo.importar(None, rfea, AHORA)
        n = atletismo.importar(n, {'version': 1, 'fuente': 'fca', 'eventos': [e]}, AHORA)
        vista = publicacion.proyectar(n)['eventos']
        self.assertEqual(len(vista), 1)
        self.assertTrue(vista[0]['lugar']['conflicto'])
        for fuente in ('rfea', 'fca'):
            self.assertEqual(publicacion.proyectar(n, fuentes=[fuente])['eventos'][0]['id'], vista[0]['id'])

    def test_no_fusiona_distancia_edad_sexo_edicion_ni_alcance_compuesto(self):
        base = entrada('rfea', nombre='Campeonato de España de 5 km Master Masculino')['eventos'][0]
        for nombre in ('Campeonato de España de 10 km Master Masculino',
                       'Campeonato de España de 5 m Master Masculino',
                       'Campeonato de España de 5 km Master Femenino',
                       'Campeonato de España de 5 km Sub20 Masculino',
                       'Campeonato de España de 5 km Master Masculino (Cross Internacional)'):
            with self.subTest(nombre=nombre):
                self.assertNotEqual(c.comparar(base, {**base, 'nombre': nombre})['estado'], 'automatica')
        self.assertNotEqual(c.comparar(base, {**base, 'nombre': base['nombre'] + ' II'})['estado'], 'automatica')

    def test_no_fusiona_por_fecha_y_sede_solas_ni_por_portada_de_organizador(self):
        a = entrada('rfea')['eventos'][0]
        b = entrada('fga', nombre='Campeonato de España 5 km Master')['eventos'][0]
        for e in (a, b):
            e['metadatos'] = {'web_organizador': 'https://atletismorfea.es/'}
        self.assertEqual(c.comparar(a, b)['estado'], 'distintas')
        b = deepcopy(a)
        a['metadatos']['modalidad_literal'] = 'Marcha'
        b['metadatos']['modalidad_literal'] = 'AL'
        self.assertEqual(c.comparar(a, b)['estado'], 'revisar')
        b = deepcopy(a)
        b.update(inicio='2026-11-08', fin='2026-11-08')
        self.assertEqual(c.comparar(a, b)['estado'], 'distintas')

    def test_varias_identidades_candidatas_o_dos_citas_del_lote_no_eligen_una(self):
        p = entrada('rfea')
        p['eventos'].append({**p['eventos'][0], 'id': 'otra'})
        n = atletismo.importar(None, p, AHORA)
        decision = c.decidir_lote(n, 'fga', entrada('fga')['eventos'])['uno']
        self.assertEqual(decision['estado'], 'revisar')
        n = atletismo.importar(None, entrada('rfea'), AHORA)
        p = entrada('fga')
        p['eventos'].append({**p['eventos'][0], 'id': 'otra'})
        self.assertTrue(all(d['estado'] == 'revisar' for d in c.decidir_lote(n, 'fga', p['eventos']).values()))
        n = atletismo.importar(n, p, AHORA)
        self.assertEqual(len(publicacion.proyectar(n)['eventos']), 3)

    def test_la_clave_de_issue_no_cambia_con_el_orden_o_los_datos(self):
        n = atletismo.importar(None, entrada('rfea', lugar={'nombre': 'Ourense'}), AHORA)
        p = entrada('fga', nombre='IX Cross Ponte Romana', lugar={'nombre': 'San Martiño'})
        n = atletismo.importar(n, p, AHORA)
        casos = c.incidencias(n)
        self.assertEqual(len(casos), 1)
        clave = casos[0]['clave']
        p['eventos'][0]['nombre'] = 'IX Cross Ponte Romana 2026'
        n = atletismo.importar(n, p, '2026-11-03T20:00:00+01:00')
        self.assertEqual(c.incidencias(n)[0]['clave'], clave)
        texto = revision.cuerpo(c.incidencias(n)[0])
        self.assertIn('San Martiño', texto)
        self.assertIn('Ourense', texto)
        self.assertIn(revision.marcador(clave), texto)


class Issues(unittest.TestCase):
    def caso(self, clave='a' * 24):
        return {'clave': clave, 'motivo': 'Sede diferente', 'comparacion': {'estado': 'revisar'},
                'citas': [{'fuente': 'rfea', **entrada('rfea')['eventos'][0]}]}

    def test_sin_casos_no_consulta_github(self):
        with patch.object(revision, '_gh') as gh:
            self.assertEqual(revision.enviar([], 'thendabs1/voceiro')['creados'], [])
            gh.assert_not_called()

    def test_issues_paginados_abiertos_y_cerrados_se_reutilizan(self):
        paginas = [[{'html_url': 'https://github.com/issue/1', 'state': 'closed',
                     'body': revision.marcador('a' * 24)}],
                   [{'html_url': 'https://github.com/issue/2', 'state': 'open',
                     'body': revision.marcador('b' * 24)}]]
        with patch.object(revision, '_gh', return_value=json.dumps(paginas)) as gh:
            r = revision.enviar([self.caso(), self.caso('b' * 24)], 'thendabs1/voceiro')
            self.assertEqual(len(r['existentes']), 2)
            self.assertEqual(r['creados'], [])
            self.assertEqual(gh.call_count, 1)
            self.assertIn('--paginate', gh.call_args.args[0])

    def test_envio_estructurado_limite_y_repeticion_del_mismo_par(self):
        caso = self.caso()
        caso['citas'][0]['nombre'] = 'Carrera $(comando) `literal`\n--opcion'
        with patch.object(revision, '_gh', side_effect=['[]', json.dumps({'html_url': 'https://github.com/issue/3'})]) as gh:
            r = revision.enviar([caso, caso, self.caso('b' * 24)], 'thendabs1/voceiro', limite=1)
            self.assertEqual((len(r['creados']), len(r['existentes']), r['pendientes']), (1, 1, 1))
            argumentos, cuerpo = gh.call_args.args
            self.assertEqual(argumentos[-2:], ['--input', '-'])
            self.assertIn('$(comando)', json.loads(cuerpo)['body'])

    def test_un_error_de_listado_o_escritura_no_se_reintenta(self):
        with patch.object(revision, '_gh', side_effect=RuntimeError('Sin acceso')) as gh:
            with self.assertRaises(RuntimeError):
                revision.enviar([self.caso()], 'thendabs1/voceiro')
            self.assertEqual(gh.call_count, 1)
        with patch.object(revision, '_gh', side_effect=['[]', RuntimeError('Respuesta perdida')]) as gh:
            with self.assertRaises(RuntimeError):
                revision.enviar([self.caso()], 'thendabs1/voceiro')
            self.assertEqual(gh.call_count, 2)


if __name__ == '__main__':
    unittest.main()
