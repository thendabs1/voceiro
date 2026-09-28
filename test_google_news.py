#!/usr/bin/env python3
"""
test_google_news.py

Prueba si Google News RSS sirve titulares para los medios que actualmente
no tienen titulares en Voceiro.

Uso:
    python test_google_news.py                # prueba los 39 de la lista
    python test_google_news.py --todos        # prueba TODOS los medios del catálogo
    python test_google_news.py --dias 7       # cuenta items de los últimos N días (def. 7)
    python test_google_news.py --verbose      # muestra 3 titulares de muestra por medio
    python test_google_news.py --save-csv resultados_gn.csv

Importante: ejecútalo desde el MISMO sitio desde donde corre el cronjob
(VPS, contenedor, etc). Google News trata distinto las IPs de datacenter.
"""

import argparse
import csv
import sys
import time
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

try:
    import requests
except ImportError:
    print("Falta 'requests'. Instala con: pip install requests")
    sys.exit(1)

try:
    from medios import MEDIA_CATALOG, GN_LOCALE, HEADERS
except ImportError as e:
    print(f"No se pudo importar medios.py: {e}")
    print("Ejecuta este script desde la raíz del repo, junto a medios.py")
    sys.exit(1)


# ────────────────────────────────────────────────────────────
# Medios sin titulares según el último run del cronjob
# (por NOMBRE tal como aparece en MEDIA_CATALOG)
# ────────────────────────────────────────────────────────────
SIN_TITULARES = [
    'Telecinco', 'Cuatro', 'Cadena SER', 'Agencia EFE', 'Agencia Colpisa',
    'Estadio Deportivo', 'El Desmarque', 'Cinco Días', 'El Economista',
    'La Información', 'Hipertextual', 'El Salto', 'CTXT', 'Crític',
    'El Punt Avui', '324', 'CCMA', 'Agència Catalana de Notícies',
    'El Progreso', 'Diario de Pontevedra', 'Galicia Digital',
    'CRTVG (TVG y Radio Galega)', 'Radio Voz', 'EITB',
    'Noticias de Navarra', 'La Voz de Asturias', 'Murcia Economía',
    'Madridiario', 'The Times', 'Reuters', 'Associated Press', 'Politico',
    'Les Échos', 'Público', 'Expresso', 'Milenio', 'Infobae',
    'El Nacional', 'Univisión',
]


# ────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────
def flat_medios():
    return [{**it, 'grupo': g['group']} for g in MEDIA_CATALOG for it in g['items']]


def seleccionar_medios(args):
    todos = flat_medios()
    if args.todos:
        return todos
    # Filtra por nombre (los que están en SIN_TITULARES)
    seleccion = [m for m in todos if m['n'] in SIN_TITULARES]
    # Detectar nombres de la lista que no aparecen en el catálogo
    encontrados = {m['n'] for m in seleccion}
    faltan = [n for n in SIN_TITULARES if n not in encontrados]
    if faltan:
        print(f"⚠ Nombres en SIN_TITULARES que no están en el catálogo: {faltan}")
    return seleccion


def gn_url(domain, lang='es', extra_q=None):
    hl, gl, ceid = GN_LOCALE.get(lang, GN_LOCALE['es'])
    q = f"site:{domain}"
    if extra_q:
        q = f"{q} {extra_q}"
    return (
        "https://news.google.com/rss/search?"
        f"q={urllib.parse.quote_plus(q)}&hl={hl}&gl={gl}&ceid={ceid}"
    )


def fetch(url, timeout=15):
    r = requests.get(url, headers=HEADERS, timeout=timeout)
    r.raise_for_status()
    return r.content


def parse_items(xml_bytes):
    root = ET.fromstring(xml_bytes)
    out = []
    for it in root.findall('.//item'):
        title = (it.findtext('title') or '').strip()
        link  = (it.findtext('link')  or '').strip()
        pub   = (it.findtext('pubDate') or '').strip()
        src_el = it.find('source')
        src_name = (src_el.text or '').strip() if src_el is not None else ''
        src_url  = src_el.get('url', '') if src_el is not None else ''

        dt = None
        if pub:
            try:
                dt = parsedate_to_datetime(pub)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
            except Exception:
                pass
        out.append({
            'title': title, 'link': link, 'date': dt,
            'source_name': src_name, 'source_url': src_url,
        })
    return out


def dominio_del_source_url(source_url):
    """Extrae el dominio 'desnudo' de la url del source de GN."""
    if not source_url:
        return ''
    try:
        p = urllib.parse.urlparse(source_url)
        d = (p.netloc or '').lower()
        if d.startswith('www.'):
            d = d[4:]
        return d
    except Exception:
        return ''


