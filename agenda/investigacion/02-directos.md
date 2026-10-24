# LOTE 2 (ACOTADO) — Investigación de directos periodísticos (solo documentación, SIN implementación)

Fecha: 2026-10-24 · Estado: COMPLETO (1 descarga/fuente + 1 seguimiento en elDiario.es; sin cambios en servidor, sin git, sin dependencias)

Alcance: máx. 3 medios (elDiario.es, RTVE, +1 de AS/20minutos/ElMundo). Una descarga por fuente, ≤1 seguimiento de enlace. No se adivinan endpoints, no se sortean bloqueos.

Leyenda: [DESC]=descubierto en fuente pública · [CHECK]=comprobado por mí en esta sesión · [ANT]=antecedente de informe previo.

## 1. elDiario.es
- URL directo [ANT]: https://www.eldiario.es/politica/ultima-hora-actualidad-politica-directo_6_13611766.html
- [CHECK 2026-10-24] HTML ~465 KB, 4 bloques ld+json; mención `liveBlogUpdate` presente. Enlace permanente de entrada con IDs (cobertura `13611766`, mensaje `1126118`).
- [CHECK, DESC en el propio HTML] Endpoint público embebido: `https://www.eldiario.es/webapi/live/13611766/messages/newest?messageId=1126118` (patrón webapi/live/{cobertura}/messages/newest).
- [CHECK, único seguimiento] Respuesta HTTP satisfactoria, JSON: `{"html":"\n\n    ","nextPage":"…newest?messageId=1126118","newData":false}`. Confirma paginación incremental por `messageId` y entregas como HTML parcial (no JSON-LD); sin entradas nuevas en el momento de la prueba. No es feed completo garantizado.
- Otros endpoints vistos en HTML: usersapi.eldiario.es (login) y /api/edibrainhub/callback (publicidad); no relevantes.

## 2. RTVE
- URL directo [ANT]: https://www.rtve.es/noticias/20261022/ultima-hora-politica-espana-directo-gobierno-hoy-cronica/17277466.shtml
- [CHECK 2026-10-24] HTML ~375 KB, 4 ld+json; `LiveBlogPosting` ×2 menciones, `liveBlogUpdate` ×1 (insuficiente para afirmar lista completa).
- IDs observados [CHECK]: cobertura `17277466` (data-id); activos relacionados `17263538`, `17272712`, `17273693`, `17274803` (data-assetid `..._es_noticias`), imagen `17279538`; cat-uids `TENOTICI-TEPESPAN`.
- [CHECK] Sin enlaces de paginación ni URLs api/.json visibles en el HTML estático; la carga incremental parece resolverse por JS (no comprobado).

## 3. Tercer medio: 20minutos.es (elegido por acceso directo; AS/ElMundo no probados)
- URL directo [CHECK 2026-10-24, localizada por buscador]: https://www.20minutos.es/internacional/protestas-disturbios-francia-directo-cargas-policiales-varias-ciudades-mas-un-centenar-detenidos-todo-pais_7052983_6.html
- [CHECK] HTML ~294 KB, 4 ld+json; `LiveBlogPosting` con `liveBlogUpdate`; entradas con `datePublished` propias y zona horaria (+0200), p. ej. 17:24→18:39 del 24-10-2026.
- IDs [CHECK]: artículo `7052983` (data-article-id, sufijo `_6` en URL), `data-story-id="prod-20minutos-7052983"`, `data-hidden-batch` (sugiere lotes ocultos cargados por JS; mecanismo no comprobado).
- [CHECK] Sin enlaces/API de paginación públicos descubiertos en el HTML (solo IDs publicitarios addoor). JSON-LD con entradas ≠ inventario completo garantizado.

## Límites de cobertura/ediciones
- Muestra de un instante y un directo por medio; las diez entradas [ANT] o las ~20 fechas vistas no prueban cobertura íntegra. Ediciones: elDiario.es regionaliza (ruta /madrid/somos/ vista en enlaces); RTVE marca categorías TENOTICI/TEPESPAN; 20minutos tiene ediciones locales no contrastadas. RTVE no expone paginación en HTML estático; 20minutos sugiere lotes vía JS. JSON-LD nunca se tomará como feed completo.

## Qué requeriría actualizar el servidor (futuro, sin implementar ahora)
Un recolector de directos por cobertura (no por artículo): registro con URL, ID externo (13611766, 17277466, 7052983) y estado. Cadencia configurable según estado (abierto/latente/cerrado), sin prometer tiempo real. Caché compartida entre usuarios y consultas, conservando última respuesta buena, su antigüedad y errores. Donde exista (elDiario.es), usar el endpoint incremental descubierto con su cursor; donde no (RTVE, 20minutos), re-descargar página y comparar entradas por ID/hora. Desconexión del recolector de titulares: pasada, frecuencia y caché independientes.
