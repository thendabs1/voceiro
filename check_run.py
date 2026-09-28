#!/usr/bin/env python3
"""
check_run.py — Diagnóstico del último run de Voceiro.

Lee public/datos.json y ofrece distintos análisis para depurar el cronjob.

Modos:
  --resumen (por defecto)   Estado general del run
  --medio DOMINIO           Detalle de un medio concreto
  --sin-titulares           Medios del catálogo sin titulares en el JSON
  --sin-fecha               Medios con items pero 0 con fecha real
  --fallos                  Medios que llevan mucho sin responder
  --test-gn-fechas          Experimento: medir match GN↔scraper para fechas
  --csv FILE                Exporta el resultado del modo actual a CSV

Uso:
  python check_run.py
  python check_run.py --medio eldiario.es
  python check_run.py --sin-titulares
  python check_run.py --test-gn-fechas --csv gn_fechas.csv
"""

import argparse
import csv
import json
import os
import re
import sys
import unicodedata
import urllib.parse
import xml.etree.ElementTree as ET
from collections import defaultdict, Counter
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

try:
    import requests
except ImportError:
    print("Falta 'requests'. Instala con: pip install requests")
    sys.exit(1)

try:
    from medios import (
        todos_los_medios, HEADERS, GN_LOCALE,
        GN_FALLBACK_DOMAINS, GN_QUERY_OVERRIDES,
    )
except ImportError:
    print("No se pudo importar medios.py. Ejecuta desde la raíz del repo.")
    sys.exit(1)

try:
    from zoneinfo import ZoneInfo
    TZ_MADRID = ZoneInfo('Europe/Madrid')
except ImportError:
    TZ_MADRID = timezone.utc

DATOS_PATH = 'public/datos.json'
TIMEOUT = 15


# ────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────
def cargar_datos():
    if not os.path.exists(DATOS_PATH):
        print(f"No existe {DATOS_PATH}. ¿Has corrido el recolector?")
        sys.exit(1)
    with open(DATOS_PATH, encoding='utf-8') as f:
        return json.load(f)


def parse_iso(s):
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=TZ_MADRID)
        return dt
    except (ValueError, TypeError):
        return None


def norm_titular(s):
    """Normaliza titular para comparar GN ↔ scraper."""
    s = (s or '').lower()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r'[^\w\s]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def dominio_de_url(url):
    if not url:
        return ''
    try:
        d = (urllib.parse.urlparse(url).netloc or '').lower()
        return d[4:] if d.startswith('www.') else d
    except Exception:
        return ''


def gn_url(domain, lang='es', extra_q=None):
    hl, gl, ceid = GN_LOCALE.get(lang, GN_LOCALE['es'])
    q = f"site:{domain}"
    if extra_q:
        q = f"{q} {extra_q}"
    return (
        "https://news.google.com/rss/search?"
        f"q={urllib.parse.quote_plus(q)}&hl={hl}&gl={gl}&ceid={ceid}"
    )


def fetch_gn(domain, lang='es'):
    extra = GN_QUERY_OVERRIDES.get(domain)
    url = gn_url(domain, lang, extra)
    r = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
    r.raise_for_status()
    return r.content


def parse_gn_items(content):
    """Devuelve [(titular, source_domain, fecha_iso), ...]"""
    root = ET.fromstring(content)
    out = []
    for it in root.findall('.//item'):
        t = (it.findtext('title') or '').strip()
        pub = (it.findtext('pubDate') or '').strip()
        src_el = it.find('source')
        src_url = src_el.get('url', '') if src_el is not None else ''
        src_name = (src_el.text or '').strip() if src_el is not None else ''

        # Quitar sufijo " - NombreMedio"
        if src_name and t.endswith(' - ' + src_name):
            t = t[:-len(' - ' + src_name)].strip()

        fecha_iso = ''
        if pub:
            try:
                dt = parsedate_to_datetime(pub)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                fecha_iso = dt.astimezone(TZ_MADRID).isoformat(timespec='seconds')
            except Exception:
                pass

        out.append({
            'titular': t,
            'source_domain': dominio_de_url(src_url),
            'fecha': fecha_iso,
        })
    return out


