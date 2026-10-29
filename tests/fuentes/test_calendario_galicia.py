"""Transición de Galicia: IDs del piloto, gallego y evidencia de los filtros."""

from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from agenda import almacen, almacen_nucleo, clasificador, cultura_galicia as galicia, nucleo, presencia, recogida
from agenda.compactar import compactar
from agenda.modelo import integrar
from agenda.publicacion import proyectar
from agenda.transicion import ampliar
from calendario import main
from test_agenda import AHORA, DESPUES, construir, ficha


def fila(**cambios):
    return ficha(tipoEvento={'tid': 7, 'nome': 'Concerto'},
                 tipoPublico=[{'tid': 29, 'nome': 'Público infantil'}],
                 tipoEntrada=[{'tid': 71, 'nome': 'Entrada de balde'},
                              {'tid': 120, 'nome': 'Inscrición previa'}], **cambios)


class Transicion(unittest.TestCase):
    def test_conserva_todas_las_referencias_y_clases_del_piloto(self):
        anterior = ampliar(construir([fila()]))['nucleo']
        cambio = fila(titulo='Un concerto revisado',
                      data={'dataInicio': '2026-11-03 19:00:00', 'dataFin': None})
        nuevo = galicia.importar(anterior, [cambio], DESPUES)
        self.assertEqual(anterior['referencias'], nuevo['referencias'])
        self.assertEqual(anterior['entidades'].keys(), nuevo['entidades'].keys())
        self.assertTrue(almacen_nucleo.planificar(anterior, nuevo))
        evento = proyectar(nuevo)['eventos'][0]
        self.assertEqual(evento['programacion']['valor']['cuando']['inicio']['fecha'], '2026-11-03')
        self.assertEqual(evento['temas'], ['musica'])
        self.assertEqual(evento['formatos'], ['concierto'])
        self.assertEqual(evento['publico'], ['infancia'])
        self.assertEqual(evento['precio'], 'gratis')
        self.assertEqual(evento['acceso'], ['con-inscripcion'])
        self.assertEqual(evento['enlaces'], [cambio['url']])
        self.assertTrue(any(k.startswith('actividad:') for k in evento['objetivos']))

    def test_fuente_nueva_reproduce_el_id_del_piloto_y_su_alias(self):
        piloto = construir([fila()])
        n = galicia.importar(None, [fila()], AHORA)
        self.assertEqual(n['referencias']['cultura-galicia:101']['destino']['id'], piloto['eventos'][0]['id'])
        self.assertEqual(n['referencias']['cultura-galicia:101']['destino'],
                         n['referencias']['cultura-galicia:102']['destino'])
        self.assertFalse(any(e['temas'] for e in n['entidades'].values()))

    def test_preparar_y_reclasificar_no_reponen_observaciones_del_piloto(self):
        calendario = ampliar(construir([fila()]))
        calendario['nucleo'] = galicia.importar(calendario['nucleo'], [fila(titulo='Nuevo')], DESPUES)
        antes = compactar(calendario['nucleo'])
        calendario['nucleo'] = antes
        nuevo = compactar(ampliar(calendario)['nucleo'])
        self.assertEqual(nuevo, antes)
        with self.assertRaisesRegex(ValueError, '--recoger-cultura'):
            integrar(calendario, [galicia.normalizar(fila(), 'gl')], galicia.FUENTES, DESPUES)

    def test_alias_castellano_guardado_no_cambia_horario_ni_obra(self):
        es = ficha(102, traducionId=101, nid=11, idioma='es', titulo='Otra traducción',
                   data={'dataInicio': '2026-10-26 19:00:00', 'dataFin': None})
        anterior = ampliar(construir([fila(), es]))['nucleo']
        nuevo = galicia.importar(anterior, [fila()], DESPUES)
        self.assertEqual(anterior['referencias'], nuevo['referencias'])
        evento = proyectar(nuevo)['eventos'][0]
        self.assertFalse(evento['programacion']['conflicto'])
        self.assertEqual(evento['programacion']['valor']['cuando']['inicio']['hora_local'], '18:00:00')
        obras = [k for k in evento['objetivos'] if k.startswith('actividad:')]
        self.assertEqual(obras, ['actividad:cultura-galicia:ficha:10'])
        self.assertEqual([f['referencia'] for f in evento['fuentes']], ['cultura-galicia:101'])
        # El título castellano del piloto se queda en el núcleo, sin publicarse.
        self.assertEqual(nuevo['entidades'][nucleo.clave(nuevo['referencias']['cultura-galicia:101']['destino'])]
                         ['nombres']['es'], 'Otra traducción')
        self.assertEqual(list(evento['nombres']), ['gl'])

    def test_dos_ids_previos_no_se_fusionan_y_no_se_admite_importar_castellano(self):
        separado = ampliar(construir([ficha(traducionId=None), ficha(102, traducionId=None)]))['nucleo']
        with self.assertRaisesRegex(ValueError, 'ya separados'):
            galicia.importar(separado, [fila()], DESPUES)
        with self.assertRaisesRegex(ValueError, 'gallego'):
            galicia.importar(None, [fila(idioma='es')], AHORA)

    def test_repeticion_ausencia_y_correccion_editorial_se_conservan(self):
        n = galicia.importar(None, [fila()], AHORA)
        self.assertEqual(galicia.importar(n, [fila()], AHORA), n)
        b = galicia.importar(n, [fila()], DESPUES)
        self.assertEqual(n['documentos'], b['documentos'])
        self.assertEqual(n['observaciones'].keys(), b['observaciones'].keys())
        self.assertEqual(len(proyectar(galicia.importar(b, [], DESPUES))['eventos']), 1)
        self.assertNotIn(galicia.FUENTE, presencia.TIPOS)
        s = next(s for s in n['selecciones'].values() if s['bloque'] == 'programacion')
        n['politicas'][s['id']] = {'id': s['id'], 'objetivo': s['objetivo'], 'bloque': 'programacion',
            'modo': 'editorial', 'seleccion': deepcopy(s['seleccion']), 'motivo': 'Corrección revisada',
            'decision': 'Caso de prueba: horario revisado'}
        nucleo.recalcular_selecciones(n)
        nuevo = galicia.importar(n, [fila()], DESPUES)
        self.assertEqual(n['politicas'], nuevo['politicas'])


