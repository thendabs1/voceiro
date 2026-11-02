"""Recogida completa por fuente, presupuestos y conservación del estado bueno."""
from datetime import date, datetime, timedelta, timezone
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from agenda import almacen, atletismo_recogida as r, publicacion

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


if __name__ == '__main__':
    unittest.main()
