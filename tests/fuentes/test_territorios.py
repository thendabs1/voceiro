"""Cruces comunes y sus consumidores reales; sin red ni base de producción."""

from copy import deepcopy
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from shared.territorios import cargar, resolver
from cosecha import catalogo
from agenda import nucleo, retencion
from agenda.publicacion import proyectar
from agenda.transicion import ampliar
from test_agenda import construir, ficha
from test_calendario_nucleo import importar_feb


RAIZ = Path(__file__).resolve().parents[2]


class Territorios(unittest.TestCase):
    def test_codigos_y_jerarquias_comparten_casos_con_javascript(self):
        casos = json.loads((RAIZ / 'tests/territorios/casos.json').read_text())
        for caso in casos:
            with self.subTest(caso=caso):
                dato = resolver(caso['sistema'], caso['codigo'])
                self.assertEqual(dato['id'] if dato else None, caso['id'])
                if dato:
                    self.assertEqual(dato['ancestros'], caso['ancestros'])
        self.assertEqual(len(cargar().entidades), 1 + 19 + 52 + 8132)

    def test_prensa_publica_cobertura_y_conserva_los_codigos_editoriales(self):
        medios = {'gal.test': {'region': 'galicia', 'ambito': 'regional', 'n': 'Gal'},
                  'nac.test': {'ambito': 'nacional'},
                  'otro.test': {'region': 'sin-correspondencia', 'ambito': 'regional'}}
        with patch.object(catalogo, '_MEDIOS_POR_DOMINIO', medios):
            completo = catalogo._catalogo_completo()
            slice_ = catalogo._tabla_medios_slice([{'dominio': 'nac.test', 'alt': [{'d': 'gal.test'}]}])
        esperado = [{'territorio': 'es:autonomia:12', 'papel': 'cobertura_editorial'}]
        self.assertEqual(completo['gal.test']['territorios'], esperado)
        self.assertEqual(slice_['gal.test']['territorios'], esperado)
        self.assertEqual(slice_['nac.test']['territorios'][0]['territorio'], 'pais:ES')
        self.assertEqual(completo['gal.test']['region'], 'galicia')
        self.assertNotIn('territorios', completo['otro.test'])

    def test_agenda_enlaza_municipio_sin_cambiar_ids_y_rechaza_control_incorrecto(self):
        n = ampliar(construir([ficha()]))['nucleo']
        previo = deepcopy(n)
        p = proyectar(n, ['cultura-galicia'])
        self.assertEqual(n, previo)
        evento = p['eventos'][0]
        self.assertEqual(evento['id'], next(e['id'] for e in n['entidades'].values() if e['tipo'] == 'evento'))
        self.assertEqual(evento['territorios'], [{'territorio': 'es:municipio:36038', 'papel': 'celebracion',
            'ancestros': ['es:provincia:36', 'es:autonomia:12', 'pais:ES']}])
        self.assertEqual(proyectar(n, [])['eventos'], [])
        for o in n['observaciones'].values():
            if 'identificadores' in o['bloques']:
                o['bloques']['identificadores']['ine_cpro_cmun_dc'] = '360389'
        self.assertEqual(proyectar(n)['eventos'][0]['territorios'], [])

    def test_no_hereda_ubicacion_de_una_competicion_ni_resuelve_nora_por_nombre(self):
        c = nucleo.Constructor()
        c.n['fuentes']['prueba'] = {'nombre': 'Prueba'}
        doc = c.documento('prueba', {'muestra': True})
        def entidad(tipo, clase, codigo, bloques=None):
            return c.entidad('prueba', tipo, codigo, {}, tipo, clase, {'es': codigo}, doc,
                             '/' + codigo, '2026-10-25T12:00:00Z', bloques=bloques)
        evento, ev = entidad('evento', 'encuentro', 'partido')
        grupo, _ = entidad('agrupacion', 'competicion', 'liga')
        lugar, _ = entidad('territorio', 'municipio', 'Pontevedra', {'identificadores': {'ine': '36038'}})
        nora, _ = entidad('territorio', 'municipio', 'Donostia', {'identificadores': {'nora': '069', 'provincia_nora': '20'}})
        c.relacion('pertenece_a', evento, grupo, ev)
        c.relacion('se_celebra_en', grupo, lugar, ev)
        c.relacion('se_celebra_en', evento, nora, ev)
        p = proyectar(c.terminar())
        self.assertEqual(p['eventos'][0]['territorios'], [])
        self.assertEqual(p['entidades'][nucleo.clave(nora)]['territorio_estado'], 'pendiente')


class Retencion(unittest.TestCase):
    def test_45_dias_desde_el_fin_confirmado_sin_modificar_el_nucleo(self):
        n = ampliar(construir([ficha(data={'dataInicio': '2026-10-26 18:00:00',
                                          'dataFin': '2026-10-26 19:00:00'})]))['nucleo']
        previo = deepcopy(n)
        self.assertEqual(retencion.planificar(n, '2026-12-10T17:59:59Z')['candidatos'], [])
        informe = retencion.planificar(n, '2026-12-10T18:00:00Z')
        self.assertEqual(len(informe['candidatos']), 1)
        self.assertEqual(informe['modo'], 'informe_sin_borrado')
        self.assertEqual(n, previo)

    def test_falta_fin_aplazado_intervalo_y_deportes_se_conservan(self):
        cambios = [dict(data={'dataInicio': '2026-10-26 18:00:00', 'dataFin': None}),
                   dict(estado={'chave': 'postponed'}),
                   dict(data={'dataInicio': '2026-10-26 18:00:00', 'dataFin': '2026-11-05 18:00:00'})]
        for cambio in cambios:
            with self.subTest(cambio=cambio):
                n = ampliar(construir([ficha(**cambio)]))['nucleo']
                self.assertEqual(retencion.planificar(n, '2027-06-01T12:00:00Z')['candidatos'], [])
        self.assertEqual(retencion.planificar(importar_feb(), '2027-06-01T12:00:00Z')['candidatos'], [])
