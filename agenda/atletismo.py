"""Primera importación revisable de calendarios federativos, sin recogida automática.

Los lectores reciben capturas públicas guardadas. La cobertura de una captura
no acredita ni el calendario anual ni equivalencias con otra federación.
"""

from copy import deepcopy
from datetime import date, datetime, timedelta
from functools import lru_cache
import json
from pathlib import Path
import re
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from . import atletismo_bloque, atletismo_coincidencias as coincidencias, deporte, nucleo


FUENTES = {
    'rfea': ('RFEA', 'https://atletismorfea.es/calendario'),
    'fga': ('Federación Galega de Atletismo', 'https://atletismo.gal/competicions/'),
    'fca': ('Federació Catalana d’Atletisme', 'https://fcatletisme.cat/events/'),
    'wa': ('World Athletics', 'https://worldathletics.org/competition/calendar-results'),
}


@lru_cache(maxsize=1)
def equivalencias():
    """Correspondencias editoriales revisadas; nunca compara nombres o fechas."""
    datos = json.loads(Path(__file__).with_name('atletismo-equivalencias.json').read_text(encoding='utf-8'))
    if datos.get('version') != 1:
        raise ValueError('Versión de equivalencias de atletismo desconocida')
    salida = {}
    for e in deporte.unicos(deporte.filas(datos, 'equivalencias'), 'id'):
        revision = e.get('revision') or {}
        date.fromisoformat(revision['fecha'])
        if not revision.get('criterio') or not revision.get('evidencias') or len(e['referencias']) < 2:
            raise ValueError('Equivalencia sin revisión acreditada')
        for fuente, i in e['referencias'].items():
            clave = (fuente, deporte.literal(i))
            if fuente not in FUENTES or clave in salida:
                raise ValueError('Referencia de equivalencia inválida o repetida')
            salida[clave] = e
    return salida


def texto(el):
    return el.get_text(' ', strip=True) if el else ''


def html_texto(valor):
    return texto(BeautifulSoup(valor, 'html.parser')) if valor else valor


def enlace(fuente, valor):
    base = FUENTES[fuente][1]
    u = urlparse(urljoin(base, valor))
    if u.scheme != 'https' or u.hostname != urlparse(base).hostname or u.username or u.password:
        raise ValueError('Enlace de calendario fuera de la federación')
    return u.geturl()


def leer_cataluna(paginas):
    """Todas las páginas de una misma consulta Tribe, comprobadas antes de importar."""
    if not paginas or any(not isinstance(p, dict) for p in paginas):
        raise ValueError('Faltan páginas catalanas')
    total, numero = paginas[0].get('total'), paginas[0].get('total_pages')
    if type(total) is not int or type(numero) is not int or len(paginas) != numero:
        raise ValueError('Calendario catalán incompleto')
    eventos, vistos = [], set()
    for p in paginas:
        if (p.get('total'), p.get('total_pages')) != (total, numero):
            raise ValueError('La paginación catalana cambió durante la lectura')
        for e in deporte.filas(p, 'events', 100):
            i = deporte.literal(e.get('id'))
            if i in vistos:
                raise ValueError('Página catalana repetida')
            vistos.add(i)
            inicio, fin = e.get('start_date'), e.get('end_date')
            if e.get('all_day') is True:
                # La API acaba a 23:59:59 del último día; ICS usa otro convenio.
                inicio, fin = date.fromisoformat(inicio[:10]).isoformat(), date.fromisoformat(fin[:10]).isoformat()
            else:
                raise ValueError('Horario catalán requiere contraste de zona antes de importar')
            sitio = e.get('venue') or {}
            eventos.append({'id': i, 'nombre': texto(BeautifulSoup(e['title'], 'html.parser')),
                'url': enlace('fca', e['url']), 'inicio': inicio, 'fin': fin,
                'lugar': {'id': sitio.get('id'), 'nombre': texto(BeautifulSoup(sitio.get('venue', ''), 'html.parser')),
                          'city': sitio.get('city'), 'country': sitio.get('country')},
                # Tribe entrega los nombres con entidades HTML (`d&#8217;Atletisme`).
                'metadatos': {'categorias': [{'id': c['id'], 'nombre': html_texto(c['name'])} for c in e.get('categories', [])],
                    'organizaciones': [{'id': o['id'], 'nombre': html_texto(o.get('organizer')), 'url': o.get('website')}
                                       for o in e.get('organizer', [])],
                    'web_organizador': e.get('website'), 'modificado': e.get('modified_utc'),
                    'zona_fuente': e.get('timezone')}})
    if len(eventos) != total:
        raise ValueError('El total catalán no coincide con las citas recibidas')
    return eventos


