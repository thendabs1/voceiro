"""Fuentes de agenda seleccionadas; el contraste nunca cambia la autoridad."""

from datetime import date

from . import blacktop, deporte, deportes, espn, motogp, temporadas, tiempos


# Cambiar de principal es una decisión de configuración, no una reacción a errores.
PRINCIPALES = {'f1': 'formula1', 'wta': 'wta',
               'primera': 'laliga-primera', 'segunda': 'laliga-segunda'}
OFICIALES = {'formula1': 'oficial_f1', 'wta': 'oficial_wta',
             'laliga-primera': 'oficial_laliga', 'laliga-segunda': 'oficial_laliga'}


def principal(coleccion):
    return PRINCIPALES.get(coleccion, temporadas.CATALOGO[coleccion][1])


def modo(proveedor):
    return 'fecha' if proveedor in espn.COLECCIONES else 'temporada'


def fuente_nucleo(proveedor):
    if proveedor.startswith('laliga-'):
        return 'laliga'
    if proveedor in ('espn-primera', 'espn-segunda'):
        return 'espn-futbol'
    if proveedor in ('espn-nba', 'espn-wnba'):
        return 'espn-baloncesto'
    if proveedor.startswith('feb-'):
        return 'feb'
    return proveedor


def _oficial(proveedor):
    from importlib import import_module
    return import_module('.' + OFICIALES[proveedor], __package__)


def recoger(proveedor, *, temporada=None, fecha=None, inicio=None, fin=None):
    if proveedor in OFICIALES:
        modulo = _oficial(proveedor)
        if proveedor.startswith('laliga-'):
            return modulo.recoger(temporada, competicion=proveedor.removeprefix('laliga-'), inicio=inicio, fin=fin)
        if proveedor == 'formula1':
            return modulo.recoger(temporada, inicio=inicio, fin=fin)
        return modulo.recoger(temporada)
    return deportes.recoger(proveedor, temporada=temporada, fecha=fecha)


def importar(anterior, proveedor, pagina, observado, url=None, temporada=None):
    if proveedor in OFICIALES:
        extra = {'competicion': proveedor.removeprefix('laliga-')} if proveedor.startswith('laliga-') else {}
        return _oficial(proveedor).importar(anterior, pagina, observado, url=url, temporada=temporada, **extra)
    return deportes.importar(anterior, proveedor, pagina, observado, url=url, temporada=temporada)


def describir(proveedor, pagina, url=None):
    if proveedor in OFICIALES:
        extra = {'competicion': proveedor.removeprefix('laliga-')} if proveedor.startswith('laliga-') else {}
        alcance = _oficial(proveedor).describir(pagina, url=url, **extra)
        if proveedor.startswith('laliga-'):
            alcance['seleccion_valida'] = any(p.get('partidos') for p in pagina.get('paginas', []))
        return alcance
    base = {'fin_confirmado': False, 'cobertura_completa': False,
            'fases_completas': False, 'programa_completo': False,
            'evidencia': {'url': url, 'proveedor': proveedor}}
    if proveedor in espn.COLECCIONES:
        _, liga = espn.COLECCIONES[proveedor]
        cabecera, eventos = espn.validar(pagina, liga)
        season = cabecera.get('season') or {}
        years = {deporte.temporada(e['season']['year']) for e in eventos
                 if isinstance(e.get('season'), dict) and e['season'].get('year') is not None}
        year = deporte.temporada(season['year']) if season.get('year') is not None else (
            next(iter(years)) if len(years) == 1 else None)
        if year is None or years - {year}:
            raise ValueError('ESPN no acredita una temporada única para la selección')
        # Los límites amplios de ESPN organizan su API; no prueban que la lista
        # de días contenga todas las fases ni que ese día cierre el campeonato.
        base.update(referencia=year, seleccion={'year': year}, etiqueta=season.get('displayName') or year,
            inicio=None, fin=None,
            limites_proveedor={k: season.get(k) for k in ('startDate', 'endDate')})
        return base
    if proveedor.startswith('feb-'):
        year = deporte.temporada((pagina.get('edicion') or {}).get('id'))
        base.update(referencia=year, seleccion={'year': year,
            'competicion': (pagina.get('competicion') or {}).get('id'),
            'fase': (pagina.get('fase') or {}).get('id')},
            etiqueta=(pagina.get('edicion') or {}).get('nombre') or year,
            seleccion_valida=bool(pagina.get('partidos')))
        # Las dos páginas actuales acreditan esa fase, no todos los playoffs.
        return base
    if proveedor == 'motogp':
        gps = [e for e in pagina if e.get('kind') == 'GP']
        years = {deporte.temporada((e.get('season') or {}).get('year')) for e in gps}
        if len(years) != 1:
            raise ValueError('MotoGP no acredita una temporada única con GP')
        year = next(iter(years))
        dias = [deporte.dias(e.get('date_start'), e.get('date_end'),
                            zona=deporte.zona_iana(e.get('time_zone'))) for e in gps]
        completos = all(d['inicio']['fecha'] and d['fin']['fecha'] for d in dias)
        programa = all({'FP1', 'PR', 'FP2', 'Q1', 'Q2', 'SPR', 'WUP', 'RAC'} <= {
            s.get('shortname') for s in e.get('broadcasts', [])
            if s.get('type') == 'SESSION' and (s.get('category') or {}).get('name') == 'MotoGP'} for e in gps)
        base.update(referencia=year, seleccion={'year': year},
            inicio=min((d['inicio']['fecha'] for d in dias if d['inicio']['fecha']), default=None),
            fin=max((d['fin']['fecha'] for d in dias if d['fin']['fecha']), default=None),
            fin_confirmado=completos, cobertura_completa=True, fases_completas=True, programa_completo=programa)
        return base
    if proveedor == 'ocblacktop-wrc':
        year = deporte.temporada(pagina.get('year'))
        rallies = deporte.filas(pagina, 'rallies', 100)
        # Sin roundCount (OCBlacktop dejó de enviarlo), rondas 1..N seguidas
        # valen como selección, pero no acreditan que no falte una última.
        rondas = sorted(r.get('round') for r in rallies if type(r.get('round')) is int)
        seguidas = bool(rallies) and rondas == list(range(1, len(rallies) + 1))
        completos = seguidas and pagina.get('roundCount') == len(rallies)
        fechas = all(r.get('dateStart') and r.get('dateEnd') and
                     len(r['dateStart']) == len(r['dateEnd']) == 10 for r in rallies)
        base.update(referencia=year, seleccion={'year': year},
            inicio=min((r.get('dateStart') for r in rallies if r.get('dateStart')), default=None),
            fin=max((r.get('dateEnd') for r in rallies if r.get('dateEnd')), default=None),
            fin_confirmado=completos and fechas, cobertura_completa=completos,
            fases_completas=completos, programa_completo=completos and fechas, seleccion_valida=seguidas)
        return base
    raise ValueError('Proveedor de agenda desconocido')


def comprobar_temporada(t, alcance):
    if str(alcance['referencia']) != t['referencia']:
        raise ValueError('La respuesta corresponde a otra temporada; no se amplía la cobertura')
    seleccion = t['seleccion']
    if seleccion.get('competicion') and alcance['seleccion'].get('competicion') != seleccion['competicion']:
        raise ValueError('La respuesta corresponde a otra competición')
