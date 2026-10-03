#!/usr/bin/env python3
"""
Migra el histórico de R2 (ficheros JSON por día) a Turso.
Se ejecuta por tandas, guardando progreso en migration_state.json.

Uso: python migrar_historico.py [presupuesto]
  presupuesto = máximo de noticias a insertar en este run (default 40000)

Notas:
- Usa la HTTP Pipeline API de Turso (sin WebSocket, sin réplica local).
- Expande los 'alt' (noticias duplicadas entre medios) como filas propias,
  para que Turso tenga el archivo completo.
- Reanudable: guarda los días completados en migration_state.json.
"""
import os
import sys
import json
import time
from datetime import datetime
from zoneinfo import ZoneInfo
import concurrent.futures

import requests

from recolector import (
    R2_BUCKET, TURSO_URL, TURSO_TOKEN,
    _r2_client, _reconstruir_fecha, _dia_iso, _fecha_visible_iso,
)

MIGRATION_STATE = 'migration_state.json'
TZ_MADRID = ZoneInfo('Europe/Madrid')

BATCH      = 20     # filas por petición HTTP
WORKERS    = 6      # peticiones en paralelo
TIMEOUT    = 30     # segundos por petición
MAX_REINTENTOS = 3


# ─────────────────────────────────────────────────────────────
# Turso · HTTP Pipeline API
# ─────────────────────────────────────────────────────────────
def _turso_endpoint():
    base = TURSO_URL or ''
    if base.startswith('libsql://'):
        base = 'https://' + base[len('libsql://'):]
    elif base and not base.startswith('https://'):
        base = 'https://' + base
    return base.rstrip('/') + '/v2/pipeline'


def _arg(v):
    """Convierte un valor Python a un argumento de Turso Pipeline."""
    if v is None:
        return {'type': 'null', 'value': None}
    if isinstance(v, int):
        return {'type': 'integer', 'value': str(v)}
    if isinstance(v, float):
        return {'type': 'float', 'value': str(v)}
    return {'type': 'text', 'value': str(v)}


def _turso_execute(sql, params, url, headers):
    """Ejecuta una sentencia con reintentos."""
    args = [_arg(p) for p in params]
    body = {
        'requests': [
            {'type': 'execute', 'stmt': {'sql': sql, 'args': args}},
            {'type': 'close'},
        ]
    }

    ultimo_error = None
    for intento in range(MAX_REINTENTOS):
        try:
            r = requests.post(url, headers=headers, json=body, timeout=TIMEOUT)
            if r.status_code != 200:
                raise RuntimeError(f"HTTP {r.status_code}: {r.text[:200]}")
            data = r.json()
            results = data.get('results', [])
            if results and results[0].get('type') == 'error':
                msg = results[0].get('error', {}).get('message', '')
                raise RuntimeError(f"Turso: {msg}")
            return True
        except (requests.exceptions.ConnectionError,
                requests.exceptions.Timeout,
                ConnectionResetError) as e:
            ultimo_error = e
            if intento < MAX_REINTENTOS - 1:
                time.sleep(2 ** intento)
                continue
            raise
    if ultimo_error:
        raise ultimo_error
    return False


