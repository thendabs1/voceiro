"""Prepara una copia local conciliada; nunca escribe en Turso ni publica."""
import argparse
from copy import deepcopy
import json
from pathlib import Path

from . import atletismo_coincidencias as coincidencias, nucleo


def contiene(valor, objetivos):
    if isinstance(valor, dict):
        return valor in objetivos or any(contiene(v, objetivos) for v in valor.values())
    return isinstance(valor, list) and any(contiene(v, objetivos) for v in valor)


def conciliar(anterior, revisiones=None):
    """Solo principales sin sesiones, resultados ni políticas afectadas.

    Conserva documentos y observaciones byte a byte, grupos de cada fuente,
    pertenencias, ID elegido y todos los conflictos. Cada destino absorbido
    queda documentado en la entidad conservada. Cualquier dependencia fuera
    de este alcance exige otra revisión; no se intenta una migración genérica.
    """
    nucleo.validar(anterior)
    n, informe = deepcopy(anterior), []
    for revision in coincidencias.revisiones_identidad() if revisiones is None else revisiones:
        claves = {(f, str(i)) for f, i in revision['referencias'].items()}
        refs = [r for r in n['referencias'].values()
                if r['tipo_externo'] == 'competicion' and r['contexto'] == {}
                and (r['proveedor'], r['id_externo']) in claves]
        if len(refs) != len(claves):
            informe.append({'revision': revision['id'], 'estado': 'faltan referencias'})
            continue
        conservar = next(r['destino'] for r in refs if r['proveedor'] == revision['conservar'])
        objetivos = [r['destino'] for r in refs]
        absorbidos = [dict(t) for t in {nucleo.clave(o): o for o in objetivos if o != conservar}.values()]
        if not absorbidos:
            informe.append({'revision': revision['id'], 'estado': 'ya conciliada'})
            continue
        todas = [r for r in n['referencias'].values() if r['destino'] in objetivos]
        if {r['id'] for r in todas} != {r['id'] for r in refs}:
            raise ValueError('Conciliación con otras referencias no revisadas: ' + revision['id'])
        if any(o['tipo'] != 'evento' or n['entidades'][nucleo.clave(o)]['clase'] != 'encuentro'
               for o in objetivos):
            raise ValueError('Conciliación limitada a citas principales de atletismo')
        for o in n['observaciones'].values():
            if n['referencias'][o['referencia']]['id'] in {r['id'] for r in refs}:
                if (o['bloques'].get('agenda') or {}).get('rol') != 'principal':
                    raise ValueError('Conciliación de un evento sin papel principal')
            if contiene(o['bloques'], objetivos):
                raise ValueError('Conciliación con sesiones u observaciones dependientes')
        for coleccion in ('participaciones', 'resultados', 'clasificaciones', 'politicas'):
            if any(contiene(d, objetivos) for d in n[coleccion].values()):
                raise ValueError('Conciliación con dependencias en ' + coleccion)
        for r in n['relaciones'].values():
            if contiene(r, objetivos) and not (r['origen'] in objetivos
                    and r['tipo'] == 'pertenece_a' and r['ambito'] is None):
                raise ValueError('Conciliación con una relación fuera del alcance')

        elegida = n['entidades'][nucleo.clave(conservar)]
        for d in absorbidos:
            entidad = n['entidades'].pop(nucleo.clave(d))
            elegida['evidencias'] = sorted(set(elegida['evidencias']) | set(entidad['evidencias']))
            for tema in entidad['temas']:
                if tema not in elegida['temas']:
                    elegida['temas'].append(tema)
            for idioma, nombre in entidad['nombres'].items():
                elegida['nombres'].setdefault(idioma, nombre)
        elegida.setdefault('conciliaciones', []).append({
            'revision': deepcopy(revision), 'anteriores': absorbidos})
        for r in refs:
            r['destino'] = deepcopy(conservar)
        for i, r in list(n['relaciones'].items()):
            if r['origen'] not in absorbidos:
                continue
            n['relaciones'].pop(i)
            r['origen'] = deepcopy(conservar)
            r['id'] = nucleo.identificador('relacion', r['tipo'], r['origen'], r['destino'], r['ambito'])
            if r['id'] in n['relaciones']:
                previa = n['relaciones'][r['id']]
                if previa['suspendida'] != r['suspendida']:
                    raise ValueError('Relaciones con estados contradictorios')
                previa['evidencias'] = sorted(set(previa['evidencias']) | set(r['evidencias']))
            else:
                n['relaciones'][r['id']] = r
        n['selecciones'] = {k: s for k, s in n['selecciones'].items() if s['objetivo'] not in absorbidos}
        informe.append({'revision': revision['id'], 'estado': 'conciliada',
                        'conservada': conservar, 'absorbidas': absorbidos})
    nucleo.recalcular_selecciones(n)
    nucleo.validar(n)
    return n, informe


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--nucleo', required=True, help='Snapshot v2 local')
    ap.add_argument('--salida', required=True, help='Otra ruta para la copia conciliada')
    ap.add_argument('--informe', required=True)
    args = ap.parse_args(argv)
    rutas = [Path(p).resolve() for p in (args.nucleo, args.salida, args.informe)]
    if len(set(rutas)) != 3:
        ap.error('Entrada, salida e informe deben ser archivos distintos')
    n, informe = conciliar(json.loads(rutas[0].read_text(encoding='utf-8')))
    for ruta, datos in ((rutas[1], n), (rutas[2], informe)):
        ruta.write_text(json.dumps(datos, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(informe, ensure_ascii=False))


if __name__ == '__main__':
    main()
