# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).
Sin tags formales todavía; los bloques van por fecha y agrupados por tema.

## 2026-10-24 — Asistente para crear modos

### Añadido
- Guía opcional para elegir fuentes, grupos y medios, ajustar inclusiones y
  silencios, añadir temas y probar una selección antes de guardarla.
- Selecciones que buscan temas solo en las fuentes elegidas o en todas,
  con la misma regla en prueba, feed y vista Temas. Los modos anteriores
  mantienen su comportamiento y el editor explica ambas opciones.
- Explicación de portadas, dominios ajenos al catálogo y límites de la
  muestra, en los cinco idiomas. Telegram, ubicación, tiempo y avisos
  quedan previstos como ampliaciones posteriores.

## 2026-10-24 — Panel de estadísticas: menos y mejor

### Cambiado
- Un solo selector de ámbito: todos, cada modo o un grupo o familia. Sin
  elegirlo, sigue al modo activo (antes había que pasar por «Mis medios» y
  elegir el modo aparte).
- La ficha del medio da su histórico: cifras del día (media de 30 días, % con
  hora, primer y último titular, cuánto tarda en llegar), 30 días, reparto por
  horas, secciones y tabla día a día de nuevo a antiguo.
- Resumen añade el reparto por horas; los grupos y la lista de medios van de
  más a menos titulares, y la lista lleva una miniatura de 30 días.
- Todos los textos del panel, traducidos a los cinco idiomas.

### Quitado
- Los desplegables de seguimiento (siempre vacío: no hay datos de pasadas),
  precisión de fechas, valores en tabla y método; queda una nota al pie.
- Las cifras sin dato o a cero que no informan, como «Solo día: 0».

## 2026-10-24 — Panel de estadísticas: el panel como vista

### Cambiado
- Resumen muestra cifras, evolución y después los grupos, plegados por
  familia: Regional e Internacional se despliegan en sus subgrupos.
- Abierto, el panel sustituye al feed y sus chips; escribir otra búsqueda
  vuelve al feed. Se quita «Ampliar», que ya no aporta.
- Se abre con el último día calculado en vez de hoy, casi siempre sin datos.

## 2026-10-24 — Panel de estadísticas: clics sin saltos

### Corregido
- Repintar el panel ya no cierra los desplegables abiertos ni sustituye el
  contenido por «sin datos» mientras llega otro día.
- Buscar un medio no recrea el campo: el teclado del móvil no se cierra.
- Cambiar de vista o de día desde abajo devuelve el panel bajo la cabecera.
- Las barras de la evolución abren su día y marcan el consultado.

## 2026-10-24 — Panel de estadísticas: Resumen y Medios

### Añadido
- Panel sobre el feed con totales diarios, desglose por grupo y evolución
  de hasta 30 días, directorio y ficha de medio; lee los JSON públicos existentes.
- Acceso desde cabecera, ⋯ y `estadisticas:` / `stats:`. Mis medios respeta
  grupos y excepciones del modo, sin ampliar la muestra por sus palabras.
- Fechas sin datos, muestras parciales, actualización con reintento y regreso
  al feed con foco y posición. Las cifras cuentan titulares del archivo,
  sin presentarlos como artículos únicos por publicación.

## 2026-10-24 — Revisión de fuentes y extracción

### Corregido
- El scraper acepta encabezados envueltos en enlaces sin añadir el resumen
  al titular ni tomar la fecha de otra tarjeta.
- Las fechas localizadas sin hora y los días seguidos de una zona horaria
  conservan solo el día, sin una medianoche inventada.
- RSS de 2Playbook y portadas de IT User, RTVE y El Faro. SINC, El Heraldo
  e IT User mantienen Google News primero para conservar sus horas.

### Documentado
- Inventario de fallos, alternativas y límites de fechas desde tres pasadas
  de los 342 medios en `cosecha/REVISION-EXTRACTOR.md`.

## 2026-10-24 — Fechas sin hora

### Cambiado
- Cuando la fuente da solo el día (feed, sitemap o `<time>` del scraper),
  se guarda como `p: "AAAA-MM-DD"`: el día es fiable aunque no haya hora.
  Front, relectura del histórico y estadísticas (clase `solo_dia`) no lo
  toman por un instante.
- La estimada vale para cualquier fuente sin hora, no solo el scraping: se
  reparte por la ventana desde la pasada anterior del medio, recortada al
  día conocido (de la fuente o de la URL). Las cuentas van en UTC.

