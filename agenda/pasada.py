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


def _cli(nombre):
    if nombre == 'calendario':
        from calendario import main
    elif nombre == 'operacion':
        from .operacion import main
    elif nombre == 'publicacion':
        from .publicacion import main
    else:
        raise ValueError(f'Paso desconocido: {nombre}')
    return main


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--paso', dest='pasos', action='append', default=[], type=lambda s: (False, s),
                    help='CLI y argumentos, p. ej. "calendario --turso --preparar-nucleo"; su fallo detiene')
    ap.add_argument('--paso-tolerado', dest='pasos', action='append', type=lambda s: (True, s),
                    help='Como --paso, pero su fallo se señala al final sin detener la pasada')
    args = ap.parse_args(argv)
    if not args.pasos:
        ap.error('Indicar al menos un --paso')
    pasos = [(tolerado, *shlex.split(texto)) for tolerado, texto in args.pasos]
    for _, nombre, *_ in pasos:
        _cli(nombre)  # Un nombre mal escrito falla antes de consultar proveedores.
    from .turso import compartido
    fallidos = []
    with compartido() as remoto:
        for tolerado, nombre, *resto in pasos:
            texto = shlex.join([nombre, *resto])
            print(f'::group::{texto}', flush=True)
            try:
                _cli(nombre)(resto)
            except (ErrorTurso, *_conflictos()):
                raise
            except (Exception, SystemExit) as error:
                if isinstance(error, SystemExit) and not error.code:
                    continue
                if not tolerado:
                    raise
                print(f'::error::{texto}: {error}', flush=True)
                fallidos.append(texto)
            finally:
                print('::endgroup::', flush=True)
        print(f'[agenda] Pasada: {remoto.cliente.leidas} filas leídas, '
              f'{remoto.cliente.escritas} escritas en Turso')
    if fallidos:
        print('[agenda] Pasos fallidos (lo guardado antes se conserva): ' + '; '.join(fallidos))
        sys.exit(1)


def _conflictos():
    from .control import ConflictoControl
    from .turso import ConflictoCalendario
    return ConflictoCalendario, ConflictoControl


if __name__ == '__main__':
    main()
