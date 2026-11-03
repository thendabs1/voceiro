"""Primeras capas: evidencia, identidad y plazos independientes de celebración."""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest

from agenda import atletismo, deporte, lectura, nucleo, publicacion, tiempos
from calendario import main


MUESTRAS = Path(__file__).with_name('muestras_calendario') / 'atletismo'
AHORA = '2026-11-02T20:00:00+01:00'


def cataluna():
    return json.loads((MUESTRAS / 'fca.json').read_text())


class Atletismo(unittest.TestCase):
    def test_equivalencia_revisada_une_tres_fuentes_y_capas_con_sus_metadatos(self):
        paginas = json.loads((MUESTRAS / 'negreira.json').read_text())
        identidades = set()
        for orden in (paginas, list(reversed(paginas))):
            n = None
            for pagina in orden:
                n = atletismo.importar(n, pagina, AHORA)
            vista = publicacion.proyectar(n, fuentes=['rfea', 'fga', 'fca'])
            self.assertEqual(len(vista['eventos']), 1)
            e = vista['eventos'][0]
            identidades.add(e['id'])
            self.assertEqual({f['fuente'] for f in e['fuentes']}, {'rfea', 'fga', 'fca'})
            self.assertEqual(len(e['atletismo']['variantes']), 3)
            self.assertFalse(e['programacion']['conflicto'])
            capas = {o['bloques'].get('codigo_consulta'): n['referencias'][o['referencia']]['destino']
                     for o in n['observaciones'].values() if o['bloques'].get('codigo_consulta')}
            for capa in ('atletismo-rfea', 'atletismo-fga', 'atletismo-fca'):
                self.assertIn(nucleo.clave(capas[capa]), e['objetivos'])
            self.assertEqual(len(lectura.preparar(vista)['eventos']), 1)
            for fuente in ('rfea', 'fga', 'fca'):
                parcial = publicacion.proyectar(n, fuentes=[fuente])['eventos'][0]
                self.assertEqual(parcial['id'], e['id'])
                self.assertEqual(parcial['programacion']['procedencia']['fuente'], fuente)
                self.assertEqual([v['procedencia']['fuente'] for v in parcial['atletismo']['variantes']], [fuente])
                self.assertFalse(parcial['atletismo']['conflicto'])
        self.assertEqual(len(identidades), 1)

    def test_discrepancia_posterior_conserva_identidad_y_evidencia_del_conflicto(self):
        paginas = json.loads((MUESTRAS / 'negreira.json').read_text())
        n = None
        for pagina in paginas:
            n = atletismo.importar(n, pagina, AHORA)
        anterior = deepcopy(n)
        id_cita = publicacion.proyectar(n)['eventos'][0]['id']
        pagina = next(p for p in paginas if p['fuente'] == 'fca')
        pagina['eventos'][0].update(inicio='2026-11-16', fin='2026-11-16')
        nuevo = atletismo.importar(n, pagina, '2026-11-03T20:00:00+01:00')
        e = publicacion.proyectar(nuevo)['eventos'][0]
        self.assertEqual(e['id'], id_cita)
        self.assertTrue(e['programacion']['conflicto'])
        self.assertEqual({v['programacion']['cuando']['inicio']['fecha']
            for v in e['atletismo']['variantes']}, {'2026-11-15', '2026-11-16'})
        self.assertEqual(n, anterior)
        parcial = publicacion.proyectar(nuevo, fuentes=['rfea'])['eventos'][0]
        self.assertFalse(parcial['programacion']['conflicto'])
        self.assertEqual(parcial['programacion']['valor']['cuando']['inicio']['fecha'], '2026-11-15')

    def test_circuito_son_tres_jornadas_sin_cita_del_padre_ni_dias_intermedios(self):
        pagina = json.loads((MUESTRAS / 'fga-circuito.json').read_text())
        n = atletismo.importar(None, pagina, AHORA)
        vista = publicacion.proyectar(n, fuentes=['fga'], generado=AHORA)
        self.assertEqual(len(vista['eventos']), 3)
        circuito = next(e for e in n['entidades'].values() if e['clase'] == 'circuito')
        capa = next(e for e in n['entidades'].values() if e['clase'] == 'coleccion')
        for e in vista['eventos']:
            self.assertIn(nucleo.clave(circuito), e['objetivos'])
            self.assertIn(nucleo.clave(capa), e['objetivos'])
            self.assertFalse(tiempos.en_intervalo(e['programacion']['valor']['cuando'],
                '2026-11-08', '2026-11-09'))
        # La preparación para lectura conserva tres citas, nunca cuatro.
        self.assertEqual(len(lectura.preparar(vista)['eventos']), 3)
        pagina['eventos'].append({'id': '127481'})
        with self.assertRaisesRegex(ValueError, 'también como cita'):
            atletismo.importar(None, pagina, AHORA)
        pagina['eventos'].pop()
        borrador = {'version': 1, 'fuente': 'fga', 'eventos': [{
            **pagina['agrupaciones'][0], 'inicio': '2026-11-07', 'fin': '2026-11-07'}]}
        anterior = atletismo.importar(None, borrador, AHORA)
        with self.assertRaisesRegex(ValueError, 'conciliación explícita'):
            atletismo.importar(anterior, pagina, '2026-11-03T20:00:00+01:00')

    def test_anadir_programa_fechado_conserva_identidad_y_una_tarjeta(self):
        # Programa ficticio para validar el contrato, no horario de una fuente.
        e = {'id': 'ensayo', 'nombre': 'Campeonato de prueba',
            'url': 'https://atletismorfea.es/calendario/campeonato/ensayo',
            'inicio': '2026-12-12', 'fin': '2026-12-13'}
        pagina = {'version': 1, 'fuente': 'rfea', 'eventos': [e]}
        anterior = atletismo.importar(None, pagina, AHORA)
        id_cita = publicacion.proyectar(anterior)['eventos'][0]['id']
        e['programa'] = [{'id': 'jornada-1', 'nombre': 'Primera jornada',
            'tipo_sesion': 'jornada', 'inicio': '2026-12-12'},
            {'id': 'final', 'nombre': 'Final de ensayo', 'tipo_sesion': 'final',
             'inicio': '2026-12-13T10:00:00+01:00', 'zona': 'Europe/Madrid'}]
        n = atletismo.importar(anterior, pagina, '2026-11-03T20:00:00+01:00')
        eventos = publicacion.proyectar(n)['eventos']
        self.assertEqual(len(eventos), 1)
        self.assertEqual(eventos[0]['id'], id_cita)
        self.assertEqual(len(eventos[0]['programa']), 2)
        self.assertEqual(eventos[0]['programa'][0]['programacion']['valor']['cuando']['inicio']['precision'], 'fecha')
        self.assertIsNone(eventos[0]['programa'][1]['programacion']['valor']['cuando']['fin']['fecha'])
        self.assertEqual(len(lectura.preparar(publicacion.proyectar(n, fuentes=['rfea']))['eventos']), 1)
        self.assertNotIn('programa', publicacion.proyectar(anterior)['eventos'][0])
        e['programa'][1]['inicio'] = '2026-12-13T11:00:00+01:00'
        actualizado = atletismo.importar(n, pagina, '2026-11-04T20:00:00+01:00')
        sesiones = publicacion.proyectar(actualizado)['eventos'][0]['programa']
        self.assertEqual({s['id'] for s in sesiones}, {s['id'] for s in eventos[0]['programa']})
        self.assertEqual(sesiones[1]['programacion']['valor']['cuando']['inicio']['hora_local'], '11:00:00')

    def test_rechaza_sesiones_sin_fecha_o_fuera_de_cita_y_grupo_desconocido(self):
        e = {'id': 'ensayo', 'nombre': 'Ensayo', 'url': 'https://atletismo.gal/competicions/ensayo/',
             'inicio': '2026-12-12', 'fin': '2026-12-13'}
        pagina = {'version': 1, 'fuente': 'fga', 'eventos': [e]}
        for inicio in (None, '2026-12-14', '2026-12-12T10:00:00'):
            e['programa'] = [{'id': 'final', 'nombre': 'Final', 'tipo_sesion': 'final', 'inicio': inicio}]
            with self.subTest(inicio=inicio), self.assertRaises(ValueError):
                atletismo.importar(None, pagina, AHORA)
        e.pop('programa')
        e['grupo'] = 'sin-resolver'
        with self.assertRaisesRegex(ValueError, 'agrupación no acreditada'):
            atletismo.importar(None, pagina, AHORA)

    def test_no_mezcla_sesiones_de_competiciones_ni_admite_principal_en_circuito(self):
        a = deporte.Agenda(None, 'fga', 'FGA', atletismo.FUENTES['fga'][1], 'atletismo', AHORA)
        uno = a.grupo('grupo', 'uno', 'competicion', 'Uno')
        dos = a.grupo('grupo', 'dos', 'competicion', 'Dos')
        principal, _ = a.evento('evento', 'uno', 'encuentro', 'Uno', deporte.dias('2026-12-12'),
            padre=uno, bloques={'agenda': {'rol': 'principal', 'grupo': uno}})
        a.evento('sesion', 'final', 'sesion', 'Final', deporte.dias('2026-12-12'), padre=dos,
            bloques={'agenda': {'rol': 'sesion', 'principal': principal, 'tipo_sesion': 'final'}})
        with self.assertRaisesRegex(ValueError, 'fuera de la agrupación'):
            publicacion.proyectar(a.terminar())
        a = deporte.Agenda(None, 'fga', 'FGA', atletismo.FUENTES['fga'][1], 'atletismo', AHORA)
        circuito = a.grupo('grupo', 'circuito', 'circuito', 'Circuito')
        a.evento('evento', 'uno', 'encuentro', 'Uno', deporte.dias('2026-12-12'), padre=circuito,
            bloques={'agenda': {'rol': 'principal', 'grupo': circuito}})
        with self.assertRaisesRegex(ValueError, 'agrupación deportiva válida'):
            a.terminar()

    def test_cataluna_total_real_y_paginas_truncadas_o_repetidas(self):
        paginas = cataluna()
        self.assertEqual(len(atletismo.leer_cataluna(paginas)), 53)
        for malas in (paginas[:1], [paginas[0], paginas[0]]):
            with self.assertRaises(ValueError):
                atletismo.leer_cataluna(malas)
        paginas[1]['total'] += 1
        with self.assertRaises(ValueError):
            atletismo.leer_cataluna(paginas)

    def test_cataluna_decodifica_entidades_de_organizadores_y_categorias(self):
        paginas = cataluna()
        evento = paginas[0]['events'][0]
        evento['organizer'] = [{'id': 1, 'organizer': 'L&#8217;Hospitalet &#038; Co', 'website': ''}]
        evento['categories'] = [{'id': 2, 'name': 'Promoci&oacute;'}]
        e = next(e for e in atletismo.leer_cataluna(paginas) if e['id'] == str(evento['id']))
        self.assertEqual(e['metadatos']['organizaciones'][0]['nombre'], 'L’Hospitalet & Co')
        self.assertEqual(e['metadatos']['categorias'][0]['nombre'], 'Promoció')

    def test_cataluna_dias_sin_medianoches_ni_horas_artificiales(self):
        e = next(e for e in atletismo.leer_cataluna(cataluna()) if e['id'] == '89084')
        self.assertEqual((e['inicio'], e['fin']), ('2026-11-07', '2026-11-07'))
        self.assertEqual(e['id'], '89084')

    def test_galicia_tecnificacion_circuitos_e_inscripcion(self):
        eventos = atletismo.leer_galicia((MUESTRAS / 'fga.html').read_text())
        self.assertEqual(len(eventos), 4)
        self.assertIn('PGTA', eventos[2]['nombre'])
        self.assertEqual(eventos[2]['metadatos']['ambitos_literales'], ['Nacional'])
        jornada = eventos[3]
        self.assertEqual(jornada['id'], '124035')
        self.assertIn('vigo', jornada['metadatos']['circuito_declarado']['url'])
        ficha = atletismo.leer_ficha_galicia((MUESTRAS / 'fga-ficha.html').read_text())
        plazo = ficha['inscripcion']
        self.assertEqual(plazo['periodo']['fin']['fecha'], '2026-11-02')
        self.assertEqual(plazo['hora_cierre_literal'], '20:00')
        jornada['metadatos'].update(ficha)
        n = atletismo.importar(None, {'version': 1, 'fuente': 'fga', 'eventos': eventos}, AHORA)
        vista = publicacion.proyectar(n, fuentes=['fga'], generado=AHORA)
        e = next(e for e in vista['eventos'] if '3ª Xornada' in e['nombres']['und'])
        self.assertEqual(e['programacion']['valor']['cuando']['inicio']['fecha'], '2026-11-07')
        self.assertIsNone(e['programacion']['valor']['cuando']['inicio']['instante'])
        self.assertEqual(e['atletismo']['valor']['inscripcion'], plazo)
        preparada = lectura.preparar(vista)
        detalle = next(json.loads(f[4]) for f in preparada['eventos'] if f[0] == e['id'])
        self.assertEqual(detalle['evento']['atletismo']['valor']['inscripcion'], plazo)

    def test_rfea_identidad_sin_inventar_extremos_desde_ventana(self):
        captura = json.loads((MUESTRAS / 'rfea.json').read_text())
        eventos = atletismo.leer_rfea(**captura)
        self.assertEqual(eventos[0]['id'], '65127')
        self.assertEqual(eventos[0]['dias_observados'], ['2026-11-01'])
        enlaces = eventos[0]['metadatos']['enlaces_ficha']
        self.assertIn({'nombre': 'Pruebas de la competición',
            'url': 'https://atletismorfea.es/calendario/pruebas/excel/a0bQs00000FQCJSIA5'}, enlaces)
        self.assertEqual(eventos[0]['metadatos']['fecha_literal'], '1 de Noviembre')
        with self.assertRaises(ValueError):
            atletismo.importar(None, {'version': 1, 'fuente': 'rfea', 'eventos': eventos}, AHORA)
        with self.assertRaises(ValueError):
            atletismo.leer_rfea('2026-12', captura['respuesta'], captura['fichas'])
        with self.assertRaises(ValueError):
            atletismo.leer_rfea(captura['mes'], captura['respuesta'], {})

    def test_galicia_rango_explicito_y_etiquetas_no_son_pruebas(self):
        html = (MUESTRAS / 'fga-diciembre.html').read_text()
        eventos = atletismo.leer_galicia(html)
        homologada = next(e for e in eventos if 'Medio Maratón' in e['nombre'])
        self.assertEqual(homologada['metadatos']['modalidad_literal'], 'Ruta')
        self.assertIn('Homologada', homologada['metadatos']['etiquetas_listado'])
        rango = next(e for e in eventos if '5ª Xornada' in e['nombre'])
        self.assertEqual((rango['inicio'], rango['fin']), ('2026-12-12', '2026-12-13'))
        # Un rango explícito puede durar más de dos días; dos fechas sueltas no
        # acreditan que se celebre también durante los días intermedios.
        ampliado = html.replace('13/12/2026', '15/12/2026')
        self.assertEqual(atletismo.leer_galicia(ampliado)[1]['fin'], '2026-12-15')
        with self.assertRaises(ValueError):
            atletismo.leer_galicia(ampliado.replace('<span>-</span>', ''))
        with self.assertRaises(ValueError):
            atletismo.leer_galicia(html.replace('13/12/2026', '11/12/2026'))

    def test_reprogramar_conserva_identidad_y_fuentes_independientes(self):
        eventos = atletismo.leer_cataluna(cataluna())[:1]
        pagina = {'version': 1, 'fuente': 'fca', 'eventos': eventos}
        n = atletismo.importar(None, pagina, AHORA)
        anterior = deepcopy(n)
        evento = next(e for e in n['entidades'].values() if e['tipo'] == 'evento')
        eventos[0].update(inicio='2026-11-14', fin='2026-11-14', nombre='Nombre corregido')
        nuevo = atletismo.importar(n, pagina, '2026-11-03T20:00:00+01:00')
        self.assertEqual(n, anterior)
        self.assertIn(evento['id'], [e['id'] for e in nuevo['entidades'].values()])
        self.assertEqual(len([e for e in nuevo['entidades'].values() if e['tipo'] == 'evento']), 1)
        pagina['fuente'] = 'rfea'
        eventos[0]['url'] = 'https://atletismorfea.es/calendario/campeonato/ejemplo'
        nuevo = atletismo.importar(nuevo, pagina, '2026-11-03T20:00:00+01:00')
        self.assertEqual(len([e for e in nuevo['entidades'].values() if e['tipo'] == 'evento']), 2)

    def test_cli_importa_y_exporta_capas(self):
        pagina = {'version': 1, 'fuente': 'fca', 'eventos': atletismo.leer_cataluna(cataluna())}
        with tempfile.TemporaryDirectory() as tmp:
            entrada = Path(tmp) / 'entrada.json'
            entrada.write_text(json.dumps(pagina))
            salida = Path(tmp) / 'salida.json'
            main(['--db', str(Path(tmp) / 'agenda.db'), '--entrada-atletismo', str(entrada),
                  '--exportar-nucleo', '--salida', str(salida)])
            n = json.loads(salida.read_text())
            codigos = {o['bloques'].get('codigo_consulta') for o in n['observaciones'].values()}
            self.assertIn('atletismo-fca', codigos)


if __name__ == '__main__':
    unittest.main()
