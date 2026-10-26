# Muestras de agenda deportiva

Recortes para pruebas sin red, preparados el 26/10/2026. Acreditan los campos
retenidos, no cobertura completa, autorización de publicación ni acceso actual.

- ATP/WTA: una edición de las respuestas Site API conservadas el 26/10. Se
  mantienen límites y calendario con zona; el bloque anidado ignorado es
  sintético y prueba que no se importan encuentros/jugadores.
- Primera, NBA y F1: un evento de los sondeos Site API por fecha `20261101`
  conservados en la revisión previa. F1 incluye las cinco sesiones de México.
- **Segunda y WNBA son contratos sintéticos**, derivados respectivamente de
  Primera y NBA, con liga/UID de prueba explícitos. El sondeo actual no permitió
  contrastar sus respuestas. Estas muestras no acreditan partidos de esas ligas.
- FEB: los partidos ya retenidos en `feb-revisada.json` y en los dos pares de
  HTML de Primera FEB y LF Challenge. Sin repetir HTML completo.
- MotoGP: detalle de Malasia conservado del calendario oficial; mezcla emisiones
  y categorías para verificar selección de las ocho sesiones MotoGP. El recinto
  conserva una dirección literal, distinta de las direcciones estructuradas ESPN.
- OCB/WRC: dos rallies de la respuesta de temporada 2026 conservada, cuyo
  `roundCount` era nulo. No representan la temporada completa de catorce rallies.

Fuentes primarias de origen: [ESPN ATP](https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard),
[WTA](https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard),
[Primera](https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard?dates=20261101),
[NBA](https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261101),
[F1](https://site.api.espn.com/apis/site/v2/sports/racing/f1/scoreboard?dates=20261101),
[FEB](https://baloncestoenvivo.feb.es/),
[MotoGP Malasia](https://api.pulselive.motogp.com/motogp/v1/events/d1aedfce-d7c8-4d4a-9532-99c82547baad)
y [OCB WRC](https://ocblacktop.com/api/wrc).

Los cambios de marcador/estado y fecha usados por los tests son sintéticos.
No hay claves privadas, fichas completas ni datos en directo en estas muestras.
