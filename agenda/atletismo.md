# Atletismo

Estado a 4/11/2026. Capas RFEA, Galicia (FGA) y Cataluña (FCA) recogidas en
el cron y publicadas (variables de Actions, ver Recogida). World Athletics se
recoge sin publicar: [atletismo-world-athletics.md](atletismo-world-athletics.md).

## Alcance y modelo

Calendario deportivo RFEA completo (edades, máster, clubes, ruta, pista,
short track, cross, marcha, trail e internacionales que publique), más FGA y
FCA con competiciones y tecnificación. Fuera: actividades federativas, cursos
y reuniones. La inscripción es un metadato, no otra cita.

- Tres capas seguibles como las ligas: `atletismo-rfea`, `atletismo-fga`,
  `atletismo-fca` (`agrupacion/coleccion`). Una cita es `evento/encuentro` con
  `pertenece_a` y un contenedor `agrupacion/competicion` con rol
  `agenda.principal`. La capa es procedencia: no sitúa la cita en España,
  Galicia o Cataluña ni sirve de filtro geográfico.
- Una cita es una competición fechada, de uno o varios días inclusivos. Días
  no consecutivos de FGA conservan el post y se guardan en `temporalidad.dias`;
  la programación excluye los huecos sin crear otra identidad.
- `agrupaciones` opcionales (`circuito`, `ciclo`, `coleccion`) y `grupo` en la
  cita. Un circuito no es otra cita ni su primera fecha una jornada más.
- `programa` opcional: sesiones con ID propio, `tipo_sesion` e `inicio` como
  fecha o instante con offset, dentro de los días de la cita. La clase sigue
  siendo `encuentro` al añadir sesiones. Una lista de pruebas sin fechas
  (Excel RFEA) no crea sesiones.
- Dimensiones separadas, sin un `tipo` único: modalidad, pruebas, edad y sexo,
  formato (individual, clubes, relevos), actividad (competición,
  tecnificación), ámbito/área/categoría WA y homologación. Se conservan los
  literales de cada fuente; no se extraen edades del título. «Promoció» no
  acredita edad e «Internacional» no es modalidad.
- Granularidad (acordada el 3/11/2026, en implementación): un ID de fuente es
  una publicación de alcance variable (reunión, varios títulos, un título,
  sesión, jornada, serie o Juegos). Se reproduce la de cada fuente y se
  acredita con ficha, información técnica, normas u horario; nunca por título,
  fecha o sede. Entre identidades: misma entidad (solo mismo alcance), dentro
  de (título en reunión, atletismo en Juegos: `es_parte_de` entre sus
  competiciones), celebración conjunta, pertenencia a serie y sustitución. Lo
  que la fuente no permite decidir abre issue. Resultados: solo el enlace
  oficial en su nivel, sin marcas. Diseño, mapa de huecos y plan en
  `docs/atletismo-fuentes-2026-11-03/DISENO.md` (local).
- Bloque v2 (`atletismo_bloque.py`, validado al importar): `alcance`,
  `temporalidad`, `fuente`, `actividad`, `titulos`, `documentos` y
  `pertenencias`, todos opcionales hasta que cada adaptador los emita. Lo
  acreditado lleva `evidencia` (superficie, URL, localizador y literal); lo
  desconocido, no. La evidencia nunca lleva fecha de lectura: el núcleo
  identifica la observación por su contenido y crearía otra en cada pasada. Un
  resultado es un documento con `rol: resultados`; `rol` es obligatorio al
  importar documentos FGA y sigue siendo opcional para las demás fuentes. `temporalidad.estado` es más
  fino que `programacion`; traducirlo es del adaptador. La publicación añade
  `atletismo.titulares` (`fuente:relacion` por variante, faceta `titular`) y
  `atletismo.actividades` (unión de lo acreditado, faceta `actividad`), con OR
  dentro de cada parámetro. `titular=fga:propio,fga:desconocido` da el chip sin
  reflejos: la API no decide qué se muestra. Las concentraciones son
  `tecnificacion`, solo con convocatoria, circular o reglamento.
