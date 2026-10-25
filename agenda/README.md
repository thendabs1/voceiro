# Calendario común

## Madrid, Kulturklik y conexiones públicas

El workflow **Calendario** permite recoger Madrid y Kulturklik con el campo
`cultura`; `fuente: ninguna` evita volver a recoger el piloto. También se pueden
recoger juntas por CLI:

```sh
python calendario.py --turso --recoger-cultura madrid --recoger-cultura kulturklik \
  --inicio 2026-10-25 --fin 2026-11-24
```

La ventana es inclusiva (31 días por defecto, máximo 91). Se comprueban todas
las páginas del catálogo antes de filtrar por solapamiento e importar; cambios
de total, páginas repetidas, truncamiento o descarga fallida impiden guardar.
Las dos agendas se guardan en una sola transacción. El workflow trabaja
directamente con Turso, sin copias de recuperación ni artefactos intermedios.
Una pasada diaria a las **04:30 UTC**
(05:30 en Madrid en invierno, 06:30 en verano) recoge Galicia, Madrid y Kulturklik
y publica al terminar correctamente. Los deportes siguen siendo manuales.

Madrid identifica eventos por `ID-EVENTO`, actividades y recintos por el
`vgnextoid` de sus URLs oficiales. Conserva `TIPO`, días de semana y exclusiones.
Los intervalos no se expanden en funciones diarias. Exclusiones malformadas
quedan como restricciones pendientes y no se ofrecen como fechas confirmadas.
Kulturklik usa `id`, nombres castellano/euskera juntos y municipios NORA con su
provincia; las medianoches serializadas no son horarios de inicio. Sus horarios
se conservan como texto bilingüe. Sin ID de recinto no se agrupan lugares por
nombre ni se convierten empresas en participantes.

