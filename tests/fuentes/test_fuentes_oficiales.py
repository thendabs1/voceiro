"""Fuentes oficiales: identidad, tiempo, selección, paginación y evidencia."""

from copy import deepcopy
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from agenda import nucleo, oficial_f1, oficial_laliga, oficial_wta, publicacion


MUESTRAS = Path(__file__).with_name('muestras_calendario') / 'oficiales'
OBSERVADO = '2026-10-26T20:00:00+00:00'
DESPUES = '2026-10-27T20:00:00+00:00'


def f1():
    d = json.loads((MUESTRAS / 'f1-listado-2026.json').read_text())
    html = (MUESTRAS / 'f1-mexico-programa.html').read_text()
    d['programas'] = {'1298': oficial_f1.leer_programa(html, '1298', '2026')}
    d['seleccion_programa'] = {'inicio': '2026-10-30', 'fin': '2026-11-01', 'ids': ['1298']}
    return d


def wta():
    return json.loads((MUESTRAS / 'wta-seleccion-2026.json').read_text())


def html_laliga(archivo):
    return (MUESTRAS / (archivo + '.html')).read_text()


def laliga(archivo='laliga-futuro-correcto', liga='primera', jornada=11):
    p = oficial_laliga.leer(html_laliga(archivo), '2026', liga, jornada)
    return {'year': '2026', 'competicion': liga, 'jornadas': p['jornadas'],
        'paginas': [{'jornada': p['jornada'], 'partidos': p['partidos']}],
        'seleccion': {'inicio': '2026-10-30', 'fin': '2026-11-01', 'jornadas': [jornada]}}


def reescribir_next(html, modificar):
    import re
    m = re.search(r'(<script[^>]+>)(.*?)(</script>)', html, re.S)
    dato = json.loads(m[2])
    modificar(dato)
    return html[:m.start(2)] + json.dumps(dato) + html[m.end(2):]


