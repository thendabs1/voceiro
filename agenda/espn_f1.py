"""Grandes premios y sesiones ESPN; no importa pilotos ni resultados."""

from . import deporte, espn


def importar(anterior, pagina, observado, url=None):
    liga, eventos = espn.validar(pagina, 'f1')
    a = deporte.Agenda(anterior, 'espn-f1', 'ESPN F1', 'https://www.espn.com/f1/',
                       'automovilismo', observado, bool(url))
    campeonato = a.grupo('liga_uid', liga['uid'], 'competicion', liga['name'], codigo='f1')
    for gp in eventos:
        temporada = deporte.temporada((gp.get('season') or {}).get('year'))
        edicion = a.grupo('temporada', temporada, 'edicion', temporada,
            contexto={'liga': liga['uid']}, padre=campeonato, relacion='es_edicion_de')
        grupo = a.grupo('grand_prix_uid', gp['uid'], 'gran_premio', gp.get('name'), padre=edicion)
        enlace = espn.enlace(gp, a.url)
        principal, _ = a.evento('grand_prix_calendar_uid', gp['uid'], 'actividad_continua', gp.get('name'),
            deporte.dias(gp.get('date'), gp.get('endDate')), padre=grupo, sitio=gp.get('circuit'),
            url=enlace, estado=espn.estado(gp), bloques={'agenda': {'rol': 'principal', 'grupo': grupo,
                'criterio_dias': 'circuito'},
                'limites_proveedor': {'inicio': gp.get('date'), 'fin': gp.get('endDate')}})
        sesiones = deporte.filas({'competitions': gp.get('competitions') or []}, 'competitions', 30)
        for s in deporte.unicos(sesiones, 'uid'):
            if not s['uid'].startswith(gp['uid'] + '~c:'):
                raise ValueError('Sesión F1 fuera del espacio de su gran premio')
            tipo = deporte.literal((s.get('type') or {}).get('abbreviation'), 'tipo de sesión F1')
            a.evento('session_uid', s['uid'], 'sesion', gp['name'] + ' — ' + tipo,
                espn.comienzo({}, s), padre=grupo, estado=espn.estado(s), sitio=gp.get('circuit'),
                url=enlace, bloques={'agenda': {'rol': 'sesion', 'principal': principal, 'tipo_sesion': tipo}})
    return a.terminar()
