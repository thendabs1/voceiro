# Fuentes para contrastar el modelo — 25/10/2026

Revisión de la lista facilitada por el usuario. Son consultas puntuales y
documentación, sin adaptadores, publicación ni recogida periódica nueva.
La revisión del modelo está en [Modelo propuesto](../modelo-propuesto.md).
Los lotes de OpenCode Go se revisan aparte: [Cataluña y Madrid](05-catalunya-madrid.md)
y [FEB](06-feb.md).
La ampliación siguiente añade Core, noticias y bibliotecas de ESPN; la revisión
inicial ya había probado ATP/WTA, NBA/WNBA, NFL y la clasificación WNBA.

## Resultado y prioridad

| Fuente | Evidencia de esta revisión | Decisión propuesta |
| --- | --- | --- |
| Cultura de Galicia | Ya existe adaptador y contraste real persistido; véase el README. | Mantener como primer caso cultural. La lista de partida la presenta como pendiente, pero ese trabajo ya está hecho. |
| Cataluña | Metadatos y muestras JSON; 68.434 filas, códigos repetidos y varias localizaciones. | Contraste importante de actividad frente a celebración. Resolver identidad y repeticiones antes de importar. |
| Madrid | Catálogo y dos filas CKAN comprobados, CC BY 4.0; el almacén está activo para CSV. La ruta inicial con `/id/api/` devuelve 404. | Primera candidata cultural para el próximo adaptador de prueba; revisar identidad, reglas de días y exclusiones. |
| FEB | Páginas oficiales comprobadas: partidos, equipos, temporada, fases/grupos y tabla. | Muy pertinente por baloncesto femenino y competiciones españolas; aclarar condiciones para el uso previsto antes de elegir un recolector periódico. |
| ESPN | HTTP 200 y JSON en NBA, WNBA, clasificación WNBA, NFL, WTA y ATP. | Excelente contraste técnico de baloncesto y tenis. Las condiciones generales de Disney incluyen ESPN y restringen extracción automatizada y redistribución sin permiso; no convertir la prueba en integración periódica. |
| SportsEvents24 | Documentación actual y HTTP 200 en eventos y torneos de baloncesto español sin token. | Investigar cobertura y condiciones de redistribución; aporta ejemplos territoriales y juveniles. La lista inicial está desactualizada respecto al acceso. |
| Jolpica | HTTP 200 en muestra de calendario 2026; antes agotaba el tiempo de espera. | Vuelve a ser técnicamente comprobable, pero su licencia declarada es CC BY-NC-SA 4.0 y exige consultar uso comercial. No decidirla solo por ser gratuita. |
| OpenF1 | No se vuelve a consultar. | Se conserva el descarte previo del usuario; restricciones ya documentadas en el informe 03. |
| NHL | HTTP 200: 12 encuentros para el 24/10. | Contraste técnico; reutilización pendiente. |
| MLB | HTTP 200: un encuentro para el 24/10. La respuesta enlaza sus condiciones. | Útil para fecha oficial frente a instante UTC. Esas condiciones limitan a uso individual, no comercial y no masivo; otros usos requieren autorización. |
| TheSportsDB | Documentación primaria revisada; sin nueva descarga de datos. | No sirve como inventario completo con la clave de muestra. Además del recorte de filas, la documentación limita la búsqueda gratuita de equipos a Arsenal. |
| Chess.com | Perfil público de Hikaru recibido con JSON mediante navegador web; documentación oficial de torneos revisada. | Identidad de jugador comprobada; esto no acredita calendario de competiciones presenciales ni cobertura de torneos profesionales. |
| Lichess | HTTP 200 en `/api/tournament`, sin token. | Buen ejemplo de evento online. No se ha probado `/api/broadcast`, que debe evaluarse por separado. |
| Barcelona | El navegador de investigación no pudo abrir ficha ni metadatos CKAN del identificador facilitado. | No confirmar actualidad ni declarar el servicio caído a partir de este fallo. No seleccionar todavía. |
| Ticketmaster | Documentación oficial: clave, cuotas, eventos, recintos, atracciones y clasificación. Sin consulta autenticada. | Referencia de diseño para distinguir artista/equipo, recinto, evento y taxonomía. No requiere abrir cuenta para esta revisión. |
| OpenAgenda | Documentación oficial: lectura autenticada y licencia por agenda, habitualmente Licence Ouverte. Sin consulta autenticada. | Referencia futura para agenda, evento y lugar; la licencia debe verificarse por agenda. |
| Tennis-API | Se revisó `tennis-api.com`, que publica planes de pago; no se acreditó allí el supuesto plan gratis de 50 consultas. | La lista no identifica inequívocamente proveedor y plan. No presupuestar ni integrar con esos límites sin la referencia exacta. |

