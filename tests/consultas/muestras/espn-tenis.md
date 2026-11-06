Muestras reales recortadas el 6/11/2026, sin cabecera Origin ni correo y con el
User-Agent del worker. Ambas peticiones respondieron HTTP 200:

- https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard?dates=20261105
- https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard?dates=20261105

Se conservaron campos originales y una selección de encuentros de distintos
días: individuales, dobles, retirada, walkover, cancelado, programado, en juego,
horas sin confirmar y desempates. No son listados completos del día ni del torneo.
El retiro WTA 187324 conserva 6–1, 2–1; el doble ATP 187298 conserva el parcial
de origen 1–0 y sus puntos de desempate 10–7, sin convertir los puntos en juegos.

Los summary ATP `?event=187334` y WTA `?event=187324` respondieron HTTP 400 en
`/apis/site/v2/sports/tennis/{atp,wta}/summary`. No se usan para obtener fichas.
También devolvieron HTTP 400 las variantes con torneo y encuentro:
ATP `?event=13-2026&competition=187334` y WTA
`?event=889-2026&competition=187324`.

Decisiones del adaptador:

- El día se selecciona por la fecha UTC declarada en cada encuentro. Si
  `timeValid` no es true, se conserva la pertenencia a ese día y `inicio` queda
  null; el front explica que la hora no está confirmada. No se afirma que el
  horario ni la fecha sean definitivos.
- Identificador: `espn:tenis/<circuito>/<AAAAMMDD>/<id-torneo>/<id-encuentro>`.
  Regex estricta y fecha civil válida en worker y front; el worker comprueba el
  UID completo de torneo y encuentro. El ID de cuadro pertenece a su torneo.
- Un fallo de caché de origen cuesta un scoreboard por circuito/día. La caché
  normalizada es común a idiomas, lista y fichas; comparte peticiones en curso
  en cada instancia. TTL: 60 s en juego, 900 s con programados o día vacío,
  3600 s en los demás casos. Una ficha reutilizada conserva la caducidad de
  origen. Cada descarga pasa por `crearPresupuesto`, sin sondeos automáticos.
- ATP conserva referencias `espn-atp:tournament_uid` y
  `espn-atp:tournament_calendar_uid`. WTA deja la lista vacía: sus UID ESPN no
  acreditan correspondencia con la agenda oficial. La agenda no se modifica.
- Las capacidades son resultados y ficha (partido), sin clasificación. La
  búsqueda `partido:atp` o `partido:wta` ofrece los encuentros del día UTC.

Fuera de estas muestras: aplazados reales, descalificaciones, semántica de todas
las modalidades de superdesempate, árbol completo de eliminatorias y cambios
posteriores de fecha o identidad. Las pruebas no acceden a red.