### Corregido
- El scraper lee la hora de los atributos `data-*` del propio `<time>`
  aunque su texto diga solo el día: publico.es (`/ultimas-noticias`) tenía
  la hora exacta en `data-timestamp` y salía a las 00:00.
- La hora de otra capa (prensa, archivo) mejora un `p` de solo el día.

## 2026-10-24 — Ventana entre pasadas

### Añadido
- Estadísticas: `ventana_min` por medio y día (p50, p90 y máximo de los
  minutos entre dos pasadas buenas seguidas), lo que abarca una estimada.
  Serie `ventana_p50` en `estadisticas.json`.

## 2026-10-24 — Fechas de publicación fiables

### Corregido
- La fecha de publicación ya no la pisa la de la pasada siguiente: se queda
  la primera válida. Las que llegaban después eran de actualización
  (`updated`, `dc:date`) y movían titulares de hora o de día: unas 5.000
  «adelantadas» por semana.
- Zonas con dos puntos en RFC 822 (`Sat, 24 Oct 2026 16:04:42 +09:00`) se
  leían como UTC: The Korea Herald salía con 9 h de adelanto.
- Una fecha con solo el día (`2026-10-23`, `23/10/2026`) ya no se guarda
  como un instante a las 00:00 o 02:00 inventado; ni feedparser la completa.
- En el XML de respaldo, la fecha de publicación gana a la de actualización
  aunque esta vaya antes.
- El horizonte de 6 h para fechas futuras se cuenta desde la primera
  recogida, no desde ahora: una cita de agenda no salta a su día cuando se
  acerca, y tampoco ordena como si fuera de ese día.
- Las alternativas guardan su titular (`t` en `a`) cuando no es idéntico al
  del representante: al releerlas casan con su feed y no pierden la
  recogida ni se duplican.

## 2026-10-24 — Fechas que no se estropean al guardarse

### Corregido
- La estimada (`e`) de otro día se guardaba como `HH:MM` y, al releer el
  fichero, pasaba al día del fichero. Ahora va completa, como `p` y `c`.
- Las horas que se repiten al volver al horario de invierno (02:00–02:59 del
  último domingo de octubre) van en ISO completo: en `HH:MM` se releían
  siempre como la primera.
- Un día de la gracia que se queda sin noticias (cambiaron de día) ya no
  vuelve del inventario anterior con su fichero viejo.
- Estadísticas: retraso y adelanto se restan por instantes (antes, con el
  cambio de horario, salía −40 min donde pasan +20) y una hora del mismo día
  en ISO cuenta como «con hora».

## 2026-10-24 — Estadísticas técnicas

### Añadido
- `estadisticas.py` y el workflow diario `estadisticas.yml`: recalculan los
  4 últimos días (el recolector reescribe hasta 3 atrás; a partir del cuarto
  el día queda `cerrado`) desde `runs` y el fichero `all` de cada día en R2.
- Por medio y día, de las pasadas: pasadas y buenas, fuentes, titulares por
  pasada, % con fecha, tiempos (media, p50, p95, máx.), resultado de cada
  fuente según `intentos`, cadenas más frecuentes, rescates (falla la
  primera fuente y salva otra), errores, racha de fallos y estado final.
- Por medio y día, de los titulares: clase de fecha (con hora, `00:00`,
  otro día pasado o futuro, estimada, sin fecha) también por fuente, curva
  por horas, retraso de captura (p50, p90), fechas adelantadas y su
  adelanto, compartidos con otros medios, fuentes, longitud, secciones y
  primer y último titular.
- Del día: pasadas del recolector, intervalo y huecos de más de 20 min,
  totales y desglose por grupo.
- Tablas `medio_dia` y `dia_stats` en Turso (histórico sin poda; las filas
  que no cambian no cuestan escrituras) y, en R2, `estadisticas.json`,
  `estadisticas-dia-AAAA-MM-DD.json` y `estadisticas-medio-<dominio>.json`.

## 2026-10-24 — Turso nuevo: solo diagnóstico de la cosecha

### Cambiado
- Turso pasa a una base nueva (`voceiro`, org `tuksyy`, Irlanda) con solo
  `medios` y `runs`, pensada para las estadísticas. La cuota del plan es de
  10 M filas escritas al mes y cada índice cuenta como otra fila.
- `runs` tiene `(ts, dominio)` como clave: la poda de 30 días va por rango
  de la clave, sin `idx_runs_ts`. Cada pasada cuesta unas 2 escrituras por
  medio (alta y poda): unos 3 M al mes.
