"""Generación de portadas, slices e índices locales para publicar en R2."""

from collections import defaultdict
from datetime import datetime, timedelta
import json
import os

from . import catalogo, config
from .fechas import _dia_iso, _fecha_agrupacion_dt, _fecha_visible_iso
from .formatos import (
    _build_hashes_prev,
    _ficheros_de_inventario,
    _noticia_a_formato_corto,
    _orden_estable,
    _repartir_dias,
    _resumen_publico,
    _tabla_medios_de,
)
from .historico import _dedup_resumen, deduplicar_editorial
from .texto import _hash_payload, _slug_grupo


_FICHEROS_ESCRITOS = set()


def _marcar_escrito(path):
    _FICHEROS_ESCRITOS.add(os.path.abspath(path))


def _generar_slice(items, fecha, sufijo, ahora):
    """Slice genérico para 'all' y 'g-<grupo>'.
    sufijo = '' → nombre 'YYYY-MM-DD-<hash>.json'
    sufijo = 'g-galicia' → 'YYYY-MM-DD-g-galicia-<hash>.json'
    """
    items_dedup = deduplicar_editorial(items)
    payload = {
        'fecha': fecha,
        'generado': ahora.isoformat(timespec='seconds'),
        'medios': catalogo._tabla_medios_slice(items_dedup),
        'noticias': [_noticia_a_formato_corto(n, fecha) for n in items_dedup],
    }
    hash_ = _hash_payload(payload)
    if sufijo:
        filename = f'{fecha}-{sufijo}-{hash_}.json'
    else:
        filename = f'{fecha}-{hash_}.json'
    return filename, hash_, payload, len(items_dedup)


def _generar_slice_dominio(items, fecha, dominio, ahora):
    """Slice por dominio. Nombre estable, sin hash."""
    items_dedup = deduplicar_editorial(items)
    payload = {
        'fecha': fecha,
        'generado': ahora.isoformat(timespec='seconds'),
        'medios': catalogo._tabla_medios_slice(items_dedup),
        'noticias': [_noticia_a_formato_corto(n, fecha) for n in items_dedup],
    }
    hash_ = _hash_payload(payload)
    filename = f'd-{dominio}-{fecha}.json'
    return filename, hash_, payload, len(items_dedup)


def _escribir_slice_si_hace_falta(path, hash_actual, hash_previo='',
                                  payload=None, kb_previo=0.0):
    """
    Escribe solo si el contenido cambió respecto al run anterior.
    Si hash_previo == hash_actual → no serializa, no escribe, devuelve
    el kb previo del inventario.
    """
    if hash_previo and hash_previo == hash_actual:
        return kb_previo, True

    if payload is None:
        raise ValueError("payload requerido cuando hay que escribir")

    blob = json.dumps(payload, ensure_ascii=False,
                      separators=(',', ':')).encode('utf-8')
    with open(path, 'wb') as f:
        f.write(blob)
    _marcar_escrito(path)
    return len(blob) / 1024, False


