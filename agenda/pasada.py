"""Pasada del workflow en un proceso: una carga del núcleo de Turso para todos los pasos.

Cada paso es una CLI de siempre (`calendario`, `operacion`, `publicacion`) con sus
argumentos; comparten un Almacen (turso.compartido) y cada paso guarda al terminar.
Un paso tolerado que falla no deshace lo guardado ni detiene la pasada: se señala
al final con salida 1. Un conflicto de revisión o un error de Turso la detienen.
"""

import argparse
import shlex
import sys

from turso_http import ErrorTurso
from . import cadencias
from .control import Repositorio
from .operacion import ahora_utc


def _cli(nombre):
    if nombre == 'calendario':
        from calendario import main
    elif nombre == 'operacion':
        from .operacion import main
    elif nombre == 'publicacion':
        from .publicacion import main
    elif nombre == 'atletismo-revision':
        from .atletismo_revision import main
    elif nombre == 'atletismo-recogida':
        from .atletismo_recogida import main
    else:
        raise ValueError(f'Paso desconocido: {nombre}')
    return main


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--cadencia', action='store_true', help='Aplicar los relojes del cron')
    ap.add_argument('--paso', dest='pasos', action='append', default=[], type=lambda s: ('paso', s),
                    help='CLI y argumentos, p. ej. "calendario --turso --preparar-nucleo"; su fallo detiene')
    ap.add_argument('--paso-tolerado', dest='pasos', action='append', type=lambda s: ('tolerado', s),
                    help='Como --paso, pero su fallo se señala al final sin detener la pasada')
    ap.add_argument('--paso-reloj', dest='pasos', action='append', type=lambda s: ('reloj', s),
                    help='GRUPO::CLI y argumentos; paso tolerado con reloj propio')
    ap.add_argument('--paso-final', dest='pasos', action='append', type=lambda s: ('final', s),
                    help='Como --paso; con cadencia, solo si hubo escrituras o toca publicación')
    ap.add_argument('--paso-final-tolerado', dest='pasos', action='append', type=lambda s: ('final-tolerado', s),
                    help='Como --paso-final, pero tolerado y sin anotar publicación')
    args = ap.parse_args(argv)
    if not args.pasos:
        ap.error('Indicar al menos un --paso')
    pasos = []
    for tipo, texto in args.pasos:
        grupo = None
        if tipo == 'reloj':
            grupo, separador, texto = texto.partition('::')
            if not separador or grupo not in cadencias.RELOJES:
                raise ValueError(f'Grupo de reloj desconocido: {grupo}')
        nombre, *resto = shlex.split(texto)
        _cli(nombre)  # Un nombre mal escrito falla antes de consultar proveedores.
        pasos.append((tipo, grupo, nombre, resto))
    from .turso import compartido
    fallidos = []
    with compartido() as remoto:
        repo = Repositorio(remoto=remoto)
        escritas_inicio = remoto.cliente.escritas
        for tipo, grupo, nombre, resto in pasos:
            texto = shlex.join([nombre, *resto])
            if args.cadencia:
                if tipo == 'reloj' and not repo.reloj_vencido(grupo, ahora_utc()):
                    print(f'[agenda] Omitido {texto}: reloj {grupo} no vencido', flush=True)
                    continue
                if (tipo in ('final', 'final-tolerado') and remoto.cliente.escritas == escritas_inicio
                        and not repo.reloj_vencido('publicacion', ahora_utc())):
                    print(f'[agenda] Omitido {texto}: sin escrituras y reloj publicacion no vencido', flush=True)
                    continue
            tolerado = tipo in ('tolerado', 'reloj', 'final-tolerado')
            print(f'::group::{texto}', flush=True)
            try:
                try:
                    _cli(nombre)(resto)
                except SystemExit as error:
                    if error.code:
                        raise
                if args.cadencia and tipo in ('reloj', 'final'):
                    repo.anotar_reloj(grupo if tipo == 'reloj' else 'publicacion', ahora_utc())
            except (ErrorTurso, *_conflictos()):
                raise
            except (Exception, SystemExit) as error:
                if not tolerado:
                    raise
                print(f'::error::{texto}: {error}', flush=True)
                fallidos.append(texto)
                if args.cadencia and tipo == 'reloj':
                    if isinstance(error, cadencias.GuardadoParcial):
                        repo.anotar_reloj(grupo, ahora_utc())
                    else:
                        # Anotar un fallo no es un cambio que publicar.
                        antes = remoto.cliente.escritas
                        repo.fallar_reloj(grupo, ahora_utc(), (getattr(error, 'headers', None) or {}).get('Retry-After'))
                        escritas_inicio += remoto.cliente.escritas - antes
            finally:
                print('::endgroup::', flush=True)
        print(f'[agenda] Pasada: {remoto.cliente.leidas} filas leídas, '
              f'{remoto.cliente.escritas} escritas en Turso')
        if remoto.ficheros:
            f = remoto.ficheros
            print(f'[agenda] R2: {f.leidos} ficheros leídos, {f.escritos} escritos, {f.bytes / 1e6:.2f} MB')
    if fallidos:
        print('[agenda] Pasos fallidos (lo guardado antes se conserva): ' + '; '.join(fallidos))
        sys.exit(1)


def _conflictos():
    from .control import ConflictoControl
    from .turso import ConflictoCalendario
    return ConflictoCalendario, ConflictoControl


if __name__ == '__main__':
    main()
