# FEB: rutas, sedes y selección de datos

Ampliación del 25/10/2026 del [primer contraste](06-feb.md) y del
[alcance implementado](../feb-alcance.md). Investigación puntual: no modifica
el adaptador, no activa recogidas ni escribe en Turso/R2. La investigación
anterior era parcial; no se había inventariado toda la navegación de la web.
Este informe tampoco acredita todos sus endpoints, temporadas y variantes.

## Rutas contrastadas y pendientes

| Familia | Contraste | Utilidad y decisión propuesta |
| --- | --- | --- |
| `/calendario/{g}/{t}` y `/resultados/{g}/{t}` | Tres ligas; calendario de temporada, jornada actual/próxima y clasificación. | Mantener como base actual. Completar horarios conocidos sin perderlos al aparecer un marcador. No confundir esta cobertura con todas las fases. |
| `/partido/{p}` y `/stats/partido/{p}` | Dos fichas LF Endesa anteriores y una nueva ficha mini mediante la ruta que enlaza el calendario general. | La ficha aporta pabellón y municipio del encuentro. Interesa extraer solo programación y ubicación cuando haga falta; acta, estadísticas, parciales y gráfico de tiro quedan enlazados. No se acredita equivalencia universal de rutas solo por estas muestras. |
| `Equipo.aspx?i={i}` y `/stats/equipo/{i}` | Mallorca y un equipo mini de Valladolid. | Aportan domicilio del club y dirección del campo habitual. Son relaciones distintas de la celebración de cada partido. Podría interesar recogerlas una vez por inscripción revisada; plantilla y datos personales quedan fuera. |
| `/calendariofeb.aspx` | HTML y JavaScript propios examinados. | Es una tabla con filtros locales, no un catálogo de pabellones con IDs. Hay una llamada JSON aprovechable, con límites importantes descritos abajo. |
| `POST /CalendarioFEB.aspx/ObtenerPartidos`, cuerpo `{}` | Llamada exacta del JavaScript; respuesta JSON obtenida. | Fuente agregada de encuentros con campo de juego, pero la muestra no cubre las tres ligas actuales. No sustituir el recolector por esta ruta. |
| `/estadisticas.aspx?g=4&t=2026` → `/estadisticas/4/2026` | Primera página: tabla de 16 equipos y selector de fase. | Estadísticas acumuladas de equipo; enlace oficial. No confundir con clasificación de liga. |
| `/rankings.aspx?g=4&t=2026` → `/rankings/4/2026` | Primera página del ranking de puntos, con paginación y selectores de métrica, jornada, equipo y nacionalidad. | Ranking de personas, no clasificación de equipos. Enlazar, sin recorrer paginación ni incorporar deportistas por ahora. |
| `scripts/widget.launcher.js?v=20251022` | Código de las llamadas del widget examinado. | Descubre servicios LiveStats; no demuestra una API pública contratada ni sustituye las páginas HTML. |
| `intrafeb.feb.es/LiveStats.API/api/v1/BoxScore/2522807` | GET sin credenciales: HTTP 401. | El widget envía un Bearer obtenido de su página. No se han copiado ni utilizado tokens para probar estos servicios. No adoptar esa dependencia para Voceiro sin contrato y límites conocidos. |
| `LiveStats.API/api/v1/KeyFacts/{p}`, `Ranking/{p}`, `TeamStats/{p}`, `ShotChart/{p}`, `overview` | Rutas presentes en el JavaScript; respuestas no consultadas. | Candidatas para una futura integración acordada con FEB, no endpoints verificados como utilizables. Se excluye el host de pruebas. |
| `Jugador.aspx?i=…&c=…`, `Series.aspx?f=…`, postbacks de historial de equipo, paginación de rankings | Enlaces observados; esas funciones no recorridas en esta ampliación. | No declarar cobertura ni continuidad de identidad personal. Prioridad baja para una agenda territorial. |

Las variantes `.aspx` y sus redirecciones ya observadas se conservan como
referencias de la fuente. Un ID numérico que aparece en dos rutas no basta
para tratar campos de nombres distintos como un mismo espacio de identidad.

## Lo que devuelve realmente el calendario general

El script de la propia página hace una petición POST de lectura, sin parámetros,
obtiene `response.d` y aplica `JSON.parse`. La respuesta observada pesa 64.222
bytes y contiene **132 partidos sin IDs duplicados**, 66 mini femeninos y
66 mini masculinos. Los ocho nombres de campo están presentes en todas las
filas. No aparecen los partidos LF Endesa `2522807` ni `2522809`.

