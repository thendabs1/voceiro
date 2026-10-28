# Agenda

Calendario común de citas (cultura, deportes y otras) para mostrarlas junto a
las noticias. Este documento recoge el estado vigente; la historia de cada
decisión está en git. Las fuentes, sus condiciones y las candidatas están en
[fuentes.md](fuentes.md); el modelo de clasificación, en
[clasificacion.md](clasificacion.md).

## Tres planos

| Plano | Qué contiene | Dónde vive | Cómo se sirve |
| --- | --- | --- | --- |
| Noticias | Titulares de medios | R2 + relay de Google News | Fuera de este directorio. |
| Agenda | Citas que se cruzan por fecha, lugar y tema | Base Turso dedicada (`CALENDARIO_TURSO_URL`) | Publicación a R2 (`calendario.json`) y lectura SQL para la API de los workers. |
| Consultas puntuales | Fichas por identidad: libro, película, resultado de un partido… | No se guardan | Worker con caché o navegador directo. |

**Regla:** se guarda en la base solo lo que se trabaja o sirve a otras
funciones (calendario, sitios, seguimientos). Lo que se pide por identidad se
consulta y se cachea: muchas consultas tienen picos breves cuando ocurre algo.
Los resultados deportivos son consultas puntuales; no se recogen.

Las tres capas comparten el catálogo temático
([shared/catalogo-tematico.json](../shared/catalogo-tematico.json)), el
territorio común ([shared/territorios](../shared/territorios/README.md)) y el
parser de búsqueda.

## Estado (27/10/2026)

- **Cultura:** pasada diaria a las 04:30 UTC de Galicia, Madrid, Kulturklik, Zaragoza y Castilla y León
  en Turso y publicación en R2 y en las tablas de lectura.
- **Deportes:** doce colecciones con adaptador y control de temporadas, todas
  publicadas; MotoGP y WTA ya tienen registrada la temporada 2027. La revisión
  entra en el cron de las 04:30 UTC: cada colección decide si le toca.
- **API de lectura:** activa en `cf-datos` y `deno-datos`
  (`CALENDARIO_LECTURA_SQL=true`), con publicación diferencial.
- **Cliente:** `CALENDARIO_ACTIVO = false` en `front/app/14-calendario.js`; la
  capa de datos usa la API y la interfaz está por rehacer.

## Flujo

```text
proveedor → adaptador → núcleo v2 en Turso (+ control de colecciones)
                              │
                              ├→ publicacion.py → R2 calendario.json
                              └→ publicacion.py --lectura-sql → tablas de lectura
                                                     → worker /calendario/* → front
```

La recogida y el parseo terminan antes de escribir. Cada escritura es un
batch con `BEGIN IMMEDIATE`, guardia de revisión y un único COMMIT; si otro
escritor avanzó, se revierte y hay que releer. Una respuesta perdida tras
COMMIT no se reintenta a ciegas.

## Modelo: núcleo v2 (esquema 4)

Tipos: `evento` (la cita), `agrupacion` (competición, edición, fase, GP),
`actividad` (obra declarada por la fuente), `participante`,
`lugar` y `territorio`. Tablas principales en [esquema.sql](esquema.sql):
entidades, documentos, referencias, observaciones, relaciones,
participaciones, tiempos, políticas y selecciones. Las tablas del piloto
(`agenda_eventos`, `agenda_registros`…) se conservan durante la transición.

Reglas que no hay que romper:

- **Identidad:** referencia externa (proveedor, tipo, contexto, ID literal) →
  ID interno estable. Nunca por título, slug ni horario. No se fusionan
  proveedores sin correspondencia explícita.
- **Traducciones:** títulos por idioma en el mismo evento; las equivalencias
  vienen declaradas por la fuente.
- **Tiempo:** cada extremo con fecha civil, instante con offset si consta,
  zona, precisión (`dia`, `hora`, `desconocida`) y certeza. No se fabrican
  medianoches, duraciones ni zonas; el fin exclusivo de ICS se conserva.
- **Programación:** nueva fecha, aplazamiento y cancelación solo si la
  fuente los declara. Desaparecer de una respuesta no cancela ni borra.