# ────────────────────────────────────────────────────────────
# Modos
# ────────────────────────────────────────────────────────────
def modo_resumen(data):
    noticias = data.get('noticias', [])
    generado = data.get('generado', '')
    ultimo_exito = data.get('ultimo_exito_por_medio', {}) or {}

    print("═" * 62)
    print("RESUMEN DEL RUN")
    print("═" * 62)
    print(f"Generado:           {generado}")
    print(f"Total noticias:     {len(noticias)}")

    t_gen = parse_iso(generado)
    if t_gen:
        edad = (datetime.now(TZ_MADRID) - t_gen).total_seconds() / 60
        print(f"Edad del JSON:      {edad:.1f} min")

    # Fuentes
    fuentes = Counter(n.get('fuente') or '?' for n in noticias)
    print("\n── Fuentes ──")
    for f, c in fuentes.most_common():
        print(f"  {f:<15} {c:>6}")

    # Cobertura de fechas
    con_pub = sum(1 for n in noticias if n.get('fecha_pub'))
    con_est = sum(1 for n in noticias if not n.get('fecha_pub') and n.get('fecha_estimada'))
    sin_fecha = len(noticias) - con_pub - con_est
    print("\n── Cobertura de fechas ──")
    print(f"  Con fecha real:     {con_pub:>5}  ({100*con_pub/max(1,len(noticias)):.1f}%)")
    print(f"  Con fecha estimada: {con_est:>5}  ({100*con_est/max(1,len(noticias)):.1f}%)")
    print(f"  Sin fecha ninguna:  {sin_fecha:>5}")

    # Antigüedad real
    ahora = datetime.now(TZ_MADRID)
    hace_1h = sum(1 for n in noticias
                  if (parse_iso(n.get('fecha_pub')) or parse_iso(n.get('fecha_estimada')) or datetime.min.replace(tzinfo=TZ_MADRID)) >= ahora - timedelta(hours=1))
    hace_24h = sum(1 for n in noticias
                   if (parse_iso(n.get('fecha_pub')) or parse_iso(n.get('fecha_estimada')) or datetime.min.replace(tzinfo=TZ_MADRID)) >= ahora - timedelta(hours=24))
    print(f"\n── Recencia ──")
    print(f"  Última hora:    {hace_1h:>5}")
    print(f"  Últimas 24 h:   {hace_24h:>5}")

    # Marcas de último éxito
    print(f"\n── Salud de medios ──")
    print(f"  Medios con marca de éxito: {len(ultimo_exito)}")

    # Medios con marca vieja
    if ultimo_exito:
        viejos = []
        for dom, iso in ultimo_exito.items():
            t = parse_iso(iso)
            if not t:
                continue
            edad_h = (ahora - t).total_seconds() / 3600
            if edad_h > 2:
                viejos.append((dom, edad_h))
        if viejos:
            print(f"  Medios sin responder >2h:  {len(viejos)}")
            for dom, h in sorted(viejos, key=lambda x: -x[1])[:10]:
                print(f"    · {dom}: {h:.1f} h")
        else:
            print("  Todos los medios respondieron en las últimas 2h ✓")

    # Medios del catálogo sin titulares
    catalogo = todos_los_medios()
    dominios_con_titulares = {n.get('dominio') for n in noticias if n.get('dominio')}
    sin_titulares = [m for m in catalogo if m['d'] not in dominios_con_titulares]
    if sin_titulares:
        print(f"\n── Medios sin titulares ({len(sin_titulares)}) ──")
        for m in sin_titulares:
            print(f"  · {m['n']} ({m['d']})")


def modo_medio(data, dominio):
    noticias = [n for n in data.get('noticias', []) if n.get('dominio') == dominio]
    if not noticias:
        print(f"No hay items para {dominio}")
        return

    print(f"── {dominio} · {len(noticias)} items ──")

    # Fuente
    fuentes = Counter(n.get('fuente') or '?' for n in noticias)
    for f, c in fuentes.most_common():
        print(f"  {f}: {c}")

    # Fechas
    con_pub = sum(1 for n in noticias if n.get('fecha_pub'))
    print(f"  Con fecha real: {con_pub}/{len(noticias)}")

    # Último item
    orden = sorted(noticias, key=lambda n: parse_iso(n.get('fecha_pub') or n.get('fecha_estimada') or n.get('fecha') or '') or datetime.min.replace(tzinfo=TZ_MADRID), reverse=True)
    print(f"\n  Últimos 10 titulares:")
    for n in orden[:10]:
        fecha = n.get('fecha_pub') or n.get('fecha_estimada') or n.get('fecha') or '?'
        print(f"    [{fecha[:16]}] {n['titular'][:80]}")


