"""Diagnóstico de la cosecha en Turso mediante HTTP v2: catálogo de medios y
pasadas del recolector. Las noticias no se guardan aquí: están en R2."""

from datetime import datetime, timedelta
import json
import os

import requests

from . import config


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
    """Crea las tablas si no existen. Idempotente.

    Turso cobra cada fila escrita, y cada índice cuenta como otra: `runs`
    tiene `ts` en cabeza de la clave para podar por rango sin índice aparte."""
    if not (TURSO_HTTP_URL and TURSO_TOKEN):
        return
    stmts = [
        _t_stmt("""CREATE TABLE IF NOT EXISTS medios (
              dominio  TEXT PRIMARY KEY,
              nombre   TEXT NOT NULL DEFAULT '',
              grupo    TEXT NOT NULL DEFAULT '',
              tipo     TEXT NOT NULL DEFAULT '',
              ambito   TEXT NOT NULL DEFAULT '',
              lang     TEXT NOT NULL DEFAULT '',
              tags     TEXT NOT NULL DEFAULT '[]'
            ) WITHOUT ROWID"""),
        _t_stmt("""CREATE TABLE IF NOT EXISTS runs (
              ts         TEXT NOT NULL,
              dominio    TEXT NOT NULL,
              ok         INTEGER NOT NULL,
              fuente     TEXT NOT NULL DEFAULT '',
              n_items    INTEGER NOT NULL DEFAULT 0,
              con_fecha  INTEGER NOT NULL DEFAULT 0,
              ms         INTEGER NOT NULL DEFAULT 0,
              error      TEXT NOT NULL DEFAULT '',
              intentos   TEXT NOT NULL DEFAULT '',
              PRIMARY KEY (ts, dominio)
            ) WITHOUT ROWID"""),
    ]
    if turso_pipeline(stmts, timeout=30) is None:
        print("[turso!] ensure_schema falló")


def _turso_setup_medios(medios):
    """Upsert del catálogo. Una fila que no cambia no se reescribe (el WHERE
    del UPDATE), así que en una pasada normal no cuesta escrituras."""
    if not (TURSO_HTTP_URL and TURSO_TOKEN) or not medios:
        return

    stmts = [_t_stmt("""
            INSERT INTO medios (dominio, nombre, grupo, tipo, ambito, lang, tags)
            VALUES (?,?,?,?,?,?,?)
            ON CONFLICT(dominio) DO UPDATE SET
                nombre = excluded.nombre,
                grupo  = excluded.grupo,
                tipo   = excluded.tipo,
                ambito = excluded.ambito,
                lang   = excluded.lang,
                tags   = excluded.tags
            WHERE (nombre, grupo, tipo, ambito, lang, tags)
                  IS NOT (excluded.nombre, excluded.grupo, excluded.tipo,
                          excluded.ambito, excluded.lang, excluded.tags)
        """, (
            m['d'],
            m.get('n', ''),
            m.get('grupo', ''),
            m.get('type', ''),
            m.get('ambito', '') or '',
            m.get('lang', ''),
            json.dumps(m.get('tags', []), ensure_ascii=False),
        )) for m in medios]

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
              (ts, dominio, ok, fuente, n_items, con_fecha, ms, error, intentos)
            VALUES (?,?,?,?,?,?,?,?,?)
        """, (
            ts_iso, r['dominio'], 1 if r.get('ok') else 0,
            r.get('fuente', ''), r.get('n_items', 0),
            r.get('con_fecha', 0), r.get('ms', 0), r.get('error', ''),
            r.get('intentos', ''),
        )))

    corte = (datetime.now(config.TZ_MADRID) - timedelta(days=30)).isoformat(timespec='seconds')
    stmts.append(_t_stmt("DELETE FROM runs WHERE ts < ?", (corte,)))

    results = turso_pipeline(stmts)
    if results is not None:
        print(f"[turso] runs: {len(runs_data)} registrados + poda 30d OK")
