"""Estadísticas técnicas por medio y día, sin red: las pasadas del recolector
(filas de `runs` en Turso) y los titulares publicados (fichero del día en
R2). Las funciones reciben los datos ya leídos; leer y publicar es cosa de
estadisticas.py."""

from collections import Counter, defaultdict
from datetime import datetime, timedelta
import re
import statistics

from . import config


HUECO_MIN = 20      # minutos sin pasadas que cuentan como hueco (cron cada 10)
TOP = 6             # entradas de las listas de «más frecuentes»
ADELANTO_MIN = 5    # margen antes de dar una fecha por adelantada


def _hhmm(ts):
    return ts[11:16]


def _dt(ts):
    return datetime.fromisoformat(ts)


def _minutos(a, b):
    return round((_dt(b) - _dt(a)).total_seconds() / 60)


def _pct(parte, total):
    return round(100 * parte / total) if total else None


def _percentil(valores, p):
    """Percentil por el método de rango más cercano; None sin valores."""
    if not valores:
        return None
    v = sorted(valores)
    return v[min(len(v) - 1, max(0, round(p / 100 * len(v) + 0.5) - 1))]


def _top(contador, n=TOP):
    return dict(contador.most_common(n))


def _estado_intento(estado):
    """'ok' | 'pocos' (devolvió menos del mínimo) | el error tal cual."""
    return 'pocos' if estado.isdigit() else estado


# ─── Pasadas (runs) ───

def resumen_runs(filas):
    """filas: dicts de `runs` de un día (ts, dominio, ok, fuente, n_items,
    con_fecha, ms, error, intentos), en cualquier orden.
    Devuelve (por_medio, recolector)."""
    por_dom = defaultdict(list)
    for f in filas:
        por_dom[f['dominio']].append(f)
    tss = sorted({f['ts'] for f in filas})
    return ({d: _resumen_medio_runs(sorted(fs, key=lambda f: f['ts']), tss)
             for d, fs in sorted(por_dom.items())},
            _resumen_recolector(tss))


def _resumen_medio_runs(fs, tss):
    oks = [f for f in fs if f['ok']]
    ms = [f['ms'] for f in fs]
    items = [f['n_items'] for f in oks]
    total_items = sum(items)

    intentos = defaultdict(Counter)
    cadenas = Counter()
    rescates = 0
    for f in fs:
        pasos = [p for p in (f.get('intentos') or '').split(' > ') if ':' in p]
        for p in pasos:
            fuente, estado = p.split(':', 1)
            intentos[fuente][_estado_intento(estado)] += 1
        if len(pasos) > 1:
            cadenas[f['intentos']] += 1
            if f['ok'] and not pasos[0].endswith(':ok'):
                rescates += 1

    # Rachas de fallos: de la primera pasada fallida a la siguiente buena (o
    # a la última pasada del recolector en el día, si no se recupera).
    racha = racha_max = racha_min = 0
    inicio = None
    for f in fs:
        if f['ok']:
            if inicio:
                racha_min = max(racha_min, _minutos(inicio, f['ts']))
            racha, inicio = 0, None
        else:
            racha += 1
            inicio = inicio or f['ts']
            racha_max = max(racha_max, racha)
    if inicio:
        racha_min = max(racha_min, _minutos(inicio, tss[-1]))

    # Ventana: minutos entre dos pasadas buenas seguidas. Es lo que abarca
    # una estimada (se reparte entre la pasada anterior y esta).
    ventanas = [_minutos(a['ts'], b['ts']) for a, b in zip(oks, oks[1:])]

    return {
        'pasadas': len(fs),
        'ok': len(oks),
        'fuentes': _top(Counter(f['fuente'] for f in oks if f['fuente'])),
        'titulares_pasada': ({'media': round(total_items / len(items), 1),
                              'min': min(items), 'max': max(items)}
                             if items else None),
        'con_fecha_pct': _pct(sum(f['con_fecha'] for f in oks), total_items),
        'ms': {'media': round(statistics.fmean(ms)), 'p50': _percentil(ms, 50),
               'p95': _percentil(ms, 95), 'max': max(ms)},
        'intentos': {k: dict(v.most_common()) for k, v in sorted(intentos.items())},
        'cadenas': _top(cadenas),
        'rescates': rescates,
        'errores': _top(Counter(f['error'][:120] for f in fs if f['error'])),
        'racha_fallos': racha_max,
        'racha_fallos_min': racha_min,
        'ventana_min': ({'p50': _percentil(ventanas, 50), 'p90': _percentil(ventanas, 90),
                         'max': max(ventanas)} if ventanas else None),
        'primera_ok': _hhmm(oks[0]['ts']) if oks else None,
        'ultima_ok': _hhmm(oks[-1]['ts']) if oks else None,
        'ultimo_estado': 'ok' if fs[-1]['ok'] else 'fallo',
    }


