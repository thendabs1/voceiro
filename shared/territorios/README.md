# Territorios comunes

Un municipio es una identidad territorial reutilizable por agenda, tiempo y
prensa. Sus nombres y las zonas meteorológicas tienen otra función.

El [contrato del relacionador](relacionador.md) concreta identidad, tipos,
evidencia y recorridos propuestos; distingue el país del catálogo de un medio
de su cobertura editorial, con papeles separados.

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

Los espacios soportados son `iso3166-1:alpha2`, `medios:pais`,
`ine:autonomia`, `ine:provincia`, `ine:municipio`, `ine:municipio:dc` y
`medios:region`. Kulturklik conserva su referencia contextualizada en el núcleo;
su espacio `kulturklik:municipio_nora` se distingue del servicio territorial
`nora:municipio`. El catálogo revisado cruza 179 referencias culturales con
municipios INE mediante sus coordenadas municipales y límites oficiales.
No se deduce que dos códigos de proveedores distintos
sean equivalentes. `paises.json` añade España y los 36 países presentes en medios,
con códigos ISO contrastados en [Naciones Unidas](https://unstats.un.org/unsd/methodology/m49/overview/)
y alias editoriales explícitos. No es un catálogo mundial completo. África se
conserva como categoría original pendiente de una agrupación geográfica propia.

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
La revisión Python `relacionador.py` añade resultados con motivo, referencia,
revisión y evidencias. `correspondencias.json` permite localizar tres recintos
de las muestras Madrid por `vgnextoid` acreditado en catálogos oficiales, sin
convertir el recinto en municipio. Los recintos con coordenadas se ubican con
los [límites municipales](#límites-municipales) del IGN. La proyección usa esos cruces también con
observaciones ya guardadas. Los nuevos estados no están implementados en JS.
El informe por fuente (`python -m agenda.revision`) revisa temas y ubicación de una
exportación, sin consultar proveedores ni modificar el núcleo.
El catálogo de medios y sus slices incorporan `region`, `pais`, `ambito` y
los enlaces acreditados con papel `cobertura_editorial`. Eso no atribuye una
localización a las noticias del medio. Las regiones desconocidas conservan su
metadato original. Los países del catálogo de medios se enlazan con papel
`pais_catalogo`, independiente de `cobertura_editorial`; el país no genera
cobertura ni localiza noticias. El frontend aún no consume estos enlaces.

Para regenerar sin credenciales ni peticiones de red:

```sh
python scripts/generar_territorios.py --municipios /ruta/diccionario26.xlsx
python scripts/generar_territorios.py --check
```

Para contrastar los códigos INE con las entradas meteorológicas y las sugerencias
del cliente, sin red ni modificaciones:

```sh
node scripts/revisar-base-territorial.mjs
```

Informa códigos sin correspondencia, municipios sin punto meteorológico, zonas
ausentes y diferencias entre cliente y worker. Las diferencias no se corrigen
automáticamente ni acreditan un cambio actual del proveedor. El resultado local
actual contiene 8.124 puntos meteorológicos, todos con correspondencia INE,
sin diferencias entre cliente y worker. Ocho municipios INE carecen de punto
propio; no se les asigna por proximidad una zona de avisos.
La [revisión de AEMET del 25/10/2026](revision-aemet-2026-10-25.md) documenta
cuatro productos municipales vigentes ausentes del maestro, dos entradas antiguas
y ocho municipios sin previsión actual acreditada. El generador del tiempo aplica
esas excepciones versionadas.

Se conserva la URL y SHA-256 del fichero INE. `--check` comprueba las proyecciones
administrativa y de países JavaScript en CI. La lectura pública de agenda
incorpora facetas territoriales de eventos. Las relaciones de servicio,
las vigencias y la integración con preferencias siguen pendientes en el
[contrato del relacionador](relacionador.md).

## Preparar cruces de agenda

`importadores.py` lee páginas de eventos Kulturklik y límites municipales;
`geometria.py` consulta límites GeoJSON normalizados. Los lectores no descargan
ni escriben. `scripts/generar_correspondencias_agenda.py` coordina la preparación
local desde el manifiesto [fuentes-agenda.json](fuentes-agenda.json), que conserva
URL, lector, nombre de archivo y SHA-256 de cada descarga utilizada.

Para repetir la revisión con esas descargas locales y una copia del catálogo
anterior como base:

```sh
python scripts/generar_correspondencias_agenda.py shared/territorios/fuentes-agenda.json \
  --carpeta /ruta/descargas --base /ruta/correspondencias-anteriores.json \
  --salida /tmp/correspondencias.json --informe /tmp/cruces-pendientes.json
```

Un fichero distinto de la huella del manifiesto se rechaza: una nueva descarga
necesita actualizar la revisión y contrastarla. El generador conserva los cruces
manuales y exige revisión explícita si un cruce anterior cambia de municipio o
deja de acreditarse. Los casos nuevos rechazados conservan motivo y pruebas.
La salida se revisa antes de sustituir el catálogo; la API no descarga mapas ni
hace peticiones de geocodificación por visitante.

Los límites proceden de [geoEuskadi](https://www.geo.euskadi.eus/geoeuskadi/rest/services/U11/AE55J/MapServer/2)
y del [WFS de IDENA](https://www.navarra.es/es/web/geoportal/idena/servicios).
Se usan polígonos originales sin simplificar, en longitud/latitud, con huecos
y recintos separados. Se deja pendiente un punto con otro municipio a menos de
50 metros, o fuera de todo recinto pero a menos de 50 metros de uno (margen
conservador de revisión, no precisión declarada del mapa); la costa o una
frontera sin recintos cartografiados no ofrecen otro destino. También queda
pendiente sin cobertura, con provincia incompatible o con denominación contradictoria.
Los solapes y coordenadas incompatibles no eligen un destino por orden.
El nombre solo detecta contradicciones: nunca encuentra el municipio.

Las coordenadas Kulturklik son del municipio; no localizan el recinto ni sirven
para medir distancia al evento. La referencia Galdakao `48/183`, cuyo punto cae
en Usansolo, queda pendiente. Las referencias de Iparralde requieren un catálogo
francés; no se asignan municipios españoles por proximidad.

Medición sobre las 5.115 citas publicadas el 27/10/2026: Kulturklik pasa de 0
a 2.475 de 2.689 citas con municipio resuelto.
Es una medición sobre registros guardados, no cobertura total de los proveedores.

## Límites municipales

`limites.json` es el manifiesto de los límites del IGN (unidades
administrativas INSPIRE, BDDAE; CC BY 4.0): un archivo GeoJSON comprimido por
provincia con `properties.ine`, su URL de consulta, SHA-256, caja y número de
municipios. Los archivos están en R2 bajo `prefijo_r2`, no en el repositorio.
`scripts/preparar_limites.py CARPETA [--subir]` los vuelve a generar; cada
revisión usa un prefijo con su fecha y no pisa la anterior.

`limites.py` resuelve punto → municipio cargando solo las provincias cuya caja
contiene el punto, desde `VOCEIRO_LIMITES` o `~/.cache/voceiro/limites` y, si
faltan, desde R2 con la huella verificada. Aplica las reglas de `geometria.py`:
polígonos sin simplificar (redondeo a 1e-7°), pendiente con otro municipio a
menos de 50 m, conflicto si dos recintos contienen el punto, nunca el municipio más
cercano. Sin límites disponibles el resultado es `limites_no_disponibles`, y
publicar con ese estado falla.

La proyección resuelve así los recintos con bloque `coordenadas` (hoy Madrid:
`LATITUD`/`LONGITUD` declaradas por el Ayuntamiento). El punto se suma a los
cruces revisados: si coinciden, resuelto; si discrepan, conflicto. Un recinto
sin correspondencia revisada no bloquea la ubicación que acredita su punto.
Medido el 27/10/2026: los 208 puntos distintos de la agenda de Madrid caen en
28079 (1.266 de 1.344 citas; las otras no tienen recinto) y los 212 de Zaragoza
en 50297, ninguno pendiente.

