# Inventario de relaciones y códigos

Revisión del 25/10/2026 para cerrar el modelo con las fuentes ya disponibles.
Complementa el [estado de la agenda](../../agenda/README.md): aquí se
identifica qué existe, qué evidencia lo sostiene y qué falta por resolver.
El alcance es agenda, territorio, tiempo y prensa; no es un inventario de todas
las relaciones internas de Voceiro. Las propuestas no amplían el esquema actual.

Continuación: el [contrato del relacionador](relacionador.md)
formaliza referencias, tipos y recorridos. Su primer incremento añade países
ISO y el papel `pais_catalogo` de los medios, separado de su cobertura editorial.
La revisión posterior (`python -m agenda.revision`) aplica estado/evidencia a las agendas:
resuelve tres recintos de Madrid y documenta el desajuste Kulturklik/NORA.

Se mantienen las recogidas culturales actuales: conservan evidencia útil para
reprocesar las correspondencias. Se pospone ampliar proveedores y deportes
hasta cerrar territorio y operación por colección. No hace falta resolver un
municipio para conservar el evento y su referencia original.

## Relaciones que admite el núcleo

Los nueve tipos de `agenda/nucleo.py:RELACIONES` están implementados en el
constructor, validador y persistencia (`agenda/esquema.sql`). Admitir un tipo no
significa que algún adaptador actual lo esté produciendo.

| Relación | Origen → destino | Restricción y uso actual |
| --- | --- | --- |
| `es_edicion_de` | Agrupación de clase edición → competición, ciclo o festival | Un destino vigente por edición. FEB lo produce. |
| `es_parte_de` | Agrupación → agrupación | Jerarquía sin ciclos, junto con `es_edicion_de`. FEB y tenis la producen. |
| `pertenece_a` | Evento o actividad → agrupación | Admite varios destinos. Piloto, FEB y tenis la producen. No prueba ubicación. |
| `celebracion_de` | Evento → actividad | Una actividad vigente por evento. Galicia y Madrid la producen; la transición conserva los casos ambiguos sin conciliarlos. |
| `compuesta_por` | Participante de clase pareja → persona | Exige ámbito de evento o de edición/fase/cuadro. Tenis la produce para dobles identificados. |
| `inscrito_en` | Participante → agrupación | Admitida; no localizada una emisión en los adaptadores actuales. No equivale a una participación en un encuentro. |
| `pertenece_al_club` | Equipo → club | Admitida; no localizada una emisión en los adaptadores actuales. |
| `se_celebra_en` | Evento o agrupación → lugar o territorio | Galicia, Madrid y Kulturklik la producen para eventos. La publicación territorial de un evento recorre su ubicación y la de su recinto; no hereda la de una agrupación. |
| `ubicado_en` | Lugar → territorio | La transición del piloto la produce para recintos y municipios declarados. Falta el cruce municipal de Madrid. |

Cada relación conserva evidencias, posible ámbito y suspensión. Su vigencia
actual se calcula a partir de las últimas observaciones de sus referencias;
eso todavía no representa intervalos históricos de validez administrativa.

Hay otras asociaciones implementadas con estructura propia:

| Asociación | Autoridad y significado |
| --- | --- |
| Referencia externa → entidad | Tupla proveedor, tipo externo, contexto e ID original. `Constructor.entidad` conserva identidad y rechaza reutilizar una referencia con otro contexto. Varias referencias pueden señalar una entidad cuando el vínculo está acreditado. |
| Observación → referencia y documento | Conserva ruta de evidencia, bloques, primera observación del contenido y última observación. Repetir contenido no crea otra entidad. |
| Entidad → tema; tema → padres | Asignación con evidencia y correspondencia; vocabulario común en `shared/catalogo-tematico.json`. Una categoría del proveedor no crea por sí sola una actividad u obra. |
| Evento → participación → participante | Papel, orden y literal; el participante puede quedar sin resolver. Almacenamiento propio en `participaciones`, no un nuevo tipo de `RELACIONES`. |
| Resultado → evento y participaciones | Métricas y parciales enlazados a participaciones de ese evento. |
| Clasificación → ámbito y participantes | Tabla con filas, corte y evidencia; no se convierte en evento. |
| Selección → objetivo y bloque | Decide qué observación publica cada bloque y conserva los conflictos. |

`nucleo.COLECCIONES` nombra contenedores del contrato JSON. La agrupación de
clase `coleccion` organiza contenido. Ninguna de las dos sustituye la futura
colección operativa de recogida con sus pasadas y cobertura.

## Relaciones entre servicios

