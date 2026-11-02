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

El lector usa `championship` como referencia de ficha y conserva el SFID.
Se contrastaron cinco fichas, descritas en la
[revisión de identidad](atletismo-revision-metadatos.md#rfea-lo-que-sí-se-ha-contrastado).
Queda acreditar estabilidad ante cambios de temporada, slug y edición; no
se usa SFID como identificador común con territoriales sin observarlo allí.

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

Nivel II aporta citas ausentes del mensual. Ya existe
[extracción del PDF y resolución de identidades](atletismo-nivel-ii.md),
con cobertura incompleta. No representa otra capa independiente de RFEA.
Nivel II, categoría WA y ámbito territorial son dimensiones distintas.

Galicia usa IDs WordPress y Cataluña una API paginada con ID propio,
preferida al ICS. El [contrato de integración](atletismo-integracion.md)
documenta muestras, límites y uso local. La
[comparación automática](atletismo-coincidencias.md) cruza referencias directas
y coincidencias inequívocas, y envía las dudas a revisión. No se exige registrar
manualmente cada correspondencia ni se deduce identidad del UID con fechas.

## Incorporar una territorial después

Lector e identidad propios, relación de federación organizadora separada del
lugar y del proveedor. Comparar una ventana común por referencias verificables
y medir citas adicionales (controles, ligas provinciales, jornadas escolares,
campeonatos autonómicos). Aplicar el contrato de coincidencias y revisar los casos ambiguos.
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