class Formula1Oficial(unittest.TestCase):
    def setUp(self):
        oficial_f1._clave_publica.cache_clear()

    def tearDown(self):
        oficial_f1._clave_publica.cache_clear()

    def test_listado_real_gp_dias_oficiales_y_programa_identificado(self):
        n = oficial_f1.importar(None, f1(), OBSERVADO)
        p = publicacion.proyectar(n)
        self.assertEqual(len(p['eventos']), 23)
        self.assertEqual(sum(len(e.get('programa', [])) for e in p['eventos']), 5)
        las_vegas = next(e for e in p['eventos'] if 'Las Vegas' in e['nombres']['und'])
        c = las_vegas['programacion']['valor']['cuando']
        self.assertEqual(c['inicio']['fecha'], '2026-11-19')
        self.assertEqual(c['fin']['fecha'], '2026-11-21')
        mexico = next(e for e in p['eventos'] if 'programa' in e)
        fp1 = next(s for s in mexico['programa'] if s['agenda']['tipo_sesion'] == 'FP1')
        self.assertEqual(fp1['programacion']['valor']['cuando']['inicio']['instante'], '2026-10-30T12:30:00-06:00')
        self.assertEqual(fp1['programacion']['valor']['cuando']['inicio']['zona'], 'America/Mexico_City')
        self.assertFalse(n['resultados'])
        self.assertFalse(n['clasificaciones'])
        self.assertFalse(n['participaciones'])

    def test_transporte_lista_anual_y_solo_programa_del_horizonte(self):
        listado = json.loads((MUESTRAS / 'f1-listado-2026.json').read_text())
        html = (MUESTRAS / 'f1-mexico-programa.html').read_text()
        config = '<script>self.__next_f.push([1,' + json.dumps('"' + oficial_f1.CAMPO_CLAVE_PUBLICA + '":"clave-publica-prueba"') + '])</script>'
        with patch('agenda.oficial_f1.recogida.descargar', side_effect=[config, json.dumps(listado), html]) as get:
            pagina, url = oficial_f1.recoger('2026', '2026-10-30', '2026-11-01')
        self.assertEqual(get.call_count, 3)
        self.assertEqual(set(pagina['programas']), {'1298'})
        self.assertEqual(pagina['seleccion_programa']['ids'], ['1298'])
        self.assertEqual(len(pagina['events']), 23)
        self.assertIn('year=2026', url)
        self.assertNotIn('clave-publica-prueba', json.dumps(pagina))
        self.assertEqual(get.call_args_list[1].kwargs['cabeceras']['apikey'], 'clave-publica-prueba')

    def test_describir_separa_calendario_anual_de_programas_seleccionados(self):
        p = f1()
        d = oficial_f1.describir(p)
        self.assertEqual(d['fin'], '2026-12-06')
        self.assertTrue(d['fin_confirmado'])
        self.assertTrue(d['calendario_completo'])
        self.assertTrue(d['programa_completo'])
        self.assertEqual(d['programa']['ids'], ['1298'])
        p['programas']['1298'] = []
        d = oficial_f1.describir(p)
        self.assertTrue(d['calendario_completo'])
        self.assertFalse(d['programa_completo'])

    def test_programa_que_sale_de_ventana_conserva_comprobacion_anterior(self):
        p = f1()
        a = oficial_f1.importar(None, p, OBSERVADO)
        p['programas'] = {}
        p['seleccion_programa'] = {'inicio': '2026-11-10', 'fin': '2026-11-18', 'ids': []}
        b = oficial_f1.importar(a, p, DESPUES)
        salida = publicacion.proyectar(b)
        programa = next(e['programa'] for e in salida['eventos'] if e.get('programa'))
        self.assertEqual(len(programa), 5)
        sesiones = {r['id'] for r in b['referencias'].values() if r['tipo_externo'] == 'meeting_session_key'}
        for o in b['observaciones'].values():
            if o['referencia'] in sesiones:
                self.assertEqual(o['ultima_observacion'], OBSERVADO)

    def test_estado_deportivo_no_cambia_evidencia_y_horario_si(self):
        p = f1()
        a = oficial_f1.importar(None, p, OBSERVADO)
        for g in p['events']:
            g['status'] = 'completed'
        for s in p['programas']['1298']:
            s['state'] = 'completed'
            s['resultados'] = {'winner': 'sentinela'}
        b = oficial_f1.importar(a, p, DESPUES)
        self.assertEqual(a['documentos'], b['documentos'])
        self.assertEqual(set(a['observaciones']), set(b['observaciones']))
        p['programas']['1298'][0]['startTime'] = '2026-10-30T12:45:00'
        c = oficial_f1.importar(b, p, '2026-10-28T20:00:00+00:00')
        self.assertEqual(set(b['entidades']), set(c['entidades']))
        self.assertEqual(len(c['documentos']), len(b['documentos']) + 1)
        self.assertNotIn('sentinela', json.dumps(c['documentos']))

    def test_rechaza_otro_ano_ids_repetidos_offset_incompatible_y_html_ajeno(self):
        p = f1()
        with self.assertRaisesRegex(ValueError, 'temporada'):
            oficial_f1.importar(None, p, OBSERVADO, temporada='2027')
        p['events'].append(deepcopy(p['events'][0]))
        with self.assertRaisesRegex(ValueError, 'repetido'):
            oficial_f1.importar(None, p, OBSERVADO)
        p = f1()
        p['programas']['1298'][0]['gmtOffset'] = '+01:00'
        with self.assertRaises(ValueError):
            oficial_f1.importar(None, p, OBSERVADO)
        with self.assertRaisesRegex(ValueError, 'ausente'):
            oficial_f1.leer_programa((MUESTRAS / 'f1-mexico-programa.html').read_text(), '1300', '2026')

    def test_alias_iana_acreditado_y_enlace_de_programa_restringido(self):
        self.assertEqual(oficial_f1._zona('US/Central'), 'America/Chicago')
        p = f1()
        gp = next(e for e in p['events'] if e['meetingKey'] == '1298')
        gp['url'] = 'https://ejemplo.invalid/en/racing/2026/mexico'
        with self.assertRaisesRegex(ValueError, 'Enlace'):
            oficial_f1.importar(None, p, OBSERVADO)


