"""Presencia cultural acreditada por catálogo completo o IDs comprobados."""

import json

from . import nucleo, tiempos
from .registro import CULTURA

TIPOS = {f: m.TIPO_EXTERNO for f, m in CULTURA.items() if getattr(m, 'INVENTARIO_COMPLETO', True)}
# Un catálogo cultural cambia poco de un día a otro; una caída mayor suele ser
# un fallo del proveedor (respuesta vacía o recortada) y ocultaría la fuente.
CAIDA_MAXIMA = 0.3


class InventarioDesplomado(ValueError):
    """El inventario cae más de CAIDA_MAXIMA: se conserva el anterior."""


def _acotado_valido(datos, *, recogida=True):
    # Lo guardado solo lleva despublicados; los presentes de una pasada sirven
    # para reapariciones y no se acumulan (crecerían y cambiarían cada día).
    presentes, despublicados = datos.get('presentes', [] if not recogida else None), datos.get('despublicados')
    return (datos.get('alcance') == 'ids_comprobados' and isinstance(presentes, list)
            and (recogida or 'presentes' not in datos)
            and all(isinstance(i, str) and i for i in presentes)
            and presentes == sorted(set(presentes)) and isinstance(despublicados, dict)
            and not set(presentes) & despublicados.keys()
            and all(isinstance(i, str) and i and isinstance(e, dict) and e.get('url')
                    and isinstance(e.get('evento'), dict) and str(e['evento'].get('id')) == i
                    and e['evento'].get('idioma') == 'gl'
                    and type(e['evento'].get('publicar')) is int and e['evento']['publicar'] == 0
                    for i, e in despublicados.items()))


def _registrar_acotado(n, fuente, datos, observado, url):
    if fuente not in CULTURA or fuente in TIPOS or not _acotado_valido(datos):
        raise ValueError('Inventario cultural acotado inválido')
    c = nucleo.Constructor(n)
    previa = c.n['fuentes'][fuente].get('respuesta_completa')
    documento = c.n['documentos'][previa['documento']] if previa else None
    if previa and tiempos.instante(observado) < tiempos.instante(previa['comprobado']):
        raise ValueError('Respuesta completa anterior a la última comprobación')
    anteriores = documento['contenido'] if documento else {}
    despublicados = dict(anteriores.get('despublicados', {}))
    # Solo lo comprobado cambia: un presente borra su despublicación (y la de sus
    # alias); un fallo de detalle no toca nada.
    destinos = {r['id_externo']: nucleo.clave(r['destino']) for r in n['referencias'].values()
                if r['proveedor'] == fuente and r['tipo_externo'] == CULTURA[fuente].TIPO_EXTERNO}
    reaparecidas = {destinos[i] for i in datos['presentes'] if i in destinos}
    despublicados = {i: e for i, e in despublicados.items()
                    if i not in datos['presentes'] and destinos.get(i) not in reaparecidas}
    for i, evidencia in datos['despublicados'].items():
        anterior = despublicados.get(i, {})
        primera = anterior.get('observado') if all(anterior.get(k) == v for k, v in evidencia.items()) else None
        despublicados[i] = {**evidencia, 'observado': primera or observado}
    contenido = {'alcance': 'ids_comprobados', 'tipo_externo': CULTURA[fuente].TIPO_EXTERNO,
                 'despublicados': despublicados}
    if (documento is None or documento['url'] != url
            or {k: documento['contenido'].get(k) for k in contenido} != contenido):
        did = c.documento(fuente, {**contenido, 'observado': observado}, url, 'inventario_cultural_acotado')
    else:
        did = documento['id']
    c.n['fuentes'][fuente]['respuesta_completa'] = {'documento': did, 'comprobado': observado}
    return c.terminar()


def registrar(n, fuente, ids, observado, url, *, aceptar_caida=False):
    """Registra el inventario vigente; repetirlo solo actualiza la comprobación.

    Los IDs proceden de todas las páginas, antes de filtrar la ventana temporal.
    La ausencia no modifica las observaciones de la cita ni declara cancelación.
    Una caída mayor que CAIDA_MAXIMA exige aceptar_caida; si el total se
    mantiene pero desaparece esa proporción de IDs anteriores, solo avisa.
    Un inventario acotado solo sustituye los IDs comprobados y conserva los
    demás; la despublicación lleva evidencia explícita del detalle gallego.
    """
    if isinstance(ids, dict):
        return _registrar_acotado(n, fuente, ids, observado, url)
    if (fuente not in TIPOS or not isinstance(ids, (list, tuple))
            or any(not isinstance(i, str) or not i for i in ids) or len(set(ids)) != len(ids)):
        raise ValueError('Inventario cultural inválido')
    momento = tiempos.instante(observado)
    c = nucleo.Constructor(n)
    previa = c.n['fuentes'][fuente].get('respuesta_completa')
    contenido = {'tipo_externo': TIPOS[fuente], 'ids': sorted(ids)}
    documento = c.n['documentos'][previa['documento']] if previa else None
    if previa and momento < tiempos.instante(previa['comprobado']):
        raise ValueError('Respuesta completa anterior a la última comprobación')
    if documento and not aceptar_caida:
        anteriores = set(documento['contenido']['ids'])
        if len(ids) < len(anteriores) * (1 - CAIDA_MAXIMA):
            raise InventarioDesplomado(f'Inventario {fuente}: {len(anteriores)} → {len(ids)} '
                                       'citas; se conserva el anterior')
        # Sustituir muchos IDs no baja el total: ¿cambió el proveedor sus identidades?
        perdidos = len(anteriores - set(ids))
        if perdidos > len(anteriores) * CAIDA_MAXIMA:
            print(f'::warning::Inventario {fuente}: faltan {perdidos} de {len(anteriores)} citas anteriores '
                  'aunque el total se mantiene; revisar si el proveedor cambió identidades')
    if (documento is None or documento['url'] != url
            or {k: documento['contenido'][k] for k in contenido} != contenido):
        did = c.documento(fuente, {**contenido, 'observado': observado}, url, 'inventario_cultural_completo')
    else:
        did = documento['id']
    c.n['fuentes'][fuente]['respuesta_completa'] = {'documento': did, 'comprobado': observado}
    return c.terminar()


