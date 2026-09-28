#!/usr/bin/env python3
"""
check_run.py — Diagnóstico del último run de Voceiro.

Lee public/datos.json y ofrece distintos análisis para depurar el cronjob.

Modos:
  --resumen (defecto)     Estado general del run
  --medio DOMINIO         Detalle de un medio concreto
  --sin-titulares         Medios del catálogo sin titulares en el JSON
  --sin-fecha             Medios con items pero 0 con fecha real
  --fallos                Medios que llevan mucho sin responder
  --test-gn-match         Test de match de titulares GN ↔ scraper (SIN usar fecha_estimada)
  --test-gn-fechas        Test antiguo (usa fecha_estimada como referencia)
  --csv FILE              Exporta el resultado del modo actual a CSV

Uso:
  python check_run.py
  python check_run.py --medio eldiario.es
  python check_run.py --sin-titulares
  python check_run.py --test-gn-match --csv matches.csv
  python check_run.py --test-gn-match --sample 5
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
    """Normaliza un titular para comparar GN ↔ scraper."""
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
    """Devuelve [{titular, source_domain, fecha}, ...]."""
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


def medio_lang(dom):
    m = next((x for x in todos_los_medios() if x['d'] == dom), None)
    return m.get('lang', 'es') if m else 'es'


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

    fuentes = Counter(n.get('fuente') or '?' for n in noticias)
    print("\n── Fuentes ──")
    for f, c in fuentes.most_common():
        print(f"  {f:<15} {c:>6}")

    con_pub = sum(1 for n in noticias if n.get('fecha_pub'))
    con_est = sum(1 for n in noticias if not n.get('fecha_pub') and n.get('fecha_estimada'))
    sin_fecha = len(noticias) - con_pub - con_est
    print("\n── Cobertura de fechas ──")
    print(f"  Con fecha real:     {con_pub:>5}  ({100*con_pub/max(1,len(noticias)):.1f}%)")
    print(f"  Con fecha estimada: {con_est:>5}  ({100*con_est/max(1,len(noticias)):.1f}%)")
    print(f"  Sin fecha ninguna:  {sin_fecha:>5}")

    ahora = datetime.now(TZ_MADRID)
    hace_1h = 0
    hace_24h = 0
    for n in noticias:
        t = parse_iso(n.get('fecha_pub') or n.get('fecha_estimada') or n.get('fecha'))
        if not t:
            continue
        if (ahora - t) <= timedelta(hours=1):
            hace_1h += 1
        if (ahora - t) <= timedelta(hours=24):
            hace_24h += 1
    print("\n── Recencia ──")
    print(f"  Última hora:    {hace_1h:>5}")
    print(f"  Últimas 24 h:   {hace_24h:>5}")

    print(f"\n── Salud de medios ──")
    print(f"  Medios con marca de éxito: {len(ultimo_exito)}")

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

    fuentes = Counter(n.get('fuente') or '?' for n in noticias)
    for f, c in fuentes.most_common():
        print(f"  {f}: {c}")

    con_pub = sum(1 for n in noticias if n.get('fecha_pub'))
    print(f"  Con fecha real: {con_pub}/{len(noticias)}")

    def key_ord(n):
        t = parse_iso(n.get('fecha_pub') or n.get('fecha_estimada') or n.get('fecha'))
        return t or datetime.min.replace(tzinfo=TZ_MADRID)
    orden = sorted(noticias, key=key_ord, reverse=True)
    print("\n  Últimos 10 titulares:")
    for n in orden[:10]:
        fecha = n.get('fecha_pub') or n.get('fecha_estimada') or n.get('fecha') or '?'
        print(f"    [{fecha[:16]}] {n['titular'][:80]}")


def modo_sin_titulares(data):
    catalogo = todos_los_medios()
    dominios_con_titulares = {n.get('dominio') for n in data.get('noticias', []) if n.get('dominio')}
    sin = [m for m in catalogo if m['d'] not in dominios_con_titulares]

    print(f"Medios del catálogo sin titulares en el JSON: {len(sin)}")
    if not sin:
        return []
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

    sin_fecha = [(dom, v) for dom, v in por_medio.items()
                 if v['total'] > 0 and v['con_fecha'] == 0]
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


# ────────────────────────────────────────────────────────────
# Modo nuevo: test de match de titulares (sin fecha_estimada)
# ────────────────────────────────────────────────────────────
def modo_test_gn_match(data, max_medios=50, sample=3):
    """
    Mide si los titulares del scraper (sin fecha real) existen en GN
    normalizados. NO usa fecha_estimada como referencia.

    Muestra por medio y opcionalmente 3 pares para inspección visual.
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

    candidatos = sorted(por_medio.items(), key=lambda x: -len(x[1]))[:max_medios]

    ahora = datetime.now(TZ_MADRID)
    filas_csv = []
    headers_csv = ['dominio', 'titular_scraper', 'titular_gn',
                   'fecha_gn', 'edad_dias', 'source_gn']

    total_scraper = 0
    total_matches = 0
    total_frescos_7d = 0
    total_frescos_24h = 0
    total_frescos_15d = 0

    print(f"Analizando {len(candidatos)} medios")
    print(f"(comparando titulares normalizados, SIN usar fecha_estimada)\n")

    for i, (dom, items_scraper) in enumerate(candidatos, 1):
        lang = medio_lang(dom)

        try:
            content = fetch_gn(dom, lang)
            items_gn = parse_gn_items(content)
        except Exception as e:
            print(f"[{i:>3}/{len(candidatos)}] {dom:<38} → error: {type(e).__name__}")
            continue

        idx_gn = {}
        for it in items_gn:
            key = norm_titular(it['titular'])
            if key and key not in idx_gn:
                idx_gn[key] = it

        matches = []
        for n_s in items_scraper:
            key = norm_titular(n_s['titular'])
            gn_it = idx_gn.get(key)
            if not gn_it or not gn_it.get('fecha'):
                continue
            src = gn_it.get('source_domain', '')
            if src and not (src == dom or src.endswith('.' + dom)
                            or dom.endswith('.' + src)):
                continue
            t_gn = parse_iso(gn_it['fecha'])
            if not t_gn:
                continue
            edad_dias = (ahora - t_gn).total_seconds() / 86400
            matches.append({
                'scraper': n_s['titular'],
                'gn': gn_it['titular'],
                'fecha_gn': gn_it['fecha'],
                'edad_dias': edad_dias,
                'source': src,
            })

        n_match = len(matches)
        n_7d = sum(1 for m in matches if m['edad_dias'] <= 7)
        n_24h = sum(1 for m in matches if m['edad_dias'] <= 1)
        n_15d = sum(1 for m in matches if m['edad_dias'] <= 15)

        total_scraper += len(items_scraper)
        total_matches += n_match
        total_frescos_7d += n_7d
        total_frescos_24h += n_24h
        total_frescos_15d += n_15d

        pct_match = 100 * n_match / max(1, len(items_scraper))
        pct_7d = 100 * n_7d / max(1, n_match)
        pct_24h = 100 * n_24h / max(1, n_match)

        print(f"[{i:>3}/{len(candidatos)}] {dom:<38} "
              f"S:{len(items_scraper):>3} GN:{len(items_gn):>3} "
              f"match:{n_match:>3} ({pct_match:>5.1f}%) "
              f"≤7d:{pct_7d:>5.1f}% ≤24h:{pct_24h:>5.1f}%")

        if sample and matches:
            matches_sorted = sorted(matches, key=lambda x: x['edad_dias'])[:sample]
            for m in matches_sorted:
                print(f"        [{m['edad_dias']:>7.1f}d] {m['scraper'][:62]}")
                print(f"                    → {m['gn'][:62]}")

        for m in matches:
            filas_csv.append([
                dom, m['scraper'][:140], m['gn'][:140],
                m['fecha_gn'], f"{m['edad_dias']:.2f}", m['source']
            ])

    print("\n" + "═" * 62)
    print("RESUMEN GLOBAL")
    print("═" * 62)
    print(f"Items scraper analizados: {total_scraper}")
    print(f"Matches por titular:      {total_matches}")
    print(f"Titular match rate:       {100*total_matches/max(1,total_scraper):.1f}%")
    print(f"De los matches, ≤7 días:  {100*total_frescos_7d/max(1,total_matches):.1f}%")
    print(f"De los matches, ≤24h:     {100*total_frescos_24h/max(1,total_matches):.1f}%")
    print(f"De los matches, ≤15 días: {100*total_frescos_15d/max(1,total_matches):.1f}%")

    print()
    print("Lectura:")
    print("  · match rate bajo (<10%) → GN no tiene indexados los titulares del scraper")
    print("  · ≤7d bajo (<30%)        → los matches son titulares viejos o genéricos")
    print("  · ≤7d alto (>70%)        → los matches son noticias reales y recientes")

    return filas_csv, headers_csv


