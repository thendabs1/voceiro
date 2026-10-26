"""Agenda de las doce colecciones: identidad, evidencia, SQL y errores sin red."""

from contextlib import closing
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import io
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from zoneinfo import ZoneInfo

from agenda import almacen, deportes, espn, espn_tenis, lectura, motogp, nucleo, publicacion, recogida, tiempos
from agenda.transicion import ampliar
from calendario import main
from test_agenda import construir, ficha


MUESTRAS = Path(__file__).with_name('muestras_calendario') / 'deportes'
OBSERVADO = '2026-10-26T12:00:00+01:00'
DESPUES = '2026-10-27T12:00:00+01:00'


def muestra(coleccion):
    return json.loads((MUESTRAS / (coleccion + '.json')).read_text())


def importar(coleccion, datos=None, anterior=None, observado=OBSERVADO, url=None):
    return deportes.importar(anterior, coleccion, muestra(coleccion) if datos is None else datos,
                             observado, url=url)


def cambiar_dinamicos(dato, coleccion):
    if isinstance(dato, list):
        for v in dato:
            cambiar_dinamicos(v, coleccion)
    elif isinstance(dato, dict):
        for k, v in list(dato.items()):
            if k == 'status':
                if isinstance(v, dict):
                    v['type'] = {'name': 'STATUS_FINAL', 'completed': True}
                    v['clock'] = 9000
                else:
                    dato[k] = 'completed' if coleccion == 'ocblacktop-wrc' else 'FINISHED'
            else:
                cambiar_dinamicos(v, coleccion)
        dato.update(score=999, winner=True, linescores=[999], statistics={'sentinela': 'no guardar'})
        if 'marcador_resultados' in dato:
            dato['marcador_resultados'] = [999, 998]
        if 'cuartos' in dato:
            dato['cuartos'] = [[999, 998]]


def mover_fechas(dato, zona=None):
    if isinstance(dato, list):
        for v in dato:
            mover_fechas(v, zona)
    elif isinstance(dato, dict):
        calendario = dato.get('calendar')
        if isinstance(calendario, dict) and calendario.get('timeZone'):
            zona = ZoneInfo(calendario['timeZone'])
        for k, v in list(dato.items()):
            if k == 'fecha_hora' and v:
                dato[k] = (datetime.strptime(v, '%d/%m/%Y - %H:%M') + timedelta(days=7)).strftime('%d/%m/%Y - %H:%M')
            elif k in ('date', 'startDate', 'endDate', 'date_start', 'date_end', 'dateStart', 'dateEnd') and v:
                d = datetime.fromisoformat(v)
                d = ((d.astimezone(zona) + timedelta(days=7)).astimezone(timezone.utc)
                     if zona and d.tzinfo else d + timedelta(days=7))
                dato[k] = d.date().isoformat() if len(v) == 10 else d.isoformat()
            else:
                mover_fechas(v, zona)