No se han reabierto consultas a FotMob ni alternativas de fútbol: se mantiene
la espera del permiso solicitado. La prueba de SportsEvents24 usa baloncesto.

Para revisar el modelo, la combinación más útil es Madrid (programación y
ocurrencias), Cataluña (varias localizaciones y repeticiones) y tenis ESPN
(torneo/cuadro/encuentro y parejas). FEB contrasta categorías españolas;
SportsEvents24 merece una revisión posterior de identidad de equipos y derechos.
Esta selección de muestras no designa todavía proveedores del producto.

## Consultas HTTP propias

Respuestas descargadas el 25/10/2026, entre 08:22 y 08:24 UTC, con timeout de
20 segundos y límite de tamaño. Se validó el JSON y se examinaron sus campos.
Las cabeceras y respuestas están temporalmente en `/tmp/voceiro-<nombre>.*`;
no se incorporan conjuntos de datos de estos proveedores al repositorio.
Los recuentos describen las respuestas, no acreditan cobertura completa.

| Nombre | Consulta | Resultado observado |
| --- | --- | --- |
| `espn-nba` | [NBA 24/10](https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261024) | 200; 8 eventos. |
| `espn-wnba` | [WNBA 24/10](https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard?dates=20261024) | 200; 1 evento. |
| `espn-wnba-tabla` | [Clasificación WNBA](https://site.api.espn.com/apis/v2/sports/basketball/wnba/standings) | 200; dos conferencias con 7 y 8 filas; `season: 2026`, `seasonType: 2`, ámbito `overall`. |
| `espn-nfl` | [NFL 25/10](https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=20261025) | 200; 12 eventos. |
| `espn-wta` | [WTA](https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard) | 200; 8 torneos, 386 encuentros anidados y 386 UID distintos. 212 encuentros con `timeValid: false`. |
| `espn-atp` | [ATP](https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard) | 200; 6 torneos, 284 encuentros anidados y 284 UID distintos. 97 con `timeValid: false`. |
| `nhl` | [NHL 24/10](https://api-web.nhle.com/v1/score/2026-10-24) | 200; 12 encuentros. |
| `mlb` | [MLB 24/10](https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-10-24) | 200; 1 encuentro; `totalGames: 1`. |
| `sportsevents24` | [Baloncesto ES, 5 eventos](https://sportsevents24.com/api/v1/events?country=ES&sport_id=2&limit=5) | 200; 5 filas y `nextCursor`; muestra júnior/cadete, masculina/femenina. |
| `sportsevents24-torneos` | [Baloncesto ES, 5 torneos](https://sportsevents24.com/api/v1/tournaments?country=ES&sport_id=2&limit=5) | 200; 5 filas y `nextCursor`; incluye fases/grupos dentro de los nombres. |
| `jolpica` | [F1 2026, una fila](https://api.jolpi.ca/ergast/f1/2026.json?limit=1) | 200; 1 carrera, `total: 23`, `limit: 1`. No se descargó la temporada completa. |
| `lichess` | [Torneos arena](https://lichess.org/api/tournament) | 200; listas `created` (112), `started` (14), `finished` (20). |

## Casos que ponen a prueba el contrato actual

### ESPN: un nombre de campo no define nuestra entidad

NBA devuelve un evento con una `competition`, que es el encuentro concreto;
la liga se identifica en otra parte. En tenis `events[]` contiene torneos,
`groupings[]` separa cuadros individuales/dobles, y `competitions[]` contiene
encuentros. No importar siempre cada elemento de `events[]` como una cita ni
traducir siempre `competition` como campeonato.

Ejemplos de la muestra:

- NBA `401909853`, UID `s:40~l:46~e:401909853`, celebrado en octubre de 2026,
  declara `season.year: 2027`. No deducir temporada del año de inicio.
- WTA torneo `345-2026`; encuentro `185593`, UID
  `s:850~l:900~e:345-2026~c:185593`, participantes tipo `athlete` y parciales
  en `linescores`. El torneo es padre, no sustituto del partido.
- WTA dobles `185608`: participantes tipo `team` con `roster.athletes`,
  GUID de integrantes y nombre de pareja. Una pareja no equivale a un club.
- WTA `185705`: `date: 2026-10-26T04:00Z`, `timeValid: false`, detalle `TBD`.
  Conservar la fecha original y la advertencia; falta acreditar incluso qué
  día representa el marcador temporal antes de degradarlo a una fecha fiable.
- `homeAway` aparece también en tenis. No convertir automáticamente a
  local/visitante deportivo ni inferir sede desde ese campo.
- Las tablas WNBA son de temporada regular (`seasonType: 2`), aunque el
  encuentro de la muestra es de postemporada (`season.type: 3`). Una tabla
  necesita su ámbito y fase propios; no heredar la fase del último partido.

Los UID distinguen deporte/liga/tipo de objeto; preservar ese espacio de
identificación. Solo se comprobó unicidad dentro de estas respuestas, no
estabilidad histórica ni equivalencia entre rutas.

### Ampliación ESPN: Core, noticias y bibliotecas

Tras la aclaración del usuario se revisó lo que todavía no se había comprobado:
perfiles Core, relaciones de noticias y las dos bibliotecas mencionadas. Cinco
consultas GET adicionales, sin autenticación, el 25/10/2026 entre 08:43 y 08:45
UTC, con timeout de 20 s y tope de 2 MB por respuesta. Todas devolvieron 200 y
JSON válido. No se ejecutaron bibliotecas ni se instaló ninguna dependencia.

| Consulta primaria | Resultado observado |
| --- | --- |
| [Core: persona WTA 11554](https://sports.core.api.espn.com/v2/sports/tennis/leagues/wta/athletes/11554) | Rinko Matsuda; UID `s:850~l:900~a:11554`, coincidente con la muestra de encuentros. Perfil y enlaces; esta respuesta no trae el objeto `statistics` que sí aparece en NBA. |
| [Core: persona NBA 3975](https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/athletes/3975) | Stephen Curry; identidad, perfil y enlaces `$ref` a equipo de temporada y estadísticas. No se siguieron esas referencias. |
| [Noticias WTA, dos artículos](https://site.api.espn.com/apis/site/v2/sports/tennis/wta/news?limit=2) | Dos artículos con ID, URL web, publicación, modificación y categorías de liga/persona/tema. Las referencias a personas coinciden con participantes de la muestra WTA. |
| [Noticias NBA, dos artículos](https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news?limit=2) | Dos previas con referencias tipadas a equipos y al evento concreto. |
| [Calendario NBA 25/10](https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261025) | Siete eventos; contiene los dos UID de partido enlazados por esas previas. |

Evidencia temporal en `/tmp/voceiro-<nombre>.json` y `.headers`, con nombres
`tenis-core-atleta`, `nba-core-atleta`, `tenis-noticias`, `nba-noticias` y
`nba-noticias-calendario`. La comprobación se limitó a estructura, metadatos,
referencias y coincidencia de UID; no al contenido editorial ni a la exactitud
de cada resultado deportivo.

Ejemplos precisos de relaciones declaradas por ESPN:

- Artículo NBA `50274638` → evento `s:40~l:46~e:401909862`; artículo
  `50274497` → `s:40~l:46~e:401909866`. Ambos destinos aparecen en el calendario
  del 25/10. No fue necesario deducir el partido desde el titular.
- Artículo WTA `50274657` → persona `s:850~l:900~a:2248`; artículo
  `50258109` → `s:850~l:900~a:3126`. Ambas personas aparecen en encuentros
  individuales de la muestra WTA anterior. Esto no acredita el enlace de
  esos artículos a un encuentro particular.
- `categories[]` mezcla entidades y temas: el ID de categoría no es el ID de
  persona. En el primer artículo WTA, `categories[].id: 131975` acompaña a
  `athleteId: 2248`. Conservar UID/tipo y campos específicos, sin convertir
  todo el array en un vocabulario temático plano. Algunos `sportId` también
  difieren del identificador de deporte en el UID; no intercambiarlos.

Esto mejora la propuesta de noticias: conservar origen de la relación
—declaración del proveedor o inferencia— separado de su revisión editorial.
Una relación explícita es evidencia de origen, no confirmación humana. Los
artículos pueden conservar ID de proveedor además de URL y alias.

**Bibliotecas revisadas en sus fuentes primarias:**

- [`espn-api`, de cwendt94](https://github.com/cwendt94/espn-api), y su
  [guía](https://github.com/cwendt94/espn-api/wiki): cliente de ligas **Fantasy**,
  con ID de liga y año; las privadas necesitan cookies de sesión. No es el
  cliente de calendarios ATP/WTA o ligas reales que necesitamos aquí.
- [`sportsdataverse` para Node.js](https://github.com/sportsdataverse/sportsdataverse-js)
  y su [referencia](https://js.sportsdataverse.org/docs/reference/): sí documenta
  clientes de datos deportivos reales, ESPN Site/Core/Web y formatos originales
  o aplanados. Las páginas revisadas no acreditan aquí un cliente ATP/WTA
  ejecutado y validado; no dar por comprobada su cobertura de tenis por la
  cobertura de otros deportes. Los recuentos de ligas/versiones difieren entre
  algunas páginas consultadas; no se usan como garantía de cobertura.

Fantasy es un ámbito distinto del calendario de competiciones reales. No se
consultó `lm-api-reads.fantasy.espn.com` ni ninguna liga privada. Tampoco se
demostraron consultas ilimitadas, un plan público garantizado, estabilidad de
estos contratos ni autorización de redistribución. Los wrappers son clientes;
su licencia de código no reemplaza las condiciones del proveedor de datos.
La [revisión de términos generales Disney/ESPN](https://disneytermsofuse.com/english/)
sigue sin resolver la autorización para la recopilación/publicación previstas.

**Consecuencia para el diseño:** conservar el original y normalizar con
adaptadores acotados; Core puede resolver identidades o enriquecerlas, sin
recorrer automáticamente cada `$ref`. No añadir una descarga por jugador,
estadística o noticia para producir una vista de calendario. Usar una
biblioteca se valorará después por cobertura real, campos conservados,
dependencias y coste de consultas.

La relectura de las muestras de tenis añadió al [diseño conjunto](../diseno-nucleo.md)
cuadros identificados en su edición, composición de parejas, seguimiento de
personas en individuales/dobles y parciales con significado propio. También
detectó `format.regulation.periods: 5` en el encuentro ATP `186982`, declarado
final con dos sets ganados: no interpretar ese campo como formato de sets sin
verificar su semántica. La respuesta no se normaliza copiando nombres de campos.

### SportsEvents24: acceso abierto no equivale a identidad completa

La [página del proveedor](https://sportsevents24.com/api) y su
[OpenAPI](https://sportsevents24.com/api/openapi.json) documentan beta anónima,
100 consultas/día/IP, 5.000 filas/mes/IP y 10 consultas/minuto. La ventana de
eventos va de 7 días pasados a 30 futuros; `to` es exclusivo. `updated_since`
filtra dentro de esa ventana y **no es un registro de eliminaciones**.

La muestra incluye evento `7358623`, torneo `139660`, equipos por nombre,
inicio UTC y local, `Europe/Madrid`, `timeZoneConfidence: null`, ubicación
textual, `result: ""`, categoría `upcoming` y modificación declarada. No
incluye IDs de equipo ni referencias al proveedor originario. La sede textual
no es un código municipal. El nombre del torneo mezcla edad, modalidad y
temporada: conservarlo sin fabricar esa jerarquía como dato confirmado.

Es una candidata interesante por cobertura territorial, con condiciones de
redistribución todavía por aclarar. No se comprobaron exhaustividad ni
frescura de marcadores. Las cuotas se comparten por IP: no asumir presupuesto
exclusivo a partir de una única respuesta de `usage`.

### Otros contrastes

- MLB `gamePk: 849802`: `officialDate: 2026-10-24` e inicio
  `2026-10-25T00:00:00Z`. Conservar ambos, sin cambiar la fecha de la competición
  al convertir la hora para el lector.
- NHL declara por separado `gameState`, `gameScheduleState`, inicio UTC,
  zona de recinto y período. No fundir todo en un estado universal sin
  preservar la semántica de origen.
- Jolpica aporta circuito identificado, coordenadas, temporada, ronda y
  sesiones bajo una carrera. Sus sesiones anidadas no traen ID propio en esta
  muestra: una identidad derivada de ronda/tipo necesitaría una regla explícita
  y comprobar qué sucede al cambiar la ronda. No enlazar automáticamente con
  los UID del ICS de Vidmar por nombre/fecha.
- Lichess aporta ID de torneo, inicio/fin en milisegundos, variante y ritmo.
  Es un evento online; no necesita municipio inventado. La ficha de un jugador
  de Chess.com, por sí sola, no demuestra un calendario.

## Documentación primaria y condiciones consultadas

- [Disney/ESPN, términos generales](https://disneytermsofuse.com/english/),
  secciones 2 y 3: restricciones de reproducción, extracción automatizada y uso.
  No se ha localizado un contrato específico que autorice estos endpoints
  para la recopilación pública propuesta.
- [MLB: condiciones enlazadas por la propia respuesta](https://gdx.mlb.com/components/copyright.txt).
- [Jolpica: condiciones](https://raw.githubusercontent.com/jolpica/jolpica-f1/main/TERMS.md)
  y [límites](https://github.com/jolpica/jolpica-f1/blob/main/docs/rate_limits.md):
  CC BY-NC-SA 4.0, uso no comercial y límites publicados de 4/s y 500/h.
- [TheSportsDB: límites por método y clave de muestra](https://www.thesportsdb.com/docs/api).
- [Chess.com: API pública](https://www.chess.com/news/view/published-data-api)
  y [perfil comprobado](https://api.chess.com/pub/player/hikaru).
- [Lichess: documentación primaria](https://lichess.org/api) y
  [especificación mantenida por el proyecto](https://raw.githubusercontent.com/lichess-org/api/master/doc/specs/lichess-api.yaml).
  La licencia del código/especificación no se traslada automáticamente a
  todos los contenidos de una retransmisión.
- [Ticketmaster Discovery](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/):
  publica 5.000 consultas/día, 5/s y límite de paginación profunda. No se ha
  probado una clave ni cerrado la revisión de sus condiciones de almacenamiento.
- [OpenAgenda: API y licencias por agenda](https://developers.openagenda.com/).
- [Tennis-api.com: planes publicados](https://tennis-api.com/api-pricing/).

Las condiciones se anotan para decidir qué integración tiene sentido; no
se deduce una autorización de republicación por recibir HTTP 200.

## Verificación

Consultas acotadas, validación de JSON, recuentos, UID, estructura anidada,
señales de precisión y comparación con el contrato actual. Sin medición de
latencia, seguimiento entre pasadas ni validación deportiva con organizadores.
No se han añadido importadores ni ejecutado tests de código por esta revisión
documental; la suite completa corresponde a CI cuando haya implementación.