# ────────────────────────────────────────────────────────────
# Modo antiguo: test GN fechas (usa fecha_estimada)
# ────────────────────────────────────────────────────────────
def modo_test_gn_fechas(data, max_medios=50, verbose=False):
    """
    Test ANTIGUO. Compara la fecha de GN con la fecha_estimada.
    Mantenido por si quieres usarlo en el futuro, pero la fecha_estimada
    no es una buena referencia (ver conversación).
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

    candidatos = sorted(por_medio.items(), key=lambda x: -len(x[1]))[:max_medios]

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
        lang = medio_lang(dom)

        try:
            content = fetch_gn(dom, lang)
            items_gn = parse_gn_items(content)
        except Exception as e:
            print(f"→ error: {type(e).__name__}")
            filas.append([dom, len(items_scraper), 0, 0, 0, 0, ''])
            continue

        idx_gn = {}
        for it in items_gn:
            key = norm_titular(it['titular'])
            if key and key not in idx_gn:
                idx_gn[key] = it

        matches = 0
        precision_ok = 0
        deltas = []
        for n_s in items_scraper:
            key = norm_titular(n_s['titular'])
            gn_it = idx_gn.get(key)
            if not gn_it or not gn_it.get('fecha'):
                continue
            matches += 1

            t_gn = parse_iso(gn_it['fecha'])
            t_est = parse_iso(n_s.get('fecha_estimada'))
            if t_gn and t_est:
                delta_min = abs((t_gn - t_est).total_seconds()) / 60
                deltas.append(delta_min)
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

    print("\n" + "═" * 62)
    print("RESUMEN GLOBAL")
    print("═" * 62)
    print(f"Items scraper analizados: {total_scraper}")
    print(f"Items GN que matchean:    {total_matches}")
    print(f"Recall global:            {100*total_matches/max(1,total_scraper):.1f}%")
    print(f"Precision global:         {100*total_precision_ok/max(1,total_matches):.1f}%")

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
    ap.add_argument('--test-gn-match', action='store_true',
                    help='Test de match de titulares (SIN fecha_estimada)')
    ap.add_argument('--test-gn-fechas', action='store_true',
                    help='Test antiguo (usa fecha_estimada)')
    ap.add_argument('--max-medios', type=int, default=50, help='Máx medios a analizar')
    ap.add_argument('--sample', type=int, default=3, help='Pares a mostrar por medio')
    ap.add_argument('--csv', metavar='FILE', help='Exportar resultado a CSV')
    args = ap.parse_args()

    data = cargar_datos()
    resultado = None
    headers = None

    if args.medio:
        modo_medio(data, args.medio)
    elif args.sin_titulares:
        resultado = modo_sin_titulares(data)
    elif args.sin_fecha:
        resultado = modo_sin_fecha(data)
    elif args.fallos:
        modo_fallos(data, args.horas)
    elif args.test_gn_match:
        resultado, headers = modo_test_gn_match(data, args.max_medios, args.sample)
    elif args.test_gn_fechas:
        resultado, headers = modo_test_gn_fechas(data, args.max_medios)
    else:
        modo_resumen(data)

    if args.csv and resultado:
        with open(args.csv, 'w', newline='', encoding='utf-8') as f:
            if headers:
                w = csv.writer(f)
                w.writerow(headers)
                w.writerows(resultado)
            else:
                # Lista de dicts
                w = csv.DictWriter(f, fieldnames=resultado[0].keys() if resultado else [])
                w.writeheader()
                w.writerows(resultado)
        print(f"\nCSV guardado en: {args.csv}")


if __name__ == '__main__':
    main()
