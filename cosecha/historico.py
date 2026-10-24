"""Relectura, fusión y deduplicación del histórico y persistencia de state."""

from collections import defaultdict
from datetime import datetime, timedelta
import json
import os
import re
import unicodedata

from . import config
from .fechas import (_es_dia, _fecha_agrupacion_dt, _fecha_orden,
                     _parse_iso_flexible, _reconstruir_fecha)
from .texto import _limpiar_cdata, _url_corta


# Titulares programáticos: se filtran al fusionar para cubrir todas las
# fuentes y limpiar también el histórico. Mantener los patrones estrechos:
# «el tiempo» a secas también aparece en noticias reales.
DROP_PATTERNS = [
    ('meteo_localidad', re.compile(
        r'^el tiempo en .+?:\s*previsi[oó]n meteorol[oó]gica\s+'
        r'para\s+(?:hoy|mañana)\b',
        re.IGNORECASE)),
]
_DROP_STATS = {nombre: 0 for nombre, _ in DROP_PATTERNS}


def _descartar_por_plantilla(n):
    """Devuelve True si el titular del item casa con alguna plantilla."""
    tit = (n.get('titular') or '').strip()
    if not tit:
        return False
    for nombre, rx in DROP_PATTERNS:
        if rx.match(tit):
            _DROP_STATS[nombre] += 1
            return True
    return False


def _drop_reset():
    for k in _DROP_STATS:
        _DROP_STATS[k] = 0


def _drop_resumen():
    partes = [f"{k}: {v}" for k, v in _DROP_STATS.items() if v]
    return ' · '.join(partes) if partes else ''


