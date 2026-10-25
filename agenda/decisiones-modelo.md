# Decisiones del modelo y plan de implementación

Especificación de trabajo tras la revisión conjunta. El catálogo temático y
el primer incremento del [núcleo v2](nucleo-implementado.md) están implementados.
Ese documento distingue el contrato operativo de los siguientes incrementos.
Turso es la autoridad. SQLite queda para pruebas y
copias de recuperación, sin base local que haya que mantener o sincronizar.

## Catálogo común: decidido e implementado

El archivo canónico es [shared/catalogo-tematico.json](../shared/catalogo-tematico.json),
legible por Python y por un futuro consumidor del frontend. Su versión inicial
contiene 21 conceptos:

| Raíz | Conceptos específicos iniciales |
| --- | --- |
| Deportes | Tenis, Baloncesto, Automovilismo, Fútbol, Fútbol americano, Hockey sobre hielo, Béisbol, Ajedrez, Atletismo. |
| Cultura | Teatro, Música, Danza, Cine, Exposiciones, Literatura, Patrimonio. |
| Economía | Sin desglose inicial. |
| Tecnología | Sin desglose inicial. |
| Ciencia | Sin desglose inicial. |

Las cinco raíces reutilizan los identificadores temáticos de los sectores
existentes. `generalista` sigue describiendo medios. El subconjunto no impide
añadir política, sociedad u otros temas al ampliar la clasificación de
artículos; una categoría ausente no se fuerza dentro de estas cinco raíces.
Un concepto puede tener varios padres acreditados, sin ciclos. El ID se
conserva aunque cambien su nombre o sus padres. Retirar un concepto no permite
reutilizar ni borrar su ID; se conserva con una marca editorial de retirada.

Las correspondencias activas son explícitas y están limitadas por fuente,
tipo de grupo y valor:

- Galicia: nombres exactos revisados del tipo de evento, en castellano o
  gallego, para Teatro, Música, Danza, Cine, Exposiciones, Literatura y
  Patrimonio. Solo se normalizan mayúsculas, espacios externos y Unicode;
  no se buscan palabras en titulares ni se inventan IDs numéricos de tipos.
- Vidmar: la colección declarada `vidmar-f1:calendario` → Automovilismo. Es
  una decisión editorial sobre ese flujo específico, no una regla por dominio.
- FEB, ESPN y otras fuentes: no hay correspondencias activas sin adaptador.
  Al incorporarlos se usarán sus referencias acreditadas de deporte/tipo;
  NBA y WNBA apuntarán al concepto Baloncesto, ATP y WTA a Tenis. Sus ligas
  y circuitos seguirán siendo entidades distintas.

La evidencia conserva referencia de registro, grupo, literal observado,
correspondencia y versión del catálogo. Se guardan asignaciones directas;
Deportes y Cultura se obtienen recorriendo los padres. Una etiqueta desconocida
permanece en el original y no genera asignación común. Cambiar nombres,
correspondencias o jerarquías requiere una versión mayor y deja auditoría.

La extensión opcional del JSON v1 es `clasificacion`, con su propia `version: 1`,
el catálogo utilizado y asignaciones por ID de evento. No modifica el contenido
del registro de origen. Reclasificar no actualiza `actualizado`, primera/última
recogida ni el historial de cambios del proveedor. La clasificación tiene su
historial independiente con fecha de decisión, anterior y nuevo estado.

## Clasificación de noticias: compatibilidad decidida, conexión aplazada

Los conceptos se comparten; sus asignaciones dependen del objeto. El sector
Deportes clasifica al medio y no a cada uno de sus artículos. Los temas
personales de búsqueda mantienen su semántica de reglas sobre texto; no se
transforman en IDs del catálogo ni se sobrescriben los modos del usuario.

Cuando se incorpore la clasificación de artículos, una etiqueta declarada por
su fuente podrá mapearse mediante una correspondencia específica. Una regla
sobre titulares producirá una asignación inferida identificada como tal y con
su versión. La declaración de la fuente, la inferencia y la revisión editorial
seguirán siendo datos distintos. Ahora no se reclasifican artículos existentes.

El enlace con un partido, equipo o persona concreta será otra relación,
muchos-a-muchos, con referencia de artículo, destino tipado y evidencia.
Compartir Tenis no crea esa relación. Se reservan ID de artículo del proveedor
y alias de URL; no se unifican noticias por título. No se importa el cuerpo
completo para implementar estas relaciones.

