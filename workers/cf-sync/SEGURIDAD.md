# Sincronización: seguridad y despliegue

La sincronización es opcional. El cliente cifra con AES-GCM antes de enviar;
identificador, token y clave se derivan separadamente del código con HKDF.
El servidor recibe el token de acceso, nunca el código ni la clave de cifrado.
D1 guarda el bloque, la huella del token, versión y fechas técnicas.

## Cambios y retención

- Las altas usan HMAC-SHA-256 con una clave aleatoria de 32 bytes, día UTC e
  IP normalizada. CF y Deno deben tener exactamente la misma clave. Cambiar
  el día cambia la huella; conservar la clave permite comprobar IP candidatas,
  por lo que hablamos de seudonimización, no de anonimización irreversible.
- `altas` solo guarda huella, día y contador. `sync_crear` es una vista vacía:
  no persiste la relación entre huella IP y código. Su trigger comprueba los
  cupos y crea el bloque e incrementa contadores en una sola sentencia. Un
  fallo revierte toda la operación. Ambos adaptadores usan esa misma entrada.
- `estado.filas_v2` se mantiene por triggers, incluidos borrados por limpieza.
  El contador antiguo `filas` queda reservado a los servidores anteriores
  durante la transición; no interviene en los límites nuevos.
- El borrado explícito conserva indefinidamente solo `id` y `token_hash` en
  `revocados`. La marca y el borrado del bloque se confirman juntos. No se
  admiten marcas para códigos inexistentes ni tokens incorrectos. Un código
  revocado devuelve 410 y no puede reutilizarse, tampoco desde clientes
  antiguos. Los clientes actualizados paran la sincronización y conservan
  sus datos locales. Para volver a sincronizar hay que generar otro código.
- La caducidad por inactividad elimina bloques en la limpieza diaria tras
  365 días sin uso; no crea una marca de revocación. La limpieza conserva
  los contadores del día UTC actual y los dos anteriores; los más antiguos
  desaparecen en la siguiente ejecución, no a las 48 horas exactas.
- Borrar una fila no elimina el historial de recuperación de D1: Time Travel
  conserva 7 días en Free y 30 en Paid. Restaurar un punto anterior a un borrado
  también puede restaurar el bloque o perder su revocación; antes de reabrir
  el servicio tras una restauración hay que reconciliar las revocaciones.
- Se cancela una subida cuando supera 512 KiB aunque no indique Content-Length.
  La librería del QR se sirve localmente, con su licencia y versión fijada.

## Antes de fusionar y desplegar

Este PR no configura secretos ni migra producción automáticamente. Preparar
ambas cosas antes de fusionar, ya que main activa los despliegues de los workers:

1. Generar una clave aleatoria de 32 bytes y codificarla con 64 caracteres
   hexadecimales. Guardarla como secreto `SYNC_IP_SECRET` en **ambas** plataformas
   (Cloudflare Workers y Deno Deploy, contexto de producción). No guardarla en
   D1, el repositorio, variables públicas ni registros. No usar el token de D1.
2. Conservar una referencia de recuperación de D1 y aplicar la migración desde
   `workers/cf-sync`: `wrangler d1 migrations apply voceiro-sync --remote`.
   En una base nueva aplicar primero `schema.sql`. La migración añade tablas,
   vista y triggers; no borra bloques existentes. Es compatible con los
   adaptadores anteriores y mantiene su contador separado. No retirar los
   triggers de revocación al revertir una versión del worker.
3. Desplegar ambos workers con la misma versión y secreto. La transición de
   SHA-256 a HMAC reinicia el cupo por IP; mientras convivan las versiones no
   existe un cupo único entre ambas. Hacer el cambio coordinado en una ventana
   de mantenimiento si se necesita mantener esa garantía durante la transición.
4. Publicar el frontend y el lector actualizados con sus workflows habituales.
   La revocación del servidor protege también frente a los clientes anteriores;
   estos mostrarán un error genérico hasta actualizarse.
5. Verificar con códigos de prueba altas y límite compartido, lectura en ambos
   servicios, borrado desde uno y 410 desde el otro, y la limpieza programada.
   Sin secreto válido o IP válida se rechazan las altas con 503; las lecturas,
   actualizaciones y borrados de códigos existentes siguen funcionando.

## Comprobaciones de configuración pendientes

La revisión y los tests locales no certifican la configuración de producción:

- Comprobar que `remoteAddr.hostname` en Deno Deploy identifica al cliente real
  y no a un proxy de entrada. Usar dos redes y un diagnóstico temporal privado,
  sin persistir las IP. No sustituirlo por una cabecera enviada por el cliente.
  Si falta una IP válida, las altas se cierran en lugar de compartir «sin-ip».
- Revisar que `CF_D1_TOKEN` tenga solo los permisos de D1 necesarios y el menor
  ámbito que permita Cloudflare; no suponer que está limitado a esta base por
  el nombre de la variable. Revisar quién puede leer los secretos.
- Revisar los registros de acceso/errores, su retención y destinatarios en ambos
  proveedores. Ambos reciben las conexiones; no se afirma que no registren IP.
- Comprobar el cron de CF y alertar si deja de limpiar. Deno usa la misma base
  y no ejecuta una segunda limpieza.
- El cupo limita altas, no todo el tráfico HTTP ni ataques distribuidos. Una
  red compartida puede agotar el cupo; cambiar de IP (también IPv6) permite
  obtener otro. Valorar límites de tráfico de plataforma según uso real.

Referencias:
- https://www.aepd.es/documento/estudio-hash-anonimidad.pdf
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/d1/reference/time-travel/
