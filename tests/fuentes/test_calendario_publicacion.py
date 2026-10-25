"""Lectura pública, circuitos y recogidas deportivas; sin red."""

from copy import deepcopy
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from agenda import espn_tenis, feb, nucleo, recogida
from agenda.feb_html import catalogo, leer
from agenda.publicacion import main as publicar, proyectar, subir
from agenda.revision import main as revisar_guardado
from agenda.transicion import ampliar
from agenda.turso_lotes import ClienteCalendario
from turso_http import ErrorTurso
from test_agenda import construir, ficha
from test_calendario_turso import Servidor


MUESTRAS = Path(__file__).with_name('muestras_calendario')
AHORA = '2026-10-25T12:00:00+01:00'
LUEGO = '2026-10-26T12:00:00+01:00'


def tenis():
    return json.loads((MUESTRAS / 'espn-wta.json').read_text())


def html_feb():
    return leer((MUESTRAS / 'feb-calendario.html').read_text(),
                (MUESTRAS / 'feb-resultados.html').read_text(), '2026',
                'https://baloncestoenvivo.feb.es/calendario/4/2026',
                'https://baloncestoenvivo.feb.es/resultados/4/2026')


class Lectura(unittest.TestCase):
    def test_publicacion_directa_desde_turso_sin_archivos_intermedios(self):
        calendario = ampliar(construir([ficha()]))
        with patch('agenda.turso.Almacen') as remoto, patch('agenda.publicacion.subir') as subir_lectura, patch('calendario.guardar') as archivo:
            remoto.return_value.cargar.return_value = calendario
            publicar(['--turso', '--fuentes', 'cultura-galicia', '--publicar'])
            remoto.return_value.cargar.assert_called_once_with()
            subir_lectura.assert_called_once()
            self.assertEqual(len(subir_lectura.call_args.args[0]['eventos']), 1)
            self.assertFalse(subir_lectura.call_args.args[0]['revision'])
            archivo.assert_not_called()

    def test_objetivos_publicos_coinciden_con_consultas_del_nucleo_y_ambitos_de_pareja(self):
        n = espn_tenis.importar(None, tenis(), 'wta', AHORA)
        n = feb.importar(n, html_feb(), AHORA)
        pareja = next(e for e in n['entidades'].values() if e['clase'] == 'pareja')
        # La misma pareja puede aparecer fuera del encuentro que acredita sus integrantes.
        c = nucleo.Constructor(n)
        doc = next(d['id'] for d in n['documentos'].values() if d['fuente'] == 'espn-wta')
        extra, ev = c.entidad('espn-wta', 'prueba_ambito', 'fuera', {}, 'evento', 'encuentro',
            {'es': 'Encuentro fuera del ámbito acreditado'}, doc, '/prueba', AHORA)
        c.participar(extra, 'local', nucleo.objetivo('participante', pareja['id']), 'Pareja', 'local', ev)
        n = c.terminar()
        p = proyectar(n)
        for k, e in n['entidades'].items():
            if e['tipo'] not in ('agrupacion', 'actividad', 'participante'):
                continue
            esperado = set(nucleo.eventos_alcanzados(n, nucleo.objetivo(e['tipo'], e['id'])))
            observado = {ev['id'] for ev in p['eventos'] if k in ev['objetivos']}
            self.assertEqual(observado, esperado, (e['clase'], e['nombres']))
        self.assertNotIn('espn-wta', json.dumps(proyectar(n, ['feb'])))

    def test_una_hora_cero_con_aviso_no_se_muestra_como_confirmada(self):
        c = construir([ficha(data={'dataInicio': '2026-10-26 00:00:00', 'dataFin': None})])
        p = proyectar(ampliar(c)['nucleo'])
        self.assertEqual(p['eventos'][0]['programacion']['valor']['cuando']['inicio']['certeza_hora'], 'provisional')

    def test_resultado_que_ya_no_normaliza_la_observacion_actual_no_se_muestra_como_final(self):
        pagina = tenis()
        a = espn_tenis.importar(None, pagina, 'wta', AHORA)
        for e in pagina['events']:
            for g in e['groupings']:
                for m in g['competitions']:
                    m['status']['type']['name'] = 'STATUS_RETIRED'
        b = espn_tenis.importar(a, pagina, 'wta', LUEGO)
        self.assertEqual(len(b['resultados']), len(a['resultados']))
        self.assertFalse(any(e['resultado'] for e in proyectar(b)['eventos']))

    def test_circuitos_torneos_y_clasificacion_sin_perder_ids_ni_originales(self):
        n = ampliar(construir([ficha()]))['nucleo']
        n = espn_tenis.importar(n, tenis(), 'wta', AHORA)
        n = feb.importar(n, html_feb(), AHORA)
        previo = deepcopy(n)
        p = proyectar(n, generado=AHORA)
        self.assertEqual(n, previo)
        self.assertEqual(len(p['eventos']), 7)
        self.assertEqual(len(p['clasificaciones']), 1)
        circuito = next(e for e in p['entidades'].values() if e['codigos'] == ['wta'])
        self.assertEqual(circuito['clase'], 'circuito')
        partidos = nucleo.eventos_alcanzados(n, nucleo.objetivo('agrupacion', circuito['id']))
        self.assertEqual(len(partidos), 3)
        self.assertTrue(all('agrupacion:' + circuito['id'] in e['objetivos']
                            for e in p['eventos'] if e['id'] in partidos))
        self.assertNotIn('documentos', p)
        self.assertNotIn('observaciones', p)
        self.assertTrue(p['revision'])

    def test_publicar_fuente_explicita_no_filtra_solo_los_eventos(self):
        n = ampliar(construir([ficha()]))['nucleo']
        n = espn_tenis.importar(n, tenis(), 'wta', AHORA)
        p = proyectar(n, ['cultura-galicia'], AHORA)
        self.assertFalse(p['revision'])
        self.assertEqual(len(p['eventos']), 1)
        self.assertNotIn('espn-wta', json.dumps(p))
        self.assertFalse(any(e['codigos'] for e in p['entidades'].values()))
        with self.assertRaisesRegex(ValueError, 'desconocidas'):
            proyectar(n, ['no-existe'])
        with self.assertRaisesRegex(ValueError, 'revisión completa'):
            subir(proyectar(n))

    def test_actualizar_un_encuentro_no_reobserva_los_demas_desde_otro_documento(self):
        pagina = tenis()
        a = espn_tenis.importar(None, pagina, 'wta', AHORA)
        pagina['events'][0]['groupings'][0]['competitions'][0]['status']['type']['detail'] = 'Dato corregido'
        b = espn_tenis.importar(a, pagina, 'wta', LUEGO)
        self.assertLessEqual(len(b['documentos']) - len(a['documentos']), 1)
        self.assertEqual({e['id'] for e in a['entidades'].values()}, {e['id'] for e in b['entidades'].values()})

    def test_tbd_individual_y_pareja_no_crean_participantes_ficticios(self):
        pagina = tenis()
        partidos = [m for e in pagina['events'] for g in e['groupings'] for m in g['competitions']]
        for m in partidos:
            p = m['competitors'][0]
            if p['type'] == 'athlete':
                p.update(id='-3', uid='s:850~l:900~a:-3', athlete={'displayName': 'TBD'})
            else:
                p.update(id='-3--4', uid='s:850~l:900~t:-3--4',
                         roster={'displayName': 'TBD / TBD', 'athletes': [{'displayName': 'TBD'}] * 2})
            m['status']['type']['name'] = 'STATUS_SCHEDULED'
        n = espn_tenis.importar(None, pagina, 'wta', AHORA)
        pendientes = [p for p in n['participaciones'].values() if p['literal'].startswith('TBD')]
        self.assertEqual(len(pendientes), 3)
        self.assertTrue(all(p['participante'] is None for p in pendientes))


