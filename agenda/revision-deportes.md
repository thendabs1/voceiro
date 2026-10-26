# Encaje de los deportes en el modelo común

El [diseño del 26/10](calendario-deportivo.md) fija el alcance actual: citas,
tenis solo por torneos y sin recogida de resultados. La revisión siguiente
describe capacidades y contrastes previos del núcleo, no el alcance a activar.

Revisión local del 25/10/2026 sobre código y muestras conservadas. F1, tenis
y baloncesto comparten el núcleo de agenda; necesitan relaciones y métricas
propias dentro de ese núcleo. El desarrollo actual es desigual. Esta revisión
documenta el estado y propone el siguiente incremento, sin cambiar importadores,
activar recogidas ni consultar de nuevo a proveedores.

## Qué es común y qué se especializa

| Dimensión | Contrato común | Particularidad deportiva |
| --- | --- | --- |
| Tema | Concepto del catálogo con correspondencia y evidencia. | Tenis, Baloncesto y Automovilismo son temas; ATP, WTA y F1 identifican objetivos concretos, no municipios ni nuevos temas obligatorios. |
| Identidad | Referencia externa con proveedor, tipo, contexto e ID literal. | Un UID de partido, un código FEB y un UID ICS conservan sus espacios; coincidir en nombre o fecha no acredita equivalencia. |
| Organización | Agrupaciones, ediciones y pertenencias acreditadas. | Liga → temporada → fase; circuito de tenis → edición de torneo → cuadro; campeonato F1 → temporada → gran premio. |
| Cita | Evento con programación, ejecución y extremos temporales separados. | Partido, sesión de entrenamientos, clasificación o carrera. Un torneo prolongado no sustituye a sus encuentros. |
| Participación y resultado | Participaciones, líneas, parciales y observaciones independientes. | Equipos y cuartos; personas/parejas y sets; varios pilotos y métricas de carrera. Cada métrica necesita semántica propia. |
| Territorio | Lugar identificado y relaciones de celebración/ubicación con pruebas. | Pista, pabellón o circuito físico; distintos de sede del equipo, nacionalidad del participante y ámbito de la competición. |

La ingesta conserva el original, el clasificador asigna temas y el relacionador
acredita identidades y vínculos territoriales. Ninguno sustituye a los otros.
El núcleo valida además relaciones, participaciones, tiempos y métricas. Que
un registro tenga tema no significa que toda su estructura esté resuelta.

## Estado comprobado

| Caso | Implementado | Falta cerrar |
| --- | --- | --- |
| F1 / Vidmar | UID ICS estable, fechas/horas y cancelaciones declaradas; colección del proveedor y tema Automovilismo. La transición conserva los eventos con clase `desconocida`. | Campeonato, temporada y gran premio identificados; tipo de sesión acreditado, circuito físico, pilotos y equipos. No hay importador de resultados ni tablas F1. |
| Tenis / ESPN | Circuitos ATP/WTA; edición de torneo → cuadro → encuentro; personas, parejas con composición limitada al encuentro y plazas pendientes. Sets y desempates del subconjunto final contrastado. | Torneo recurrente acreditado, normalización de sedes y estados/formatos adicionales. ATP es admitido por el lector; la muestra deportiva retenida es WTA. |
| Baloncesto / FEB | Competición → edición/temporada → fase → encuentro; equipos con ID cuando consta, papeles local/visitante, puntos/cuartos y tabla con ámbito propio. Hay lector HTML manual acotado a LF Endesa. | Cobertura fuera del subconjunto, sedes identificadas, equipos sin referencia y certeza del resultado cuando la fuente no la declara. No acredita toda FEB. |
| Otros deportes | Conceptos temáticos y contrastes de fuentes documentados. | No hay adaptadores propios NBA/WNBA, fútbol, NFL, hockey, béisbol, ajedrez o atletismo en `agenda/`. Una muestra investigada o un concepto del catálogo no equivalen a integración. |

