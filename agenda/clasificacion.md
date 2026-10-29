# Clasificación de citas

Modelo común para todas las fuentes de agenda. Diseño cerrado el 27/10/2026 y
revisado con datos el 28/10/2026. **Implementado en Galicia, Madrid, CyL, Kulturklik y
Zaragoza** ([clasificador.py](clasificador.py) con las tablas de
[tablas/](tablas/)): los lectores guardan el vocabulario en bruto y la
clasificación se decide al publicar. Galicia se recoge solo en gallego,
directamente al núcleo, manteniendo sus referencias del piloto. Las fases y lo
pendiente de revisar están al final.

## Para qué sirve

La agenda se muestra junto a las noticias y comparte con ellas el parser de
búsqueda: en [consulta.js](../shared/calendario/consulta.js) cada ámbito
(`teatro:`, `musica:`, `deportes:`) selecciona a la vez titulares (lista
`noticias`) y citas (`tema`). Los modos personales son búsquedas guardadas y
«Seguir» es una línea de tema. De ahí salen tres niveles, por este orden:

| Nivel | Pregunta | Dónde se usa |
| --- | --- | --- |
| **Tema** | ¿Alguien se haría un modo o lo seguiría, para noticias y citas a la vez? | Ámbito del parser, modos, Seguir |
| **Filtro del calendario** | ¿Ayuda a elegir un plan («talleres», «con niños», «gratis»)? | Solo la vista de agenda |
| **Etiqueta** | Lo demás: subgéneros, ciclos, árboles de portal, destinatarios concretos | Evidencia guardada y texto buscable |

Los recuentos de las fuentes sirven para comprobar que un valor visible tiene
volumen, no para crear valores.

## Temas

Dos niveles: **Cultura** y **Deportes** con hijos; el resto, raíces sin hijos.
Un evento puede tener varios temas cuando la fuente acredita varios
contenidos. Los términos de noticias son una propuesta inicial; se revisan con
titulares reales antes de publicarlos, porque el comparador busca por prefijo
(«circo político»).

| Tema | Incluye | No incluye | Noticias (propuesta) |
| --- | --- | --- | --- |
| **cultura** | Sus hijos y las citas de alcance cultural sin disciplina clara (festival multidisciplinar) | Lo que solo se celebra en un centro cultural | `cultura` + los de sus hijos |
| ↳ musica | Creación e interpretación musical, ópera, zarzuela | Ambientación musical de otra actividad | `música`, `concierto`, `ópera`, `orquesta` |
| ↳ teatro | Teatro, mimo, títeres, monólogo | Cualquier «espectáculo» sin más detalle | `teatro`, `teatral`, `dramaturgia` |
| ↳ danza | Danza artística, ballet, baile social | Baile como ejercicio (→ deportes) | `danza`, `ballet`, `coreografía` |
| ↳ circo | Circo, nuevo circo, clown | Acrobacia deportiva | `circo`, `circense` |
| ↳ magia | Ilusionismo | Esoterismo | `ilusionismo`, `espectáculo de magia` |
| ↳ cine | Cine, documental, animación | Cualquier vídeo o retransmisión | `cine`, `película`, `cortometraje` |
| ↳ artes-visuales | Pintura, escultura, fotografía, ilustración, cómic, arte urbano | Una exposición de otro tema (el formato no basta) | `artes plásticas`, `pintura`, `escultura`, `fotografía` |
| ↳ literatura | Escritura, libros, poesía, lectura, narración oral, bertsolarismo | Presentación de un libro técnico | `literatura`, `novela`, `poesía`, `bertsolarismo` |
| ↳ patrimonio | Patrimonio material, inmaterial y documental; arqueología | Patrimonio financiero; turismo genérico; la sede (museo, archivo) | `patrimonio cultural`, `arqueología`, `monumento` |
| ↳ cultura-popular | Tradiciones, folclore, fiestas tradicionales | Cualquier fiesta | `folclore`, `fiestas populares`, `sardana` |
| **deportes** | Competición y práctica, incluida la local | Bienestar genérico | `deporte` + los de sus hijos |
| ↳ tenis, baloncesto, automovilismo, motociclismo, futbol, futbol-americano, hockey-hielo, beisbol, ajedrez, atletismo | Los existentes en el [catálogo](../shared/catalogo-tematico.json); el resto de deportes va a `deportes` con su especialidad como etiqueta | — | Los de `AMBITOS` hoy |
| **ciencia** | Investigación y divulgación científica | Un taller por ser educativo | `ciencia`, `astronomía` |
| **tecnologia** | Informática, capacitación digital, IA, robótica | Cualquier actividad con pantallas | `tecnología`, `inteligencia artificial` |
| **medio-ambiente** | Naturaleza, ecología, sostenibilidad | Una excursión por ser al aire libre | `medio ambiente`, `biodiversidad` |
| **gastronomia** | Cocina y cultura alimentaria | Comida social sin contenido culinario | `gastronomía`, `cocina` |

