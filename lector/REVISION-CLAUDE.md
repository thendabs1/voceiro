# Segunda revisión del lector con Claude

24 de octubre de 2026. Revisión conjunta de los PR
[#107](https://github.com/thendabs1/voceiro/pull/107) y
[#108](https://github.com/thendabs1/voceiro/pull/108).

Claude Code revisó las fuentes y el diff combinado, en modo de solo lectura,
sin ejecutar comandos, pruebas ni otros agentes. Este documento resume sus
hallazgos y su contraste posterior; no es una aprobación de Firefox real.

## Hallazgos y resolución

| Prioridad de Claude | Problema | Resultado del contraste |
| --- | --- | --- |
| P1 | La primera inyección espera un mensaje de inicio que está bloqueado detrás de la propia inyección. | Reproducido y corregido: la lectura inicial se atiende fuera de la cola de escrituras. La prueba simula la promesa de inicialización del contenido. |
| P1 | Habilitar un medio nuevo consulta un catálogo ausente del fondo. | Reproducido y corregido: el fondo incluye el catálogo real. La prueba cubre tanto un medio conocido como uno propio y su idioma. |
| P2 | Una sincronización lenta detiene el guardado y otras acciones de todas las pestañas. | Reproducido y corregido: las peticiones manuales y las alarmas no ocupan la cola. La aplicación del resultado sigue usando el estado actual y la fusión común; se mantiene la exclusión de sincronizaciones simultáneas. |
| P2 | El fondo vuelve a fechar los ajustes adoptados de Voceiro como si fueran ediciones nuevas. | Reproducido y corregido: conserva las fechas ya selladas por el contenido. |
| P2 | Los avisos de sincronización repintan las opciones y borran campos o el foco. | Reproducido y corregido: se omiten avisos idénticos y se aplaza el repintado externo mientras hay un control enfocado. |
| P2 | Cambiar el hash o quitar parámetros de seguimiento cierra el lector manual. | Reproducido y corregido en el PR base: se compara la URL normalizada. Cambiar una consulta que identifica otra noticia sigue cerrando el artículo anterior. |
| P3 | Tras volver con Atrás desde la caché deja de detectarse la navegación. | Reproducido y corregido en el PR base: no se cancela el intervalo cuando la página se conserva. |
| P3 | Volver a Voceiro no puede identificar su pestaña sin permiso de acceso. | Comportamiento explicado en el manual de la extensión. Conectar con Voceiro concede ese acceso; sin él se navega la pestaña actual. No se amplían los permisos obligatorios. |
| P3 | El código guardado en `storage.local` también es accesible a los contextos aislados de la extensión. | Se precisa esta limitación en los comentarios y documentación. No es accesible a los scripts de las webs ni se incluye en las respuestas de inicio. Separarlo en un almacén exclusivo del fondo queda fuera de estas correcciones mínimas. |

La espera de la promesa de la inyección está documentada en
[`scripting.executeScript`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/scripting/executeScript).
El acceso de los contextos de extensión al almacenamiento se describe en
[`storage.local`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/local).

La revisión local adicional reprodujo y corrigió tres fallos del adaptador:
volver al ajuste general no retiraba la excepción de imágenes del medio;
los avisos de lectura confirmados no se eliminaban; una respuesta atrasada
del fondo podía sustituir una edición local más reciente. Las pruebas
cubren también la conservación de cambios independientes de otras pestañas.

## Verificación y pendientes

Las pruebas nuevas se ejecutaron antes de las correcciones y reprodujeron
los fallos. Después pasan las pruebas dirigidas del lector y la fusión
compartida. La suite completa, construcción de ambas variantes y validación
de Firefox se ejecutan en CI.

Siguen pendientes la instalación y el uso en Firefox real, especialmente
la primera apertura, el permiso concedido o retirado y el foco con teclado.
Claude señaló como hipótesis que el popup pueda cerrarse al pedir permiso:
no se ha reproducido y debe comprobarse en el navegador antes de publicar.

La documentación oficial sitúa el consentimiento integrado de datos en
Firefox de escritorio 140 y Android 142, coincidiendo con el manifiesto:
[consentimiento de datos](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).
La construcción y los tests no sustituyen esa comprobación de uso.
