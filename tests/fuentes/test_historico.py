"""Fechas e histórico: lo que puede romperse sin que ninguna fuente falle."""
import contextlib
import io
import json
import tempfile
import unittest
from datetime import datetime, time, timedelta
from pathlib import Path
from unittest.mock import patch

import recolector as R

MADRID = R.TZ_MADRID


def instante(iso):
    return datetime.fromisoformat(iso).timestamp()


class Fechas(unittest.TestCase):
    def test_fechas_de_feed_en_varios_formatos_quedan_en_hora_de_madrid(self):
        casos = (
            ('Tue, 20 Oct 2026 10:00:00 GMT', '2026-10-20T12:00:00+02:00'),
            ('2026-01-20T10:00:00Z', '2026-01-20T11:00:00+01:00'),
            ('terça, 13 out. 2026 12:27:51 +0100', '2026-10-13T13:27:51+02:00'),
            ('13 de octubre de 2026 12:27', '2026-10-13T12:27:00+02:00'),
            ('20/10/2026 9:05', '2026-10-20T09:05:00+02:00'),
            ('ayer', ''),
        )
        for raw, esperado in casos:
            with self.subTest(raw=raw):
                self.assertEqual(R._rss_date_to_iso(raw), esperado)

    def test_fechas_relativas_en_varios_idiomas(self):
        casos = (
            ('hace 3 horas', timedelta(hours=3)),
            ('2 hours ago', timedelta(hours=2)),
            ('fa 10 minuts', timedelta(minutes=10)),
            ('hace 2 semanas', timedelta(weeks=2)),
            ('publicado ayer', None),
        )
        for txt, esperado in casos:
            with self.subTest(txt=txt):
                self.assertEqual(R._delta_relativo(txt), esperado)

    def test_dia_de_url_solo_acepta_el_ultimo_anio_y_no_futuro(self):
        hoy = datetime.now(MADRID).date()
        ayer = hoy - timedelta(days=1)
        casos = (
            (f'https://ejemplo.test/{ayer:%Y/%m/%d}/noticia', ayer.isoformat()),
            (f'https://ejemplo.test/noticia-{ayer:%Y%m%d}.html', ayer.isoformat()),
            (f'https://ejemplo.test/{hoy + timedelta(days=1):%Y/%m/%d}/noticia', ''),
            (f'https://ejemplo.test/{hoy - timedelta(days=400):%Y/%m/%d}/noticia', ''),
        )
        for url, esperado in casos:
            with self.subTest(url=url):
                self.assertEqual(R._dia_de_url(url), esperado)

    def test_fecha_pub_futura_no_decide_el_dia(self):
        ahora = datetime(2026, 10, 20, 12, 0, tzinfo=MADRID)
        estimada = '2026-10-20T11:00:00+02:00'
        programada = {'fecha_pub': '2026-10-20T15:00:00+02:00', 'fecha_estimada': estimada}
        futura = {'fecha_pub': '2026-10-21T12:00:00+02:00', 'fecha_estimada': estimada}
        self.assertEqual(R._fecha_visible_iso(programada, ahora), '2026-10-20T15:00:00+02:00')
        self.assertEqual(R._fecha_visible_iso(futura, ahora), estimada)

    def test_estimadas_reparten_el_intervalo_por_posicion_y_respetan_dia_de_url(self):
        t_now = datetime(2026, 10, 20, 12, 0, tzinfo=MADRID)
        base = {'medio': 'Ejemplo', 'dominio': 'ejemplo.test', 'fuente': 'Scraping', 'fecha_pub': ''}
        a = {**base, 'titular': 'A', '_pos': 1}
        b = {**base, 'titular': 'B', '_pos': 0}
        c = {**base, 'titular': 'C', '_pos': 2, '_dia_url': '2026-10-19'}
        ignoradas = [{**base, 'titular': 'RSS', 'fuente': 'RSS'},
                     {**base, 'titular': 'Con fecha', 'fecha_pub': '2026-10-20T09:00:00+02:00'},
                     {**base, 'titular': 'Ya vista'}]
        total, intervalos = R.asignar_fechas_estimadas(
            [a, b, c, *ignoradas], {('ejemplo.test', 'Ya vista')}, None, t_now,
            {'ejemplo.test': '2026-10-20T11:00:00+02:00'})
        self.assertEqual((total, intervalos), (3, {'Ejemplo': 3600}))
        self.assertEqual(b['fecha_estimada'], '2026-10-20T11:45:00+02:00')
        self.assertEqual(a['fecha_estimada'], '2026-10-20T11:30:00+02:00')
        self.assertEqual(c['fecha_estimada'], '2026-10-19T12:00:00+02:00')
        for n in ignoradas:
            self.assertNotIn('fecha_estimada', n)

    def test_hora_corta_se_reconstruye_con_el_horario_de_ese_dia(self):
        self.assertEqual(R._reconstruir_fecha('09:30', '2026-01-20'), '2026-01-20T09:30:00+01:00')
        self.assertEqual(R._reconstruir_fecha('09:30', '2026-07-20'), '2026-07-20T09:30:00+02:00')