- **Revisiones:** repetir datos idénticos solo actualiza la comprobación;
  marcador, reloj o ganador no generan versiones de agenda.
- **Sin historial:** al guardar, [compactar.py](compactar.py) deja solo las
  observaciones vigentes (empates incluidos), las que sostienen una selección,
  un resultado o una clasificación, sus documentos y el inventario vigente.
  Las agendas son públicas: una versión sustituida no se archiva; si hace falta
  se vuelve a pedir. Referencias y entidades no se borran nunca. El núcleo se
  carga de Turso por páginas (ninguna respuesta crece con el total).
- **Selección entre fuentes, por bloque** (horario, sede, programación):
  corrección editorial > referencia preferida por política > última
  observación válida > conflicto sin resolver.
- **Territorio:** municipio por código INE acreditado. El dominio de la
  fuente, el domicilio de un equipo o el país de una competición no sitúan
  una cita. Una cita sin lugar sigue siendo importable.
- **Temas:** asignaciones directas con evidencia por fuente; Deportes y
  Cultura se obtienen por la jerarquía. Una etiqueta desconocida no se asigna.

Relaciones del núcleo y cómo se recorren al seguir algo:

| Relación | Origen → destino | Al seguir |
| --- | --- | --- |
| `es_edicion_de` | edición → competición | Seguir la competición alcanza sus ediciones presentes y futuras. |
| `es_parte_de` | fase/cuadro/festival → agrupación | Se recorre hacia los hijos. |
| `pertenece_a` | evento → agrupación | Seguir la agrupación alcanza sus citas. |
| `celebracion_de` | evento → actividad | Seguir la obra alcanza sus funciones. |
| `participa_en` | participante → evento | Seguir un equipo alcanza sus partidos. |
| `compuesta_por` | pareja → persona | Solo dentro del ámbito acreditado. |
| `inscrito_en`, `pertenece_al_club`, `se_celebra_en` | — | No propagan el seguimiento. |

`agenda.nucleo.consultar` ya resuelve los eventos alcanzados desde una
competición, edición, actividad, equipo o persona.

## Deportes: solo citas

| Colección | Principal | Contraste | Unidad |
| --- | --- | --- | --- |
| ATP | `espn-atp` | — | torneo (cita continua) |
| WTA | oficial WTA | `espn-wta` | torneo |
| Primera, Segunda | oficial LaLiga | `espn-primera`, `espn-segunda` | partido |
| NBA, WNBA | `espn-nba`, `espn-wnba` | — | partido |
| LF Endesa, Primera FEB, LF Challenge | `feb-*` (competiciones 4, 1, 67) | — | partido |
| Fórmula 1 | oficial F1 | `espn-f1` | GP con sesiones |
| MotoGP | oficial MotoGP | — | GP con sesiones |
| WRC | OCBlacktop | — | rally (cita continua) |

El código de circuito (`circuitos=` en la API, `circuito:` y los ámbitos de
`shared/calendario/consulta.js`) es el nombre de colección de
`temporadas.CATALOGO`; la identidad de cada competición sigue siendo el ID del
proveedor.

Las fuentes oficiales son principales por estabilidad y gratuidad
(`proveedores.PRINCIPALES`). Cambiar de principal es configuración, nunca una
reacción automática a un error; el contraste valida en memoria sin publicar.

- Un GP o un torneo es una cita principal de varios días (días oficiales del
  circuito) con las sesiones en `programa`. La lectura devuelve una tarjeta;
  buscar una sesión lleva a su GP.
- No se recogen resultados, clasificaciones, plantillas ni estadísticas; el
  adaptador recorta la evidencia antes de persistirla.
- **Control de temporadas** ([control.sql](control.sql), `temporadas.py`,
  `operacion.py`): estados `anunciada → activa → en_cierre → cerrada` (y
  `pausada`). Cada GET se reserva en la base antes de enviarse (por defecto 32
  por pasada y 64 al día por proveedor; WRC además 120 al mes). Una selección
  se confirma completa o conserva la última lectura válida. Respeta
  `Retry-After`, se bloquea ante 401/403 y tras un error espera 30 min, 1 h,
  2 h… hasta 24 h. El descubrimiento busca la temporada siguiente sin años
  fijos cada semana; que aún no esté publicada no es un fallo. Solo una
  colección sin ninguna temporada reintenta con espera creciente.