class WTAOficial(unittest.TestCase):
    def test_torneos_reales_dias_sin_jugadoras_ni_resultados(self):
        p = wta()
        p['content'][0]['winners'] = [{'sentinela': 'no guardar'}]
        n = oficial_wta.importar(None, p, OBSERVADO)
        eventos = publicacion.proyectar(n)['eventos']
        self.assertEqual(len(eventos), 2)
        self.assertFalse(n['participaciones'])
        self.assertFalse(n['resultados'])
        self.assertFalse(n['clasificaciones'])
        self.assertNotIn('sentinela', json.dumps(n['documentos']))
        self.assertTrue(all(e['programacion']['valor']['cuando']['inicio']['precision'] == 'fecha' for e in eventos))
        self.assertTrue(any(e['id'] == nucleo.identificador('circuito-tenis', 'wta') for e in n['entidades'].values()))

    def test_paginacion_completa_antes_de_importar_sin_usar_num_pages(self):
        filas = wta()['content']
        paginas = [{'pageInfo': {'page': i, 'pageSize': 100, 'numPages': 0, 'numEntries': 2},
                    'content': [filas[i]]} for i in range(2)]
        with patch('agenda.oficial_wta.recogida.descargar', side_effect=[json.dumps(p) for p in paginas]) as get:
            p, _ = oficial_wta.recoger('2026')
        self.assertEqual(get.call_count, 2)
        self.assertEqual(len(p['content']), 2)
        self.assertIn('from=2026-01-01', get.call_args_list[0].args[0])
        self.assertIn('to=2026-12-31', get.call_args_list[0].args[0])
        self.assertNotIn('year=', get.call_args_list[0].args[0])
        self.assertNotIn('winners', json.dumps(p))

    def test_respuesta_historica_parametro_ignorado_no_se_importa(self):
        p = wta()
        p['content'][0]['year'] = 1960
        with self.assertRaisesRegex(ValueError, 'temporada'):
            oficial_wta.importar(None, p, OBSERVADO)
        with self.assertRaisesRegex(ValueError, '[Tt]emporada'):
            oficial_wta.importar(None, wta(), OBSERVADO, temporada='2027')

    def test_error_paginacion_repetida_truncada_y_total_cambiante(self):
        filas = wta()['content']
        base = {'pageInfo': {'page': 0, 'numEntries': 2}, 'content': [filas[0]]}
        for segunda in (
            {'pageInfo': {'page': 1, 'numEntries': 2}, 'content': [filas[0]]},
            {'pageInfo': {'page': 1, 'numEntries': 3}, 'content': [filas[1]]},
            {'pageInfo': {'page': 1, 'numEntries': 2}, 'content': []},
        ):
            with self.subTest(segunda=segunda['pageInfo']):
                with patch('agenda.oficial_wta.recogida.descargar', side_effect=[json.dumps(base), json.dumps(segunda)]):
                    with self.assertRaises(ValueError):
                        oficial_wta.recoger('2026')

    def test_fecha_modificada_conserva_identidad_y_vacio_no_cierra(self):
        p = wta()
        a = oficial_wta.importar(None, p, OBSERVADO)
        p['content'][0]['endDate'] = '2026-01-12'
        b = oficial_wta.importar(a, p, DESPUES)
        self.assertEqual(a['referencias'], b['referencias'])
        self.assertEqual(set(a['entidades']), set(b['entidades']))
        self.assertGreater(len(b['observaciones']), len(a['observaciones']))
        d = oficial_wta.describir({'year': '2027', 'pageInfo': {'numEntries': 0}, 'content': []})
        self.assertFalse(d['cobertura_completa'])
        self.assertFalse(d['fin_confirmado'])
        self.assertIsNone(d['fin'])


