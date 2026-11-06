# Resultados deportivos: decisiones pendientes

Resultados por fecha, clasificaciones y fichas se sirven con consultas bajo
demanda y caché. El contrato base está en
[Resultados por fecha y fichas de partido](resultados-revision-2026-11-02.md).

## Fichas sin local ni visitante

`ficha.vista` distingue la forma: sin ese campo es la ficha de equipos;
`encuentro_tenis` y `sesion_motor` son las otras dos. Cada vista se registra en
`VISTAS_CONSULTA` (`front/app/14-tenis.js`, `14-motor.js`). Las fichas nuevas
llevan `estado_original`, `condicion`, `fuente` con la atribución real y
`referencias_agenda` con los identificadores del proveedor. La tarjeta solo
publica los nuestros, así que no se cruzan: el enlace desde la tarjeta lleva al
panel del día ([contrato](interfaz-contrato.md#enlace-a-resultados)). Con ID en
la petición manda el ID: `texto` no elige proveedor.

| Competición | Fuente | Puente con la agenda |
| --- | --- | --- |
| ATP | ESPN | UID de torneo |
| WTA | ESPN | Sin correspondencia con la agenda oficial |
| Euroliga | `api-live.euroleague.net/v2/.../games` | Sin agenda |
| F1 | OpenF1, uso no comercial | `session_key` = `meeting_session_key` |
| MotoGP | API oficial `/results` | `toad_api_uuid` = ID del GP; sesión por `type+number` |

No unir por nombre: OpenF1 trae un GP con país Bahrain y lugar Kuala Lumpur.
En MotoGP, `date` de resultados lleva offset UTC falso y es hora local, y
`OUTSTND` solo significa no clasificado.

## Comprobar

- Consumo real de ESPN: la estimación es 56 peticiones/día con cinco colecciones.
  Con WNBA a la vez son unas 69, sobre el cupo de 64: revisar en mayo de 2027.
- Términos de uso de EuroLeague: siguen sin revisar y la ficha no muestra licencia.

Comprobado el 6/11/2026: el sprint de F1 coincide con la fuente oficial. Euroliga
da Play-In, playoff y final; la ficha no indica la fase.

Fuera por ahora, sin API directa: FEB, ACB, ASOBAL, WRC, ciclismo y pádel.

## Jornadas oficiales

Falta acreditar un índice de pertenencia a jornada en Primera y Segunda,
incluidos los aplazados. Las muestras de `scoreboard` de Primera no contienen
una jornada acreditada; tampoco se identificó en el resumen Site ni en el
recurso Core del partido `401882817`. Core enlaza temporada y tipo, pero la
colección `seasons/2026/types/1/weeks` comprobada devolvió `count: 0`.
Esto no descarta otros recursos.

Una vista por fechas no equivale a una jornada oficial. Cuando exista evidencia,
la consulta y la caché deberán identificar ese ámbito y conservar los IDs de
partido para abrir sus fichas. Buscar un partido por rivales y fecha también
requiere resolver su identidad; aún no está implementado.

## Otras ampliaciones

- Tenis: cuadro completo por torneo y ronda; hoy solo hay vista por fecha.
- Motor: Moto2 y Moto3 preparados sin exponer, y `clasificacion:motogp`.
- Atletismo: los resultados se delegan a la fuente oficial (enlace al
  documento o página en su nivel, sin marcas; decidido el 3/11/2026).
  Rankings sin conector. Candidatas web sin extracción acreditada: Diamond
  League (marcas y récords), ranking de marcas RFEA y World Rankings (corte
  semanal, sin recalcular). Stats Pro de WA exige acceso. Mantener separados
  ranking mundial, mejores marcas y puntos de circuito; viento, pista corta,
  cronometraje y DNS/DNF/DQ importan al comparar.

Se mantiene la consulta bajo demanda con caché. Una base de resultados y la
recogida programada solo se reconsiderarán ante una necesidad concreta que
la caché no cubra; no hay un piloto ni un cron acordados.
