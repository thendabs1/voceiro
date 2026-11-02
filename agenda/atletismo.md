# Atletismo

Estado a 2/11/2026. Capas RFEA, Galicia (FGA) y Cataluña (FCA) con recogida
manual operativa; **sin cron ni publicación**. World Athletics tiene contrato
propio, sin adaptador: [atletismo-world-athletics.md](atletismo-world-athletics.md).

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
  descarga.

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
  cuyo ID se conserva (Jean Bouin, Granollers, San Martiño).
  `atletismo_conciliacion` prepara una copia **local** del núcleo: solo
  principales sin sesiones, resultados ni políticas afectados, sin reescribir
  documentos ni observaciones. No escribe en remoto.
- `atletismo_revision --issues` corre en cada pasada del workflow: un issue
  por par estable de IDs (marcador oculto, abiertos y cerrados), cinco nuevos
  como máximo por pasada. Cerrar un issue no fusiona datos.

## Recogida

```sh
python -m agenda.atletismo_recogida --db /tmp/atletismo.db --fuente fga --inicio 2026-11-01 --fin 2026-12-31 --informe /tmp/fga.json
```

Fuentes `fga`, `fca` y `rfea` (incluye Nivel II y requiere Poppler); `--turso`
sustituye a `--db`. Ventana máxima de 91 días; por defecto, hoy y 60 días más.
El informe (consultas, ventana, peticiones, pendientes y completitud) se guarda
con el núcleo en `agenda_estado`, clave `atletismo-informe-{fuente}`. Un fallo
conserva la última lectura buena. En el workflow: input `atletismo`; el cron
solo recoge con `CALENDARIO_ATLETISMO_RECOGIDA=true` (sin fijar) y la
publicación requiere añadir las fuentes a `CALENDARIO_FUENTES_PUBLICAS`.

Primera recogida real (run 41529257572, 1/11–31/12): FGA 64 peticiones y 56
citas; FCA 2 y 53; RFEA 66 y 61. Son recuentos por fuente, no competiciones
únicas. Nivel II: 11 citas en ventana y 36 filas pendientes del anual.

Para revisar sin red: `calendario.py --entrada-atletismo` importa un documento
revisado v1 (`version`, `fuente`, `eventos` con `id`, `nombre`, `url`,
`inicio`, `fin`, `lugar`, `metadatos` y opcionales `grupo`/`programa`); es
repetible y reimportar un ID actualiza sin duplicar.

## Pendiente antes de conectar

1. Aplicar en remoto las tres conciliaciones sobre una carga nueva, con
   control de revisión; no subir el snapshot local usado para probarlas.
2. Incidencias abiertas, sin elegir dato por orden de descarga:
   [261](https://github.com/thendabs1/voceiro/issues/261) clubes máster short
   track (FCA 5/12 Madrid; RFEA 5–6/12 «a designar»);
   [262](https://github.com/thendabs1/voceiro/issues/262) marcha máster y
   [263](https://github.com/thendabs1/voceiro/issues/263) Nassos, relación
   programa/parte sin modelar (Nassos RFEA 67588 solo tiene 5 km); Dakar (FCA
   8–10/11; RFEA el periodo de los Juegos 30/10–15/11), sin issue todavía.
   [264](https://github.com/thendabs1/voceiro/issues/264) y
   [265](https://github.com/thendabs1/voceiro/issues/265) quedan resueltos al
   aplicar la conciliación.
3. Nivel II: Ourense 12/12 (FGA 112623) y Ordes 12/12 (FGA 112625, 12–13/12)
   requieren revisión concreta; separar la cobertura de la ventana de la del
   anual y llevar los pendientes del PDF a issues.
4. Reconciliar citas conocidas trasladadas fuera de la ventana; la última
   lectura buena no equivale a fecha vigente.
5. Clasificar circuitos y tecnificación desde las fichas y resolver
   conjunto/partes (marcha de Castro Urdiales, Vic: campeonato y cross).
6. Interfaz: el detalle solo muestra inscripción; faltan modalidades
   normalizadas y filtros comunes.

Resultados, marcas y rankings siguen sin conector; ver
[resultados](resultados-diseno.md#otras-ampliaciones).
