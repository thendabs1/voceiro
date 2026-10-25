# Lectura indexada del calendario

Primer tramo del paso 2 de [la arquitectura acordada](arquitectura-servicios.md).
Añade tablas derivadas y rutas comunes en `cf-datos` y `deno-datos`.
El frontend continúa con `calendario.json`. La publicación SQL requiere
activación explícita; desplegar el worker no crea tablas ni consulta proveedores.
Este cambio no modifica datos ni secretos remotos.

## Publicación

```sh
python -m agenda.publicacion --turso --fuentes cultura-galicia,madrid,kulturklik --lectura-sql
```

Requiere Node 24 además de Python. `shared/calendario/proyeccion.js` reutiliza
las reglas de fechas y normalización de texto del cliente. Prepara las filas
antes de abrir la transacción, tras aplicar la selección pública de fuentes.
El token de escritura sigue siendo el del recolector.

`lectura.sql` es una ampliación aditiva con versión propia; conserva el núcleo
v4. Tarjetas, detalles, objetivos, facetas y tramos se sustituyen atómicamente.
La revisión del núcleo se comprueba dentro de la transacción: una recogida
concurrente provoca rechazo y conserva la publicación anterior. Se aprovecha
el transporte por lotes existente. No hay reintento tras un COMMIT incierto.

El índice abarca desde 45 días antes de la fecha UTC de generación hasta 366
días después, incluido ese último día. Comprime los días válidos en tramos
consecutivos `[desde,hasta)`; cierres y exclusiones separan tramos sin crear
eventos nuevos. Los pendientes tienen una entrada aparte. El horizonte no es
una política de borrado ni una promesa de cobertura de los proveedores. Los
detalles conservan todos los eventos públicos.

Esta versión reconstruye la proyección al publicar: las escrituras aún no son
incrementales. La preparación se detiene antes de escribir si supera cinco
millones de evaluaciones de día. No elimina historial.

En Actions, `CALENDARIO_LECTURA_SQL=true` habilita la publicación SQL adicional
cuando se publica R2. Por defecto vale `false`. R2 sigue publicándose; las dos
salidas no tienen transacción distribuida y sus consumidores no deben mezclarlas.

## Worker y contrato