def modo_sin_titulares(data):
    catalogo = todos_los_medios()
    dominios_con_titulares = {n.get('dominio') for n in data.get('noticias', []) if n.get('dominio')}
    sin = [m for m in catalogo if m['d'] not in dominios_con_titulares]

    print(f"Medios del catálogo sin titulares en el JSON: {len(sin)}")
    if not sin:
        return
    for m in sin:
        print(f"  · {m['n']:<40} {m['d']:<35} [{m['grupo']}]")
    return [{'nombre': m['n'], 'dominio': m['d'], 'grupo': m['grupo']} for m in sin]


def modo_sin_fecha(data):
    por_medio = defaultdict(lambda: {'total': 0, 'con_fecha': 0})
    for n in data.get('noticias', []):
        dom = n.get('dominio')
        if not dom:
            continue
        por_medio[dom]['total'] += 1
        if n.get('fecha_pub'):
            por_medio[dom]['con_fecha'] += 1

    # Medios con items pero 0 con fecha real
    sin_fecha = [(dom, v) for dom, v in por_medio.items() if v['total'] > 0 and v['con_fecha'] == 0]
    sin_fecha.sort(key=lambda x: -x[1]['total'])

    print(f"Medios con items pero 0 con fecha real: {len(sin_fecha)}")
    for dom, v in sin_fecha:
        print(f"  · {dom:<40} {v['total']:>4} items")

    return [{'dominio': d, 'items': v['total']} for d, v in sin_fecha]


def modo_fallos(data, horas=2):
    ultimo = data.get('ultimo_exito_por_medio', {}) or {}
    if not ultimo:
        print("No hay marcas de último éxito en el JSON.")
        return

    ahora = datetime.now(TZ_MADRID)
    viejos = []
    for dom, iso in ultimo.items():
        t = parse_iso(iso)
        if not t:
            continue
        h = (ahora - t).total_seconds() / 3600
        if h >= horas:
            viejos.append((dom, h))

    viejos.sort(key=lambda x: -x[1])
    print(f"Medios sin responder en las últimas {horas}h: {len(viejos)}")
    for dom, h in viejos:
        print(f"  · {dom:<40} {h:>7.1f} h")


