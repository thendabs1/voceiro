"""
Recolector de titulares de Voceiro.

Fases:
  1-3. Probar en orden las 'fuentes' de cada medio (medios.py): RSS,
     sitemap de Google News, API de WordPress, scraping o búsqueda en
     Google News → hasta N_FEED titulares. Cada intento queda registrado
     en la tabla `runs` de Turso (columna `intentos`).
  4. Estimar fecha de los scrapeados nuevos usando el intervalo entre runs
     (por medio, no global — ver `ultimo_exito_por_medio`)
  5. Deduplicar contra el histórico y fusionar
  6. Podar por ventana de retención
  7. Escribir:
        · public/datos.json            (formato viejo, compatibilidad)
        · public/datos/manifest.json   (lo que lee el lector: ventana de días)
        · public/datos/inventario.json (memoria del recolector: ficheros y archivo)
        · public/datos/YYYY-MM-DD.json (un fichero por día, formato corto)
        · public/index.html
  8. Reporte final

Formato corto de noticia (ficheros diarios):
  d: dominio · t: titular · u: enlace · p: fecha_pub (o solo el día,
  AAAA-MM-DD, si la fuente no da hora) · e: fecha_estimada
  c: fecha recolección · f: fuente

Tabla de medios (una por fichero diario, sin duplicación por noticia):
  n: nombre · g: grupo · t: tipo · l: lang · tags: lista

Agrupación por día:
  - La fecha de agrupación prioriza fecha_pub si NO es futura.
  - Si fecha_pub es futura (> recogida + 6h) → se usa fecha_estimada o fecha
    (para no crear ficheros con fechas futuras por eventos programados).
  - Cualquier noticia con fecha de agrupación fuera de la ventana de
    retención se descarta.
"""

from datetime import datetime
import concurrent.futures
import json
import os

from medios import todos_los_medios

from cosecha import catalogo, config, fechas, fuentes, historico, publicacion, r2, turso
from scripts.generar_front import generar_html


