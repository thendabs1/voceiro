# Muestras del núcleo deportivo

Archivos de contraste, sin acceso a red en pruebas y sin cobertura completa.

`feb-revisada.json` es una **extracción manual revisada**, no una respuesta
de una API FEB. Conserva los fragmentos retenidos por la investigación del
25/10/2026 y los hechos extraídos de ellos: competición 4, temporada 2026,
fase 89975, partidos 2522807 y 2522809, un marcador con cuatro cuartos y dos
filas de clasificación. No se retuvo una hora exacta de captura: se guarda
solo la fecha, sin convertirla en un instante. El importador registra por
separado cuándo incorpora esta muestra.

Las URLs y los fragmentos literales están en `fragmentos`. La muestra de fases
incluye al final la fase LF Endesa aunque su nombre de archivo procede del
contraste junior. El HTML retenido está recortado; no permite probar un parser
completo. Los IDs de equipos no acreditados en la evidencia elegida son nulos;
las filas de la tabla no se concilian con equipos por nombre.

`espn-wta.json` procede del JSON guardado durante la investigación del
25/10/2026 de
`https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard`.
Conserva los encuentros 186929 y 185604 de la edición 345-2026 y el encuentro
185705 de la edición 232-2026. Se recortan el catálogo de liga, los campos de
torneo y los cuadros para incluir exclusivamente esas citas; los objetos de
los tres encuentros se conservan íntegros, con sus valores originales.
No se retuvo aquí el instante exacto de la descarga: los sellos de observación
de las pruebas son entradas sintéticas explícitas, no una fecha de publicación.

Las condiciones de cada fuente están en [agenda/fuentes.md](../../../agenda/fuentes.md).
Estas muestras permiten verificar estructura, identidad y conservación;
no acreditan reutilización pública, frescura ni disponibilidad de la fuente.
# Contraste del recolector HTML

`feb-calendario.html` y `feb-resultados.html` contienen fragmentos retenidos
el 25/10/2026 de las páginas de LF Endesa 2026/2027: tres partidos y dos
filas de clasificación. Se conservan HTML, IDs y selectores originales;
se han retirado filas ajenas a la muestra. No representan cobertura completa.
Se usan para probar el parser, el rechazo de cambios de estructura y el
contraste entre vistas sin red. Las pruebas de publicación cubren selección
de fuentes, circuitos, TBD y transacciones divididas con rollback real.

`feb-primera-{calendario,resultados}.html` y
`feb-challenge-{calendario,resultados}.html` son selecciones del 25/10/2026
de Primera FEB y LF Challenge 2026/2027, respectivamente: tres partidos y
dos filas de clasificación por liga. Conservan únicamente la entrada propia
del menú y los selectores seleccionados. `feb-junior-catalogo.html` retiene
el menú de 24 competiciones y los selectores de temporada/fase del calendario
júnior masculino 2025/2026, sin partidos. Permite distinguir el inventario
anunciado de la cobertura contrastada del lector. No se conserva un instante
exacto de captura ni se acredita la cobertura de las fases júnior.

# Madrid y Kulturklik (25/10/2026)

`madrid.json`: cuatro registros reales del datastore municipal `300107-2-agenda-actividades-eventos-csv`,
incluyendo una programación prolongada y dos eventos con la misma URL-ACTIVIDAD
(un contenedor de centro cultural, que no se trata como obra).
`kulturklik.json`: tres eventos de la API oficial `/culture/events/v1.0/events` del 25/10/2026;
se omiten descripciones HTML, imágenes y adjuntos. Conservan ID, nombres bilingües,
fechas, horas textuales y municipios NORA. No son una cobertura exhaustiva.
Ambos catálogos se publican bajo CC BY 4.0: Ayuntamiento de Madrid y Gobierno Vasco.
Los casos de datos contradictorios/malformados se construyen explícitamente en los tests.


# Zaragoza (27/10/2026)

`zaragoza.json`: cuatro obras reales de `/sede/servicio/cultura/evento/list.json?srsname=wgs84`
del 27/10/2026, sin descripción, imágenes, accesibilidad ni otros campos que el calendario no
usa. Cubren una función con hora, una obra con cuatro funciones, un intervalo de tres días con
horario por día y un recinto sin geometría con temporada sin horario. Condiciones generales de
reutilización del Ayuntamiento de Zaragoza: «Origen de los datos: Ayuntamiento de Zaragoza».
