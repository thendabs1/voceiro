"""Vigilancia: issue por paso con fallos seguidos, sin ruido y sin filtrar claves."""

import json
import re
import unittest
from unittest.mock import patch

from agenda import vigilancia


class GitHub:
    """Issues en memoria con la API mínima que usa vigilancia._gh."""

    def __init__(self, issues=()):
        self.issues = {i['number']: i for i in issues}
        self.comentarios = []
        self.escrituras = 0

    def __call__(self, argumentos, entrada=None):
        if '--paginate' in argumentos:
            return json.dumps([list(self.issues.values())])
        metodo, ruta = argumentos[argumentos.index('--method') + 1], argumentos[argumentos.index('--method') + 2]
        datos = json.loads(entrada)
        self.escrituras += 1
        if m := re.fullmatch(r'repos/o/r/issues/(\d+)/comments', ruta):
            self.comentarios.append((int(m[1]), datos['body']))
            return '{}'
        if m := re.fullmatch(r'repos/o/r/issues/(\d+)', ruta):
            issue = self.issues[int(m[1])]
            issue.update(body=datos.get('body', issue['body']), state=datos.get('state', issue['state']))
            return json.dumps(issue)
        numero = max(self.issues, default=0) + 1
        self.issues[numero] = {'number': numero, 'html_url': f'https://github.com/o/r/issues/{numero}',
                               'title': datos['title'], 'body': datos['body'], 'state': 'open'}
        return json.dumps(self.issues[numero])


FALLO = {'errores': 2, 'desde': '2026-11-10T00:20:00Z', 'ultimo_error': '2026-11-10T12:49:00Z',
         'mensaje': 'atletismo-recogida --fuente fca: fca: la lectura no trae 67 de 83 citas conocidas'}


class Vigilancia(unittest.TestCase):
    def revisar(self, gh, estados):
        with patch.object(vigilancia, '_gh', gh):
            return vigilancia.revisar(estados, 'o/r')

    def test_abre_al_umbral_actualiza_en_silencio_y_comenta_otro_error(self):
        gh = GitHub()
        self.assertEqual(self.revisar(gh, {'atletismo-fca': {**FALLO, 'errores': 1}}),
                         {'abiertos': [], 'actualizados': [], 'reabiertos': [], 'cerrados': []})
        self.assertEqual(gh.escrituras, 0)
        hecho = self.revisar(gh, {'atletismo-fca': FALLO, 'otro': {'errores': 1}})
        self.assertEqual(hecho['abiertos'], ['https://github.com/o/r/issues/1'])
        issue = gh.issues[1]
        self.assertEqual(issue['title'], 'Calendario: el paso atletismo-fca falla seguido')
        self.assertIn('lleva 2 fallos seguidos (desde 2026-11-10T00:20:00Z', issue['body'])
        # Mismo estado: nada que escribir.
        self.revisar(gh, {'atletismo-fca': FALLO})
        self.assertEqual(gh.escrituras, 1)
        # Otro fallo con el mismo error: cuerpo actualizado sin comentario (no notifica).
        self.revisar(gh, {'atletismo-fca': {**FALLO, 'errores': 3, 'ultimo_error': '2026-11-11T23:09:00Z'}})
        self.assertIn('lleva 3 fallos seguidos', gh.issues[1]['body'])
        self.assertEqual(gh.comentarios, [])
        # Un error distinto sí se comenta.
        self.revisar(gh, {'atletismo-fca': {**FALLO, 'errores': 4, 'mensaje': 'HTTP Error 503'}})
        self.assertEqual(len(gh.comentarios), 1)
        self.assertIn('Cambia el error', gh.comentarios[0][1])

    def test_recuperado_comenta_y_cierra_y_un_nuevo_fallo_reabre_el_mismo(self):
        gh = GitHub()
        self.revisar(gh, {'atletismo-fca': FALLO})
        recuperado = {'errores': 0, 'desde': FALLO['desde'], 'recuperado': '2026-11-12T22:00:00Z', 'fallos': 4}
        self.assertEqual(self.revisar(gh, {'atletismo-fca': recuperado})['cerrados'],
                         ['https://github.com/o/r/issues/1'])
        self.assertEqual(gh.issues[1]['state'], 'closed')
        self.assertIn('Recuperado el 2026-11-12T22:00:00Z tras 4 fallos', gh.comentarios[-1][1])
        # Ya cerrado: no se vuelve a tocar.
        escrituras = gh.escrituras
        self.revisar(gh, {'atletismo-fca': recuperado})
        self.assertEqual(gh.escrituras, escrituras)
        self.assertEqual(self.revisar(gh, {'atletismo-fca': FALLO})['reabiertos'],
                         ['https://github.com/o/r/issues/1'])
        self.assertEqual((len(gh.issues), gh.issues[1]['state']), (1, 'open'))
        self.assertEqual(gh.comentarios[-1][1], 'Vuelve a fallar.')

    def test_ignora_otros_issues_y_pull_requests(self):
        gh = GitHub([{'number': 5, 'html_url': 'u5', 'body': '<!-- voceiro:atletismo:abc -->', 'state': 'open'},
                     {'number': 6, 'html_url': 'u6', 'body': vigilancia.marcador('atletismo-fca'),
                      'state': 'open', 'pull_request': {}}])
        self.assertEqual(len(self.revisar(gh, {'atletismo-fca': FALLO})['abiertos']), 1)

    def test_el_mensaje_publico_no_lleva_consultas_ni_claves(self):
        texto = ('HTTP Error 401 en https://api.formula1.com/v1/event?apikey=SECRETO&x=1 '
                 'token eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9abcdefghijkl ```fin```')
        limpio = vigilancia.limpiar(texto)
        self.assertIn('https://api.formula1.com/v1/event ', limpio)
        self.assertNotIn('SECRETO', limpio)
        self.assertNotIn('eyJhbGci', limpio)
        self.assertNotIn('```', limpio)
        # Casos que reprodujo la review: clave corta, credenciales en la URL, clave partida y secretos del job.
        with patch.dict('os.environ', {'CALENDARIO_TURSO_TOKEN': 'abc.def-corto'}):
            for fuga, secreto in (('token=secreto-de-20-letras', 'secreto'),
                                  ('https://usuario:clave-corta@api.x/y', 'clave-corta'),
                                  ('ABCDEFGHIJKLMNOPQRSTUVWXYZabc/DEFGHIJKLMNOP', 'DEFGHIJ'),
                                  ('Authorization: Bearer xyz123', 'xyz123'),
                                  ('turso abc.def-corto', 'abc.def')):
                self.assertNotIn(secreto, vigilancia.limpiar(fuga), fuga)
        real = 'fca: la lectura no trae 67 de 83 citas conocidas; no se retira nada'
        self.assertEqual(vigilancia.limpiar(real), real)
        self.assertEqual(len(vigilancia.limpiar('error de red ' * 200)), 600)

    def test_base_nueva_sin_agenda_estado_no_tiene_vigilancias(self):
        import sqlite3
        from agenda.control import Repositorio
        self.assertEqual(Repositorio(db=sqlite3.connect(':memory:')).vigilancias(), {})

    def test_repositorio_y_umbral_validos(self):
        for repo, umbral in (('o/r; rm', 2), ('o/r', 0)):
            with self.assertRaises(ValueError):
                vigilancia.revisar({}, repo, umbral)


if __name__ == '__main__':
    unittest.main()
