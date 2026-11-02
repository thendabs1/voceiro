# Revisión de atletismo y MotoGP — 2 de noviembre de 2026

Continuación: [diseño común](atletismo-diseno.md),
[contrato WA](atletismo-world-athletics.md) y
[contrato RFEA y territoriales](atletismo-rfea.md). La revisión posterior
identifica candidatos de identidad RFEA (`championship` y SFID) en la ficha;
la estabilidad entre cambios sigue pendiente de contrastar.

## Alcance acordado

Circuitos internacionales de World Athletics (WA) y calendario deportivo
completo de RFEA. El usuario deja para después la revisión de robots y
condiciones; no son un bloqueo de diseño en esta revisión. Esta decisión
sustituye el aplazamiento por permisos descrito en `fuentes.md` para estas dos
fuentes. No se han activado adaptadores, recogidas ni publicaciones.

## MotoGP: comprobación directa

La agenda usa ya `agenda/motogp.py`, fuente oficial, y descarta resultados.
El panel puntual no tiene MotoGP. La ruta ESPN probada
`/apis/site/v2/sports/racing/motogp/scoreboard` responde JSON con código 400 y
`Failed to get events endpoint.` Esto descarta esa ruta, no demuestra que
ESPN carezca de cualquier otra vía.

La base oficial `https://api.pulselive.motogp.com/motogp/v1` respondió sin clave:

- `/results/seasons`: temporadas con UUID y año.
- `/results/events?seasonUuid=UUID&isFinished=true`: eventos y circuito,
  fechas, estado y enlaces a documentos estadísticos.
- `/results/categories?seasonUuid=UUID`: MotoGP, Moto2 y Moto3.
- `/results/sessions?eventUuid=UUID&categoryUuid=UUID`: ocho sesiones del GP
  de Tailandia 2026; FP, PR, Q, SPR, WUP y RAC, con repeticiones de FP y Q.
- `/results/session/UUID/classification?seasonYear=2026&test=false`:
  clasificación de carrera con piloto, equipo, constructor, posición,
  tiempo, diferencia, vueltas, velocidad media, puntos y estado original.
- `/results/standings?seasonUuid=UUID&categoryUuid=UUID`: puntos, victorias,
  podios, victorias/podios sprint y posiciones recientes; PDF oficial enlazado.

Son muestras de una temporada y una carrera, no garantía de cobertura ni SLA.
No traducir estados como `INSTND` por intuición. Los IDs de resultados y agenda
deben relacionarse mediante referencias acreditadas, nunca por nombre del GP.
Recomendación: fuente oficial y caché para resultados y clasificación. Como
alternativa comercial, Sportradar documenta calendario y resultados poscarrera:
https://developer.sportradar.com/racing/reference/motogp-overview .

## Calendario WA

https://worldathletics.org/competition/calendar-results contiene JSON de Next
en `props.pageProps.initialEvents`. Se comprobaron `startDate`, `endDate` y
`offset` como parámetros de URL. Para noviembre-diciembre de 2026 declara
568 registros, páginas de 100; se comprobaron offsets 0 y 100, con comienzos
distintos. No se descargó la ventana completa.

Cada evento aporta ID numérico, inicio/fin, sede textual, disciplinas,
categoría y grupo/subgrupo, y señales `hasResults`, `hasApiResults` y
`hasStartlist`. Esas señales no equivalen a un contrato de resultados probado.
Sin filtros, el total de 40.240 incluye histórico y competiciones nacionales:
no es el volumen anual ni el número que se propone importar.

Grupos anunciados por la fuente: Diamond League meetings (627) y finals
(3520), Continental Tour (3773), Indoor Tour (3677), Label Road Races (3775),
Combined Events Tour (3767), Race Walking Tour (3692), Cross Country Tour
(3664), además de campeonatos mundiales y continentales y Juegos Olímpicos.
Seleccionar mediante esos IDs, tras comprobar los filtros por grupo; no por
palabras del título. Conservar los grupos originales, incluidos los múltiples.
Excluir ventanas administrativas sin competición concreta. Fechas sin hora
siguen siendo fechas: no inventar medianoche, zona o recinto geocodificado.

El lector debe recorrer todas las páginas de su selección y comprobar totales,
IDs repetidos y parámetros antes de publicar. Un fallo conserva la lectura
anterior y no acredita cancelaciones. Usar ventanas acotadas y presupuesto;
no consultar el sitio por cada visitante del calendario.

## Calendario RFEA

https://atletismorfea.es/calendario carga sus citas mediante
`/modules/custom/calendario/js/calendar.js`. El script acredita esta ruta:

