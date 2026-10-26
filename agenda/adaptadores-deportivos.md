# Adaptadores de agenda deportiva

Implementación del diseño del 26/10/2026. Las doce colecciones se importan en el
mismo núcleo que cultura. No activa horarios automáticos, selección pública,
escrituras remotas o cliente; las llamadas de red siguen siendo explícitas.

## Entradas

| Colecciones | Adaptador | Entrada |
| --- | --- | --- |
| `espn-atp`, `espn-wta` | `espn_tenis.importar_agenda` | Site API; torneos, sin recorrer partidos. |
| `espn-primera`, `espn-segunda` | `espn_futbol.importar` | Site API; partidos y equipos mínimos. |
| `espn-nba`, `espn-wnba` | `espn_baloncesto.importar` | Site API; partidos, temporada y fase. |
| `feb-endesa`, `feb-primera`, `feb-challenge` | `feb.importar_agenda` | Extracción FEB; el lector HTML tiene `solo_agenda=True`. |
| `espn-f1` | `espn_f1.importar` | Site API; GP principal y sesiones. Alternativa sin conciliar con Vidmar. |
| `motogp` | `motogp.importar` | Calendario oficial por temporada o detalle de GP; solo categoría MotoGP. |
| `ocblacktop-wrc` | `blacktop.importar` | Temporada WRC; rallies, sin tramos. |

`deportes.importar` despacha por colección; `deportes.recoger` selecciona el
transporte. `espn.py` comparte rutas, validación de liga, fecha explícita y
ayudantes de partidos. `deporte.py` construye documentos por entidad con una
extracción de agenda; no copia scoreboards, HTML, marcadores o perfiles.

Ejemplo local, sin red ni base previa:

```sh
python calendario.py --db /tmp/agenda-deportes.sqlite \
  --entrada-deporte espn-primera=/ruta/primera.json \
  --entrada-deporte motogp=/ruta/motogp.json \
  --exportar-nucleo --salida /tmp/nucleo-deportes.json
```

Recogidas explícitas sobre una base elegida:

```sh
python calendario.py --db /tmp/agenda-deportes.sqlite \
  --recoger-deporte espn-nba --fecha-deporte 2026-11-01
python calendario.py --db /tmp/agenda-deportes.sqlite \
  --recoger-deporte feb-endesa --temporada-deporte 2026
python calendario.py --db /tmp/agenda-deportes.sqlite \
  --recoger-deporte ocblacktop-wrc --temporada-deporte 2026
```

OCB requiere `OCBLACKTOP_API_KEY` en el entorno del servidor; no se añade al
front, URL ni documentos. Una llamada recoge la temporada WRC solicitada.
Las consultas ESPN son de un día por colección; no acreditan toda una temporada.
No hay reintentos, recorrido de perfiles, históricos ni ampliación automática.

`--entrada-feb`, `--entrada-tenis` y la recogida manual anterior de FEB/tenis
usan ahora agenda. Las funciones antiguas `feb.importar` y `espn_tenis.importar`
siguen disponibles para investigación y sus muestras históricas. La marca de
fuente `agenda_deportiva` limita la nueva proyección a las extracciones de agenda:
no vuelve a publicar partidos/resultados antiguos de esa fuente por reutilizarla.
Los originales y resultados previamente guardados permanecen en el núcleo.

## Tiempo y lectura

Cambiar fecha/hora conserva la referencia. Repetir campos de agenda conserva
documentos y observaciones, actualizando solo su comprobación; reloj, tanteo,
ganador o clasificación no intervienen en sus huellas. Si FEB deja de dar una
fecha de partido ya conocida, se conserva la programación anterior; eso no
demuestra que el proveedor haya vuelto a confirmar ese horario. El bloque
`fecha_conservada` identifica la observación y comprobación originales; repetir
la ausencia no cambia ese origen ni crea otra versión. Volver a recibir la
fecha elimina la marca.

La pertenencia y los equipos mínimos forman parte de la evidencia de cada
cita. Cambiar fase, resolver una plaza sin ID o sustituir un equipo deja de
publicar la relación anterior, conservando su historial. La pertenencia de las
agrupaciones también se versiona. Dos versiones contradictorias en el mismo
instante se rechazan antes de persistir. La primera reimportación con este
contrato amplía la evidencia, sin cambiar referencias ni necesitar migración SQL.

