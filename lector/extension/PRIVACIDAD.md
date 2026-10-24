# Política de privacidad de Lector Universal

Última actualización: 24 de octubre de 2026.

Lector Universal es un complemento del proyecto [Voceiro](https://github.com/thendabs1/voceiro/). Para consultas sobre su funcionamiento o estos datos, usa [las incidencias del proyecto](https://github.com/thendabs1/voceiro/issues).

## Datos que permanecen en Firefox

La extensión lee el contenido de la noticia que eliges para crear la vista de lectura. Guarda en el almacenamiento local de la extensión tus preferencias, reglas por medio, diccionarios y servicios configurados, artículos pendientes y direcciones de noticias marcadas como leídas. No analiza ni almacena por su cuenta un historial completo de navegación. La extensión no funciona en ventanas privadas.

Estos datos no se envían a Voceiro mientras la sincronización está desactivada. La extensión no incorpora publicidad, analítica ni rastreadores.

## Sincronización opcional

Si activas la sincronización en Opciones, aceptas el permiso de datos de Firefox y vinculas un código, la extensión sincroniza los artículos pendientes (dirección, título, descripción y otros metadatos guardados), las direcciones marcadas como leídas, las preferencias y las reglas del lector. No sincroniza el texto íntegro de las noticias extraídas para leerlas.

Antes de enviar el documento, la extensión lo cifra en tu navegador con AES-GCM. A partir del código se derivan por separado un identificador, un token de acceso y la clave de cifrado. El código y la clave no se envían; los servidores reciben el identificador, el token y el bloque cifrado. La transmisión utiliza HTTPS y se dirige a `sync.voceiro.eu` o, como respaldo, a `voceiro-sync.thendabs1.deno.net`. Ambos utilizan la misma base de datos de Voceiro. Sus operadores de infraestructura pueden recibir datos técnicos de la conexión, como la dirección IP, conforme a sus propias prácticas.

El servicio usa una huella diaria de la IP para limitar la creación de códigos. Guarda esa huella, el día y un contador; elimina los contadores antiguos durante la limpieza diaria, conservando el día actual y los dos anteriores. Los bloques cifrados se eliminan tras 365 días sin uso. El borrado remoto desde Voceiro elimina el bloque y conserva una marca de revocación con el identificador y la huella del token para impedir que se reutilice el código. Las copias de recuperación de la base de datos pueden conservar datos borrados durante un plazo adicional de hasta 30 días, según el plan del proveedor.

Puedes retirar el permiso de sincronización en Opciones. Desvincular el código en la extensión borra su copia local, pero no borra por sí solo el bloque remoto: para eliminarlo del servidor utiliza **Borrar datos del servidor** en los ajustes de sincronización de Voceiro. Al desinstalar el complemento, Firefox elimina su almacenamiento local.

## Sitios que abres voluntariamente

Si usas un diccionario, se abre la web elegida con la palabra consultada en su dirección. Si configuras **Abrir en…** y usas uno de esos servicios, se abre con la dirección de la noticia. Las funciones de compartir y enviar por correo usan las herramientas de Firefox o de tu dispositivo. Esos servicios externos aplican sus propias políticas de privacidad.
