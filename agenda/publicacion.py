"""Proyección de lectura del núcleo, sin originales ni historial en el navegador.

Sin --fuentes se genera una revisión de todas las fuentes. La subida pública
exige una selección explícita: las condiciones pendientes no se habilitan al
añadir un adaptador. Un único objeto R2 se sustituye después de validar todo.
"""

import argparse
from copy import deepcopy
from datetime import datetime, timezone
import json
import os

from . import nucleo
from .tiempos import instante
from shared.territorios import cargar as cargar_territorios


def proyectar(n, fuentes=None, generado=None):
    nucleo.validar(n)
    permitidas = set(n['fuentes']) if fuentes is None else set(fuentes)
    if permitidas - n['fuentes'].keys():
        raise ValueError('Fuentes desconocidas: ' + ', '.join(sorted(permitidas - n['fuentes'].keys())))
    activas = nucleo.ultimas(n)
    observaciones = {i: o for i, o in n['observaciones'].items()
                     if n['referencias'][o['referencia']]['proveedor'] in permitidas}

    def vigente(dato):
        return nucleo.vigente(n, dato, activas & observaciones.keys())

    def procedencia(oid):
        o = observaciones[oid]
        r = n['referencias'][o['referencia']]
        return {'fuente': r['proveedor'], 'referencia': r['id'],
                'url': n['documentos'][o['documento']].get('url'),
                'observado': o['observado'], 'comprobado': o['ultima_observacion']}

    entidades = {}
    for k, e in n['entidades'].items():
        evidencias = [observaciones[i] for i in e['evidencias'] if i in observaciones]
        if not evidencias:
            continue
        nombres, codigos = {}, set()
        for o in sorted(evidencias, key=lambda o: (instante(o['ultima_observacion']), o['id'])):
            nombres.update(o['bloques']['nombres'])
            if o['id'] in activas and o['bloques'].get('codigo_consulta'):
                codigos.add(o['bloques']['codigo_consulta'])
        entidades[k] = {c: deepcopy(e[c]) for c in ('tipo', 'id', 'clase')}
        entidades[k].update(nombres=nombres, codigos=sorted(codigos),
            temas=sorted({t['tema'] for t in e['temas'] if vigente(t)}))
    # Correspondencia editorial del flujo ya integrado, no de los títulos.
    ref_f1 = next((r for r in n['referencias'].values()
        if r['proveedor'] == 'vidmar-f1' and r['tipo_externo'] == 'grupo_piloto'
        and r['id_externo'] == 'vidmar-f1:calendario'), None)
    if ref_f1 and nucleo.clave(ref_f1['destino']) in entidades:
        entidades[nucleo.clave(ref_f1['destino'])]['codigos'] = ['f1']

    relaciones = [{c: deepcopy(r[c]) for c in ('tipo', 'origen', 'destino', 'ambito')}
                  for r in n['relaciones'].values() if vigente(r)
                  and nucleo.clave(r['origen']) in entidades and nucleo.clave(r['destino']) in entidades
                  and (r['ambito'] is None or nucleo.clave(r['ambito']) in entidades)]
    padres = {}
    for r in relaciones:
        if r['tipo'] in ('pertenece_a', 'celebracion_de', 'es_parte_de', 'es_edicion_de'):
            padres.setdefault(nucleo.clave(r['origen']), set()).add(nucleo.clave(r['destino']))

    def ascendientes(k):
        vistos, pendientes = set(), [k]
        while pendientes:
            i = pendientes.pop()
            if i not in vistos:
                vistos.add(i)
                pendientes.extend(padres.get(i, ()))
        return sorted(vistos)

    selecciones = {(nucleo.clave(s['objetivo']), s['bloque']): s['seleccion']
                   for s in n['selecciones'].values()}

    def seleccion(k, bloque):
        s = selecciones.get((k, bloque))
        if s is None and bloque == 'identificadores':
            e = entidades[k]
            s = nucleo.seleccionar(n, nucleo.objetivo(e['tipo'], e['id']), bloque, activas,
                [i for i in n['entidades'][k]['evidencias'] if i in activas])
        if s is None:
            return None
        # Tampoco publicar un valor anterior que proceda de una fuente excluida.
        if (s.get('observacion') not in observaciones
                or s.get('observacion') not in activas and not s.get('conflicto')):
            return {'valor': None, 'conflicto': s.get('conflicto', False)}
        return {'valor': deepcopy(s['valor']), 'conflicto': s['conflicto'],
                'procedencia': procedencia(s['observacion'])}

    territorios = cargar_territorios()
    for k, e in entidades.items():
        if e['tipo'] != 'territorio':
            continue
        identificadores = seleccion(k, 'identificadores')
        valor = (identificadores or {}).get('valor') or {}
        comun = None
        if not (identificadores or {}).get('conflicto'):
            # Cada espacio de códigos tiene su cruce explícito. NORA queda pendiente.
            if valor.get('ine_cpro_cmun_dc'):
                comun = territorios.resolver('ine:municipio:dc', valor['ine_cpro_cmun_dc'])
            elif valor.get('ine'):
                comun = territorios.resolver('ine:municipio', valor['ine'])
        e['territorio_comun'] = comun
        e['territorio_estado'] = ('conflicto' if (identificadores or {}).get('conflicto')
                                  else 'resuelto' if comun else 'pendiente')

    participaciones = {i: {c: deepcopy(p[c]) for c in
        ('id', 'evento', 'participante', 'literal', 'papel', 'orden')}
        for i, p in n['participaciones'].items() if vigente(p)
        and nucleo.clave(p['evento']) in entidades
        and (p['participante'] is None or nucleo.clave(p['participante']) in entidades)}
    por_evento = {}
    for p in participaciones.values():
        por_evento.setdefault(nucleo.clave(p['evento']), []).append(p)
    composiciones = {}
    for r in relaciones:
        if r['tipo'] == 'compuesta_por':
            composiciones.setdefault(nucleo.clave(r['origen']), []).append(r)
    lugares = {}
    for r in relaciones:
        if r['tipo'] in ('se_celebra_en', 'ubicado_en'):
            lugares.setdefault(nucleo.clave(r['origen']), set()).add(nucleo.clave(r['destino']))

    def objetivos_evento(k):
        objetivos = set(ascendientes(k))
        for p in por_evento.get(k, []):
            if p['participante'] is None:
                continue
            participante = nucleo.clave(p['participante'])
            objetivos.add(participante)
            for r in composiciones.get(participante, []):
                if nucleo.clave(r['ambito']) in ascendientes(k):
                    objetivos.add(nucleo.clave(r['destino']))
        pendientes = [l for o in objetivos for l in lugares.get(o, ())]
        while pendientes:
            lugar = pendientes.pop()
            if lugar not in objetivos:
                objetivos.add(lugar)
                pendientes.extend(lugares.get(lugar, ()))
        return sorted(objetivos)

    eventos, tablas = [], []
    for k, e in entidades.items():
        e['objetivos'] = objetivos_evento(k) if e['tipo'] == 'evento' else ascendientes(k)
        if e['tipo'] != 'evento':
            continue
        propias = [i for i in n['entidades'][k]['evidencias'] if i in observaciones and i in activas]
        if not propias:
            continue
        resultado = seleccion(k, 'resultado')
        rid = resultado.get('valor') if resultado else None
        resultado = ({**deepcopy(n['resultados'][rid]), 'seleccion': resultado}
                     if rid in n['resultados'] and n['resultados'][rid]['observacion'] in observaciones else None)
        # Solo ubicación del evento o de su recinto; no el ámbito de una agrupación.
        pendientes, ubicaciones, vistos = list(lugares.get(k, ())), {}, set()
        while pendientes:
            lugar = pendientes.pop()
            if lugar in vistos:
                continue
            vistos.add(lugar)
            comun = entidades[lugar].get('territorio_comun')
            if comun:
                ubicaciones[comun['id']] = {'territorio': comun['id'], 'papel': 'celebracion',
                                           'ancestros': comun['ancestros']}
            pendientes.extend(lugares.get(lugar, ()))
        eventos.append({**deepcopy(e), 'programacion': seleccion(k, 'programacion'),
            'territorios': [ubicaciones[i] for i in sorted(ubicaciones)],
            'lugar': seleccion(k, 'lugar'), 'resultado': resultado,
            'enlaces': sorted({observaciones[i]['bloques']['url_evento'] for i in propias
                              if observaciones[i]['bloques'].get('url_evento')}),
            'participaciones': por_evento.get(k, []),
            'fuentes': [procedencia(i) for i in sorted(propias)]})
    for (k, bloque), _ in selecciones.items():
        if bloque != 'clasificacion' or k not in entidades:
            continue
        s = seleccion(k, bloque)
        cid = s.get('valor') if s else None
        if cid in n['clasificaciones'] and n['clasificaciones'][cid]['observacion'] in observaciones:
            participantes_tabla = {nucleo.clave(f['participante']) for f in n['clasificaciones'][cid]['filas']
                                   if f['participante'] and nucleo.clave(f['participante']) in entidades}
            tablas.append({**deepcopy(n['clasificaciones'][cid]), 'seleccion': s,
                           'objetivos': sorted(set(ascendientes(k)) | participantes_tabla)})
    campos_fuente = ('nombre', 'url', 'atribucion', 'licencia', 'licencia_url', 'condiciones', 'capacidades', 'modo')
    return {'version': 1, 'nucleo_version': 2,
        'generado': generado or datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'revision': fuentes is None,
        'catalogo': {'version': n['catalogo']['version'], 'conceptos': deepcopy(n['catalogo']['conceptos'])},
        'territorios_catalogo': {'version': list(territorios.version),
                                'fecha_referencia': territorios.fecha_referencia},
        'fuentes': {f: {c: deepcopy(n['fuentes'][f][c]) for c in campos_fuente if c in n['fuentes'][f]}
                    for f in sorted(permitidas)},
        'entidades': entidades, 'relaciones': relaciones,
        'eventos': sorted(eventos, key=lambda e: e['id']), 'clasificaciones': tablas}


