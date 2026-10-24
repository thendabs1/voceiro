# Persistencia del calendario y continuidad del modelo

## Alcance del PR

Una base **SQLite local dedicada**, manejada por la biblioteca estándar de
Python. Guarda el calendario de Galicia y Vidmar, permite retomar una pasada
y exportar el mismo contrato JSON. No configura una base remota, no cambia
la base de sincronización de dispositivos ni publica en R2. El SQL y los
documentos conservan el modelo sin escoger todavía el servicio de alojamiento.

Hay dos versiones distintas: `version` del contrato JSON y `PRAGMA user_version`
del esquema SQLite, ambas inicialmente 1. Una base ajena sin versión o una
versión desconocida se rechaza. Las futuras migraciones deberán ser explícitas;
no se da por resuelto el paso a Turso o D1 por compartir dialecto SQLite.

## Tablas y garantías

| Tabla | Responsabilidad |
| --- | --- |
| `agenda_fuentes` | Procedencia, atribución, licencia y metadatos del flujo. |
| `agenda_eventos` | Citas comunes; JSON completo y columnas de precisión, inicio, fin y estado. |
| `agenda_registros` | Identidad de origen, original, normalización y primera/última observación. |
| `agenda_vinculos` | Correspondencias persistentes, incluidas equivalencias declaradas sin registro descargado todavía. |
| `agenda_regiones`, `agenda_grupos` | Catálogos con nombres, referencias externas y relaciones declaradas. |
| `agenda_evento_region`, `agenda_evento_grupo` | Pertenencia múltiple con claves foráneas e índices de consulta. |
| `agenda_recogidas` | Fecha y consultas de cada pasada confirmada, con sus alcances. |
| `agenda_revisiones` | Registro anterior y nuevo ante inserción o cambio de contenido. |
| `agenda_estado` | Metadatos del último calendario; permite reconstruir la exportación. |

Los JSON de las entidades preservan campos y vocabularios sin crear columnas
propias de Galicia o F1. Los padres territoriales y relaciones de grupos se
conservan tal como se declaran; no hay una jerarquía común inferida del dominio.
En los índices de eventos las horas se normalizan a UTC para compararlas;
las fechas de precisión día permanecen fechas. El JSON conserva zona y valor
normalizados del adaptador. Se consultan por precisión: no se compara una
fecha sin hora como si fuera medianoche UTC.

Toda la red y el parseo terminan antes de abrir la transacción. Dentro de
`BEGIN IMMEDIATE` se carga el estado vigente, se integra y se guarda: dos
escritores no leen ambos una versión antigua antes de sobrescribirse.
Un error en una fuente, equivalencias o claves foráneas no confirma una
recogida parcial. Un evento ausente permanece con su última observación;
no se revalida por el mero hecho de volver a guardar la base.

La auditoría compara el contenido completo del registro salvo primera y
última recogida. Cambios de horario con `SEQUENCE:0` también producen revisión.
No es una auditoría de cambios ocurridos entre sondeos que nunca recibimos,
ni un historial separado de decisiones editoriales o fusiones entre fuentes.
La exportación JSON se escribe atómicamente **después** de confirmar la base.
No hay una transacción conjunta entre SQLite y el archivo: si la exportación
falla, se regenera con `--exportar` sin consultar otra vez al proveedor.

El workflow manual entrega base y JSON; todavía no recupera la base de una
ejecución anterior. No hay cron, poda de revisiones ni retención automática
del estado más allá de los 14 días del artefacto de Actions. Localmente la
base e historial crecen hasta que se decida una política. Antes de producción
faltan alojamiento, copia/restauración, frescura visible y revalidación de
eventos, presupuesto por fuente y publicación de vistas para el navegador.

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
