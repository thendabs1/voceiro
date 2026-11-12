"""Recogida completa por fuente, presupuestos y conservación del estado bueno."""
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
import io
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

from urllib.error import HTTPError

from agenda import almacen, atletismo, atletismo_coincidencias, atletismo_recogida as r, publicacion

MUESTRAS = Path(__file__).with_name('muestras_calendario') / 'atletismo'


class RecogidaAtletismo(unittest.TestCase):
    def test_fca_paginas_completas_y_presupuesto(self):
        paginas = json.loads((MUESTRAS / 'fca.json').read_text())
        # La muestra contiene la lista completa de páginas.
        if isinstance(paginas, dict):
            paginas = paginas['paginas']
        api = iter(paginas)
        entrada, informe = r.recoger('fca', '2026-11-01', '2026-12-31', descargar=lambda url: (
            json.dumps(next(api)) if 'wp-json' in url else '<html></html>'))
        self.assertEqual(len(entrada['eventos']), 53)
        self.assertEqual(informe['peticiones'], 55)  # Dos páginas de API y una ficha por cita.
        self.assertEqual(len(informe['fichas']['fallidas']), 53)
        self.assertTrue(informe['completo'])
        with self.assertRaisesRegex(ValueError, 'presupuesto'):
            r.recoger('fca', '2026-11-01', '2026-12-31', max_peticiones=1,
                      descargar=lambda url: json.dumps(paginas[0]))

    def test_fca_no_acepta_paginas_repetidas_o_totales_cambiantes(self):
        paginas = json.loads((MUESTRAS / 'fca.json').read_text())
        if isinstance(paginas, dict):
            paginas = paginas['paginas']
        for segunda in (paginas[0], {**paginas[1], 'total': 54}):
            with patch.object(r.recogida, 'descargar', side_effect=map(json.dumps, [paginas[0], segunda])):
                with self.assertRaises(ValueError):
                    r.recoger('fca', '2026-11-01', '2026-12-31')

    def test_rfea_cierra_extremos_con_meses_adyacentes(self):
        muestra = json.loads((MUESTRAS / 'rfea.json').read_text())
        llamadas = []

        def obtener(url):
            llamadas.append(url)
            if '/communication-hub/circulares' in url:
                raise FileNotFoundError('Sin captura del índice de circulares')
            if url == 'https://atletismorfea.es/calendario':
                return (MUESTRAS / 'rfea' / 'formulario.html').read_text()
            if url in muestra['fichas']:
                return muestra['fichas'][url]
            if '/championship-documents/' in url:
                return (MUESTRAS / 'rfea' / 'documentos-vacios.json').read_text()
            timestamp = int(url.split('/ajax/calendario/')[1].split('/')[0])
            mes = datetime.fromtimestamp(timestamp, timezone.utc).date()
            if mes.month == 11 and '/Deportivo/0/0/0/0/' in url:
                return json.dumps(muestra['respuesta'])
            previo = (mes - timedelta(days=1)).replace(day=1)
            siguiente = (mes.replace(day=28) + timedelta(days=4)).replace(day=1)
            marcas = [int(datetime(d.year, d.month, 1, tzinfo=timezone.utc).timestamp()) for d in (previo, siguiente)]
            return json.dumps([{'command': 'insert', 'selector': '#calendar_container', 'data':
                '<div class="calendar_pager">' + ''.join(f'<a attr-date="{m}"></a>' for m in marcas) + '</div>'}])

        with tempfile.TemporaryDirectory() as carpeta:
            entrada, informe = r.recoger('rfea', '2026-11-01', '2026-11-30', descargar=obtener, cache=carpeta)
            self.assertEqual(len(llamadas), 39)
            llamadas.clear()
            r.recoger('rfea', '2026-11-01', '2026-11-30', descargar=obtener, cache=carpeta)
            self.assertEqual(len(llamadas), 38)  # La ficha se reutiliza; documentos y filtros se reconsultan.
            # Caduca con el reloj de la fuente: la pasada diaria siempre relee la ficha.
            vencida = time.time() - 21 * 3600 - 1
            for archivo in Path(carpeta).iterdir():
                os.utime(archivo, (vencida, vencida))
            llamadas.clear()
            r.recoger('rfea', '2026-11-01', '2026-11-30', descargar=obtener, cache=carpeta)
            self.assertEqual(len(llamadas), 39)
        self.assertEqual(len(entrada['eventos']), 1)
        self.assertEqual(entrada['eventos'][0]['inicio'], '2026-11-01')
        self.assertEqual(entrada['eventos'][0]['fin'], '2026-11-01')
        self.assertEqual(len(informe['consultas']), 36)

    def test_fga_ficha_no_disponible_conserva_capturas_buenas_y_cobertura_parcial(self):
        from test_atletismo_fga import captura
        entrada, informe = r.recoger('fga', '2026-11-01', '2026-11-30', descargar=captura)
        self.assertFalse(informe['completo'])
        self.assertFalse(informe['aplicar_ausencias'])
        self.assertIn('124035', {e['id'] for e in entrada['eventos']})
        self.assertEqual(next(g for g in entrada['agrupaciones'] if g['id'] == '119957')['clase'], 'coleccion')
        self.assertTrue(any(s['estado'] == 'no_disponible' for s in informe['superficies']))

    def test_ventana_acotada_y_cambio_de_ano(self):
        self.assertEqual(list(r.meses(date(2026, 12, 15), date(2027, 1, 2))), [date(2026, 12, 1), date(2027, 1, 1)])
        for inicio, fin in (('2026-11-02', '2026-11-01'), ('2026-01-01', '2026-05-01')):
            with self.assertRaises(ValueError):
                r.ventana(inicio, fin)

    def test_cli_guarda_informe_y_fallo_conserva_lectura_anterior(self):
        e = {'version': 1, 'fuente': 'fca', 'eventos': [{
            'id': 'ensayo', 'nombre': 'Ensayo recogida', 'inicio': '2026-11-01', 'fin': '2026-11-01',
            'url': 'https://fcatletisme.cat/event/ensayo/'}]}
        informe = {'fuente': 'fca', 'inicio': '2026-11-01', 'fin': '2026-11-30',
                   'peticiones': 1, 'citas': 1, 'completo': True}
        with tempfile.TemporaryDirectory() as carpeta:
            db = str(Path(carpeta) / 'agenda.db')
            args = ['--db', db, '--fuente', 'fca', '--inicio', '2026-11-01', '--fin', '2026-11-30']
            with patch.object(r, 'recoger', return_value=(e, informe)):
                r.main(args)
            with almacen.abrir(db) as conexion:
                anterior = almacen.cargar(conexion)
                self.assertEqual(len(publicacion.proyectar(anterior['nucleo'])['eventos']), 1)
                self.assertTrue(conexion.execute('SELECT valor_json FROM agenda_estado WHERE clave=?',
                                                ('atletismo-informe-fca',)).fetchone())
            with patch.object(r, 'recoger', side_effect=ValueError('página incompleta')):
                with self.assertRaises(ValueError):
                    r.main(args)
            with almacen.abrir(db) as conexion:
                self.assertEqual(almacen.cargar(conexion), anterior)

    def test_ausente_de_la_lectura_se_reconsulta_reimporta_u_oculta(self):
        def tribe(i, dia, **cambios):
            return {'id': i, 'title': 'Cursa ' + str(i), 'url': f'https://fcatletisme.cat/event/cursa-{i}/',
                    'start_date': dia + ' 00:00:00', 'end_date': dia + ' 23:59:59', 'all_day': True,
                    'venue': {'id': 1, 'venue': 'Pista', 'city': 'Lleida'}, 'categories': [], 'organizer': [],
                    'status': 'publish', 'hide_from_listings': False, **cambios}

        def pagina(*eventos):
            return {'total': len(eventos), 'total_pages': 1, 'events': list(eventos)}

        n = atletismo.importar(None, {'version': 1, 'fuente': 'fca', 'eventos':
            atletismo.leer_cataluna([pagina(tribe(1, '2026-11-08'), tribe(2, '2026-11-10'),
                                            tribe(3, '2026-11-12'), tribe(4, '2026-11-14'))])}, AHORA)
        conocidas = [c for c in atletismo_coincidencias.actuales(n) if c['fuente'] == 'fca']

        def obtener(url):
            if '?' in url:
                return json.dumps(pagina(tribe(1, '2026-11-08')))
            i = url.rsplit('/', 1)[1]
            if i == '2':
                return json.dumps(tribe(2, '2026-12-20'))
            if i == '4':
                return json.dumps(tribe(4, '2026-11-14', hide_from_listings=True))
            cuerpo = {'code': 'rest_invalid_param', 'data': {'status': 400, 'params': {'id': 'no válido'}}}
            raise HTTPError(url, 400, 'Bad Request', {}, io.BytesIO(json.dumps(cuerpo).encode()))

        luego = '2026-11-03T20:00:00+01:00'
        entrada, informe = r.recoger('fca', '2026-11-01', '2026-11-30', descargar=obtener,
                                     conocidas=conocidas, observado=luego)
        self.assertEqual(informe['reimportadas'], ['2'])
        self.assertEqual({a['id']: a['motivo'] for a in informe['ausencias']},
                         {'3': 'ficha retirada (HTTP 400)', '4': 'fuera del listado'})
        n = atletismo.registrar_ausencias(atletismo.importar(n, entrada, luego), 'fca', informe['ausencias'])
        fechas = {e['nombres']['und']: e['programacion']['valor']['cuando']['inicio']['fecha']
                  for e in publicacion.proyectar(n)['eventos']}
        self.assertEqual(fechas, {'Cursa 1': '2026-11-08', 'Cursa 2': '2026-12-20'})
        # Una lectura nueva del ID la vuelve a publicar.
        n = atletismo.importar(n, {'version': 1, 'fuente': 'fca',
                                   'eventos': atletismo.leer_cataluna([pagina(tribe(3, '2026-11-12'))])},
                              '2026-11-04T20:00:00+01:00')
        self.assertEqual(set(n['fuentes']['fca']['ausencias']['ids']), {'4'})
        self.assertEqual(len(publicacion.proyectar(n)['eventos']), 3)

        def caida(url):
            if '?' in url:
                return json.dumps(pagina())
            raise HTTPError(url, 503, 'Unavailable', {}, io.BytesIO(b''))

        with self.assertRaises(HTTPError):
            r.recoger('fca', '2026-11-01', '2026-11-30', descargar=caida, conocidas=conocidas)

    def test_lectura_rota_no_retira_nada_ni_consulta_fichas(self):
        conocidas = [{'id': str(i), 'fuente': 'fca', 'url': f'https://fcatletisme.cat/event/c{i}/',
                      'inicio': '2026-11-10', 'fin': '2026-11-10'} for i in range(6)]
        pedidas = []

        def vacia(url):
            pedidas.append(url)
            return json.dumps({'total': 0, 'total_pages': 0, 'events': []})

        with self.assertRaisesRegex(ValueError, 'no trae 6 de 6'):
            r.recoger('fca', '2026-11-01', '2026-11-30', descargar=vacia, conocidas=conocidas)
        self.assertEqual(len(pedidas), 1)
        # Cuatro ausentes de seis no es una lectura rota: se reconsultan.
        vacia = {'version': 1, 'fuente': 'fca', 'eventos': [{'id': '4'}, {'id': '5'}]}
        with self.assertRaises(HTTPError):
            r.reconsultar('fca', conocidas, vacia, {'pendientes': [], 'completo': True},
                          date(2026, 11, 1), date(2026, 11, 30),
                          lambda u: (_ for _ in ()).throw(HTTPError(u, 503, '', {}, io.BytesIO(b''))), AHORA)

    def test_pendiente_del_listado_con_otras_fechas_se_oculta(self):
        cita = {'id': '7', 'url': 'https://atletismo.gal/competicions/siete/', 'inicio': '2026-11-10', 'fin': '2026-11-10'}
        vacia = {'version': 1, 'fuente': 'fga', 'eventos': [], 'agrupaciones': []}

        def sin_red(url):
            raise AssertionError('una cita pendiente del listado no se reconsulta')

        for inicio, ausente in (('2026-11-10', False), ('2026-11-17', True)):
            with self.subTest(inicio=inicio):
                informe = {'completo': False, 'pendientes': [{'id': '7', 'url': cita['url'], 'inicio': inicio,
                           'fin': inicio, 'motivo': 'agrupación o jornadas por acreditar'}]}
                resultado = r.reconsultar('fga', [cita], deepcopy(vacia), informe,
                                          date(2026, 11, 1), date(2026, 11, 30), sin_red, AHORA)
                self.assertEqual([a['motivo'] for a in resultado['ausencias']], [
                    'fechas cambiadas (2026-11-17 – 2026-11-17); agrupación o jornadas por acreditar'] if ausente else [])

    def test_fallo_de_nivel_ii_conserva_la_lectura_mensual_de_rfea(self):
        e = {'version': 1, 'fuente': 'rfea', 'eventos': [{
            'id': '9', 'nombre': 'Cross ensayo', 'inicio': '2026-11-15', 'fin': '2026-11-15',
            'url': 'https://atletismorfea.es/calendario/campeonato/cross-ensayo'}]}
        informe = {'fuente': 'rfea', 'inicio': '2026-11-01', 'fin': '2026-11-30',
                   'peticiones': 1, 'citas': 1, 'completo': True}
        with tempfile.TemporaryDirectory() as carpeta:
            db = str(Path(carpeta) / 'agenda.db')
            args = ['--db', db, '--fuente', 'rfea', '--inicio', '2026-11-01', '--fin', '2026-11-30']
            with patch.object(r, 'recoger', return_value=(e, informe)), \
                    patch.object(r, 'nivel_ii', side_effect=ValueError('maqueta desconocida')):
                with self.assertRaisesRegex(SystemExit, 'Nivel II no se leyó.*maqueta desconocida'):
                    r.main(args)
            with almacen.abrir(db) as conexion:
                n = almacen.cargar(conexion)['nucleo']
                guardado = json.loads(conexion.execute('SELECT valor_json FROM agenda_estado WHERE clave=?',
                                                       ('atletismo-informe-rfea',)).fetchone()[0])
        self.assertEqual(len(publicacion.proyectar(n)['eventos']), 1)
        self.assertFalse(guardado['completo'])
        self.assertIn('maqueta desconocida', guardado['nivel_ii']['error'])
        # La ventana leída se publica con la fuente: el frontal raya lo posterior.
        # Aquí falló Nivel II: el fin leído no acredita una lectura completa.
        self.assertEqual(publicacion.proyectar(n, ['rfea'])['fuentes']['rfea']['ventana'],
                         {'inicio': '2026-11-01', 'fin': '2026-11-30', 'completa': False})

    def test_la_ventana_publica_el_ano_sin_documento_de_nivel_ii(self):
        e = {'version': 1, 'fuente': 'rfea', 'eventos': [{
            'id': '9', 'nombre': 'Cross ensayo', 'inicio': '2026-11-15', 'fin': '2026-11-15',
            'url': 'https://atletismorfea.es/calendario/campeonato/cross-ensayo'}]}
        informe = {'fuente': 'rfea', 'inicio': '2026-11-02', 'fin': '2027-01-01',
                   'peticiones': 1, 'citas': 1, 'completo': True}
        vacia = {'version': 1, 'fuente': 'rfea', 'eventos': []}
        ii = {'temporada': '2026', 'temporadas_sin_documento': ['2027'], 'completo': False}
        with tempfile.TemporaryDirectory() as carpeta:
            db = str(Path(carpeta) / 'agenda.db')
            with patch.object(r, 'recoger', return_value=(e, informe)), \
                    patch.object(r, 'nivel_ii', return_value=(vacia, ii)):
                r.main(['--db', db, '--fuente', 'rfea', '--inicio', '2026-11-02', '--fin', '2027-01-01'])
            with almacen.abrir(db) as conexion:
                n = almacen.cargar(conexion)['nucleo']
        self.assertEqual(publicacion.proyectar(n, ['rfea'])['fuentes']['rfea']['ventana'],
                         {'inicio': '2026-11-02', 'fin': '2027-01-01', 'completa': False,
                          'temporadas_sin_documento': ['2027']})

    def test_nivel_ii_sin_documento_de_un_ano_de_la_ventana_no_esta_completo(self):
        inventario = {'version': 1, 'url': r.atletismo_nivel_ii.URL, 'temporada': '2026',
                      'actualizado': '2026-10-15', 'huella_texto': 'x', 'filas': []}
        hecho = type('Hecho', (), {'stdout': 'Pages: 15\n'})()
        n = atletismo.importar(None, {'version': 1, 'fuente': 'rfea', 'eventos': []}, AHORA)
        with patch.object(r.recogida, 'descargar', return_value=b''), \
                patch.object(r.subprocess, 'run', return_value=hecho), \
                patch.object(r.atletismo_nivel_ii, 'leer', return_value=inventario), \
                patch.object(r.atletismo_nivel_ii, 'resolver', return_value={
                    'entrada': {'version': 1, 'fuente': 'rfea', 'eventos': []}, 'pendientes': [],
                    'incidencias': [], 'revisiones_no_aplicadas': []}):
            self.assertTrue(r.nivel_ii(n, '2026-11-01', '2026-12-31')[1]['completo'])
            informe = r.nivel_ii(n, '2026-11-02', '2027-01-01')[1]
        self.assertFalse(informe['completo'])
        self.assertEqual(informe['temporadas_sin_documento'], ['2027'])

    def test_nivel_ii_revision_no_aplicada_solo_afecta_a_su_ventana(self):
        # Revisión versionada del 21/11/2026: fuera de diciembre no rompe la completitud.
        inventario = {'version': 1, 'url': r.atletismo_nivel_ii.URL, 'temporada': '2026',
                      'actualizado': '2026-10-15', 'huella_texto': 'x', 'filas': []}
        hecho = type('Hecho', (), {'stdout': 'Pages: 15\n'})()
        n = atletismo.importar(None, {'version': 1, 'fuente': 'rfea', 'eventos': []}, AHORA)
        with patch.object(r.recogida, 'descargar', return_value=b''), \
                patch.object(r.subprocess, 'run', return_value=hecho), \
                patch.object(r.atletismo_nivel_ii, 'leer', return_value=inventario), \
                patch.object(r.atletismo_nivel_ii, 'resolver', return_value={
                    'entrada': {'version': 1, 'fuente': 'rfea', 'eventos': []}, 'pendientes': [],
                    'incidencias': [], 'revisiones_no_aplicadas': ['nivel-ii:xunta-galicia-marcha-invierno-2026']}):
            fuera = r.nivel_ii(n, '2026-12-01', '2026-12-31')[1]
            dentro = r.nivel_ii(n, '2026-11-01', '2026-11-30')[1]
        self.assertTrue(fuera['completo'])
        self.assertEqual(fuera['revisiones_no_aplicadas_fuera_ventana'], 1)
        self.assertFalse(dentro['completo'])
        self.assertEqual(dentro['revisiones_no_aplicadas'], ['nivel-ii:xunta-galicia-marcha-invierno-2026'])

    def test_ausencia_oculta_tambien_las_sesiones_de_la_cita(self):
        e = {'id': '5', 'nombre': 'Control', 'inicio': '2026-11-08', 'fin': '2026-11-08',
             'url': 'https://fcatletisme.cat/event/control/', 'programa': [{'id': 's1', 'nombre': 'Mañana',
             'tipo_sesion': 'jornada', 'inicio': '2026-11-08', 'fin': '2026-11-08'}]}
        n = atletismo.importar(None, {'version': 1, 'fuente': 'fca', 'eventos': [e]}, AHORA)
        self.assertTrue(publicacion.proyectar(n)['eventos'])
        n = atletismo.registrar_ausencias(n, 'fca', [{'id': '5', 'url': e['url'], 'motivo': 'ficha retirada (HTTP 404)',
                                                       'comprobado': AHORA}])
        self.assertEqual(publicacion.proyectar(n)['eventos'], [])

    def test_fga_reconsulta_parcial_no_oculta_ni_reimporta_una_fecha_dudosa(self):
        cita = {'id': '7', 'url': 'https://atletismo.gal/competicions/siete/',
                'inicio': '2026-11-10', 'fin': '2026-11-10'}
        ficha = ('<main><article class="type-competition post-7"><header><span>12/12/2026</span>'
                 '<h1>Siete</h1></header></article></main>')
        def caida(url):
            if url == cita['url']:
                return ficha
            raise HTTPError(url, 404, 'Not Found', {}, io.BytesIO(b''))
        vacia = {'version': 1, 'fuente': 'fga', 'eventos': [], 'agrupaciones': []}
        informe = {'pendientes': [], 'completo': True}
        resultado = r.reconsultar('fga', [cita], vacia, informe, date(2026,11,1), date(2026,12,31), caida, AHORA)
        self.assertEqual(resultado, {'ausencias': [], 'reimportadas': []})
        self.assertFalse(informe['completo'])
        self.assertEqual(informe['pendientes'][0]['id'], '7')

    def test_agrupacion_conserva_su_clase_al_releerse_como_circuito(self):
        entrada = {'version': 1, 'fuente': 'fga', 'agrupaciones': [{'id': '9', 'nombre': 'Circuito',
                   'url': 'https://atletismo.gal/competicions/circuito/', 'clase': 'coleccion'}], 'eventos': []}
        n = atletismo.importar(None, entrada, AHORA)
        entrada['agrupaciones'][0]['clase'] = 'circuito'
        n = atletismo.importar(n, entrada, '2026-11-03T20:00:00+01:00')
        self.assertEqual({e['clase'] for e in n['entidades'].values() if e['tipo'] == 'agrupacion'
                          and e['nombres'].get('und') == 'Circuito'}, {'coleccion'})

    def test_fichas_rfea_y_fga_que_no_sostienen_la_fecha(self):
        ficha = ('<script data-drupal-selector="drupal-settings-json">{"path": {"currentPath": "championship/7"}}'
                 '</script><div class="c_e_date">Del 5 al 6 de Diciembre</div>')
        cita = {'id': '7', 'url': 'https://atletismorfea.es/calendario/campeonato/siete'}
        self.assertEqual(r.ficha_rfea(cita, ficha, None), {'ausencia': 'trasladada: Del 5 al 6 de Diciembre'})
        with self.assertRaisesRegex(ValueError, 'no corresponde'):
            r.ficha_rfea({**cita, 'id': '8'}, ficha, None)
        for fuente, codigo, cuerpo, esperado in (('fga', 404, b'', True), ('rfea', 410, b'', True),
                                                  ('fca', 400, b'{"code": "otro"}', False), ('fga', 400, b'', False),
                                                  ('fca', 400, b'{"code": "rest-invalid-event-id"}', True)):
            with self.subTest(fuente=fuente, codigo=codigo):
                self.assertEqual(r.retirada(fuente, HTTPError('u', codigo, '', {}, io.BytesIO(cuerpo))), esperado)

    def test_fca_renumerada_conserva_identidad_y_clave_de_incidencia(self):
        # FCA renumeró sus eventos (9/11/2026): misma URL y fechas, otro ID, ficha antigua 404/400.
        def tribe(i, slug, dia, **cambios):
            return {'id': i, 'title': 'Cursa ' + slug, 'url': f'https://fcatletisme.cat/event/{slug}/',
                    'start_date': dia + ' 00:00:00', 'end_date': dia + ' 23:59:59', 'all_day': True,
                    'venue': {'id': 1, 'venue': 'Pista', 'city': 'Lleida'}, 'categories': [], 'organizer': [],
                    'status': 'publish', 'hide_from_listings': False, **cambios}

        def pagina(*eventos):
            return {'total': len(eventos), 'total_pages': 1, 'events': list(eventos)}

        dias = {f'c{i}': f'2026-11-{10 + i}' for i in range(6)}
        antes = [tribe(i + 1, s, d) for i, (s, d) in enumerate(dias.items())]
        n = atletismo.importar(None, {'version': 1, 'fuente': 'fca',
                                      'eventos': atletismo.leer_cataluna([pagina(*antes)])}, AHORA)
        conocidas = [c for c in atletismo_coincidencias.actuales(n) if c['fuente'] == 'fca']
        destinos = {c['url']: c['destino'] for c in conocidas}
        # c5 cambia de fecha con el ID nuevo: no se da por renumerada.
        despues = [tribe(i + 101, s, '2026-11-25' if s == 'c5' else d) for i, (s, d) in enumerate(dias.items())]

        def obtener(url, vivas=()):
            if '?' in url:
                return json.dumps(pagina(*despues))
            i = int(url.rsplit('/', 1)[1])
            if i in vivas:
                return json.dumps(antes[i - 1])
            if i == 2:
                cuerpo = {'code': 'rest-invalid-event-id', 'data': {'status': 400}}
                raise HTTPError(url, 400, 'Bad Request', {}, io.BytesIO(json.dumps(cuerpo).encode()))
            raise HTTPError(url, 404, 'Not Found', {}, io.BytesIO(b'{"code": "rest-event-not-found"}'))

        luego = '2026-11-10T20:00:00+01:00'
        entrada, informe = r.recoger('fca', '2026-11-01', '2026-11-30', descargar=obtener,
                                     conocidas=conocidas, observado=luego)
        self.assertEqual(sorted(informe['renumeradas'], key=lambda x: x['id']),
                         [{'id': str(i), 'nuevo': str(i + 100)} for i in range(1, 6)])
        self.assertEqual({a['id']: a['motivo'] for a in informe['ausencias']}, {
            **{str(i): f'renumerada como {i + 100} (HTTP 404)' for i in (1, 3, 4, 5)},
            '2': 'renumerada como 102 (HTTP 400)', '6': 'ficha retirada (HTTP 404)'})
        self.assertEqual({e['id']: e.get('renumerada_de') for e in entrada['eventos']},
                         {**{str(i + 100): str(i) for i in range(1, 6)}, '106': None})
        n = atletismo.registrar_ausencias(atletismo.importar(n, entrada, luego), 'fca', informe['ausencias'])
        nuevas = {c['id']: c for c in atletismo_coincidencias.actuales(n) if c['fuente'] == 'fca'}
        for i in range(101, 106):
            self.assertEqual(nuevas[str(i)]['destino'], destinos[nuevas[str(i)]['url']])
            self.assertEqual(nuevas[str(i)]['metadatos']['renumerada_de'], str(i - 100))
        self.assertNotEqual(nuevas['106']['destino'], destinos[nuevas['106']['url']])
        publicadas = publicacion.proyectar(n)['eventos']
        self.assertEqual(len(publicadas), 6)  # Cinco heredadas y c5 en su fecha nueva.
        self.assertEqual(atletismo_coincidencias.incidencias(n), [])
        # Una segunda renumeración conserva el primer ID como raíz.
        n2 = atletismo.importar(n, {'version': 1, 'fuente': 'fca', 'eventos': [
            {**e, 'id': '201', 'renumerada_de': '101'} for e in entrada['eventos'] if e['id'] == '101']},
            '2026-11-11T20:00:00+01:00')
        raiz = next(c for c in atletismo_coincidencias.actuales(n2) if c['id'] == '201')
        self.assertEqual((raiz['destino'], raiz['metadatos']['renumerada_de']), (nuevas['101']['destino'], '1'))
        # Reimportar el ID nuevo sin la marca la conserva.
        n3 = atletismo.importar(n, {'version': 1, 'fuente': 'fca', 'eventos': [
            {k: v for k, v in e.items() if k != 'renumerada_de'} for e in entrada['eventos']]},
            '2026-11-11T20:00:00+01:00')
        self.assertEqual({c['id']: c['metadatos'].get('renumerada_de') for c in atletismo_coincidencias.actuales(n3)
                          if c['id'] in ('101', '106')}, {'101': '1', '106': None})

        # Si el ID guardado sigue vivo no es una renumeración: se reimporta y no se une.
        _, informe = r.recoger('fca', '2026-11-01', '2026-11-30', conocidas=conocidas, observado=luego,
                               descargar=lambda u: obtener(u, vivas={1, 2, 3, 4, 5, 6}))
        self.assertEqual((informe['renumeradas'], informe['ausencias']), ([], []))
        self.assertEqual(len(informe['reimportadas']), 6)
        # Dos citas leídas con la misma URL no acreditan cuál sustituye a la guardada.
        dobles = [*despues[:5], {**despues[0], 'id': 999}]
        self.assertEqual(r.renumeraciones(conocidas, atletismo.leer_cataluna([pagina(*dobles)]),
                                           [c for c in conocidas if c['url'].endswith('/c0/')]), {})
        # Sin URL que encaje sigue siendo una lectura rota.
        otras = [{**e, 'url': e['url'].replace('/c', '/x')} for e in despues]
        with self.assertRaisesRegex(ValueError, 'no trae 6 de 6'):
            r.recoger('fca', '2026-11-01', '2026-11-30', conocidas=conocidas,
                      descargar=lambda u: json.dumps(pagina(*otras)) if '?' in u else obtener(u))

    def test_fca_renumerada_conserva_lecturas_documentales_revisadas(self):
        # El catálogo documental cita 89925; FCA la publica como 87344 desde el 10/11/2026.
        raw = next(e for e in json.loads((MUESTRAS / 'fca' / 'api.json').read_text())['events'] if e['id'] == 89925)
        html = (MUESTRAS / 'fca' / 'ficha-89925.html').read_text()
        pdf = (MUESTRAS / 'circulares' / 'fca-combinades.pdf').read_bytes()

        def fuente(evento):
            def obtener(url, *, binario=False):
                if binario:
                    return pdf
                if '?' in url:
                    return json.dumps({'total': 1, 'total_pages': 1, 'events': [evento]})
                if '/wp-json/' in url:
                    raise HTTPError(url, 404, 'Not Found', {}, io.BytesIO(b''))
                return html.replace('post-89925', 'post-' + str(evento['id']))
            return obtener

        entrada, _ = r.recoger('fca', '2026-11-12', '2026-11-30', descargar=fuente(raw), observado=AHORA)
        n = atletismo.importar(None, entrada, AHORA)
        # La pasada que acredita la renumeración y la siguiente, que ya no trae el ID anterior.
        for observado in ('2026-11-10T20:00:00+01:00', '2026-11-11T20:00:00+01:00'):
            conocidas = [c for c in atletismo_coincidencias.actuales(n) if c['fuente'] == 'fca'
                         and c['id'] not in r.renumerados(n['fuentes']['fca'])]
            entrada, informe = r.recoger('fca', '2026-11-12', '2026-11-30', descargar=fuente({**raw, 'id': 87344}),
                                         conocidas=conocidas, observado=observado)
            meta = entrada['eventos'][0]['metadatos']
            self.assertEqual((meta['actividad']['valor'], meta['alcance']['tipo']), ('control', 'reunion'))
            n = atletismo.registrar_ausencias(atletismo.importar(n, entrada, observado), 'fca', informe['ausencias'])
        e, = publicacion.proyectar(n)['eventos']
        self.assertIn('control', e['atletismo'].get('actividades', []))

    def test_fca_renumerada_dos_veces_bloqueo_y_reaparicion(self):
        def tribe(i, slug):
            return {'id': i, 'title': 'Cursa ' + slug, 'url': f'https://fcatletisme.cat/event/{slug}/',
                    'start_date': '2026-11-14 00:00:00', 'end_date': '2026-11-14 23:59:59', 'all_day': True,
                    'venue': {'id': 1, 'venue': 'Pista', 'city': 'Lleida'}, 'categories': [], 'organizer': [],
                    'status': 'publish', 'hide_from_listings': False}

        def pagina(*eventos):
            return {'total': len(eventos), 'total_pages': 1, 'events': list(eventos)}

        def leer(base):
            return [tribe(base + i, f'c{i}') for i in range(5)]

        def fuente(base, ficha_html=None):
            def obtener(url):
                if '?' in url:
                    return json.dumps(pagina(*leer(base)))
                if '/event/' in url and ficha_html:
                    raise HTTPError(url, ficha_html, 'Bloqueo', {}, io.BytesIO(b''))
                raise HTTPError(url, 404, 'Not Found', {}, io.BytesIO(b''))
            return obtener

        def pasar(n, base, observado, ficha_html=None):
            conocidas = [c for c in atletismo_coincidencias.actuales(n) if c['fuente'] == 'fca'
                         and c['id'] not in r.renumerados(n['fuentes']['fca'])]
            entrada, informe = r.recoger('fca', '2026-11-01', '2026-11-30', descargar=fuente(base, ficha_html),
                                         conocidas=conocidas, observado=observado)
            n = atletismo.registrar_ausencias(atletismo.importar(n, entrada, observado), 'fca', informe['ausencias'])
            return n, entrada, informe

        n = atletismo.importar(None, {'version': 1, 'fuente': 'fca',
                                      'eventos': atletismo.leer_cataluna([pagina(*leer(1))])}, AHORA)
        destinos = {c['url']: c['destino'] for c in atletismo_coincidencias.actuales(n)}
        # Un 403 de las fichas tras acreditar la renumeración: ni hereda ni importa el ID nuevo.
        n, entrada, informe = pasar(n, 101, '2026-11-03T20:00:00+01:00', ficha_html=403)
        self.assertEqual((entrada['eventos'], informe['renumeradas'], informe['ausencias']), ([], [], []))
        self.assertNotIn('101', {c['id'] for c in atletismo_coincidencias.actuales(n)})
        # La pasada siguiente la acredita; la otra, sin cambios, no reconsulta los sustituidos.
        n, _, informe = pasar(n, 101, '2026-11-04T20:00:00+01:00')
        self.assertEqual(len(informe['renumeradas']), 5)
        n, _, informe = pasar(n, 101, '2026-11-05T20:00:00+01:00')
        self.assertEqual((informe['ausencias'], informe['renumeradas']), ([], []))
        self.assertEqual({x['motivo'] for x in n['fuentes']['fca']['ausencias']['ids'].values()},
                         {f'renumerada como {i} (HTTP 404)' for i in range(101, 106)})
        # Una segunda renumeración no la bloquean los IDs ya sustituidos.
        n, _, informe = pasar(n, 201, '2026-11-06T20:00:00+01:00')
        self.assertEqual(len(informe['renumeradas']), 5)
        actuales = {c['id']: c for c in atletismo_coincidencias.actuales(n)}
        for i in range(201, 206):
            self.assertEqual(actuales[str(i)]['destino'], destinos[actuales[str(i)]['url']])
            self.assertEqual(actuales[str(i)]['metadatos']['renumerada_de'], str(i - 200))
        self.assertEqual(len(publicacion.proyectar(n)['eventos']), 5)
        self.assertEqual(atletismo_coincidencias.incidencias(n), [])
        # El ID original que reaparece junto a su sustituto no se une solo.
        vuelve = atletismo.leer_cataluna([pagina(tribe(1, 'c0'), tribe(201, 'c0'))])
        with self.assertRaisesRegex(ValueError, 'reaparece con su sustituto'):
            atletismo.importar(n, {'version': 1, 'fuente': 'fca', 'eventos': vuelve}, '2026-11-07T20:00:00+01:00')


AHORA = '2026-11-02T20:00:00+01:00'


if __name__ == '__main__':
    unittest.main()
