# Atletismo

Estado a 6/11/2026. Capas RFEA, Galicia (FGA) y Cataluña (FCA) recogidas en
el cron y publicadas (variables de Actions, ver Recogida). World Athletics se
recoge sin publicar: [atletismo-world-athletics.md](atletismo-world-athletics.md).

## Alcance y modelo

Se publica todo lo que sale en el calendario de cada federación: RFEA Deportivo y
Federativo, FGA y FCA, con competiciones, tecnificación, formación y actos
institucionales. Lo que no es competición se etiqueta con `actividad` y se puede
ocultar: nunca se descarta. La inscripción es un metadato, no otra cita.

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
  (Excel RFEA) no crea sesiones. Al reimportar una cita se reconcilia su
  programa: las sesiones omitidas dejan de publicarse (`sesiones_ausentes`
  por fuente), conservan su historia y pueden reaparecer.
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
  `atletismo.actividades` (unión de lo acreditado, faceta `actividad`, también en
  la tarjeta), con OR dentro de cada parámetro. `titular=fga:propio,fga:desconocido`
  da el chip sin reflejos: la API no decide qué se muestra.
  `excluir_actividades=formacion,institucional` oculta los actos sin quitar lo
  desconocido. Las concentraciones son `tecnificacion` solo con convocatoria,
  circular o reglamento; sin ellos se publican con actividad desconocida.
- La norma no da un ámbito único por cita: clasifica por carácter, nivel según
  participantes y calendario, y a veces prueba a prueba (Reglamento RFEA, arts.
  7, 15 y 18). Por eso el bloque guarda los ejes y no un ámbito: `calendarios[]`
  (en cuáles está la cita, con su categoría literal), `organizacion[]` (quién
  organiza, autoriza o convoca) y la autoridad de cada título en `titulos[]`, con
  `base` documento o nombre reservado. «Campeonato de España» está reservado a las
  federaciones españolas, no solo a la RFEA (Ley 39/2022, art. 79.3), de ahí
  `federacion_espanola`. Ninguna federación tiene regla escrita de prelación entre
  calendario y circular: las discrepancias quedan visibles con su fuente. Citas y
  documentos en `docs/atletismo-fuentes-2026-11-03/normativa/INFORME.md` (local).
- Propio o reflejo (acordado el 6/11/2026): **propio es estar en el calendario de
  la federación sin que otra autoridad lo reclame**, no que la federación lo
  organice. La norma lo sostiene: las nacionales e internacionales son «organizadas o
  autorizadas por la RFEA» (arts. 14.1 y 15.1) y las autonómicas, por su federación
  (art. 16.1). Reflejo es lo que acredita otra autoridad: título reservado en una
  territorial, organizador ajeno o categoría del Calendario en PDF. Un club
  organizador no hace ajena una cita.
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
- `atletismo.resultados_enlazados` y `resultados_enlazados` en la tarjeta: alguna
  variante enlaza un documento con `rol: resultados` y la cita ya ha empezado;
  antes, el rol no acredita nada (FCA 89595). Es un enlace oficial, no un resultado
  estructurado: no activa `resultado_disponible` ni `resultados=1`, y la interfaz debe
  rotularlo como enlace. Puede ser una página de directo o de un tercero que la
  federación enlaza.
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

**RFEA.** `atletismo_rfea` conserva el `championship` y el SFID nativos.
Lee el mensual Deportivo y los adyacentes para cerrar extremos, sin cambiar
nombre, sede ni fechas. La ficha aporta área, categoría, fecha e información
literales, enlaces e inscripción; un login no acredita apertura. El estado
requiere un campo declarado: el título no lo decide. El bloque v2 deja alcance y
actividad desconocidos cuando falta acreditación.

Titular, de lo más explícito a lo más general: autoridad de un título documentado;
categoría del Calendario en PDF (`Internacional 1` y `2` son propias, art. 14.1);
título reservado en su calendario, propio; `Área` WA o EA, reflejo; y, si no, propio
por estar en el calendario, con `calendario_tipo` (`Deportivo` o `Federativo`) como
evidencia. `Área` no tiene definición escrita: WA y EA solo se usan porque nunca
coincidieron con categorías RFEA en el PDF; `Área=RFEA` sí se mezcla y no decide nada.

