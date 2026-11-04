"""Calendario RFEA: lectura íntegra y enlace prudente, sin red ni identidades nuevas."""
from copy import deepcopy
from datetime import date
import re
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup

from . import atletismo_coincidencias as coincidencias

INDICE = 'https://atletismorfea.es/federacion/communication-hub/circulares?combine=calendario'
MESES = ('enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
         'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre')
class SinCalendario(ValueError):
    """Temporada sin calendario aprobado: lo normal hasta su asamblea, no un fallo."""


MODALIDADES = {'AL', 'ST', 'Ruta', 'Marcha', 'Campo a Través', 'Cross', 'Trail Running', 'RFEA', 'otros'}


def leer(texto):
    """Texto de pdftotext -layout; página y fila son posiciones del original."""
    temporadas = set(re.findall(r'(?m)^\s*CALENDARIO RFEA (\d{4})\s*$', texto))
    fechas = set(re.findall(r'Actualizado a (\d{1,2}) (\w+) (\d{4})', texto))
    if len(temporadas) != 1 or len(fechas) != 1:
        raise ValueError('Calendario RFEA: falta título, año o actualización inequívoca')
    temporada = temporadas.pop()
    dia, mes, anio = fechas.pop()
    actualizado = date(int(anio), MESES.index(mes.lower()) + 1, int(dia)).isoformat()
    filas, mes = [], None
    for pagina, contenido in enumerate(texto.split('\f'), 1):
        for fila, linea in enumerate(contenido.splitlines(), 1):
            literal = linea.strip()
            if not literal:
                continue
            if literal.lower() in MESES:
                mes = MESES.index(literal.lower()) + 1
                continue
            if re.fullmatch(r'CALENDARIO RFEA \d{4}|Actualizado a \d{1,2} \w+ \d{4}', literal):
                continue
            if mes is None:
                continue  # Portada; su título se confirma antes de incorporar.
            campos = re.split(r'\s{2,}', literal)
            if (len(campos) != 5 or not re.fullmatch(r'\d{1,2}(?:/\d{1,2})*', campos[0])
                    or campos[1] not in MODALIDADES):
                raise ValueError(f'Calendario RFEA: línea sin interpretar en página {pagina}, fila {fila}: {literal}')
            dias = [int(d) for d in campos[0].split('/')]
            extremos, mes_dia = [], mes
            for d in dias:
                if extremos and d < int(extremos[-1][-2:]):
                    mes_dia += 1
                extremos.append(date(int(temporada) + (mes_dia - 1) // 12,
                                     (mes_dia - 1) % 12 + 1, d).isoformat())
            f = dict(zip(('dia_literal', 'modalidad', 'nombre', 'categoria_literal', 'sede_literal'), campos))
            filas.append({'pagina': pagina, 'fila': fila, **f, 'inicio': extremos[0], 'fin': extremos[-1],
                          **({'dias': extremos} if len(dias) > 2 else {})})
    if not filas:
        raise ValueError('Calendario RFEA: sin filas')
    return {'temporada': temporada, 'actualizado': actualizado, 'filas': filas}


def _url(valor, base):
    if not isinstance(valor, str) or not valor.strip() or valor.startswith('#'):
        raise ValueError('Calendario RFEA: enlace vacío')
    url = urljoin(base, valor)
    p = urlsplit(url)
    if (p.scheme != 'https' or p.hostname != 'atletismorfea.es' or p.username or p.password
            or any(c.isspace() for c in url)):
        raise ValueError('Calendario RFEA: enlace ajeno al índice oficial')
    return url


def leer_indice(html, url=INDICE, *, permitir_sin_archivo=False):
    s = BeautifulSoup(html, 'html.parser')
    tabla = s.select_one('table')
    if tabla is None or not tabla.select_one('.views-field-field-circular-name'):
        raise ValueError('Calendario RFEA: índice sin tabla de circulares')
    entradas = []
    for tr in tabla.select('tbody tr'):
        nombre = tr.select_one('.views-field-field-circular-name')
        numero = tr.select_one('.views-field-title')
        fecha = tr.select_one('time[datetime]')
        enlaces = tr.select('.documento_descargar a[href]')
        celda_archivo = tr.select_one('td.views-field-field-circular-file')
        sin_archivo = (permitir_sin_archivo and celda_archivo is not None and not enlaces
                       and not celda_archivo.get_text(strip=True) and not celda_archivo.find())
        if nombre is None or numero is None or fecha is None or len(enlaces) != 1 and not sin_archivo:
            raise ValueError('Calendario RFEA: entrada incompleta del índice')
        entradas.append({'nombre': nombre.get_text(' ', strip=True),
            'numero': numero.get_text(strip=True), 'fecha': date.fromisoformat(fecha['datetime'][:10]).isoformat(),
            'url': _url(enlaces[0]['href'], url) if enlaces else None,
            'archivo': ' '.join(x.get_text(' ', strip=True) for x in tr.select('.documento_nombre'))})
    siguientes = {_url(a['href'], url) for a in s.select('.pager a[rel~=next][href]')}
    if len(siguientes) > 1:
        raise ValueError('Calendario RFEA: paginación ambigua')
    siguiente = next(iter(siguientes), None)
    if siguiente and urlsplit(siguiente).path != urlsplit(INDICE).path:
        raise ValueError('Calendario RFEA: paginación fuera del índice')
    return entradas, siguiente


