"""Cruces comunes y sus consumidores reales; sin red ni base de producción."""

from copy import deepcopy
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from shared.territorios import cargar, problemas_territoriales, resolver, territorios_medio
from medios import categoria_de, problemas_forma_emisor, todos_los_medios
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
        paises = json.loads((RAIZ / 'shared/territorios/paises.json').read_text())
        self.assertEqual(len(cargar().entidades), len(paises['paises']) + 19 + 52 + 8132)

    def test_pais_del_catalogo_se_publica_sin_inventar_cobertura_internacional(self):
        medios = {'bbc.com': {'pais': 'reino-unido', 'ambito': 'internacional'},
                  'africanews.com': {'pais': 'africa', 'ambito': 'internacional'},
                  'desconocido.test': {'pais': 'desconocido', 'ambito': 'internacional'},
                  'extranjero.test': {'pais': 'reino-unido', 'ambito': 'nacional'}}
        with patch.object(catalogo, '_MEDIOS_POR_DOMINIO', medios):
            completo = catalogo._catalogo_completo()
            slice_ = catalogo._tabla_medios_slice([
                {'dominio': 'extranjero.test', 'alt': [{'d': 'bbc.com'}, {'d': 'africanews.com'}]}])
        esperado = [{'territorio': 'pais:GB', 'papel': 'pais_catalogo'}]
        for vista in (completo, slice_):
            self.assertEqual(vista['bbc.com']['territorios'], esperado)
            self.assertEqual(vista['extranjero.test']['territorios'], esperado)
            self.assertEqual(vista['bbc.com']['pais'], 'reino-unido')
            self.assertEqual(vista['africanews.com']['pais'], 'africa')
            self.assertNotIn('territorios', vista['africanews.com'])
        self.assertNotIn('territorios', completo['desconocido.test'])

    def test_el_catalogo_real_resuelve_paises_y_conserva_la_agrupacion_africana(self):
        pendientes = set()
        for medio in todos_los_medios():
            if medio.get('pais'):
                territorio = resolver('medios:pais', medio['pais'])
                if territorio is None:
                    pendientes.add((medio['d'], medio['pais']))
                else:
                    self.assertEqual(territorio['tipo'], 'pais')
                    self.assertEqual(territorio['ancestros'], [])
        self.assertEqual(pendientes, {('africanews.com', 'africa')})

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

    def test_sede_y_cobertura_explicitas_son_opcionales_y_no_cambian_el_catalogo(self):
        for medio in todos_los_medios():
            with self.subTest(medio=medio['d']):
                self.assertFalse({'clase', 'sede', 'cobertura'} & set(medio))
                self.assertEqual(problemas_forma_emisor(medio), [])
                self.assertEqual(problemas_territoriales(medio), [])
                self.assertFalse([r for r in territorios_medio(medio) if r['papel'] == 'sede'])

    def test_cobertura_explicita_resuelta_sustituye_a_la_heredada_y_admite_varios_destinos(self):
        medio = {'d': 'vigo.test', 'ambito': 'regional', 'region': 'galicia',
                 'cobertura': {'estado': 'resuelto', 'evidencias': [{'doc': 'x'}],
                               'territorios': ['es:provincia:36', 'es:autonomia:12', 'es:provincia:36']}}
        self.assertEqual(territorios_medio(medio), [
            {'territorio': 'es:provincia:36', 'papel': 'cobertura_editorial'},
            {'territorio': 'es:autonomia:12', 'papel': 'cobertura_editorial'}])
        self.assertEqual(problemas_forma_emisor(medio), [])
        self.assertEqual(problemas_territoriales(medio), [])

    def test_la_cobertura_de_un_medio_no_baja_de_provincia(self):
        medio = {'d': 'vigo.test', 'ambito': 'regional', 'region': 'galicia',
                 'cobertura': {'estado': 'resuelto', 'evidencias': [1],
                               'territorios': ['es:provincia:36', 'es:municipio:36057']}}
        self.assertEqual(territorios_medio(medio), [{'territorio': 'es:provincia:36', 'papel': 'cobertura_editorial'}])
        self.assertEqual(len(problemas_territoriales(medio)), 1)
        # la sede sí puede ser municipal
        sede = {'d': 'club.test', 'sede': [{'estado': 'resuelto', 'territorio': 'es:municipio:36057', 'evidencias': [1]}]}
        self.assertEqual(problemas_territoriales(sede), [])

    def test_cobertura_pendiente_o_en_conflicto_no_reactiva_la_cobertura_amplia(self):
        for estado in ('pendiente', 'conflicto'):
            with self.subTest(estado=estado):
                medio = {'d': 'vigo.test', 'ambito': 'regional', 'region': 'galicia', 'pais': 'reino-unido',
                         'cobertura': {'estado': estado, 'territorios': [], 'candidatos': ['es:municipio:36057']}}
                self.assertEqual(territorios_medio(medio), [{'territorio': 'pais:GB', 'papel': 'pais_catalogo'}])
                self.assertEqual(problemas_forma_emisor(medio), [])
        # `cobertura: None` o ausente no es lo mismo que una lista vacía resuelta
        self.assertEqual(territorios_medio({'d': 'a', 'ambito': 'regional', 'region': 'galicia', 'cobertura': None}),
                         [{'territorio': 'es:autonomia:12', 'papel': 'cobertura_editorial'}])

    def test_la_sede_no_genera_cobertura_ni_localiza(self):
        medio = {'d': 'club.test', 'ambito': 'nacional', 'clase': 'club',
                 'sede': [{'estado': 'resuelto', 'territorio': 'es:municipio:36038', 'funcion': 'editorial',
                           'evidencias': [{'doc': 'aviso legal'}]},
                          {'estado': 'pendiente', 'territorio': None}],
                 'cobertura': {'estado': 'pendiente', 'territorios': []}}
        self.assertEqual(territorios_medio(medio), [{'territorio': 'es:municipio:36038', 'papel': 'sede'}])
        self.assertEqual(problemas_forma_emisor(medio), [])

    def test_forma_invalida_y_territorios_desconocidos_se_senalan(self):
        malos = [{'clase': 'otra'},
                 {'sede': {'estado': 'resuelto'}},
                 {'sede': [{'estado': 'resuelto', 'territorio': 'es:municipio:36038'}]},
                 {'sede': [{'estado': 'quizas'}]},
                 {'sede': [{'estado': 'pendiente', 'territorio': 'es:municipio:36038'}]},
                 {'sede': [{'estado': 'pendiente', 'funcion': 'fiscal'}]},
                 {'cobertura': {'estado': 'resuelto', 'territorios': ['es:autonomia:12']}}]
        for extra in malos:
            with self.subTest(extra=extra):
                self.assertTrue(problemas_forma_emisor({'d': 'x.test', **extra}))
        inventado = {'d': 'x.test', 'cobertura': {'estado': 'resuelto', 'evidencias': [1],
                                                  'territorios': ['es:municipio:00000']}}
        self.assertEqual(problemas_forma_emisor(inventado), [])
        self.assertEqual(len(problemas_territoriales(inventado)), 1)
        self.assertEqual(territorios_medio(inventado), [])

    def test_categoria_estructurada_reproduce_el_literal_de_grupo(self):
        casos = {('generalista', 'nacional'): ('Nacional', None),
                 ('generalista', 'regional'): ('Regional', 'Galicia'),
                 ('generalista', 'internacional'): ('Internacional', 'Reino Unido'),
                 ('deportes', 'nacional'): ('Deportes', None)}
        base = {'region': 'galicia', 'pais': 'reino-unido'}
        for (sector, ambito), esperado in casos.items():
            self.assertEqual(categoria_de({**base, 'sector': sector, 'ambito': ambito}), esperado)
        for medio in todos_los_medios():
            categoria, sub = categoria_de(medio)
            self.assertEqual(medio['grupo'], f'{categoria} · {sub}' if sub else categoria, medio['d'])

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
