"""Transporte R2, publicación ordenada y limpieza del archivo remoto."""

from datetime import datetime, timedelta, timezone
import concurrent.futures
import json
import os
import re
import threading
import time

from botocore.config import Config
import boto3

from . import config
from .formatos import _corte_archivo, _ficheros_de_inventario


R2_ACCOUNT_ID = os.environ.get('R2_ACCOUNT_ID', '')
R2_ACCESS_KEY = os.environ.get('R2_ACCESS_KEY_ID', '')
R2_SECRET_KEY = os.environ.get('R2_SECRET_ACCESS_KEY', '')
R2_BUCKET     = os.environ.get('R2_BUCKET', 'voceiro-datos')


def _r2_client():
    """Crea un cliente S3 contra R2. Devuelve None si faltan credenciales."""
    if not (R2_ACCOUNT_ID and R2_ACCESS_KEY and R2_SECRET_KEY):
        return None
    return boto3.client(
        service_name='s3',
        endpoint_url=f'https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com',
        aws_access_key_id=R2_ACCESS_KEY,
        aws_secret_access_key=R2_SECRET_KEY,
        region_name='auto',
        config=Config(retries={'max_attempts': 3, 'mode': 'standard'}),
    )


def _r2_cache_control(filename):
    """Cabecera Cache-Control según el tipo de fichero."""
    # Índices: 60s
    if filename in ('manifest.json', 'inventario.json'):
        return 'public, max-age=60'
    # Portada rodante: 60s
    if filename.startswith('portada-'):
        return 'public, max-age=60'
    # Slice por dominio, nombre estable: 60s (coherente con el manifest)
    if re.match(r'^d-[a-z0-9.-]+-\d{4}-\d{2}-\d{2}\.json$', filename):
        return 'public, max-age=60'
    # Día completo "all": YYYY-MM-DD-<hash>.json → inmutable
    if re.match(r'^\d{4}-\d{2}-\d{2}-[a-f0-9]{10}\.json$', filename):
        return 'public, max-age=31536000, immutable'
    # Slice por grupo: YYYY-MM-DD-g-<slug>-<hash>.json → inmutable
    if re.match(r'^\d{4}-\d{2}-\d{2}-g-[a-z0-9-]+-[a-f0-9]{10}\.json$', filename):
        return 'public, max-age=31536000, immutable'
    # Fallback
    return 'public, max-age=3600'


def _codigo_r2(e):
    """Código de error de S3/R2 ('NoSuchKey', '404'…) o '' si no lo trae."""
    if hasattr(e, 'response'):
        return e.response.get('Error', {}).get('Code', '')
    return ''


def subir_a_r2(ficheros_locales):
    """
    Sube a R2 SOLO los ficheros escritos en este run.
    Paralelizado con ThreadPoolExecutor (boto3 es thread-safe).

    El inventario y el manifest van los últimos, en ese orden, y solo si
    todo lo anterior subió: publicados antes, apuntarían a ficheros que no
    están.
    """
    client = _r2_client()
    if not client:
        print("[r2] sin credenciales — saltando")
        return 0, 0, 0

    lista = [p for p in ficheros_locales if p.endswith('.json')]
    if not lista:
        print("[r2] nada nuevo que subir")
        return 0, 0, 0

    subidos = errores = 0
    lock = threading.Lock()

    def _subir_uno(path):
        nonlocal subidos, errores
        nombre = os.path.basename(path)
        try:
            with open(path, 'rb') as f:
                client.upload_fileobj(
                    f, R2_BUCKET, nombre,
                    ExtraArgs={
                        'ContentType': 'application/json; charset=utf-8',
                        'CacheControl': _r2_cache_control(nombre),
                    },
                )
            with lock:
                subidos += 1
        except Exception as e:
            with lock:
                errores += 1
            print(f"[r2!] {nombre}: {type(e).__name__}: {e}")

    orden = ('inventario.json', 'manifest.json')
    indices = sorted((p for p in lista if os.path.basename(p) in orden),
                     key=lambda p: orden.index(os.path.basename(p)))
    datos = [p for p in lista if p not in indices]
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        list(ex.map(_subir_uno, datos))
    for p in indices:
        if errores:
            print(f"[r2!] {os.path.basename(p)} sin subir: sigue publicado el anterior")
            continue
        _subir_uno(p)

    print(f"[r2] {subidos} subidos · 0 omitidos · {errores} errores")
    return subidos, 0, errores


_RE_DOMINIO_FECHA = re.compile(r'^d-[a-z0-9.-]+-(\d{4}-\d{2}-\d{2})\.json$')