- `medios` es solo el catálogo (nombre, grupo, tipo, ámbito, idioma,
  etiquetas). El upsert no reescribe las filas que no cambian, así que una
  pasada normal no gasta escrituras. El estado de la última pasada está en
  `runs`.

### Quitado
- Las noticias ya no se guardan en Turso (`insertar_en_turso`,
  `TURSO_DOMINIOS_EXTRA`): nada las lee desde que la búsqueda no usa Turso.
- Columnas `*_norm` de `medios` y sus índices, que eran para la búsqueda, y
  las migraciones de columnas de la base antigua.
- `migrar.yml`, `migrar_historico.py` (ya retirado) y `migration_state.json`.

## 2026-10-24 — Búsqueda sin Turso

### Quitado
- El archivo (Turso) deja de usarse en las búsquedas: ni el front ni los
  workers lo consultan. Sale el adaptador `turso.js`, `TURSO_PAUSADO`,
  `ARCHIVO_ACTIVO`, «Buscar más en el archivo» y `buildFtsQuery`/`paraArchivo`.
  Lo reciente se busca sobre R2 en el navegador y el resto, en Google News.
  Turso sigue recibiendo la cosecha (recolector, medios y runs).

### Cambiado
- `/buscar` sin `fuentes` no consulta nada (antes, Turso por defecto).
  `fuentes=turso`, de clientes antiguos, devuelve una respuesta vacía.
- `limit` y `offset` ya no cambian la respuesta: Google News da una sola
  página. `next_offset` sigue en la respuesta, siempre `null`.
- La caché usa la consulta interpretada: URLs equivalentes (`q`/`raw`,
  espacios, fuentes repetidas, parámetros ajenos) comparten respuesta.

## 2026-10-24 — Caché de búsqueda en Deno

### Cambiado
- `/buscar` en Deno manda `s-maxage=300`, como CF: la caché de Deno Deploy
  guarda las respuestas 5 min en vez de 1 (cuando CF cae, todo pasa por
  Deno). Se ve en `Cache-Status: deno; hit`.

## 2026-10-24 — Workers en voceiro.eu

### Cambiado
- Los workers de CF responden en `buscar.voceiro.eu`, `datos.voceiro.eu` y
  `sync.voceiro.eu`, con el WAF de la zona delante (regla de límite por IP en
  el panel; ver workers/README.md). El front, la sincronización, el lector y
  la extensión pasan a esas URL. Las de `workers.dev` siguen abiertas hasta
  que no queden clientes viejos.

## 2026-10-24 — Workers: límites de peticiones

### Añadido
- Límite por IP en memoria (`workers/comun/limite.js`; IPv6 por su /64):
  30 consultas por minuto a las fuentes de `/buscar` (la caché no cuenta),
  30 al tiempo y avisos en Deno y 120 a la sincronización, antes de tocar D1.
- Los relays de Deno aceptan una clave (`RELAY_CLAVE`, cabecera
  `X-Voceiro-Relay`). La mandan los workers de búsqueda y el recolector;
  mientras el relay no la tenga puesta, sigue abierto.

### Cambiado
- El archivo (Turso) queda en pausa también en el servidor (`TURSO_PAUSADO`,
  en el código de CF y Deno); antes solo lo apagaba el front y la URL seguía
  sirviéndolo.
- `/buscar` no pagina el archivo más allá de `offset` 1000: OFFSET lee las
  filas que se salta y Turso cobra las leídas.
- El cupo de altas de la sincronización cuenta IPv6 por su /64.
- El front no cambia de backend por un 429.
- El relay del recolector corta a los 20 s las descargas colgadas.

## 2026-10-21 — Datos: caché de los ficheros por medio y artefacto de Pages

### Corregido
- La capa de un medio ya no se queda con la versión de los días vivos que
  bajó la primera vez: el lector pedía todo con `force-cache`, que usa la
  copia guardada aunque haya caducado, y los ficheros por medio se
  reescriben con el mismo nombre. Ahora se piden con la caché normal.

### Cambiado
- Los workers de datos dan 1 día de caché a los ficheros por medio de los
  días congelados (5 días o más atrás); los vivos siguen con 60 s.
- El artefacto de Pages ya no lleva `public/datos` (~50 MB por run): la
  web lee los datos de R2.

## 2026-10-21 — Turso: solo medios nacionales

