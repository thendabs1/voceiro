"""F01–F14 y D-* con capturas reducidas; toda resolución es local, sin red."""
from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from agenda import atletismo, atletismo_bloque, atletismo_coincidencias as c
from agenda import atletismo_fga as f, atletismo_recogida as r, publicacion, tiempos

M = Path(__file__).with_name('muestras_calendario') / 'atletismo' / 'fga'
AHORA = '2026-11-04T12:00:00+01:00'


def html(nombre):
    return (M / nombre).read_text()


def ficha(nombre):
    return f.leer_ficha(html(nombre), url='https://atletismo.gal/competicions/prueba/')


def captura(url):
    indice = json.loads((M / 'capturas.json').read_text())
    if url not in indice:
        raise FileNotFoundError('Captura no disponible: ' + url)
    return html(indice[url]['archivo'])


def evento_de_ficha(nombre):
    x = ficha(nombre)
    t = x['metadatos']['temporalidad']
    return {'id': x['id'], 'nombre': x['nombre'], 'url': 'https://atletismo.gal/competicions/prueba/',
            'inicio': t['dias'][0], 'fin': t['dias'][-1], 'metadatos': x['metadatos'],
            'estado': f.programacion(t['estado']), 'programa': x['programa']}


class CasosFGA(unittest.TestCase):
    def test_F01_tres_dias_cruzan_mes_sin_cambiar_post(self):
        e, = atletismo.leer_galicia(html('listado-112655.html'))
        self.assertEqual(e['id'], '112655')
        self.assertEqual(e['metadatos']['temporalidad']['dias'], ['2026-02-27', '2026-02-28', '2026-03-01'])

    def test_F02_dias_separados_no_ocupan_huecos_y_reimportacion_es_estable(self):
        e = evento_de_ficha('fga-0208-7658bf0c24ad.html')
        self.assertEqual(e['metadatos']['temporalidad']['dias'], ['2026-05-24', '2026-05-27'])
        entrada = {'version': 1, 'fuente': 'fga', 'eventos': [e]}
        n = atletismo.importar(None, entrada, AHORA)
        cuando = c.actuales(n)[0]
        self.assertEqual(cuando['id'], '112583')
        valor = publicacion.proyectar(n)['eventos'][0]['programacion']['valor']['cuando']
        self.assertFalse(tiempos.en_intervalo(valor, '2026-05-25', '2026-05-27'))
        self.assertTrue(tiempos.en_intervalo(valor, '2026-05-27', '2026-05-28'))
        otra = atletismo.importar(n, entrada, '2026-11-05T12:00:00+01:00')
        self.assertEqual(set(otra['observaciones']), set(n['observaciones']))
        self.assertEqual(otra['referencias'], n['referencias'])

    def test_F03_padre_pgta_en_enero_y_noviembre_sin_cita_1_1(self):
        x = ficha('fga-0009-27d2caa6643d.html')
        self.assertEqual((x['id'], len(x['hijos']), x['clase']), ('119957', 25, 'coleccion'))
        self.assertEqual(x['metadatos']['alcance']['tipo'], 'publicacion')
        self.assertTrue(any('??/10' in p for p in x['pendientes']))
        def obtener(url):
            if url.startswith(f.API):
                return json.dumps([{'id': 119957, 'title': x['nombre'], 'main_date': '2026-01-01', 'all_dates': ['2026-01-01']}])
            if '?' in url:
                return html('listado-119957.html')
            return html('fga-0009-27d2caa6643d.html')
        entrada, informe = r.recoger('fga', '2026-01-01', '2026-01-01', descargar=obtener)
        self.assertEqual(entrada['eventos'], [])
        self.assertEqual([(g['id'], g['clase']) for g in entrada['agrupaciones']], [('119957', 'coleccion')])
        self.assertTrue(any(p['id'] == '119957' and '??/10' in p['motivo'] for p in informe['avisos']))

    def test_F04_clasificaciones_son_publicacion_y_discrepancia_pendiente(self):
        x = ficha('fga-0360-52dd4afb3da3.html')
        self.assertEqual(x['id'], '126718')
        self.assertEqual(x['metadatos']['alcance']['tipo'], 'publicacion')
        self.assertEqual({d['rol'] for d in x['metadatos']['documentos']}, {'clasificacion'})
        self.assertTrue(x['pendientes'])
        self.assertEqual(x['hijos'], [])

    def test_F05_un_post_dos_circulares_de_control_y_ningun_href_inventado(self):
        x = ficha('fga-0101-813fd655cc9a.html')
        self.assertEqual(x['id'], '99497')
        self.assertEqual(x['metadatos']['actividad']['valor'], 'control')
        self.assertEqual(len([d for d in x['metadatos']['documentos'] if d['rol'] == 'circular']), 2)
        self.assertEqual({s['id'] for s in x['programa']},{'manana','tarde'})
        e=evento_de_ficha('fga-0101-813fd655cc9a.html')
        n=atletismo.importar(None,{'version':1,'fuente':'fga','eventos':[e]},AHORA)
        vista=publicacion.proyectar(n)['eventos']
        self.assertEqual(len(vista),1)
        self.assertEqual(len(vista[0]['programa']),2)
        self.assertTrue(all(u['url'] != f.BASE for u in x['metadatos']['inscripcion']['enlaces']))
        self.assertFalse(any(d['url'] == f.BASE for d in x['metadatos']['documentos']))

    def test_F06_dos_posts_control_no_se_fusionan_ni_fabrican_serie(self):
        eventos = [evento_de_ficha('fga-0104-bde9c8f0a2b2.html'), evento_de_ficha('fga-0105-0f8408497c14.html')]
        n = atletismo.importar(None, {'version': 1, 'fuente': 'fga', 'eventos': eventos}, AHORA)
        self.assertEqual({e['id'] for e in c.actuales(n)}, {'93258', '93259'})
        self.assertTrue(all(e['metadatos']['actividad']['valor'] == 'control' for e in c.actuales(n)))
        self.assertTrue(all(e['metadatos']['alcance']['tipo'] == 'sesion' for e in c.actuales(n)))
        self.assertFalse(any(e['clase'] == 'circuito' for e in n['entidades'].values()))

    def test_F07_suspension_parcial_conserva_resultados_y_programacion(self):
        e = evento_de_ficha('fga-0112-a7f22d2c3e04.html')
        self.assertEqual(e['metadatos']['temporalidad']['estado'], 'suspension_parcial')
        self.assertIn('tarde', e['metadatos']['temporalidad']['estado_literal'])
        self.assertEqual(e['estado'], 'programado')
        self.assertTrue(any(d['rol'] == 'resultados' for d in e['metadatos']['documentos']))
        self.assertEqual(f.programacion('suspendido'), 'aplazado')
        for estado in ('programado', 'aplazado', 'cancelado', 'desconocido'):
            self.assertEqual(f.programacion(estado), estado)

    def test_F08_aplazado_sin_fecha_nueva(self):
        e = evento_de_ficha('fga-0114-5080770a6c0e.html')
        self.assertEqual(e['estado'], 'aplazado')
        self.assertEqual(e['inicio'], '2026-09-26')
        self.assertEqual(e['metadatos']['temporalidad']['dias'], ['2026-09-26'])

    def test_F09_cuarentena_aislada_no_tira_el_resto_ni_aplica_ausencias(self):
        # La envoltura API/listado se sintetiza para introducir el registro
        # corrupto junto a uno sano. Las fichas son las capturas reales.
        bueno = evento_de_ficha('fga-0114-5080770a6c0e.html')
        def listado(i, nombre, url, dia):
            return f'<article class="type-competition post-{i}"><h2><a href="{url}">{nombre}</a></h2><div class="space-x-2"><div><span>{dia}</span></div></div></article>'
        urls = {bueno['url']: html('fga-0114-5080770a6c0e.html'), f.BASE+'roto/': html('fga-0199-7f78a2aafce7.html')}
        def obtener(url):
            if url.startswith(f.API):
                return json.dumps([{'id': 126688, 'title': bueno['nombre'], 'main_date': '2026-09-26', 'all_dates': ['2026-09-26']},
                    {'id': 94411, 'title': 'Registro incompatible', 'main_date': '2024-10-19', 'all_dates': ['2022-10-20', '2024-10-19']}])
            if '?' in url:
                return '<div id="competitionList">'+listado('126688',bueno['nombre'],bueno['url'],'26/09/2026')+listado('94411','Registro incompatible',f.BASE+'roto/','26/09/2026')+'</div>'
            return urls[url]
        entrada, informe = r.recoger('fga', '2026-09-01', '2026-09-30', descargar=obtener,
                                     conocidas=[{'id':'99','inicio':'2026-09-05','fin':'2026-09-05'}])
        self.assertEqual([e['id'] for e in entrada['eventos']], ['126688'])
        self.assertTrue(any(p['id'] == '94411' and p.get('cuarentena') for p in informe['pendientes']))
        self.assertFalse(informe['completo'])
        self.assertEqual(informe['ausencias'], [])
        self.assertTrue(any(s['estado'] == 'parcial' for s in informe['superficies']))

    def test_F10_titulos_documentados_no_solo_el_titulo_de_ficha(self):
        x = ficha('fga-0194-027d97e373d1.html')['metadatos']
        self.assertEqual(x['alcance']['tipo'], 'titulos')
        self.assertEqual(len(x['titulos']), 4)
        self.assertTrue(all(t['evidencia']['superficie'] == 'documento' for t in x['titulos']))

    def test_F11_marcha_sub20_sub23_no_confundir_con_admision_sub16(self):
        titulos = ficha('fga-0118-f603ac5ccea0.html')['metadatos']['titulos']
        self.assertEqual(len(titulos), 3)
        self.assertFalse(any('16' in t['literal'] for t in titulos))
        self.assertTrue(any('Sub 20' in t['literal'] for t in titulos))
        self.assertTrue(any('Sub 23' in t['literal'] for t in titulos))

    def test_F12_dos_ids_y_chid_literal_sin_marcas_ni_equivalencia(self):
        uno = evento_de_ficha('fga-0099-556a3d5f8e06.html')
        dos = evento_de_ficha('fga-0124-a3e75f02c725.html')
        n = atletismo.importar(None, {'version': 1, 'fuente': 'fga', 'eventos': [uno,dos]}, AHORA)
        self.assertEqual(len(c.actuales(n)), 2)
        self.assertTrue(any(d['rol'] == 'resultados' and 'chid=2026GAL66195' in d['url'] for d in uno['metadatos']['documentos']))
        self.assertNotIn('resultados', uno['metadatos'])

    def test_F13_xogade_padre_nueve_hijas_coleccion_escolar_documentado(self):
        x = ficha('pulido-ac2edb83c4831e9f0102.body')
        self.assertEqual((x['id'],len(x['hijos']),x['clase']), ('94143',9,'coleccion'))
        self.assertTrue(x['metadatos']['actividad']['escolar'])
        self.assertEqual(x['metadatos']['actividad']['evidencia']['superficie'], 'documento')

    def test_F14_escaneado_no_se_interpreta_como_documento_vacio(self):
        x = ficha('pulido-427320306315240b59a9.body')
        self.assertEqual(x['id'], '127785')
        self.assertEqual(x['metadatos']['temporalidad']['dias'], ['2026-11-06'])
        self.assertTrue(any('escaneado' in p for p in x['pendientes']))
        self.assertEqual(x['metadatos']['actividad']['valor'], 'desconocida')
        self.assertTrue(any(d['rol'] == 'normas' for d in x['metadatos']['documentos']))

    def test_D_ocho_delegaciones_subconjuntos_con_mismo_post_y_procedencia(self):
        central = {e['id']:e for e in atletismo.leer_galicia(html('fga-0079-085c26260582.html'))}
        indice = json.loads((M/'capturas.json').read_text())
        filtros = [u for u in indice if 'taxonomy-delegation' in u]
        self.assertEqual(len(filtros), 8)
        union = set()
        for u in filtros:
            eventos = atletismo.leer_galicia(captura(u))
            with self.subTest(filtro=u):
                self.assertTrue({e['id'] for e in eventos} <= set(central))
                self.assertTrue(all(e == central[e['id']] for e in eventos))
            union.update(e['id'] for e in eventos)
        self.assertEqual((len(union),len(central)), (34,36))
        repetida = next(iter(union))
        entrada = {'version':1,'fuente':'fga','eventos':[central[repetida]]}
        n = atletismo.importar(None,entrada,AHORA)
        nuevo = atletismo.importar(n,entrada,'2026-11-05T12:00:00+01:00')
        self.assertEqual(n['referencias'], nuevo['referencias'])
        self.assertEqual(set(n['observaciones']),set(nuevo['observaciones']))
        self.assertEqual(set(nuevo['fuentes']), {'fga'})

    def test_fuente_reflejo_por_ficha_rfea_o_solo_nac_int_propio_con_senal(self):
        texto = html('fga-0114-5080770a6c0e.html')
        for valor in ('Nacional','Internacional'):
            meta=f.leer_ficha(texto.replace('Autonómico',valor))['metadatos']
            self.assertEqual(meta['fuente']['relacion'],'reflejo')
        self.assertEqual(ficha('fga-0101-813fd655cc9a.html')['metadatos']['fuente']['relacion'],'propio')
        self.assertEqual(ficha('fga-0114-5080770a6c0e.html')['metadatos']['actividad']['valor'],'desconocida')

    def test_sin_ambito_resuelve_por_post_sin_inventar_permalink(self):
        contenido = html('sin-ambito-100123.html')
        def obtener(url):
            if url.startswith(f.API):
                return json.dumps([{'id':100123,'title':'Circuíto','main_date':'2025-04-09','all_dates':['2025-04-09']}])
            if url == 'https://atletismo.gal/?p=100123':
                return contenido
            return '<div id="competitionList"></div>'
        entrada, informe = r.recoger('fga','2025-04-01','2025-04-30',descargar=obtener)
        self.assertEqual(entrada['eventos'],[])
        self.assertEqual([g['id'] for g in entrada['agrupaciones']],['100123'])
        self.assertTrue(informe['completo'])
        self.assertNotIn('?p=',entrada['agrupaciones'][0]['url'])

    def test_403_429_y_esquema_roto_interrumpen_y_preservan_ultima_lectura(self):
        for fallo in (HTTPError(f.API,403,'Forbidden',{},None),HTTPError(f.API,429,'Too Many',{},None),'{}'):
            llamadas=[]
            def obtener(url):
                llamadas.append(url)
                if isinstance(fallo, Exception):raise fallo
                return fallo
            entrada,informe=r.recoger('fga','2026-11-01','2026-12-31',descargar=obtener)
            self.assertEqual(len(llamadas),1)
            self.assertEqual(entrada['eventos'],[])
            self.assertTrue(informe['conservar_lectura'])
            self.assertEqual(informe['ausencias'],[])
            self.assertEqual(informe['superficies'][0]['estado'],'fallida')

    def test_padres_clase_independiente_de_ventana_y_pertenencia_nativa(self):
        entrada,informe = r.recoger('fga','2026-11-01','2026-12-31',descargar=captura)
        jornada = next(e for e in entrada['eventos'] if e['id']=='124035')
        self.assertEqual(jornada['metadatos']['pertenencias'][0]['padre_nativo'],'post-124026')
        self.assertEqual(jornada['metadatos']['pertenencias'][0]['clase'],'coleccion')
        coruna = next(g for g in entrada['agrupaciones'] if g['id']=='127481')
        self.assertEqual(coruna['clase'],'circuito')
        self.assertEqual(informe['peticiones'],74)
        self.assertEqual(len(informe['consultas']),len(set(informe['consultas'])))
        self.assertFalse(any('.pdf' in u for u in informe['consultas']))
        api = [s for s in informe['superficies'] if s['superficie']=='api']
        self.assertEqual([len(s['ids_observados']) for s in api],[36,28])

    def test_los_nuevos_nac_pasan_por_el_comparador_sin_modificarlo(self):
        # Envoltura sintética: conserva la cita NAC del listado real. No se
        # suplanta su ficha ausente ni se afirma que fue reimportada en la simulación.
        eventos = atletismo.leer_galicia(html('fga-0079-085c26260582.html'))
        e = next(e for e in eventos if e['id']=='112760')
        self.assertEqual(e['metadatos']['ambitos_literales'],['Nacional'])
        with patch.object(c,'decidir_lote',wraps=c.decidir_lote) as comparar:
            n = atletismo.importar(None,{'version':1,'fuente':'fga','eventos':[e]},AHORA)
        comparar.assert_called_once()
        self.assertEqual(c.actuales(n)[0]['id'],'112760')

    def test_fallo_de_ficha_no_reemplaza_nucleo_y_recuperacion_es_idempotente(self):
        from agenda import almacen
        # Una primera lectura válida, después 403 en ficha, y recuperación de
        # los mismos bytes: la base conserva sus observaciones y referencias.
        e = evento_de_ficha('fga-0114-5080770a6c0e.html')
        pagina = {'version':1,'fuente':'fga','eventos':[e]}
        informe = {'fuente':'fga','inicio':'2026-09-01','fin':'2026-09-30',
                   'peticiones':1,'citas':1,'completo':True}
        with tempfile.TemporaryDirectory() as tmp:
            db=Path(tmp)/'agenda.db'
            args=['--db',str(db),'--fuente','fga','--inicio','2026-09-01','--fin','2026-09-30']
            with patch.object(r,'recoger',return_value=(pagina,informe)):
                r.main(args)
            with almacen.abrir(db) as conexion:
                antes=almacen.cargar(conexion)
            fallo={**informe,'completo':False,'conservar_lectura':True}
            with patch.object(r,'recoger',return_value=({'eventos':[]},fallo)):
                r.main(args)
            with almacen.abrir(db) as conexion:
                self.assertEqual(almacen.cargar(conexion)['nucleo'],antes['nucleo'])
            with patch.object(r,'recoger',return_value=(pagina,informe)):
                r.main(args)
            with almacen.abrir(db) as conexion:
                despues=almacen.cargar(conexion)['nucleo']
            self.assertEqual(antes['nucleo']['referencias'],despues['referencias'])
            self.assertEqual(set(antes['nucleo']['observaciones']),set(despues['observaciones']))

    def test_rol_obligatorio_solo_al_importar_fga(self):
        e = {'id':'prueba','nombre':'Prueba','url':f.BASE+'prueba/','inicio':'2026-11-01','fin':'2026-11-01',
             'metadatos':{'documentos':[{'url':'https://atletismo.gal/r.pdf'}]}}
        with self.assertRaisesRegex(ValueError,'necesita rol para FGA'):
            atletismo.importar(None,{'version':1,'fuente':'fga','eventos':[e]},AHORA)
        atletismo_bloque.validar(e['metadatos'],e['inicio'],e['fin'],fuente='rfea')

    def ficha_sintetica(self, *, titulo='Proba', etiquetas=('Autonómico',), organizacion='', cuerpo='', enlace='', fecha='12/12/2026'):
        return f.leer_ficha(f'''<main><article class="type-competition post-7"><header><span>{fecha}</span>
            <h1>{titulo}</h1></header>{''.join(f'<span class="competition-label__text">{e}</span>' for e in etiquetas)}
            <div class="html-description">{cuerpo}{enlace}</div>
            <div><h2 class="font-semibold">Organización</h2><div><div class="font-semibold">{organizacion}</div></div></div></article></main>''',
            url='https://atletismo.gal/competicions/proba/')['metadatos']

    def test_una_clausula_de_reglamento_no_es_un_estado(self):
        cuerpo = 'En caso de mal tempo a proba poderá ser aprazada, suspendida ou cancelada.'
        t = self.ficha_sintetica(cuerpo=cuerpo)['temporalidad']
        self.assertEqual(t['estado'], 'desconocido')
        self.assertNotIn('estado_literal', t)
        self.assertEqual(self.ficha_sintetica(titulo='Proba – Cancelada')['temporalidad']['estado'], 'cancelado')

    def test_propio_o_reflejo_por_autoridad_con_el_calendario_de_reserva(self):
        fuente = lambda **k: self.ficha_sintetica(**k)['fuente']
        rfea = fuente(titulo='Campionato de España de Clubs', etiquetas=('Autonómico', 'Nacional'), organizacion='RFEA')
        self.assertEqual((rfea['relacion'], rfea['de']), ('reflejo', 'rfea'))
        self.assertEqual(fuente(etiquetas=('Internacional',), organizacion='European Athletics')['de'], 'ea')
        # Lo mixto no se oculta: un cross gallego con etiqueta nacional es propio.
        self.assertEqual(fuente(etiquetas=('Autonómico', 'Nacional'), organizacion='Concello de Lugo')['relacion'], 'propio')
        self.assertEqual(fuente(organizacion='Federación Galega de Atletismo')['relacion'], 'propio')
        self.assertEqual(fuente(organizacion='Deputación - FGA - RFEA')['relacion'], 'propio')
        # Sin organización: la reserva legal del nombre y, después, la etiqueta.
        self.assertEqual(fuente(titulo='Campionato de España', etiquetas=('Autonómico', 'Nacional'))['relacion'], 'reflejo')
        self.assertEqual(fuente(etiquetas=('Nacional',))['relacion'], 'reflejo')
        self.assertEqual(fuente(etiquetas=())['relacion'], 'desconocido')

    def test_la_organizacion_propia_acredita_sin_etiquetas_y_compartida_no_decide(self):
        fuente = lambda **k: self.ficha_sintetica(**k)['fuente']
        for nombre in ('Federación Galega de Atletismo', 'FEDERACIÓN GALEGA DE ATLETISMO', 'FGA'):
            self.assertEqual(fuente(etiquetas=(), organizacion=nombre)['relacion'], 'propio', nombre)
        # Pesa más que la etiqueta, que no define quién organiza.
        self.assertEqual(fuente(etiquetas=('Nacional',), organizacion='FGA')['relacion'], 'propio')
        for nombre in ('Federación Galega de Atletismo, RFEA', 'FGA - RFEA'):
            self.assertEqual(fuente(etiquetas=(), organizacion=nombre)['relacion'], 'desconocido', nombre)
        # El título reservado no pasa a propio aunque organice o coorganice la FGA.
        self.assertEqual(fuente(titulo='Campionato de España', organizacion='FGA')['relacion'], 'reflejo')
        negreira = fuente(titulo='Campionato de España Master 5 Km. ruta', etiquetas=('Autonómico', 'Nacional'),
                          organizacion='RFEA - Federación Galega de Atletismo')
        self.assertEqual((negreira['relacion'], negreira['de']), ('reflejo', 'rfea'))

    def test_las_etiquetas_no_valen_antes_de_2026(self):
        antigua = dict(fecha='12/12/2025')
        self.assertEqual(self.ficha_sintetica(etiquetas=('Nacional',), **antigua)['fuente']['relacion'], 'desconocido')
        m = self.ficha_sintetica(etiquetas=('Autonómico',), **antigua)
        self.assertEqual(m['fuente']['relacion'], 'desconocido')
        self.assertNotIn('calendarios', m)
        self.assertEqual(self.ficha_sintetica(etiquetas=(), organizacion='RFEA', **antigua)['fuente']['relacion'], 'reflejo')

    def test_la_cabecera_no_es_una_entidad_y_el_bloque_vacio_no_inventa_nada(self):
        lleno = self.ficha_sintetica(organizacion='Concello de Lugo')['organizacion']
        self.assertEqual([x['entidad_literal'] for x in lleno], ['Concello de Lugo'])
        self.assertNotIn('organizacion', self.ficha_sintetica())
        for archivo in sorted(p.name for p in M.glob('*.html')):
            try:
                m = ficha(archivo)['metadatos']
            except (ValueError, TypeError):
                continue
            self.assertNotIn('Organización', [x['entidad_literal'] for x in m.get('organizacion', [])], archivo)

    def test_calendario_organizacion_y_titulo_reservado(self):
        m = self.ficha_sintetica(titulo='Campionato de España Máster', etiquetas=('Autonómico', 'Nacional'), organizacion='RFEA')
        self.assertEqual(m['calendarios'][0]['calendario'], 'fga')
        self.assertEqual(m['calendarios'][0]['categoria_literal'], 'Autonómico, Nacional')
        self.assertEqual(m['organizacion'][0]['entidad_literal'], 'RFEA')
        self.assertEqual((m['titulos'][0]['autoridad'], m['titulos'][0]['base']), ('federacion_espanola', 'nombre_reservado'))
        self.assertNotIn('calendarios', self.ficha_sintetica(etiquetas=('Nacional',)))
        atletismo_bloque.validar(m, '2026-12-12', '2026-12-12', fuente='fga')

    def test_un_enlace_a_la_rfea_no_decide_ni_alimenta_el_comparador(self):
        enlace = '<a href="https://atletismorfea.es/calendario/campeonato/x">RFEA</a>'
        m = self.ficha_sintetica(etiquetas=('Autonómico', 'Nacional'), enlace=enlace)
        self.assertEqual(m['fuente']['relacion'], 'propio')
        self.assertNotIn('web_organizador', m)

    def test_un_bloqueo_en_la_reconsulta_descarta_las_ausencias_de_toda_la_pasada(self):
        citas = [{'id': i, 'url': f'https://atletismo.gal/competicions/{i}/', 'inicio': '2026-11-10',
                  'fin': '2026-11-10', 'metadatos': {}} for i in ('7', '8', '9')]
        vistas = []
        def obtener(url):
            vistas.append(url)
            if url == citas[0]['url']:
                raise HTTPError(url, 404, 'Not Found', {}, None)
            if url == citas[1]['url']:
                return 'trasladada'
            raise AssertionError('no debe seguir consultando tras el bloqueo: ' + url)
        informe = {'pendientes': [], 'completo': True, 'aplicar_ausencias': True}
        vacia = {'version': 1, 'fuente': 'fga', 'eventos': [], 'agrupaciones': []}
        with patch.dict(r.FICHAS, fga=lambda *_: {'bloqueo': True}):
            salida = r.reconsultar('fga', citas, vacia, informe, atletismo.date(2026, 11, 1),
                                   atletismo.date(2026, 11, 30), obtener, AHORA)
        self.assertEqual(salida, {'ausencias': [], 'reimportadas': []})
        self.assertEqual(vistas, [citas[0]['url'], citas[1]['url']])
        self.assertEqual((informe['completo'], informe['aplicar_ausencias'], informe['conservar_lectura']), (False, False, True))

    def test_la_ficha_de_una_cita_trasladada_avisa_si_la_lectura_de_su_fecha_se_bloquea(self):
        cita = {'id': '7', 'url': 'https://atletismo.gal/competicions/siete/'}
        lectura = {'id': '7', 'metadatos': {'temporalidad': {'dias': ['2026-12-12']}}}
        bloqueada = ({'eventos': [], 'agrupaciones': []}, {'conservar_lectura': True, 'aplicar_ausencias': False})
        with patch.object(f, 'leer_ficha', return_value=lectura), patch.object(r, 'galicia', return_value=bloqueada):
            self.assertEqual(r.ficha_galicia(cita, '', None), {'bloqueo': True})

    def test_el_404_de_la_propia_ficha_retira_la_cita_y_otro_error_interrumpe(self):
        cita = {'id': '7', 'url': 'https://atletismo.gal/competicions/siete/', 'inicio': '2026-11-10',
                'fin': '2026-11-10', 'metadatos': {}}
        vacia = {'version': 1, 'fuente': 'fga', 'eventos': [], 'agrupaciones': []}
        def fallo(codigo):
            def obtener(url):
                raise HTTPError(url, codigo, 'Error', {}, None)
            return obtener
        informe = {'pendientes': [], 'completo': True, 'aplicar_ausencias': True}
        resultado = r.reconsultar('fga', [cita], deepcopy(vacia), informe, r.date(2026, 11, 1), r.date(2026, 11, 30), fallo(404), AHORA)
        self.assertEqual([a['id'] for a in resultado['ausencias']], ['7'])
        with self.assertRaises(HTTPError):
            r.reconsultar('fga', [cita], deepcopy(vacia), dict(informe), r.date(2026, 11, 1), r.date(2026, 11, 30), fallo(503), AHORA)


if __name__ == '__main__':
    unittest.main()
