"""Modalidad común de atletismo a partir de los literales de cada fuente.

La tabla compartida (shared/calendario/atletismo-modalidades.json) es la única
interpretación de los literales: la usan el comparador y la publicación; el
frontal y los workers reciben los códigos ya calculados.
"""
from functools import lru_cache
import json
from pathlib import Path
import re
import unicodedata

RUTA = Path(__file__).resolve().parent.parent / 'shared' / 'calendario' / 'atletismo-modalidades.json'


def clave(literal):
    s = ''.join(c for c in unicodedata.normalize('NFD', literal.lower()) if unicodedata.category(c) != 'Mn')
    return ' '.join(re.findall(r'[a-z0-9]+', s))


@lru_cache(maxsize=1)
def tabla():
    datos = json.loads(RUTA.read_text(encoding='utf-8'))
    if datos.get('version') != 1:
        raise ValueError('Versión de modalidades de atletismo desconocida')
    codigos = datos['modalidades']
    if len(set(codigos)) != len(codigos):
        raise ValueError('Modalidad repetida')
    for literal, codigo in datos['literales'].items():
        if clave(literal) != literal or codigo is not None and codigo not in codigos:
            raise ValueError('Literal de modalidad inválido: ' + literal)
    return tuple(codigos), dict(datos['literales'])


def literales(metadatos):
    """Literales de modalidad de una cita, por campo de cada fuente."""
    m = metadatos or {}
    salida = [m.get('modalidad_literal') or '']
    salida += [c.get('nombre') or '' for c in m.get('categorias') or [] if isinstance(c, dict)]
    # WA: varias disciplinas en una cadena separada por comas.
    salida += (m.get('disciplines') or '').split(',') if isinstance(m.get('disciplines'), str) else []
    return [x for x in (s.strip() for s in salida) if x]


def de(metadatos):
    """(códigos, literales desconocidos). Un literal conocido sin modalidad no da código."""
    _, conocidos = tabla()
    codigos, desconocidos = set(), []
    for literal in literales(metadatos):
        k = clave(literal)
        if k not in conocidos:
            desconocidos.append(literal)
        elif conocidos[k]:
            codigos.add(conocidos[k])
    return codigos, desconocidos


def de_variantes(variantes):
    """Unión de las variantes publicadas. El «Tipo» de Nivel II no tiene autoridad:
    solo cuenta si ninguna otra fuente acredita modalidad."""
    propias = [de(v)[0] for v in variantes if 'nivel_ii' not in (v or {})]
    union = set().union(*propias) if propias else set()
    if not union:
        union = set().union(set(), *(de(v)[0] for v in variantes if 'nivel_ii' in (v or {})))
    orden = tabla()[0]
    return sorted(union, key=orden.index)
