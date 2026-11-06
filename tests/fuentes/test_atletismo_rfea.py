"""RFEA sin red: etiquetas imperfectas, documentos y degradación conservadora."""
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from bs4 import BeautifulSoup
from agenda import atletismo as a, atletismo_bloque as b, atletismo_modalidades as am, atletismo_recogida as r, atletismo_rfea as f

M = Path(__file__).with_name('muestras_calendario') / 'atletismo'
URL = 'https://atletismorfea.es/calendario/campeonato/ensayo'
DOCS = 'https://atletismorfea.es/ajax/championship-documents/a0bQs00000DqlHCIAZ'
AHORA = '2026-11-04T12:00:00+01:00'


def muestra(nombre):
    return (M / 'rfea' / nombre).read_text()


def mensual(mes, *, url=None, nombre='Cita', disciplina='Marcha'):
    anterior = (mes - timedelta(days=1)).replace(day=1)
    siguiente = (mes.replace(day=28) + timedelta(days=4)).replace(day=1)
    marcas = [str(int(datetime(d.year, d.month, 1, tzinfo=timezone.utc).timestamp())) for d in (anterior, siguiente)]
    html = '<div class="calendar_pager">' + ''.join(f'<a attr-date="{m}"></a>' for m in marcas) + '</div>'
    if url:
        html += f'<div class="calendar-day"><span class="monthday">15</span><div class="calendar-item"><a href="{url}"><b class="event__title">{nombre}</b><span class="event__location">Castro</span><span class="event__discipline">{disciplina}</span></a></div></div>'
    return json.dumps([{'command': 'insert', 'selector': '#calendar_container', 'data': html}])


