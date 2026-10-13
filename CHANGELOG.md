# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).
Sin tags formales todavía; los bloques van por fecha y agrupados por tema.

## 2026-10-13 — Scraping por el relay y migración de Turso sin lecturas

### Añadido
- Fuente `('scrape', url, 'relay')`: scraping de la home pedido a través del relay.
  El Siglo de Europa, Milenio y Sky News daban 403 desde GH; Google News sigue detrás.

### Corregido
- Con la cuota de lecturas agotada, `PRAGMA table_info` fallaba, la migración no
  añadía `intentos` y fallaban todos los upserts de `medios` y `runs`. Ahora, si
  la lectura falla, se lanzan los `ALTER` a ciegas y se ignora «duplicate column».

## 2026-10-13 — Relay de Deno en el repo

### Añadido
- `workers/deno-relay/`: el relay pasa al repo. Su allowlist (`permitidos.json`) la
  genera `scripts/sync_relay.py` desde las fuentes con `'relay'` de `medios.py`;
  `sync-relay.yml` la regenera y commitea tras cada merge que toque el catálogo.

### Cambiado
- AP (sitemap), e-Notícies y Ferrol 360 (RSS) pasan por el relay: daban 403 desde
  GH, también en scraping, que se quita de su lista.
- Capital Madrid y Granada Digital dan 403 también por el relay: solo Google News.
- La URL destino se codifica al pasarla al relay.

## 2026-10-13 — Fuentes por medio, sitemaps de Google News e intentos en Turso

### Añadido
- `medios.py`: cada medio lleva `'fuentes'`, lista ordenada de tuplas
  (`rss`, `sitemap`, `wp`, `scrape`, `gn`, con opción `'relay'`). Sustituye a
  `KNOWN_FEEDS`, `LISTING_URLS`, `GN_FALLBACK_DOMAINS`, `GN_QUERY_OVERRIDES`,
  `RELAY_DOMAINS` y `WP_API_DOMAINS`. Sin fallback implícito.
- Fuente `sitemap`: sitemaps de Google News (`news:title` + `news:publication_date`).
  Fecha exacta y URL real: Reuters, AP, WSJ, Expresso, Mirror, El Periódico, Sport…
- ~34 medios que iban por scraping o Google News pasan a RSS (Cadena SER, CBS, NBC,
  Telegraph, Irish Times, G1, Diari de Girona, Regió7…).
- Columna `intentos` en `medios` y `runs` de Turso: `RSS:HTTP 403 > Google News:ok`.
  Muestra feeds caídos aunque el medio acabe entrando por otra fuente.
- `MIN_ITEMS_FUENTE` (5): una fuente con menos titulares no se da por buena y se
  prueba la siguiente; si ninguna llega, se usa la que más trajo.
- `salud_fuentes.py` + workflow `test_feeds.yml` (renombrado «Salud de fuentes»):
  prueba las fuentes del catálogo desde la IP de GitHub.
- Scraping: fecha desde JSON-LD de la página, tiempo relativo en es/pt/ca/gl/it/en
  («há 2 dias», «2 hours ago», «2 ore fa»…) y día de la URL (`/20261013/`) para
  acotar la fecha estimada.

### Cambiado
- Dirigentes Digital → The Officer (`theofficer.es`); Jornal i → SOL (`sol.iol.pt`):
  los dominios viejos redirigen enteros.
- Quitado Nius (`niusdiario.es` redirige a telecinco.es/noticias).

### Corregido
- El Espectador metía comentarios de lectores (`/comments/feed/`) como titulares.
- Prensa Libre leía `/web-stories/feed/` en vez del feed de noticias.
- Fechas RFC 822 con día y mes en otro idioma (`terça, 13 out. 2026 …`): SOL
  pasaba 0/50 titulares con fecha.

## 2026-10-13 — Portada con cupo por medio + ediciones

### Añadido
- `recolector.py`: `EDICIONES` (gal, cat, eus, nac, int) → `portada-<slug>-<hash>.json`
  por edición, listadas en `manifest.portadas`. `manifest.portada` no cambia.
- `plantilla.html`: ediciones por `?ed=` o dominio (`HOST_EDICION`, vacío de momento):
  fijan el idioma por defecto y las portadas adicionales que se cargan con la general.
  Casillas «Portadas adicionales» en Configuración › Feed (`voceiro-portadas-v1`).
- Barrido completo de R2 una vez al día (`ultimo_barrido_r2` en `state.json`).

### Cambiado
- `generar_portada`: reparto con cupo por medio en vez de «las 2000 más recientes»,
  ventana de 24 h (`PORTADA_HORAS`, `PORTADA_MAX`). Antes cubría ~1 h y ~250 medios;
  ahora entran todos los que publicaron en la ventana, máx. ~7 noticias por medio.
- La portada ordena con la misma fecha con la que filtra: las fechas futuras ya no
  ocupan los primeros puestos.

### Corregido
- `limpiar_r2_huerfanos`: el diff se saltaba los ficheros de menos de 1 h y no volvía
  a verlos; con runs cada 10–20 min quedaban huérfanos en R2. El scan completo ya no
  trata como huérfana cualquier `portada-*` distinta de la general.

## 2026-10-12 — Refactor del parser + switch CF ↔ Deno

### Añadido
- `public/parser.js`: el parser servido desde GitHub Pages, mismo origen que el HTML.
- `scripts/sync-parser.mjs`: sincroniza `shared/parser.js` con sus 4 destinos.
- `scripts/test-parser.mjs`: verifica que las 4 copias están sincronizadas.
- `.github/workflows/sync-parser.yml`: auto-commit al cambiar `shared/parser.js`.
- Switch automático de backend CF ↔ Deno en `plantilla.html`:
  - Probe de `manifest.json` al arrancar (timeout 5 s desde CF).
  - Retry mid-sesión con timeout 10 s cuando el backend activo es CF.
  - Re-probe al volver a la pestaña tras >5 min oculta.
  - Persistencia en `localStorage` bajo `voceiro-backend-v1`.

### Cambiado
- `plantilla.html`: importa `./parser.js` (relativo) en vez de la URL de CF.
- `recolector.py::generar_html()`: copia `shared/parser.js` a `public/parser.js` en cada regeneración.
- `.github/workflows/deploy-worker.yml`: simplificado. El sync vive ahora en su propio workflow.

### Eliminado
- `scripts/build-parser-source.mjs`: reemplazado por `scripts/sync-parser.mjs`.

## 2026-10-05 a 2026-10-12 — Migración a Deno Deploy como plan B

### Añadido
- `worker-deno/` — copia de `voceiro-buscar` en Deno Deploy.
- `worker-deno-datos/` — copia de `voceiro-datos` en Deno Deploy (con SigV4 para R2).

### Contexto
Los operadores españoles bloquean los rangos de IP de Cloudflare durante los partidos.
Duplicar los workers en Deno Deploy permite que el frontend siga funcionando cuando CF está caído.