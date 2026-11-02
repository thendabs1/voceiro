# Contrato propuesto: RFEA y futura integración territorial

Diseño de 2 de noviembre de 2026; sin adaptador activado.
Actualización: seleccionadas Galicia y Cataluña junto a RFEA, incluyendo
tecnificación. Hay lectores de capturas e importación local revisada, descritos
en [la primera integración](atletismo-integracion.md), con inscripción separada
de celebración. Este contrato sigue recogiendo lo pendiente de la recogida.
Fuente: https://atletismorfea.es/calendario . Se incluye todo su calendario
deportivo: absoluto, menores, máster, clubes, ruta, pista, short track,
cross, marcha y trail; también citas internacionales que publique.
Excluir actividades federativas, cursos y reuniones administrativas.

## Calendario e identidad

El script público `modules/custom/calendario/js/calendar.js` construye:

`/ajax/calendario/{timestamp}/{tipo}/{area}/{disciplina}/{rankingWA}/{categoria}/{temporada}/{desde}/{hasta}/{titulo}`

Devuelve JSON Drupal con HTML. La muestra de noviembre contiene navegación
mensual y 52 apariciones para 35 URLs distintas. Obtener cada mes y consolidar
la misma competición repetida en varios días y meses. No rellenar días
intermedios de pruebas no consecutivas ni tomar la última aparición observada
como final definitivo si falta el mes siguiente.

Descubrir IDs de temporada de las opciones (2026=464, 2027=482 en la muestra).
`tipo=Deportivo`, sin restringir edades o disciplinas. El campo «Área» tiene
EA, RFEA y WA: **no es un selector de federaciones territoriales**. «Categoría»
mezcla edades, formato, distancia y actividades: conservar valores originales
y normalizar por una tabla explícita; no transformarlos todos en edad.
«Internacional» entre disciplinas tampoco acredita modalidad deportiva.

La ficha de IV Edición 21K Ciudad de Huelva acredita dos referencias:

- Configuración Drupal `path.currentPath = championship/65127`.
- `data-sfid = a0bQs00000FQCJSIA5`, también usado en el enlace público de
  pruebas de la competición y en el script de documentos.

Esto mejora la revisión inicial, que solo había identificado el slug. Son
**candidatos a identidad**, no estabilidad demostrada: contrastar varias
competiciones y temporadas, cardinalidad entre ambos y conducta al cambiar
de URL/fecha. Propuesta: referencia interna RFEA por `championship`, SFID como
segunda referencia y URL canónica como enlace. No asignar aún el SFID como
identificador común con territoriales sin observar el mismo valor allí.

Descargar fichas para resolver identidad encarece la carga inicial. Persistir
la correspondencia URL/referencias, actualizarla cuando proceda y medir el
coste de reconciliar cambios; no hacer una petición por cita y visitante.
Si cambia el slug, debe existir reconciliación que evite crear otra identidad.

## Qué conservar y cómo representarlo

Nombre, referencias, URL canónica, días efectivos de celebración, sede literal,
disciplina, categoría, ámbito y enlace al organizador cuando estén publicados.
La ficha revisada muestra «1 de Noviembre» sin año en su texto visible: el año
ha de quedar acreditado por el calendario/temporada, sin usar el año del servidor.
Inscripción, documentación y programa son campos distintos de celebración.

Una competición puede tener varios días, categorías y pruebas. No crear un
evento nuevo por cada aparición mensual. Tampoco identificar «edición» por
nombre recurrente: conservar identidades de la fuente. Crear sesiones/pruebas
solo con programa identificado y fechado. Un Excel de pruebas no implica
que todas tengan hora o que el programa esté cerrado.

La fuente ofrece endpoints de documentos e inscritos mediante SFID. Para agenda
basta el calendario y las fichas necesarias: no hace falta descargar inscritos.
Guardar documentos oficiales enlazados cuando aporten programa, sin interpretar
su existencia como calendario completo o estado final de competición.

## Pistas para federaciones territoriales

La circular RFEA 136/2025, de inscripción del calendario 2026, indica que las
solicitudes se tramitan a través de federaciones autonómicas. Contempla además
incluir determinadas pruebas autonómicas en calendario RFEA Nivel II.
Por tanto, existe relación organizativa y solapamiento; **no acredita que el
calendario RFEA incluya todos los calendarios territoriales**.

Fuente primaria:
https://www.atletismorfea.es/sites/default/files/2025-07/136-2025%20Inscripcion%20de%20Competiciones%20en%20Calendario%20RFEA%202026.pdf

La web enlaza un calendario nacional Nivel II separado. Antes de declarar
«RFEA completa», comprobar si todas esas citas están en el mensual o si hace
falta otra distribución, sin importar dos veces la misma competición.
Nivel II, categoría WA y ámbito territorial son dimensiones distintas.

Sondeo inicial de las dos territoriales, posteriormente seleccionadas para
la primera integración. La revisión posterior acredita una API catalana
con ID propio y paginación (véase el documento de integración):

| Fuente | Comprobado en muestra | Pendiente |
| --- | --- | --- |
| Galicia, https://atletismo.gal/competicions/ | Calendario propio WordPress, tipo `competition`, filtros `cp_date`, `cp_ambit[]` (GAL en la muestra), `cp_competition_type[]`; enlaces a servicios RFEA | Identidad de cita, paginación, cobertura, exportaciones y correspondencias con RFEA |
| Cataluña, https://fcatletisme.cat/events/?ical=1 | iCalendar con 30 VEVENT, URL de ficha, categorías, lugar, organizador y modificación; UID incluye un número y marcas temporales | El feed no acredita calendario completo; estabilidad del identificador al reprogramar y paginación/ventanas |

No confundir un `wp-json` anunciado por un formulario de contacto con una API
de calendario: en Galicia la referencia observada pertenece a Contact Form 7.
En Cataluña, `DTEND;VALUE=DATE` es exclusivo; no añade un día de celebración.
El UID completo contiene fechas, por lo que no se debe asumir inmutable ni
extraer un supuesto ID de su prefijo sin contrastar ficha/API.

El SFID visto en RFEA es una pista para buscar referencias compartidas en
fichas/documentos territoriales. No se encontró una correspondencia demostrada
en estas muestras. Enlaces a la intranet o a homologaciones no la acreditan.

## Incorporar una territorial después

Lector e identidad propios, relación de federación organizadora separada del
lugar y del proveedor. Comparar una ventana común por referencias verificables
y medir citas adicionales (controles, ligas provinciales, jornadas escolares,
campeonatos autonómicos). Revisar candidatos a solape sin fusionar por título.
La autoridad sobre fecha/estado puede variar por competición y debe declararse,
sin dar prioridad automática a RFEA o a la territorial para todos los campos.

Los organizadores pueden compartir pruebas abiertas y campeonatos coincidentes:
revisar si son una sola cita con varias categorías o entidades relacionadas.
No borrar las diferencias con una deduplicación global. La cobertura de cada
fuente se evalúa por separado aunque se representen juntas.

## Condiciones para darlo por integrado

Identidad contrastada en varias fichas, meses consecutivos y cambio de año,
prueba de varios días, fechas no consecutivas, estado cancelado/aplazado cuando
se encuentre, completitud mensual y cobertura de Nivel II. Medir carga inicial
de fichas y actualización incremental dentro del presupuesto existente.
Conservar última lectura buena ante fallos; ausencia no significa cancelación.
Validación local de muestras y suite completa en CI al implementar.