Campos observados:

```text
IdPartido, IdCategoria, NombreCategoria,
IdInscripcionLocal, EquipoLocal, IdInscripcionVisitante, EquipoVisitante,
Fecha, Hora, Campo, NombreFase, NombreGrupo, NumeroJornada,
Resultado, YoutubeId
```

Limitaciones contrastadas:

- `Campo` es texto. No hay ID de pabellón, dirección, municipio, provincia,
  coordenadas ni INE en las filas. El filtro de pabellón se construye con los
  textos distintos de ese campo; no consulta un catálogo territorial separado.
- `IdCategoria` vale `22392` o `22398`; no es el `g=72/71` del menú.
  `NombreFase` y `NombreGrupo` son literales, sin IDs de fase/grupo. No unir
  automáticamente esos espacios por nombre.
- Los enlaces a equipos usan `IdInscripcionLocal` y `IdInscripcionVisitante`.
  Esto acredita referencias de inscripción, no una identidad permanente del
  club o continuidad del equipo entre temporadas. El adaptador actual conserva
  esos valores como referencias `feb/equipo`; antes de ofrecer seguimiento
  entre temporadas hay que contrastar la continuidad y la relación con club.
  No cambiar ni fusionar las identidades ya guardadas durante esta investigación.
- La respuesta observada abarca del 21 al 27 de junio de 2026 según los
  valores de `Fecha` y el renderizado esperado en España peninsular. No hay
  parámetros de ventana/paginación en la llamada publicada por ese script;
  no se ha demostrado por qué se seleccionan esos encuentros ni cómo ampliar
  la cobertura desde este servicio. No inventar parámetros para presentarlo
  como calendario general exhaustivo.
- `Fecha` y `Hora` son números de milisegundos que el frontend convierte
  por separado con `new Date(...)`. Para el primer partido, `Fecha` decodifica
  como `2026-06-20T22:00:00Z`, mientras `Hora` decodifica como
  `2026-10-25T09:00:00Z`. Las 132 horas llevan fecha 25 de octubre: **`Hora`
  no es el instante del encuentro**. La ficha declara `21/06/2026 - 10:00`.
  Queda por acreditar la zona y cómo evitar conversiones dependientes del
  navegador; no convertir esos valores directamente a un inicio UTC.
- `YoutubeId` permite ofrecer un enlace al vídeo oficial asociado cuando
  exista. No se han validado los vídeos; no descargar ni incrustar por defecto.

El JavaScript crea enlaces a Google Maps con `query=Campo`. Eso es una
búsqueda por nombre, no una geolocalización acreditada ni evidencia para INE.

## Sede del club, pabellón habitual y sede del partido