class Adaptadores(unittest.TestCase):
    def test_doce_colecciones_con_publicacion_sin_resultados(self):
        self.assertEqual(len(deportes.COLECCIONES), 12)
        tarjetas = {'feb-endesa': 2, 'feb-primera': 3, 'feb-challenge': 3, 'ocblacktop-wrc': 2}
        for coleccion in deportes.COLECCIONES:
            with self.subTest(coleccion=coleccion):
                entrada = muestra(coleccion)
                copia = deepcopy(entrada)
                n = importar(coleccion, entrada)
                p = publicacion.proyectar(n, list(n['fuentes']), generado=OBSERVADO)
                self.assertEqual(len(p['eventos']), tarjetas.get(coleccion, 1))
                self.assertFalse(n['resultados'])
                self.assertFalse(n['clasificaciones'])
                self.assertEqual(entrada, copia)
                for doc in n['documentos'].values():
                    self.assertEqual(doc['clase'], 'extraccion_agenda')
                    texto = json.dumps(doc['contenido'])
                    for campo in ('"score"', '"linescores"', '"winner"', '"statistics"', '"fragmentos"'):
                        self.assertNotIn(campo, texto)
                for e in p['eventos']:
                    self.assertEqual(e['programacion']['valor']['ejecucion'], 'desconocido')

    def test_marcador_reloj_y_final_no_crean_historial_ni_documentos(self):
        for coleccion in deportes.COLECCIONES:
            with self.subTest(coleccion=coleccion):
                a = importar(coleccion, url='https://ejemplo/scoreboard?dates=20261026')
                otra = muestra(coleccion)
                cambiar_dinamicos(otra, coleccion)
                b = importar(coleccion, otra, a, DESPUES, url='https://ejemplo/scoreboard?dates=20261027')
                self.assertEqual(set(a['observaciones']), set(b['observaciones']))
                for campo in nucleo.COLECCIONES:
                    if campo != 'observaciones':
                        self.assertEqual(a[campo], b[campo], campo)
                for o in b['observaciones'].values():
                    self.assertEqual(o['observado'], OBSERVADO)
                    self.assertEqual(o['ultima_observacion'], DESPUES)

    def test_cambio_de_fecha_conserva_referencias_y_anade_solo_versiones(self):
        for coleccion in deportes.COLECCIONES:
            with self.subTest(coleccion=coleccion):
                a = importar(coleccion)
                otra = muestra(coleccion)
                mover_fechas(otra)
                b = importar(coleccion, otra, a, DESPUES)
                self.assertEqual(a['referencias'], b['referencias'])
                self.assertEqual(set(a['entidades']), set(b['entidades']))
                self.assertTrue(set(a['documentos']) < set(b['documentos']))
                self.assertTrue(set(a['observaciones']) < set(b['observaciones']))
                self.assertFalse(b['resultados'])

    def test_tenis_solo_torneo_fechas_civiles_y_hora_pendiente_sin_calendario(self):
        for coleccion in ('espn-atp', 'espn-wta'):
            n = importar(coleccion)
            self.assertFalse(n['participaciones'])
            self.assertFalse(any(r['tipo_externo'] in ('match_uid', 'grouping') for r in n['referencias'].values()))
            e = publicacion.proyectar(n)['eventos'][0]
            self.assertEqual(e['clase'], 'actividad_continua')
            self.assertEqual(e['programacion']['valor']['cuando']['inicio']['precision'], 'fecha')
            self.assertIsNone(e['programacion']['valor']['cuando']['inicio']['instante'])
            otra = muestra(coleccion)
            del otra['events'][0]['calendar']
            pendiente = publicacion.proyectar(importar(coleccion, otra))['eventos'][0]
            self.assertEqual(pendiente['programacion']['valor']['cuando']['inicio']['precision'], 'desconocida')
        otra = muestra('espn-atp')
        otra['events'][0]['calendar']['endDate'] = '2026-01-01T00:00Z'
        with self.assertRaisesRegex(ValueError, 'Límites'):
            importar('espn-atp', otra)

    def test_nba_temporada_declarada_y_lugar_sin_domicilio_de_equipo(self):
        n = importar('espn-nba')
        self.assertTrue(any(r['tipo_externo'] == 'temporada' and r['id_externo'] == '2027'
                            for r in n['referencias'].values()))
        otra = muestra('espn-nba')
        del otra['events'][0]['competitions'][0]['venue']
        e = publicacion.proyectar(importar('espn-nba', otra))['eventos'][0]
        self.assertIsNone(e['lugar']['valor'])

    def test_equipo_compartido_entre_ligas_por_uid_y_plaza_sin_identidad(self):
        a = importar('espn-primera')
        otra = muestra('espn-segunda')
        b = importar('espn-segunda', otra, a, DESPUES)
        self.assertEqual(sum(e['tipo'] == 'participante' for e in b['entidades'].values()), 2)
        del otra['events'][0]['competitions'][0]['competitors'][0]['team']['uid']
        c = importar('espn-segunda', otra)
        self.assertEqual(sum(p['participante'] is None for p in c['participaciones'].values()), 1)

    def test_gp_principal_con_sesiones_y_programa_antes_de_conteos(self):
        for coleccion, cuenta in [('espn-f1', 5), ('motogp', 8)]:
            n = importar(coleccion)
            p = publicacion.proyectar(n, list(n['fuentes']), generado=OBSERVADO)
            self.assertEqual(len(p['eventos']), 1)
            gp = p['eventos'][0]
            self.assertEqual(len(gp['programa']), cuenta)
            self.assertEqual(sum(e['tipo'] == 'evento' for e in n['entidades'].values()), cuenta + 1)
            for s in gp['programa']:
                self.assertIn('evento:' + s['id'], gp['objetivos'])
                self.assertEqual(s['agenda']['principal']['id'], gp['id'])
                self.assertTrue(s['fuentes'])
            preparada = lectura.preparar(p)
            self.assertEqual(len(preparada['eventos']), 1)
            self.assertIn(' qualifying ' if coleccion == 'motogp' else ' fp1 ', preparada['eventos'][0][1])
            for s in gp['programa']:
                self.assertIn([gp['id'], 'objetivo', 'evento:' + s['id']], preparada['facetas'])

    def test_motogp_fin_igual_desconocido_y_solo_categoria_motogp(self):
        n = importar('motogp')
        gp = publicacion.proyectar(n)['eventos'][0]
        carrera = next(s for s in gp['programa'] if s['agenda']['tipo_sesion'] == 'RAC')
        self.assertEqual(carrera['programacion']['valor']['cuando']['inicio']['instante'], '2026-11-01T15:00:00+08:00')
        self.assertEqual(carrera['programacion']['valor']['cuando']['fin']['precision'], 'desconocida')
        self.assertTrue(all('Moto2' not in s['nombres']['und'] for s in gp['programa']))
        otra = muestra('motogp')
        otra['broadcasts'] = []
        otra['show_in_calendar'] = False
        p = publicacion.proyectar(importar('motogp', otra))
        self.assertEqual(len(p['eventos']), 1)
        self.assertNotIn('programa', p['eventos'][0])

    def test_wrc_intervalo_incluye_ultimo_dia_sin_inventar_horas(self):
        p = publicacion.proyectar(importar('ocblacktop-wrc'))
        e = next(e for e in p['eventos'] if 'Monte Carlo' in e['nombres']['und'])
        cuando = e['programacion']['valor']['cuando']
        self.assertTrue(tiempos.en_intervalo(cuando, '2026-01-25', '2026-01-26'))
        self.assertFalse(tiempos.en_intervalo(cuando, '2026-01-26', '2026-01-27'))
        self.assertIsNone(cuando['inicio']['hora_local'])

    def test_wrc_sin_round_count_es_seleccion_valida_sin_cobertura_completa(self):
        from agenda import proveedores
        pagina = muestra('ocblacktop-wrc')
        self.assertIsNone(pagina['roundCount'])
        alcance = proveedores.describir('ocblacktop-wrc', pagina)
        self.assertTrue(alcance['seleccion_valida'])
        self.assertFalse(alcance['cobertura_completa'])
        pagina['roundCount'] = len(pagina['rallies'])
        self.assertTrue(proveedores.describir('ocblacktop-wrc', pagina)['cobertura_completa'])
        pagina['rallies'][1]['round'] = 3
        hueco = proveedores.describir('ocblacktop-wrc', pagina)
        self.assertFalse(hueco['seleccion_valida'] or hueco['cobertura_completa'])

    def test_feb_conserva_horario_que_desaparece_sin_tomar_fecha_de_jornada(self):
        a = importar('feb-endesa')
        otra = muestra('feb-endesa')
        for p in otra['partidos']:
            p['fecha_hora'] = None
        b = importar('feb-endesa', otra, a, DESPUES)
        self.assertLess(set(a['observaciones']), set(b['observaciones']))
        p = publicacion.proyectar(b)['eventos']
        self.assertTrue(all(e['programacion']['valor']['cuando']['inicio']['fecha'] for e in p))
        self.assertTrue(all(e['programacion']['valor']['cuando']['inicio']['instante'] is None for e in p))
        self.assertTrue(all(e['programacion']['valor']['fecha_conservada']['comprobado'] == OBSERVADO for e in p))

    def test_fuente_de_agenda_no_publica_resultados_de_investigacion_previa(self):
        vieja = json.loads((MUESTRAS.parent / 'espn-wta.json').read_text())
        a = espn_tenis.importar(None, vieja, 'wta', OBSERVADO)
        b = importar('espn-wta', anterior=a, observado=DESPUES)
        self.assertEqual(a['resultados'], b['resultados'])
        p = publicacion.proyectar(b)
        self.assertEqual(len(p['eventos']), 1)
        self.assertFalse(p['clasificaciones'])
        self.assertIsNone(p['eventos'][0]['resultado'])
        self.assertFalse(any(e['tipo'] == 'participante' for e in p['entidades'].values()))

    def test_rechaza_identidades_duplicadas_y_colecciones_discrepantes(self):
        for coleccion in ('espn-atp', 'espn-primera', 'espn-f1', 'feb-endesa', 'ocblacktop-wrc'):
            otra = muestra(coleccion)
            clave = 'events' if coleccion.startswith('espn-') else 'partidos' if coleccion.startswith('feb-') else 'rallies'
            otra[clave].append(deepcopy(otra[clave][0]))
            with self.subTest(coleccion=coleccion), self.assertRaisesRegex(ValueError, 'repetido'):
                importar(coleccion, otra)
        otra = muestra('espn-primera')
        with self.assertRaisesRegex(ValueError, 'Liga'):
            importar('espn-segunda', otra)
        otra['events'][0]['uid'] = 'otra-liga~e:1'
        with self.assertRaisesRegex(ValueError, 'espacio'):
            importar('espn-primera', otra)
        otra = muestra('ocblacktop-wrc')
        otra['roundCount'] = 14
        with self.assertRaisesRegex(ValueError, 'incompleta'):
            importar('ocblacktop-wrc', otra)

    def test_aplazamiento_y_cancelacion_se_conservan_como_cambios_de_agenda(self):
        for coleccion in ('espn-primera', 'espn-nba', 'espn-f1', 'motogp', 'ocblacktop-wrc'):
            for estado in ('aplazado', 'cancelado'):
                with self.subTest(coleccion=coleccion, estado=estado):
                    otra = muestra(coleccion)
                    if coleccion.startswith('espn-'):
                        codigo = 'STATUS_POSTPONED' if estado == 'aplazado' else 'STATUS_CANCELED'
                        for e in otra['events']:
                            e['status'] = {'type': {'name': codigo}}
                            for c in e['competitions']:
                                c['status'] = {'type': {'name': codigo}}
                    elif coleccion == 'motogp':
                        otra['status'] = 'POSTPONED' if estado == 'aplazado' else 'CANCELLED'
                    else:
                        for r in otra['rallies']:
                            r['status'] = 'postponed' if estado == 'aplazado' else 'cancelled'
                    n = importar(coleccion, otra)
                    self.assertTrue(all(e['programacion']['valor']['programacion'] == estado
                                        for e in publicacion.proyectar(n)['eventos']))
                    self.assertFalse(n['resultados'])

    def test_sesion_no_se_puede_asignar_a_otro_gp_por_su_uid(self):
        otra = muestra('espn-f1')
        otra['events'][0]['competitions'][0]['uid'] = 'otro-gp~c:1'
        with self.assertRaisesRegex(ValueError, 'espacio'):
            importar('espn-f1', otra)


