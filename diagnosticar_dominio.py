#!/usr/bin/env python3
"""Inspecciona una URL y prueba fuentes con los extractores de Voceiro."""
import argparse
import contextlib
import io
import json
import sys
from pathlib import Path
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup
import recolector as R
from medios import todos_los_medios
from salud_fuentes import probar


def url_http(valor):
    p = urlparse(valor)
    if p.scheme not in ('http', 'https') or not p.hostname or p.username or p.password:
        raise argparse.ArgumentTypeError('Usa una URL http(s) completa, sin credenciales')
    return valor


def inspeccionar(html, url):
    """Describe el HTML y descubre feeds sin inventar rutas del sitio."""
    soup = BeautifulSoup(html, 'lxml')
    fuentes = []
    for link in soup.find_all('link', href=True):
        tipo = (link.get('type') or '').lower().split(';')[0].strip()
        if 'alternate' in link.get('rel', []) and tipo in (
                'application/rss+xml', 'application/atom+xml'):
            destino = urljoin(url, link['href'])
            if urlparse(destino).scheme in ('http', 'https'):
                fuente = ('rss', destino)
                if fuente not in fuentes:
                    fuentes.append(fuente)
    tipos_ld, errores_ld = set(), 0

    def visitar(obj):
        if isinstance(obj, list):
            for hijo in obj:
                visitar(hijo)
        elif isinstance(obj, dict):
            tipo = obj.get('@type', [])
            tipos_ld.update(t for t in (tipo if isinstance(tipo, list) else [tipo])
                            if isinstance(t, str))
            for hijo in obj.values():
                if isinstance(hijo, (list, dict)):
                    visitar(hijo)

    for script in soup.find_all('script', type='application/ld+json'):
        try:
            visitar(json.loads(script.string or script.get_text()))
        except (ValueError, TypeError):
            errores_ld += 1
    dom = R._dominio_de(url)
    return {
        'titulo': soup.title.get_text(' ', strip=True) if soup.title else '',
        'etiquetas': {tag: len(soup.find_all(tag)) for tag in
                      ('h1', 'h2', 'h3', 'article', 'time', 'a')},
        'jsonld_tipos': sorted(tipos_ld), 'jsonld_invalidos': errores_ld,
        'candidatos_headings': len(R._scrape_headings(soup, url, dom)),
        'candidatos_slugs': len(R._scrape_slugs(soup, url, dom)),
        'feeds_descubiertos': fuentes,
    }


def diagnosticar(url, tipo='auto', lang='es', muestras=3, limite=8):
    dom = R._dominio_de(url)
    medio = next((m for m in todos_los_medios() if m['d'] == dom),
                 {'n': dom, 'd': dom, 'lang': lang})
    informe = {'url': url, 'dominio': dom, 'fuentes': []}
    # Auto inspecciona la página y añade los feeds anunciados a las fuentes
    # del catálogo. Los tipos explícitos permiten probar una URL conocida.
    fuentes = [(tipo, url)] if tipo in ('rss', 'sitemap', 'scrape') else [(tipo,)]
    if tipo == 'auto':
        fuentes = list(R.fuentes_de(medio)) if 'fuentes' in medio else [('scrape', url)]
        try:
            r = R.SESSION.get(url, timeout=R.TIMEOUT)
            informe['http'] = {'estado': r.status_code, 'url_final': r.url,
                               'tipo': r.headers.get('content-type', ''),
                               'bytes': len(r.content)}
            if r.status_code == 200:
                estructura = inspeccionar(r.text, r.url)
                informe['estructura'] = estructura
                fuentes.extend(estructura['feeds_descubiertos'])
        except Exception as exc:
            informe['error_pagina'] = f'{type(exc).__name__}: {exc}'
    fuentes = list(dict.fromkeys(tuple(f) for f in fuentes))
    informe['fuentes_omitidas'] = max(0, len(fuentes) - limite)
    for fuente in fuentes[:limite]:
        logs = io.StringIO()
        with contextlib.redirect_stdout(logs):
            fila = probar(medio, fuente, muestras=muestras)
        fila['configuracion'] = fuente
        fila['detalle'] = logs.getvalue().strip()
        informe['fuentes'].append(fila)
    return informe


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('url', type=url_http)
    ap.add_argument('--tipo', choices=['auto', 'rss', 'sitemap', 'scrape', 'wp', 'gn'], default='auto')
    ap.add_argument('--lang', default='es', help='Idioma para dominios nuevos en Google News')
    ap.add_argument('--json', metavar='ARCHIVO', help='Guardar informe completo')
    args = ap.parse_args()
    informe = diagnosticar(args.url, args.tipo, args.lang)
    salida = json.dumps(informe, ensure_ascii=False, indent=2)
    print(salida)
    if args.json:
        Path(args.json).write_text(salida + '\n', encoding='utf-8')
    # Un HTTP 200 sin titulares no es un diagnóstico satisfactorio.
    return 0 if any(f['estado'] == 'ok' for f in informe['fuentes']) else 1


if __name__ == '__main__':
    sys.exit(main())