`/ajax/calendario/{timestamp}/{tipo}/{area}/{disciplina}/{rankingWA}/{categoria}/{temporada}/{desde}/{hasta}/{titulo}`

Se comprobó `1/Deportivo/0/0/0/0/464/2026-11-01/2026-12-31/0`:
respuesta Drupal JSON con HTML insertado en `#calendar_container`. Aunque
se pidieron dos meses, el contenido declara **noviembre de 2026** y contiene
navegación mensual. No asumir que los filtros eliminan esa paginación.
Se contaron 52 apariciones y 35 URLs distintas de campeonato: una prueba de
varios días se repite por día. Consolidar dentro de la fuente sin fabricar
52 eventos independientes. Las fechas de inscripción no son celebración.

La página publica IDs de temporada: 2026=464 y 2027=482; descubrirlos de las
opciones en cada recogida, no fijarlos en código. Separar `Deportivo` de las
actividades federativas. Hay disciplina, título, localidad y URL de ficha.
La ficha probada no permitió acreditar un ID inmutable de competición ni
un contrato completo de fechas: los IDs de patrocinadores del pie no sirven.
Pendiente resolver identidad y reprogramaciones antes de importar.

RFEA incluye pruebas internacionales (por ejemplo Dakar), por lo que solapa
con WA. Conservar las dos referencias y unir solo mediante correspondencia
verificada; no fusionar automáticamente por título, sede o fecha.

## Resultados, estadísticas y almacenamiento

Hoy atletismo no tiene resultados en el panel: no existe una API integrada
que mantener. La decisión previa de consultas con caché corresponde a otros
deportes. Recomiendo extender ese patrón primero, acreditando los recursos
de resultados de WA y RFEA antes de prometer una cobertura equivalente.

Fuentes estadísticas revisadas en web, sin acreditar todavía extracción completa:

- https://www.diamondleague.com/results-standings/statistics/ : mejores marcas
  de temporada e históricas, récords del circuito y de meetings, filtros de
  viento, prueba, sede y una marca por atleta o lista detallada.
- https://atletismorfea.es/ranking/ : filtros de temporada, categoría, sexo,
  prueba, viento, federación, club y cronometraje; marcas, atleta, club,
  competición, ciudad y fecha. Es una lista de marcas, no la clasificación
  mundial por puntos.
- https://worldathletics.org/world-rankings/introduction : ranking por
  puntuaciones de marca y puesto, promediadas según sus reglas y periodo.
  Conservar fecha de corte y posición oficial; no recalcular desde un
  subconjunto de resultados. Se publica los miércoles.
- https://stats.worldathletics.org/ : Stats Pro solicita acceso; no tratarlo
  como API pública disponible.

Primera presentación útil: resultados de una competición por prueba, ronda y
serie; mejores marcas por año/prueba; récords; ranking oficial con fecha de
corte; clasificación Diamond League por disciplina. Mantener separados
ranking mundial, mejores marcas y puntos del circuito. Viento, pista corta,
categoría, cronometraje, DNS/DNF/DQ y condición de homologación importan;
no comparar tiempos de modalidades distintas como si fueran equivalentes.
Parciales, intentos y análisis detallados requieren comprobar informes por
meeting; no se acredita aquí su disponibilidad universal.

La DB compensa cuando se definan consultas propias: evolución por atleta,
comparación de temporadas, alertas de marcas o histórico independiente de
la fuente. Entonces recoger un subconjunto explícito, conservar procedencia,
identidades y rectificaciones y aprovechar el núcleo/R2/Turso existente.
Para mostrar tablas oficiales bajo demanda, empezar con caché evita una
recopilación masiva y su mantenimiento sin una utilidad definida.

## Implementación propuesta y verificación

Dos adaptadores de agenda; registro en proveedores y colecciones; filtros
comunes de atletismo; recogida mensual RFEA y paginada WA; límites de red y
publicación atómica existentes. No activar resultados persistidos en esa entrega.
El coste depende de páginas WA + meses RFEA + fichas necesarias para acreditar
identidad, revisiones y errores; todavía no hay medición anual ni importe.

Verificado: código de agenda y consultas actual, muestras HTTP indicadas,
JSON embebido, dos páginas WA y duplicaciones mensuales RFEA. Muestras de
trabajo en `/tmp/voceiro-atletismo` (temporales). No se ejecutaron tests ni CI:
esta entrega solo añade documentación. La implementación debe probar en CI
paginación incompleta, reprogramaciones, pruebas de varios días, solapes,
temporadas, límites y conservación de la última lectura buena.