Ambos despliegues necesitan `CALENDARIO_TURSO_URL` y el secreto independiente
`CALENDARIO_TURSO_TOKEN_LECTURA`, de **solo lectura**, para la misma base.
Sin ellos, las rutas nuevas responden 503. No utilizar el token del recolector.
La autenticación y los parámetros enlazados siguen el
[protocolo HTTP de Turso](https://docs.turso.tech/sdk/http/reference).

| Ruta GET/HEAD | Respuesta |
| --- | --- |
| `/calendario/eventos?desde=2026-10-25&hasta=2026-11-08` | Eventos únicos, 20 tarjetas por página, máximo 50. Ventana `[desde,hasta)`, máximo 42 días. |
| `/calendario/eventos?pendientes=1` | Pendientes paginados; sin ventana de fechas. |
| `/calendario/resumen?desde=2026-10-25&hasta=2026-11-08` | Días, incluidos vacíos, con conteo exacto y hasta dos muestras. |
| `/calendario/eventos/:id` | Evento completo, resultados disponibles y únicamente sus objetivos asociados. |
| `/calendario/catalogo` | Temas, fuentes, versiones de catálogos y zonas. |
| `/calendario/objetivos?texto=pontevedra&tipo=territorio` | Entidades publicadas paginadas, hasta 50; no descarga todo el catálogo. |

Filtros de eventos y resumen:

- `q`: ámbitos/circuitos del parser común, como `deportes:resultados` o
  `circuito:atp,wta`, más texto libre. `texto` añade otro filtro textual con AND.
- `temas`, `circuitos`: listas con comas, OR dentro de cada lista. Temas incluye
  descendientes; circuitos explícitos se cruzan con los de `q`, como en el cliente.
- `fuente`, `objetivo`, `lugar`, `municipio`: identificadores publicados. Los
  tres últimos conservan la semántica de objetivos del cliente.
- `territorio`: ID común, por ejemplo `es:municipio:36038` o `es:provincia:36`.
  Solo celebración; los ancestros acreditados incluyen descendientes.
- `resultados=1`: con resultado disponible.
- `zona`: `Europe/Madrid`, `Atlantic/Canary`, `UTC`. Otras zonas requieren ampliar
  y medir la proyección antes de conectarlas en la interfaz.

Las fechas van en parámetros HTTP: el cliente debe traducir los prefijos de
fecha de `q` al contrato de fin exclusivo. Se rechazan parámetros desconocidos
o repetidos, prefijos desconocidos, más de 20 términos textuales, ventanas
excesivas y límites inválidos (400). Fuera del horizonte: 422. Clasificaciones
y noticias no se transforman en eventos si se solicitan mediante `q`.

`palabrasDe` normaliza al publicar y `compilarTexto` compila frases, prefijos
y exclusiones a predicados SQL enlazados **antes** de LIMIT, cursor y conteos.
No se incorpora FTS: los predicados recorren candidatos temporales preparados.
El coste de búsquedas amplias y exclusiones se debe medir al crecer los datos.

Orden: primer día válido de la ventana e ID estable. Aún no reproduce el orden
local por hora/nombre. Incluye intervalos una sola vez; el futuro cliente
mantendrá su presentación diferenciada. Las muestras no se ordenan por idioma.

Todas las respuestas identifican `revision`, `generado`, `horizonte` y
`cobertura`. Esta última comunica la comprobación más reciente de eventos
publicados por fuente, con `completa:false`: no existe aún un registro fiable
de ventanas completas por colección. Un vacío no acredita ausencia en la fuente.

`siguiente` es un cursor vinculado a ruta, selección, zona, límite y revisión;
se envía como `cursor` conservando los demás parámetros. Detalles y catálogos
admiten `revision` para exigir la misma publicación. Un cambio devuelve 409 y
requiere reiniciar; no se guardan publicaciones anteriores. La revisión se
comprueba también en el mismo snapshot SQL que las filas, evitando mezclar
metadatos y resultados si se publica entre las dos consultas HTTP.

## Caché y coste

Caché opcional de plataforma: control 15 segundos y respuestas 30, con clave
por revisión, ruta, selección y cursor. Un acierto completo evita Turso.
Soporta ETag, If-None-Match, HEAD y CORS. No cachea errores. Durante ese TTL
puede servir una revisión anterior coherente; nunca mezcla páginas en silencio.

Límite de 30 peticiones/IP/minuto antes de Turso, incluidas las de caché. El
contador es local a cada instancia, igual que en los otros workers; no es una
cuota global. Un 429 incluye Retry-After y no debe activar respaldo en el cliente.
El transporte limita cada envío a cinco segundos y dos MB de respuesta.
Los errores internos no revelan excepciones del servidor.

LIMIT acota la respuesta, **no** las filas examinadas. Antes de activar tráfico
hay que medir `rows_read` y `rows_written` reales y acordar el presupuesto,
especialmente de resumen y exclusiones. No se ha consultado el consumo de la
cuenta ni certificado un coste mensual.

## Medición inicial (25/10/2026)

JSON público descargado una vez: 3.724 eventos, 9.982.661 bytes. Node 24 y SQLite
en memoria, sin red Turso. La representación inicial por día generó 328.923
enlaces y unos 98 MB. Se sustituyó antes de publicar el cambio por 24.783 tramos,
15.941 facetas y unos 31 MB de base derivada completa. Preparación: unos 2,2 s;
inserción: unos 0,32 s.

Una ventana de 14 días devuelve 21 filas candidatas para una página de 20:
unos 26 KB sin comprimir frente a casi 10 MB del objeto completo. Agenda y texto:
unos 6–9 ms; resumen de 14 días: unos 53 ms. Son tiempos SQL locales y bytes
de filas, no latencia ni tamaño final HTTP de producción. Los planes usan
índices de tramos y búsquedas por ID; el resumen conserva agrupaciones y
ordenaciones temporales. La muestra descargada todavía no incorporaba los
enlaces territoriales nuevos: esos cruces se verifican con fixtures.

Reproducir sin credenciales ni red:

```sh
node scripts/medir-lectura-calendario.mjs publicacion.json
```

Antes de cambiar el cliente quedan: crecimiento sintético y filas reales en
Turso; clasificaciones paginadas y resolución territorial común; orden visible,
zonas adicionales y traducción de fechas del parser. Después se conectan las
tres vistas, detalles y filtros bajo demanda. Cobertura por colección y
escrituras incrementales siguen siendo requisitos antes de multiplicar fuentes
o frecuencias. Este incremento no activa proveedores ni poda.
