# Núcleo del calendario — contrato lógico para revisar

Estado: **propuesta de diseño, sin migración ni adaptador nuevo**. Continúa
el [modelo propuesto](modelo-propuesto.md) con FEB, tenis ATP/WTA y NBA de
ESPN, y las agendas culturales como casos de contraste. SportsEvents24 queda como
candidata posterior; su cuota no condiciona las entidades del calendario.
Se trabaja con las [muestras FEB ya revisadas](investigacion/06-feb.md) y el
[contraste ESPN, ampliado con Core y noticias](investigacion/07-multideporte-y-seleccion.md).
Las etiquetas y referencias siguientes no son un contrato
JSON ni nombres definitivos de tablas.

Este documento define la base conceptual. Las [decisiones del modelo](decisiones-modelo.md)
concretan la implementación por incrementos. El último detalle sobre FEB no sustituye la
valoración conjunta de tenis, otros deportes, cultura, noticias y seguimiento.

La continuación es el [contrato lógico propuesto](contrato-propuesto.md), con
campos, cardinalidades, clasificación temática compatible con lo existente y
ejemplos. La conexión con artículos concretos puede implementarse después;
la clasificación común forma parte del diseño actual.

## Primer alcance

Propongo concretar primero citas, agrupaciones, participantes, lugares y
procedencia. Antes de cerrar el contrato también hay que comprobar cómo se
relacionan resultados, clasificaciones, noticias y preferencias personales con
esas identidades, aunque su implementación pueda hacerse en otro incremento.
Semana y mes serán consultas sobre él.

| Objeto | Relaciones y límites |
| --- | --- |
| Agrupación tipada | Competición, edición/temporada, fase, cuadro, ciclo o festival. Puede agrupar otras agrupaciones y citas mediante relaciones explícitas, sin imponer todos los niveles. |
| Actividad/obra | Contenido repetible al que pueden remitir varias celebraciones. Puede pertenecer a ciclos; el tipo «teatro» sigue siendo una clasificación. |
| Cita/celebración | Tiene identidad independiente del horario; admite intervalo, tiempo parcialmente conocido y cero o varios lugares asociados según la fuente. Puede pertenecer a varias agrupaciones. |
| Participante | Persona, equipo, pareja, club u organización, con tipo explícito. La pertenencia a un club o composición de una pareja requiere evidencia y ámbito temporal cuando se conozca. |
| Participación | Une participante y cita con su papel. Una inscripción en una temporada es otra relación, no una participación ficticia en todos sus partidos. |
| Lugar/territorio | Recinto y referencias territoriales verificadas. El lugar puede conservarse solo como literal observado cuando aún no tiene identidad resuelta. |
| Registro de origen | Vincula una entidad con su referencia externa, datos observados y documento original. Las relaciones extraídas también conservan procedencia. |

Una agrupación puede tener un intervalo global declarado sin convertirse en
otra cita duplicada. La futura vista de agenda podrá mostrar esa agrupación
y sus funciones por separado, conservando el tipo y el ID del objeto que se
guarda o sigue. No crearemos una función ficticia para cubrir cada día de un
festival o exposición.

## Encaje concreto de FEB

Ejemplo basado en las páginas observadas; no demuestra todas las relaciones
históricas ni la estabilidad de los identificadores entre temporadas.

```text
Competición: LF Endesa                       g=4
  Edición: 2026/2027                         g=4, t=2026
    Fase/grupo: Liga Regular Único           g=4, t=2026, f=89975
      Partido                               p=2522807
        participante local                  i=1008705
        visitante declarado                 HOZONO GLOBAL JAIRIS
        pista declarada                     Poliesportiu Son Moix
        municipio literal                   Palma de Mallorca
        fecha/hora literal                  24/10/2026 - 17:00
        zona horaria                        desconocida
```

- `g`, `t`, `f`, `p` e `i` son referencias FEB, no IDs comunes de Voceiro.
  Una edición se identifica en el contexto de su competición: `t=2026` no
  identifica por sí solo una temporada compartida por todas las ligas.
  Conservar el contexto de fase/grupo sin afirmar que `f` sea único global.
- El equipo observado no se equipara al club ni se fusiona con otros equipos
  del mismo nombre. Su continuidad entre ediciones queda por comprobar;
  tampoco se le fabrica una identidad distinta cada temporada por defecto.
  El vínculo de inscripción permite expresar en qué edición participa.
  La muestra recortada no acredita el ID del visitante de este partido:
  conservar su nombre no autoriza a asignarle el ID de otro equipo.
- Una jornada puede conservarse como número o etiqueta dentro de su fase;
  no exige una entidad propia sin otro dato que la justifique.
- El pabellón se conserva como lugar del partido. Su nombre no basta para
  crear una equivalencia con otro recinto o un código INE municipal.
