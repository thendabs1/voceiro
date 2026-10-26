"""Ejecución acotada de agenda: descubrimiento, temporadas y consultas manuales."""

import argparse
from contextlib import contextmanager
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
import json
from pathlib import Path
import sqlite3

from turso_http import ErrorTurso
from . import almacen, nucleo, proveedores, recogida, temporadas
from .control import Repositorio, ConflictoControl, PresupuestoAgotado


def ahora_utc():
    return datetime.now(timezone.utc).isoformat(timespec='microseconds')


@contextmanager
def abrir(*, db=None, turso=False):
    """Las reservas se confirman antes de la red, también en SQLite local."""
    if bool(db) == bool(turso):
        raise ValueError('Seleccionar SQLite o Turso')
    if turso:
        from .turso import Almacen
        remoto = Almacen()
        remoto.inicializar()
        repo = Repositorio(remoto=remoto)
        repo.inicializar()
        yield repo
    else:
        with almacen.abrir(db):
            pass
        conexion = sqlite3.connect(db, isolation_level=None, timeout=10)
        conexion.execute('PRAGMA foreign_keys=ON')
        try:
            repo = Repositorio(db=conexion)
            repo.inicializar()
            yield repo
        finally:
            conexion.close()


def _base(repo, ahora):
    calendario = repo.cargar_calendario()
    if calendario is None:
        from .modelo import integrar
        from .transicion import ampliar
        calendario = ampliar(integrar(None, [], {}, ahora))
    elif 'nucleo' not in calendario:
        from .transicion import ampliar
        calendario = ampliar(calendario)
    return calendario


def _eventos(n, proveedor, observado, unidad, referencias=None):
    """Solo citas realmente recibidas; conserva la antigüedad de fechas retenidas."""
    fuente = proveedores.fuente_nucleo(proveedor)
    activas = nucleo.ultimas(n)
    salida = []
    for e in n['entidades'].values():
        if e['tipo'] != 'evento':
            continue
        evidencias = [i for i in e['evidencias'] if i in activas
            and n['observaciones'][i]['ultima_observacion'] == observado
            and (referencias is None or n['observaciones'][i]['referencia'] in referencias)
            and n['referencias'][n['observaciones'][i]['referencia']]['proveedor'] == fuente]
        if not evidencias:
            continue
        destino = nucleo.objetivo('evento', e['id'])
        s = nucleo.seleccionar(n, destino, 'programacion', candidatas=evidencias)
        agenda = nucleo.seleccionar(n, destino, 'agenda', candidatas=evidencias).get('valor') or {}
        p = s.get('valor') or {}
        c = p.get('cuando') or {}
        a, b = c.get('inicio') or {}, c.get('fin') or {}
        conservada = p.get('fecha_conservada')
        salida.append({'evento': e['id'], 'proveedor': proveedor, 'unidad': unidad,
            'recurso': 'programa:' + agenda['principal']['id'] if agenda.get('rol') == 'sesion' else 'calendario',
            'comprobado': observado, 'fecha_comprobada': conservada['comprobado'] if conservada else observado,
            'inicio': a.get('fecha'), 'fin': b.get('fecha'), 'precision': a.get('precision'),
            'estado': p.get('programacion'), 'conflicto': bool(s.get('conflicto')),
            'fecha_conservada': bool(conservada), 'rol': agenda.get('rol'),
            'huella': nucleo.json_canonico(p)})
    return salida


def _incidencias(previa, nuevas, eventos, unidades, ahora, *, incompleto=False):
    incidencias = []
    por_recurso = {(c['unidad'], c['recurso']): c for c in nuevas}
    recibidos = {e['evento'] for e in eventos}
    for c in previa:
        nueva = por_recurso.get((c['unidad'], c['recurso']))
        if c['unidad'] in unidades and nueva is not None:
            ausentes = set(c.get('eventos', [])) - set(nueva.get('eventos', [])) - recibidos
            if ausentes:
                incidencias.append({'tipo': 'ausentes_en_respuesta', 'unidad': c['unidad'],
                                    'recurso': c['recurso'], 'eventos': sorted(ausentes)})
    for e in eventos:
        if e['conflicto'] or e['estado'] == 'aplazado' or not e['inicio']:
            incidencias.append({'tipo': 'programacion_pendiente', 'evento': e['evento']})
    if incompleto:
        incidencias.append({'tipo': 'programa_incompleto'})
    return incidencias