Contraste que faltaba: el partido
[2513928](https://baloncestoenvivo.feb.es/stats/partido/2513928) enfrenta a
IVECO CBC VALLADOLID PONCE A y BBC - JOVENTUT A. Su ficha declara **Pabellón
Blas Infante, Alhaurín de la Torre (Málaga)**. La ficha del equipo
[989330](https://baloncestoenvivo.feb.es/stats/equipo/989330) declara como
campo habitual **Polideportivo Ponce de León, Valladolid (Valladolid)**.
El dato demuestra una sede distinta del campo habitual del local; no hace
falta deducir del nombre del campeonato que el recinto sea «neutral».

Por tanto, conviene mantener estos caminos separados:

| Hecho declarado | Relación territorial que puede acreditarse |
| --- | --- |
| Domicilio de club | Club → municipio de su domicilio. No localiza al partido. |
| Pabellón habitual de la inscripción | Equipo/inscripción → campo habitual → municipio. No equivale a sede permanente ni a todos sus partidos. |
| Pista del partido | Partido → lugar de celebración → municipio. Es el camino para filtrar agenda por ubicación. |

El núcleo ya admite `participante/equipo`, `participante/club`, `lugar`,
`pertenece_al_club`, `se_celebra_en` y `ubicado_en`. La relación específica de
campo habitual y la localización del domicilio de un club **no están
implementadas por el adaptador FEB**; tampoco se propone añadirlas solo para
rellenar el modelo. Hay que acordar cómo representar su papel y vigencia.

Los nombres y direcciones observados permiten preparar una correspondencia
revisada hacia INE, no acreditan por sí mismos un código. Hasta tener prueba
suficiente, guardar literal, contexto y fuente con resolución pendiente. No
crear un ID FEB de recinto a partir de un nombre ni fusionar pistas del mismo
complejo: la tabla distingue Elola «Pista 1» y «Pista 2».

## Qué ampliar y qué simplificar

Propuesta para el siguiente incremento, pendiente de diseño con el usuario:

1. **Prioridad: agenda localizable.** Conservar partido, IDs de participantes,
   jerarquía, programación, fuente y enlace; añadir pista y localidad declaradas
   para el encuentro, con prueba y resolución territorial explícita. Usar las
   fichas solo para encuentros seleccionados cuando la vista agregada no los
   aporte; definir ventana y presupuesto antes de programar esa ampliación.
2. **Conservar horarios anteriores acreditados.** Al pasar a marcador, el
   calendario deja de mostrar la fecha. Evitar perder la programación conocida
   y distinguirla de una confirmación reciente; no inventar fecha de jornada.
3. **No ampliar estadísticas.** Actas, parciales, gráfico de tiro, ranking de
   personas, plantillas, trayectoria y estadísticas acumuladas quedan como
   consultas oficiales enlazadas. No hacen falta para localizar y anunciar un
   encuentro. Los vídeos pueden quedar como enlaces si se recogen sus referencias.
4. **Mantener por ahora marcador y clasificación ya disponibles.** No generan
   peticiones adicionales con la recogida actual, pero sí historial y volumen.
   No añadir sondeos por resultado ni prometer directo. Si el producto solo usa
   agenda, es razonable dejar de importar nuevas tablas y enlazar resultados;
   esa decisión requiere comprobar su uso y separar su parser: hoy la ausencia
   de clasificación hace fallar la lectura completa. No se ha cambiado ni borrado
   nada en esta investigación.
5. **Equipo/club después, si hay una consulta que lo necesite.** Para «equipos
   de mi municipio» interesaría su domicilio o campo habitual, con papel claro.
   Para «partidos en mi municipio» basta la sede declarada del encuentro. No
   cosechar todas las fichas de equipo para suplir sedes de partido ausentes.

## Coste y evidencia

La recogida vigente sigue en dos páginas por liga y pasada. Esta ampliación
realizó nueve peticiones lógicas de investigación antes de probar formularios:
calendario general, su JSON, una ficha mini, dos fichas de equipo, rankings,
estadísticas, script del widget y un GET sin token a BoxScore; las rutas `.aspx`
pueden añadir redirecciones. No se recorrieron todas las fichas ni se hizo
sondeo periódico. Siguen sin acreditarse cuota, contrato de API y condiciones
de automatización/republicación para el uso previsto.

Las respuestas completas se conservaron temporalmente en `/tmp/feb-*`.
El archivo [07-feb-evidencia.json](07-feb-evidencia.json) conserva huellas y
extractos relevantes sin plantillas, estadísticas personales, scripts completos
ni campos de sesión. La investigación es documental; no precisa pruebas de
código. Se verifican coherencia de cifras, muestras y formato JSON, y
`git diff --check`. La navegación por fase se contrasta por separado abajo.

## Selección de fase: limitación aclarada

Se hicieron cuatro peticiones lógicas adicionales: GET de calendario y
resultados júnior `21/2025`, seguido cada uno por el POST de su formulario
ASP.NET con las opciones seleccionadas, sus campos de validación y
`__EVENTTARGET` apuntando al selector `gruposDropDownList`. Se mantuvo una
sesión de cookies independiente para cada pareja GET/POST; los campos de
sesión no forman parte de la evidencia recortada ni de la documentación.

Al elegir `89481`, **ambas respuestas seleccionan «PRIMERA FASE A»**. El
calendario devuelve tres jornadas con dos partidos cada una; resultados
incluye una tabla de jornada, clasificación del grupo de cuatro equipos y
otra clasificación final de 32 equipos. Esto resuelve el problema de
navegación observado con el parámetro GET `f`, que era ignorado.

No significa que el adaptador soporte ya el campeonato: todavía rechaza
`g=21`, no envía esos formularios ni interpreta las eliminatorias o todas las
tablas presentes. Ampliarlo exige comprobar otras fases, selecciones y cortes
sin mezclar grupo con clasificación final. Ahora hay un mecanismo contrastado
para continuar; no es necesario deducir IDs de fase desde sus nombres.
