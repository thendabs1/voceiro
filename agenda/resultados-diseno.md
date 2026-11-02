# Resultados deportivos: UI común y alcance de la recogida

## Decisión de esta entrega

Primero la presentación, con las consultas actuales: tablas compactas, grupos
visibles juntos cuando caben y selector en una columna, columnas de fútbol
en una sola tabla y parrilla común de marcadores. La ampliación prioritaria
ahora es estudiar una ficha puntual de partido y las jornadas/periodos,
manteniendo las consultas a ESPN con caché. No se plantea crear una base de
resultados ni activar crons para esta ampliación.

Las opciones de recogida, cierre y persistencia descritas más abajo quedan
como estudio de una posible ampliación futura, fuera del alcance actual.

Validación local: once pruebas del panel, construcción y sintaxis del frontend;
revisión en Chromium de clasificaciones NBA, Primera y F1 y resultados NBA a
320, 390 y 1440 px, sin desbordamiento horizontal ni peticiones a proveedores.
La suite completa se ejecuta en el workflow Tests de la PR.

## Base existente comprobada

- `front/app/14-consultas.js` y `workers/deno-buscar/src/consultas/` sirven
  resultados y clasificaciones de Primera, Segunda, NBA y WNBA; F1 solo tiene
  clasificación en esta vía. Se consulta sin fechas. La ampliación de partido
  conserva la identidad del encuentro y diferencia aplazados, cancelados,
  retrasados, suspendidos y estados desconocidos.
- La caché puntual dura 60 segundos si hay encuentros en juego; resultados
  sin directo, una hora; clasificación sin directo, quince minutos. La clave
  incluye idioma e identidad, pero no periodo. No hay refresco periódico del front.
- `agenda/nucleo.py` ya admite resultados finales, provisionales y rectificados,
  participaciones, parciales y clasificaciones por ámbito. No hace falta diseñar
  todo de nuevo: faltan contratos de recogida y lectura para este uso.
- El núcleo remoto se conserva por fuente en R2 privado con objetos por huella;
  Turso confirma su manifiesto y guarda control y lectura. La publicación ya
  prepara proyecciones públicas y aplica cambios por componente.
- `agenda/temporadas.py`, `control.py` y `operacion.py` ya tienen presupuestos,
  reservas antes de la red, próximas revisiones, reintentos y control de escritores.
  El workflow actual despierta a las 04:30 UTC; su ejecución diaria no permite
  prometer resultados poco después del final.
- La recogida automática vigente importa **agenda** y recorta marcadores y
  clasificaciones. Su ampliación debe ser explícita, sin arrastrar otros datos
  del proveedor a la agenda ni activar automáticamente adaptadores de muestras.

## Qué interesa y qué está acreditado

| Familia | Primera lectura útil | Evidencia disponible | Pendiente antes de ampliar |
| --- | --- | --- | --- |
| Fútbol | Rival, marcador, estado, fecha y competición; jornada cuando conste | Muestras ESPN con ID, inicio, participantes y estado; consultas actuales de marcador y tabla | Identidad estable de jornada/fase/temporada y cobertura de aplazados, prórroga y penaltis. La muestra de scoreboard no acredita una jornada utilizable. |
| Baloncesto | Marcador, estado, fecha, conferencia y balance; cuartos como detalle | Consultas NBA/WNBA; adaptador FEB de investigación con puntos y cuartos | Contrastar estados finales y prórrogas por proveedor. FEB conserva condición desconocida: tener tanteo no confirma final. |
| Tenis | Torneo/cuadro/ronda, rivales, sets y estado | Adaptador ESPN de investigación con encuentros, cuadros, personas/parejas, sets y desempates de finales contrastados | Cobertura y costes reales; retiradas, incomparecencias y superdesempates. El flujo activo solo recoge torneos. |
| Motor | Clasificación de campeonato y, después, resultado de sesión/carrera | Clasificación F1 actual; agenda con GP y sesiones | Fuente y cobertura del resultado de cada sesión, sanciones, tiempos y diferencias. No basta el modelo local/visitante. |

La existencia de campos en una muestra no garantiza cobertura de toda una
temporada ni estabilidad del endpoint. Los detalles deportivos se incorporarán
solo tras contrastar datos y utilidad. No se propone importar estadísticas de
jugadores, plantillas, jugadas o historiales completos.

## Recogida propuesta, aún sin activar

```text
agenda y cambios de horario → plan de consultas pendientes
                                    ↓
        proveedor + competición + fecha/recurso (consultas agrupadas)
                                    ↓
                  validar identidad, estado y completitud
                                    ↓
        resultado normalizado + última comprobación + próxima revisión
                                    ↓
        publicar lectura por competición/periodo y revisión → caché → front
```

Un cron periódico despierta el planificador; este ejecuta solo recursos vencidos.
No hace falta crear un cron por partido ni consultar el detalle de todos: una
respuesta diaria de competición puede resolver varios pendientes. Compartirla
con la recogida de agenda cuando sea posible, sin acoplar sus cadencias ni sus
revisiones de contenido. La persistencia evita multiplicar consultas al proveedor
por lector, pero habrá que cachear la lectura pública para no trasladar esa
multiplicación a SQL.

