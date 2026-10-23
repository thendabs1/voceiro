"""Archivo y diagnóstico en Turso mediante HTTP v2."""

from datetime import datetime, timedelta
import json
import os

import requests

from . import catalogo, config
from .fechas import _dia_iso, _fecha_visible_iso
from .texto import _hash_titular, _norm_strict


TURSO_URL   = os.environ.get('TURSO_DATABASE_URL', '')
TURSO_TOKEN = os.environ.get('TURSO_AUTH_TOKEN', '')
TURSO_HTTP_URL = (TURSO_URL or "").replace("libsql://", "https://")


def _t_arg(v):
    """Convierte un valor Python en un arg HTTP v2 de Turso."""
    if v is None:
        return {"type": "null"}
    if isinstance(v, bool):
        return {"type": "integer", "value": "1" if v else "0"}
    if isinstance(v, int):
        return {"type": "integer", "value": str(v)}
    if isinstance(v, float):
        return {"type": "float", "value": str(v)}
    if isinstance(v, (bytes, bytearray)):
        import base64
        return {"type": "blob", "value": base64.b64encode(v).decode()}
    return {"type": "text", "value": str(v)}


def _t_stmt(sql, args=None):
    """Construye un statement HTTP v2 para Turso."""
    s = {"sql": sql}
    if args is not None:
        s["args"] = [_t_arg(a) for a in args]
    return {"type": "execute", "stmt": s}