| Relación | Estado observado | Qué falta |
| --- | --- | --- |
| Municipio → provincia → autonomía → España | Implementada en Python y JS desde `shared/territorios/`. Un padre administrativo por entidad en esta instantánea. | Vigencias y cambios entre ediciones. Los niveles adicionales no deben alterar esta cadena sin un contrato. |
| Código INE de cinco cifras o de seis con control → municipio común | Implementada; verifica pertenencia al diccionario y control completo. | Actualizaciones posteriores al 01/01/2026 y correspondencias históricas. |
| Territorio de agenda → territorio común | Proyección en `agenda/publicacion.py`; resuelve `ine` e `ine_cpro_cmun_dc`, con motivo/evidencias. Mantiene IDs del núcleo y estados pendiente/conflicto. La ubicación de tres recintos Madrid se acredita por separado. | Correspondencia Kulturklik/NORA y ampliación de recintos de Madrid revisados. |
| Punto municipal AEMET → código municipal | Coincidencia literal contrastada por el comprobador. Catálogos generados por `scripts/generar-municipios.mjs`. | Identificar edición del maestro, acreditar cruces y representar puntos antiguos sin confundirlos con municipios vigentes. |
| Punto municipal AEMET → zona de avisos | Un código `zona_comarcal` por entrada del maestro local. | Catálogo de zonas y asociaciones con alcance y procedencia; admitir varios vínculos cuando la fuente lo justifique. |
| Lugar por coordenadas → previsión | El worker busca el punto municipal más cercano hasta 15 km; dispone también de la ruta Open-Meteo. | Conservar método y precisión al exponer esta asociación como servicio compartido. La cercanía no acredita pertenencia municipal. |
| Zona → comunidad/provincia/isla; zona terrestre → costera | Reglas del servicio actual en `shared/tiempo/avisos.js` y consumidores del tiempo; la costera se busca con sufijo `C`. | Contrastar catálogo oficial y límites. No exportar estas reglas como equivalencias administrativas generales. |
| Medio → territorio de cobertura | `cosecha/catalogo.py` usa región editorial y ámbito nacional mediante `shared.territorios.cobertura_medio`. | Varios municipios/provincias con evidencia por asignación y consumo de esos campos en las vistas del frontend. |
| Medio → país del catálogo | `medios:pais` resuelve 36 categorías a países ISO; catálogo y slices publican `pais_catalogo`. | Clasificar África como agrupación geográfica cuando se necesite. No se deduce cobertura del país ni del ámbito internacional. |
| Noticia → territorio o entidad | Selección actual por fuentes o texto sobre noticias cargadas; consultas externas separadas. | Los vínculos persistentes específicos siguen pospuestos. La cobertura del medio no localiza cada noticia. |
| Proveedor → colección operativa → pasada → cobertura | Recogidas y consultas existentes, sin el contrato operativo completo por colección. | Separar identidad, alcance solicitado, resultado completo/parcial y publicación. |

Las ubicaciones, el ámbito de una competición, la cobertura editorial y la
asociación meteorológica necesitan papeles diferentes. Consultar una relación
en sentido inverso tampoco amplía su alcance: un medio municipal no pasa a
cubrir toda la provincia por aparecer en una consulta provincial.

## Sistemas de códigos y fuentes de contraste

Fuentes oficiales consultadas en esta revisión; consultar documentación no
equivale a descargar un catálogo ni a validar todos sus cruces.

