"""Formato corto e índices de la ventana y el archivo, sin escrituras."""

from collections import defaultdict
from datetime import timedelta

from . import config
from .fechas import _fecha_corta, _fecha_orden, _hhmm
from .texto import _slug_grupo, _url_corta


def _noticia_a_formato_corto(n, dia=None):
    """`c` es la primera recogida: no cambia entre runs (fusionar_historico
    la conserva) y es la hora de las noticias sin p ni e. Las alternativas
    llevan sus propias fechas: al releerlas no heredan las del representante."""
    out = {
        'd': n.get('dominio', ''),
        't': n.get('titular', ''),
        'u': _url_corta(n.get('enlace', ''), n.get('dominio', '')),
        'f': n.get('fuente', ''),
    }
    p = _fecha_corta(n.get('fecha_pub', ''), dia)
    e_iso = n.get('fecha_estimada', '')
    e = e_iso if dia is None else (_hhmm(e_iso) if e_iso else '')
    c = _fecha_corta(n.get('fecha', ''), dia)

    if p:
        out['p'] = p
    if e:
        out['e'] = e
    if c:
        out['c'] = c
    alt = n.get('alt')
    if alt:
        out['a'] = [{k: (_fecha_corta(v, dia) if k in ('p', 'e', 'c') else v)
                     for k, v in o.items()} for o in alt]
    return out


def _tabla_medios_de(items):
    """Construye {dominio: {n,g,t,l,tags,h}} a partir de las noticias."""
    medios = {}
    hosts = {}
    for n in items:
        d = n.get('dominio')
        if not d:
            continue
        if d not in medios:
            medios[d] = {
                'n':    n.get('medio', ''),
                'g':    n.get('grupo', ''),
                't':    n.get('tipo', ''),
                'l':    n.get('lang', ''),
                'tags': n.get('tags', []),
            }
        h = n.get('_host')
        if h and d not in hosts:
            hosts[d] = h
    for d, h in hosts.items():
        medios[d]['h'] = h
    return dict(sorted(medios.items()))


def _orden_estable(n):
    """Clave de orden determinista: fecha DESC, luego dominio, luego titular."""
    dt = _fecha_orden(n)
    return (-dt.timestamp(), n.get('dominio', ''), n.get('titular', ''))


def _build_hashes_prev(inventario_prev):
    """Devuelve {(fecha, tipo) → (hash, kb)} desde el inventario previo.
    tipo: 'all' | 'g-<slug>' | 'd-<dominio>'."""
    out = {}
    for d in (inventario_prev or {}).get('dias', []):
        fecha = d.get('fecha', '')
        if not fecha:
            continue
        if d.get('all') and d['all'].get('hash'):
            out[(fecha, 'all')] = (d['all']['hash'], d['all'].get('kb', 0.0))
        for grupo, g in (d.get('grupos') or {}).items():
            if g.get('hash'):
                out[(fecha, f'g-{_slug_grupo(grupo)}')] = (g['hash'], g.get('kb', 0.0))
        for dom, dd in (d.get('dominios') or {}).items():
            if dd.get('hash'):
                out[(fecha, f'd-{dom}')] = (dd['hash'], dd.get('kb', 0.0))
    return out


def _corte_archivo(hoy):
    """Primer día que R2 conserva: lo anterior se borra entero."""
    return (hoy - timedelta(days=config.DIAS_ARCHIVO)).isoformat()


def _a_archivo(d):
    """Línea de archivo de un día que sale de la ventana: cuántas noticias
    tuvo. Los días de antes del troceado por medio no tienen ficheros
    d-*: conservan el fichero del día entero, que es todo lo que hay."""
    e = {'fecha': d['fecha'], 'n': (d.get('all') or {}).get('n', 0)}
    if not d.get('dominios') and (d.get('all') or {}).get('file'):
        e['all'] = d['all']['file']
    return e


def _repartir_dias(dias, archivo_prev, hoy):
    """(ventana, archivo): los DIAS_VENTANA días más recientes con todo su
    detalle y el resto, hasta DIAS_ARCHIVO atrás, en una línea por día."""
    dias = sorted(dias, key=lambda x: x['fecha'], reverse=True)
    ventana = dias[:config.DIAS_VENTANA]
    en_ventana = {d['fecha'] for d in ventana}
    corte = _corte_archivo(hoy)
    archivo = {e['fecha']: e for e in archivo_prev}
    for d in dias[config.DIAS_VENTANA:]:
        archivo[d['fecha']] = _a_archivo(d)
    archivo = [e for f, e in sorted(archivo.items(), reverse=True)
               if f not in en_ventana and f >= corte]
    return ventana, archivo


def _resumen_publico(ventana, archivo):
    """Lo que el lector necesita de los días: por día, cuántas noticias y
    el fichero de cada grupo (los de medio se deducen: d-<dominio>-<fecha>);
    la media diaria de noticias y kB por grupo y medio, para estimar una
    descarga; y el total guardado."""
    dias = []
    sumas = {'grupos': defaultdict(lambda: [0, 0.0]),
             'dominios': defaultdict(lambda: [0, 0.0])}
    con_detalle = 0
    for d in ventana:
        dias.append({
            'fecha': d['fecha'],
            'n': (d.get('all') or {}).get('n', 0),
            'grupos': {g: v['file'] for g, v in (d.get('grupos') or {}).items()},
        })
        if not d.get('dominios'):
            continue
        con_detalle += 1
        for tipo, suma in sumas.items():
            for k, v in (d.get(tipo) or {}).items():
                suma[k][0] += v.get('n', 0)
                suma[k][1] += v.get('kb', 0)
    medias = {tipo: {k: [round(n / con_detalle, 1), round(kb / con_detalle, 1)]
                     for k, (n, kb) in suma.items()}
              for tipo, suma in sumas.items()} if con_detalle else {}
    todos = dias + archivo
    return {
        'dias': dias,
        'medias': medias,
        'guardado': {
            'desde': min((x['fecha'] for x in todos), default=''),
            'dias': len(todos),
            'n': sum(x.get('n', 0) for x in todos),
        },
    }


def _ficheros_portada(manifest):
    """Ficheros de portada que referencia un manifest: general + ediciones."""
    out = set()
    p = (manifest or {}).get('portada')
    if p and p.get('file'):
        out.add(p['file'])
    for e in ((manifest or {}).get('portadas') or {}).values():
        if e and e.get('file'):
            out.add(e['file'])
    return out


def _ficheros_de_inventario(inventario):
    """Set con todos los nombres de fichero que nombra un inventario: los
    de los días de la ventana, los del día entero que guarda el archivo y
    las portadas. Los ficheros por medio del archivo no se nombran: los
    conserva _regla_archivo."""
    out = set()
    for d in (inventario or {}).get('dias', []):
        if d.get('all') and d['all'].get('file'):
            out.add(d['all']['file'])
        for g in (d.get('grupos') or {}).values():
            if g.get('file'):
                out.add(g['file'])
        for dd in (d.get('dominios') or {}).values():
            if dd.get('file'):
                out.add(dd['file'])
    for e in (inventario or {}).get('archivo', []):
        if e.get('all'):
            out.add(e['all'])
    out |= _ficheros_portada(inventario)
    return out