def cargar_historico_payload():
    """
    Carga el histórico desde:
      - state.json (solo estado: ultimo_exito_por_medio, generado,
        ultimo_barrido_r2)
      - public/datos/inventario.json + public/datos/*.json (noticias)
    Reconstruye las noticias al formato largo.
    """
    state = {
        'generado': None,
        'ultimo_exito_por_medio': {},
        'ultimo_barrido_r2': '',
    }
    if os.path.exists(config.STATE_PATH):
        try:
            with open(config.STATE_PATH, encoding='utf-8') as f:
                s = json.load(f) or {}
                state['generado'] = s.get('generado')
                state['ultimo_exito_por_medio'] = s.get('ultimo_exito_por_medio', {}) or {}
                state['ultimo_barrido_r2'] = s.get('ultimo_barrido_r2', '') or ''
        except Exception as e:
            print(f"[state] no se pudo leer: {e}")

    noticias = []
    if os.path.exists(config.INVENTARIO_PATH):
        try:
            with open(config.INVENTARIO_PATH, encoding='utf-8') as f:
                inventario = json.load(f)
            if not state['generado']:
                state['generado'] = inventario.get('generado')

            # Recolectar ficheros 'all' de los días dentro de la ventana de
            # retención. Los días más antiguos quedan en R2 pero no se
            # reconstruyen en memoria (serían descartados por el merge).
            corte = (datetime.now(config.TZ_MADRID)
                     - timedelta(days=config.DIAS_RETENCION)).strftime('%Y-%m-%d')

            ficheros_a_leer = []
            for d_info in inventario.get('dias', []):
                if d_info.get('fecha', '') < corte:
                    continue
                if d_info.get('all') and d_info['all'].get('file'):
                    ficheros_a_leer.append(d_info['all'])
            # Compat: si no hay 'dias', usar 'ficheros' filtrado
            if not ficheros_a_leer:
                ficheros_a_leer = [
                    f for f in inventario.get('ficheros', [])
                    if f.get('fecha', '') >= corte
                ]

            for f_info in ficheros_a_leer:
                fn = f_info.get('file')
                if not fn:
                    continue
                path = os.path.join(config.DATOS_DIR, fn)
                if not os.path.exists(path):
                    continue
                # Un día de la ventana que no se lee se reescribiría sin sus
                # noticias: mejor parar.
                try:
                    with open(path, encoding='utf-8') as f2:
                        d = json.load(f2)
                except Exception as e:
                    raise SystemExit(f"[historico!] {fn} ilegible: {e}")
                dia = d.get('fecha', '')
                generado_iso_del_fichero = d.get('generado', '')
                medios_tabla = d.get('medios', {}) or {}
                for n in d.get('noticias', []) or []:
                    dom = n.get('d', '')
                    m_info = medios_tabla.get(dom, {}) or {}

                    # Fecha: formato viejo (ISO completo) o nuevo (HH:MM)
                    # Sin `c` (ficheros de antes): el generado del fichero.
                    p_iso = _reconstruir_fecha(n.get('p', ''), dia)
                    e_iso = _reconstruir_fecha(n.get('e', ''), dia)
                    c_raw = (_reconstruir_fecha(n.get('c', ''), dia)
                             or generado_iso_del_fichero)

                    # URL: formato viejo (completa) o nuevo (path)
                    u_raw = n.get('u', '')
                    if u_raw.startswith('http://') or u_raw.startswith('https://'):
                        u_iso = u_raw
                    elif u_raw.startswith('/'):
                        u_iso = f"https://{dom}{u_raw}"
                    else:
                        u_iso = u_raw

                    noticias.append({
                        'medio':          m_info.get('n', ''),
                        'dominio':        dom,
                        'grupo':          m_info.get('g', ''),
                        'tipo':           m_info.get('t', ''),
                        'lang':           m_info.get('l', ''),
                        'tags':           m_info.get('tags', []) or [],
                        'titular':        n.get('t', ''),
                        'enlace':         u_iso,
                        'fecha_pub':      p_iso,
                        'dia_pub':        n['p'] if _es_dia(n.get('p')) else '',
                        'fecha_estimada': e_iso,
                        'fuente':         n.get('f', ''),
                        'fecha':          c_raw,
                        '_host':          m_info.get('h', ''),
                    })

                    # ── Reconstruir los 'alt' como noticias independientes ──
                    # Sin esto, los titulares repetidos que viven en 'a' se
                    # pierden entre runs y el día al que pertenecen salta.
                    for alt_item in (n.get('a') or []):
                        dom_alt = alt_item.get('d', '')
                        u_alt   = alt_item.get('u', '')
                        if not u_alt:
                            continue

                        m_alt = medios_tabla.get(dom_alt, {}) or {}

                        if u_alt.startswith('http://') or u_alt.startswith('https://'):
                            enlace_alt = u_alt
                        elif u_alt.startswith('/'):
                            host_alt = m_alt.get('h') or f"www.{dom_alt}"
                            enlace_alt = f"https://{host_alt}{u_alt}"
                        else:
                            enlace_alt = u_alt

                        # Con `c` trae sus propias fechas; sin él es del
                        # formato anterior y hereda las del representante.
                        if 'c' in alt_item:
                            dia_alt = alt_item['p'] if _es_dia(alt_item.get('p')) else ''
                            p_alt = _reconstruir_fecha(alt_item.get('p', ''), dia)
                            e_alt = _reconstruir_fecha(alt_item.get('e', ''), dia)
                            c_alt = _reconstruir_fecha(alt_item['c'], dia)
                        else:
                            p_alt, e_alt, c_alt = p_iso, e_iso, c_raw
                            dia_alt = ''

                        noticias.append({
                            'medio':          m_alt.get('n', ''),
                            'dominio':        dom_alt,
                            'grupo':          m_alt.get('g', ''),
                            'tipo':           m_alt.get('t', ''),
                            'lang':           m_alt.get('l', ''),
                            'tags':           m_alt.get('tags', []) or [],
                            'titular':        alt_item.get('t') or n.get('t', ''),
                            'enlace':         enlace_alt,
                            'fecha_pub':      p_alt,
                            'dia_pub':        dia_alt,
                            'fecha_estimada': e_alt,
                            'fuente':         alt_item.get('f') or n.get('f', ''),
                            'fecha':          c_alt,
                            '_host':          m_alt.get('h', ''),
                        })
        except Exception as e:
            raise SystemExit(f"[historico!] no se pudo leer el troceado: {e}")

    print(f"[historico] {len(noticias)} noticias reconstruidas desde {config.DATOS_DIR}")
    return {
        'noticias': noticias,
        'generado': state['generado'],
        'ultimo_exito_por_medio': state['ultimo_exito_por_medio'],
        'ultimo_barrido_r2': state['ultimo_barrido_r2'],
    }


_DEDUP_STATS = {'colapsados': 0, 'alt': 0, 'slices': 0}
_DEDUP_VERBOSE = os.environ.get('VOCEIRO_DEBUG') == '1'


def _dedup_reset():
    _DEDUP_STATS['colapsados'] = 0
    _DEDUP_STATS['alt'] = 0
    _DEDUP_STATS['slices'] = 0


def _dedup_resumen():
    s = _DEDUP_STATS
    return (f"{s['colapsados']} titulares colapsados en {s['slices']} slices"
            f" · {s['alt']} alt")


def _alternativa(o, rep):
    alt = {'d': o.get('dominio', ''),
           'u': _url_corta(o.get('enlace', ''), o.get('dominio', ''))}
    # Su titular solo si no es idéntico: agrupan los normalizados, y con el
    # del representante no casaría con su feed al releerla.
    if o.get('titular') and o['titular'] != rep.get('titular'):
        alt['t'] = o['titular']
    for corto, largo in (('p', 'fecha_pub'), ('e', 'fecha_estimada'), ('c', 'fecha')):
        if o.get(largo):
            alt[corto] = o[largo]
    if not alt.get('p') and o.get('dia_pub'):
        alt['p'] = o['dia_pub']
    if o.get('fuente') and o.get('fuente') != rep.get('fuente'):
        alt['f'] = o['fuente']
    return alt


