"""Pasada única: una carga del núcleo, guardado por fuente y parada ante conflicto."""

import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from agenda import pasada, turso
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
                self.assertIsNone(self.reloj('madrid'))
                cli.side_effect = None
                with patch.object(pasada, '_cli', return_value=cli), \
                        patch.object(pasada, 'ahora_utc', return_value='2026-11-04T10:30:00Z'), \
                        patch('sys.stdout', new_callable=io.StringIO):
                    pasada.main(['--cadencia', '--paso-reloj', 'madrid::calendario'])
                self.assertEqual(cli.call_count, 2)
                self.assertIsNotNone(self.reloj('madrid'))
                self.servidor.db.execute("DELETE FROM agenda_estado WHERE clave='reloj:madrid'")

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