# ─────────────────────────────────────────────────────────────
# Estado
# ─────────────────────────────────────────────────────────────
def cargar_estado():
    if os.path.exists(MIGRATION_STATE):
        try:
            with open(MIGRATION_STATE, encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {'dias_completados': [], 'ultimo_run': None}


def guardar_estado(estado):
    estado['ultimo_run'] = datetime.now(TZ_MADRID).isoformat(timespec='seconds')
    with open(MIGRATION_STATE, 'w', encoding='utf-8') as f:
        json.dump(estado, f, ensure_ascii=False, indent=2)


# ─────────────────────────────────────────────────────────────
# R2
# ─────────────────────────────────────────────────────────────
def descargar_manifest(client):
    obj = client.get_object(Bucket=R2_BUCKET, Key='manifest.json')
    return json.loads(obj['Body'].read())


def descargar_dia(client, filename):
    obj = client.get_object(Bucket=R2_BUCKET, Key=filename)
    return json.loads(obj['Body'].read())


# ─────────────────────────────────────────────────────────────
# Transformación · JSON corto → filas
# ─────────────────────────────────────────────────────────────
def _url_completa(u_raw, dominio, medios_tabla):
    """Reconstruye la URL completa a partir del formato corto."""
    if not u_raw:
        return ''
    if u_raw.startswith('http://') or u_raw.startswith('https://'):
        return u_raw
    if u_raw.startswith('/'):
        m = medios_tabla.get(dominio, {}) or {}
        host = m.get('h') or f"www.{dominio}"
        return f"https://{host}{u_raw}"
    return u_raw

def extraer_filas(dia_data):
    """Convierte el JSON del día a filas para Turso.
    NO expande los 'alt' (ahorro de espacio; el titular ya está representado)."""
    dia = dia_data.get('fecha', '')
    medios_tabla = dia_data.get('medios', {}) or {}
    filas = []

    for n in dia_data.get('noticias', []):
        dom = n.get('d', '')
        u_raw = n.get('u', '')
        if not u_raw:
            continue

        u_completa = _url_completa(u_raw, dom, medios_tabla)
        if not u_completa:
            continue

        filas.append([
            dom,
            n.get('t', ''),
            u_completa,
            _reconstruir_fecha(n.get('p', ''), dia),
            _reconstruir_fecha(n.get('e', ''), dia),
            n.get('f', ''),
            dia,
            '',
        ])
        # NO bucle de alts

    return filas

# ─────────────────────────────────────────────────────────────
# Inserción
# ─────────────────────────────────────────────────────────────
def insertar_batch(chunk, url, headers):
    """Inserta un lote de filas en Turso."""
    placeholders = ','.join(['(?,?,?,?,?,?,?,?)'] * len(chunk))
    sql = (
        "INSERT OR IGNORE INTO noticias "
        "(dominio, titular, enlace, fecha_pub, fecha_est, fuente, fecha_dia, hash) "
        f"VALUES {placeholders}"
    )
    params = []
    for row in chunk:
        params.extend(row)
    return _turso_execute(sql, params, url, headers)


def procesar_dia(client, dia_info, presupuesto_restante, url, headers):
    """Inserta un día completo. Devuelve (insertados, ok)."""
    filename = dia_info['file']
    n_esperado = dia_info.get('n', 0)

    if n_esperado == 0:
        return 0, True

    # El doble de n_esperado porque expandimos alt (estimación conservadora)
    estimado = n_esperado * 2
    if estimado > presupuesto_restante:
        print(f"  [skip] {filename}: ~{estimado} > presupuesto {presupuesto_restante}")
        return 0, False

    try:
        data = descargar_dia(client, filename)
    except Exception as e:
        print(f"  [!] {filename}: {type(e).__name__}: {e}")
        return 0, False

    filas = extraer_filas(data)
    if not filas:
        return 0, True

    chunks = [filas[i:i + BATCH] for i in range(0, len(filas), BATCH)]

    insertados = 0
    errores = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futures = {ex.submit(insertar_batch, ch, url, headers): len(ch) for ch in chunks}
        for fut in concurrent.futures.as_completed(futures):
            try:
                fut.result()
                insertados += futures[fut]
            except Exception as e:
                errores += 1
                if errores <= 3:
                    print(f"  [!] batch: {str(e)[:120]}")

    ok = errores < max(1, len(chunks) * 0.1)
    print(f"  [ok] {filename}: {insertados} filas · {len(chunks)} batches · {errores} errores")
    return insertados, ok


# ─────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────
def main():
    presupuesto = int(sys.argv[1]) if len(sys.argv) > 1 else 40000

    if not (TURSO_URL and TURSO_TOKEN):
        print("Faltan credenciales Turso (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN)")
        return 1

    endpoint = _turso_endpoint()
    headers = {
        'Authorization': f'Bearer {TURSO_TOKEN}',
        'Content-Type': 'application/json',
    }

    print(f"── Migración R2 → Turso (presupuesto: {presupuesto}) ──")
    print(f"Endpoint: {endpoint}")

    estado = cargar_estado()
    completados = set(estado.get('dias_completados', []))
    print(f"Días ya completados: {len(completados)}")

    client = _r2_client()
    if not client:
        print("Faltan credenciales R2")
        return 1

    try:
        manifest = descargar_manifest(client)
    except Exception as e:
        print(f"No pude leer manifest de R2: {e}")
        return 1

    ficheros = manifest.get('ficheros', [])
    ficheros.sort(key=lambda f: f['fecha'], reverse=True)
    pendientes = [f for f in ficheros if f['fecha'] not in completados]
    print(f"Días en manifest: {len(ficheros)} · pendientes: {len(pendientes)}")

    total_insertados = 0
    procesados_ahora = 0

    for dia_info in pendientes:
        restante = presupuesto - total_insertados
        if restante < 1000:
            print(f"Presupuesto agotado ({total_insertados})")
            break

        ins, ok = procesar_dia(client, dia_info, restante, endpoint, headers)
        total_insertados += ins

        if ok:
            completados.add(dia_info['fecha'])
            procesados_ahora += 1

    estado['dias_completados'] = sorted(completados)
    guardar_estado(estado)

    print(f"\n── Resumen ──")
    print(f"Insertados en este run: {total_insertados}")
    print(f"Días procesados en este run: {procesados_ahora}")
    print(f"Días completados (total): {len(completados)}/{len(ficheros)}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
