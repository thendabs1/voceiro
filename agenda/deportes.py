"""Las doce colecciones iniciales; selección manual, sin programación automática."""

from . import blacktop, espn, espn_baloncesto, espn_f1, espn_futbol, espn_tenis, feb, motogp, recogida


COLECCIONES = {
    'espn-atp': ('tenis', 'atp'), 'espn-wta': ('tenis', 'wta'),
    'espn-primera': ('futbol', 'esp.1'), 'espn-segunda': ('futbol', 'esp.2'),
    'espn-nba': ('baloncesto', 'nba'), 'espn-wnba': ('baloncesto', 'wnba'),
    'feb-endesa': ('feb', '4'), 'feb-primera': ('feb', '1'), 'feb-challenge': ('feb', '67'),
    'espn-f1': ('f1', 'f1'), 'motogp': ('motogp', None), 'ocblacktop-wrc': ('wrc', None),
}


def importar(anterior, coleccion, pagina, observado, url=None, temporada=None):
    if coleccion not in COLECCIONES:
        raise ValueError('Colección deportiva desconocida')
    deporte, liga = COLECCIONES[coleccion]
    if deporte == 'tenis':
        return espn_tenis.importar_agenda(anterior, pagina, liga, observado, url)
    if deporte == 'futbol':
        return espn_futbol.importar(anterior, pagina, liga, observado, url)
    if deporte == 'baloncesto':
        return espn_baloncesto.importar(anterior, pagina, liga, observado, url)
    if deporte == 'feb':
        if not isinstance(pagina, dict) or (pagina.get('competicion') or {}).get('id') != liga:
            raise ValueError('Competición FEB distinta de la seleccionada')
        if temporada is not None and str((pagina.get('edicion') or {}).get('id')) != str(temporada):
            raise ValueError('Temporada FEB distinta de la seleccionada')
        return feb.importar_agenda(anterior, pagina, observado)
    if deporte == 'f1':
        return espn_f1.importar(anterior, pagina, observado, url)
    if deporte == 'motogp':
        return motogp.importar(anterior, pagina, observado, url, temporada)
    return blacktop.importar(anterior, pagina, observado, url, temporada)


def recoger(coleccion, *, fecha=None, temporada=None):
    if coleccion not in COLECCIONES:
        raise ValueError('Colección deportiva desconocida')
    if coleccion in espn.COLECCIONES:
        if not fecha:
            raise ValueError('La recogida ESPN requiere una fecha explícita')
        return espn.recoger(coleccion, fecha)
    if not temporada:
        raise ValueError('La recogida requiere una temporada explícita')
    tipo, liga = COLECCIONES[coleccion]
    if tipo == 'feb':
        return recogida.feb(temporada, liga, solo_agenda=True), None
    return (motogp if tipo == 'motogp' else blacktop).recoger(temporada)
