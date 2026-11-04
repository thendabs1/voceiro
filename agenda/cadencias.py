"""Frecuencias del calendario; política pura, sin acceso a proveedores ni almacenes."""

from datetime import date, timedelta


MARGEN_HORAS = 3
CERCA_DIAS = 7
PERFILES = {
    'calendario': {'base': 72, 'cerca': 24, 'competicion': 24},
    'gran-premio': {'base': 72, 'cerca': 24, 'competicion': 6},
}
COLECCIONES = {
    'atp': 'calendario', 'wta': 'calendario',
    'primera': 'calendario', 'segunda': 'calendario',
    'nba': 'calendario', 'wnba': 'calendario',
    'feb-endesa': 'calendario', 'feb-primera': 'calendario', 'feb-challenge': 'calendario',
    'f1': 'gran-premio', 'motogp': 'gran-premio', 'wrc': 'gran-premio',
}
RELOJES = dict.fromkeys((
    'cultura-galicia', 'madrid', 'kulturklik', 'zaragoza', 'cyl',
    'atletismo-fga', 'atletismo-fca', 'atletismo-rfea', 'atletismo-wa', 'publicacion',
), 24)


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
            or any(i.get('tipo') not in ('programacion_pendiente', 'programacion_pendiente_conservada')
                   for i in incidencias)):
        return horas['cerca']
    return horas['base']
