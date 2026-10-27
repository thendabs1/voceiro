"""Recogidas explícitas y acotadas; no programa ni publica datos."""

import json
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import date, timedelta
from urllib.error import HTTPError
from urllib.request import Request, urlopen


MAX_BYTES = 4_000_000
CHROME_UA = ('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
             '(KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36')
_CONTROL = ContextVar('agenda_control_descargas', default=None)


@contextmanager
def controlar(antes, despues):
    """Reserva cada GET antes de enviarlo y registra también los intentos fallidos."""
    token = _CONTROL.set((antes, despues))
    try:
        yield
    finally:
        _CONTROL.reset(token)


def descargar(url, cabeceras=None):
    req = Request(url, headers={'User-Agent': 'Voceiro/1.0 (+https://voceiro.eu)', **(cabeceras or {})})
    control = _CONTROL.get()
    if control:
        control[0](url)
    estado, headers, contenido = None, {}, b''
    try:
        with urlopen(req, timeout=25) as respuesta:
            estado = getattr(respuesta, 'status', 200)
            headers = dict(getattr(respuesta, 'headers', {}) or {})
            contenido = respuesta.read(MAX_BYTES + 1)
    except HTTPError as error:
        estado, headers = error.code, dict(error.headers or {})
        raise
    finally:
        if control:
            # Nunca registrar cabeceras de petición, claves ni cookies de respuesta.
            seleccion = {k.lower(): v for k, v in headers.items()
                         if k.lower() == 'retry-after' or 'ratelimit' in k.lower()}
            control[1](url, estado, seleccion, len(contenido))
    if len(contenido) > MAX_BYTES:
        raise ValueError('Respuesta demasiado grande; no se importa truncada')
    return contenido.decode('utf-8-sig')


def tenis(circuito):
    if circuito not in ('atp', 'wta'):
        raise ValueError('Circuito de tenis desconocido')
    url = f'https://site.api.espn.com/apis/site/v2/sports/tennis/{circuito}/scoreboard'
    pagina = json.loads(descargar(url))
    if not isinstance(pagina.get('events'), list) or not pagina.get('leagues'):
        raise ValueError('Respuesta de tenis sin eventos o circuito')
    return pagina, url


def feb(temporada, competicion='4', *, solo_agenda=False):
    from .feb_html import COMPETICIONES, catalogo, leer
    if not str(temporada).isdigit() or len(str(temporada)) != 4:
        raise ValueError('La temporada FEB necesita su año inicial explícito')
    if competicion not in COMPETICIONES:
        raise ValueError('Competición FEB aún no contrastada')
    base = 'https://baloncestoenvivo.feb.es'
    calendario_url = f'{base}/calendario/{competicion}/{temporada}'
    resultados_url = f'{base}/resultados/{competicion}/{temporada}'
    calendario = descargar(calendario_url)
    resultados = descargar(resultados_url)
    muestra = leer(calendario, resultados, str(temporada), calendario_url, resultados_url, competicion,
                   solo_agenda=solo_agenda)
    muestra['catalogo_anunciado'] = catalogo(calendario)
    return muestra


def cultura(fuente, inicio=None, fin=None):
    """Pasada completa paginada antes de importar; nunca guardar un prefijo.

    Devuelve las filas de la ventana, la URL y el inventario completo de IDs.
    Un cambio de total, repetición o página vacía obliga a repetir la recogida;
    la respuesta anterior sigue disponible en Turso/R2.
    """
    from .familias import FAMILIAS, recorrer
    from .registro import CULTURA
    if fuente not in CULTURA:
        raise ValueError('Agenda cultural desconocida')
    m = CULTURA[fuente]
    desde = date.fromisoformat(inicio) if inicio else date.today()
    hasta = date.fromisoformat(fin) if fin else desde + timedelta(days=30)
    if not 0 <= (hasta - desde).days <= 90:
        raise ValueError('La ventana cultural debe cubrir entre 1 y 91 días')
    filas, ids = recorrer(descargar, m.URL_RECOGIDA, m.CAMPO_ID, FAMILIAS[m.FAMILIA])

    def en_ventana(f):
        primero, ultimo = f.get(m.FECHAS[0]), f.get(m.FECHAS[1]) or f.get(m.FECHAS[0])
        if not primero:
            return True  # Fecha pendiente, sin inventarla.
        return date.fromisoformat(primero[:10]) <= hasta and date.fromisoformat(ultimo[:10]) >= desde
    seleccion = [f for f in filas if en_ventana(f)]
    print(f'[agenda] {fuente}: {len(filas)} registros comprobados; {len(seleccion)} en {desde} → {hasta}')
    # El inventario completo acredita ausencias; la ventana solo decide
    # qué contenidos se actualizan. Nunca deducir ausencias de seleccion.
    return seleccion, m.URL_RECOGIDA, ids