def leer_galicia(html):
    from .atletismo_fga import leer_listado
    return leer_listado(html)


def leer_ficha_galicia(html):
    from .atletismo_fga import leer_ficha
    return leer_ficha(html)['metadatos']


def leer_rfea(mes, respuesta, fichas, *, urls=None):
    """Mes Drupal y fichas por URL: no usa el slug como identidad de la cita.

    Los días son apariciones de esta ventana, no límites definitivos de una
    competición que pueda continuar en otro mes. El importador las mantiene
    como capturas de revisión hasta completar los extremos.
    """
    primero = date.fromisoformat(mes + '-01')
    comandos = [c for c in respuesta if c.get('selector') == '#calendar_container' and c.get('command') == 'insert']
    if len(comandos) != 1:
        raise ValueError('Respuesta RFEA sin calendario inequívoco')
    s = BeautifulSoup(comandos[0]['data'], 'html.parser')
    # La navegación acredita el mes: no confiar solo en los parámetros pedidos.
    siguiente = (primero.replace(day=28) + timedelta(days=4)).replace(day=1)
    marcas = {str(int(datetime.fromisoformat(d.isoformat() + 'T00:00:00+00:00').timestamp()))
              for d in ((primero - timedelta(days=1)).replace(day=1), siguiente)}
    if {a.get('attr-date') for a in s.select('.calendar_pager a[attr-date]')} != marcas:
        raise ValueError('La respuesta RFEA no corresponde al mes solicitado')
    eventos = {}
    for dia in s.select('.calendar-day'):
        fecha = primero.replace(day=int(texto(dia.select_one('.monthday')))).isoformat()
        for a in dia.select('.calendar-item > a[href]'):
            url = enlace('rfea', a['href'])
            if urls is not None and url not in urls:
                continue
            if url not in fichas:
                raise ValueError('Falta ficha RFEA para acreditar identidad: ' + url)
            ficha = BeautifulSoup(fichas[url], 'html.parser')
            ajustes = ficha.select_one('script[data-drupal-selector="drupal-settings-json"]')
            camino = json.loads(ajustes.string)['path']['currentPath'] if ajustes else ''
            m = re.fullmatch(r'championship/(\d+)', camino)
            if not m:
                raise ValueError('Ficha RFEA sin championship ID')
            i = m[1]
            if i not in eventos:
                enlaces = [{'nombre': texto(x), 'url': urljoin(url, x['href'])}
                           for x in ficha.select('a.c_e_link[href]')
                           if urlparse(urljoin(url, x['href'])).scheme == 'https']
                eventos[i] = {'id': i, 'nombre': texto(a.select_one('.event__title')), 'url': url,
                    'dias_observados': [], 'lugar': {'nombre': texto(a.select_one('.event__location'))},
                    'metadatos': {'modalidad_literal': texto(a.select_one('.event__discipline')),
                        'area_literal': texto(ficha.select_one('.c_e_area')),
                        'categoria_literal': texto(ficha.select_one('.c_e_cat')),
                        'fecha_literal': texto(ficha.select_one('.c_e_date')),
                        'enlaces_ficha': enlaces,
                        'sfid': sorted({x['data-sfid'] for x in ficha.select('[data-sfid]')})}}
            eventos[i]['dias_observados'].append(fecha)
    return list(eventos.values())


