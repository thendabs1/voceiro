# Resultados por fecha y fichas de partido

La parrilla de `resultados:primera`, `resultados:segunda`, `resultados:nba`,
`resultados:wnba`, `resultados:copa-del-rey`, `resultados:champions` y
`resultados:liga-f` permite consultar días anteriores y posteriores, elegir
una fecha y abrir las estadísticas de cada partido.

## Ampliación del 6 de noviembre: copas y Liga F

Los códigos nuevos corresponden a `soccer/esp.copa_del_rey`,
`soccer/uefa.champions` y `soccer/esp.w.1`. Las previas de Champions
(`uefa.champions_qual`) quedan fuera. Liga F también es una colección de
agenda por fecha, con código `liga-f`: esa recogida sigue sin guardar resultados.

`CAPACIDADES_ESPN`, en `shared/consultas/registro.js`, declara los tipos
admitidos por competición. Copa no tiene clasificación: tanto la búsqueda
como la ficha se rechazan con 400 antes de acceder a caché, presupuesto o
red, sin gastar los GET de scoreboard y standings. Liga F ofrece resultados
y ficha de partido; su clasificación queda fuera de esta ampliación.
Champions usa el normalizador de tablas existente para la fase liga de 36
equipos. Cada fila añade `dg` solo cuando existe `pointDifferential` de fútbol;
la interfaz muestra esa columna si alguna fila la tiene. Standings no se
interpreta como cuadro de eliminatorias.

Las filas de resultados y las fichas de Copa y Champions añaden exclusivamente
el siguiente bloque estructurado (tanteos en orden local/visitante, como el marcador):

```js
eliminatoria: {
  ida_vuelta: 'ida' | 'vuelta' | null,
  global: { local: string | null, visitante: string | null } | null,
  penaltis: { local: string | null, visitante: string | null } | null,
  resolucion: 'prorroga' | 'penaltis' | null,
  clasificado: 'local' | 'visitante' | null,
  ganador: 'local' | 'visitante' | null,
}
```

El global se asocia por ID a `series.competitors[].aggregateScore`. Se admite
`series` como objeto en scoreboard y como lista de una serie en summary,
ambos comprobados. «Pasa» requiere un partido final y una serie completada
con un ganador inequívoco. Sin serie ni leg, «Gana» usa el ganador estructurado
del partido final; no afirma una clasificación. Una ida o serie sin completar
no anuncia quién pasa. No se calcula el clasificado a partir del marcador.

`shootoutScore` aporta los penaltis. Los nombres comprobados
`STATUS_FINAL_AET` y `STATUS_FINAL_PEN` identifican la resolución; con este
último se indica «Tras penaltis» aunque falte el tanteo de la tanda. No se
deduce una prórroga por acabar en penaltis. Las notas y los títulos en inglés
no se muestran ni se interpretan, tampoco como sustituto de campos ausentes.

Una plaza sin nombre o con `TBD` conserva el partido con nombre `null`,
presentado como «Por determinar». Dos IDs centinela iguales, numéricos y no
positivos, se admiten en el summary; no se asocian a estadísticas,
incidencias ni jugadores. Se mantienen las comprobaciones de evento, liga,
dos lados y rechazo de equipos reales duplicados.

Las muestras recortadas están en `tests/consultas/muestras/espn-*-copa-del-rey.json`,
`espn-*-champions.json` y `espn-*-liga-f.json`. Copa, el summary de Liga F,
los scoreboards de Champions y standings proceden del
directorio de verificación del 5/11; el summary de Champions y el scoreboard
de Liga F del 1/11 se descargaron el 6/11, un GET por recurso, con
`User-Agent: Mozilla/5.0`, sin Origin. El resto de pruebas usa respuestas locales.
Los casos 2–0/global 2–3 y plazas centinela son variaciones sintéticas declaradas
en las pruebas. La muestra de calendario Liga F vive separada en
`tests/fuentes/muestras_calendario/deportes/espn-liga-f.json`.

