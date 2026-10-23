# Workers y respaldo entre plataformas

Cloudflare y Deno mantienen despliegues independientes. El navegador puede
cambiar de backend si uno falla o queda bloqueado. La lógica compartida se
edita en `workers/comun/`:

- `buscar.js`: parámetros, consulta a fuentes, deduplicación, orden y paginación.
- `turso.js`: consulta SQL y protocolo HTTP del archivo.
- `gnews.js`: prensa por el relay de Google News, también desde Deno.
- `datos-cache.js`: caducidad de índices, portadas y slices de R2.

Cada despliegue contiene una copia generada de los módulos que necesita en
`src/comun/`. Esto permite subir el directorio de Deno Deploy completo sin
imports a archivos externos, y evita depender del otro worker en ejecución.

```sh
node scripts/sync-workers.mjs
node scripts/sync-workers.mjs --check
```

CI comprueba las copias versionadas; los workflows de despliegue las regeneran
antes de empaquetar. Los cambios en la fuente común activan ambos despliegues.
El parser sigue usando `scripts/sync-parser.mjs`.

Las diferencias de plataforma se conservan en los adaptadores:

| Aspecto | Cloudflare | Deno |
| --- | --- | --- |
| Configuración | Bindings `env` de cada petición. | `Deno.env`, leído en cada consulta. |
| Caché de búsqueda | `caches.default` y `ctx.waitUntil`. | Caché con nombre y escritura en segundo plano. |
| Lectura de R2 | Binding del bucket. | API S3 con firma SigV4. |
| Compresión | Gestionada por Cloudflare. | Gzip en el worker; conserva HEAD y ETags débiles. |
| Tiempo y avisos | Sin rutas meteorológicas. | AEMET y Open-Meteo/MeteoAlarm como respaldo. |

Los relays de extracción y búsqueda siguen siendo servicios distintos con
sus propias restricciones. Las pruebas HTTP de `tests/workers` verifican los
dos adaptadores, errores parciales, caché, paginación y revalidación sin red real.
