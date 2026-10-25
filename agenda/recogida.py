"""Recogidas deportivas explícitas y acotadas; no programa ni publica datos."""

import json
from urllib.request import Request, urlopen


MAX_BYTES = 4_000_000


def descargar(url):
    req = Request(url, headers={'User-Agent': 'Voceiro/1.0 (+https://voceiro.eu)'})
    with urlopen(req, timeout=25) as respuesta:
        contenido = respuesta.read(MAX_BYTES + 1)
    if len(contenido) > MAX_BYTES:
        raise ValueError('Respuesta deportiva demasiado grande; no se importa truncada')
    return contenido.decode('utf-8-sig')


def tenis(circuito):
    if circuito not in ('atp', 'wta'):
        raise ValueError('Circuito de tenis desconocido')
    url = f'https://site.api.espn.com/apis/site/v2/sports/tennis/{circuito}/scoreboard'
    pagina = json.loads(descargar(url))
    if not isinstance(pagina.get('events'), list) or not pagina.get('leagues'):
        raise ValueError('Respuesta de tenis sin eventos o circuito')
    return pagina, url


def feb(temporada):
    from .feb_html import leer
    if not str(temporada).isdigit() or len(str(temporada)) != 4:
        raise ValueError('La temporada FEB necesita su año inicial explícito')
    base = 'https://baloncestoenvivo.feb.es'
    calendario_url = f'{base}/calendario/4/{temporada}'
    resultados_url = f'{base}/resultados/4/{temporada}'
    calendario = descargar(calendario_url)
    resultados = descargar(resultados_url)
    return leer(calendario, resultados, str(temporada), calendario_url, resultados_url)
