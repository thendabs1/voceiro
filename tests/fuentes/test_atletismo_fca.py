"""FCA sin red: literales, documentos, coste e identidad de las citas."""
from copy import deepcopy
from datetime import date
from email.message import Message
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import quote

from agenda import atletismo as a, atletismo_bloque, atletismo_fca as fca, atletismo_recogida as r
from agenda import almacen, publicacion, recogida
from agenda import atletismo_coincidencias as coincidencias

MUESTRAS = Path(__file__).with_name('muestras_calendario') / 'atletismo'
FICHA = (MUESTRAS / 'fca' / 'ficha-89925.html').read_text()


def pagina():
    return json.loads((MUESTRAS / 'fca' / 'api.json').read_text())


class AdaptadorFCA(unittest.TestCase):
    def test_entidades_reales_y_rol_publicado_sin_confundir_club_con_autoridad(self):
        eventos = {e['id']: e for e in a.leer_cataluna([pagina()])}
        m = eventos['80500']['metadatos']
        self.assertEqual([o['entidad_literal'] for o in m['organizacion']],
                         ['Associació Cursa del Roc Gros', 'Federació Catalana d’Atletisme'])
        self.assertEqual({o['rol'] for o in m['organizacion']}, {'organiza'})
        self.assertEqual(m['fuente']['relacion'], 'propio')  # La FCA coorganiza con un club.
        self.assertEqual(eventos['90048']['metadatos']['fuente']['relacion'], 'propio')
        self.assertEqual(eventos['89925']['metadatos']['fuente']['relacion'], 'propio')  # Solo un club: está en su calendario.
        for e in eventos.values():
            meta = e['metadatos']
            self.assertEqual(meta['alcance']['tipo'], 'desconocido')
            self.assertEqual(meta['actividad']['valor'], 'desconocida')
            self.assertNotIn('calendarios', meta)
            atletismo_bloque.validar(meta, e['inicio'], e['fin'], fuente='fca')

    def test_description_real_admitidos_y_texto_sin_html(self):
        e = next(e for e in a.leer_cataluna([pagina()]) if e['id'] == '80770')
        meta = e['metadatos']
        self.assertEqual(meta['descripcion']['texto'], '· Atletes admesos')
        d, = meta['documentos']
        self.assertEqual(d['rol'], 'inscritos')
        self.assertEqual(d['evidencia'], {'superficie': 'api', 'url': fca.API + '/80770',
                                        'localizador': 'description', 'literal': 'Atletes admesos'})
        self.assertNotIn('<', json.dumps(meta, ensure_ascii=False))

    def test_enlaces_roto_y_de_otra_edicion_no_acreditan_reflejo(self):
        eventos = {e['id']: e for e in a.leer_cataluna([pagina()])}
        for i, destino in (('80237', '69298'), ('80239', '64834')):
            meta = eventos[i]['metadatos']
            # Reflejo por título u organización, nunca por el enlace, que se conserva literal.
            self.assertEqual(meta['fuente']['relacion'], 'reflejo')
            self.assertNotEqual(meta['fuente']['evidencia']['localizador'], 'website')
            self.assertIn('atletismorfea.es', meta['web_organizador'])
        web = 'https://atletismorfea.es/calendario/campeonato/otra-edicion'
        sin_titulo = fca.relacion('https://fcatletisme.cat/x', 'Cursa', None, ['Federació Catalana d’Atletisme'], web)
        self.assertEqual((sin_titulo['relacion'], sin_titulo['evidencia']['literal']), ('desconocido', web))

    def test_estado_editorial_y_titulo_no_deciden_estado_deportivo(self):
        p = pagina()
        e = next(e for e in p['events'] if e['id'] == 84320)
        e['status'] = 'publish'
        eventos = a.leer_cataluna([p])
        cita = next(e for e in eventos if e['id'] == '84320')
        self.assertEqual(cita['metadatos']['temporalidad']['estado'], 'desconocido')
        self.assertNotIn('estado', cita)
        self.assertTrue(any(x['id'] == '84320' and 'título' in x['motivo'] for x in fca.avisos(eventos)))

    def test_roles_por_etiqueta_o_seccion_nunca_por_archivo(self):
        html = '''<h3>Horari</h3><a href="/a.pdf">Matí</a>
          <h3>Enllaços</h3><a href="/reglament.pdf">Sub12</a>
          <a href="/r">Resultats 10 Km</a><a href="/p">Programa</a>
          <a href="/n">Normes Tècniques</a><a href="/a">Atletes admesos</a>
          <a href="/c">Atletes classificats</a><a href="/i">Informació complementaria</a>
          <a href="javascript:alert(1)">Reglament</a><a href="mailto:exemple">Contacte</a>'''
        docs = fca.documentos(html, 'https://fcatletisme.cat/event/prova/')
        self.assertEqual([d['rol'] for d in docs],
                         ['horario', 'otro', 'resultados', 'horario', 'normas', 'inscritos', 'otro', 'informacion_tecnica'])
        self.assertEqual(docs[0]['evidencia']['literal'], 'Horari / Matí')
        self.assertEqual(docs[1]['rol'], 'otro')
        self.assertNotIn('hash', docs[0])

    def test_html_variable_no_cambia_la_observacion(self):
        p = pagina()
        e = next(e for e in p['events'] if e['id'] == 80770)
        previo = fca.enriquecer(e)
        e['description'] = '<div class="variable"><span>·</span> <a style="color: red" href="' + previo['documentos'][0]['url'] + '"> Atletes   admesos </a></div>'
        self.assertEqual(fca.enriquecer(e), previo)
        self.assertEqual(fca.texto('<script>variable</script> A\n\t B <style>otro</style>'), 'A B')

    def test_recogida_lee_api_y_fichas_sin_descargar_pdf(self):
        vistas = []
        def descargar(url):
            vistas.append(url)
            if url.startswith(fca.API):
                return json.dumps({**pagina(), 'total': 1, 'total_pages': 1, 'events': pagina()['events'][:1]})
            return FICHA.replace('post-89925', 'post-' + str(pagina()['events'][0]['id']))
        entrada, informe = r.recoger('fca', '2026-11-04', '2026-12-31', descargar=descargar)
        self.assertEqual(len(vistas), 2)
        self.assertFalse(any(u.endswith('.pdf') for u in vistas))
        self.assertTrue(informe['completo'])
        self.assertEqual(informe['fichas'], {'leidas': 1, 'documentos': 1, 'fallidas': [],
                                             'conservadas': 0, 'atrasadas': 0})
        d = entrada['eventos'][0]['metadatos']['documentos'][-1]
        self.assertEqual((d['rol'], d['evidencia']['superficie'], d['evidencia']['localizador']),
                         ('reglamento', 'ficha', 'dl/Reglament'))
        self.assertTrue(d['url'].endswith('.pdf'))

    def test_ficha_ajena_no_aporta_documentos(self):
        with self.assertRaisesRegex(ValueError, 'no acredita'):
            fca.leer_ficha(FICHA, '1', 'https://fcatletisme.cat/event/x/')

    def test_ficha_caida_conserva_y_un_bloqueo_corta_solo_las_fichas(self):
        previo = {'url': 'https://fcatletisme.cat/r.pdf', 'nombre': 'Reglament', 'rol': 'reglamento',
                  'evidencia': {'superficie': 'ficha', 'url': 'https://fcatletisme.cat/event/x/'}}
        eventos = [{'id': str(i), 'url': f'https://fcatletisme.cat/event/{i}/', 'metadatos': {'documentos': []}} for i in (1, 2, 3)]
        conocidas = [{'id': '1', 'fuente': 'fca', 'metadatos': {'documentos': [previo]}},
                     {'id': '3', 'fuente': 'fca', 'metadatos': {'documentos': [previo]}}]
        vistas = []
        def obtener(url):
            vistas.append(url)
            codigo = 500 if url.endswith('/1/') else 429
            raise HTTPError(url, codigo, 'x', {}, None)
        informe = fca.completar_fichas(eventos, obtener, conocidas)
        self.assertEqual(len(vistas), 2)  # La tercera ya no se pide.
        self.assertEqual([d['url'] for d in eventos[0]['metadatos']['documentos']], [previo['url']])
        self.assertEqual(eventos[1]['metadatos']['documentos'], [])
        self.assertEqual([d['url'] for d in eventos[2]['metadatos']['documentos']], [previo['url']])
        self.assertEqual([f['motivo'] for f in informe['fallidas']], ['HTTP 500', 'HTTP 429'])

    def test_presupuesto_agotado_no_se_trata_como_ficha_caida(self):
        eventos = [{'id': '1', 'url': 'https://fcatletisme.cat/event/1/', 'metadatos': {'documentos': []}}]
        def obtener(url):
            raise ValueError('Atletismo agotó su presupuesto; no se importa una recogida parcial')
        with self.assertRaisesRegex(ValueError, 'presupuesto'):
            fca.completar_fichas(eventos, obtener)

    def test_titulo_reservado_manda_aunque_organice_la_fca(self):
        base = {'id': 1, 'url': 'https://fcatletisme.cat/event/x/', 'start_date': '2026-12-05 00:00:00',
                'end_date': '2026-12-05 23:59:59', 'organizer': [{'organizer': 'Federació Catalana d’Atletisme'}]}
        m = fca.enriquecer({**base, 'title': 'Campionat d’Espanya de Clubs Màster ST'})
        self.assertEqual((m['fuente']['relacion'], m['fuente']['evidencia']['localizador']), ('reflejo', 'title'))
        self.assertEqual(fca.enriquecer({**base, 'title': 'Campionat de Catalunya'})['fuente']['relacion'], 'propio')

    def test_estar_en_su_calendario_basta_si_ninguna_autoridad_ajena_la_reclama(self):
        u = 'https://fcatletisme.cat/x'
        club = fca.relacion(u, 'Cursa', None, ['Joventut Atlètica Sabadell'], '')
        self.assertEqual((club['relacion'], club['evidencia']['localizador']), ('propio', 'organizer'))
        sin_organizador = fca.relacion(u, 'Campionat de Catalunya', None, [], '')
        self.assertEqual((sin_organizador['relacion'], sin_organizador['evidencia']['literal']), ('propio', 'Campionat de Catalunya'))
        conjunta = fca.relacion(u, 'Cursa', None, ['Federació Catalana d’Atletisme', 'Real Federación Española de Atletismo'], '')
        self.assertEqual(conjunta['relacion'], 'propio')
        # Otra federación, aunque sea en una pista catalana, no es de la FCA.
        andorra = fca.relacion(u, 'Control', None, ['Federació Andorrana d’Atletisme'], '')
        self.assertEqual((andorra['relacion'], andorra['de']), ('reflejo', 'faa'))
        # Maratón de Valencia y similares: enlace a RFEA sin organizador. No se reclaman.
        web = 'https://atletismorfea.es/calendario/campeonato/maraton-valencia'
        self.assertEqual(fca.relacion(u, 'Maratón Valencia', None, [], web)['relacion'], 'desconocido')

    def test_proteccion_y_esquema_roto_interrumpen_sin_mas_peticiones(self):
        for error in (403, 429):
            llamadas = []
            def obtener(url):
                llamadas.append(url)
                raise HTTPError(url, error, 'protección', {}, None)
            with self.assertRaises(HTTPError):
                r.cataluna(date(2026, 11, 4), date(2027, 1, 3), obtener)
            self.assertEqual(len(llamadas), 1)
        for campo, valor in [('description', {}), ('organizer', {}), ('venue', [1])]:
            p = pagina()
            p['events'][0][campo] = valor
            with self.assertRaisesRegex(ValueError, 'FCA:'):
                a.leer_cataluna([p])

    def test_paginacion_incoherente_detiene_antes_de_pedir_otra_pagina(self):
        primera = {**pagina(), 'total_pages': 2}
        segunda = {**pagina(), 'total_pages': 100}
        llamadas = []
        def obtener(url):
            llamadas.append(url)
            self.assertLessEqual(len(llamadas), 2)
            return json.dumps(primera if len(llamadas) == 1 else segunda)
        with self.assertRaisesRegex(ValueError, 'paginación catalana cambió'):
            r.cataluna(date(2026, 11, 4), date(2027, 1, 3), obtener)
        self.assertEqual(len(llamadas), 2)

    def test_importacion_aditiva_no_cambia_identidades_y_es_repetible(self):
        eventos = a.leer_cataluna([pagina()])
        anteriores = deepcopy(eventos)
        nuevas = {'descripcion', 'documentos', 'alcance', 'actividad', 'fuente', 'temporalidad',
                  'organizacion', 'titulos', 'sede_detalle', 'etiquetas', 'coste_literal'}
        for e in anteriores:
            e['metadatos'] = {k: v for k, v in e['metadatos'].items() if k not in nuevas}
        entrada = {'version': 1, 'fuente': 'fca', 'eventos': anteriores}
        n = a.importar(None, entrada, '2026-11-04T10:00:00+01:00')
        antes = {c['id']: c['destino'] for c in coincidencias.actuales(n)}
        entrada['eventos'] = eventos
        n = a.importar(n, entrada, '2026-11-04T11:00:00+01:00')
        self.assertEqual({c['id']: c['destino'] for c in coincidencias.actuales(n)}, antes)
        observaciones = set(n['observaciones'])
        nuevo = a.importar(n, entrada, '2026-11-04T12:00:00+01:00')
        self.assertEqual(set(nuevo['observaciones']), observaciones)