def validar(n):
    for fuente, datos in n['fuentes'].items():
        ausencias = datos.get('ausencias')
        if ausencias is not None and (
                ausencias.get('tipo_externo') != 'competicion' or not isinstance(ausencias.get('ids'), dict)
                or not ausencias['ids'] or any(
                    not isinstance(i, str) or not i or not isinstance(a, dict) or not a.get('motivo')
                    or not a.get('comprobado') for i, a in ausencias['ids'].items())):
            raise ValueError('Ausencias sin cita ni comprobación acreditadas')
        respuesta = datos.get('respuesta_completa')
        if respuesta is None:
            continue
        d = n['documentos'].get(respuesta.get('documento'), {})
        c = d.get('contenido', {})
        if d.get('clase') == 'inventario_cultural_acotado':
            if (fuente not in CULTURA or fuente in TIPOS or d.get('fuente') != fuente
                    or not d.get('url') or c.get('tipo_externo') != CULTURA[fuente].TIPO_EXTERNO
                    or not _acotado_valido(c, recogida=False)):
                raise ValueError('Respuesta cultural sin inventario acotado acreditado')
            if tiempos.instante(respuesta['comprobado']) < tiempos.instante(c['observado']):
                raise ValueError('Comprobación anterior al inventario cultural')
            for e in c['despublicados'].values():
                if not e.get('observado') or tiempos.instante(e['observado']) > tiempos.instante(c['observado']):
                    raise ValueError('Despublicación sin fecha de evidencia acreditada')
            continue
        ids = c.get('ids')
        if (fuente not in TIPOS or d.get('fuente') != fuente
                or d.get('clase') != 'inventario_cultural_completo' or not d.get('url')
                or c.get('tipo_externo') != TIPOS[fuente] or not isinstance(ids, list)
                or any(not isinstance(i, str) or not i for i in ids) or ids != sorted(set(ids))):
            raise ValueError('Respuesta completa cultural sin inventario acreditado')
        if tiempos.instante(respuesta['comprobado']) < tiempos.instante(c['observado']):
            raise ValueError('Comprobación anterior al inventario cultural')


def referencias_ausentes(n):
    contenidos = {f: n['documentos'][d['respuesta_completa']['documento']]['contenido']
                   for f, d in n['fuentes'].items() if d.get('respuesta_completa')}
    inventarios = {f: set(c['ids']) for f, c in contenidos.items() if c.get('alcance') != 'ids_comprobados'}
    # La retirada afecta a la celebración, incluidos sus alias castellanos.
    acotadas = {(r['proveedor'], nucleo.clave(r['destino'])) for r in n['referencias'].values()
                if r['proveedor'] in contenidos
                and contenidos[r['proveedor']].get('alcance') == 'ids_comprobados'
                and r['tipo_externo'] == contenidos[r['proveedor']]['tipo_externo']
                and r['id_externo'] in contenidos[r['proveedor']]['despublicados']}
    # Atletismo: citas cuya ficha ya no sostiene la fecha guardada (atletismo_recogida),
    # con las sesiones de su programa (ID externo JSON [competición, sesión]).
    retiradas = {f: d['ausencias'] for f, d in n['fuentes'].items() if d.get('ausencias')}

    def retirada(r):
        ids = retiradas[r['proveedor']]['ids']
        if r['contexto'] != {}:
            return False
        if r['tipo_externo'] == retiradas[r['proveedor']]['tipo_externo']:
            return r['id_externo'] in ids
        if r['tipo_externo'] != 'sesion':
            return False
        try:
            competicion = json.loads(r['id_externo'])[0]
        except (ValueError, TypeError, IndexError, KeyError):
            return False
        return isinstance(competicion, str) and competicion in ids

    return {i for i, r in n['referencias'].items() if r['proveedor'] in inventarios
            and r['tipo_externo'] == TIPOS[r['proveedor']]
            and r['id_externo'] not in inventarios[r['proveedor']]
            or (r['proveedor'], nucleo.clave(r['destino'])) in acotadas
            or r['proveedor'] in retiradas and retirada(r)}
