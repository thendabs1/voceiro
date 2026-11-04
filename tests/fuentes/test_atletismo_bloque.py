"""Contrato del bloque `atletismo` v2 y lo que publica."""
from pathlib import Path
import re
import unittest

from agenda import atletismo, atletismo_bloque as b, publicacion

AHORA = '2026-11-02T20:00:00+01:00'
EVIDENCIA = {'superficie': 'ficha', 'url': 'https://atletismo.gal/competicions/prueba/', 'literal': 'Campionato'}


def cita(origen='fga', identificador='uno', /, **metadatos):
    return {'version': 1, 'fuente': origen, 'eventos': [{
        'id': identificador, 'nombre': 'IX Cross Ponte Romana', 'inicio': '2026-11-01', 'fin': '2026-11-03',
        'lugar': {'nombre': 'Lugo'}, 'url': atletismo.FUENTES[origen][1] + 'prueba', 'metadatos': metadatos}]}


class Contrato(unittest.TestCase):
    def valida(self, **metadatos):
        b.validar(metadatos, '2026-11-01', '2026-11-03')

    def rechaza(self, texto, **metadatos):
        with self.assertRaisesRegex(ValueError, texto):
            self.valida(**metadatos)

    def test_un_bloque_completo_es_valido(self):
        self.valida(
            alcance={'tipo': 'titulos', 'literal': 'Promoción y máster', 'evidencia': EVIDENCIA},
            temporalidad={'texto': '1 y 3 nov', 'dias': ['2026-11-01', '2026-11-03'], 'precision': 'dia',
                          'estado': 'suspension_parcial', 'estado_literal': 'Suspendida la 2.ª jornada', 'evidencia': EVIDENCIA},
            fuente={'relacion': 'reflejo', 'de': 'rfea', 'evidencia': EVIDENCIA},
            actividad={'valor': 'tecnificacion', 'escolar': True, 'evidencia': EVIDENCIA},
            titulos=[{'literal': 'Máster', 'evidencia': EVIDENCIA}],
            documentos=[{'url': 'https://atletismo.gal/a.pdf', 'nombre': 'Acta', 'rol': 'resultados',
                         'alcance_literal': 'reunión', 'hash': 'abc', 'evidencia': EVIDENCIA}],
            pertenencias=[{'padre_nativo': 'post-1', 'clase': 'circuito', 'evidencia': EVIDENCIA}])

    def test_lo_desconocido_no_necesita_evidencia_y_lo_acreditado_si(self):
        self.valida(alcance={'tipo': 'desconocido'}, fuente={'relacion': 'desconocido'}, actividad={'valor': 'desconocida'})
        self.rechaza('alcance necesita evidencia', alcance={'tipo': 'reunion'})
        self.rechaza('fuente necesita evidencia', fuente={'relacion': 'propio'})
        self.rechaza('actividad necesita evidencia', actividad={'valor': 'control'})
        self.rechaza('actividad necesita evidencia', actividad={'valor': 'desconocida', 'escolar': True})
        self.rechaza('necesita evidencia', documentos=[{'url': 'https://a.es/b.pdf', 'rol': 'normas'}])

    def test_los_documentos_actuales_sin_rol_siguen_siendo_validos(self):
        self.valida(documentos=[{'nombre': 'Regulamento', 'url': 'https://atletismo.gal/r.pdf'}])

    def test_la_evidencia_no_lleva_fecha_de_lectura(self):
        self.rechaza('claves desconocidas', alcance={'tipo': 'reunion', 'evidencia': {**EVIDENCIA, 'observado': AHORA}})

    def test_valores_y_claves_fuera_de_contrato(self):
        self.rechaza('valor desconocido', alcance={'tipo': 'liga', 'evidencia': EVIDENCIA})
        self.rechaza('claves desconocidas', fuente={'relacion': 'propio', 'evidencia': EVIDENCIA, 'nivel': 'nacional'})
        self.rechaza('valor desconocido', actividad={'valor': 'concentracion', 'evidencia': EVIDENCIA})
        self.rechaza('https', documentos=[{'url': 'http://a.es/b.pdf'}])
        self.rechaza('https', documentos=[{'url': 'https://u:c@a.es/b.pdf'}])
        self.rechaza('evidencia', titulos=[{'literal': 'Máster'}])
        self.rechaza('objeto', alcance='reunion')
        for url in ('https://a.es:roto/r.pdf', 'https://a.es:99999/r.pdf', 'https://a b.es/r.pdf'):
            self.rechaza('https', documentos=[{'url': url}])
        self.rechaza('texto', alcance={'tipo': 'reunion', 'literal': [], 'evidencia': EVIDENCIA})
        self.rechaza('texto', temporalidad={'texto': {}, 'evidencia': EVIDENCIA})
        self.rechaza('texto', temporalidad={'estado_literal': [], 'evidencia': EVIDENCIA})
        self.rechaza('texto', documentos=[{'url': 'https://a.es/b.pdf', 'nombre': 3}])
        self.rechaza('lista', documentos={})

    def test_los_dias_son_de_la_cita(self):
        t = {'evidencia': EVIDENCIA}
        self.rechaza('fuera de los días', temporalidad={**t, 'dias': ['2026-11-04']})
        self.rechaza('ordenada', temporalidad={**t, 'dias': ['2026-11-03', '2026-11-01']})
        self.rechaza('ordenada', temporalidad={**t, 'dias': ['2026-11-01', '2026-11-01']})
        self.rechaza('fecha ISO', temporalidad={**t, 'dias': ['1/11/2026']})

    def test_importar_valida_y_una_cita_sin_bloque_no_cambia(self):
        with self.assertRaisesRegex(ValueError, 'Bloque de atletismo'):
            atletismo.importar(None, cita(alcance={'tipo': 'liga'}), AHORA)
        publicada, = publicacion.proyectar(atletismo.importar(None, cita(modalidad_literal='Cross'), AHORA))['eventos']
        self.assertEqual(publicada['atletismo']['titulares'], ['fga:desconocido'])
        self.assertNotIn('actividades', publicada['atletismo'])

    def test_contrato_compartido_con_el_worker(self):
        js = (Path(__file__).parents[2] / 'shared/calendario/consulta.js').read_text(encoding='utf-8')
        lista = re.search(r'ACTIVIDADES_ATLETISMO = \[([^\]]*)\]', js)[1]
        self.assertEqual(re.findall(r"'([^']+)'", lista), [a for a in b.ACTIVIDADES if a != 'desconocida'])
        fuentes, relaciones = re.search(r'TITULAR_ATLETISMO = /\^\(([^)]+)\):\(([^)]+)\)', js).groups()
        self.assertEqual(set(fuentes.split('|')), set(atletismo.FUENTES))
        self.assertEqual(tuple(relaciones.split('|')), b.RELACIONES)


