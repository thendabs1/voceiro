"""Calendario anual real, descubrimiento paginado y enlaces sin red."""
from copy import deepcopy
from datetime import date
from hashlib import sha256
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

from bs4 import BeautifulSoup

from agenda import atletismo, atletismo_bloque, atletismo_calendario_pdf as p
from agenda import atletismo_coincidencias as c, atletismo_recogida as r, atletismo_revision, publicacion

M = Path(__file__).with_name('muestras_calendario') / 'atletismo' / 'rfea'
TEXTO = (M / 'calendario-2026.txt').read_text()
URL = 'https://atletismorfea.es/calendario.pdf'
AHORA = '2026-11-04T12:00:00+01:00'
OTRA = '2026-11-05T12:00:00+01:00'


def fila(nombre):
    return next(f for f in p.leer(TEXTO)['filas'] if f['nombre'] == nombre)


def cita(f, **cambios):
    return {**p.evento(f), 'id': 'ensayo',
            'url': 'https://atletismorfea.es/calendario/campeonato/ensayo', **cambios}


def indice():
    entradas = []
    for archivo in ('indice.html', 'indice-1.html'):
        e, _ = p.leer_indice((M / archivo).read_text())
        entradas.extend(e)
    return entradas


class CalendarioPDF(unittest.TestCase):
    def test_muestra_completa_379_y_literales_sin_normalizar(self):
        inventario = p.leer(TEXTO)
        self.assertEqual(len(inventario['filas']), 379)
        self.assertEqual(inventario['temporada'], '2026')
        self.assertEqual(inventario['actualizado'], '2026-04-21')
        categorias = {f['categoria_literal'] for f in inventario['filas']}
        self.assertTrue({'Internacional 2', 'Internacional II'} <= categorias)
        self.assertTrue(any(f['sede_literal'] == 'a designar' for f in inventario['filas']))
        # Febrero continúa en página 3 sin repetir el separador de mes.
        f = next(f for f in inventario['filas'] if f['pagina'] == 3)
        self.assertEqual((f['inicio'], f['fila']), ('2026-02-07', 1))

    def test_rango_30_15_y_dias_17_20_21(self):
        f = fila('Juegos Olimpicos de la Juventud')
        self.assertEqual((f['dia_literal'], f['inicio'], f['fin']), ('30/15', '2026-10-30', '2026-11-15'))
        f = fila('Campeonato de Asturias Sub23 y Abs')
        self.assertEqual((f['inicio'], f['fin']), ('2026-06-17', '2026-06-21'))
        self.assertEqual(f['dias'], ['2026-06-17', '2026-06-20', '2026-06-21'])

    def test_estructura_desconocida_y_cabeceras_ausentes_fallan(self):
        for texto in (TEXTO + 'Nueva columna desconocida',
                      TEXTO.replace('CALENDARIO RFEA 2026', ''),
                      TEXTO.replace('CALENDARIO RFEA 2026', 'CALENDARIO RFEA'),
                      TEXTO.replace('Actualizado a 21 abril 2026', '')):
            with self.subTest(texto=texto[-30:]), self.assertRaises(ValueError):
                p.leer(texto)

    def test_descubrimiento_65_2026_fecha_mayor_y_proyectos_descartados(self):
        entradas = indice()
        elegida = p.seleccionar(entradas, '2026')
        self.assertEqual((elegida['numero'], elegida['fecha']), ('65-2026', '2026-04-27'))
        self.assertEqual(len([e for e in entradas if e['numero'] == '65-2026']), 2)
        with self.assertRaises(p.SinCalendario):
            p.seleccionar(entradas, '2027')
        with self.assertRaisesRegex(ValueError, 'ambigua'):
            p.seleccionar([elegida, {**elegida, 'url': URL}], '2026')
        p.confirmar_portada(TEXTO, elegida, '2026')
        for texto in (TEXTO.replace('Calendario Nacional 2026', 'Proyecto Calendario Nacional 2026'),
                      TEXTO.replace('CIRCULAR Nº:065/2026', 'CIRCULAR Nº:008/2026'),
                      TEXTO.replace('Calendario Nacional 2026', 'Calendario Nacional 2027')):
            with self.assertRaises(ValueError):
                p.confirmar_portada(texto, elegida, '2026')

    def test_enlace_unico_copia_solo_categoria_y_evidencia_con_contrato_existente(self):
        f = fila('Campeonato de España 5 km Master')
        e = cita(f)
        anterior = deepcopy(e)
        informe = p.enlazar([e], {'filas': [f]}, URL)
        self.assertEqual(informe, {'automaticas': 1, 'a_revision': 0, 'sin_fila': 0})
        meta = e['metadatos']
        self.assertEqual(meta['calendarios'][0], {'calendario': 'rfea', 'categoria_literal': 'RFEA',
            'evidencia': {'superficie': 'documento', 'url': URL,
                         'localizador': f"página {f['pagina']}, fila {f['fila']}", 'literal': 'RFEA'}})
        self.assertEqual({k: v for k, v in e.items() if k != 'metadatos'},
                         {k: v for k, v in anterior.items() if k != 'metadatos'})
        atletismo_bloque.validar(meta, e['inicio'], e['fin'], fuente='rfea')

    def test_dos_filas_castro_no_enlazan_y_una_revision_impide_automatica(self):
        filas = [f for f in p.leer(TEXTO)['filas'] if 'Castro Urdiales (Cantabria)' == f['sede_literal']]
        e = cita(filas[0], nombre='Campeonato de España de Marcha de Invierno de Promoción y 10 km Master')
        informe = p.enlazar([e], {'filas': filas}, URL)
        self.assertEqual(informe['a_revision'], 1)
        self.assertNotIn('calendarios', e['metadatos'])
        # Ni dos automáticas ni una automática acompañada de revisión se enlazan.
        f = fila('Campeonato de España 5 km Master')
        for otra in (deepcopy(f), {**f, 'fin': '2026-11-23'}):
            e = cita(f)
            self.assertEqual(p.enlazar([e], {'filas': [f, otra]}, URL)['a_revision'], 1)
            self.assertNotIn('calendarios', e['metadatos'])

    def test_albacete_no_es_crevillent_atapuerca_21_22_no_es_22(self):
        for f, cambios in ((fila('XL San Silvestre Internacional Crevillentina 2026'),
                            {'lugar': {'nombre': 'Albacete'}}),
                           (fila('XXII Cross Internacional de Atapuerca'), {'inicio': '2026-11-21'})):
            e = cita(f, **cambios)
            self.assertEqual(p.enlazar([e], {'filas': [f]}, URL)['automaticas'], 0)
            self.assertNotIn('calendarios', e['metadatos'])

    def test_la_provincia_entre_parentesis_no_cambia_la_sede(self):
        f = fila('Campeonato de España 5 km Master')
        self.assertIn(' (', f['sede_literal'])
        e = cita(f, lugar={'nombre': f['sede_literal'].split(' (')[0]})
        self.assertEqual(p.enlazar([e], {'filas': [f]}, URL)['automaticas'], 1)

    def test_pdf_no_crea_citas_y_excluye_nivel_ii(self):
        f = fila('Campeonato de España 5 km Master')
        e = cita(f, id='nivel-ii:ensayo')
        eventos = [e]
        self.assertEqual(p.enlazar(eventos, p.leer(TEXTO), URL),
                         {'automaticas': 0, 'a_revision': 0, 'sin_fila': 0})
        self.assertEqual(len(eventos), 1)
        self.assertNotIn('calendarios', e['metadatos'])

    def test_segunda_pasada_identica_y_huella_de_issues_sin_calendarios(self):
        e = cita(fila('Campeonato de España 5 km Master'))
        caso = {'motivo': 'revisión', 'comparacion': {'estado': 'revisar'}, 'citas': [deepcopy(e)]}
        huella = atletismo_revision.huella(caso)
        p.enlazar([e], p.leer(TEXTO), URL)
        pagina = {'version': 1, 'fuente': 'rfea', 'eventos': [e]}
        n = atletismo.importar(None, pagina, AHORA)
        p.enlazar([e], p.leer(TEXTO), URL)
        otra = atletismo.importar(n, pagina, OTRA)
        self.assertEqual(set(n['observaciones']), set(otra['observaciones']))
        self.assertEqual(n['referencias'], otra['referencias'])
        self.assertTrue(publicacion.proyectar(otra)['eventos'][0]['atletismo']['variantes'][0]['valor']['calendarios'])
        caso['citas'] = [e]
        self.assertEqual(atletismo_revision.huella(caso), huella)


