"""Repositorio operativo SQLite/Turso: reservas durables y confirmación atómica."""

from copy import deepcopy
import json
from pathlib import Path
import sqlite3
from uuid import uuid4

from turso_http import ErrorTurso, filas
from . import almacen, temporadas


class ConflictoControl(RuntimeError):
    pass


class PresupuestoAgotado(RuntimeError):
    pass


def codificar(valor):
    return json.dumps(valor, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


class Repositorio:
    def __init__(self, *, db=None, remoto=None):
        if (db is None) == (remoto is None):
            raise ValueError('El control requiere SQLite o Turso')
        self.db, self.remoto = db, remoto
        self.revision_nucleo = None

    def consultar(self, sql, args=()):
        if self.db is not None:
            return self.db.execute(sql, args).fetchall()
        return filas(self.remoto.cliente.transaccion([(sql, tuple(args))], escritura=False)[0])

    def escribir(self, pasos, calendario=None):
        if self.db is not None:
            propia = not self.db.in_transaction
            if propia:
                self.db.execute('BEGIN IMMEDIATE')
            # SAVEPOINT conserva la atomicidad incluso si el llamante maneja el error.
            self.db.execute('SAVEPOINT agenda_control')
            try:
                if calendario is not None:
                    if self.revision_nucleo is None:
                        raise ValueError('Cargar el calendario antes de confirmar sus citas')
                    self.db.execute('INSERT INTO agenda_esquema SELECT 1,?,-1 WHERE NOT EXISTS '
                        '(SELECT 1 FROM agenda_esquema WHERE id=1 AND revision=?)',
                        (almacen.VERSION_ESQUEMA, self.revision_nucleo))
                    almacen.guardar(self.db, calendario, solo_nucleo=almacen.cargar(self.db) is not None,
                                    pasos_extra=pasos)
                    revision_nueva = self.consultar('SELECT revision FROM agenda_esquema WHERE id=1')[0][0]
                else:
                    for sql, args in pasos:
                        self.db.execute(sql, args)
                self.db.execute('RELEASE agenda_control')
                if propia:
                    self.db.execute('COMMIT')
                if calendario is not None:
                    self.revision_nucleo = revision_nueva
            except BaseException:
                if self.db.in_transaction:
                    self.db.execute('ROLLBACK TO agenda_control')
                    self.db.execute('RELEASE agenda_control')
                    if propia:
                        self.db.execute('ROLLBACK')
                raise
        elif calendario is not None:
            self.remoto.guardar(calendario, solo_nucleo=self.remoto.anterior is not None, pasos_extra=pasos)
        else:
            self.remoto.cliente.transaccion(pasos)

    def cargar_calendario(self):
        if self.remoto is not None:
            return self.remoto.cargar()
        propia = not self.db.in_transaction
        if propia:
            self.db.execute('BEGIN')
        try:
            datos = [self.db.execute(sql, args).fetchall() for sql, args in almacen.CONSULTAS]
            self.revision_nucleo = datos[0][0][1]
            return almacen.reconstruir(datos)
        finally:
            if propia:
                self.db.execute('COMMIT')

    def inicializar(self):
        version = self.consultar('SELECT version FROM agenda_esquema WHERE id=1')
        if version != [(almacen.VERSION_ESQUEMA,)] and version != [[almacen.VERSION_ESQUEMA]]:
            raise ValueError('El control requiere la base dedicada del calendario')
        tablas = self.consultar("SELECT name FROM sqlite_master WHERE type='table' AND name='agenda_control_esquema'")
        if tablas:
            if self.consultar('SELECT version FROM agenda_control_esquema WHERE id=1') not in ([(1,)], [[1]]):
                raise ValueError('Versión de control incompatible')
            return
        sql = '\n'.join(l for l in Path(__file__).with_suffix('.sql').read_text().splitlines()
                        if not l.lstrip().startswith('--'))
        self.escribir([*[(s, ()) for s in sql.split(';') if s.strip()],
            ('INSERT INTO agenda_control_esquema VALUES (1,1,0) ON CONFLICT(id) DO NOTHING', ())])

    def temporadas(self, coleccion=None):
        filtro, args = (' WHERE coleccion=?', (coleccion,)) if coleccion else ('', ())
        return [json.loads(r[0]) for r in self.consultar(
            'SELECT datos_json FROM agenda_temporadas' + filtro + ' ORDER BY coleccion,referencia', args)]

    def obtener(self, identidad):
        filas_ = self.consultar('SELECT datos_json FROM agenda_temporadas WHERE id=?', (identidad,))
        if not filas_:
            raise ValueError('Temporada desconocida')
        return json.loads(filas_[0][0])

    def registrar(self, t):
        temporadas.validar(t)
        if self.consultar('SELECT id FROM agenda_temporadas WHERE id=?', (t['id'],)):
            return self.obtener(t['id'])
        self.escribir([('INSERT INTO agenda_temporadas VALUES (?,?,?,?,?,?,?)',
            (t['id'], t['coleccion'], t['referencia'], t['estado'], t['proxima_revision'], t['revision'], codificar(t)))])
        return deepcopy(t)

    @staticmethod
    def guardia(t):
        return ('INSERT INTO agenda_control_esquema SELECT 1,1,-1 WHERE NOT EXISTS '
                '(SELECT 1 FROM agenda_temporadas WHERE id=? AND revision=?)', (t['id'], t['revision']))

    @staticmethod
    def actualizar(t):
        return ('UPDATE agenda_temporadas SET estado=?,proxima_revision=?,revision=?,datos_json=? WHERE id=?',
                (t['estado'], t['proxima_revision'], t['revision'], codificar(t), t['id']))

    def cambiar(self, anterior, nuevo):
        if any(nuevo.get(k) != anterior[k] for k in ('id', 'coleccion', 'referencia', 'creada')):
            raise ValueError('El control conserva la identidad de la temporada')
        r = deepcopy(nuevo)
        r['revision'] = anterior['revision'] + 1
        temporadas.validar(r)
        try:
            self.escribir([self.guardia(anterior), self.actualizar(r)])
        except (sqlite3.IntegrityError, ErrorTurso) as error:
            raise ConflictoControl('La temporada cambió; releer antes de modificarla') from error
        return r

    def cobertura(self, identidad):
        return [json.loads(r[0]) for r in self.consultar(
            'SELECT datos_json FROM agenda_cobertura WHERE temporada=? ORDER BY unidad,recurso', (identidad,))]

    def eventos(self, identidad):
        return [json.loads(r[0]) for r in self.consultar(
            'SELECT datos_json FROM agenda_control_eventos WHERE temporada=? ORDER BY evento', (identidad,))]

    def pasadas(self, identidad=None, limite=20):
        if not 1 <= limite <= 100:
            raise ValueError('Límite de pasadas inválido')
        filtro, args = (' WHERE temporada=?', (identidad, limite)) if identidad else ('', (limite,))
        return [json.loads(r[0]) for r in self.consultar(
            'SELECT datos_json FROM agenda_pasadas' + filtro + ' ORDER BY iniciada DESC,id DESC LIMIT ?', args)]

    def comenzar(self, t, ahora, unidades, *, proveedor=None, contraste=False):
        if t['estado'] in ('cerrada', 'pausada') or t['bloqueada']:
            raise ValueError('La temporada está cerrada, pausada o bloqueada; reabrir con motivo')
        ahora = temporadas.marca(ahora)
        pasadas = self.consultar('SELECT datos_json FROM agenda_pasadas WHERE temporada=? AND estado=?',
                                (t['id'], 'en_curso'))
        pasos = [self.guardia(t)]
        for fila in pasadas:
            p = json.loads(fila[0])
            if temporadas.momento(p['lease_hasta']) > temporadas.momento(ahora):
                raise ConflictoControl('Ya hay una recogida en curso para esa temporada')
            p.update(estado='interrumpida', terminada=ahora, error='La ejecución no confirmó su selección')
            pasos.append(self._pasada_sql(p))
        p = {'id': str(uuid4()), 'temporada': t['id'], 'proveedor': proveedor or t['principal'],
             'estado': 'en_curso', 'iniciada': ahora, 'terminada': None,
             'lease_hasta': temporadas.despues(ahora, minutes=15),
             'unidades': list(unidades), 'contraste': contraste, 'peticiones': [], 'error': None}
        pasos.append(('INSERT INTO agenda_pasadas VALUES (?,?,?,?,?,?,?)',
            (p['id'], p['temporada'], p['proveedor'], p['estado'], p['iniciada'], p['lease_hasta'], codificar(p))))
        r = deepcopy(t)
        r['revision'] = t['revision'] + 1
        if not contraste:
            r['ultimo_intento'] = ahora
        pasos.append(self.actualizar(r))
        try:
            self.escribir(pasos)
        except (sqlite3.IntegrityError, ErrorTurso) as error:
            raise ConflictoControl('Otra ejecución inició o modificó la temporada') from error
        return r, p

    @staticmethod
    def _pasada_sql(p):
        return ('UPDATE agenda_pasadas SET estado=?,datos_json=? WHERE id=?', (p['estado'], codificar(p), p['id']))

    @staticmethod
    def _guardia_pasada(p):
        return ('INSERT INTO agenda_control_esquema SELECT 1,1,-1 WHERE NOT EXISTS '
                '(SELECT 1 FROM agenda_pasadas WHERE id=? AND estado=? AND lease_hasta=? AND datos_json=?)',
                (p['id'], 'en_curso', p['lease_hasta'], codificar(p)))

    def reservar(self, t, p, url, ahora):
        if len(p['peticiones']) >= t['politica']['max_peticiones_pasada']:
            raise PresupuestoAgotado('Presupuesto de la pasada agotado')
        proveedor = ('espn' if p['proveedor'].startswith('espn-') else
                     'feb' if p['proveedor'].startswith('feb-') else p['proveedor'])
        dia = temporadas.momento(ahora).strftime('%Y-%m-%d')
        periodos = [(dia, t['politica']['max_peticiones_dia'])]
        if proveedor == 'ocblacktop-wrc':
            periodos.append((dia[:7], 120))
        pasos = [self._guardia_pasada(p)]
        for periodo, limite in periodos:
            pasos.append(('INSERT INTO agenda_control_esquema SELECT 1,1,-1 WHERE '
                'COALESCE((SELECT peticiones FROM agenda_control_consumo WHERE proveedor=? AND periodo=?),0)>=?',
                (proveedor, periodo, limite)))
            pasos.append(('INSERT INTO agenda_control_consumo VALUES (?,?,1,?) '
                'ON CONFLICT(proveedor,periodo) DO UPDATE SET peticiones=peticiones+1',
                (proveedor, periodo, '{}')))
        r = deepcopy(p)
        r['peticiones'].append({'url': url, 'reservada': temporadas.marca(ahora), 'http': None,
                                'bytes': 0, 'cabeceras': {}, 'recibida': False})
        pasos.append(self._pasada_sql(r))
        try:
            self.escribir(pasos)
        except (sqlite3.IntegrityError, ErrorTurso) as error:
            raise PresupuestoAgotado('Presupuesto agotado o pasada sustituida; no se envió la petición') from error
        p.update(r)

    def recibida(self, p, estado, cabeceras, cantidad):
        r = deepcopy(p)
        r['peticiones'][-1].update(http=estado, cabeceras=cabeceras, bytes=cantidad, recibida=True)
        self.escribir([self._guardia_pasada(p), self._pasada_sql(r)])
        p.update(r)

    def confirmar(self, t, p, nuevo, calendario, coberturas, eventos, ahora):
        if any(nuevo.get(k) != t[k] for k in ('id', 'coleccion', 'referencia', 'creada')):
            raise ValueError('Confirmar conserva la identidad de la temporada')
        if p['temporada'] != t['id'] or p['estado'] != 'en_curso':
            raise ValueError('Pasada ajena o terminada')
        if any(c['unidad'] not in p['unidades'] or c.get('proveedor') != p['proveedor']
               for c in coberturas) or any(e['unidad'] not in p['unidades'] for e in eventos):
            raise ValueError('Cobertura o eventos fuera de la selección solicitada')
        if p['contraste'] and (calendario is not None or coberturas or eventos):
            raise ValueError('Un contraste no publica datos ni avanza la cobertura principal')
        if p['contraste']:
            nuevo = deepcopy(t)
            nuevo['ultimo_contraste'] = {'proveedor': p['proveedor'], 'comprobado': temporadas.marca(ahora)}
        r, pasada = deepcopy(nuevo), deepcopy(p)
        r['revision'] = t['revision'] + 1
        temporadas.validar(r)
        pasada.update(estado='contraste' if p['contraste'] else 'completa', terminada=temporadas.marca(ahora))
        pasos = [self.guardia(t), self._guardia_pasada(p), self._pasada_sql(pasada)]
        for c in coberturas:
            pasos.append(('INSERT INTO agenda_cobertura VALUES (?,?,?,?,?,?,?) '
                'ON CONFLICT(temporada,proveedor,unidad,recurso) DO UPDATE SET '
                'comprobado=excluded.comprobado,pasada=excluded.pasada,datos_json=excluded.datos_json',
                (t['id'], p['proveedor'], c['unidad'], c['recurso'], c['comprobado'], p['id'], codificar(c))))
        for e in eventos:
            pasos.append(('INSERT INTO agenda_control_eventos VALUES (?,?,?,?,?,?) '
                'ON CONFLICT(temporada,evento) DO UPDATE SET proveedor=excluded.proveedor,unidad=excluded.unidad,'
                'comprobado=excluded.comprobado,datos_json=excluded.datos_json',
                (t['id'], e['evento'], p['proveedor'], e['unidad'], e['comprobado'], codificar(e))))
        pasos.append(self.actualizar(r))
        self.escribir(pasos, calendario=calendario)
        return r

    def fallar(self, t, p, ahora, error):
        ultima = p['peticiones'][-1] if p['peticiones'] else {}
        if p['contraste']:
            r = deepcopy(t)
            r['ultimo_contraste'] = {'proveedor': p['proveedor'], 'error': str(error)[:500],
                                    'comprobado': temporadas.marca(ahora)}
        else:
            r = temporadas.fallida(t, ahora, error, estado_http=ultima.get('http'),
                                  retry_after=ultima.get('cabeceras', {}).get('retry-after'))
        r['revision'] = t['revision'] + 1
        pasada = deepcopy(p)
        pasada.update(estado='fallida', terminada=temporadas.marca(ahora), error=str(error)[:500])
        self.escribir([self.guardia(t), self._guardia_pasada(p), self._pasada_sql(pasada), self.actualizar(r)])
        return r

    def consumo(self):
        return [{'proveedor': r[0], 'periodo': r[1], 'peticiones': r[2]}
                for r in self.consultar('SELECT proveedor,periodo,peticiones FROM agenda_control_consumo ORDER BY 1,2')]

    def publico(self):
        """Estado publicable acotado: no incluye peticiones, claves ni errores internos."""
        temporadas_ = self.temporadas()
        permitidas = {t['id']: t for t in temporadas_ if t['ultima_valida']}
        ids, cobertura = {}, []
        for identidad, t in permitidas.items():
            from .proveedores import fuente_nucleo
            fuente = fuente_nucleo(t['principal'])
            eventos = self.consultar('SELECT evento FROM agenda_control_eventos WHERE temporada=? AND proveedor=?',
                                     (identidad, t['principal']))
            ids.setdefault(fuente, set()).update(e[0] for e in eventos)
            unidades = [c for c in self.cobertura(identidad) if c['proveedor'] == t['principal']]
            cobertura.append({'coleccion': t['coleccion'], 'temporada': t['referencia'],
                'fuente': fuente, 'proveedor': t['principal'], 'estado': t['estado'],
                'ultima_valida': t['ultima_valida'], 'ultimo_intento': t['ultimo_intento'],
                'proxima_revision': t['proxima_revision'], 'inicio': t['inicio'], 'fin': t['fin'],
                'fin_confirmado': t['fin_confirmado'], 'calendario_completo': t['cobertura_completa'],
                'alcance': 'unidades_y_recursos_comprobados',
                'incidencias': sorted({i['tipo'] for i in t['incidencias']}),
                'bloqueada': t['bloqueada'], 'unidades': [
                    {k: c[k] for k in ('unidad', 'recurso', 'comprobado', 'completa', 'inicio', 'fin') if k in c}
                    for c in unidades]})
        return {'version': 1, 'colecciones': cobertura, 'eventos': {f: sorted(v) for f, v in ids.items()}}

    def descubrimiento(self, coleccion):
        r = self.consultar('SELECT datos_json FROM agenda_descubrimientos WHERE coleccion=?', (coleccion,))
        return json.loads(r[0][0]) if r else None

    def guardar_descubrimiento(self, coleccion, dato):
        self.escribir([('INSERT INTO agenda_descubrimientos VALUES (?,?,?) '
            'ON CONFLICT(coleccion) DO UPDATE SET proxima_revision=excluded.proxima_revision,datos_json=excluded.datos_json',
            (coleccion, dato['proxima_revision'], codificar(dato)))])

    def comenzar_descubrimiento(self, coleccion, proveedor, ahora):
        if coleccion not in temporadas.CATALOGO:
            raise ValueError('Colección de descubrimiento desconocida')
        ahora = temporadas.marca(ahora)
        p = {'id': str(uuid4()), 'temporada': None, 'coleccion': coleccion, 'proveedor': proveedor,
             'estado': 'en_curso', 'iniciada': ahora, 'terminada': None,
             'lease_hasta': temporadas.despues(ahora, minutes=15), 'unidades': ['descubrimiento'],
             'contraste': False, 'peticiones': [], 'error': None}
        # La comprobación se hace dentro de la transacción para excluir dos cron.
        guardia = ('INSERT INTO agenda_control_esquema SELECT 1,1,-1 WHERE EXISTS '
            '(SELECT 1 FROM agenda_pasadas WHERE temporada IS NULL AND estado=? AND lease_hasta>? '
            "AND json_extract(datos_json,'$.coleccion')=?)", ('en_curso', ahora, coleccion))
        self.escribir([guardia, ('INSERT INTO agenda_pasadas VALUES (?,?,?,?,?,?,?)',
            (p['id'], None, proveedor, 'en_curso', ahora, p['lease_hasta'], codificar(p)))])
        return p

    def terminar_descubrimiento(self, p, ahora, *, referencia=None, error=None):
        anterior = self.descubrimiento(p['coleccion']) or {}
        ultima = p['peticiones'][-1] if p['peticiones'] else {}
        # Sin temporada nueva se vuelve a mirar en una semana; un error se reintenta
        # como en las temporadas, sin esperar la semana entera.
        errores = anterior.get('errores_consecutivos', 0) + 1 if error else 0
        proxima = (temporadas.reintento(ahora, errores, ultima.get('cabeceras', {}).get('retry-after')) if error
                   else temporadas.despues(ahora, hours=temporadas.POLITICA['descubrimiento_horas']))
        dato = {'coleccion': p['coleccion'], 'proveedor': p['proveedor'], 'errores_consecutivos': errores,
            'ultimo_intento': temporadas.marca(ahora),
            'ultima_valida': temporadas.marca(ahora) if not error else anterior.get('ultima_valida'),
            'referencia': referencia or anterior.get('referencia'), 'proxima_revision': proxima,
            'bloqueada': bool(error and ultima.get('http') in (401, 403)),
            'error': str(error)[:500] if error else None}
        pasada = deepcopy(p)
        pasada.update(estado='fallida' if error else 'completa',
                      terminada=temporadas.marca(ahora), error=dato['error'])
        self.escribir([self._guardia_pasada(p), self._pasada_sql(pasada),
            ('INSERT INTO agenda_descubrimientos VALUES (?,?,?) ON CONFLICT(coleccion) DO UPDATE SET '
             'proxima_revision=excluded.proxima_revision,datos_json=excluded.datos_json',
             (p['coleccion'], proxima, codificar(dato)))])
        return dato