- La publicación (`--fuentes-control`) añade los principales validados y su
  cobertura por colección.

## Cultura

| Fuente | Identidad | Particularidades |
| --- | --- | --- |
| Cultura de Galicia | `id` de celebración; `nid` = obra; ciclo = etiqueta | Hasta 91 días y 20 páginas de 1000 por idioma; inicio = fin no prueba un instante. CC BY-SA 4.0. |
| Madrid | `ID-EVENTO`; `vgnextoid` para el recinto, con sus coordenadas | Intervalos con días de semana y exclusiones, sin expandir a funciones diarias. URL-ACTIVIDAD suele ser un contenedor («Actividades en el Centro Cultural…»): no es obra. CC BY 4.0. |
| Zaragoza | `subEvent.id` = función; `id` = obra (actividad si tiene varias funciones); `location.id` = recinto con coordenadas WGS84 | `rows` ≤ 500 por `id asc`; inventario por función. Fechas de días; hora solo con una sesión el mismo día; «Sin determinar» queda como texto. Se saltan las ofertas sin fecha de inicio (27 antiguas, fin en 2020). Mezcla formación y empleo: tema `cultura` salvo las categorías revisadas. Condiciones del Ayuntamiento: «Origen de los datos: Ayuntamiento de Zaragoza» y `lastUpdated` (bloque `actualizado_origen`). |
| Castilla y León (`cyl`) | Función = `id_evento@fecha_inicio` (`funcion_obra_fecha_v1`): entrada de programación, sin continuidad si cambia la fecha; `id_evento` = obra, siempre actividad; recinto = `id_localidad:lugar_celebracion`, con coordenadas | Opendatasoft `records` (100 por página, `order_by=id_evento,fecha_inicio`, `total_count`). Una fila de una obra conocida se actualiza fuera de la ventana. Horas en formatos mezclados («19:30 h.», «9:00h.»); en intervalos, solo texto. Temas por `tematica`; sin correspondencia (conferencias, talleres, circo, magia…) queda sin tema, no `cultura`. CC BY 4.0. |
| Kulturklik | `id`; castellano y euskera juntos | Fechas de día con horario en texto; su código municipal no es NORA ni INE completo. CC BY 4.0. |

La recogida comprueba todas las páginas antes de importar: cambios de total,
páginas repetidas o truncadas impiden guardar. Una programación prolongada
(exposición) aparece una vez por ventana.

Contrato común para las fuentes culturales:

- **Obra con funciones:** cada función es un `evento`; la obra, una
  `actividad` unida por `celebracion_de`, solo cuando la fuente la declara
  (Galicia `nid`; en las nuevas, CyL `id_evento`, Zaragoza `id` con
  `subEvent`, Málaga `ID_ACTIVIDAD`). Sin evento sintético: la tarjeta de cada
  función lleva `obra: {id, nombres}` y `objetivo=actividad:<id>` las lista.
  Cómo agruparlas en pantalla lo decide el cliente.
- **Clase:** las citas culturales quedan `desconocida` y no se corrigen; la
  forma temporal está en `programacion.cuando` (inicio, fin, días).
- **Etiquetas** (ciclos, festivales): bloque observado
  `etiquetas: [{id, nombres}]` con clave estable del proveedor, sin jerarquía
  ni expansión de objetivos. Faceta y filtro `etiqueta=`.
- **Identificadores externos** (Wikidata, TMDB, ISBN…): irán como bloque
  observado de la obra o la persona, `{sistema, tipo, id}` con procedencia,
  porque son asociaciones corregibles; una referencia del núcleo significa
  identidad y no se deshace. Sin implementar hasta que haya quien los escriba.