class LectorRFEA(unittest.TestCase):
    def test_ficha_nativa_completa_y_documentos_independientes(self):
        ficha = f.leer_ficha(muestra('ficha-castro.html'), url=URL)
        meta = ficha['metadatos']
        self.assertEqual(ficha['id'], '64834')
        self.assertEqual(meta['sfid'], ['a0bQs00000DqlHCIAZ'])
        self.assertEqual(meta['area_literal'], 'RFEA')
        self.assertEqual(meta['categoria_literal'], '')
        self.assertEqual(meta['alcance'], {'tipo': 'desconocido'})
        self.assertEqual(meta['actividad'], {'valor': 'desconocida'})
        docs = f.leer_documentos(muestra('documentos-castro.json'), url=DOCS)
        self.assertEqual([d['rol'] for d in docs], ['normas', 'normas'])
        self.assertIn('/rfea_norma/21/descarga', docs[0]['url'])
        self.assertIn('/rfea_norma/22/descarga', docs[1]['url'])
        self.assertNotIn('pertenencias', meta)
        self.assertEqual(meta['titulos'][0]['autoridad'], 'federacion_espanola')
        meta['documentos'] += docs
        b.validar(meta, '2026-12-13', '2026-12-13', fuente='rfea')

    def test_aplazado_en_titulo_no_acredita_estado(self):
        ficha = f.leer_ficha(muestra('ficha-aplazado.html'), url=URL)
        self.assertIn('aplazado', ficha['nombre'].lower())
        self.assertEqual(ficha['metadatos']['temporalidad']['estado'], 'desconocido')
        s = BeautifulSoup(muestra('ficha-aplazado.html'), 'html.parser')
        s.select_one('.container-championship').append(BeautifulSoup('<div class="c_e_estado">Suspendido</div>', 'html.parser'))
        t = f.leer_ficha(str(s), url=URL)['metadatos']['temporalidad']
        self.assertEqual((t['estado'], t['estado_literal']), ('suspendido', 'Suspendido'))
        self.assertIn('.c_e_estado', t['evidencia']['localizador'])

    def test_informacion_enlaces_inscripcion_y_roles(self):
        s = BeautifulSoup(muestra('ficha-castro.html'), 'html.parser')
        s.select_one('#c_e_accordion_information').append(BeautifulSoup('''<p>Información literal</p>
          <a href="/horario.pdf">Horario</a><a href="/resultados.pdf">Resultados</a>
          <a href="/acta.pdf">Acta</a><a href="/circular.pdf">Circular</a>
          <a href="/reglamento.pdf">Reglamento</a><a href="/otro.pdf">Plano</a>
          <a href="/informacion.pdf">Información técnica</a>
          <a href="https://atletismorfea.es/user/login-registro">Inscripción</a>''', 'html.parser'))
        meta = f.leer_ficha(str(s), url=URL)['metadatos']
        self.assertIn('Información literal', meta['informacion']['literal'])
        self.assertEqual({d['rol'] for d in meta['documentos']}, {'normas', 'horario', 'resultados', 'acta', 'circular', 'reglamento', 'otro', 'informacion_tecnica'})
        self.assertEqual(len(meta['inscripcion']['enlaces']), 1)
        self.assertNotIn('periodo', meta['inscripcion'])
        self.assertNotIn('abierta', meta['inscripcion'])
        b.validar(meta, '2026-12-13', '2026-12-13', fuente='rfea')

    def test_documentos_sin_resultados_y_esquema_roto(self):
        self.assertEqual(f.leer_documentos(muestra('documentos-vacios.json'), url=DOCS), [])
        for d in ('{}', '[]', '[{"command":"insert","selector":".competition-doc","data":"<table></table>"}]'):
            with self.assertRaises(ValueError):
                f.leer_documentos(d, url=DOCS)
        # Sin SFID la cita vale: solo se queda sin leer sus documentos.
        sin_sfid = f.leer_ficha(muestra('ficha-castro.html').replace('data-sfid=', 'otro='), url=URL)['metadatos']
        self.assertEqual(sin_sfid['sfid'], [])
        self.assertNotIn('sfid', sin_sfid['evidencias_ficha'])

    def test_rol_por_palabra_completa(self):
        self.assertEqual(f.rol('Acta de la reunión', 'https://x.es/a'), 'acta')
        self.assertEqual(f.rol('Contacta con la organización', 'https://x.es/a'), 'otro')

    def test_filtros_validan_mes_y_no_convierten_ausencia_en_clasificacion(self):
        mes = date(2026, 12, 1)
        self.assertEqual(f.urls_mes(mensual(mes), mes), [])
        self.assertEqual(f.urls_mes(mensual(mes, url=URL), mes), [URL])
        with self.assertRaises(ValueError):
            f.urls_mes(mensual(mes), date(2026, 11, 1))

    def test_relacion_por_categoria_documental(self):
        for literal, relacion, de in [('RFEA', 'propio', None), ('Nacional', 'propio', None),
                ('Autonómico', 'reflejo', None), ('EA', 'reflejo', 'ea'), ('WACCT Gold', 'reflejo', 'wa'),
                ('CIO', 'reflejo', 'cio'), ('Internacional 1', 'propio', None), ('Internacional 2', 'propio', None)]:
            meta = {'area_literal': 'RFEA', 'fuente': {'relacion': 'desconocido'}, 'calendarios': [
                {'calendario': 'rfea', 'categoria_literal': literal, 'evidencia': f.evidencia(URL, 'fila 1', literal, 'documento')}]}
            f.relacion({'url': URL, 'metadatos': meta})
            self.assertEqual(meta['fuente']['relacion'], relacion)
            self.assertEqual(meta['fuente'].get('de'), de)
            self.assertEqual(meta['fuente']['evidencia']['localizador'], 'fila 1')

    def test_relacion_sin_categoria_estar_en_su_calendario_basta_si_nadie_mas_la_reclama(self):
        def relacion(**campos):
            meta = {'fuente': {'relacion': 'desconocido'}, **campos}
            f.relacion({'url': URL, 'metadatos': meta})
            return meta['fuente']
        en_calendario = relacion(area_literal='RFEA', calendario_tipo='Deportivo')
        self.assertEqual(en_calendario['relacion'], 'propio')
        self.assertEqual(en_calendario['evidencia']['literal'], 'Deportivo')
        self.assertEqual(relacion(area_literal='', calendario_tipo='Federativo')['evidencia']['literal'], 'Federativo')
        # Área RFEA se mezcla en el PDF con categorías ajenas: por sí sola no decide nada.
        self.assertEqual(relacion(area_literal='RFEA')['relacion'], 'desconocido')
        for area in ('WA', 'EA'):
            ajena = relacion(area_literal=area, calendario_tipo='Deportivo', evidencias_ficha={'area_literal': f.evidencia(URL, '.c_e_area', area)})
            self.assertEqual((ajena['relacion'], ajena['de']), ('reflejo', area.lower()))
        # Un título reservado en el calendario de la RFEA es suyo, también con Área ajena.
        titulo = {'literal': 'Campeonato de España', 'autoridad': 'federacion_espanola', 'base': 'nombre_reservado',
                  'evidencia': f.evidencia(URL, '.c_e_title', 'Campeonato de España')}
        reservado = relacion(area_literal='WA', calendario_tipo='Deportivo', titulos=[titulo],
                             evidencias_ficha={'area_literal': f.evidencia(URL, '.c_e_area', 'WA')})
        self.assertEqual((reservado['relacion'], reservado['evidencia']['localizador']), ('propio', '.c_e_title'))


