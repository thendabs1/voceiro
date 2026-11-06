# Contrato de datos para la interfaz

Reglas fijadas para el refactor de Agenda y Deportes, y qué ofrecen los datos.
Lo que no figura aquí no está acordado.

## Filtros

- Sin filtro de ámbito en la primera versión. Principales: fuente y modalidad.
- Titular y actividad son filtros explícitos, sin «propio» por defecto. Sin
  filtro se ven también los desconocidos. No se ofrece actividad desconocida.
- Actos que no son competición: visibles, con etiqueta (`formacion`,
  `institucional`) y un control para ocultarlos con `excluir_actividades`.
  Asambleas y juntas se publican igual: hoy no sale ninguna.
- `disponibilidad` no aplica titular, actividad ni modalidad: no da contadores.

## Contador

Un solo número, el de la selección actual: `/calendario/eventos?…&total=1`
devuelve `total` en la primera página, con citas distintas. Una cita de varios
días o varias fuentes cuenta una vez. Es por ventana (máximo 42 días). No admite
`chips=1` ni `pendientes=1`. No hay contadores por filtro: se solapan y no suman
el total (225 apariciones para 197 citas de atletismo).

## Navegación de Deportes

Una lista por deporte y lo que ofrece cada competición en `front/app/14-deportes.js`:
de ahí salen las cuatro entradas, y cada enlace escribe su orden en la barra.

- `deportes:` abre la vista general. `resultados:` y `clasificacion:` sin competición
  enseñan las que tienen eso. `partido:` conserva sus botones. El tema de la agenda
  sigue en su chip y en `deporte:deportes`.
- El nombre hace lo pedido y lo demás queda al lado; sin contexto, lleva a lo primero
  que haya, escrito junto al nombre. Los datos se piden al elegir competición.
- El `▾` es un lanzador: lo que sigo, «Todos los deportes» y el calendario. Un
  submenú sería otra fila de `pintarAccesos`.
- Una competición lleva una sola cabecera en sus cuatro vistas (`#competicion-cab`), fuera
  de los paneles: pestañas, las demás de su deporte y vuelta a la general. Solo sale
  con una competición escrita; las hermanas no dependen de la vista. Cambiar de vista
  conserva el día: resultados solo acepta hoy o antes, y clasificación es la tabla actual.
- Atrás recorre lo elegido: cada vista escribe un paso con la barra y lo abierto desde
  su botón. Lo tecleado solo crea paso al pulsar Intro. Sin URL propia por ahora.
- Solo se ofrece lo que existe: capacidades de `shared/consultas/registro.js` y
  citas en `disponibilidad`. Euroliga no es capa de `CAL_DEPORTES`: no tiene calendario.

## Atajos

Se escriben sin espacios; `f1: hoy` es el prefijo más la palabra. Admiten alias en los
cinco idiomas (`shared/calendario/consulta.js`).

| Orden | Alias | Qué abre |
|---|---|---|
| `f1:hoy`, `f1:manana`, `f1:finde` | `hoy:f1`… | Lista de esa competición en esos días |
| `f1:horarios` | | Lista desde hoy; en motor, además, la ficha del GP en curso o siguiente |
| `hoy:`, `manana:`, `finde:` | | Agenda del sitio |
| `hoy:deportes`, `finde:deportes` | `hoy:horarios` | Las competiciones que sigo o todas |

Finde es sábado y domingo, como el botón. Un atajo abre la lista, no el mes.
Lo que no se entiende se dice y se enseña qué admite.

## Calendario y fichas de Deportes

- `‹ mes ›` va siempre en la barra, junto a los atajos: no cambia de sitio con la
  semana, el mes ni el ancho. Las marcas de competición son la misma pastilla en
  ambas vistas, todas; solo en móvil se cortan en cinco con `+N`.
- Con una o dos competiciones, escritas o elegidas, el mes enseña sus partidos (hasta
  cinco por día y `+N`) y sus GP y torneos en barra, y «Próximas semanas» no se pinta:
  repetiría la rejilla. Con más, solo marcas.
- Una consulta sobre lo que una competición no tiene (`resultados:feb-primera`) lo
  dice y ofrece lo que sí tiene, encima de la vista general.
- Las fichas deportivas no van en un `<details>`, y `.consulta-foco` marca dónde
  cae el foco. Libros, películas y contexto lo conservan.
- Partido: marcador, y bajo él fecha, estado y sede. Las incidencias van por tipo
  y equipo y la cronología queda en el orden del proveedor: `minuto` es texto
  (`45'+2'`). Un cambio no dice quién entra, así que por tipo solo se cuenta.
- El encabezado del día se omite solo si coincide con el selector de fecha.

## Enlace a resultados

Cada cita de hoy o anterior enlaza por `destinoResultados(tarjeta, dia)`
(`shared/consultas/registro.js`) con el panel de ese día, no con el partido:
`referencias_agenda` son identificadores del proveedor y la tarjeta solo publica
los nuestros. Comprobado con datos reales en Primera, Segunda, Copa, Liga F,
Champions, NBA, WNBA, ATP, WTA, F1 y MotoGP. Un enlace al partido sería un añadido
posterior.

## Noticias de una competición

Bajo resultados y clasificación salen las noticias de esa competición con ese mismo
filtro, solo entre los titulares descargados y sin pedir a la prensa.

La pestaña Noticias escribe `competicion:noticias`. El filtro casa el titular con
`AMBITOS[c].noticias` en el cliente (`noticiaEnAmbitos`), sin clasificar la noticia.
Por deporte no existe aún: `futbol:` no es un ámbito.

## Rótulos y detalle

- `resultados_enlazados` se rotula «Enlaces de resultados»: puede ser un directo
  o un tercero, no promete un resultado final.
- `atletismo.relaciones[]` se publica cuando el detalle la use, fuera del grafo.
- Pendientes de pintar: `ronda_torneo`, partido movido con fecha antigua
  (`ausente_de_su_fecha`).

## Cobertura y frescura

- `fuentes.*.ventana` dice hasta dónde se leyó. `completa: false` con
  `temporadas_sin_documento` significa que falta el documento de ese año, no
  que falle la fuente.
- Las cadencias son mínimos, no garantías: el cron corre unas tres veces al día,
  con huecos de hasta diez horas. No prometer «cada 6 h»; mostrar la última
  comprobación real.
- `activa` no significa revisada, y `proxima_revision` no es una cita garantizada.
  Una temporada fuera del horizonte no se relee: ATP 2027 conserva su error del
  4/11 hasta entrar en los 14 días, hacia el 20/12/2026.
- `fuentes.*.modo` y `condiciones` son metadatos de importación: no usarlos para
  decir que una fuente está activa.

## Territorio

Aplazado, fuera de la primera versión. Las citas deportivas no tienen territorio
resuelto: la sede es texto, se puede mostrar y no sirve para filtrar. Resolverla
exige una entrada acreditada nueva; el relacionador no busca por nombre.

## World Athletics

Para publicarla hacen falta entradas en `consulta.js`, selección y cobertura en
cliente, habilitar la fuente y revisar Dakar.
