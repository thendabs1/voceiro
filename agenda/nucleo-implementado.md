# Núcleo v2: primer incremento implementado

Turso sigue siendo la autoridad. El esquema 4 añade entidades, documentos,
referencias, observaciones, relaciones, participaciones, resultados,
clasificaciones, políticas, selecciones e índices temporales. La ampliación
desde esquema 2 o 3 es aditiva y transaccional; conserva las tablas del piloto
y avanza la revisión para rechazar escritores antiguos.

Durante la transición se conserva la exportación del piloto `version: 1`.
Su campo opcional `nucleo` contiene el nuevo contrato `version: 2`;
`--exportar-nucleo` entrega ese contrato por separado. Las colecciones antiguas
no incorporan los encuentros deportivos nuevos: las lecturas nuevas deben usar
`nucleo.entidades` y `agenda.nucleo.consultar`, que incluyen todos los eventos.
No se cambia a medias el significado de `cuando` para los consumidores antiguos.

## Qué funciona

- Identidad `(tipo, id)`, referencias externas únicas por proveedor, tipo,
  contexto canónico e ID literal. Se conservan todos los IDs y alias del piloto,
  incluso un alias que ya no figure en el registro actual.
- Competición, edición, fase y cuadro, con pertenencias acreditadas y sin
  ciclos. Las temporadas FEB se contextualizan en su competición y los cuadros
  ESPN en su torneo. No se deduce una competición recurrente recortando el ID.
- Personas, equipos, parejas y plazas pendientes. La composición de pareja
  tiene ámbito de encuentro o edición/fase/cuadro acreditado. No se convierte
  un nombre en identidad ni se extraen personas separando un ID de pareja.
- Programación y ejecución separadas; extremos con fecha, hora, zona,
  instante y certezas independientes. No se completa la hora FEB con una zona
  supuesta ni se coloca el horario TBD de ESPN en un día confirmado.
- Bloques independientes de programación, lugar, resultado y clasificación.
  Una política puede elegir una referencia o una corrección editorial
  documentada. Sin política, los desacuerdos conservan la selección anterior
  marcada como conflictiva; inicialmente pueden tener valor desconocido.
- Resultados con líneas por participación y parciales anidados; métricas con
  significado y tipo validados. Los decimales se conservan como cadenas.
  Las clasificaciones tienen ámbito y observación propios; no son eventos.
- Consultas de días `[inicio, fin)`, tema con sus descendientes, objetivo y
  lugar/territorio identificado. Los instantes se consultan en la zona del
  lector; las fechas civiles conservan su semántica y los fines exclusivos.
- Resolución de los eventos alcanzados por competición, edición, actividad,
  equipo o persona. Incluye las parejas acreditadas en su ámbito y no propaga
  desde inscripción, ubicación o club. Esta función no guarda seguimientos.

Los documentos conservan contenido, huella y procedencia. Las observaciones
conservan referencia, documento, ruta y primera/última observación de ese
contenido. Repetirlo actualiza su última observación sin crear otro resultado
ni otra identidad. Cambiarlo conserva los estados anteriores. Documentos,
observaciones, resultados y clasificaciones ya persistidos no se reescriben
con otro contenido. La ausencia de una fuente conserva lo observado.

La proyección del piloto toma su estado actual; su historial previo sigue
íntegro en `agenda_revisiones`, sin convertirlo en observaciones inventadas.
Los documentos de transición incluyen el original y su normalización, con
clase `fragmento_del_piloto`. Los grupos de tipo `actividad` gallegos siguen
siendo vocabulario: no se convierten en obras. Si varias fichas traducidas
apuntan al mismo evento, sus referencias se conservan, pero la relación con
una actividad queda sin conciliar; no se fusionan fichas por título.

La clasificación temática común mantiene sus IDs y su catálogo. Los eventos
del piloto conservan sus correspondencias revisadas; FEB y ATP/WTA reciben
Baloncesto y Tenis mediante decisiones explícitas sobre estos flujos, guardadas
con evidencia. No se reclasifican noticias ni temas personales. Reclasificar el
piloto actualiza también sus temas en el núcleo, sin reobservar al proveedor.

## Muestras incorporadas al contraste

Se importan exclusivamente archivos locales, sin llamadas nuevas a proveedores:

- **FEB:** extracción manual revisada de los fragmentos retenidos el 25/10.
  Dos encuentros LF Endesa, cuatro cuartos del 67-69 y dos filas de una tabla.
  El visitante Jairis conserva nombre y papel sin ID inventado. El 0-0 de la
  ficha pendiente no produce resultado. El marcador contrastado no se etiqueta
  como FINAL: esa señal no estaba acreditada. La clasificación permanece
  parcial y sin jornada de corte deducida.
- **WTA:** JSON Site API recortado a tres encuentros reales: individuales,
  dobles y horario TBD. Conserva las estructuras originales de esos encuentros,
  GUID de personas, UID de parejas, cuadro y torneo. En individuales, GUID,
  UID e ID declarados apuntan a la misma persona, sin conexiones con noticias.
  Se normalizan los sets y desempates del subconjunto final contrastado.

FEB **no es todavía un parser HTML ni un recolector operativo**. El lector
offline ESPN admite el subconjunto ATP/WTA, pero el contraste retenido de este
incremento es WTA. Retirada, walkover y formatos de superdesempate no generan
un marcador normalizado supuesto; conservan datos y estado de origen. No se
interpreta `format.regulation.periods` como regla del número de sets.
Las condiciones pendientes viajan en las fuentes; no hay publicación nueva.

Los detalles de los recortes, URLs y fechas están en el
[README de las muestras](../tests/fuentes/muestras_calendario/README.md).

## Ejecución y recuperación

```sh
# En la base remota: proyectar el piloto, sin consultar fuentes.
# El workflow manual prepara-nucleo realiza antes una copia y la conserva.
python calendario.py --turso --preparar-nucleo
python calendario.py --turso --exportar-nucleo --salida /tmp/nucleo.json

# Contraste sobre una copia temporal, sin mantener otra base de trabajo.
python calendario.py --db /tmp/copia.sqlite --preparar-nucleo \
  --entrada-feb tests/fuentes/muestras_calendario/feb-revisada.json \
  --entrada-tenis tests/fuentes/muestras_calendario/espn-wta.json --circuito wta
python calendario.py --db /tmp/copia.sqlite --exportar-nucleo --salida /tmp/nucleo.json
```

Preparar el núcleo no cambia `actualizado`, consultas, registros ni recogidas
del piloto. Repetir la misma preparación no escribe ni avanza la revisión.
La importación explícita de una muestra sí añade sus observaciones al núcleo,
identificadas como tales. No revalida los eventos en el proveedor.

El workflow `Calendario (piloto)` añade `preparar-nucleo`: copia previa
conservada antes de modificar Turso, exportaciones, copia posterior y comparación
de IDs, alias, originales y auditorías. No importa las muestras deportivas en
Turso ni programa recogidas. Las recogidas existentes actualizan la proyección
cuando la base ya tiene núcleo. Se mantienen límites, control de revisión y
reversión transaccional compartidos con el piloto.

## Verificación y trabajo pendiente

La prueba sobre una copia del estado real conserva las filas completas de
fuentes, regiones, grupos, eventos, registros, vínculos, recogidas y revisiones.
Los 313 eventos originales y todos sus alias sobreviven; con las muestras se
obtienen 318 eventos, tres resultados y una clasificación parcial. La exportación
v2 coincide con la base reabierta, sin errores de integridad ni claves foráneas.
No constituye una prueba de frescura o exhaustividad de FEB/ESPN.

Las pruebas específicas incluyen migración 3→4 y rollback, los adaptadores
anteriores, concurrencia Turso simulada con SQL real, copia y reapertura,
horarios ambiguos, fechas sin hora, conflictos de fuentes, identidad de dobles,
clasificaciones independientes y rechazo de métricas o participaciones ajenas.
La suite completa se ejecuta en CI.

Siguen pendientes la conciliación reversible entre proveedores, correspondencias
municipales comunes, revalidación y archivo por fuente, recolectores deportivos,
auditoría específica de cambios editoriales de políticas, publicación para el
navegador, UI, guardados/seguimientos personales y su sincronización. La resolución
de objetivos implementada permite diseñar ese seguimiento; no activa novedades,
recordatorios ni enlaces con artículos.
