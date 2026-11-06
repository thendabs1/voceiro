"""Site API: colecciones explícitas y transporte compartido, sin recorrer Core."""

import json
from datetime import date
from urllib.parse import urlencode, urlparse

from . import deporte, recogida, tiempos


BASE = 'https://site.api.espn.com/apis/site/v2/sports/'
COLECCIONES = {
    'espn-atp': ('tennis', 'atp'), 'espn-wta': ('tennis', 'wta'),
    'espn-primera': ('soccer', 'esp.1'), 'espn-segunda': ('soccer', 'esp.2'),
    'espn-copa-del-rey': ('soccer', 'esp.copa_del_rey'), 'espn-champions': ('soccer', 'uefa.champions'),
    'espn-liga-f': ('soccer', 'esp.w.1'),
    'espn-nba': ('basketball', 'nba'), 'espn-wnba': ('basketball', 'wnba'),
    'espn-f1': ('racing', 'f1'),
}
# Torneos por rondas: su código público no es el slug de ESPN. Sin previas de
# Champions: son otra liga (`uefa.champions_qual`) y quedan fuera del alcance.
TORNEOS = {'esp.copa_del_rey': 'copa-del-rey', 'uefa.champions': 'champions'}
CODIGOS = {**TORNEOS, 'esp.w.1': 'liga-f'}
# Por el slug de la fase, comprobados con las rondas de 2025/26 y 2026/27. Otro
# slug conserva su código sin nombre: nunca se deduce la ronda de la fecha.
RONDAS = {'qualifying-round': 'Previa', 'first-round': 'Primera eliminatoria',
          'second-round': 'Segunda eliminatoria', 'league-phase': 'Fase liga',
          'knockout-round-playoffs': 'Eliminatoria de acceso', 'round-of-32': 'Dieciseisavos',
          'round-of-16': 'Octavos', 'quarterfinals': 'Cuartos', 'semifinals': 'Semifinales',
          'final': 'Final'}


def validar(pagina, liga):
    eventos = deporte.filas(pagina, 'events', 1000)
    ligas = deporte.filas(pagina, 'leagues', 10)
    if len(ligas) != 1 or ligas[0].get('slug') != liga:
        raise ValueError('Liga ESPN distinta de la solicitada')
    prefijo = deporte.literal(ligas[0].get('uid'), 'UID de liga ESPN') + '~e:'
    if any(not isinstance(e.get('uid'), str) or not e['uid'].startswith(prefijo) for e in eventos):
        raise ValueError('Evento ESPN fuera del espacio de la liga')
    if pagina.get('error') or pagina.get('errors') or pagina.get('next'):
        raise ValueError('Respuesta ESPN con error o paginación pendiente')
    # No tratar el límite de una página como calendario completo.
    if len(eventos) >= 1000:
        raise ValueError('Respuesta ESPN en el límite de eventos')
    list(deporte.unicos(eventos, 'uid'))
    return ligas[0], eventos


def recoger(coleccion, fecha):
    if coleccion not in COLECCIONES:
        raise ValueError('Colección ESPN desconocida')
    dia = date.fromisoformat(fecha)
    deporte_id, liga = COLECCIONES[coleccion]
    url = BASE + deporte_id + '/' + liga + '/scoreboard?' + urlencode({'dates': dia.strftime('%Y%m%d')})
    pagina = json.loads(recogida.descargar(url, cabeceras={'User-Agent': recogida.CHROME_UA}))
    validar(pagina, liga)
    return pagina, url


def enlace(datos, defecto):
    for link in datos.get('links') or []:
        u = urlparse(link.get('href') or '')
        if (u.scheme == 'https' and u.hostname in ('www.espn.com', 'www.espn.es', 'espn.com')
                and not u.username and not u.password and 'summary' in (link.get('rel') or [])):
            return u.geturl()
    return defecto