class Publicacion(unittest.TestCase):
    def test_titulares_por_fuente_y_actividad_acreditada_en_una_cita_compartida(self):
        fga = {'alcance': {'tipo': 'titulo', 'evidencia': EVIDENCIA}, 'fuente': {'relacion': 'reflejo', 'de': 'rfea', 'evidencia': EVIDENCIA}}
        rfea = {'fuente': {'relacion': 'propio', 'evidencia': EVIDENCIA}, 'actividad': {'valor': 'competicion', 'evidencia': EVIDENCIA}}
        n = atletismo.importar(None, cita('fga', 'gal', **fga), AHORA)
        n = atletismo.importar(n, cita('rfea', 'esp', **rfea), AHORA)
        e, = publicacion.proyectar(n)['eventos']
        self.assertEqual(e['atletismo']['titulares'], ['fga:reflejo', 'rfea:propio'])
        self.assertEqual(e['atletismo']['actividades'], ['competicion'])

    def test_una_cita_sin_metadatos_tambien_es_de_su_fuente(self):
        e, = publicacion.proyectar(atletismo.importar(None, cita(), AHORA))['eventos']
        self.assertEqual(e['atletismo']['titulares'], ['fga:desconocido'])

    def test_la_misma_lectura_no_crea_otra_observacion(self):
        p = cita(alcance={'tipo': 'titulo', 'evidencia': EVIDENCIA})
        n = atletismo.importar(None, p, AHORA)
        n2 = atletismo.importar(n, p, '2026-11-03T20:00:00+01:00')
        self.assertEqual(len(n2['observaciones']), len(n['observaciones']))
