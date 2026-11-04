"""Lecturas de documentos reales y fallo cerrado ante bytes distintos."""
from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from agenda import atletismo, atletismo_bloque, atletismo_documentos as d, atletismo_fga, atletismo_rfea, atletismo_recogida as r

M = Path(__file__).with_name('muestras_calendario') / 'atletismo'
C = M / 'circulares'
AHORA = '2026-11-04T13:00:00+00:00'


def castro():
    e = atletismo_rfea.leer_ficha((M / 'rfea/ficha-castro.html').read_text(),
        url='https://atletismorfea.es/calendario/campeonato/campeonato-de-espana-de-marcha-de-invierno-de-promocion-y-10-km-master')
    e.update(inicio='2026-12-13', fin='2026-12-13', url=e['metadatos']['temporalidad']['evidencia']['url'], lugar={'nombre': 'Castro Urdiales'})
    e['metadatos']['documentos'] += atletismo_rfea.leer_documentos((M / 'rfea/documentos-castro.json').read_text(), url='https://atletismorfea.es/ajax/championship-documents/a0bQs00000DqlHCIAZ')
    return e


def bytes_castro(u, *, binario=False):
    if not binario:
        raise AssertionError('El documento debe conservar los bytes originales')
    return (C / ('rfea-norma-21.pdf' if '/21/' in u else 'rfea-norma-22.pdf')).read_bytes()


