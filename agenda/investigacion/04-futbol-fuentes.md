# Fútbol: contraste de fuentes — 24/10/2026

Revisión a partir del documento facilitado por el usuario,
`apis_futbol_gratis_endpoints_2026.md`, con consultas HTTP puntuales desde este
entorno y documentación de los proveedores. Se añaden openfootball y
fixturedownload. No se ha creado un importador ni activado recogida periódica.
OpenCode no interviene; OpenF1 sigue descartada y Jolpica aparcada.

**Decisión posterior del usuario:** fútbol pendiente de la autorización que
ha solicitado a FotMob por la cobertura de Liga F y equipos regionales.
No se implementa OpenLigaDB ni se vuelve a consultar FotMob. Las propuestas
de proveedores siguientes son la investigación previa, no el plan actual.
Se tiene en cuenta su estructura en [el diseño de persistencia](../persistencia.md).

## Resultados comprobados

| Fuente | Comprobación | Utilidad y límite para este piloto |
| --- | --- | --- |
| ESPN | HTTP 200 en partidos del 24/10 de Primera (4) y Segunda (5); clasificación 2026/27 con 20 y 22 equipos, respectivamente. | Tiene IDs de evento y equipo, UTC, local/visitante, estado y marcador. Buen contraste técnico del modelo; las rutas internas no acreditan una API pública ni autorización de republicación. |
| OpenLigaDB | HTTP 200 en Bundesliga: tabla con 18 equipos. También en LaLiga `la1/2026`: 380 partidos con IDs distintos y tabla con 20 equipos. | API pública sin registro, datos ODbL. Amplía la cobertura española respecto al resumen inicial, pero los resultados consultados están atrasados. |
| FotMob | HTTP 200 en jornada global (199 grupos, 773 partidos) y LaLiga (380 partidos con IDs distintos y tabla de 20 equipos). | Responde técnicamente, pero sus condiciones prohíben extracción automática regular y redistribución sin consentimiento. No proponerlo como recogida periódica autorizada. |
| SofaScore | HTTP 403 en partidos del día. | Sin más intentos ni mecanismos para sortear el bloqueo. |
| TheSportsDB | HTTP 200 con la clave pública `123`: tabla de Premier 2026/27 devuelve exactamente 5 filas. | Confirma el recorte documentado: una respuesta correcta no es una clasificación completa. |
| football-data.org | Documentación y cobertura revisadas; sin token ni consulta autenticada. | Plan gratis con 12 competiciones, LaLiga incluida, tablas, horarios y marcadores con retraso, 10 llamadas/minuto. Segunda no figura entre las 12 gratuitas. |
| API-Football | Precios oficiales revisados; sin cuenta ni consulta autenticada. | Gratis 100 llamadas/día, temporadas restringidas. No dar por incluida 2026/27 sin verificar la cuenta. |
| openfootball/football.json | HTTP 200 en `2026-27/es.1.json`: 380 partidos, 69 con marcador; último partido con resultado fechado el 20/09. | CC0, útil para muestras e histórico. No tiene ID de partido ni de equipo en esta muestra, solo nombres; tampoco zona explícita en las horas. No sirve aquí para resultados actuales. |
| fixturedownload | Web y condiciones revisadas; sin descargar sus feeds. Ofrece JSON, CSV e ICS. | Sus condiciones restringen redistribución y almacenamiento en otras webs sin permiso escrito. No escogerlo como fuente de publicación con las condiciones revisadas. |

Son fotografías de las respuestas observadas, no una garantía de cobertura,
exactitud de los horarios ni disponibilidad futura. No se ha contrastado cada
partido con el organizador oficial.

## Qué cambia respecto al documento de partida

