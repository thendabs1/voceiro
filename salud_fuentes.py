#!/usr/bin/env python3
"""
salud_fuentes.py — Prueba las fuentes del catálogo una a una, con la misma
lógica que el recolector, y saca una tabla con su estado.

Sirve para validar fuentes nuevas desde la IP de GitHub Actions antes de
darlas por buenas (workflow test_feeds.yml). Para el día a día, la columna
`intentos` de las tablas `medios` y `runs` de Turso ya dice qué falla.

Uso:
  python salud_fuentes.py                      # rss, sitemap y wp de todos
  python salud_fuentes.py --tipos rss,sitemap,scrape,gn
  python salud_fuentes.py --dominios reuters.com,apnews.com

Si existe $GITHUB_STEP_SUMMARY, la tabla se escribe también ahí.
"""

import argparse
import concurrent.futures
import contextlib
import io
import os
import json
import sys
from pathlib import Path
from datetime import datetime

import recolector as R
from medios import todos_los_medios, fuentes_de

# Más de esto sin publicar → la fuente se marca como rancia
HORAS_RANCIA = 48


def probar(medio, fuente, muestras=0):
    try:
        items, estado = R._probar_fuente(medio, fuente)
    except Exception as e:
        items, estado = None, type(e).__name__
    fila = {
        'medio': medio['n'], 'dominio': medio['d'], 'configuracion': fuente,
        'fuente': R.ETIQUETA_FUENTE.get(fuente[0], fuente[0])
                  + (' (relay)' if 'relay' in fuente[2:] else ''),
        'estado': estado, 'n': 0, 'con_fecha': 0, 'edad_h': None,
        'muestras': (items or [])[:muestras],
    }
    if not items:
        return fila
    fechas = [R._parse_iso_flexible(it.get('fecha_pub')) for it in items]
    fechas = [f for f in fechas if f]
    fila['n'] = len(items)
    fila['con_fecha'] = len(fechas)
    if fechas:
        ahora = datetime.now(R.TZ_MADRID)
        fila['edad_h'] = round((ahora - max(fechas)).total_seconds() / 3600, 1)
        if fila['edad_h'] > HORAS_RANCIA:
            fila['estado'] = 'rancia'
    if fila['estado'] == 'ok' and len(items) < R.MIN_ITEMS_FUENTE:
        fila['estado'] = 'pocos'
    return fila


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tipos', default='rss,sitemap,wp',
                    help='tipos de fuente a probar (coma)')
    ap.add_argument('--dominios', default='',
                    help='limitar a estos dominios (coma)')
    ap.add_argument('--json', metavar='ARCHIVO', help='Guardar resultados completos')
    ap.add_argument('--muestras', type=int, choices=range(0, 6), default=0,
                    help='Titulares de muestra por fuente (0 a 5)')
    ap.add_argument('--exigir-ok', action='store_true',
                    help='Salir con error si alguna fuente tiene problemas')
    args = ap.parse_args()
    tipos = {t.strip() for t in args.tipos.split(',') if t.strip()}
    if not tipos or tipos - R.ETIQUETA_FUENTE.keys():
        ap.error('Tipos válidos: rss,sitemap,wp,scrape,gn')
    dominios = {d.strip().lower().removeprefix('www.')
                for d in args.dominios.split(',') if d.strip()}
    conocidos = {m['d'] for m in todos_los_medios()}
    if dominios - conocidos:
        ap.error('Dominios fuera del catálogo: ' + ', '.join(sorted(dominios - conocidos))
                 + '. Usa diagnosticar_dominio.py para dominios nuevos.')

    tareas = [
        (m, f) for m in todos_los_medios()
        if not dominios or m['d'] in dominios
        for f in fuentes_de(m) if f[0] in tipos
    ]
    if not tareas:
        ap.error('No hay fuentes con los filtros indicados')
    print(f"Probando {len(tareas)} fuentes ({', '.join(sorted(tipos))})…")

    # Los print de las fuentes ensuciarían la tabla. redirect_stdout es
    # global al proceso: se aplica una sola vez alrededor de todo el pool.
    with contextlib.redirect_stdout(io.StringIO()):
        with concurrent.futures.ThreadPoolExecutor(
                max_workers=R.MAX_WORKERS) as ex:
            filas = list(ex.map(lambda t: probar(*t, muestras=args.muestras), tareas))

    orden = {'ok': 2, 'pocos': 1, 'rancia': 1}
    filas.sort(key=lambda f: (orden.get(f['estado'], 0), f['medio']))

    lineas = ['| Medio | Fuente | Estado | Titulares | Con fecha | Último (h) |',
              '|---|---|---|---:|---:|---:|']
    for f in filas:
        edad = '' if f['edad_h'] is None else f['edad_h']
        lineas.append(f"| {f['medio']} | {f['fuente']} | {f['estado']} "
                      f"| {f['n']} | {f['con_fecha']} | {edad} |")
    malas = sum(1 for f in filas if f['estado'] != 'ok')
    resumen = f"**{len(filas) - malas}/{len(filas)} fuentes OK** · {malas} con problemas"
    tabla = '\n'.join([resumen, ''] + lineas)
    print(tabla)

    if args.json:
        Path(args.json).write_text(json.dumps(filas, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    destino = os.environ.get('GITHUB_STEP_SUMMARY')
    if destino:
        with open(destino, 'a', encoding='utf-8') as fh:
            fh.write(tabla + '\n')
    return 1 if args.exigir_ok and malas else 0


if __name__ == '__main__':
    sys.exit(main())
