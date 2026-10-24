"""Contratos del calendario común y del primer adaptador, sin red."""

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from agenda.cultura_galicia import FUENTES, normalizar, recoger
from agenda.modelo import integrar
from calendario import main


AHORA = '2026-10-24T20:00:00+02:00'
DESPUES = '2026-10-25T20:00:00+01:00'


def ficha(identificador=101, **cambios):
    return {
        'id': identificador, 'nid': 10, 'traducionId': identificador + 1,
        'titulo': 'Unha obra', 'idioma': 'gl',
        'url': f'https://www.cultura.gal/gl/evento/10/13/{identificador}',
        'dataActualizacion': '2026-10-01 10:00:00', 'estado': None,
        'data': {'dataInicio': '2026-10-26 18:00:00', 'dataFin': '2026-10-26 18:00:00'},
        'lugarCelebracion': {'nome': 'Teatro', 'espazoId': '34',
                            'concello': {'tid': 487, 'nome': 'Pontevedra', 'cod_ine': '360388'}},
        'tipoEvento': {'tid': 14, 'nome': 'Teatro'},
        'ciclo': {'tid': 50, 'nome': 'Festival'}, **cambios,
    }


def construir(filas, anterior=None, ahora=AHORA):
    return integrar(anterior, [normalizar(f, 'gl') for f in filas], FUENTES, ahora)


class Identidad(unittest.TestCase):
    def test_funciones_separadas_traducciones_unidas(self):
        gl = ficha()
        es = ficha(102, traducionId=101, nid=11, idioma='es', titulo='Una obra')
        otra = ficha(201, data={'dataInicio': '2026-11-02 18:00:00', 'dataFin': None})
        calendario = construir([gl, es, otra])
        self.assertEqual(len(calendario['eventos']), 2)
        evento = next(e for e in calendario['eventos'] if len(e['registros']) == 2)
        self.assertEqual(evento['titulos'], {'gl': 'Unha obra', 'es': 'Una obra'})
        self.assertEqual(len(evento['relaciones']), 2)  # Dos nodos traducidos de origen.
        self.assertEqual(evento['conflictos'], [])
        self.assertEqual(calendario['regiones']['cultura-galicia:municipio:487']
                         ['identificadores']['ine_cpro_cmun_dc'], '360388')
        self.assertEqual(len(evento['grupos']), 2)  # Actividad y ciclo son referencias distintas.

    def test_aplazamiento_y_nueva_equivalencia_conservan_id_y_primera_recogida(self):
        original = ficha(traducionId=None)
        previo = construir([original])
        reprogramada = ficha(titulo='Título corregido',
            data={'dataInicio': '2026-11-15 17:00:00', 'dataFin': None},
            dataOrixinal=original['data'], estado={'chave': 'postponed'})
        nuevo = construir([reprogramada], previo, DESPUES)
        self.assertEqual(nuevo['eventos'][0]['id'], previo['eventos'][0]['id'])
        self.assertEqual(nuevo['eventos'][0]['estado'], 'aplazado')
        self.assertEqual(nuevo['eventos'][0]['cuando_original']['inicio'], '2026-10-26T18:00:00+01:00')
        registro = nuevo['registros']['cultura-galicia:101']
        self.assertEqual(registro['primera_recogida'], AHORA)
        self.assertEqual(registro['ultima_recogida'], DESPUES)
        self.assertEqual(registro['modificado_declarado'], '2026-10-01 10:00:00')
        self.assertEqual(previo['registros']['cultura-galicia:101']['original'], original)

    def test_ausencia_no_borra_ni_cancela(self):
        previo = construir([ficha(), ficha(201)])
        nuevo = construir([ficha(estado={'chave': 'cancelled'})], previo, DESPUES)
        ausente = nuevo['registros']['cultura-galicia:201']
        self.assertEqual(ausente['ultima_recogida'], AHORA)
        self.assertEqual(ausente['datos']['estado'], 'programado')
        self.assertEqual(len(nuevo['eventos']), 2)
        self.assertIn('cancelado', [e['estado'] for e in nuevo['eventos']])

    def test_dos_identidades_previas_no_se_fusionan_sin_revision(self):
        previo = construir([ficha(traducionId=None), ficha(102, traducionId=None)])
        with self.assertRaisesRegex(ValueError, 'ya separados'):
            construir([ficha()], previo)
        self.assertEqual(len(previo['eventos']), 2)

    def test_conflicto_entre_traducciones_conserva_ambas_versiones(self):
        es = ficha(102, traducionId=101, idioma='es',
                   data={'dataInicio': '2026-10-26 19:00:00', 'dataFin': None})
        calendario = construir([ficha(), es])
        self.assertIn('cuando', calendario['eventos'][0]['conflictos'])
        self.assertIn('19:00', calendario['registros']['cultura-galicia:102']['datos']['cuando']['inicio'])

    def test_otro_proveedor_y_multiples_regiones_usan_el_mismo_modelo(self):
        registro = {'fuente': 'deportes', 'id_externo': 'sesion-7',
            'original': {'nombre': 'Clasificación'}, 'equivalentes': [],
            'datos': {'titulos': {'es': 'Clasificación del gran premio'},
                'cuando': {'inicio': '2026-10-24T21:00:00+00:00', 'fin': None,
                           'precision': 'hora', 'zona': 'UTC'},
                'estado': 'programado', 'regiones': ['pais', 'region'],
                'grupos': ['campeonato'], 'relaciones': []},
            'regiones': {'pais': {'tipo': 'pais', 'nombres': {'es': 'País'}, 'padres': []},
                         'region': {'tipo': 'region', 'nombres': {'es': 'Región'}, 'padres': ['pais']}},
            'grupos': {'campeonato': {'tipo': 'competicion', 'nombres': {'es': 'F1'}}}}
        calendario = integrar(construir([ficha()]), [registro], {'deportes': {'nombre': 'Ejemplo'}}, AHORA)
        self.assertEqual(len(calendario['eventos']), 2)
        evento = next(e for e in calendario['eventos'] if e['datos_de'] == 'deportes:sesion-7')
        self.assertEqual(evento['regiones'], ['pais', 'region'])
        self.assertEqual(evento['grupos'], ['campeonato'])


