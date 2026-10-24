# Extensión del Lector Universal

Versión para pruebas, pendiente de comprobar manualmente en Firefox.
Todo su código está en este repositorio; no se publica ni se firma en AMO
desde este cambio. Requiere Firefox 140 o posterior.
La extensión no funciona en ventanas privadas porque guarda preferencias y
artículos en `storage.local`. Consulta la [política de privacidad](PRIVACIDAD.md)
antes de activar la sincronización opcional.

## Construir y probar en Firefox

Desde la raíz del repositorio, con Node 24 y Python 3:

```sh
node lector/extension/build.mjs firefox
```

La salida es `lector/dist/firefox/`. La construcción utiliza las fuentes
comunes del lector y no descarga dependencias. Incluye Readability 0.5.0
y sus licencias en el paquete.

1. Abre `about:debugging#/runtime/this-firefox`.
2. Pulsa **Cargar complemento temporal** y selecciona
   `lector/dist/firefox/manifest.json`.
3. Abre una noticia y usa el botón de la extensión en la barra de Firefox:
   **Leer esta página**.
4. En **Opciones y pendientes** puedes importar tu JSON del userscript,
   configurar el flotante, asignar atajos y ajustar la apertura por medio.
5. Para que el flotante o el automatismo funcionen al visitar un medio,
   concede permiso con **Permitir el lector en este medio**. También se
   puede conceder acceso global desde las opciones.

La instalación temporal se pierde al cerrar Firefox. Los datos del gestor
de userscripts y los de la extensión son independientes. Desactiva el
userscript mientras pruebas la extensión para evitar dos lectores sobre
la misma noticia. La posición de lectura no se restaura; los atajos vienen
sin asignar salvo Escape.

La CI construye el paquete, comprueba su sintaxis y ejecuta `web-ext lint`.
El validador muestra 0 errores y 16 avisos por asignaciones de HTML dinámico.
Quedan visibles en CI; no se suprimen. La [guía de Mozilla sobre contenido
externo](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Safely_inserting_external_content_into_a_page)
explica el riesgo y la necesidad de limpiar el HTML antes de insertarlo.

| Fuente de los avisos | Cantidad | Revisión del contenido insertado |
| --- | ---: | --- |
| `vendor/Readability.js` | 2 | Vuelve a analizar HTML en una copia desconectada del documento; el artículo resultante pasa por `sanitizeHTML` antes de mostrarse. Se conserva la biblioteca original. |
| `lector.js`: diálogo y diagnóstico | 2 | Plantillas locales; el texto del medio, los selectores y las etiquetas se escapan. |
| `lector.js`: lector y cambios de aspecto | 7 | El cuerpo procede de bloques saneados o texto escapado; metadatos y atributos se escapan. La portada solo admite una URL HTTP/HTTPS válida. |
| `lector.js`: teleprompter, flotante y ajustes | 5 | Estructura e iconos locales; los nombres y valores variables se escapan. |

Son avisos estáticos: por sí solos no demuestran una inyección, pero tampoco
equivalen a una aprobación de seguridad. Mozilla [permite seguir con el envío
si solo hay avisos](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/),
aunque los de seguridad pueden motivar un rechazo en la revisión humana.
Antes de publicar conviene revisar en Firefox páginas con HTML adversarial y
el saneador propio; la instalación y el uso reales aún están pendientes.
En la ejecución del workflow **Lector** puedes descargar el artefacto
**lector-firefox-pruebas**. Sus archivos van en la raíz del ZIP: descomprímelo
y selecciona el `manifest.json` extraído, no el ZIP contenedor de GitHub.
Las primeras descargas incluían dos carpetas: en ese caso selecciona
`firefox/manifest.json` después de descomprimir.

## Sincronización y Voceiro

