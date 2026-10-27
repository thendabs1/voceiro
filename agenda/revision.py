"""Informe local de clasificación y territorio para todas las fuentes guardadas.

Lee una exportación, sin descargar, publicar ni modificar el núcleo. Una referencia
pendiente sigue siendo importable; el informe permite decidir qué revisar después.
"""

import argparse
from collections import Counter
import json

from . import nucleo
from .publicacion import proyectar


def revisar(n, fuentes=None, limites_municipales=None):
    p = proyectar(n, fuentes, limites_municipales=limites_municipales)
    entidades = p['entidades']
    lugares = {}
    for r in p['relaciones']:
        if r['tipo'] in ('se_celebra_en', 'ubicado_en'):
            lugares.setdefault(nucleo.clave(r['origen']), set()).add(nucleo.clave(r['destino']))

    def estado_evento(evento):
        pendientes, vistos, estados = list(lugares.get(nucleo.clave(evento), ())), set(), []
        while pendientes:
            k = pendientes.pop()
            if k in vistos:
                continue
            vistos.add(k)
            e = entidades[k]
            estado = e.get('territorio_estado') or e.get('ubicacion_estado')
            if estado:
                estados.append(estado)
            elif not lugares.get(k):
                estados.append('pendiente')
            pendientes.extend(lugares.get(k, ()))
        if 'conflicto' in estados:
            return 'conflicto'
        if evento['territorios']:
            return 'parcial' if 'pendiente' in estados else 'resuelto'
        return 'pendiente'

    fuentes_revisadas = {}
    for fuente in p['fuentes']:
        eventos = [e for e in p['eventos'] if fuente in {f['fuente'] for f in e['fuentes']}]
        fuentes_revisadas[fuente] = {'eventos': len(eventos),
            'temas': {'clasificados': sum(bool(e['temas']) for e in eventos),
                      'pendientes': sum(not e['temas'] for e in eventos)},
            'ubicacion': dict(sorted(Counter(estado_evento(e) for e in eventos).items()))}
    pendientes = []
    for k, e in sorted(entidades.items()):
        for prefijo in ('territorio', 'ubicacion'):
            estado = e.get(prefijo + '_estado')
            if estado and estado != 'resuelto':
                pendientes.append({'objetivo': k, 'operacion': prefijo, 'estado': estado,
                    'motivo': e[prefijo + '_motivo'], 'resoluciones': e[prefijo + '_resoluciones']})
    return {'version': 1, 'territorios_catalogo': p['territorios_catalogo'],
            'fuentes': fuentes_revisadas, 'pendientes': pendientes,
            'alcance': 'Estado de los registros guardados; no mide cobertura completa del proveedor ni calidad temática.'}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    origen = ap.add_mutually_exclusive_group(required=True)
    origen.add_argument('--entrada', help='Exportación del núcleo v2 o calendario que lo contiene')
    origen.add_argument('--turso', action='store_true', help='Revisar directamente el estado guardado, sin escribir')
    ap.add_argument('--fuentes', help='Selección opcional separada por comas')
    args = ap.parse_args(argv)
    if args.turso:
        from .turso import Almacen
        datos = Almacen().cargar()
        if datos is None or 'nucleo' not in datos:
            raise ValueError('Preparar el núcleo de Turso antes de revisar')
    else:
        with open(args.entrada, encoding='utf-8') as archivo:
            datos = json.load(archivo)
    fuentes = args.fuentes.split(',') if args.fuentes is not None else None
    from shared.territorios.limites import cargar as cargar_limites
    print(json.dumps(revisar(datos.get('nucleo', datos), fuentes, cargar_limites()), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
