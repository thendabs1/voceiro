"""PDF sin IDs: extracción completa, revisión e importación sin duplicar."""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest

from agenda import atletismo, atletismo_nivel_ii as nivel, publicacion
from calendario import main

MUESTRAS = Path(__file__).with_name('muestras_calendario') / 'atletismo'
AHORA = '2026-11-02T20:00:00+01:00'


def revisiones():
    return json.loads(Path(nivel.__file__).with_name('atletismo-nivel-ii-revisiones.json').read_text())


class NivelII(unittest.TestCase):
    def setUp(self):
        self.texto = (MUESTRAS / 'nivel-ii-2026.txt').read_text()
        self.inventario = nivel.leer(self.texto, 15)

    def test_documento_completo_con_campos_ausentes_y_estados_literales(self):
        i = self.inventario
        self.assertEqual((i['paginas'], len(i['filas']), i['actualizado']), (15, 441, '2026-10-15'))
        filas = [f['fila'] for f in i['filas']]
        self.assertEqual(sum(not f['federacion_literal'] for f in filas), 1)
        self.assertEqual(sum(not f['tipo_literal'] for f in filas), 1)
        aplazada = next(f for f in filas if 'Aprazado' in f['nombre'])
        self.assertEqual(aplazada['fecha'], '2026-07-04')
        self.assertTrue(any('SUSPENDIDO' in f['nombre'] for f in filas))
        self.assertNotIn('id', aplazada)

    def test_falla_ante_truncamiento_lineas_desconocidas_o_columnas_ambiguas(self):
        for texto, paginas in ((self.texto, 14),
                               (self.texto.split('\f')[0], 15),
                               (self.texto.replace('Reunión FAM 14 Gallur', 'Reunión FAM 14  Gallur'), 15),
                               (self.texto + 'Una competición sin columnas\n', 15),
                               (self.texto.replace('15/10/2026', ''), 15),
                               (self.texto.replace('3/1/2026', '3/1/2027', 1), 15)):
            with self.subTest(texto=texto[:40], paginas=paginas), self.assertRaises(ValueError):
                nivel.leer(texto, paginas)

    def test_solo_identidades_revisadas_sin_declarar_cobertura_completa(self):
        vacio = nivel.resolver(self.inventario, {'version': 1, 'revisiones': []})
        self.assertFalse(vacio['completo'])
        self.assertEqual(len(vacio['pendientes']), 441)
        self.assertEqual(vacio['entrada']['eventos'], [])
        resultado = nivel.resolver(self.inventario, revisiones())
        self.assertEqual(len(resultado['entrada']['eventos']), 1)
        self.assertEqual(len(resultado['pendientes']), 440)
        self.assertFalse(resultado['completo'])
        self.assertEqual(resultado['revisiones_no_aplicadas'], [])
        e = resultado['entrada']['eventos'][0]
        self.assertEqual(e['metadatos']['nivel_ii']['actualizado'], '2026-10-15')
        self.assertEqual(e['metadatos']['modalidad_literal'], 'AL')

    def test_misma_cita_en_rfea_y_fga_con_sus_capas_y_discrepancia(self):
        entrada = nivel.resolver(self.inventario, revisiones())['entrada']
        fga = json.loads((MUESTRAS / 'nivel-ii-fga-marcha.json').read_text())
        ids = set()
        for paginas in ((entrada, fga), (fga, entrada)):
            n = None
            for p in paginas:
                n = atletismo.importar(n, p, AHORA)
            vista = publicacion.proyectar(n, fuentes=['rfea', 'fga'])
            self.assertEqual(len(vista['eventos']), 1)
            e = vista['eventos'][0]
            ids.add(e['id'])
            self.assertEqual({f['fuente'] for f in e['fuentes']}, {'rfea', 'fga'})
            self.assertFalse(e['programacion']['conflicto'])
            self.assertTrue(e['atletismo']['conflicto'])
            self.assertEqual({v['valor']['modalidad_literal'] for v in e['atletismo']['variantes']}, {'AL', 'Marcha'})
            for fuente in ('rfea', 'fga'):
                parcial = publicacion.proyectar(n, fuentes=[fuente])['eventos'][0]
                self.assertEqual(parcial['id'], e['id'])
                self.assertEqual(parcial['atletismo']['variantes'][0]['procedencia']['fuente'], fuente)
        self.assertEqual(len(ids), 1)

    def test_cambio_de_pdf_requiere_revision_y_conserva_identidad_al_aprobar(self):
        cambio = deepcopy(self.inventario)
        fila = next(f for f in cambio['filas'] if f['huella'] == revisiones()['revisiones'][0]['huella'])
        fila['fila']['fecha'] = '2026-11-22'
        fila['huella'] = nivel.huella(fila['fila'])
        resultado = nivel.resolver(cambio, revisiones())
        self.assertEqual(resultado['entrada']['eventos'], [])
        self.assertEqual(len(resultado['revisiones_no_aplicadas']), 1)
        r = revisiones()
        r['revisiones'][0].update(huella=fila['huella'], inicio='2026-11-22', fin='2026-11-22')
        anterior = nivel.resolver(self.inventario, revisiones())['entrada']
        nueva = nivel.resolver(cambio, r)['entrada']
        n = atletismo.importar(None, anterior, AHORA)
        id_anterior = publicacion.proyectar(n)['eventos'][0]['id']
        n = atletismo.importar(n, nueva, '2026-11-03T20:00:00+01:00')
        eventos = publicacion.proyectar(n)['eventos']
        self.assertEqual(len(eventos), 1)
        self.assertEqual(eventos[0]['id'], id_anterior)
        self.assertEqual(eventos[0]['programacion']['valor']['cuando']['inicio']['fecha'], '2026-11-22')

    def test_filas_identicas_y_ausencias_no_se_reconcilian_automaticamente(self):
        i = deepcopy(self.inventario)
        fila = next(f for f in i['filas'] if f['huella'] == revisiones()['revisiones'][0]['huella'])
        i['filas'].append(deepcopy(fila))
        resultado = nivel.resolver(i, revisiones())
        self.assertEqual(resultado['entrada']['eventos'], [])
        self.assertEqual(len(resultado['pendientes']), 442)
        i['filas'] = [f for f in i['filas'] if f['huella'] != fila['huella']]
        self.assertEqual(nivel.resolver(i, revisiones())['entrada']['eventos'], [])

    def test_no_admite_doble_asignacion_o_equivalencia_sin_registrar(self):
        r = revisiones()
        r['revisiones'].append({**r['revisiones'][0], 'id': 'nivel-ii:otra-identidad'})
        with self.assertRaisesRegex(ValueError, 'dos identidades'):
            nivel.resolver(self.inventario, r)
        r = revisiones()
        r['revisiones'][0]['id'] = 'nivel-ii:sin-correspondencia'
        with self.assertRaisesRegex(ValueError, 'falta equivalencia'):
            nivel.resolver(self.inventario, r)
        r['revisiones'][0].update(decision='nueva', estado='aplazado')
        entrada = nivel.resolver(self.inventario, r)['entrada']
        n = atletismo.importar(None, entrada, AHORA)
        self.assertEqual(publicacion.proyectar(n)['eventos'][0]['programacion']['valor']['programacion'], 'aplazado')

    def test_coincidencia_automatica_sin_revision_por_fila_y_repeticion_estable(self):
        # Referencia ficticia para comprobar el contrato sobre una fila real.
        observacion = next(f for f in self.inventario['filas'] if f['fila']['nombre'] == 'Reunión FAM 2 Gallur')
        f = observacion['fila']
        e = {'id': 'ensayo-fam', 'nombre': f['nombre'], 'inicio': f['fecha'], 'fin': f['fecha'],
             'lugar': {'nombre': f['ciudad']}, 'url': atletismo.FUENTES['rfea'][1] + '/campeonato/ensayo'}
        n = atletismo.importar(None, {'version': 1, 'fuente': 'rfea', 'eventos': [e]}, AHORA)
        identidad = publicacion.proyectar(n)['eventos'][0]['id']
        resultado = nivel.resolver(self.inventario, {'version': 1, 'revisiones': []}, n)
        self.assertEqual(len(resultado['entrada']['eventos']), 1)
        self.assertEqual(len(resultado['pendientes']), 440)
        identificador = resultado['entrada']['eventos'][0]['id']
        n = atletismo.importar(n, resultado['entrada'], AHORA)
        self.assertEqual(len(publicacion.proyectar(n)['eventos']), 1)
        self.assertEqual(publicacion.proyectar(n)['eventos'][0]['id'], identidad)
        repetida = nivel.resolver(self.inventario, {'version': 1, 'revisiones': []}, n)['entrada']
        self.assertEqual(repetida['eventos'][0]['id'], identificador)
        n = atletismo.importar(n, repetida, '2026-11-03T20:00:00+01:00')
        self.assertEqual(len(publicacion.proyectar(n)['eventos']), 1)

    def test_cli_guarda_un_lote_con_equivalencia_y_conflicto_de_sede(self):
        entrada = nivel.resolver(self.inventario, revisiones())['entrada']
        fga = MUESTRAS / 'nivel-ii-fga-marcha.json'
        with tempfile.TemporaryDirectory() as carpeta:
            raiz = Path(carpeta)
            rfea, salida, db = raiz / 'rfea.json', raiz / 'nucleo.json', raiz / 'agenda.db'
            rfea.write_text(json.dumps(entrada))
            # Una sola transacción para ambas fuentes, en los dos órdenes.
            for primero, segundo in ((rfea, fga), (fga, rfea)):
                main(['--db', str(db), '--entrada-atletismo', str(primero),
                      '--entrada-atletismo', str(segundo), '--exportar-nucleo', '--salida', str(salida)])
                n = json.loads(salida.read_text())
                eventos = publicacion.proyectar(n, fuentes=['rfea', 'fga'])['eventos']
                self.assertEqual(len(eventos), 1)
                self.assertTrue(eventos[0]['lugar']['conflicto'])
                # No convertir la sede de la primera importación del lote en
                # una selección válida anterior que nunca estuvo persistida.
                self.assertIsNone(eventos[0]['lugar']['valor'])


if __name__ == '__main__':
    unittest.main()
