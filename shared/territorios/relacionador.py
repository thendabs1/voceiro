"""Resolución revisable de referencias y ubicaciones, sin inferencias por nombre.

La equivalencia territorial y la ubicación de un recinto son operaciones distintas.
Esta revisión no acredita vigencias históricas; una fecha explícita queda pendiente.
"""

from copy import deepcopy
from datetime import date
from functools import lru_cache
import hashlib
import json

from . import CARPETA, cargar as cargar_catalogo


CONTEXTOS = {'kulturklik:municipio_nora': {'provincia_nora'},
             'nora:municipio': {'provincia'}, 'madrid:instalacion_vgnextoid': set()}


def _clave(referencia):
    return json.dumps(referencia, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


class Relacionador:
    def __init__(self, correspondencias=None, catalogo=None):
        self.catalogo = catalogo or cargar_catalogo()
        self.sistemas = {s for s, _ in self.catalogo.codigos}
        self.datos = deepcopy(correspondencias) if correspondencias is not None else json.loads(
            (CARPETA / 'correspondencias.json').read_text(encoding='utf-8'))
        if type(self.datos.get('version')) is not int or self.datos['version'] < 1:
            raise ValueError('Versión de correspondencias inválida')
        self.revision = {'territorios': list(self.catalogo.version),
                         'correspondencias': self.datos['version'],
                         'sha256': hashlib.sha256(_clave(self.datos).encode()).hexdigest()}
        self.pruebas_directas = {}
        for archivo, campo in (('municipios.json', 'municipios'), ('administracion.json', 'regiones'),
                               ('administracion.json', 'provincias'), ('paises.json', 'paises')):
            raw = (CARPETA / archivo).read_bytes()
            dato = json.loads(raw)
            huella = hashlib.sha256(raw).hexdigest()
            for i, fila in enumerate(dato[campo]):
                sistemas = ({'ine:municipio': fila[0], 'ine:municipio:dc': fila[0] + fila[1]} if campo == 'municipios'
                            else {'ine:autonomia': fila[0], 'medios:region': fila[2]} if campo == 'regiones'
                            else {'ine:provincia': fila[0]} if campo == 'provincias'
                            else {'iso3166-1:alpha2': fila[0], 'medios:pais': fila[2]})
                prueba = {'fuente': dato.get('fuente'), 'documento': 'shared/territorios/' + archivo,
                          'sha256': huella, 'ruta': f'/{campo}/{i}',
                          'dato': fila, 'fecha_referencia': dato.get('fecha_referencia'),
                          'metodo': 'catalogo_versionado', 'vigencia': None}
                for sistema, codigo in sistemas.items():
                    if codigo is not None:
                        self.pruebas_directas[sistema, codigo] = prueba
        self.indice, self.pendientes = {}, {}
        ids = set()
        for registro in self.datos['correspondencias']:
            if (not registro.get('id') or registro['id'] in ids
                    or registro.get('tipo') not in ('equivalencia', 'ubicacion')
                    or registro.get('vigencia') is not None or not registro.get('metodo')
                    or not self.catalogo.territorio(registro.get('territorio'))):
                raise ValueError('Correspondencia inválida o destino fuera del catálogo')
            ids.add(registro['id'])
            self._validar_registro(registro)
            sistema = registro['referencia']['sistema']
            if ((registro['tipo'] == 'ubicacion') != (sistema == 'madrid:instalacion_vgnextoid')):
                raise ValueError('La ubicación de un recinto no es una equivalencia territorial')
            referencia = {**registro['referencia'], 'contexto': registro['referencia'].get('contexto', {})}
            self.indice.setdefault((registro['tipo'], _clave(referencia)), []).append(registro)
        for registro in self.datos['pendientes']:
            self._validar_registro(registro)
            clave = _clave({**registro['referencia'], 'contexto': registro['referencia'].get('contexto', {})})
            if clave in self.pendientes or not registro.get('motivo'):
                raise ValueError('Pendiente duplicado o sin motivo')
            self.pendientes[clave] = registro

    def _motivo_referencia(self, referencia):
        if (not isinstance(referencia, dict) or not isinstance(referencia.get('sistema'), str)
                or not isinstance(referencia.get('codigo'), str) or not referencia['codigo']):
            return 'referencia_invalida'
        if referencia.keys() - {'sistema', 'codigo', 'contexto', 'edicion'}:
            return 'referencia_invalida'
        contexto = referencia.get('contexto', {})
        if (not isinstance(contexto, dict) or any(not isinstance(k, str) or not isinstance(v, str)
                or not v for k, v in contexto.items())):
            return 'contexto_no_soportado'
        sistema = referencia['sistema']
        if sistema in CONTEXTOS:
            if contexto.keys() != CONTEXTOS[sistema]:
                return 'contexto_no_soportado'
        elif sistema not in self.sistemas:
            return 'sistema_no_soportado'
        elif contexto:
            return 'contexto_no_soportado'
        if 'edicion' in referencia and (not isinstance(referencia['edicion'], str) or not referencia['edicion']):
            return 'referencia_invalida'
        return None

    def _validar_registro(self, registro):
        if self._motivo_referencia(registro.get('referencia')) or not registro.get('evidencias'):
            raise ValueError('Referencia revisada sin contexto o evidencia')
        for e in registro['evidencias']:
            if (not all(e.get(k) for k in ('fuente', 'documento', 'ruta', 'comprobado'))
                    or 'dato' not in e or not isinstance(e.get('sha256'), str)
                    or len(e['sha256']) != 64 or any(c not in '0123456789abcdef' for c in e['sha256'])):
                raise ValueError('Evidencia sin dato, huella o procedencia')

    def resolver_referencia(self, referencia, fecha=None):
        return self._resolver('equivalencia', referencia, fecha)

    def resolver_ubicacion(self, referencia, fecha=None):
        return self._resolver('ubicacion', referencia, fecha)

    def _resolver(self, tipo, referencia, fecha):
        resultado = {'estado': 'pendiente', 'territorio': None, 'candidatos': [],
                     'motivo': self._motivo_referencia(referencia), 'referencia': deepcopy(referencia),
                     'revision': deepcopy(self.revision), 'fecha_referencia': self.catalogo.fecha_referencia,
                     'fecha_solicitada': fecha, 'evidencias': [], 'tipo': tipo}
        if resultado['motivo']:
            return resultado
        ref = {**referencia, 'contexto': referencia.get('contexto', {})}
        registros = self.indice.get((tipo, _clave(ref)), [])
        candidatos = {}
        for r in registros:
            pruebas = candidatos.setdefault(r['territorio'], [])
            for evidencia in r['evidencias']:
                prueba = {**evidencia, 'correspondencia': r['id'], 'metodo': r['metodo'], 'vigencia': r['vigencia']}
                if prueba not in pruebas:
                    pruebas.append(prueba)
        if tipo == 'equivalencia' and not ref['contexto'] and 'edicion' not in ref:
            territorio = self.catalogo.resolver(ref['sistema'], ref['codigo'])
            if territorio:
                candidatos.setdefault(territorio['id'], []).append(self.pruebas_directas[ref['sistema'], ref['codigo']])
        resultado['candidatos'] = [{'territorio': k, 'evidencias': deepcopy(v)} for k, v in sorted(candidatos.items())]
        resultado['evidencias'] = deepcopy([e for v in candidatos.values() for e in v])
        pendiente = self.pendientes.get(_clave(ref), {}) if tipo == 'equivalencia' else {}
        if not candidatos:
            resultado.update(motivo=pendiente.get('motivo', 'sin_correspondencia'),
                             evidencias=deepcopy(pendiente.get('evidencias', [])))
        elif fecha is not None:
            try:
                valida = isinstance(fecha, str) and date.fromisoformat(fecha).isoformat() == fecha
            except ValueError:
                valida = False
            resultado['motivo'] = 'vigencia_no_acreditada' if valida else 'fecha_invalida'
        elif len(candidatos) > 1:
            resultado.update(estado='conflicto', motivo='evidencias_incompatibles')
        else:
            resultado.update(estado='resuelto', motivo='correspondencia_acreditada', territorio=next(iter(candidatos)))
        return resultado


@lru_cache(maxsize=1)
def cargar():
    return Relacionador()