def modo_test_gn_fechas(data, max_medios=50, verbose=False):
    """
    Para cada medio con items scrapeados sin fecha, pide a GN y mide:
      - recall: cuántos items del scraper consigo fechar con GN
      - precision: de los que se fechan, cuántos caen cerca de la estimada
    """
    por_medio = defaultdict(list)
    for n in data.get('noticias', []):
        if n.get('fuente') != 'Scraping':
            continue
        if n.get('fecha_pub'):
            continue
        dom = n.get('dominio')
        if dom:
            por_medio[dom].append(n)

    # Ordenar por número de items descendente
    candidatos = sorted(por_medio.items(), key=lambda x: -len(x[1]))
    candidatos = candidatos[:max_medios]

    print(f"Analizando {len(candidatos)} medios con scraping sin fecha")
    print(f"(ventana de comparación: ±2h entre fecha GN y fecha estimada)\n")

    headers = ['dominio', 'items_scraper', 'items_gn', 'matches',
               'recall_%', 'precision_%', 'delta_medio_min']
    filas = []

    total_scraper = 0
    total_matches = 0
    total_precision_ok = 0

    for i, (dom, items_scraper) in enumerate(candidatos, 1):
        print(f"[{i:>3}/{len(candidatos)}] {dom:<38}", end=' ', flush=True)

        # Buscar el lang en el catálogo
        medio_cat = next((m for m in todos_los_medios() if m['d'] == dom), None)
        lang = medio_cat.get('lang', 'es') if medio_cat else 'es'

        try:
            content = fetch_gn(dom, lang)
            items_gn = parse_gn_items(content)
        except Exception as e:
            print(f"→ error: {type(e).__name__}")
            filas.append([dom, len(items_scraper), 0, 0, 0, 0, ''])
            continue

        # Indexar GN por titular normalizado
        idx_gn = {}
        for it in items_gn:
            key = norm_titular(it['titular'])
            if key and key not in idx_gn:
                idx_gn[key] = it

        # Cruce
        matches = 0
        precision_ok = 0
        deltas = []
        for n_s in items_scraper:
            key = norm_titular(n_s['titular'])
            gn_it = idx_gn.get(key)
            if not gn_it or not gn_it.get('fecha'):
                continue
            matches += 1

            # Comparar con fecha_estimada
            t_gn = parse_iso(gn_it['fecha'])
            t_est = parse_iso(n_s.get('fecha_estimada'))
            if t_gn and t_est:
                delta_min = abs((t_gn - t_est).total_seconds()) / 60
                deltas.append(delta_min)
                # Precision: fecha GN y estimada a menos de 2h
                if delta_min <= 120:
                    precision_ok += 1

        recall = 100 * matches / max(1, len(items_scraper))
        precision = 100 * precision_ok / max(1, matches)
        delta_medio = sum(deltas) / len(deltas) if deltas else 0

        total_scraper += len(items_scraper)
        total_matches += matches
        total_precision_ok += precision_ok

        print(f"→ S:{len(items_scraper):>3}  GN:{len(items_gn):>3}  "
              f"match:{matches:>3} ({recall:>5.1f}%)  "
              f"prec:{precision:>5.1f}%  "
              f"Δ:{delta_medio:>5.0f}min")

        filas.append([dom, len(items_scraper), len(items_gn), matches,
                      f"{recall:.1f}", f"{precision:.1f}", f"{delta_medio:.0f}"])

    # Resumen
    print("\n" + "═" * 62)
    print("RESUMEN GLOBAL")
    print("═" * 62)
    print(f"Items scraper analizados: {total_scraper}")
    print(f"Items GN que matchean:    {total_matches}")
    print(f"Recall global:            {100*total_matches/max(1,total_scraper):.1f}%")
    print(f"Precision global:         {100*total_precision_ok/max(1,total_matches):.1f}%")

    # Umbral de decisión
    if total_scraper > 0:
        recall = 100 * total_matches / total_scraper
        precision = 100 * total_precision_ok / max(1, total_matches)
        print()
        if recall >= 60 and precision >= 95:
            print("✅ COMPENSA: recall ≥60% y precision ≥95%")
        elif recall >= 40 and precision >= 85:
            print("⚠️  ZONA GRIS: compensa según cuánto te moleste el badge 'estimada'")
        else:
            print("❌ NO COMPENSA: recall o precision por debajo del umbral")

    return filas, headers


# ────────────────────────────────────────────────────────────
# Main
# ────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description='Diagnóstico del último run de Voceiro')
    ap.add_argument('--medio', metavar='DOMINIO', help='Detalle de un medio')
    ap.add_argument('--sin-titulares', action='store_true', help='Medios sin titulares')
    ap.add_argument('--sin-fecha', action='store_true', help='Medios con 0 fecha real')
    ap.add_argument('--fallos', action='store_true', help='Medios sin responder >2h')
    ap.add_argument('--horas', type=int, default=2, help='Umbral de horas para --fallos')
    ap.add_argument('--test-gn-fechas', action='store_true', help='Experimento GN para fechas')
    ap.add_argument('--max-medios', type=int, default=50, help='Máx medios para --test-gn-fechas')
    ap.add_argument('--csv', metavar='FILE', help='Exportar resultado a CSV')
    args = ap.parse_args()

    data = cargar_datos()

    resultado = None

    if args.medio:
        modo_medio(data, args.medio)
    elif args.sin_titulares:
        resultado = modo_sin_titulares(data)
    elif args.sin_fecha:
        resultado = modo_sin_fecha(data)
    elif args.fallos:
        modo_fallos(data, args.horas)
    elif args.test_gn_fechas:
        filas, headers = modo_test_gn_fechas(data, args.max_medios)
        resultado = filas
        if args.csv:
            with open(args.csv, 'w', newline='', encoding='utf-8') as f:
                w = csv.writer(f)
                w.writerow(headers)
                w.writerows(filas)
            print(f"\nCSV guardado en: {args.csv}")
    else:
        modo_resumen(data)

    # Export CSV para modos tabulares
    if args.csv and resultado and not args.test_gn_fechas:
        with open(args.csv, 'w', newline='', encoding='utf-8') as f:
            w = csv.DictWriter(f, fieldnames=resultado[0].keys() if resultado else [])
            w.writeheader()
            w.writerows(resultado)
        print(f"\nCSV guardado en: {args.csv}")


if __name__ == '__main__':
    main()
