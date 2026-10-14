# Lector Universal

Modo lectura accesible para medios y complemento de
[Voceiro](https://thendabs1.github.io/voceiro/): Voceiro da los titulares y el
lector se encarga de lo que pasa al abrir la noticia.

## Instalar

Con un gestor de userscripts (Violentmonkey, Tampermonkey…), abre
<https://thendabs1.github.io/voceiro/lector.user.js>. Se actualiza solo.

## Qué hace

- Modo lectura con perfil de lectura: tema, fuente (también para dislexia),
  tamaño, ancho, interlineado, lectura biónica y foco. Mientras está abierto,
  la página de debajo no se ve ni se toca, tampoco lo que aparezca después
  (avisos y ventanas del medio); al cerrarlo, queda como estaba.
- Pendientes, diccionarios por idioma, lectura rápida (RSVP) y extracción
  asistida por sitio.
- Tweets, vídeos, gráficos y mapas insertados salen como tarjeta con enlace al
  original; no se carga nada de terceros. Las tablas de datos, como tabla.
- Al final del artículo: «Leída · volver a Voceiro» (cierra la pestaña;
  necesita `@grant window.close`), «Siguiente pendiente» (la abre con el lector
  ya abierto), guardar para luego y subir. Llegar al final la marca como leída,
  en Pendientes y en Voceiro, y se puede deshacer.
- «Abrir en…»: servicios a los que mandar la página que estás leyendo. Viene
  vacío; cada persona añade los suyos o importa una lista en JSON:

  ```json
  { "servicios": [ { "nombre": "Ejemplo", "plantilla": "https://ejemplo.org/?u={url_cod}" } ] }
  ```

  `{url}` es la dirección de la página tal cual y `{url_cod}`, codificada.
- Puente con Voceiro (eventos `voceiro-*`), activo solo en la página de Voceiro.

## Construir

```sh
node lector/build.mjs        # → lector/dist/lector.user.js
node lector/comprobar.mjs    # cabecera y dominios permitidos
```

La versión es `2.0.N`, con N = número de commits que han tocado `lector/`,
`shared/sync/`, `medios.py` o `plantilla.html`. Necesita la historia completa de git.

## Estructura

`src/NN-seccion.js` se concatenan en orden dentro de la función envolvente
(`00-inicio.js` … `99-fin.js`). Algunas piezas:

- `02-plataforma.js`: lo único que depende del gestor de userscripts (`GM_*`).
- `04-servicios.js`, `21-desplegable-servicios.js`: «Abrir en…».
- Módulos compartidos con Voceiro, metidos tal cual al construir:
  `shared/sync/fusion.js` (Pendientes y perfil) y `shared/tema/personalizado.js`
  (tema personalizado). No pueden importar nada.
- `26-boton-flotante.js`: el botón flotante, uno solo y en un Shadow DOM.
  `actualizarBoton()` lo pone, lo cambia o lo quita según la página.
- `34-puente-con-voceiro.js`: el puente con Voceiro.
- `plantilla.mjs`: la paleta y los iconos son los de Voceiro. `build.mjs` saca
  de `plantilla.html` el bloque PALETA y los `<symbol>` del sprite (solo los que
  usa el lector con `icono('…')`) y los pone en `20-css-del-lector.js`;
  `tests/tema/paleta.test.mjs` comprueba los contrastes de la paleta.

## Reglas

- El lector solo enlaza a los dominios de `dominios-permitidos.txt`; la CI lo
  comprueba.
- Los servicios de «Abrir en…» son datos de cada persona, no código.