`/ajax/championship-documents/{sfid}` y los enlaces directos aportan documentos
con rol y evidencia estable, sin descargar sus PDF. La familia `rfea_norma`
acredita normas; los demás roles se leen del rótulo publicado. Compartir un
documento no relaciona fichas. Un fallo opcional conserva documentos y evidencias
anteriores y avisa. Un 403 o 429 tras leer el inventario corta documentos, filtros
y Calendario PDF, sin perder lo leído y sin aplicar ausencias en esa pasada: lo
acreditado por documentos aún enlazados y sin comprobar se conserva, el paso
falla y el reloj espera como tras un fallo, respetando `Retry-After`; un
esquema AJAX roto o un mes incoherente interrumpen. Una ficha sin SFID único sigue
siendo válida, sin documentos. Una convocatoria técnica sin documento acreditativo
se publica con actividad desconocida y un aviso: no bloquea ausencias ni deja incompleta la lectura.
Cada superficie informa ventana, filtros, consultas e IDs observados/resueltos.
Todas las peticiones RFEA respetan 1 s de pausa; la memoria reutiliza respuestas
y fallos dentro de la pasada, y las fichas caducan a las 21 h, con el reloj de la fuente.

El calendario web devuelve un solo mes y repite cada cita por día.
Las 31 categorías deportivas se consultan en un mes de la ventana por pasada,
en rotación diaria; los adyacentes solo cierran extremos. `filtros_calendario`
guarda ID, etiqueta y evidencia positiva, conservada entre pasadas. No completa
edades, modalidades, actividad ni autoridad; una ausencia no acredita nada.
Área y disciplina ya constan en ficha/listado. Las 11 categorías WA no se
consultan: las 11 devuelven cero en la muestra de noviembre de 2026, incluido GL
con Atapuerca. Las 13 categorías federativas quedan fuera de esta rotación.

Federativo (`Eventos internas RFEA`) se lee entero, un mes por petición: medido el
6/11/2026, en nueve meses de 2026 solo hay cuatro actos, todos del CNJ (exámenes, un
webinar y una gala), y ninguna asamblea ni junta. Sus filtros no descubren todo
(enero de 2024 da dos concentraciones sin filtrar y ninguna filtrando), así que solo
clasifican: cada acto sin categoría guardada se prueba contra las 13 hasta dar con
la suya, una vez, y un acto sin categoría repite esa prueba en cada pasada.
`Exámenes`, `Formación` y `Cursos` acreditan `formacion`; `Actividad`, `Asamblea`,
`Comisiones`, `Junta de Gobierno`, `Reunión` y similares, `institucional`.
`Concentración` y `PNTD` necesitan un documento enlazado (circular, reglamento o
convocatoria) para ser `tecnificacion`. Si Federativo no se puede leer, sus citas
guardadas se conservan; leído bien, la ausencia sigue el camino normal. El Excel
anual sin IDs no se une por título; el Excel de pruebas sigue como enlace, sin
inventar sesiones.