def estado(datos):
    # Todos los estados deportivos ordinarios producen la misma agenda.
    nombre = (datos.get('status') or {}).get('type', {}).get('name')
    if nombre in ('STATUS_POSTPONED', 'STATUS_DELAYED'):
        return 'aplazado'
    if nombre in ('STATUS_CANCELED', 'STATUS_CANCELLED'):
        return 'cancelado'
    if nombre in ('STATUS_SCHEDULED', 'STATUS_IN_PROGRESS', 'STATUS_HALFTIME',
                  'STATUS_END_PERIOD', 'STATUS_FINAL', 'STATUS_FINAL_OT', 'STATUS_FULL_TIME',
                  'STATUS_FINAL_AET', 'STATUS_FINAL_PEN'):
        return 'programado'
    return 'desconocido'


def comienzo(evento, competicion):
    valores = [competicion.get(k) for k in ('date', 'startDate') if competicion.get(k)]
    if evento.get('date'):
        valores.append(evento['date'])
    if valores and len({tiempos.instante(v) for v in valores}) != 1:
        raise ValueError('Fechas ESPN discrepantes')
    return deporte.intervalo(valores[0] if valores and competicion.get('timeValid') is True else None)


def ronda(temporada, partido):
    codigo = temporada.get('slug')
    if not isinstance(codigo, str) or not codigo:
        return None
    dato = {'codigo': codigo, 'nombre': RONDAS.get(codigo),
            'ida_vuelta': {1: 'ida', 2: 'vuelta'}.get((partido.get('leg') or {}).get('value'))}
    return {k: v for k, v in dato.items() if v}


def partidos(anterior, pagina, liga, observado, *, deporte_id, tema, remoto=False):
    cabecera, eventos = validar(pagina, liga)
    fuente = 'espn-futbol' if deporte_id == 'soccer' else 'espn-baloncesto'
    base = 'https://www.espn.com/' + ('soccer/' if deporte_id == 'soccer' else 'nba/' if liga == 'nba' else 'wnba/')
    a = deporte.Agenda(anterior, fuente, 'ESPN', base, tema, observado, remoto)
    campeonato = a.grupo('liga_uid', cabecera['uid'], 'competicion', cabecera['name'],
                         codigo=CODIGOS.get(liga, liga))
    for e in eventos:
        competiciones = deporte.filas(e, 'competitions', 2)
        if len(competiciones) != 1:
            raise ValueError('Partido ESPN sin competición única')
        partido = competiciones[0]
        uid = deporte.literal(partido.get('uid'), 'UID de partido ESPN')
        if not uid.startswith(e['uid'] + '~c:'):
            raise ValueError('Partido ESPN fuera del espacio de su evento')
        temporada = e.get('season') or {}
        year = deporte.temporada(temporada.get('year'))
        liga_temporada = cabecera.get('season') or {}
        etiqueta = liga_temporada.get('displayName') if str(liga_temporada.get('year')) == year else year
        edicion = a.grupo('temporada', year, 'edicion', etiqueta or year,
            contexto={'liga': cabecera['uid']}, padre=campeonato, relacion='es_edicion_de')
        padre = edicion
        if temporada.get('type') is not None:
            padre = a.grupo('fase', str(temporada['type']), 'fase', temporada.get('slug') or str(temporada['type']),
                contexto={'liga': cabecera['uid'], 'temporada': year}, padre=edicion)
        lados = deporte.filas(partido, 'competitors', 2)
        if len(lados) != 2 or {p.get('homeAway') for p in lados} != {'home', 'away'}:
            raise ValueError('Partido ESPN sin dos lados acreditados')
        equipos = []
        for p in lados:
            t = p.get('team') or {}
            nombre = deporte.literal(t.get('displayName') or t.get('name'), 'equipo ESPN')
            uid = t.get('uid')
            if str(t.get('id', '')).startswith('-') or nombre == 'TBD':
                uid = None
            equipos.append({'papel': 'local' if p['homeAway'] == 'home' else 'visitante',
                            'nombre': nombre, 'id': uid})
        url = enlace(e, base)
        bloques = {'neutral': partido['neutralSite']} if type(partido.get('neutralSite')) is bool else {}
        fase_torneo = ronda(temporada, partido) if liga in TORNEOS else None
        if fase_torneo:
            bloques['ronda_torneo'] = fase_torneo
        a.evento('event_uid', e['uid'], 'encuentro', e.get('name'),
            comienzo(e, partido), padre=padre, estado=estado(partido),
            sitio=partido.get('venue') or e.get('venue'), url=url, equipos=equipos, bloques=bloques or None)
    return a.terminar()
