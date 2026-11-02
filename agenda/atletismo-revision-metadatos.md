# Revisión de metadatos, RFEA y solapamientos

2/11/2026. Revisión sobre capturas oficiales públicas. Complementa la
[primera integración](atletismo-integracion.md). No activa recogida ni publicación.

## ¿Tenemos tipo de prueba?

**Parcialmente.** Conservamos la modalidad del calendario y categorías originales,
pero todavía no las normalizamos ni ofrecemos filtros por ellas. El detalle
actual muestra inscripción; no muestra los demás metadatos de atletismo.
El bloque JSON admite ampliaciones sin migración SQL. Un filtro indexado por
modalidad requerirá ampliar también consulta/proyección: guardar JSON no basta.

Hay que separar estas dimensiones, sin reducirlas a un único `tipo`:

| Dimensión | Ejemplos observados | Situación |
| --- | --- | --- |
| Modalidad | Ruta, Cross/Campo a Través/Cros, Marcha/Marxa, Pista Aire Libre/Aire Lliure, Short track/Pista Curta/Pista Coberta, Trail | RFEA y FGA: `modalidad_literal`; FCA: categorías con ID. Correspondencias comunes pendientes de acordar; las denominaciones de pista requieren conservar el original |
| Pruebas del programa | Medio Maratón MASC., Medio Maratón FEM.; cross por edades/sexo | RFEA ofrece un Excel separado por SFID. Se conserva su enlace; no se importa el listado todavía |
| Edad y sexo | Sub 16, Sub 20, máster, masculino, femenino | No extraer del título por defecto. Las etiquetas «Promoció» y «Màster» de FCA no son modalidades; «Promoció» no acredita una edad concreta |
| Formato deportivo | Individual, clubes, relevos, federaciones, combinadas | El selector «Categoría» RFEA mezcla estas dimensiones con edades y distancias; la ficha puede dejarlo vacío |
| Tipo de actividad | Competición, tecnificación; circuito/plan como agrupación | La importación actual usa `encuentro` para todas las entradas. PGTA se conserva, pero falta distinguir semánticamente tecnificación y competición |
| Ámbito y clasificación | Autonómico/Nacional/Internacional FGA; área RFEA/EA/WA; categoría WA | No son modalidad ni lugar. «Internacional» aparece incluso en el selector de disciplina RFEA: conservarlo como original sin inventar modalidad |
| Homologación | «Homologada» en FGA | Conservar la etiqueta. No convertirla en homologación de todas las distancias ni en categoría WA |

Propuesta de diseño: conservar los originales con procedencia y añadir una
modalidad normalizada mediante correspondencias explícitas; mantener pruebas
como lista independiente, sin crear sesiones fechadas si no hay programa horario.
Edad, sexo, formato y actividad serían dimensiones separadas y opcionales.
Una competición puede ofrecer varias pruebas: no imponer un único valor.

## Reutilizar el modelo de los GP

**Sí: la validación ya se ha generalizado para reutilizar esta estructura.** Se han
revisado `motogp.py`, `oficial_f1.py`, `deporte.py`, `nucleo.py`, `tiempos.py`,
`publicacion.py` y la lectura compartida `shared/calendario/{fechas,proyeccion}.js`.

| Caso de atletismo | Representación propuesta | Soporte actual |
| --- | --- | --- |
| Carrera de un día | Cita con inicio=fin y precisión de día, o con hora acreditada | Ya existe; no necesita sesiones ni contenedor adicional |
| Campeonato/meeting de días consecutivos, sin programa | Una cita con intervalo inclusivo | Ya existe; no hay que convertirla en GP. La interfaz detecta varios días y la presenta como prolongada aunque su clase sea `encuentro` |
| Campeonato/meeting con jornadas o sesiones fechadas | Agrupación `competicion`, cita principal con sus días, sesiones dentro de `programa` | Contrato de importación y validación implementados. La proyección reúne sesiones en una tarjeta y la interfaz muestra el programa; todavía falta obtener programas fechados reales de las fuentes |
| Circuito con jornadas 7, 14 y 28 | Agrupación `circuito`; tres citas relacionadas | El núcleo ya admite la clase. No representar 7–28 como celebración diaria ni usar el artículo padre como cuarta cita |
| Plan de tecnificación | Agrupación `ciclo` o `coleccion`, sesiones técnicas fechadas y tipo de actividad separado | Clases existentes; falta adaptar el importador y resolver IDs de padres |

La limitación inicial de `nucleo.validar` exigía `actividad_continua` y grupo
`gran_premio`. Ahora admite también contenedor `competicion` con principal
`encuentro` o `actividad_continua`; conserva las exigencias previas para GP.
No se falsea la clase del campeonato como `gran_premio`. Una sesión necesita
principal y `tipo_sesion`; al publicar se comprueba que pertenezca a la
agrupación de su principal. El programa puede añadirse más tarde a un
`encuentro` sin cambiar su clase ni identidad.

