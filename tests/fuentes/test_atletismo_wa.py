"""Selección WA, validación de la lectura y conservación de ausencias."""
from datetime import date
import io
import json
from pathlib import Path
import tempfile
import unittest
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit
from unittest.mock import patch

from agenda import atletismo, atletismo_recogida as r, publicacion

MUESTRA = json.loads((Path(__file__).with_name('muestras_calendario') / 'atletismo' / 'wa-2027.json').read_text())
AHORA = '2026-11-03T20:00:00+01:00'


def html(grupo, inicio, fin, offset, eventos, total=None, **cambios):
    datos = {'hits': len(eventos) if total is None else total, 'parameters': {
        'competitionGroupId': grupo, 'startDate': inicio, 'endDate': fin, 'offset': offset},
        'results': eventos}
    datos.update(cambios)
    return '<script id="__NEXT_DATA__" type="application/json">' + json.dumps({
        'props': {'pageProps': {'initialEvents': datos}}}) + '</script>'


class WorldAthletics(unittest.TestCase):
    def setUp(self):
        self.seleccion, self.juegos = r.wa_configuracion()
        self.dia = date(2027, 1, 1)
        self.fin = date(2027, 12, 31)

    def obtener(self, url):
        q = parse_qs(urlsplit(url).query)
        grupo, offset = int(q['competitionGroupId'][0]), int(q['offset'][0])
        eventos = MUESTRA['eventos'].get(str(grupo), [])
        return html(grupo, q['startDate'][0], q['endDate'][0], offset, eventos[offset:offset + 100], len(eventos))

    def test_seleccion_y_muestra_real_dos_grupos_una_cita(self):
        entrada, informe = r.wa(self.dia, self.fin, self.obtener)
        self.assertTrue(informe['completo'])
        self.assertEqual(len([e for e in entrada['eventos'] if e['id'] == '7216591']), 1)
        self.assertEqual(next(e for e in entrada['eventos'] if e['id'] == '7216591')['grupos'], ['campeonatos'])
        self.assertEqual(next(e for e in entrada['eventos'] if e['id'] == '7231707')['metadatos']['competitionSubgroup'], 'Gold')
        self.assertEqual(next(e for e in entrada['eventos'] if e['id'] == '7244491')['lugar'], {'nombre': 'TBC (ESP)'})
        n = atletismo.importar(None, entrada, AHORA)
        vista = publicacion.proyectar(n, fuentes=['wa'])
        diamond = next(e for e in vista['eventos'] if e['nombres']['und'] == 'Weltklasse Zürich')
        self.assertIn('atletismo-wa-diamond', {codigo for objetivo in diamond['objetivos']
            for codigo in vista['entidades'][objetivo]['codigos']})
        self.assertNotIn('iaafId', diamond['atletismo']['valor'])
        self.assertNotIn('3771', {str(g) for g in self.seleccion})

    def test_paginas_total_filtros_y_repeticion(self):
        ev = MUESTRA['eventos']['627'][0]
        eventos = [{**ev, 'id': 8000000 + i} for i in range(101)]
        def obtener(url):
            q = parse_qs(urlsplit(url).query)
            offset = int(q['offset'][0])
            return html(627, q['startDate'][0], q['endDate'][0], offset, eventos[offset:offset+100], 101)
        recibidos, urls = r.wa_unidad(627, self.dia, self.fin, obtener)
        self.assertEqual((len(recibidos), len(urls)), (101, 2))
        for alteracion in ({'parameters': {'competitionGroupId': None, 'startDate': self.dia.isoformat(),
                                           'endDate': self.fin.isoformat(), 'offset': 0}},
                           {'hits': 102}):
            def mala(url):
                q = parse_qs(urlsplit(url).query)
                return html(627, q['startDate'][0], q['endDate'][0], int(q['offset'][0]),
                            eventos[int(q['offset'][0]):int(q['offset'][0])+100], 101, **alteracion)
            with self.assertRaises(ValueError):
                r.wa_unidad(627, self.dia, self.fin, mala)
        def repetida(url):
            q = parse_qs(urlsplit(url).query)
            offset = int(q['offset'][0])
            pagina = eventos[:100] if offset == 0 else [eventos[0]]
            return html(627, q['startDate'][0], q['endDate'][0], offset, pagina, 101)
        with self.assertRaisesRegex(ValueError, 'repetido'):
            r.wa_unidad(627, self.dia, self.fin, repetida)

    def test_dos_circuitos_y_fecha_indeterminada(self):
        e = MUESTRA['eventos']['627'][0]
        cita, pendiente = r.wa_evento(e, {627: self.seleccion[627], 3773: self.seleccion[3773]}, {})
        self.assertIsNone(pendiente)
        self.assertEqual(cita['grupos'], ['continental', 'diamond'])
        grupos = [{'id': c['id'], 'nombre': c['nombre'], 'clase': 'circuito',
                   'codigo_consulta': c['codigo_consulta'], 'url': atletismo.FUENTES['wa'][1]}
                  for c in (self.seleccion[627] + self.seleccion[3773])]
        n = atletismo.importar(None, {'version': 1, 'fuente': 'wa', 'eventos': [cita], 'agrupaciones': grupos}, AHORA)
        vista = publicacion.proyectar(n, fuentes=['wa'])
        cita = vista['eventos'][0]
        self.assertEqual({codigo for objetivo in cita['objetivos']
                          for codigo in vista['entidades'][objetivo]['codigos']},
                         {'atletismo-wa', 'atletismo-wa-continental', 'atletismo-wa-diamond'})
        self.assertIsNone(r.wa_evento({**e, 'undeterminedCompetitionPeriod': 'TBC'}, {627: self.seleccion[627]}, {})[0])
        self.assertIsNone(r.wa_evento({**e, 'startDate': None}, {627: self.seleccion[627]}, {})[0])

    def test_juegos_usan_el_dato_de_wa_salvo_revision(self):
        e = {**MUESTRA['eventos']['627'][0], 'id': 7173264, 'competitionGroup': 'Youth Olympic Games'}
        cita, pendiente = r.wa_evento(e, {5: self.seleccion[5]}, {})
        self.assertIsNone(pendiente)
        self.assertEqual((cita['inicio'], cita['fin']), (e['startDate'], e['endDate']))
        self.assertNotIn('fechas_juegos', cita['metadatos'])
        self.assertEqual(cita['metadatos']['alcance']['tipo'], 'juegos')
        juegos = {'7173264': {'inicio': '2027-08-01', 'fin': '2027-08-05',
                              'evidencia': 'programa oficial', 'url': 'https://worldathletics.org/competition/calendar-results'}}
        cita, pendiente = r.wa_evento(e, {5: self.seleccion[5]}, juegos)
        self.assertIsNone(pendiente)
        self.assertEqual((cita['inicio'], cita['fin']), ('2027-08-01', '2027-08-05'))
        self.assertEqual(cita['metadatos']['fechas_juegos']['evidencia'], 'programa oficial')

    def test_estados_literales_conservan_la_cita(self):
        base = MUESTRA['eventos']['627'][0]
        periodo = {'status': 'Postponed', 'label': 'Postponed', 'remark': 'Postponed until further notice'}
        cita, pendiente = r.wa_evento({**base, 'dateRange': '30 MAR 2025', 'undeterminedCompetitionPeriod': periodo},
                                      {627: self.seleccion[627]}, {})
        self.assertIsNone(pendiente)
        self.assertEqual(cita['estado'], 'aplazado')
        t = cita['metadatos']['temporalidad']
        self.assertEqual((t['estado'], t['estado_literal'], t['texto']), ('aplazado', 'Postponed', '30 MAR 2025'))
        self.assertEqual(t['evidencia']['literal'], 'Postponed until further notice')
        n = atletismo.importar(None, {'version': 1, 'fuente': 'wa', 'eventos': [cita],
                                      'agrupaciones': [r.wa_agrupacion(self.seleccion[627][0])]}, AHORA)
        self.assertIsNotNone(n)
        cancelada, _ = r.wa_evento({**base, 'undeterminedCompetitionPeriod': {
            'status': 'Cancelled', 'label': 'Cancelled', 'remark': None}}, {627: self.seleccion[627]}, {})
        self.assertEqual(cancelada['estado'], 'cancelado')
        self.assertEqual(cancelada['metadatos']['temporalidad']['evidencia']['literal'], 'Cancelled')
        desconocido, pendiente = r.wa_evento({**base, 'undeterminedCompetitionPeriod': {'status': 'Moved'}},
                                             {627: self.seleccion[627]}, {})
        self.assertIsNone(desconocido)
        self.assertIn('indeterminado', pendiente['motivo'])

    def test_campeonatos_son_coleccion_y_conservan_clase_guardada(self):
        coleccion = r.wa_agrupacion(self.seleccion[6][0])
        self.assertEqual(coleccion['clase'], 'coleccion')
        self.assertEqual(r.wa_agrupacion(self.seleccion[627][0])['clase'], 'circuito')

    def test_categoria_de_ranking_literal(self):
        e = {**MUESTRA['eventos']['627'][0], 'rankingCategory': 'GL'}
        cita, _ = r.wa_evento(e, {627: self.seleccion[627]}, {})
        c = cita['metadatos']['calendarios']
        self.assertEqual([(x['calendario'], x['categoria_literal']) for x in c], [('wa', 'GL')])

    def test_resultados_solo_si_la_pagina_acredita_la_cita(self):
        def pagina(i, competicion={'name': 'Cross'}):
            return '<script id="__NEXT_DATA__" type="application/json">' + json.dumps({'props': {'pageProps': {
                'query': {'competitionId': str(i)}, 'calendarEventsResults': {'competition': competicion}}}}) + '</script>'
        eventos = [{'id': str(i), 'nombre': 'Cita', 'metadatos': {'hasResults': i != 6}} for i in range(1, 7)]
        vistas = []
        def obtener(url):
            vistas.append(url)
            i = int(url.rsplit('/', 1)[1])
            if i == 2:
                raise HTTPError(url, 500, 'error', {}, io.BytesIO())
            if i == 3:
                raise TimeoutError('corte')
            return {4: pagina(99), 5: pagina(5, None)}.get(i, pagina(i))
        informe = r.wa_resultados(eventos, obtener)
        self.assertEqual(len(vistas), 5)
        self.assertEqual(informe['verificados'], 1)
        self.assertEqual([d['id'] for d in informe['descartados']], ['2', '3', '4', '5'])
        d = eventos[0]['metadatos']['documentos'][0]
        self.assertEqual((d['rol'], d['url']), ('resultados', r.WA_RESULTADOS + '1'))
        self.assertNotIn('documentos', eventos[1]['metadatos'])

    def test_resultados_no_tragan_bloqueo_ni_presupuesto(self):
        eventos = [{'id': '1', 'nombre': 'Cita', 'metadatos': {'hasResults': True}}]
        def bloqueada(url):
            raise HTTPError(url, 429, 'limite', {}, io.BytesIO())
        with self.assertRaises(HTTPError):
            r.wa_resultados(eventos, bloqueada)
        def agotada(url):
            raise ValueError('Atletismo agotó su presupuesto; no se importa una recogida parcial')
        with self.assertRaisesRegex(ValueError, 'presupuesto'):
            r.wa_resultados(eventos, agotada)

    def test_pendiente_de_ventana_deja_informe_incompleto(self):
        e = {**MUESTRA['eventos']['627'][0], 'undeterminedCompetitionPeriod': 'TBC'}
        def obtener(url):
            q = parse_qs(urlsplit(url).query)
            return html(627, q['startDate'][0], q['endDate'][0], 0, [e])
        with patch.object(r, 'wa_configuracion', return_value=({627: self.seleccion[627]}, {})):
            entrada, informe = r.wa(self.dia, self.fin, obtener)
        self.assertEqual(entrada['eventos'], [])
        self.assertFalse(informe['completo'])
        self.assertEqual(informe['pendientes'][0]['id'], str(e['id']))

    def test_ausencias_reimportada_y_no_encontrada(self):
        e = MUESTRA['eventos']['627'][0]
        conocidas = [{'fuente': 'wa', 'id': str(e['id']), 'inicio': e['startDate'], 'fin': e['endDate'],
                      'url': atletismo.FUENTES['wa'][1], 'metadatos': {'grupos_wa': [627]}}]
        entrada = {'version': 1, 'fuente': 'wa', 'eventos': [], 'agrupaciones': []}
        informe = {'pendientes': [], 'completo': True, 'consultas': []}
        def obtener(url):
            q = parse_qs(urlsplit(url).query)
            return html(627, q['startDate'][0], q['endDate'][0], 0,
                        [{**e, 'startDate': '2028-01-10', 'endDate': '2028-01-11'}])
        resultado = r.reconsultar('wa', conocidas, entrada, informe, self.dia, self.fin, obtener, AHORA)
        self.assertEqual(resultado['reimportadas'], [str(e['id'])])
        self.assertEqual(entrada['eventos'][0]['inicio'], '2028-01-10')
        original, _ = r.wa_evento(e, {627: self.seleccion[627]}, {})
        n = atletismo.importar(None, {'version': 1, 'fuente': 'wa', 'eventos': [original],
            'agrupaciones': entrada['agrupaciones']}, AHORA)
        n = atletismo.importar(n, entrada, '2026-11-04T20:00:00+01:00')
        self.assertEqual(publicacion.proyectar(n, fuentes=['wa'])['eventos'][0]
                         ['programacion']['valor']['cuando']['inicio']['fecha'], '2028-01-10')
        entrada = {'version': 1, 'fuente': 'wa', 'eventos': [], 'agrupaciones': []}
        def vacia(url):
            q = parse_qs(urlsplit(url).query)
            return html(627, q['startDate'][0], q['endDate'][0], 0, [])
        resultado = r.reconsultar('wa', conocidas, entrada, {'pendientes': [], 'completo': True, 'consultas': []},
                                  self.dia, self.fin, vacia, AHORA)
        self.assertEqual([x['id'] for x in resultado['ausencias']], [str(e['id'])])
        n = atletismo.registrar_ausencias(n, 'wa', resultado['ausencias'])
        self.assertEqual(publicacion.proyectar(n, fuentes=['wa'])['eventos'], [])

    def test_429_no_guarda_parcial_y_anota_retry_after(self):
        def fallo(url):
            raise HTTPError(url, 429, 'Too Many Requests', {'Retry-After': '120'}, io.BytesIO(b''))
        with tempfile.TemporaryDirectory() as tmp:
            informe = Path(tmp) / 'informe.json'
            db = Path(tmp) / 'agenda.db'
            with patch.object(r.recogida, 'descargar', side_effect=fallo):
                with self.assertRaises(HTTPError):
                    r.main(['--db', str(db), '--fuente', 'wa', '--inicio', '2027-01-01',
                            '--fin', '2027-01-31', '--informe', str(informe)])
            self.assertEqual(json.loads(informe.read_text())['retry_after'], '120')
            from agenda import almacen
            with almacen.abrir(db) as conexion:
                self.assertIsNone(almacen.cargar(conexion))

    def test_guardia_de_lectura_rota_wa(self):
        conocidas = [{'fuente': 'wa', 'id': str(i), 'inicio': '2027-01-10', 'fin': '2027-01-10',
                      'metadatos': {'grupos_wa': [627]}} for i in range(6)]
        llamadas = []
        def vacia(url):
            llamadas.append(url)
            q = parse_qs(urlsplit(url).query)
            return html(627, q['startDate'][0], q['endDate'][0], 0, [])
        with patch.object(r, 'wa_configuracion', return_value=({627: self.seleccion[627]}, {})):
            with self.assertRaisesRegex(ValueError, 'no trae 6 de 6'):
                r.recoger('wa', '2027-01-01', '2027-01-31', descargar=vacia, conocidas=conocidas)
        self.assertEqual(len(llamadas), 1)


if __name__ == '__main__':
    unittest.main()