- La norma no da un ámbito único por cita: clasifica por carácter, nivel según
  participantes y calendario, y a veces prueba a prueba (Reglamento RFEA, arts.
  7, 15 y 18). Por eso el bloque guarda los ejes y no un ámbito: `calendarios[]`
  (en cuáles está la cita, con su categoría literal), `organizacion[]` (quién
  organiza, autoriza o convoca) y la autoridad de cada título en `titulos[]`, con
  `base` documento o nombre reservado. «Campeonato de España» está reservado a las
  federaciones españolas, no solo a la RFEA (Ley 39/2022, art. 79.3), de ahí
  `federacion_espanola`. Propio o reflejo se decide por autoridad, con el calendario
  de reserva. Ninguna federación tiene regla escrita de prelación entre calendario
  y circular: las discrepancias quedan visibles con su fuente. Citas y documentos
  en `docs/atletismo-fuentes-2026-11-03/normativa/INFORME.md` (local).
- Modalidad común (acordada el 3/11/2026): `ruta`, `cross`, `pista-cubierta`,
  `pista-aire-libre`, `marcha` y `trail`, según
  `shared/calendario/atletismo-modalidades.json` (literal normalizado → código,
  o `null` si es conocido y no indica modalidad: Promoció, Màster,
  Internacional, Track and Field). `atletismo_modalidades` es la única
  interpretación; la publicación guarda en `atletismo.modalidades` la unión de
  las variantes publicadas (faceta `modalidad`, parámetro `modalidades` del
  worker, OR entre códigos). El «Tipo» de Nivel II solo cuenta si ninguna otra
  fuente acredita modalidad. Un literal desconocido no recibe código y aparece
  en `modalidades_desconocidas` del informe de recogida.
- `metadatos.inscripcion`: `plazo_textual`, `periodo` (días acreditados),
  `hora_cierre_literal` sin zona inventada y `enlaces`. Un enlace de login no
  acredita inscripción abierta. Se publica en `atletismo.valor.inscripcion`
  y el detalle lo muestra por procedencia.
- Sin migración SQL: el bloque `atletismo` viaja en el detalle JSON. La
  proyección elige con las fuentes permitidas; `atletismo.variantes` conserva
  nombre, metadatos, programación, lugar y procedencia por fuente, y una
  discrepancia activa `conflicto` sin dar prioridad a RFEA ni a la última
  descarga. El detalle solo avisa de las fechas y, si discrepan, muestra las de
  cada fuente: cada federación describe la sede a su manera.

La ausencia de una cita no la cancela. Conservar la última lectura buena;
«ventana leída completa» no significa «temporada terminada».

## Fuentes

**RFEA.** `calendar.js` construye
`/ajax/calendario/{timestamp}/{tipo}/{area}/{disciplina}/{rankingWA}/{categoria}/{temporada}/{desde}/{hasta}/{titulo}`;
la respuesta es JSON Drupal con HTML y siempre un solo mes, con la cita
repetida por día. Los IDs de temporada se descubren de las opciones (2026=464,
2027=482). `tipo=Deportivo`. «Área» (EA, RFEA, WA) no es federación
territorial y «Categoría» mezcla edad, formato y distancia. La identidad es
`championship` de la ficha; se guarda también el SFID (contrastado en cinco
fichas; falta acreditar estabilidad al cambiar de temporada o slug). La
recogida consulta los meses adyacentes para cerrar extremos, descarga solo las
fichas necesarias con pausa y caché de 24 h, y ante un 429 falla sin guardar
parcial. El Excel anual (464 filas sin IDs, con repeticiones) solo sirve para
contrastar fechas; no se une a fichas por título. Los documentos
(`/ajax/championship-documents/{sfid}`) aún no se incorporan.

**Nivel II.** PDF general enlazado por RFEA, 15 páginas y 441 filas,
actualizado el 15/10/2026 (la carpeta `2025-03` de la URL no es la fecha).
Recoge pruebas autonómicas, incluidos controles, ausentes del mensual; no es
otra capa ni el calendario de todas las territoriales. `atletismo_nivel_ii`
lo extrae con Poppler y falla ante cambios de distribución. Una huella
identifica una fila, no una cita. El ID sale de
`atletismo-nivel-ii-revisiones.json` (`nivel-ii:…`, editorial) o de una
coincidencia inequívoca con una cita ya identificada (`nivel-ii:auto-…`,
anclado a esa referencia y persistido). Las filas iguales o ambiguas quedan
pendientes. El «Tipo» del PDF no tiene autoridad (marcha de Pontevedra: `AL`
frente a «Marcha» de FGA).