class Recogida(unittest.TestCase):
    def test_solo_gallego_con_publico_y_entrada_sin_inventario_global(self):
        with patch('agenda.recogida.descargar', return_value=json.dumps(
                {'listaAxenda': [fila()], 'totalResultados': 1})) as descargar:
            filas, _, ids = recogida.cultura(galicia.FUENTE, '2026-10-28', '2026-11-27')
        self.assertIsNone(ids)
        self.assertEqual(filas, [fila()])
        params = parse_qs(urlsplit(descargar.call_args.args[0]).query)
        self.assertEqual(params['idioma'], ['gl'])
        self.assertTrue({'tipoPublico', 'tipoEntrada'} <= set(params['campos'][0].split(',')))

    def test_recogida_incompleta_no_guarda_ni_cambia_el_piloto(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / 'agenda.sqlite'
            piloto = construir([fila()])
            with almacen.abrir(db) as base:
                almacen.guardar(base, piloto)
            paginas = [json.dumps({'listaAxenda': [fila()], 'totalResultados': 2}),
                       json.dumps({'listaAxenda': [], 'totalResultados': 2})]
            with patch('agenda.recogida.descargar', side_effect=paginas):
                with self.assertRaisesRegex(ValueError, 'Página vacía'):
                    main(['--db', str(db), '--recoger-cultura', galicia.FUENTE])
            with almacen.abrir(db) as base:
                self.assertEqual(almacen.cargar(base), piloto)

    def test_cli_guarda_solo_el_nucleo_y_sobrevive_a_otra_preparacion(self):
        with tempfile.TemporaryDirectory() as tmp:
            db, entrada = Path(tmp) / 'agenda.sqlite', Path(tmp) / 'galicia.json'
            piloto = construir([fila()])
            with almacen.abrir(db) as base:
                almacen.guardar(base, piloto)
            entrada.write_text(json.dumps([fila(titulo='Título actual')]))
            main(['--db', str(db), '--entrada-cultura-galicia', str(entrada)])
            main(['--db', str(db), '--preparar-nucleo'])
            with almacen.abrir(db) as base:
                guardado = almacen.cargar(base)
            self.assertEqual({k: v for k, v in guardado.items() if k != 'nucleo'}, piloto)
            self.assertEqual(proyectar(guardado['nucleo'])['eventos'][0]['nombres']['gl'], 'Título actual')


class Clasificacion(unittest.TestCase):
    def test_entrada_ausente_o_inscripcion_no_implican_pago_ni_gratuidad(self):
        for entradas, precio, acceso in (([], None, []), ([{'tid': 120}], None, ['con-inscripcion']),
                                         ([{'tid': 71}], 'gratis', [])):
            r = clasificador.clasificar(galicia.FUENTE, [{'origen': {'tipoEntrada': entradas}}])
            self.assertEqual((r['precio'], r['acceso']), (precio, acceso))

    def test_vocabulario_revisado_sin_deducir_temas_del_titulo(self):
        casos = {13: (['cultura'], ['representacion']), 20: ([], ['proyeccion']),
                 551: ([], ['fiesta']), 5: (['cultura'], ['exposicion']),
                 4: (['artes-visuales'], ['exposicion']), 70: ([], [])}
        for tid, esperado in casos.items():
            r = clasificador.clasificar(galicia.FUENTE, [{'tipo_original': {'tid': tid},
                'nombres': {'gl': 'Cine, música, ciencia e patrimonio'}}])
            self.assertEqual((r['temas'], r['formatos']), esperado)
            self.assertEqual(r['sin_revisar'], [])
        r = clasificador.clasificar(galicia.FUENTE, [{'tipo_original': {'tid': 9999}}])
        self.assertEqual(r['sin_revisar'], [('tipoEvento', '9999')])


if __name__ == '__main__':
    unittest.main()
