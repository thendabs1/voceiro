"""Frecuencias del calendario; política pura, sin acceso a proveedores ni almacenes."""

from datetime import date, timedelta


MARGEN_HORAS = 3
CERCA_DIAS = 7
SONDA_HORAS = 168
# Una cita sin programación resuelta bloquea el cierre, pero no acelera la revisión
# ni invalida el día que se leyó entero. Tampoco un partido que dejó su fecha.
PROGRAMACION_PENDIENTE = ('programacion_pendiente', 'programacion_pendiente_conservada', 'ausente_de_su_fecha')
PERFILES = {
    'calendario': {'base': 72, 'cerca': 24, 'competicion': 24},
    'gran-premio': {'base': 72, 'cerca': 24, 'competicion': 6},
}
COLECCIONES = {
    'atp': 'calendario', 'wta': 'calendario',
    'primera': 'calendario', 'segunda': 'calendario',
    'liga-f': 'calendario',
    'copa-del-rey': 'calendario', 'champions': 'calendario',
    'nba': 'calendario', 'wnba': 'calendario',
    'feb-endesa': 'calendario', 'feb-primera': 'calendario', 'feb-challenge': 'calendario',
    'f1': 'gran-premio', 'motogp': 'gran-premio', 'moto2': 'gran-premio', 'moto3': 'gran-premio',
    'wrc': 'gran-premio',
}
RELOJES = dict.fromkeys((
    'cultura-galicia', 'madrid', 'kulturklik', 'zaragoza', 'cyl',
    'atletismo-fga', 'atletismo-fca', 'atletismo-rfea', 'atletismo-wa', 'publicacion',
), 24)
TICK_HORAS = 6


class GuardadoParcial(SystemExit):
    """La fuente quedó guardada; solo falló un complemento: se señala sin repetir la recogida."""


class LecturaInterrumpida(Exception):
    """La fuente cortó la lectura: lo válido quedó guardado y el reloj espera como tras un fallo."""

    def __init__(self, mensaje, retry_after=None):
        super().__init__(mensaje)
        self.headers = {'Retry-After': retry_after}


def horas_reloj(grupo):
    return RELOJES[grupo] - MARGEN_HORAS


def espera_fallo(grupo, errores):
    """Tras un fallo: el tick siguiente, dos ticks y después el ritmo normal del reloj."""
    return min(RELOJES[grupo], TICK_HORAS * 2 ** (errores - 1)) - MARGEN_HORAS


def perfil(coleccion):
    return PERFILES[COLECCIONES[coleccion]]


def horas_temporada(coleccion, hoy, citas=(), incidencias=()):
    """Competición, proximidad o incidencia real; en otro caso, frecuencia base."""
    horas = perfil(coleccion)
    fechas = [(date.fromisoformat(inicio), date.fromisoformat(fin or inicio))
              for inicio, fin in citas if inicio]
    if any(inicio <= hoy <= fin for inicio, fin in fechas):
        return horas['competicion']
    if (any(hoy <= inicio <= hoy + timedelta(days=CERCA_DIAS) for inicio, _ in fechas)
            or any(i.get('tipo') not in PROGRAMACION_PENDIENTE for i in incidencias)):
        return horas['cerca']
    return horas['base']
