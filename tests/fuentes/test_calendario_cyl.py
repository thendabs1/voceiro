"""Castilla y León: función = obra + fecha, recinto por localidad y nombre, paginación Opendatasoft."""

import json
import tempfile
import unittest
from unittest.mock import patch

from agenda import cyl, nucleo, presencia, recogida
from agenda.publicacion import proyectar
from test_calendario_cultura import AHORA, LUEGO, muestra
from test_limites import provincias


def pagina(filas, total=None):
    return json.dumps({'total_count': len(filas) if total is None else total, 'results': filas})


class CastillaLeon(unittest.TestCase):
    def test_funciones_obra_recinto_horas_y_temas(self):
        filas = muestra('cyl')
        p = proyectar(cyl.importar(None, filas, AHORA))
        self.assertEqual(len(p['eventos']), 7)
        tipos = [e['tipo'] for e in p['entidades'].values()]
        # Cada obra es actividad aunque tenga una función; cinco recintos por localidad + nombre.
        self.assertEqual((tipos.count('actividad'), tipos.count('lugar')), (5, 5))
        por_titulo = {}
        for e in p['eventos']:
            por_titulo.setdefault(e['nombres']['es'][:20], []).append(e)
        burgos = por_titulo["Encuentro 'Círculo d"]
        self.assertEqual(len(burgos), 3)
        obra, = {o for e in burgos for o in e['objetivos'] if o.startswith('actividad:')}
        self.assertTrue(all(obra in e['objetivos'] for e in burgos))
        leon, = por_titulo["Presentación del lib"]
        inicio = leon['programacion']['valor']['cuando']['inicio']
        self.assertEqual((inicio['hora_local'], inicio['instante']), ('19:00', '2026-10-27T19:00:00+01:00'))
        self.assertEqual(leon['temas'], ['literatura'])
        # Un intervalo no acredita la hora de cada día: queda como texto.
        expo, = [e for e in p['eventos'] if e['programacion']['valor']['modalidad'] == 'intervalo'
                 and 'León' in e['nombres']['es']]
        cuando = expo['programacion']['valor']['cuando']
        self.assertEqual((cuando['inicio']['hora_local'], cuando['horario_textual']), (None, '9:00h. – 14:00h.'))
        self.assertEqual(sorted(t for e in p['eventos'] for t in e['temas']),
                         ['danza', 'exposiciones', 'exposiciones', 'literatura'])  # Burgos («Foro») sin tema.

    def test_horas_en_formatos_mezclados(self):
        for texto, hora in (('19:30 h.', '19:30'), ('9:00h.', '09:00'), ('20:00', '20:00'), ('19.30 horas', '19:30'),
                            ('00:00', None), ('25:00', None), (None, None),
                            ('De martes a domingo de 10.00 a 13.30 horas', None)):
            with self.subTest(texto=texto):
                self.assertEqual(cyl.hora(texto), hora)

    def test_inventario_por_funcion_retira_solo_la_fecha_ausente(self):
        filas = muestra('cyl')
        n = cyl.importar(None, filas, AHORA)
        ids = cyl.inventario(filas)
        self.assertIn('1285530096041@2026-11-12', ids)
        n = presencia.registrar(n, 'cyl', ids, AHORA, cyl.URL)
        n = presencia.registrar(n, 'cyl', [i for i in ids if i != '1285530096041@2026-11-12'], LUEGO, cyl.URL)
        p = proyectar(n)
        self.assertEqual(len(p['eventos']), 6)
        self.assertEqual(sum(e['tipo'] == 'actividad' for e in p['entidades'].values()), 5)

    def test_paginacion_opendatasoft_ordenada_y_errores(self):
        filas = muestra('cyl')
        with patch('agenda.recogida.descargar', return_value=pagina(filas)) as descargar:
            seleccion, url, ids = recogida.cultura('cyl', '2026-10-27', '2026-10-27')
        pedida = descargar.call_args.args[0]
        self.assertIn('order_by=id_evento%2Cfecha_inicio', pedida)
        self.assertIn('limit=100', pedida)
        self.assertIn('offset=0', pedida)
        self.assertEqual(ids, cyl.inventario(filas))
        self.assertEqual(len(seleccion), 3)  # León el 27 y las dos exposiciones en curso.
        with patch('agenda.recogida.descargar', side_effect=[pagina(filas[:4], 7), pagina(filas[4:], 8)]):
            with self.assertRaisesRegex(ValueError, 'El total cambió'):
                recogida.cultura('cyl')
        with patch('agenda.recogida.descargar', return_value=pagina([filas[0], filas[0]], 2)):
            with self.assertRaisesRegex(ValueError, 'Identidad repetida'):
                recogida.cultura('cyl')

    def test_funcion_aplazada_lejos_entra_por_su_obra_conocida(self):
        n = cyl.importar(None, muestra('cyl'), AHORA)
        filas = muestra('cyl')
        filas[3]['fecha_inicio'] = '2027-03-11'  # Burgos aplaza la del 12/11: otra clave, misma obra.
        conocidos = {r['id_externo'] for r in n['referencias'].values() if r['tipo_externo'] == cyl.TIPO_EXTERNO}
        self.assertNotIn(cyl.identidad(filas[3]), conocidos)
        with patch('agenda.recogida.descargar', return_value=pagina(filas)):
            sin, _, _ = recogida.cultura('cyl', '2026-10-27', '2026-10-27')
            seleccion, url, ids = recogida.cultura('cyl', '2026-10-27', '2026-10-27', conocidos)
        self.assertNotIn(filas[3], sin)
        self.assertIn(filas[3], seleccion)
        n = presencia.registrar(cyl.importar(n, seleccion, LUEGO, url), 'cyl', ids, LUEGO, url)
        fechas = sorted(e['programacion']['valor']['cuando']['inicio']['fecha'] for e in proyectar(n)['eventos']
                        if e['nombres']['es'].startswith('Encuentro'))
        self.assertEqual(fechas, ['2026-10-15', '2026-12-17', '2027-03-11'])

    def test_cambio_de_funcion_no_es_evidencia_del_recinto_ni_de_la_obra(self):
        n = cyl.importar(None, muestra('cyl'), AHORA)
        compartidas = lambda m: {k: list(e['evidencias']) for k, e in m['entidades'].items()
                                 if e['tipo'] in ('lugar', 'actividad')}
        filas = muestra('cyl')
        filas[3]['hora_inicio'] = '12:00 h.'  # Una función de Burgos cambia de hora.
        b = cyl.importar(n, filas, LUEGO)
        self.assertGreater(len(b['observaciones']), len(n['observaciones']))
        self.assertEqual(compartidas(b), compartidas(n))

    def test_recintos_se_ubican_por_su_punto(self):
        from shared.territorios.limites import Limites
        with tempfile.TemporaryDirectory() as tmp:
            m, _ = provincias(tmp, {'24': [('24089', -5.7, 42.5, 0.3)]})
            p = proyectar(cyl.importar(None, muestra('cyl'), AHORA), limites_municipales=Limites(m, tmp))
        leon = [e for e in p['eventos'] if e['territorios']]
        self.assertEqual(len(leon), 2)
        self.assertTrue(all(e['territorios'][0]['territorio'] == 'es:municipio:24089' for e in leon))

    def test_rechaza_funcion_sin_obra_o_fecha_y_repetida_distinta(self):
        fila = muestra('cyl')[0]
        for cambio in ({'id_evento': None}, {'fecha_inicio': None}, {'titulo': ' '}):
            with self.subTest(cambio=cambio), self.assertRaisesRegex(ValueError, 'sin identidad o título'):
                cyl.importar(None, [{**fila, **cambio}], AHORA)
        with self.assertRaisesRegex(ValueError, 'repetida con contenido distinto'):
            cyl.importar(None, [fila, {**fila, 'hora_inicio': '20:00'}], AHORA)


if __name__ == '__main__':
    unittest.main()