class RecogidaCalendarioPDF(unittest.TestCase):
    def preparar(self, fallo=None):
        f = fila('Campeonato de España 5 km Master')
        e = cita(f)
        elegida = p.seleccionar(indice(), '2026')
        llamadas = []

        def obtener(url, *, binario=False):
            llamadas.append((url, binario))
            if url == p.INDICE:
                return (M / 'indice.html').read_text()
            if url == p.INDICE + '&page=1':
                s = BeautifulSoup((M / 'indice-1.html').read_text(), 'html.parser')
                s.select_one('.pager').decompose()
                return str(s)
            if url == elegida['url']:
                if fallo:
                    raise fallo
                self.assertTrue(binario)
                return b'%PDF-\xff\x00captura'
            raise AssertionError('Petición inesperada: ' + url)
        return e, obtener, llamadas

    def test_recogida_presupuesto_metadatos_y_segunda_pasada(self):
        e, obtener, llamadas = self.preparar()
        entrada = {'version': 1, 'fuente': 'rfea', 'eventos': [e]}
        proceso = subprocess.CompletedProcess([], 0, stdout=TEXTO)
        with patch.dict(r.LECTORES, rfea=lambda *a: (deepcopy(entrada), {'completo': True, 'pendientes': []})), \
                patch.object(r.subprocess, 'run', return_value=proceso):
            primera, informe = r.recoger('rfea', '2026-11-01', '2026-12-31', descargar=obtener)
            n = atletismo.importar(None, primera, AHORA)
            segunda, otro_informe = r.recoger('rfea', '2026-11-01', '2026-12-31', descargar=obtener,
                                            conocidas=c.actuales(n))
            otra = atletismo.importar(n, segunda, OTRA)
            self.assertEqual(primera, segunda)
            self.assertEqual(informe, otro_informe)
            self.assertEqual(set(n['observaciones']), set(otra['observaciones']))
            _, agotado = r.recoger('rfea', '2026-11-01', '2026-12-31', descargar=obtener,
                                  conocidas=c.actuales(n), max_peticiones=2)
        self.assertEqual(informe['peticiones'], 3)
        self.assertEqual((informe['calendario_pdf']['peticiones_indice'], informe['calendario_pdf']['peticiones_pdf']), (2, 1))
        self.assertEqual(informe['calendario_pdf']['automaticas'], 1)
        documento, = informe['calendario_pdf']['documentos']
        self.assertEqual((documento['numero'], documento['fecha'], documento['actualizado'], documento['filas']),
                         ('65-2026', '2026-04-27', '2026-04-21', 379))
        self.assertEqual(documento['sha256'], sha256(b'%PDF-\xff\x00captura').hexdigest())
        self.assertFalse(agotado['calendario_pdf']['completo'])
        self.assertEqual(agotado['peticiones'], 2)
        self.assertEqual(agotado['calendario_pdf']['peticiones_pdf'], 0)

    def test_temporada_sin_calendario_aprobado_avisa_sin_fallar_y_no_pide_pdf(self):
        e, obtener, llamadas = self.preparar()
        e['inicio'] = e['fin'] = '2027-01-10'
        entrada = {'version': 1, 'fuente': 'rfea', 'eventos': [e]}
        with patch.dict(r.LECTORES, rfea=lambda *a: (entrada, {'completo': True, 'pendientes': []})):
            _, informe = r.recoger('rfea', '2026-12-01', '2027-01-31', descargar=obtener)
        self.assertTrue(informe['completo'])
        self.assertEqual(informe['calendario_pdf']['consultas_pdf'], [])
        self.assertTrue(any('2027' in a for a in informe['calendario_pdf']['avisos']))

    def test_pdf_caido_conserva_anterior_y_no_crea_observaciones(self):
        e, obtener, llamadas = self.preparar(OSError('PDF caído'))
        p.enlazar([e], p.leer(TEXTO), URL)
        pagina = {'version': 1, 'fuente': 'rfea', 'eventos': [deepcopy(e)]}
        n = atletismo.importar(None, pagina, AHORA)
        entrada = deepcopy(pagina)
        entrada['eventos'][0]['metadatos'].pop('calendarios')
        with patch.dict(r.LECTORES, rfea=lambda *a: (entrada, {'completo': True, 'pendientes': []})):
            leida, informe = r.recoger('rfea', '2026-11-01', '2026-12-31', descargar=obtener,
                                      conocidas=c.actuales(n))
        otra = atletismo.importar(n, leida, OTRA)
        self.assertEqual(set(n['observaciones']), set(otra['observaciones']))
        self.assertEqual(leida, pagina)
        self.assertFalse(informe['calendario_pdf']['completo'])
        self.assertEqual(informe['calendario_pdf']['peticiones_pdf'], 1)
        self.assertTrue(any('PDF caído' in a for a in informe['calendario_pdf']['avisos']))
