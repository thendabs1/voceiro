"""Fechas e histórico: lo que puede romperse sin que ninguna fuente falle."""
import contextlib
import io
import json
import tempfile
import unittest
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import recolector as R
from bs4 import BeautifulSoup

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

    def test_dia_de_url_acepta_dias_antiguos_pero_no_futuros(self):
        hoy = datetime.now(MADRID).date()
        ayer = hoy - timedelta(days=1)
        casos = (
            (f'https://ejemplo.test/{ayer:%Y/%m/%d}/noticia', ayer.isoformat()),
            (f'https://ejemplo.test/noticia-{ayer:%Y%m%d}.html', ayer.isoformat()),
            (f'https://ejemplo.test/{hoy + timedelta(days=1):%Y/%m/%d}/noticia', ''),
            ('https://ejemplo.test/2020/01/01/noticia', '2020-01-01'),
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

    def test_la_fecha_de_otra_tarjeta_no_se_toma_pero_la_del_antetitulo_si(self):
        listado = BeautifulSoup(
            '<section><article><h2><a href="/a">Con fecha</a></h2>'
            '<time datetime="2026-10-21T08:00:00Z"></time></article>'
            '<div><h2><a href="/b">Sin fecha</a></h2></div></section>', 'lxml')
        self.assertEqual(R._extract_item_date(listado.find_all('h2')[1]), '')
        self.assertEqual(R._extract_item_date(listado.find_all('h2')[0]),
                         '2026-10-21T10:00:00+02:00')
        tarjeta = BeautifulSoup(
            '<article><h3>Política</h3><h2><a href="/c">Titular</a></h2>'
            '<time datetime="2026-10-21T08:00:00Z"></time></article>', 'lxml')
        self.assertEqual(R._extract_item_date(tarjeta.h2), '2026-10-21T10:00:00+02:00')
        # Con el enlace envolviendo el titular (lo que recorre _scrape_slugs).
        envueltos = BeautifulSoup(
            '<section><a href="/a"><h2>Con fecha</h2>'
            '<time datetime="2026-10-21T08:00:00Z"></time></a>'
            '<a href="/b"><h2>Sin fecha</h2></a></section>', 'lxml')
        self.assertEqual(R._extract_item_date(envueltos.find_all('a')[1]), '')
        self.assertEqual(R._extract_item_date(envueltos.find_all('a')[0]),
                         '2026-10-21T10:00:00+02:00')

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

    def test_una_fecha_antigua_descubierta_retira_tambien_la_copia_vieja(self):
        ahora = datetime.now(MADRID).replace(microsecond=0)
        vieja = {'dominio': 'ejemplo.test', 'titular': 'T', 'fecha': ahora.isoformat(),
                 'fecha_pub': '', 'fecha_estimada': ''}
        nueva = {**vieja, 'fecha_pub': (ahora - timedelta(days=22)).isoformat()}
        self.assertEqual(R.fusionar_historico([nueva], [dict(vieja)], dias=15), [])

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
        self.assertEqual(salida[0]['enlace'], b['enlace'])
        self.assertNotIn('alt', b)  # copia: la original sigue sirviendo a otros slices
        self.assertEqual(salida[0]['alt'], [
            {'d': 'c.test', 'u': '/z', 'e': c['fecha_estimada'], 'c': c['fecha']},
            {'d': 'a.test', 'u': '/x?id=3', 'c': a['fecha']},
        ])

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
            Path(carpeta, 'inventario.json').write_text(json.dumps(
                {'dias': [{'fecha': dia, 'all': {'file': 'dia.json'}}]}), encoding='utf-8')
            with patch.multiple(R, DATOS_DIR=carpeta, INVENTARIO_PATH=str(Path(carpeta, 'inventario.json')),
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


class Recogida(unittest.TestCase):
    def releer(self, noticias, dia, generado):
        fichero = {'fecha': dia, 'generado': generado, 'medios': {},
                   'noticias': [R._noticia_a_formato_corto(n, dia)
                                for n in R.deduplicar_editorial(noticias)]}
        with tempfile.TemporaryDirectory() as carpeta:
            Path(carpeta, 'dia.json').write_text(json.dumps(fichero), encoding='utf-8')
            Path(carpeta, 'inventario.json').write_text(json.dumps(
                {'dias': [{'fecha': dia, 'all': {'file': 'dia.json'}}]}), encoding='utf-8')
            with patch.multiple(R, DATOS_DIR=carpeta, INVENTARIO_PATH=str(Path(carpeta, 'inventario.json')),
                                STATE_PATH=str(Path(carpeta, 'state.json'))), \
                    contextlib.redirect_stdout(io.StringIO()):
                return {n['dominio']: n for n in R.cargar_historico_payload()['noticias']}

    def test_la_recogida_y_las_fechas_de_cada_alternativa_sobreviven_a_releer(self):
        hoy = datetime.now(MADRID).date()
        dia = hoy.isoformat()
        en = lambda h, m: datetime.combine(hoy, time(h, m), tzinfo=MADRID).isoformat()
        titular = 'El municipio aprueba un nuevo presupuesto'
        con_fecha = {'dominio': 'a.test', 'titular': titular, 'fuente': 'RSS',
                     'enlace': 'https://a.test/x', 'fecha': en(9, 0), 'fecha_pub': en(8, 30)}
        sin_fecha = {'dominio': 'b.test', 'titular': titular.upper(), 'fuente': 'Scraping',
                     'enlace': 'https://b.test/y', 'fecha': en(10, 15)}
        leidas = self.releer([con_fecha, sin_fecha], dia, generado=en(16, 2))
        a, b = leidas['a.test'], leidas['b.test']
        self.assertEqual(instante(a['fecha']), instante(en(9, 0)))
        self.assertEqual(instante(a['fecha_pub']), instante(en(8, 30)))
        # La alternativa no hereda la publicación ni la fuente del representante,
        # y su recogida no es la hora del fichero.
        self.assertEqual((b['fecha_pub'], b['fecha_estimada'], b['fuente']), ('', '', 'Scraping'))
        self.assertEqual(instante(b['fecha']), instante(en(10, 15)))

    def test_recogida_de_otro_dia_va_completa(self):
        n = {'dominio': 'a.test', 'titular': 'T', 'enlace': 'https://a.test/x',
             'fecha': '2026-10-20T23:50:00+02:00'}
        self.assertEqual(R._noticia_a_formato_corto(n, '2026-10-21')['c'], n['fecha'])
        self.assertEqual(R._noticia_a_formato_corto(n, '2026-10-20')['c'], '23:50')


class FalloR2(Exception):
    def __init__(self, codigo):
        super().__init__(codigo)
        self.response = {'Error': {'Code': codigo}}


class R2Falso:
    """Bucket en memoria; `fallos` dice qué claves fallan y con qué código."""
    def __init__(self, objetos=None, fallos=None):
        self.objetos = dict(objetos or {})
        self.fallos = dict(fallos or {})
        self.subidas = []

    def get_object(self, Bucket, Key):
        if Key in self.fallos:
            raise FalloR2(self.fallos[Key])
        if Key not in self.objetos:
            raise FalloR2('NoSuchKey')
        return {'Body': io.BytesIO(self.objetos[Key])}

    def upload_fileobj(self, f, bucket, nombre, **kwargs):
        if nombre in self.fallos:
            raise FalloR2(self.fallos[nombre])
        self.subidas.append(nombre)


class PublicacionR2(unittest.TestCase):
    def descargar(self, cliente):
        with tempfile.TemporaryDirectory() as carpeta, \
                patch.multiple(R, DATOS_DIR=carpeta,
                               INVENTARIO_PATH=str(Path(carpeta, 'inventario.json'))), \
                patch.object(R, '_r2_client', return_value=cliente), \
                contextlib.redirect_stdout(io.StringIO()):
            try:
                return R.descargar_historico_desde_r2()
            finally:
                self.inventario_local = Path(carpeta, 'inventario.json').exists()

    def inventario_con(self, *ficheros):
        hoy = datetime.now(MADRID).date().isoformat()
        return json.dumps({'dias': [{'fecha': hoy, 'all': {'file': f}} for f in ficheros]}).encode()

    def test_sin_inventario_en_r2_es_un_primer_run(self):
        self.assertEqual(self.descargar(R2Falso()), 0)
        self.assertFalse(self.inventario_local)

    def test_un_fallo_al_bajar_el_inventario_para_el_run(self):
        with self.assertRaises(SystemExit):
            self.descargar(R2Falso(fallos={'inventario.json': 'InternalError'}))
        self.assertFalse(self.inventario_local)

    def test_sin_inventario_se_parte_del_manifest_de_antes_pero_no_del_publico(self):
        viejo = self.inventario_con('a.json')
        self.assertEqual(self.descargar(R2Falso({'manifest.json': viejo, 'a.json': b'{}'})), 1)
        self.assertTrue(self.inventario_local)
        publico = json.dumps({'dias_ventana': 30, 'dias': []}).encode()
        with self.assertRaises(SystemExit):
            self.descargar(R2Falso({'manifest.json': publico}))

    def test_un_fallo_al_bajar_un_dia_para_el_run_pero_uno_que_no_existe_no(self):
        inventario = self.inventario_con('a.json', 'b.json')
        with self.assertRaises(SystemExit):
            self.descargar(R2Falso({'inventario.json': inventario, 'a.json': b'{}'},
                                   fallos={'b.json': 'SlowDown'}))
        self.assertEqual(self.descargar(R2Falso({'inventario.json': inventario, 'a.json': b'{}'})), 1)

    def subir(self, cliente, *nombres):
        with tempfile.TemporaryDirectory() as carpeta:
            rutas = []
            for nombre in nombres:
                Path(carpeta, nombre).write_text('{}', encoding='utf-8')
                rutas.append(str(Path(carpeta, nombre)))
            with patch.object(R, '_r2_client', return_value=cliente), \
                    contextlib.redirect_stdout(io.StringIO()):
                return R.subir_a_r2(rutas)

    def test_un_dia_que_llega_roto_para_el_run_y_no_queda_con_su_nombre(self):
        inventario = self.inventario_con('a.json')
        with tempfile.TemporaryDirectory() as carpeta, \
                patch.multiple(R, DATOS_DIR=carpeta,
                               INVENTARIO_PATH=str(Path(carpeta, 'inventario.json'))), \
                patch.object(R, '_r2_client', return_value=R2Falso(
                    {'inventario.json': inventario, 'a.json': b'{"fecha": "2026-'})), \
                contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(SystemExit):
                R.descargar_historico_desde_r2()
            self.assertFalse(Path(carpeta, 'a.json').exists())

    def test_un_dia_ilegible_en_local_para_el_run(self):
        hoy = datetime.now(MADRID).date().isoformat()
        with tempfile.TemporaryDirectory() as carpeta:
            Path(carpeta, 'a.json').write_text('', encoding='utf-8')
            Path(carpeta, 'inventario.json').write_text(json.dumps(
                {'dias': [{'fecha': hoy, 'all': {'file': 'a.json'}}]}), encoding='utf-8')
            with patch.multiple(R, DATOS_DIR=carpeta, INVENTARIO_PATH=str(Path(carpeta, 'inventario.json')),
                                STATE_PATH=str(Path(carpeta, 'state.json'))), \
                    contextlib.redirect_stdout(io.StringIO()), self.assertRaises(SystemExit):
                R.cargar_historico_payload()

    def test_el_inventario_y_el_manifest_se_suben_los_ultimos(self):
        cliente = R2Falso()
        self.assertEqual(self.subir(cliente, 'manifest.json', 'a.json', 'inventario.json',
                                    'b.json'), (4, 0, 0))
        self.assertEqual(cliente.subidas[-2:], ['inventario.json', 'manifest.json'])

    def test_si_falla_un_dato_ni_el_inventario_ni_el_manifest_se_suben(self):
        cliente = R2Falso(fallos={'b.json': 'InternalError'})
        self.assertEqual(self.subir(cliente, 'manifest.json', 'inventario.json',
                                    'a.json', 'b.json'), (1, 0, 1))
        self.assertEqual(cliente.subidas, ['a.json'])

    def test_si_falla_el_inventario_el_manifest_no_se_sube(self):
        cliente = R2Falso(fallos={'inventario.json': 'InternalError'})
        self.assertEqual(self.subir(cliente, 'manifest.json', 'inventario.json', 'a.json'),
                         (1, 0, 1))
        self.assertEqual(cliente.subidas, ['a.json'])


def fecha(i):
    return (datetime.now(MADRID).date() - timedelta(days=i)).isoformat()


def dia(i, legado=False):
    """Entrada de inventario del día hace i días; los de antes del troceado
    por medio solo tienen el fichero del día entero."""
    f = fecha(i)
    e = {'fecha': f, 'all': {'file': f'{f}-{i:010d}.json', 'n': 10 + i},
         'grupos': {}, 'dominios': {}}
    if not legado:
        e['grupos'] = {'Pruebas': {'file': f'{f}-g-pruebas-{i:010d}.json', 'n': 4, 'kb': 2.0}}
        e['dominios'] = {'a.test': {'file': f'd-a.test-{f}.json', 'n': 6, 'kb': 3.0}}
    return e


class R2Bucket:
    """Bucket en memoria para la limpieza: todo modificado hace 2 h."""
    def __init__(self, claves):
        hace = datetime.now(timezone.utc) - timedelta(hours=2)
        self.claves = {k: hace for k in claves}

    def head_object(self, Bucket, Key):
        if Key not in self.claves:
            raise FalloR2('404')
        return {'LastModified': self.claves[Key]}

    def delete_object(self, Bucket, Key):
        self.claves.pop(Key, None)

    def delete_objects(self, Bucket, Delete):
        for o in Delete['Objects']:
            self.claves.pop(o['Key'], None)
        return {}

    def get_paginator(self, nombre):
        claves = self.claves
        class Paginas:
            def paginate(self, Bucket):
                yield {'Contents': [{'Key': k, 'LastModified': t}
                                    for k, t in list(claves.items())]}
        return Paginas()


@patch.multiple(R, DIAS_VENTANA=2, DIAS_ARCHIVO=5)
class Archivo(unittest.TestCase):
    """Ventana de 2 días y archivo de 5: lo que sale de la ventana queda en
    una línea y en R2 solo sus ficheros por medio."""

    def inventario(self):
        hoy = datetime.now(MADRID).date()
        ventana, archivo = R._repartir_dias(
            [dia(0), dia(1), dia(2), dia(3, legado=True)],
            [{'fecha': fecha(4), 'n': 5}, {'fecha': fecha(6), 'n': 1}], hoy)
        return {'dias': ventana, 'archivo': archivo}

    def test_reparto_entre_ventana_y_archivo(self):
        inv = self.inventario()
        self.assertEqual([d['fecha'] for d in inv['dias']], [fecha(0), fecha(1)])
        self.assertEqual(inv['archivo'], [
            {'fecha': fecha(2), 'n': 12},
            {'fecha': fecha(3), 'n': 13, 'all': f'{fecha(3)}-{3:010d}.json'},
            {'fecha': fecha(4), 'n': 5},
        ])

    def test_resumen_publico(self):
        inv = self.inventario()
        inv['dias'][1] = dia(1, legado=True)
        r = R._resumen_publico(inv['dias'], inv['archivo'])
        self.assertEqual(r['dias'][0], {'fecha': fecha(0), 'n': 10,
                                        'grupos': {'Pruebas': f'{fecha(0)}-g-pruebas-{0:010d}.json'}})
        self.assertEqual(r['dias'][1]['grupos'], {})
        # La media sale solo de los días con detalle.
        self.assertEqual(r['medias'], {'grupos': {'Pruebas': [4.0, 2.0]},
                                       'dominios': {'a.test': [6.0, 3.0]}})
        self.assertEqual(r['guardado'], {'desde': fecha(4), 'dias': 5,
                                         'n': 10 + 11 + 12 + 13 + 5})

    def bucket(self):
        claves = ['inventario.json', 'manifest.json', f'{fecha(0)}-{99:010d}.json',
                  f'd-b.test-{fecha(0)}.json', f'd-a.test-{fecha(6)}.json']
        for i in range(4):
            claves.append(f'{fecha(i)}-{i:010d}.json')
            claves.append(f'{fecha(i)}-g-pruebas-{i:010d}.json')
        for i in range(6):
            claves.append(f'd-a.test-{fecha(i)}.json')
        return R2Bucket(claves)

    def limpiar(self, bucket, inv, prev=None, scan=False):
        with patch.object(R, '_r2_client', return_value=bucket), \
                contextlib.redirect_stdout(io.StringIO()):
            return R.limpiar_r2_huerfanos(inv, prev, forzar_scan=scan)

    def test_barrido_conserva_el_archivo_por_medio_y_borra_el_resto(self):
        b = self.bucket()
        antes = set(b.claves)
        self.assertTrue(self.limpiar(b, self.inventario(), scan=True))
        self.assertEqual(antes - set(b.claves), {
            f'{fecha(0)}-{99:010d}.json',         # versión vieja de un día de la ventana
            f'd-b.test-{fecha(0)}.json',          # medio que ya no está en ese día
            f'{fecha(2)}-{2:010d}.json',          # día entero de un día archivado
            f'{fecha(2)}-g-pruebas-{2:010d}.json',
            f'{fecha(3)}-g-pruebas-{3:010d}.json',
            f'd-a.test-{fecha(6)}.json',          # fuera del archivo
        })
        # Se conservan los ficheros por medio de los días archivados y el día
        # entero de uno de antes del troceado.
        for k in (f'd-a.test-{fecha(2)}.json', f'd-a.test-{fecha(5)}.json',
                  f'{fecha(3)}-{3:010d}.json', 'inventario.json'):
            self.assertIn(k, b.claves)

    def test_diff_con_el_manifest_de_antes_no_borra_el_archivo(self):
        b = self.bucket()
        prev = {'dias': [dia(1), dia(2), dia(3, legado=True)]}
        antes = set(b.claves)
        self.limpiar(b, self.inventario(), prev)
        self.assertEqual(antes - set(b.claves), {
            f'{fecha(2)}-{2:010d}.json', f'{fecha(2)}-g-pruebas-{2:010d}.json'})

    def test_con_la_ventana_vacia_no_se_borra_ningun_fichero_por_medio(self):
        b = self.bucket()
        self.limpiar(b, {'dias': [], 'archivo': []}, scan=True)
        for i in range(6):
            self.assertIn(f'd-a.test-{fecha(i)}.json', b.claves)


class Turso(unittest.TestCase):
    def test_solo_van_las_nuevas_de_medios_nacionales_y_los_anadidos(self):
        enviadas = []
        medios = {'nac.test': {'ambito': 'nacional'}, 'reg.test': {'ambito': 'regional'},
                  'extra.test': {'ambito': 'internacional'}}
        noticias = [{'dominio': d, 'titular': d, 'enlace': f'https://{d}/x', '_nueva': True}
                    for d in ('nac.test', 'reg.test', 'extra.test', 'fuera.test')]
        noticias.append({'dominio': 'nac.test', 'titular': 'vieja',
                         'enlace': 'https://nac.test/v', '_nueva': False})
        with patch.multiple(R, TURSO_HTTP_URL='https://turso.test', TURSO_TOKEN='x',
                            _MEDIOS_POR_DOMINIO=medios, TURSO_DOMINIOS_EXTRA={'extra.test'}), \
                patch.object(R, 'turso_pipeline',
                             side_effect=lambda stmts: enviadas.extend(stmts) or []), \
                contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(R.insertar_en_turso(noticias, '', '2026-10-21T12:00:00+02:00'), 2)
        self.assertEqual(sorted(s['stmt']['args'][1]['value'] for s in enviadas),
                         ['extra.test', 'nac.test'])
