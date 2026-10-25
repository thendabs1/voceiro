# Contrato lógico del calendario — especificación de trabajo

Continúa el [diseño del núcleo](diseno-nucleo.md). Concreta campos,
cardinalidades y reglas. Las [decisiones de implementación](decisiones-modelo.md)
concretan el catálogo común ya implementado y la ampliación siguiente del núcleo.
El formato completo descrito aquí todavía no es una versión pública del JSON.
Se contrasta con las muestras ya revisadas, sin nuevas consultas a proveedores.

El calendario admite clasificación temática compartida con noticias desde su
diseño. La implementación de enlaces entre artículos y entidades se pospone;
su ausencia no impide clasificar un encuentro dentro de Deportes y Tenis.

## Identidades y campos comunes

Una referencia interna tiene forma lógica `{tipo, id}`. El ID es opaco y
estable; los IDs existentes se conservan. El tipo permite distinguir una
cita de una edición aunque ambas aparezcan en una vista de calendario.

| Campo | Requisito y significado |
| --- | --- |
| `id`, `tipo` | Obligatorios en cada entidad identificada. No dependen del título, horario ni posición en una descarga. |
| `nombres` | Mapa por idioma, con al menos un nombre observado para los objetos presentados en el catálogo. No fabricar traducciones; un destino externo aún sin resolver no exige crear una entidad incompleta. |
| `referencias` | Cero o más referencias externas. Cada una contiene proveedor, tipo externo, contexto e ID literal; la unicidad se aplica a esa tupla completa. |
| `evidencias` | Una o más para cada afirmación importada o editorial: registro/documento de origen, ubicación del dato y momento de observación; o decisión editorial identificada. |

Una afirmación puede ser un horario, una clasificación temática o una relación.
Se conserva su procedencia aunque el valor visible se seleccione entre varias
fuentes. La fecha de observación es un instante con desplazamiento; publicación,
modificación declarada y vigencia del hecho son campos separados y opcionales.
Los datos personales guardados por el usuario siguen otro contrato, abajo.

El documento descargado y el registro lógico extraído son objetos distintos.
Un documento puede respaldar muchos registros; cada registro resuelve como
máximo una entidad y puede quedar sin resolver. Una entidad puede tener muchos
registros de origen. No es necesario descargar cada referencia enlazada por
Core para conservarla como referencia externa.

## Entidades y cardinalidades

`0..N` permite ninguna o varias relaciones; no exige crear niveles ausentes.
Cada relación del catálogo tiene tipo y evidencia. Una referencia literal a
un participante o lugar no identificado puede conservarse sin inventar un ID.

| Objeto o relación | Campos y cardinalidad |
| --- | --- |
| Agrupación | `clase`: competición, edición, fase, cuadro, ciclo o festival. `periodo` y `etiqueta_edicion` opcionales. |
| Agrupación → agrupación | `es_edicion_de` identifica la competición recurrente: una edición tiene `0..1` competición resuelta; una competición, `0..N` ediciones. `es_parte_de` admite `0..N` padres e hijos acreditados. Ambos vínculos forman una jerarquía sin ciclos. |
| Actividad | Obra o contenido repetible; `0..N` celebraciones y `0..N` agrupaciones. Su tipo temático no es otra actividad. |
| Cita | `clase` —encuentro, función, sesión o actividad continua—, `cuando`, estado de programación y estado de ejecución. Los estados admiten desconocido. `0..N` agrupaciones y `0..1` actividad identificada. |
| Participante | `clase`: persona, equipo, pareja, club u organización. Composición y pertenencia son relaciones, con ámbito de cita/edición o intervalo de vigencia cuando se conozca. |
| Participación | Exactamente una cita, un participante resuelto o plaza/literal pendiente, y un papel; lado y orden opcionales. Una cita tiene `0..N` participaciones. |
| Inscripción | Une un participante y una edición/fase acreditada; no genera participaciones en encuentros todavía desconocidos. |
| Lugar y territorio | Recinto y unidad territorial son objetos distintos; códigos externos contextualizados por su sistema. Una cita tiene `0..N` localizaciones, con papel y período si se conocen. La asistencia online puede tener URL sin territorio físico. |
| Cobertura territorial | Relación de la competición/edición con territorios y ámbito declarado. Se separa del lugar de la cita y de la sede de un participante. |