class Historico(unittest.TestCase):
    def test_fusion_conserva_datos_viejos_y_descarta_caducadas_y_plantillas(self):
        ahora = datetime.now(MADRID).replace(microsecond=0)
        hace = lambda **kw: (ahora - timedelta(**kw)).isoformat()
        base = {'dominio': 'ejemplo.test', 'fecha_estimada': ''}
        viejas = [
            {**base, 'titular': 'Repetida', 'fecha': hace(hours=2), 'fecha_pub': hace(hours=3)},
            {**base, 'titular': 'Solo vieja', 'fecha': hace(hours=5), 'fecha_pub': hace(hours=5)},
            {**base, 'titular': 'Caducada', 'fecha': hace(days=20), 'fecha_pub': hace(days=20)},
            {**base, 'titular': 'El tiempo en Lugo: previsión meteorológica para hoy',
             'fecha': hace(hours=1), 'fecha_pub': ''},
        ]
        nuevas = [
            {**base, 'titular': 'Repetida', 'fecha': hace(minutes=1), 'fecha_pub': '',
             '_pos': 0, '_dia_url': ''},
            {**base, 'titular': 'Nueva', 'fecha': hace(hours=1), 'fecha_pub': ''},
            {**base, 'titular': 'Sin fecha', 'fecha': '', 'fecha_pub': ''},
        ]
        todas = R.fusionar_historico(nuevas, viejas, dias=15)
        self.assertEqual([n['titular'] for n in todas], ['Nueva', 'Repetida', 'Solo vieja'])
        repetida = todas[1]
        self.assertEqual((repetida['fecha'], repetida['fecha_pub']), (hace(hours=2), hace(hours=3)))
        self.assertFalse(repetida['_nueva'])
        self.assertTrue(todas[0]['_nueva'])
        self.assertNotIn('_pos', repetida)

    def test_dedup_agrupa_variantes_y_prefiere_la_que_tiene_fecha_pub(self):
        titular = 'El Gobierno aprueba los presupuestos'
        a = {'dominio': 'a.test', 'titular': titular, 'fecha': '2026-10-20T12:00:00+02:00',
             'enlace': 'https://www.a.test/x?utm_source=rss&id=3'}
        b = {'dominio': 'b.test', 'titular': titular.lower() + '.', 'fecha': '2026-10-20T11:00:00+02:00',
             'fecha_pub': '2026-10-20T10:00:00+02:00', 'enlace': 'https://b.test/y'}
        c = {'dominio': 'c.test', 'titular': 'Él' + titular[2:], 'fecha': '2026-10-20T11:00:00+02:00',
             'fecha_estimada': '2026-10-20T10:30:00+02:00', 'enlace': 'https://c.test/z'}
        vacias = [{'dominio': 'a.test', 'titular': '', 'fecha': ''} for _ in range(2)]
        salida = R.deduplicar_editorial([a, b, c, *vacias])
        self.assertEqual(len(salida), 3)
        self.assertIs(salida[0], b)
        self.assertEqual(b['alt'], [{'d': 'c.test', 'u': '/z'}, {'d': 'a.test', 'u': '/x?id=3'}])

    def test_formato_corto_se_relee_sin_perder_instantes_enlaces_ni_alternativas(self):
        hoy = datetime.now(MADRID).date()
        dia = hoy.isoformat()
        pub = datetime.combine(hoy, time(0, 30), tzinfo=MADRID)
        pub_ayer = datetime.combine(hoy - timedelta(days=1), time(23, 15, 40), tzinfo=MADRID)
        est = datetime.combine(hoy, time(8, 5), tzinfo=MADRID)
        noticias = [
            {'dominio': 'ejemplo.test', 'titular': 'Con alternativa', 'fuente': 'RSS',
             'enlace': 'https://www.ejemplo.test/a?utm_source=x', 'fecha_pub': pub.isoformat(),
             'alt': [{'d': 'otro.test', 'u': '/b'}]},
            {'dominio': 'ejemplo.test', 'titular': 'De ayer', 'fuente': 'RSS',
             'enlace': 'https://externo.test/c', 'fecha_pub': pub_ayer.isoformat()},
            {'dominio': 'ejemplo.test', 'titular': 'Estimada', 'fuente': 'Scraping',
             'enlace': 'https://ejemplo.test/d', 'fecha_estimada': est.isoformat()},
        ]
        generado = datetime.now(MADRID).isoformat(timespec='seconds')
        fichero = {'fecha': dia, 'generado': generado,
                   'medios': {'ejemplo.test': {'n': 'Ejemplo', 'g': 'Pruebas'},
                              'otro.test': {'n': 'Otro', 'h': 'www.otro.test'}},
                   'noticias': [R._noticia_a_formato_corto(n, dia) for n in noticias]}
        with tempfile.TemporaryDirectory() as carpeta:
            Path(carpeta, 'dia.json').write_text(json.dumps(fichero), encoding='utf-8')
            Path(carpeta, 'manifest.json').write_text(json.dumps(
                {'dias': [{'fecha': dia, 'all': {'file': 'dia.json'}}]}), encoding='utf-8')
            with patch.multiple(R, DATOS_DIR=carpeta, MANIFEST_PATH=str(Path(carpeta, 'manifest.json')),
                                STATE_PATH=str(Path(carpeta, 'state.json'))), \
                    contextlib.redirect_stdout(io.StringIO()):
                leidas = R.cargar_historico_payload()['noticias']
        self.assertEqual([(n['dominio'], n['titular'], n['enlace']) for n in leidas], [
            ('ejemplo.test', 'Con alternativa', 'https://ejemplo.test/a'),
            ('otro.test', 'Con alternativa', 'https://www.otro.test/b'),
            ('ejemplo.test', 'De ayer', 'https://externo.test/c'),
            ('ejemplo.test', 'Estimada', 'https://ejemplo.test/d'),
        ])
        self.assertEqual(instante(leidas[0]['fecha_pub']), pub.timestamp())
        self.assertEqual(leidas[1]['fecha_pub'], leidas[0]['fecha_pub'])
        self.assertEqual(instante(leidas[2]['fecha_pub']), pub_ayer.timestamp())
        self.assertEqual(instante(leidas[3]['fecha_estimada']), est.timestamp())
        self.assertEqual((leidas[0]['medio'], leidas[0]['grupo'], leidas[0]['fecha']),
                         ('Ejemplo', 'Pruebas', generado))