Tenis y FEB asignan temas mediante `Constructor.tema`, con evidencia y un ID de
regla en sus importadores. F1 usa una correspondencia de la colección Vidmar en
el catálogo temático compartido. Unificar las reglas para poder reclasificar
lo guardado también debe incluir los importadores deportivos.

Los lugares deportivos se conservan como bloques/literales. Estos importadores
todavía no crean el enlace territorial acreditado que sí tiene el ejemplo de
Galicia. No hay que convertir el país de la competición o el nombre del pabellón
en municipio para completar esa ausencia.

## F1 como siguiente contraste del relacionador

Propuesta de estructura, **todavía no importada**:

```text
Campeonato F1 ← es_edicion_de — Temporada
Temporada    ← es_parte_de   — Gran premio de esa edición
Gran premio  ← pertenece_a   — Sesión concreta
Sesión       — se_celebra_en → Circuito físico — ubicado_en → Territorio
```

Campeonato, temporada y gran premio son agrupaciones; las sesiones son eventos
y el circuito físico es un lugar. El término «circuito» del tenis identifica
una organización deportiva, no el recinto de una carrera. El gran premio
necesita acordar su clase: el validador no tiene hoy una clase `gran_premio` o
`ronda`. Se revisará si corresponde a `fase` o si requiere ampliar el vocabulario
antes de implementarlo. No se reconstruirán sus identidades desde títulos,
números de ronda o fechas sin una regla acreditada y estable ante cambios.

El núcleo permite participaciones de varios competidores y registra
`carrera.posicion` y `carrera.tiempo`. Eso aporta una base estructural, pero no
implementa resultados F1 completos. Puntos, diferencias, vueltas, penalizaciones,
retiradas y tablas de pilotos/constructores requieren correspondencias y
métricas contrastadas. Tampoco se reutilizará `pertenece_al_club` como relación
piloto–escudería sin acordar su semántica y ámbito temporal.

Una sesión de clasificación es un **evento**; su resultado es otra observación;
la tabla del campeonato es una **clasificación deportiva** con ámbito y corte.
La orden actual `f1:clasificación` consulta tablas, no sesiones de clasificación,
y Vidmar no aporta esas tablas. La interfaz deberá distinguir ambos sentidos
cuando se incorporen las sesiones tipadas.

## Contraste de Vidmar con descarga real (25/10/2026)

Esta comprobación posterior sí consulta la fuente. El flujo completo
<https://f1.vidmar.net/calendar.ics> descargado durante la revisión contiene
33.627 bytes, SHA-256
`30604fba32102422aae7e997b3a5c0e66cf89eb316ebe16b7d58eeb290f75c07`.
El cuerpo se descargó a un archivo temporal, no se incorpora como fixture ni
se guarda en producción. El hash identifica esa descarga; no permite
reconstruirla cuando cambie el flujo.

El lector existente acepta sus 128 eventos y conserva sus UID sin duplicados:

| Contenido observado | Cantidad |
| --- | ---: |
| Carreras | 23 |
| Clasificaciones ordinarias | 23 |
| Primeros entrenamientos | 23 |
| Segundos y terceros entrenamientos | 17 + 17 |
| Sprints y clasificaciones sprint | 6 + 6 |
| Pruebas de pretemporada y presentaciones | 3 + 10 |

Todos corresponden a 2026. Hay 115 citas con hora UTC y 13 con fecha sin
hora; 128 campos LOCATION, incluidos dos `TBD` y uno `Online`. Estos últimos
no son recintos que deban geocodificarse. Ningún evento declara STATUS o
LAST-MODIFIED: nuestro lector conserva el estado desconocido. DTSTAMP es
`20260929T142203Z` en esta descarga; no acredita por sí solo la revisión de
cada horario. SEQUENCE está presente, pero una descarga no prueba que los UID
o los contadores se mantengan correctamente entre revisiones.

