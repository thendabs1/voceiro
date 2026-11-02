"""Recogida completa por fuente, presupuestos y conservación del estado bueno."""
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
import io
import json
from pathlib import Path
import tempfile
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
        with patch.object(r.recogida, 'descargar', side_effect=[json.dumps(p) for p in paginas]):
            entrada, informe = r.recoger('fca', '2026-11-01', '2026-12-31')
        self.assertEqual(len(entrada['eventos']), 53)
        self.assertEqual(informe['peticiones'], 2)
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
            if url == 'https://atletismorfea.es/calendario':
                return '<select class="calendar-field-season"><option value="464">2026</option></select>'
            if url in muestra['fichas']:
                return muestra['fichas'][url]
            timestamp = int(url.split('/ajax/calendario/')[1].split('/')[0])
            mes = datetime.fromtimestamp(timestamp, timezone.utc).date()
            if mes.month == 11:
                return json.dumps(muestra['respuesta'])
            previo = (mes - timedelta(days=1)).replace(day=1)
            siguiente = (mes.replace(day=28) + timedelta(days=4)).replace(day=1)
            marcas = [int(datetime(d.year, d.month, 1, tzinfo=timezone.utc).timestamp()) for d in (previo, siguiente)]
            return json.dumps([{'command': 'insert', 'selector': '#calendar_container', 'data':
                '<div class="calendar_pager">' + ''.join(f'<a attr-date="{m}"></a>' for m in marcas) + '</div>'}])

        with tempfile.TemporaryDirectory() as carpeta:
            entrada, informe = r.recoger('rfea', '2026-11-01', '2026-11-30', descargar=obtener, cache=carpeta)
            self.assertEqual(len(llamadas), 5)
            llamadas.clear()
            r.recoger('rfea', '2026-11-01', '2026-11-30', descargar=obtener, cache=carpeta)
            self.assertEqual(len(llamadas), 4)  # Siempre meses; ficha reutilizada.
        self.assertEqual(len(entrada['eventos']), 1)
        self.assertEqual(entrada['eventos'][0]['inicio'], '2026-11-01')
        self.assertEqual(entrada['eventos'][0]['fin'], '2026-11-01')
        self.assertEqual(len(informe['consultas']), 3)

    def test_fga_resuelve_plan_fuera_de_ventana_sin_inventar_otra_jornada(self):
        listado = (MUESTRAS / 'fga.html').read_text()
        ficha = (MUESTRAS / 'fga-ficha.html').read_text()
        contador = []

        def obtener(url):
            contador.append(url)
            if '?' in url:
                return listado
            if url.endswith('/plan-galego-de-tecnificacion-atletica-2026/'):
                return '<main><article class="type-competition post-9"><h1>Plan</h1></article></main>'
            if url.endswith('/i-circuito-de-atletismo-concello-de-vigo/'):
                return '<main><article class="type-competition post-10"><h1>Circuito</h1></article></main>'
            return ficha

        entrada, informe = r.recoger('fga', '2026-11-01', '2026-11-30', descargar=obtener)
        self.assertTrue(informe['completo'])
        self.assertEqual(len(entrada['eventos']), 4)
        self.assertEqual({g['id'] for g in entrada['agrupaciones']}, {'9', '10'})
        self.assertEqual(next(e for e in entrada['eventos'] if e['id'] == '121152')['grupo'], '9')

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

    def test_ausencia_oculta_tambien_las_sesiones_de_la_cita(self):
        e = {'id': '5', 'nombre': 'Control', 'inicio': '2026-11-08', 'fin': '2026-11-08',
             'url': 'https://fcatletisme.cat/event/control/', 'programa': [{'id': 's1', 'nombre': 'Mañana',
             'tipo_sesion': 'jornada', 'inicio': '2026-11-08', 'fin': '2026-11-08'}]}
        n = atletismo.importar(None, {'version': 1, 'fuente': 'fca', 'eventos': [e]}, AHORA)
        self.assertTrue(publicacion.proyectar(n)['eventos'])
        n = atletismo.registrar_ausencias(n, 'fca', [{'id': '5', 'url': e['url'], 'motivo': 'ficha retirada (HTTP 404)',
                                                       'comprobado': AHORA}])
        self.assertEqual(publicacion.proyectar(n)['eventos'], [])

    def test_fga_solo_el_404_de_la_propia_ficha_retira_y_pendientes_no_se_ocultan(self):
        cita = {'id': '7', 'url': 'https://atletismo.gal/competicions/siete/', 'inicio': '2026-11-10', 'fin': '2026-11-10'}
        ficha = ('<main><article class="type-competition post-7"><div><span>12/12/2026</span>'
                 '<span>Ordes</span></div><h1>Siete</h1></article></main>')
        listado = ('<div id="competitionList"><article class="type-competition post-7">'
                   '<h2><a href="/competicions/siete/">II Circuito Siete</a></h2>'
                   '<div class="space-x-2"><div><span>12/12/2026</span></div></div>'
                   '<div class="basis-5/12">Ordes</div></article></div>')

        def caido(url):
            if url == cita['url']:
                return ficha
            raise HTTPError(url, 404, 'Not Found', {}, io.BytesIO(b''))

        def pendiente(url):
            return ficha if url == cita['url'] else listado

        vacia = {'version': 1, 'fuente': 'fga', 'eventos': [], 'agrupaciones': []}
        with self.assertRaises(HTTPError):
            r.reconsultar('fga', [cita], deepcopy(vacia), {'pendientes': [], 'completo': True},
                          date(2026, 11, 1), date(2026, 11, 30), caido, AHORA)
        informe = {'pendientes': [], 'completo': True}
        resultado = r.reconsultar('fga', [cita], deepcopy(vacia), informe,
                                  date(2026, 11, 1), date(2026, 11, 30), pendiente, AHORA)
        self.assertEqual(resultado['ausencias'], [])
        self.assertFalse(informe['completo'])
        self.assertEqual([p['id'] for p in informe['pendientes']], ['7'])

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
                                                  ('fca', 400, b'{"code": "otro"}', False), ('fga', 400, b'', False)):
            with self.subTest(fuente=fuente, codigo=codigo):
                self.assertEqual(r.retirada(fuente, HTTPError('u', codigo, '', {}, io.BytesIO(cuerpo))), esperado)


AHORA = '2026-11-02T20:00:00+01:00'


if __name__ == '__main__':
    unittest.main()
