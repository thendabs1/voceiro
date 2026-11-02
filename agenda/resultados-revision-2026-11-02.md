# Revisión de resultados y jornadas — 2 de noviembre de 2026

Continúa el [diseño de resultados](resultados-diseno.md), incluidos los
comentarios sobre consultar encuentros anteriores. Esta revisión propone el
siguiente paso; solo se ha preparado la corrección de caché del cliente.

## Tarjetas NBA sin acceso al partido

Las capturas muestran la parrilla actual de Segunda y cuatro finales NBA.
Las respuestas publicadas de NBA, consultadas en castellano y gallego, incluyen
ahora los cuatro IDs `espn:partido/nba/401909903` a `401909906`.
La ficha publicada de `401909903` también devuelve estado `ok`.

El código solo dibuja el botón cuando el marcador trae un ID válido.
La entrega de fichas cambió la clave interna de caché a `v=2`, pero conservó
la URL pública. Una respuesta HTTP anterior, vigente durante una hora y sin
IDs, puede seguir llegando desde el navegador o una caché intermedia.
Es una explicación compatible con la captura; no se dispone de la respuesta
de red original para confirmar que fuese esa la causa en esa sesión.

La corrección añade `v=2` a las URLs del cliente. Una prueba simula la respuesta
antigua aún vigente y comprueba que se recupera una parrilla con botones y se
abre la ficha. La versión de la URL deberá acompañar futuros cambios de contrato.

## Qué ofrece cada fuente

| Consulta comprobada | Datos observados | Peticiones de origen sin caché |
| --- | --- | --- |
| [LaLiga Primera, jornada 11](https://www.laliga.com/laliga-easports/resultados/2026-27/jornada-11) | Jornada ID 10385; diez encuentros, resultados y estados; catálogo de jornadas | Un GET de la página HTML |
| [LaLiga Primera, jornada 10](https://www.laliga.com/laliga-easports/resultados/2026-27/jornada-10) | Diez encuentros de la jornada anterior, todos `FullTime` | Un GET |
| [LaLiga Segunda, jornada 12](https://www.laliga.com/laliga-hypermotion/resultados/2026-27/jornada-12) | Jornada ID 10424; once encuentros finalizados, en juego o pendientes | Un GET |
| [LaLiga Segunda, jornada 11](https://www.laliga.com/laliga-hypermotion/resultados/2026-27/jornada-11) | Once encuentros anteriores, todos `FullTime` | Un GET |
| [ESPN Primera, 31 de octubre](https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard?dates=20261031) | Cuatro encuentros con los IDs que utiliza la ficha actual | Un GET por día |
| [ESPN Segunda, 31 de octubre](https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/scoreboard?dates=20261031) | Cuatro encuentros con sus IDs ESPN | Un GET por día |
| [ESPN NBA, 1 de noviembre](https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261101) | Cuatro encuentros; sus horas abarcan el 1 y el 2 de noviembre en Madrid | Un GET por día ESPN |
| [ESPN NBA, 31 de octubre](https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261031) | Siete encuentros del día anterior | Un GET |
| [ESPN WNBA, 1 de octubre](https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard?dates=20261001) | Un encuentro histórico | Un GET |

También se comprobó Primera el 25 de octubre: cuatro encuentros.
El intento de Segunda con `dates=20261030-20261102&limit=100` devuelve HTTP 400.
Esto no acredita que todos los formatos de intervalo fallen, pero no permite
presupuestar el fin de semana como una sola consulta ESPN.

## LaLiga ya se usa para el calendario

`agenda/proveedores.py` selecciona `laliga-primera` y `laliga-segunda` como
fuentes principales de agenda. `agenda/oficial_laliga.py` lee el bloque
`__NEXT_DATA__` de las páginas de resultados: `gameweekList`, `gameweek`
y `matches`. Conserva jornada y horarios, pero descarta `home_score` y
`away_score` y trata un `FullTime` como una cita programada. Es deliberado:
ese adaptador construye agenda, no resultados.

Por tanto, las jornadas oficiales sí tienen una fuente localizada. Se puede
mostrar su pertenencia y su marcador usando únicamente LaLiga. Para resultados
haría falta un contrato de lectura propio que conserve y normalice los estados;
no reutilizar la conversión de estados de agenda.

Los IDs no son intercambiables: Villarreal–Espanyol de la jornada 11 es
`102358` en LaLiga y `401882817` en ESPN. En las páginas oficiales examinadas
no aparece una referencia ESPN y el repositorio no tiene una correspondencia
entre ambos proveedores. Mostrar esa jornada no exige resolverla; abrir nuestra
ficha ESPN desde ella sí. El enlace oficial `/partido/{slug}` permite abrir el
detalle de LaLiga mientras no exista esa correspondencia. No unir por nombres
o proximidad de fechas, especialmente ante aplazamientos.

## Propuesta para decidir la siguiente entrega

- Fútbol: selector de temporada y jornada, con anterior/siguiente. Consultar
  resultados de LaLiga bajo demanda y cachear por competición, temporada,
  jornada y versión. Enlazar cada partido a su detalle oficial. Mantener las
  consultas actuales de ESPN y sus fichas como otra entrada identificada.
- NBA/WNBA: selector de fecha y anterior/siguiente sobre ESPN. Cachear por
  competición, fecha e idioma y conservar los IDs de las fichas actuales.
  Explicar que el día ESPN puede incluir la madrugada siguiente en España;
  seguir agrupando las horas por fecha local, como ahora.
- Compartir la presentación de los marcadores, conservando la fuente y el
  periodo consultados. Volver desde un detalle debe recuperar ese mismo periodo.

Ambas vías pueden convivir sin una base de resultados ni recogida programada.
Una jornada completa de fútbol cuesta un GET de LaLiga en un fallo de caché;
una vista ESPN de cuatro días necesitaría hasta cuatro GET. La consulta
individual de un detalle ESPN añade su propio GET si no está cacheado.
El coste descrito es de red, no una estimación monetaria.

Antes de activar jornadas quedan por verificar los aplazados y cambios de
jornada, temporadas anteriores, fases de Segunda y respuestas vacías o con error.
Las muestras revisadas acreditan las jornadas indicadas, no toda la cobertura.
El presupuesto ESPN existente no cubre LaLiga: su consulta necesitará un límite
propio y errores que conserven la última vista buena. Esta revisión no incorpora
todavía el selector ni cruces entre proveedores.
