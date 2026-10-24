# Manual de usuario del Lector Universal

El Lector Universal presenta las noticias en una vista de lectura con
apariencia configurable, pendientes, diccionarios y teleprompter. Puede
usarse junto a [Voceiro](https://thendabs1.github.io/voceiro/) o abrirse
directamente sobre una noticia.

Este manual describe el userscript revisado el 24 de octubre de 2026.
La extensión de Firefox está en preparación: todavía no hay un paquete ni
una ficha de instalación de esa extensión en este repositorio. Su acceso
desde la barra del navegador y las nuevas opciones se documentarán cuando
estén implementados.

## Instalar la versión actual

1. Instala y habilita un gestor de userscripts compatible con tu navegador,
   como Violentmonkey o Tampermonkey.
2. Abre el [instalador del Lector Universal](https://thendabs1.github.io/voceiro/lector.user.js).
3. Confirma la instalación en el gestor y recarga las noticias y Voceiro
   que ya tuvieras abiertos.

El gestor administra las actualizaciones y los permisos del script. La
versión actual solicita ejecutarse en páginas HTTP/HTTPS, excepto algunos
dominios locales, y acceder a los servidores de sincronización. Aunque se
ejecute en una página, el botón solo aparece donde el lector tiene algo
que ofrecer. No actúa dentro de marcos secundarios.

## Leer la primera noticia

1. Abre una noticia de un medio reconocido por Voceiro.
2. Pulsa el botón flotante **Modo lectura**. Suele aparecer abajo a la
   izquierda y puedes arrastrarlo a otro lugar.
3. Pulsa **Apariencia** para elegir tema, letra y tamaño.
4. Lee desplazándote por el artículo. La barra superior se recoge al bajar
   y reaparece al subir.
5. Pulsa **Salir** o `Esc` para regresar a la página original.

Si no aparece el botón, usa la opción **Abrir modo lectura
(aquí)** del menú del gestor. La apertura manual permite intentar leer
una página que no esté en el catálogo; su contenido debe poder extraerse.

El lector muestra el texto que encuentra en la página o en sus datos del
artículo. Si el medio solo entrega un fragmento, puede faltar contenido.

## Botón flotante y acceso a configuración

En la pestaña **Configuración**, **Mostrar el botón flotante** permite
ocultarlo en todas las webs. La apertura automática se configura aparte.

El botón grande abre el lector cuando ofrece modo lectura. El pequeño
**⋯** abre más opciones. En algunas páginas sin artículo, el botón grande
abre directamente ese menú.

Puedes arrastrarlo: al soltar se coloca en el borde más cercano. Su posición
se conserva en este navegador. El menú permite añadir el medio a tus
ajustes, abrir **Configuración y medios** y usar los servicios de **Abrir
en…** que hayas configurado.

**Ocultar el botón en este medio** retira el flotante en ese dominio.
Puedes recuperarlo con **Deshacer** en el aviso o con **Mostrar el botón
en este medio** en el menú del gestor. Ocultarlo no desactiva la apertura
automática.

Puedes abrir la configuración desde **Más** dentro del lector o desde el
menú del gestor. Se abre en Voceiro para proteger tus pendientes y ajustes
de los scripts de los medios; también está integrada en **Ajustes › Lector**. Los atajos globales del lector no actúan en la propia
página de Voceiro, que tiene sus atajos.

## Apariencia e imágenes

Los cambios de **Apariencia** se guardan al hacerlos.

| Opción | Para qué sirve |
| --- | --- |
| Tema | Claro, Sepia, Oscuro, Alto contraste o Personalizado. |
| Personalizado | Elige fondo, texto, enlaces y títulos. Se indica el contraste con el fondo y se avisa si es bajo. |
| Fuente | Serif, Sans o Dislexia. La opción Dislexia usa letras del sistema con mayor separación; no descarga una tipografía especial. |
| Tamaño | Aumenta o reduce la letra entre 14 y 32. |
| Ancho | Ajusta la columna de lectura. |
| Justificar | Alinea el texto en ambos márgenes. |
| Bionic | Resalta el comienzo de las palabras. |
| Foco | Destaca el bloque cercano al centro de la pantalla. |

Junto al título hay un botón de imágenes que alterna **Con imágenes**,
**Solo con pie** y **Sin imágenes**. En **Apariencia › Imágenes en este
medio** puedes fijar una preferencia para ese medio o elegir **Como en
todos los medios**. Si existe una preferencia propia, el botón cambia esa;
en caso contrario cambia la general.

Pulsa una imagen para ampliarla. En el visor puedes recorrer las imágenes
con las flechas izquierda y derecha y cerrarlo con `Esc`. Las galerías
agrupan imágenes consecutivas.

Los vídeos, publicaciones sociales, gráficos y mapas reconocidos se
presentan como tarjetas con un enlace al original. El lector no ejecuta
sus reproductores dentro de esas tarjetas. Las tablas reconocidas como
tablas de datos conservan sus filas y columnas.

## Guardar y gestionar pendientes

Pulsa **Guardar para más tarde** junto al título o al final del artículo.
Se guarda un enlace con sus datos, no una copia para leer sin conexión.

El botón cambia según el estado de la noticia. En una noticia pendiente,
**Quitar de pendientes** la pasa a leídas; en una noticia leída,
**Guardar en pendientes** la devuelve a la lista de lectura.

Abre **Pendientes** en la barra del lector o desde la configuración.
La lista se muestra en Voceiro. Puedes abrir enlaces, marcarlos como leídos o pendientes
y eliminarlos con **✕**.

**Guardar historial de leídas** conserva una sección de noticias terminadas.
Si desmarcas esa opción, se eliminan las leídas que ya figuraban en la
lista. **Borrar leídas** vacía esa sección tras pedir confirmación. El
historial de esta lista y las marcas de lectura de Voceiro tienen usos
distintos; borrar la lista no equivale a limpiar todo el historial de Voceiro.

### Al terminar una noticia

Al bajar hasta las acciones del final, la noticia se marca como leída y
aparece **Deshacer**. Un artículo que cabe entero en pantalla no se marca
automáticamente sin desplazamiento. Si deshaces la marca, no vuelve a
marcarse sola durante esa apertura.

- **Leída · volver a Voceiro** marca la noticia y trata de cerrar la pestaña.
  Si el navegador no permite cerrarla, esa pestaña abre Voceiro.
- **Siguiente pendiente** marca la actual y abre la siguiente en la misma
  pestaña, solicitando que el lector se abra al llegar. Solo aparece si hay
  otra pendiente.
- **Subir** vuelve al comienzo.

El botón **Voceiro** de la barra superior intenta volver sin forzar por sí
mismo la marca de noticia terminada. **Salir** solo cierra la vista de lectura.

## Diccionarios

Haz doble clic sobre una palabra del cuerpo del artículo. En
**Diccionarios** puedes elegir:

- **Directo**: abre el diccionario predeterminado en otra pestaña.
- **Popup**: muestra los diccionarios disponibles para que elijas uno.

El idioma se toma del ajuste del medio; con **Auto**, del idioma declarado
por la página y, si no se reconoce, del idioma de la interfaz. Hay
diccionarios para castellano, gallego, catalán, euskera, inglés, francés,
alemán, italiano y portugués.

Para añadir uno, indica un nombre, su idioma y una dirección de búsqueda
que incluya `{palabra}`. Por ejemplo:

```text
https://diccionario.example/buscar?q={palabra}
```

La dirección del ejemplo debe sustituirse por la del diccionario que uses.
El servicio elegido recibe la palabra consultada al abrirlo.

## Teleprompter y otras acciones

**Teleprompter** aparece junto al título y en **Más**. Desplaza el texto
automáticamente, empezando a 300 palabras por minuto. Usa **Pausa**, los
botones de velocidad y **Salir** para volver al artículo. El rango es de
100 a 1000 palabras por minuto, en pasos de 50. Puedes cerrar el teleprompter con su botón o con `Esc`; al salir del lector
se detiene también su reproducción.

En **Más** también puedes:

- **Copiar texto**: copia el artículo preparado para lectura y su dirección.
- **Imprimir**: abre el diálogo de impresión del navegador.
- **Enviar email**: abre el programa de correo. Para artículos largos,
  intenta copiar el texto para que lo pegues en el mensaje; comprueba el
  portapapeles antes de enviarlo.
- **Compartir**: usa la función del navegador si está disponible o intenta
  copiar la dirección.
- **Ignorar esta sección**: guarda una exclusión para esa ruta del medio.

## Configurar cada medio

En **Medios** aparecen los dominios que tienen ajustes propios. Que la
lista esté vacía no significa que el lector carezca de medios reconocidos.
Puedes añadir el dominio actual o escribir otro.

**Apertura** permite elegir:

| Valor | Comportamiento |
| --- | --- |
| Botón | Ofrece acceso al lector. Si está activo el automatismo global, este puede abrirlo igualmente. |
| Automático | Intenta abrir el lector al entrar en las páginas admitidas del medio. |
| Desactivado | Desactiva su oferta de lectura y su apertura automática; conserva los ajustes. |

La pestaña **Configuración** incluye **Modo lector automático en todos los
medios**. Se aplica a medios conocidos y a los que tengan reglas propias,
respetando desactivaciones y secciones ignoradas. Para controlar la apertura
solo por medio, deja ese ajuste global desactivado.

**Desactivar medio** elimina sus ajustes propios y añade el dominio a
**Bloqueado**. Para recuperarlo, pulsa **Desbloquear** y vuelve a añadir sus
ajustes si los necesitas. Si un cambio de apertura no se refleja al cerrar
el panel, recarga la página.

Las exclusiones de **Secciones ignoradas** impiden el botón de lectura y
la apertura automática en rutas que empiecen por el patrón guardado. Puedes
quitarlas con su botón **✕**. Revisa el patrón: ignorar `/deportes/` afecta
a todas las noticias bajo esa ruta.

### Cuando falta texto o aparece contenido ajeno

Prueba primero **Avanzado › Origen › Auto**:

- **Auto** combina la detección del texto con los datos del artículo cuando
  están disponibles.
- **JSON** utiliza los datos estructurados publicados por el medio.
- **Lector** analiza el contenido de la página.

El origen también puede cambiarse desde **Apariencia**. Si el medio aún no
tiene reglas, el lector ofrece guardarlo en la lista o usarlo solo esa vez.
Si un origen explícito falla y Auto consigue extraer el texto, el lector
avisa y vuelve a Auto.

Para ajustar una extracción manual:

1. Abre una noticia del medio y sal de la vista de lectura para ver la
   página original.
2. Si el medio aún no tiene ajustes, añádelo desde el menú del flotante.
   En ese mismo menú abre **Análisis de extracción**. El diagnóstico trabaja
   sobre la noticia actual; desde Voceiro solo puedes revisar sus reglas.
3. Elige **Selector manual** y pulsa **Elegir elemento**. Señala un
   contenedor que incluya todos los párrafos de la noticia. `Esc` cancela
   la selección.
4. Si lo necesitas, indica elementos a excluir dentro del contenedor,
   como `.newsletter` o `aside`, y revisa la previsualización.
5. **Probar en lector** abre una prueba y cierra el análisis, sin guardar
   la regla. Vuelve a abrir el análisis para introducir y guardar el
   ajuste definitivo con **Guardar**.

El selector manual tiene prioridad sobre **Origen**. Para volver a la
detección habitual, guarda **Automático** como método y revisa que
**Origen** esté en **Auto**. **Extraer todo el texto** es una alternativa
que puede incluir texto ajeno a la noticia: comprueba el resultado.

## Añadir servicios a «Abrir en…»

Esta lista empieza vacía. En **Abrir en…** añade un nombre y la dirección
del servicio que quieras usar. La plantilla debe empezar por `https://`
e incluir `{url}` o `{url_cod}`:

```text
https://servicio.example/abrir?url={url_cod}
```

`{url}` inserta la dirección de la noticia tal cual; `{url_cod}` la codifica
para incluirla en un parámetro. Sustituye el dominio del ejemplo por el
servicio real. Al seleccionarlo, ese servicio recibe la dirección de la
página en una pestaña nueva.

Puedes exportar la lista o importar un archivo JSON con esta forma:

```json
{
  "servicios": [
    {
      "nombre": "Mi servicio",
      "plantilla": "https://servicio.example/abrir?url={url_cod}"
    }
  ]
}
```

La importación añade los servicios válidos, omite plantillas repetidas y
admite hasta 30. La casilla **«Abrir en…» en el menú del botón flotante**
controla ese acceso; dentro del lector los servicios aparecen en **Más**.

## Atajos de teclado

En instalaciones nuevas, solo `Esc` viene asignado para cerrar. Las
acciones siguen disponibles en los botones y puedes asignar las
combinaciones que prefieras en **Atajos**. Si ya usabas el lector, se
conservan tus asignaciones anteriores. **Restablecer atajos** deja todas
las acciones sin asignar excepto el cierre con `Esc`.

Puedes asignar combinaciones para abrir el lector, Pendientes, Medios,
configuración y Voceiro; y para cambiar tamaño, tema, imágenes, ancho,
Bionic, Foco, justificado, guardar, copiar o abrir el teleprompter.

El navegador o el sistema pueden interceptar algunas combinaciones.
Los atajos se suspenden en campos de texto y durante varias herramientas.
En los menús puedes moverte con flechas, Inicio y Fin.

Para cambiar una combinación, pulsa el lápiz y después las teclas. `Esc`
cancela la captura y Retroceso elimina la asignación. Los atajos globales
deben incluir Ctrl, Alt o Meta. `Esc` para salir está reservado.

## Sincronización con Voceiro y otros dispositivos

Sin sincronización, la configuración y los pendientes se guardan en este
gestor y navegador. El lector puede intercambiar pendientes, perfil y
configuración con Voceiro al abrir su página.

Para usar varios dispositivos:

1. Configura la sincronización de Voceiro en **Ajustes › Sincronización**.
2. Abre Voceiro en el navegador donde está instalado el lector; este recibe
   automáticamente su código.
3. Usa el mismo código en los demás dispositivos y comprueba el estado en
   la pestaña **Configuración** del lector.

Los datos se cifran antes de enviarse. El lector comparte pendientes,
marcas de leídas, perfil de lectura y ajustes propios. La posición del botón no viaja entre dispositivos. Cada artículo comienza
al principio: se ha retirado la restauración de la posición de lectura.
La vista de lectura sigue funcionando sin conexión si la página ya está
disponible, pero Pendientes no descarga los artículos para leerlos sin red.

En la versión actual, la sincronización propia del lector necesita una
página HTTPS. En la página de Voceiro sincroniza Voceiro. Si falla la red,
los cambios locales quedan guardados y se reintentan posteriormente.
**Sincronizar ahora** permite solicitar otro intento donde esté disponible.

Si introduces un código manualmente, hazlo en **Ajustes › Lector** dentro
de Voceiro; el lector no ofrece ese campo encima de otras webs. El código
de Voceiro tiene prioridad si es distinto. Conserva el código para vincular
otros dispositivos.

**Dejar de sincronizar** desvincula el lector sin borrar sus datos locales
ni el bloque remoto. Si el código procedía de Voceiro, volverá a recibirse
al abrirlo: para dejarlo desvinculado, cambia también la sincronización
de Voceiro.

## Copias de seguridad y restablecimiento

En la pestaña **Configuración**, **Exportar** descarga
`lector-universal-config.json`, con tus ajustes y pendientes. Es un archivo
legible, sin cifrar; contiene direcciones y títulos de noticias. No incluye
el código de sincronización ni las posiciones de lectura.

**Importar** carga una configuración sobre los valores iniciales: sustituye
la configuración actual, incluidos los pendientes, en lugar de añadir
solo lo que falte. Exporta antes una copia si quieres poder volver atrás.
La importación de servicios de **Abrir en…** sí añade elementos a su lista.

**Restablecer** reinicia los ajustes y la lista local tras pedir
confirmación. No equivale a dejar de sincronizar ni a borrar los datos del
servidor: los datos sincronizados pueden volver a aparecer.

Para pasar a la futura extensión, la copia JSON será el punto de partida
para conservar tus datos. El procedimiento definitivo depende de su
implementación.

## Problemas frecuentes y límites actuales

| Problema | Qué revisar |
| --- | --- |
| No aparece el botón | Comprueba el gestor, recarga, revisa los medios bloqueados, las secciones ignoradas y si ocultaste el botón. En portadas puede no aparecer. Prueba el acceso manual. |
| No se puede extraer la noticia | Espera a que cargue, comprueba el contenido original y prueba Auto. Si sigue fallando, ajusta el selector en una noticia de ese dominio. |
| Falta texto o se cuelan recomendaciones | Compara JSON y Lector; después prueba un selector manual que abarque solo el artículo. |
| El lector se abre solo | Revisa el automatismo global y la opción Apertura del medio. Ocultar el botón no cambia esos ajustes. |
| El diccionario usa otro idioma | Configura Idioma en Medios y el diccionario predeterminado para ese idioma. |
| Los cambios no llegan a otro dispositivo | Revisa que ambos tengan el mismo código y consulta el estado de sincronización en una página HTTPS. |
| Volver a Voceiro no cierra la pestaña | Depende del gestor y del navegador; el lector intenta abrir Voceiro en esa pestaña. |
| Una web cambia de noticia sin recargar | El lector cierra el artículo anterior al detectar el cambio. Puedes abrir la nueva noticia desde su botón. |
| Con selector manual faltan vídeos o gráficos | Comprueba que el contenedor elegido incluya también esos elementos. |

La vista de lectura oculta la página original y bloquea la interacción
con buena parte de ella, pero sus scripts pueden seguir ejecutándose.
Ocultar imágenes tampoco garantiza evitar sus descargas. Pendientes y configuración se muestran en Voceiro; el medio solo recibe
los controles necesarios para leer y ajustar su propia noticia.

Los ajustes pendientes del portado y los fallos detectados se detallan en
la [revisión técnica para Firefox](REVISION-FIREFOX.md).