class Fechas(unittest.TestCase):
    def test_sin_fin_no_inventa_duracion_ni_publicacion(self):
        registro = normalizar(ficha(), 'gl')
        self.assertIsNone(registro['datos']['cuando']['fin'])
        self.assertEqual(registro['datos']['cuando']['inicio'], '2026-10-26T18:00:00+01:00')
        self.assertNotIn('publicado', registro)
        self.assertEqual(registro['original']['data']['dataFin'], '2026-10-26 18:00:00')

    def test_intervalo_sin_hora_y_cero_no_se_interpretan_como_todo_el_dia(self):
        registro = normalizar(ficha(data={'dataInicio': '2026-10-26', 'dataFin': '2027-01-01'}), 'gl')
        self.assertEqual(registro['datos']['cuando']['precision'], 'dia')
        self.assertEqual(registro['datos']['cuando']['fin'], '2027-01-01')
        registro = normalizar(ficha(data={'dataInicio': '2026-10-26 00:00:00'}), 'gl')
        self.assertIn('hora_cero_sin_confirmar', registro['datos']['cuando']['avisos'])

    def test_horas_ambiguas_o_inexistentes_no_inventan_instante(self):
        for fecha, aviso in [('2026-10-25 02:30:00', 'hora_local_ambigua'),
                             ('2026-03-29 02:30:00', 'hora_local_inexistente')]:
            with self.subTest(fecha=fecha):
                registro = normalizar(ficha(data={'dataInicio': fecha}), 'gl')
                self.assertIsNone(registro['datos']['cuando']['inicio'])
                self.assertIn(aviso, registro['datos']['cuando']['avisos'])
                self.assertEqual(registro['original']['data']['dataInicio'], fecha)

    def test_fin_exclusivo_de_un_intervalo_de_dias_se_preserva(self):
        registro = normalizar(ficha(data={'dataInicio': '2026-10-26', 'dataFin': '2026-10-28'}), 'gl')
        registro['datos']['cuando']['fin_exclusivo'] = True
        calendario = integrar(None, [registro], FUENTES, AHORA)
        cuando = calendario['eventos'][0]['cuando']
        self.assertEqual(cuando['fin'], '2026-10-28')
        self.assertTrue(cuando['fin_exclusivo'])

    def test_intervalo_invertido_no_sustituye_calendario(self):
        with tempfile.TemporaryDirectory() as carpeta:
            entrada = Path(carpeta) / 'pagina.json'
            salida = Path(carpeta) / 'calendario.json'
            salida.write_text('ultimo bueno', encoding='utf-8')
            entrada.write_text(json.dumps({'totalResultados': 1, 'listaAxenda': [ficha(
                data={'dataInicio': '2026-10-27 18:00:00', 'dataFin': '2026-10-26 18:00:00'})]}))
            with self.assertRaisesRegex(ValueError, 'Fin anterior'):
                main(['--entrada', str(entrada), '--salida', str(salida)])
            self.assertEqual(salida.read_text(), 'ultimo bueno')


