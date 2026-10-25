# Servicios y reglas de recopilación — revisión del 24/10/2026

Documento de diseño. Las reglas siguientes son una propuesta para contrastar
con el usuario; no activan recopilación periódica ni cambian el modelo.
No se ha vuelto a utilizar OpenCode.

Continuidad posterior: el piloto incorpora Vidmar y persistencia Turso con
copias SQLite, descritos en [el diseño de almacenamiento](../persistencia.md).
Las propuestas de cadencia de este informe siguen sin activarse.

## Vidmar: dos selecciones del mismo calendario

Se descargaron y compararon los bloques VEVENT completos de los dos enlaces
publicados en [la portada](https://f1.vidmar.net/):

| Tipo observado | [Completo](https://f1.vidmar.net/calendar.ics) | [Principal](https://f1.vidmar.net/calendar_qr.ics) |
| --- | ---: | ---: |
| Clasificación | 23 | 23 |
| Carrera | 23 | 23 |
| Clasificación sprint | 6 | 6 |
| Sprint | 6 | 6 |
| Entrenamientos libres | 57 | 0 |
| Pruebas de pretemporada | 3 | 0 |
| Presentaciones de coches | 10 | 0 |
| Total | 128 | 58 |

Los 58 UID del principal están en el completo y sus bloques coinciden,
incluidas las alarmas. El reducido contiene sprint aunque la portada solo
mencione clasificación y carrera. Son cantidades de esta respuesta, no una
garantía de cobertura de la temporada ni una comprobación del horario oficial.

Propuesta: importar el completo una vez y ofrecer selecciones por actividad.
No representar los dos enlaces como proveedores independientes ni duplicar
los eventos. Preservar el UID literal dentro del espacio de la fuente; no
construir otro ID desde el título o la fecha. Los UID observados contienen
nombres: su estabilidad frente a renombrados todavía debe comprobarse.

Hay 115 inicios con hora UTC y 13 con fecha sin hora. Las tres pruebas son
intervalos de días; las diez presentaciones no declaran fin. Por ejemplo,
la primera prueba tiene DTSTART 20260126 y DTEND 20260131: en ICS el fin es
exclusivo. No convertir esos días a medianoche UTC. El feed incluye alarmas,
que no son citas. No se han observado RRULE ni RECURRENCE-ID en esta muestra;
un lector ICS debe detectarlos y admitirlos o rechazar explícitamente lo
que no soporte, sin perder ocurrencias en silencio.

Ambas respuestas ofrecen ETag. Todas las SEQUENCE observadas son 0 y los
DTSTAMP son iguales dentro de cada respuesta; no bastan para saber si un
horario cambió entre recogidas. Comparar también el contenido normalizado.
El fin programado de una carrera no acredita su duración real ni su resultado.
No se han verificado condiciones expresas de republicación en esta revisión.

## Estado de las demás revisiones

| Fuente | Evidencia y situación |
| --- | --- |
| Cultura de Galicia | Adaptador del piloto y consulta real completa comprobados. |
| Kulturklik | Catálogo y muestras es/eu revisados en el lote 1. Falta validar el conjunto, las relaciones y las correspondencias territoriales antes de integrar. |
| Agendas de Diario Vasco y La Verdad | Fichas consultadas en la investigación inicial: discrepancias entre horario visible y marcado estructurado, e intervalos de exposición largos. Falta probar recorrido completo y cambios entre pasadas. |
| [F1 Calendar](https://f1calendar.com/generate) | Revisada la página que selecciona entrenamientos, clasificación, sprint y carrera. No se ha descargado ni comparado su ICS generado. |
| [Jolpica](https://api.jolpi.ca/docs/) | Documentación revisada; las peticiones locales de datos terminan por timeout, también en la investigación anterior. Aparcada. Sus [condiciones](https://raw.githubusercontent.com/jolpica/jolpica-f1/main/TERMS.md) limitan el uso gratuito a no comercial. |
| [football-data.org](https://www.football-data.org/pricing) | Contrastadas cobertura y tarifas: gratuito, 12 competiciones, tablas y horarios/resultados con retraso, 10 consultas/minuto. Sin prueba autenticada ni integración. |
| [API-Football](https://www.api-football.com/pricing) | Contrastado el plan gratuito: 100 consultas/día y temporadas limitadas. Sin prueba autenticada ni integración. |
| OpenF1 | **Descartada por el usuario** tras comprobar la restricción descrita abajo. No es candidata para el piloto. |

OpenF1 documenta sesiones, resultados por sesión y clasificaciones de
campeonato en beta, con histórico gratuito desde 2023. Sin embargo, el
24/10 dos peticiones locales de sus ejemplos históricos devolvieron HTTP
401 con una explicación: durante una sesión en directo se restringe toda
la API a usuarios autenticados, también el pasado. Se conserva como
hallazgo de la evaluación; no se continúa su integración.
[Documentación consultada](https://openf1.org/docs/#api-endpoints).

## Reglas mínimas propuestas

1. **Declarar qué ofrece cada flujo.** Calendario, resultados, tablas o
   narración; ámbito, idiomas, formato, atribución, condiciones y límites.
   Un formato o selección alternativo no implica otra identidad del evento.
2. **Separar consulta e identidad.** Guardar alcance y completitud de cada
   recogida. IDs de origen persistentes, originales, primera/última observación
   y cambios; ninguna unión entre proveedores sin evidencia conservada.
3. **Conservar el significado temporal.** Celebración, modificación editorial
   y recogida separadas; fechas sin hora, zona, fin exclusivo y duración
   desconocida explícitos. Repeticiones y excepciones requieren soporte real.
4. **Actualizar con un presupuesto por fuente.** Recogida compartida desde
   servidor, ETag/Last-Modified cuando existan, timeout, límites de tamaño y
   paginación, respeto de Retry-After y espera creciente ante errores.
   Propuesta inicial: agendas diarias y Vidmar cada 6 horas; revisar esa
   cadencia con cambios observados. Resultados y directos necesitan otra
   cadencia, según servicio y cuota, aún por elegir.
5. **Conservar la última salida buena y mostrar su antigüedad.** Una descarga
   fallida o incompleta no sustituye el inventario. Una ausencia no acredita
   cancelación. Distinguir última comprobación HTTP de último cambio del dato.
   Las restricciones temporales de acceso no justifican insistir en bucle.
6. **Filtrar después de recopilar.** Regiones, grupos y actividades producen
   vistas del calendario común. Empezar por la temporada disponible en un
   ICS completo y por intervalos explícitos en una agenda paginada; no
   imponer la ventana de titulares a las citas futuras.

Siguiente contraste propuesto: Vidmar para fechas/selecciones y una segunda
agenda territorial para intervalos/territorio. Elegir por separado un servicio
de resultados; ni el ICS ni una narración periodística sustituyen una tabla
de clasificación estructurada. La frecuencia definitiva, conservación del
estado y publicación quedan pendientes de diseño antes de automatizar.

Verificación de esta revisión: descargas HTTP y comparación local de UID y
bloques de ambos ICS. Solo se modifica documentación; no se ejecutan tests
de código ni se presenta la CI anterior como validación de nuevas integraciones.