| Sistema o nivel | Evidencia disponible | Tratamiento propuesto |
| --- | --- | --- |
| INE municipal, provincial y autonómico | Catálogo local y [operación del INE](https://www.ine.es/dyngs/INEbase/operacion.htm?c=Estadistica_C&cid=1254736177031&idp=1254734710990): referencia anual, modificaciones durante el año y sexto dígito de control. | Autoridad inicial para el intercambio municipal español. Registrar edición y cambios; mantener alias y evidencia de las fuentes. |
| ISO 3166-1 alpha-2 | [ISO](https://committee.iso.org/iso-3166-country-codes.html) y columnas ISO de [Naciones Unidas](https://unstats.un.org/unsd/methodology/m49/overview/). Selección local en `shared/territorios/paises.json`. | España y países ya presentes en medios. Los alias editoriales son correspondencias explícitas; `africa` se conserva sin convertirla en país. |
| NORA | [API oficial](https://www.euskadi.eus/gobierno-vasco/-/api-rest-nora/) y [guía](https://www.euskadi.eus/contenidos/informacion/api_rest_nora/es_def/adjuntos/Nora_Normativa_Desarrollo_Ext.pdf), con entidades de varios niveles y consulta con padres. | Conservar contexto provincial y literal del proveedor. La documentación no acredita por sí sola una tabla NORA–INE; no concatenar códigos ni resolver por nombres. |
| Distritos y barrios de Madrid | [Estructura de agenda, junio de 2026](https://datos.madrid.es/dataset/300107-0-agenda-actividades-eventos/resource/300107-4-agenda-actividades-eventos/download/300107-4-agenda-actividades-eventos.pdf): distrito/barrio como denominaciones, código postal y coordenadas. El [Geoportal municipal](https://geoportal.madrid.es/IDEAM_WBGEOPORTAL/dataset.iam?id=422fa235-762b-11e9-861d-ecb1d753f6e8) aporta códigos y delimitación de barrios y su distrito. | Usar catálogo municipal como contraste de instalaciones y unidades. Distinguir barrio, distrito, municipio y provincia. El código postal no sustituye al municipal. |
| Municipios y comarcas de Cataluña | [Lista Idescat](https://www.idescat.cat/codis/?id=50&n=9&lang=es) con código municipal y comarca; [metodología](https://www.idescat.cat/codis/?id=50&n=9&inf=m&lang=es) de seis cifras, incluida la de control, basada en la codificación INE. | Comprobar cada código completo contra la edición INE elegida. La comarca necesita entidad y relación propias; no se trata como provincia ni se infiere del prefijo. |
| Entidades colectivas, singulares y núcleos | [Metodología del nomenclátor INE](https://ine.es/nomenclator/metodologia.htm): once cifras, con niveles inferiores al municipio y diseminado. | Identificar sistema y nivel antes de extraer una relación municipal; conservar el código completo y edición. Nunca pasar once cifras al resolver municipal como si fueran cinco/seis. |
| Parroquias y entidades gallegas | [Nomenclátor estadístico del IGE](https://www.ige.gal/igebdt/nomenclator/?idioma=es), basado en el nomenclátor INE; entidades agrupadas o no en parroquias. | Contemplar el nivel y su relación acreditada con el municipio. No exigir parroquia a toda entidad ni importar un catálogo adicional todavía. |
| Poblaciones geográficas | [Especificación IGR Poblaciones del IGN](https://www.ign.es/resources/IGR/Poblaciones/IGN_especificaciones_IGR-PO.pdf): el vínculo con unidades estadísticas puede no ser biunívoco. | Fuente de contraste geográfico si hace falta; distinguir población física de unidad estadística. No fusionarlas por compartir código asociado. |
| Puntos y zonas meteorológicas | [API AEMET](https://opendata.aemet.es/dist/), con maestro municipal. Nuestros archivos incluyen código, coordenadas y zona. | Espacio de proveedor separado; conservar respuesta, fecha de descarga y huella en la próxima revisión del maestro. Catálogo y límites de zonas pendientes de contraste específico. |

Esto confirma que el diseño debe admitir más sistemas y niveles. No acredita
un inventario exhaustivo de todas las codificaciones autonómicas. Antes de
integrar otra comunidad se revisarán los campos reales de su colección y su
diccionario; no hace falta recolectar agendas de todas ellas para cerrar ahora
el contrato extensible.

## Casos pendientes reproducibles

`node scripts/revisar-base-territorial.mjs` informa, sin red ni escrituras:

- 8.132 municipios INE, 8.122 entradas meteorológicas y 182 zonas declaradas.
- Dos códigos meteorológicos fuera del catálogo municipal actual: `36011`
  (Cerdedo) y `36012` (Cotobade).
- Doce municipios sin entrada propia: `04904`, `11903`, `14901`, `14902`,
  `18077`, `18106`, `18915`, `18916`, `21902`, `36902`, `41904` y `48916`.
- Sin diferencias de códigos entre sugerencias y worker, sin duplicados de
  código en sugerencias y sin entradas meteorológicas carentes de zona.

El informe no consulta la disponibilidad actual del proveedor ni comprueba
límites de zonas. Los 8.120 códigos coincidentes acreditan coincidencia en
ambos archivos, no cobertura geográfica exacta de una previsión o un aviso.

| Caso | Evidencia local | Condición para resolverlo |
| --- | --- | --- |
| Cerdedo, Cotobade y Cerdedo-Cotobade | Los dos primeros están en tiempo; `36902` está en INE. | Contrastar cambio administrativo y maestro AEMET. Separar sucesión territorial y uso de puntos de previsión; una fusión no convierte cada punto antiguo en previsión exacta de todo el nuevo municipio. |
| Otros once municipios sin punto propio | Códigos del informe, incluido Usansolo `48916`. | Comprobar maestro actual. Si no hay entrada, conservar ausencia o una asociación de servicio aproximada explícita, sin inventar código ni zona. |
| Kulturklik/NORA | `tests/fuentes/muestras_calendario/kulturklik.json`: Pamplona/Iruña `31/476`, Vitoria-Gasteiz `1/46`. | Obtener correspondencia oficial por código y contexto, conservar evidencia y contrastar destino INE. Incluye Navarra; revisar solo municipios de Euskadi no cubre la muestra. Los literales no acreditan el cruce. |
| Madrid | El adaptador conserva cada fila completa como documento y crea recinto por `vgnextoid`. La revisión posterior enlaza los tres recintos de la muestra con `28079` mediante catálogos oficiales; conserva pruebas y huellas en `shared/territorios/correspondencias.json`. | Ampliar recintos revisados. El proveedor municipal, el título y el prefijo postal no bastan para asignar todos los eventos a `28079`. |

En el inventario inicial no se obtuvieron respuestas de los endpoints NORA
con el navegador. La revisión posterior consultó por provincia: Pamplona
`31/201` y Vitoria `01/059` en NORA territorial frente a `31/476` y `1/46`
en Kulturklik. Se conserva evidencia de la diferencia, sin resolver por nombres.

## Contrato mínimo para revisar antes de implementar

Se propone ampliar el catálogo existente con estas responsabilidades, sin
decidir aún nombres de tablas ni añadir tipos a `nucleo.RELACIONES`:

1. **Identidad y denominaciones.** ID estable independiente del nombre visible;
   etiquetas por idioma, fuente y vigencia. Las entidades de agenda conservan
   sus IDs y se enlazan al catálogo común.
2. **Código externo.** Sistema, nivel, código original como cadena, contexto,
   edición, procedencia y vigencia conocida. El formateo documentado de un
   sistema se conserva junto al original; no se rellenan ceros por conjetura.
3. **Correspondencia.** Referencia de origen, destino opcional, estado
   resuelto/pendiente/conflicto, método, evidencia y fecha de comprobación.
   Una equivalencia de identidad se distingue de pertenencia, sucesión o
   asociación a un recurso meteorológico. Las fusiones y segregaciones pueden
   necesitar varios vínculos con periodos y alcance.
4. **Relación territorial o de servicio.** Origen y destino tipados, papel,
   método, evidencia, alcance y vigencia. La jerarquía administrativa actual
   sigue disponible; comarca, isla, parroquia y zona se incorporan solo con
   fuente y semántica verificadas, sin forzarlas en una única cadena.
5. **Publicación reproducible.** Versión de catálogos y correspondencias;
   relaciones consultables en ambos sentidos. Pendientes y conflictos no
   desaparecen al publicar ni se sustituyen por coincidencias de nombre.

La fecha de comprobación, la fecha de observación y la vigencia del hecho son
datos distintos. Un evento histórico no debe reasignarse automáticamente al
municipio actual si su territorio cambió; el resultado necesita un criterio
temporal explícito. El resolver actual solo consulta una instantánea.

## Orden de continuación

1. Revisar este inventario y cerrar el contrato de códigos, correspondencias,
   relaciones y vigencias. Las fuentes adicionales sirven para contrastar el
   diseño; no activan nuevas recogidas.
2. Preparar evidencia y muestras pequeñas para los cruces INE/AEMET, NORA
   (incluida Navarra) y recintos de Madrid. Implementar después las
   correspondencias acreditadas y los casos pendientes o conflictivos.
3. Concretar persistencia y pasadas por colección: identidad, selección,
   capacidades, ventana, completitud, cadencia, presupuesto y publicación.
   Una descarga completa filtrada a una ventana no acredita cobertura fuera
   de esa ventana. Revisar también los metadatos `recogida_manual` del cron.
4. Comprobar equivalencia de identidades y exportaciones antes de activar la
   nueva lectura; ampliar deportes después de cerrar esta base.

Mantener las recogidas actuales permite revisar el material ya normalizado y
su evidencia. Se reconsiderará una pausa si se observa pérdida de códigos,
fusiones incorrectas, importaciones incompletas o un coste injustificado.
Cambiar el modelo territorial no exige por sí solo descartar esas recogidas.

En el inventario inicial se ejecutó el comprobador local y se contrastaron código,
fixtures y documentación oficial. No se recogieron nuevos catálogos ni se
migró o publicó la base. El incremento posterior de países incorpora la selección
citada y los enlaces editoriales; no resuelve los cruces pendientes españoles.
La suite completa corresponde a CI; los criterios de
aceptación de los cruces futuros están en la arquitectura de servicios.
