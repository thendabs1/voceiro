"""Calendario en una base Turso dedicada; autoridad remota y escrituras por cambios."""

import os
from contextlib import closing, contextmanager
from contextvars import ContextVar
from copy import deepcopy
from pathlib import Path
import sqlite3
import tempfile

from turso_http import ErrorTurso, filas
from .turso_lotes import ClienteCalendario as Cliente
from . import almacen, almacen_nucleo

# Filas por página al cargar el núcleo; muy por debajo de MAX_RESPUESTA incluso
# con las filas más grandes medidas (documento 95 KB, entidad 17 KB).
PAGINA, PAGINA_DOCUMENTOS = 2000, 500


class ConflictoCalendario(RuntimeError):
    pass


_COMPARTIDO = ContextVar('agenda_turso_compartido', default=None)


@contextmanager
def compartido():
    """Un Almacen para varias CLI seguidas: cargar() reutiliza el estado ya leído.

    La guardia de revisión de guardar() sigue detectando a otro escritor.
    """
    remoto = Almacen()
    remoto.reutilizar = True
    token = _COMPARTIDO.set(remoto)
    try:
        yield remoto
    finally:
        _COMPARTIDO.reset(token)


def abrir():
    return _COMPARTIDO.get() or Almacen()


class Almacen:
    def __init__(self, url=None, token=None):
        self.cliente = Cliente(url or os.environ.get('CALENDARIO_TURSO_URL', ''),
                               token or os.environ.get('CALENDARIO_TURSO_TOKEN', ''))
        self.revision = None
        self.anterior = None
        self.reutilizar = False
        self._vigente = False  # anterior coincide con la revisión remota conocida.

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
            if version in ([[2]], [[3]]):
                self.cliente.transaccion(almacen.migracion())
            elif version != [[almacen.VERSION_ESQUEMA]]:
                raise ValueError('Versión de base de calendario incompatible')

    def cargar(self):
        """Piloto en una lectura y núcleo por páginas: ninguna respuesta crece con el total.

        Las páginas son lecturas separadas; si la revisión cambió entre la primera
        y la última, otro escritor intervino y la carga no es coherente.
        """
        if self.reutilizar and self._vigente:
            return deepcopy(self.anterior)
        base = almacen.CONSULTAS[:len(almacen.CONSULTAS) - len(almacen_nucleo.CONSULTAS)]
        resultados = [filas(r) for r in self.cliente.transaccion(base, escritura=False)]
        if len(resultados[0]) != 1:
            raise ValueError('Versión de base de calendario incompatible')
        revision = resultados[0][0][1]
        resultados.extend(self._paginas(tabla) for tabla in almacen_nucleo.TABLAS.values())
        final = filas(self.cliente.transaccion(
            [('SELECT revision FROM agenda_esquema WHERE id=1', ())], escritura=False)[0])
        if final != [[revision]]:
            raise ConflictoCalendario('El calendario cambió durante la carga; repetir la pasada')
        calendario = almacen.reconstruir(resultados)
        self.revision = revision
        self.anterior = deepcopy(calendario)
        self._vigente = True
        return calendario

    def _paginas(self, tabla):
        """Filas [datos_json] de una tabla del núcleo, por clave primaria."""
        clave = ('tipo', 'id') if tabla == 'agenda_entidades' else ('id',)
        # Un documento puede ocupar ~100 KB (inventario completo); el resto, pocos KB.
        limite = PAGINA_DOCUMENTOS if tabla == 'agenda_documentos' else PAGINA
        salida, ultima = [], None
        while True:
            donde = '' if ultima is None else f'WHERE ({", ".join(clave)}) > ({", ".join("?" * len(clave))}) '
            pagina = filas(self.cliente.transaccion([(
                f'SELECT {", ".join(clave)}, datos_json FROM {tabla} {donde}'
                f'ORDER BY {", ".join(clave)} LIMIT ?', (*(ultima or ()), limite))], escritura=False)[0])
            salida.extend([f[-1]] for f in pagina)
            if len(pagina) < limite:
                return salida
            ultima = tuple(pagina[-1][:-1])

    def guardar(self, calendario, solo_clasificacion=False, solo_nucleo=False, pasos_extra=()):
        if self.revision is None:
            raise ValueError('Hay que cargar el estado remoto antes de integrarlo')
        calendario = almacen.sin_historial(calendario)
        cambios = self.anterior != calendario
        if (solo_clasificacion or solo_nucleo) and not cambios and not pasos_extra:
            return
        # Si otro escritor avanzó la revisión, CHECK(revision>=0) rechaza la
        # guardia, el batch omite las escrituras y revierte. También falla si
        # desapareció el control: un UPDATE con cero filas no daría esa garantía.
        guardia = ('INSERT INTO agenda_esquema(id, version, revision) '
            'SELECT 1, ?, -1 WHERE NOT EXISTS '
            '(SELECT 1 FROM agenda_esquema WHERE id=1 AND version=? AND revision=?)',
            (almacen.VERSION_ESQUEMA, almacen.VERSION_ESQUEMA, self.revision))
        pasos = [guardia, *pasos_extra]
        if cambios:
            pasos.extend(almacen.planificar(self.anterior, calendario, solo_clasificacion, solo_nucleo))
            pasos.append(('UPDATE agenda_esquema SET revision=revision+1 WHERE id=1', ()))
        # Una respuesta perdida deja la base incierta: la siguiente carga relee.
        self._vigente = False
        try:
            self.cliente.transaccion(pasos)
        except ErrorTurso as error:
            if error.paso == 0 and error.codigo in ('SQLITE_CONSTRAINT', 'SQLITE_CONSTRAINT_CHECK'):
                raise ConflictoCalendario('Otra ejecución modificó el calendario; releer antes de integrar') from None
            raise
        self.revision += int(cambios)
        self.anterior = deepcopy(calendario)
        self._vigente = True

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