def subir(datos):
    if datos['revision']:
        raise ValueError('Una revisión completa no se publica: selecciona las fuentes')
    import boto3
    from botocore.config import Config
    obligatorias = ('R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET')
    if any(not os.environ.get(k) for k in obligatorias):
        raise ValueError('Faltan credenciales R2 para publicar el calendario')
    cliente = boto3.client('s3',
        endpoint_url=f'https://{os.environ["R2_ACCOUNT_ID"]}.r2.cloudflarestorage.com',
        aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'], region_name='auto',
        config=Config(retries={'max_attempts': 3, 'mode': 'standard'}))
    cliente.put_object(Bucket=os.environ['R2_BUCKET'], Key='calendario.json',
        Body=json.dumps(datos, ensure_ascii=False, allow_nan=False, separators=(',', ':')).encode(),
        ContentType='application/json; charset=utf-8', CacheControl='public, max-age=60')


def main(argv=None):
    from calendario import guardar
    ap = argparse.ArgumentParser(description=__doc__)
    origen = ap.add_mutually_exclusive_group(required=True)
    origen.add_argument('--entrada', help='Exportación v2 para revisión local')
    origen.add_argument('--turso', action='store_true', help='Leer directamente la base del calendario')
    ap.add_argument('--salida', help='Exportación opcional para revisión local')
    ap.add_argument('--fuentes', help='Fuentes seleccionadas para publicación, separadas por comas')
    ap.add_argument('--publicar', action='store_true')
    args = ap.parse_args(argv)
    if args.turso:
        from .turso import Almacen
        calendario = Almacen().cargar()
        if calendario is None or 'nucleo' not in calendario:
            raise ValueError('Preparar el núcleo de Turso antes de publicar')
        n = calendario['nucleo']
    else:
        with open(args.entrada, encoding='utf-8') as archivo:
            n = json.load(archivo)
    datos = proyectar(n, None if args.fuentes is None else args.fuentes.split(','))
    if args.salida:
        guardar(args.salida, datos)
    if args.publicar:
        subir(datos)
    print(f'[agenda] Lectura: {len(datos["eventos"])} eventos, {len(datos["clasificaciones"])} tablas')


if __name__ == '__main__':
    main()