En las opciones, activa **Permitir la sincronización cifrada** y acepta el
permiso de datos de Firefox. Después introduce el código en la pestaña
Configuración, o pulsa **Conectar con Voceiro** y configura allí la
sincronización. Sin ese consentimiento no se hacen peticiones de
sincronización. Se puede retirar desde las opciones o desde los permisos
de datos del complemento.

El fondo conserva el código, cifra y sincroniza con los mismos servidores
de Voceiro. Guarda los cambios antes de confirmar el cierre o la navegación.
Las alarmas permiten retomar las subidas al cerrar una noticia; el navegador
puede retrasarlas. Los scripts de contenido reciben la configuración y un
estado público, sin el código en los mensajes de inicialización.
El código se guarda en `storage.local` de la extensión: las webs no tienen
acceso, pero los contextos aislados de los scripts de contenido sí. No se
ha separado en un almacén exclusivo del fondo.

**Volver a Voceiro** reutiliza su pestaña abierta si has concedido el acceso
con **Conectar con Voceiro**. Sin ese permiso, abre Voceiro en la pestaña
de la noticia, porque Firefox no deja identificar la otra por su dirección.

Pendientes y configuración se muestran en una página de la extensión.
Para usar el selector visual, abre Opciones desde la noticia y pulsa
**Medios › Avanzado › Análisis de extracción**: el diagnóstico se abre en
la pestaña de origen. Esa pestaña debe seguir abierta en el mismo medio.

## Archivos y revisión

| Archivo | Función |
| --- | --- |
| `build.mjs`, `fuentes.mjs` | Construyen el paquete con las fuentes comunes. |
| `fondo.js` | Almacenamiento, permisos, pestañas y sincronización. |
| `estado.js` | Aplica cambios de una pestaña conservando cambios independientes. |
| `plataforma.js`, `sync-contenido.js` | Adaptan el lector sin usar `GM_*` ni el almacén del medio. |
| `popup.*`, `opciones.*` | Accesos y opciones de la extensión. |
| `vendor/` | Copia local sin modificar de Readability y sus licencias. |

La versión se obtiene del mismo historial de Git que el userscript. Para
una construcción reproducible desde un archivo de fuentes sin historial,
puedes establecer `LECTOR_VERSION` con la versión que quieras probar.

```sh
LECTOR_VERSION=2.0.1 node lector/extension/build.mjs firefox
```

Para una versión enviada a AMO, adjunta también un ZIP de las fuentes del
repositorio: `lector/`, `shared/sync/`, `shared/tema/`, `medios.py` y
`plantilla.html` son necesarios para reproducir el código generado. En un
ZIP sin historial de Git, sustituye `2.0.1` por la versión exacta del
`manifest.json` enviado y ejecuta el comando anterior desde la raíz de las
fuentes. El resultado está en `lector/dist/firefox/` y se construye con
Node 24 y Python 3 sin instalar paquetes adicionales. Mozilla pide fuentes
e instrucciones de construcción cuando un proceso genera los JavaScript
incluidos en el complemento.

La biblioteca procede de
[`@mozilla/readability@0.5.0`](https://github.com/mozilla/readability/tree/0.5.0),
bajo Apache 2.0. El resto conserva la licencia del lector.

## Chrome y comprobaciones pendientes

`node lector/extension/build.mjs chrome` genera la variante Manifest V3 con
un service worker. Se comprueba su construcción y sintaxis en CI; su
instalación y comportamiento en Chrome quedan pendientes. El objetivo
inicial de las pruebas de uso es Firefox.

Antes de publicarlo, comprobar en Firefox: lectura manual, concesión y
retirada de acceso, flotante y automatismo, importación, diccionarios,
selector, teleprompter, navegación sin recarga, retorno a Voceiro y
persistencia después de reiniciar. Las pruebas de código usan las APIs
simuladas y no sustituyen esa comprobación manual.

La [segunda revisión con Claude](../REVISION-CLAUDE.md) recoge los fallos
reproducidos, las correcciones y las comprobaciones de navegador pendientes.
