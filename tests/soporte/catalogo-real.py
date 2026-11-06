"""Proyección del catálogo real para JS, solo con la biblioteca estándar."""
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from medios import todos_los_medios

print(json.dumps({m['d']: {'n': m['n'], 'g': m['grupo'], 't': m['type'],
                         'l': m['lang'], 'tags': m['tags']}
                  for m in todos_los_medios()}, ensure_ascii=False))