**FGA.** Inventario mensual `fga/v1/competitions` y listado HTML con GAL,
NAC e INT explícitos, unidos por post, sin consultas de delegación. Los IDs sin
ámbito que solo devuelve la API se resuelven por consulta WordPress `?p=ID`;
se exige el mismo post y un permalink FGA publicado en la respuesta, sin
construir slugs.

Se examinan todas las fichas y padres, incluidos los que no tienen hijas en
la ventana. El PGTA y las clasificaciones son publicaciones, sin cita fechada;
la relación padre/hija acredita colección. Circuito requiere una declaración
con jornadas enumeradas en el cuerpo o en un reglamento revisado. Las clases
e identidades ya guardadas se conservan; un padre antes importado como cita
queda en cuarentena para una corrección revisada. No se migra automáticamente.

Las citas emiten bloque v2 con evidencias estables, documentos con rol y
resultados en el nivel de la publicación, sin descargar documentos ni extraer
marcas. Se conservan los destinos HTTP que FGA suministra para resultados,
sin convertirlos a HTTPS. El bloque «Organización» de la ficha (con entidad en 60
de 72 fichas de nov.–dic. de 2026; otras 10 lo traen vacío) da `organizacion[]`.
Una organización ajena hace reflejo aunque la cita lleve «Autonómico»: un Campeonato
de España en Galicia está en el calendario gallego y sigue siendo de la RFEA. Ese
título reservado por ley hace reflejo aunque la FGA organice o coorganice. La FGA
como única organizadora hace propio. Si no consta o es compartida, cuenta la etiqueta:
sin «Autonómico» es reflejo y con ella, propio. Eso solo vale desde 2026, y «Nacional»
no significa «en calendario RFEA»: no está definida. Un enlace a la RFEA no decide.
El estado se lee del título, donde la FGA lo anuncia, y del cuerpo solo un aviso
parcial explícito: una cláusula de reglamento no es un estado. Actividad, títulos
por documento y sesiones solo se acreditan mediante lecturas locales revisadas
(`atletismo-fga-documentos.json`, con huella de la captura); otras convocatorias
quedan desconocidas. No se presume que un PDF bajo la misma URL mantenga el
contenido revisado: falta vigilancia de versiones documentales.

Los días enumerados no rellenan huecos. Suspensión total se programa como
aplazamiento; suspensión parcial conserva la parte celebrada y sus resultados.
Una fecha incompatible aísla el post, conserva su lectura anterior y deja el
informe parcial. API, HTML y fichas informan ventana, filtros, IDs observados y
resueltos y estado. Protección, 403/429 o esquema roto detienen la lectura sin
sustituir el núcleo anterior; no hay ausencias bajo cobertura parcial. Las URLs
se reutilizan en memoria durante la pasada, con pausa de 2,5 s entre descargas.

**FCA.** API `tribe/events/v1` con ID propio, preferida al ICS. Devuelve 50
por página aunque se pidan 100; se exigen todas las páginas, total coherente
e IDs únicos. Las muestras son de día completo; un horario con hora falla
hasta contrastar el convenio UTC/local.

## Coincidencias e identidad

`atletismo_coincidencias` (versión 4) compara federaciones y las dos
distribuciones RFEA sin consultar webs. Normaliza mayúsculas, acentos,
puntuación, año, variantes castellano/gallego/catalán, sufijos ordinales
(`103a`→`103`, `60è`→`60`) y la etiqueta exacta `(RFEA)`. Una cita nueva
comparte identidad cuando hay un único candidato y:

- enlaza directamente a la ficha ya identificada y tiene las mismas fechas
  (prioritario: cruza con la referencia, no con la URL). Con otras fechas puede
  ser otra edición o una parte del enlazado: queda para revisión, sin unir; o
