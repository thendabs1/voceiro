# Revisión del lector para Firefox y Chrome

Revisión: 24 de octubre de 2026. Base: `75df740`, incluyendo los cambios
locales presentes en `lector/` durante la revisión.

El lector permite reutilizar la extracción, los bloques, los temas y las
reglas de sincronización. Para convertirlo en una extensión hace falta
adaptar el arranque, el almacenamiento, la comunicación y las acciones del
navegador. Cambiar solamente `02-plataforma.js` no sería suficiente.

Este documento conserva la revisión inicial. Después se han corregido la
validación de destinos y configuración, la identidad del artículo al
navegar, los embebidos del selector, la prioridad de reglas y el cierre
del teleprompter. Los ajustes del userscript se muestran en Voceiro y se
rechazan eventos de teclado sintéticos. Los atajos nuevos quedan sin
asignar salvo Escape y se retira la restauración de posición. El flotante
tiene una opción global independiente de la apertura automática.

Los apartados siguientes explican los problemas encontrados y el trabajo
de adaptación a la extensión. El [manual](MANUAL.md) refleja las correcciones.

## Diseño de acceso propuesto

Tras comentarlo con el usuario, la propuesta para Firefox es:

- Un botón en la barra de Firefox como acceso permanente al lector.
- Una opción independiente para mostrar u ocultar el botón flotante.
- Apertura automática opcional, configurable por medio.

El userscript ya permite ocultar el flotante por medio y configurar la
apertura automática. La extensión necesitará un ajuste global del flotante
y un acceso a configuración aunque esté oculto o no haya permiso para leer
la página. Queda por decidir el valor inicial de esa opción y si se mantiene
también el automatismo global actual.

## Ajustes necesarios para la extensión

### 1. Almacenamiento y arranque asíncronos

Referencias: [02-plataforma.js](src/02-plataforma.js),
[07-configuracion.js](src/07-configuracion.js),
[23-lector.js](src/23-lector.js), [28-sincronizacion.js](src/28-sincronizacion.js)
y [34-puente-con-voceiro.js](src/34-puente-con-voceiro.js).

`PLATAFORMA.leer()` devuelve el dato inmediatamente. `CFG = loadCfg()` se
ejecuta al evaluar el script y varias funciones de sincronización también
leen de forma síncrona. Sustituirlo por una promesa dejaría el arranque sin
configuración válida. Además, `saveScroll()` y la restauración de posición
usan directamente el `localStorage` del medio, fuera del adaptador.

Sin las funciones `GM_*`, el adaptador actual guarda también la
configuración y el estado de sincronización en el `localStorage` de la
web. Copiar el userscript como script de contenido activaría ese respaldo:
los datos quedarían separados por sitio y accesibles a sus scripts. La
extensión debe usar su propio almacén desde el primer arranque.

Propuesta: cargar los datos de la extensión antes de inicializar el lector,
mantener una copia local para las consultas inmediatas y confirmar las
escrituras importantes antes de navegar o cerrar. Centralizar en el fondo
las modificaciones compartidas evita que dos pestañas sobrescriban copias
antiguas. La posición de lectura también debe pasar por el adaptador.
`storage.local` pertenece a la extensión; los cambios se notifican mediante
`storage.onChanged`. No tiene el indicador `remoto` del gestor, por lo que
hay que evitar devolver como nuevo un cambio propio.
[Almacenamiento de extensiones](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/local),
[notificación de cambios](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/onChanged).

El traspaso desde el gestor requiere una migración explícita: la extensión
no lee su almacén `GM_*`. La exportación/importación JSON existente es una
base aprovechable; hay que probarla y explicar que el código de
sincronización y las posiciones de lectura no van en esa exportación.

### 2. Incluir Readability en el paquete

Referencia: [00-inicio.js](src/00-inicio.js).

