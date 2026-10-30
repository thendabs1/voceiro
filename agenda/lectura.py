"""Lectura SQL regenerable. Preparar antes de abrir la transacción de publicación."""
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import subprocess

from .almacen import VERSION_ESQUEMA

RAIZ = Path(__file__).resolve().parent.parent
TABLAS = {'evento': 'eventos', 'entidad': 'entidades'}


def preparar(datos):
    resultado = subprocess.run(['node', str(RAIZ / 'scripts/preparar-lectura-calendario.mjs')],
        input=json.dumps(datos, ensure_ascii=False, allow_nan=False), text=True,
        encoding='utf-8', capture_output=True, timeout=120, check=True)
    return json.loads(resultado.stdout)


def _huella(dato):
    return hashlib.sha256(json.dumps(dato, ensure_ascii=False, sort_keys=True,
                                     separators=(',', ':')).encode()).hexdigest()


COMPONENTES = ('fila', 'facetas', 'tramos', 'chips', 'activos')


def huellas(preparada):
    """Huella de cada evento por componente (fila, facetas, tramos, chips) y de cada entidad.

    La de un evento se guarda como JSON con una huella por componente: si solo
    cambian sus facetas no se reescriben su fila ni sus tramos.
    """
    facetas, tramos, chips, activos = defaultdict(list), defaultdict(list), defaultdict(list), defaultdict(list)
    for f in preparada['facetas']:
        facetas[f[0]].append(f)
    for t in preparada['tramos']:
        tramos[t[3]].append(t)
    for t in preparada.get('activos', []):
        activos[t[3]].append(t)
    for c in preparada.get('chips', []):
        chips[c[2]].append(c)
    resultado = {('evento', e[0]): json.dumps({'fila': _huella(e), 'facetas': _huella(sorted(facetas[e[0]])),
                                               'tramos': _huella(sorted(tramos[e[0]])),
                                               'activos': _huella(sorted(activos[e[0]])),
                                               'chips': _huella(sorted(chips[e[0]], key=json.dumps))}, sort_keys=True)
                 for e in preparada['eventos']}
    resultado.update({('entidad', e[0]): _huella(e) for e in preparada['entidades']})
    return resultado, facetas, tramos, chips, activos


def cambios(preparada, previo=None):
    """{(tipo, id): componentes que hay que reescribir}; vacío si nada cambió.

    Las huellas guardadas antes de separar componentes (un solo hash del evento)
    siguen valiendo: si el contenido es el mismo, no se reescribe nada.
    """
    nuevas, facetas, tramos, chips, activos = huellas(preparada)
    guardadas = (previo or {}).get('huellas', {})
    filas = {e[0]: e for e in preparada['eventos']}
    salida = {}
    for (tipo, i), h in nuevas.items():
        vieja = guardadas.get((tipo, i))
        if vieja == h:
            continue
        if tipo == 'entidad' or vieja is None:
            salida[(tipo, i)] = set(COMPONENTES) if tipo == 'evento' else {'fila'}
        elif vieja.startswith('{'):
            antes, ahora = json.loads(vieja), json.loads(h)
            salida[(tipo, i)] = {c for c in COMPONENTES if antes.get(c) != ahora[c]}
        elif vieja != _huella([filas[i], sorted(facetas[i]), sorted(tramos[i])]):
            salida[(tipo, i)] = set(COMPONENTES)
        else:
            # Componentes añadidos después de la huella única.
            salida[(tipo, i)] = {'chips', 'activos'}
    return salida


def estado(consultar):
    """Revisión publicada y huellas guardadas, leídas en un mismo snapshot.

    `consultar(sentencias)` devuelve las filas de cada sentencia. None (sin
    lectura previa o sin huellas) obliga a reemplazar la lectura entera.
    """
    tablas, = consultar([("SELECT name FROM sqlite_master WHERE type='table' AND name IN "
                          "('agenda_lectura_control', 'agenda_lectura_huellas', 'agenda_lectura_disponibilidad')", ())])
    nombres = {t[0] for t in tablas}
    if not {'agenda_lectura_control', 'agenda_lectura_huellas'} <= nombres:
        return None
    # Lecturas anteriores a la disponibilidad: sin filas, se escribe entera.
    con = 'agenda_lectura_disponibilidad' in nombres
    control, guardadas, *disponibilidad = consultar([('SELECT revision FROM agenda_lectura_control WHERE id=1', ()),
        ('SELECT tipo, id, huella FROM agenda_lectura_huellas', ()),
        *([('SELECT territorio, datos_json FROM agenda_lectura_disponibilidad', ())] if con else [])])
    if not control or not guardadas:
        return None
    return {'revision': control[0][0], 'huellas': {(t, i): h for t, i, h in guardadas},
            'disponibilidad': {t: d for t, d in (disponibilidad[0] if con else [])}}