def _regla_archivo(inventario, hoy):
    """Función key → True si es un fichero por medio de un día que ya no
    está en la ventana y sigue dentro de DIAS_ARCHIVO: se conserva aunque
    el inventario no lo nombre. Si la ventana viniera vacía, protege de
    más, nunca de menos."""
    en_ventana = {d['fecha'] for d in (inventario or {}).get('dias', [])}
    corte = _corte_archivo(hoy)
    def archivado(key):
        m = _RE_DOMINIO_FECHA.match(key)
        return bool(m) and m.group(1) not in en_ventana and m.group(1) >= corte
    return archivado


def limpiar_r2_huerfanos(inventario, inventario_prev=None, forzar_scan=False):
    """
    Borra de R2 los ficheros que ya no están referenciados.

    Camino rápido (diff): compara el set de ficheros del inventario previo
    con el nuevo. Solo borra los que desaparecieron. No lista el bucket.

    Scan completo con paginación: si no hay inventario previo o si
    forzar_scan. El diff se salta lo que tiene menos de 1 h y no lo vuelve
    a ver (en el run siguiente ya no es candidato); con runs cada pocos
    minutos eso deja huérfanos. main() fuerza el scan una vez al día.

    En los dos caminos, los ficheros por medio del archivo se conservan
    por fecha (_regla_archivo) y los anteriores a DIAS_ARCHIVO se borran.

    Devuelve True si la limpieza terminó (el scan completo puede cortarse
    por tiempo).
    """
    client = _r2_client()
    if not client:
        return False
    archivado = _regla_archivo(inventario, datetime.now(config.TZ_MADRID).date())

    # ── Camino rápido: diff de inventarios ──
    if inventario_prev and inventario_prev.get('dias') and not forzar_scan:
        prev_files = _ficheros_de_inventario(inventario_prev)
        curr_files = _ficheros_de_inventario(inventario)
        candidatos = {k for k in prev_files - curr_files if not archivado(k)}

        if not candidatos:
            print("[r2-clean] nada que borrar (diff de inventarios)")
            return True

        limite = datetime.now(timezone.utc) - timedelta(hours=1)
        borrados = 0
        for key in candidatos:
            try:
                head = client.head_object(Bucket=R2_BUCKET, Key=key)
                lastmod = head.get('LastModified')
                if lastmod and lastmod > limite:
                    continue           # <1h: puede estar sirviéndose
                client.delete_object(Bucket=R2_BUCKET, Key=key)
                borrados += 1
            except Exception as e:
                if _codigo_r2(e) in ('404', 'NoSuchKey'):
                    continue           # ya no existe
                print(f"[r2-clean!] {key}: {type(e).__name__}: {e}")

        print(f"[r2-clean] {borrados} borrados de {len(candidatos)} candidatos (diff)")
        return True

    # ── Fallback: scan completo (sin inventario previo) ──
    print("[r2-clean] scan completo"
          + (" (barrido diario)" if forzar_scan else " (sin inventario previo)"))
    validos = _ficheros_de_inventario(inventario)

    limite = datetime.now(timezone.utc) - timedelta(hours=1)
    re_all     = re.compile(r'^\d{4}-\d{2}-\d{2}-[a-f0-9]{10}\.json$')
    re_grupo   = re.compile(r'^\d{4}-\d{2}-\d{2}-g-[a-z0-9-]+-[a-f0-9]{10}\.json$')
    re_dominio = re.compile(r'^d-[a-z0-9.-]+-\d{4}-\d{2}-\d{2}\.json$')

    # Borrado por lotes (delete_objects, hasta 1000 claves por petición) y
    # con presupuesto de tiempo: de uno en uno, un bucket con muchos
    # huérfanos acumulados no termina antes del timeout del job. Si se
    # agota, lo que quede se borra en el siguiente run.
    t0 = time.monotonic()
    borrados = 0
    lote = []

    def _vaciar_lote():
        nonlocal borrados
        if not lote:
            return
        try:
            r = client.delete_objects(
                Bucket=R2_BUCKET,
                Delete={'Objects': [{'Key': k} for k in lote], 'Quiet': True})
            errores = r.get('Errors') or []
            for err in errores[:5]:
                print(f"[r2-clean!] {err.get('Key')}: {err.get('Code')} {err.get('Message')}")
            borrados += len(lote) - len(errores)
        except Exception as e:
            print(f"[r2-clean!] lote de {len(lote)}: {type(e).__name__}: {e}")
        lote.clear()

    completo = True
    paginator = client.get_paginator('list_objects_v2')
    for page in paginator.paginate(Bucket=R2_BUCKET):
        if time.monotonic() - t0 > config.R2_SCAN_MAX_SEG:
            completo = False
            break
        for obj in page.get('Contents', []):
            key = obj['Key']
            if key == 'manifest.json':
                continue

            if re_dominio.match(key):
                es_valido = key in validos or archivado(key)
            elif (re_all.match(key) or re_grupo.match(key)
                  or (key.startswith('portada-') and key.endswith('.json'))):
                es_valido = key in validos
            else:
                continue

            if es_valido:
                continue
            lastmod = obj.get('LastModified')
            if lastmod and lastmod > limite:
                continue
            lote.append(key)
            if len(lote) >= 1000:
                _vaciar_lote()
    _vaciar_lote()

    estado = '' if completo else f' · tiempo agotado ({config.R2_SCAN_MAX_SEG}s), sigue en el próximo run'
    print(f"[r2-clean] {borrados} huérfanos borrados (scan completo){estado}")
    return completo


