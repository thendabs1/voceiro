# Revisión del extractor — 24 de octubre de 2026

## Alcance y evidencia

Catálogo al empezar: **342 medios y 742 fuentes configuradas**. La cifra de
354 de las notas de diseño corresponde a otro momento del catálogo.

Se revisan los 342 resultados de estas tres pasadas ya ejecutadas, sin
lanzar otro barrido del catálogo:

- [13:10 UTC](https://github.com/thendabs1/voceiro/actions/runs/40097009211).
- [13:50 UTC](https://github.com/thendabs1/voceiro/actions/runs/40099882498).
- [14:05 UTC, con #120–#123](https://github.com/thendabs1/voceiro/actions/runs/40100932038).

Las 1.026 filas dan titulares. Eso verifica extracción, no frescura ni
cobertura editorial. En la última pasada:

| Fuente elegida | Medios |
| --- | ---: |
| RSS | 274 |
| Sitemap | 27 |
| Scraping | 15 |
| WordPress | 2 |
| Google News | 24 |

Hay 19 cadenas con alternativas, 11 medios sin ninguna hora, cuatro con
horas parciales y tres con menos de cinco titulares (Galicia Digital,
Xinhua y El Faro). Se observan intentos de scraping en **31 dominios** a
lo largo de las tres pasadas. Otros 292 tienen scraping configurado, pero
la fuente anterior dio suficientes titulares: esas alternativas siguen
**sin comprobar**. Los 19 rescates incluyen fallos de RSS; no todos son
fallos del scraper.

Para investigar esas señales se descargan 24 portadas concretas, los feeds
que anuncian algunas de ellas y dos destinos alternativos enlazados por las
propias webs. Los HTML se comparan en local, sin volver a pedir cada página
para cada versión del extractor. La IP local puede recibir otra respuesta
que Actions; los logs anteriores son la referencia del comportamiento real.

## Cambios comprobados

- **Encabezados envueltos en enlaces.** Se acepta `<a><h2>…</h2></a>` además
  de `<h2><a>…</a></h2>`. Se toma el texto del encabezado, sin añadir un
  resumen que comparta el enlace. En las copias inspeccionadas, SINC pasa
  de 0 a 60 titulares y El Heraldo de 2 a 53. No aparecen horas en esas
  portadas: ambos mantienen Google News primero, como la fuente efectiva
  de los logs, con el scraper reparado como alternativa.
- **Días sin hora.** Se conserva el día de `6 de octubre de 2026`,
  `24 octubre, 2026` y `2026-10-23 +0200`, sin que el parser ni feedparser
  completen una hora. La portada de 2Playbook recupera cuatro días conocidos.
  El último formato aparece en el RSS de Galicia Digital.
- **2Playbook.** Se antepone el RSS enlazado en la portada: 15 titulares,
  15 con hora, con publicaciones del 23 y 24 de octubre. La portada y
  Google News siguen como alternativas. El feed devuelve menos titulares
  por petición que la portada (59 en la copia inspeccionada); la cobertura
  acumulada deberá observarse en las siguientes pasadas.
- **IT User.** `https://ituser.es/` responde que el dominio no está
  registrado. Con `www` salen 60 titulares, sin hora. Se repara esa URL
  como alternativa y se mantiene Google News primero para conservar sus
  fechas.
- **RTVE.** Se usa `/noticias/` (60 titulares) en lugar de la portada que
  mezcla noticias y programas. El listado no da horas; las URLs acotan el
  día de muchas piezas.
- **El Faro.** La raíz solo redirige con JavaScript a `beta.elfaro.net`.
  Se configura el destino enlazado: 17 titulares, ocho con hora en la copia
  inspeccionada, frente a los dos de Google News en los logs. El dominio
  del catálogo sigue siendo `elfaro.net` y se conserva Google News detrás.

El cambio de encabezados también aumenta Estadão de 46 a 60 titulares en
la misma copia. No añade fechas donde la página no las da en el formato
que reconoce el extractor.

## Inventario de los 31 dominios con scraping observado

Las cantidades son de la pasada de las 14:05, antes de estos cambios.
«Sin hora» describe el listado: no prueba que el artículo individual
carezca de fecha. No se propone descargar todos los artículos en cada run.

| Dominio | Evidencia y situación |
| --- | --- |
| `2playbook.com` | 59 sin hora. RSS vigente con hora incorporado; día localizado corregido. |
| `agenciasinc.es` | Scraping vacío, GN 25. Encabezados reparados; GN primero para conservar fechas. Su RSS de Noticias devuelve 503 en la comprobación local. |
| `elheraldo.hn` | Scraping 2, GN 54. Encabezados reparados; GN primero para conservar fechas. |
| `ituser.es` | Scraping vacío, GN 10. Corregida la URL con www como alternativa. |
| `elfaro.net` | Scraping vacío, GN 2. Corregido el destino de la redirección por JavaScript. |
| `rtve.es` | 60 sin hora. Corregida la sección; estimación acotada por día de la URL. |
| `publico.es` | 30/31 con hora: la corrección de #123 funciona. El restante es el enlace permanente «La comunidad de Público», no una noticia nueva. Vigilar ruido de enlaces permanentes. |
| `alternativaseconomicas.coop` | 36 sin hora. La única fecha `<time>` de la portada es la del número mensual, no la de cada artículo. Mantener estimadas; no heredar esa fecha. |
| `revistamongolia.com` | 10 sin hora. El RSS anunciado solo trae dos entradas de 2014 y 2021; descartado como sustituto. |
| `elviejotopo.com` | RSS vacío; scraper 18 sin hora. Las tarjetas dan el día en texto de la firma, no en `<time>`. Pendiente extraer ese día con una regla delimitada por tarjeta. |
| `mientrastanto.org` | 18 sin hora. RSS anunciado vacío. Mantener estimadas; no declarar caída por una periodicidad larga. |
| `ferrolxa.com` | 52 sin hora. Las tarjetas inspeccionadas no incluyen fecha. Mantener estimadas; investigar otra fuente oficial si se quiere hora. |
| `estadao.com.br` | 46 sin hora. Hay fechas en el estado JavaScript de Arc/Fusion, fuera del extractor actual. Su RSS anunciado contiene piezas de 2015: descartado. Pendiente valorar una regla para ese estado con URL y fecha propias. |
| `praza.gal` | 30/50 con hora. Las tarjetas con `<time>` funcionan; hay bloques de temas/recomendaciones sin fecha. Pendiente separar esos bloques del flujo reciente. |
| `corriere.it` | 27/60 con hora mediante JSON-LD. Hay vídeos, directos y otras piezas sin una fecha enlazada en esos bloques. Cobertura parcial conocida. |
| `cuartopoder.es` | 28/39 con hora, pero las fechas y URLs son de marzo de 2021, con referencias al cierre. Una extracción OK no indica actividad. Pendiente decidir su permanencia como medio actual. |
| `crtvg.gal` | 10 sin hora, procedentes de transparencia y organización corporativa. La página enlaza G24 como noticias. Pendiente decidir el cambio de dominio/identidad; no tratarlo como éxito editorial. |
| `eitb.eus` | 8 sin hora, con contenido del grupo, programación y navegación. Enlaza `orain.eus` como noticias. Pendiente decidir el cambio de dominio/identidad. |
| `galiciadigital.com` | Scraping 1 y GN 1; conserva scraping al empatar. Portada con enlaces `noticia.N.php`, fuera del patrón de slugs. RSS con días sin hora y una fecha de 2205: no se activa. Pendiente regla de enlaces y validación de frescura. |
| `mercadofinanciero.com` | Scraping vacío; GN 71. Noticias en párrafos y URLs `.html`, muchas copias enlazadas a Europa Press. Pendiente regla acotada a las noticias de su propio dominio. |
| `radiovoz.com` | Scraping vacío; GN 9. Portada de programas/emisoras, sin tarjetas que reconozca el extractor. Respaldo GN operativo. |
| `globaltimes.cn` | Scraping vacío; GN 80. Enlaces numéricos `/page/202610/1372873.shtml`, sin encabezados. Patrón de noticia no soportado; respaldo GN operativo. |
| `xinhuanet.com` | Scraping vacío; GN 1. Portada en chino, enlaces cortos/numéricos; los filtros actuales de longitud y slug no cubren ese formato. Cobertura insuficiente pendiente. |
| `thetimes.com` | Scraping vacío; GN 80. En local devuelve «Verifying Device» con HTTP 200: bloqueo, no fallo de selector. Respaldo GN operativo. |
| `rac1.cat` | Timeout del scraper en las tres pasadas, unos 25 s; GN 80. Pendiente comprobar otro acceso oficial. |
| `milenio.com` | Scraping HTTP 403; GN 80. Bloqueo registrado; sin cambio de selector. |
| `news.sky.com` | Scraping HTTP 403; GN 80. Bloqueo registrado; sin cambio de selector. |
| `lastampa.it` | RSS y scraping HTTP 403 en la última pasada; GN 80. Antes funcionaba RSS: vigilar si persiste. |
| `repubblica.it` | RSS y scraping HTTP 403 en la última pasada; GN 80. Antes funcionaba RSS: vigilar si persiste. |
| `acn.cat` | Scraping 1; GN 80. Cobertura escasa del HTML; respaldo GN operativo. |
| `servimedia.es` | Scraping 4; GN 80. Cobertura escasa del HTML; respaldo GN operativo. |

Fuera del scraping, el RSS de `washingtonpost.com` devuelve HTTP 502 en las
tres pasadas y Google News rescata 80 titulares. No se cambia su selector.
Los otros medios se han contrastado en los logs, pero sus RSS/sitemaps no
se han auditado artículo por artículo ni se ha confirmado su periodicidad.

## Control de actividad pendiente de diseño

Se aprovechan `runs.intentos` y los logs del recolector. No se añade un
workflow diario o semanal que repita todas las peticiones. La herramienta
manual `salud_fuentes.py` sigue disponible para comprobaciones puntuales.

Para detectar fuentes estancadas hay que distinguir:

1. Disponibilidad y extracción: HTTP, errores, cantidad y fuente elegida.
2. Frescura: fecha del último titular fiable, fecha futura anómala y
   aparición de URLs/titulares nuevos. El `ultimo_exito_por_medio` actual
   solo confirma que hubo resultados, no una publicación nueva.
3. Periodicidad: un medio semanal o mensual no puede compartir el umbral
   fijo de 48 h que usa hoy el diagnóstico manual. Acordar tolerancias o
   mostrarlas como señales, sin retirar automáticamente una fuente.

La serie diaria de titulares nuevos/publicados y la de intentos permiten
vigilar las correcciones sin interpretar «0 titulares de ese día» como una
caída: puede tratarse de un medio que no publicó ese día.

## Estadísticas: alcance acordado para después

- **Técnicas:** pasadas, volumen, estabilidad, fuentes, rescates, tiempos,
  calidad de fechas y límites de cobertura. Ya existen los agregados y
  JSON de `estadisticas.py`; falta decidir la presentación y completar el
  control de actividad anterior.
- **Términos:** recuentos diarios precomputados desde R2, evolución frente
  a una base de varias semanas, cobertura por medios/grupos y enlace al
  buscador. Probar antes el tratamiento de idiomas, palabras vacías,
  duplicados y expresiones de varias palabras: «Valle de Arán» necesita
  tres tokens, no solo pares.

No se ha encontrado un agregador de términos, stopwords, tendencias o
`terminos_dia` en el código actual ni en los nombres de archivos del
histórico consultado. Los módulos `shared/busqueda/texto.js` y `temas.js`
contienen tokenización y coincidencia para la búsqueda, sin recuentos ni
base histórica de frecuencias. No se construye esa segunda clase aquí.

## Verificación de esta revisión

- Comparación de 24 HTML guardados con el extractor de `9df4142` y el
  modificado, sin red durante la comparación.
- Comprobación de los feeds anunciados: 2Playbook vigente; Mongolia y
  Estadão antiguos; Mientras Tanto y El Viejo Topo vacíos; Galicia Digital
  con días sin hora y una fecha futura anómala; SINC no disponible.
- Pruebas de regresión para encabezados envueltos (sin tomar resumen ni
  fecha de otra tarjeta) y días sin hora en feeds y HTML.
- Suite completa en CI al abrir el PR. El catálogo modificado queda
  pendiente de observar en una pasada real tras la fusión.
