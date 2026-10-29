"""Clasificador al publicar: tablas por fuente sobre los campos en bruto guardados.

Cada lector guarda su vocabulario (`tipo_original`) y los campos filtrables
(`origen`) sin interpretarlos; aquí se traducen a tema, formato, precio y
público con la tabla revisada de la fuente (`agenda/tablas/<fuente>.json`).
Nunca se mira el título ni la descripción, y un valor que la tabla no recoge
no inventa nada: queda contado como «sin revisar» en el informe de cobertura.
Modelo y criterios en clasificacion.md.
"""

from functools import lru_cache
import json
from pathlib import Path
import re

from .clasificacion import cargar_catalogo

RUTA = Path(__file__).resolve().parent / 'tablas'
FORMATOS = {'concierto', 'representacion', 'proyeccion', 'exposicion', 'curso-taller', 'charla-encuentro',
            'lectura-club', 'festival', 'feria-mercado', 'fiesta', 'visita-ruta', 'competicion-deportiva',
            'practica-deportiva'}
PRECIOS = ('gratis', 'pago', 'mixto')
PUBLICOS = {'infancia', 'juventud', 'familias', 'mayores'}
ACCESOS = {'libre', 'con-inscripcion'}
# Patrones acotados al campo de precio (clasificacion.md: «patrones en campos concretos»).
GRATIS = re.compile(r'\bgrat|\bdoa|\bdohain|\blibre\b|\binvitaci', re.I)
IMPORTE = re.compile(r'(\d+(?:[.,]\d+)?)\s*(?:€|eur)', re.I)


def _lista(v):
    return [] if v in (None, '') else v if isinstance(v, list) else [v]


def _madrid(b):
    tipo = (b.get('tipo_original') or '').removeprefix('/contenido/actividades/')
    origen = b.get('origen') or {}
    return {'TIPO': [tipo] if tipo else [], 'GRATUITO': _lista(origen.get('GRATUITO')),
            'PRECIO': _lista(origen.get('PRECIO')),
            'AUDIENCIA': [a.strip() for a in (origen.get('AUDIENCIA') or '').split(',') if a.strip()]}


def _cyl(b):
    tipo, origen = b.get('tipo_original') or {}, b.get('origen') or {}
    return {'tematica': _lista(tipo.get('tematica')), 'categoria': _lista(tipo.get('categoria')),
            'precio': _lista(origen.get('precio')),
            'destinatarios': [d.strip() for d in (origen.get('destinatarios') or '').split(',') if d.strip()]}


def _kulturklik(b):
    tipo, origen = b.get('tipo_original') or {}, b.get('origen') or {}
    return {'type': [str(tipo['id'])] if tipo.get('id') is not None else [],
            'priceEs': _lista(origen.get('priceEs'))}


def _zaragoza(b):
    origen = b.get('origen') or {}
    return {'category': [str(c['id']) for c in origen.get('category') or [] if c.get('id') is not None],
            'type': _lista(b.get('tipo_original')), 'price': origen.get('price') or [],
            'population': [str(p['id']) for p in origen.get('population') or [] if p.get('id') is not None]}


def _galicia(b):
    tipo, origen = b.get('tipo_original') or {}, b.get('origen') or {}
    return {'tipoEvento': [str(tipo['tid'])] if tipo.get('tid') is not None else [],
            **{k: [str(v['tid']) for v in origen.get(k) or [] if v.get('tid') is not None]
               for k in ('tipoPublico', 'tipoEntrada')}}


# Cómo leer los campos de cada fuente desde los bloques de una observación.
CAMPOS = {'madrid': _madrid, 'cyl': _cyl, 'kulturklik': _kulturklik, 'zaragoza': _zaragoza,
          'cultura-galicia': _galicia}


def validar(tabla, conceptos):
    if tabla.get('version', 0) < 1 or tabla.get('fuente') not in CAMPOS:
        raise ValueError('Tabla de clasificación sin versión o de fuente desconocida')
    for campo, datos in tabla['campos'].items():
        for valor, d in datos['valores'].items():
            if set(d) - {'temas', 'formatos', 'nombre', 'nota'}:
                raise ValueError(f'Clave desconocida en {tabla["fuente"]}.{campo}.{valor}')
            if set(d.get('temas', ())) - conceptos.keys() or set(d.get('formatos', ())) - FORMATOS:
                raise ValueError(f'Tema o formato desconocido en {tabla["fuente"]}.{campo}.{valor}')
    for c in tabla.get('combinaciones', ()):
        if c['formato'] not in FORMATOS or c['sustituye'] not in FORMATOS or c['si_tema'] not in conceptos:
            raise ValueError(f'Combinación inválida en {tabla["fuente"]}')
    for precio in _specs(tabla.get('precio')):
        if (precio['tipo'] not in ('indicador', 'tarifas', 'texto')
                or set(precio.get('valores', {}).values()) - set(PRECIOS)):
            raise ValueError(f'Precio inválido en {tabla["fuente"]}')
    publico = tabla.get('publico')
    if publico and set(publico['valores'].values()) - PUBLICOS:
        raise ValueError(f'Público inválido en {tabla["fuente"]}')
    acceso = tabla.get('acceso')
    if acceso and set(acceso['valores'].values()) - ACCESOS:
        raise ValueError(f'Acceso inválido en {tabla["fuente"]}')
    return tabla


