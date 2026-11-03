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

Las fechas normales son `startDate` y `endDate`. Las fechas ausentes o con
`undeterminedCompetitionPeriod` quedan pendientes y hacen incompleta la
ventana. Las fechas de los Juegos corresponden al conjunto de deportes: solo
se importan con inicio, fin y evidencia editorial del atletismo en
[atletismo-wa-juegos.json](atletismo-wa-juegos.json) (Dakar 2026: 8–10/11).
Una cita ausente se busca por su ID en el mismo grupo y una ventana ampliada
un año a cada lado; puede reaparecer con nuevas fechas o dejar de publicarse
como ausencia. Un 429 interrumpe la recogida y deja `Retry-After` en el
informe local si se pidió `--informe`.

Pendiente para fase 2: interfaz de circuitos, filtros y publicación pública.
