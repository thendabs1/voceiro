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

## Estado (26/10/2026)

- **Cultura:** pasada diaria a las 04:30 UTC de Galicia, Madrid y Kulturklik
  en Turso y publicación en R2.
- **Deportes:** doce colecciones con adaptador y control de temporadas. La
  recogida es manual (`operacion: deportes` en el workflow) hasta medir filas
  y peticiones de una pasada real; después pasa al cron.
- **Cliente:** `CALENDARIO_ACTIVO = false` en `front/app/14-calendario.js`.
  Descargar `calendario.json` completo (unos 12 MB) bloqueaba; se reactiva al
  conectar la API.
- **API de lectura:** rutas `/calendario/*` en `cf-datos` y `deno-datos`,
  implementadas y sin activar (`CALENDARIO_LECTURA_SQL=false`, secretos de
  lectura pendientes en los workers).

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

Tipos: `evento` (la cita), `agrupacion` (competición, edición, fase, GP,
ciclo), `actividad` (obra o ficha con varias celebraciones), `participante`,
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
  `Retry-After`, se bloquea ante 401/403 y enfría tras errores. El
  descubrimiento busca la temporada siguiente sin años fijos en el cron.
- La publicación (`--fuentes-control`) añade los principales validados y su
  cobertura por colección.

## Cultura

| Fuente | Identidad | Particularidades |
| --- | --- | --- |
| Cultura de Galicia | `id` de celebración; nodo = ficha | Hasta 91 días y 20 páginas de 1000 por idioma; inicio = fin no prueba un instante. CC BY-SA 4.0. |
| Madrid | `ID-EVENTO`; `vgnextoid` para actividad y recinto | Intervalos con días de semana y exclusiones, sin expandir a funciones diarias. CC BY 4.0. |
| Kulturklik | `id`; castellano y euskera juntos | Fechas de día con horario en texto; su código municipal no es NORA ni INE completo. CC BY 4.0. |

La recogida comprueba todas las páginas antes de importar: cambios de total,
páginas repetidas o truncadas impiden guardar. Una programación prolongada
(exposición) aparece una vez por ventana.

## Lectura pública

`python -m agenda.publicacion --turso --fuentes … --publicar` genera la
proyección: solo fuentes permitidas (`CALENDARIO_FUENTES_PUBLICAS`, por defecto
`cultura-galicia,madrid,kulturklik`) y sin originales ni historial.

Con `--lectura-sql` prepara además tablas indexadas por tramos de días
consecutivos (de 329.000 filas diarias a 25.000 tramos en la medición del
25/10). Rutas GET/HEAD del worker:

| Ruta | Respuesta |
| --- | --- |
| `/calendario/eventos?desde&hasta` | 20 tarjetas por página (máx. 50), ventana `[desde,hasta)` de hasta 42 días. |
| `/calendario/eventos?pendientes=1` | Citas con fecha pendiente. |
| `/calendario/resumen?desde&hasta` | Conteo por día y hasta dos muestras. |
| `/calendario/eventos/:id` | Detalle con sus objetivos. |
| `/calendario/catalogo`, `/calendario/objetivos?texto&tipo` | Temas, fuentes y zonas; entidades paginadas. |

Filtros: `q` (prefijos del parser y texto), `texto`, `temas`, `circuitos`,
`fuente`, `objetivo`, `lugar`, `municipio`, `territorio`, `zona`. El cursor va
ligado a la revisión: si cambia la publicación responde 409. Caché de 15 s con
clave por revisión y límite de 30 peticiones/IP/minuto.

**Para activar:** secretos `CALENDARIO_TURSO_URL` y
`CALENDARIO_TURSO_TOKEN_LECTURA` (token de solo lectura) en CF y Deno,
variable `CALENDARIO_LECTURA_SQL=true` en Actions y conectar el cliente.
`node scripts/medir-lectura-calendario.mjs publicacion.json` mide la proyección
sin red.

## Operación

Workflow **Calendario**: `recoger` (cultura y, opcionalmente, FEB o tenis),
`deportes` (temporadas y descubrimiento), `reclasificar`, `preparar-nucleo` y
`publicar`. Cada pasada revisa las fuentes guardadas con
`python -m agenda.revision --turso`, sin escribir.

```sh
# Cultura en Turso (ventana inclusiva, 31 días por defecto, máximo 91).
python calendario.py --turso --recoger-cultura madrid --recoger-cultura kulturklik \
  --inicio 2026-10-25 --fin 2026-11-24

# Deportes: estado, pasada con descubrimiento y recogida manual de una colección.
python -m agenda.operacion --turso --estado
python -m agenda.operacion --turso --ejecutar --descubrir
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

- **Activar la lectura y el cliente:** agenda paginada, semana y mes con
  `/resumen`, detalle bajo demanda y reactivar `CALENDARIO_ACTIVO`.
- **Medir una pasada deportiva real** y pasar `deportes` al cron.
- **Retención:** borrado transaccional de dependencias exclusivas antes de
  activar la poda de 45 días.
- **Lectores por formato** (ICS completo, JSON-LD schema.org/Event, RSS) con un
  registro declarativo de fuentes, para ampliar a comunidades y ayuntamientos.
- **Consultas puntuales:** registro único de prefijos (hoy `shared/parser.js`
  y `shared/calendario/consulta.js` tienen listas separadas), contrato común
  de respuesta y una salida única del worker con caché y presupuesto.
- **Seguir:** guardado y seguimiento por objetivo en un documento cifrado
  separado (`calendario-personal`, misma clave de sincronización con otra
  derivación); novedades por objetivo, tipo de cambio y revisión. Diseñado,
  sin implementar.
- **Alrededores** (búsqueda por distancia): por diseñar.

## Pruebas

`tests/fuentes/test_agenda.py`, `test_calendario_*.py`,
`test_adaptadores_deportivos.py`, `test_deportes_actualizaciones.py`,
`test_control_temporadas.py`, `test_temporadas.py`, `test_fuentes_oficiales.py`
y `tests/workers/calendario.test.mjs`. Todas las peticiones son simuladas; las
escrituras Turso se prueban contra un emulador con SQLite real. Las muestras y
su procedencia están en
[tests/fuentes/muestras_calendario](../tests/fuentes/muestras_calendario/README.md).