def _resumen_recolector(tss):
    if not tss:
        return {'pasadas': 0}
    huecos = [_minutos(a, b) for a, b in zip(tss, tss[1:])]
    return {
        'pasadas': len(tss),
        'primera': _hhmm(tss[0]),
        'ultima': _hhmm(tss[-1]),
        'intervalo_p50': _percentil(huecos, 50),
        'huecos': sum(1 for h in huecos if h > HUECO_MIN),
        'hueco_max': max(huecos, default=0),
    }


# ─── Titulares (fichero del día en R2) ───

def _items_del_dia(payload):
    """Cada titular publicado, con las copias de `a` como titulares de su
    medio: heredan titular y fuente del representante si no traen los suyos."""
    for n in payload.get('noticias', []):
        alts = n.get('a') or []
        grupo = len({n.get('d')} | {a.get('d') for a in alts})
        yield n, grupo
        for a in alts:
            yield {'t': n.get('t', ''), 'f': n.get('f', ''), **a}, grupo


def _local(fecha, valor):
    """'HH:MM' del día o ISO completo → datetime en hora de Madrid."""
    if len(valor) == 5:
        return datetime.fromisoformat(f'{fecha}T{valor}').replace(tzinfo=config.TZ_MADRID)
    return _dt(valor).astimezone(config.TZ_MADRID)


def _hhmm_del_dia(fecha, valor):
    """'HH:MM' de `valor` si cae en el día `fecha`; None si no."""
    if not valor:
        return None
    dt = _local(fecha, valor)
    return dt.strftime('%H:%M') if dt.date().isoformat() == fecha else None


def _clase_fecha(n, fecha):
    p, e = n.get('p', ''), n.get('e', '')
    if p:
        if len(p) == 10:
            return 'solo_dia'
        if len(p) == 5:
            return 'hora_00' if p == '00:00' else 'con_hora'
        # ISO del mismo día: hora repetida por el cambio de horario.
        dia = _local(fecha, p).date().isoformat()
        if dia == fecha:
            return 'con_hora'
        return 'futura' if dia > fecha else 'pasada'
    return 'estimada' if e else 'sin_fecha'


def _hora_visible(n, clase, fecha):
    if clase == 'con_hora':
        return _hhmm_del_dia(fecha, n['p'])
    for k in ('e', 'c'):
        h = _hhmm_del_dia(fecha, n.get(k, ''))
        if h:
            return h
    return None


_RE_SECCION_NO = re.compile(r'^(\d+|.*\.(html?|php|aspx?))$')


def _seccion(u):
    if not u or not u.startswith('/'):
        return None
    s = u.split('?', 1)[0].strip('/').split('/', 1)[0].lower()
    return None if not s or _RE_SECCION_NO.match(s) else s


def resumen_titulares(payload, fecha):
    """Devuelve (por_medio, total) del fichero `all` del día `fecha`."""
    por_dom = defaultdict(list)
    for n, grupo in _items_del_dia(payload):
        if n.get('d'):
            por_dom[n['d']].append((n, grupo))

    por_medio = {d: _resumen_medio_titulares(its, fecha)
                 for d, its in sorted(por_dom.items())}

    medios = payload.get('medios', {})
    por_grupo = defaultdict(lambda: {'medios': 0, 'titulares': 0})
    fechas = Counter()
    for d, r in por_medio.items():
        g = por_grupo[(medios.get(d) or {}).get('g', '')]
        g['medios'] += 1
        g['titulares'] += r['titulares']
        fechas.update(r['fechas'])
    return por_medio, {
        'titulares': sum(r['titulares'] for r in por_medio.values()),
        'medios': len(por_medio),
        'fechas': dict(fechas),
        'compartidos': sum(1 for n in payload.get('noticias', []) if n.get('a')),
        'por_grupo': dict(sorted(por_grupo.items())),
    }