### Cambiado
- El recolector envía a Turso solo las noticias de los medios de ámbito
  nacional y de los que se añadan a mano en `TURSO_DOMINIOS_EXTRA`. El
  resto se consulta en R2 (por medio) y en Google News. Lo ya guardado no
  se toca, y el estado de los medios y sus runs sigue entrando para todos.

## 2026-10-21 — Datos: manifest de tamaño fijo y archivo de un año

### Cambiado
- El manifest que lee la web lista solo los 30 días que puede mostrar y
  deja de crecer con el archivo: de ~730 KB (~170 KB comprimido) a
  ~130 KB (~25 KB). Por día lleva cuántas noticias hay y los ficheros de
  grupo; los de medio se deducen (`d-<dominio>-<fecha>.json`) y la
  estimación de descarga usa la media diaria de cada grupo y medio.
- La memoria del recolector pasa a `inventario.json` en R2: ficheros,
  hashes y tamaños de la ventana y una línea por día del archivo. La web
  no lo baja.
- R2 guarda 365 días. Pasados 30, de cada día quedan solo los ficheros por
  medio (el día entero solo en los de antes del troceado por medio, que
  no tienen otros). La limpieza conserva esos ficheros por fecha y borra
  los de más de un año.
- `migrar_historico.py` queda retirado (solo una nota): leía el formato
  anterior. Si hace falta cargar R2 en Turso, se desarrolla de nuevo.

## 2026-10-21 — Datos: menos descarga y vuelta a CF solo si responde

### Corregido
- La sonda que devuelve el lector a Cloudflare espera al cuerpo completo
  del manifest. Antes bastaban las cabeceras: con CF atascado a mitad de
  respuesta se volvía a él, las capas esperaban 10 s y la siguiente carga
  perdía otros 5 s antes de saltar a Deno.

### Cambiado
- Los workers de datos mandan `ETag` y contestan 304 si no hay cambios:
  F5 ya no baja el manifest entero cuando sigue igual.
- El worker de Deno comprime con gzip (el manifest pasa de ~730 KB a
  ~170 KB por la red).

## 2026-10-21 — Recolector: fecha de otra tarjeta y lecturas estrictas

### Corregido
- El scraping tampoco toma la fecha de otra tarjeta cuando el enlace
  envuelve el titular (`<a><h2>`), además de cuando va dentro (`<h2><a>`).
- Un día de la ventana que no se puede leer (local o recién bajado), un
  troceado que falla a medias o un manifest previo ilegible paran el run.
  Antes se seguía con el histórico incompleto: los días recientes se
  reescribían sin sus noticias y, sin manifest previo, la limpieza podía
  borrar el archivo.
- Los días se bajan a un temporal y se validan antes de quedarse con su
  nombre: uno a medias no se da por bueno en el siguiente intento.

## 2026-10-21 — Recolector: publicación segura en R2

### Corregido
- Si falla la descarga del manifest de R2 (cualquier error que no sea «no
  existe»), el run se para. Antes seguía como si fuera el primero: subía un
  manifest con solo los días recién recogidos y el barrido de huérfanos
  podía borrar el archivo entero.
- Un día de la ventana que no se puede bajar también para el run, en vez de
  reescribirse sin sus noticias. Si R2 dice que no existe, se sigue.
- El manifest se sube el último y solo si todos los datos subieron. Con
  algún fallo, el run se para antes de Turso, la limpieza y el `state`: el
  siguiente parte de lo que sigue publicado.
- Fuera el `[r2-debug]` que imprimía datos de la cuenta en cada conexión.

## 2026-10-21 — Recolector: fechas honestas

### Corregido
- Las noticias sin fecha de publicación ya no «rejuvenecen». Su hora era el
  `generado` del fichero del día, que avanza cada vez que el día cambia, y
  pasaban por «última hora» indefinidamente. Ahora cada noticia guarda su
  primera recogida (`c`) y la conserva entre runs.
- Los filtros de tiempo (desde:, 24 h, 48 h…) solo cuentan la publicación
  real. Lo estimado (≈) y lo recogido se siguen mostrando y ordenando, y
  sin filtro de tiempo se ve todo como antes.
- Las alternativas de un titular repetido guardan sus propias fechas: al
  releer el histórico ya no heredan la publicación ni la fuente de otro
  medio. Los ficheros de antes se siguen leyendo igual.
- La dedup editorial trabaja con copias: un `alt` de un fichero ya no se
  cuela en el de grupo o dominio.
- Si una noticia ya vista descubre una fecha fuera de la ventana, se retira
  también la copia vieja.
- Una URL con fecha de hace más de un año cuenta como antigua, en vez de
  estimarse como de hoy.