class LaLigaOficial(unittest.TestCase):
    def test_partidos_reales_primera_y_segunda_con_identidades_y_horas(self):
        for archivo, liga, jornada in [('laliga-futuro-correcto', 'primera', 11),
                                      ('laliga-segunda-futuro', 'segunda', 12)]:
            with self.subTest(liga=liga):
                n = oficial_laliga.importar(None, laliga(archivo, liga, jornada), OBSERVADO)
                p = publicacion.proyectar(n)
                self.assertEqual(len(p['eventos']), 2)
                self.assertTrue(all(e['programacion']['valor']['cuando']['inicio']['instante'] for e in p['eventos']))
                self.assertFalse(n['resultados'])
                self.assertFalse(n['clasificaciones'])
                self.assertEqual(len(n['participaciones']), 4)
                # La consulta usa el nombre de colección; la identidad, el código de LaLiga.
                self.assertEqual({c for e in p['entidades'].values() for c in e['codigos']}, {liga})

    def test_marcador_temporal_no_confirma_dia_y_no_acredita_fin_temporada(self):
        p = laliga('laliga-primera-ultima', 'primera', 38)
        n = oficial_laliga.importar(None, p, OBSERVADO)
        eventos = publicacion.proyectar(n)['eventos']
        self.assertTrue(all(e['programacion']['valor']['cuando']['inicio']['precision'] == 'desconocida' for e in eventos))
        self.assertIn('2027-05-30T00:00:00+00:00', json.dumps(n['documentos']))
        d = oficial_laliga.describir(p)
        self.assertFalse(d['fin_confirmado'])
        self.assertFalse(d['cobertura_completa'])
        self.assertFalse(d['programa_completo'])
        self.assertIsNone(d['fin'])

    def test_playoff_real_por_determinar_con_id_positivo_no_crea_equipo(self):
        p = laliga('laliga-segunda-ultima', 'segunda', 46)
        self.assertEqual(len(p['jornadas']), 46)
        self.assertEqual(p['jornadas'][-1]['name'], 'Playoff 2 - Vuelta')
        n = oficial_laliga.importar(None, p, OBSERVADO)
        self.assertEqual(len(publicacion.proyectar(n)['eventos']), 1)
        self.assertFalse(any(e['tipo'] == 'participante' for e in n['entidades'].values()))
        self.assertEqual(len(n['participaciones']), 2)
        self.assertTrue(all(p['participante'] is None for p in n['participaciones'].values()))

    def test_html_home_200_y_seleccion_ajena_se_rechazan(self):
        html = html_laliga('laliga-futuro-correcto')
        with self.assertRaises(ValueError):
            oficial_laliga.leer(reescribir_next(html, lambda d: d.update(page='/')), '2026', 'primera')
        with self.assertRaises(ValueError):
            oficial_laliga.leer(html, '2027', 'primera')
        with self.assertRaises(ValueError):
            oficial_laliga.leer(html, '2026', 'segunda')
        with self.assertRaises(ValueError):
            oficial_laliga.leer(html, '2026', 'primera', 12)

    def test_transporte_jornadas_del_horizonte_con_catalogo_y_limites(self):
        html = html_laliga('laliga-futuro-correcto')
        def primera(d):
            p = d['props']['pageProps']
            p['gameweek'] = p['gameweekList'][0]
            p['matches'] = []
        base = reescribir_next(html, primera)
        with patch('agenda.oficial_laliga.recogida.descargar', side_effect=[base, html]) as get:
            p, _ = oficial_laliga.recoger('2026', 'primera', '2026-10-30', '2026-11-01')
        self.assertEqual(get.call_count, 2)
        self.assertIn('/2026-27/jornada-1', get.call_args_list[0].args[0])
        self.assertIn('/2026-27/jornada-11', get.call_args_list[1].args[0])
        self.assertEqual(p['seleccion']['jornadas'], [11])
        d = oficial_laliga.describir(p)
        self.assertFalse(d['cobertura_completa'])
        self.assertFalse(d['ventana_completa'])
        self.assertTrue(d['programa_completo'])

    def test_cambio_catalogo_no_devuelve_prefijo_parcial(self):
        html = html_laliga('laliga-futuro-correcto')
        def primera(d):
            p = d['props']['pageProps']
            p['gameweek'] = p['gameweekList'][0]
            p['matches'] = []
        def cambiar(d):
            d['props']['pageProps']['gameweekList'][-1]['id'] = 999999
        with patch('agenda.oficial_laliga.recogida.descargar', side_effect=[
                reescribir_next(html, primera), reescribir_next(html, cambiar)]):
            with self.assertRaisesRegex(ValueError, 'catálogo'):
                oficial_laliga.recoger('2026', 'primera', '2026-10-30', '2026-11-01')

    def test_repeticion_partido_se_rechaza_y_resultados_no_cambian_agenda(self):
        html = html_laliga('laliga-futuro-correcto')
        def repetir(d):
            p = d['props']['pageProps']
            p['matches'].append(deepcopy(p['matches'][0]))
        with self.assertRaisesRegex(ValueError, 'repetido'):
            oficial_laliga.leer(reescribir_next(html, repetir), '2026', 'primera')
        p = laliga()
        a = oficial_laliga.importar(None, p, OBSERVADO)
        def resultado(d):
            for m in d['props']['pageProps']['matches']:
                m.update(status='FullTime', home_score=99, away_score=98)
        cambiado = oficial_laliga.leer(reescribir_next(html, resultado), '2026', 'primera', 11)
        p['paginas'][0]['partidos'] = cambiado['partidos']
        b = oficial_laliga.importar(a, p, DESPUES)
        self.assertEqual(a['documentos'], b['documentos'])
        self.assertEqual(set(a['observaciones']), set(b['observaciones']))
        self.assertNotIn('home_score', json.dumps(b['documentos']))


if __name__ == '__main__':
    unittest.main()
