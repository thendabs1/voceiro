"""Proyección explícita del piloto al núcleo v2, sin cambiar sus registros."""

from copy import deepcopy

from . import nucleo, tiempos


def ampliar(calendario):
    """Añade/actualiza el núcleo; no simula una recogida ni migra sus auditorías."""
    if calendario.get('version') != 1:
        raise ValueError('Versión de calendario del piloto incompatible')
    salida = deepcopy(calendario)
    c = nucleo.Constructor(salida.get('nucleo'))
    c.n['fuentes'].update(deepcopy(calendario['fuentes']))
    if (calendario.get('clasificacion')
            and calendario['clasificacion']['catalogo']['version'] >= c.n['catalogo']['version']):
        c.n['catalogo'] = deepcopy(calendario['clasificacion']['catalogo'])
    registros = calendario['registros']
    por_ref = {}
    fichas = {}
    for r in registros.values():
        for rel in r['datos'].get('relaciones', []):
            if rel['tipo'] == 'celebracion_de':
                fichas.setdefault(r['evento'], set()).add(rel['destino'])
    for rel in c.n['relaciones'].values():
        if rel['tipo'] == 'celebracion_de' and rel['origen']['id'] in fichas:
            rel['suspendida'] = len(fichas[rel['origen']['id']]) > 1
    # No se reconstruyen IDs con título/fecha ni se unen fichas traducidas.
    for ref, r in sorted(registros.items()):
        d = r['datos']
        doc = c.documento(r['fuente'], {'original': r['original'], 'normalizado_piloto': d,
            'regiones': r.get('regiones', {}), 'grupos': r.get('grupos', {})},
            r.get('url'), 'fragmento_del_piloto')
        programacion = {'cuando': tiempos.desde_legado(d['cuando']),
            'programacion': d['estado'] if d['estado'] in ('programado', 'aplazado', 'cancelado')
                            else 'desconocido', 'ejecucion': 'desconocido',
            'estado_original': d['estado']}
        destino, evidencia = c.entidad(r['fuente'], 'evento_piloto', r['id_externo'], {},
            'evento', 'desconocida', d['titulos'], doc, '/normalizado_piloto', r['ultima_recogida'],
            bloques={'programacion': programacion, 'lugar': d.get('lugar'),
                     'relaciones_piloto_sin_conciliar': d.get('relaciones', [])
                         if len(fichas.get(r['evento'], [])) > 1 else []},
            identidad=r['evento'], referencia=ref, historico=True)
        por_ref[ref] = evidencia
        lugar = d.get('lugar') or {}
        recinto = None
        if lugar.get('id_externo') not in (None, '') and lugar.get('nombre'):
            recinto, _ = c.entidad(r['fuente'], 'recinto_piloto', str(lugar['id_externo']), {},
                'lugar', 'recinto', {r.get('idioma') or 'und': lugar['nombre']}, doc,
                '/normalizado_piloto/lugar', r['ultima_recogida'], bloques={'literal': lugar}, historico=True)
            c.relacion('se_celebra_en', destino, recinto, evidencia)
        for alias in r.get('equivalentes', []):
            ar = r['fuente'] + ':' + alias
            if ar not in registros:
                c.n['referencias'][ar] = {'id': ar, 'proveedor': r['fuente'],
                    'tipo_externo': 'evento_piloto', 'contexto': {}, 'id_externo': alias,
                    'destino': destino}
        for i, region in r.get('regiones', {}).items():
            territorio, _ = c.entidad(r['fuente'], 'territorio_piloto', i, {}, 'territorio',
                region['tipo'], region['nombres'], doc, '/regiones/' + i, r['ultima_recogida'],
                bloques={'identificadores': region.get('identificadores', {})}, identidad=i, historico=True)
            c.relacion('se_celebra_en', destino, territorio, evidencia)
            if recinto and region['tipo'] == 'municipio':
                c.relacion('ubicado_en', recinto, territorio, evidencia)
        for i, grupo in r.get('grupos', {}).items():
            tipo_g = grupo['tipo']
            if tipo_g == 'actividad':
                continue  # Es vocabulario del proveedor, no una obra.
            tipo = 'actividad' if tipo_g == 'ficha' else 'agrupacion'
            clase = tipo_g if tipo == 'actividad' or tipo_g in nucleo.CLASES['agrupacion'] else 'coleccion'
            g, _ = c.entidad(r['fuente'], 'grupo_piloto', i, {}, tipo, clase, grupo['nombres'],
                doc, '/grupos/' + i, r['ultima_recogida'], identidad=i, historico=True)
            if tipo_g == 'ficha':
                if len(fichas.get(r['evento'], [])) <= 1 and any(
                       rel['tipo'] == 'celebracion_de' and rel['destino'] == i
                       for rel in d.get('relaciones', [])):
                    c.relacion('celebracion_de', destino, g, evidencia)
            elif i in d.get('grupos', []):
                c.relacion('pertenece_a', destino, g, evidencia)
    for ref, i in calendario['vinculos'].items():
        if ref not in c.n['referencias']:
            fuentes = [f for f in calendario['fuentes'] if ref.startswith(f + ':')]
            if len(fuentes) != 1:
                raise ValueError('Alias del piloto sin fuente inequívoca')
            fuente = fuentes[0]
            c.n['referencias'][ref] = {'id': ref, 'proveedor': fuente, 'tipo_externo': 'evento_piloto',
                'contexto': {}, 'id_externo': ref[len(fuente) + 1:], 'destino': nucleo.objetivo('evento', i)}
    # Solo evidencia vigente: las asignaciones anteriores no se reutilizan como hechos nuevos.
    for e in c.n['entidades'].values():
        e['temas'] = [t for t in e['temas'] if not t['correspondencia'].startswith('piloto:')]
    for i, evidencias in calendario.get('clasificacion', {}).get('asignaciones', {}).items():
        for e in evidencias:
            c.tema(nucleo.objetivo('evento', i), e['tema'], por_ref[e['registro']],
                   'piloto:' + e['correspondencia'])
    salida['nucleo'] = c.terminar()
    return salida