class PersistenciaYTransporte(unittest.TestCase):
    def test_cli_doce_colecciones_base_nueva_y_rollback_ante_error(self):
        with tempfile.TemporaryDirectory() as carpeta:
            db, salida = Path(carpeta) / 'agenda.sqlite', Path(carpeta) / 'nucleo.json'
            args = ['--db', str(db), '--exportar-nucleo', '--salida', str(salida)]
            for c in deportes.COLECCIONES:
                args.extend(['--entrada-deporte', c + '=' + str(MUESTRAS / (c + '.json'))])
            with patch('agenda.recogida.urlopen', side_effect=AssertionError('No debe consultar red')):
                main(args)
                with almacen.abrir(db) as conexion:
                    a = almacen.cargar(conexion)
                self.assertEqual(len(a['nucleo']['fuentes']), 8)
                self.assertFalse(a['nucleo']['resultados'])
                self.assertFalse(a['nucleo']['clasificaciones'])
                self.assertEqual(json.loads(salida.read_text()), a['nucleo'])
                malo = Path(carpeta) / 'incompleto.json'
                malo.write_text('{"events": []}')
                with self.assertRaises(ValueError):
                    main(['--db', str(db), '--entrada-deporte', 'espn-primera=' + str(malo)])
                with almacen.abrir(db) as conexion:
                    self.assertEqual(almacen.cargar(conexion), a)

    def test_convive_con_cultura_y_conserva_catalogo_al_reproyectar(self):
        a = ampliar(construir([ficha()]))
        a['nucleo'] = importar('motogp', anterior=a['nucleo'])
        # Simula el piloto anterior a incorporar Motociclismo.
        a['clasificacion']['catalogo']['version'] = 1
        a['clasificacion']['catalogo']['conceptos'].pop('motociclismo')
        b = ampliar(a)
        self.assertEqual(b['nucleo']['catalogo']['version'], 2)
        p = publicacion.proyectar(b['nucleo'], list(b['nucleo']['fuentes']), generado=OBSERVADO)
        self.assertEqual(len(p['eventos']), 2)
        preparada = lectura.preparar(p)
        with closing(sqlite3.connect(':memory:')) as conexion:
            conexion.executescript('CREATE TABLE agenda_esquema(id INTEGER PRIMARY KEY,version INTEGER,revision INTEGER);'
                                   'INSERT INTO agenda_esquema VALUES(1,4,1);')
            for sql, parametros in lectura.planificar(preparada, 1):
                conexion.execute(sql, parametros)
            self.assertEqual(conexion.execute('SELECT count(*) FROM agenda_lectura_eventos').fetchone()[0], 2)
            self.assertEqual(conexion.execute("SELECT count(*) FROM agenda_lectura_eventos WHERE texto LIKE '%qualifying%'").fetchone()[0], 1)

    def test_espn_fecha_explicita_y_sin_reintentos_en_403(self):
        for c in espn.COLECCIONES:
            pagina = muestra(c)
            with self.subTest(c=c), patch('agenda.recogida.descargar', return_value=json.dumps(pagina)) as descargar:
                _, url = deportes.recoger(c, fecha='2026-11-01')
                self.assertTrue(url.endswith('?dates=20261101'))
                self.assertNotIn('limit=', url)
                descargar.assert_called_once_with(url, cabeceras={'User-Agent': recogida.CHROME_UA})
        error = HTTPError('https://ejemplo', 403, 'Forbidden', {}, io.BytesIO())
        with closing(error), patch('agenda.recogida.urlopen', side_effect=error) as descargar:
            with self.assertRaises(HTTPError):
                deportes.recoger('espn-nba', fecha='2026-11-01')
            self.assertEqual(descargar.call_count, 1)
        with self.assertRaisesRegex(ValueError, 'fecha'):
            deportes.recoger('espn-atp')

    def test_ocb_clave_solo_en_cabecera_y_una_peticion_por_temporada(self):
        pagina = muestra('ocblacktop-wrc')
        with patch.dict('os.environ', {'OCBLACKTOP_API_KEY': 'secreto-sintetico'}), patch('agenda.recogida.urlopen',
                return_value=io.BytesIO(json.dumps(pagina).encode())) as abrir:
            datos, url = deportes.recoger('ocblacktop-wrc', temporada='2026')
            self.assertEqual(abrir.call_count, 1)
            req = abrir.call_args.args[0]
            self.assertEqual(dict((k.lower(), v) for k, v in req.header_items())['x-api-key'], 'secreto-sintetico')
            self.assertTrue(url.endswith('/v1/wrc/seasons/2026'))
            self.assertNotIn('secreto', url)
            n = deportes.importar(None, 'ocblacktop-wrc', datos, OBSERVADO, url)
            self.assertNotIn('secreto-sintetico', json.dumps(n))
        with patch.dict('os.environ', {}, clear=True), patch('agenda.recogida.urlopen') as abrir:
            with self.assertRaisesRegex(ValueError, 'OCBLACKTOP_API_KEY'):
                deportes.recoger('ocblacktop-wrc', temporada='2026')
            abrir.assert_not_called()

    def test_feb_agenda_ignora_clasificacion_y_no_retiene_html(self):
        c, r = [(MUESTRAS.parent / ('feb-' + tipo + '.html')).read_text() for tipo in ('calendario', 'resultados')]
        r = r.replace('clasificacionDataGrid', 'tablaNoNecesaria')
        with patch('agenda.recogida.descargar', side_effect=[c, r]) as descargar:
            pagina, _ = deportes.recoger('feb-endesa', temporada='2026')
            self.assertEqual(descargar.call_count, 2)
        self.assertNotIn('fragmentos', pagina)
        self.assertNotIn('clasificacion', pagina)
        self.assertTrue(all('marcador_resultados' not in p for p in pagina['partidos']))


if __name__ == '__main__':
    unittest.main()