Como posible ampliación posterior, el piloto de recogida programada sería
**pospartido, sin directo**: empezar por fútbol y NBA, con una demora objetivo
por decidir. Esto no sustituiría las consultas puntuales con encuentros en juego.
Una estimación de duración solo agenda
un intento; jamás acredita que terminó. Tras la primera consulta, los estados
en curso o desconocidos se reprograman con espera creciente y límite de intentos.
Aplazados, cancelados, interrumpidos y horarios desconocidos tienen tratamiento
propio y revisión menos frecuente; no se persiguen como finales pendientes.
Si una respuesta omite un partido, no se borra ni se considera terminado.

## Cierre y caché

Separar tres cosas: el estado deportivo declarado, la última comprobación y la
decisión operativa de dejar de sondear. Un final confirmado puede tener correcciones.
Propuesta para contrastar: comprobación tras el final esperado, reconciliación al
día siguiente y cierre operativo tras una ventana configurable. La duración de
esa ventana queda pendiente de medir; no es una garantía del proveedor.

Solo una **versión** del resultado sería inmutable. El acceso al resultado
vigente apunta a la última versión y permite rectificaciones. Reutilizar huellas
y publicación diferencial para no escribir lo que no cambió. Distinguir también
«sin cambios» de «no se pudo comprobar»; un fallo conserva la última lectura buena
y su antigüedad visible. No añadir por defecto un archivo perpetuo de revisiones:
hay que decidir retención y necesidades reales antes.

Una jornada reúne encuentros por identidad del proveedor, no por estar entre
viernes y lunes. Puede estar completa a falta de un aplazado, recibir una
rectificación o tener partidos movidos de fecha. Las clasificaciones son
instantáneas oficiales con fecha de corte; no reconstruirlas sumando marcadores
ni identificarlas con la jornada más alta observada.

## Fechas y horarios

Conservar por separado: instante UTC si está acreditado, zona IANA cuando conste,
fecha deportiva del proveedor y fecha local del lector. Las claves de consulta y
de caché tienen que definir cuál usan. Usar días civiles con cambio de horario,
sin suponer que todos duran 24 horas. Si se agregan varias respuestas, deduplicar
por ID estable, no por rivales, nombre o fecha; conservar cambios de horario.
No inventar un fin ni una zona para encuentros sin hora.

Las lecturas públicas realizadas durante el diseño confirmaron consultas por
día de Primera y NBA. Un día NBA incluyó dos fechas civiles en Madrid. Los
intentos de consultar viernes–lunes como rango devolvieron error: para estimar
costes se cuenta por día hasta contrastar una alternativa; no afirmar que el
proveedor nunca admite rangos.

## Coste y decisiones antes del piloto

El coste de origen depende de **recursos distintos × revisiones**, no de partidos
ni de lectores. Ejemplo ilustrativo, no medición: cuatro tandas de consulta para
un mismo día de competición son cuatro GET aunque resuelvan diez encuentros;
añadir otra fecha puede duplicarlos. Reconciliación, paginación, errores y
clasificación se suman. El número de GET tampoco equivale al número de escrituras
SQL ni a un importe monetario.

El control de agenda parte de 32 peticiones por pasada y 64 por día/proveedor.
El workflow estima 42 para tres colecciones por fecha durante catorce días.
La vía puntual aplica otro límite de 1000 por instancia/día, no global. Antes del
piloto hay que unificar contabilidad o reservar presupuestos explícitos; no
añadir resultados suponiendo capacidad libre ni elevar límites a ciegas.

Antes de cambiar el modelo se deben cerrar:

1. Competiciones del piloto y demora aceptable tras un partido; no prometer directo.
2. Qué campos y estados ofrece de forma fiable cada recurso, con una muestra
   acotada que incluya jornada, aplazamiento, prórroga y corrección cuando existan.
3. Granularidad, límite diario y recuperación de consultas perdidas; frecuencia
   del cron compatible con esa demora. Usar reservas o arrendamientos para que
   dos ejecuciones no recojan a la vez el mismo recurso.
4. Retención (periodo reciente o temporada), reconciliación y cierre operativo.
5. Contrato de lectura común: identidad, periodo explícito, grupos, fecha de corte,
   antigüedad y completitud. SQL por API y/o fragmentos en R2 según tamaño y consultas.
6. Separación entre revisiones de agenda y de resultados para que un tanteo no
   reescriba calendario, facetas y resúmenes innecesariamente.

Validación futura en CI: UTC y zonas con cambios de hora, madrugada NBA,
aplazados y reprogramaciones, final provisional/rectificado, partidos ausentes,
duplicación entre días, fallos parciales, concurrencia, presupuesto agotado,
caché por periodo y correcciones tras el cierre.