def _resumen_medio_titulares(its, fecha):
    fechas = Counter()
    por_fuente = defaultdict(Counter)
    por_hora = [0] * 24
    horas = []
    retrasos = []
    adelantos = []
    for n, _ in its:
        clase = _clase_fecha(n, fecha)
        fechas[clase] += 1
        por_fuente[n.get('f') or '?'][clase] += 1
        h = _hora_visible(n, clase, fecha)
        if h:
            por_hora[int(h[:2])] += 1
            horas.append(h)
        if clase == 'con_hora' and n.get('c'):
            # Por instantes: restar dos horas de Madrid no ve el cambio de horario.
            m = (_local(fecha, n['c']).timestamp() - _local(fecha, n['p']).timestamp()) / 60
            if m < -ADELANTO_MIN:
                adelantos.append(round(-m))
            else:
                retrasos.append(max(0, round(m)))

    return {
        'titulares': len(its),
        'fechas': dict(fechas),
        'por_hora': por_hora,
        'retraso_min': ({'p50': _percentil(retrasos, 50),
                         'p90': _percentil(retrasos, 90), 'n': len(retrasos)}
                        if retrasos else None),
        # Publicadas después de recogerlas. Un adelanto cercano a un
        # múltiplo de 60 apunta a la zona horaria; uno disperso, a la fuente.
        'adelantadas': len(adelantos),
        'adelanto_p50': _percentil(adelantos, 50),
        'fechas_por_fuente': {f: dict(c) for f, c in sorted(por_fuente.items())},
        'compartidos': sum(1 for _, g in its if g > 1),
        'fuentes': _top(Counter(n.get('f') for n, _ in its if n.get('f'))),
        'long_media': round(statistics.fmean(len(n.get('t', '')) for n, _ in its)),
        'secciones': _top(Counter(s for n, _ in its if (s := _seccion(n.get('u'))))),
        'primera': min(horas) if horas else None,
        'ultima': max(horas) if horas else None,
    }


# ─── Días y series ───

def dias_a_calcular(hoy, n):
    """Los n días anteriores a `hoy`, del más reciente al más antiguo."""
    return [(hoy - timedelta(days=i)).isoformat() for i in range(1, n + 1)]


def cerrado(dia, hoy):
    """El recolector reescribe hoy y los 3 días anteriores: a partir del
    cuarto, el día ya no cambia."""
    return (hoy - datetime.fromisoformat(dia).date()).days >= 4


# Campos de las series: (columna, ruta JSON). Con el medio presente en el
# fichero del día, las cuentas que faltan son 0 (Counter no guarda ceros).
CAMPOS_SERIE = {
    'pasadas':     ('runs', '$.pasadas'),
    'ok':          ('runs', '$.ok'),
    'ms_p50':      ('runs', '$.ms.p50'),
    'rescates':    ('runs', '$.rescates'),
    'ventana_p50': ('runs', '$.ventana_min.p50'),
    'titulares':   ('pub',  '$.titulares'),
    'con_hora':    ('pub',  '$.fechas.con_hora'),
    'retraso_p50': ('pub',  '$.retraso_min.p50'),
    'compartidos': ('pub',  '$.compartidos'),
}
_CUENTAS_PUB = ('con_hora', 'compartidos')


def serie(dias, filas):
    """filas: {dia: {campo: valor}} de un medio, con los campos de
    CAMPOS_SERIE. Una lista por campo, alineada con `dias`; None donde no
    hay dato."""
    out = {campo: [] for campo in CAMPOS_SERIE}
    for d in dias:
        f = filas.get(d) or {}
        for campo in CAMPOS_SERIE:
            v = f.get(campo)
            if v is None and campo in _CUENTAS_PUB and f.get('titulares') is not None:
                v = 0
            out[campo].append(v)
    return out
