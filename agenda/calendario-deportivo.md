# Calendario deportivo: diseño por deporte y proveedor

26/10/2026. Alcance confirmado con el usuario: ATP/WTA, Primera y Segunda
españolas, NBA/WNBA, LF Endesa, Primera FEB, LF Challenge, F1, MotoGP y WRC.
Son doce colecciones de agenda. Tenis empieza **solo por torneos**. Este diseño
sustituye el borrador de resultados diferidos y desarrolla la
[decisión de almacenamiento](revision-almacenamiento-deportivo.md).

Estado: diseño para implementar por incrementos; no incorpora módulos, cambia
importadores, consume la clave OCB ni activa recogidas. El calendario del cliente
sigue desactivado hasta conectar y comprobar la lectura de nuestra API.

## Flujo y contrato común

```text
Proveedor → recogida de servidor → adaptador de agenda → núcleo común en Turso
                                                               ↓
Cultura y otras citas ───────────────────────────────→ API de agenda → front
```

Una búsqueda de agenda consulta nuestra API. Las futuras consultas deportivas
al proveedor tienen otro recorrido y no son requisito de este calendario.
OCBlacktop se integra desde nuestro servidor. El usuario decidirá después
si añade un Worker para consultas externas desde el front.

Reutilizar entidades, referencias y participaciones de `nucleo.py`, el contrato
de `tiempos.py` y la [lectura preparada](api-lectura.md). No crear otra base,
catálogo de equipos ni API de agenda exclusivamente deportiva.

| Pieza | Contenido de agenda |
| --- | --- |
| Identidad | Referencia externa contextualizada e ID interno estable. La fecha y el nombre no forman la identidad. Conservar las referencias existentes. |
| Organización | Competición o circuito, edición/temporada y fase o GP cuando consten. Una temporada organiza citas; no se expande en eventos diarios. |
| Cita | Nombre, clase, tema deportivo, pertenencia y enlace de origen. La unidad depende del deporte. |
| Tiempo | Extremos independientes, fecha civil, instante con offset cuando conste, precisión, certeza y significado del fin. No fabricar medianoches, duraciones ni zonas. |
| Participantes | Equipos con ID/nombre y papel cuando identifiquen un partido. No se necesitan para importar un torneo, rally o sesión. |
| Lugar | Referencia y literal presentes en el calendario. Sin descargar fichas ni geocodificar en esta fase. El país de la competición no sitúa sus citas. |
| Programación | Nueva fecha/hora, aplazamiento o cancelación acreditados. `ejecucion` queda desconocida; sin estado deportivo en curso/final. |
| Procedencia | Fuente, colección, evidencia de agenda y comprobación. La antigüedad y cobertura pertenecen a la colección. |

No recoger resultados, ganadores, parciales, clasificaciones, inscritos,
plantillas ni estadísticas. Tampoco conservarlos dentro de documentos originales:
el adaptador selecciona campos de agenda **antes** de persistir la evidencia.
Las tablas existentes de resultados no se eliminan ni se reinterpretan.

Conservar un fragmento por cita y otro por agrupación con el contexto mínimo.
Así, cambiar un horario no genera observaciones para todos los partidos.
La URL concreta de descarga por fecha pertenece al control de recogida; no
debe alterar la huella de una misma cita al consultarla otro día. El enlace
estable al evento sí se conserva. Revalidar sin cambios actualiza comprobación,
sin otra versión de contenido. Requiere adaptar el uso actual de
`Constructor.documento` y `entidad`; los importadores aún no lo garantizan.

## ESPN: qué se comparte

Proponer `agenda/espn.py` como entrada común pequeña, con adaptadores
`espn_tenis.py`, `espn_futbol.py`, `espn_baloncesto.py` y, si se adopta, `espn_f1.py`.
No hace falta un sistema de plugins ni una biblioteca de Fantasy.

| Colección | Ruta Site API bajo `/apis/site/v2/sports/` | Unidad |
| --- | --- | --- |
| ATP / WTA | `tennis/atp/scoreboard`, `tennis/wta/scoreboard` | Torneo en `events[]`; ignorar encuentros anidados. |
| Primera / Segunda | `soccer/esp.1/scoreboard`, `soccer/esp.2/scoreboard` | Partido en `events[]`, contrastando su `competition`. |
| NBA / WNBA | `basketball/nba/scoreboard`, `basketball/wnba/scoreboard` | Partido en `events[]`, contrastando su `competition`. |
| F1, alternativa | `racing/f1/scoreboard` | GP en `events[]`; sesiones en `competitions[]`. |