## Revisión tras los comentarios: consultas con caché y ficha de partido

Mantener la separación actual: citas para el calendario; resultados y
clasificaciones mediante consultas puntuales a ESPN con caché. No hay una
necesidad acreditada para añadir una base de resultados ni recogida programada.
La persistencia solo se reconsideraría si aparece una necesidad concreta que
la caché no cubra.

Ahora una petición que encuentra datos vigentes reutiliza la caché; cuando
faltan o caducan, el worker consulta ESPN y guarda la respuesta normalizada.
Los encuentros en juego tienen una caducidad de 60 segundos; el panel no los
actualiza automáticamente. Ampliar a fechas o partidos exige incluir ese ámbito
en las claves y revisar la frescura por estado, sin cambiar por ello el núcleo.

### Datos contrastados para una ficha de partido

El recurso `summary?event=ID` devuelve detalle de un partido. Se comprobaron
encuentros finalizados de Primera, Segunda, NBA y WNBA; las muestras seleccionadas
están en `tests/consultas/muestras/espn-partido-*.json`. Acreditan campos presentes,
no cobertura completa de ligas ni de estados previos o en juego.

| Capa | Primera: partido 401882817 | NBA: partido 401909903 |
| --- | --- | --- |
| Cabecera común | Identidad, equipos, marcador, fecha, temporada y estado | Los mismos campos |
| Lugar | Estadio y asistencia | Pabellón, asistencia y árbitros |
| Desarrollo | Goles con participantes y minuto, tarjetas y sustituciones en `keyEvents` | Parciales por cuarto en `header.competitions[].competitors[].linescores`; jugadas en `plays` |
| Equipos | Posesión, tiros, tiros a puerta, córners, faltas y tarjetas en `boxscore.teams` | Tiros de campo, triples, libres, rebotes, asistencias y pérdidas en `boxscore.teams` |
| Jugadores | Titulares, suplentes, posiciones y cambios en `rosters` | Titulares y estadísticas individuales en `boxscore.players`; destacados en `leaders` |

Fuentes comprobadas:
[resumen de Primera](https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/summary?event=401882817)
y [resumen NBA](https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401909903).
También se contrastaron
[Segunda](https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/summary?event=401883124)
y [WNBA](https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/summary?event=401918311).

La ficha implementada tiene cabecera común con marcador, estado, hora y lugar;
estadísticas comparadas; goles, tarjetas y cambios en fútbol; parciales y
destacados en baloncesto. Alineaciones y tablas de jugadores van plegadas.
Solo se muestran los bloques con información utilizable.

Se abre desde una tarjeta de resultados; «Volver a resultados» recupera la
parrilla y el foco sin consultar de nuevo. Otra entrada es `partido:primera`,
`partido:segunda`, `partido:nba` o `partido:wnba`: devuelve los encuentros de la
respuesta actual para elegir uno. `partido:primera/401882817` abre directamente
un partido identificado. Hay acceso desde el menú de cada competición.
Se conserva el mismo ID entre lista, ficha y caché. Esto amplía el contrato de
consulta, sin cambiar el almacenamiento de agenda. Buscar por nombres de rivales
y fecha seguiría necesitando resolver la identidad y no está incluido.

El detalle se pide solo al abrirlo, con caché por competición, ID e idioma:
60 segundos en juego, una hora finalizado y quince minutos en otros estados.
La ausencia o caducidad de la caché requiere un GET a `summary`; abrir una parrilla
no descarga los detalles. Dentro de una instancia, solicitudes concurrentes
de la misma consulta comparten la petición. Los fallos no se cachean y una
actualización fallida conserva la ficha anterior en el panel.
Los JSON completos examinados ocupan aproximadamente 389 kB (fútbol) y 461 kB
(NBA), sin comprimir: el worker debe devolver solo los campos elegidos para la
ficha. La política de actualización debe permitir correcciones de finales.

### Jornadas y periodos

Siguen siendo útiles para encontrar el lunes los partidos del fin de semana.
No requieren por sí mismos una base de resultados: primero acreditar cómo
consultarlos e identificarlos en el proveedor, después cachear por ese ámbito.

Las muestras guardadas de `scoreboard` de Primera no contienen una jornada
acreditada. Tampoco se identificó en el resumen Site ni en el evento Core de
`401882817`, consultados en esta revisión. Core enlaza temporada y tipo de
temporada, pero la colección `seasons/2026/types/1/weeks` de Primera devuelve
`count: 0`. Esto no descarta otros recursos con jornadas. Falta contrastar un
índice de pertenencia a jornada, su cobertura en Primera/Segunda y los aplazados.
Un rango viernes–lunes es una vista por fechas y no equivale a una jornada oficial.

Queda preparada la identidad común que permite relacionar una futura jornada
con las fichas, pero no se publica una consulta de jornada sin datos acreditados
de pertenencia. La siguiente investigación sería localizar ese recurso; no
depende de rediseñar la ficha. Recogida automática y persistencia quedan fuera.