- El scraping no toma la fecha de otra tarjeta: deja de subir por el árbol
  cuando el contenedor tiene más de un titular con enlace o de un
  `<article>`. De paso, es más rápido en portadas grandes.
- Si la prensa o el archivo traen la publicación de una noticia que ya
  estaba sin ella, se adopta.

## 2026-10-21 — Prensa externa siempre encendida

### Cambiado
- La prensa está encendida por defecto y se apaga desde Ajustes → Avanzado;
  la preferencia se guarda en el dispositivo (quien la había apagado la
  mantiene apagada). Fuera el botón «prensa» de la barra y la activación
  automática con menos de cinco resultados.
- Junto al contador se indica «Buscando en prensa…» mientras llega y «La
  prensa no respondió» si falla, conservando lo demás; sin toast en cada
  búsqueda. Con la prensa en camino, la lista vacía no dice «Sin
  resultados». Un fallo no se reintenta solo con cada llegada del archivo:
  sí con otra búsqueda o al volver a encenderla.
- Lo que está en la caché de prensa se muestra sin esperar al tecleo.
- Lo que llega con el pase de lectura abierto (prensa, archivo) ya no lo
  cierra: se ve al cerrarlo.
- La pestaña automática «Modo»/«Todo» se decide con los primeros resultados
  y se mantiene durante la búsqueda: lo que llega después cambia las cifras,
  no la pestaña.

## 2026-10-21 — Prensa externa: un solo filtro para todo

### Cambiado
- Lo que trae la prensa entra en la lista como el archivo: una capa de la
  consulta que la pidió, filtrada, contada y ordenada con lo demás. Las
  pestañas «Modo»/«Todo», los chips de temas y el orden ya la incluyen al
  llegar; antes se sumaba aparte y los chips no la contaban.
- A lo de la prensa se le aplican también las exclusiones (`-palabra`) sobre el
  titular. Las palabras buscadas siguen sin exigirse: el proveedor las
  encuentra también en el cuerpo.
- «24 h» y «48 h» escriben `desde:24h` / `desde:48h`: una ventana móvil, la
  misma para la lista, el archivo y la prensa. Antes escribían `desde:1d`
  (desde ayer a las 00:00) y además recortaban solo la lista a 24 h, así que
  `desde:ayer` perdía parte de ayer y la prensa traía noticias de hace 40 h.
- El mismo titular en otro medio ya no se descarta como duplicado (las
  noticias de agencia); sí se une si es del mismo medio o si el medio no se
  pudo resolver.
- Cambiar idioma o país de la prensa es otra petición: ya no se acepta la
  respuesta de la edición anterior. Apagar la prensa cancela la petición en
  camino, y su llegada ya no vuelve a pedirla.

## 2026-10-21 — Prensa externa: solo Google News, con el medio de verdad

### Añadido
- Relay de búsquedas en el repo (`workers/deno-relay-buscar`, con su workflow):
  pide el RSS de búsqueda de Google News desde Deno Deploy y lo devuelve en el
  mismo formato que el proxy anterior, más el dominio del medio
  (`<source url>`), que antes se perdía. Solo sirve `news.google.com/rss`.

### Cambiado
- Los resultados de Google News llevan el dominio del medio, así que los
  filtros de medio, el bloqueo y el nombre del catálogo funcionan con ellos sin
  adivinar el medio por su nombre (que sigue de reserva).
- Reino Unido se envía como `GB` (antes `UK`, que Google no reconoce); la
  preferencia guardada se migra al cargar.

### Quitado
- FreeNews: los adaptadores de los dos workers, su casilla y su preferencia.
  Casi nunca aportaba noticias nuevas. Con un solo proveedor desaparece también
  la casilla «Google News»: el interruptor de prensa basta.

## 2026-10-14 — El lector, solo en pantalla

### Cambiado
- Mientras el lector está abierto, la página de debajo queda tapada
  (`visibility` y `opacity`, sin cambiar tamaños) además de inerte, y también lo
  que el medio añada después: avisos de cookies, de suscripción o del bloqueador
  que, con el z-index máximo, salían por encima del lector. Al cerrar, todo
  vuelve a estar como estaba, con el mismo scroll (`lector/src/25-pagina-de-debajo.js`).
- Si la página pone un filtro o un transform en `html` o `body` (desenfocarla es
  un recurso de algunos muros), no le afecta al lector mientras está abierto.
