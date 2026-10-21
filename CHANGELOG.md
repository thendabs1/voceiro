# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).
Sin tags formales todavía; los bloques van por fecha y agrupados por tema.

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