# Resultados deportivos: decisiones pendientes

Resultados por fecha, clasificaciones y fichas de partido ya están
implementados mediante consultas a ESPN con caché. El contrato vigente está
en [Resultados por fecha y fichas de partido](resultados-revision-2026-11-02.md).

## Próximos bloques

Van antes del refactor de la interfaz, con un PR por bloque.

1. **Ficha sin local ni visitante y ATP.** Hay que diseñarla antes de encargarla:
   el contrato actual pierde jugadores, parrillas, sets, retiradas y tiempos.
   ATP sale de ESPN, con cuadro, sets y retiradas ya comprobados.
2. **F1 y MotoGP**, sobre esa ficha. F1 con OpenF1: Voceiro es uso no comercial.
   MotoGP con su API oficial: sus ID no son los del calendario y falta el puente
   de identidad; no unir por nombre.
3. **Euroliga y WTA.** A Euroliga le falta un listado de partidos; WTA no tiene
   correspondencia con la agenda oficial.

Fuera por ahora, sin API directa: FEB, ACB, ASOBAL, WRC, ciclismo y pádel.

Al añadir una competición con prefijo nuevo, vigilar `Deploy Worker Datos`: el
worker antiguo responde 400 a un prefijo que no conoce y la vista Deportes los
envía todos.

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

- Tenis: contrastar cobertura, costes y estados de retiradas, incomparecencias
  y superdesempates antes de ofrecer resultados por cuadro y ronda.
- Motor: acreditar resultados por sesión, sanciones, tiempos y diferencias;
  F1 solo tiene clasificación en el panel. MotoGP: la ruta ESPN probada
  responde 400; la API oficial `api.pulselive.motogp.com/motogp/v1/results`
  respondió sin clave con temporadas, eventos, categorías, sesiones,
  clasificación por sesión y mundial (2/11/2026). Relacionar sus UUID con la
  agenda por referencias, no por nombre del GP; no traducir estados como
  `INSTND` por intuición.
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
