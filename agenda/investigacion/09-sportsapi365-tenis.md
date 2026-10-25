# SportsAPI365: tenis y revisión pendiente

Notas del 25/10/2026. Investigación técnica, sin integración, publicación ni
recogida periódica activadas.

## Plan y alcance acordado

El usuario confirma **150 peticiones al mes** en Tennis Basic. Reservar la
fuente principalmente para calendario y, si hace falta, consultas puntuales.
No sondear directos ni disparar consultas al proveedor por cada visita.
Los datos recogidos podrían incorporarse al núcleo de Turso y servirse desde
la API de lectura de los Workers.

Propuesta todavía sin implementar: recogida semanal ATP/WTA, con un máximo
de 100 peticiones mensuales para recogidas y 50 de reserva. La estimación de
8–10 consultas mensuales solo vale si cada circuito cabe en una página y no
necesita consultas separadas para dobles. Cada página consume una petición;
hay que medirlo antes de acordar la cadencia. No presentar una descarga
parcial como cobertura completa.

La clave está en `.env`, ignorado por Git y con permisos 600, bajo
`SPORTSAPI365_TENNIS_API_KEY`. No copiar la credencial a documentación,
muestras, logs ni código.

## Contraste real

Autenticación directa mediante `X-Gravitee-Api-Key` y base
`https://api.sportsapi365.com/v1/tennis`.

Seis consultas devolvieron HTTP 200:

| Ruta relativa | Observación |
| --- | --- |
| `/atp/fixtures?pageNo=1&pageSize=3&include=round,tournament` | Tres encuentros con IDs de partido, jugadores, torneo y ronda; fechas y horas. |
| `/wta/fixtures?pageNo=1&pageSize=3&include=round,tournament` | Misma estructura para el conjunto femenino. |
| `/atp/fixtures?pageNo=1&pageSize=3&filter=PlayerGroup:doubles&include=round,tournament` | Parejas con ID y `members` con IDs individuales; fechas y horas nulas en la muestra. |
| `/extend/api/events/live` | Doce encuentros con estado, marcador y actualización; identificadores de directo y compuestos. |
| `/atp/results/2026-10-24?pageNo=1&pageSize=3` | Ganador, resultado textual por sets y desempates; `result_type: completed`. |
| `/ranking/wta/top` | Diez jugadoras con posición, puntos y fecha del ranking. |

Las listas paginadas devolvieron `hasNextPage: true`: tres filas no acreditan
exhaustividad. No se ha contrastado la exactitud deportiva contra otra fuente.

Respuestas temporales en `/tmp/voceiro-sportsapi365-{atp,wta,dobles,live,resultados,ranking}.json`.
No son fixtures permanentes ni se garantiza que sobrevivan entre sesiones.

Antes hubo tres intentos fallidos sobre la ruta de portada `/tennis/v2`:
fallo DNS del entorno restringido, HTTP 403 con el cliente predeterminado y
HTTP 404 al identificar Voceiro. No se sabe si los errores HTTP consumen cuota.
La ruta directa documentada funcionó identificando el cliente como Voceiro.

## Revisar antes de implementar

- Condiciones de almacenamiento, caché, publicación y retención; atribución y
  procedencia de datos. El acceso técnico no acredita estas condiciones.
- Reinicio y medición de cuota, coste de errores y paginación, límites por
  segundo y mecanismo para consultar consumo. No trasladar la cuota de RapidAPI
  al plan directo: los 150/mes los confirma el usuario.
- Ventanas de calendario y semántica de fechas: la ruta sin fecha devolvió
  partidos del 27/10, por lo que no equivale a «partidos de hoy». Comprobar
  zona horaria, horarios provisionales, aplazamientos y cambios de fecha.
- Cobertura real ATP/WTA, individuales/dobles, previas, Challenger e ITF;
  filtros por nivel y torneo para ajustar el presupuesto.
- Volumen por semana, máximo de página y consulta conjunta de modalidades.
  Acotar peticiones por pasada sin publicar prefijos como recogidas completas.
- Continuidad de identidad calendario → directo → resultado. No equiparar
  automáticamente IDs numéricos, IDs de directo y compuestos. Comprobar también
  el ámbito de IDs entre circuitos y ediciones de torneo.
- Dobles femeninos y continuidad de miembros de pareja, todavía no probados.
- Estados y frescura: un directo devolvió marcador `6-1,6-4` y estado
  `InPlay`; no deducir finalización únicamente del marcador.
- Resultados por sets, desempates, superdesempates, retiradas y walkovers;
  `best_of` nulo no permite inventar el formato.
- Los enlaces de las respuestas apuntan a `/tennis/v2/...`; no seguirlos sin
  comprobar su correspondencia con las rutas directas `/v1/tennis`.

## Documentación de partida

- [Proveedor](https://sportsapi365.com/).
- [Acceso directo frente a RapidAPI](https://sportsapi365.com/docs/direct/tennis/guides/api-access).
- [Catálogo de tenis](https://sportsapi365.com/sports/tennis).
- [Problemas e identificadores](https://sportsapi365.com/docs/direct/tennis/guides/faq).
- [Planes de tenis](https://sportsapi365.com/sports/tennis/pricing).

La portada y algunos ejemplos contienen rutas inconsistentes. Revisar la
operación concreta del acceso directo antes de copiar ejemplos. Las funciones
de cuotas, predicciones y Socket.IO anunciadas no se han probado ni se dan por
incluidas en Basic a partir de una lista comercial pegada en la conversación.
