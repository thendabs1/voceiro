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
- `wta-seleccion-2026.json`: campos de agenda de United Cup y Limoges de la
  respuesta oficial paginada con `from=2026-01-01&to=2026-12-31&excludeLevels=ITF`.
  El sondeo completo entregó 124 torneos en dos páginas; este archivo es una
  selección de dos, con un envoltorio de total **sintético** ajustado para las
  pruebas. No acredita por sí solo el inventario anual ni contiene jugadoras,
  ganadoras, cuadros o premios.

La clave pública de la web F1 se lee en ejecución desde su configuración; no
se conserva en estas muestras ni en los documentos de agenda. Los originales
completos y las cabeceras del sondeo solo están en `/tmp/voceiro-oficiales-temporadas`.