def seleccionar(entradas, temporada):
    candidatas = [e for e in entradas if re.fullmatch(
        rf'Calendario(?: Nacional| RFEA)? {temporada}', e['nombre'], re.I)
        and not re.search('proyecto', e['archivo'] + ' ' + e['url'], re.I)]
    if not candidatas:
        raise SinCalendario(f'Calendario RFEA: sin candidata clara para {temporada}')
    fecha = max(e['fecha'] for e in candidatas)
    ultimas = [e for e in candidatas if e['fecha'] == fecha]
    if len(ultimas) != 1:
        raise ValueError(f'Calendario RFEA: versión ambigua para {temporada}')
    return ultimas[0]


def confirmar_portada(texto, entrada, temporada):
    portada = texto.split('\f')[0]
    numero = re.fullmatch(r'(\d+)\s*[-/]\s*(\d{4})', entrada['numero'])
    circular = re.search(r'CIRCULAR Nº:\s*(\d+)/(\d{4})', portada)
    if (not re.search(rf'(?m)^\s*Calendario (?:Nacional|RFEA) {temporada}\s*$', portada)
            or re.search('proyecto', portada, re.I) or not numero or not circular
            or (int(numero[1]), numero[2]) != (int(circular[1]), circular[2])):
        raise ValueError('Calendario RFEA: la portada no confirma título y circular')


def evento(fila):
    # La columna es «Municipio (Provincia)»: la provincia no forma parte de la sede.
    return {'nombre': fila['nombre'], 'inicio': fila['inicio'], 'fin': fila['fin'],
            'lugar': {'municipio_literal': fila['sede_literal'].split(' (')[0]},
            'metadatos': {'modalidad_literal': fila['modalidad']}}


def enlazar(eventos, inventario, url):
    """Solo una automática y ninguna revisión; el PDF nunca crea ni retira citas."""
    informe = {'automaticas': 0, 'a_revision': 0, 'sin_fila': 0}
    for e in eventos:
        if str(e['id']).startswith('nivel-ii:'):
            continue
        automaticas, revisar = [], False
        for f in inventario['filas']:
            estado = coincidencias.comparar(e, evento(f))['estado']
            if estado == 'automatica':
                automaticas.append(f)
            revisar |= estado == 'revisar'
        meta = e.setdefault('metadatos', {})
        calendarios = [c for c in meta.get('calendarios', []) if c['calendario'] != 'rfea']
        if len(automaticas) == 1 and not revisar:
            f = automaticas[0]
            calendarios.append({'calendario': 'rfea', 'categoria_literal': f['categoria_literal'],
                'evidencia': {'superficie': 'documento', 'url': url,
                    'localizador': f"página {f['pagina']}, fila {f['fila']}", 'literal': f['categoria_literal']}})
            informe['automaticas'] += 1
        elif automaticas or revisar:
            informe['a_revision'] += 1
        else:
            informe['sin_fila'] += 1
        if calendarios:
            meta['calendarios'] = calendarios
        else:
            meta.pop('calendarios', None)
    return informe


def conservar(eventos, conocidas):
    anteriores = {c['id']: c for c in conocidas if c['fuente'] == 'rfea' and not c.get('lectura_ambigua')}
    for e in eventos:
        calendarios = [c for c in anteriores.get(str(e['id']), {}).get('metadatos', {}).get('calendarios', [])
                       if c['calendario'] == 'rfea']
        if calendarios:
            meta = e.setdefault('metadatos', {})
            meta['calendarios'] = [c for c in meta.get('calendarios', []) if c['calendario'] != 'rfea'] + deepcopy(calendarios)