def deduplicar_editorial(noticias):
    """
    Agrupa noticias por titular normalizado. De cada grupo deja un
    representante (el de mejor fecha) y guarda los demás como campo
    'alt' compacto: [{'d': dominio, 'u': url, 'p'/'e'/'c': ISO, 'f', 't'}, ...]
    con sus propias fechas, y la fuente y el titular si no son los del
    representante.

    El representante es una copia: la misma noticia pasa por varios slices
    (all, grupo, dominio, portada) y un 'alt' de uno no debe colarse en otro.

    Reduce ~25% el JSON y elimina el trabajo de dedup en el frontend.
    """
    import unicodedata
    from collections import defaultdict

    def norm_tit(s):
        s = (s or '').lower()
        s = unicodedata.normalize('NFD', s)
        s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
        return ''.join(c for c in s if c.isalnum())

    def score(n):
        # Preferimos: con fecha_pub > con fecha_estimada > con fecha > resto.
        # Empate → más reciente.
        tiene_pub = 1 if n.get('fecha_pub') else 0
        tiene_est = 1 if n.get('fecha_estimada') else 0
        dt = _fecha_orden(n)
        ts = dt.timestamp() if dt else 0
        return (tiene_pub, tiene_est, ts)

    grupos = defaultdict(list)
    for n in noticias:
        key = norm_tit(n.get('titular', ''))
        if not key:
            # Sin título → no agrupar (id único por objeto)
            grupos[f'__solo_{id(n)}__'].append(n)
            continue
        grupos[key].append(n)

    salida = []
    grupos_colapsados = 0
    items_ocultos = 0

    for key, items in grupos.items():
        if len(items) == 1:
            salida.append(items[0])
            continue

        items.sort(key=score, reverse=True)
        otros = items[1:]
        rep = {**items[0], 'alt': [_alternativa(o, items[0]) for o in otros]}
        salida.append(rep)
        grupos_colapsados += 1
        items_ocultos += len(otros)

    if grupos_colapsados:
        _DEDUP_STATS['colapsados'] += grupos_colapsados
        _DEDUP_STATS['alt'] += items_ocultos
        _DEDUP_STATS['slices'] += 1
        if _DEDUP_VERBOSE:
            print(f"[dedup] {grupos_colapsados} titulares colapsados "
                  f"· {items_ocultos} noticias referenciadas como 'alt'")

    return salida


def fusionar_historico(nuevas, viejas, dias):
    """
    Fusiona nuevas con viejas y filtra por ventana de retención usando la
    fecha de AGRUPACIÓN (no la de recolección). Descarta:
      - noticias que casan con DROP_PATTERNS (meteo por localidad, etc.)
      - noticias con fecha de agrupación anterior a la ventana
      - noticias sin ninguna fecha válida
    """
    corte = datetime.now(config.TZ_MADRID) - timedelta(days=dias)
    idx = {}

    # Viejas: filtrar por plantilla y por fecha de agrupación
    for n in viejas:
        # Los títulos ya publicados con marcado deben usar la misma clave
        # que los títulos limpios del feed para no duplicarse en este run.
        if '<' in n.get('titular', '') and '>' in n['titular']:
            n['titular'] = _limpiar_cdata(n['titular'])
        if _descartar_por_plantilla(n):
            continue
        f = _fecha_agrupacion_dt(n)
        if f is None or f < corte:
            continue
        idx[(n['dominio'], n['titular'])] = n

    for n in nuevas:
        if _descartar_por_plantilla(n):
            continue
        key = (n['dominio'], n['titular'])
        old = idx.get(key)
        if old:
            n['fecha'] = old.get('fecha', n['fecha'])
            # La primera fecha válida se queda: las que llegan después suelen
            # ser de actualización y moverían la noticia de hora o de día.
            if _parse_iso_flexible(old.get('fecha_pub')):
                n['fecha_pub'] = old['fecha_pub']
            if old.get('dia_pub'):
                n['dia_pub'] = old['dia_pub']
            if old.get('fecha_estimada') and not n.get('fecha_estimada'):
                n['fecha_estimada'] = old['fecha_estimada']
            n['_nueva'] = False
        else:
            n['_nueva'] = True
        n.pop('_pos', None)
        n.pop('_dia_url', None)

        # Fuera de la ventana con la fecha de ahora: también se va la copia
        # vieja, que con su fecha de antes seguiría pareciendo reciente.
        f = _fecha_agrupacion_dt(n)
        if f is None or f < corte:
            idx.pop(key, None)
            continue

        idx[key] = n

    todos = list(idx.values())
    todos.sort(key=_fecha_orden, reverse=True)
    return todos


def guardar_state(generado_iso, ultimo_exito_por_medio, ultimo_barrido_r2=''):
    payload = {
        'generado': generado_iso,
        'ultimo_exito_por_medio': ultimo_exito_por_medio or {},
        'ultimo_barrido_r2': ultimo_barrido_r2 or '',
    }
    with open(config.STATE_PATH, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))
    kb = os.path.getsize(config.STATE_PATH) / 1024
    print(f"[state] {config.STATE_PATH} · {kb:.1f} KB")