def ficha(i):
    return FICHA.replace('post-89925', 'post-' + str(i))


class FichasIncrementales(unittest.TestCase):
    PREVIO = {'url': 'https://fcatletisme.cat/r.pdf', 'nombre': 'Reglament', 'rol': 'reglamento',
              'evidencia': {'superficie': 'ficha', 'url': 'https://fcatletisme.cat/event/x/'}}

    def citas(self, ids, modificado='m'):
        eventos = [{'id': i, 'url': f'https://fcatletisme.cat/event/{i}/', 'inicio': f'2026-12-{i:0>2}',
                    'metadatos': {'documentos': [], 'modificado': modificado}} for i in ids]
        conocidas = [{'id': i, 'fuente': 'fca', 'metadatos': {'documentos': [self.PREVIO]}} for i in ids]
        return eventos, conocidas

    def test_solo_nuevas_cambiadas_y_la_rotacion_mas_antigua(self):
        eventos, conocidas = self.citas(['1', '2', '3', '4', '5'])
        leidas = {'1': {'modificado': 'm', 'leida': '2026-11-20'}, '2': {'modificado': 'antes', 'leida': '2026-11-21'},
                  '3': {'modificado': 'm', 'leida': '2026-11-01'}, '4': {'modificado': 'm', 'leida': '2026-11-10'},
                  '9': {'modificado': 'm', 'leida': '2026-11-01'}}  # Fuera de la ventana: se olvida.
        vistas = []
        def obtener(url):
            i = url.rstrip('/').rsplit('/', 1)[1]
            vistas.append(i)
            if i == '5':
                raise HTTPError(url, 500, 'x', {}, None)
            return ficha(i)
        with patch.object(fca, 'ROTACION', 1):
            informe = fca.completar_fichas(eventos, obtener, conocidas, leidas=leidas, ahora='2026-11-28')
        # 2 cambió, 5 es nueva y 3 es la leída hace más tiempo; 1 y 4 no se piden.
        self.assertEqual(sorted(vistas), ['2', '3', '5'])
        self.assertEqual(informe['estado'], {'1': leidas['1'], '4': leidas['4'], '5': {'intentada': '2026-11-28'},
                                             '2': {'modificado': 'm', 'leida': '2026-11-28'},
                                             '3': {'modificado': 'm', 'leida': '2026-11-28'}})
        self.assertEqual((informe['leidas'], len(informe['fallidas']), informe['conservadas'], informe['atrasadas']),
                         (2, 1, 2, 0))
        documentos = {e['id']: [d['url'] for d in e['metadatos']['documentos']] for e in eventos}
        self.assertEqual(documentos['1'], [self.PREVIO['url']])  # Sin pedir: conserva lo anterior.
        self.assertEqual(documentos['5'], [self.PREVIO['url']])  # Fallida: conserva y se repite.
        self.assertNotEqual(documentos['2'], [self.PREVIO['url']])

    def test_sin_modified_o_sin_lectura_guardada_se_pide(self):
        eventos, conocidas = self.citas(['1', '2'], modificado=None)
        leidas = {i: {'modificado': None, 'leida': '2026-11-27'} for i in ('1', '2')}
        vistas = []
        with patch.object(fca, 'ROTACION', 0):
            fca.completar_fichas(eventos, lambda u: vistas.append(u) or ficha(u.rstrip('/').rsplit('/', 1)[1]),
                                 conocidas[:1], leidas=leidas, ahora='2026-11-28')
        self.assertEqual(len(vistas), 2)
        eventos, _ = self.citas(['1'])
        vistas.clear()
        with patch.object(fca, 'ROTACION', 0):
            fca.completar_fichas(eventos, lambda u: vistas.append(u) or ficha('1'), (),
                                 leidas={'1': {'modificado': 'm', 'leida': '2026-11-27'}}, ahora='2026-11-28')
        self.assertEqual(len(vistas), 1)  # Sin documentos guardados que conservar.

    def test_cupo_pide_antes_las_mas_proximas_y_un_bloqueo_conserva_el_estado(self):
        eventos, conocidas = self.citas(['4', '3', '2', '1'])
        vistas = []
        with patch.object(fca, 'CUPO_FICHAS', 2):
            informe = fca.completar_fichas(eventos, lambda u: vistas.append(u) or ficha(u.rstrip('/').rsplit('/', 1)[1]),
                                           conocidas, leidas={}, ahora='2026-11-28')
        self.assertEqual([u.rstrip('/').rsplit('/', 1)[1] for u in vistas], ['1', '2'])  # Por prioridad.
        self.assertEqual((informe['atrasadas'], informe['conservadas'], sorted(informe['estado'])), (2, 2, ['1', '2']))
        leidas = {i: {'modificado': 'antes', 'leida': '2026-11-01'} for i in ('1', '2', '3', '4')}
        def bloqueo(url):
            raise HTTPError(url, 403, 'x', {}, None)
        informe = fca.completar_fichas(eventos, bloqueo, conocidas, leidas=leidas, ahora='2026-11-28')
        self.assertEqual([f['id'] for f in informe['fallidas']], ['1'])  # Antes la más próxima.
        self.assertEqual(informe['estado'], {**leidas, '1': {'intentada': '2026-11-28'}})

    def test_la_que_falla_siempre_no_ocupa_el_cupo_y_la_rotacion_va_detras(self):
        eventos, conocidas = self.citas(['1', '2', '3'])
        vistas = []
        def obtener(url):
            i = url.rstrip('/').rsplit('/', 1)[1]
            vistas.append(i)
            if i == '1':
                raise HTTPError(url, 500, 'x', {}, None)
            return ficha(i)
        leidas = {}
        for dia in ('2026-11-27', '2026-11-28'):
            with patch.object(fca, 'CUPO_FICHAS', 1), patch.object(fca, 'ROTACION', 0):
                leidas = fca.completar_fichas(deepcopy(eventos), obtener, conocidas, leidas=leidas, ahora=dia)['estado']
        self.assertEqual(vistas, ['1', '2'])  # El segundo día, la nunca intentada antes que la fallida.
        vistas.clear()
        leidas = {'1': {'modificado': 'm', 'leida': '2026-11-01'}, '3': {'modificado': 'm', 'leida': '2026-11-02'}}
        with patch.object(fca, 'ROTACION', 1):
            fca.completar_fichas(eventos, obtener, conocidas, leidas=leidas, ahora='2026-11-28')
        self.assertEqual(vistas, ['2', '1'])  # La nueva antes que la de rotación, aunque vaya detrás en el listado.

    def test_un_fallo_del_relay_corta_las_fichas(self):
        eventos, conocidas = self.citas(['1', '2'])
        vistas = []
        def obtener(url):
            vistas.append(url)
            raise recogida.ErrorRelay('El relay no trae respuesta de la fuente (HTTP 502)')
        informe = fca.completar_fichas(eventos, obtener, conocidas, leidas={}, ahora='2026-11-28')
        self.assertEqual((len(vistas), informe['conservadas']), (1, 1))

    def test_dos_pasadas_guardan_el_estado_y_la_segunda_solo_pide_lo_cambiado(self):
        def tribe(i, modificado):
            return {'id': i, 'title': f'Cursa {i}', 'url': f'https://fcatletisme.cat/event/c{i}/',
                    'start_date': f'2099-03-1{i} 00:00:00', 'end_date': f'2099-03-1{i} 23:59:59', 'all_day': True,
                    'modified_utc': modificado, 'venue': {'id': 1, 'venue': 'Pista', 'city': 'Lleida'},
                    'categories': [], 'organizer': [], 'status': 'publish'}
        api = {'eventos': [tribe(1, 'a'), tribe(2, 'a')]}
        vistas = []
        def descargar(url, binario=False):
            vistas.append(url)
            if url.startswith(fca.API):
                return json.dumps({'total': 2, 'total_pages': 1, 'events': api['eventos']})
            return ficha(url.rstrip('/')[-1])
        with tempfile.TemporaryDirectory() as carpeta, patch('agenda.recogida.descargar', descargar), \
                patch('agenda.atletismo_recogida.time.sleep'), patch.object(fca, 'ROTACION', 0):
            db = str(Path(carpeta) / 'agenda.db')
            args = ['--db', db, '--fuente', 'fca', '--inicio', '2099-03-01', '--fin', '2099-03-31']
            r.main(args)
            self.assertEqual(sum('/event/' in u for u in vistas), 2)
            vistas.clear()
            api['eventos'] = [tribe(1, 'a'), tribe(2, 'b')]
            r.main(args)
            self.assertEqual([u for u in vistas if '/event/' in u], ['https://fcatletisme.cat/event/c2/'])
            with almacen.abrir(db) as conexion:
                n = almacen.cargar(conexion)['nucleo']
                guardado = json.loads(conexion.execute('SELECT valor_json FROM agenda_estado WHERE clave=?',
                                                       ('atletismo-informe-fca',)).fetchone()[0])
        self.assertEqual({i: x['modificado'] for i, x in n['fuentes']['fca']['fichas'].items()}, {'1': 'a', '2': 'b'})
        self.assertNotIn('estado', guardado['fichas'])
        self.assertEqual(guardado['fichas']['conservadas'], 1)
        # La cita sin pedir conserva el reglamento de su ficha.
        documentos = {c['id']: c['metadatos']['documentos'] for c in coincidencias.actuales(n)}
        self.assertTrue(any(d['evidencia']['superficie'] == 'ficha' for d in documentos['1']))
        self.assertNotIn('fichas', publicacion.proyectar(n, fuentes=['fca'])['fuentes']['fca'])


