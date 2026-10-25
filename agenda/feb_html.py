"""HTML observado de LF Endesa: dos páginas, sin recorrer fichas personales.

No deduce la hora de encuentros ya jugados desde la fecha de jornada. La
vista de resultados acredita fecha/hora de las jornadas que sí contiene.
"""

from datetime import datetime, timezone
from decimal import Decimal
import re
from urllib.parse import parse_qs, urlparse

from bs4 import BeautifulSoup


def texto(el):
    return el.get_text(' ', strip=True)


def identidad(enlace, tipo):
    url = urlparse(enlace['href'])
    if url.hostname not in (None, 'baloncestoenvivo.feb.es'):
        raise ValueError('Enlace FEB fuera del proveedor')
    campo = 'p' if tipo == 'partido' else 'i'
    i = parse_qs(url.query).get(campo, [None])[0]
    if i is None:
        m = re.fullmatch('/' + tipo + r'/(\d+)', url.path, re.I)
        i = m[1] if m else None
    if not i or not i.isdigit():
        raise ValueError('Enlace FEB sin identidad acreditada')
    return i


def equipo(celda):
    enlaces = celda.select('a[href]')
    if len(enlaces) != 1 or not texto(enlaces[0]):
        raise ValueError('Equipo FEB sin enlace inequívoco')
    return {'id': identidad(enlaces[0], 'equipo'), 'nombre': texto(enlaces[0])}


def seleccion(sopa, sufijo):
    campos = sopa.find_all('select', id=lambda i: i and i.endswith(sufijo))
    opciones = campos[0].select('option[selected]') if len(campos) == 1 else []
    if len(opciones) != 1:
        raise ValueError('Selección FEB no acreditada: ' + sufijo)
    return {'id': opciones[0]['value'], 'nombre': texto(opciones[0])}


def marcador(valor):
    if valor == '*-*':
        return None
    m = re.fullmatch(r'(\d+)\s*-\s*(\d+)', valor)
    if not m:
        raise ValueError('Marcador FEB no reconocido: ' + valor)
    return [int(m[1]), int(m[2])]