**Calendario RFEA en PDF.** El índice de circulares filtrado por `calendario`
se lee con su paginación. Entre calendarios de la temporada, sin proyectos,
gana la fecha de publicación mayor, no el número de circular; la portada
confirma título, año y número. El informe `calendario_pdf` guarda número,
fecha, actualización, URL, SHA-256, filas y peticiones extra (índice y PDF,
dentro del presupuesto RFEA de 400). Un índice general local completo evita
reconsultar el índice filtrado. `atletismo_calendario_pdf` lee el texto de
Poppler íntegro y falla ante líneas desconocidas: 379 filas en la captura de
65/2026 del 27/4, actualizada a 21/4. Conserva categoría y sede literales,
rangos entre meses y días discontinuos. Para cada ficha mensual, solo una
fila automática y ninguna a revisión según `comparar()` acredita
`calendarios[]` con categoría, URL, página y fila. La sede se compara sin la
provincia entre paréntesis. No crea citas, modifica sus datos ni interpreta
ausencias. Una temporada sin calendario aprobado solo avisa. Un fallo conserva
la categoría anterior y permite guardar la lectura mensual; las
automáticas, revisiones y citas sin fila se cuentan aparte. La evidencia es
estable entre pasadas y no entra en la huella de issues.

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
frente a «Marcha» de FGA). Sus filas son reflejo: tienen «carácter autonómico»
(circular de inscripción en el calendario 2027, p. 2), aunque el Reglamento las
coloque en categoría nacional.

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
resultados en el nivel de la publicación, sin extraer marcas. Solo se descargan
los documentos con lectura revisada enlazados por las fichas de la pasada;
nunca listas de inscritos. Se conservan los destinos HTTP que FGA suministra
para resultados, sin convertirlos a HTTPS. El bloque «Organización» de la ficha (con entidad en 60
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
quedan desconocidas. Una ficha que no declara qué es en ningún campo, como las charlas
de psicología, solo se clasifica por revisión de su ID
(`atletismo-fga-actividades.json`), nunca por el título. Se compara SHA-256 de los bytes descargados, una vez por
pasada y con pausa de 2,5 s. Si cambian, no se aplica la lectura ni se copia su
hash; el enlace permanece y un aviso pide nueva lectura. Si falla la descarga,
se conserva la lectura revisada y se avisa. Ningún aviso documental bloquea
ausencias. `leer_ficha` recibe las lecturas verificadas y no descarga.

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
hasta contrastar el convenio UTC/local. `atletismo_fca` añade bloque v2 desde
Tribe y de la ficha: descripción en texto normalizado, documentos con rol por
etiqueta o sección y su evidencia, organizaciones bajo el rótulo contrastado
«Organitzador(s)», dirección y títulos de nombre reservado. `Reglament` y
`Resultats` solo constan en la ficha, cuya clase `post-{id}` acredita la cita:
una por cita, con pausa de 1 s. Si falla, conserva los documentos anteriores; un
403 o 429 corta las fichas sin perder el inventario de la API. La ficha no lee PDF ni
clasifica por categorías o título. Los avisos de estado solo en el título no
cambian la programación. `status=publish` es editorial.

El título reservado por ley hace reflejo aunque la FCA organice; otra federación
sin la FCA (RFEA, EA, WA, Andorra) hace reflejo; lo demás es propio, también con
clubes, en coorganización o sin organizador. Un `website` RFEA sin resolver conserva
la señal literal y deja la relación desconocida: puede apuntar a otra edición o a
404, y suelen ser citas de fuera de Cataluña (Maratón de Valencia, Vallecana). La API
no publica la columna de calendario.

**Índices y lecturas revisadas.** `atletismo_circulares` lee el índice general
RFEA, las circulares FGA y los comunicats y archivos de reglaments FCA. Conserva
los literales, incluidas erratas y declaraciones de modificación, sustitución
o anexo; no resuelve una sustitución por número. Una circular publicada sin
archivo conserva URL desconocida y aviso. Un esquema roto, contador cambiante,
duplicado entre páginas o continuación incoherente interrumpe sin reemplazar el
JSON anterior. Reglaments no publica número ni fecha: quedan desconocidos.

El barrido es independiente, como máximo semanal por archivo de salida, con
presupuesto de 400 peticiones RFEA y 200 por territorial y pausa de 2,5 s. No
está programado ni hace falta para la interfaz: el índice RFEA cuesta 231 peticiones
y nada lo consume, porque titular y actividad ya no dependen de leer documentos:

```sh
venv/bin/python -m agenda.atletismo_circulares --fuente rfea --salida /tmp/circulares-rfea.json
```

Antes de lanzarlo se comprueba que no haya una recogida de producción en marcha.
`atletismo_recogida
--indice-circulares ARCHIVO` incorpora al informe las asociaciones por URL
exacta de documentos ya enlazados en ficha. No compara títulos, números, fechas
ni sedes para asociarlas; las URL distintas, incluidas redirecciones sin resolver,
no se unen. El índice nunca crea citas.

`atletismo_documentos` comparte la verificación SHA-256 de FGA con RFEA y FCA
(`atletismo-{fuente}-documentos.json`). Solo descarga documentos enlazados con
lectura revisada; excluye inscritos, resultados y clasificaciones. La revisión
puede precisar IDs nativos en `citas` cuando el documento describe varios objetos.
Alcance, actividad, títulos con autoridad, organización y sesiones llevan
evidencia del documento. Un cambio de bytes no aplica lectura ni huella y avisa;
un fallo transitorio conserva la lectura revisada. Un 403/429 detiene la red,
incluido Nivel II, y no acredita ausencias. Las discrepancias entre lecturas no
eligen la última. Las sesiones conservan su evidencia en el núcleo; sin zona
horaria acreditada, se conservan como día, sin inventar un instante.

## Coincidencias e identidad

`atletismo_coincidencias` (versión 5) compara federaciones y las dos
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

El alcance solo limita (decisión del 4/11/2026): dos alcances acreditados y
distintos nunca se unen solos y van a revisión, marcados `dentro_de` o
`diferente` en `alcance`, aunque haya enlace. Con alguno `desconocido` se
decide como si no existiera y queda marcado: desconocido no es igualdad, pero
casi nada lo tiene acreditado hasta leer las circulares. `CONTIENE` orienta al
revisor y no crea relaciones. Una conciliación revisada conserva la identidad y
avisa si llegan alcances que la contradicen. Con los días enumerados por ambas
fuentes se compara el conjunto, no solo los extremos.

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
  el alcance difiere.
- `atletismo-separaciones.json`: operaciones revisadas que devuelven una
  referencia a la entidad absorbida (`atletismo_conciliacion --separar`, con
  `--turso [--simular]` o `--nucleo`). Mueven referencia, evidencias y
  pertenencia y no tocan observaciones. El almacén solo lo acepta con la entrada
  registrada, y una cosecha posterior no lo deshace: la referencia ya tiene destino.
  La relación entre conjunto y parte (`contiene`, `contenida_en`) queda en el
  registro y evita el issue del par; no va al grafo porque un `es_parte_de` entre
  grupos haría heredar a la parte la capa del conjunto y la mostraría en el chip de
  otra federación. Castro (RFEA 64834 reúne FCA 80237, FCA 80239 y FGA 112768) y
  Nassos (RFEA 67588 es parte de FCA 83074; WA 7244650 sigue con FCA, sin alcance
  acreditado). Dakar (RFEA Juegos frente al atletismo de FCA/WA) sigue unido: no
  tiene entidad absorbida que recuperar.
- Fechas discrepantes en una identidad del mismo alcance (short track clubes
  máster) quedan como conflicto visible, sin elegir fuente.
- Nivel II enlaza con una cita guardada mediante `decision: equivalencia` y
  una conciliación con su ID editorial (Ourense y Ordes, 12/12).
- `atletismo_revision --issues` corre al final del workflow cuando hubo escrituras
  en Turso o venció el reloj de publicación (siempre en ejecución manual): un issue
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
El cron corre cada 6 h y cada fuente tiene un reloj diario independiente
(`atletismo-fga`, `atletismo-fca`, `atletismo-rfea`, `atletismo-wa`), con 3 h de
margen. Tras un fallo se espera el tick siguiente, luego dos y después un día, o
más si la fuente pide `Retry-After`. Si solo falla Calendario PDF o Nivel II, el
mensual ya está guardado: el reloj avanza y el paso se señala fallido.
Las ejecuciones manuales no aplican ni anotan estos relojes.
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
ventana, la lectura se da por rota y no se retira nada. Un fallo del Calendario
PDF o de Nivel II no impide guardar la lectura mensual de RFEA: el paso se señala fallido y el
informe, incompleto; una ventana con un año sin documento Nivel II tampoco
está completa. `fuentes.{fuente}.ventana` se publica y el frontal raya en
Deportes los días posteriores a su `fin`. En el workflow: input `atletismo`; el cron
solo recoge con `CALENDARIO_ATLETISMO_RECOGIDA=true` y la
publicación requiere añadir las fuentes a `CALENDARIO_FUENTES_PUBLICAS`.

**Citas terminadas.** La ventana empieza hoy y los resultados llegan después:
`atletismo_relectura` relee en cada pasada, tras el inventario, las fichas de las
citas terminadas en los últimos 30 días. Solo añade documentos con `rol: resultados`
a la lectura guardada (`atletismo.anadir_documentos`), que hereda las evidencias de
la anterior para conservar capa, circuito y sesiones. No cambia fechas ni estados y
no acredita ausencias. Cupo por pasada: FCA 12 citas, FGA 8 y RFEA 4 (ficha y AJAX),
unas 28 peticiones; WA espera a publicarse. Va antes lo que no tiene resultados y
lleva más sin comprobar (`fuentes.{fuente}.relectura`, sin publicar). Quien ya los
tiene sigue en cola hasta los 30 días: un enlace previo a la cita puede no serlo.
Un fallo conserva lo guardado; un 403 o 429 corta la cola y la pasada se da por
bloqueada. Medido el 4/11/2026: 4 de 5 citas terminadas tenían enlace. Solo recupera
citas conocidas: octubre, sin guardar, no se recarga.

Volumen de referencia: FGA 74 antes de documentos (4 de inventario y 70 fichas y
padres), con 2,5 s de pausa. RFEA tiene un presupuesto propio de 400 peticiones
(`PRESUPUESTO_RFEA`), el resto 200: cada cita son ficha y documentos, y la rotación
añade 31 filtros deportivos y dos técnicos por mes de ventana. Nivel II mantiene
su descarga separada. Medido el 4/11/2026: 59 citas, 171 peticiones sin caché y
unos 5,5 minutos.

Para revisar sin red: `calendario.py --entrada-atletismo` importa un documento
revisado v1 (`version`, `fuente`, `eventos` con `id`, `nombre`, `url`,
`inicio`, `fin`, `lugar`, `metadatos` y opcionales `grupo`/`programa`); es
repetible y reimportar un ID actualiza sin duplicar.

## Pendiente

En orden (detalle en el diseño local):

1. Lectores de documentos. Cada fuente oficial se lee entera y el comparador la
   une a las demás; el dato se copia literal de quien lo publica y lo dudoso no se
   enlaza. Pendientes: índice general de circulares
   de las tres federaciones, sin programar y sin resolver sustituciones ni
   redirecciones. Lectura de contenido con revisión: cobertura parcial (ampliar
   `atletismo-{fuente}-documentos.json`). Sin lectura acreditada, el alcance y la
   actividad de las competiciones siguen desconocidos; la interfaz no los necesita.
   Call Room no da datos públicos. RFEA: contenido de los documentos y
   convocatorias técnicas que los filtros no devuelven. FCA: columna de calendario,
   reglamentos de series (TRS, Copas, Lliga) y convocatorias del Comitè Tècnic. Los
   destinos RFEA de `website` quedan sin resolver.
2. Comparador: faltan enlaces resueltos (destino, HTTP y edición) y sustitución
   entre IDs, que necesitan esos datos en la lectura.
3. Dakar: separar exige crear una identidad o unir FCA con WA tras revisar.
4. Circuitos, ligas, controles y tecnificación solo con documento oficial.
- Interfaz: filas de fuentes, circuitos WA y modalidad en Deportes (semana y
  lista en pantallas bajas; ☆ solo en fuentes). OR dentro de cada fila y AND
  entre filas: un circuito marcado restringe toda la selección. Los actos que no son
  competición van visibles, con la etiqueta de `actividades` de la tarjeta y un
  filtro para ocultarlos (`excluir_actividades`).
- Filtro de ámbito: sin decidir (4/11/2026). «Territorial, nacional, internacional»
  falsearía la norma, porque no hay un ámbito único. Con los adaptadores hechos se
  decidirá, con cifras de cobertura, si conviene filtrar por calendario o autoridad.
- World Athletics: publicación y fila de circuitos, con el refactor de la interfaz.
- Territoriales: esperan al modelo. Extremadura (HTML con ID) y Cantabria
  (ICS con UID) cumplen el contrato; ver el diseño local.

Resultados y marcas se delegan a la fuente oficial: se enlaza su documento o
página, sin extraer marcas (ver Citas terminadas). Rankings, sin conector; ver
[resultados](resultados-diseno.md#otras-ampliaciones).