class Relay(unittest.TestCase):
    URL = 'https://fcatletisme.cat/wp-json/tribe/events/v1/events?per_page=1&page=2'

    def test_con_clave_fca_va_por_el_relay_y_lo_demas_directo(self):
        with patch.dict('os.environ', {'RELAY_CLAVE': 'clave-sintetica'}), \
                patch('agenda.recogida.urlopen', side_effect=lambda req, timeout: io.BytesIO(b'{}')) as abrir:
            recogida.descargar(self.URL)
            recogida.descargar('https://atletismorfea.es/calendario')
        relay, directa = (c.args[0] for c in abrir.call_args_list)
        self.assertEqual(relay.full_url, recogida.RELAY + quote(self.URL, safe=''))
        self.assertEqual(relay.get_header('X-voceiro-relay'), 'clave-sintetica')
        self.assertTrue(relay.get_header('User-agent').startswith('Voceiro/'))
        self.assertEqual(directa.full_url, 'https://atletismorfea.es/calendario')
        self.assertIsNone(directa.get_header('X-voceiro-relay'))
        with patch.dict('os.environ', {}, clear=True), \
                patch('agenda.recogida.urlopen', return_value=io.BytesIO(b'{}')) as abrir:
            recogida.descargar(self.URL)
        self.assertEqual(abrir.call_args.args[0].full_url, self.URL)

    def test_un_rechazo_del_relay_no_pasa_por_bloqueo_de_la_fuente(self):
        fuente = Message()
        fuente['x-relay-status'] = '403'
        with patch.dict('os.environ', {'RELAY_CLAVE': 'clave-sintetica'}):
            with patch('agenda.recogida.urlopen', side_effect=HTTPError(self.URL, 403, 'x', fuente, None)):
                with self.assertRaises(HTTPError):
                    recogida.descargar(self.URL)
            with patch('agenda.recogida.urlopen', side_effect=HTTPError(self.URL, 403, 'x', Message(), None)):
                with self.assertRaisesRegex(recogida.ErrorRelay, 'relay'):
                    recogida.descargar(self.URL)
            with self.assertRaisesRegex(ValueError, 'cabeceras'):
                recogida.descargar(self.URL, {'Accept': 'x'})

    def test_el_relay_admite_los_hosts_que_le_mandamos(self):
        agenda = json.loads((Path(__file__).parents[2] / 'workers/deno-relay/src/agenda.json').read_text())
        self.assertLessEqual(set(recogida.POR_RELAY), set(agenda))


if __name__ == '__main__':
    unittest.main()