- Se respetan las piezas del lector y los elementos personalizados que aparecen
  mientras está abierto, que suelen ser de extensiones (diccionarios,
  traductores, lectura en voz alta).
## 2026-10-14 — Gráficos y tablas en el lector

### Añadido
- Los gráficos, tablas y mapas insertados (Datawrapper, Flourish, Infogram,
  Tableau Public, Genially, Google Sheets, Google Maps, uMap y ArcGIS) salen como
  tarjeta, igual que los tweets y los vídeos: qué es («Táboa · Datawrapper»), su
  título y un enlace a la versión interactiva. No se carga nada de esos
  servicios; al cerrar el lector, el gráfico sigue en la página. Antes
  desaparecían sin rastro.
- Las tablas de datos del artículo se pintan como tabla, con el tema y la letra
  del lector, scroll propio en pantallas estrechas y el pie de su figure como
  caption. Antes salía un párrafo por celda. Las tablas de maquetación (otra
  tabla dentro, celdas con texto largo o intertítulos) se recorren como hasta
  ahora.

### Cambiado
- Al buscar el envoltorio de un embebido no cuentan su script ni su noscript:
  la tarjeta ya no se queda dentro de un div que Readability puede tirar (el
  iframe de Datawrapper con su script en Praza).
- El modo mixto cuenta el texto de las tablas al comprobar si Readability tiene
  el JSON entero.

## 2026-10-14 — Tema «Personalizado»

### Añadido
- Quinto tema, «Personalizado», en Voceiro (Ajustes › Lectura) y en el lector
  (Apariencia). Se eligen cuatro colores (fondo, texto, enlaces y títulos) y el
  resto sale de ellos (`shared/tema/personalizado.js`), con el contraste de lo
  derivado garantizado: gris secundario a 4,5:1, bordes a 3:1 y texto sobre
  color a 4,5:1. Los colores de estado vienen del tema base, claro u oscuro según
  el fondo.
- Junto a cada color se ve su contraste con el fondo, con aviso si baja de 4,5:1.
  Lo elegido no se corrige solo.
- Los colores viajan con el perfil de lectura (`colores` en `CAMPOS_PERFIL`,
  normalizados con `limpiarColores`): Voceiro, el lector y los otros dispositivos
  usan los mismos.
- Al elegirlo la primera vez se parte de los colores del tema que había.
- `--titulos` en la paleta: el color de los títulos en los cinco temas.

## 2026-10-14 — Ajustes › Lector en Voceiro

### Añadido
- Página «Lector» en Ajustes de Voceiro. Con el lector instalado, su propio panel
  de ajustes (medios, catálogo, pendientes, diccionarios, «Abrir en…», atajos,
  general) se pinta dentro: Voceiro deja el hueco (`#aj-lector-panel`) y le avisa
  por el puente (`voceiro-ajustes-lector`), sin conocer su formato. Sin el
  lector, la página explica qué es y ofrece instalarlo (lo que estaba en
  Avanzado).
- `openSettings(pestaña, { dentro })`: el panel del lector, sin fondo ni diálogo,
  dentro de un elemento de la página.

### Arreglado
- Un cambio de configuración hecho en la página de Voceiro se le manda a Voceiro
  al momento (`alCambiar` solo oye otras pestañas).

## 2026-10-14 — Ajustes, avisos y diálogos del lector con el tema

### Cambiado
- Ajustes del lector, la herramienta de análisis de extracción, el selector
  visual, el diálogo de añadir medio, el desplegable «Abrir en…» y los avisos usan
  la paleta y el tema del perfil (unos 270 colores fijos menos). Lo que el lector
  pinta fuera de su ventana lleva la clase `il-tema`; la paleta para ella va en
  una sola hoja (`temaDe()`).
- Avisos con los colores del tema invertidos (fondo = color del texto), para que
  se vean sobre cualquier página.

### Accesibilidad
- Ajustes, el diálogo de añadir medio y la herramienta de extracción son
  diálogos modales con nombre. El foco entra al abrirlos y vuelve a donde estaba
  al cerrarlos.
- Los avisos son `role="status"`: los lectores de pantalla los leen sin mover el
  foco.
- Pendientes leídas y textos secundarios del desplegable, en gris legible en vez
  de transparentes.

## 2026-10-14 — Un solo botón flotante

### Cambiado
- Los cuatro botones flotantes (📖 lector, ⚙️ ajustes, ＋ añadir medio y ↗ «Abrir
  en…») pasan a ser uno. Con artículo, el botón grande abre el lector y el pequeño
  (⋯) despliega el resto; sin artículo, el grande despliega el menú: modo lectura,
  añadir este medio, «Abrir en…» (los servicios), ajustes y ocultar el botón en
  este medio.