El catálogo de relaciones es cerrado y ampliable mediante revisión: no basta
un enlace genérico para heredar eventos al seguir un objeto. En concreto,
`es_edicion_de`, `es_parte_de`, pertenencia de cita y participación tienen
semánticas diferentes. Los vínculos de identidad equivalente tampoco son
pertenencias y no se recorren como si fueran temporadas o fases.

Una pareja puede tener dos personas acreditadas en un encuentro sin que se
conozca una composición permanente. Un cuadro incompleto puede contener una
plaza «ganadora de semifinal» sin crear una persona con ese nombre.

## Fechas y estados

`cuando` contiene `inicio`, `fin`, `fin_exclusivo` y `horario_textual`. Inicio
y fin son extremos independientes con esta estructura:

| Campo del extremo | Regla |
| --- | --- |
| `fecha` | Fecha civil ISO o `null`; conservar la fecha oficial adicional si difiere. |
| `hora_local` | Hora observada o `null`; no se rellena con `00:00` para representar solo una fecha. |
| `zona` | Zona acreditada o `null`. La zona del lector no completa una zona desconocida. |
| `instante` | Instante ISO con desplazamiento o `null`. Un instante declarado por la fuente puede conservarse sin nombre de zona; una hora local sin zona/desplazamiento suficiente no se convierte a UTC. |
| `precision` | `fecha`, `hora` o `desconocida`, según lo acreditado; no se deriva de que el JSON tenga horas. |
| `certeza` | `confirmado`, `provisional` o `desconocido`, referido al extremo completo; las señales originales permiten conservar dudas adicionales sobre fecha u hora. |

El fin ausente significa duración desconocida. `fin_exclusivo` puede ser
verdadero, falso o desconocido; no se convierte automáticamente un fin a las
23:59 en el final de una función. Las reglas recurrentes y sus excepciones
se conservan sin expandir hasta disponer de una interpretación contrastada.

Los estados de programación son `programado`, `aplazado`, `cancelado` o
`desconocido`; los de ejecución, `sin_empezar`, `en_curso`, `terminado`,
`interrumpido` o `desconocido`. La condición deportiva del resultado es
independiente. Una ausencia del proveedor solo cambia la información de
observación: no cambia por sí misma ninguno de estos estados.

Semana y mes consultan solapamiento de intervalos conocidos. Los eventos de
fecha sin hora se comparan como fechas civiles; una hora sin zona se muestra
con esa limitación. Los extremos desconocidos o provisionales requieren una
presentación que no prometa una posición exacta ni una duración inventada.

## Clasificación común y compatibilidad con noticias

La revisión del código distingue tres mecanismos actuales:

- `medios.py`: sector, ámbito y etiquetas describen al medio.
- `shared/busqueda/temas.js`: los temas personales son reglas sobre texto.
- `shared/busqueda/reglas.js`: combina fuentes y temas en las selecciones.

Estos mecanismos siguen teniendo su significado. Un concepto del catálogo
común tiene `id`, nombres, alias y `0..N` conceptos más amplios; esa jerarquía
no admite ciclos. Su ID no depende de la etiqueta visible. El vocabulario
inicial se propone pequeño y revisable:

| Concepto | Concepto más amplio | Correspondencia de trabajo |
| --- | --- | --- |
| Deportes | Ninguno en este subconjunto | Compatible con el valor existente `sector: deportes`; no clasifica automáticamente cada artículo del medio. |
| Tenis | Deportes | Concepto del deporte, independiente de ATP/WTA, individuales y dobles. |
| Baloncesto | Deportes | Compartido por FEB, NBA o WNBA sin declarar equivalentes sus competiciones. |
| Automovilismo | Deportes | F1 se representa además como competición; no se convierte en sinónimo del deporte completo. |
| Cultura | Ninguno en este subconjunto | Concepto temático; no asume que todos los medios del sector actual traten exclusivamente cultura. |
| Teatro | Cultura | Tema de la actividad o función; separado de su obra, festival y municipio. |