La evidencia actual incluye ATP/WTA, NBA/WNBA, Primera y F1; Segunda necesita
su propio contraste de respuesta, fechas, temporada y errores antes de importarse.
El registro de colecciones y la cobertura comprobada son cosas distintas.

La parte común se encarga de:

- Registro explícito: ruta, adaptador, selección de temporada, unidad de consulta
  y presupuesto. No descubrir e importar todas las ligas.
- GET acotado reutilizando `recogida.descargar`, con fecha explícita cuando la
  ruta la admite. Validar JSON, lista de eventos y liga/circuito coincidente.
- Separar petición por colección/fecha de identidad. Mantener `espn-atp`/
  `espn-wta` y sus referencias. En fuentes nuevas, conservar UID completos y
  compartir equipos entre ligas del mismo deporte cuando su UID lo acredite.
- Planificar fechas, deduplicar UID y comprobar límites, páginas o indicios de
  truncado. Un array `events` válido no acredita cobertura completa. No seguir
  referencias internas `espn.pvt` ni descargar perfiles para obtener citas.
- Comunicar selección comprobada, errores y consumo al control común. Respetar
  `Retry-After`, detener 401/403 y enfriar 429; sin reintentos por visitante.

El adaptador decide entidades, tiempos y programación. No se comparte una
traducción universal de `competition`, `status`, `homeAway` o `calendar`.
No guardar `status` completo: incluye reloj y periodo. Un cambio exclusivo
entre estados deportivos no debe cambiar la agenda; aplazamiento y cancelación
sí tendrán correspondencias explícitas por fuente.

Los intervalos de fechas ensayados en NBA y fútbol devolvieron 400: presupuestar
consultas por fecha hasta probar otra vía. `leagues[].calendar` suele enumerar
días; F1 entrega entradas de GP. Sirve para planificar, no equivale a una lista
completa de citas. Un vacío no acredita fin de temporada.

## Tenis: una cita por torneo y circuito

Conservar la agrupación de edición identificada por `tournament_uid` y su
relación con ATP/WTA. Añadir una cita `actividad_continua`, vinculada a la
edición, con referencia de agenda distinta: el UID existente no cambia de
agrupación a evento. No producir dos tarjetas para la misma edición.

Seleccionar UID/ID, nombre, temporada declarada, fechas de torneo, metadatos
temporales necesarios, sede literal y enlace. Excluir `groupings`, partidos,
cuadros, `previousWinners` y jugadores, aunque vengan descargados.

Validar los días y la semántica del fin. Las respuestas completas retenidas
traen `calendar.timeZone: America/New_York`: sus medianoches no son horas de
comienzo del torneo ni acreditan la zona del recinto. `date`, `endDate` y
`calendar.endDate` no se sustituyen entre sí sin contraste. No calcular el
intervalo desde los partidos. Si no está acreditado, conservar fechas pendientes,
sin anunciar cobertura temporal. La zona del proveedor no prueba que su
calendario incluya todas las jornadas o la fase previa.

Una respuesta solo acredita los torneos devueltos; hay que probar la recuperación
del horizonte elegido antes de prometer la temporada completa. Un muestreo
semanal no queda acreditado por las consultas actuales. ATP/WTA conservan sus
referencias: mismo nombre, recinto o semana no permite fusionar torneos.

**Cambio necesario:** entrada de agenda en `espn_tenis.py` que no recorra
encuentros. El importador actual crea ediciones, cuadros, partidos y resultados;
ocultar partidos no crea citas de torneos.

## Fútbol: Primera y Segunda

- Cita `encuentro` con UID de evento, equipos mínimos y papeles local/visitante
  acreditados. Si falta identidad, conservar literal; sin equipo permanente
  «TBD» ni cruces de eliminatoria fabricados.
- Competición y edición desde liga/temporada declaradas. Jornada, fase y sede
  neutral solo si constan. Compartir el equipo entre ligas si coincide su UID.
- Contrastar `event.date`, `competition.date`/`startDate` y `timeValid`.
  Una hora no válida no acredita automáticamente un día confirmado. Resolver
  discrepancias o dejarlas pendientes, sin elegir un campo por su posición.
- Conservar cambios de agenda declarados; excluir goles, minuto, alineaciones,
  penaltis y datos de eliminatoria como resultados encubiertos.
