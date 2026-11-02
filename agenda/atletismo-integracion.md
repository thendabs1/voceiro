# Primera integración: RFEA, Galicia y Cataluña

2 de noviembre de 2026. Primera entrega **local y revisable**, sin activar
recogida periódica ni publicar estas fuentes. World Athletics se mantiene
para otra entrega. Se incluyen competiciones y tecnificación, según la
selección confirmada por el usuario.

Revisión posterior: [metadatos, cobertura RFEA y solapamientos](atletismo-revision-metadatos.md).
Las 89 entradas de la demostración no son 89 competiciones únicas; faltan
correspondencias entre fuentes y separar artículos de circuito de sus jornadas.

## Capas y modelo

Atletismo tiene tres capas seleccionables y seguibles con el mismo mecanismo
de las ligas: `atletismo-rfea`, `atletismo-fga`, `atletismo-fca`. Son colecciones
federativas, no ligas: agrupan muchas competiciones. Se representan mediante
`agrupacion/coleccion`, con citas `evento/encuentro` y relación `pertenece_a`.
Cada cita tiene un contenedor deportivo `agrupacion/competicion` y rol
`agenda.principal`; con programa fechado reutiliza la estructura de los GP,
sin asignarle clase `gran_premio`. La clase de la cita sigue siendo `encuentro`,
también cuando más tarde se le añaden sesiones, para conservar su identidad.
La procedencia y la identidad de cada federación permanecen separadas. Las
capas no sitúan las citas automáticamente en España, Galicia o Cataluña.

No hace falta una migración SQL para esta entrega. El núcleo admite bloques
con evidencia y el detalle de lectura es JSON. Se añade `atletismo` a la
proyección del detalle, con selección y procedencia. Las tarjetas y las
cuentas del calendario siguen usando solo la fecha de celebración.

## Información observada

