# World Athletics

Contrato a 2/11/2026, **sin adaptador**. Va en una entrega aparte de las
federaciones ([atletismo.md](atletismo.md)), que ya aportan la base común:
identidades compartidas en R2, varias pertenencias por cita y proyección por
fuentes permitidas. Fuente: https://worldathletics.org/competition/calendar-results .

## Selección

Diamond League (meetings `627` y final `3520`), Continental Tour `3773`,
Indoor Tour `3677`, Label Road Races `3775`, Combined Events `3767`, Race
Walking `3692` y Cross Country Tour `3664`, con todos sus niveles; campeonatos
mundiales y continentales, incluidas sub-20, sub-23 y otras categorías
inferiores; Juegos Olímpicos y de la Juventud solo en su parte de atletismo.
La tabla de grupos y subgrupos debe versionarse a partir del catálogo de WA.

No importar el calendario mundial. Fuera: campeonatos nacionales, meetings con
permiso continental genérico que no estén en un circuito elegido, grupos
históricos extintos y ventanas administrativas. Montaña/trail y FISU/juegos
regionales quedan pendientes de decidir. `competitionGroups`,
`rankingCategories` y `permitLevels` son vocabularios distintos.

## Lo contrastado

- JSON Next en `props.pageProps.initialEvents`; filtros `startDate`, `endDate`,
  `competitionGroupId` y `offset` (páginas de 100). No depender del ID de
  compilación de Next.
- Sin filtros, `hits=40277` con historia: no es el volumen a importar.
  Noviembre–diciembre: `hits=572`; las páginas 0 y 100 mantienen el total y no
  repiten IDs. No se recorrió la ventana completa.
- Cross Country Tour en esa ventana: 16 de 16, con subgrupos Gold, Silver y
  Bronze. Tres de esos IDs coincidían en nombre, sede, fechas e `iaafId` con la
  consulta general, pero la pertenencia se expresa distinto (cadena «… –
  Bronze» frente a grupo + subgrupo). No separar cadenas por comas ni
  identificar circuitos por texto: consultar por grupo y conservar parámetros.
- Brisbane 2032 (ID 7173264) figura del 23/7 al 8/8: las fechas de unos Juegos
  no acreditan los días de atletismo (mismo problema que Dakar en RFEA).
- No se ha visto aún una fecha indeterminada real. `hasResults`,
  `hasApiResults` y `hasStartlist` son señales, no resultados ni programa.

## Modelo

Proveedor `world-athletics`, tipo `competition`, ID `results[].id`; `iaafId`
como referencia adicional. No suponer que coincide con `championship`, SFID
ni IDs territoriales. Un meeting es un evento; circuito y edición anual son
agrupaciones (el validador ya admite `es_edicion_de` hacia `circuito`), y un
meeting en varios circuitos se publica una sola vez con todos sus códigos.
Conservar fechas indeterminadas y sede TBC, sin instantes UTC inventados ni
municipio deducido de la sede. Usar solo enlaces publicados.

## Para integrarlo

1. Selección versionada y lector propio con todas las páginas de cada unidad
   (grupo + ventana); comprobar que el servidor aplicó los filtros para no
   importar el mundo por accidente, y consolidar IDs repetidos entre grupos.
2. El importador federativo exige inicio y fin acreditados: adaptarlo a fechas
   indeterminadas.
3. Pruebas: varios circuitos y niveles, varios días, categoría inferior, fecha
   indeterminada, cambio de ventana, enlaces reales; casos Nassos/marcha
   (programa y partes) y Juegos.
4. Contraste RFEA/WA con la conciliación explícita; informes con todas las
   peticiones, fallos y `Retry-After`; caché de fichas aunque falle otro paso.
5. Reconciliar meetings trasladados fuera de ventana; presupuesto y última
   lectura válida ante paginación inestable, cambios de esquema o 429.