- Neutro y con los colores del tema del perfil, en vez del degradado rojo. El
  lector automático se ve como un punto verde y se dice en su nombre.
- Dentro de un Shadow DOM: el CSS del medio no le llega.
- Se arrastra y al soltarlo se pega al borde más cercano; recuerda el lado y la
  altura (`CFG.fab.lado` y `top`; la posición de antes se traduce sola).
- «Ocultar el botón en este medio» se deshace desde el aviso o desde el menú del
  gestor («Mostrar el botón en este medio»). Clic derecho o pulsación larga ya no
  lo ocultan: abren el menú.
- La opción «Abrir en…» de los ajustes decide ahora si los servicios salen en el
  menú del botón.
- `actualizarBoton()` sustituye a las funciones de cada botón: unas cuarenta
  llamadas repartidas que los quitaban y ponían uno a uno.

### Accesibilidad
- Nombres accesibles en los dos botones, menú con `role="menu"` y teclado
  (flechas, Inicio, Fin, Esc, Tab) y foco visible con el color del tema.
- Al salir del lector, el foco vuelve al botón.

## 2026-10-14 — Barra y menús del lector, con iconos y accesibles

### Cambiado
- Barra del lector: «← Voceiro» (cierra la pestaña y vuelve), Apariencia,
  Pendientes, Más y Salir. En pantallas estrechas solo se ven los iconos; los
  textos siguen para los lectores de pantalla. Se van «Atrás», «Titulares» (abría
  otra pestaña de Voceiro), «Opciones», «Acciones» y los botones sueltos de
  imágenes, «Abrir en…» y ajustes.
- Apariencia: tema (con muestras de color), letra, tamaño, ancho, extras, «Sin
  imágenes en este medio» y origen, con radios y casillas nativos y una ✓ en lo
  elegido. Más: «Abrir en…» (los servicios), copiar, lectura rápida, imprimir,
  correo, compartir, ignorar sección y ajustes; se maneja con flechas, Inicio y
  Fin. En el móvil, los dos salen como hoja desde abajo. Esc o pulsar fuera los
  cierra.
- Iconos SVG del sprite de Voceiro: `lector/plantilla.mjs` saca del sprite solo
  los que usa el lector; si falta alguno, no se construye. Se añaden 14 al sprite
  (Lucide 0.460.0).
- La paleta llega al lector como datos y el lector genera su CSS donde la
  necesite (`cssPaleta`).

### Accesibilidad
- El lector es un diálogo modal (`role="dialog"`, `aria-modal`, con el título
  como nombre). Al abrirlo el foco va al título y la página de debajo queda
  `inert`; al cerrarlo, el foco vuelve a donde estaba.
- El artículo lleva el `lang` de la página.
- Botones de al menos 44 px. La barra no se esconde mientras tenga el foco o un
  desplegable abierto.
- Las imágenes se amplían también con el teclado (Intro o espacio) y la
  ampliación se cierra con Esc.
- `prefers-reduced-motion`: sin transiciones ni desplazamientos suaves.

## 2026-10-14 — Final del artículo en el lector

### Añadido
- Bloque final en el lector: «✓ Leída · volver a Voceiro», «Siguiente pendiente →»
  (con su título; la abre en la misma pestaña con el lector ya abierto), guardar
  para luego y subir.
- Llegar al final marca el artículo como leído: en Pendientes, si está, y en
  Voceiro, aunque no se abriera desde allí. Se puede deshacer y entonces ya no se
  marca sola.
- Puente: el lector manda a Voceiro lo terminado (`leidas`) y Voceiro lo confirma
  con `leidasHasta`; las tarjetas se repintan sin rehacer la lista.

### Cambiado
- Volver a Voceiro cierra la pestaña (`@grant window.close`) y pone delante la de
  Voceiro (`@grant window.focus`, avisando por el almacén del gestor). Si no se
  puede cerrar: si Voceiro ya está delante, solo se sale del lector; si no, la
  pestaña va a Voceiro. La ✕ de arriba hace lo mismo.

### Quitado
- «↑ Subir · ← Atrás» del pie del artículo (los sustituye el bloque final).

## 2026-10-14 — Paleta accesible y lector que se entera de los cambios

