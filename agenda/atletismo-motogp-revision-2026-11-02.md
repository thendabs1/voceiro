# Fuentes de resultados: MotoGP y atletismo

Investigación del 2/11/2026. Recursos observados, sin conector de resultados
activado. Los calendarios se documentan en el [diseño común](atletismo-diseno.md),
[World Athletics](atletismo-world-athletics.md) y [RFEA](atletismo-rfea.md).
La importación local de RFEA, Galicia y Cataluña está en
[la integración](atletismo-integracion.md).

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

## Alcance de la comprobación

Se revisaron código y muestras HTTP acotadas. Las observaciones no acreditan
cobertura universal ni estabilidad futura. Para implementar conectores quedan
por contrastar identidades, estados, cobertura y presupuestos; validación completa
en CI cuando exista código.
