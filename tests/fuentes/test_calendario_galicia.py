"""Transición de Galicia: IDs del piloto, gallego y evidencia de los filtros."""

from contextlib import redirect_stdout
from copy import deepcopy
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
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


def detalle(**cambios):
    muestra = Path(__file__).with_name('muestras_calendario') / 'galicia-detalle.json'
    respuesta = json.loads(muestra.read_text())
    respuesta['evento'].update(cambios)
    return respuesta


class Transicion(unittest.TestCase):
    def test_hora_local_ambigua_o_inexistente_conserva_dia_y_texto(self):
        for fecha in ('2026-10-25 02:30:00', '2026-03-29 02:30:00'):
            with self.subTest(fecha=fecha):
                original = fila(data={'dataInicio': fecha, 'dataFin': fecha})
                evento, = proyectar(galicia.importar(None, [original], AHORA))['eventos']
                cuando = evento['programacion']['valor']['cuando']
                self.assertEqual(cuando['inicio']['fecha'], fecha[:10])
                self.assertEqual(cuando['inicio']['precision'], 'fecha')
                self.assertIsNone(cuando['inicio']['hora_local'])
                self.assertIsNone(cuando['inicio']['instante'])
                self.assertEqual(cuando['horario_textual'], fecha)
                self.assertEqual(cuando['fin']['precision'], 'desconocida')

    def test_medianoche_y_fin_igual_conservan_su_tratamiento(self):
        for fecha, certeza in (('2026-11-03 00:00:00', 'provisional'),
                              ('2026-11-03 18:00:00', 'confirmado')):
            with self.subTest(fecha=fecha):
                r = galicia.normalizar(fila(data={'dataInicio': fecha, 'dataFin': fecha}), 'gl')
                cuando = galicia.bloques(r)['programacion']['cuando']
                self.assertEqual(cuando['inicio']['certeza_hora'], certeza)
                self.assertEqual(cuando['fin']['precision'], 'desconocida')
                self.assertIsNone(cuando['fin_exclusivo'])

    def test_solo_hora_del_fin_no_resoluble_conserva_su_dia(self):
        for fecha in ('2026-10-25 02:30:00', '2026-03-29 02:30:00'):
            with self.subTest(fecha=fecha):
                datos = {'dataInicio': '2026-03-01 18:00:00', 'dataFin': fecha}
                r = galicia.normalizar(fila(data=datos, dataOrixinal=datos), 'gl')
                bloques = galicia.bloques(r)
                for cuando in (bloques['programacion']['cuando'], bloques['cuando_original']):
                    self.assertEqual(cuando['inicio']['precision'], 'hora')
                    self.assertEqual(cuando['fin']['fecha'], fecha[:10])
                    self.assertEqual(cuando['fin']['precision'], 'fecha')
                    self.assertIn(fecha, cuando['horario_textual'])

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
        self.assertEqual(ids, {'alcance': 'ids_comprobados', 'presentes': ['101'], 'despublicados': {}})
        self.assertEqual(filas, [fila()])
        params = parse_qs(urlsplit(descargar.call_args.args[0]).query)
        self.assertEqual(params['idioma'], ['gl'])
        self.assertTrue({'tipoPublico', 'tipoEntrada'} <= set(params['campos'][0].split(',')))

    def recoger(self, n, respuesta, filas=()):
        if isinstance(respuesta, HTTPError):
            self.addCleanup(respuesta.close)
        paginas = [json.dumps({'listaAxenda': list(filas), 'totalResultados': len(filas)}),
                   respuesta if isinstance(respuesta, Exception) else json.dumps(respuesta)]
        with patch('agenda.recogida.descargar', side_effect=paginas) as descargar:
            recogidas, url, inventario = recogida.cultura(galicia.FUENTE, '2026-10-26', '2026-10-26',
                                                        galicia.conocidos(n))
        nuevo = galicia.importar(n, recogidas, DESPUES, url)
        return presencia.registrar(nuevo, galicia.FUENTE, inventario, DESPUES, url), descargar, inventario

    def test_conocida_se_traslada_fuera_y_no_se_consulta_el_alias(self):
        es = fila(identificador=102, traducionId=101, idioma='es')
        n = ampliar(construir([fila(), es]))['nucleo']
        nuevo, descargar, inventario = self.recoger(n, detalle())
        self.assertEqual(descargar.call_count, 2)
        url = urlsplit(descargar.call_args.args[0])
        self.assertEqual(url.path, '/v1/axenda/eventos/101.json')
        self.assertEqual(set(parse_qs(url.query)['campos'][0].split(',')),
                         set(galicia.CAMPOS.split(',')) | {'publicar'})
        evento = proyectar(nuevo)['eventos'][0]
        self.assertEqual(evento['programacion']['valor']['cuando']['inicio']['fecha'], '2026-12-05')
        self.assertEqual(nuevo['referencias'], n['referencias'])
        self.assertEqual(inventario['presentes'], ['101'])

    def test_despublicacion_tiene_evidencia_persiste_y_reaparece(self):
        n = galicia.importar(None, [fila(), fila(identificador=201)], AHORA)
        # La segunda cita ya llegó en la ventana; solo falta la 101.
        retirada, descargar, inventario = self.recoger(n, detalle(publicar=0), [fila(identificador=201)])
        self.assertEqual(descargar.call_count, 2)
        self.assertEqual(len(proyectar(retirada)['eventos']), 1)
        self.assertEqual(presencia.referencias_ausentes(retirada),
                         {'cultura-galicia:101', 'cultura-galicia:102'})
        documento = retirada['documentos'][retirada['fuentes'][galicia.FUENTE]['respuesta_completa']['documento']]
        self.assertEqual(documento['contenido']['despublicados']['101']['evento']['publicar'], 0)
        # Los presentes de cada pasada no se guardan: otra ventana no reescribe el documento.
        self.assertNotIn('presentes', documento['contenido'])
        self.assertEqual(retirada['referencias'], n['referencias'])
        # Ni una ventana ajena ni un fallo posterior borran una retirada acreditada.
        for respuesta in ({'alcance': 'ids_comprobados', 'presentes': [], 'despublicados': {}}, inventario,
                          {'alcance': 'ids_comprobados', 'presentes': ['201', '999'], 'despublicados': {}}):
            repetida = presencia.registrar(retirada, galicia.FUENTE, respuesta, DESPUES, galicia.URL)
            self.assertEqual(proyectar(compactar(repetida))['eventos'], proyectar(retirada)['eventos'])
            self.assertEqual(repetida['documentos'], retirada['documentos'])
        fallo, _, _ = self.recoger(retirada, HTTPError(galicia.URL, 404, 'No encontrado', {}, io.BytesIO()),
                                  [fila(identificador=201)])
        self.assertEqual(presencia.referencias_ausentes(fallo), presencia.referencias_ausentes(retirada))
        recuperada, _, _ = self.recoger(retirada, detalle(), [fila(identificador=201)])
        self.assertEqual(len(proyectar(recuperada)['eventos']), 2)
        self.assertEqual(presencia.referencias_ausentes(recuperada), set())
        self.assertEqual(recuperada['referencias'], n['referencias'])

    def test_reaparicion_por_alias_declara_presente_la_misma_celebracion(self):
        n = galicia.importar(None, [fila()], AHORA)
        retirada, _, _ = self.recoger(n, detalle(publicar=0))
        cambio = detalle(id=102, traducionId=101)['evento']
        recuperada, descargar, _ = self.recoger(retirada, {}, [cambio])
        self.assertEqual(descargar.call_count, 1)
        self.assertEqual(presencia.referencias_ausentes(recuperada), set())
        self.assertEqual(len(proyectar(recuperada)['eventos']), 1)

    def test_fallos_de_detalle_no_actualizan_ni_acreditan_ausencia_y_la_ventana_se_importa(self):
        n = galicia.importar(None, [fila()], AHORA)
        sin_fecha = detalle()
        del sin_fecha['evento']['data']
        respuestas = [HTTPError(galicia.URL, 404, 'No encontrado', {}, io.BytesIO()),
                      HTTPError(galicia.URL, 403, 'Prohibido', {}, io.BytesIO()), TimeoutError('Tiempo agotado'),
                      {'erros': [{'codigo': 52, 'mesaxe': 'Evento no encontrado'}]},
                      detalle(idioma='es', publicar=0), detalle(id=999, publicar=0),
                      detalle(publicar=False), detalle(publicar='0'), detalle(publicar=None),
                      {'evento': {'id': 101, 'idioma': 'gl', 'publicar': 0}}, sin_fecha,
                      detalle(data={}, publicar=0), detalle(data={'dataInicio': '2026-10-26'}, publicar=0)]
        for respuesta in respuestas:
            with self.subTest(respuesta=respuesta), redirect_stdout(io.StringIO()) as salida:
                nuevo, _, inventario = self.recoger(n, respuesta, [fila(identificador=201)])
                self.assertIn('::warning::', salida.getvalue())
                self.assertEqual(inventario, {'alcance': 'ids_comprobados', 'presentes': ['201'], 'despublicados': {}})
                self.assertEqual(len(proyectar(nuevo)['eventos']), 2)
                self.assertEqual(presencia.referencias_ausentes(nuevo), set())
                anteriores = {i: o for i, o in nuevo['observaciones'].items()
                              if o['referencia'] == 'cultura-galicia:101'}
                self.assertEqual(anteriores, {i: o for i, o in n['observaciones'].items()
                                             if o['referencia'] == 'cultura-galicia:101'})

    def test_fuera_de_ventana_o_ya_recibida_no_se_consulta_sin_fecha_si(self):
        casos = [(fila(data={'dataInicio': '2026-12-05', 'dataFin': None}), [], 1),
                 (fila(data={'dataInicio': '2026-09-05', 'dataFin': None}), [], 1),
                 (fila(), [fila()], 1), (fila(data={}), [], 2),
                 (fila(data={'dataInicio': '2026-10-01', 'dataFin': '2026-11-01'}), [], 2)]
        for conocida, ventana, consultas in casos:
            with self.subTest(conocida=conocida):
                n = galicia.importar(None, [conocida], AHORA)
                _, descargar, inventario = self.recoger(n, detalle(), ventana)
                self.assertEqual(descargar.call_count, consultas)
                self.assertFalse(inventario['despublicados'])

    def test_inventario_acotado_rechaza_evidencia_y_alcance_invalidos(self):
        n = galicia.importar(None, [fila()], AHORA)
        retirada, _, inventario = self.recoger(n, detalle(publicar=0))
        for campo, valor in (('publicar', False), ('idioma', 'es'), ('id', 102)):
            malo = deepcopy(inventario)
            malo['despublicados']['101']['evento'][campo] = valor
            with self.assertRaisesRegex(ValueError, 'acotado inválido'):
                presencia.registrar(n, galicia.FUENTE, malo, DESPUES, galicia.URL)
        mala = deepcopy(retirada)
        documento = mala['fuentes'][galicia.FUENTE]['respuesta_completa']['documento']
        mala['documentos'][documento]['contenido']['alcance'] = 'global'
        with self.assertRaisesRegex(ValueError, 'acotado acreditado'):
            presencia.validar(mala)
        with self.assertRaisesRegex(ValueError, 'anterior'):
            presencia.registrar(retirada, galicia.FUENTE, inventario, AHORA, galicia.URL)

    def test_cli_revalida_con_fecha_del_nucleo_y_guarda_la_retirada(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / 'agenda.sqlite'
            piloto = construir([fila()])
            with almacen.abrir(db) as base:
                almacen.guardar(base, piloto)
            args = ['--db', str(db), '--recoger-cultura', galicia.FUENTE,
                    '--inicio', '2026-10-26', '--fin', '2026-10-26']
            for respuesta in (detalle(), detalle(publicar=0)):
                # Trasladada fuera: ampliar la ventana para volver a esperar su fecha.
                if respuesta['evento']['publicar'] == 0:
                    args[-3], args[-1] = '2026-12-05', '2026-12-05'
                with patch('agenda.recogida.descargar', side_effect=[
                        json.dumps({'listaAxenda': [], 'totalResultados': 0}), json.dumps(respuesta)]) as descargar:
                    main(args)
                self.assertEqual(descargar.call_count, 2)
                with almacen.abrir(db) as base:
                    guardado = almacen.cargar(base)
                    self.assertEqual(base.execute('PRAGMA foreign_key_check').fetchall(), [])
                self.assertEqual({k: v for k, v in guardado.items() if k != 'nucleo'}, piloto)
                self.assertEqual(len(proyectar(guardado['nucleo'])['eventos']), respuesta['evento']['publicar'])

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