- El marcador y los cuartos serían observaciones de resultado del partido;
  la tabla de la liga sería una instantánea de la fase. Ninguno crea citas.

El campeonato júnior observado prueba que puede haber grupos A–H y fases de
puestos. No necesitamos imponer una cadena fija «liga → temporada → jornada»
para todos los deportes. Solo se recorren relaciones declaradas, sin ciclos
de pertenencia; un partido puede relacionarse también con otras colecciones.

## Tenis ESPN: un contraste necesario del mismo núcleo

Las muestras ATP y WTA ya se habían comprobado antes del detalle FEB. En WTA,
el objeto superior `345-2026` representa la edición del Kinoshita Group Japan
Open; sus cuadros `2` (individual) y `4` (dobles) contienen encuentros. El
cuadro se identifica en contexto de circuito y edición: `4` es una modalidad
reutilizada, no un cuadro mundial único. La identidad de una competición
recurrente entre años requiere referencias acreditadas, sin recortar el ID
`345-2026` para fabricarla.

```text
Edición de torneo: Kinoshita Group Japan Open  s:850~l:900~e:345-2026
  Cuadro individual                          grouping.id=2
    Encuentro                                ...~c:186929
      Persona                                ...~a:11554
      Persona                                ...~a:13479
  Cuadro de dobles                            grouping.id=4
    Encuentro                                ...~c:185604
      Pareja                                 ...~t:2478-2056
        Integrantes observadas               GUID de dos personas
      Pareja                                 ...~t:3582-3138
        Integrantes observadas               GUID de dos personas
```

Los puntos suspensivos abrevian aquí el prefijo del UID; se conserva completo
en los datos. No se separan IDs de personas cortando el ID de pareja por `-`.
Las integrantes tienen GUID y enlaces explícitos; cualquier correspondencia
con IDs numéricos conserva esa evidencia. La composición se respalda en el
encuentro observado, sin afirmar vigencia indefinida.

Esto obliga a comprobar las siguientes relaciones antes de cerrar el modelo:

- Persona y pareja tienen identidad propia. El literal ESPN `type: team`
  no convierte automáticamente una pareja de dobles en un club deportivo.
  `homeAway` tampoco acredita localía en tenis: se conserva como valor de
  origen y el normalizado representa lados/orden cuando sea lo único probado.
- El seguimiento de una persona puede alcanzar sus individuales y dobles a
  través de la composición acreditada de cada pareja. No arrastra todos los
  partidos posteriores de sus antiguas compañeras.
- Ronda, cuadro y pista son datos distintos. La pista textual de un encuentro
  no se convierte en municipio ni se deduce de la nacionalidad del jugador.
- El resultado relaciona lados y parciales ordenados, con métricas y unidades
  —sets, juegos, desempates— y condición deportiva. Guardar únicamente dos
  totales no representa el resultado completo; marcador y clasificación del
  circuito son objetos distintos.
- Con `timeValid: false` y `TBD` no se promete una hora exacta. El intervalo
  del torneo no sirve de horario del partido ni acredita todas sus sesiones.

En la muestra ATP aparece además `format.regulation.periods: 5` en un encuentro
marcado final con dos sets ganados por el vencedor. Conservar ese dato sin
deducir de él el número de sets exigidos: hace falta verificar su semántica.
Los campos del proveedor pueden necesitar interpretación incluso dentro del
mismo deporte.

## Noticias ESPN: relaciones de origen ya comprobadas

La ampliación de la investigación comprobó artículos con referencias tipadas
a personas, equipos, liga y evento. Dos previas NBA contienen UID de partido
que coinciden exactamente con el calendario del 25/10; dos noticias WTA
referencian personas presentes en la muestra de encuentros. No se trata ya
solo de un escenario hipotético de relación con noticias.

El modelo debe conservar referencia externa de artículo, URL, publicación,
modificación y relaciones a entidades con tipo, procedencia y evidencia.
El ID de una entrada de `categories[]` no sustituye a `athleteId`, `teamId`,
`eventId` o UID: ese array mezcla etiquetas temáticas y enlaces a entidades.
Una etiqueta de liga no vincula el artículo con todos sus partidos.

Separar origen de la afirmación —declaración del proveedor o inferencia— de
revisión editorial —pendiente, confirmada o descartada—. Un enlace explícito
puede incorporarse como relación declarada por la fuente, sin presentarlo como
revisión humana ni necesitar una coincidencia de nombres. Un destino todavía
no importado se conserva como referencia externa pendiente de resolver.

La identidad del artículo admite ID del proveedor y alias de URL. No se
crean artículos duplicados porque cambie la URL, ni se fusionan proveedores
por compartir título. Relacionar estos metadatos no implica republicar el
texto completo ni incorporar todas las estadísticas de Core.

