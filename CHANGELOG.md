# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).
Sin tags formales todavía; los bloques van por fecha y agrupados por tema.

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