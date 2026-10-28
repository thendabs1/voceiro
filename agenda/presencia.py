"""Presencia cultural acreditada por un catálogo completo, independiente del horario."""

from . import nucleo, tiempos
from .registro import CULTURA

TIPOS = {f: m.TIPO_EXTERNO for f, m in CULTURA.items()}
# Un catálogo cultural cambia poco de un día a otro; una caída mayor suele ser
# un fallo del proveedor (respuesta vacía o recortada) y ocultaría la fuente.
CAIDA_MAXIMA = 0.3


class InventarioDesplomado(ValueError):
    """El inventario cae más de CAIDA_MAXIMA: se conserva el anterior."""


def registrar(n, fuente, ids, observado, url, *, aceptar_caida=False):
    """Registra el inventario vigente; repetirlo solo actualiza la comprobación.

    Los IDs proceden de todas las páginas, antes de filtrar la ventana temporal.
    La ausencia no modifica las observaciones de la cita ni declara cancelación.
    Una caída mayor que CAIDA_MAXIMA exige aceptar_caida; si el total se
    mantiene pero desaparece esa proporción de IDs anteriores, solo avisa.
    """
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
        respuesta = datos.get('respuesta_completa')
        if respuesta is None:
            continue
        d = n['documentos'].get(respuesta.get('documento'), {})
        c = d.get('contenido', {})
        ids = c.get('ids')
        if (fuente not in TIPOS or d.get('fuente') != fuente
                or d.get('clase') != 'inventario_cultural_completo' or not d.get('url')
                or c.get('tipo_externo') != TIPOS[fuente] or not isinstance(ids, list)
                or any(not isinstance(i, str) or not i for i in ids) or ids != sorted(set(ids))):
            raise ValueError('Respuesta completa cultural sin inventario acreditado')
        if tiempos.instante(respuesta['comprobado']) < tiempos.instante(c['observado']):
            raise ValueError('Comprobación anterior al inventario cultural')


def referencias_ausentes(n):
    inventarios = {f: set(n['documentos'][d['respuesta_completa']['documento']]['contenido']['ids'])
                   for f, d in n['fuentes'].items() if d.get('respuesta_completa')}
    return {i for i, r in n['referencias'].items() if r['proveedor'] in inventarios
            and r['tipo_externo'] == TIPOS[r['proveedor']]
            and r['id_externo'] not in inventarios[r['proveedor']]}