- **Ausencia:** Madrid y Kulturklik acreditan el inventario completo antes de
  filtrar la ventana de fechas. Una cita ausente se oculta de la publicación
  (incluido el detalle y la búsqueda de objetivos); conserva identidad y
  horario, sin declararla cancelada. Si reaparece, vuelve a ser
  pública. La recogida y su inventario se guardan en la misma transacción;
  páginas incompletas o archivos sueltos no acreditan ausencias. Solo se
  guarda el inventario vigente; repetirlo solo renueva la comprobación. Si el inventario cae más del 30 % no se acredita (aviso en
  Actions); `--aceptar-inventario FUENTE` o la casilla del workflow lo
  aceptan. Galicia todavía conserva las ausentes: su respuesta está
  acotada por fechas e idiomas y necesita una política con ese alcance.

## Lectura pública

`python -m agenda.publicacion --turso --fuentes … --publicar` genera la
proyección: solo fuentes permitidas (`CALENDARIO_FUENTES_PUBLICAS`, por defecto
`cultura-galicia,madrid,kulturklik,zaragoza,cyl`) y sin originales ni historial.

Con `--lectura-sql` prepara además tablas indexadas por tramos de días
consecutivos (de 329.000 filas diarias a 25.000 tramos en la medición del
25/10). La publicación es diferencial: `agenda_lectura_huellas` guarda una
huella por evento (con sus facetas y tramos) y por entidad, y solo se reescribe
lo que cambió; sin huellas previas se reemplaza todo. Para que una cita sin
cambios conserve su huella, la lectura no lleva «comprobado» por cita (va por
fuente en `cobertura`), los tramos iguales en las tres zonas se guardan una vez
con zona `*` y el recorte al horizonte va por meses enteros. Con los 4.784
eventos del 26/10: de 64.015 filas reescritas por publicación a 45.662 la
primera vez y 0 si no hay novedades. Rutas GET/HEAD del worker:

| Ruta | Respuesta |
| --- | --- |
| `/calendario/eventos?desde&hasta` | 20 tarjetas por página (máx. 50), ventana `[desde,hasta)` de hasta 42 días; orden por día e instante de inicio (sin hora o ya empezadas, primero). |
| `/calendario/eventos?pendientes=1` | Citas con fecha pendiente. |
| `/calendario/resumen?desde&hasta` | Conteo por día y hasta dos muestras. |
| `/calendario/eventos/:id` | Detalle con sus objetivos. |
| `/calendario/catalogo`, `/calendario/objetivos?texto&tipo` | Temas, fuentes y zonas; entidades paginadas. |

Filtros: `q` (prefijos del parser y texto), `texto`, `temas`, `circuitos`,
`fuente`, `objetivo`, `lugar`, `municipio`, `territorio`, `etiqueta`, `zona`. El cursor va
ligado a la revisión: si cambia la publicación responde 409. Caché de 15 s con
clave por revisión y límite de 30 peticiones/IP/minuto.

**Configuración:** secretos `CALENDARIO_TURSO_URL` y
`CALENDARIO_TURSO_TOKEN_LECTURA` (token de solo lectura) en CF y Deno,
variable `CALENDARIO_LECTURA_SQL=true` en Actions. El cliente ya consulta
esta API; su interfaz sigue desactivada mientras se rediseña.
`node scripts/medir-lectura-calendario.mjs publicacion.json` mide la proyección
sin red.

## Operación

Workflow **Calendario**: `recoger` (cultura), `deportes` (temporadas y
descubrimiento; publica), `reclasificar`, `preparar-nucleo` y `publicar`. El
cron diario hace `recoger` y `deportes`. Para revisar ya una colección sin
esperar su cadencia: `deportes` con `colecciones` (p. ej. `wrc,nba`) y
`forzar`; no salta la espera tras un error de temporada. Cada pasada revisa
las fuentes guardadas (`python -m agenda.publicacion --turso --revisar`, el
mismo informe que `agenda.revision`) con la carga que usa para publicar.

El workflow ejecuta todo en un proceso, `python -m agenda.pasada --paso "CLI
args" … --paso-tolerado "CLI args"`, con un `Almacen` compartido
(`turso.compartido`): el núcleo se lee una vez y cada paso guarda al terminar
(cada agenda cultural por separado). Un paso tolerado que falla conserva lo ya
guardado y la pasada sigue y publica; sale con 1 al final. Un conflicto de
revisión (otro escritor) o un error de Turso la detienen; un guardado incierto
obliga a releer.

