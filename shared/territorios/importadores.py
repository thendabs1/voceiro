"""Lectores de catálogos territoriales: datos y evidencias, sin red ni escritura."""

from copy import deepcopy
import hashlib
import json
import re
import unicodedata
from urllib.parse import parse_qs, urlsplit

from . import resolver
from .geometria import LimitesMunicipales


def leer(cuerpo, url, fuente, comprobado, *, permisivo=False):
    datos = json.loads(cuerpo, strict=not permisivo)
    prueba = {'fuente': fuente, 'documento': url, 'sha256': hashlib.sha256(cuerpo).hexdigest(),
              'observado': comprobado, 'comprobado': comprobado}
    return datos, prueba


def recintos_madrid(datos, prueba):
    if not isinstance(datos.get('@graph'), list) or not datos['@graph']:
        raise ValueError('Catálogo de recintos Madrid sin registros')
    cruces = []
    for i, fila in enumerate(datos['@graph']):
        partes = urlsplit(fila.get('relation') or '')
        claves = parse_qs(partes.query).get('vgnextoid', [])
        if partes.hostname not in ('www.madrid.es', 'madrid.es') or len(claves) != 1 or not claves[0]:
            continue
        direccion = fila.get('address') or {}
        uris = [direccion[k]['@id'] for k in ('district', 'area') if direccion.get(k, {}).get('@id')]
        prefijo = 'https://datos.madrid.es/egob/kos/Provincia/Madrid/Municipio/Madrid/'
        if not uris or not all(uri.startswith(prefijo) for uri in uris):
            continue
        dato = {k: deepcopy(fila[k]) for k in ('id', 'title', 'relation') if k in fila}
        dato['address'] = {k: deepcopy(direccion[k]) for k in ('district', 'area') if k in direccion}
        cruces.append({'id': 'madrid:recinto:' + claves[0] + ':municipio:catalogo-v1', 'tipo': 'ubicacion',
            'referencia': {'sistema': 'madrid:instalacion_vgnextoid', 'codigo': claves[0], 'contexto': {}},
            'territorio': 'es:municipio:28079', 'metodo': 'catalogo_oficial_revisado', 'vigencia': None,
            'evidencias': [{**prueba, 'ruta': f'/@graph/{i}', 'dato': dato}]})
    return cruces


def limites(datos, prueba, perfil):
    """Normaliza códigos documentados; nunca completa un código de otra fuente.

    geoEuskadi: MUN_PROV (2) y MUN_MUNI (3); IDENA: CMUNICIPIO numérico,
    código municipal dentro de Navarra. Solo se normaliza este campo declarado.
    """
    if datos.get('type') != 'FeatureCollection' or not isinstance(datos.get('features'), list):
        raise ValueError('Catálogo de límites sin GeoJSON')
    crs = datos.get('crs')
    if crs and crs != {'type': 'name', 'properties': {'name': 'urn:ogc:def:crs:CRS::84'}}:
        raise ValueError('Los límites deben usar longitud, latitud CRS84')
    if perfil == 'idena' and datos.get('numberMatched') != len(datos['features']):
        raise ValueError('Descarga de límites IDENA incompleta')
    normalizadas, origenes = [], []
    for i, f in enumerate(datos['features']):
        p = f['properties']
        if perfil == 'geoeuskadi':
            provincia, municipio = p.get('MUN_PROV'), p.get('MUN_MUNI')
            if (not isinstance(provincia, str) or not re.fullmatch(r'[0-9]{2}', provincia)
                    or not isinstance(municipio, str) or not re.fullmatch(r'[0-9]{3}', municipio)):
                raise ValueError('Código municipal geoEuskadi inválido')
            codigo = provincia + municipio
        elif perfil == 'idena':
            n = p.get('CMUNICIPIO')
            if type(n) is not int or not 1 <= n <= 999:
                raise ValueError('Código municipal IDENA inválido')
            codigo = '31' + f'{n:03d}'
        else:
            raise ValueError('Perfil territorial desconocido')
        # La cartografía puede conservar recintos antiguos o facerías, que no
        # pertenecen a la instantánea municipal INE del proyecto.
        if not resolver('ine:municipio', codigo):
            continue
        normalizadas.append({'type': 'Feature', 'properties': {'ine': codigo}, 'geometry': f['geometry']})
        campos = ('MUN_PROV', 'MUN_MUNI', 'NOMBRE_CAS', 'NOMBRE_EUS') if perfil == 'geoeuskadi' else (
            'CMUNICIPIO', 'MUNICIPIO', 'BEGINLIFE')
        origenes.append({**prueba, 'ruta': f'/features/{i}', 'dato': {k: p[k] for k in campos if k in p},
            'geometria_sha256': hashlib.sha256(json.dumps(f['geometry'], sort_keys=True,
                separators=(',', ':')).encode()).hexdigest()})
    if not normalizadas:
        raise ValueError('Límites sin municipios INE vigentes acreditados')
    return LimitesMunicipales({'type': 'FeatureCollection', 'features': normalizadas}), origenes


