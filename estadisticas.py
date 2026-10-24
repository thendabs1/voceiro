"""
Estadísticas técnicas de Voceiro (tarea diaria, estadisticas.yml).

  1. Para cada uno de los últimos N días (4 por defecto: el recolector
     reescribe hasta 3 días atrás), resume las pasadas del día (`runs` en
     Turso) y los titulares del fichero `all` del día en R2.
  2. Lo guarda en Turso: `medio_dia` (medio y día) y `dia_stats` (día). Si
     falta una de las dos fuentes (runs podados a los 30 días, o día fuera
     de la ventana de R2), se conserva lo que ya había.
  3. Publica en R2, desde lo guardado:
        · estadisticas.json                  índice de días y series de 30
                                             días por medio
        · estadisticas-dia-AAAA-MM-DD.json   detalle de cada día recalculado
        · estadisticas-medio-<dominio>.json  serie completa de cada medio

Uso: python estadisticas.py [días]
"""

from datetime import datetime, timedelta
import json
import os
import sys
import tempfile

from medios import todos_los_medios

from cosecha import config, r2, turso
from cosecha import estadisticas as est


DIAS_SERIE = 30     # días de las series de estadisticas.json
PAGINA = 5000       # filas de runs por consulta


def _json(v):
    return json.dumps(v, ensure_ascii=False, separators=(',', ':'))


def _leer(valor):
    """'' (sin datos) y 'null' → None."""
    return json.loads(valor) if valor else None


def _consulta(sql, args=()):
    res = turso.turso_pipeline([turso._t_stmt(sql, args)], timeout=60)
    if res is None:
        raise SystemExit(f"[estadisticas!] Turso: falló {sql.split()[0]} {sql[:60]!r}")
    return turso._t_rows(res)


COLS_RUNS = ('ts', 'dominio', 'ok', 'fuente', 'n_items', 'con_fecha', 'ms',
             'error', 'intentos')


def leer_runs(dia):
    """Filas de `runs` del día (hora de Madrid), paginadas por la clave."""
    siguiente = (datetime.fromisoformat(dia) + timedelta(days=1)).date().isoformat()
    filas, ultimo = [], ('', '')
    while True:
        lote = _consulta(
            f"SELECT {', '.join(COLS_RUNS)} FROM runs"
            " WHERE ts >= ? AND ts < ? AND (ts, dominio) > (?, ?)"
            f" ORDER BY ts, dominio LIMIT {PAGINA}",
            (dia, siguiente, *ultimo))
        filas += [dict(zip(COLS_RUNS, f)) for f in lote]
        if len(lote) < PAGINA:
            return filas
        ultimo = (lote[-1][0], lote[-1][1])


def bajar_dia(client, inventario, dia):
    """Payload del fichero `all` del día, o None si ya no está en la ventana."""
    for d in inventario.get('dias', []):
        if d.get('fecha') == dia and (d.get('all') or {}).get('file'):
            obj = client.get_object(Bucket=r2.R2_BUCKET, Key=d['all']['file'])
            return json.loads(obj['Body'].read())
    return None


def guardar_dia(dia, catalogo, runs, recolector, pub, total, hoy):
    """Upsert de un día. `runs`/`pub` = None si falta esa fuente: se
    conserva lo guardado. Las filas que no cambian no cuestan escrituras."""
    dominios = set(catalogo) | set(runs or {}) | set(pub or {})
    stmts = [turso._t_stmt("""
        INSERT INTO medio_dia (dia, dominio, runs, pub) VALUES (?,?,?,?)
        ON CONFLICT(dia, dominio) DO UPDATE SET
            runs = CASE WHEN excluded.runs != '' THEN excluded.runs ELSE medio_dia.runs END,
            pub  = CASE WHEN excluded.pub  != '' THEN excluded.pub  ELSE medio_dia.pub  END
        WHERE (excluded.runs != '' AND excluded.runs IS NOT medio_dia.runs)
           OR (excluded.pub  != '' AND excluded.pub  IS NOT medio_dia.pub)
    """, (dia, d,
          '' if runs is None else _json(runs.get(d)),
          '' if pub is None else _json(pub.get(d)))) for d in sorted(dominios)]
    stmts.append(turso._t_stmt("""
        INSERT INTO dia_stats (dia, cerrado, recolector, total) VALUES (?,?,?,?)
        ON CONFLICT(dia) DO UPDATE SET
            cerrado    = excluded.cerrado,
            recolector = CASE WHEN excluded.recolector != '' THEN excluded.recolector
                              ELSE dia_stats.recolector END,
            total      = CASE WHEN excluded.total != '' THEN excluded.total
                              ELSE dia_stats.total END
        WHERE excluded.cerrado IS NOT dia_stats.cerrado
           OR (excluded.recolector != '' AND excluded.recolector IS NOT dia_stats.recolector)
           OR (excluded.total != '' AND excluded.total IS NOT dia_stats.total)
    """, (dia, 1 if est.cerrado(dia, hoy) else 0,
          '' if recolector is None else _json(recolector),
          '' if total is None else _json(total))))
    for i in range(0, len(stmts), 300):
        if turso.turso_pipeline(stmts[i:i + 300]) is None:
            raise SystemExit(f"[estadisticas!] no se pudo guardar {dia}")


