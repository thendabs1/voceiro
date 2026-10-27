"""Pasada única: una carga del núcleo, guardado por fuente y parada ante conflicto."""

import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from agenda import pasada, turso
from agenda.turso import Almacen, ConflictoCalendario
from test_agenda import construir, ficha
from test_calendario_cultura import muestra
from test_calendario_turso import Servidor

CARGA = "SELECT valor_json FROM agenda_estado WHERE clave='calendario'"


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


if __name__ == '__main__':
    unittest.main()