def main():
    os.makedirs(config.DATOS_DIR, exist_ok=True)
    publicacion._FICHEROS_ESCRITOS.clear()
    r2.descargar_historico_desde_r2()
    medios_completos = todos_los_medios()
    medios = medios_completos
    if config.GRUPOS_INCLUIDOS:
        medios = [m for m in medios if m['grupo'] in config.GRUPOS_INCLUIDOS]
        print(f"[filtro] grupos activos: {config.GRUPOS_INCLUIDOS}")

    print(f"── Recolectando {len(medios)} medios (hasta {config.N_FEED} cada uno) ──")

    todas = []
    contador_rss = 0
    contador_scrape = 0
    contador_gn = 0
    contador_wp = 0
    contador_sitemap = 0
    sin_resultado = []
    medios_sin_fecha = []

    runs_data = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=config.MAX_WORKERS) as ex:
        for (medio, noticias, fuente, con_fecha, ms, error,
             intentos) in ex.map(fuentes._timed_obtener, medios):
            runs_data.append({
                'dominio':   medio['d'],
                'ok':        bool(noticias),
                'fuente':    fuente,
                'n_items':   len(noticias),
                'con_fecha': con_fecha,
                'ms':        ms,
                'error':     error,
                'intentos':  intentos,
            })
            # La cadena solo aporta si hubo más de un intento
            cadena = f" · {intentos}" if ' > ' in intentos else ''

            if noticias:
                todas.extend(noticias)
                if fuente == 'RSS':
                    contador_rss += 1
                elif fuente == 'Scraping':
                    contador_scrape += 1
                elif fuente == 'Google News':
                    contador_gn += 1
                elif fuente == 'WP-API':
                    contador_wp += 1
                elif fuente == 'Sitemap':
                    contador_sitemap += 1
                if con_fecha == 0 and fuente != 'RSS':
                    medios_sin_fecha.append(medio['n'])
                print(f"✓ {medio['n']} ({fuente}): {len(noticias)} titulares"
                      f" · {con_fecha}/{len(noticias)} con fecha real · {ms}ms"
                      + cadena)
            else:
                sin_resultado.append(medio['n'])
                print(f"✗ {medio['n']}: sin titulares ({ms}ms)"
                      + (f" · {error}" if error else "")
                      + (f" · {intentos}" if intentos else ""))

    print(f"\nTitulares brutos: {len(todas)}")

    # ─── Cargar histórico y calcular T_prev ───
    print("\n── Cargando histórico ──")
    payload_prev = historico.cargar_historico_payload()
    noticias_previas = payload_prev.get('noticias', [])
    ultimo_exito_prev = payload_prev.get('ultimo_exito_por_medio', {}) or {}
    print(f"Histórico previo: {len(noticias_previas)} noticias")
    print(f"Medios con marca de último éxito: {len(ultimo_exito_prev)}")

    t_prev_global = None
    generado_prev = payload_prev.get('generado')
    if generado_prev:
        t_prev_global = fechas._parse_iso_flexible(generado_prev)

    t_now = datetime.now(config.TZ_MADRID)
    if t_prev_global:
        delta_min = (t_now - t_prev_global).total_seconds() / 60
        print(f"Run anterior: {generado_prev} (hace {delta_min:.1f} min)")
    else:
        print("Sin run previo — usando intervalo por defecto")

    historico_keys = {(n['dominio'], n['titular']) for n in noticias_previas}

    # ─── Asignar fechas estimadas ───
    print("\n── Estimando fechas sin hora ──")
    total_estimados, intervalos_por_medio = fechas.asignar_fechas_estimadas(
        todas, historico_keys, t_prev_global, t_now, ultimo_exito_prev
    )
    print(f"Titulares nuevos con fecha estimada: {total_estimados}")

    if intervalos_por_medio:
        if t_prev_global:
            global_seg = (t_now - t_prev_global).total_seconds()
        else:
            global_seg = config.INTERVALO_DEFAULT_SEG
        raros = {
            m: s for m, s in intervalos_por_medio.items()
            if abs(s - global_seg) > 60
        }
        if raros:
            print(f"Intervalos específicos por medio ({len(raros)}):")
            for m, seg in sorted(raros.items(), key=lambda x: -x[1])[:10]:
                print(f"  · {m}: {seg/60:.1f} min")

    # ─── Fusionar con histórico (sin dedup editorial todavía) ───
    print("\n── Fusionando ──")
    historico._drop_reset()
    finales_pre = historico.fusionar_historico(todas, noticias_previas, config.DIAS_RETENCION)
    print(f"Total en histórico (pre-dedup): {len(finales_pre)}")
    resumen_drop = historico._drop_resumen()
    if resumen_drop:
        print(f"  Descartadas por plantilla: {resumen_drop}")
    # La dedup editorial se aplica DENTRO de cada slice en generar_troceados(),
    # y también para la portada. Así no perdemos noticias que solo viven en
    # un slice concreto.

    # ─── Estadísticas ───
    con_pub = sum(1 for n in finales_pre if n.get('fecha_pub'))
    con_est = sum(1 for n in finales_pre
                  if not n.get('fecha_pub') and n.get('fecha_estimada'))
    sin_fecha = len(finales_pre) - con_pub - con_est
    print(f"\n── Cobertura de fechas ──")
    print(f"  Con fecha real:     {con_pub}")
    print(f"  Con fecha estimada: {con_est}")
    print(f"  Sin fecha ninguna:  {sin_fecha}")

    # Cuántas noticias quedan descartadas por fecha fuera de ventana
    descartadas_ventana = len(todas) - len(finales_pre) if len(todas) > len(finales_pre) else 0
    if descartadas_ventana > 0:
        print(f"  Descartadas por fuera de ventana: {descartadas_ventana}")

    print(f"\n── Fuentes ──")
    print(f"  RSS:          {contador_rss} medios")
    print(f"  Sitemap:      {contador_sitemap} medios")
    print(f"  Scraping:     {contador_scrape} medios")
    print(f"  WP-API:       {contador_wp} medios")
    print(f"  Google News:  {contador_gn} medios")

    # ─── Actualizar marcas de último éxito ───
    ultimo_exito_nuevo = dict(ultimo_exito_prev)
    t_now_iso = t_now.isoformat(timespec='seconds')
    for n in todas:
        dom = n.get('dominio')
        if dom:
            ultimo_exito_nuevo[dom] = t_now_iso

    # ─── Escribir salidas ───
    print()

    # Leer inventario previo (el que bajó descargar_historico_desde_r2)
    inventario_prev = None
    if os.path.exists(config.INVENTARIO_PATH):
        try:
            with open(config.INVENTARIO_PATH, encoding='utf-8') as f:
                inventario_prev = json.load(f)
            print(f"[inventario-prev] {len(inventario_prev.get('dias', []))} días"
                  f" + {len(inventario_prev.get('archivo', []))} en archivo")
        except Exception as e:
            # Sin él, el inventario nuevo perdería el archivo y la limpieza
            # borraría sus ficheros.
            raise SystemExit(f"[inventario-prev!] no se pudo leer: {e}")

    # Portada general y ediciones (dedup interno)
    historico._dedup_reset()
    portada_info = publicacion.generar_portada(finales_pre, t_now, prefix='portada')
    portadas_info = {}
    for slug, edicion in config.EDICIONES.items():
        portadas_info[slug] = publicacion.generar_portada(
            catalogo._filtrar_edicion(finales_pre, edicion), t_now,
            max_items=edicion['max'], prefix=f'portada-{slug}')

    # Trocear: all + grupos + dominios
    inventario = publicacion.generar_troceados(
        finales_pre, t_now, portada_info,
        inventario_prev=inventario_prev,
        portadas_info=portadas_info,
    )

    # ─── Subir a R2 (solo lo que cambió, ya está en disco) ───

    # Con errores, ni el inventario ni el manifest se han subido: ni limpieza ni state, para
    # que el siguiente run parta de lo que sigue publicado.
    _, _, errores_r2 = r2.subir_a_r2(list(publicacion._FICHEROS_ESCRITOS))
    if errores_r2:
        raise SystemExit(f"[r2!] {errores_r2} ficheros sin subir: run abortado")

    # ─── Turso (HTTP v2) ───
    turso._turso_ensure_schema()
    turso._turso_setup_medios(medios_completos)
    turso._turso_setup_runs(runs_data, t_now_iso)

    # ─── Limpiar huérfanos en R2 ───
    # Después de Turso: si se alarga, que no se quede sin hacer lo demás.
    # Una vez al día, scan completo: el diff no recoge lo que sustituye
    # un run a menos de 1 h del anterior. Solo se marca el día si termina.
    hoy_madrid = t_now.strftime('%Y-%m-%d')
    ultimo_barrido = payload_prev.get('ultimo_barrido_r2', '')
    barrido_hoy = ultimo_barrido != hoy_madrid and r2._r2_client() is not None
    completo = r2.limpiar_r2_huerfanos(inventario, inventario_prev,
                                    forzar_scan=barrido_hoy)
    if barrido_hoy and completo:
        ultimo_barrido = hoy_madrid

    # ─── State ───
    historico.guardar_state(
        t_now.isoformat(timespec='seconds'),
        ultimo_exito_nuevo,
        ultimo_barrido,
    )

    generar_html(t_now.strftime('%d/%m/%Y %H:%M'), len(finales_pre))
    if sin_resultado:
        print(f"\n── ⚠ Medios sin titulares ({len(sin_resultado)}) ──")
        for n in sin_resultado:
            print(f"  · {n}")

    if medios_sin_fecha:
        print(f"\n── ℹ Medios scrapeados sin ninguna fecha real ({len(medios_sin_fecha)}) ──")
        for n in medios_sin_fecha[:15]:
            print(f"  · {n}")

    print("\n✅ Listo")


if __name__ == "__main__":
    main()
