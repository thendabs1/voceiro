"""Ciclo de recogida de temporadas; independiente del resultado de sus citas."""

from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

from . import nucleo, tiempos


ESTADOS = {'anunciada', 'activa', 'en_cierre', 'cerrada', 'pausada'}
CATALOGO = {
    'atp': ('ATP', 'espn-atp', 'fecha'),
    'wta': ('WTA', 'espn-wta', 'fecha'),
    'primera': ('Primera', 'espn-primera', 'fecha'),
    'segunda': ('Segunda', 'espn-segunda', 'fecha'),
    'nba': ('NBA', 'espn-nba', 'fecha'),
    'wnba': ('WNBA', 'espn-wnba', 'fecha'),
    'feb-endesa': ('LF Endesa', 'feb-endesa', 'temporada'),
    'feb-primera': ('Primera FEB', 'feb-primera', 'temporada'),
    'feb-challenge': ('LF Challenge', 'feb-challenge', 'temporada'),
    'f1': ('Fórmula 1', 'espn-f1', 'fecha'),
    'motogp': ('MotoGP', 'motogp', 'temporada'),
    'wrc': ('WRC', 'ocblacktop-wrc', 'temporada'),
}
POLITICA = {
    'horizonte_dias': 14, 'margen_cierre_dias': 2, 'revision_cierre_horas': 24,
    'revision_proxima_horas': 12, 'revision_lejana_horas': 72,
    'revision_anunciada_horas': 168, 'descubrimiento_horas': 168,
    'max_peticiones_pasada': 32, 'max_peticiones_dia': 64,
}


def momento(valor):
    return tiempos.instante(valor).astimezone(timezone.utc)


def marca(valor):
    return momento(valor).isoformat(timespec='microseconds')


def despues(ahora, **intervalo):
    return (momento(ahora) + timedelta(**intervalo)).isoformat(timespec='microseconds')


def nueva(coleccion, referencia, ahora, *, seleccion=None, principal=None, politica=None):
    if coleccion not in CATALOGO or not isinstance(referencia, str) or not referencia.strip():
        raise ValueError('Colección o referencia de temporada inválida')
    reglas = {**POLITICA, **(politica or {})}
    if any(type(v) is not int or v <= 0 for v in reglas.values()) or reglas.keys() != POLITICA.keys():
        raise ValueError('Política de recogida inválida')
    return {'id': nucleo.identificador('temporada-control', coleccion, referencia),
        'coleccion': coleccion, 'referencia': referencia, 'seleccion': deepcopy(seleccion or {}),
        'principal': principal or CATALOGO[coleccion][1], 'politica': reglas,
        'estado': 'activa', 'creada': marca(ahora), 'revision': 0,
        'inicio': None, 'fin': None, 'limites_evidencia': None,
        'fin_confirmado': False, 'cobertura_completa': False,
        'fases_completas': False, 'programa_completo': False,
        'ultima_valida': None, 'ultimo_intento': None, 'proxima_revision': marca(ahora),
        'incidencias': [], 'errores_consecutivos': 0, 'bloqueada': False,
        'en_cierre_desde': None, 'cerrada': None, 'historial': []}


def validar(t):
    if (t.get('coleccion') not in CATALOGO or t.get('estado') not in ESTADOS
            or t.get('id') != nucleo.identificador('temporada-control', t['coleccion'], t['referencia'])):
        raise ValueError('Temporada de control incompatible')
    if t['inicio']:
        date.fromisoformat(t['inicio'])
    if t['fin']:
        date.fromisoformat(t['fin'])
    if t['inicio'] and t['fin'] and t['inicio'] > t['fin']:
        raise ValueError('Límites de temporada invertidos')
    if t['fin_confirmado'] and (not t['fin'] or not t['limites_evidencia']):
        raise ValueError('El fin de temporada necesita fecha y evidencia')
    if t['estado'] == 'cerrada' and t['proxima_revision'] is not None:
        raise ValueError('Una temporada cerrada no programa recogidas')
    return t


def editable(t, ahora):
    validar(t)
    if t['estado'] in ('cerrada', 'pausada') or t['bloqueada']:
        raise ValueError('Reabrir la temporada antes de registrar otra recogida')
    anterior = t['ultimo_intento'] or t['creada']
    if momento(ahora) < momento(anterior):
        raise ValueError('Una recogida no puede ser anterior al último intento')


def vencida(t, ahora):
    validar(t)
    return (t['estado'] not in ('cerrada', 'pausada') and not t['bloqueada']
            and t['proxima_revision'] is not None
            and momento(t['proxima_revision']) <= momento(ahora))


def reabrir(t, ahora, motivo):
    if not isinstance(motivo, str) or not motivo.strip():
        raise ValueError('Reabrir o reanudar requiere un motivo')
    validar(t)
    if momento(ahora) < momento(t['ultimo_intento'] or t['creada']):
        raise ValueError('Reabrir no puede ser anterior al último intento')
    r = deepcopy(t)
    r['historial'].append({'accion': 'reabrir', 'cuando': marca(ahora),
                          'motivo': motivo.strip(), 'estado_anterior': r['estado']})
    r.update(estado='activa', bloqueada=False, proxima_revision=marca(ahora),
             en_cierre_desde=None, cerrada=None)
    return validar(r)


def esperar_retry(valor, ahora):
    if not valor:
        return None
    try:
        segundos = int(valor)
    except (TypeError, ValueError):
        try:
            fecha = parsedate_to_datetime(valor)
            if fecha.tzinfo is None:
                fecha = fecha.replace(tzinfo=timezone.utc)
            return max(fecha.astimezone(timezone.utc), momento(ahora)).isoformat(timespec='microseconds')
        except (TypeError, ValueError, OverflowError):
            return None
    return despues(ahora, seconds=max(0, segundos))