- Recoger por competición/fecha y horizonte comprobado, sin consulta por equipo.

**Cambio necesario:** `espn_futbol.py` y contraste específico de Segunda.
No reabrir FotMob ni ampliar a Liga F o regionales por cobertura anunciada.

## Baloncesto ESPN: NBA y WNBA

Reutilizar la estructura de partido y equipos del fútbol, con adaptador propio
para temporada, fase y programación; no reutilizar métricas.

- La muestra NBA de noviembre de 2026 declara temporada 2027. Guardar esa
  edición y etiqueta `2026-27`, sin asignarla por el año de la fecha.
- Separar pretemporada, liga y eliminatorias cuando se identifiquen. Sin cruces
  anunciados no se generan todos los playoffs.
- Conservar el instante acreditado. Día del proveedor, día UTC y día mostrado
  en Madrid pueden diferir: selección consultada y fecha de evento son distintas.
- Excluir tanteo, cuartos, prórrogas, balances, líderes y tablas; sin plantillas.
- WNBA fuera de temporada conserva su selección comprobada sin citas; no
  sustituirla por NBA ni presentar encuentros antiguos como próximos.

**Cambio necesario:** `espn_baloncesto.py`. Compartir ayudantes de identidad y
enlaces con fútbol; comprobar sus reglas temporales y estados por separado.

## FEB: tres ligas y datos mínimos

LF Endesa (`4`), Primera FEB (`1`) y LF Challenge (`67`) son tres colecciones.
Reutilizar `feb_html.py` y `feb.py`, conservando competición, temporada inicial
explícita, fase contextualizada, ID de partido y equipos local/visitante.

- El calendario general sustituye horarios por marcadores en partidos jugados.
  Su ausencia posterior no debe borrar un horario previamente acreditado.
- La vista de resultados puede aportar fechas de ciertas jornadas: puede usarse
  como **fuente de agenda**, descartando tanteos y clasificación antes de
  persistir evidencia. Su nombre no obliga a guardar todo su contenido.
- No usar la fecha genérica de jornada como día de todos sus partidos. Conservar
  hora local sin UTC hasta acreditar zona; no aplicar `Europe/Madrid` a todas
  las sedes, incluidas las canarias.
- Guardar ID/nombre de equipos y pista literal si consta; sin consultar fichas
  de partido, equipo, plantilla o sede para enriquecer.
- Dos páginas por liga contrastan una fase seleccionada, no todas las anunciadas.
  Un cambio de selector/estructura conserva la última agenda válida.

**Cambio necesario:** extracción y persistencia de agenda explícitas. El modo
actual guarda la muestra completa y crea resultados/tablas; mantener su capacidad
de investigación separada y evitar usarla por defecto en recogidas de agenda.
Ver [alcance FEB](feb-alcance.md).

## F1: sesiones y una fuente principal

Vidmar sigue siendo la integración existente. Conservar UID ICS, horarios,
fechas sin hora y cancelaciones declaradas. No reconstruir GP/temporada/circuito
desde patrones de UID o títulos sin evidencia.

ESPN es candidato a competición → edición → GP como agrupación → sesiones
`sesion`. Conservar UID de GP/sesión, tipo original de sesión, comienzo
acreditado y circuito literal/ID. Entrenamientos, clasificación, sprint y carrera
son sesiones, sin necesidad de pilotos, escuderías o tablas deportivas.

El núcleo no tiene clase de agrupación `gran_premio`: proponer ese término
mínimo al validar el adaptador, sin convertirlo silenciosamente en `fase`.
La presentación principal y su programa se concretan en la propuesta posterior
común a F1/MotoGP; requieren adaptar proyección/UI, sin fabricar horarios.

**Cambio necesario:** contrastar paridad Vidmar/ESPN y elegir principal antes
de publicar ESPN. Referencias separadas hasta acreditar correspondencias; sin
cambio automático por error ni duplicación pública. No se necesita OCB para
resolver esta primera decisión.

## MotoGP: programa oficial y OCB como alternativa

- Primera opción: servicio del calendario oficial. Seleccionar GP de temporada
  declarada y sesiones `type=SESSION`, categoría MotoGP. Excluir emisiones,
  entrevistas, Moto2/Moto3 y tests de este alcance.
- Conservar UUID GP/sesión, agrupación `gran_premio`, tipo, fechas/instantes
  con offset y circuito literal/ID. No exige inscritos.
- La temporada puede cruzar años civiles. `show_in_calendar=false` no cancela
  ni elimina; `has_results` no es resultado ni fecha de finalización.