Las categorías estructuradas son `Testing` y `Car Launch`; el tipo de sesión
deportiva aparece en SUMMARY y en UID. No se entrega un identificador separado
de gran premio, temporada, circuito, piloto o escudería, ni coordenadas,
códigos territoriales, resultados o tablas. Un patrón legible en el UID no
acredita por sí solo un contrato de relaciones estable del proveedor.

Se contrastaron el número y las fechas de las 23 carreras con el
[calendario oficial vigente de F1](https://www.formula1.com/en/racing/2026),
y las seis sedes sprint con la
[guía oficial](https://www.formula1.com/en/latest/article/the-beginners-guide-to-the-f1-sprint.55yJBEiF7vYkZEwSV9lZJ9.55yJBEiF7vYkZEwSV9lZJ9).
Las fechas UTC se comparan teniendo en cuenta el día local: Las Vegas figura
el 22 de noviembre UTC y el 21 en el calendario local. No se ha validado cada
hora o duración de las 115 sesiones. El caso que inicialmente requería
comprobación, UID `2026-Bahrain-GP-Race`, LOCATION `Sepang`, inicio
`2026-10-04T07:00:00+00:00`, coincide con la
[ficha oficial actual](https://www.formula1.com/en/racing/2026/bahrain).
Demuestra por qué el país del nombre del gran premio no debe determinar su
ubicación. El anuncio inicial de 24 carreras no sustituye al calendario actual.

**Decisión propuesta:** conservar Vidmar como fuente de agenda, sin ampliarlo
ahora a relaciones deportivas deducidas del texto. Sirve para citas y avisos;
una base F1 con jerarquías, recintos y resultados necesita evidencia adicional.
Continuar el siguiente incremento con la muestra FEB ya retenida, que ofrece
identificadores y relaciones más explícitos. Su revisión debe empezar por
contrastar esos campos con las páginas actuales: las muestras no acreditan
toda FEB ni la estabilidad de sus selectores.

## Territorio internacional y revisión común

El ISO del país puede enlazar el recinto o un ámbito declarado, pero esos
papeles deben distinguirse. Celebrarse en un país no convierte una competición
en nacional ni acredita la nacionalidad de sus participantes. El catálogo de
países actual es una selección revisada para medios y España, no un inventario
mundial completo. Un país ausente exige ampliar ese catálogo con evidencia;
los municipios internacionales necesitan además sus propios sistemas.

El informe `agenda.revision` sirve para temas y ubicación, pero aún no audita
la cobertura de jerarquías deportivas, la identificación de participantes ni
la disponibilidad de resultados/tablas. Tampoco distingue un evento online
sin sede física de una ubicación pendiente: será necesario antes de incorporar
ese tipo de agenda. No se exigirá un municipio ficticio para un torneo online.

## Continuación propuesta y verificación

Continuar en la infraestructura actual: unificar las correspondencias temáticas
de cultura y deportes; después contrastar una muestra F1 con gran premio,
sesiones y recinto identificados. En paralelo al diseño, revisar las sedes ya
guardadas de tenis/FEB y hacer visibles sus pendientes. El calendario y el
territorio no exigen implementar a la vez resultados deportivos completos.

Se ejecutaron 31 pruebas Python existentes de contrato deportivo, tiempo,
transición F1, lectura y clasificación, además del archivo de pruebas JavaScript
de consultas de calendario. Pasaron sin red. La suite completa corresponde a CI.

Una composición local de tres encuentros WTA retenidos, dos partidos de la
extracción FEB y dos eventos ICS **sintéticos de pruebas** produce siete eventos
con tema y siete ubicaciones pendientes; tres resultados y una tabla parcial.
No representa el estado remoto, cobertura de proveedores ni resultados F1.
No se han añadido tests ni cambiado el comportamiento por esta revisión.

Código contrastado: [núcleo](nucleo.py), [transición](transicion.py),
[Vidmar](vidmar_f1.py), [tenis](espn_tenis.py), [FEB](feb.py),
[lector FEB](feb_html.py), [clasificador](clasificacion.py),
[revisión común](revision.py) y [publicación](publicacion.py).