def generar_troceados(noticias_pre_dedup, ahora, portada_info=None,
                      inventario_prev=None, portadas_info=None):
    """
    Genera inventario.json + manifest.json + slices. Los slices cuyo hash
    coincida con el del inventario previo no se escriben (por tanto no se
    subirán a R2).

    Devuelve: inventario (dict)
    """
    inventario_prev = inventario_prev or {}
    hoy_str = ahora.strftime('%Y-%m-%d')
    generado_iso = ahora.isoformat(timespec='seconds')

    # ── Compat: migrar inventario previo del formato viejo ──
    if inventario_prev and not inventario_prev.get('dias') and inventario_prev.get('ficheros'):
        print(f"[compat] migrando inventario previo ({len(inventario_prev['ficheros'])} ficheros)")
        dias_migrados = []
        for f in inventario_prev['ficheros']:
            dias_migrados.append({
                'fecha': f.get('fecha', ''),
                'all': {'file': f.get('file', ''), 'n': f.get('n', 0),
                        'hash': f.get('hash', ''), 'kb': f.get('kb', 0)},
                'grupos': {},
                'dominios': {},
                'archivo': True,
            })
        inventario_prev = {'dias': dias_migrados}

    hashes_prev = _build_hashes_prev(inventario_prev)
    entradas_prev = {d['fecha']: d for d in inventario_prev.get('dias', [])}

    por_dia = defaultdict(list)
    for n in noticias_pre_dedup:
        dia = _dia_iso(_fecha_visible_iso(n, ahora), hoy_str)
        por_dia[dia].append(n)

    dias_manifest = []
    total_kb = 0.0
    escritos = reusados = congelados = 0

    for dia in sorted(por_dia.keys(), reverse=True):
        items_dia = por_dia[dia]
        try:
            fecha_dia = datetime.strptime(dia, '%Y-%m-%d').date()
            dias_atras = (ahora.date() - fecha_dia).days
        except ValueError:
            dias_atras = 0
        congelado = dias_atras > config.VENTANA_GRACIA_DIAS

        if congelado and dia in entradas_prev:
            entrada_dia = entradas_prev[dia]
            dias_manifest.append(entrada_dia)
            congelados += 1
            for f in [entrada_dia.get('all')] \
                    + list(entrada_dia.get('grupos', {}).values()) \
                    + list(entrada_dia.get('dominios', {}).values()):
                if f:
                    total_kb += f.get('kb', 0)
            continue

        items_dia.sort(key=_orden_estable)

        # ALL
        fn_all, h_all, pl_all, n_all = _generar_slice(items_dia, dia, '', ahora)
        h_prev_all, kb_prev_all = hashes_prev.get((dia, 'all'), ('', 0.0))
        size_all, reusado_all = _escribir_slice_si_hace_falta(
            os.path.join(config.DATOS_DIR, fn_all), h_all, h_prev_all,
            payload=pl_all, kb_previo=kb_prev_all)
        escritos += 0 if reusado_all else 1
        reusados += 1 if reusado_all else 0
        total_kb += size_all

        entrada_dia = {
            'fecha': dia,
            'all': {'file': fn_all, 'n': n_all, 'hash': h_all, 'kb': round(size_all, 1)},
            'grupos': {},
            'dominios': {},
        }

        # GRUPOS
        por_grupo = defaultdict(list)
        for n in items_dia:
            g = n.get('grupo', '')
            if g:
                por_grupo[g].append(n)

        for grupo, items_g in por_grupo.items():
            sufijo = f'g-{_slug_grupo(grupo)}'
            fn_g, h_g, pl_g, n_g = _generar_slice(items_g, dia, sufijo, ahora)
            h_prev_g, kb_prev_g = hashes_prev.get((dia, sufijo), ('', 0.0))
            size_g, reusado_g = _escribir_slice_si_hace_falta(
                os.path.join(config.DATOS_DIR, fn_g), h_g, h_prev_g,
                payload=pl_g, kb_previo=kb_prev_g)
            escritos += 0 if reusado_g else 1
            reusados += 1 if reusado_g else 0
            total_kb += size_g
            entrada_dia['grupos'][grupo] = {
                'file': fn_g, 'n': n_g, 'hash': h_g, 'kb': round(size_g, 1),
            }

        # DOMINIOS
        por_dominio = defaultdict(list)
        for n in items_dia:
            d = n.get('dominio', '')
            if d:
                por_dominio[d].append(n)

        for dominio, items_d in por_dominio.items():
            fn_d, h_d, pl_d, n_d = _generar_slice_dominio(items_d, dia, dominio, ahora)
            h_prev_d, kb_prev_d = hashes_prev.get((dia, f'd-{dominio}'), ('', 0.0))
            size_d, reusado_d = _escribir_slice_si_hace_falta(
                os.path.join(config.DATOS_DIR, fn_d), h_d, h_prev_d,
                payload=pl_d, kb_previo=kb_prev_d)
            escritos += 0 if reusado_d else 1
            reusados += 1 if reusado_d else 0
            total_kb += size_d
            entrada_dia['dominios'][dominio] = {
                'file': fn_d, 'n': n_d, 'hash': h_d, 'kb': round(size_d, 1),
            }

        dias_manifest.append(entrada_dia)

    fechas_presentes = {d['fecha'] for d in dias_manifest}
    for d_prev in inventario_prev.get('dias', []):
        if d_prev['fecha'] in fechas_presentes:
            continue
        dias_manifest.append(d_prev)

    ventana, archivo = _repartir_dias(
        dias_manifest, inventario_prev.get('archivo', []), ahora.date())

    inventario = {
        'generado': generado_iso,
        'dias': ventana,
        'archivo': archivo,
    }
    manifest = {
        'generado': generado_iso,
        'generado_legible': ahora.strftime('%d/%m/%Y %H:%M'),
        'hoy': hoy_str,
        'n_feed': config.N_FEED,
        'dias_ventana': config.DIAS_VENTANA,
        'dias_archivo': config.DIAS_ARCHIVO,
        **_resumen_publico(ventana, archivo),
        'catalogo': catalogo._catalogo_completo(),
    }
    for destino in (inventario, manifest):
        if portada_info:
            destino['portada'] = portada_info
        if portadas_info:
            destino['portadas'] = portadas_info

    for path, datos in ((config.INVENTARIO_PATH, inventario), (config.MANIFEST_PATH, manifest)):
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(datos, f, ensure_ascii=False, separators=(',', ':'))
        _marcar_escrito(path)
    _limpiar_huerfanos_locales(inventario)

    print(f"[troceado] {len(ventana)} días + {len(archivo)} en archivo · "
          f"{escritos} escritos · {reusados} reusados · "
          f"{congelados} congelados · {total_kb:.1f} KB · "
          f"{_dedup_resumen()}")

    return inventario


