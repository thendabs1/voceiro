#!/usr/bin/env python3
"""
Migra el histórico de R2 (ficheros JSON por día) a D1.
Se ejecuta por tandas, guardando progreso en migration_state.json.
Uso: python migrar_historico.py [presupuesto]
  presupuesto = máximo de noticias a insertar en este run (default 40000)
"""
import os
import sys
import json
from datetime import datetime
from zoneinfo import ZoneInfo
import concurrent.futures

from recolector import (
    R2_BUCKET, CF_ACCOUNT_ID, CF_D1_TOKEN, CF_D1_DB_ID,
    _r2_client, _d1_request, _reconstruir_fecha,
)

MIGRATION_STATE = 'migration_state.json'
TZ_MADRID = ZoneInfo('Europe/Madrid')

BATCH = 10          # 10 filas × 8 cols = 80 variables (límite D1: 100)
WORKERS = 8         # 8 batches en paralelo


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


def descargar_manifest(client):
    obj = client.get_object(Bucket=R2_BUCKET, Key='manifest.json')
    return json.loads(obj['Body'].read())


def descargar_dia(client, filename):
    obj = client.get_object(Bucket=R2_BUCKET, Key=filename)
    return json.loads(obj['Body'].read())


def extraer_filas(dia_data):
    """Convierte el JSON del día a filas para D1."""
    dia = dia_data.get('fecha', '')
    filas = []
    for n in dia_data.get('noticias', []):
        filas.append([
            n.get('d', ''),
            n.get('t', ''),
            n.get('u', ''),
            _reconstruir_fecha(n.get('p', ''), dia),
            _reconstruir_fecha(n.get('e', ''), dia),
            n.get('f', ''),
            dia,
            '',
        ])
    return filas


def insertar_batch(chunk):
    placeholders = ','.join(['(?,?,?,?,?,?,?,?)'] * len(chunk))
    sql = (
        "INSERT OR IGNORE INTO noticias "
        "(dominio, titular, enlace, fecha_pub, fecha_est, fuente, fecha_dia, hash) "
        f"VALUES {placeholders}"
    )
    params = []
    for row in chunk:
        params.extend(row)
    _d1_request(sql, params)


def procesar_dia(client, dia_info, presupuesto_restante):
    """Inserta un día completo. Devuelve (insertados, ok)."""
    filename = dia_info['file']
    n_esperado = dia_info.get('n', 0)

    if n_esperado == 0:
        return 0, True
    if n_esperado > presupuesto_restante:
        print(f"  [skip] {filename}: {n_esperado} > presupuesto {presupuesto_restante}")
        return 0, False

    try:
        data = descargar_dia(client, filename)
    except Exception as e:
        print(f"  [!] {filename}: {type(e).__name__}: {e}")
        return 0, False

    filas = extraer_filas(data)
    if not filas:
        return 0, True

    chunks = [filas[i:i+BATCH] for i in range(0, len(filas), BATCH)]

    insertados = 0
    errores = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futures = {ex.submit(insertar_batch, ch): len(ch) for ch in chunks}
        for fut in concurrent.futures.as_completed(futures):
            try:
                fut.result()
                insertados += futures[fut]
            except Exception as e:
                errores += 1
                if errores <= 3:
                    print(f"  [!] batch: {str(e)[:120]}")

    ok = errores < max(1, len(chunks) * 0.1)
    print(f"  [ok] {filename}: {insertados} insertados · {errores} errores")
    return insertados, ok


def main():
    presupuesto = int(sys.argv[1]) if len(sys.argv) > 1 else 40000

    if not (CF_ACCOUNT_ID and CF_D1_TOKEN and CF_D1_DB_ID):
        print("Faltan credenciales D1")
        return 1

    print(f"── Migración D1 (presupuesto: {presupuesto}) ──")

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
    for dia_info in pendientes:
        restante = presupuesto - total_insertados
        if restante < 1000:
            print(f"Presupuesto agotado ({total_insertados})")
            break

        ins, ok = procesar_dia(client, dia_info, restante)
        total_insertados += ins

        if ok:
            completados.add(dia_info['fecha'])

    estado['dias_completados'] = sorted(completados)
    guardar_estado(estado)

    print(f"\n── Resumen ──")
    print(f"Insertados en este run: {total_insertados}")
    print(f"Días completados (total): {len(completados)}/{len(ficheros)}")
    print(f"Pendientes: {len(pendientes) - (len(completados) - len(estado.get('dias_completados', [])))}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
