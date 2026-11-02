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

Ya existen importación local, selección de las tres capas, representación
de circuitos/programas y comparación automática con revisión de casos ambiguos.
La [recogida manual](atletismo-recogida.md) ya guarda las tres fuentes; cron
y publicación siguen sin activar. Queda:

1. Aplicar en remoto la conciliación revisada y resolver las
   [incidencias abiertas](atletismo-revision-incidencias.md); completar
   Nivel II y contrastar cambio de año y citas de varios días.
2. Extender la clasificación de circuitos y tecnificación desde las fichas,
   resolver relaciones de conjunto/parte y medir solapes en una ventana común.
3. Reconciliar citas trasladadas fuera de ventana y, después, activar cron
   y publicación con presupuesto por fuente y última lectura válida.
4. World Athletics, en otra entrega: cerrar filtros por circuito, categorías
   inferiores, identidad y paginación completa antes de importar.

Propuesta operativa a medir: carga de la temporada actual y la siguiente que
esté anunciada; actualización por ventanas, con mayor frecuencia cerca de la
celebración y revisión menos frecuente del resto. No descargar el histórico
mundial en cada pasada. Si una ventana excede el presupuesto, dividirla en
unidades con cobertura explícita antes de publicar; no aceptar un prefijo
truncado ni elevar límites automáticamente.

La suite completa corresponde a CI. Los contratos implementados y sus
comprobaciones se documentan en [integración](atletismo-integracion.md),
[Nivel II](atletismo-nivel-ii.md) y [coincidencias](atletismo-coincidencias.md).
La operación futura deberá cubrir además presupuestos, ventanas incompletas,
cambios de temporada y conservación de lectura válida.

Resultados y estadísticas quedan en su diseño aparte. Los calendarios pueden
conservar enlaces a ellos sin descargar inscritos o resultados para crear citas.
