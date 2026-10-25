"""Lectura SQL regenerable. Preparar antes de abrir la transacción de publicación."""
import hashlib
import json
from pathlib import Path
import subprocess

from .almacen import VERSION_ESQUEMA

RAIZ = Path(__file__).resolve().parent.parent


def preparar(datos):
    resultado = subprocess.run(['node', str(RAIZ / 'scripts/preparar-lectura-calendario.mjs')],
        input=json.dumps(datos, ensure_ascii=False, allow_nan=False), text=True,
        encoding='utf-8', capture_output=True, timeout=120, check=True)
    return json.loads(resultado.stdout)


def planificar(preparada, revision):
    """Reemplazo atómico; la revisión del núcleo protege frente a publicaciones viejas.

    El llamante ejecuta TODOS los pasos en una transacción, también el DDL.
    La versión SQL de lectura es independiente de la del núcleo.
    """
    if preparada['version'] != 1 or type(revision) is not int or revision < 0:
        raise ValueError('Contrato de lectura incompatible')
    cuerpo = json.dumps(preparada, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    identificador = hashlib.sha256((str(revision) + ':' + cuerpo).encode()).hexdigest()
    meta = {k: v for k, v in preparada.items() if k not in ('eventos', 'facetas', 'tramos', 'entidades')}
    meta.update(revision=identificador, origen_revision=revision)
    sql = '\n'.join(l for l in Path(__file__).with_suffix('.sql').read_text().splitlines()
                    if not l.lstrip().startswith('--'))
    pasos = [(s, ()) for s in sql.split(';') if s.strip()]
    # Una versión/revisión distinta provoca CHECK y revierte también las tablas nuevas.
    pasos.append(('INSERT INTO agenda_lectura_control '
        'SELECT 1, -1, ?, ?, ? WHERE NOT EXISTS '
        '(SELECT 1 FROM agenda_esquema WHERE id=1 AND version=? AND revision=?)',
        (identificador, revision, '{}', VERSION_ESQUEMA, revision)))
    for tabla in ('facetas', 'tramos', 'eventos', 'entidades'):
        pasos.append((f'DELETE FROM agenda_lectura_{tabla}', ()))
    for tabla, cantidad in (('eventos', 5), ('facetas', 3), ('tramos', 4), ('entidades', 4)):
        sentencia = f'INSERT INTO agenda_lectura_{tabla} VALUES ({",".join("?" for _ in range(cantidad))})'
        pasos.extend((sentencia, tuple(fila)) for fila in preparada[tabla])
    pasos.append(('INSERT INTO agenda_lectura_control VALUES (1,1,?,?,?) ON CONFLICT(id) '
                  'DO UPDATE SET revision=excluded.revision, origen_revision=excluded.origen_revision, '
                  'datos_json=excluded.datos_json',
                  (identificador, revision, json.dumps(meta, ensure_ascii=False, separators=(',', ':')))))
    return pasos