def leer_series(desde, hasta):
    """{dominio: {dia: {campo: valor}}} con los campos de las series, por
    tramos de días: sin traer los JSON enteros de todo el histórico."""
    campos = list(est.CAMPOS_SERIE)
    sel = ', '.join(f"json_extract(nullif({col}, ''), '{ruta}')"
                    for col, ruta in est.CAMPOS_SERIE.values())
    out = {}
    tramo = datetime.fromisoformat(desde).date()
    fin = datetime.fromisoformat(hasta).date()
    while tramo <= fin:
        corte = tramo + timedelta(days=31)
        for dia, dom, *vals in _consulta(
                f"SELECT dia, dominio, {sel} FROM medio_dia WHERE dia >= ? AND dia < ?",
                (tramo.isoformat(), corte.isoformat())):
            out.setdefault(dom, {})[dia] = dict(zip(campos, vals))
        tramo = corte
    return out


def publicar(hoy, recalculados, catalogo, carpeta):
    """Escribe en `carpeta` los JSON públicos desde Turso y devuelve sus rutas."""
    desde = (hoy - timedelta(days=config.DIAS_ARCHIVO)).isoformat()
    dias_info = {d: {'fecha': d, 'cerrado': bool(c), 'recolector': _leer(r), 'total': _leer(t)}
                 for d, c, r, t in _consulta(
                     "SELECT dia, cerrado, recolector, total FROM dia_stats"
                     " WHERE dia >= ? ORDER BY dia", (desde,))}
    if not dias_info:
        return []

    primero = datetime.fromisoformat(min(dias_info)).date()
    todos = [(primero + timedelta(days=i)).isoformat()
             for i in range((hoy - primero).days)]
    ultimos = todos[-DIAS_SERIE:]
    series = leer_series(todos[0], todos[-1])
    generado = datetime.now(config.TZ_MADRID).isoformat(timespec='seconds')
    rutas = []

    def escribir(nombre, payload):
        ruta = os.path.join(carpeta, nombre)
        with open(ruta, 'w', encoding='utf-8') as f:
            f.write(_json(payload))
        rutas.append(ruta)

    for dia in recalculados:
        if dia not in dias_info:
            continue
        escribir(f'estadisticas-dia-{dia}.json', {
            **dias_info[dia], 'generado': generado,
            'medios': {d: {'runs': _leer(runs), 'pub': _leer(pub)}
                       for d, runs, pub in _consulta(
                           "SELECT dominio, runs, pub FROM medio_dia WHERE dia = ?"
                           " ORDER BY dominio", (dia,))},
        })

    for d, filas in sorted(series.items()):
        escribir(f'estadisticas-medio-{d}.json', {
            'dominio': d, 'generado': generado, **catalogo.get(d, {}),
            'dias': todos, 'serie': est.serie(todos, filas),
        })

    # El índice va sin el desglose por grupo: está en el fichero de cada día.
    escribir('estadisticas.json', {
        'generado': generado,
        'dias': [{**info, 'total': info['total'] and
                  {k: v for k, v in info['total'].items() if k != 'por_grupo'}}
                 for _, info in sorted(dias_info.items(), reverse=True)],
        'medios': catalogo,
        'serie_dias': ultimos,
        'serie': {d: est.serie(ultimos, filas) for d, filas in sorted(series.items())},
    })
    return rutas


def main(n_dias=4):
    if not (turso.TURSO_HTTP_URL and turso.TURSO_TOKEN):
        raise SystemExit("[estadisticas!] faltan credenciales de Turso")
    client = r2._r2_client()
    if not client:
        raise SystemExit("[estadisticas!] faltan credenciales de R2")

    hoy = datetime.now(config.TZ_MADRID).date()
    catalogo = {m['d']: {'n': m['n'], 'g': m['grupo'], 't': m.get('type', ''),
                         'ambito': m.get('ambito') or ''}
                for m in todos_los_medios()}
    inventario = json.loads(r2._bajar_inventario(client) or b'{}')
    turso._turso_ensure_schema()

    dias = est.dias_a_calcular(hoy, n_dias)
    for dia in dias:
        filas = leer_runs(dia)
        runs, recolector = est.resumen_runs(filas) if filas else (None, None)
        payload = bajar_dia(client, inventario, dia)
        pub, total = est.resumen_titulares(payload, dia) if payload else (None, None)
        guardar_dia(dia, catalogo, runs, recolector, pub, total, hoy)
        print(f"[estadisticas] {dia}: {len(filas)} filas de runs"
              f" · {total['titulares'] if total else 'sin'} titulares en R2"
              f"{' · cerrado' if est.cerrado(dia, hoy) else ''}")

    with tempfile.TemporaryDirectory() as carpeta:
        rutas = publicar(hoy, dias, catalogo, carpeta)
        _, _, errores = r2.subir_a_r2(rutas)
    if errores:
        raise SystemExit(f"[estadisticas!] {errores} ficheros sin subir")


if __name__ == '__main__':
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 4
    if not 1 <= n <= config.DIAS_VENTANA:
        raise SystemExit(f"días: entre 1 y {config.DIAS_VENTANA} (los ficheros"
                         " `all` de R2; runs guarda 30)")
    main(n)
