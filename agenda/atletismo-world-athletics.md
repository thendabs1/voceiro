# World Athletics

Fuente `wa`, capa `atletismo-wa`; recogida de datos sin publicación ni interfaz.
La selección versionada está en [atletismo-wa-seleccion.json](atletismo-wa-seleccion.json):
Diamond League (627, 3520), Continental Tour (3773), Indoor Tour (3677),
Cross Country Tour (3664), Race Walking Tour (3692), Combined Events Tour
(3767), Label Road Races (3775), campeonatos mundiales y continentales y
Juegos Olímpicos (5, 329). Cada circuito tiene código `atletismo-wa-*`.
Nacionales, permisos de área, juegos regionales, FISU, montaña y grupos
históricos quedan fuera. La selección usa IDs, nunca el texto concatenado de
`competitionGroup`.

El lector consulta cada grupo por ventana y todas sus páginas de 100. Exige
filtros aplicados, total estable e IDs únicos por consulta. Un ID en varios
grupos forma una cita con varias pertenencias. Usa `results[].id` como identidad;
`iaafId` queda como referencia en metadatos. Conserva `venue` literal y solo
usa `wasUrl` cuando WA lo publica; el calendario es la URL de la fuente.

Las fechas normales son `startDate` y `endDate`. `undeterminedCompetitionPeriod`
lleva estados: `Cancelled` y `Postponed` conservan sus fechas y se publican como
`cancelado` y `aplazado`, con literal y observación en `temporalidad`; cualquier
otro valor, o fechas ausentes, queda pendiente y hace incompleta la ventana. Los
Juegos (grupos 5 y 329) llevan `alcance: juegos` y usan las fechas de WA, que
publica el intervalo atlético; [atletismo-wa-juegos.json](atletismo-wa-juegos.json)
solo las corrige si WA da el periodo de los Juegos enteros, con evidencia. Las
ediciones cambian de ID cada año. `rankingCategory` va literal en `calendarios[]`.

Con `hasResults` se comprueba `/competition/calendar-results/results/{id}` y solo
se publica un documento `resultados` si la página responde y acredita ese ID. Un
403 o 429 interrumpe la fuente; otro fallo deja la cita sin enlace y consta en
`informe.resultados`. «Campeonatos» es una colección nuestra, no una serie de WA;
en producción conserva la clase `circuito` con la que nació, porque la clase de una
identidad no cambia y nada filtra por ella (las facetas usan `codigo_consulta`).
Una cita ausente se busca por su ID en el mismo grupo y una ventana ampliada
un año a cada lado; puede reaparecer con nuevas fechas o dejar de publicarse
como ausencia. Un 429 interrumpe la recogida y deja `Retry-After` en el
informe local si se pidió `--informe`.

WA corta a veces la conexión (timeout o reset): el paso tolerado falla y
conserva la última lectura buena.

Pendiente de la interfaz, acordado: un solo chip «WA» en Atletismo; al marcarlo
aparece una fila con sus circuitos (Diamond, Continental, Pista cubierta, Cross,
Marcha, Combinadas, Ruta, Campeonatos). Los circuitos también se escriben en la
barra; «Diamond League» filtra agenda y noticias por titular. Requiere entradas
en el catálogo de `consulta.js` y añadir `wa` a `CALENDARIO_FUENTES_PUBLICAS`.

Identidad con las federaciones: WA no publica ningún ID compartido con ellas
(`wasUrl` aparece en 3–4 registros al año e `iaafId` en uno; ninguna ficha
federativa enlaza a WA; el «Área» de RFEA no marca de forma coherente las
pruebas con permiso WA). Cada unión es una conciliación editorial con alcance
revisado: un registro WA puede ser la reunión, una carrera o el atletismo de
unos Juegos (Atapuerca, Dakar). Auditoría local en
`docs/atletismo-fuentes-2026-11-03/wa/`.
