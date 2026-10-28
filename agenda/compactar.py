"""Núcleo sin historial: lo vigente y lo que una decisión vigente necesita.

Las agendas son públicas: una versión sustituida no se archiva; si hace falta
se vuelve a pedir a la fuente. Referencias y entidades (identidad) se conservan
siempre; observaciones, documentos, relaciones y participaciones sustituidos no.
"""

from copy import deepcopy

from . import nucleo

# Bloques que recalcular_selecciones convierte en objetivos de selección.
BLOQUES_SELECCION = ('programacion', 'lugar', 'resultado', 'clasificacion')


def compactar(n):
    """Copia validada sin versiones sustituidas ni documentos que solo las acreditaban.

    Conserva las observaciones vigentes (empates incluidos) y las que fija una
    selección, un resultado o una clasificación. Para cada selección guardada se
    conserva además una observación con su bloque: así recalcular_selecciones ve
    los mismos objetivos y la memoria de conflicto no cambia.
    """
    activas = nucleo.ultimas(n)
    observaciones = n['observaciones']
    conservar = set(activas)
    conservar.update(s['seleccion'].get('observacion') for s in n['selecciones'].values())
    conservar.update(r['observacion'] for r in n['resultados'].values())
    conservar.update(c['observacion'] for c in n['clasificaciones'].values())
    conservar &= observaciones.keys()
    cubiertos, ultima = set(), {}
    for i, o in observaciones.items():
        destino = nucleo.clave(n['referencias'][o['referencia']]['destino'])
        for bloque in BLOQUES_SELECCION:
            if bloque not in o['bloques']:
                continue
            if i in conservar:
                cubiertos.add((destino, bloque))
            previa = ultima.get((destino, bloque))
            if previa is None or (o['ultima_observacion'], i) > (observaciones[previa]['ultima_observacion'], previa):
                ultima[(destino, bloque)] = i
    for s in n['selecciones'].values():
        k = (nucleo.clave(s['objetivo']), s['bloque'])
        if k not in cubiertos and k in ultima:
            conservar.add(ultima[k])
    documentos = {observaciones[i]['documento'] for i in conservar}
    documentos.update(d['respuesta_completa']['documento'] for d in n['fuentes'].values()
                      if d.get('respuesta_completa'))

    def recortar(dato):
        dato = deepcopy(dato)
        dato['evidencias'] = [i for i in dato['evidencias'] if i in conservar]
        return dato

    salida = {k: deepcopy(v) for k, v in n.items() if k not in nucleo.COLECCIONES}
    salida['observaciones'] = {i: deepcopy(o) for i, o in observaciones.items() if i in conservar}
    salida['documentos'] = {i: deepcopy(d) for i, d in n['documentos'].items() if i in documentos}
    salida['entidades'] = {}
    for k, e in n['entidades'].items():
        e = recortar(e)
        e['temas'] = [t for t in map(recortar, e['temas']) if t['evidencias']]
        salida['entidades'][k] = e
    # Sin evidencia conservada ya no eran vigentes: no se arrastran.
    for coleccion in ('relaciones', 'participaciones'):
        salida[coleccion] = {i: d for i, d in ((i, recortar(d)) for i, d in n[coleccion].items())
                             if d['evidencias']}
    for coleccion in ('referencias', 'resultados', 'clasificaciones', 'politicas', 'selecciones'):
        salida[coleccion] = deepcopy(n[coleccion])
    return nucleo.validar(salida)
