# Selecciones de agenda oficial, 26/10/2026

- `f1-listado-2026.json`: campos de agenda del listado oficial de temporada,
  `https://api.formula1.com/v1/editorial-eventlisting/events?year=2026`. Contiene
  sus 23 GP y dos tests; la importación excluye los tests. Se han retirado
  imágenes, marcas, tarjetas promocionales y cualquier contenido deportivo.
- `f1-mexico-programa.html`: envoltorio HTML mínimo del estado JSON público
  de `https://www.formula1.com/en/racing/2026/mexico`. Conserva los cinco IDs,
  tipos y horarios de `race.meetingSessions`, temporada y GP. La estructura
  `self.__next_f.push` procede de la página; se han retirado noticias,
  componentes de presentación, estadísticas y configuración pública.
- `f2-rondas-2026.json`, `f3-rondas-2026.json` (10/11/2026): lo que devuelve
  `oficial_fia.recoger` con las 14 y 9 rondas reales de
  `fiaformula2.com/en/racing/2026` y `fiaformula3.com/en/racing/2026`: campos de
  agenda del GP y sus sesiones. Lusail y Abu Dabi (F2) siguen en «TBC»; el sprint
  de Spielberg (F3) publica un fin anterior a su inicio.
- `f2-calendario-2026.html`: los enlaces de ronda del calendario F2 y el carrusel
  numerado de su estado Next (rondas 11-14), sin presentación.
- `f2-lusail-ronda.html`: envoltorio mínimo del estado de
  `fiaformula2.com/en/racing/2026/lusail`, con el GP y sus cuatro sesiones «TBC».
- `wta-seleccion-2026.json`: campos de agenda de United Cup y Limoges de la
  respuesta oficial paginada con `from=2026-01-01&to=2026-12-31&excludeLevels=ITF`.
  El sondeo completo entregó 124 torneos en dos páginas; este archivo es una
  selección de dos, con un envoltorio de total **sintético** ajustado para las
  pruebas. No acredita por sí solo el inventario anual ni contiene jugadoras,
  ganadoras, cuadros o premios.

La clave pública de la web F1 se lee en ejecución desde su configuración; no
se conserva en estas muestras ni en los documentos de agenda. Los originales
completos y las cabeceras del sondeo solo están en `/tmp/voceiro-oficiales-temporadas`.
