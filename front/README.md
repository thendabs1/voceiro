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