- Sprint/carrera pueden traer fin igual al comienzo: según la regla contrastada,
  queda desconocido, sin duración cero. Validar zona nominal conservando offset.

**Cambio necesario:** `motogp.py`, contraste de acceso desde nuestro servidor y
selección de GP/programa. El 403 previo con origen Voceiro y el éxito sin él no
equivalen a una integración operativa. Si hace falta adoptar OCB, resolver antes
su temporada por UUID y cobertura; los IDs de ambas fuentes no son equivalentes.
No sondear ambas para rellenar huecos ni cambiar de fuente automáticamente.

### Presentación de grandes premios: propuesta para revisar

Propuesta planteada al usuario: una cita principal de varios días con las
sesiones dentro. Permite mostrar un GP desde que se conocen sus fechas, antes
de publicar sus horas. Si se adopta, concreta el modelo anterior así:

- Mantener la agrupación GP para identidad, temporada y pertenencias. Añadir
  una cita principal `actividad_continua` con referencia distinta y su intervalo
  acreditado, igual que la separación edición/cita de tenis.
- Las sesiones conservan citas e IDs propios en esa agrupación. La lectura
  distingue principal y desglose: una tarjeta de GP en la agenda normal y
  programa de sesiones en detalle. No devolver ambas como tarjetas duplicadas.
- Esa selección debe aplicarse antes de conteos y paginación. Al buscar una
  sesión, permitir llegar al GP y su sesión coincidente, sin perder identidad.
  Es una ampliación pendiente de la proyección/API, no solo un ajuste de HTML.
- Vidmar no aporta la identidad separada de GP: sus sesiones existentes no
  permiten generar automáticamente esas citas principales. Acreditar una
  fuente estructurada y correspondencias antes de ofrecer esta presentación.

La consulta sobre esta presentación no altera el alcance confirmado de deportes
ni autoriza deducir fechas del GP desde sus sesiones.

## WRC y OCBlacktop desde nuestro servidor

Primera integración OCB: calendario WRC por temporada explícita.
`/v1/wrc/seasons/2026` devolvió temporada y catorce rallies, evitando recorrer
las seis páginas del catálogo histórico.

- `blacktop.py` obtiene la respuesta con `x-api-key` y valida deporte/temporada.
  `OCBLACKTOP_API_KEY` permanece en servidor, sin URL, front, fixtures ni logs.
- Rally como cita `actividad_continua` con UUID, nombre e intervalo, vinculado
  a WRC y edición. Ronda y lugar literal si constan; sin cita por día o tramo.
- Validar carácter inclusivo de `dateEnd` antes de indexar. Sin convertir fechas
  a UTC ni `completed` en estado de agenda, resultado o ganador.
- Seleccionar `id`, `year`, `sportId` y agenda de rallies. Excluir pilotos,
  copilotos, clasificación, fabricantes, tiempos y directo.
- Validar la temporada en conjunto; sin recorrer históricos ni detalles de rally.