class Paginacion(unittest.TestCase):
    def test_recorre_paginas_y_solicita_campos_identidad(self):
        urls = []
        def descargar(url):
            urls.append(url)
            pagina = int(parse_qs(urlparse(url).query)['paxina'][0])
            return {'listaAxenda': [ficha(101 if pagina == 0 else 201)], 'totalResultados': 2}
        registros = recoger('2026-10-24', '2026-11-23', descargar=descargar, limite=1)
        self.assertEqual([r['id_externo'] for r in registros], ['101', '201'])
        params = parse_qs(urlparse(urls[0]).query)
        self.assertIn('traducionId', params['campos'][0])
        self.assertEqual(params['fin'], ['2026-11-23'])

    def test_vacio_real_frente_a_respuestas_incompletas_y_errores(self):
        self.assertEqual(recoger('2026-10-24', '2026-11-23',
            descargar=lambda _: {'listaAxenda': [], 'totalResultados': 0}), [])
        for payload in [{'listaAxenda': [], 'totalResultados': 2}, {'error': '41'},
                        {'listaAxenda': [], 'totalResultados': '2'}]:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                recoger('2026-10-24', '2026-11-23', descargar=lambda _: payload)

    def test_paginas_repetidas_total_cambiante_y_limite_abortan(self):
        for segundo in [
            {'listaAxenda': [ficha()], 'totalResultados': 2},
            {'listaAxenda': [ficha(201)], 'totalResultados': 3},
        ]:
            paginas = iter([{'listaAxenda': [ficha()], 'totalResultados': 2}, segundo])
            with self.subTest(segundo=segundo), self.assertRaises(ValueError):
                recoger('2026-10-24', '2026-11-23', descargar=lambda _: next(paginas), limite=1)
        with self.assertRaisesRegex(ValueError, 'límite de páginas'):
            recoger('2026-10-24', '2026-11-23', max_paginas=1,
                    descargar=lambda _: {'listaAxenda': [ficha()], 'totalResultados': 2})

    def test_fallo_de_una_fuente_no_reemplaza_ultima_salida(self):
        with tempfile.TemporaryDirectory() as carpeta:
            salida = Path(carpeta) / 'calendario.json'
            salida.write_text('ultimo bueno', encoding='utf-8')
            with patch('calendario.recoger', side_effect=TimeoutError('sin respuesta')):
                with self.assertRaises(TimeoutError):
                    main(['--inicio', '2026-10-24', '--fin', '2026-11-23', '--salida', str(salida)])
            self.assertEqual(salida.read_text(), 'ultimo bueno')


if __name__ == '__main__':
    unittest.main()
