"""Catálogo de medios para slices y ediciones, cargado bajo demanda."""

from medios import todos_los_medios
from shared.territorios import territorios_medio


_MEDIOS_POR_DOMINIO = None


def _territorio_medio(medio):
    datos = {k: medio[k] for k in ('region', 'pais', 'ambito') if medio.get(k)}
    relaciones = territorios_medio(medio)
    if relaciones:
        datos['territorios'] = relaciones
    return datos


def _init_medios_por_dominio():
    global _MEDIOS_POR_DOMINIO
    if _MEDIOS_POR_DOMINIO is not None:
        return
    _MEDIOS_POR_DOMINIO = {m['d']: m for m in todos_los_medios()}


def _tabla_medios_slice(items):
    """Tabla {dominio: {n,g,t,l,tags,h}} para un slice.
    Incluye dominios referenciados en 'alt'."""
    _init_medios_por_dominio()
    medios = {}
    hosts = {}

    def _reg(d, nombre='', grupo='', tipo='', lang='', tags=None, host=''):
        if not d:
            return
        if d not in medios:
            medios[d] = {
                'n': nombre, 'g': grupo, 't': tipo,
                'l': lang, 'tags': tags or [],
                **_territorio_medio(_MEDIOS_POR_DOMINIO.get(d, {})),
            }
        if host and d not in hosts:
            hosts[d] = host

    for n in items:
        _reg(n.get('dominio',''), n.get('medio',''), n.get('grupo',''),
             n.get('tipo',''), n.get('lang',''), n.get('tags', []),
             n.get('_host',''))
        for alt in (n.get('alt') or []):
            d_alt = alt.get('d','')
            if not d_alt:
                continue
            m = _MEDIOS_POR_DOMINIO.get(d_alt, {})
            _reg(d_alt,
                 m.get('n',''), m.get('grupo',''),
                 m.get('type',''), m.get('lang',''), m.get('tags', []),
                 '')  # sin host; el cliente cae al fallback `www.<dominio>`

    for d, h in hosts.items():
        medios[d]['h'] = h
    return dict(sorted(medios.items()))


def _catalogo_completo():
    """Catálogo COMPLETO de medios (los 346 de medios.py), independiente
    de lo que se haya recolectado este run. Se embebe en el manifest para
    que el frontend pueda poblar MEDIOS_UNICOS sin depender de la portada.
    """
    _init_medios_por_dominio()
    out = {}
    for d, m in _MEDIOS_POR_DOMINIO.items():
        out[d] = {
            'n':    m.get('n', ''),
            'g':    m.get('grupo', ''),
            't':    m.get('type', ''),
            'l':    m.get('lang', ''),
            'tags': m.get('tags', []),
            **_territorio_medio(m),
        }
    return dict(sorted(out.items()))


def _filtrar_edicion(noticias, edicion):
    """Noticias de los medios que entran en una edición (ver EDICIONES)."""
    _init_medios_por_dominio()
    regiones = set(edicion.get('regiones') or [])
    ambito = edicion.get('ambito')
    out = []
    for n in noticias:
        m = _MEDIOS_POR_DOMINIO.get(n.get('dominio', ''))
        if not m:
            continue
        if regiones and m.get('region') in regiones:
            out.append(n)
        elif ambito and m.get('ambito') == ambito:
            out.append(n)
    return out
