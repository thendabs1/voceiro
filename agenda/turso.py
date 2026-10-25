"""Calendario en una base Turso dedicada; autoridad remota y escrituras por cambios."""

import os
from contextlib import closing
from copy import deepcopy
from pathlib import Path
import sqlite3
import tempfile

from turso_http import Cliente, ErrorTurso, filas
from . import almacen


class ConflictoCalendario(RuntimeError):
    pass


class Almacen:
    def __init__(self, url=None, token=None):
        self.cliente = Cliente(url or os.environ.get('CALENDARIO_TURSO_URL', ''),
                               token or os.environ.get('CALENDARIO_TURSO_TOKEN', ''))
        self.revision = None
        self.anterior = None

    def inicializar(self):
        resultados = self.cliente.transaccion([
            ("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", ())],
            escritura=False)
        tablas = {f[0] for f in filas(resultados[0])}
        if not tablas:
            self.cliente.transaccion([*almacen.esquema(),
                ('INSERT INTO agenda_esquema VALUES (1, ?, 0) ON CONFLICT(id) DO NOTHING',
                 (almacen.VERSION_ESQUEMA,))])
        elif 'agenda_esquema' not in tablas or any(not t.startswith('agenda_') for t in tablas):
            raise ValueError('Se requiere una base Turso dedicada al calendario')
        else:
            versiones = self.cliente.transaccion([
                ('SELECT version FROM agenda_esquema WHERE id=1', ())], escritura=False)
            version = filas(versiones[0])
            if version == [[2]]:
                self.cliente.transaccion(almacen.migracion())
            elif version != [[almacen.VERSION_ESQUEMA]]:
                raise ValueError('Versión de base de calendario incompatible')

    def cargar(self):
        resultados = [filas(r) for r in self.cliente.transaccion(almacen.CONSULTAS, escritura=False)]
        calendario = almacen.reconstruir(resultados)
        self.revision = resultados[0][0][1]
        self.anterior = deepcopy(calendario)
        return calendario

    def guardar(self, calendario, solo_clasificacion=False):
        if self.revision is None:
            raise ValueError('Hay que cargar el estado remoto antes de integrarlo')
        if solo_clasificacion and self.anterior == calendario:
            return
        # Si otro escritor avanzó la revisión, CHECK(revision>=0) rechaza la
        # guardia, el batch omite las escrituras y revierte. También falla si
        # desapareció el control: un UPDATE con cero filas no daría esa garantía.
        guardia = ('INSERT INTO agenda_esquema(id, version, revision) '
            'SELECT 1, ?, -1 WHERE NOT EXISTS '
            '(SELECT 1 FROM agenda_esquema WHERE id=1 AND version=? AND revision=?)',
            (almacen.VERSION_ESQUEMA, almacen.VERSION_ESQUEMA, self.revision))
        pasos = [guardia, *almacen.planificar(self.anterior, calendario, solo_clasificacion),
                 ('UPDATE agenda_esquema SET revision=revision+1 WHERE id=1', ())]
        try:
            self.cliente.transaccion(pasos)
        except ErrorTurso as error:
            if error.paso == 0 and error.codigo in ('SQLITE_CONSTRAINT', 'SQLITE_CONSTRAINT_CHECK'):
                raise ConflictoCalendario('Otra ejecución modificó el calendario; releer antes de integrar') from None
            raise
        self.revision += 1
        self.anterior = deepcopy(calendario)

    def copia(self, ruta):
        """Snapshot completo, incluido historial; sustituye la copia tras validarla."""
        volcado = self.cliente.dump()
        ruta = Path(ruta)
        ruta.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=ruta.parent, delete=False) as archivo:
            temporal = Path(archivo.name)
        try:
            with closing(sqlite3.connect(temporal)) as db:
                db.executescript(volcado)
                if db.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
                    raise ValueError('Copia de calendario sin integridad')
                if db.execute('PRAGMA foreign_key_check').fetchall():
                    raise ValueError('Copia de calendario con referencias inválidas')
            # Las copias antiguas se migran aquí, sin modificar la base remota.
            with almacen.abrir(temporal) as db:
                almacen.cargar(db)
            temporal.replace(ruta)
        finally:
            temporal.unlink(missing_ok=True)
