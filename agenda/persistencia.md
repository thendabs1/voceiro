# Persistencia del calendario y continuidad del modelo

## Almacenamiento y autoridad

El calendario se guarda en una **base Turso/libSQL dedicada**, con credenciales
`CALENDARIO_TURSO_URL` y `CALENDARIO_TURSO_TOKEN`. Es independiente de `voceiro`
(catálogo, pasadas y estadísticas) y de la sincronización de dispositivos.
SQLite local sigue disponible para muestras y recuperación de copias.
Ambos usan el mismo plan de escrituras y el mismo contrato JSON.

El contrato JSON conserva `version: 1`; el esquema es versión 3 en
`agenda_esquema`, con una revisión monotónica independiente. Turso documenta
`PRAGMA user_version` como [solo lectura](https://docs.turso.tech/cloud/limitations).
Las bases locales del boceto v1 se migran transaccionalmente, conservando
identidades, originales e historial. Las bases ajenas y versiones futuras se
rechazan. No se aplica el esquema del calendario a la base de estadísticas.

La ampliación v2→v3 es aditiva y transaccional: crea conceptos, jerarquía,
asignaciones temáticas y auditoría de clasificación. Conserva las filas
anteriores y avanza la revisión para invalidar escritores de versiones previas.
La extensión JSON `clasificacion` guarda el catálogo utilizado y la evidencia;
las tablas nuevas son sus índices consultables y su auditoría. El resto del
modelo se concreta en [Decisiones del modelo](decisiones-modelo.md).

`--turso --reclasificar` aplica el catálogo a registros ya guardados, sin
recoger fuentes, actualizar observaciones ni crear revisiones del proveedor.
Una repetición idéntica no escribe. El workflow manual ofrece esa operación
con copia previa conservada antes de modificar Turso y comparación posterior
de IDs, contenido e historial. La copia puede migrarse localmente para validar
su reapertura sin modificar la base remota; SQLite solo sirve para pruebas y
recuperación, sin una base local de trabajo adicional.

## Tablas y garantías

| Tabla | Responsabilidad |
| --- | --- |
| `agenda_esquema` | Versión y revisión del estado para detectar escritores concurrentes. |
| `agenda_fuentes` | Procedencia, atribución, licencia y metadatos del flujo. |
| `agenda_eventos` | Citas comunes; JSON completo y columnas de precisión, inicio, fin y estado. |
| `agenda_registros` | Identidad de origen, original, normalización y primera/última observación. |
| `agenda_vinculos` | Correspondencias persistentes, incluidas equivalencias declaradas sin registro descargado todavía. |
| `agenda_regiones`, `agenda_grupos` | Catálogos con nombres, referencias externas y relaciones declaradas. |
| `agenda_evento_region`, `agenda_evento_grupo` | Pertenencia múltiple con claves foráneas e índices de consulta. |
| `agenda_recogidas` | Fecha y consultas de cada pasada confirmada, con sus alcances. |
| `agenda_revisiones` | Registro anterior y nuevo ante inserción o cambio de contenido. |
| `agenda_estado` | Metadatos del último calendario; permite reconstruir la exportación. |
| `agenda_temas`, `agenda_tema_padres` | Catálogo común y jerarquía de temas. |
| `agenda_evento_tema` | Asignaciones directas por cita, con sus evidencias. |
| `agenda_clasificacion_revisiones` | Cambios de clasificación separados de la observación del proveedor. |

Los JSON de las entidades preservan campos y vocabularios sin crear columnas
propias de Galicia o F1. Los padres territoriales y relaciones de grupos se
conservan tal como se declaran; no hay una jerarquía común inferida del dominio.
En los índices de eventos las horas se normalizan a UTC para compararlas;
las fechas de precisión día permanecen fechas. El JSON conserva zona y valor
normalizados del adaptador. Se consultan por precisión: no se compara una
fecha sin hora como si fuera medianoche UTC.

La recogida y el parseo de proveedores terminan antes de escribir. En local
se carga e integra dentro de `BEGIN IMMEDIATE`. En Turso se lee una instantánea
consistente en una transacción breve, se integra fuera de la red y se confirma
en un solo batch con `BEGIN IMMEDIATE`. La primera sentencia comprueba la
revisión leída: si otro escritor avanzó, falla una restricción y se revierte
el batch. Hay que releer e integrar de nuevo. Tampoco se acepta una observación
de un registro anterior a la que ya tenemos, aunque su descarga termine después.
Un error en una fuente, equivalencias o claves foráneas no confirma una
recogida parcial. Un evento ausente permanece con su última observación;
no se revalida por el mero hecho de volver a guardar la base.

Cada paso del batch depende del éxito del anterior. COMMIT solo se ejecuta
si todos pasan y ante error se intenta ROLLBACK. Un pipeline de `execute`
independientes continúa tras un error y no ofrece esta garantía. Se comparte
la codificación de valores con `cosecha/turso.py`; el calendario falla si faltan
credenciales, hay errores SQL o una respuesta incompleta. Una respuesta perdida
tras COMMIT deja un resultado incierto: se relee antes de decidir si repetir,
sin reintentos automáticos.

Catálogos, eventos, vínculos y pertenencias se escriben únicamente al cambiar.
Una observación idéntica actualiza solo `ultima_recogida` en la fila del registro.
Los originales y la normalización no se reescriben por esa observación; las
fechas de observación viven en columnas y la exportación las recompone.
Se muestran las métricas de filas leídas/escritas del servidor. El presupuesto
se debe comprobar con el consumo del plan, aunque las bases estén separadas.

La auditoría compara el contenido completo del registro salvo primera y
última recogida. Cambios de horario con `SEQUENCE:0` también producen revisión.
No es una auditoría de cambios ocurridos entre sondeos que nunca recibimos,
ni un historial separado de decisiones editoriales o fusiones entre fuentes.
La exportación JSON se escribe atómicamente **después** de confirmar la base.
No hay una transacción conjunta entre SQLite y el archivo: si la exportación
falla, se regenera con `--exportar` sin consultar otra vez al proveedor.

El workflow manual continúa el estado remoto y serializa sus ejecuciones.
Entrega JSON y una copia SQLite completa de `/dump`, incluido el historial,
durante 14 días. La copia se valida con `integrity_check`, claves foráneas y
reapertura del contrato antes de sustituir el archivo anterior. Puede continuarse
localmente con `--db`. El dump es una instantánea propia: un escritor externo
entre exportación y copia puede hacer que esta tenga una revisión posterior al JSON.

Se mantiene la recogida manual. Se carga el estado completo, sin descargar
el historial de revisiones; envío y respuesta SQL se limitan a 8 y 16 MB y
el dump a 64 MB. Un exceso falla explícitamente, sin confirmar datos truncados.
Antes de automatizar o crecer hay que sustituir la carga completa por alcances
apropiados y acordar archivo, retención, revalidación y presupuesto por fuente.
No se podan citas futuras por la ventana de titulares ni se borra historial
automáticamente. La publicación prevista es generar vistas JSON en R2 para
el navegador; este cambio todavía no las publica.

## Revisión para otras agendas y deportes

El modelo admite funciones culturales, partidos y pruebas o sesiones individuales
si se mantienen estas separaciones:

| Concepto | Regla común |
| --- | --- |
| Identidad | Fuente estable + ID literal; variantes de idioma o selección no inventan otro proveedor. No fusionar por nombre ni horario. |
| Celebración | Instante con zona, día sin hora o fecha desconocida. Un aplazamiento conserva el evento; las repeticiones necesitan ocurrencias identificadas. |
| Agrupación | Ciclo/ficha o competición/temporada/fase son grupos tipados y relaciones explícitas. No deducir el gran premio del título ni la temporada del año de celebración. |
| Territorio | Lugar o ámbitos declarados, múltiples y con correspondencias verificadas. El origen de una fuente o equipo no localiza el evento; una cita online puede no tener región. |
| Participantes | Futuro catálogo de personas, equipos o parejas y papeles en el encuentro. Una carrera admite muchos participantes, no solo local/visitante. |
| Resultados | Futuros registros por fuente y evento/sesión, con unidades, parciales, empates, retiradas/descalificaciones y condición provisional/final. No reducirlos a dos marcadores. |
| Clasificaciones | Futuras instantáneas por competición + temporada + fase/grupo + ámbito + observación. No son citas ni resultados de una sesión. Preservar correcciones y deducciones. |

Ahora se guardan los grupos y sus documentos; sus relaciones todavía no forman
tablas consultables con claves foráneas. Participantes, resultados y clasificaciones
tampoco están implementados. Se añadirán con una migración y un adaptador real
que permita comprobar sus reglas. Conservar originales no equivale a implementar
esas entidades. La persistencia del calendario no depende de anticipar una
estructura particular del fútbol.

## Fútbol pendiente, conservando el encaje de FotMob

El usuario ha pedido autorización a FotMob. No hay adaptador ni nuevas
consultas mientras se espera respuesta. El diseño parte de las estructuras
ya observadas, sin fijar nombres del proveedor como columnas del calendario:

| Información observada | Encaje previsto |
| --- | --- |
| `match.id`, inicio UTC y estado | Evento con referencia propia de FotMob; estado del partido separado del estado de recogida. |
| Competición y `primaryId`; grupos con otro `id` | Grupos de competición/fase con relaciones explícitas; preservar ambos IDs. No asumir que cada ID de jornada global es otra competición. |
| Temporada, jornada, fase y grupo | Ámbitos relacionados; una fase o grupo no depende de que el deporte se organice como el fútbol. |
| `home.id`, `away.id` | Participantes con identidad de origen y papel local/visitante en el partido. El territorio del club no determina el lugar del evento. |
| Marcador, prórroga, penaltis y señales de estado | Resultado vinculado al evento, conservando significado y carácter provisional/final. No convertir ceros pendientes en resultado. |
| Tablas `all`, `home`, `away`, orden y deducciones | Instantáneas de clasificación por fuente + competición + temporada + fase/grupo + ámbito + fecha de observación. |

Así, un resultado de carrera se vinculará a su sesión y la clasificación
general a la temporada; una clasificación de fútbol podrá acotarse a su
grupo o fase. No son eventos nuevos ni otra clase de calendario.

**Implementado ahora:** eventos, referencias y grupos extensibles, regiones
múltiples, originales e historial, con persistencia independiente del proveedor.
**Para el siguiente adaptador:** catálogo de participantes, sus papeles,
resultados e instantáneas de clasificación, con migración y pruebas sobre
las capacidades finalmente autorizadas. Esas tablas y su normalización no
están implementadas en este PR. Los documentos JSON evitan perder futuros
campos, pero no sustituyen esas relaciones consultables.

Ningún nombre, slug, fecha o similitud unirá por sí solo equipos, competiciones
o eventos de proveedores distintos. Una correspondencia común necesitará
evidencia guardada y posibilidad de revisión; la integración actual solo une
equivalencias declaradas por la misma fuente.

## Contraste ICS

Vidmar aporta fechas y horas, no resultados ni tablas. El importador conserva
el UID literal y no deduce sesiones de un gran premio a partir del título.
Solo crea la colección del calendario y las categorías explícitas del feed.
Detecta y rechaza recurrencias, excepciones, duraciones y zonas locales no
soportadas en lugar de omitir ocurrencias. Las alarmas quedan en el original.
`DTEND` es exclusivo según [RFC 5545, sección 3.6.1](https://www.rfc-editor.org/rfc/rfc5545#section-3.6.1).
Si no se declara fin, el normalizado mantiene `fin: null`: no se presenta
una duración efectiva del evento a partir de los valores por defecto de ICS.
Sin `STATUS` el estado queda desconocido; no se infiere finalizado por fecha.

Las condiciones de republicación de Vidmar siguen pendientes de verificar;
se declara ese límite en los metadatos de la fuente. Este PR se limita a la
recogida manual y contraste local, sin publicación en el producto.
