# Resultados deportivos: decisiones pendientes

Resultados por fecha, clasificaciones y fichas de partido ya están
implementados mediante consultas a ESPN con caché. El contrato vigente está
en [Resultados por fecha y fichas de partido](resultados-revision-2026-11-02.md).

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
  F1 solo tiene clasificación en el panel. La investigación de MotoGP está
  en [la revisión de fuentes](atletismo-motogp-revision-2026-11-02.md).
- Atletismo: acreditar recursos de resultados, marcas y rankings; conservar
  la separación entre ranking mundial, marcas y puntos de circuito.

Se mantiene la consulta bajo demanda con caché. Una base de resultados y la
recogida programada solo se reconsiderarán ante una necesidad concreta que
la caché no cubra; no hay un piloto ni un cron acordados.
