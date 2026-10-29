"""Calendario en una base Turso dedicada; autoridad remota y escrituras por cambios."""

import json
import os
from contextlib import closing, contextmanager
from contextvars import ContextVar
from copy import deepcopy
from pathlib import Path
import sqlite3
import tempfile

from turso_http import ErrorTurso, filas
from .turso_lotes import ClienteCalendario as Cliente
from . import almacen, almacen_nucleo, nucleo_r2
from .nucleo import json_canonico

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
    def __init__(self, url=None, token=None, ficheros=None):
        self.cliente = Cliente(url or os.environ.get('CALENDARIO_TURSO_URL', ''),
                               token or os.environ.get('CALENDARIO_TURSO_TOKEN', ''))
        # Núcleo en R2 si hay bucket privado configurado; False lo fuerza en Turso (migración).
        if ficheros is None and os.environ.get('AGENDA_R2_BUCKET'):
            ficheros = nucleo_r2.Ficheros.de_entorno()
        self.ficheros = ficheros or None
        self.revision = None
        self.manifiesto = None  # {fuente: huella} confirmado con la revisión.
        self.anterior = None
        self.reutilizar = False
        self._vigente = False  # anterior coincide con la revisión remota conocida.

    def inicializar(self, migrando=False):
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
            version, en_r2 = (filas(r) for r in self.cliente.transaccion([
                ('SELECT version FROM agenda_esquema WHERE id=1', ()),
                ('SELECT 1 FROM agenda_estado WHERE clave=?', (nucleo_r2.MARCA,))], escritura=False))
            if version == [[4]] and en_r2:
                # Núcleo R2 v1: solo la migración del núcleo sube el esquema, con el manifiesto.
                if not migrando:
                    raise ValueError('Núcleo R2 v1: lanzar la operación migrar-nucleo '
                                     '(python -m agenda.nucleo_r2 --migrar)')
            elif version in ([[2]], [[3]], [[4]]):
                self.cliente.transaccion(almacen.migracion())
            elif version != [[almacen.VERSION_ESQUEMA]]:
                raise ValueError('Versión de base de calendario incompatible')

    def cargar(self):
        """Piloto en una lectura y núcleo por fuente en R2 (o por páginas en Turso).

        Ninguna respuesta crece con el total. Si la revisión cambió entre la primera
        y la última lectura, otro escritor intervino y la carga no es coherente.
        """
        if self.reutilizar and self._vigente:
            return deepcopy(self.anterior)
        base = almacen.CONSULTAS[:len(almacen.CONSULTAS) - len(almacen_nucleo.CONSULTAS)]
        marca = ("SELECT valor_json FROM agenda_estado WHERE clave=?", (nucleo_r2.MARCA,))
        *resultados, en_r2 = [filas(r) for r in self.cliente.transaccion([*base, marca], escritura=False)]
        if len(resultados[0]) != 1:
            raise ValueError('Versión de base de calendario incompatible')
        revision = resultados[0][0][1]
        if bool(en_r2) != bool(self.ficheros):
            raise ValueError('El núcleo está en R2: definir AGENDA_R2_*' if en_r2
                             else 'Núcleo R2 sin migrar: python -m agenda.nucleo_r2 --migrar')
        if self.ficheros:
            resultados.extend([] for _ in almacen_nucleo.TABLAS)
            # Manifiesto y revisión salen del mismo snapshot: la revisión identifica el núcleo.
            manifiesto = nucleo_r2.leer_marca(en_r2[0][0])['fuentes']
            ficheros = self.ficheros.cargar(manifiesto)
        else:
            resultados.extend(self._paginas(tabla) for tabla in almacen_nucleo.TABLAS.values())
        final = filas(self.cliente.transaccion(
            [('SELECT revision FROM agenda_esquema WHERE id=1', ())], escritura=False)[0])
        if final != [[revision]]:
            raise ConflictoCalendario('El calendario cambió durante la carga; repetir la pasada')
        calendario = almacen.reconstruir(resultados)
        if self.ficheros and 'nucleo' in calendario:
            calendario['nucleo'] = nucleo_r2.unir(calendario['nucleo'], ficheros)
        self.revision = revision
        self.manifiesto = manifiesto if self.ficheros else None
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
            pasos.extend(almacen.planificar(self.anterior, calendario, solo_clasificacion, solo_nucleo,
                                            nucleo_sql=not self.ficheros))
        # Una respuesta perdida deja la base incierta: la siguiente carga relee.
        self._vigente = False
        manifiesto = self.manifiesto
        if cambios and self.ficheros and calendario.get('nucleo') != self.anterior.get('nucleo'):
            # Ahorro: no subir objetos si ya se sabe que otro escritor avanzó la revisión.
            if filas(self.cliente.transaccion([('SELECT revision FROM agenda_esquema WHERE id=1', ())],
                                              escritura=False)[0]) != [[self.revision]]:
                raise ConflictoCalendario('Otra ejecución modificó el calendario; releer antes de integrar')
            # Objetos nuevos primero; solo el manifiesto confirmado con la revisión los activa.
            manifiesto = self.ficheros.subir(nucleo_r2.partir(calendario['nucleo']), self.manifiesto)
            if manifiesto != self.manifiesto:
                pasos.append(("UPDATE agenda_estado SET valor_json=? WHERE clave=?",
                              (nucleo_r2.marca(self.ficheros.bucket, manifiesto), nucleo_r2.MARCA)))
        if cambios:
            pasos.append(('UPDATE agenda_esquema SET revision=revision+1 WHERE id=1', ()))
        try:
            self.cliente.transaccion(pasos)
        except ErrorTurso as error:
            if error.paso == 0 and error.codigo in ('SQLITE_CONSTRAINT', 'SQLITE_CONSTRAINT_CHECK'):
                raise ConflictoCalendario('Otra ejecución modificó el calendario; releer antes de integrar') from None
            raise
        self.revision += int(cambios)
        self.manifiesto = manifiesto
        self.anterior = deepcopy(calendario)
        self._vigente = True

    def estado_nucleo(self):
        """(versión, revisión, esqueleto, marca) de un mismo snapshot, para migrar."""
        esquema, calendario, en_r2 = (filas(r) for r in self.cliente.transaccion([
            ('SELECT version, revision FROM agenda_esquema WHERE id=1', ()),
            ("SELECT valor_json FROM agenda_estado WHERE clave='calendario'", ()),
            ('SELECT valor_json FROM agenda_estado WHERE clave=?', (nucleo_r2.MARCA,))], escritura=False))
        return (*esquema[0], json.loads(calendario[0][0]) if calendario else None,
                en_r2[0][0] if en_r2 else None)

    def activar_r2(self, bucket, manifiesto, revision, catalogo):
        """Desde aquí el núcleo son los objetos del manifiesto; solo si nadie escribió.

        La versión de esquema sube a la vez: un cliente antiguo ya no carga ni guarda.
        """
        pasos = [
            ('INSERT INTO agenda_esquema(id, version, revision) SELECT 1, ?, -1 WHERE NOT EXISTS '
             '(SELECT 1 FROM agenda_esquema WHERE id=1 AND version IN (4, ?) AND revision=?)',
             (almacen.VERSION_ESQUEMA, almacen.VERSION_ESQUEMA, revision)),
            ('INSERT INTO agenda_estado VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor_json=excluded.valor_json',
             (nucleo_r2.MARCA, nucleo_r2.marca(bucket, manifiesto))),
            # El catálogo de los ficheros v1 pudo ser más nuevo que el del esqueleto.
            ("UPDATE agenda_estado SET valor_json=json_set(valor_json, '$.nucleo.catalogo', json(?)) "
             "WHERE clave='calendario' AND json_extract(valor_json, '$.nucleo.catalogo.version') < ?",
             (json_canonico(catalogo), catalogo['version'])),
            # Un Almacen que cargó antes ya no puede guardar.
            ('UPDATE agenda_esquema SET version=?, revision=revision+1 WHERE id=1', (almacen.VERSION_ESQUEMA,))]
        self.cliente.transaccion(pasos)
        self.revision = revision + 1
        self._vigente = False

    def copia(self, ruta):
        """Snapshot completo, incluido historial; sustituye la copia tras validarla."""
        if self.ficheros:
            raise ValueError('Con el núcleo en R2 el volcado de Turso no lo incluye: '
                             f'copiar los objetos de {nucleo_r2.PREFIJO} del manifiesto')
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
