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

from . import nucleo, presencia
from .tiempos import instante
from shared.territorios import cargar as cargar_territorios
from shared.territorios.relacionador import cargar as cargar_relacionador


def proyectar(n, fuentes=None, generado=None, control=None, limites_municipales=None):
    nucleo.validar(n)
    permitidas = set(n['fuentes']) if fuentes is None else set(fuentes)
    if permitidas - n['fuentes'].keys():
        raise ValueError('Fuentes desconocidas: ' + ', '.join(sorted(permitidas - n['fuentes'].keys())))
    activas = nucleo.ultimas(n)
    ausentes = presencia.referencias_ausentes(n)
    observaciones = {i: o for i, o in n['observaciones'].items()
        if n['referencias'][o['referencia']]['proveedor'] in permitidas
        and o['referencia'] not in ausentes
        and (n['fuentes'][n['referencias'][o['referencia']]['proveedor']].get('alcance') != 'agenda_deportiva'
             or n['documentos'][o['documento']]['clase'] == 'extraccion_agenda')}

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
        # Sin historial, una traducción que la última respuesta omite sigue en la entidad.
        for idioma, nombre in e['nombres'].items():
            nombres.setdefault(idioma, nombre)
        entidades[k] = {c: deepcopy(e[c]) for c in ('tipo', 'id', 'clase')}
        entidades[k].update(nombres=nombres, codigos=sorted(codigos),
            temas=sorted({t['tema'] for t in e['temas'] if vigente(t)}))
    # Correspondencia editorial del flujo ya integrado, no de los títulos.
    ref_f1 = next((r for r in n['referencias'].values()
        if r['proveedor'] == 'vidmar-f1' and r['tipo_externo'] == 'grupo_piloto'
        and r['id_externo'] == 'vidmar-f1:calendario'), None)
    if ref_f1 and nucleo.clave(ref_f1['destino']) in entidades:
        entidades[nucleo.clave(ref_f1['destino'])]['codigos'] = ['f1']

    # Por ID: la lectura guarda huellas y el orden de carga no debe reescribirla.
    relaciones = [{c: deepcopy(r[c]) for c in ('tipo', 'origen', 'destino', 'ambito')}
                  for _, r in sorted(n['relaciones'].items()) if vigente(r)
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
        if s is None and bloque in ('identificadores', 'agenda'):
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
    relacionador = cargar_relacionador()

    def pruebas_origen(k, bloque=None):
        return [{**procedencia(i), 'observacion': i, 'documento': observaciones[i]['documento'],
                 'sha256': n['documentos'][observaciones[i]['documento']]['huella'],
                 'ruta': observaciones[i]['ruta']}
                for i in sorted(n['entidades'][k]['evidencias']) if i in observaciones and i in activas
                and (bloque is None or bloque in observaciones[i]['bloques'])]

    def resolver_entidad(e, referencias, operacion, origen, conflicto=False, adicionales=()):
        resultados = [getattr(relacionador, operacion)(r) for r in referencias]
        for resultado in resultados:
            resultado['origen'] = deepcopy(origen)
        resultados.extend(adicionales)
        # Un recinto sin correspondencia no contradice la ubicación que acredita su punto.
        decisivos = [r for r in resultados if not (adicionales and r['estado'] == 'pendiente'
                     and r['motivo'] == 'sin_correspondencia')] or resultados
        ids = {r['territorio'] for r in decisivos if r['estado'] == 'resuelto'}
        estado = ('conflicto' if conflicto or len(ids) > 1 or any(r['estado'] == 'conflicto' for r in decisivos)
                  else 'resuelto' if decisivos and all(r['estado'] == 'resuelto' for r in decisivos)
                  else 'pendiente')
        prefijo = 'territorio' if operacion == 'resolver_referencia' else 'ubicacion'
        e[prefijo + '_resoluciones'] = resultados
        e[prefijo + '_estado'] = estado
        e[prefijo + '_motivo'] = ('identificadores_en_conflicto' if conflicto else
            'referencias_incompatibles' if len(ids) > 1 else 'sin_referencia' if not resultados else
            next((r['motivo'] for r in decisivos if r['estado'] != 'resuelto'), 'correspondencia_acreditada'))
        e[prefijo + '_comun'] = territorios.territorio(next(iter(ids))) if estado == 'resuelto' else None

    for k, e in entidades.items():
        if e['tipo'] == 'lugar':
            # El recinto mantiene su identidad; se resuelve su ubicación, no su equivalencia.
            referencias = {r['id']: r for o in pruebas_origen(k)
                           if (r := n['referencias'][o['referencia']])['proveedor'] == 'madrid'
                           and r['tipo_externo'] == 'instalacion_vgnextoid'}
            puntos = []
            if limites_municipales is not None:
                origen = pruebas_origen(k, 'coordenadas')
                for lat, lon in sorted({(c['latitud'], c['longitud']) for o in origen
                                        if (c := observaciones[o['observacion']]['bloques']['coordenadas'])}):
                    puntos.append({**limites_municipales.resolver(lon, lat), 'origen': [o for o in origen
                        if observaciones[o['observacion']]['bloques']['coordenadas'] == {'latitud': lat, 'longitud': lon}]})
            if referencias or puntos:
                resolver_entidad(e, [{'sistema': 'madrid:instalacion_vgnextoid',
                                      'codigo': r['id_externo'], 'contexto': {}}
                                     for r in referencias.values()], 'resolver_ubicacion', pruebas_origen(k),
                                 adicionales=puntos)
            continue
        if e['tipo'] != 'territorio':
            continue
        identificadores = seleccion(k, 'identificadores')
        origen = pruebas_origen(k, 'identificadores')
        valores = [((identificadores or {}).get('valor') or {},
                    (identificadores or {}).get('procedencia', {}).get('fuente'))]
        if (identificadores or {}).get('conflicto'):
            valores = [(observaciones[o['observacion']]['bloques']['identificadores'], o['fuente']) for o in origen]
        referencias = []
        for valor, proveedor in valores:
            referencias.extend({'sistema': sistema, 'codigo': valor[campo], 'contexto': {}}
                               for campo, sistema in (('ine_cpro_cmun_dc', 'ine:municipio:dc'), ('ine', 'ine:municipio'))
                               if campo in valor)
            if 'nora' in valor:
                kulturklik = proveedor == 'kulturklik'
                referencias.append({'sistema': 'kulturklik:municipio_nora' if kulturklik else 'nora:municipio',
                    'codigo': valor['nora'],
                    'contexto': {('provincia_nora' if kulturklik else 'provincia'): valor['provincia_nora']}
                                if 'provincia_nora' in valor else {}})
        resolver_entidad(e, referencias, 'resolver_referencia', origen,
                         conflicto=(identificadores or {}).get('conflicto', False))

    participaciones = {i: {c: deepcopy(p[c]) for c in
        ('id', 'evento', 'participante', 'literal', 'papel', 'orden')}
        for i, p in sorted(n['participaciones'].items()) if vigente(p)
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
            comun = entidades[lugar].get('territorio_comun') or entidades[lugar].get('ubicacion_comun')
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
        agenda = seleccion(k, 'agenda')
        if agenda and agenda.get('valor'):
            eventos[-1]['agenda'] = agenda['valor']
        # Unión por clave: las traducciones de una misma etiqueta suman nombres.
        etiquetas = {}
        for i in propias:
            for t in observaciones[i]['bloques'].get('etiquetas', ()):
                etiquetas.setdefault(t['id'], {'id': t['id'], 'nombres': {}})['nombres'].update(t['nombres'])
        if etiquetas:
            eventos[-1]['etiquetas'] = [etiquetas[i] for i in sorted(etiquetas)]
    por_id = {e['id']: e for e in eventos}
    sesiones = set()
    for e in eventos:
        agenda = e.get('agenda') or {}
        if agenda.get('rol') != 'sesion':
            continue
        principal = por_id.get(agenda['principal']['id'])
        if not principal or (principal.get('agenda') or {}).get('rol') != 'principal':
            raise ValueError('Sesión publicada sin su gran premio principal')
        principal.setdefault('programa', []).append(deepcopy(e))
        principal['objetivos'] = sorted(set(principal['objetivos']) | set(e['objetivos']))
        sesiones.add(e['id'])
    for e in eventos:
        if 'programa' in e:
            e['programa'].sort(key=lambda s: (s['programacion']['valor']['cuando']['inicio']['fecha'] or '',
                s['programacion']['valor']['cuando']['inicio']['hora_local'] or '', s['id']))
    eventos = [e for e in eventos if e['id'] not in sesiones]
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
    salida = {'version': 1, 'nucleo_version': 2,
        'generado': generado or datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'revision': fuentes is None,
        'catalogo': {'version': n['catalogo']['version'], 'conceptos': deepcopy(n['catalogo']['conceptos'])},
        'territorios_catalogo': {'version': list(territorios.version),
                                'fecha_referencia': territorios.fecha_referencia,
                                'relacionador': deepcopy(relacionador.revision)},
        'fuentes': {f: {c: deepcopy(n['fuentes'][f][c]) for c in campos_fuente if c in n['fuentes'][f]}
                    for f in sorted(permitidas)},
        'entidades': entidades, 'relaciones': relaciones,
        'eventos': sorted(eventos, key=lambda e: e['id']), 'clasificaciones': tablas}
    if control:
        # Al cambiar de principal no se fusionan IDs por título ni se publican
        # simultáneamente las dos versiones de una cita deportiva.
        limites = {f: set(ids) for f, ids in control['eventos'].items() if f in permitidas}
        salida['eventos'] = [e for e in salida['eventos'] if any(
            p['fuente'] not in limites or e['id'] in limites[p['fuente']] for p in e['fuentes'])]
        usados = {k for e in salida['eventos'] for k in e['objetivos']}
        for e in salida['eventos']:
            for sesion in e.get('programa', []):
                usados.update(sesion['objetivos'])
        usados.update(k for tabla in tablas for k in tabla['objetivos'])
        salida['entidades'] = {k: v for k, v in entidades.items() if k in usados}
        salida['relaciones'] = [r for r in relaciones if nucleo.clave(r['origen']) in usados
            and nucleo.clave(r['destino']) in usados and (not r['ambito'] or nucleo.clave(r['ambito']) in usados)]
        salida['cobertura_colecciones'] = [deepcopy(c) for c in control['colecciones'] if c['fuente'] in permitidas]
    return salida


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
    ap.add_argument('--fuentes-control', action='store_true',
                    help='Añadir los principales deportivos con recogida validada y su cobertura')
    ap.add_argument('--publicar', action='store_true')
    ap.add_argument('--revisar', action='store_true',
                    help='Imprimir antes el informe de agenda.revision de todas las fuentes, con la misma carga')
    ap.add_argument('--lectura-sql', action='store_true',
                    help='Preparar y publicar la proyección indexada en el mismo Turso (requiere --fuentes)')
    args = ap.parse_args(argv)
    if args.fuentes_control and (not args.turso or args.fuentes is None):
        ap.error('--fuentes-control requiere --turso y una selección --fuentes explícita')
    if args.lectura_sql and (not args.turso or args.fuentes is None):
        ap.error('--lectura-sql requiere --turso y --fuentes explícitas')
    if args.turso:
        from .turso import abrir
        remoto = abrir()
        # En una pasada el cliente es compartido: las métricas de este paso son la diferencia.
        leidas, escritas = remoto.cliente.leidas, remoto.cliente.escritas
        calendario = remoto.cargar()
        if calendario is None or 'nucleo' not in calendario:
            raise ValueError('Preparar el núcleo de Turso antes de publicar')
        n = calendario['nucleo']
    else:
        with open(args.entrada, encoding='utf-8') as archivo:
            n = json.load(archivo)
    from shared.territorios.limites import cargar as cargar_limites
    limites = cargar_limites()
    if args.revisar:
        # Proyección propia de todas las fuentes: filtrar la publicable no la sustituye.
        from .revision import revisar
        print(json.dumps(revisar(n, None, limites), ensure_ascii=False, indent=2))
    control = None
    fuentes = None if args.fuentes is None else [f for f in args.fuentes.split(',') if f]
    if args.fuentes_control:
        from .control import Repositorio
        repo = Repositorio(remoto=remoto)
        repo.inicializar()
        control = repo.publico()
        fuentes = sorted(set(fuentes) | (control['eventos'].keys() & n['fuentes'].keys()))
    datos = proyectar(n, fuentes, control=control, limites_municipales=limites)
    sin_limites = sorted({p for e in datos['entidades'].values() for r in e.get('ubicacion_resoluciones', ())
                          if r['motivo'] == 'limites_no_disponibles' for p in r['provincias']})
    if sin_limites and (args.publicar or args.lectura_sql):
        raise ValueError('Límites municipales no disponibles para publicar: ' + ', '.join(sin_limites))
    if args.salida:
        guardar(args.salida, datos)
    if args.lectura_sql:
        from turso_http import filas
        from .lectura import estado, huellas, preparar, planificar
        preparada = preparar(datos)
        previo = estado(lambda s: [filas(r) for r in remoto.cliente.transaccion(s, escritura=False)])
        remoto.cliente.transaccion(planificar(preparada, remoto.revision, previo))
        # Cuántos eventos y entidades se reescriben: separa cambios reales de amplificación.
        nuevas, viejas = huellas(preparada)[0], (previo or {}).get('huellas', {})
        cambiadas = [k for k, h in nuevas.items() if viejas.get(k) != h]
        print(f'[agenda] Lectura SQL {"diferencial" if previo else "completa"}: {len(preparada["tramos"])} tramos; '
              f'{sum(t == "evento" for t, _ in cambiadas)} eventos y {sum(t == "entidad" for t, _ in cambiadas)} '
              f'entidades reescritos, {len(viejas.keys() - nuevas.keys())} retirados; '
              f'{remoto.cliente.leidas - leidas} filas leídas, {remoto.cliente.escritas - escritas} escritas')
    if args.publicar:
        subir(datos)
    print(f'[agenda] Lectura: {len(datos["eventos"])} eventos, {len(datos["clasificaciones"])} tablas')


if __name__ == '__main__':
    main()
