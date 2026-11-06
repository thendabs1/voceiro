"""Agenda de liga, Copa y Champions: partidos y equipos mínimos, sin resultados."""

from . import espn


def importar(anterior, pagina, liga, observado, url=None):
    if liga not in ('esp.1', 'esp.2', 'esp.w.1', *espn.TORNEOS):
        raise ValueError('Liga de fútbol fuera del alcance inicial')
    return espn.partidos(anterior, pagina, liga, observado,
                         deporte_id='soccer', tema='futbol', remoto=bool(url))
