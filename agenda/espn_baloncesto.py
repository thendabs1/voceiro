"""Agenda NBA/WNBA, sin tanteos, balances, plantillas o clasificaciones."""

from . import espn


def importar(anterior, pagina, liga, observado, url=None):
    if liga not in ('nba', 'wnba'):
        raise ValueError('Liga de baloncesto fuera del alcance inicial')
    return espn.partidos(anterior, pagina, liga, observado,
                         deporte_id='basketball', tema='baloncesto', remoto=bool(url))