def turso_pipeline(statements, timeout=90, errores_ok=()):
    """Manda un batch a Turso HTTP v2. Devuelve la lista de results.
    Devuelve None si hay error de red o de SQL, salvo los errores cuyo
    mensaje contenga alguno de `errores_ok`, que se dan por buenos."""
    if not (TURSO_HTTP_URL and TURSO_TOKEN):
        print("[turso] sin credenciales — saltando")
        return None

    payload = {"requests": list(statements) + [{"type": "close"}]}
    try:
        r = requests.post(
            TURSO_HTTP_URL + "/v2/pipeline",
            headers={
                "Authorization": f"Bearer {TURSO_TOKEN}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=timeout,
        )
    except requests.RequestException as e:
        print(f"[turso!] HTTP: {type(e).__name__}: {e}")
        return None

    if r.status_code != 200:
        print(f"[turso!] HTTP {r.status_code}: {r.text[:300]}")
        return None

    data = r.json()
    results = data.get("results", [])
    for res in results:
        if res.get("type") == "error":
            err = res.get("error", {})
            if any(e in err.get('message', '') for e in errores_ok):
                continue
            print(f"[turso!] {err.get('code')} · {err.get('message','')[:200]}")
            return None
    return results


def _t_val(cell):
    """Convierte una celda de Turso HTTP v2 a un valor Python."""
    if not isinstance(cell, dict):
        return cell
    t = cell.get("type")
    v = cell.get("value")
    if t == "null" or v is None:
        return None
    if t == "integer":
        return int(v)
    if t == "float":
        return float(v)
    if t == "blob":
        import base64
        return base64.b64decode(v)
    return v


def _t_rows(results, idx=0):
    """Extrae las filas de un result de Turso como listas de Python."""
    if not results or idx >= len(results):
        return []
    r = results[idx]
    if r.get("type") != "ok":
        return []
    resp = r.get("response", {})
    if resp.get("type") != "execute":
        return []
    result = resp.get("result", {})
    out = []
    for row in result.get("rows", []):
        out.append([_t_val(cell) for cell in row])
    return out


def _turso_ensure_schema():
    """Crea tablas e índices si no existen. Idempotente."""
    if not (TURSO_HTTP_URL and TURSO_TOKEN):
        return
    stmts = [
        _t_stmt("""CREATE TABLE IF NOT EXISTS noticias (
              enlace        TEXT PRIMARY KEY,
              dominio       TEXT NOT NULL,
              titular       TEXT NOT NULL,
              fecha_pub     TEXT NOT NULL DEFAULT '',
              fecha_est     TEXT NOT NULL DEFAULT '',
              fecha_dia     TEXT NOT NULL,
              fuente        TEXT NOT NULL DEFAULT '',
              hash_titular  TEXT NOT NULL DEFAULT '',
              creado_ts     TEXT NOT NULL,
              actualizado_ts TEXT NOT NULL
            ) WITHOUT ROWID"""),
        _t_stmt("CREATE INDEX IF NOT EXISTS idx_noticias_dia ON noticias(fecha_dia DESC)"),
        _t_stmt("CREATE INDEX IF NOT EXISTS idx_noticias_dominio ON noticias(dominio)"),
        _t_stmt("CREATE INDEX IF NOT EXISTS idx_noticias_hash ON noticias(hash_titular)"),
        _t_stmt("""CREATE TABLE IF NOT EXISTS medios (
              dominio        TEXT PRIMARY KEY,
              nombre         TEXT NOT NULL DEFAULT '',
              grupo          TEXT NOT NULL DEFAULT '',
              tipo           TEXT NOT NULL DEFAULT '',
              lang           TEXT NOT NULL DEFAULT '',
              tags           TEXT NOT NULL DEFAULT '[]',
              grupo_norm     TEXT NOT NULL DEFAULT '',
              tipo_norm      TEXT NOT NULL DEFAULT '',
              lang_norm      TEXT NOT NULL DEFAULT '',
              ultimo_run_ts  TEXT NOT NULL DEFAULT '',
              ultimo_ok_ts   TEXT NOT NULL DEFAULT '',
              fuente         TEXT NOT NULL DEFAULT '',
              n_items        INTEGER NOT NULL DEFAULT 0,
              con_fecha      INTEGER NOT NULL DEFAULT 0,
              ms             INTEGER NOT NULL DEFAULT 0,
              error          TEXT NOT NULL DEFAULT '',
              intentos       TEXT NOT NULL DEFAULT ''
            ) WITHOUT ROWID"""),
        _t_stmt("""CREATE TABLE IF NOT EXISTS runs (
              dominio    TEXT NOT NULL,
              ts         TEXT NOT NULL,
              ok         INTEGER NOT NULL,
              fuente     TEXT NOT NULL DEFAULT '',
              n_items    INTEGER NOT NULL DEFAULT 0,
              con_fecha  INTEGER NOT NULL DEFAULT 0,
              ms         INTEGER NOT NULL DEFAULT 0,
              error      TEXT NOT NULL DEFAULT '',
              intentos   TEXT NOT NULL DEFAULT '',
              PRIMARY KEY (dominio, ts)
            ) WITHOUT ROWID"""),
        _t_stmt("CREATE INDEX IF NOT EXISTS idx_runs_ts ON runs(ts DESC)"),
        _t_stmt("CREATE INDEX IF NOT EXISTS idx_medios_grupo_norm ON medios(grupo_norm)"),
        _t_stmt("CREATE INDEX IF NOT EXISTS idx_medios_tipo_norm  ON medios(tipo_norm)"),
        _t_stmt("CREATE INDEX IF NOT EXISTS idx_medios_lang_norm  ON medios(lang_norm)"),
    ]
    results = turso_pipeline(stmts, timeout=30)
    if results is None:
        print("[turso!] ensure_schema falló")
        return

    # ── Migración: columnas nuevas en instalaciones existentes ──
    _turso_migrar_columnas('medios',
                           ['grupo_norm', 'tipo_norm', 'lang_norm', 'intentos'])
    _turso_migrar_columnas('runs', ['intentos'])


def _turso_migrar_columnas(tabla, cols_deseadas):
    """Añade a `tabla` las columnas TEXT que falten.
    Idempotente: consulta PRAGMA table_info antes de cada ALTER. Si la
    lectura falla (con la cuota agotada Turso bloquea las lecturas pero no
    las escrituras), lanza los ALTER a ciegas y da por buena la columna
    que ya existía."""
    results = turso_pipeline([_t_stmt(f"PRAGMA table_info({tabla})")], timeout=15)
    if results is None:
        print(f"[turso!] PRAGMA table_info({tabla}) falló · ALTER a ciegas")
        faltan = cols_deseadas
    else:
        cols_existentes = {r[1] for r in _t_rows(results, 0)}  # r[1] = nombre
        faltan = [c for c in cols_deseadas if c not in cols_existentes]

    for col in faltan:
        sql = f"ALTER TABLE {tabla} ADD COLUMN {col} TEXT NOT NULL DEFAULT ''"
        res = turso_pipeline([_t_stmt(sql)], timeout=15,
                             errores_ok=('duplicate column name',))
        if res is None:
            print(f"[turso!] ALTER TABLE {tabla} ADD COLUMN {col} falló")
        elif res and res[0].get("type") == "ok":
            print(f"[turso] migración: añadida columna {tabla}.{col}")


def _turso_setup_medios(medios, runs_data, ts_iso):
    """Upsert catálogo completo + stats del último run por medio."""
    if not (TURSO_HTTP_URL and TURSO_TOKEN) or not medios:
        return

    stats = {r['dominio']: r for r in runs_data}
    stmts = []
    for m in medios:
        dom = m['d']
        s = stats.get(dom, {})
        ok = bool(s.get('ok'))
        stmts.append(_t_stmt("""
            INSERT INTO medios
              (dominio, nombre, grupo, tipo, lang, tags,
               grupo_norm, tipo_norm, lang_norm,
               ultimo_run_ts, ultimo_ok_ts, fuente, n_items,
               con_fecha, ms, error, intentos)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(dominio) DO UPDATE SET
                nombre        = excluded.nombre,
                grupo         = excluded.grupo,
                tipo          = excluded.tipo,
                lang          = excluded.lang,
                tags          = excluded.tags,
                grupo_norm    = excluded.grupo_norm,
                tipo_norm     = excluded.tipo_norm,
                lang_norm     = excluded.lang_norm,
                ultimo_run_ts = excluded.ultimo_run_ts,
                ultimo_ok_ts  = CASE WHEN excluded.ultimo_ok_ts != ''
                                     THEN excluded.ultimo_ok_ts
                                     ELSE medios.ultimo_ok_ts END,
                fuente        = excluded.fuente,
                n_items       = excluded.n_items,
                con_fecha     = excluded.con_fecha,
                ms            = excluded.ms,
                error         = excluded.error,
                intentos      = excluded.intentos
        """, (
            dom,
            m.get('n', ''),
            m.get('grupo', ''),
            m.get('type', ''),
            m.get('lang', ''),
            json.dumps(m.get('tags', []), ensure_ascii=False),
            _norm_strict(m.get('grupo', '')),
            _norm_strict(m.get('type', '')),
            _norm_strict(m.get('lang', '')),
            ts_iso,
            ts_iso if ok else '',
            s.get('fuente', ''),
            s.get('n_items', 0),
            s.get('con_fecha', 0),
            s.get('ms', 0),
            s.get('error', ''),
            s.get('intentos', ''),
        )))

    # Enviar en lotes de 300 por si el catálogo crece mucho
    BATCH = 300
    total_ok = 0
    for i in range(0, len(stmts), BATCH):
        results = turso_pipeline(stmts[i:i + BATCH])
        if results is not None:
            total_ok += len(stmts[i:i + BATCH])
    print(f"[turso] medios: {total_ok}/{len(stmts)} upserts OK")


def _turso_setup_runs(runs_data, ts_iso):
    """Inserta intentos del run + poda >30 días."""
    if not (TURSO_HTTP_URL and TURSO_TOKEN) or not runs_data:
        return

    stmts = []
    for r in runs_data:
        stmts.append(_t_stmt("""
            INSERT OR REPLACE INTO runs
              (dominio, ts, ok, fuente, n_items, con_fecha, ms, error, intentos)
            VALUES (?,?,?,?,?,?,?,?,?)
        """, (
            r['dominio'], ts_iso, 1 if r.get('ok') else 0,
            r.get('fuente', ''), r.get('n_items', 0),
            r.get('con_fecha', 0), r.get('ms', 0), r.get('error', ''),
            r.get('intentos', ''),
        )))

    corte = (datetime.now(config.TZ_MADRID) - timedelta(days=30)).isoformat(timespec='seconds')
    stmts.append(_t_stmt("DELETE FROM runs WHERE ts < ?", (corte,)))

    results = turso_pipeline(stmts)
    if results is not None:
        print(f"[turso] runs: {len(runs_data)} registrados + poda 30d OK")


TURSO_AMBITOS        = {'nacional'}
TURSO_DOMINIOS_EXTRA = set()


def _va_a_turso(dominio):
    catalogo._init_medios_por_dominio()
    m = catalogo._MEDIOS_POR_DOMINIO.get(dominio) or {}
    return m.get('ambito') in TURSO_AMBITOS or dominio in TURSO_DOMINIOS_EXTRA


def insertar_en_turso(noticias, t_prev_iso, t_now_iso):
    """Inserta en Turso las noticias marcadas como nuevas en este run, de
    los medios que guarda (_va_a_turso).

    HTTP v2 · sin réplica local · sin sync.
    INSERT OR IGNORE con `enlace` como PRIMARY KEY → idempotente.
    """
    if not (TURSO_HTTP_URL and TURSO_TOKEN):
        print("[turso] sin credenciales — saltando")
        return 0

    nuevas = [n for n in noticias if n.get('_nueva') and n.get('enlace')]
    candidatas = [n for n in nuevas if _va_a_turso(n.get('dominio', ''))]
    if not candidatas:
        print(f"[turso] nada nuevo en este run ({len(nuevas)} de otros medios)")
        return 0

    # Construir filas
    filas = []
    for n in candidatas:
        filas.append((
            n.get('enlace', '')         or '',
            n.get('dominio', '')        or '',
            n.get('titular', '')        or '',
            n.get('fecha_pub', '')      or '',
            n.get('fecha_estimada', '') or '',
            _dia_iso(_fecha_visible_iso(n), t_now_iso[:10]) or '',
            n.get('fuente', '')         or '',
            _hash_titular(n.get('titular', '')),
            t_now_iso,
            t_now_iso,
        ))

    # Enviar por lotes de 500
    BATCH = 100
    total = len(filas)
    insertados = 0
    fallos = 0

    for i in range(0, total, BATCH):
        lote = filas[i:i + BATCH]
        stmts = [
            _t_stmt(
                """INSERT OR IGNORE INTO noticias
                   (enlace, dominio, titular, fecha_pub, fecha_est,
                    fecha_dia, fuente, hash_titular, creado_ts, actualizado_ts)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                row,
            )
            for row in lote
        ]
        results = turso_pipeline(stmts)
        if results is None:
            fallos += len(lote)
        else:
            insertados += len(lote)

    print(f"[turso] {total} candidatas ({len(nuevas) - total} de otros medios fuera)"
          f" · {insertados} enviadas · {fallos} fallos")
    return insertados
