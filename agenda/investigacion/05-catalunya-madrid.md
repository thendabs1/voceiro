# Cataluña y Madrid: contraste del modelo — 25/10/2026

Lote iniciado por OpenCode Go (`opencode-go/kimi-k3`), con resultados parciales
y muestras en disco. La llamada agotó su tiempo antes del informe final. La
revisión principal comprobó los archivos, volvió a consultar catálogo y muestra
CKAN de Madrid, leyó las condiciones de la Generalitat y completó este informe.
Sin adaptadores, cambios en bases, publicación ni recogida periódica nueva.

Evidencia temporal: `/tmp/voceiro-agenda-cultura/` y
`/tmp/voceiro-madrid-*.{headers,json}`. Las muestras no son inventarios completos
ni acreditan estabilidad de los IDs entre pasadas.

## Cataluña: respuesta y cobertura

Fuente primaria: [conjunto por localizaciones](https://analisi.transparenciacatalunya.cat/d/rhpv-yr4f),
[metadatos](https://analisi.transparenciacatalunya.cat/api/views/rhpv-yr4f.json)
y [muestra de cinco filas](https://analisi.transparenciacatalunya.cat/resource/rhpv-yr4f.json?$limit=5).
HTTP 200 y JSON en muestras y metadatos, el 25/10/2026 hacia las 08:26 UTC.

Los metadatos observados indican `rowsUpdatedAt: 2026-10-23T16:54:03Z`,
frecuencia continua, idioma catalán y una renovación de estructura en marzo
de 2025. Los registros anteriores pueden tener campos nuevos vacíos.
La agregación `count(*), min(data_inici), max(data_inici)` devuelve 68.434 filas,
con extremos `0020-12-25` y `9999-09-09`: esos extremos no acreditan cobertura
histórica/futura real. Una muestra filtrada desde el 25/10 sí incluye actividades
con fechas próximas y horarios textuales.

### Identidad y localizaciones comprobadas

Consultas SoQL acotadas, sin descargar las 68.434 filas:

| Consulta / muestra | Resultado |
| --- | --- |
| Agrupar por `codi`, contar y ordenar descendente, límite 8 | `20230607008` tiene 429 filas; otros códigos tienen 174 y 156. `codi` no es clave única de fila. |
| Muestra de `codi=20230607008`, FeMAP 2023 | Varias localizaciones comparten intervalo global 07/07–20/08. Hay una localización en Pessillà de la Ribera, fuera de Cataluña administrativa. |
| Agrupar ese código por `espai` y `localitat` | Un mismo espacio aparece 17 veces; otros, 15 y 14. Añadir esos textos no crea una clave única. |
| Hasta 20 filas del mismo código y espacio Sant Esteve | Se reciben 17, con iguales código, espacio, inicio y fin, y sin horario en la proyección. No hay evidencia suficiente para representar funciones distintas. |
| Seis actividades con inicio desde el 25/10/2026 | Incluye una visita teatralizada entre 25/10 y 01/11 cuyo horario textual especifica dos domingos a las 11; otra actividad está en València. |

Evidencia: `cat-count.json`, `cat-dupes.json`, `cat-una.json`,
`cat-duploc.json`, `cat-rep.json` y `cat-futuro.json`. Las consultas proyectadas
no demuestran que todas las columnas de esas filas sean idénticas ni explican
la causa de las repeticiones. No inventar un ID de función a partir del índice
de fila, de la combinación código/espacio o de un hash de sus contenidos.

### Campos y taxonomía

- `codi`: código de actividad, con longitudes diferentes entre muestras.
  Conservarlo literalmente; no usar su apariencia de fecha como contrato.
- `data_inici`, `data_fi`: las muestras llevan medianoche sin zona. `horari`
  contiene horas, duración y repeticiones en texto libre. Propuesta: intervalo
  de días y horario textual; validar la semántica antes de convertir a citas.
- `data_fi_aproximada`, `permanent` y otros indicadores merecen reglas propias;
  los valores extremos no deben pasar a la vista de calendario sin revisión.
- `espai`, dirección, código postal, latitud/longitud y `localitat` son datos
  del lugar. `municipi` y `comarca` usan rutas del vocabulario del proveedor,
  por ejemplo `agenda:ubicacions/barcelona/barcelones/barcelona`; no son INE.
- `tags_mbits` y `tags_categor_es` conservan su taxonomía, con valores como
  `agenda:ambits/musica` y `agenda:categories/concerts`. No mapearlos sin revisión
  a los sectores de medios ni confundir público infantil con disciplina.
- `data_creacio` pertenece a la ficha. No se observó un campo estructurado
  de cancelación/aplazamiento ni de modificación por registro; hay descripciones
  con actualizaciones textuales. La modificación del dataset no revalida cada acto.

El ámbito editorial de la fuente no prueba el territorio de cada actividad:
las muestras incluyen localizaciones fuera de Cataluña administrativa.

### Condiciones primarias

Los metadatos dicen `See Terms of Use` y enlazan la
[página de licencias de la Generalitat](https://web.gencat.cat/ca/generalitat/dades-indicadors/dades-obertes/llicencies),
revisada por el agente principal. Describe una licencia abierta con atribución,
fecha de actualización y respeto al significado, sujeta a condiciones específicas
del conjunto. Advierte que los derechos de contenidos individuales, como
imágenes, pueden tener otra licencia. No etiquetar sin más todo el contenido
como CC BY ni trasladar una licencia general a fotografías de terceros.

## Madrid: rutas comprobadas

La ruta sugerida `/id/api/3/action/datastore_search` respondió **404 HTML**
en la comprobación principal. La interfaz CKAN está en **`/api/3/action/`**.
Además, el recurso JSON descargable no tiene `datastore_active`; el CSV sí.

| Consulta primaria | Comprobación |
| --- | --- |
| [Catálogo del dataset](https://datos.madrid.es/api/3/action/package_show?id=300107-0-agenda-actividades-eventos) | 200, JSON, `success: true`. CC BY 4.0; frecuencia diaria; metadatos modificados el 24/10/2026. |
| [Dos filas del almacén CSV](https://datos.madrid.es/api/3/action/datastore_search?resource_id=300107-2-agenda-actividades-eventos-csv&limit=2) | 200, JSON, `success: true`, `total: 1460`, no estimado, con enlaces de paginación. |
| Descarga JSON indicada en la lista original | Figura en el catálogo. El lote guardó fragmentos de 40.001 y 400.001 bytes; están truncados y no son JSON completo validado. No se presenta como descarga completa comprobada. |
| SQL acotado: cuatro filas con `DIAS-SEMANA` no nulo | Muestra guardada en `mad-sql.json`, con días, intervalo, hora y larga duración. Revisada localmente; sin afirmar inventario completo. |

Las dos consultas principales se repitieron desde el agente principal. La
licencia declarada por el catálogo es
[Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/legalcode.es).
El recurso CSV observado tiene modificación declarada
`2026-10-24T18:47:26.467492`; ello no prueba la revisión individual de todos los actos.

### Casos observados y límites

- `ID-EVENTO: 50430455`, conferencia: `FECHA` 27/01/2027 00:00,
  `FECHA-FIN` del mismo día a las 23:59 y `HORA: 18:00`. El intervalo de fechas
  no acredita que la conferencia dure hasta las 23:59.
- `ID-EVENTO: 50378118`, obra de teatro: 13/05–06/06/2027, días de semana
  `M,X,J,V,S,D`, hora ausente. Hay programación, pero no una hora de función
  que podamos fabricar desde el intervalo.
- `ID-EVENTO: 50382736`: 06–07/11/2026, `HORA: 20:00`,
  `DIAS-SEMANA: V,S,D`, larga duración. La regla de días debe acotarse por
  el intervalo; no generar automáticamente una función el domingo 8.
- Existen `DIAS-EXCLUIDOS`, `TITULO-ACTIVIDAD`, `URL-ACTIVIDAD`,
  `URL-INSTALACION`, tipo, audiencia, distrito, barrio y coordenadas.
  No se verificaron todas las variantes del formato de exclusiones.
- `TIPO` y `AUDIENCIA` son rutas de vocabulario propio, por ejemplo teatro
  y mayores; son ejes diferentes. Distrito/barrio no equivalen a municipio
  ni el código postal es un código INE.
- El almacén añade `_id` de fila. Para el modelo interesa la identidad de
  contenido declarada y sus URLs, pero faltan pruebas de unicidad de
  `ID-EVENTO`, cambios entre pasadas y estabilidad ante aplazamientos.

El catálogo enlaza un PDF de estructura del conjunto; antes de normalizar
repeticiones, exclusiones y zonas hay que revisar ese contrato y sus variantes.
Esta comprobación acredita campos y ejemplos, no un expansor de recurrencias.

## Consecuencias para el siguiente incremento

1. Separar actividad/ficha, localizaciones, programación y celebraciones
   concretas. Cataluña impide identificar una ocurrencia por cada fila;
   Madrid exige distinguir intervalo de actividad y hora de asistencia.
2. Conservar vocabularios territoriales/temáticos de origen y correspondencias
   verificadas. Compartir referencias con tiempo y medios sin heredar sus
   relaciones por el nombre de una categoría o la procedencia de la fuente.
3. Mantener horarios textuales y precisión desconocida cuando falten datos.
   Las reglas y excepciones solo se expanden tras comprobar su semántica.
4. Para el siguiente adaptador cultural, Madrid ofrece una muestra pequeña,
   paginada y licencia explícita. Probar primero identidad y programación.
   Cataluña es especialmente valiosa como contraste de varias localizaciones;
   falta resolver sus repeticiones y la identidad de las ocurrencias.

Verificación: JSON y metadatos guardados, revisión de campos, recuentos,
identidades repetidas, rutas y condiciones primarias. Sin adaptador ni tests
de código; solo documentación y evidencia temporal.