## Tipos, pertenencias y seguimiento: reglas decididas

Los tipos internos son `evento`, `agrupacion`, `actividad`, `participante`,
`lugar` y `territorio`. Cada uno conserva clase/subtipo y referencia estable.
Una «cita» del diseño se serializará como `evento` para mantener la terminología
del piloto. El catálogo común de temas es independiente de esas entidades.

| Relación | Origen → destino | Restricciones y expansión del seguimiento |
| --- | --- | --- |
| `es_edicion_de` | Agrupación edición → agrupación competición/ciclo recurrente | Como máximo un destino recurrente acreditado por edición. Seguir el recurrente recorre sus ediciones presentes y futuras acreditadas. |
| `es_parte_de` | Agrupación fase/cuadro/festival → agrupación | Uno o varios padres con evidencia; jerarquía sin ciclos. Se recorre hacia los hijos para alcanzar sus citas. |
| `pertenece_a` | Evento → agrupación | Varios destinos posibles. Seguir la agrupación alcanza estas citas; un tema no se convierte en agrupación. |
| `celebracion_de` | Evento → actividad | Como máximo una actividad identificada. Seguir la actividad alcanza sus celebraciones. |
| `participa_en` | Participante o plaza pendiente → evento | Papel y lado/orden opcionales. Seguir la persona/equipo alcanza su participación acreditada. |
| `compuesta_por` | Pareja → persona | Composición con ámbito de encuentro/edición o vigencia acreditada. La expansión desde una persona solo alcanza encuentros cubiertos por esa evidencia. |
| `inscrito_en` | Participante → edición/fase | Expresa inscripción; no fabrica partidos ni sustituye participaciones. |
| `pertenece_al_club` | Equipo → club | Requiere evidencia y vigencia. Seguir un club no incluye por defecto todos sus equipos. |
| `se_celebra_en` | Evento/agrupación → lugar/territorio | Admite varios lugares y su período. No se recorre como pertenencia deportiva. |

Las relaciones de pertenencia de agrupaciones se validan conjuntamente para
evitar ciclos entre tipos. Las equivalencias de identidad se resuelven antes
de recorrerlas; no son otro camino de pertenencia. Inscripciones, ubicaciones
y enlaces con noticias no propagan por sí solos el seguimiento de una competición.

Se podrá guardar cada objetivo identificado sin seguirlo. Seguir una competición
incluye sus próximas ediciones acreditadas; «solo esta edición» apunta a esa
edición. Las categorías temáticas sirven inicialmente para filtrar, sin crear
una suscripción automática a todas sus noticias y eventos.

Las dos preferencias iniciales son cambios del calendario y noticias relacionadas,
activadas al seguir por defecto y editables de manera independiente. La preferencia
de noticias queda disponible en el contrato aunque su conexión llegue después.
La primera entrega mostrará novedades dentro de la aplicación; recordatorios,
correo y notificaciones del navegador permanecen desactivados. Añadirlos será
una función posterior con controles propios.

Una novedad se identifica por objetivo, tipo de cambio y revisión de contenido;
no por el motivo por el que la sigue el usuario. Cambios de horario, cancelación,
aplazamiento, sede y confirmación de una plaza pueden producir novedades. Una
descarga idéntica, cambios técnicos o cada actualización del marcador no las
producen. Seguir a la vez equipo y competición muestra una sola novedad con
ambos motivos. Resultados finales podrán ser una preferencia deportiva posterior.

## Fechas, lugares y autoridad: reglas decididas