- coinciden fechas completas, sede y al menos tres palabras significativas,
  con Dice ≥ 0,90 y sin contradicciones de distancia, edad, edición, sexo,
  formato, modalidad ni conjunto/partes.

Fecha y sede no bastan. Dos citas que reclaman una misma identidad, o enlaces
que se contradicen, quedan para revisión. Nombre, fecha y sede nunca son ID:
la primera referencia conserva la identidad aunque se reprograme. Dos
identidades ya guardadas no se fusionan al importar: exigen conciliación.
Dos IDs de una misma distribución tampoco se unen nunca. Se avisa si comparten
identidad, o si coinciden día y sede con Dice ≥ 0,90 y sin contradicciones
(posible duplicado, como Samarkand en WA), aunque compartan enlace: jornadas y
categorías del mismo día son citas distintas. Una fuente que aún no ha recogido
una reprogramación deja su enlace con otras fechas: lo que llegue antes queda
como identidad aparte y se resuelve por conciliación.
Una revisión acredita la identidad sin borrar lo calculado: `estado` da la
decisión y `veredicto` y `motivos`, el resultado del comparador.

- `atletismo-equivalencias.json`: equivalencias editoriales (Negreira 5 km
  máster: RFEA 64837, FGA 113590, FCA 82885).
- `atletismo-conciliaciones.json`: pares revisados con evidencia y la fuente
  cuyo ID se conserva. En una importación nueva comparten identidad; si ya
  hay dos guardadas, `atletismo_conciliacion --turso [--simular]` las une
  sobre una carga fresca con la guardia de revisión (`--nucleo` para una
  copia local). Solo principales sin sesiones, resultados ni políticas
  afectados; documentos y observaciones intactos. La entidad absorbida se
  conserva sin referencias con `conciliada_en` (el almacén no retira
  entidades) y no se publica; el almacén solo acepta el cambio de destino de
  una referencia con esas dos marcas.
- Una parte no es el todo aunque compartan día y sede, ni un enlace basta si
  el alcance difiere (con las mismas fechas el comparador aún lo acepta: falta
  acreditar el alcance). Castro (RFEA
  64834 promoción y máster frente a FCA 80239 máster; FCA 80237 aparte),
  Nassos (FCA 5+10 km frente a RFEA 5 km) y Dakar (RFEA Juegos frente al
  atletismo de FCA/WA) están unidos con alcances distintos y se separarán con
  una operación revisada, empezando por Castro.
- Fechas discrepantes en una identidad del mismo alcance (short track clubes
  máster) quedan como conflicto visible, sin elegir fuente.
- Nivel II enlaza con una cita guardada mediante `decision: equivalencia` y
  una conciliación con su ID editorial (Ourense y Ordes, 12/12).
- `atletismo_revision --issues` corre en cada pasada del workflow: un issue
  por par estable de IDs (marcador oculto, abiertos y cerrados), cinco
  escrituras como máximo por pasada. Cerrar un issue no fusiona datos; una
  huella de lo que usa el comparador (incluidas modalidades y enlaces) comenta
  los datos nuevos y lo reabre si cambian; el cuerpo conserva lo escrito a mano.

## Recogida

```sh
python -m agenda.atletismo_recogida --db /tmp/atletismo.db --fuente fga --inicio 2026-11-01 --fin 2026-12-31 --informe /tmp/fga.json
```

Fuentes `fga`, `fca`, `rfea` (incluye Nivel II y requiere Poppler) y `wa`; `--turso`
sustituye a `--db`. Ventana máxima de 91 días; por defecto, hoy y 60 días más.
El informe (consultas, ventana, peticiones, pendientes, ausencias y
completitud) se guarda con el núcleo en `agenda_estado`, clave
`atletismo-informe-{fuente}`. Un fallo conserva la última lectura buena. En
Nivel II, `completo` mide la ventana; las filas y revisiones de otras fechas se
cuentan en `pendientes_fuera_ventana` y `revisiones_no_aplicadas_fuera_ventana`.