def leer(calendario, resultados, temporada, calendario_url, resultados_url):
    c, r = (BeautifulSoup(html, 'html.parser') for html in (calendario, resultados))
    edicion = seleccion(c, 'temporadasDropDownList')
    fase = seleccion(c, 'gruposDropDownList')
    if edicion['id'] != temporada or seleccion(r, 'temporadasDropDownList') != edicion:
        raise ValueError('Las páginas FEB no corresponden a la temporada solicitada')
    if seleccion(r, 'gruposDropDownList') != fase:
        raise ValueError('Las páginas FEB no corresponden a la misma fase')
    if any(not sopa.select_one('span.liga') or texto(sopa.select_one('span.liga')) != 'LF ENDESA'
           for sopa in (c, r)):
        raise ValueError('La cabecera FEB no corresponde a LF Endesa')
    if not any(parse_qs(urlparse(a.get('href', '')).query).get('g') == ['4']
               and parse_qs(urlparse(a.get('href', '')).query).get('t') == [temporada]
               and parse_qs(urlparse(a.get('href', '')).query).get('nm') == ['lfendesa']
               for a in c.select('a[href]')):
        raise ValueError('Competición LF Endesa no acreditada')
    partidos = {}
    tablas = c.find_all('table', id=lambda i: i and 'calendarioRepeater' in i and i.endswith('DataGrid3'))
    if not tablas:
        raise ValueError('Calendario FEB sin tablas')
    for tabla in tablas:
        if [texto(th) for th in tabla.select('th')] != ['Local', 'Resultado', 'Visitante']:
            raise ValueError('Cambió la estructura del calendario FEB')
        for fila in tabla.select('tr')[1:]:
            celdas = fila.find_all('td', recursive=False)
            if len(celdas) != 3:
                raise ValueError('Fila de calendario FEB incompleta')
            a = celdas[1].select('a[href]')
            if len(a) != 1:
                raise ValueError('Partido FEB sin identidad')
            i, valor = identidad(a[0], 'partido'), texto(a[0])
            if i in partidos:
                raise ValueError('Partido FEB repetido en el calendario')
            fecha_hora, puntos = None, None
            if 'fecha' in celdas[1].get('class', []):
                m = re.search(r'(\d{2}/\d{2}/\d{4})\s+(\d{1,2}:\d{2})$', valor)
                if not m:
                    raise ValueError('Horario FEB no reconocido')
                fecha_hora = m[1] + ' - ' + m[2]
                datetime.strptime(fecha_hora, '%d/%m/%Y - %H:%M')
            else:
                puntos = marcador(valor)
            partidos[i] = {'id': i, 'fecha_hora': fecha_hora,
                'local': equipo(celdas[0]), 'visitante': equipo(celdas[2]),
                'marcador_resultados': puntos, 'cuartos': []}
    if not partidos or len(partidos) > 1000:
        raise ValueError('Cantidad de partidos FEB fuera del alcance contrastado')
    tablas_resultados = r.find_all('table', id=lambda i: i and i.endswith(('jornadaDataGrid', 'proximaJornadaDataGrid')))
    if not tablas_resultados:
        raise ValueError('Página FEB sin tablas de resultados')
    for tabla in tablas_resultados:
        for fila in tabla.select('tr')[1:]:
            celdas = fila.find_all('td', recursive=False)
            if len(celdas) != 4:
                raise ValueError('Fila de resultados FEB incompleta')
            i = identidad(celdas[1].select_one('a[href]'), 'partido')
            if i not in partidos:
                raise ValueError('Resultados FEB fuera del calendario recogido')
            equipos = celdas[0].select('a[href]')
            if len(equipos) != 2 or [identidad(a, 'equipo') for a in equipos] != [
                    partidos[i][lado]['id'] for lado in ('local', 'visitante')]:
                raise ValueError('Participantes FEB discrepantes entre páginas')
            fecha_hora = texto(celdas[2]) + ' - ' + texto(celdas[3])
            datetime.strptime(fecha_hora, '%d/%m/%Y - %H:%M')
            partidos[i].update(fecha_hora=fecha_hora, marcador_resultados=marcador(texto(celdas[1])))
    tablas_clas = r.find_all('table', id=lambda i: i and i.endswith('clasificacionDataGrid'))
    if len(tablas_clas) != 1:
        raise ValueError('Clasificación FEB ausente o ambigua')
    tabla = tablas_clas[0]
    if [texto(th) for th in tabla.select('th')] != ['Po', 'Equipo', 'PJ', 'PG', 'PP', 'PF', 'PC', 'DIF', '%', 'R']:
        raise ValueError('Cambió la estructura de la clasificación FEB')
    filas = []
    metricas = ('partidos_jugados', 'victorias', 'derrotas', 'puntos_favor', 'puntos_contra', 'diferencia')
    for fila in tabla.select('tr')[1:]:
        celdas = fila.find_all('td', recursive=False)
        if len(celdas) != 10:
            raise ValueError('Fila de clasificación FEB incompleta')
        valores = {'baloncesto.' + codigo: int(texto(celdas[i + 2])) for i, codigo in enumerate(metricas)}
        valores['baloncesto.porcentaje_victorias'] = str(Decimal(texto(celdas[8]).removesuffix('%').replace(',', '.')))
        filas.append({**equipo(celdas[1]), 'posicion': int(texto(celdas[0])), 'metricas': valores})
    if not filas or len({f['id'] for f in filas}) != len(filas):
        raise ValueError('Clasificación FEB vacía o con equipos repetidos')
    return {'version_muestra': 1, 'proveedor': 'feb', 'modo': 'recogida_html',
        'url': calendario_url, 'competicion': {'id': '4', 'nombre': 'LF ENDESA'},
        'edicion': edicion, 'fase': fase, 'partidos': list(partidos.values()),
        'clasificacion': {'filas': filas}, 'fecha_captura_original': datetime.now(timezone.utc).date().isoformat(),
        'fragmentos': [{'url': calendario_url, 'texto': calendario}, {'url': resultados_url, 'texto': resultados}]}
