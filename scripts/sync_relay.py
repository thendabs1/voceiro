#!/usr/bin/env python3
"""
scripts/sync_relay.py — Genera la allowlist del relay de Deno a partir del
catálogo: los hosts de todas las fuentes con la opción 'relay' en medios.py.

Fuente de verdad: medios.py. workers/deno-relay/src/permitidos.json no se
edita a mano; lo regenera sync-relay.yml tras cada merge que toque medios.py.

Uso: python scripts/sync_relay.py
"""

import json
import os
import sys
from urllib.parse import urlparse

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, ROOT)
from medios import todos_los_medios, fuentes_de  # noqa: E402

DESTINO = os.path.join(ROOT, 'workers/deno-relay/src/permitidos.json')


def hosts_relay():
    hosts = set()
    for m in todos_los_medios():
        for f in fuentes_de(m):
            if 'relay' in f[2:]:
                host = (urlparse(f[1]).hostname or '').lower()
                hosts.add(host[4:] if host.startswith('www.') else host)
    return sorted(h for h in hosts if h)


def main():
    hosts = hosts_relay()
    with open(DESTINO, 'w', encoding='utf-8') as fh:
        json.dump(hosts, fh, indent=2)
        fh.write('\n')
    print(f"✓ {os.path.relpath(DESTINO, ROOT)}: {len(hosts)} hosts")


if __name__ == '__main__':
    main()