La [documentación OCB](https://ocblacktop.com/api) confirma en Free llamadas de
servidor, 7.500 peticiones/mes y 60/minuto; el sondeo previo contrastó cabeceras.
El techo del plan no es nuestro presupuesto. Registrar peticiones y cuota
restante, sin depender solo de un contador en memoria. La
[ruta de temporada WRC](https://ocblacktop.com/api/wrc) permite carga inicial y
revalidaciones, sin consultar un resultado al terminar cada rally.

El transporte OCB podrá servir a F1/MotoGP después, pero sus selectores no son
intercambiables: MotoGP rechazó el año donde esperaba UUID. No crear ahora un
proxy genérico. Las futuras consultas desde el front tendrán rutas/presupuesto
propios y caché compartida, sin persistencia automática y con clave en servidor.

## Cobertura y revisión

Control común por proveedor/colección/temporada y selección: intento, última
respuesta válida, unidades solicitadas/completadas, incidencias, próxima revisión
y consumo. Registrar días/intervalos comprobados: mínimo/máximo no cubre huecos.
Una selección parcial no sustituye la última completa publicada. Desaparecer
de una respuesta no cancela ni elimina una cita.

| Colecciones | Plan de recogida que hay que validar |
| --- | --- |
| Primera, Segunda, NBA, WNBA | Horizonte por fechas, empezando por próximas. Sin consulta masiva acreditada, coste inicial = fechas × ligas, más revisiones. |
| ATP/WTA | Descubrir torneos del horizonte con fechas contrastadas; sin presumir calendario anual ni muestreo semanal completo. |
| FEB | Liga/temporada/fase y revisión de horarios, sin detalles. Contar la vista adicional que aporte fechas. |
| F1 | Un ICS completo en Vidmar; el eventual ESPN planifica GP/sesiones, sin sondeo por piloto. |
| MotoGP | Temporada y programa por GP si el listado no lo incluye; medir ambas clases de petición. |
| WRC/OCB | Respuesta de temporada y revalidaciones, sin detalles/resultados por rally. |

No fijar la misma cadencia: calendario lejano, próxima jornada y programa
pendiente tienen prioridades distintas. Una hora confirmada también cambia;
mostrar antigüedad sin prometer directo. No añadir pasadas al terminar partidos
para capturar marcadores. Fijar ventanas/frecuencias tras medir una pasada,
sin tomar las cuotas anunciadas como disponibilidad ilimitada.

Revalidar debe costar menos que guardar otra versión. El almacén reconstruye
núcleo y proyección; medir y acotar ese trabajo antes de multiplicar pasadas.
Acordar retención por separado: el informe actual no poda deportes.

## Lectura común con cultura

Reutilizar fechas, texto, objetivos, temas y paginación de nuestra API. Una
consulta general mezcla las citas; `temas=deportes` reúne sus descendientes.
Competición, temporada y equipo son objetivos, no temas ni rutas separadas.
ATP/WTA, fútbol, baloncesto y F1/WRC usan los temas existentes; MotoGP requiere
añadir `motociclismo` bajo Deportes. Ampliar los atajos del parser al conectarlos:
tener un tema en el catálogo no significa que su prefijo esté implementado.

La tarjeta muestra cita, fecha/precisión, competición, fuente y antigüedad.
El detalle incorpora procedencia, participantes mínimos y, si se adopta la
propuesta de motor, programa de sesiones. Resultados no rellenan tarjetas ni
reordenan la agenda. La cobertura se comunica por colección, separando vacío
comprobado, ventana incompleta y datos antiguos. Los metadatos actuales solo
acreditan antigüedad por fuente; este control por colección sigue pendiente.

## Orden de implementación y aceptación

1. Separar agenda de resultados en FEB/tenis y acotar evidencia. Registrar las
   doce colecciones sin activarlas automáticamente.
2. Compartir transporte/planificación ESPN; fútbol y baloncesto, contrastando
   Segunda, y citas de torneo con intervalo validado.
3. Incorporar WRC por OCB en servidor y validar respuesta de temporada.
4. Resolver principal F1 y MotoGP: GP/sesiones, acceso y correspondencias.
5. Completar cobertura/coste, proyección y lectura paginada con cultura;
   conectar cliente y reactivar solo colecciones comprobadas.

Cada incremento debe dejar un recorrido local de entrada a lectura antes de
programar red. Pruebas necesarias al implementar:

- Mismo ID y nueva hora: mismo evento, nueva programación. Marcador, ganador
  o reloj distintos: ningún documento ni versión de agenda adicionales;
  solo comprobación. Cero resultados/clasificaciones nuevos.
- Torneos con/sin intervalo acreditado, sin jugadores/partidos; temporadas
  entre años, offsets, horas pendientes y fines dudosos.
- Equipos compartidos donde el UID lo acredite, plazas sin ID y sedes neutrales;
  sin situar partidos por domicilio del equipo.
- GP/sesiones sin duplicación; alternativas sin fusión implícita.
- Respuesta truncada, vacía inesperada o error: última lectura válida,
  cobertura sin ampliar y presupuesto respetado.
- Persistir/consultar una muestra con cultura por fechas, texto, objetivos y
  paginación, sin descargar todo el calendario ni llamar al proveedor.

## Verificación del diseño

Revisión de núcleo, importadores, CLI, publicación y lectura; contraste de campos
con muestras y respuestas retenidas de ESPN, MotoGP y OCB. Consulta de
documentación pública OCB, sin nuevos GET autenticados ni escrituras Turso.
Referencias: [revisión de almacenamiento](revision-almacenamiento-deportivo.md)
y [contraste multideporte](investigacion/07-multideporte-y-seleccion.md).

Este cambio documenta el diseño. La verificación local cubre diff y enlaces;
las pruebas de aceptación anteriores corresponden a la futura implementación.
La suite completa se ejecuta en CI.
