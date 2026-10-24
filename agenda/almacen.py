"""Estado e historial del calendario en una base SQLite dedicada, sin servicios."""

from contextlib import contextmanager
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3


VERSION_ESQUEMA = 1
COLECCIONES = ('fuentes', 'regiones', 'grupos', 'eventos', 'registros', 'vinculos')


def _json(valor):
    return json.dumps(valor, ensure_ascii=False, sort_keys=True)


@contextmanager
def abrir(ruta):
    """Serializa escritores y confirma una pasada completa o revierte sus cambios."""
    ruta = Path(ruta)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(ruta, timeout=10, isolation_level=None)
    try:
        db.execute('PRAGMA foreign_keys = ON')
        db.execute('BEGIN IMMEDIATE')
        version = db.execute('PRAGMA user_version').fetchone()[0]
        if version not in (0, VERSION_ESQUEMA):
            raise ValueError('Versión de base de calendario incompatible')
        if version == 0:
            if db.execute("SELECT 1 FROM sqlite_master WHERE type='table'").fetchone():
                raise ValueError('Se necesita una base dedicada al calendario')
            # executescript hace COMMIT implícito: ejecutar cada sentencia aquí
            # mantiene también la creación del esquema dentro de la transacción.
            for sentencia in Path(__file__).with_name('esquema.sql').read_text().split(';'):
                if sentencia.strip():
                    db.execute(sentencia)
            db.execute(f'PRAGMA user_version = {VERSION_ESQUEMA}')
        yield db
        db.execute('COMMIT')
    except BaseException:
        if db.in_transaction:
            db.execute('ROLLBACK')
        raise
    finally:
        db.close()


def cargar(db):
    estado = db.execute("SELECT valor_json FROM agenda_estado WHERE clave='calendario'").fetchone()
    if estado is None:
        return None
    calendario = json.loads(estado[0])
    for campo in ('fuentes', 'regiones', 'grupos', 'registros'):
        pk = 'ref' if campo == 'registros' else 'id'
        calendario[campo] = {i: json.loads(datos) for i, datos in db.execute(
            f'SELECT {pk}, datos_json FROM agenda_{campo} ORDER BY {pk}')}
    calendario['eventos'] = [json.loads(f[0]) for f in db.execute(
        'SELECT datos_json FROM agenda_eventos ORDER BY id')]
    calendario['vinculos'] = dict(db.execute('SELECT ref, evento FROM agenda_vinculos'))
    return calendario


def _instante(valor, precision):
    if valor and precision == 'hora':
        return datetime.fromisoformat(valor).astimezone(timezone.utc).isoformat()
    return valor


def _contenido(registro):
    return {k: v for k, v in registro.items()
            if k not in ('primera_recogida', 'ultima_recogida')}


def guardar(db, calendario):
    """Escribe el estado integrado y audita cambios de contenido, no meros sondeos.

    Se invoca dentro de abrir(); el llamante carga e integra en esa misma
    transacción para evitar perder una actualización de otro escritor.
    """
    recogida = db.execute('INSERT INTO agenda_recogidas(observado, consultas_json) VALUES (?, ?)',
        (calendario['actualizado'], _json(calendario['consultas']))).lastrowid
    for campo in ('fuentes', 'regiones', 'grupos'):
        db.executemany(f'INSERT INTO agenda_{campo}(id, datos_json) VALUES (?, ?) '
                       'ON CONFLICT(id) DO UPDATE SET datos_json=excluded.datos_json',
                       [(i, _json(d)) for i, d in calendario[campo].items()])
    for evento in calendario['eventos']:
        cuando = evento['cuando']
        db.execute('INSERT INTO agenda_eventos VALUES (?, ?, ?, ?, ?, ?) '
            'ON CONFLICT(id) DO UPDATE SET precision=excluded.precision, inicio=excluded.inicio, '
            'fin=excluded.fin, estado=excluded.estado, datos_json=excluded.datos_json',
            (evento['id'], cuando['precision'], _instante(cuando['inicio'], cuando['precision']),
             _instante(cuando.get('fin'), cuando['precision']), evento['estado'], _json(evento)))
        for campo, columna in (('regiones', 'region'), ('grupos', 'grupo')):
            tabla = f'agenda_evento_{columna}'
            db.execute(f'DELETE FROM {tabla} WHERE evento=?', (evento['id'],))
            db.executemany(f'INSERT INTO {tabla}(evento, {columna}) VALUES (?, ?)',
                           [(evento['id'], i) for i in evento.get(campo, [])])
    for ref, registro in calendario['registros'].items():
        anterior = db.execute('SELECT datos_json FROM agenda_registros WHERE ref=?', (ref,)).fetchone()
        db.execute('INSERT INTO agenda_registros VALUES (?, ?, ?, ?, ?, ?) '
            'ON CONFLICT(ref) DO UPDATE SET fuente=excluded.fuente, evento=excluded.evento, '
            'primera_recogida=excluded.primera_recogida, ultima_recogida=excluded.ultima_recogida, '
            'datos_json=excluded.datos_json',
            (ref, registro['fuente'], registro['evento'], registro['primera_recogida'],
             registro['ultima_recogida'], _json(registro)))
        if anterior is None or _contenido(json.loads(anterior[0])) != _contenido(registro):
            db.execute('INSERT INTO agenda_revisiones(ref, recogida, anterior_json, nuevo_json) '
                'VALUES (?, ?, ?, ?)', (ref, recogida, anterior[0] if anterior else None, _json(registro)))
    db.executemany('INSERT INTO agenda_vinculos VALUES (?, ?) '
                   'ON CONFLICT(ref) DO UPDATE SET evento=excluded.evento',
                   calendario['vinculos'].items())
    db.execute("INSERT INTO agenda_estado VALUES ('calendario', ?) "
        'ON CONFLICT(clave) DO UPDATE SET valor_json=excluded.valor_json',
        (_json({k: v for k, v in calendario.items() if k not in COLECCIONES}),))