La única dependencia de ejecución externa declarada es Readability 0.5.0,
cargada mediante `@require` desde jsDelivr. Esa cabecera no instala la
biblioteca en una WebExtension. Debe incluirse una copia local, con versión
fijada, licencia y procedencia, cargada antes del lector. Mozilla exige
extensiones autocontenidas y no permite cargar código remoto para
ejecutarlo. Al haber código generado, también pide fuentes e instrucciones
para reproducir la construcción.
[Políticas técnicas y entrega de fuentes](https://extensionworkshop.com/documentation/publish/add-on-policies/).

Para minimizar cambios, empaquetaría primero la versión actual. Actualizar
la biblioteca merece una comprobación separada de la extracción.

### 3. Adaptar el puente con Voceiro al aislamiento de Firefox

Referencias: [34-puente-con-voceiro.js](src/34-puente-con-voceiro.js) y
[front/app/07-lector.js](../front/app/07-lector.js).

El puente usa `CustomEvent.detail` con objetos. La copia mediante
`JSON.parse(JSON.stringify(...))` sigue perteneciendo al contexto que la
crea; no garantiza que la página pueda leerla desde un script de contenido
de Firefox. Mozilla documenta el error de acceso que puede producir un
`detail` que no sea una cadena al comunicar una extensión con la página.
[CustomEvent en Firefox](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent).

Opciones: serializar el contrato como JSON en ambos extremos, o añadir un
adaptador de clonación adecuado para Firefox. Recomiendo JSON para compartir
el protocolo con Chrome; es una propuesta que requiere ajustar también
Voceiro y comprobar compatibilidad con el userscript. Mantener la restricción
de origen y ruta de `esVoceiro()`, validar los mensajes y no exponer el
código de sincronización en otras webs.

### 4. Mover las peticiones de sincronización al fondo

Referencias: [02-plataforma.js](src/02-plataforma.js),
[28-sincronizacion.js](src/28-sincronizacion.js),
[shared/sync/cliente.js](../shared/sync/cliente.js) y
[workers/comun/sync.js](../workers/comun/sync.js).

`GM_xmlhttpRequest` evita las restricciones de la página. El `fetch` de
respaldo no es equivalente en un script de contenido de Manifest V3:
depende de CORS. Deben hacerse las peticiones desde el fondo, con permisos
para los dos servidores. El servidor actual ya contempla orígenes de
extensiones; no se ha detectado aquí una necesidad de abrirlo a cualquier
origen web.
[Peticiones y aislamiento de los scripts de contenido](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts#xhr_and_fetch).

El canal interno debe aceptar operaciones concretas de sincronización,
con destinos fijados, y transportar estado, cabeceras y bytes. No conviene
convertirlo en un proxy de URLs arbitrarias. Es preferible que el fondo
conserve también el código y haga el cifrado: así la sincronización no
depende de que la noticia use HTTPS ni de que su pestaña siga abierta.

### 5. Resolver pestañas, menús y cierre con APIs del navegador

Referencias: [02-plataforma.js](src/02-plataforma.js),
[23-lector.js](src/23-lector.js) y
[33-menus-gm-init-spa.js](src/33-menus-gm-init-spa.js).

| Comportamiento actual | Adaptación propuesta |
| --- | --- |
| Menús `GM_registerMenuCommand` | Botón de Firefox y página de opciones; menús contextuales solo si se necesitan. |
| `window.close()` con privilegio del gestor | Petición al fondo para cerrar la pestaña emisora. |
| Aviso compartido y `window.focus()` para volver a Voceiro | Localizar una pestaña de Voceiro y activarla; decidir qué hacer si no existe. |
| Esperas de 120 y 600 ms antes de cerrar o navegar | Esperar la confirmación de guardado y de la acción. |

El cierre mediante `tabs.remove()` es asíncrono. Una espera fija no acredita
que el estado esté guardado. Tampoco hace falta conceder el permiso amplio
`tabs` solo por usar cualquier método de esa API: los permisos se deciden
según los datos y operaciones necesarios.
[Cierre de pestañas](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/remove).

### 6. Revisar la navegación sin recarga

Referencia: [33-menus-gm-init-spa.js](src/33-menus-gm-init-spa.js).

El script sustituye `history.pushState` y `history.replaceState`. En una
extensión no se debe asumir que esa sustitución en el contexto aislado
intercepte las llamadas de la página. Se puede recibir el cambio desde el
fondo mediante `webNavigation.onHistoryStateUpdated`, filtrando el marco
principal, o diseñar otro detector explícito. La primera opción requiere
el permiso `webNavigation`.
[Aislamiento de scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Sharing_objects_with_page_scripts),
[cambios en el historial](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webNavigation/onHistoryStateUpdated).

Hay que definir además qué ocurre con el artículo abierto cuando cambia la
URL; el fallo actual se describe más abajo.

### 7. Construcción, permisos y diferencias entre navegadores

Referencias: [build.mjs](build.mjs), [comprobar.mjs](comprobar.mjs) y
[workflow del lector](../.github/workflows/lector.yml).

Actualmente se genera exclusivamente un userscript: no hay manifiesto,
fondo, página de opciones ni paquete instalable de extensión. La
comprobación de dominios busca URLs literales en el código; no sustituye
la validación de permisos ni de destinos introducidos por el usuario.

Propuesta: mantener las fuentes comunes y generar una entrada por
plataforma. Para Firefox, empezar con Manifest V3 y `background.scripts`.
Chrome usa `background.service_worker`; Firefox no soporta actualmente
esa propiedad como implementación del fondo. La lógica compartida debe
poder reanudarse y recuperar su estado cuando el fondo se descargue.
[Compatibilidad del fondo](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background),
[ciclo de vida en Chrome](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers).

La apertura manual puede usar `activeTab` y `scripting`. El flotante y la
apertura automática requieren acceso persistente a las webs donde deban
funcionar; conviene solicitarlo al activar esas opciones y explicar su
alcance. `storage` y el acceso a los servidores de sincronización tienen
finalidades distintas. Las páginas internas, la tienda de complementos y
el visor PDF tienen restricciones de inyección; el botón debe mostrar un
estado comprensible cuando no pueda actuar.
[Permisos y páginas restringidas](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts#permissions_restrictions_and_limitations).

Antes de publicar una extensión nueva en AMO hay que preparar la
declaración de transmisión de datos y su consentimiento. El sistema
integrado es obligatorio para extensiones nuevas desde el 3 de noviembre
de 2025. Deben revisarse la sincronización opcional y los envíos elegidos
por la persona a diccionarios o servicios; la clasificación concreta queda
pendiente del diseño final.
[Consentimiento integrado de Firefox](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).

## Fallos actuales que conviene resolver antes de portar

### Prioridad alta: datos personales en un panel que comparte el DOM del medio

Referencias: [32-atajos-globales.js](src/32-atajos-globales.js) y
[31-panel-de-configuracion.js](src/31-panel-de-configuracion.js).

`globalKeyHandler()` acepta eventos sintéticos. Una página donde se ejecute
el lector puede emitir un `keydown` con `Alt+P` y provocar que se inserte la
lista de pendientes en su propio DOM. El panel contiene enlaces y títulos
de otras webs que los scripts del medio pueden leer. La separación del
almacén del gestor no protege los datos una vez pintados en ese documento.

Propuesta para la extensión: mostrar Pendientes y los ajustes que contienen
datos de otros sitios en una página propia de la extensión. Rechazar
eventos sintéticos reduce una vía de activación, pero no aísla el panel si
el usuario lo abre sobre el medio. Este hallazgo procede del flujo de código;
queda pendiente comprobarlo en el navegador y en los gestores admitidos.

### Prioridad alta: destinos importados sin validar su protocolo

Referencias: [08-diccionarios.js](src/08-diccionarios.js),
[31-panel-de-configuracion.js](src/31-panel-de-configuracion.js) y
[shared/sync/fusion.js](../shared/sync/fusion.js).

El alta de diccionarios solo exige que la plantilla contenga `{palabra}`.
`buildDictUrl()` y `openDictionary()` tampoco validan el protocolo. Se ha
reproducido que una plantilla `javascript:void("{palabra}")` llega a
`window.open()`. También se ha confirmado que `normalizarPendiente()`
acepta una URL `javascript:`, que después se usa en enlaces de Pendientes.
Escapar comillas y etiquetas no valida el destino. No se ha probado la
ejecución de esas URLs en el navegador.

Propuesta: permitir únicamente destinos HTTP/HTTPS válidos para noticias
y diccionarios, tanto al importar o recibir datos como al abrirlos.
Validar además la estructura de las reglas importadas: `sites: [null]`
provoca un error en `migrateCfg()`. Preparar la configuración completa antes
de sustituir `CFG` y avisar de entradas rechazadas.

### Prioridad alta: un artículo puede guardarse con la URL de otro

Referencias: [33-menus-gm-init-spa.js](src/33-menus-gm-init-spa.js),
[23-lector.js](src/23-lector.js) y [11-pendientes.js](src/11-pendientes.js).

Caso reproducido: se abre A; la página cambia la URL a B sin recargar con el
lector abierto; `checkUrlChange()` actualiza `__lastHref` y sale sin cambiar
el artículo. `saveForLater(art)` toma el título de A y `location.href` de B.
El marcado de leídas y las acciones de compartir también consultan la URL
actual. El cierre posterior tampoco recupera ese cambio desde
`checkUrlChange()`, porque la dirección ya quedó registrada.

Propuesta: asociar al artículo su URL al extraerlo y usarla en todas sus
acciones. Definir si el lector se cierra o conserva ese artículo cuando
cambia la página de debajo, limpiando sus observadores y temporizadores.

### Prioridad media: los embebidos desaparecen con un selector manual

Referencia: [17-extractores-de-articulo.js](src/17-extractores-de-articulo.js).

`extractFromSelector()` clona un elemento suelto.
`marcarEmbebidos()` descarta cada elemento cuyo `isConnected` es falso;
los descendientes de ese clon lo son. Por eso no genera tarjetas y el
sanitizador elimina después los iframes. La simulación confirma que el
mismo embebido solo se sustituye cuando se marca conectado.

Propuesta: comprobar que el elemento siga dentro de la raíz que se está
procesando, sin exigir su conexión a un documento. Conservar la protección
contra procesar otra vez un iframe ya retirado con su envoltorio.

### Prioridad media: la regla del dominio padre puede ocultar la del subdominio

Referencia: [09-dominios-y-reglas.js](src/09-dominios-y-reglas.js).

`findSiteRule()` devuelve la primera coincidencia de una lista ordenada
alfabéticamente. Con `example.org` desactivado y `news.example.org` en
automático, se ha reproducido que gana la regla del padre.

Propuesta: dar prioridad a la coincidencia más específica. Hay que acordar
si un bloqueo explícito del padre debe seguir bloqueando todos sus
subdominios; es una decisión diferente a la selección de reglas.

### Prioridad media: cierre y repetición del teleprompter

Referencias: [24-rsvp.js](src/24-rsvp.js) y [23-lector.js](src/23-lector.js).

`openRSVP()` puede añadir varias capas con el mismo identificador. El botón
Salir detiene su temporizador, pero el cierre del lector con Escape no
invoca esa limpieza. Además, el teleprompter recibe `rawBody`, mientras
Copiar texto usa los bloques ya depurados: pueden mostrar contenido distinto.
Hallazgos por inspección, pendientes de comprobación visual.

Propuesta: una única instancia, cierre propio con Escape, limpieza desde
el cierre del lector y texto obtenido de los mismos bloques visibles.

## Orden de trabajo propuesto

1. Acordar los valores iniciales del flotante, el automatismo y el acceso a
   los medios; decidir dónde se mostrarán Pendientes y configuración.
2. Corregir los fallos de datos, URL del artículo, selector y reglas.
3. Introducir el arranque asíncrono y el adaptador de extensión, conservando
   el userscript como otra salida.
4. Empaquetar Readability y generar el complemento Firefox con su fondo,
   botón y opciones. Adaptar y verificar el puente con Voceiro.
5. Validar permisos, navegación, migración y publicación; después generar
   la variante Chrome y repetir los casos de integración.

No se propone rehacer los extractores ni cambiar el formato de
sincronización para iniciar el portado.

## Verificación realizada y pendiente

Verificado localmente con Node 24.21.0:

- Construcción del userscript en `/tmp/voceiro-lector-revision.user.js`,
  versión calculada `2.0.300`, sin sobrescribir `public/lector.user.js`.
- Sintaxis del resultado y comprobación de cabecera y dominios: 41
  dominios literales, todos permitidos.
- Los cuatro archivos de pruebas del lector: 27 casos correctos
  (6 de código incrustado, 12 de modo mixto, 2 de contexto de extracción
  y 7 de sincronización). Se ejecutaron también directamente para ver el
  resultado de cada caso.
- Simulaciones con `node:vm` sobre las fuentes actuales: selección de regla,
  destinos de diccionario y pendientes, embebidos en un clon desconectado
  y guardado del artículo tras cambiar de URL. Confirman los fallos
  descritos; no equivalen a una prueba de navegador.

La suite completa corresponde a CI; no se ha lanzado ni se afirma que haya
pasado en esta revisión. El workflow `Lector` comprueba construcción,
sintaxis y dominios. El workflow `Tests` ejecuta la suite en cada PR; en
`push` a `main` su filtro no incluye todos los cambios de `lector/`, algo
que conviene ajustar cuando se empiece a modificar su código.

Pendiente al existir el paquete: lint y construcción de la extensión en CI,
instalación temporal en Firefox, puente real con Voceiro, permisos denegados
y revocados, persistencia al reiniciar, dos pestañas guardando a la vez,
sincronización con pestañas cerradas, navegación SPA, retorno a Voceiro,
teclado y lector de pantalla. También probar páginas con CSP estricta,
imágenes diferidas, tablas y embebidos en los tres modos de extracción.
La aprobación de los tests actuales no acredita compatibilidad WebExtension.