## Identidad y procedencia

Propongo generalizar **lógicamente** el destino de un registro de origen:
referencia externa → entidad tipada, en lugar de exigir siempre un evento.
La traducción física a tablas se decidirá al preparar la migración. Los
vínculos y IDs de eventos ya existentes se conservan literalmente.

Una página de partido puede aportar registros lógicos de partido y equipos,
respaldados por un mismo documento descargado. Cada extracción conserva su
referencia y ubicación en ese documento; esa ubicación no es su identidad.
Un nombre de pabellón sin ID puede seguir como dato del partido hasta resolverlo.

Separar referencia observada, entidad interna y correspondencia editorial:
la fuente puede cambiar un nombre sin cambiar la entidad, y una corrección
manual no debe desaparecer al volver a importar. Las equivalencias entre
fuentes guardan evidencia y se pueden revertir, preservando seguimientos.

## Tiempo, estado y clasificación

Inicio y fin tienen precisión y certeza independientes. Fecha, hora local,
zona e instante UTC son datos separados: una hora sin zona se puede conservar
y mostrar como tal, pero no entra en el índice de instantes UTC hasta resolver
la zona con evidencia. No se sustituye por medianoche ni por la zona del lector.
El fin exclusivo y los horarios textuales también conservan su significado.

Separar estado de programación —programado, aplazado o cancelado cuando se
acredite— de estado deportivo —sin empezar, en curso o terminado cuando se
acredite— y de frescura de la observación. Cada eje admite desconocido.
Un `0-0`, cuatro cuartos o una fecha pasada no confirman por sí solos esos
estados; una inferencia debe quedar identificada como tal.

Clasificar mantiene tres piezas: valor de origen, correspondencia revisada
y concepto común. Baloncesto, categoría de participación, edad, nivel y ámbito
territorial van en ejes distintos. Los datos ausentes quedan sin clasificar;
no se deducen automáticamente de nombres de torneos. La cobertura del proveedor
y el lugar del partido tampoco determinan el ámbito de la competición.

## Comprobaciones de diseño antes de migrar

| Situación | Comportamiento que deberá conservar el contrato |
| --- | --- |
| Cambia la fecha de un partido con el mismo ID de origen | Misma cita, revisión del horario; guardar y seguir conservan su objetivo. Si cambia el ID externo, hace falta evidencia de correspondencia. |
| El partido desaparece de una ventana de consulta | Conservar última observación; no declararlo cancelado ni actualizado. |
| Dos ligas usan `t=2026` | Ediciones distintas, cada una vinculada a su competición. |
| Misma obra con varias funciones identificadas | Una actividad y citas distintas. Una exposición continua no se expande a citas diarias. |
| Festival con filas repetidas por localización | No multiplicar celebraciones sin evidencia de ocurrencias distintas. |
| Sede neutral o equipo que juega fuera | Usar el recinto del partido; no la sede del club. |
| Equipo conocido solo por nombre, como en la muestra SportsEvents24 | Mostrar el literal y su papel; no prometer seguimiento estable del equipo ni fusionarlo automáticamente. |
| Una persona juega individuales y dobles | Alcanzar sus encuentros mediante participación directa o composición de pareja acreditada, conservando el objetivo personal. |
| Dos ediciones reutilizan `grouping.id=4` | Cuadros distintos en su contexto; conservar modalidad común sin fusionar cuadros. |
| Una noticia trae UID de partido o de persona | Relación declarada por la fuente al objeto concreto; no confundir con el tema general ni con confirmación editorial. |
| Hora FEB sin zona o final cultural sin duración fiable | Preservar lo conocido y lo desconocido por separado; no fabricar UTC ni duración. |
| Se sigue una competición y también uno de sus equipos | Una misma novedad se presenta una vez; sus distintos motivos de seguimiento pueden conservarse. |

Seguir la competición y seguir solo una edición usan objetivos distintos;
ambos caben en el modelo, sin fijar todavía el valor por defecto de la interfaz.
La herencia hacia partidos recorre relaciones tipadas y con procedencia.
Guardar sigue separado de seguir. Las preferencias de cambios del calendario
y noticias relacionadas permanecen independientes; no se activa ningún canal.

Los tipos de relación, alcances, contrato temporal, resultados, autoridad y
sincronización se concretan en las [decisiones del modelo](decisiones-modelo.md).
Las muestras anteriores sirven para comprobar esas decisiones; su implementación
se distingue expresamente de la especificación.

Después de revisar ese contrato conjunto podrá prepararse su versión y una
migración mínima que conserve identidades, originales e historial.
La suite completa corresponde a CI cuando haya código. Elegir recolector,
cadencia y publicación es una decisión posterior a este diseño.