Inicio y fin mantienen precisión y certeza independientes conforme al
[contrato lógico](contrato-propuesto.md#fechas-y-estados). La evolución del
formato conservará por separado certeza de fecha y de hora: una fecha confirmada
con hora pendiente se indexa por día, nunca por la hora provisional del proveedor.
Un extremo completamente desconocido usa campos nulos y precisión desconocida.

- Un instante explícito permite índice UTC aunque no haya nombre de zona.
- Una hora local sin zona suficiente se conserva y se consulta por su fecha
  civil con indicación de hora sin zona resuelta; no genera recordatorios.
- Una fecha sin hora se consulta como fecha, sin asignar medianoche UTC.
- Un fin desconocido no crea duración. Los intervalos comparables se validan
  con fin posterior o igual al inicio, y estrictamente posterior si es exclusivo.
- Los intervalos conocidos usan solapamiento; las citas con solo inicio pueden
  aparecer ese día, sin prolongarlas a los siguientes. Los períodos generales
  de festivales/exposiciones se distinguen de las funciones de asistencia.
- Las horas ambiguas o inexistentes conservan el literal y su incidencia;
  no se elige un desplazamiento por aproximación ni la zona del lector.

La sede del club, el recinto del encuentro y el ámbito de la competición tienen
relaciones diferentes. El municipio común se resolverá con una correspondencia
verificada de códigos: conservar INE de cinco cifras y el código gallego de
seis con control; no cortar ni equiparar códigos sin validación. El catálogo
meteorológico sigue en su almacenamiento actual. Internacional, nacional y
regional describen cobertura acreditada; no se deducen de dónde se juega.

La selección de datos entre fuentes sigue esta prioridad por objeto y bloque:

1. Corrección editorial vigente y documentada.
2. Referencia preferida explícitamente en la política de ese objeto/bloque.
3. Última observación válida de esa misma referencia, sin retroceder su fecha.
4. Con varias referencias discrepantes y sin política, conflicto sin resolver.

Horario, sede, programación, resultado y clasificación deportiva son bloques
distintos. No se unen parciales de dos resultados en un marcador común. Una
fuente oficial puede ser la elegida mediante política; el dominio o el orden
alfabético no bastan para asignar autoridad. Si la interfaz necesita un valor
provisional ante conflicto, conservará la selección anterior y lo marcará como
conflictivo; no fabricará certeza. La selección antigua del piloto seguirá
identificada como tal hasta sustituirla en el incremento del núcleo.

## Resultados: estructura inicial implementada

Cada observación pertenece a una cita y a una fuente/registro. Conserva
condición declarada, líneas por participación y parciales ordenados/anidados.
Se usarán inicialmente métricas diferenciadas: `baloncesto.puntos`,
`tenis.sets_ganados`, `tenis.juegos`, `tenis.puntos_desempate`,
`carrera.posicion` y `carrera.tiempo`. El catálogo de métricas especificará unidad,
tipo y formato antes de aceptar valores; los campos sin interpretación probada
permanecen en el original. Los decimales se serializarán como cadenas decimales
con tipo declarado, evitando pérdida por coma flotante.

Una clasificación deportiva es una instantánea por ámbito acreditado y fuente,
con filas, posición declarada, orden de presentación y métricas. Corte, jornada
y desempates son opcionales. La clasificación regular WNBA y su calendario de
playoffs no comparten fase por defecto; la temporada NBA no se deriva del año
natural. Una instantánea no es una cita y no se le fabrica un horario de evento.
Retirada, walkover, descalificación y empate conservan códigos específicos y
evidencia; ningún cero o ausencia sustituye esas condiciones.

## Datos personales y sincronización: estrategia decidida

La incorporación de calendario no añadirá campos que el cliente v1 actual
pueda descartar. Se implementará un documento cifrado separado
`calendario-personal`, versión 1, recuperable con el mismo código del usuario
mediante un dominio de derivación distinto del documento actual. La derivación
de ID, token y clave usará etiquetas propias de calendario; no se modificarán
las claves ni el documento de noticias/perfil ya existente. Los clientes antiguos
seguirán accediendo únicamente a su documento original.

El documento contendrá guardados por objetivo, seguimientos por objetivo y
estado visto por ID de novedad. Cada campo mutable se fusionará de forma
independiente con sello lógico `(milisegundos, contador, dispositivo)` y orden
lexicográfico total. El reloj lógico avanza al editar y al recibir sellos remotos.
Así dos cambios concurrentes en preferencias distintas se conservan. Las
eliminaciones son `activo: false` con su sello; editar una preferencia no reactiva
un objetivo eliminado. Reactivarlo exige una acción explícita posterior.

Las marcas de baja se conservan inicialmente sin caducidad automática. Una
versión futura desconocida no se vuelve a guardar con pérdida de campos. La
escritura remota usa la revisión condicional del servicio; un conflicto obliga
a releer y fusionar. Si el bloque supera el límite del servicio, se conserva el
estado local y se muestra el fallo, sin descartar suscripciones silenciosamente.
«Borrar sincronización» deberá borrar ambos documentos y explicar si solo se
elimina uno. Esta estrategia todavía no modifica el cliente ni los workers.

## Almacenamiento y migraciones

Implementado en esquema 3, conservando JSON v1:

| Tabla | Contenido |
| --- | --- |
| `agenda_temas` | Conceptos del catálogo utilizado. |
| `agenda_tema_padres` | Jerarquía para consultas por temas amplios. |
| `agenda_evento_tema` | Asignaciones directas y evidencia por evento/concepto. |
| `agenda_clasificacion_revisiones` | Auditoría independiente de la clasificación anterior/nueva. |

Son índices y auditoría de la extensión de clasificación del JSON. Las tablas
del piloto y sus filas no se reconstruyen al migrar. La versión pasa de 2 a 3
dentro de una transacción; avanza la revisión para invalidar escritores antiguos.
Reclasificar después rellena los índices sin crear una recogida del proveedor.
Repetir la misma reclasificación no escribe ni avanza la revisión.

La ampliación del núcleo usa esquema 4 y contrato v2, manteniendo las tablas
anteriores. La exportación del piloto conserva JSON v1 con una extensión opcional
`nucleo`; `--exportar-nucleo` entrega únicamente el nuevo contrato. Las tablas son:

| Tabla | Clave y propósito |
| --- | --- |
| `agenda_entidades` | PK `(tipo, id)`; identidad común para agrupaciones, actividades, participantes, lugares, territorios y eventos. Los eventos conservan sus IDs actuales. |
| `agenda_documentos` | ID de documento, contenido o referencia, huella y observación; una huella de documento no identifica un partido. |
| `agenda_referencias` | ID interno de referencia y unicidad `(proveedor, tipo_externo, contexto_json_canonico, id_externo)`; destino tipado opcional y FK a entidad cuando resuelto. Los alias actuales conservan literalmente su referencia. |
| `agenda_observaciones` | Referencia externa, documento y ubicación de extracción, datos y observación. Una referencia puede tener historial; la ruta de extracción no es su identidad. |
| `agenda_relaciones` | ID, tipo de relación, origen/destino con FK compuesta, vigencia/ámbito y evidencia. Validación de tipos y ciclos antes del commit. |
| `agenda_participaciones` | ID, evento, participante o plaza pendiente, papel/lado/orden y evidencia. |
| `agenda_tiempos` | Objetivo tipado y extremos separados; columnas de fecha civil e instante UTC para consultas distintas, con precisión y certeza. |
| `agenda_resultados`, `agenda_clasificaciones` | Observaciones e instantáneas con ámbitos tipados; líneas y parciales con referencias y métricas JSON validadas. |

El DDL y el validador v2 están implementados juntos y probados con el piloto y
muestras FEB/WTA. Políticas y selecciones tienen tablas propias; sus detalles
y los límites del contraste están en [Núcleo implementado](nucleo-implementado.md).
Las relaciones nuevas no reinterpretarán todos los grupos actuales: la
categoría gallega `actividad` sigue siendo vocabulario de origen; una ficha
identificada podrá convertirse en actividad/obra y un ciclo en agrupación,
con evidencia y correspondencia, sin fusionar sus traducciones a ciegas.

La migración v4 conserva originales, observaciones, revisiones y vínculos.
Se ha validado sobre una copia del piloto con igualdad de IDs y filas,
claves foráneas y casos Galicia/Vidmar. El workflow exige copia previa conservada
y comprobación posterior al preparar el núcleo remoto. Un escritor de una versión
anterior falla antes de escribir. La publicación de JSON para el navegador,
las vistas semana/mes y el seguimiento se construirán sobre ese contrato;
no condicionan ahora la cuota de recogida ni obligan a otra fuente.

## Secuencia de entrega

1. Catálogo común, persistencia v3 y reclasificación sin red: implementados en
   este cambio; pruebas específicas locales y suite completa en CI.
2. Clasificación aplicada en Turso con copia previa: 313 eventos conservados,
   208 clasificados y 105 sin correspondencia.
3. Núcleo v2/esquema 4 implementado y probado sobre copia, con los adaptadores
   actuales y muestras FEB/WTA; operación remota preparada en el workflow.
4. Resultados y clasificaciones implementados para el subconjunto de muestras;
   falta escoger y habilitar el recolector operativo según disponibilidad y condiciones.
5. Lectura pública y vistas, guardados/seguimientos, sincronización personal.
6. Conexión con artículos y entrega de novedades según las preferencias.

Las decisiones de este documento permiten implementar los incrementos sin
volver a elegir una estructura por cada proveedor. Cada entrega deberá indicar
qué parte ya funciona y qué parte sigue siendo especificación.