## Navegación

Al abrir Resultados se mantiene la selección actual de ESPN y se muestra
`day.date`, la fecha declarada por el proveedor. No equivale necesariamente
a hoy: en las respuestas comprobadas del 2 de noviembre, Segunda declaraba
ese día; NBA, el 1 de noviembre; WNBA, el 31 de octubre.

Los controles anterior, fecha y siguiente consultan un día cada vez, solo por
acción del lector. Un día vacío muestra «Sin partidos» y conserva los controles.
Al abrir un partido y volver se recuperan la fecha, la parrilla y el foco sin
volver a pedir los resultados. Si falla otra fecha, se mantiene la vista buena
con su fecha y se permite reintentar la consulta fallida.

La navegación NBA/WNBA usa el día deportivo ESPN. Los encuentros mantienen
sus horas y agrupaciones por fecha local; una nota explica que un partido de
madrugada puede aparecer en la fecha anterior. No se deduce el día del proveedor
a partir de la hora del primer partido.

## Consulta y caché

`/consulta/ficha?id=espn:resultados/segunda&fecha=2026-11-01` consulta
`scoreboard?dates=20261101`. `fecha` es opcional, debe ser una fecha civil ISO
válida y solo se admite en fichas de resultados. Las fichas individuales
conservan sus IDs y su consulta actual, sin parámetro de fecha.

La fecha forma parte de las claves de caché del cliente y del worker. La URL
pública y la clave interna usan la versión 3 del contrato para evitar respuestas
antiguas sin IDs de partido o sin fecha. Se conservan las caducidades actuales:
60 segundos si hay encuentros en juego y una hora para los demás resultados.
No hay refresco automático ni consultas a otros días al abrir la vista.

Cada día cuesta un GET de origen cuando no está cacheado; abrir las estadísticas
añade otro GET si falta el detalle en caché. No se añaden base de resultados,
recogida programada, jornadas oficiales ni cruces de proveedores.

## Ficha de partido

Se abre desde una tarjeta de resultados o mediante `partido:CODIGO` para
cualquiera de esas siete competiciones, que ofrece los encuentros actuales
para elegir. `partido:primera/401882817` abre una identidad concreta.
Hay acceso desde el menú de cada competición. Se conserva el ID entre lista,
ficha y caché; volver recupera la parrilla, su fecha y el foco sin otra consulta.

El detalle se obtiene de `summary?event=ID` solo al abrirlo. Muestra cabecera
con marcador, estado, hora y lugar; estadísticas comparadas; goles, tarjetas
y cambios en fútbol; parciales y destacados en baloncesto. Alineaciones y
estadísticas individuales van plegadas. Solo se publican bloques utilizables,
sin devolver el JSON completo del proveedor. Las muestras están en
`tests/consultas/muestras/espn-partido-*.json`.

La caché del detalle incluye competición, ID e idioma: 60 segundos en juego,
una hora finalizado y quince minutos en otros estados. Las solicitudes
concurrentes de la misma consulta comparten la petición dentro de una instancia.
Los fallos no se cachean; una actualización fallida conserva la ficha anterior.
No hay refresco periódico del panel.

Las [jornadas oficiales y otras ampliaciones](resultados-diseno.md) siguen
pendientes.

## Casos contrastados

- Segunda, lunes 2 de noviembre: cuatro partidos; al consultar el domingo 1,
  tres finales con sus IDs ESPN, válidos para abrir las estadísticas.
- NBA, día 1 de noviembre: cuatro encuentros que abarcan el 1 y el 2 en Madrid.
- Primera, 3 de noviembre: respuesta sin partidos, distinta de un fallo.
- En las muestras de pruebas: fechas inválidas y bisiestas, separación de cachés,
  respuestas tardías, error al cambiar de fecha y vuelta desde estadísticas.

La revisión visual queda a cargo del usuario. La suite completa se ejecuta en CI.