class RecolectorFEB(unittest.TestCase):
    def test_cli_selecciona_competicion_sin_recorrer_fichas(self):
        from calendario import main
        m = leer(*[(MUESTRAS / f'feb-primera-{tipo}.html').read_text()
                   for tipo in ('calendario', 'resultados')], '2026', 'calendario', 'resultados', '1')
        with patch('agenda.turso.Almacen') as remoto, patch('agenda.recogida.feb', return_value=m) as recoger:
            remoto.return_value.cargar.return_value = ampliar(construir([ficha()]))
            main(['--turso', '--recoger-deporte', 'feb', '--temporada-feb', '2026', '--competicion-feb', '1'])
            recoger.assert_called_once_with('2026', '1')
            guardado = remoto.return_value.guardar.call_args.args[0]['nucleo']
            self.assertEqual(len(proyectar(guardado, ['feb'])['eventos']), 3)

    def test_otras_ligas_contrastadas_y_catalogo_anunciado_son_distintos(self):
        for nombre, codigo in (('primera', '1'), ('challenge', '67')):
            c, r = [(MUESTRAS / f'feb-{nombre}-{tipo}.html').read_text()
                    for tipo in ('calendario', 'resultados')]
            m = leer(c, r, '2026', 'calendario', 'resultados', codigo)
            self.assertEqual(m['competicion']['id'], codigo)
            self.assertEqual(len(m['partidos']), 3)
            n = feb.importar(None, m, AHORA)
            eventos = proyectar(n, ['feb'])['eventos']
            self.assertEqual(len(eventos), 3)
            self.assertEqual({e['enlaces'][0] for e in eventos}, {
                f'https://baloncestoenvivo.feb.es/partido/{p["id"]}' for p in m['partidos']})
            with patch('agenda.recogida.descargar', side_effect=[c, r]) as descargar:
                self.assertEqual(recogida.feb('2026', codigo)['competicion']['id'], codigo)
                self.assertEqual(descargar.call_count, 2)
            with self.assertRaisesRegex(ValueError, 'cabecera'):
                leer(c, r, '2026', 'calendario', 'resultados', '4')
        inventario = catalogo((MUESTRAS / 'feb-junior-catalogo.html').read_text())
        self.assertEqual(len(inventario['competiciones']), 24)
        self.assertEqual(len(inventario['fases']), 11)
        self.assertEqual(sum(f['seleccionado'] for f in inventario['fases']), 1)
        self.assertFalse(next(c for c in inventario['competiciones'] if c['id'] == '21')['lector_contrastado'])
        with self.assertRaisesRegex(ValueError, 'no contrastada'):
            leer('', '', '2025', '', '', '21')

    def test_feb_pasa_por_revision_comun_desde_turso_sin_escribir(self):
        n = feb.importar(None, html_feb(), AHORA)
        with patch('agenda.turso.Almacen') as remoto, patch('sys.stdout', new_callable=io.StringIO) as salida:
            remoto.return_value.cargar.return_value = {'nucleo': n}
            revisar_guardado(['--turso', '--fuentes', 'feb'])
            informe = json.loads(salida.getvalue())
            self.assertEqual(informe['fuentes'], {'feb': {
                'eventos': 3, 'temas': {'clasificados': 3, 'pendientes': 0},
                'ubicacion': {'pendiente': 3}}})
            self.assertEqual(remoto.return_value.method_calls, [unittest.mock.call.cargar()])
        with patch('agenda.turso.Almacen') as remoto:
            remoto.return_value.cargar.return_value = None
            with self.assertRaisesRegex(ValueError, 'Preparar el núcleo'):
                revisar_guardado(['--turso'])

    def test_html_retiene_identidad_fechas_marcadores_y_tabla(self):
        m = html_feb()
        n = feb.importar(None, m, AHORA)
        self.assertEqual(len(m['partidos']), 3)
        self.assertEqual(m['clasificacion']['filas'][0]['metricas']['baloncesto.porcentaje_victorias'], '100.0')
        pendientes = [p for p in m['partidos'] if p['id'] == '2522809']
        self.assertIsNone(pendientes[0]['marcador_resultados'])
        self.assertEqual(len(n['resultados']), 1)
        self.assertEqual(next(iter(n['clasificaciones'].values()))['alcance'], 'tabla_observada')
        self.assertTrue(all(s['seleccion']['valor']['cuando']['inicio']['instante'] is None
                            for s in n['selecciones'].values() if s['bloque'] == 'programacion'))

    def test_cambios_de_estructura_o_temporada_no_importan_parcialmente(self):
        c, r = ((MUESTRAS / f'feb-{s}.html').read_text() for s in ('calendario','resultados'))
        with self.assertRaisesRegex(ValueError, 'temporada'):
            leer(c, r, '2025', 'https://ejemplo', 'https://ejemplo')
        with self.assertRaisesRegex(ValueError, 'estructura'):
            leer(c.replace('Local</th>', 'Casa</th>'), r, '2026', 'https://ejemplo', 'https://ejemplo')
        with self.assertRaisesRegex(ValueError, 'sin tablas'):
            leer(c.replace('DataGrid3', 'OtraTabla'), r, '2026', 'https://ejemplo', 'https://ejemplo')

    def test_descarga_limite_y_dos_paginas_por_temporada(self):
        with patch('agenda.recogida.urlopen', return_value=io.BytesIO(b'x' * 11)), patch.object(recogida, 'MAX_BYTES', 10):
            with self.assertRaisesRegex(ValueError, 'demasiado grande'):
                recogida.descargar('https://ejemplo')
        respuestas = [(MUESTRAS / f'feb-{s}.html').read_text() for s in ('calendario','resultados')]
        with patch('agenda.recogida.descargar', side_effect=respuestas) as descargar:
            self.assertEqual(len(recogida.feb('2026')['partidos']), 3)
            self.assertEqual(descargar.call_count, 2)