Es un subconjunto para comprobar el contrato, no la taxonomía completa ni un
cambio de las etiquetas existentes. Otros sectores y temas se incorporarán
con sus correspondencias revisadas; `generalista`, por ejemplo, caracteriza
una publicación y no es automáticamente un tema de una cita.

La asignación temática es muchos-a-muchos: objeto, concepto, método
—fuente mapeada o decisión editorial— y evidencia. Una etiqueta externa
mantiene proveedor, vocabulario e ID/literal, incluso si aún no hay
correspondencia. Los mapeos se versionan; una corrección no borra el original.

Un encuentro clasificado como Tenis aparece al consultar Deportes por la
jerarquía de conceptos, sin duplicar asignaciones. Puede tomar Tenis de su
cuadro/edición mediante una regla explícita de clasificación, registrando el
vínculo recorrido; no se heredan por esa vía sede, categoría de edad ni todos
los temas de una colección. La ausencia de clasificación se conserva.

Modalidad, categoría de participación, edad, nivel competitivo y ámbito son
ejes separados, opcionales y con valores de origen. No se deducen por el
nombre de la liga, el proveedor, el país del jugador o el municipio del evento.

Una coincidencia de un tema personal con un titular sigue siendo una
coincidencia de búsqueda. Podrá ayudar a sugerir una clasificación, pero no
crea por sí sola una asignación editorial ni una relación noticia–evento.
El futuro enlace de artículo tendrá destino tipado, referencia de artículo,
origen de la afirmación y revisión editorial independientes, como detalla el
[núcleo](diseno-nucleo.md#noticias-espn-relaciones-de-origen-ya-comprobadas).
Su extracción, conciliación con feeds y presentación quedan para después.

## Resultados y clasificaciones deportivas

| Objeto | Campos mínimos y relaciones |
| --- | --- |
| Observación de resultado | ID de observación, cita, fuente/registro y momento de observación obligatorios. Condición declarada —provisional, final, rectificado o desconocido— y detalle literal opcional. No se reemplaza el historial anterior. |
| Línea de resultado | Participación/lado identificado; `0..N` métricas tipadas. Admite más de dos competidores y clasificación por posiciones, como en una carrera. |
| Parcial | ID local al resultado, tipo, orden y padre opcional; líneas con métricas. Permite cuartos, sets, juegos y desempates sin aplanarlos en dos totales. |
| Instantánea de clasificación | ID, fuente, observación y ámbito obligatorios: referencias a competición/edición/fase/cuadro y modalidad cuando corresponda. Corte deportivo o jornada opcional, nunca sustituido por la fecha de descarga. |
| Fila de clasificación | Participante resuelto o referencia/literal de origen pendiente; posición declarada opcional, orden de presentación y métricas. Empates no se resuelven inventando un desempate. |

Una métrica tiene código contextualizado por su definición, valor y unidad.
Los valores numéricos se conservan sin perder decimales; el texto no numérico
se representa como tal y no como cero. Un catálogo revisable define significado
y tipo —por ejemplo, puntos de partido, juegos, sets, victorias o posición—;
dos campos llamados `points` no se suman ni comparan sin esa definición.

El ganador referencia una participación cuando sea conocido; retirada,
descalificación, empate o walkover conservan su condición específica y la
evidencia. No se infieren a partir de un marcador incompleto. La marca «final»
del resultado no prueba que una clasificación posterior lo haya incorporado.

## Selección entre fuentes y cambios relevantes

La política de selección identifica objeto, bloque de datos, fuente elegida
y motivo. Horario, resultado y clasificación conservan su propia procedencia;
no se combinan silenciosamente las líneas de dos resultados para formar uno.
Una corrección editorial vive fuera del bloque reconstruido por el importador.
Un conflicto sin política suficiente queda visible como no resuelto, sin
elegir por nombre alfabético de proveedor ni por la última descarga a ciegas.

La identidad entre proveedores requiere correspondencia con evidencia y
reversión posible. Si ya existen dos IDs internos, la fusión exige conservar
redirecciones y todos los destinos de guardados/seguimientos. Una nueva fecha
con el mismo ID externo es una revisión, no otro evento por defecto.

Una novedad semántica tiene ID, objetivo tipado, clase de cambio y revisiones
anterior/posterior. Repetir una descarga idéntica no genera otra novedad.
Los marcadores en directo pueden guardarse sin producir avisos en cada cambio;
esa preferencia no está acordada. Las capacidades y condiciones por flujo
determinan qué se puede conservar o publicar, sin condicionar la identidad.

## Guardar y seguir

Guardar conserva una referencia tipada; no activa seguimiento. El seguimiento
contiene objetivo, preferencias independientes `cambios_calendario` y
`noticias_relacionadas`, y metadatos para sincronizar cambios y bajas. El
contrato personal se concretará en un documento cifrado separado con su versión
y fusión por campos, según las decisiones de implementación; no se inserta en
los pendientes de noticias.

Como criterio de diseño, seguir una competición alcanza sus ediciones futuras
acreditadas; «solo esta edición» guarda el objetivo de edición. No se inventa
la continuidad de torneos entre años recortando IDs del proveedor. Seguir un
equipo/persona alcanza sus participaciones acreditadas; para dobles se utiliza
la composición respaldada en cada encuentro, no una pareja permanente supuesta.

La expansión recorre únicamente los tipos de relación previstos. Una novedad
alcanzada por competición y equipo se muestra una vez, conservando ambos
motivos. Recordatorios, canales de entrega y avisos deportivos concretos
quedan pendientes de diseño de producto. La preferencia de noticias puede
expresarse aunque su conexión se implemente después.

## Ejemplos de representación

Son proyecciones legibles del contrato, no respuestas JSON ni nuevos datos
confirmados sobre las fuentes. Las referencias completas y evidencias se
describen en los informes enlazados por el núcleo.

| Caso ya revisado | Aplicación del contrato |
| --- | --- |
| FEB `g=4, t=2026, f=89975, p=2522807` | Competición → edición → fase → cita. El `t` se identifica dentro de `g`. Tema Baloncesto → Deportes. Dos participaciones; el visitante sin ID acreditado permanece como literal. Inicio con fecha y hora observadas, zona e instante desconocidos. Marcador y cuartos pertenecen a una observación de resultado; la clasificación es otra instantánea con ámbito propio. |
| WTA `345-2026`, cuadro `4`, encuentro `185604` | Edición → cuadro contextualizado → cita. Tema Tenis → Deportes; modalidad dobles en otro eje. Dos parejas y composición acreditada en el encuentro. Seguir a una integrante alcanza esa cita sin seguir todas las futuras citas de su compañera. |
| Cultura, ficha con varias funciones identificadas | Actividad → citas distintas, cada una con su horario y localización. Tema Teatro → Cultura cuando exista evidencia. La ficha y el tipo «teatro» no comparten identidad. |
| Festival catalán `20230607008` | Agrupación con intervalo declarado y varias localizaciones observadas. Las 429 filas no se convierten en 429 citas. Sin programación suficiente no se fabrican funciones ni horarios. |
| F1, sesiones ya recogidas | Citas conservan sus IDs actuales. Una jerarquía nueva requiere referencias acreditadas; no se deduce todo el gran premio de títulos y fechas. Un resultado de carrera admite muchas líneas por piloto, sin exigir local/visitante. |
| Noticia sobre tenis | Podrá compartir el concepto Tenis cuando esté clasificada con evidencia. Eso no la conecta con todos los partidos. La relación con un partido o persona concreta se implementará por separado. |

## Cierre y siguiente paso

Este borrador permite revisar campos y comportamiento antes de escoger tablas.
La correspondencia con el almacenamiento vigente debe concretar conservación
de IDs, extensión de referencias de origen, clasificación común, relaciones
tipadas y lectura temporal. Resultados, clasificaciones y datos personales
pueden implementarse por incrementos conservando este encaje lógico.

La migración aditiva a esquema 3 implementa la clasificación temática. Las
[decisiones de implementación](decisiones-modelo.md) fijan su catálogo, auditoría
y reclasificación, además del almacenamiento y sincronización previstos para
el núcleo ampliado. Ese núcleo pasará a JSON v2/esquema 4 al implementarse;
no exige conectar artículos ahora ni se presenta como ya implementado.