def planificar(preparada, revision, previo=None):
    """Reemplazo atómico; la revisión del núcleo protege frente a publicaciones viejas.

    Con `previo` (de `estado`) solo se reescriben los eventos y entidades cuya
    huella cambió, y se retiran los que ya no se publican. Si otra publicación
    cambió la lectura desde que se leyó `previo`, la guardia revierte todo.
    El llamante ejecuta TODOS los pasos en una transacción, también el DDL.
    La versión SQL de lectura es independiente de la del núcleo.
    """
    if preparada['version'] != 1 or type(revision) is not int or revision < 0:
        raise ValueError('Contrato de lectura incompatible')
    cuerpo = json.dumps(preparada, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    identificador = hashlib.sha256((str(revision) + ':' + cuerpo).encode()).hexdigest()
    meta = {k: v for k, v in preparada.items()
            if k not in ('eventos', 'facetas', 'tramos', 'chips', 'activos', 'entidades', 'disponibilidad')}
    meta.update(revision=identificador, origen_revision=revision)
    sql = '\n'.join(l for l in Path(__file__).with_suffix('.sql').read_text().splitlines()
                    if not l.lstrip().startswith('--'))
    pasos = [(s, ()) for s in sql.split(';') if s.strip()]
    # Una versión/revisión distinta provoca CHECK y revierte también las tablas nuevas.
    pasos.append(('INSERT INTO agenda_lectura_control '
        'SELECT 1, -1, ?, ?, ? WHERE NOT EXISTS '
        '(SELECT 1 FROM agenda_esquema WHERE id=1 AND version=? AND revision=?)',
        (identificador, revision, '{}', VERSION_ESQUEMA, revision)))
    nuevas, facetas, tramos, chips, activos = huellas(preparada)
    if previo is None:
        cambiadas, retiradas = {k: set(COMPONENTES) for k in nuevas}, set()
        for tabla in ('chips', 'activos', 'facetas', 'tramos', 'eventos', 'entidades', 'huellas', 'disponibilidad'):
            pasos.append((f'DELETE FROM agenda_lectura_{tabla}', ()))
    else:
        # Misma técnica: si la lectura publicada ya no es la leída, CHECK o PK fallan.
        pasos.append(('INSERT INTO agenda_lectura_control SELECT 1, -1, ?, ?, ? WHERE NOT EXISTS '
                      '(SELECT 1 FROM agenda_lectura_control WHERE id=1 AND revision=?)',
                      (identificador, revision, '{}', previo['revision'])))
        cambiadas = cambios(preparada, previo)
        retiradas = previo['huellas'].keys() - nuevas.keys()
        for tipo, i in sorted(cambiadas.keys() | retiradas):
            if tipo != 'evento':
                continue
            componentes = cambiadas.get((tipo, i), set(COMPONENTES))
            if 'facetas' in componentes:
                pasos.append(('DELETE FROM agenda_lectura_facetas WHERE evento=?', (i,)))
            if 'tramos' in componentes:
                pasos.append(('DELETE FROM agenda_lectura_tramos WHERE evento=?', (i,)))
            if 'activos' in componentes:
                pasos.append(('DELETE FROM agenda_lectura_activos WHERE evento=?', (i,)))
            if 'chips' in componentes:
                pasos.append(('DELETE FROM agenda_lectura_chips WHERE evento=?', (i,)))
        for tipo, i in sorted(retiradas):
            pasos.append((f'DELETE FROM agenda_lectura_{TABLAS[tipo]} WHERE id=?', (i,)))
            pasos.append(('DELETE FROM agenda_lectura_huellas WHERE tipo=? AND id=?', (tipo, i)))
    for e in preparada['eventos']:
        componentes = cambiadas.get(('evento', e[0]), set())
        if 'fila' in componentes:
            pasos.append(('INSERT INTO agenda_lectura_eventos VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET '
                          'texto=excluded.texto, resultado=excluded.resultado, '
                          'tarjeta_json=excluded.tarjeta_json, detalle_json=excluded.detalle_json', tuple(e)))
        if 'facetas' in componentes:
            pasos.extend(('INSERT INTO agenda_lectura_facetas VALUES (?,?,?)', tuple(f)) for f in facetas[e[0]])
        if 'tramos' in componentes:
            pasos.extend(('INSERT INTO agenda_lectura_tramos VALUES (?,?,?,?)', tuple(t)) for t in tramos[e[0]])
        if 'activos' in componentes:
            pasos.extend(('INSERT INTO agenda_lectura_activos VALUES (?,?,?,?)', tuple(t)) for t in activos[e[0]])
        if 'chips' in componentes:
            pasos.extend(('INSERT INTO agenda_lectura_chips VALUES (?,?,?,?,?,?,?)', tuple(c)) for c in chips[e[0]])
    for e in preparada['entidades']:
        if ('entidad', e[0]) in cambiadas:
            pasos.append(('INSERT INTO agenda_lectura_entidades VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET '
                          'tipo=excluded.tipo, texto=excluded.texto, datos_json=excluded.datos_json', tuple(e)))
    # Disponibilidad: solo los territorios cuyas cuentas cambiaron o desaparecen.
    guardada = (previo or {}).get('disponibilidad', {})
    nueva = dict(preparada.get('disponibilidad', []))
    pasos.extend(('DELETE FROM agenda_lectura_disponibilidad WHERE territorio=?', (t,))
                 for t in sorted(guardada.keys() - nueva.keys()))
    pasos.extend(('INSERT INTO agenda_lectura_disponibilidad VALUES (?,?) ON CONFLICT(territorio) '
                  'DO UPDATE SET datos_json=excluded.datos_json', (t, d))
                 for t, d in sorted(nueva.items()) if guardada.get(t) != d)
    pasos.extend(('INSERT INTO agenda_lectura_huellas VALUES (?,?,?) ON CONFLICT(tipo,id) '
                  'DO UPDATE SET huella=excluded.huella', (tipo, i, nuevas[(tipo, i)]))
                 for tipo, i in sorted(cambiadas))
    pasos.append(('INSERT INTO agenda_lectura_control VALUES (1,1,?,?,?) ON CONFLICT(id) '
                  'DO UPDATE SET revision=excluded.revision, origen_revision=excluded.origen_revision, '
                  'datos_json=excluded.datos_json',
                  (identificador, revision, json.dumps(meta, ensure_ascii=False, separators=(',', ':')))))
    return pasos