def _limpiar_huerfanos_locales(inventario):
    validos = {'manifest.json', 'inventario.json'} | _ficheros_de_inventario(inventario)

    eliminados = 0
    for nombre in os.listdir(config.DATOS_DIR):
        if not nombre.endswith('.json'):
            continue
        if nombre in validos:
            continue
        try:
            os.remove(os.path.join(config.DATOS_DIR, nombre))
            eliminados += 1
        except OSError:
            pass
    if eliminados:
        print(f"[troceado] {eliminados} huérfanos locales borrados")


def _seleccionar_con_cupo(items, max_items, clave):
    """
    Elige hasta max_items repartiendo entre medios: cada medio aporta sus K
    noticias más recientes, con K el mayor que cabe; el hueco que quede se
    rellena con la siguiente de cada medio, por recencia.

    Cortar por recencia sin más deja la portada en la última hora y en manos
    de los medios que más publican (o de un feed sin fechas que entra entero
    como «de ahora»). Con cupo entran todos los que publicaron en la ventana.
    """
    if len(items) <= max_items:
        return sorted(items, key=clave, reverse=True)

    por_medio = defaultdict(list)
    for n in items:
        por_medio[n.get('dominio', '')].append(n)
    listas = list(por_medio.values())
    for v in listas:
        v.sort(key=clave, reverse=True)

    k = 0
    while sum(min(len(v), k + 1) for v in listas) <= max_items:
        k += 1
    elegidas = [n for v in listas for n in v[:k]]
    siguientes = sorted((v[k] for v in listas if len(v) > k),
                        key=clave, reverse=True)
    elegidas.extend(siguientes[:max_items - len(elegidas)])
    elegidas.sort(key=clave, reverse=True)
    return elegidas


def generar_portada(noticias, ahora, horas=config.PORTADA_HORAS, max_items=config.PORTADA_MAX,
                    prefix='portada'):
    """
    Genera <prefix>-<hash>.json con las noticias de las últimas `horas`,
    hasta `max_items` repartidas con cupo por medio.

    - prefix='portada'          → portada general
    - prefix='portada-<slug>'   → portada de una edición (EDICIONES)
    """
    corte = ahora - timedelta(hours=horas)
    # Misma fecha para filtrar y para ordenar: con _fecha_orden las noticias
    # con fecha futura (mal fechadas por el medio) se colaban arriba.
    clave = lambda n: _fecha_agrupacion_dt(n, ahora) or corte
    recientes = [n for n in noticias if clave(n) >= corte]
    recientes = _seleccionar_con_cupo(recientes, max_items, clave)

    # Dedup editorial (mismo comportamiento que la portada completa)
    recientes = deduplicar_editorial(recientes)

    generado_iso = ahora.isoformat(timespec='seconds')
    payload = {
        'generado': generado_iso,
        'horas':    horas,
        'medios':   _tabla_medios_de(recientes),
        'noticias': [_noticia_a_formato_corto(n) for n in recientes],
    }

    hash_ = _hash_payload(payload)
    filename = f'{prefix}-{hash_}.json'
    path = os.path.join(config.DATOS_DIR, filename)

    if os.path.exists(path):
        reusado = True
    else:
        blob = json.dumps(payload, ensure_ascii=False,
                          separators=(',', ':')).encode('utf-8')
        with open(path, 'wb') as f:
            f.write(blob)
        _marcar_escrito(path)
        reusado = False

    try:
        size_kb = os.path.getsize(path) / 1024
    except OSError:
        size_kb = 0.0

    estado = "reusada" if reusado else "escrita"
    print(f"[{prefix}] {len(recientes)} noticias · {size_kb:.1f} KB · {estado}")

    return {
        'file': filename,
        'hash': hash_,
        'n':    len(recientes),
        'kb':   round(size_kb, 1),
    }
