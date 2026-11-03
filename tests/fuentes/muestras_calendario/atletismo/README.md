# Muestras públicas, 2/11/2026

Capturas reducidas a los campos usados; sin listas de inscritos ni contactos personales.

- `fca.json`: dos páginas de `https://fcatletisme.cat/wp-json/tribe/events/v1/events?per_page=100&start_date=2026-11-01&end_date=2026-12-31` (segunda con `page=2`). Las 53 citas y los totales se conservan.
- `fga.html`: primeros cuatro artículos del listado de `https://atletismo.gal/competicions/` en noviembre. Incluye tecnificación y jornada de circuito. No representa el mes completo.
- `fga-ficha.html`: artículo de `https://atletismo.gal/competicions/i-circuito-de-atletismo-concello-de-vigo-3a-xornada/`, sin navegación ni SVG.
- `fga-diciembre.html`: dos artículos de `https://atletismo.gal/competicions/?cp_date=01%2F12%2F2026`: medio maratón homologado y quinta jornada de lanzamientos con rango explícito 12–13/12. No representa el mes completo.
- `fga-circuito.json`: entrada revisada del IV Circuíto Deputación A Coruña en Pista 2026 (127481), con jornadas 127459, 127463 y 127473. Identidades/fechas/enlaces del listado de noviembre con `cp_date=01%2F11%2F2026`, contrastadas las jornadas en la ficha del circuito. El padre se declara como agrupación, no como cuarta cita; no es una clasificación automática por título. La URL de la segunda jornada conserva `2025`, tal como la publica la fuente: no se usa ese fragmento como año de celebración.
- `rfea.json`: calendario mensual reducido a la cita de Huelva y su ficha; conserva navegación de noviembre. No representa el mes completo. El año proviene del calendario; la identidad, de `championship/65127` en la ficha.

La reducción no acredita cobertura anual, coincidencias entre fuentes ni estabilidad histórica de los IDs.

`wa-2027.json` contiene siete eventos de `sel2027.json` y las entradas de grupo
relevantes del catálogo `grupos2027.json`: un ID repetido entre 6 y 3806,
Diamond League, niveles del Continental Tour y sede TBC. Las fechas y campos
de esos eventos conservan los literales WA; no representa ventanas completas.

`negreira.json` es una entrada revisada por cada una de las tres federaciones:
RFEA 64837, FGA 113590 y FCA 82885, campeonato de España de 5 km máster del
15/11/2026. Procede del mensual/ficha RFEA y de las capturas FGA/FCA descritas
arriba. Los tres IDs se vinculan en el registro de equivalencias revisadas;
se conservan los lugares y metadatos distintos de cada fuente.

`nivel-ii-2026.txt` es la extracción íntegra con `pdftotext -layout` del
PDF general Nivel II enlazado desde RFEA, descargado el 2/11/2026:
https://atletismorfea.es/sites/default/files/2025-03/CalendarioNivel_II_general.pdf .
Conserva las 15 páginas y 441 filas, actualización 15/10/2026. El lector
todavía no acredita identidad para todas esas filas.

`nivel-ii-fga-marcha.json` conserva la entrada 112621 del listado gallego
de noviembre sin filtros de ámbito, contrastada el 2/11/2026 con la ficha
https://atletismo.gal/competicions/xix-campionato-xunta-de-galicia-de-marcha-de-inverno/ .
Se usa para comprobar la correspondencia con Nivel II, incluida la discrepancia
AL/Marcha. El identificador Nivel II es editorial, no publicado por RFEA.

El test de coincidencias contrasta además FCA 83650 de `fca.json` con las
fichas oficiales de Atapuerca: RFEA `championship/64831` (campeonato de clubes,
22/11) y `championship/64930` (cross internacional, 21–22/11), comprobadas el
2/11/2026. La primera es el enlace publicado por FCA; la segunda permanece
separada. No son identidades ni fechas ficticias del programa de sesiones.