No hace falta migrar tablas para estas clases o intervalos: ya existen. El
importador actual de atletismo genera `agenda`/`programa` y acepta padres de
circuito o plan declarados en una entrada revisada. No clasifica ni resuelve
esos padres automáticamente a partir de títulos.

La identidad de sesión debe proceder de la fuente o de una correspondencia
revisada; no crear una por cada fila de «Pruebas» ni usar nombre+fecha como
ID estable. Una prueba puede tener series, semifinal y final en días distintos.
Se pueden incorporar sesiones con fecha sin hora si está acreditada; el Excel
RFEA contrastado no acredita ni siquiera esa fecha de cada prueba.

Verificación temporal en memoria: un encuentro 12–13/12/2026 se publica y
solapa ambos días, sin solapar 11/12 ni 14/12. Las inscripciones siguen siendo
metadatos ajenos a ese intervalo. Las correspondencias entre federaciones
son otro problema: el modelo GP no resuelve por sí mismo los duplicados.

## RFEA: lo que sí se ha contrastado

El [calendario](https://atletismorfea.es/calendario) ofrece filtros distintos
para tipo Deportivo/Federativo, disciplina, área, categoría WA y categoría.
Los lectores actuales no conservan todos los IDs de esos vocabularios ni la
categoría WA de cada cita. No prometer filtros completos a partir de las fichas.

En cinco fichas se ha observado un `championship` y un SFID por ficha:

| Ficha | championship | SFID |
| --- | --- | --- |
| Huelva 21K | 65127 | a0bQs00000FQCJSIA5 |
| Cros Granollers | 69182 | a0bQs00000Nug49IAB |
| España cross clubes, Atapuerca | 64831 | a0bQs00000DqlH9IAJ |
| España 5 km máster, Negreira | 64837 | a0bQs00000DqlHFIAZ |
| España short track máster clubes | 64833 | a0bQs00000DqlHBIAZ |

Esto amplía el contraste de identidad, sin demostrar estabilidad histórica al
cambiar temporada, slug o edición. El lector mantiene los dos identificadores;
la URL de ficha permite resolver el primero. No se ha acreditado ID compartido
con las territoriales.

Se descargaron dos Excel de **pruebas**, distintos del Excel anual de calendario:

- [Huelva](https://atletismorfea.es/calendario/pruebas/excel/a0bQs00000FQCJSIA5): una columna «Prueba», dos filas, medio maratón masculino y femenino.
- [Granollers](https://atletismorfea.es/calendario/pruebas/excel/a0bQs00000Nug49IAB): una columna «Prueba», veinte filas, cross por sexo y categorías desde S8 a máster.

Estas muestras no contienen ID de prueba, fecha ni hora. Sirven para describir
el programa, no para generar veinte sesiones de calendario ni asociar resultados
por nombre sin correspondencias adicionales. No se consultaron inscritos.

Documentación se carga por `/ajax/championship-documents/{sfid}`. Huelva respondió
«No hay resultados»; Atapuerca devolvió enlace a normativa oficial. La ficha
HTML por sí sola no contiene esos documentos. El lector conserva ahora los
enlaces `.c_e_link` (web, pruebas u otros enlaces expresamente rotulados), pero
**aún no incorpora la respuesta de documentación**. Un enlace de acreditación
de prensa no es inscripción deportiva ni web del organizador.

### Cobertura y Nivel II

El [Excel deportivo anual](https://atletismorfea.es/ajax/calendario/excel/2026/Deportivo)
tiene 464 filas, sin IDs ni enlaces, con repeticiones. No equivale a 464 eventos
únicos. Los meses noviembre/diciembre tienen 79 apariciones para 61 URLs. La
lectura mensual es útil para identidad, pero no establece por sí sola extremos
fuera de ventana: Juventud aparece del 1 al 15 de noviembre y el Excel anual
anuncia 30/10–15/11. No unir filas del Excel a fichas automáticamente por título.

**Nivel II sí necesita cobertura adicional.** El
[PDF enlazado por RFEA](https://atletismorfea.es/sites/default/files/2025-03/CalendarioNivel_II_general.pdf)
consta de 15 páginas y declara actualización a 15/10/2026, aunque su URL contiene
2025-03. Incluye federación, fecha, tipo, nombre, instalación y ciudad, sin un ID
de competición visible. La fecha de actualización del documento importa más
que la carpeta de su URL; tampoco acredita cambios posteriores al 15 de octubre.

Contrastes concretos con el mensual de enero (39 URLs) y noviembre/diciembre:

- Nivel II incluye cross gallego de clubes en La Rúa el 3/1 y controles FGA
  del 10/1 que no aparecen en el mensual de enero revisado.
- Incluye el campeonato catalán de cross de clubes de Vic del 1/11 y marcha
  de invierno de Pontevedra del 21/11: aparecen en las territoriales, no en
  las 61 fichas mensuales RFEA de noviembre/diciembre.
- La marcha de Pontevedra figura como tipo `AL` en el PDF, mientras FGA dice
  «Marcha». Es una discrepancia de clasificación: no dar autoridad universal
  al campo «Tipo» de Nivel II.
- El PDF recoge un campeonato gallego de clubes sub-16 «Aprazado» el 4/7 y
  otra entrada el 3/10. No convertir ausencia en cancelación ni deduplicar
  ambas por nombre sin resolver reprogramación e identidad.

El PDF no es una segunda capa deportiva independiente: describe nivel y
referencias de citas que también pueden estar en FGA/FCA. Hace falta resolver
identidad y actualización antes de incorporarlo automáticamente. «RFEA completa»
sigue pendiente; el importador local actual no cubre este PDF.

## Solapamientos contrastados

Ventana común 1/11–31/12/2026. Capturas FGA con `cp_date` explícito, sin filtros
de ámbito: 35 artículos de noviembre y 22 de diciembre. FCA: 53 citas, dos páginas.
RFEA: 35 URLs en noviembre y 26 en diciembre. Son **171 entradas por fuente**,
no competiciones únicas ni medida de completitud anual. Comparación manual
de nombres, fechas, lugares y fichas; no se ha aplicado deduplicación automática.

| Caso | Evidencia observada | Tratamiento propuesto |
| --- | --- | --- |
| España 5 km máster, Negreira, 15/11 | RFEA 64837, FGA 113590, FCA 82885 | Primera correspondencia revisada incorporada: una identidad con tres procedencias y capas; diferencias literales de sede conservadas como discrepancia |
| Cross Ponte Romana, San Martiño, A Clásica Negreira y Memorial Belarmino | Coinciden entre FGA y RFEA por nombre/fecha; San Martiño tiene sede RFEA «San Martiño» y FGA «Ourense» | Candidatos revisados; preservar las diferencias de sede y comprobar identidad antes de consolidar |
| Atapuerca | RFEA separa Cross Internacional 64930, 21–22/11, y campeonato de España clubes 64831, 22/11; FCA 83650 enlaza expresamente a la ficha 64831 | Resuelto por referencia directa: FCA y el campeonato comparten identidad; el cross conserva otra identidad y duración. El paréntesis del título no bloquea la correspondencia |
| Marcha Castro Urdiales, 13/12 | Una ficha RFEA para promoción + 10 km máster; FCA 80237 y 80239 separadas | Correspondencia de conjunto y partes. Ni borrar una categoría ni duplicar íntegramente el programa |
| Juegos de la Juventud | RFEA Excel 30/10–15/11; FCA 83346 8–10/11 | Conflicto de alcance/fechas por resolver con programa oficial; no escoger automáticamente la fecha RFEA |
| España short track máster clubes | RFEA 64833 5–6/12, sede «a designar»; FCA 83644 5/12, Madrid | Discrepancia de fecha final y sede; no tratar Madrid como dato confirmado en ambas fuentes |
| IV circuito Deputación A Coruña | FGA 127481 anuncia circuito general el 7/11, «Varias sedes»; su ficha enumera jornadas 7, 14 y 28/11 | La muestra revisada ya declara agrupación + tres citas. El lector bruto aún devuelve el artículo padre: requiere clasificación revisada antes de importar |

También hay candidatos FCA/RFEA en Granollers, Itálica, Jean Bouin, Valencia,
España clubes sub-16/sub-20, clubes máster mixtos, Europa de cross, Venta de Baños,
Cursa dels Nassos y San Silvestre Vallecana. Una capa territorial incluye citas
fuera de su territorio; no usar el proveedor como filtro geográfico.

La demo anterior de **89 entradas** (35 FGA + 53 FCA + 1 RFEA) no acreditaba
89 competiciones diferentes: ya incluía el solape Negreira y el artículo padre
del circuito. Mantener referencias independientes evita fusiones equivocadas,
pero permite duplicados visibles donde aún no se acreditaron equivalencias.
Ya existe una tabla revisada con Negreira; falta extenderla y resolver relaciones conjunto/parte;
la semejanza de títulos solo puede proponer candidatos.

## Cambios mínimos de esta revisión y verificación

- FGA acepta el separador de rango explícito `12/12/2026 - 13/12/2026`;
  antes fallaba el mes de diciembre. Mantiene rechazo de fechas sueltas no
  consecutivas y rangos invertidos. Conserva etiquetas de listado (incluida
  homologación) e iconos de ámbito que antes se omitían.
- RFEA conserva fecha literal de ficha y enlaces rotulados, incluido Excel
  de pruebas. La fecha sin año no sustituye a los días acreditados del calendario.
- Pruebas de atletismo: trece casos, incluidos rangos, etiquetas, identidad,
  enlaces, inscripción, paginación, programa, circuitos y equivalencias con
  varias procedencias. La suite completa pasó en el
  [CI del commit adc3a2fa](https://github.com/thendabs1/voceiro/actions/runs/41466633236).
  Ninguna fuente activada ni publicada.

Siguientes decisiones de diseño: correspondencias entre federaciones,
modalidades comunes y presentación en detalle; extender la resolución de
circuitos/tecnificación desde las fichas.
La recogida automática vendría una vez cerradas esas decisiones y Nivel II.
