# Territorios comunes: primer incremento

Un municipio es una identidad territorial reutilizable por agenda, tiempo y
prensa. Sus nombres y las zonas meteorológicas tienen otra función.

La primera instantánea contiene España, 19 autonomías/ciudades autónomas,
52 provincias y los 8.132 municipios del [diccionario INE de 2026](https://www.ine.es/daco/daco42/codmun/diccionario26.xlsx).
`administracion.json` mantiene la [relación oficial entre provincias y autonomías](https://www.ine.es/daco/daco42/codmun/cod_ccaa_provincia.htm)
con los nombres visibles que ya usa Voceiro. `municipios.json` conserva cinco
cifras, control y denominación INE. Su fecha de referencia es **01-01-2026**:
no es una lista de denominaciones actualizada durante el año. Las modificaciones
posteriores necesitarán otra revisión, con vigencias y alias, conservando IDs.
La proyección no sustituye los nombres actuales de cada proveedor.

Ejemplo: `ine:municipio` + `36038` e `ine:municipio:dc` + `360388`
resuelven a `es:municipio:36038`, cuyo padre es `es:provincia:36`,
seguido de `es:autonomia:12` y `pais:ES`. El control se verifica contra el
diccionario, sin truncar cualquier cadena de seis cifras. Los códigos siempre
son cadenas: no se completan ceros perdidos ni se deducen IDs por nombres.

Los espacios soportados son `iso3166-1:alpha2` (España inicialmente),
`ine:autonomia`, `ine:provincia`, `ine:municipio`, `ine:municipio:dc` y
`medios:region`. NORA conserva su referencia contextualizada en el núcleo;
el cruce queda pendiente. No se deduce que dos códigos de proveedores distintos
sean equivalentes. Los territorios extranjeros siguen siendo importables.

Python usa `shared.territorios.resolver(sistema, codigo)`. JavaScript puede
construir el mismo índice con `crearCatalogo(municipios)` de `codigos.js`.
Devuelven territorio y ancestros, o `None`/`null` si no está acreditado.
El catálogo completo no se descarga al abrir el tiempo: este solo reutiliza
la tabla provincial pequeña de `administracion.js` y mantiene su carga AEMET
bajo demanda. Los casos de interoperabilidad están en `tests/territorios/casos.json`.

La agenda publica el enlace en `territorio_comun` sin cambiar sus IDs propios.
Los eventos añaden relaciones con papel `celebracion`, resueltas desde el
municipio declarado o el recinto, sin heredar el ámbito de una competición.
Los códigos no resueltos quedan `pendiente`; los conflictos no se asignan.
El catálogo de medios y sus slices incorporan `region`, `pais`, `ambito` y
los enlaces acreditados con papel `cobertura_editorial`. Eso no atribuye una
localización a las noticias del medio. Las regiones desconocidas conservan su
metadato original; todavía no se resuelven países editoriales extranjeros.

Para regenerar sin credenciales ni peticiones de red:

```sh
python scripts/generar_territorios.py --municipios /ruta/diccionario26.xlsx
python scripts/generar_territorios.py --check
```

Se conserva la URL y SHA-256 del fichero INE. `--check` comprueba la proyección
administrativa JavaScript en CI. El siguiente incremento llevará estos códigos
a las tablas de lectura de Turso y al contrato paginado; este no migra la base
ni cambia aún los filtros visibles o las preferencias guardadas.