Una cita guardada en la ventana que la lectura ya no trae se reconsulta por
su ficha: FCA (API por ID) y FGA (fechas de la ficha y su listado) se
reimportan con la fecha actual; si la ficha no sostiene la fecha (RFEA no
publica el año) o ya no existe (404/410; FCA 400 `rest_invalid_param`), se
anota en `fuentes.{fuente}.ausencias` y deja de publicarse sin cancelarse.
Otra lectura del ID la vuelve a publicar. Otros errores interrumpen la
fuente. Una cita que el listado deja pendiente con otras fechas también se
oculta. Si faltan al menos cinco citas conocidas y son más de la mitad de la
ventana, la lectura se da por rota y no se retira nada. Un fallo de Nivel II
no impide guardar la lectura mensual de RFEA: el paso se señala fallido y el
informe, incompleto; una ventana con un año sin documento Nivel II tampoco
está completa. `fuentes.{fuente}.ventana` se publica y el frontal raya en
Deportes los días posteriores a su `fin`. En el workflow: input `atletismo`; el cron
solo recoge con `CALENDARIO_ATLETISMO_RECOGIDA=true` y la
publicación requiere añadir las fuentes a `CALENDARIO_FUENTES_PUBLICAS`.

Volumen orientativo de una pasada de dos meses: FCA 2, RFEA ~65 sin caché y FGA
74 (4 de inventario y 70 fichas y padres, sin documentos), medidas en lectura real
el 4/11/2026, con 2,5 s entre peticiones. La caché evita repetirlas en una pasada.

Para revisar sin red: `calendario.py --entrada-atletismo` importa un documento
revisado v1 (`version`, `fuente`, `eventos` con `id`, `nombre`, `url`,
`inicio`, `fin`, `lugar`, `metadatos` y opcionales `grupo`/`programa`); es
repetible y reimportar un ID actualiza sin duplicar.

## Pendiente

En orden (detalle en el diseño local):

1. Lectores de documentos. Cada fuente oficial se lee entera y el comparador la
   une a las demás; el dato se copia literal de quien lo publica y lo dudoso no se
   enlaza. Por fases: versión de cada documento leído, para no atribuir una lectura
   a un PDF sustituido, y sesiones que pierden su documento; categoría del
   Calendario RFEA en PDF (hoy, Circular 65/2026, actualizado a 21/4/2026) y filtros
   del calendario web; índice de circulares de las tres federaciones, con
   sustituciones, enlazadas solo si la ficha las enlaza; lectura de su contenido
   (títulos, convocatoria, organizador) con revisión. Sin ellos, `actividad` y
   `alcance` de FGA quedan desconocidos.
   Call Room no da datos públicos. RFEA: información técnica, documentos y
   concentraciones del Federativo. FCA: `organizaciones`, `description`, ficha,
   columna de calendario y reglamentos de series.
2. Comparador por alcance, con los datos del paso anterior: enlaces resueltos,
   conjunto de días y veredicto `dentro_de`. Subir su versión cambia la huella
   y reabre una vez los issues cerrados.
3. Registro editorial con varias referencias por fuente y separación revisada
   (Castro, Nassos, Dakar).
4. Circuitos, ligas, controles y tecnificación solo con documento oficial.
- Interfaz: filas de fuentes, circuitos WA y modalidad en Deportes (semana y
  lista en pantallas bajas; ☆ solo en fuentes). OR dentro de cada fila y AND
  entre filas: un circuito marcado restringe toda la selección.
- Filtro de ámbito: sin decidir (4/11/2026). «Territorial, nacional, internacional»
  falsearía la norma, porque no hay un ámbito único. Con los adaptadores hechos se
  decidirá, con cifras de cobertura, si conviene filtrar por calendario o autoridad.
- World Athletics: estados, Juegos y resultados; interfaz de circuitos
  (fase 2).
- Territoriales: esperan al modelo. Extremadura (HTML con ID) y Cantabria
  (ICS con UID) cumplen el contrato; ver el diseño local.

Resultados y marcas se delegan a la fuente oficial: se enlaza su documento o
página, sin extraer marcas. Rankings, sin conector; ver
[resultados](resultados-diseno.md#otras-ampliaciones).