Tenis publica días solo cuando son fechas civiles explícitas o coinciden los
límites del torneo y su calendario con zona declarada. Sin esa evidencia queda
pendiente. No se deriva el intervalo desde partidos. MotoGP normaliza su zona
IANA declarada, valida la concordancia con los offsets y deja desconocido el
fin equivalente al inicio. Los GP muestran los días oficiales del circuito;
sin zona acreditada o fechas civiles explícitas quedan pendientes. Esto afecta
a los límites UTC de las muestras ESPN F1: sus sesiones siguen siendo
consultables. Los rallies conservan sus días civiles inclusivos, sin horas.

Los GP mantienen agrupación, cita principal y sesiones con identidades distintas.
`publicacion.proyectar` incluye las sesiones en `programa` y deja una tarjeta
principal. Agrega sus objetivos antes de preparar texto/facetas/paginación de la
lectura SQL; buscar una sesión permite encontrar su GP. El programa conserva
ID, horario y procedencia de cada sesión. Esto no conecta ni reactiva la UI.
Los tramos SQL y la agrupación local reúnen los días principales y los de las
sesiones en la zona del lector, sin duplicar GP por día ni rellenar huecos.
Un GP con días oficiales pendientes puede encontrarse por sus sesiones y
seguir en la lista de fechas pendientes.
Al conectar el cliente a la API habrá que respetar su selección temporal: las
tarjetas conservan los días oficiales y el detalle aporta el programa. Filtrar
otra vez las tarjetas solo por su intervalo principal perdería esas sesiones.

Pendientes operativos: elección y correspondencias de fuente F1; cobertura por
colección/ventana; presupuesto y registro de cuotas; actualización incremental
de la proyección; retención y cliente API. El GET satisfactorio de un proveedor
no resuelve esas tareas ni acredita cobertura completa.

## Revisión de los adaptadores

La revisión posterior reprodujo cuatro defectos, corregidos en esta continuación:

- **Cambio de fase:** se publicaban simultáneamente las pertenencias anterior
  y nueva. `Agenda.evento` y `Agenda.grupo` incluyen ahora su pertenencia en la
  evidencia versionada.
- **Participante que adquiere ID:** una primera importación con «Getafe» sin
  UID y otra con UID dejaban tres participaciones. Los equipos y papeles se
  versionan junto con la cita y solo se publican los vigentes.
- **Días del GP en F1:** se recortaban instantes UTC como si acreditaran los
  días oficiales. Ahora, sin zona del circuito acreditada, quedan pendientes;
  no se deduce la zona del país o nombre. Las fechas civiles se conservan.
- **Consulta por día de una sesión:** se indexaba solo el intervalo principal.
  La unión de días del GP y programa recupera sus sesiones incluso cuando
  cambian de día al convertir de zona, con una sola tarjeta y cuenta por día.