def fallida(t, ahora, error, *, estado_http=None, retry_after=None):
    editable(t, ahora)
    r = deepcopy(t)
    r['errores_consecutivos'] += 1
    r['ultimo_intento'] = marca(ahora)
    r['incidencias'] = [{'tipo': 'error_recogida', 'detalle': str(error)[:500], 'http': estado_http}]
    r['bloqueada'] = estado_http in (401, 403)
    r['proxima_revision'] = None if r['bloqueada'] else reintento(ahora, r['errores_consecutivos'], retry_after)
    return validar(r)


def reintento(ahora, errores, retry_after=None):
    """Tras un error: 30 min, 1 h, 2 h… hasta 24 h, o lo que pida Retry-After si es más."""
    return max(esperar_retry(retry_after, ahora) or marca(ahora),
               despues(ahora, minutes=min(1440, 15 * 2 ** min(errores, 6))))


def exitosa(t, ahora, alcance, incidencias=(), proximas=()):
    """Cierre en dos pasadas: nunca desde el máximo de las citas descargadas."""
    editable(t, ahora)
    if (any(alcance.get(campo) and alcance[campo] != t[campo] for campo in ('inicio', 'fin'))
            or alcance.get('fin_confirmado') is True) and not alcance.get('evidencia'):
        raise ValueError('Los límites de temporada necesitan evidencia de esta recogida')
    r = deepcopy(t)
    for campo in ('inicio', 'fin'):
        if alcance.get(campo):
            r[campo] = date.fromisoformat(alcance[campo]).isoformat()
    if alcance.get('evidencia'):
        r['limites_evidencia'] = deepcopy(alcance['evidencia'])
    for campo in ('fin_confirmado', 'cobertura_completa', 'fases_completas', 'programa_completo'):
        # La última respuesta manda; una selección parcial no hereda completitud.
        r[campo] = alcance.get(campo) is True
    r.update(ultima_valida=marca(ahora), ultimo_intento=marca(ahora),
             errores_consecutivos=0, bloqueada=False, incidencias=list(incidencias))
    hoy = momento(ahora).date()
    elegible = (all(r[k] for k in ('fin_confirmado', 'cobertura_completa', 'fases_completas', 'programa_completo'))
        and r['fin'] and hoy > date.fromisoformat(r['fin']) + timedelta(days=r['politica']['margen_cierre_dias'])
        and not incidencias)
    if elegible and t['estado'] == 'en_cierre' and t['en_cierre_desde'] and (
            momento(ahora) >= momento(t['en_cierre_desde']) + timedelta(hours=r['politica']['revision_cierre_horas'])):
        r.update(estado='cerrada', cerrada=marca(ahora), proxima_revision=None)
        r['historial'].append({'accion': 'cerrar', 'cuando': marca(ahora),
                              'motivo': 'Fin acreditado y comprobación final completa'})
    elif elegible:
        r.update(estado='en_cierre', en_cierre_desde=t.get('en_cierre_desde') or marca(ahora),
                 proxima_revision=despues(ahora, hours=r['politica']['revision_cierre_horas']))
    else:
        anunciada = bool(r['inicio'] and hoy < date.fromisoformat(r['inicio']))
        cercanas = any(hoy <= date.fromisoformat(d) <= hoy + timedelta(days=7) for d in proximas if d)
        cadencia = ('revision_anunciada_horas' if anunciada else
                    'revision_proxima_horas' if cercanas or incidencias else 'revision_lejana_horas')
        r.update(estado='anunciada' if anunciada else 'activa', en_cierre_desde=None,
                 proxima_revision=despues(ahora, hours=r['politica'][cadencia]))
    return validar(r)


def plan_fechas(t, ahora, cobertura, *, limite=None):
    """Huecos primero; después días caducados. Conserva cada día como unidad."""
    validar(t)
    if limite is not None and (type(limite) is not int or limite < 0):
        raise ValueError('El límite de unidades debe ser un entero no negativo')
    if t['estado'] in ('cerrada', 'pausada') or t['bloqueada']:
        return []
    hoy = momento(ahora).date()
    primero = max(hoy, date.fromisoformat(t['inicio'])) if t['inicio'] else hoy
    ultimo = hoy + timedelta(days=t['politica']['horizonte_dias'] - 1)
    if t['fin'] and t['fin_confirmado']:
        ultimo = min(ultimo, date.fromisoformat(t['fin']))
    # Tras el fin se revalida el último día declarado para el cierre, no hoy.
    if ultimo < primero and t['fin_confirmado']:
        primero = ultimo = date.fromisoformat(t['fin'])
    dias = [(primero + timedelta(days=i)).isoformat() for i in range(max(0, (ultimo - primero).days + 1))]
    comprobadas = {}
    for c in cobertura:
        if c['proveedor'] == t['principal'] and c.get('completa'):
            d = c['unidad']
            if d not in comprobadas or momento(c['comprobado']) > momento(comprobadas[d]):
                comprobadas[d] = marca(c['comprobado'])
    horas = t['politica']['revision_proxima_horas']
    pendientes = [d for d in dias if d not in comprobadas or
                  momento(comprobadas[d]) + timedelta(hours=horas) <= momento(ahora)]
    pendientes.sort(key=lambda d: (d in comprobadas, comprobadas.get(d, ''), d))
    return pendientes[:limite] if limite is not None else pendientes