class TransaccionesGrandes(unittest.TestCase):
    def setUp(self):
        self.servidor = Servidor()
        self.addCleanup(self.servidor.db.close)
        self.parche = patch('turso_http.urlopen', self.servidor.abrir)
        self.parche.start(); self.addCleanup(self.parche.stop)
        self.cliente = ClienteCalendario('libsql://agenda.test', 'simulado')
        self.cliente.MAX_ENVIO = 6000
        self.servidor.db.execute('CREATE TABLE prueba (id INTEGER PRIMARY KEY, dato TEXT)')

    def sentencias(self):
        return [('INSERT INTO prueba VALUES (?,?)', (i, 'x' * 200)) for i in range(40)]

    def test_envios_multiples_conservan_una_sola_transaccion(self):
        self.cliente.transaccion(self.sentencias())
        self.assertGreater(self.servidor.peticiones, 2)
        self.assertEqual(self.servidor.db.execute('SELECT count(*) FROM prueba').fetchone()[0], 40)
        sql = [s for s, _ in self.servidor.consultas]
        self.assertEqual(sql.count('BEGIN IMMEDIATE'), 1)
        self.assertEqual(sql.count('COMMIT'), 1)

    def test_error_en_otro_lote_revierte_todos_los_anteriores(self):
        with self.assertRaises(ErrorTurso):
            self.cliente.transaccion([*self.sentencias(), ('INSERT INTO prueba VALUES (0,?)', ('duplicado',))])
        self.assertEqual(self.servidor.db.execute('SELECT count(*) FROM prueba').fetchone()[0], 0)
        self.assertFalse(self.servidor.db.in_transaction)

    def test_una_sentencia_demasiado_grande_se_rechaza_antes_de_enviar(self):
        with self.assertRaisesRegex(ErrorTurso, 'demasiado grande'):
            self.cliente.transaccion([('INSERT INTO prueba VALUES (1,?)', ('x' * 10000,))])
        self.assertEqual(self.servidor.peticiones, 0)
