"""FCA sin red: literales, documentos, coste e identidad de las citas."""
from copy import deepcopy
from datetime import date
import json
from pathlib import Path
import unittest
from urllib.error import HTTPError

from agenda import atletismo as a, atletismo_bloque, atletismo_fca as fca, atletismo_recogida as r
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
        self.assertEqual(informe['fichas'], {'leidas': 1, 'documentos': 1, 'fallidas': []})
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


if __name__ == '__main__':
    unittest.main()
