"""Estado e historial del calendario en una base SQLite dedicada, sin servicios."""

from contextlib import contextmanager
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3

from . import almacen_nucleo


VERSION_ESQUEMA = 4
TABLAS_CLASIFICACION = {'agenda_temas', 'agenda_tema_padres', 'agenda_evento_tema',
                        'agenda_clasificacion_revisiones'}
COLECCIONES = ('fuentes', 'regiones', 'grupos', 'eventos', 'registros', 'vinculos')
CONSULTAS = [
    ('SELECT version, revision FROM agenda_esquema WHERE id=1', ()),
    ("SELECT valor_json FROM agenda_estado WHERE clave='calendario'", ()),
    *[(f'SELECT id, datos_json FROM agenda_{c} ORDER BY id', ())
      for c in ('fuentes', 'regiones', 'grupos')],
    ('SELECT datos_json FROM agenda_eventos ORDER BY id', ()),
    ('SELECT ref, datos_json, primera_recogida, ultima_recogida FROM agenda_registros ORDER BY ref', ()),
    ('SELECT ref, evento FROM agenda_vinculos ORDER BY ref', ()),
    *almacen_nucleo.CONSULTAS,
]


def _json(valor):
    return json.dumps(valor, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def esquema():
    sql = '\n'.join(linea for linea in Path(__file__).with_name('esquema.sql').read_text().splitlines()
                    if not linea.lstrip().startswith('--'))
    return [(s, ()) for s in sql.split(';') if s.strip()]


def migracion():
    """Ampliación aditiva v2/v3→v4, dentro de la transacción del llamante.

    La guardia tolera otra migración concurrente ya confirmada; una versión
    ajena o futura revierte incluso las sentencias de creación del esquema.
    """
    return [
        ('INSERT INTO agenda_esquema(id, version, revision) '
         'SELECT 1, ?, -1 WHERE NOT EXISTS '
         '(SELECT 1 FROM agenda_esquema WHERE id=1 AND version IN (2, 3, ?))',
         (VERSION_ESQUEMA, VERSION_ESQUEMA)),
        *esquema(),
        ('UPDATE agenda_esquema SET version=?, revision=revision+1 WHERE id=1 AND version IN (2, 3)',
         (VERSION_ESQUEMA,)),
    ]


@contextmanager
def abrir(ruta):
    """Serializa escritores y confirma una pasada completa o revierte sus cambios."""
    ruta = Path(ruta)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(ruta, timeout=10, isolation_level=None)
    try:
        db.execute('PRAGMA foreign_keys = ON')
        db.execute('BEGIN IMMEDIATE')
        tablas = {f[0] for f in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if 'agenda_esquema' not in tablas:
            version = db.execute('PRAGMA user_version').fetchone()[0]
            if version not in (0, 1):
                raise ValueError('Versión de base de calendario incompatible')
            if tablas and (version != 1 or tablas - TABLAS_CLASIFICACION - almacen_nucleo.NOMBRES != {
                'agenda_estado', 'agenda_fuentes', 'agenda_regiones', 'agenda_grupos',
                'agenda_eventos', 'agenda_registros', 'agenda_vinculos',
                'agenda_evento_region', 'agenda_evento_grupo', 'agenda_recogidas', 'agenda_revisiones'}):
                raise ValueError('Se necesita una base dedicada al calendario')
            # executescript hace COMMIT implícito: ejecutar cada sentencia aquí
            # mantiene también la creación del esquema dentro de la transacción.
            for sentencia, args in esquema():
                db.execute(sentencia, args)
            if version == 1:
                for ref, datos in db.execute('SELECT ref, datos_json FROM agenda_registros').fetchall():
                    db.execute('UPDATE agenda_registros SET datos_json=? WHERE ref=?',
                               (_json(_contenido(json.loads(datos))), ref))
            db.execute('INSERT INTO agenda_esquema VALUES (1, ?, 0)', (VERSION_ESQUEMA,))
        version = db.execute('SELECT version FROM agenda_esquema WHERE id=1').fetchone()
        if version in ((2,), (3,)):
            for sentencia, args in migracion():
                db.execute(sentencia, args)
            version = (VERSION_ESQUEMA,)
        if version != (VERSION_ESQUEMA,):
            raise ValueError('Versión de base de calendario incompatible')
        yield db
        db.execute('COMMIT')
    except BaseException:
        if db.in_transaction:
            db.execute('ROLLBACK')
        raise
    finally:
        db.close()


def cargar(db):
    return reconstruir([db.execute(sql, args).fetchall() for sql, args in CONSULTAS])


def reconstruir(resultados):
    if (len(resultados) != len(CONSULTAS) or len(resultados[0]) != 1
            or len(resultados[0][0]) != 2 or resultados[0][0][0] != VERSION_ESQUEMA):
        raise ValueError('Versión de base de calendario incompatible')
    if not resultados[1]:
        return None
    calendario = json.loads(resultados[1][0][0])
    for campo, filas in zip(('fuentes', 'regiones', 'grupos'), resultados[2:5]):
        calendario[campo] = {i: json.loads(datos) for i, datos in filas}
    calendario['eventos'] = [json.loads(f[0]) for f in resultados[5]]
    calendario['registros'] = {ref: {**json.loads(datos), 'primera_recogida': primera,
                                    'ultima_recogida': ultima}
                              for ref, datos, primera, ultima in resultados[6]}
    calendario['vinculos'] = dict(resultados[7])
    if 'nucleo' in calendario:
        from .nucleo import COLECCIONES as colecciones, clave
        for c, filas in zip(colecciones, resultados[8:]):
            datos = [json.loads(f[0]) for f in filas]
            calendario['nucleo'][c] = {(clave(d) if c == 'entidades' else d['id']): d for d in datos}
    return calendario


def _instante(valor, precision):
    if valor and precision == 'hora':
        return datetime.fromisoformat(valor).astimezone(timezone.utc).isoformat()
    return valor


def _contenido(registro):
    return {k: v for k, v in registro.items()
            if k not in ('primera_recogida', 'ultima_recogida')}


def guardar(db, calendario, solo_clasificacion=False, solo_nucleo=False):
    """Escribe el estado integrado y audita cambios de contenido, no meros sondeos.

    Se invoca dentro de abrir(); el llamante carga e integra en esa misma
    transacción para evitar perder una actualización de otro escritor.
    """
    anterior = cargar(db)
    if (solo_clasificacion or solo_nucleo) and anterior == calendario:
        return
    for sql, args in planificar(anterior, calendario, solo_clasificacion, solo_nucleo):
        db.execute(sql, args)
    db.execute('UPDATE agenda_esquema SET revision=revision+1 WHERE id=1')


def planificar(anterior, calendario, solo_clasificacion=False, solo_nucleo=False):
    """SQL común a SQLite y Turso: contenido modificado y observaciones recibidas.

    El llamante garantiza la exclusión de escritores o valida la revisión leída.
    La auditoría usa la recogida recién insertada dentro de la misma transacción.
    """
    anterior = anterior or {}
    if solo_nucleo and ({k: v for k, v in anterior.items() if k != 'nucleo'} !=
                        {k: v for k, v in calendario.items() if k != 'nucleo'}):
        raise ValueError('Ampliar el núcleo no puede modificar el piloto ni sus observaciones')
    if solo_clasificacion:
        def sin_clasificacion(c):
            from copy import deepcopy
            c = deepcopy(c)
            c.pop('clasificacion', None)
            if 'nucleo' in c:
                c['nucleo'].pop('catalogo', None)
                for e in c['nucleo']['entidades'].values():
                    e.pop('temas', None)
            return c
        if sin_clasificacion(anterior) != sin_clasificacion(calendario):
            raise ValueError('Reclasificar no puede modificar registros ni observaciones')
    pasos = [] if solo_clasificacion or solo_nucleo else [
        ('INSERT INTO agenda_recogidas(observado, consultas_json) VALUES (?, ?)',
         (calendario['actualizado'], _json(calendario['consultas'])))]
    for campo in ('fuentes', 'regiones', 'grupos'):
        for i, datos in calendario[campo].items():
            if anterior.get(campo, {}).get(i) != datos:
                pasos.append((f'INSERT INTO agenda_{campo}(id, datos_json) VALUES (?, ?) '
                    'ON CONFLICT(id) DO UPDATE SET datos_json=excluded.datos_json', (i, _json(datos))))
    previos = {e['id']: e for e in anterior.get('eventos', [])}
    for evento in calendario['eventos']:
        previo = previos.get(evento['id'], {})
        if previo == evento:
            continue
        cuando = evento['cuando']
        pasos.append(('INSERT INTO agenda_eventos VALUES (?, ?, ?, ?, ?, ?) '
            'ON CONFLICT(id) DO UPDATE SET precision=excluded.precision, inicio=excluded.inicio, '
            'fin=excluded.fin, estado=excluded.estado, datos_json=excluded.datos_json',
            (evento['id'], cuando['precision'], _instante(cuando['inicio'], cuando['precision']),
             _instante(cuando.get('fin'), cuando['precision']), evento['estado'], _json(evento))))
        for campo, columna in (('regiones', 'region'), ('grupos', 'grupo')):
            tabla = f'agenda_evento_{columna}'
            viejos, nuevos = set(previo.get(campo, [])), set(evento.get(campo, []))
            for i in sorted(viejos - nuevos):
                pasos.append((f'DELETE FROM {tabla} WHERE evento=? AND {columna}=?', (evento['id'], i)))
            for i in sorted(nuevos - viejos):
                pasos.append((f'INSERT INTO {tabla}(evento, {columna}) VALUES (?, ?)', (evento['id'], i)))
    for ref, registro in calendario['registros'].items():
        previo = anterior.get('registros', {}).get(ref)
        if previo == registro:
            continue
        if previo is not None and _contenido(previo) == _contenido(registro):
            pasos.append(('UPDATE agenda_registros SET ultima_recogida=? WHERE ref=?',
                          (registro['ultima_recogida'], ref)))
            continue
        pasos.append(('INSERT INTO agenda_registros VALUES (?, ?, ?, ?, ?, ?) '
            'ON CONFLICT(ref) DO UPDATE SET fuente=excluded.fuente, evento=excluded.evento, '
            'primera_recogida=excluded.primera_recogida, ultima_recogida=excluded.ultima_recogida, '
            'datos_json=excluded.datos_json',
            (ref, registro['fuente'], registro['evento'], registro['primera_recogida'],
             registro['ultima_recogida'], _json(_contenido(registro)))))
        pasos.append(('INSERT INTO agenda_revisiones(ref, recogida, anterior_json, nuevo_json) '
            'VALUES (?, (SELECT max(id) FROM agenda_recogidas), ?, ?)',
            (ref, _json(previo) if previo else None, _json(registro))))
    for ref, evento in calendario['vinculos'].items():
        if anterior.get('vinculos', {}).get(ref) != evento:
            pasos.append(('INSERT INTO agenda_vinculos VALUES (?, ?) '
                'ON CONFLICT(ref) DO UPDATE SET evento=excluded.evento', (ref, evento)))
    pasos.extend(_planificar_clasificacion(anterior, calendario))
    pasos.extend(almacen_nucleo.planificar(anterior.get('nucleo'), calendario.get('nucleo')))
    metadatos = {k: v for k, v in calendario.items() if k not in COLECCIONES}
    if 'nucleo' in metadatos:
        from .nucleo import COLECCIONES as colecciones
        metadatos['nucleo'] = {k: v for k, v in metadatos['nucleo'].items() if k not in colecciones}
    pasos.append(("INSERT INTO agenda_estado VALUES ('calendario', ?) "
        'ON CONFLICT(clave) DO UPDATE SET valor_json=excluded.valor_json '
        'WHERE valor_json IS NOT excluded.valor_json',
        (_json(metadatos),)))
    return pasos


def _planificar_clasificacion(anterior, calendario):
    previo = anterior.get('clasificacion')
    nuevo = calendario.get('clasificacion')
    if previo == nuevo:
        return []
    if nuevo is None or nuevo.get('version') != 1:
        raise ValueError('Versión de clasificación incompatible')
    from .clasificacion import validar
    catalogo = validar(nuevo['catalogo'])
    objetivos = {e['id']: set(e['registros']) for e in calendario['eventos']}
    correspondencias = {r['id']: r for r in catalogo['correspondencias']}
    for evento, evidencias in nuevo['asignaciones'].items():
        for evidencia in evidencias:
            regla = correspondencias.get(evidencia.get('correspondencia'))
            if (evento not in objetivos or evidencia.get('registro') not in objetivos[evento]
                    or not regla or evidencia.get('tema') != regla['tema']
                    or evidencia.get('version') != catalogo['version']):
                raise ValueError('Asignación temática sin referencia o correspondencia válida')
    anterior_catalogo = (previo or {}).get('catalogo', {})
    if (anterior_catalogo and anterior_catalogo != catalogo
            and catalogo['version'] <= anterior_catalogo['version']):
        raise ValueError('Un cambio de catálogo necesita una versión mayor')
    temas = catalogo['conceptos']
    anteriores = anterior_catalogo.get('conceptos', {})
    if anteriores.keys() - temas.keys():
        raise ValueError('No se eliminan IDs temáticos: conservar el concepto o marcarlo retirado')
    pasos = []
    for tema, datos in temas.items():
        if anteriores.get(tema) != datos:
            pasos.append(('INSERT INTO agenda_temas VALUES (?, ?) '
                'ON CONFLICT(id) DO UPDATE SET datos_json=excluded.datos_json', (tema, _json(datos))))
    for tema, datos in temas.items():
        viejos = set(anteriores.get(tema, {}).get('padres', []))
        nuevos = set(datos['padres'])
        for padre in sorted(viejos - nuevos):
            pasos.append(('DELETE FROM agenda_tema_padres WHERE tema=? AND padre=?', (tema, padre)))
        for padre in sorted(nuevos - viejos):
            pasos.append(('INSERT INTO agenda_tema_padres VALUES (?, ?)', (tema, padre)))

    def por_clave(clasificacion):
        filas = {}
        for evento, evidencias in (clasificacion or {}).get('asignaciones', {}).items():
            for evidencia in evidencias:
                filas.setdefault((evento, evidencia['tema']), []).append(evidencia)
        return filas

    viejas, nuevas = por_clave(previo), por_clave(nuevo)
    for evento, tema in sorted(viejas.keys() - nuevas.keys()):
        pasos.append(('DELETE FROM agenda_evento_tema WHERE evento=? AND tema=?', (evento, tema)))
    for (evento, tema), evidencias in nuevas.items():
        if viejas.get((evento, tema)) != evidencias:
            pasos.append(('INSERT INTO agenda_evento_tema VALUES (?, ?, ?) '
                'ON CONFLICT(evento, tema) DO UPDATE SET evidencias_json=excluded.evidencias_json',
                (evento, tema, _json(evidencias))))
    pasos.append(('INSERT INTO agenda_clasificacion_revisiones(modificado, anterior_json, nuevo_json) '
                  'VALUES (?, ?, ?)', (datetime.now(timezone.utc).isoformat(),
                    _json(previo) if previo else None, _json(nuevo))))
    return pasos