```sh
# Cultura en Turso (ventana inclusiva, 31 días por defecto, máximo 91).
python calendario.py --turso --recoger-cultura madrid --recoger-cultura kulturklik \
  --inicio 2026-10-25 --fin 2026-11-24

# Deportes: estado, pasada con descubrimiento y recogida manual de una colección.
python -m agenda.operacion --turso --estado
python -m agenda.operacion --turso --ejecutar --descubrir
python -m agenda.operacion --turso --ejecutar --descubrir --coleccion wrc --forzar
python calendario.py --turso --recoger-deporte feb --temporada-feb 2026 --competicion-feb 4

# Sin red: muestras locales sobre SQLite y exportación del núcleo.
python calendario.py --db /tmp/agenda.sqlite \
  --entrada-deporte espn-primera=tests/fuentes/muestras_calendario/deportes/espn-primera.json \
  --exportar-nucleo --salida /tmp/nucleo.json

# Informe de retención (no borra): eventos puntuales terminados hace más de 45 días.
python -m agenda.retencion exportacion.json --ahora 2026-12-11T12:00:00Z
```

SQLite solo sirve para pruebas y copias. En producción el **núcleo** vive en el
bucket privado `voceiro-agenda` de R2, un fichero por fuente
(`nucleo/v1/<fuente>.json.gz` más `indice.json`, [nucleo_r2.py](nucleo_r2.py));
Turso guarda el piloto, el control deportivo, la lectura y la revisión global.
Se guarda primero R2 (escritura condicional por ETag, solo los ficheros
cambiados) y luego Turso; si Turso falla, la pasada siguiente parte de R2. La
fila `nucleo_r2` de `agenda_estado` marca la migración: desde entonces un
`Almacen` sin `AGENDA_R2_*` se niega a cargar. Las tablas del núcleo en Turso
quedan quietas como vuelta atrás hasta la limpieza.

```bash
# Una sola vez: copiar el núcleo de Turso a R2 y dejar la marca.
python -m agenda.nucleo_r2 --migrar
```

Las claves (`OCBLACKTOP_API_KEY`, las de Turso y `AGENDA_R2_*`) viven solo en el servidor.

## Pendiente

- **Rediseñar y reactivar el cliente:** la lectura paginada, los resúmenes y
  el detalle bajo demanda ya están conectados. Revisar la interfaz antes
  de reactivar `CALENDARIO_ACTIVO`.
- **Retención y retirada:** borrado transaccional de dependencias exclusivas
  antes de activar la poda de 45 días; retirada por ventanas e idiomas en
  Galicia y adaptación del inventario completo a nuevas fuentes (requisito
  de CyL y Málaga, cuya identidad de función incluye la fecha).
- **Clasificación común y reconstrucción cultural:** diseño cerrado en
  [clasificacion.md](clasificacion.md) (temas compartidos con las noticias,
  filtros del calendario, etiquetas; un clasificador con tablas por fuente).
  Antes de añadir fuentes, las cinco culturales se regeneran con él
  conservando sus referencias externas.