Referencias: [Madrid](https://datos.madrid.es/dataset/300107-0-agenda-actividades-eventos),
[estructura oficial de junio de 2026](https://datos.madrid.es/dataset/300107-0-agenda-actividades-eventos/resource/300107-4-agenda-actividades-eventos/download/300107-4-agenda-actividades-eventos.pdf),
[API Kulturklik](https://opendata.euskadi.eus/api-culture/?api=culture_events),
[ficha estatal y licencia de Kulturklik](https://datos.gob.es/es/catalogo/a16003011-agenda-cultural-proximos-eventos1).
Ambas CC BY 4.0, con atribución y enlace al original en la lectura.

La proyección pública incluye participantes y miembros de pareja exclusivamente
dentro del ámbito acreditado, además de competición → edición → encuentro y
actividad → celebraciones. El navegador cruza estos objetivos con fuente,
tema y municipio/recinto. Los recintos del piloto se conectan con sus municipios
declarados, sin convertir aún INE de seis dígitos ni NORA en el catálogo del tiempo.
La agenda muestra una sola ficha por programación prolongada en cada ventana;
semana y mes muestran su presencia en días permitidos, sin crear nuevos eventos.

Para habilitar las nuevas agendas públicas después de recogerlas, establecer
`CALENDARIO_FUENTES_PUBLICAS=cultura-galicia,madrid,kulturklik` (selección
predeterminada del workflow) y publicar la lectura. Una fuente deportiva pendiente no se habilita por añadir estas agendas.

## Ampliación: lectura y recogidas deportivas

El frontend añade agenda, semana y mes y consultas en el feed: `tenis:`,
`atp: wta:`, `resultados:tenis`, `resultados:atp,wta`, `f1:clasificación`
y `tenis: circuito:atp,wta`. Los ámbitos se suman sin duplicar citas; un
circuito explícito se cruza con el deporte y tipo de contenido. ATP y WTA
tienen identidad de circuito independiente del proveedor, conservando los
IDs existentes de torneos, cuadros y encuentros.

`python -m agenda.publicacion` genera desde el núcleo v2 la lectura del
navegador, sin originales ni historial completo. Conserva identidades,
horarios, precisión, procedencia, participantes, resultados y tablas actuales.
Las clasificaciones no son eventos. Vidmar sigue aportando solo calendario:
una consulta de clasificación de F1 indica que no hay tabla disponible.

El workflow manual **Calendario** incorpora FEB (LF Endesa, temporada
explícita y dos páginas por pasada) y los scoreboards ATP/WTA (una petición
por circuito). No se acredita cobertura de toda FEB. Las plazas TBD no crean
personas ficticias. Los fragmentos ESPN se conservan por encuentro para no
duplicar toda la respuesta al cambiar un marcador.

Turso es el estado de trabajo y la publicación lo consulta directamente.
Las escrituras grandes usan varios envíos HTTP
unidos por el baton del protocolo v2, con un único COMMIT y rollback completo
ante errores. No se reintenta automáticamente una escritura con respuesta perdida.

La publicación en R2 es explícita: usa la variable del repositorio
`CALENDARIO_FUENTES_PUBLICAS` (IDs separados por comas; por defecto
`cultura-galicia,madrid,kulturklik`). Sin seleccionar fuentes se genera la lectura de revisión,
que no se puede subir como pública. La pasada diaria incluye solo las agendas
culturales; las fuentes con condiciones pendientes no se habilitan automáticamente.
`calendario.json` se sustituye como objeto completo y su caché dura 60 s.

La conexión de municipios con tiempo y noticias requiere todavía
correspondencias verificadas por INE. Las noticias de las consultas temáticas
se seleccionan por texto del titular; todavía no se enlazan automáticamente
con encuentros o participantes.

Los apartados siguientes documentan el piloto conservado y sus contrastes
anteriores; esta ampliación sustituye sus menciones a UI o lectura pendientes.

## Piloto conservado

Una función de teatro, un partido y una sesión de F1 son citas del mismo
calendario. Los importadores son Cultura de Galicia y el ICS completo de
Vidmar; el núcleo no conoce sus campos. Esta fase persiste en Turso y conserva
SQLite local para muestras y copias. El [núcleo v2 implementado](nucleo-implementado.md)
añade entidades tipadas, relaciones, resultados y consultas comunes, contrastados
con muestras guardadas de FEB y WTA. Su exportación es independiente del JSON
del piloto, que conserva su formato durante la transición. El panel de calendario,
las órdenes del buscador y la publicación periódica se diseñarán después
de comprobar los datos. No hay despliegue ni tarea programada nueva.

## Ejecutar

Solo requiere Python 3.11 o posterior (biblioteca estándar):

```sh
python calendario.py --inicio 2026-10-25 --fin 2026-11-23 \
  --idioma gl --salida /tmp/calendario.json

# Siguiente pasada: conservar identidades y primeras observaciones.
python calendario.py --anterior /tmp/calendario.json \
  --idioma gl --idioma es --salida /tmp/calendario.json

# Examinar una o varias páginas ya descargadas, sin red.
python calendario.py --entrada /tmp/pagina-0.json --entrada /tmp/pagina-1.json \
  --salida /tmp/calendario-muestra.json

# Estado persistente: una segunda ejecución carga la misma base automáticamente.
python calendario.py --fuente cultura-galicia --fuente vidmar-f1 \
  --inicio 2026-10-25 --fin 2026-11-23 \
  --db /tmp/calendario.sqlite --salida /tmp/calendario.json

# Recuperar o regenerar la exportación, sin red ni una nueva recogida.
python calendario.py --db /tmp/calendario.sqlite --exportar \
  --salida /tmp/calendario.json

# Continuar el estado remoto con CALENDARIO_TURSO_URL y
# CALENDARIO_TURSO_TOKEN en el entorno (no se carga .env automáticamente).
python calendario.py --turso --fuente cultura-galicia --fuente vidmar-f1 \
  --inicio 2026-10-25 --fin 2026-11-23 --salida /tmp/calendario.json

# Recuperar la exportación sin consultar proveedores.
python calendario.py --turso --exportar --salida /tmp/calendario.json

# Reclasificar el estado remoto ya guardado, sin consultar proveedores.
python calendario.py --turso --reclasificar --salida /tmp/calendario-clasificado.json

# Proyectar el piloto al contrato v2 y exportarlo, sin consultar proveedores.
python calendario.py --turso --preparar-nucleo
python calendario.py --turso --exportar-nucleo --salida /tmp/nucleo.json

# Copia completa con originales, observaciones, vínculos e historial.
python calendario.py --turso --copia /tmp/calendario.sqlite
# Reabrir la copia recupera el JSON y permite continuar localmente.
python calendario.py --db /tmp/calendario.sqlite --exportar --salida /tmp/recuperado.json

# Combinar muestras de ambos formatos, sin red.
python calendario.py --entrada /tmp/galicia.json --entrada-ics /tmp/vidmar.ics \
  --db /tmp/calendario-muestra.sqlite
```

Por defecto se pide desde hoy hasta dentro de 30 días, ambos incluidos. El
adaptador de Galicia limita cada consulta a 91 días y 20 páginas de 1000 registros por
idioma. No descarga una ficha de detalle por evento. Si cambia el total,
se repiten IDs o faltan páginas, falla sin sustituir la salida anterior.
Una muestra local queda identificada como tal, aunque declare más resultados.

La comprobación real encontró un solapamiento entre páginas de 50 registros:
el ID 156840 aparecía en dos páginas y faltaba el 156877, aunque el total
seguía siendo 185. Una respuesta de 1000 devolvió las 185 identidades distintas.
Se usa ese tamaño para reducir los cortes y se mantiene el rechazo de
solapamientos. No se presupone que la API ofrezca una instantánea transaccional;
si falla con un intervalo grande, hay que reducirlo y revisar la recogida.

El workflow manual **Calendario (piloto)** permite elegir Galicia, F1 o ambas
y continúa el estado en una base Turso dedicada. Necesita los secretos de
Actions `CALENDARIO_TURSO_URL` y `CALENDARIO_TURSO_TOKEN`; no usa como alternativa
las credenciales del diagnóstico de la cosecha. Guarda una copia SQLite
completa y JSON como artefacto durante 14 días. Las ejecuciones del workflow
se serializan y la revisión remota detecta otros escritores. La base conserva
el estado más allá de los artefactos. No hay cron, publicación para el navegador
ni poda automática de eventos o historial.

`--db`, `--turso` y `--anterior` son alternativas. Toda la recogida se
valida antes de escribir. La transacción conserva el estado y las revisiones
de contenido; repetir datos idénticos registra otra recogida sin inventar un
cambio. La base elegida es la autoridad: la exportación ocurre
después del commit y puede regenerarse con `--exportar` si falla el archivo.
Esquema, límites y continuidad del modelo en [Persistencia y estructura
deportiva](persistencia.md).

Vidmar se solicita explícitamente con `--fuente vidmar-f1`: recoge el ICS
completo, sin aplicar el intervalo de Galicia. Preserva los UID, las fechas
sin hora y el fin exclusivo. Las alarmas no producen eventos. El lector
acepta el subconjunto observado (DATE y horas UTC); recurrencias, excepciones,
duraciones y zonas locales no soportadas abortan la pasada. No se deducen
regiones ni agrupaciones de gran premio desde nombres de ciudades o títulos.
La colección del proveedor y sus categorías explícitas son grupos.
Su licencia de republicación está pendiente de verificar y viaja como tal
en los metadatos; el piloto no publica el calendario. Fuente:
[F1 Calendar de Vidmar](https://f1.vidmar.net/).

## Contrato inicial del JSON (versión 1)

| Campo | Significado |
| --- | --- |
| `fuentes` | Identidad de cada flujo de datos, atribución, catálogo y licencia. No se limita a un dominio de periódico. |
| `eventos` | Citas con ID interno, títulos por idioma, celebración, estado, lugar y referencias. |
| `registros` | Registros externos por fuente e ID, datos normalizados y originales, modificación declarada, primera y última recogida. |
| `vinculos` | Correspondencias persistentes entre IDs externos y evento interno, incluidas equivalencias explícitas de traducción. |
| `regiones` | Lugares o territorios identificados con nombres, identificadores externos y posibles padres. |
| `grupos` | Actividades, ciclos, fichas y futuras colecciones o competiciones identificadas por separado. |
| `consultas` | Alcance de la última recogida: intervalo e idioma, o muestra local. No garantiza cubrir todos los eventos de un territorio. |

Cada cita concreta tiene ID propio, aunque comparta ficha con otras funciones.
La relación `celebracion_de` enlaza esa ficha; un ciclo pertenece a `grupos`.
Un futuro gran premio podrá agrupar sus sesiones mediante referencias del
mismo modelo. Las clasificaciones de campeonato tendrán un ámbito propio;
no se fabricará un evento para representar una tabla de temporada.

Los IDs no dependen de título, slug ni horario. Se generan de forma
determinista a partir de una referencia externa y se conservan con
`--anterior`. Las equivalencias declaradas por una fuente permiten añadir
traducciones al mismo evento. Si una equivalencia intenta unir dos eventos
internos ya separados, la pasada falla para revisarlos. No hay conciliación
automática entre proveedores por título, fecha o parecido. Antes de publicar
periódicamente hará falta diseñar la conciliación reversible entre fuentes,
la revalidación y el archivo del estado remoto.

`datos_de` identifica el registro elegido para mostrar horario, estado y
lugar: se elige de forma estable por referencia, sin afirmar que sea el más
fiable. Si las traducciones discrepan, `conflictos` señala el campo y ambas
versiones quedan en `registros`. Los títulos por idioma se conservan juntos.
Las listas de regiones, grupos y relaciones admiten pertenencia múltiple.

Las regiones de esta integración proceden del municipio de celebración,
con ID propio de la fuente y el código INE original **CPRO+CMUN+DC**, incluido
su control. No se asigna «Galicia» por el dominio del proveedor. La jerarquía
territorial y la correspondencia entre códigos de diferentes fuentes quedan
pendientes de tablas verificadas. Los grupos de actividad mantienen el
vocabulario del proveedor. La extensión `clasificacion` añade conceptos comunes
y evidencia por registro; sus correspondencias viven en
[shared/catalogo-tematico.json](../shared/catalogo-tematico.json). Las etiquetas
desconocidas se conservan sin asignarles un tema. La jerarquía permite filtrar
Deportes desde Automovilismo, o Cultura desde Teatro, sin duplicar asignaciones.

`cuando` distingue precisión `dia`, `hora` y `desconocida`. Una hora lleva
desplazamiento UTC y zona; los días no reciben horas inventadas. En Galicia,
inicio y fin iguales se conservan en el original y se omite el fin normalizado
porque no se ha confirmado una duración. Una medianoche declarada conserva
un aviso de precisión pendiente: no se interpreta como actividad de todo el
día. Una hora local ambigua o inexistente por el cambio horario conserva el
original y se marca como desconocida. No se extrapolan repeticiones desde
el texto de una ficha, ni se crean citas diarias para una exposición.
`fin_exclusivo` admite verdadero, falso o desconocido: un futuro adaptador
ICS deberá declarar su fin exclusivo, sin restar un día al dato original.
El JSON gallego no se interpreta con las reglas de ICS.

Las fechas de modificación y recogida no se presentan como publicación.
`dataOrixinal` conserva la celebración anterior cuando la fuente la declara;
los estados cancelado y aplazado necesitan señales explícitas. Un evento
ausente de la siguiente consulta se conserva con su última observación:
la ausencia no prueba cancelación ni vigencia. Para la futura interfaz será
necesario mostrar frescura y definir cuándo revalidar o retirar citas.

## Investigación y siguientes pasos

La [revisión propuesta del modelo](modelo-propuesto.md) contrasta actividades,
celebraciones, participantes, territorios, temas y seguimiento con
[nuevas muestras culturales y deportivas](investigacion/07-multideporte-y-seleccion.md).
Las partes implementadas y pendientes se detallan en el
[núcleo v2](nucleo-implementado.md); las notas de investigación no activan integraciones.
La continuación del [diseño del núcleo con FEB, tenis y noticias ESPN](diseno-nucleo.md)
concreta las relaciones y garantías que falta acordar antes de migrar o importar.
El [contrato lógico propuesto](contrato-propuesto.md) concreta campos y
cardinalidades, mantiene la clasificación compartida con noticias y deja para
otro incremento los enlaces con artículos concretos.
Las [decisiones del modelo y plan de implementación](decisiones-modelo.md)
concretan el catálogo, las reglas de fuentes, fechas, seguimiento y datos
personales; distinguen la clasificación implementada del núcleo que sigue.
La revisión nueva encargó también dos lotes a OpenCode Go: FEB terminó y
Cataluña/Madrid se completó aquí a partir de sus muestras tras agotar el tiempo.

OpenCode Go (`opencode-go/kimi-k3`) trabajó en dos lotes acotados, escribiendo
progreso en disco antes de entregar el resultado. Se conservan sus informes:

- [Agendas territoriales: Galicia y Kulturklik](investigacion/01-agendas-territoriales.md).
- [Directos: elDiario.es, RTVE y 20minutos](investigacion/02-directos.md).

Revisión propia posterior: [servicios deportivos y propuesta de reglas de
recopilación](investigacion/03-servicios-y-reglas.md). Compara los dos ICS
de Vidmar, distingue fuentes documentadas de importadores probados y recoge
el descarte de OpenF1 indicado por el usuario. Las cadencias propuestas
todavía no se han activado.

El [contraste de fuentes de fútbol](investigacion/04-futbol-fuentes.md) añade
pruebas HTTP de ESPN, OpenLigaDB, FotMob y TheSportsDB, el bloqueo de SofaScore
y la revisión de openfootball y fixturedownload. Distingue cobertura de frescura
y condiciones de recogida. El fútbol queda pendiente: el usuario ha solicitado
autorización a FotMob por su cobertura de Liga F y fútbol regional. No se
continúa con otros proveedores de fútbol ni se consulta FotMob mientras se
espera respuesta. Su estructura se contempla en el diseño de persistencia.

Son notas de investigación, con límites y dudas expresos. Dos precisiones de
la revisión: inicio=fin no demuestra que la actividad sea instantánea, y
la correspondencia de los códigos de Kulturklik con INE no se aplica sin
validar el conjunto y sus excepciones. La cobertura entre idiomas tampoco
se da por completa. El lote de agendas propuso un vocabulario común, que
queda pendiente de comprobar con una segunda fuente real.

Fuentes primarias del primer importador:
[catálogo y licencia](https://abertos.xunta.gal/catalogo/cultura-ocio-deporte/-/dataset/0045/axenda-cultura-galicia),
[manual del servicio](https://ficheiros-web.xunta.gal/cultura/servizo-web/Manual_Servizo%20Web_Axenda_Cultura.pdf)
y [JSON público](https://www.cultura.gal/v1/axenda/eventos.json?idioma=gl).
La atribución y licencia CC BY-SA 4.0 viajan en el calendario generado.

Contraste actual: Galicia y sesiones deportivas de Vidmar en la misma base.
El núcleo v2 añade resultados e instantáneas de clasificación con ámbito,
probados con muestras locales; siguen pendientes sus recolectores y una segunda
agenda territorial o de prensa. Antes del panel habrá que concretar filtros
y la capa de regiones o grupos con el usuario. El piloto no decide esa UI.

Los directos quedan documentados: harían falta seguimiento por cobertura,
identidad y revisiones de cada entrada, paginación, caché compartida y cadencia
propia según estado. El endpoint incremental localizado en elDiario.es no
demuestra acceso a todo el histórico ni permite detectar por sí solo todas
las correcciones. Se investigará antes de actualizar servidores.

## Verificación

`tests/fuentes/test_agenda.py`, `test_calendario_almacen.py` y
`test_calendario_turso.py` entran en la suite Python completa del workflow
**Tests**. Cubre funciones múltiples, traducciones, cambios de fecha,
equivalencias conflictivas, ausencias, regiones y grupos múltiples, fechas
sin hora y cambios de horario, paginación y conservación de la última salida
buena ante errores. También cubren reapertura SQLite, auditoría, reversión de
transacciones y errores entre fuentes, exportación y el contrato ICS.
Todas las peticiones de esas pruebas son simuladas.

El batch HTTP se prueba contra un emulador que ejecuta SQLite real: dos
escritores, rollback, respuesta perdida tras COMMIT, respuesta incompleta,
escrituras evitables, copia y reapertura del historial, migración del boceto
v1 y observaciones antiguas. Hay un contraste sintético de agendas con
baloncesto y atletismo; no son adaptadores ni pruebas de proveedores deportivos.

Comprobación real del 24/10/2026: el intervalo 25/10–23/11 devolvió 185
registros e identidades distintas y 41 municipios. Una segunda integración
local de esa respuesta conservó las 185 identidades y primeras recogidas.
La muestra del nodo 127829 produjo tres funciones distintas enlazadas a
una misma ficha. No se simularon cambios reales del proveedor entre descargas;
los aplazamientos y cancelaciones se cubren con respuestas simuladas en CI.

Contraste posterior del mismo día: recogida conjunta de 185 registros gallegos
y 128 de Vidmar en una SQLite con 313 eventos, 41 regiones y 197 grupos.
Releer los originales descargados conservó los 313 vínculos y primeras
recogidas. La base reabierta y su exportación fueron equivalentes y no hubo
revisiones nuevas por contenido idéntico; `foreign_key_check` no devolvió errores.

Verificación real del 25/10/2026 en la base dedicada `voceiro-calendario`:
313 eventos (185 de Galicia y 128 de Vidmar). Reintegrar los datos descargados
conservó identidades, primeras observaciones y las 313 revisiones iniciales;
el batch de escritura leyó 317 filas y escribió 316 según libSQL. La cifra no
incluye la lectura previa de la instantánea ni el dump. Se verificaron también
el rechazo de un escritor obsoleto y de referencias inválidas en el servidor,
y la recuperación de una copia completa con los 313 eventos y sus revisiones.

Reclasificación real del 25/10/2026, tras integrar el catálogo común:
[ejecución verificada](https://github.com/thendabs1/voceiro/actions/runs/40180791841).
Conservados los 313 eventos, IDs, originales e historial; 208 clasificados y
105 sin correspondencia. Los tipos sin correspondencia mantienen el original.
La ampliación al núcleo v2 se ha contrastado sobre una copia: sus resultados
y límites están en [Núcleo implementado](nucleo-implementado.md).
