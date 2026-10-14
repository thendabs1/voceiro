"""Catálogo de medios del lector, sacado de medios.py (el de Voceiro).

Uso: python3 -I lector/catalogo.py   → JSON por la salida estándar.
Lo llama lector/build.mjs al construir: así hay un solo catálogo, y cada
cambio en medios.py sube la versión del lector (ver build.mjs).

Forma de cada medio en el lector: {d, n, lang}, agrupados como en
medios.py ({group, items}). El lector solo lo usa para saber qué es un
medio (y sacar el botón) y en qué idioma está (el diccionario); cómo se
clasifican los medios es cosa de Voceiro.
"""
import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
import medios  # noqa: E402

def medio(m):
    langs = m.get('langs') or []
    lang = m.get('lang_principal') or (langs[0] if langs else 'auto')
    return {'d': m['d'], 'n': m.get('n') or m['d'], 'lang': lang}


grupos = [{'group': g['group'], 'items': [medio(m) for m in g['items'] if m.get('d')]}
          for g in medios.MEDIA_CATALOG]
json.dump(grupos, sys.stdout, ensure_ascii=False, separators=(',', ':'))
