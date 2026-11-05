"""Lecturas locales revisadas, aplicables solo a los bytes y fichas acreditados."""
from copy import deepcopy
from functools import lru_cache
from hashlib import sha256
import json
from pathlib import Path
import re
from urllib.error import HTTPError

from . import atletismo_bloque

CAMPOS = ('actividad', 'alcance', 'titulos', 'organizacion')
NO_LEER = ('inscritos', 'resultados', 'clasificacion')


@lru_cache(maxsize=3)
def lecturas_documentales(fuente):
    datos = json.loads(Path(__file__).with_name(f'atletismo-{fuente}-documentos.json').read_text(encoding='utf-8'))
    for url, lectura in datos.items():
        if not re.fullmatch(r'[a-f0-9]{64}', lectura.get('sha256', '')):
            raise ValueError('Lectura documental sin SHA-256: ' + url)
    return datos


def evidencia(lectura, url):
    return {'superficie': 'documento', 'url': url,
            'localizador': lectura['localizador'], 'literal': lectura['literal']}


def campos(lectura, url):
    """Admite el catálogo FGA existente y evidencia específica para cada dato."""
    ev = evidencia(lectura, url)
    salida = {}
    for k in ('actividad', 'alcance'):
        if k in lectura:
            salida[k] = {'evidencia': ev, **deepcopy(lectura[k])}
    for k in ('titulos', 'organizacion'):
        if k in lectura:
            salida[k] = []
            for t in lectura[k]:
                if isinstance(t, str) and k == 'titulos':
                    t = {'literal': t, 'autoridad': 'desconocida'}
                dato = {'evidencia': ev, **deepcopy(t)}
                if k == 'titulos':
                    dato.setdefault('autoridad', 'desconocida')
                    dato.setdefault('base', 'documento')
                salida[k].append(dato)
    atletismo_bloque.validar(salida, '0001-01-01', '9999-12-31')
    for valor in salida.values():
        for dato in valor if isinstance(valor, list) else [valor]:
            if set(dato['evidencia']) != atletismo_bloque.EVIDENCIA or dato['evidencia']['url'] != url:
                raise ValueError('Lectura documental sin evidencia completa del documento: ' + url)
    return salida


def combinar(meta, acreditados, i):
    avisos = []
    for k, valores in acreditados.items():
        if k in ('titulos', 'organizacion'):
            lista = meta.setdefault(k, [])
            for valor in valores:
                lista.extend(x for x in valor if x not in lista)
        elif len({json.dumps({k: x for k, x in v.items() if k != 'evidencia'}, sort_keys=True) for v in valores}) == 1:
            meta[k] = valores[0]
        else:
            # No hay prelación documental; conserva las declaraciones en el
            # aviso y deja la dimensión sin decidir.
            clave = 'tipo' if k == 'alcance' else 'valor'
            meta[k] = {clave: 'desconocido' if k == 'alcance' else 'desconocida'}
            avisos.append({'id': str(i), 'motivo': f'lecturas documentales discrepantes en {k}', 'declaraciones': valores})
    return avisos


