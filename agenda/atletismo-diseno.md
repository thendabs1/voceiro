# Diseño del calendario de atletismo

Estado: diseño con primera importación local revisable, 2 de noviembre de 2026.
Avance y límites de la entrega: [integración inicial](atletismo-integracion.md).
El usuario confirma circuitos y campeonatos internacionales WA, incluidas
categorías inferiores, y todo el calendario deportivo RFEA: edades, máster,
clubes y carreras. Después selecciona RFEA, Galicia y Cataluña como primeras
capas, incluidas competiciones y tecnificación, e inscripción como metadatos.
World Athletics queda para una entrega posterior independiente.

## Dos integraciones independientes

- [World Athletics](atletismo-world-athletics.md): seguimiento internacional
  por circuito, campeonato y temporada.
- [RFEA](atletismo-rfea.md): calendario deportivo completo y preparación de
  correspondencias con federaciones territoriales.

Cada fuente tiene lector, identidad, selección, presupuesto y cobertura propios.
Un fallo RFEA no bloquea una actualización WA ni al contrario. Comparten el
núcleo de agenda y las proyecciones de lectura existentes; no se necesita una
base nueva ni un lector genérico de webs federativas.

## Qué verá el lector

En Deportes, Atletismo permite seguir circuitos internacionales o el calendario
RFEA; la federación es la procedencia, no una competición. Una cita muestra
nombre, días de celebración, sede, disciplina, categoría y enlace original,
según lo que esté acreditado. La hora solo aparece si existe. Más adelante,
una territorial podrá aportar controles, jornadas y campeonatos regionales.

Separar dimensiones: circuito, disciplina, edad, ámbito federativo y ubicación.
«RFEA», «Sub-20», «ruta» y «España» no son categorías equivalentes. Las carreras
internacionales de RFEA no se sitúan automáticamente en España. Una competición
puede pertenecer a varios circuitos y contener varias disciplinas/categorías.
No crear una cita por cada etiqueta.

Ejemplos de navegación deseada: Diamond League; todo el calendario RFEA;
cross de cualquier edad; campeonatos sub-20; carreras próximas a una localidad
solo cuando exista ubicación acreditada. Los filtros de disciplina/edad aún
no están implementados: primero conservar los datos; añadir controles comunes
solo con vocabularios contrastados y disponibilidad suficiente.

Unidad inicial: una competición o meeting fechado; su duración puede ser de
varios días. Una prueba concreta (100 m, jabalina) o sesión solo se añade cuando
el programa de la fuente la identifica y fecha. No convertir una lista de
disciplinas en sesiones con horas inventadas. Una prueba coincidente con un
campeonato puede contener dos entidades relacionadas: no son necesariamente
duplicados.

## Solapamientos y actualizaciones

Conservar observaciones y referencias por proveedor. El usuario confirma
[comparación automática e issues para los casos dudosos](atletismo-coincidencias.md).
Una coincidencia inequívoca permite compartir identidad usando fechas, sede,
nombre y referencias, con comprobaciones de categorías y alcance. Las
discrepancias conservan ambas observaciones; no se elige la última descarga
como autoridad. Los casos ambiguos mantienen sus identidades hasta revisión.
Antes de activar ambas fuentes juntas se debe medir el solape de una ventana
y revisar los casos principales para que la vista no se llene de duplicados.

Identificar cambios de fecha por ID estable. La desaparición de una ventana
no acredita cancelación. Conservar última lectura buena y fecha de comprobación;
«lectura completa de la ventana» no significa «temporada terminada». No deducir
el cierre anual del último evento recibido. El control deportivo actual tiene
supuestos de temporada que habrá que contrastar con estos calendarios abiertos.

## Entregas y comprobación

La prioridad posterior es RFEA + Galicia + Cataluña. Ya existe importación
local y selección de sus tres capas, sin activar recogida ni publicación.
El orden original de investigación que sigue se conserva como alcance pendiente,
con WA aplazada respecto a las federaciones seleccionadas.

1. Cerrar contrato WA con muestras por circuito, categorías inferiores y
   paginación completa de una ventana; preparar importación local revisable.
2. Cerrar contrato RFEA con identidad en varias fichas, meses consecutivos,
   cambio de año y prueba de varios días; revisar Nivel II.
3. Integrar cada fuente por separado en recogida y publicación; revisar solapes
   antes de activar ambas. Mantener los presupuestos actuales hasta medir.
4. Elegir una territorial y medir qué citas nuevas aporta; su lector se incorpora
   usando el mismo contrato, sin cambiar retrospectivamente las identidades.

Propuesta operativa a medir: carga de la temporada actual y la siguiente que
esté anunciada; actualización por ventanas, con mayor frecuencia cerca de la
celebración y revisión menos frecuente del resto. No descargar el histórico
mundial en cada pasada. Si una ventana excede el presupuesto, dividirla en
unidades con cobertura explícita antes de publicar; no aceptar un prefijo
truncado ni elevar límites automáticamente.

Tests completos en CI cuando exista código: identidad ante reprogramación,
paginación y fallo parcial, repetición por día/circuito, fin inclusivo frente
al iCalendar exclusivo, filtros múltiples, cambio de temporada, solapes,
presupuesto y conservación de lectura válida. En esta fase se revisaron código,
muestras públicas y documentos; solo hay cambios de documentación.

Resultados y estadísticas quedan en su diseño aparte. Los calendarios pueden
conservar enlaces a ellos sin descargar inscritos o resultados para crear citas.
