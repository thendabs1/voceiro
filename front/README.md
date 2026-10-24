# Interfaz

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
Revisar su aplicación al feed en otro cambio de diseño; conservar los accesos
habituales y las preferencias de lectura.