def ejecutar_temporada(repo, t, ahora, *, fechas=None, proveedor=None, contraste=False,
                       precargada=None, forzar=False):
    """Una selección se importa completa o conserva la última lectura válida."""
    proveedor = proveedor or t['principal']
    if proveedor != t['principal'] and not contraste:
        raise ValueError('Otra fuente solo se consulta como contraste; cambiar el principal es explícito')
    if t['estado'] in ('cerrada', 'pausada') or t['bloqueada']:
        return {'temporada': t['id'], 'estado': 'omitida', 'motivo': t['estado'] if not t['bloqueada'] else 'bloqueada'}
    if not forzar and not temporadas.vencida(t, ahora):
        return {'temporada': t['id'], 'estado': 'omitida', 'motivo': 'aún no vence'}
    # Una petición manual tampoco salta el enfriamiento de un error.
    if t['errores_consecutivos'] and t['proxima_revision'] and (
            temporadas.momento(t['proxima_revision']) > temporadas.momento(ahora)):
        return {'temporada': t['id'], 'estado': 'omitida', 'motivo': 'enfriamiento'}
    cobertura = [c for c in repo.cobertura(t['id']) if c['proveedor'] == proveedor]
    if proveedores.modo(proveedor) == 'fecha':
        unidades = fechas or temporadas.plan_fechas(t, ahora, cobertura,
            limite=t['politica']['max_peticiones_pasada'])
        for d in unidades:
            date.fromisoformat(d)
    else:
        unidades = [t['referencia']]
    if not unidades:
        return {'temporada': t['id'], 'estado': 'omitida', 'motivo': 'selección comprobada'}
    t, pasada = repo.comenzar(t, ahora, unidades, proveedor=proveedor, contraste=contraste)
    calendario = _base(repo, ahora)
    n = calendario['nucleo']
    eventos, coberturas, alcances = [], [], []
    try:
        with recogida.controlar(lambda url: repo.reservar(t, pasada, url, ahora),
                lambda url, http, cabeceras, cantidad: repo.recibida(pasada, http, cabeceras, cantidad)):
            for unidad in unidades:
                inicio = temporadas.momento(ahora).date().isoformat()
                fin = (date.fromisoformat(inicio) + timedelta(days=t['politica']['horizonte_dias'] - 1)).isoformat()
                # La comprobación final necesita el programa del último GP.
                if t['fin_confirmado'] and t['fin'] and t['fin'] < inicio:
                    inicio = fin = t['fin']
                if precargada is not None:
                    pagina, url = precargada
                    precargada = None
                else:
                    pagina, url = proveedores.recoger(proveedor, temporada=t['seleccion'].get('year', t['referencia']),
                        fecha=unidad if proveedores.modo(proveedor) == 'fecha' else None, inicio=inicio, fin=fin)
                alcance = proveedores.describir(proveedor, pagina, url)
                proveedores.comprobar_temporada(t, alcance)
                # Una respuesta puede repetir un torneo en varios días. Su lista
                # de referencias acredita qué citas recibimos en ESTA unidad;
                # compartir la hora de pasada no revalida las de otras unidades.
                respuesta = proveedores.importar(None, proveedor, pagina, ahora, url=url,
                    temporada=t['seleccion'].get('year', t['referencia']))
                n = proveedores.importar(n, proveedor, pagina, ahora, url=url,
                                         temporada=t['seleccion'].get('year', t['referencia']))
                recibidos = _eventos(n, proveedor, ahora, unidad, respuesta['referencias'])
                eventos.extend(recibidos)
                recursos = {'calendario', *(e['recurso'] for e in recibidos)}
                for recurso in sorted(recursos):
                    coberturas.append({'proveedor': proveedor, 'unidad': unidad, 'recurso': recurso,
                        'comprobado': temporadas.marca(ahora), 'completa': True,
                        'eventos': sorted({e['evento'] for e in recibidos if e['recurso'] == recurso}),
                        'inicio': inicio if proveedores.modo(proveedor) == 'temporada' else unidad,
                        'fin': fin if proveedores.modo(proveedor) == 'temporada' else unidad})
                alcances.append(alcance)
    except (ErrorTurso, ConflictoControl):
        # Una respuesta de escritura perdida no se convierte en fallo de proveedor
        # ni se reintenta. La pasada queda auditable y su lease permite recuperación.
        raise
    except Exception as error:
        if isinstance(error, PresupuestoAgotado) and isinstance(error.__cause__, ErrorTurso):
            raise error.__cause__  # Una reserva de resultado incierto tampoco se repite.
        repo.fallar(t, pasada, ahora, error)
        return {'temporada': t['id'], 'estado': 'fallida', 'error': str(error)}
    if contraste:
        # Se valida su modelo en memoria, sin guardar otra autoridad ni IDs duplicados.
        repo.confirmar(t, pasada, t, None, [], [], ahora)
        return {'temporada': t['id'], 'estado': 'contraste', 'proveedor': proveedor, 'citas': len(eventos)}
    alcance = alcances[-1]
    # Una acreditación editorial explícita permite cerrar fuentes por fecha cuyo
    # proveedor no ofrece por sí solo un contrato completo de temporada/fases.
    if t.get('acreditacion'):
        alcance = {**alcance, **t['acreditacion']}
    incompleto = bool(alcance.get('programa')) and not alcance.get('programa_completo')
    incidencias = _incidencias(cobertura, coberturas, eventos, unidades, ahora, incompleto=incompleto)
    if any(i['tipo'] == 'ausentes_en_respuesta' for i in incidencias):
        error = ValueError('Respuesta parcial: faltan citas previamente acreditadas en la misma selección')
        repo.fallar(t, pasada, ahora, error)
        return {'temporada': t['id'], 'estado': 'fallida', 'error': str(error), 'incidencias': incidencias}
    # Una cita aplazada o pendiente previamente guardada sigue bloqueando el cierre
    # aunque desaparezca de la respuesta posterior.
    vigentes = {e['evento']: e for e in repo.eventos(t['id']) if e['proveedor'] == proveedor}
    vigentes.update({e['evento']: e for e in eventos})
    for e in vigentes.values():
        if e['evento'] not in {x['evento'] for x in eventos} and (e['conflicto'] or e['estado'] == 'aplazado' or not e['inicio']):
            incidencias.append({'tipo': 'programacion_pendiente_conservada', 'evento': e['evento']})
    if incidencias:
        for c in coberturas:
            c['completa'] = False
    proximas = [e['inicio'] for e in vigentes.values() if e['inicio']]
    nuevo = temporadas.exitosa(t, ahora, alcance, incidencias, proximas)
    nuevo['seleccion'] = {**t['seleccion'], **alcance['seleccion']}
    nuevo['etiqueta'] = alcance.get('etiqueta', t.get('etiqueta', t['referencia']))
    nuevo['limites_proveedor'] = alcance.get('limites_proveedor', t.get('limites_proveedor'))
    nuevo['siguiente_temporada'] = alcance.get('siguiente_temporada', t.get('siguiente_temporada'))
    if proveedores.modo(proveedor) == 'fecha':
        nuevas_c = {(c['unidad'], c['recurso']): c for c in cobertura}
        nuevas_c.update({(c['unidad'], c['recurso']): c for c in coberturas})
        if temporadas.plan_fechas(nuevo, ahora, nuevas_c.values(), limite=1):
            nuevo['proxima_revision'] = temporadas.marca(ahora)  # Quedan huecos; avanzar en la siguiente pasada.
    calendario['nucleo'] = n
    repo.confirmar(t, pasada, nuevo, calendario, coberturas, eventos, ahora)
    return {'temporada': t['id'], 'estado': nuevo['estado'], 'proveedor': proveedor,
            'citas': len({e['evento'] for e in eventos}), 'peticiones': len(pasada['peticiones']),
            'incidencias': incidencias}