class Lecturas:
    def __init__(self, fuente, obtener, *, catalogo=None):
        self.catalogo = lecturas_documentales(fuente) if catalogo is None else catalogo
        self.obtener = obtener
        self.verificadas = {}
        self.avisos = []
        self.superficies = []
        self.por_url = {}

    def verificar(self, documentos, i):
        for d in documentos:
            u = d['url']
            lectura = self.catalogo.get(u)
            if (not lectura or d.get('rol') in NO_LEER
                    or 'citas' in lectura and str(i) not in lectura['citas']):
                continue
            if u in self.verificadas:
                registro = self.por_url[u]
                if str(i) not in registro['ids_observados']:
                    registro['ids_observados'].append(str(i))
                    if registro['estado'] == 'completa':
                        registro['ids_resueltos'].append(str(i))
                continue
            registro = {'superficie': 'documento', 'consultas': [u],
                        'ids_observados': [str(i)], 'ids_resueltos': [], 'estado': 'completa'}
            self.superficies.append(registro)
            self.por_url[u] = registro
            try:
                contenido = self.obtener(u, binario=True)
                if not isinstance(contenido, bytes):
                    raise ValueError('la descarga no conserva bytes')
            except (HTTPError, OSError) as error:
                if isinstance(error, HTTPError) and error.code in (403, 429):
                    registro.update(estado='fallida', error=f'HTTP {error.code}')
                    raise
                self.verificadas[u] = lectura
                registro.update(estado='no_disponible', error=f'{type(error).__name__}: {error}'[:500])
                self.avisos.append({'id': str(i), 'url': u, 'motivo': 'descarga fallida; se conserva la lectura revisada',
                                    'error': registro['error']})
            else:
                coincide = sha256(contenido).hexdigest() == lectura['sha256']
                self.verificadas[u] = lectura if coincide else None
                if coincide:
                    registro['ids_resueltos'] = [str(i)]
                else:
                    registro['estado'] = 'parcial'
                    self.avisos.append({'id': str(i), 'url': u, 'motivo': 'bytes distintos; documento pendiente de nueva lectura'})
        return self.verificadas

    def aplicar(self, evento):
        meta = evento['metadatos']
        for doc in meta.get('documentos', []):
            if doc['url'] in self.catalogo and doc.get('rol') not in NO_LEER:
                doc.pop('hash', None)
        self.verificar(meta.get('documentos', []), evento['id'])
        acreditados, programa = {}, []
        for d in meta.get('documentos', []):
            lectura = self.verificadas.get(d['url'])
            if not lectura or d.get('rol') in NO_LEER:
                continue
            d['hash'] = lectura['sha256']
            # Un reglamento compartido puede describir objetos distintos: la
            # revisión explicita el ID; compartir PDF nunca asocia dos citas.
            datos = lectura.get('citas', {}).get(str(evento['id'])) if 'citas' in lectura else lectura
            if not datos:
                continue
            datos = {**lectura, **datos}
            for k, valor in campos(datos, d['url']).items():
                acreditados.setdefault(k, []).append(valor)
            for s in datos.get('programa', []):
                sesion = deepcopy(s)
                sesion.setdefault('evidencia', evidencia(datos, d['url']))
                atletismo_bloque._evidencia('programa.evidencia', sesion['evidencia'])
                if set(sesion['evidencia']) != atletismo_bloque.EVIDENCIA or sesion['evidencia']['url'] != d['url']:
                    raise ValueError('Sesión sin evidencia completa del documento')
                if sesion not in programa:
                    programa.append(sesion)
            self.avisos.extend({'id': str(evento['id']), 'url': d['url'], 'motivo': p}
                                for p in datos.get('pendientes', []))
        self.avisos.extend(combinar(meta, acreditados, evento['id']))
        if programa:
            evento['programa'] = programa


def conservar(eventos, conocidas, revisados):
    """Tras un corte: lo acreditado por documentos que la ficha sigue enlazando y no se comprobaron.

    Un documento ya comprobado manda, también si sus bytes cambiaron.
    """
    comprobados = {u for s in revisados.get('superficies', []) if s['estado'] != 'fallida' for u in s['consultas']}
    anteriores = {str(c['id']): c['metadatos'] for c in conocidas if not c.get('lectura_ambigua')}
    for e in eventos:
        previa = anteriores.get(str(e['id']), {})
        meta = e['metadatos']
        vigentes = {d['url'] for d in meta.get('documentos', [])} - comprobados
        acreditado = lambda v: v.get('evidencia', {}).get('superficie') == 'documento' and v['evidencia']['url'] in vigentes
        for k in CAMPOS:
            valor = previa.get(k)
            if isinstance(valor, list):
                lista = meta.get(k, [])
                if nuevos := [deepcopy(v) for v in valor if acreditado(v) and v not in lista]:
                    meta[k] = lista + nuevos
            elif valor and acreditado(valor):
                meta[k] = deepcopy(valor)
        hashes = {d['url']: d['hash'] for d in previa.get('documentos', []) if d.get('hash')}
        for d in meta.get('documentos', []):
            if d['url'] in vigentes and d['url'] in hashes:
                d.setdefault('hash', hashes[d['url']])


def completar(fuente, eventos, obtener):
    lector = Lecturas(fuente, obtener)
    try:
        for e in eventos:
            lector.aplicar(e)
    except HTTPError as error:
        error.documentos_revisados = {'superficies': lector.superficies, 'avisos': lector.avisos, 'completo': False}
        raise
    return {'superficies': lector.superficies, 'avisos': lector.avisos,
            'completo': all(s['estado'] == 'completa' for s in lector.superficies)}