class RecogidaRFEA(unittest.TestCase):
    def setUp(self):
        # Esta clase prueba el inventario/AJAX sin contenido documental. Las
        # lecturas revisadas y sus bytes se ejercitan con capturas propias.
        lectura = patch.object(r.atletismo_documentos, 'lecturas_documentales', return_value={})
        lectura.start()
        self.addCleanup(lectura.stop)

    def descarga(self, *, tecnica=None, acreditada=False, fallo=None, categoria=True, fallo_federativo=None):
        llamadas = []
        def descargar(url, *, binario=False):
            llamadas.append(url)
            if url == f.BASE:
                return muestra('formulario.html')
            if url == URL:
                html = muestra('ficha-castro.html')
                if acreditada:
                    html = html.replace('<div class="c_data">', '<a href="/circular.pdf">Circular de convocatoria Concentración PNTD</a><div class="c_data">')
                return html
            if '/championship-documents/' in url:
                if fallo:
                    raise fallo
                return muestra('documentos-castro.json')
            if '/ajax/calendario/' in url:
                if fallo_federativo and 'internas' in url:
                    raise fallo_federativo
                campos = url.split('/ajax/calendario/')[1].split('/')
                mes = datetime.fromtimestamp(int(campos[0]), timezone.utc).date()
                publicada = mes.month == 12 and ((tecnica and campos[1] != 'Deportivo' and campos[5] in ('0', tecnica)) or
                    (not tecnica and campos[1] == 'Deportivo' and (campos[5] == '0' or categoria and campos[5] == '211')))
                return mensual(mes, url=URL if publicada else None)
            if '/communication-hub/' in url:
                raise FileNotFoundError('índice no capturado')
            raise AssertionError(url)
        return descargar, llamadas

    def test_rotacion_acotada_conserva_datos_y_etiquetas_sin_deducir_master(self):
        descargar, llamadas = self.descarga()
        primera, informe = r.recoger('rfea', '2026-12-01', '2026-12-31', descargar=descargar)
        e = primera['eventos'][0]
        self.assertEqual([x['id'] for x in e['metadatos']['filtros_calendario']], ['211'])
        self.assertEqual(e['metadatos']['categoria_literal'], '')
        self.assertEqual((e['id'], e['inicio'], e['fin'], e['lugar']['nombre']), ('64834', '2026-12-15', '2026-12-15', 'Castro'))
        self.assertLess(informe['peticiones'], 200)
        self.assertFalse(any('/0/0/76/' in u or '/0/0/0/384/' in u for u in llamadas))
        n = a.importar(None, primera, AHORA)
        descargar, _ = self.descarga(categoria=False, fallo=OSError('caído'))
        conocidas = [{'fuente': 'rfea', **e}]
        segunda, otro = r.recoger('rfea', '2026-12-01', '2026-12-31', descargar=descargar, conocidas=conocidas)
        self.assertEqual(segunda, primera)
        self.assertEqual(set(a.importar(n, segunda, '2026-11-05T12:00:00+01:00')['observaciones']), set(n['observaciones']))
        self.assertTrue(otro['avisos'])

    def test_una_concentracion_se_publica_y_solo_su_convocatoria_la_acredita(self):
        for acreditada in (False, True):
            descargar, llamadas = self.descarga(tecnica='387', acreditada=acreditada)
            entrada, informe = r.recoger('rfea', '2026-12-01', '2026-12-31', descargar=descargar)
            self.assertEqual(len(entrada['eventos']), 1)
            meta = entrada['eventos'][0]['metadatos']
            self.assertEqual(meta['actividad']['valor'], 'tecnificacion' if acreditada else 'desconocida')
            self.assertEqual([x['id'] for x in meta['filtros_calendario']], ['387'])
            self.assertEqual(meta['calendario_tipo'], 'Federativo')
            self.assertEqual(any('sin convocatoria' in a['motivo'] for a in informe['avisos']), not acreditada)
            self.assertEqual(informe['pendientes'], [])
            self.assertIs(informe['aplicar_ausencias'], True)
            self.assertTrue(any('/Eventos%20internas%20RFEA/0/0/0/0/' in u for u in llamadas))
            self.assertFalse(any(u.endswith('.pdf') for u in llamadas))

    def federativo_real(self):
        """Noviembre de 2026 tal como lo publica RFEA, con sus dos actos del CNJ."""
        respuesta = muestra('federativo-2026-11.json')
        fichas = {'webinar-cnj': 'ficha-federativo-webinar.html', 'examen-acceso': 'ficha-federativo-examen.html'}
        enlaces = [x['href'] for c in json.loads(respuesta) if c.get('selector') == '#calendar_container'
                   for x in BeautifulSoup(c['data'], 'html.parser').select('.calendar-item > a[href]')]
        categorias = {'382': next(u for u in enlaces if 'webinar' in u), '381': next(u for u in enlaces if 'examen' in u)}
        llamadas = []

        def descargar(url, *, binario=False):
            llamadas.append(url)
            if url == f.BASE:
                return muestra('formulario.html')
            if '/calendario/campeonato/' in url:
                return muestra(next(v for k, v in fichas.items() if k in url))
            if '/championship-documents/' in url:
                return muestra('documentos-vacios.json')
            if '/ajax/calendario/' in url:
                campos = url.split('/ajax/calendario/')[1].split('/')
                mes = datetime.fromtimestamp(int(campos[0]), timezone.utc).date()
                if campos[1] == 'Deportivo' or mes.month != 11:
                    return mensual(mes)
                if campos[5] == '0':
                    return respuesta
                return mensual(mes, url=categorias.get(campos[5]))
            if '/communication-hub/' in url:
                raise FileNotFoundError('índice no capturado')
            raise AssertionError(url)
        return descargar, llamadas

    def test_federativo_entero_publica_jueces_y_cada_acto_declara_su_categoria(self):
        descargar, llamadas = self.federativo_real()
        entrada, informe = r.recoger('rfea', '2026-11-01', '2026-11-30', descargar=descargar)
        citas = {e['id']: e for e in entrada['eventos']}
        self.assertEqual(set(citas), {'69573', '69066'})
        webinar, examen = citas['69573']['metadatos'], citas['69066']['metadatos']
        self.assertEqual((webinar['actividad']['valor'], webinar['filtros_calendario'][0]['etiqueta']), ('formacion', 'Formación'))
        self.assertEqual((examen['actividad']['valor'], examen['filtros_calendario'][0]['etiqueta']), ('formacion', 'Exámenes'))
        self.assertEqual(webinar['fuente']['relacion'], 'propio')
        self.assertEqual(webinar['fuente']['evidencia']['literal'], 'Federativo')
        self.assertEqual(am.de(webinar), (set(), []))  # CNJ es un literal conocido sin modalidad.
        for e in citas.values():
            b.validar(e['metadatos'], e['inicio'], e['fin'], fuente='rfea')
        self.assertFalse(any('jueces' in a['motivo'] for a in informe['avisos']))
        # La categoría ya guardada no vuelve a costar sus trece filtros.
        filtros = [u for u in llamadas if 'internas' in u and '/0/0/0/0/' not in u]
        self.assertTrue(filtros)
        llamadas.clear()
        conocidas = [{'fuente': 'rfea', **e} for e in entrada['eventos']]
        segunda, _ = r.recoger('rfea', '2026-11-01', '2026-11-30', descargar=descargar, conocidas=conocidas)
        self.assertFalse([u for u in llamadas if 'internas' in u and '/0/0/0/0/' not in u])
        self.assertEqual(segunda, entrada)

    def test_sin_leer_federativo_sus_citas_se_conservan_y_leido_ya_no(self):
        descargar, _ = self.descarga(tecnica='387')
        primera, _ = r.recoger('rfea', '2026-12-01', '2026-12-31', descargar=descargar)
        conocidas = [{'fuente': 'rfea', **e} for e in primera['eventos']]
        caido, _ = self.descarga(tecnica='387', fallo_federativo=OSError('caído'))
        conservada, informe = r.recoger('rfea', '2026-12-01', '2026-12-31', descargar=caido, conocidas=conocidas)
        self.assertEqual([e['id'] for e in conservada['eventos']], ['64834'])
        self.assertFalse(informe['completo'])
        self.assertTrue(any('se conserva la cita anterior' in a['motivo'] for a in informe['avisos']))
        # Leído bien y sin la cita, no se conserva: la ausencia sigue su camino normal.
        vacio, _ = self.descarga()
        def sin_nada(url, **k):
            if '/ajax/calendario/' in url:
                mes = datetime.fromtimestamp(int(url.split('/ajax/calendario/')[1].split('/')[0]), timezone.utc).date()
                return mensual(mes)
            return vacio(url, **k)
        retirada, _ = r.recoger('rfea', '2026-12-01', '2026-12-31', descargar=sin_nada, conocidas=conocidas)
        self.assertEqual(retirada['eventos'], [])

    def test_proteccion_corta_lo_opcional_y_conserva_el_inventario(self):
        for error in (HTTPError(DOCS, 403, 'protegido', {}, None), HTTPError(DOCS, 429, 'límite', {}, None)):
            descargar, llamadas = self.descarga(fallo=error)
            entrada, informe = r.recoger('rfea', '2026-12-01', '2026-12-31', descargar=descargar)
            # Nada se pide tras el bloqueo: ni filtros, ni índice, ni PDF, ni reconsultas.
            self.assertEqual(llamadas[-1], DOCS)
            self.assertEqual(len(entrada['eventos']), 1)
            self.assertFalse(informe['completo'])
            self.assertIs(informe['aplicar_ausencias'], False)
            self.assertNotIn('calendario_pdf', informe)

    def test_esquema_documental_roto_interrumpe(self):
        descargar, llamadas = self.descarga()
        def roto(url, **kwargs):
            return '[]' if '/championship-documents/' in url else descargar(url, **kwargs)
        with self.assertRaises(ValueError):
            r.recoger('rfea', '2026-12-01', '2026-12-31', descargar=roto)


if __name__ == '__main__':
    unittest.main()
