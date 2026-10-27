"""Identidades territoriales comunes. Los nombres nunca resuelven identidades.

INE municipal: instantánea a 01-01-2026, no un registro de vigencias históricas.
Un código desconocido o de otro sistema queda sin resolver, sin impedir importar.
"""

from copy import deepcopy
from functools import lru_cache
import json
from pathlib import Path


CARPETA = Path(__file__).resolve().parent


class Catalogo:
    def __init__(self, administracion, municipios, paises):
        self.version = (administracion['version'], municipios['version'], paises['version'])
        self.fecha_referencia = municipios['fecha_referencia']
        self.entidades = {}
        self.codigos = {}
        for codigo, nombre, editorial in paises['paises']:
            identidad = 'pais:' + codigo
            if (not isinstance(codigo, str) or len(codigo) != 2 or not codigo.isascii() or not codigo.isalpha()
                    or codigo != codigo.upper() or identidad in self.entidades or not nombre
                    or (editorial is not None and (not editorial or ('medios:pais', editorial) in self.codigos))):
                raise ValueError('País o código editorial inválido o duplicado')
            self.entidades[identidad] = {'id': identidad, 'tipo': 'pais', 'nombre': nombre, 'padre': None}
            self.codigos['iso3166-1:alpha2', codigo] = identidad
            if editorial is not None:
                self.codigos['medios:pais', editorial] = identidad

        def agregar(tipo, codigo, nombre, padre, sistema):
            identidad = 'es:' + tipo + ':' + codigo
            if identidad in self.entidades or padre not in self.entidades or not nombre:
                raise ValueError('Territorio duplicado o sin padre/nombre')
            self.entidades[identidad] = {'id': identidad, 'tipo': tipo, 'nombre': nombre, 'padre': padre}
            self.codigos[sistema, codigo] = identidad
            return identidad

        for codigo, nombre, region in administracion['regiones']:
            identidad = agregar('autonomia', codigo, nombre, 'pais:ES', 'ine:autonomia')
            self.codigos['medios:region', region] = identidad
        for codigo, nombre, autonomia in administracion['provincias']:
            agregar('provincia', codigo, nombre, 'es:autonomia:' + autonomia, 'ine:provincia')
        for codigo, control, nombre in municipios['municipios']:
            if (not isinstance(codigo, str) or len(codigo) != 5 or not codigo.isascii()
                    or not codigo.isdigit() or not isinstance(control, str)
                    or len(control) != 1 or control not in '0123456789'):
                raise ValueError('Código municipal INE inválido')
            identidad = agregar('municipio', codigo, nombre, 'es:provincia:' + codigo[:2], 'ine:municipio')
            self.codigos['ine:municipio:dc', codigo + control] = identidad

    def resolver(self, sistema, codigo):
        if not isinstance(codigo, str):
            return None  # No recuperar ceros perdidos ni adivinar el sistema del proveedor.
        identidad = self.codigos.get((sistema, codigo))
        if identidad is None:
            return None
        return self.territorio(identidad)

    def territorio(self, identidad):
        if identidad not in self.entidades:
            return None
        dato = deepcopy(self.entidades[identidad])
        padres, padre = [], dato['padre']
        while padre:
            padres.append(padre)
            padre = self.entidades[padre]['padre']
        return {**dato, 'ancestros': padres}


@lru_cache(maxsize=1)
def cargar():
    return Catalogo(json.loads((CARPETA / 'administracion.json').read_text(encoding='utf-8')),
                    json.loads((CARPETA / 'municipios.json').read_text(encoding='utf-8')),
                    json.loads((CARPETA / 'paises.json').read_text(encoding='utf-8')))


def resolver(sistema, codigo):
    return cargar().resolver(sistema, codigo)


def sedes_medio(medio):
    """Dónde está el emisor. Nunca localiza ni cubre; es una relación aparte.
    Solo las sedes `resueltas`: pendiente o en conflicto no publican nada."""
    return [{'territorio': s['territorio'], 'papel': 'sede'}
            for s in medio.get('sede') or []
            if s.get('estado') == 'resuelto' and cargar().territorio(s.get('territorio'))]


def cobertura_medio(medio):
    """Cobertura editorial; no atribuye territorio a cada artículo.
    Una `cobertura` explícita sustituye a la proyección heredada de `region` y
    `ambito`; pendiente o en conflicto, no reactiva la heredada."""
    explicita = medio.get('cobertura')
    if explicita is not None:
        ids = explicita.get('territorios') if explicita.get('estado') == 'resuelto' else []
        return [{'territorio': t, 'papel': 'cobertura_editorial'}
                for t in dict.fromkeys(ids or []) if cargar().territorio(t)]
    if medio.get('region'):
        territorio = resolver('medios:region', medio['region'])
    elif medio.get('ambito') == 'nacional' and not medio.get('pais'):
        territorio = resolver('iso3166-1:alpha2', 'ES')
    else:
        territorio = None
    return [{'territorio': territorio['id'], 'papel': 'cobertura_editorial'}] if territorio else []


def territorios_medio(medio):
    """País de clasificación, sede y cobertura son relaciones distintas."""
    relaciones = cobertura_medio(medio)
    pais = resolver('medios:pais', medio.get('pais'))
    if pais:
        relaciones.append({'territorio': pais['id'], 'papel': 'pais_catalogo'})
    return relaciones + sedes_medio(medio)


def problemas_territoriales(medio):
    """Identidades de `sede`/`cobertura` que no existen en el catálogo común."""
    ids = [s.get('territorio') for s in medio.get('sede') or []]
    ids += (medio.get('cobertura') or {}).get('territorios') or []
    return [f"{medio['d']}: territorio desconocido {t!r}"
            for t in ids if t and not cargar().territorio(t)]