`exposiciones:` deja de ser ámbito (es un formato) y su contenido pasa a
`artes-visuales:` o al tema de la exposición. Se cambia ahora, con el
calendario apagado, sin transición.

Quedan como **etiqueta**, buscables pero sin ámbito: artes escénicas sin
disciplina, historia y humanidades, idiomas, educación, empleo y empresa,
economía, salud y bienestar, turismo, juegos y ocio, participación ciudadana,
política y administración, religión, medios, movilidad, moda, vida práctica.
Fotografía se reduce a `artes-visuales`; narración oral y bertsolarismo a
`literatura` (bertsolarismo también `cultura-popular` cuando proceda).

## Filtros del calendario

| Eje | Valores | Notas |
| --- | --- | --- |
| Formato (varios si coexisten) | concierto, representacion, proyeccion, exposicion, curso-taller, charla-encuentro, lectura-club, festival, feria-mercado, fiesta, visita-ruta, competicion-deportiva, practica-deportiva | Una categoría que enumera alternativas («exhibición, proyección, competición») no asigna las tres. Festival no crea funciones. Concurso, entrega de premios, ceremonia, juego, campamento, degustación: etiquetas |
| Público (varios) | infancia, juventud, familias, mayores | **Solo dato, sin filtro** (decisión 28/10): cobertura desigual; un filtro «con niños» escondería muchas citas. Galicia sí lo ofrece al solicitar `tipoPublico` (160/209 en la revisión); el piloto no lo pedía. Destinatarios declarados, no deducidos |
| Precio | gratis, pago | En los datos también `mixto` y `desconocido`; desconocido no es gratis: una tarifa sin importe numérico ≥ 0 anula «gratis» ([0, ?] sin determinar, [5, ?] pago) |
| Acceso | libre, con-inscripcion | Inscripción no implica pago. Invitación, cupo y reserva se guardan |
| Modalidad | presencial, en-linea | Híbrida y desconocida se guardan |

Accesibilidad (movilidad, visual, auditiva, cognitiva × sí/parcial/no/desconocida),
importes, edades, idioma y aforo son datos estructurados, no filtros
iniciales. Otros destinatarios (mujeres, profesionales, personas desempleadas…)
se conservan y son buscables.

## Alcance y publicación

Cada cita tiene un **alcance cultural** (`cultural`, `no-cultural`,
`desconocido`), que decide por cita la evidencia, no la sede ni el
organismo. El usuario no lo ve como filtro: `cultura:` reúne sus hijos y las
citas culturales sin disciplina.

La agenda publica cultura y ocio local (deporte local, ferias y fiestas,
formación abierta, rutas). Se **guardan y cuentan, sin publicar**: culto,
actos partidistas, trámites y formación restringida (para funcionarios,
personas desempleadas, profesionales). Los debates públicos, el patrimonio
religioso y la formación abierta sí se publican. Una cita válida sin tema se
publica en «Sin clasificar»; nunca recibe `cultura` como sustituto.

| Caso | Tema | Formato | Alcance |
| --- | --- | --- | --- |
| Taller de escritura | literatura | curso-taller | cultural |
| Pilates en centro cívico | deportes | practica-deportiva | no cultural |
| Curso de nóminas | (etiqueta economía) | curso-taller | no cultural; formación abierta: se publica |
| «CircoMagia» sin separar | cultura (etiqueta artes escénicas) | representacion | cultural |
| Feria del libro / feria comercial | literatura / (etiqueta sectorial) | feria-mercado | cultural / no cultural |
| Fiesta tradicional / fiesta genérica | cultura-popular / sin tema | fiesta | cultural / desconocido |
| Misa / concierto sacro | (etiqueta religión), sin publicar / musica | — / concierto | no cultural / cultural |
| Carrera popular | atletismo | competicion-deportiva | no cultural |

## Quién clasifica

| Pieza | Responsabilidad |
| --- | --- |
| Lector | Extrae identidad, fechas, lugar y **todos** los campos de clasificación con su literal, código, idioma y ruta. No decide temas |
| Tabla de la fuente | Valor de origen (fuente + campo + código o literal exacto) → valores de los ejes, con justificación. Nombres iguales de fuentes distintas no comparten significado |
| Clasificador común | Aplica las tablas, resuelve conflictos, calcula alcance y cobertura |
| Publicación | Aplica la política editorial; nunca descarta por falta de tema |

Cada valor de origen está en uno de tres estados, por eje: `mapeado`,
`sin-correspondencia` (pendiente o ambiguo) o `no-clasificante` (revisado:
gestión, navegación, ciclo). Un evento puede tener formato resuelto y tema
pendiente.

**Reglas permitidas:** coincidencia exacta en campos de vocabulario,
normalización declarada (espacios, Unicode, mayúsculas), patrones acotados en
campos concretos (importe, edad) y correcciones editoriales de una referencia
con motivo. **Prohibidas:** reglas sobre título o descripción para decidir
tema, alcance, gratuidad, cancelación o identidad; clasificar por sede,
dominio u organismo.