def _bajar_inventario(client):
    """Bytes del inventario de R2, o None si no hay (primer run).

    Transición: sin inventario, el manifest de antes de separarlos traía
    lo mismo en 'dias'. Uno ya separado no sirve (no nombra los ficheros
    por medio): mejor parar que limpiar R2 con él."""
    for key in ('inventario.json', 'manifest.json'):
        try:
            datos = client.get_object(Bucket=R2_BUCKET, Key=key)['Body'].read()
            inventario = json.loads(datos)
        except Exception as e:
            if _codigo_r2(e) in ('404', 'NoSuchKey'):
                continue
            raise SystemExit(f"[r2-download!] no se pudo leer {key}: "
                             f"{type(e).__name__}: {e}")
        if key == 'manifest.json':
            if 'dias_ventana' in inventario:
                raise SystemExit("[r2-download!] no hay inventario y el manifest "
                                 "ya es el público: run abortado")
            print("[r2-download] sin inventario: se parte del manifest anterior")
        return datos
    return None


def descargar_historico_desde_r2():
    """Descarga de R2 el inventario y SOLO los ficheros de la ventana de
    dedup (DIAS_RETENCION). Los días más antiguos quedan en R2 y se
    conservan en el inventario nuevo, pero no se bajan.

    Solo se sigue sin inventario si R2 dice que no existe (primer run). Con
    cualquier otro fallo el run se para: un inventario nuevo hecho sin el
    anterior perdería el archivo, y la limpieza borraría sus ficheros."""
    client = _r2_client()
    if not client:
        print("[r2-download] sin credenciales — saltando")
        return 0

    inventario_bytes = _bajar_inventario(client)
    if inventario_bytes is None:
        print("[r2-download] no hay inventario en R2: primer run")
        return 0
    inventario = json.loads(inventario_bytes)
    with open(config.INVENTARIO_PATH, 'wb') as f:
        f.write(inventario_bytes)

    corte = (datetime.now(config.TZ_MADRID) - timedelta(days=config.DIAS_RETENCION)).strftime('%Y-%m-%d')

    # Recolectar ficheros a bajar: 'all' de cada día dentro de retención
    ficheros_a_bajar = []
    for d_info in inventario.get('dias', []):
        if d_info.get('fecha', '') < corte:
            continue
        if d_info.get('all') and d_info['all'].get('file'):
            ficheros_a_bajar.append(d_info['all'])
    # Compat con inventarios viejos
    if not ficheros_a_bajar:
        ficheros_a_bajar = [
            f for f in inventario.get('ficheros', [])
            if f.get('fecha', '') >= corte
        ]

    # Un día que no se baja se reescribiría sin sus noticias. Si R2 dice
    # que no existe no hay nada que recuperar y se sigue; si es un fallo,
    # se para.
    descargados = 0
    fallidos = []
    for f_info in ficheros_a_bajar:
        fn = f_info.get('file')
        if not fn:
            continue
        path = os.path.join(config.DATOS_DIR, fn)
        if os.path.exists(path):
            continue
        # A un temporal y validado: un fichero a medias no debe quedarse
        # con el nombre bueno (el siguiente intento se lo saltaría).
        try:
            obj = client.get_object(Bucket=R2_BUCKET, Key=fn)
            datos = obj['Body'].read()
            json.loads(datos)
            with open(path + '.tmp', 'wb') as f:
                f.write(datos)
            os.replace(path + '.tmp', path)
            descargados += 1
        except Exception as e:
            print(f"[r2-download!] {fn}: {e}")
            if _codigo_r2(e) not in ('404', 'NoSuchKey'):
                fallidos.append(fn)
    if fallidos:
        raise SystemExit(f"[r2-download!] {len(fallidos)} días sin bajar: "
                         + ', '.join(fallidos))

    total = len(inventario.get('dias', []))
    print(f"[r2-download] {descargados} descargados · "
          f"{total} en inventario · ventana {config.DIAS_RETENCION} días")
    return descargados
