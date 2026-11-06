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

## Enlace a resultados

`destinoResultados(tarjeta, dia)` (`shared/consultas/registro.js`) da el `id` y
la `fecha` para `abrirFichaConsulta`, o `null` si la competición no tiene
resultados. Lleva al panel de ese día, no al partido: `referencias_agenda` son
identificadores del proveedor y la tarjeta solo publica los nuestros. Comprobado
con datos reales en Primera, Segunda, Copa, Liga F, Champions, NBA, WNBA, ATP,
WTA, F1 y MotoGP. Un enlace al partido sería un añadido posterior.

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
