"""Piloto de calendario común: python calendario.py --help. Sin publicación remota."""

import argparse
from datetime import date, datetime, timedelta
import json
from pathlib import Path
import tempfile
from zoneinfo import ZoneInfo

from agenda.cultura_galicia import FUENTES, leer_pagina, normalizar, recoger
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
    ap.add_argument('--salida', required=True, help='JSON de calendario para revisar')
    ap.add_argument('--anterior', help='Calendario anterior: conserva IDs e historial de recogida')
    ap.add_argument('--entrada', action='append', help='Página JSON guardada de Galicia (repetible, sin red)')
    ap.add_argument('--idioma', action='append', choices=('gl', 'es'), help='Idioma a recoger (repetible, gl por defecto)')
    ap.add_argument('--inicio', help='Primer día solicitado (hoy por defecto)')
    ap.add_argument('--fin', help='Último día solicitado, incluido (inicio + 30 días por defecto)')
    args = ap.parse_args(argv)
    ahora = datetime.now(ZoneInfo('Europe/Madrid')).isoformat(timespec='seconds')
    idiomas = list(dict.fromkeys(args.idioma or ['gl']))
    anterior = json.loads(Path(args.anterior).read_text(encoding='utf-8')) if args.anterior else None
    registros, consultas = [], []
    if args.entrada:
        if len(idiomas) != 1:
            ap.error('--entrada requiere un solo idioma de respaldo')
        for ruta in args.entrada:
            filas, total = leer_pagina(json.loads(Path(ruta).read_text(encoding='utf-8')))
            registros.extend(normalizar(fila, idiomas[0]) for fila in filas)
            consultas.append({'fuente': 'cultura-galicia', 'archivo': Path(ruta).name,
                              'registros': len(filas), 'total_declarado': total,
                              'alcance': 'muestra_local'})
    else:
        inicio = date.fromisoformat(args.inicio) if args.inicio else datetime.fromisoformat(ahora).date()
        fin = date.fromisoformat(args.fin) if args.fin else inicio + timedelta(days=30)
        for idioma in idiomas:
            filas = recoger(inicio.isoformat(), fin.isoformat(), idioma)
            registros.extend(filas)
            consultas.append({'fuente': 'cultura-galicia', 'idioma': idioma,
                              'inicio': inicio.isoformat(), 'fin': fin.isoformat(),
                              'registros': len(filas), 'alcance': 'intervalo_solicitado'})
    calendario = integrar(anterior, registros, FUENTES, ahora, consultas)
    guardar(args.salida, calendario)
    print(f"[agenda] {len(calendario['eventos'])} eventos, "
          f"{len(calendario['registros'])} registros → {args.salida}")


if __name__ == '__main__':
    main()
