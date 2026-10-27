# Agenda

Calendario común de citas (cultura, deportes y otras) para mostrarlas junto a
las noticias. Este documento recoge el estado vigente; la historia de cada
decisión está en git. Las fuentes, sus condiciones y las candidatas están en
[fuentes.md](fuentes.md).

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

- **Cultura:** pasada diaria a las 04:30 UTC de Galicia, Madrid y Kulturklik
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
  (incluido el detalle y la búsqueda de objetivos); conserva identidad,
  horario e historial, sin declararla cancelada. Si reaparece, vuelve a ser
  pública. La recogida y su inventario se guardan en la misma transacción;
  páginas incompletas o archivos sueltos no acreditan ausencias. Cada cambio
  de inventario conserva su documento y fecha; repetirlo solo renueva la
  comprobación. Si el inventario cae más del 30 % no se acredita (aviso en
  Actions); `--aceptar-inventario FUENTE` o la casilla del workflow lo
  aceptan. Galicia todavía conserva las ausentes: su respuesta está
  acotada por fechas e idiomas y necesita una política con ese alcance.

## Lectura pública

`python -m agenda.publicacion --turso --fuentes … --publicar` genera la
proyección: solo fuentes permitidas (`CALENDARIO_FUENTES_PUBLICAS`, por defecto
`cultura-galicia,madrid,kulturklik`) y sin originales ni historial.

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
las fuentes guardadas con `python -m agenda.revision --turso`, sin escribir.

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

SQLite solo sirve para pruebas y copias; Turso es la autoridad. Las claves
(`OCBLACKTOP_API_KEY` y las de Turso) viven solo en el servidor.

## Pendiente

- **Rediseñar y reactivar el cliente:** la lectura paginada, los resúmenes y
  el detalle bajo demanda ya están conectados. Revisar la interfaz antes
  de reactivar `CALENDARIO_ACTIVO`.
- **Retención y retirada:** borrado transaccional de dependencias exclusivas
  antes de activar la poda de 45 días; retirada por ventanas e idiomas en
  Galicia y adaptación del inventario completo a nuevas fuentes (requisito
  de CyL y Málaga, cuya identidad de función incluye la fecha).
- **Fuentes culturales nuevas:** Zaragoza primero (funciones con ID propio),
  luego CyL, Málaga y Cataluña; sus recintos con coordenadas se ubican con los
  [límites municipales](../shared/territorios/README.md#límites-municipales) del IGN.
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

El patrón revisado en el repositorio hermano `boletines-es` (`CONTRATO.md`,
`REVISION_RUMBO.md` y `boletines/red.py`) separa lectores por fuente/familia,
extractores por formato, red común y recolector. Es la referencia para ampliar
la agenda; sus contratos y decisiones de almacenamiento pertenecen a otro
servicio y no se trasladan automáticamente.

En agenda, el lector de formato debe decodificar y conservar procedencia; el
adaptador de fuente interpreta identidades, fechas, lenguas y alcance; el
relacionador común acredita códigos y ubicaciones. Compartir JSON o XML no
significa compartir el contrato de una fuente. Las familias de API (CKAN,
Socrata, Opendatasoft) también necesitan paginación y validación propias.

La incorporación de cada lector debe distinguir vacío acreditado, respuesta
parcial y fallo; guardar URL, fecha y huella; permitir repetir muestras sin red;
y declarar la versión de sus reglas. Los límites por host y presupuestos van
en la red común, sin que cada lector reintente por su cuenta. La agenda ya
centraliza descarga y presupuestos deportivos, pero faltan el contrato general,
la grabación/reproducción y los lectores ICS/JSON-LD/RSS. Los lectores de
catálogos territoriales son la primera aplicación local de esa separación.

## Pruebas

`tests/fuentes/test_agenda.py`, `test_calendario_*.py`,
`test_adaptadores_deportivos.py`, `test_deportes_actualizaciones.py`,
`test_control_temporadas.py`, `test_temporadas.py`, `test_fuentes_oficiales.py`
y `tests/workers/calendario.test.mjs`. Todas las peticiones son simuladas; las
escrituras Turso se prueban contra un emulador con SQLite real. Las muestras y
su procedencia están en
[tests/fuentes/muestras_calendario](../tests/fuentes/muestras_calendario/README.md).
