# Resultados por fecha en Voceiro

La parrilla de `resultados:primera`, `resultados:segunda`, `resultados:nba`
y `resultados:wnba` permite consultar días anteriores y posteriores, elegir
una fecha y abrir las estadísticas de cada partido.

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

## Casos contrastados

- Segunda, lunes 2 de noviembre: cuatro partidos; al consultar el domingo 1,
  tres finales con sus IDs ESPN, válidos para abrir las estadísticas.
- NBA, día 1 de noviembre: cuatro encuentros que abarcan el 1 y el 2 en Madrid.
- Primera, 3 de noviembre: respuesta sin partidos, distinta de un fallo.
- En las muestras de pruebas: fechas inválidas y bisiestas, separación de cachés,
  respuestas tardías, error al cambiar de fecha y vuelta desde estadísticas.

La revisión visual queda a cargo del usuario. La suite completa se ejecuta en CI.