- **Fuentes nuevas:** por el orden de la [lista cerrada](fuentes.md#lista-cerrada)
  (Barcelona, Cataluña, Málaga, esMadrid…), cada una con el
  [contrato de fuente](fuentes.md#contrato-de-fuente); sus recintos con
  coordenadas se ubican con los [límites municipales](../shared/territorios/README.md#límites-municipales) del IGN.
- **Lectores por formato** (ICS completo, JSON-LD schema.org/Event, RSS) con un
  registro declarativo de fuentes, para ampliar a comunidades y ayuntamientos.
  Todavía no implementados: Vidmar solo cubre su subconjunto ICS y el RSS de
  noticias no interpreta citas.
- **Consultas puntuales:** registro único de prefijos (hoy `shared/parser.js`
  y `shared/calendario/consulta.js` tienen listas separadas), contrato común
  de respuesta y una salida única del worker con caché y presupuesto.
- **Seguir:** guardado y seguimiento por objetivo en un documento cifrado
  separado (`calendario-personal`, misma clave de sincronización con otra
  derivación); novedades por objetivo, tipo de cambio y revisión. Diseñado,
  sin implementar.
- **Alrededores** (búsqueda por distancia): por diseñar.

### Lectores y escalado

Adaptado del contrato de lectores de `boletines-es` (`CONTRATO.md`): cada pieza
sabe una cosa y las fuentes nuevas se suman declarando, no ramificando código.

| Pieza | Dónde | Qué hace | Qué no hace |
|---|---|---|---|
| Red | `recogida.descargar` | Única salida: User-Agent, límite de bytes, presupuesto y registro por petición | No interpreta respuestas |
| Familia | `familias.py` (`ckan`, `euskadi`, `zaragoza`, `opendatasoft`) | Recorre una API paginada entera y devuelve filas e inventario de IDs; lanza ante total cambiante, ID repetido o página vacía | No conoce el núcleo ni la ventana |
| Fuente | `madrid.py`, `kulturklik.py`, `zaragoza.py`, `cyl.py` | Declara `FUENTE`, `FAMILIA`, `URL_RECOGIDA`, `CAMPO_ID`, `TIPO_EXTERNO`, `FECHAS`; `importar` traduce sus campos al núcleo | No descarga |
| Registro | `registro.CULTURA` | Lista única de fuentes culturales para la CLI, la recogida y el inventario | — |
| Comunes | `presencia.py`, límites municipales, constructor | Retirada por inventario completo, municipio por coordenadas | No dependen de la fuente |

Reglas para cada fuente nueva:

1. **Respuesta completa o nada.** La familia distingue vacío acreditado (total
   cero declarado), respuesta parcial y fallo; solo la completa acredita
   ausencias. La ventana de fechas filtra después, nunca antes del inventario,
   y no excluye una cita ya conocida: aplazada lejos, se actualiza igual.
2. **Identidad de función.** ID propio si la fuente lo da (Zaragoza
   `subEvent.id`); si no, obra + fecha de inicio (CyL, Málaga) con un
   `TIPO_EXTERNO` que lo diga (`funcion_obra_fecha_v1`). Es una entrada de
   programación: si la fecha cambia, se retira y aparece otra, sin afirmar
   aplazamiento. La obra es siempre actividad (objetivo estable para seguir) y
   la fuente declara `obra(id)` para que sus filas se actualicen fuera de la
   ventana. Una colisión (misma obra y día en dos recintos) detiene la fuente;
   no se resuelve con ordinales ni huellas. Antes de importar quedan fijados la
   unidad, los componentes y la serialización de la clave: después solo se
   cambia migrando.
3. **Territorio por coordenadas.** El recinto guarda el bloque `coordenadas`
   y el municipio lo acreditan los límites del IGN; los códigos propios de la
   fuente solo con correspondencia revisada.
4. **Evidencia recortada** a los campos que se usan, para que un cambio
   irrelevante no cree observaciones nuevas. Las entidades compartidas
   (recinto, municipio, obra) llevan documento propio con sus campos, no el
   de la cita: si no, cada cambio de una cita suma evidencia a todas.
5. **Muestra versionada** de la respuesta en `tests/fuentes/muestras_calendario`.

Pendiente: familias Socrata, ICS y JSON-LD `schema.org/Event`; grabar y
reproducir respuestas desde la red común; constructor cultural común (hoy cada
`importar` repite fuente, documento, recinto y tema).

## Pruebas

`tests/fuentes/test_agenda.py`, `test_calendario_*.py`,
`test_adaptadores_deportivos.py`, `test_deportes_actualizaciones.py`,
`test_control_temporadas.py`, `test_temporadas.py`, `test_fuentes_oficiales.py`
y `tests/workers/calendario.test.mjs`. Todas las peticiones son simuladas; las
escrituras Turso se prueban contra un emulador con SQLite real. Las muestras y
su procedencia están en
[tests/fuentes/muestras_calendario](../tests/fuentes/muestras_calendario/README.md).