| Fuente | Información disponible | Tratamiento inicial |
| --- | --- | --- |
| [RFEA](https://atletismorfea.es/calendario) | Nombre, días en el mes, disciplina, sede; ficha con `championship` ID, SFID, área, categoría cuando consta, web y documentación | Identidad por ficha. Conservar área y categoría literales. La lectura mensual produce días observados; exige acreditar los extremos antes de importar |
| [Galicia](https://atletismo.gal/competicions/) | ID WordPress, fechas, modalidad, lugar literal, delegación, ámbito, relación con circuito o plan; fichas con organización, documentos, inscripción y enlaces de resultados cuando existen | Mantener tecnificación. La relación con circuito se conserva como nombre y URL; todavía no crea agrupación sin resolver ID propio del padre |
| [Cataluña](https://fcatletisme.cat/wp-json/tribe/events/v1/events?per_page=2) | ID y URL, fechas, día completo, zona, categorías con ID, recinto, municipio/país cuando constan, organizaciones, web y modificación | Preferir API frente a ICS. Paginación y total obligatorios. Categorías separadas: modalidad, promoción y máster no son equivalentes |

No todos los campos están rellenos en todas las citas. No extraer edades del
título ni interpretar un nombre de recinto como municipio acreditado. El lugar
literal ya se muestra; faltan correspondencias territoriales para búsquedas
locales por códigos INE. Se conservan categorías originales antes de diseñar
filtros comunes de modalidad, edad o tipo de actividad.

Muestras: Galicia noviembre contiene 35 artículos y diciembre se contrastó
como mes separado. Cataluña noviembre–diciembre devuelve 53 citas en dos
páginas: limita a 50 por página aunque se soliciten 100. El lector exige todas
las páginas, totales coherentes y IDs únicos. La muestra catalana es íntegramente
de día completo; un horario con hora todavía falla explícitamente hasta
contrastar el convenio UTC/local. No inventar medianoches desde `all_day`.

La [exportación RFEA 2026](https://atletismorfea.es/ajax/calendario/excel/2026/Deportivo)
contiene 464 filas de datos y cinco columnas: fecha, disciplina, competición,
área y ciudad. Se observaron rangos completos entre meses, y filas repetidas.
La hoja no contiene hipervínculos ni una columna de ID. Es útil para contrastar
fechas; no se une automáticamente a una ficha por nombre. El mensual observado
repite las competiciones por día: tampoco convertir sus límites de ventana en
inicio/fin definitivos. La revisión posterior confirma que Nivel II incluye
citas ausentes del mensual: su integración e identidad siguen pendientes.

## Inscripción y documentación

Guardar `metadatos.inscripcion` en el contrato de entrada; se publica dentro
de `atletismo.valor.inscripcion`, separado de `programacion`:

- `plazo_textual`: texto original, incluso si no se puede normalizar.
- `periodo`: intervalo de días con el contrato temporal existente, si las
  fechas de apertura y cierre están acreditadas.
- `hora_cierre_literal`: hora anunciada, todavía sin convertirla en instante
  ni asignar zona por el dominio de la web.
- `enlaces`: nombre y URL de inscripción pública. Un enlace a login solo
  indica dónde se tramita; no acredita inscripción abierta.

La ficha gallega contrastada anuncia competición el 7/11/2026 e inscripción
del 1/10 al 2/11, con cierre a las 20:00. Se conserva el plazo y se muestra
en el detalle bajo «Inscripción». No se crea una segunda cita por defecto.
Reglamentos y documentos conservan nombre y URL, sin descargar inscritos.

Para un futuro «inscripción abierta» o avisos de cierre habrá que acreditar
zona/hora, distinguir cupo agotado, ampliaciones y plazos por prueba o categoría,
y decidir la antigüedad máxima de la comprobación. No deducir disponibilidad
solo del intervalo ni convertir la fecha límite en la fecha de competición.
Si otras disciplinas necesitan estos datos, promover el bloque a contrato
común de inscripción; todavía no requiere una tabla nueva.

## Entrada y uso local

`agenda.atletismo` ofrece lectores puros de capturas guardadas:
`leer_cataluna(paginas)`, `leer_galicia(html)`,
`leer_ficha_galicia(html)` y `leer_rfea(mes, respuesta, fichas)`.
No hacen peticiones. El lector de ficha gallega complementa metadatos de la
cita correspondiente; el llamante debe verificar su identidad antes de unirlos.

El importador recibe un documento revisado con este formato:

```json
{
  "version": 1,
  "fuente": "fca",
  "eventos": [{
    "id": "89084",
    "nombre": "26è Cros Ciutat de Cerdanyola",
    "url": "https://fcatletisme.cat/event/26e-cros-ciutat-de-cerdanyola/",
    "inicio": "2026-11-07",
    "fin": "2026-11-07",
    "lugar": {"nombre": "Cerdanyola del Vallès"},
    "metadatos": {}
  }]
}
```

`fuente` admite `rfea`, `fga` y `fca`. `inicio` y `fin` son días inclusivos
de celebración. La identidad es el ID propio de la fuente, independiente de
nombre, URL o fecha. RFEA no acepta directamente el resultado mensual sin
extremos acreditados. Los días no consecutivos requieren varias celebraciones
relacionadas; no se rellenan los huecos con un intervalo continuo.

```sh
python calendario.py --db /tmp/atletismo.db --entrada-atletismo /tmp/fca.json --exportar-nucleo --salida /tmp/atletismo-nucleo.json
```

La opción es repetible para cargar las tres fuentes en la misma base. La
proyección y la lectura existentes reciben las nuevas capas. Repetir una cita
con el mismo ID actualiza fecha/nombre sin duplicarla. No se fusionan citas de
federaciones distintas sin correspondencia contrastada.

### Una cita con varias procedencias

El usuario confirma este criterio: una sola cita con varias capas cuando se
acredite equivalencia; discrepancias de fecha o sede pendientes de revisión.
`atletismo-equivalencias.json` registra IDs por federación, clave común estable,
fecha/motivo de revisión y enlaces de evidencia. La primera equivalencia es
España 5 km máster 2026 en Negreira: RFEA 64837, FGA 113590 y FCA 82885.
La carrera popular A Clásica sigue siendo otra cita.

El importador asigna identidad compartida al encuentro y su contenedor. Cada
referencia y observación conserva su proveedor. Las relaciones permiten llegar
a las tres capas. No se compara el título para consolidar. Una equivalencia
nueva sobre identidades anteriores distintas exige conciliación explícita;
no se reescribe el historial ni se borran filas automáticamente. Los borradores
locales anteriores se pueden regenerar en una base nueva con las entradas revisadas.

La publicación resuelve los bloques de atletismo con las fuentes permitidas
en esa proyección. Una discrepancia activa `conflicto`, sin dar prioridad a
RFEA ni a la última descarga. `atletismo.variantes` conserva por fuente nombre,
metadatos, programación, lugar y procedencia. En el detalle, la inscripción
se muestra desde esas variantes aunque difieran otros metadatos; cada plazo
indica la procedencia y los idénticos se agrupan. La diferencia literal entre
«Negreira» y «Negreira (La Coruña)» conserva discrepancia de sede hasta revisión.

### Circuitos, planes y programa fechado

El contrato acepta `agrupaciones` opcionales con `id`, `nombre`, `url` y
`clase` (`circuito`, `ciclo` o `coleccion`). Cada cita puede indicar `grupo`
con uno de esos IDs. Deben declararse en la entrada que los use. No se
identifica un circuito por semejanza del título ni se toma su primera fecha
como una competición adicional. Un ID de agrupación no puede aparecer también
como cita; si se importó así en un borrador anterior, se exige conciliación
explícita. Para las demostraciones locales se puede regenerar una base nueva
con la entrada revisada; no se retiran datos existentes automáticamente.

La muestra `tests/fuentes/muestras_calendario/atletismo/fga-circuito.json`
representa el circuito Deputación A Coruña (127481) y sus tres jornadas del
7, 14 y 28/11: la lectura devuelve tres citas y conserva los huecos. El contrato
ya lo admite; el lector bruto FGA todavía requiere esa clasificación revisada.

Una cita admite `programa` opcional, lista de sesiones identificadas:
`id`, `nombre`, `tipo_sesion`, `inicio`, `fin` opcional, `zona` opcional,
`lugar` y `url` opcionales. `inicio` debe ser fecha ISO o instante con offset;
una hora sin offset no se interpreta en la zona del servidor. Los días de la
sesión deben caer dentro de los días acreditados de la cita principal. No se
inventa fin si no consta. Los IDs de sesión se delimitan por competición, no
por nombre/fecha: la reprogramación conserva identidad. La omisión de una
sesión en una entrada parcial no la cancela ni retira automáticamente.

La proyección incorpora las sesiones a `programa` y devuelve una sola tarjeta
para la cita principal; la búsqueda y las facetas incluyen sus sesiones y
agrupaciones. Se rechaza asociar una sesión al principal de otra agrupación.
Las filas del Excel RFEA de pruebas sin fecha siguen siendo metadatos/enlaces,
no sesiones. Las muestras de programa de los tests son ficticias y solo
verifican el contrato; no acreditan horario real de ninguna competición.

## Antes de activar la recogida

Cerrar cobertura RFEA y Nivel II, extender la resolución revisada de circuitos gallegos,
medir solapes de una ventana común y preparar recogida incremental con
presupuesto por fuente. Las inscripciones requieren lectura de fichas adicional:
no hacer una petición por cita y visitante. Conservar última lectura válida y
no deducir cancelación de una ausencia. El control por temporadas deportivas
cerradas no debe reutilizarse sin adaptación para calendarios federativos abiertos.

Verificación de esta entrega: muestras públicas acotadas, importación y
publicación locales, lectura SQL del detalle con inscripción, identidad ante
reprogramación, rechazo de páginas truncadas/repetidas y selección de capas en
la interfaz. La ampliación del modelo comprueba además circuito con tres
jornadas, programa añadido después sin cambio de identidad, sesiones sin
fecha o fuera de intervalo, rechazo de asociaciones entre competiciones y
regresiones de GP. Pasan trece pruebas de atletismo y las selecciones de núcleo,
fuentes oficiales, adaptadores deportivos, publicación, lectura e interfaz.
La suite completa pasó en [CI](https://github.com/thendabs1/voceiro/actions/runs/41466633236)
para el commit `adc3a2fa` del [PR 259](https://github.com/thendabs1/voceiro/pull/259).
La entrega sigue sin activar recogida ni publicación en producción.
