"""Pasada única: una carga del núcleo, guardado por fuente y parada ante conflicto."""

import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError

from agenda import cadencias, pasada, turso
from agenda.control import ConflictoControl, Repositorio
from agenda.turso import Almacen, ConflictoCalendario
from test_agenda import construir, ficha
from test_calendario_cultura import muestra
from test_calendario_turso import Servidor
from turso_http import ErrorTurso

CARGA = "SELECT valor_json FROM agenda_estado WHERE clave='calendario'"
AHORA = '2026-11-04T04:50:00Z'


class Pasada(unittest.TestCase):
    def setUp(self):
        self.servidor = Servidor()
        self.addCleanup(self.servidor.db.close)
        for p in (patch('turso_http.urlopen', self.servidor.abrir),
                  patch.dict(os.environ, {'CALENDARIO_TURSO_URL': 'libsql://agenda.test',
                                          'CALENDARIO_TURSO_TOKEN': 'token-simulado'})):
            p.start()
            self.addCleanup(p.stop)
        remoto = Almacen()
        remoto.inicializar()
        remoto.cargar()
        remoto.guardar(construir([ficha()]))
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.rutas = {}
        for fuente, datos in (('madrid', muestra('madrid')), ('kulturklik', muestra('kulturklik')), ('rota', {})):
            self.rutas[fuente] = Path(tmp.name, fuente + '.json')
            self.rutas[fuente].write_text(json.dumps(datos), encoding='utf-8')
        self.servidor.consultas.clear()

    def guardado(self):
        return Almacen().cargar()['nucleo']['fuentes']

    def reloj(self, grupo):
        return Repositorio(remoto=Almacen()).reloj(grupo)

    def anotar(self, grupo, ahora=AHORA):
        Repositorio(remoto=Almacen()).anotar_reloj(grupo, ahora)

    def test_cadencia_omite_reloj_no_vencido_y_lo_explica(self):
        self.anotar('madrid')
        anterior = self.reloj('madrid')
        cli = Mock()
        with patch.object(pasada, '_cli', return_value=cli), patch.object(pasada, 'ahora_utc', return_value=AHORA), \
                patch('sys.stdout', new_callable=io.StringIO) as salida:
            pasada.main(['--cadencia', '--paso-reloj', 'madrid::calendario --turso'])
        cli.assert_not_called()
        self.assertEqual(self.reloj('madrid'), anterior)
        self.assertIn('Omitido calendario --turso: reloj madrid no vencido', salida.getvalue())

    def test_reloj_y_final_anotan_tras_exito_incluido_systemexit_cero(self):
        for opcion, texto, grupo in (('--paso-reloj', 'madrid::calendario --turso', 'madrid'),
                                     ('--paso-final', 'publicacion --turso', 'publicacion')):
            for error in (None, SystemExit(0), SystemExit(None)):
                with self.subTest(opcion=opcion, error=error):
                    self.servidor.db.execute("DELETE FROM agenda_estado WHERE clave LIKE 'reloj:%'")
                    cli = Mock(side_effect=error)
                    with patch.object(pasada, '_cli', return_value=cli), \
                            patch.object(pasada, 'ahora_utc', return_value=AHORA), patch('sys.stdout', new_callable=io.StringIO):
                        pasada.main(['--cadencia', opcion, texto])
                    cli.assert_called_once_with(['--turso'])
                    self.assertEqual(self.reloj(grupo), {'ultima': '2026-11-04T04:50:00.000000+00:00',
                        'proxima_revision': '2026-11-05T01:50:00.000000+00:00'})

    def test_fallo_tolerado_no_anota_y_se_reintenta_en_el_tick_siguiente(self):
        for error in (ValueError('fuente caída'), SystemExit(1)):
            with self.subTest(error=error):
                cli = Mock(side_effect=error)
                with patch.object(pasada, '_cli', return_value=cli), \
                        patch.object(pasada, 'ahora_utc', return_value=AHORA), patch('sys.stdout', new_callable=io.StringIO):
                    with self.assertRaises(SystemExit) as fin:
                        pasada.main(['--cadencia', '--paso-reloj', 'madrid::calendario'])
                self.assertEqual(fin.exception.code, 1)
                self.assertEqual(self.reloj('madrid')['errores'], 1)
                self.assertNotIn('ultima', self.reloj('madrid'))
                cli.side_effect = None
                with patch.object(pasada, '_cli', return_value=cli), \
                        patch.object(pasada, 'ahora_utc', return_value='2026-11-04T10:30:00Z'), \
                        patch('sys.stdout', new_callable=io.StringIO):
                    pasada.main(['--cadencia', '--paso-reloj', 'madrid::calendario'])
                self.assertEqual(cli.call_count, 2)
                self.assertNotIn('errores', self.reloj('madrid'))
                self.servidor.db.execute("DELETE FROM agenda_estado WHERE clave='reloj:madrid'")

    def tick(self, cli, ahora, grupo='madrid'):
        with patch.object(pasada, '_cli', side_effect=lambda nombre: Mock() if nombre == 'publicacion' else cli), \
                patch.object(pasada, 'ahora_utc', return_value=ahora), \
                patch('sys.stdout', new_callable=io.StringIO) as salida:
            try:
                pasada.main(['--cadencia', '--paso-reloj', f'{grupo}::calendario', '--paso-final', 'publicacion'])
            except SystemExit:
                pass
        return salida.getvalue()

    def test_fallos_seguidos_esperan_cada_vez_mas_y_conservan_la_ultima_lectura(self):
        self.anotar('madrid', '2026-11-01T04:30:00Z')
        ultima = self.reloj('madrid')['ultima']
        cli = Mock(side_effect=ValueError('fuente caída'))
        ticks = [f'2026-11-04T{h}:30:00Z' for h in ('04', '10', '16', '22')] + \
                [f'2026-11-05T{h}:30:00Z' for h in ('04', '10', '16', '22')] + ['2026-11-06T04:30:00Z']
        for ahora in ticks:
            self.tick(cli, ahora)
        # Primer fallo, siguiente tick, dos ticks después y luego 21 h: 04:30, 10:30, 22:30, 22:30.
        self.assertEqual(cli.call_count, 4)
        self.assertEqual(self.reloj('madrid')['ultima'], ultima)
        self.assertEqual(self.reloj('madrid')['errores'], 4)

    def test_retry_after_alarga_la_espera(self):
        error = HTTPError('https://ejemplo.test', 429, 'límite', {'Retry-After': '172800'}, None)
        cli = Mock(side_effect=error)
        for ahora in ('2026-11-04T04:30:00Z', '2026-11-04T22:30:00Z', '2026-11-05T22:30:00Z'):
            self.tick(cli, ahora)
        self.assertEqual(cli.call_count, 1)
        self.tick(cli, '2026-11-06T04:30:00Z')
        self.assertEqual(cli.call_count, 2)

    def test_anotar_un_fallo_no_fuerza_la_publicacion(self):
        self.anotar('publicacion')
        cli = Mock(side_effect=ValueError('fuente caída'))
        salida = self.tick(cli, '2026-11-04T10:30:00Z')
        self.assertEqual(cli.call_count, 1)
        self.assertIn('sin escrituras y reloj publicacion no vencido', salida)

    def test_vigilancia_cuenta_fallos_seguidos_por_paso_y_anota_la_recuperacion(self):
        def estado():
            return Repositorio(remoto=Almacen()).vigilancias()

        cli = Mock(side_effect=ValueError('fca: la lectura no trae 67 de 83 citas conocidas'))
        self.tick(cli, '2026-11-04T04:30:00Z', grupo='atletismo-fca')
        self.tick(cli, '2026-11-04T10:30:00Z', grupo='atletismo-fca')
        self.assertEqual(estado(), {'atletismo-fca': {
            'errores': 2, 'desde': '2026-11-04T04:30:00Z', 'ultimo_error': '2026-11-04T10:30:00Z',
            'mensaje': 'calendario: fca: la lectura no trae 67 de 83 citas conocidas'}})
        # Un paso omitido por su reloj no cuenta como éxito ni como fallo.
        salida = self.tick(cli, '2026-11-04T16:30:00Z', grupo='atletismo-fca')
        self.assertIn('Omitido calendario: reloj atletismo-fca no vencido', salida)
        self.assertEqual(estado()['atletismo-fca']['errores'], 2)
        cli.side_effect = None
        self.tick(cli, '2026-11-05T04:30:00Z', grupo='atletismo-fca')
        self.assertEqual(estado()['atletismo-fca'], {
            'errores': 0, 'desde': '2026-11-04T04:30:00Z', 'recuperado': '2026-11-05T04:30:00Z', 'fallos': 2,
            'mensaje': 'calendario: fca: la lectura no trae 67 de 83 citas conocidas'})
        # Sin fallos previos, un éxito no escribe nada; un paso sin reloj se vigila por su CLI.
        with patch.object(Repositorio, 'anotar_vigilancia') as anotar, patch.object(pasada, '_cli', return_value=Mock()), \
                patch('sys.stdout', new_callable=io.StringIO):
            pasada.main(['--paso-tolerado', 'operacion --turso'])
        anotar.assert_not_called()
        with patch.object(pasada, '_cli', return_value=Mock(side_effect=SystemExit(1))), \
                patch.object(pasada, 'ahora_utc', return_value=AHORA), patch('sys.stdout', new_callable=io.StringIO):
            with self.assertRaises(SystemExit):
                pasada.main(['--paso-tolerado', 'operacion --turso --descubrir'])
        self.assertEqual(estado()['operacion']['mensaje'], 'operacion --turso --descubrir: 1')

    def test_guardado_parcial_avanza_el_reloj_y_deja_el_paso_fallido(self):
        cli = Mock(side_effect=cadencias.GuardadoParcial('Calendario PDF no se leyó'))
        with patch.object(pasada, '_cli', return_value=cli), patch.object(pasada, 'ahora_utc', return_value=AHORA), \
                patch('sys.stdout', new_callable=io.StringIO):
            with self.assertRaises(SystemExit) as fin:
                pasada.main(['--cadencia', '--paso-reloj', 'atletismo-rfea::calendario'])
        self.assertEqual(fin.exception.code, 1)
        self.assertFalse(Repositorio(remoto=Almacen()).reloj_vencido('atletismo-rfea', '2026-11-04T10:30:00Z'))

    def test_lectura_interrumpida_no_cuenta_como_exito_y_respeta_retry_after(self):
        cli = Mock(side_effect=cadencias.LecturaInterrumpida('fga: lectura interrumpida', '172800'))
        with patch.object(pasada, '_cli', return_value=cli), patch.object(pasada, 'ahora_utc', return_value=AHORA), \
                patch('sys.stdout', new_callable=io.StringIO):
            with self.assertRaises(SystemExit) as fin:
                pasada.main(['--cadencia', '--paso-reloj', 'atletismo-fga::calendario'])
        self.assertEqual(fin.exception.code, 1)
        reloj = self.reloj('atletismo-fga')
        self.assertEqual(reloj['errores'], 1)
        self.assertNotIn('ultima', reloj)
        self.assertEqual(reloj['proxima_revision'], '2026-11-06T04:50:00.000000+00:00')

    def test_final_fallido_no_anota_publicacion(self):
        cli = Mock(side_effect=ValueError('fallo de publicación'))
        with patch.object(pasada, '_cli', return_value=cli), \
                patch.object(pasada, 'ahora_utc', return_value=AHORA), patch('sys.stdout', new_callable=io.StringIO):
            with self.assertRaisesRegex(ValueError, 'fallo de publicación'):
                pasada.main(['--cadencia', '--paso-final', 'publicacion'])
        self.assertIsNone(self.reloj('publicacion'))

    def test_error_turso_y_conflictos_detienen_incluso_un_paso_reloj(self):
        for clase in (ErrorTurso, ConflictoControl, ConflictoCalendario):
            with self.subTest(error=clase):
                cli = Mock(side_effect=clase('fallo'))
                with patch.object(pasada, '_cli', return_value=cli), \
                        patch.object(pasada, 'ahora_utc', return_value=AHORA), patch('sys.stdout', new_callable=io.StringIO):
                    with self.assertRaises(clase):
                        pasada.main(['--cadencia', '--paso-reloj', 'madrid::calendario',
                                     '--paso-tolerado', 'operacion'])
                cli.assert_called_once_with([])
                self.assertIsNone(self.reloj('madrid'))

    def test_tick_sin_escrituras_omite_ambos_finales_si_publicacion_no_vencio(self):
        self.anotar('publicacion')
        anterior = self.reloj('publicacion')
        cli = Mock()
        with patch.object(pasada, '_cli', return_value=cli), patch.object(pasada, 'ahora_utc', return_value=AHORA), \
                patch('sys.stdout', new_callable=io.StringIO) as salida:
            pasada.main(['--cadencia', '--paso', 'operacion', '--paso-final', 'publicacion',
                         '--paso-final-tolerado', 'atletismo-revision'])
        cli.assert_called_once_with([])
        self.assertEqual(salida.getvalue().count('sin escrituras y reloj publicacion no vencido'), 2)
        self.assertEqual(self.reloj('publicacion'), anterior)

    def test_finales_sin_escrituras_se_ejecutan_si_reloj_ausente_o_vencido(self):
        for ultima in (None, '2026-11-03T04:50:00Z'):
            with self.subTest(ultima=ultima):
                self.servidor.db.execute("DELETE FROM agenda_estado WHERE clave='reloj:publicacion'")
                if ultima:
                    self.anotar('publicacion', ultima)
                ejecutados = []
                def cli(nombre):
                    return lambda argv: ejecutados.append(nombre)
                with patch.object(pasada, '_cli', side_effect=cli), \
                        patch.object(pasada, 'ahora_utc', return_value=AHORA), patch('sys.stdout', new_callable=io.StringIO):
                    pasada.main(['--cadencia', '--paso-final', 'publicacion',
                                 '--paso-final-tolerado', 'atletismo-revision'])
                self.assertEqual(ejecutados, ['publicacion', 'atletismo-revision'])
                self.assertEqual(self.reloj('publicacion')['ultima'], '2026-11-04T04:50:00.000000+00:00')

    def test_escrituras_en_la_pasada_ejecutan_finales_aunque_reloj_no_venza(self):
        self.anotar('publicacion')
        ejecutados = []
        def cli(nombre):
            def ejecutar(argv):
                ejecutados.append(nombre)
                if nombre == 'operacion':
                    Repositorio(remoto=turso.abrir()).anotar_reloj('madrid', AHORA)
            return ejecutar
        with patch.object(pasada, '_cli', side_effect=cli), \
                patch.object(pasada, 'ahora_utc', return_value=AHORA), patch('sys.stdout', new_callable=io.StringIO):
            pasada.main(['--cadencia', '--paso', 'operacion',
                         '--paso-final-tolerado', 'atletismo-revision', '--paso-final', 'publicacion'])
        self.assertEqual(ejecutados, ['operacion', 'atletismo-revision', 'publicacion'])

    def test_final_tolerado_no_anota_publicacion_tras_exito_o_fallo(self):
        for error in (None, SystemExit(0), ValueError('fallo de revisión')):
            with self.subTest(error=error):
                cli = Mock(side_effect=error)
                with patch.object(pasada, '_cli', return_value=cli), \
                        patch.object(pasada, 'ahora_utc', return_value=AHORA), patch('sys.stdout', new_callable=io.StringIO):
                    if isinstance(error, ValueError):
                        with self.assertRaises(SystemExit) as fin:
                            pasada.main(['--cadencia', '--paso-final-tolerado', 'atletismo-revision'])
                        self.assertEqual(fin.exception.code, 1)
                    else:
                        pasada.main(['--cadencia', '--paso-final-tolerado', 'atletismo-revision'])
                cli.assert_called_once_with([])
                self.assertIsNone(self.reloj('publicacion'))

    def test_sin_cadencia_ejecuta_todo_en_orden_sin_consultar_ni_anotar_relojes(self):
        self.anotar('madrid')
        self.anotar('publicacion')
        ejecutados = []
        def cli(nombre):
            def ejecutar(argv):
                ejecutados.append(nombre)
                if nombre == 'calendario':
                    raise SystemExit(0)
            return ejecutar
        with patch.object(pasada, '_cli', side_effect=cli), patch.object(Repositorio, 'reloj_vencido') as vencido, \
                patch.object(Repositorio, 'anotar_reloj') as anotar, patch('sys.stdout', new_callable=io.StringIO):
            pasada.main(['--paso', 'operacion', '--paso-reloj', 'madrid::calendario',
                         '--paso-tolerado', 'atletismo-recogida', '--paso-final', 'publicacion',
                         '--paso-final-tolerado', 'atletismo-revision'])
        self.assertEqual(ejecutados, ['operacion', 'calendario', 'atletismo-recogida',
                                     'publicacion', 'atletismo-revision'])
        vencido.assert_not_called()
        anotar.assert_not_called()

    def test_grupo_desconocido_falla_antes_de_abrir_turso(self):
        for texto in ('inventado::calendario', 'madrid calendario'):
            with self.subTest(texto=texto), self.assertRaisesRegex(ValueError, 'Grupo de reloj desconocido'):
                pasada.main(['--paso-reloj', texto])
        self.assertEqual(self.servidor.consultas, [])

    def test_una_carga_y_la_fuente_fallida_no_deshace_las_anteriores(self):
        with patch('sys.stdout', new_callable=io.StringIO) as salida, self.assertRaises(SystemExit) as fin:
            pasada.main(['--paso-tolerado', f'calendario --turso --entrada-madrid {self.rutas["madrid"]}',
                         '--paso-tolerado', f'calendario --turso --entrada-kulturklik {self.rutas["rota"]}',
                         '--paso', 'calendario --turso --preparar-nucleo',
                         '--paso', 'publicacion --turso --revisar'])
        self.assertEqual(fin.exception.code, 1)
        self.assertEqual(sum(sql == CARGA for sql, _ in self.servidor.consultas), 1)
        self.assertIn('::error::calendario --turso --entrada-kulturklik', salida.getvalue())
        self.assertIn('[agenda] Lectura:', salida.getvalue())  # Se publica igual.
        fuentes = self.guardado()
        self.assertIn('madrid', fuentes)
        self.assertNotIn('kulturklik', fuentes)

    def test_otro_escritor_detiene_la_pasada_aunque_el_paso_sea_tolerado(self):
        real = pasada._cli

        def cli(nombre):
            def paso(argv):
                if '--entrada-kulturklik' in argv:
                    self.servidor.db.execute('UPDATE agenda_esquema SET revision=revision+1 WHERE id=1')
                return real(nombre)(argv)
            return paso
        with patch('agenda.pasada._cli', cli), patch('sys.stdout', new_callable=io.StringIO):
            with self.assertRaises(ConflictoCalendario):
                pasada.main(['--paso-tolerado', f'calendario --turso --entrada-madrid {self.rutas["madrid"]}',
                             '--paso-tolerado', f'calendario --turso --entrada-kulturklik {self.rutas["kulturklik"]}',
                             '--paso', 'publicacion --turso'])
        fuentes = self.guardado()
        self.assertIn('madrid', fuentes)
        self.assertNotIn('kulturklik', fuentes)

    def test_un_guardado_incierto_obliga_a_releer(self):
        with turso.compartido() as remoto:
            calendario = remoto.cargar()
            remoto.cargar()
            self.assertEqual(sum(sql == CARGA for sql, _ in self.servidor.consultas), 1)
            self.servidor.perder_respuesta = True
            with self.assertRaises(Exception):
                remoto.guardar(construir([ficha(), ficha(201)], calendario))
            self.servidor.perder_respuesta = False
            remoto.cargar()
            self.assertEqual(sum(sql == CARGA for sql, _ in self.servidor.consultas), 2)

    def test_paso_desconocido_falla_antes_de_abrir_turso(self):
        with self.assertRaisesRegex(ValueError, 'Paso desconocido'):
            pasada.main(['--paso', 'calendario --turso --preparar-nucleo', '--paso', 'publicar --turso'])
        self.assertEqual(self.servidor.consultas, [])

    def test_revision_de_atletismo_reutiliza_la_carga_y_no_consulta_github_sin_casos(self):
        with patch('sys.stdout', new_callable=io.StringIO), patch('agenda.atletismo_revision._gh') as gh:
            pasada.main(['--paso', 'calendario --turso --preparar-nucleo',
                         '--paso-tolerado', 'atletismo-revision --turso --issues --repo thendabs1/voceiro'])
        self.assertEqual(sum(sql == CARGA for sql, _ in self.servidor.consultas), 1)
        gh.assert_not_called()


if __name__ == '__main__':
    unittest.main()