**OpenLigaDB también tiene LaLiga.** El enlace del catálogo oficial lleva a
`/Matches/la1/2026/10`; la API responde en
[`getmatchdata/la1/2026`](https://api.openligadb.de/getmatchdata/la1/2026) y
[`getbltable/la1/2026`](https://api.openligadb.de/getbltable/la1/2026).
Pero solo 80 encuentros figuran terminados: el más reciente es del 17/10.
Los cuatro del 24/10 tienen `matchResults: []`, mientras que ESPN devuelve
marcadores finales en los cuatro y FotMob declara 95 partidos terminados
en la temporada. La tabla de OpenLigaDB muestra al Barcelona con 8 jugados
y 24 puntos, frente a 9 y 27 en las otras dos respuestas. Esto identifica
un desfase; no valida automáticamente a los otros proveedores como verdad.
Un calendario de 380 registros puede estar completo en identidades y atrasado
en resultados u horarios.

**FotMob cubre categorías interesantes, pero no es una API abierta por responder
sin clave.** La jornada incluye Liga F, Primera Federación y Segunda Federación.
Algunos grupos tienen un `id` de fase diferente del identificador de liga:
conservar también `primaryId` y no crear competiciones por cada nombre.
La respuesta de LaLiga guarda el calendario en `fixtures.allMatches`, no en
el campo `matches` sugerido de forma general en el documento. Sus
[condiciones oficiales](https://www.fotmob.com/tos.txt), fechadas el 22/10,
prohíben recogida sistemática y reutilización sin consentimiento; no continuar
descargando para este piloto.

**ESPN funciona en consultas diarias, pero no queda resuelta la recogida amplia.**
La consulta diaria del 25/10 devuelve otros cuatro encuentros pendientes,
con `timeValid: true` y marcador `0` en ambos participantes: esos ceros no son
un resultado final.
Las pruebas con intervalo `dates=20261025-20261108` y `limit=1000` o `100`
respondieron 400. No se atribuye el fallo a un parámetro concreto sin aislarlo.
No prometer un calendario de temporada completo basándose solo en el marcador
de un día. Falta validar alcance, límites, estabilidad y condiciones de uso
antes de una integración periódica o publicación.

**openfootball y fixturedownload no resuelven por sí solos el problema.**
El primero declara generación diaria del JSON, pero también avisa de que los
ficheros fuente no se actualizan automáticamente: regenerar el archivo no
prueba frescura del resultado. El segundo ofrece los formatos deseados, pero
sus condiciones no conceden la redistribución que necesitaría el producto.

## Consecuencias para el calendario común

- El partido es un evento. Competición, temporada y jornada/fase son referencias;
  local y visitante son participantes con IDs propios del proveedor. La ficha
  de un equipo no determina el territorio de celebración del partido.
- Marcador y estado deportivo se enlazan al evento. Separar marcador provisional,
  descanso, final, prórroga y penaltis cuando existan. En OpenLigaDB elegir por
  `resultTypeID`/tipo declarado, no por posición del elemento en `matchResults`.
- La tabla es una instantánea con fuente, competición, temporada, fase/grupo y
  ámbito (general, local o visitante). Conservar orden, puntos y sanciones
  declarados; no reconstruir una clasificación oficial sumando goles o victorias.
- No inferir que un encuentro sin terminar está en directo porque su fecha haya
  pasado, ni convertir un marcador cero de un partido pendiente en resultado.
  ESPN ofrece `completed`, `state`, `name` y `timeValid`; conservar sus señales.
- Usar UTC cuando esté declarada y convertir para mostrar. Si la hora es pendiente
  o provisional, conservar esa precisión. No fijar fin sumando 90 minutos.
- Los IDs solo son únicos dentro de su proveedor. Nombres y fechas sirven para
  proponer correspondencias revisables, no para fusionar automáticamente partidos.
- Separar frescura de transporte, cambios de contenido y vigencia deportiva:
  HTTP 200 y una descarga de hoy pueden contener resultados atrasados. Mostrar
  cobertura y última observación sin prometer un directo.

## Propuesta para empezar, pendiente de diseño con el usuario

Usar OpenLigaDB como primer contraste deportivo del modelo común: calendario,
IDs, participantes, resultados diferenciados y tablas, sin cuentas nuevas.
Para LaLiga, tratarlo como muestra con desfase conocido; comprobar varios
momentos de actualización antes de prometer resultados actuales.
Las muestras de ESPN ayudan a contrastar Primera y Segunda y los estados,
sin elegir todavía sus rutas internas como dependencia periódica del producto.

Si necesitamos publicar LaLiga con una API documentada, football-data.org es
la siguiente candidata a probar con token gratuito; aceptaríamos el retraso
de su plan y su cobertura no resuelve Segunda o fútbol territorial.
La elección de proveedor queda separada del contrato: otro adaptador debe
poder alimentar los mismos eventos, participantes y tablas sin rediseñarlos.

## Fuentes primarias y verificación

- ESPN: [partidos de Primera](https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard?dates=20261024), [tabla de Primera](https://site.api.espn.com/apis/v2/sports/soccer/esp.1/standings), [partidos de Segunda](https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/scoreboard?dates=20261024), [tabla de Segunda](https://site.api.espn.com/apis/v2/sports/soccer/esp.2/standings).
- OpenLigaDB: [catálogo y licencia ODbL](https://www.openligadb.de/), [documentación del mantenedor](https://github.com/OpenLigaDB/OpenLigaDB-Samples#readme). Su código de ejemplo y sus datos tienen licencias diferentes.
- FotMob: [condiciones](https://www.fotmob.com/tos.txt).
- TheSportsDB: [documentación y límites por endpoint](https://www.thesportsdb.com/docs/api).
- football-data.org: [plan gratuito](https://www.football-data.org/pricing), [cobertura](https://www.football-data.org/coverage).
- API-Football: [plan y restricción de temporadas](https://www.api-football.com/pricing).
- openfootball: [documentación y CC0](https://github.com/openfootball/football.json), [muestra consultada](https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/es.1.json).
- fixturedownload: [formatos ofrecidos](https://fixturedownload.com/), [condiciones de redistribución](https://fixturedownload.com/terms).

Se comprobaron códigos HTTP, JSON, recuentos e IDs únicos en las colecciones
indicadas y se contrastaron diferencias de frescura. No se midieron latencias
de actualización con muestreo temporal ni se verificaron todas las ligas.
Solo cambia documentación; verificación local con `git diff --check`.
