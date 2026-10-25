# FEB: cobertura, recogida y consulta

Contraste puntual del 25/10/2026. Decisión acordada: guardar el calendario y
sus relaciones; para el detalle que no guardamos, ofrecer el enlace oficial.
La consulta del detalle dentro de Voceiro y su caché quedan para otro diseño.

## Qué hemos contrastado

Dos páginas completas por liga, calendario y resultados, temporada 2026/2027:

| Competición FEB | ID | Partidos | Con fecha/hora individual | Marcadores observados | Equipos en tabla |
| --- | --- | --- | --- | --- | --- |
| LF Endesa | 4 | 240 | 208 | 39 | 16 |
| Primera FEB | 1 | 306 | 270 | 42 | 18 |
| LF Challenge | 67 | 240 | 216 | 31 | 16 |

Fuentes: calendarios y resultados oficiales de
[LF Endesa](https://baloncestoenvivo.feb.es/calendario/4/2026),
[Primera FEB](https://baloncestoenvivo.feb.es/calendario/1/2026) y
[LF Challenge](https://baloncestoenvivo.feb.es/calendario/67/2026), con la ruta
`/resultados/{g}/2026` correspondiente. Son observaciones de una pasada;
los números cambiarán. No acreditan todas las fases ni otras temporadas.

El menú anuncia 24 competiciones, incluidas ligas, copas y campeonatos de
clubes y selecciones autonómicas. El selector de LF Endesa anuncia 30 temporadas,
de 1997/1998 a 2026/2027: no se han recorrido los archivos históricos.
El inventario guarda las referencias anunciadas, temporadas y fases;
su presencia no implica que el lector las soporte.

## Qué guardamos y qué enlazamos

| Datos | Tratamiento actual | Motivo |
| --- | --- | --- |
| Competición, edición, fase, partido y equipos | Guardar IDs FEB y relaciones comunes | Buscar, filtrar y seguir las mismas entidades aunque cambien nombres u horarios. |
| Fecha y hora del partido | Guardar lo declarado, con zona desconocida | La agenda necesita disponer del horario sin consultar FEB por cada visita. |
| Marcadores agregados y tabla de la liga | Conservar lo que ya entregan las dos páginas | No requiere peticiones adicionales; son datos observados, no un servicio en directo. |
| Acta, parciales detallados, estadísticas y gráfico de tiro | Enlace a la ficha oficial del partido | Se consulta el detalle cuando la persona lo necesita, sin recorrer todos los partidos. |
| Plantilla, entrenador, trayectoria e información del club | Consulta oficial; sin recorrer ni normalizar esas fichas | Equipo, club y persona necesitan identidades y relaciones distintas. |
| Pabellón y municipio de celebración | Pendientes de recogida y correspondencia acreditada | Las páginas agregadas no los aportan; la sede del club no demuestra la del partido. |

Cada evento exporta `enlaces` con `/partido/{p}`. La lectura existente del
frontend los muestra en los detalles. Abrir ese enlace no descarga la ficha
en nuestros servicios ni depende de que FEB permita CORS o incrustación.
No significa que Voceiro consulte resultados nuevos mientras se navega.

Los equipos ya se representan como `participante/equipo`, con referencia FEB y
participaciones local/visitante en cada encuentro. El club es una identidad
distinta: `pertenece_al_club` está disponible en el núcleo, pero el adaptador
no crea ese vínculo sin evidencia. Las sedes caben como entidades `lugar`,
enlazadas al partido mediante `se_celebra_en` y al territorio mediante
`ubicado_en`. Este recorrido está soportado por el modelo común; la recogida
FEB todavía no crea esas entidades ni relaciones. Ampliarlo exige decidir qué
fichas consultar y conservar pruebas de la sede concreta, sin deducirla del equipo.

La [ficha 2522807](https://baloncestoenvivo.feb.es/partido/2522807) declara
fecha, árbitros, pista y localidad, cuatro parciales y estadísticas por jugador.
La ficha 2522809 declara pista y localidad, pero muestra 0-0 sin parciales:
no es evidencia suficiente para crear un resultado. La ficha de equipo
1008705 contiene plantilla, información del club y campo habitual; no demuestra
por sí sola el lugar de todos sus encuentros ni la continuidad de IDs personales.

## Límites que importan para ampliar

- **Fases:** en júnior masculino (`g=21,t=2025`) el calendario selecciona
  `f=89493` (3.º–4.º) y resultados `f=89492` (final). Las peticiones probadas
  con `&f=89481` mantienen esas selecciones distintas. No se mezclan ni se
  presenta ese campeonato como soportado. La [ampliación de investigación](investigacion/07-feb-rutas-sedes.md)
  consiguió seleccionar `89481` en ambas páginas mediante el formulario ASP.NET.
  El recolector aún no implementa esa navegación ni las variantes de
  eliminatorias y clasificación final; deben resolverse antes de incorporarlo.
- **Fechas antiguas:** el calendario general sustituye el horario por el
  marcador en partidos jugados; la página de resultados solo recupera horarios
  de las jornadas que muestra. Un marcador sin horario no autoriza a usar la
  fecha global de jornada. El historial retenido puede contener horarios anteriores,
  pero el adaptador todavía no los recupera para completar una observación nueva.
- **Tiempo y estado:** no se ha acreditado zona horaria ni señal explícita
  de final/aplazamiento en las muestras. Se mantiene desconocido cuando falta evidencia.
- **Territorio:** los nombres literales de pista y localidad requieren revisión;
  no se asigna INE desde el nombre del equipo o club.

## Coste y frescura

La recogida sigue siendo manual: **dos peticiones por competición y pasada**,
sin recorrer fichas ni añadir sondeos por visitante. Consultar las tres ligas
en pasadas separadas supone seis peticiones, más las redirecciones que pueda
declarar la fuente. No se ha medido ni acreditado una cuota contractual de FEB.
El cliente actual limita cada respuesta a 4 MB y espera hasta 25 segundos;
son límites nuestros, no límites publicados por el proveedor.

Se han usado páginas HTML públicas. Esto no acredita una API pública documentada
ni el presupuesto de otros servicios que use internamente la web. Un futuro
detalle dentro de Voceiro necesitará rutas permitidas, caché compartida,
frescura visible, límites por proveedor y tratamiento de errores. Esa consulta
no debe convertirse en una descarga de todos los partidos por cada lector.
Las condiciones de automatización periódica y republicación siguen pendientes
según la [investigación original](investigacion/06-feb.md).

## Verificación

Se contrastaron completas las seis páginas de liga y, de forma puntual,
calendario/resultados júnior, sus variantes con `f`, dos fichas de partido y
una ficha de equipo. Las muestras de prueba guardan solo fragmentos seleccionados,
con IDs y selectores originales; no contienen scripts ni campos de sesión.
Las descargas completas de esta revisión quedan en `/tmp`, no en producción.
La importación conjunta en memoria de las tres ligas produjo 786 eventos
clasificados, 112 marcadores observados, tres tablas y un enlace oficial por
partido. Las 786 ubicaciones siguen pendientes. Pasaron las pruebas específicas
de núcleo, publicación, revisión territorial y selección FEB por CLI; la suite
completa corresponde a CI. No se ha ejecutado el workflow ni escrito en Turso/R2.
