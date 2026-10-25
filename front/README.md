# Interfaz

## Calendario y contenido del feed

`app/14-calendario.js` carga bajo demanda `calendario.json` desde los mismos
backends de datos. Agenda, semana y mes comparten selección y fechas en
`shared/calendario/`. Se filtra por tema, circuitos combinables, objetivo
identificado, municipio/recinto publicado y fuente. La zona del lector convierte
solo instantes acreditados: una fecha sin hora o una hora sin zona mantienen
su significado. Las citas sin fecha confirmada quedan en una sección aparte.

La agenda conserva dos semanas y muestra 20 citas por tanda con «Ver más»;
cada evento aparece una sola vez. Las programaciones prolongadas se agrupan
al final. Las filas abren el detalle en un diálogo. Categorías y búsqueda
propia permanecen visibles; los filtros adicionales se despliegan aparte.
Semana muestra hasta tres citas por día, mes hasta dos; pulsar un día o
«más» abre solo ese día. Pulsar Agenda recupera las dos semanas. Sin fecha
confirmada también se muestra en tandas de 20. Cambiar filtros o período
reinicia la tanda. Las vistas y filtros conservan la selección entre sí.

Las órdenes `tenis:`, `atp: wta:`, `resultados:tenis` y `f1:clasificación`
reúnen contenido o limitan su tipo. Las noticias siguen el buscador habitual
y una selección por texto del titular, sin fabricar enlaces con entidades
deportivas; los filtros de medios solo afectan a esas noticias. Los filtros
propios del calendario se muestran en su panel. Las vistas completas ocupan
el espacio central y conservan el feed al cerrarse. Las tablas deportivas
conservan ámbito y comprobación, y no se representan como citas.

La lectura conserva el último resultado bueno si falla la actualización.
Las respuestas de fuentes excluidas de publicación no viajan al navegador.
La publicación es una operación manual del workflow Calendario.

`plantilla.html` contiene el HTML y el arranque temprano del tema.
`python3 scripts/generar_front.py` genera los archivos que se sirven en Pages:

- `app/*.js`, por orden de nombre, se ensamblan en `public/app.js`.
- `estilos/*.css` y `shared/tema/paleta.css` se ensamblan en `public/estilos.css`.
- `idiomas/*.js` se publican como módulos independientes en `public/idiomas/`.
- Los módulos de `shared/` se copian a `public/`.

Las piezas de `app/` comparten ámbito y conservan el orden de inicialización;
son secciones de una aplicación, como las de `lector/src/`. Un cambio de este
modelo requiere hacer explícitas sus dependencias. Los imports de esas piezas
se resuelven desde el `app.js` publicado, no desde el directorio de las fuentes.

El estado de resultados, la paginación y la prensa están separados. Los chips
y el pase también tienen archivos propios. `99-inicio.js` inicia la aplicación.

No editar las salidas de `public/` a mano. La generación añade una versión
común a las referencias JS y CSS, incluidas las traducciones y los imports
dinámicos, para evitar mezclar versiones cacheadas.

CI genera el frontend antes de probarlo. En la cosecha se conserva el frontend
anterior si el candidato no se construye o no supera las comprobaciones.

## Panel de estadísticas

`app/14-estadisticas.js` carga los JSON públicos de estadísticas solo al abrir
el panel. El ámbito es uno solo: todos los medios, un modo (grupos y
excepciones, sin sus palabras) o un grupo o familia; sin elegirlo, sigue al
modo activo. Resumen da titulares y medios con titulares del día, los 30 días
(cada barra abre su día), el reparto por horas y los grupos ordenados por
volumen y plegados por familia («Regional · Galicia» bajo «Regional»). Medios
va de más a menos titulares, con una miniatura de 30 días que delata un medio
callado. La ficha reúne lo que hay del medio: cifras del día, 30 días, horas,
secciones e histórico de nuevo a antiguo. Se abre desde cabecera, el menú ⋯
de un titular o las órdenes `estadisticas:` / `stats:` confirmadas con Intro o
una sugerencia; `estadisticas:mis-medios` abre los medios del modo activo.

Abierto, el panel ocupa el sitio del feed; escribir otra búsqueda lo cierra.
El día inicial es el último calculado. Si se elige uno que aún no lo está, se
mantiene la fecha y se ofrece abrir el último disponible. No confundir titulares del archivo
con artículos únicos por publicación. Lo que no trae datos no se pinta: un
hueco no es un cero. El trabajo completo se verifica en CI.

Pendiente para la siguiente fase: agregados de Asuntos, identidad de artículo,
evidencia y comparación. Un idioma único asignado al medio no basta: algunos
publican en varios y el catálogo está incompleto. Hay que validar el análisis
por titular, cuantificar los no analizables y comprobar una muestra compatible
antes de habilitar comparaciones; no convertir idioma desconocido en ausencia
de menciones. El resumen técnico no necesita esa clasificación.

Ideas de UI recogidas al probar la maqueta: jerarquía de contexto y cifras,
controles agrupados, espacio entre bloques y acciones secundarias en ⋯.
El feed usa una franja superior de una línea con la marca, actualización,
contador, tiempo y estadísticas. El nombre de la vista recarga y su flecha
abre los modos; Guardadas está a la izquierda del buscador. Por debajo de
900 px de columna, el menú ⋯ reúne información, estadísticas y controles
secundarios, conservando sus estados. El total del archivo está en Estadísticas.
