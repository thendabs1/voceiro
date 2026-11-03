# Atletismo

Estado a 3/11/2026. Capas RFEA, Galicia (FGA) y Cataluña (FCA) recogidas en
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
  no consecutivos son varias citas relacionadas; no se rellenan huecos.
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
  acredita edad e «Internacional» no es modalidad. Normalizar modalidad y
  ofrecer filtros requiere tablas de correspondencia acordadas.
- `metadatos.inscripcion`: `plazo_textual`, `periodo` (días acreditados),
  `hora_cierre_literal` sin zona inventada y `enlaces`. Un enlace de login no
  acredita inscripción abierta. Se publica en `atletismo.valor.inscripcion`
  y el detalle lo muestra por procedencia.
- Sin migración SQL: el bloque `atletismo` viaja en el detalle JSON. La
  proyección elige con las fuentes permitidas; `atletismo.variantes` conserva
  nombre, metadatos, programación, lugar y procedencia por fuente, y una
  discrepancia activa `conflicto` sin dar prioridad a RFEA ni a la última
  descarga. El detalle solo avisa de las fechas: cada federación describe la
  sede a su manera.

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

**FGA.** Listado WordPress con ID propio y `cp_date`; las fichas aportan
organización, documentos, inscripción y resultados enlazados. Se aceptan rangos
explícitos (`12/12/2026 - 13/12/2026`). Las relaciones con circuitos que
publica el listado se conservan, incluidas las de padres fuera de ventana, que
se representan como colecciones. Los títulos que parecen circuito sin relación
acreditada van a revisión; las excepciones están en
`atletismo-citas-revisadas.json`.

**FCA.** API `tribe/events/v1` con ID propio, preferida al ICS. Devuelve 50
por página aunque se pidan 100; se exigen todas las páginas, total coherente
e IDs únicos. Las muestras son de día completo; un horario con hora falla
hasta contrastar el convenio UTC/local.

## Coincidencias e identidad

`atletismo_coincidencias` (versión 3) compara federaciones y las dos
distribuciones RFEA sin consultar webs. Normaliza mayúsculas, acentos,
puntuación, año, variantes castellano/gallego/catalán, sufijos ordinales
(`103a`→`103`, `60è`→`60`) y la etiqueta exacta `(RFEA)`. Una cita nueva
comparte identidad cuando hay un único candidato y:

- enlaza directamente a la ficha ya identificada (prioritario: cruza con la
  referencia, no con la URL); o
- coinciden fechas completas, sede y al menos tres palabras significativas,
  con Dice ≥ 0,90 y sin contradicciones de distancia, edad, edición, sexo,
  formato, modalidad ni conjunto/partes.

Fecha y sede no bastan. Dos citas que reclaman una misma identidad, o enlaces
que se contradicen, quedan para revisión. Nombre, fecha y sede nunca son ID:
la primera referencia conserva la identidad aunque se reprograme. Dos
identidades ya guardadas no se fusionan al importar: exigen conciliación.

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
- Una cita contada en una parte por una fuente (Nassos 5 km, marcha máster
  de Castro) es la misma cita si comparte día y sede; las partes solo se
  modelan con días distintos.
- Fechas discrepantes en una identidad compartida (short track clubes
  máster, Dakar) quedan como conflicto visible, sin elegir fuente.
- Nivel II enlaza con una cita guardada mediante `decision: equivalencia` y
  una conciliación con su ID editorial (Ourense y Ordes, 12/12).
- `atletismo_revision --issues` corre en cada pasada del workflow: un issue
  por par estable de IDs (marcador oculto, abiertos y cerrados), cinco nuevos
  como máximo por pasada. Cerrar un issue no fusiona datos.

## Recogida

```sh
python -m agenda.atletismo_recogida --db /tmp/atletismo.db --fuente fga --inicio 2026-11-01 --fin 2026-12-31 --informe /tmp/fga.json
```

Fuentes `fga`, `fca`, `rfea` (incluye Nivel II y requiere Poppler) y `wa`; `--turso`
sustituye a `--db`. Ventana máxima de 91 días; por defecto, hoy y 60 días más.
El informe (consultas, ventana, peticiones, pendientes, ausencias y
completitud) se guarda con el núcleo en `agenda_estado`, clave
`atletismo-informe-{fuente}`. Un fallo conserva la última lectura buena. En
Nivel II, `completo` mide la ventana; las filas de otras fechas se cuentan en
`pendientes_fuera_ventana`.

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
solo recoge con `CALENDARIO_ATLETISMO_RECOGIDA=true` (sin fijar) y la
publicación requiere añadir las fuentes a `CALENDARIO_FUENTES_PUBLICAS`.

Volumen de una pasada de 60 días: unas 130 peticiones (FGA ~63, FCA 2, RFEA
~65 sin caché).

Para revisar sin red: `calendario.py --entrada-atletismo` importa un documento
revisado v1 (`version`, `fuente`, `eventos` con `id`, `nombre`, `url`,
`inicio`, `fin`, `lugar`, `metadatos` y opcionales `grupo`/`programa`); es
repetible y reimportar un ID actualiza sin duplicar.

## Pendiente

- Clasificar circuitos y tecnificación desde las fichas.
- Interfaz: el detalle solo muestra inscripción; faltan modalidades
  normalizadas y filtros comunes.
- World Athletics: interfaz de circuitos y filtros (fase 2).

Resultados, marcas y rankings siguen sin conector; ver
[resultados](resultados-diseno.md#otras-ampliaciones).