def importar(anterior, pagina, observado):
    """Contrato v1 revisado: fuente, eventos y fechas acreditadas de celebración.

    RFEA exige completar inicio/fin desde ficha/programa o meses contiguos;
    leer_rfea por sí solo no convierte una ventana en duración definitiva.
    """
    fuente = pagina.get('fuente')
    if pagina.get('version') != 1 or fuente not in FUENTES:
        raise ValueError('Contrato de atletismo desconocido')
    nombre, url = FUENTES[fuente]
    eventos = list(deporte.unicos(deporte.filas(pagina, 'eventos'), 'id'))
    ausencias = deepcopy(((anterior or {}).get('fuentes', {}).get(fuente) or {}).get('ausencias'))
    decisiones = coincidencias.decidir_lote(anterior, fuente, eventos)
    conocidas = coincidencias.actuales(anterior)
    a = deporte.Agenda(anterior, fuente, nombre, url, 'atletismo', observado)
    capa = a.grupo('calendario', fuente, 'coleccion', nombre, codigo='atletismo-' + fuente)
    grupos = {}
    for g in deporte.unicos(deporte.filas({'agrupaciones': pagina.get('agrupaciones', [])}, 'agrupaciones'), 'id'):
        i = deporte.literal(g['id'])
        if a.anterior('competicion', i):
            raise ValueError('Agrupación previamente importada como cita: requiere conciliación explícita')
        if g.get('clase') not in ('circuito', 'ciclo', 'coleccion'):
            raise ValueError('Agrupación de atletismo sin clase acreditada')
        # La clase de una identidad no cambia: un padre leído fuera de ventana
        # (colección) la conserva aunque otra lectura lo presente como circuito.
        previa = a.anterior('agrupacion', i)
        clase = a.c.n['entidades'][nucleo.clave(previa)]['clase'] if previa else g['clase']
        grupos[i] = a.grupo('agrupacion', i, clase, g.get('nombre'), padre=capa,
            url=enlace(fuente, g['url']), codigo=g.get('codigo_consulta'))
    for e in eventos:
        equivalencia = equivalencias().get((fuente, deporte.literal(e['id'])))
        identidad = (nucleo.identificador('atletismo-revisado', equivalencia['id'])
                     if equivalencia else None)
        previa = a.anterior('competicion', e['id'])
        if identidad and previa and previa['id'] != identidad:
            raise ValueError('Equivalencia nueva sobre una cita existente: requiere conciliación explícita')
        identidad_grupo = nucleo.identificador('programa-atletismo-revisado', equivalencia['id']) if equivalencia else None
        decision = decisiones[str(e['id'])]
        automatica = next((c['metadatos'].get('coincidencia_automatica') for c in conocidas
                           if c['fuente'] == fuente and c['id'] == str(e['id'])), None)
        if not equivalencia and not previa and decision['estado'] == 'automatica':
            identidad = decision['cita']['destino']['id']
            identidad_grupo = decision['cita']['grupo']['id']
            automatica = {'version': coincidencias.VERSION, 'referencia': decision['cita']['referencia'],
                          'criterio': decision['comparacion']}
        if deporte.literal(e['id']) in grupos:
            raise ValueError('Una agrupación no debe importarse también como cita')
        ids_grupo = [e['grupo']] if e.get('grupo') is not None else []
        ids_grupo.extend(e.get('grupos', []))
        padres = [grupos.get(deporte.literal(i)) for i in ids_grupo]
        if any(p is None for p in padres):
            raise ValueError('Cita con agrupación no acreditada')
        padre = padres[0] if padres else capa
        if not e.get('inicio') or not e.get('fin'):
            raise ValueError('Faltan extremos acreditados de celebración')
        inicio, fin = date.fromisoformat(e['inicio']), date.fromisoformat(e['fin'])
        if fin < inicio:
            raise ValueError('Calendario con fin anterior al inicio')
        atletismo_bloque.validar(e.get('metadatos') or {}, inicio.isoformat(), fin.isoformat(), fuente=fuente)
        cuando = deporte.dias(inicio.isoformat(), fin.isoformat())
        if fuente == 'fga' and (dias := (e.get('metadatos') or {}).get('temporalidad', {}).get('dias')):
            # Mantener una identidad nativa sin ocupar los huecos del intervalo.
            huecos = [(inicio + timedelta(days=i)).isoformat() for i in range((fin - inicio).days + 1)
                      if (inicio + timedelta(days=i)).isoformat() not in dias]
            if huecos:
                cuando['dias_excluidos'] = huecos
        grupo = a.grupo('programa_competicion', e['id'], 'competicion', e.get('nombre'),
            padre=padre, url=enlace(fuente, e['url']),
            identidad=identidad_grupo)
        principal, evidencia = a.evento('competicion', e['id'], 'encuentro', e.get('nombre'),
            cuando, padre=grupo,
            estado=e.get('estado', 'desconocido'),
            sitio=e.get('lugar'), url=enlace(fuente, e['url']), identidad=identidad,
            bloques={'atletismo': {**(e.get('metadatos') or {}),
                **({'coincidencia_automatica': automatica} if automatica else {}),
                **({'equivalencia_revisada': equivalencia} if equivalencia else {})},
                'agenda': {'rol': 'principal', 'grupo': grupo}})
        for adicional in padres[1:]:
            a.c.relacion('pertenece_a', principal, adicional, evidencia)
        for s in deporte.unicos(deporte.filas({'programa': e.get('programa', [])}, 'programa'), 'id'):
            cuando = deporte.intervalo(s.get('inicio'), s.get('fin'), zona=s.get('zona'))
            # Una lista de pruebas sin fecha no acredita sesiones de agenda.
            if not cuando['inicio']['fecha']:
                raise ValueError('Sesión de atletismo sin fecha acreditada')
            if any(x['fecha'] and not inicio.isoformat() <= x['fecha'] <= fin.isoformat()
                   for x in (cuando['inicio'], cuando['fin'])):
                raise ValueError('Sesión fuera de los días de la competición')
            # El ID de sesión pertenece al espacio de la competición, aunque
            # dos programas reutilicen la misma referencia local.
            a.evento('sesion', json.dumps([deporte.literal(e['id']), deporte.literal(s['id'])]),
                'sesion', s.get('nombre'), cuando, padre=grupo,
                sitio=s.get('lugar') or e.get('lugar'), url=enlace(fuente, s.get('url') or e['url']),
                bloques={'agenda': {'rol': 'sesion', 'principal': principal,
                    'tipo_sesion': deporte.literal(s.get('tipo_sesion'), 'tipo de sesión')}})
    if ausencias:
        # Una lectura nueva del ID vuelve a sostener la cita.
        for e in eventos:
            ausencias['ids'].pop(deporte.literal(e['id']), None)
        if ausencias['ids']:
            a.c.n['fuentes'][fuente]['ausencias'] = ausencias
    return a.terminar()


def registrar_ausencias(anterior, fuente, ausencias):
    """Citas guardadas que la fuente ya no sostiene en su fecha.

    No cancela ni borra observaciones: la proyección deja de publicarlas
    hasta que una lectura posterior de la fuente vuelva a traer su ID.
    """
    if not ausencias:
        return anterior
    n = deepcopy(anterior)
    datos = n['fuentes'][fuente].setdefault('ausencias', {'tipo_externo': 'competicion', 'ids': {}})
    for x in ausencias:
        datos['ids'][deporte.literal(x['id'])] = {k: x[k] for k in ('motivo', 'url', 'comprobado', 'detalle') if k in x}
    nucleo.validar(n)
    return n
