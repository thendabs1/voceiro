"""Piloto de calendario común: python calendario.py --help. Sin publicación remota."""

import argparse
from datetime import date, datetime, timedelta
import json
from pathlib import Path
import tempfile
from zoneinfo import ZoneInfo

from agenda.cultura_galicia import FUENTES, leer_pagina, normalizar, recoger
from agenda import almacen, vidmar_f1
from agenda.modelo import integrar


def guardar(ruta, calendario):
    """Sustituye la última respuesta buena solo cuando está completa y validada."""
    ruta = Path(ruta)
    ruta.parent.mkdir(parents=True, exist_ok=True)
    temporal = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8',
                                         dir=ruta.parent, delete=False) as archivo:
            temporal = Path(archivo.name)
            json.dump(calendario, archivo, ensure_ascii=False, indent=2)
            archivo.write('\n')
        temporal.replace(ruta)
    finally:
        if temporal and temporal.exists():
            temporal.unlink()


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--salida', help='Exportación JSON de calendario para revisar')
    ap.add_argument('--db', help='Base SQLite dedicada: conserva estado e historial entre pasadas')
    ap.add_argument('--exportar', action='store_true', help='Exportar --db a --salida sin recoger fuentes')
    ap.add_argument('--anterior', help='Calendario anterior: conserva IDs e historial de recogida')
    ap.add_argument('--entrada', action='append', help='Página JSON guardada de Galicia (repetible, sin red)')
    ap.add_argument('--entrada-ics', action='append', help='ICS de Vidmar guardado (repetible, sin red)')
    ap.add_argument('--fuente', action='append', choices=('cultura-galicia', 'vidmar-f1'),
                    help='Fuente a recoger por red (repetible, Galicia por defecto)')
    ap.add_argument('--idioma', action='append', choices=('gl', 'es'), help='Idioma a recoger (repetible, gl por defecto)')
    ap.add_argument('--inicio', help='Primer día solicitado (hoy por defecto)')
    ap.add_argument('--fin', help='Último día solicitado, incluido (inicio + 30 días por defecto)')
    args = ap.parse_args(argv)
    if not args.salida and not args.db:
        ap.error('Se necesita --salida o --db')
    if args.db and args.anterior:
        ap.error('--db sustituye a --anterior como estado persistente')
    if args.db and args.salida and Path(args.db).resolve() == Path(args.salida).resolve():
        ap.error('La base y la exportación deben ser archivos distintos')
    if args.fuente and (args.entrada or args.entrada_ics):
        ap.error('Usa --fuente para red o --entrada/--entrada-ics para archivos locales')
    if args.exportar:
        if not args.db or not args.salida or any((args.anterior, args.entrada, args.entrada_ics,
                                                  args.fuente, args.inicio, args.fin, args.idioma)):
            ap.error('--exportar requiere solo --db y --salida')
        with almacen.abrir(args.db) as db:
            calendario = almacen.cargar(db)
            if calendario is None:
                raise ValueError('La base aún no contiene un calendario')
        guardar(args.salida, calendario)
        return
    ahora = datetime.now(ZoneInfo('Europe/Madrid')).isoformat(timespec='seconds')
    idiomas = list(dict.fromkeys(args.idioma or ['gl']))
    anterior = json.loads(Path(args.anterior).read_text(encoding='utf-8')) if args.anterior else None
    registros, consultas = [], []
    fuentes = {}
    if args.entrada:
        fuentes.update(FUENTES)
        if len(idiomas) != 1:
            ap.error('--entrada requiere un solo idioma de respaldo')
        for ruta in args.entrada:
            filas, total = leer_pagina(json.loads(Path(ruta).read_text(encoding='utf-8')))
            registros.extend(normalizar(fila, idiomas[0]) for fila in filas)
            consultas.append({'fuente': 'cultura-galicia', 'archivo': Path(ruta).name,
                              'registros': len(filas), 'total_declarado': total,
                              'alcance': 'muestra_local'})
    if args.entrada_ics:
        fuentes.update(vidmar_f1.FUENTES)
        for ruta in args.entrada_ics:
            filas = vidmar_f1.leer(Path(ruta).read_text(encoding='utf-8'))
            registros.extend(filas)
            consultas.append({'fuente': vidmar_f1.FUENTE, 'archivo': Path(ruta).name,
                              'registros': len(filas), 'alcance': 'muestra_local'})
    if not args.entrada and not args.entrada_ics:
        inicio = date.fromisoformat(args.inicio) if args.inicio else datetime.fromisoformat(ahora).date()
        fin = date.fromisoformat(args.fin) if args.fin else inicio + timedelta(days=30)
        for fuente in dict.fromkeys(args.fuente or ['cultura-galicia']):
            if fuente == 'cultura-galicia':
                fuentes.update(FUENTES)
                for idioma in idiomas:
                    filas = recoger(inicio.isoformat(), fin.isoformat(), idioma)
                    registros.extend(filas)
                    consultas.append({'fuente': fuente, 'idioma': idioma,
                                      'inicio': inicio.isoformat(), 'fin': fin.isoformat(),
                                      'registros': len(filas), 'alcance': 'intervalo_solicitado'})
            else:
                fuentes.update(vidmar_f1.FUENTES)
                filas = vidmar_f1.recoger()
                registros.extend(filas)
                consultas.append({'fuente': fuente, 'url': vidmar_f1.URL,
                                  'registros': len(filas), 'alcance': 'calendario_completo'})
    # Toda la red y el parseo terminan antes de abrir la transacción de escritura.
    if args.db:
        with almacen.abrir(args.db) as db:
            calendario = integrar(almacen.cargar(db), registros, fuentes, ahora, consultas)
            almacen.guardar(db, calendario)
    else:
        calendario = integrar(anterior, registros, fuentes, ahora, consultas)
    if args.salida:
        guardar(args.salida, calendario)
    print(f"[agenda] {len(calendario['eventos'])} eventos, "
          f"{len(calendario['registros'])} registros → {args.db or args.salida}")


if __name__ == '__main__':
    main()