### Cambiado
- Una sola paleta para Voceiro y el lector: vive en `plantilla.html` (bloque
  PALETA) y `lector/build.mjs` la copia al construir. `tests/tema/paleta.test.mjs`
  comprueba los contrastes de los cuatro temas (WCAG 2.2 AA); si fallan, el front
  se queda congelado como con el resto de tests.
- Contrastes: gris secundario más oscuro en claro y sepia; acento y verde de los
  modos algo más oscuros en sepia; bordes de los botones a 3:1; texto del
  resaltado en oscuro.
- Nuevo `--on-solid` para el texto sobre fondos de color (botón activo, modo
  activo, guardar, bloquear): blanco en claro y sepia, oscuro en oscuro y negro en
  contraste. Antes, en oscuro y contraste, ese texto blanco no llegaba a 3:1.
- `color-scheme` en cada tema: controles, barras de scroll y enlaces del navegador
  se pintan oscuros en los temas oscuros. Enlaces con el color del tema y anillo
  de foco propio (`--focus`).
- Titulares leídos: gris legible con una ✓, sin la transparencia que los dejaba
  por debajo de 2:1. Los vistos (mirados sin abrir) pierden también la
  transparencia y se distinguen por una letra algo menos gruesa.
- Lector: el botón «Guardar» usa los colores del tema (el naranja no llegaba a 3:1).

### Arreglado
- El lector abierto no se enteraba de los cambios de perfil hechos en Voceiro (u
  otra pestaña) y, desde ese momento, lo que se cambiaba en él no se guardaba.
  Ahora se repinta al momento.
- Abrir o cerrar los paneles del lector ya no cuenta como cambio de configuración
  que viaje a otros dispositivos.

## 2026-10-13 — Panel Investigar: empresas y personas del BORME

### Cambiado
- El panel Investigar (`#panel-buscar`, Alt+B) deja de buscar prensa externa
  (FreeNewsAPI y Google News, que el botón «🌐 prensa» ya cubre) y pasa a buscar
  empresas (por el inicio de la razón social o por CIF) y personas del BORME en
  OpenMercantil. Muestra la ficha con los cargos vigentes y anteriores y los actos
  (cada uno enlazado al BORME de ese día), además del perfil de la persona.
- La consulta se hace desde el navegador (sin clave, CORS abierto, 200 consultas al
  día por IP) y solo al pulsar. No se guarda nada en `localStorage` ni en
  `sessionStorage`.
- Desde la ficha: «Ver noticias» lanza la búsqueda normal con el nombre, que se
  puede editar, y «Seguir» lo añade como línea a los temas del modo activo.

### Quitado
- `FREENEWS_URL`, `GNEWS_PROXY`, las funciones `bs*`, su CSS y sus textos.

## 2026-10-13 — Deno Deploy desde GitHub Actions

### Cambiado
- Las apps de Deno (`voceiro-relay`, `voceiro-buscar`, `voceiro-datos`) se despliegan
  desde `deploy-deno-*.yml` con `deno deploy` y el secret `DENO_DEPLOY_TOKEN`, solo
  cuando cambia su carpeta. La integración Git de Deno desplegaba las 3 en cada
  commit, también en las ramas de PR, y agotaba el límite de 15 por hora.
- `sync-relay.yml` pasa a ser `deploy-deno-relay.yml`: regenera la allowlist y
  despliega si cambió. Un cambio en `medios.py` que no la toca no despliega.
- `workers/deno-*/deno.json`: la sección `deploy` pasa al formato del Deploy nuevo
  (`org` + `app`); el CLI rechazaba la de Deploy Classic (`project`, `include`).

## 2026-10-13 — Runs encolados sin conflicto en state.json

### Corregido
- `actualizar.yml`: un run encolado hacía checkout del commit del lanzamiento, no
  de la punta de main, y al guardar chocaba en `state.json` con el run anterior.
  Ahora parte de la punta de la rama y, si aun así hay conflicto, gana lo de este
  run (`pull --rebase -X theirs`, hasta 3 intentos).

## 2026-10-13 — Scraping por el relay y migración de Turso sin lecturas

### Añadido
- Fuente `('scrape', url, 'relay')`: scraping de la home pedido a través del relay.
  El Siglo de Europa, Milenio y Sky News daban 403 desde GH; Google News sigue detrás.
- Fuente `('scrape', url, 'noverify')`: sin verificar el certificado TLS. CRTVG no
  manda la cadena intermedia y fallaba con `CertificateVerifyError`.

### Eliminado
- Valencia Actúa: ni scraping ni Google News devolvían nada.

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