@lru_cache(maxsize=1)
def cargar():
    conceptos = cargar_catalogo()['conceptos']
    tablas = {}
    for ruta in sorted(RUTA.glob('*.json')):
        tabla = validar(json.loads(ruta.read_text(encoding='utf-8')), conceptos)
        tablas[tabla['fuente']] = tabla
    return tablas


def _specs(precio):
    # Una regla o varias (Madrid: indicador y texto); sus clases se suman.
    return [] if not precio else precio if isinstance(precio, list) else [precio]


def _clases(spec, campos):
    valores = campos.get(spec['campo']) or []
    if spec['tipo'] == 'indicador':
        return {spec['valores'].get(str(v)) for v in valores} - {None}
    if spec['tipo'] == 'tarifas':
        # Solo un importe numérico ≥ 0 acredita precio; ausente, nulo o negativo no es gratis.
        importes = [t.get('hasCurrencyValue') for t in valores]
        validos = [v for v in importes if type(v) in (int, float) and 0 <= v < float('inf')]
        return {'pago' if v > 0 else 'gratis' for v in validos} | ({'desconocido'} if len(validos) < len(importes) else set())
    clases = set()
    for texto in valores:
        importes = [float(i.replace(',', '.')) for i in IMPORTE.findall(texto)]
        if GRATIS.search(texto) or importes and not any(importes):
            clases.add('gratis')
        if any(importes):
            clases.add('pago')
    return clases


def _precio(precio, campos):
    clases = set().union(*(_clases(s, campos) for s in _specs(precio)))
    # Una tarifa sin importe puede ser de pago: anula «gratis», no «pago» ni «mixto».
    if 'desconocido' in clases:
        clases -= {'desconocido', 'gratis'} if 'pago' not in clases else {'desconocido'}
    # Varias tarifas, gratis y de pago: el filtro «gratis» no debe prometerlo.
    return 'mixto' if {'gratis', 'pago'} <= clases else next(iter(clases), None) if len(clases) == 1 else None


def clasificar(fuente, bloques):
    """Ejes de un evento a partir de los bloques de sus observaciones vigentes."""
    tabla = cargar()[fuente]
    conceptos = cargar_catalogo()['conceptos']
    temas, formatos, publico, precios, sin_revisar, accesos = set(), set(), set(), set(), set(), set()
    for b in bloques:
        campos = CAMPOS[fuente](b)
        for campo, datos in tabla['campos'].items():
            for valor in campos.get(campo, ()):
                d, clave = datos['valores'].get(valor), valor
                # Árboles de portal (Madrid): sin entrada propia vale la del padre.
                while d is None and datos.get('jerarquico') and '/' in clave:
                    clave = clave.rsplit('/', 1)[0]
                    d = datos['valores'].get(clave)
                if d is None:
                    sin_revisar.add((campo, valor))
                    continue
                temas.update(d.get('temas', ()))
                formatos.update(d.get('formatos', ()))
        if tabla.get('precio'):
            precio = _precio(tabla['precio'], campos)
            if precio:
                precios.add(precio)
        if tabla.get('publico'):
            publico.update(tabla['publico']['valores'][v] for v in campos.get(tabla['publico']['campo'], ())
                           if v in tabla['publico']['valores'])
        if tabla.get('acceso'):
            accesos.update(tabla['acceso']['valores'][v] for v in campos.get(tabla['acceso']['campo'], ())
                           if v in tabla['acceso']['valores'])
    for c in tabla.get('combinaciones', ()):
        if c['si_tema'] in temas and c['sustituye'] in formatos:
            formatos = (formatos - {c['sustituye']}) | {c['formato']}
    # «cultura» junto a «teatro» no añade nada: se queda el tema más concreto.
    antecesores = set()
    for t in temas:
        pendientes = list(conceptos[t]['padres'])
        while pendientes:
            p = pendientes.pop()
            antecesores.add(p)
            pendientes.extend(conceptos[p]['padres'])
    return {'temas': sorted(temas - antecesores), 'formatos': sorted(formatos),
            'precio': precios.pop() if len(precios) == 1 else 'mixto' if precios else None,
            'publico': sorted(publico), 'sin_revisar': sorted(sin_revisar), 'acceso': sorted(accesos)}


def informe(resultados):
    """Líneas de cobertura por fuente: {fuente: [clasificación de cada evento]}."""
    lineas = []
    for fuente, lista in sorted(resultados.items()):
        n = len(lista) or 1
        pct = lambda f: f'{100 * sum(1 for r in lista if f(r)) / n:.0f} %'
        pendientes = {}
        for r in lista:
            for campo, valor in r['sin_revisar']:
                pendientes[f'{campo}={valor}'] = pendientes.get(f'{campo}={valor}', 0) + 1
        texto = ', '.join(f'{k} ({v})' for k, v in sorted(pendientes.items(), key=lambda x: (-x[1], x[0]))[:5])
        lineas.append(f'[agenda] Clasificación {fuente}: {len(lista)} eventos; tema {pct(lambda r: r["temas"])}, '
                      f'formato {pct(lambda r: r["formatos"])}, precio {pct(lambda r: r["precio"])}'
                      + (f'; sin revisar: {texto}' if texto else ''))
    return lineas