def _principal_actual(repo, t, ahora):
    elegido = proveedores.principal(t['coleccion'])
    if (t['principal'] == elegido or t.get('principal_fijado')
            or t['estado'] in ('cerrada', 'pausada') or elegido not in proveedores.OFICIALES):
        return t
    r = deepcopy(t)
    r['historial'].append({'accion': 'cambiar_principal', 'cuando': temporadas.marca(ahora),
        'anterior': t['principal'], 'nuevo': elegido,
        'ultima_valida_anterior': t['ultima_valida'],
        'motivo': 'Selección de fuente oficial autorizada para esta colección'})
    r.update(principal=elegido, ultima_valida=None, ultimo_intento=None,
        proxima_revision=temporadas.marca(ahora), errores_consecutivos=0, bloqueada=False,
        estado='activa', en_cierre_desde=None, cerrada=None, incidencias=[],
        fin_confirmado=False, cobertura_completa=False, fases_completas=False, programa_completo=False)
    return repo.cambiar(t, r)


def descubrir(repo, coleccion, ahora, *, proveedor=None, year=None, fecha=None, forzar=False):
    proveedor = proveedor or proveedores.principal(coleccion)
    anterior = repo.descubrimiento(coleccion)
    if anterior and not forzar and (anterior.get('bloqueada') or
            temporadas.momento(anterior['proxima_revision']) > temporadas.momento(ahora)):
        return None, None
    conocidas = repo.temporadas(coleccion)
    hoy = temporadas.momento(ahora).date()
    modo = proveedores.modo(proveedor)
    if modo == 'fecha':
        if fecha is None:
            limites = [t.get('limites_proveedor') or {} for t in conocidas]
            finales = [date.fromisoformat(l['endDate'][:10]) for l in limites if l.get('endDate')]
            fecha = max([hoy, *(d + timedelta(days=1) for d in finales)]).isoformat()
        year = str(year or hoy.year)
    else:
        if year is None:
            registradas = {t['referencia'] for t in conocidas}
            anunciadas = [str(t['siguiente_temporada']) for t in conocidas if t.get('siguiente_temporada')]
            candidatas = sorted(set([str(hoy.year), str(hoy.year + 1), *anunciadas]))
            year = next((y for y in candidatas if y.isdigit() and hoy.year <= int(y) <= hoy.year + 1
                         and y not in registradas), None)
            if year is None:
                return None, None
        year = str(year)
        if any(t['referencia'] == year and t['estado'] == 'cerrada' for t in conocidas):
            return None, None
    pasada = repo.comenzar_descubrimiento(coleccion, proveedor, ahora)
    try:
        with recogida.controlar(lambda url: repo.reservar({'politica': temporadas.POLITICA}, pasada, url, ahora),
                lambda url, http, cabeceras, cantidad: repo.recibida(pasada, http, cabeceras, cantidad)):
            pagina, url = proveedores.recoger(proveedor, temporada=year, fecha=fecha,
                inicio=temporadas.momento(ahora).date().isoformat(),
                fin=(temporadas.momento(ahora).date() + timedelta(days=13)).isoformat())
            alcance = proveedores.describir(proveedor, pagina, url)
            if modo == 'temporada' and alcance['referencia'] != year:
                raise ValueError('El descubrimiento devolvió otra temporada')
            if modo == 'temporada' and not (alcance.get('cobertura_completa') or alcance.get('seleccion_valida')):
                raise ValueError('No hay un calendario o selección válida publicados para la temporada solicitada')
            # Validar toda la estructura antes de registrar una nueva temporada.
            proveedores.importar(None, proveedor, pagina, ahora, url=url, temporada=alcance['referencia'])
    except ErrorTurso:
        raise
    except Exception as error:
        repo.terminar_descubrimiento(pasada, ahora, error=error)
        return None, {'coleccion': coleccion, 'estado': 'fallida', 'error': str(error)}
    repo.terminar_descubrimiento(pasada, ahora, referencia=alcance['referencia'])
    existente = next((t for t in conocidas if t['referencia'] == alcance['referencia']), None)
    if existente is not None:
        return None, {'coleccion': coleccion, 'estado': 'omitida', 'motivo': 'sin temporada nueva'}
    t = temporadas.nueva(coleccion, alcance['referencia'], ahora,
        seleccion=alcance['seleccion'], principal=proveedor)
    t = repo.registrar(t)
    if t['estado'] in ('cerrada', 'pausada') or t['bloqueada']:
        return t, {'coleccion': coleccion, 'estado': 'omitida', 'motivo': t['estado']}
    return t, ejecutar_temporada(repo, t, ahora, fechas=[fecha] if fecha else None,
                                 precargada=(pagina, url), forzar=True)