class LecturasRevisadas(unittest.TestCase):
    def test_castro_dos_titulos_con_autoridad_y_evidencia_sin_alterar_datos_base(self):
        e = castro()
        antes = deepcopy(e)
        informe = d.completar('rfea', [e], bytes_castro)
        meta = e['metadatos']
        self.assertEqual(meta['alcance']['tipo'], 'titulos')
        self.assertEqual(meta['actividad']['valor'], 'competicion')
        self.assertEqual(len([t for t in meta['titulos'] if t['base'] == 'documento']), 2)
        self.assertTrue(all(t['autoridad'] == 'rfea' for t in meta['titulos'] if t['base'] == 'documento'))
        self.assertEqual(len(informe['superficies']), 2)
        self.assertEqual({k: v for k, v in e.items() if k != 'metadatos'}, {k: v for k, v in antes.items() if k != 'metadatos'})
        atletismo_bloque.validar(meta, e['inicio'], e['fin'], fuente='rfea')
        n = atletismo.importar(None, {'version': 1, 'fuente': 'rfea', 'eventos': [antes]}, AHORA)
        entidades = set(n['entidades']) if 'entidades' in n else set(n['eventos'])
        n = atletismo.importar(n, {'version': 1, 'fuente': 'rfea', 'eventos': [e]}, '2026-11-04T14:00:00+00:00')
        self.assertEqual(set(n['entidades']) if 'entidades' in n else set(n['eventos']), entidades)
        otro = atletismo.importar(n, {'version': 1, 'fuente': 'rfea', 'eventos': [e]}, '2026-11-04T15:00:00+00:00')
        self.assertEqual(set(n['observaciones']), set(otro['observaciones']))

    def test_sin_enlace_no_se_descarga_ni_aplica_por_nombre_o_id(self):
        e = castro()
        e['metadatos']['documentos'] = []
        informe = d.completar('rfea', [e], lambda *a, **k: self.fail('Sin enlace de ficha'))
        self.assertEqual(informe['superficies'], [])
        self.assertEqual(e['metadatos']['alcance']['tipo'], 'desconocido')

    def test_bytes_cambiados_no_aplican_ni_copian_huella(self):
        e = castro()
        informe = d.completar('rfea', [e], lambda *a, **k: b'%PDF sustituido')
        self.assertEqual(e['metadatos']['actividad']['valor'], 'desconocida')
        self.assertEqual(e['metadatos']['alcance']['tipo'], 'desconocido')
        self.assertTrue(all('hash' not in x for x in e['metadatos']['documentos']))
        self.assertEqual(len(informe['avisos']), 2)
        self.assertTrue(all('nueva lectura' in a['motivo'] for a in informe['avisos']))

    def test_caida_transitoria_conserva_y_no_repite_descarga_compartida(self):
        a, b = castro(), castro()
        b['id'] = 'sin-revision'
        llamadas = []
        def caida(u, **kwargs):
            llamadas.append(u)
            raise OSError('no disponible')
        informe = d.completar('rfea', [a, b], caida)
        self.assertEqual(len(llamadas), 2)
        self.assertEqual(a['metadatos']['actividad']['valor'], 'competicion')
        self.assertEqual(b['metadatos']['actividad']['valor'], 'desconocida')
        self.assertTrue(all(s['estado'] == 'no_disponible' for s in informe['superficies']))

    def test_403_429_cortan_toda_la_red_incluido_calendario_pdf(self):
        for codigo in (403, 429):
            e = castro()
            with patch.dict(r.LECTORES, rfea=lambda *a, **k: ({'version': 1, 'fuente': 'rfea', 'eventos': [e]}, {'pendientes': [], 'completo': True})), \
                    patch.object(r.recogida, 'descargar', side_effect=HTTPError('https://atletismorfea.es/x', codigo, 'límite', {}, None)) as red:
                _, informe = r.recoger('rfea', '2026-11-04', '2027-01-03')
            self.assertEqual(red.call_count, 1)
            self.assertTrue(informe['bloqueada'])
            self.assertFalse(informe['aplicar_ausencias'])
            self.assertNotIn('calendario_pdf', informe)
            self.assertFalse(informe['documentos_revisados']['completo'])
            self.assertEqual(informe['documentos_revisados']['superficies'][0]['estado'], 'fallida')

    def test_discrepancia_no_elije_ultima_y_presupuesto_no_se_oculta(self):
        e = castro()
        catalogo = deepcopy(d.lecturas_documentales('rfea'))
        catalogo[next(u for u in catalogo if '/22/' in u)]['citas']['64834']['alcance']['tipo'] = 'titulo'
        l = d.Lecturas('rfea', bytes_castro, catalogo=catalogo)
        l.aplicar(e)
        self.assertEqual(e['metadatos']['alcance']['tipo'], 'desconocido')
        self.assertIn('discrepantes', l.avisos[0]['motivo'])
        with self.assertRaisesRegex(ValueError, 'presupuesto'):
            d.completar('rfea', [castro()], lambda *a, **k: (_ for _ in ()).throw(ValueError('presupuesto agotado')))

    def test_cornella_separa_controles_organizador_y_autorizante(self):
        catalogo = d.lecturas_documentales('fca')
        for u, lectura in catalogo.items():
            i = next(iter(lectura['citas']))
            e = {'id': i, 'metadatos': {'documentos': [{'url': u, 'rol': 'reglamento'}]}}
            f = 'fca-combinades.pdf' if i == '89925' else 'fca-curses.pdf'
            d.completar('fca', [e], lambda *a, **k: (C / f).read_bytes())
            self.assertEqual(e['metadatos']['actividad']['valor'], 'control')
            self.assertEqual(e['metadatos']['alcance']['tipo'], 'reunion')
            self.assertEqual([(x['rol'], x['entidad_literal']) for x in e['metadatos']['organizacion']],
                [('organiza', 'Cornellà Atlètic'), ('autoriza', 'Federació Catalana d’Atletisme')])

    def test_evidencias_revisadas_constan_literalmente_en_captura(self):
        for fuente in ('rfea', 'fca'):
            for u, lectura in d.lecturas_documentales(fuente).items():
                if '/160-2026' in u:
                    self.assertIn(lectura['literal'], ' '.join((C / 'rfea-160-extracto.txt').read_text().split()))
                    continue
                nombre = ('rfea-norma-21.pdf' if '/21/' in u else 'rfea-norma-22.pdf') if fuente == 'rfea' else ('fca-combinades.pdf' if 'combinades' in u else 'fca-curses.pdf')
                pdf = C / nombre
                self.assertEqual(sha256(pdf.read_bytes()).hexdigest(), lectura['sha256'])
                texto = subprocess.run(['pdftotext', '-layout', str(pdf), '-'], capture_output=True, check=True, text=True).stdout
                texto = ' '.join(texto.split())
                self.assertIn(lectura['literal'], texto)
                for campos in lectura['citas'].values():
                    for k, valor in d.campos({**lectura, **campos}, u).items():
                        for dato in valor if isinstance(valor, list) else [valor]:
                            self.assertIn(dato['evidencia']['literal'], texto)
        u = next(u for u in atletismo_fga.lecturas_documentales() if 'Circular-180-' in u)
        lectura = atletismo_fga.lecturas_documentales()[u]
        self.assertIn(lectura['literal'], ' '.join((C / 'fga-180-pagina-1.txt').read_text().split()))

    def test_fga_deja_independientes_jornada_actividad_y_titulo_del_campeonato(self):
        catalogo = atletismo_fga.lecturas_documentales()
        for parte, i, archivo in [('Circular-168-', '112621', 'fga-168-extracto.txt'),
                                   ('2026-11-21-vigo-serie-provincial-3-', '120010', 'fga-vigo-3-extracto.txt')]:
            u, lectura = next((u, l) for u, l in catalogo.items() if parte in u)
            m = d.campos({**lectura, **lectura['citas'][i]}, u)
            texto = ' '.join((C / archivo).read_text().split())
            for valor in m.values():
                for dato in valor if isinstance(valor, list) else [valor]:
                    self.assertIn(dato['evidencia']['literal'], texto)
            if i == '112621':
                self.assertEqual(m['actividad']['valor'], 'competicion')
                self.assertNotIn('alcance', m)
                self.assertEqual(m['titulos'][0]['autoridad'], 'fga')
            else:
                self.assertEqual(m['alcance']['tipo'], 'jornada')
                self.assertNotIn('actividad', m)

    def test_dakar_circular_de_preseleccion_no_acredita_alcance_juegos_ni_cambia_fechas(self):
        u, lectura = next((u, l) for u, l in d.lecturas_documentales('rfea').items() if '/160-2026' in u)
        e = {'id': '65028', 'inicio': '2026-10-30', 'fin': '2026-11-15', 'metadatos': {
            'alcance': {'tipo': 'desconocido'}, 'documentos': [{'url': u, 'rol': 'circular'}]}}
        # El extracto de prueba no suplanta los bytes del PDF completo: la
        # verificación ya tiene una prueba con PDF reales y aquí se aísla la lectura.
        lector = d.Lecturas('rfea', lambda *a, **k: self.fail('No debe descargar el extracto como PDF'))
        lector.verificadas[u] = lectura
        lector.por_url[u] = {'ids_observados': ['65028'], 'estado': 'completa', 'ids_resueltos': ['65028']}
        lector.aplicar(e)
        self.assertEqual(e['metadatos']['alcance'], {'tipo': 'desconocido'})
        self.assertEqual(e['metadatos']['actividad']['valor'], 'competicion')
        self.assertEqual((e['inicio'], e['fin']), ('2026-10-30', '2026-11-15'))
        self.assertTrue(lector.avisos)

    def test_nunca_descarga_inscritos_resultados_o_clasificaciones(self):
        u, lectura = next(iter(d.lecturas_documentales('rfea').items()))
        for rol in d.NO_LEER:
            e = {'id': '64834', 'metadatos': {'documentos': [{'url': u, 'rol': rol}]}}
            d.completar('rfea', [e], lambda *a, **k: self.fail('No debe descargar esta superficie'))
            self.assertNotIn('actividad', e['metadatos'])


if __name__ == '__main__':
    unittest.main()