def puntos_kulturklik(datos, prueba):
    """Cada página acredita sus observaciones, nunca cobertura de la agenda entera."""
    if not isinstance(datos.get('items'), list):
        raise ValueError('Respuesta Kulturklik sin eventos')
    campos = ('id', 'municipalityNoraCode', 'provinceNoraCode', 'municipalityEs', 'municipalityEu',
              'municipalityLatitude', 'municipalityLongitude')
    puntos = []
    for i, f in enumerate(datos['items']):
        provincia, codigo = str(f.get('provinceNoraCode') or ''), str(f.get('municipalityNoraCode') or '')
        if not provincia or not codigo:
            continue
        dato = {k: f[k] for k in campos if k in f}
        puntos.append({'referencia': {'sistema': 'kulturklik:municipio_nora', 'codigo': codigo,
                                     'contexto': {'provincia_nora': provincia}},
            'latitud': f.get('municipalityLatitude'), 'longitud': f.get('municipalityLongitude'),
            'evidencia': {**prueba, 'ruta': f'/items/{i}', 'dato': dato}})
    return puntos


def cruzar_puntos(puntos, mapas):
    """Una correspondencia por referencia, solo si todas sus coordenadas coinciden."""
    provincias = {'1': '01', '20': '20', '48': '48', '31': '31'}
    grupos = {}
    for punto in puntos:
        ref = punto['referencia']
        grupos.setdefault(json.dumps(ref, sort_keys=True), []).append(punto)
    cruces, pendientes = [], []

    def nombres_compatibles(punto, pruebas, territorio):
        # El nombre nunca encuentra un municipio: solo impide confirmar un
        # polígono que contradiga la denominación declarada por la fuente.
        def variantes(nombres):
            salida = set()
            for nombre in nombres:
                for variante in [nombre, *nombre.split('/')]:
                    limpio = ''.join(c for c in unicodedata.normalize('NFD', variante.casefold())
                                     if unicodedata.category(c) != 'Mn')
                    salida.add(re.sub(r'[^a-z0-9]', '', limpio))
            return salida - {''}
        declarados = variantes([punto['evidencia']['dato'].get(k, '') for k in ('municipalityEs', 'municipalityEu')])
        oficiales = [resolver('ine:municipio', territorio.removeprefix('es:municipio:'))['nombre']]
        oficiales.extend(p['dato'].get(k, '') for p in pruebas for k in ('NOMBRE_CAS', 'NOMBRE_EUS', 'MUNICIPIO'))
        return bool(declarados & variantes(oficiales))

    for _, observados in sorted(grupos.items()):
        ref, resueltos, fallos = observados[0]['referencia'], {}, []
        provincia = provincias.get(ref['contexto']['provincia_nora'])
        vistos, evidencias = set(), []
        for p in observados:
            coordenadas = (p['longitud'], p['latitud'])
            firma = (*coordenadas, *(p['evidencia']['dato'].get(k) for k in ('municipalityEs', 'municipalityEu')))
            if firma in vistos:
                continue
            vistos.add(firma)
            evidencias.append(p['evidencia'])
            if not provincia:
                fallos.append('provincia_fuera_de_cobertura')
                continue
            if not all(v is not None and str(v).strip() for v in coordenadas):
                continue  # Una ausencia no contradice otro punto acreditado.
            try:
                lon, lat = map(float, coordenadas)
                resultados = [(mapa.resolver(lon, lat), origenes) for mapa, origenes in mapas]
            except (TypeError, ValueError):
                fallos.append('coordenadas_invalidas')
                continue
            candidatos = {r['territorio'] for r, _ in resultados if r['estado'] == 'resuelto'}
            if (len(candidatos) != 1 or any(r['motivo'] in ('cerca_del_limite', 'recintos_solapados')
                                         for r, _ in resultados)):
                fallos.append(next((r['motivo'] for r, _ in resultados if r['motivo'] in (
                    'cerca_del_limite', 'recintos_solapados')), 'fuera_de_cobertura')
                    if not candidatos else 'limites_sin_resolucion_unica')
                continue
            territorio = next(iter(candidatos))
            if not provincia or territorio.removeprefix('es:municipio:')[:2] != provincia:
                fallos.append('provincia_incompatible')
                continue
            r, origenes = next((r, o) for r, o in resultados if r['territorio'] == territorio)
            pruebas = [p['evidencia']]
            for indices in r['recintos'].values():
                pruebas.extend({**origenes[i], 'punto_consultado': [lon, lat],
                                'margen_revision_m': r['margen_revision_m']} for i in indices)
            evidencias.extend(pruebas[1:])
            if not nombres_compatibles(p, pruebas[1:], territorio):
                fallos.append('denominacion_contradice_recinto')
                continue
            resueltos.setdefault(territorio, []).extend(pruebas)
        if len(resueltos) == 1 and not fallos:
            territorio, pruebas = next(iter(resueltos.items()))
            cruces.append({'id': 'kulturklik:municipio:' + ref['contexto']['provincia_nora'] + ':'
                + ref['codigo'] + ':limites-v1', 'tipo': 'equivalencia', 'referencia': ref,
                'territorio': territorio, 'metodo': 'coordenadas_municipales_en_limites_oficiales',
                'vigencia': None, 'evidencias': pruebas})
        else:
            pendientes.append({'referencia': ref, 'motivos': sorted(set(fallos or ['sin_coordenadas']))
                if len(resueltos) <= 1 else ['coordenadas_contradictorias'],
                'candidatos': sorted(resueltos), 'evidencias': evidencias})
    return cruces, pendientes
