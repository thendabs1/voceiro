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

    def test_atapuerca_enlaza_al_campeonato_sin_absorber_el_cross_internacional(self):
        fca = next(e for e in atletismo.leer_cataluna(json.loads((MUESTRAS / 'fca.json').read_text())) if e['id'] == '83650')
        campeonato = entrada('rfea', '64831', nombre='Campeonato de España de Campo a Través por Clubes',
            inicio='2026-11-22', fin='2026-11-22', lugar={'nombre': 'Atapuerca'},
            url=fca['metadatos']['web_organizador'])['eventos'][0]
        cross = entrada('rfea', '64930', nombre='XXII Cross Internacional de Atapuerca',
            inicio='2026-11-21', fin='2026-11-22', lugar={'nombre': 'BURGOS'},
            url='https://atletismorfea.es/calendario/campeonato/xxii-cross-internacional-de-atapuerca')['eventos'][0]
        paginas = [{'version': 1, 'fuente': 'rfea', 'eventos': [cross, campeonato]},
                   {'version': 1, 'fuente': 'fca', 'eventos': [fca]}]
        for orden in (paginas, list(reversed(paginas))):
            n = None
            for pagina in orden:
                n = atletismo.importar(n, pagina, AHORA)
            refs = {(r['proveedor'], r['id_externo']): r['destino'] for r in n['referencias'].values()
                    if r['tipo_externo'] == 'competicion'}
            self.assertEqual(refs['rfea', '64831'], refs['fca', '83650'])
            self.assertNotEqual(refs['rfea', '64930'], refs['fca', '83650'])
            self.assertEqual(len(publicacion.proyectar(n)['eventos']), 2)
            self.assertEqual(c.incidencias(n), [])

    def test_un_enlace_con_otras_fechas_no_une_y_pide_revision(self):
        url = 'https://atletismorfea.es/calendario/campeonato/prueba'
        casos = {'otra edición': ('2027-12-12', '2027-12-12'), 'semana distinta': ('2026-11-08', '2026-11-08'),
                 'parte de unos Juegos': ('2026-11-01', '2026-11-03')}
        for caso, (inicio, fin) in casos.items():
            with self.subTest(caso):
                n = atletismo.importar(None, entrada('rfea', url=url, inicio='2026-11-01', fin='2026-11-15'), AHORA)
                b = entrada('fca', nombre='Campeonato en otro idioma', inicio=inicio, fin=fin,
                            metadatos={'web_organizador': url})
                self.assertEqual(c.decidir_lote(n, 'fca', b['eventos'])['uno']['estado'], 'revisar')
                n = atletismo.importar(n, b, AHORA)
                self.assertEqual(len(publicacion.proyectar(n)['eventos']), 2)
                aviso, = c.incidencias(n)
                self.assertIn('enlace con fechas diferentes', aviso['motivo'])
                self.assertTrue(aviso['comparacion']['enlace_directo'])

    def test_identidad_ya_compartida_conserva_su_issue_de_fechas(self):
        url = 'https://atletismorfea.es/calendario/campeonato/prueba'
        b = entrada('fca', nombre='Campeonato en otro idioma', metadatos={'web_organizador': url})
        n = atletismo.importar(None, entrada('rfea', url=url), AHORA)
        n = atletismo.importar(n, b, AHORA)
        self.assertEqual((len(publicacion.proyectar(n)['eventos']), c.incidencias(n)), (1, []))
        b['eventos'][0].update(inicio='2026-11-08', fin='2026-11-08')
        n = atletismo.importar(n, b, '2026-11-03T20:00:00+01:00')
        e, = publicacion.proyectar(n)['eventos']
        self.assertTrue(e['programacion']['conflicto'])
        aviso, = c.incidencias(n)
        self.assertEqual(aviso['motivo'], 'discrepancia de fechas en una identidad ya compartida')

    def test_el_enlace_tiene_prioridad_sobre_otro_nombre_parecido(self):
        p = entrada('rfea', 'referenciada', url='https://atletismorfea.es/calendario/campeonato/referenciada')
        p['eventos'].append({**p['eventos'][0], 'id': 'parecida',
                            'url': 'https://atletismorfea.es/calendario/campeonato/otra'})
        n = atletismo.importar(None, p, AHORA)
        e = entrada('fca', metadatos={'web_organizador': p['eventos'][0]['url']})['eventos'][0]
        d = c.decidir_lote(n, 'fca', [e])['uno']
        self.assertEqual(d['estado'], 'automatica')
        self.assertEqual(d['cita']['id'], 'referenciada')

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

    def test_ordinales_y_marca_federativa_sin_rebajar_umbral_ni_borrar_edicion(self):
        for a, b in [('103a Allianz Jean Bouin (RFEA)', '103 Allianz Jean Bouin'),
                     ('60è Cros Internacional de Catalunya Ciutat de Granollers (RFEA)',
                      '60 Cros internacional de Catalunya Ciutat de Granollers'),
                     ('27ª Carrera Popular del Puerto', '27 Carrera Popular del Puerto')]:
            base = entrada('fca', nombre=a)['eventos'][0]
            self.assertEqual(c.comparar(base, {**base, 'nombre': b})['estado'], 'automatica')
            self.assertEqual(base['nombre'], a)
        self.assertNotEqual(c.nombre_comparable('103a Allianz Jean Bouin (RFEA)'),
                            c.nombre_comparable('104a Allianz Jean Bouin (RFEA)'))
        self.assertIn('campeonato', c.nombre_comparable('Carrera (Campeonato de España)'))
        self.assertIn('10 km', c.nombre_comparable('Carrera 10km Sub16'))

    def test_revision_de_san_martino_acredita_identidad_no_alias_de_sede_ni_fecha(self):
        a = {**entrada('fga', '113279', lugar={'nombre': 'Ourense'})['eventos'][0], 'fuente': 'fga'}
        b = {**entrada('rfea', '69339', lugar={'nombre': 'San Martiño'})['eventos'][0], 'fuente': 'rfea'}
        self.assertEqual(c.comparar(a, b)['estado'], 'revisar')
        self.assertEqual(c.comparar_referencias(a, b)['estado'], 'automatica')
        n = atletismo.importar(None, {'version': 1, 'fuente': 'fga', 'eventos': [a]}, AHORA)
        n = atletismo.importar(n, {'version': 1, 'fuente': 'rfea', 'eventos': [b]}, AHORA)
        self.assertEqual(c.incidencias(n), [])
        e, = publicacion.proyectar(n)['eventos']
        self.assertTrue(e['lugar']['conflicto'])
        b.update(inicio='2026-11-02', fin='2026-11-02')
        n = atletismo.importar(n, {'version': 1, 'fuente': 'rfea', 'eventos': [b]}, '2026-11-03T20:00:00+01:00')
        self.assertIn('fechas', c.incidencias(n)[0]['motivo'])
        self.assertEqual(c.comparar_referencias(a, {**b, 'id': 'otra'})['estado'], 'distintas')

    def test_enlace_y_revision_con_destinos_contradictorios_no_eligen_uno(self):
        a = entrada('fga', '113279', nombre='XLIX Carreira Pedestre Popular do San Martiño',
                    lugar={'nombre': 'Ourense'})
        otro = entrada('fca', 'otro', nombre='Otra prueba distinta',
                        url='https://fcatletisme.cat/event/otra-prueba/')
        n = atletismo.importar(None, a, AHORA)
        n = atletismo.importar(n, otro, AHORA)
        b = entrada('rfea', '69339', nombre='XLIX Carreira Popular do San Martiño',
                    lugar={'nombre': 'San Martiño'},
                    metadatos={'web_organizador': otro['eventos'][0]['url']})
        self.assertEqual(c.decidir_lote(n, 'rfea', b['eventos'])['69339']['estado'], 'revisar')

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

    def test_la_revision_acredita_identidad_sin_borrar_lo_calculado(self):
        rfea = entrada('rfea', '67588', nombre='B100 Cursa dels Nassos', lugar={'nombre': 'Barcelona'})['eventos'][0]
        fca = entrada('fca', '83074', nombre='B100 Cursa dels Nassos (5 i 10 Km)', lugar={'nombre': 'Barcelona'})['eventos'][0]
        comparacion = c.comparar_referencias({**rfea, 'fuente': 'rfea'}, {**fca, 'fuente': 'fca'})
        self.assertEqual((comparacion['estado'], comparacion['veredicto']), ('automatica', 'revisar'))
        self.assertIn('categoría, formato o distancia de distinto alcance', comparacion['motivos'])

    def test_el_veredicto_no_cambia_la_huella_de_un_caso_revisado(self):
        caso = {'motivo': 'modalidades diferentes', 'citas': [],
                'comparacion': {'estado': 'revisar', 'motivos': ['modalidades diferentes'], 'version': c.VERSION}}
        con_veredicto = {**caso, 'comparacion': {**caso['comparacion'], 'veredicto': 'automatica'}}
        self.assertEqual(revision.huella(con_veredicto), revision.huella(caso))

    def test_misma_fuente_solo_avisa_de_lo_que_parece_duplicado_y_nunca_une(self):
        cita = lambda i, nombre='Samarkand Marathon': entrada('fca', i, nombre=nombre, lugar={'nombre': 'Samarkand'})['eventos'][0]
        larga = 'Gran Premio Internacional Cross Ponte Romana Ciudad Lugo Galicia'
        n = atletismo.importar(None, {'version': 1, 'fuente': 'fca', 'eventos': [cita('a'), cita('b')]}, AHORA)
        self.assertEqual(len(publicacion.proyectar(n)['eventos']), 2)
        aviso, = c.incidencias(n)
        self.assertEqual(aviso['motivo'], 'posible duplicado de la misma fuente')
        self.assertEqual(aviso['comparacion']['estado'], 'revisar')
        self.assertEqual({e['id'] for e in aviso['citas']}, {'a', 'b'})
        ruido = {'otro título': [cita('a', 'Trofeu Promoció (3a Jornada)'), cita('b', 'Trofeu Promoció (4a Jornada)')],
                 'otra sede': [cita('a'), {**cita('b'), 'lugar': {'nombre': 'Milano'}}],
                 'otro día': [cita('a'), {**cita('b'), 'inicio': '2026-11-02', 'fin': '2026-11-02'}],
                 'otra categoría': [cita('a', 'Control Sub 16-18 ST'), cita('b', 'Control Absolut-Sub20 ST')],
                 'título casi igual con otra edad': [cita('a', larga + ' Sub 16'), cita('b', larga + ' Sub 18')]}
        for caso, eventos in ruido.items():
            with self.subTest(caso):
                n = atletismo.importar(None, {'version': 1, 'fuente': 'fca', 'eventos': eventos}, AHORA)
                self.assertEqual(c.incidencias(n), [])

    def test_compartir_enlace_no_oculta_un_duplicado_de_la_misma_fuente(self):
        url = 'https://atletismorfea.es/calendario/campeonato/prueba'
        p = entrada('fca', 'a', metadatos={'web_organizador': url})
        p['eventos'].append({**p['eventos'][0], 'id': 'b'})
        n = atletismo.importar(None, p, AHORA)
        self.assertEqual(len(publicacion.proyectar(n)['eventos']), 2)
        aviso, = c.incidencias(n)
        self.assertEqual(aviso['motivo'], 'posible duplicado de la misma fuente')

    def test_dos_lecturas_de_una_referencia_no_son_dos_registros(self):
        n = atletismo.importar(None, entrada('fca', 'a'), AHORA)
        n = atletismo.importar(n, entrada('fca', 'a', nombre='IX Cross Ponte Romana'), AHORA)
        self.assertEqual(len(c.actuales(n)), 2)
        self.assertEqual(c.incidencias(n), [])

    def test_dos_registros_de_una_fuente_en_una_identidad_se_vigilan(self):
        p = entrada('fca', 'a', nombre='Cursa del Port')
        p['eventos'].append({**p['eventos'][0], 'id': 'b', 'nombre': 'Campionat de Marxa', 'lugar': {'nombre': 'Reus'}})
        n = atletismo.importar(None, p, AHORA)
        self.assertEqual(c.incidencias(n), [])
        r = [r for r in n['referencias'].values() if r['tipo_externo'] == 'competicion']
        r[1]['destino'] = r[0]['destino']
        aviso, = c.incidencias(n)
        self.assertEqual(aviso['motivo'], 'dos registros de una fuente en la misma identidad')

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
                     'body': revision.cuerpo(self.caso())}],
                   [{'html_url': 'https://github.com/issue/2', 'state': 'open',
                     'body': revision.cuerpo(self.caso('b' * 24))}]]
        with patch.object(revision, '_gh', return_value=json.dumps(paginas)) as gh:
            r = revision.enviar([self.caso(), self.caso('b' * 24)], 'thendabs1/voceiro')
            self.assertEqual(len(r['existentes']), 2)
            self.assertEqual(r['creados'], [])
            self.assertEqual(gh.call_count, 1)
            self.assertIn('--paginate', gh.call_args.args[0])

    def test_un_cambio_en_los_datos_reabre_el_issue_cerrado_y_conserva_el_cuerpo(self):
        anterior = self.caso()
        cambiado = self.caso()
        cambiado['citas'][0] = {**cambiado['citas'][0], 'fin': '2026-12-06'}
        self.assertNotEqual(revision.huella(anterior), revision.huella(cambiado))
        nota = revision.cuerpo(anterior) + '\n\nNota editorial: pendiente de la circular.'
        paginas = [[{'html_url': 'https://github.com/issue/1', 'number': 1, 'state': 'closed', 'body': nota}]]
        with patch.object(revision, '_gh', side_effect=[json.dumps(paginas), '{}', '{}']) as gh:
            r = revision.enviar([cambiado, cambiado], 'thendabs1/voceiro')
        self.assertEqual((r['reabiertos'], r['existentes']), (['https://github.com/issue/1'], ['https://github.com/issue/1']))
        self.assertEqual(gh.call_count, 3)
        comentario, parche = gh.call_args_list[1].args, gh.call_args_list[2].args
        self.assertEqual(comentario[0][:4], ['api', '--method', 'POST', 'repos/thendabs1/voceiro/issues/1/comments'])
        self.assertIn('2026-12-06', json.loads(comentario[1])['body'])
        self.assertEqual(parche[0][:4], ['api', '--method', 'PATCH', 'repos/thendabs1/voceiro/issues/1'])
        datos = json.loads(parche[1])
        self.assertEqual(datos['state'], 'open')
        self.assertIn('Nota editorial: pendiente de la circular.', datos['body'])
        self.assertIn(revision.marcador_huella(revision.huella(cambiado)), datos['body'])
        self.assertNotIn(revision.marcador_huella(revision.huella(anterior)), datos['body'])

    def test_la_huella_cambia_con_la_modalidad_aunque_no_cambie_el_motivo(self):
        anterior = self.caso()
        cambiado = self.caso()
        cambiado['citas'][0] = {**cambiado['citas'][0], 'metadatos': {
            **(cambiado['citas'][0].get('metadatos') or {}), 'modalidad_literal': 'Trail Running'}}
        self.assertEqual(anterior['motivo'], cambiado['motivo'])
        self.assertNotEqual(revision.huella(anterior), revision.huella(cambiado))

    def test_issue_anterior_sin_huella_la_recibe_sin_reabrirse_ni_perder_texto(self):
        paginas = [[{'html_url': 'https://github.com/issue/1', 'number': 1, 'state': 'closed',
                     'body': revision.marcador('a' * 24) + '\nTexto escrito a mano'}]]
        with patch.object(revision, '_gh', side_effect=[json.dumps(paginas), '{}']) as gh:
            r = revision.enviar([self.caso()], 'thendabs1/voceiro')
        self.assertEqual((r['reabiertos'], r['existentes']), ([], ['https://github.com/issue/1']))
        datos = json.loads(gh.call_args.args[1])
        self.assertNotIn('state', datos)
        self.assertTrue(datos['body'].startswith(revision.marcador('a' * 24) + '\nTexto escrito a mano'))
        self.assertIn(revision.marcador_huella(revision.huella(self.caso())), datos['body'])

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