# ────────────────────────────────────────────────────────────
# Main
# ────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--todos', action='store_true',
                    help='Probar todos los medios del catálogo, no solo los sin titulares')
    ap.add_argument('--dias', type=int, default=7,
                    help='Ventana en días para considerar items "recientes" (def. 7)')
    ap.add_argument('--verbose', action='store_true',
                    help='Mostrar 3 titulares de muestra por medio')
    ap.add_argument('--save-csv', metavar='FILE',
                    help='Guardar resultados en CSV')
    ap.add_argument('--sleep', type=float, default=0.5,
                    help='Segundos entre peticiones (def. 0.5)')
    args = ap.parse_args()

    medios = seleccionar_medios(args)
    total = len(medios)
    print(f"Probando {total} medios contra Google News RSS")
    print(f"Ventana de recencia: {args.dias} días\n")

    desde = datetime.now(timezone.utc) - timedelta(days=args.dias)

    resultados = []
    ok_total = 0
    ok_recientes = 0
    vacios = []
    fallos = []

    for i, m in enumerate(medios, 1):
        domain = m['d']
        lang   = m.get('lang', 'es')
        url = gn_url(domain, lang)
        prefix = f"[{i:>2}/{total}] {m['n']:<32} ({domain})"

        try:
            xml = fetch(url)
            items = parse_items(xml)
            n_total = len(items)
            n_recientes = sum(
                1 for it in items
                if it['date'] and it['date'] >= desde
            )
            # Verifica que el source apunta al dominio esperado
            sources = {dominio_del_source_url(it['source_url']) for it in items}
            sources.discard('')
            match = domain in sources or any(domain.endswith('.' + s) or s.endswith('.' + domain)
                                              for s in sources)

            if n_total == 0:
                print(f"{prefix}  → 0 items")
                vacios.append(m['n'])
            else:
                marca = "✓" if match else "?"
                print(f"{prefix}  → {n_total:>3} items  ({n_recientes:>3} en {args.dias}d) [{marca}]")
                ok_total += 1
                if n_recientes > 0:
                    ok_recientes += 1

                if args.verbose:
                    for it in items[:3]:
                        fecha = it['date'].strftime('%Y-%m-%d') if it['date'] else '?'
                        src = it['source_name'] or '?'
                        print(f"        · [{fecha}] ({src}) {it['title'][:90]}")

            resultados.append({
                'nombre': m['n'], 'dominio': domain, 'lang': lang,
                'items_total': n_total, 'items_recientes': n_recientes,
                'fuentes': '|'.join(sorted(sources)) if sources else '',
                'ok_dominio': match,
            })

        except requests.HTTPError as e:
            code = e.response.status_code if e.response is not None else '?'
            print(f"{prefix}  → HTTP {code}")
            fallos.append((m['n'], f"HTTP {code}"))
            resultados.append({
                'nombre': m['n'], 'dominio': domain, 'lang': lang,
                'items_total': 0, 'items_recientes': 0, 'fuentes': '',
                'ok_dominio': False,
            })
        except requests.Timeout:
            print(f"{prefix}  → timeout")
            fallos.append((m['n'], "timeout"))
            resultados.append({
                'nombre': m['n'], 'dominio': domain, 'lang': lang,
                'items_total': 0, 'items_recientes': 0, 'fuentes': '',
                'ok_dominio': False,
            })
        except Exception as e:
            print(f"{prefix}  → error: {type(e).__name__}: {e}")
            fallos.append((m['n'], f"{type(e).__name__}: {e}"))
            resultados.append({
                'nombre': m['n'], 'dominio': domain, 'lang': lang,
                'items_total': 0, 'items_recientes': 0, 'fuentes': '',
                'ok_dominio': False,
            })

        time.sleep(args.sleep)

    # ── Resumen ──
    print("\n" + "═" * 60)
    print("RESUMEN")
    print("═" * 60)
    print(f"Medios probados:              {total}")
    print(f"Con al menos 1 item:          {ok_total}")
    print(f"Con items en últimos {args.dias}d:  {ok_recientes}")
    print(f"Sin items (vacíos):           {len(vacios)}")
    print(f"Fallos de red/HTTP:           {len(fallos)}")

    if vacios:
        print("\n▸ VACÍOS (Google News no tiene nada de estos dominios):")
        for n in vacios:
            print(f"   · {n}")

    if fallos:
        print("\n▸ FALLOS:")
        for n, err in fallos:
            print(f"   · {n}: {err}")

    if args.save_csv:
        with open(args.save_csv, 'w', newline='', encoding='utf-8') as f:
            w = csv.DictWriter(f, fieldnames=[
                'nombre', 'dominio', 'lang', 'items_total',
                'items_recientes', 'fuentes', 'ok_dominio',
            ])
            w.writeheader()
            for r in resultados:
                w.writerow(r)
        print(f"\nCSV guardado en: {args.save_csv}")


if __name__ == '__main__':
    main()