def ejecutar(repo, ahora, *, colecciones=None, descubrimiento=False):
    seleccion = set(colecciones or temporadas.CATALOGO)
    if seleccion - temporadas.CATALOGO.keys():
        raise ValueError('Colección desconocida')
    salida, tratadas = [], set()
    # El cron no contiene años fijos. Descubrir y revisar tienen relojes propios.
    if descubrimiento:
        for coleccion in sorted(seleccion):
            t, resultado = descubrir(repo, coleccion, ahora)
            if resultado:
                salida.append(resultado)
            if t:
                tratadas.add(t['id'])
    for t in repo.temporadas():
        if t['coleccion'] in seleccion and t['id'] not in tratadas:
            t = _principal_actual(repo, t, ahora)
            salida.append(ejecutar_temporada(repo, t, ahora))
    return salida


def manual(repo, proveedor, ahora, *, year=None, fecha=None):
    coleccion = next((c for c, (_, p, _) in temporadas.CATALOGO.items() if p == proveedor), None)
    coleccion = coleccion or next((c for c, p in proveedores.PRINCIPALES.items() if p == proveedor), None)
    if coleccion is None:
        raise ValueError('Proveedor deportivo desconocido')
    candidatas = repo.temporadas(coleccion)
    if year:
        t = next((t for t in candidatas if t['referencia'] == str(year)), None)
        if t is None:
            t = repo.registrar(temporadas.nueva(coleccion, str(year), ahora,
                seleccion={'year': str(year)}, principal=proveedores.principal(coleccion)))
        t = _principal_actual(repo, t, ahora)
        return ejecutar_temporada(repo, t, ahora, proveedor=proveedor,
            fechas=[fecha] if fecha else None, contraste=proveedor != t['principal'], forzar=True)
    # Si el principal ya está registrado, ESPN permanece como contraste explícito.
    activas = [t for t in candidatas if t['estado'] not in ('cerrada', 'pausada')]
    if fecha and len(activas) > 1:
        coincidentes = [t for t in activas if t['inicio'] and t['fin'] and t['inicio'] <= fecha <= t['fin']]
        if len(coincidentes) == 1:
            activas = coincidentes
    if len(activas) > 1:
        actuales = [t for t in activas if t['estado'] != 'anunciada']
        if len(actuales) == 1:
            activas = actuales
    if len(activas) == 1:
        t = _principal_actual(repo, activas[0], ahora)
        return ejecutar_temporada(repo, t, ahora, proveedor=proveedor, fechas=[fecha] if fecha else None,
                                  contraste=proveedor != t['principal'], forzar=True)
    if candidatas:
        return {'coleccion': coleccion, 'estado': 'omitida',
                'motivo': 'Seleccionar una temporada o ejecutar el descubrimiento explícito'}
    _, resultado = descubrir(repo, coleccion, ahora, proveedor=proveedor, fecha=fecha, forzar=True)
    return resultado


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__)
    origen = p.add_mutually_exclusive_group(required=True)
    origen.add_argument('--db')
    origen.add_argument('--turso', action='store_true')
    accion = p.add_mutually_exclusive_group(required=True)
    accion.add_argument('--ejecutar', action='store_true')
    accion.add_argument('--estado', action='store_true')
    accion.add_argument('--configurar', metavar='JSON', help='Alta o acreditación explícita de una temporada')
    accion.add_argument('--reabrir', metavar='ID')
    accion.add_argument('--contrastar', metavar='ID')
    p.add_argument('--descubrir', action='store_true')
    p.add_argument('--coleccion', action='append', choices=temporadas.CATALOGO)
    p.add_argument('--proveedor')
    p.add_argument('--fecha')
    p.add_argument('--motivo')
    p.add_argument('--ahora')
    args = p.parse_args(argv)
    ahora = temporadas.marca(args.ahora or ahora_utc())
    with abrir(db=args.db, turso=args.turso) as repo:
        if args.estado:
            salida = {'temporadas': repo.temporadas(), 'pasadas': repo.pasadas(), 'consumo': repo.consumo()}
        elif args.reabrir:
            t = repo.obtener(args.reabrir)
            salida = repo.cambiar(t, temporadas.reabrir(t, ahora, args.motivo))
        elif args.configurar:
            dato = json.loads(Path(args.configurar).read_text())
            t = temporadas.nueva(dato['coleccion'], str(dato['referencia']), ahora,
                seleccion=dato.get('seleccion'), principal=dato.get('principal') or proveedores.principal(dato['coleccion']),
                politica=dato.get('politica'))
            anterior = repo.registrar(t)
            nuevo = deepcopy(anterior)
            if dato.get('acreditacion'):
                if not args.motivo or not dato['acreditacion'].get('evidencia'):
                    p.error('Acreditar límites o fases requiere --motivo y evidencia')
                nuevo['acreditacion'] = dato['acreditacion']
                nuevo['historial'].append({'accion': 'acreditar', 'cuando': ahora, 'motivo': args.motivo})
            nuevo['politica'] = t['politica']
            salida = repo.cambiar(anterior, nuevo)
        elif args.contrastar:
            if not args.proveedor:
                p.error('--contrastar requiere --proveedor')
            salida = ejecutar_temporada(repo, repo.obtener(args.contrastar), ahora,
                proveedor=args.proveedor, contraste=True, fechas=[args.fecha] if args.fecha else None, forzar=True)
        else:
            salida = ejecutar(repo, ahora, colecciones=args.coleccion, descubrimiento=args.descubrir)
    print(json.dumps(salida, ensure_ascii=False, indent=2))
    resultados = salida if isinstance(salida, list) else [salida]
    if (args.ejecutar or args.contrastar) and any(r and r.get('estado') == 'fallida' for r in resultados):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
