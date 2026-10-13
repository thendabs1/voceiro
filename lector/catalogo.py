"""Catálogo de medios del lector, sacado de medios.py (el de Voceiro).

Uso: python3 -I lector/catalogo.py   → JSON por la salida estándar.
Lo llama lector/build.mjs al construir: así hay un solo catálogo, y cada
cambio en medios.py sube la versión del lector (ver build.mjs).

Forma de cada medio en el lector: {d, n, lang, type, tags}, agrupados como
en medios.py ({group, items}).
"""
import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
import medios  # noqa: E402

TIPOS = {'diario', 'digital', 'revista', 'deportivo', 'economico',
         'tecnologia', 'cultural', 'tv', 'radio', 'agencia', 'otro'}


def medio(m):
    langs = m.get('langs') or []
    lang = m.get('lang_principal') or (langs[0] if langs else 'auto')
    tipo = m.get('type') if m.get('type') in TIPOS else 'otro'
    tags = []
    for t in list(m.get('tags') or []) + [m.get('sector'), m.get('ambito'), m.get('region')]:
        if t and t not in tags:
            tags.append(t)
    return {'d': m['d'], 'n': m.get('n') or m['d'], 'lang': lang, 'type': tipo, 'tags': tags}


grupos = [{'group': g['group'], 'items': [medio(m) for m in g['items'] if m.get('d')]}
          for g in medios.MEDIA_CATALOG]
json.dump(grupos, sys.stdout, ensure_ascii=False, separators=(',', ':'))