**Versiones.** Modelo, tablas de cada fuente y motor llevan versión. Al
cambiar una tabla se recalcula una generación completa desde la evidencia, se
compara (añadidas, retiradas, cambiadas) y sustituye a la anterior de una vez;
la anterior queda como auditoría. Nunca se suma una versión nueva sobre la
vieja (hoy `c.tema` acumula `-v1` y `-v2`).

**Informe de cobertura** por fuente y eje: valores distintos, revisados, sin
correspondencia, eventos afectados, conflictos y literales pendientes con
ejemplos. Separa «la fuente no lo dice» de «no sabemos interpretarlo». El
objetivo es el 100 % del vocabulario revisado y contado, no el 100 % de
eventos con un tema inventado.

## Qué se fija ya y qué evoluciona

**Fijo desde ahora:** los tres niveles, el significado e identificador de
cada ámbito, los límites entre hermanos, la jerarquía, el alcance, la
política de publicación y el tratamiento de lo desconocido. Cambiar el
significado de un ámbito que ya usan modos o seguimientos es lo caro.

**Evoluciona:** tablas de correspondencia, etiquetas, términos de noticias y
valores nuevos con identificador nuevo; recalcular es barato porque la
evidencia se conserva. Un valor nuevo entra si pasa el mismo criterio: para un
tema, que alguien lo seguiría en noticias y citas y que hay citas publicables;
para un filtro, que ayuda a elegir un plan y los datos lo acreditan. En
espera: fotografía, arquitectura, historia y narración oral como temas
propios; videojuegos y juegos de mesa; idiomas y campamentos como filtros;
otros públicos.

## Datos de la revisión (28/10/2026)

9.760 registros de las cinco fuentes culturales: tema con disciplina 56 %,
solo `cultura` 10 %, sin tema 34 %; formato 91 %; público 12 %; precio ~70 %.
Ninguna fuente separa formato y tema: publican un solo vocabulario que mezcla
los dos («Concierto» da música y concierto; «Exposición», «Conferencia» o
«Taller» solo formato). Por eso cada tabla da, por valor, tema, formato o los
dos.

Decisiones: exposiciones, festivales y espectáculos sin disciplina de una
agenda cultural reciben `cultura` (correspondencia revisada valor a valor, no
un defecto); charlas y talleres sin disciplina quedan sin tema y se publican
con su formato; el público es dato. Con el núcleo de producción, tras
clasificar: tema 80 % (CyL), 78 % (Kulturklik), 63 % (Madrid) y 65 %
(Zaragoza) de los eventos publicados.

## Pendiente de revisar

Notas que dejó la implementación; las de cada valor están en su tabla (`nota`).

1. **Galicia (resuelto):** tabla con los 35 tipos del catálogo oficial gallego,
   público y entrada. «Espectáculo» → `cultura` + representación;
   «Proxección audiovisual» → proyección sin tema; «Festa de interese turístico»
   → fiesta sin tema. «Divulgación» es hija de exposición, no acredita ciencia.
   Se retira el prefijo `exposiciones:`; el ID antiguo se conserva en el catálogo.
   La recogida castellana queda aplazada: el 28/10 declaró 202 resultados pero
   devolvió 200 incluso paginando; cuatro traducciones diferían en horario y
   había un enlace ambiguo. No se relaja la comprobación de integridad.
2. **Política de publicación (aplazada):** culto, actos partidistas y
   formación restringida aún se publican. Madrid solo trae 2 «ActosReligiosos»,
   y uno es patrimonio; la regla de no publicar se hará cuando una fuente
   traiga volumen.
3. **Temas antiguos en el núcleo:** los `c.tema` que asignaban los lectores
   siguen en las entidades hasta que su observación se compacte; al publicar
   se ignoran en las fuentes con tabla.

Resuelto el 28-10: Madrid toma el precio de `PRECIO` (texto) y `GRATUITO=1`,
porque `GRATUITO=0` no implica pago; Zaragoza «Imagen y sonido» → `cultura`;
en Kulturklik «Invitación» es gratis y «Inscripción» sin más sigue sin precio.
Cada tema de las tablas tiene su prefijo en el buscador (solo agenda; las
competiciones suman noticias por titular) y el worker filtra por `formatos=`
y `precio=`.

## Fases

1. **Clasificador único:** catálogo de ejes, tablas declarativas por fuente,
   estados por valor, sustitución de generaciones e informe de cobertura.
   Sustituye `c.tema` cultural y la clasificación del piloto; los deportes
   pasan por el mismo contrato. Los ámbitos de `consulta.js` se generan desde
   el catálogo (las raíces reúnen también los términos de noticias de sus
   hijos).
2. **Reconstrucción cultural:** copia de la generación anterior; se conservan
   las referencias externas (identidad irreversible) y los deportes; las cinco
   fuentes culturales se regeneran de una vez con evidencia completa (público,
   precio y vocabularios que hoy se descartan).
3. **Ampliación:** fuentes en el orden de [fuentes.md](fuentes.md#lista-cerrada).
4. **Lectura e interfaz:** facetas de todos los filtros, «Sin clasificar»
   visible y nueva interfaz antes de activar el calendario.
