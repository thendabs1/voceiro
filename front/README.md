# Interfaz

## Construcción

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

## Calendario

El calendario está desactivado mediante `CALENDARIO_ACTIVO = false`: botón,
panel, órdenes y sugerencias quedan inactivos. La interfaz está pendiente
de rediseño; las recogidas del servidor siguen funcionando.

`app/14-calendario.js` ya consulta la API `/calendario/*` de los backends de
datos. Carga el catálogo bajo demanda, páginas de 20 citas en agenda,
resúmenes para semana y mes y el detalle al abrir una cita. Las citas sin
fecha confirmada se consultan aparte. El cliente conserva el resultado de
la misma consulta mientras lo renueva y respeta los errores 4xx y el tiempo
de espera de 429, sin repetirlos en el otro backend.

`shared/calendario/` reúne las fechas y la interpretación de consultas. Una
fecha civil sin hora conserva su significado; solo se convierten instantes
con zona acreditada. Los filtros de noticias y los de agenda tienen ámbitos
distintos. Los resultados y clasificaciones deportivos son consultas
puntuales pendientes de implementación.

El [manual de agenda](../agenda/README.md) documenta rutas, publicación,
control de temporadas y trabajo pendiente para reactivar la interfaz.

## Modos y cabecera

El [contrato de modos](ASISTENTE-MODOS.md) describe las reglas y la prueba
del asistente. El feed usa una franja superior con marca, actualización,
contador, tiempo y estadísticas. El nombre de la vista recarga y su flecha
abre los modos; Guardadas está a la izquierda del buscador. Por debajo de
900 px de columna, el menú ⋯ reúne información y controles secundarios,
conservando sus estados. El total del archivo está en Estadísticas.

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

El análisis de asuntos y las comparaciones siguen
[pendientes](../PENDIENTES.md#estadísticas-de-asuntos).