El [diseño de GP](calendario-deportivo.md#presentación-de-grandes-premios-acuerdo-confirmado)
recoge la elección confirmada: días del circuito y horas de sesión en la zona
del lector. Estos casos no estaban cubiertos por las pruebas iniciales. Las
regresiones añadidas comprueban cambios entre importaciones, límites UTC/locales,
consulta HTTP con SQLite y coincidencia entre resumen, listado y agrupación.
También se rechaza un mismo equipo a ambos lados y una competición ESPN que
pertenezca a otro evento. No se amplían deportes, fuentes ni recogidas periódicas.

Requisitos específicos antes de operar cada familia:

| Familia | Tratamiento que necesita |
| --- | --- |
| ESPN común | Recuperar acceso por fecha, contrastar partidos reales de Segunda/WNBA y planificar cobertura por colección/día; compartir transporte no acredita reglas deportivas idénticas. |
| ATP/WTA | Solo torneos; conservar la distinción entre zona del calendario del proveedor y zona del recinto. Validar cómo descubrir todos los torneos del horizonte. |
| Fútbol y NBA/WNBA | Mantener el año de temporada declarado y comprobar fases por liga; no asignarlas por el año civil ni fabricar cruces con participantes pendientes. |
| FEB | Las dos páginas cubren la fase seleccionada, no todos los playoffs. Mantener horas sin zona y diferenciar fecha conservada de horario reconfirmado; sin fichas de equipos o pabellones. |
| F1 | Acreditar zona o días oficiales y resolver elección Vidmar/ESPN con correspondencias antes de publicar ambas fuentes. |
| MotoGP | Zona nominal y offsets ya contrastados por el adaptador. Si un programa deja de aparecer, se conserva lo conocido con su antigüedad; falta comunicar esa situación al conectar el cliente. |
| WRC/OCB | Clave en servidor; calendario de temporada y presupuesto propio. El transporte aún descarta las cabeceras de cuota: su registro queda pendiente. El enlace actual conduce a la documentación API, no al detalle público de cada rally. |

## Verificación

Las pruebas se ejecutaron después de implementar todos los adaptadores, según
lo solicitado. Pasan 19 pruebas nuevas con las doce colecciones, las 86 pruebas
existentes de calendario y tres archivos JavaScript de agenda/buscador/Worker.
Incluyen SQLite nuevo y reapertura, rollback, convivencia con cultura, búsqueda
de sesiones sobre la proyección SQL, identidad ante cambios de fecha, cambio de
hora estacional en tenis y ausencia de historial por cambios solo deportivos.
Las comprobaciones de generación y sincronización de workers también pasan.
La suite completa corresponde a CI.

Sondeo acotado desde servidor, sin escribir en Turso ni publicar:

| Colección | Respuesta comprobada e importación |
| --- | --- |
| FEB LF Endesa | Dos GET: 240 partidos, cero resultados/tablas. |
| FEB Primera | Dos GET: 306 partidos, cero resultados/tablas. |
| FEB Challenge | Dos GET: 240 partidos, cero resultados/tablas. |
| MotoGP 2026 | Un GET de temporada: 22 GP y 176 sesiones MotoGP; 22 tarjetas con programa, cero resultados/tablas. |
| OCB WRC 2026 | Un GET autenticado: 14 rallies, cero resultados/tablas. La clave no se imprime ni persiste. |
| ESPN | El sondeo actual por fecha devolvió 403; un intento adicional de Primera falló en DNS. No se atribuye a CORS ni se certifica acceso operativo. |

Se reutilizaron además respuestas completas retenidas de ESPN: dos torneos ATP,
cinco WTA, un torneo ATP futuro, cuatro partidos de Primera, cuatro NBA y un GP
F1 con cinco sesiones, tanto futuro como terminado. Todas se importan y proyectan
sin resultados ni clasificaciones. Segunda y WNBA tienen contratos sintéticos
explícitos en los tests: su respuesta real sigue sin contrastar. Véase la
[procedencia de las muestras](../tests/fuentes/muestras_calendario/deportes/README.md).

La prueba de red detectó y permitió corregir el tratamiento de direcciones
literales de MotoGP. Se retiró el parámetro ESPN `limit`, que no estaba
contrastado; los errores 403 persistieron con la ruta por fecha. No se añadieron
proxies, credenciales, reintentos automáticos ni sustituciones de fuente.

En la continuación de correcciones pasan 31 pruebas de deportes (19 iniciales
y 12 nuevas), 21 del núcleo y los tres archivos JavaScript de agenda, búsqueda
y Worker. Incluyen siete colecciones con plazas que adquieren ID, cambios de
fase/padre, sustituciones e intercambio de lados, contradicciones simultáneas,
fecha FEB conservada y reconfirmada, días de GP pendientes, cambio de hora,
offsets y programa ausente con su comprobación original. Las pruebas HTTP con
SQLite comprueban una tarjeta por GP, resumen sin duplicados y huecos sin citas.

Un nuevo GET MotoGP de temporada valida los 22 GP y 176 sesiones en 18 zonas
IANA, con cero resultados/clasificaciones. El GP de Australia conserva sus días
oficiales 23–25/10 y aparece ahora al consultar su FP1 del 22/10 UTC. Dos GET
adicionales de ESPN, Segunda `20261101` y WNBA `20260901`, siguen devolviendo
403; sus contratos de partidos continúan siendo sintéticos. No se repitió OCB
ni se escribieron datos en Turso durante esta continuación.
