# Workers y respaldo entre plataformas

Cloudflare y Deno mantienen despliegues independientes. El navegador puede
cambiar de backend si uno falla o queda bloqueado. La lógica compartida se
edita en `workers/comun/`:

- `buscar.js`: parámetros, consulta a fuentes, deduplicación, orden y paginación.
- `turso.js`: consulta SQL y protocolo HTTP del archivo.
- `gnews.js`: prensa por el relay de Google News, también desde Deno.
- `datos-cache.js`: caducidad de índices, portadas y slices de R2.
- `limite.js`: límite de peticiones por IP en memoria (IPv6 por su /64).
- `sync.js`: sincronización entre dispositivos. CF la sirve con el binding de
  D1; Deno, con la misma base D1 por la API HTTP de Cloudflare, así que no
  hay dos copias que reconciliar. El cliente prueba CF y, si no responde, Deno.

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
| Sync: almacén | Binding D1. | API HTTP de D1 (`CF_ACCOUNT_ID`, `CF_D1_TOKEN`). |
| Sync: IP de las altas | `CF-Connecting-IP`. | `remoteAddr` de la conexión; la cabecera se ignora. |
| Sync: limpieza diaria | Cron del worker. | No la hace: la base es la misma. |

Los relays de extracción y búsqueda siguen siendo servicios distintos con
sus propias restricciones. Las pruebas HTTP de `tests/workers` verifican los
dos adaptadores, errores parciales, caché, paginación y revalidación sin red real.

## Límites de peticiones

Las URL de los workers son públicas: cualquiera puede llamarlas sin pasar por
el front. Lo que protege las cuotas de detrás:

| Dónde | Límite |
| --- | --- |
| `/buscar` (CF y Deno) | 30 consultas por IP y minuto que lleguen a las fuentes; lo servido de caché no cuenta. `offset` hasta `MAX_OFFSET` (1000): OFFSET lee las filas que se salta y Turso cobra las leídas. |
| Archivo (Turso) | `TURSO_PAUSADO` lo apaga en el servidor, desde el código: `[vars]` en `cf-buscar/wrangler.toml` y el valor por defecto en `deno-buscar/src/sources/turso.js`. Se reactiva quitando los dos y con `ARCHIVO_ACTIVO` en el front. |
| `/tiempo`, `/avisos` (Deno) | 30 peticiones por IP y minuto. |
| `sync` (CF y Deno) | 120 peticiones por IP y minuto, antes de tocar D1; además, el cupo de altas. |
| Relays de Deno | Con `RELAY_CLAVE` puesta, solo atienden a quien manda `X-Voceiro-Relay` con ella: los workers de búsqueda (`RELAY_CLAVE` en CF y en Deno) y el recolector (secreto de Actions). Sin ella, siguen abiertos. |

El límite por IP cuenta en memoria, en cada instancia por separado: frena a
quien insiste desde una IP, no ataques distribuidos, y la petición frenada
sigue contando en la cuota diaria de la plataforma. Para eso harían falta
reglas delante del worker: las del WAF de voceiro.eu. El front no cambia
de backend por un 429.

### Dominio propio y WAF

Los workers de CF responden en `buscar.voceiro.eu`, `datos.voceiro.eu` y
`sync.voceiro.eu` (`routes` con `custom_domain` en cada `wrangler.toml`;
CF crea el DNS y el certificado al desplegar). El front, la sincronización,
el lector y la extensión usan esas URL; Deno sigue de respaldo, fuera del WAF.

En el panel (Security → WAF → Rate limiting rules; el plan Free da una
regla, por IP y con periodo de 10 s):

- Expresión: `http.host in {"buscar.voceiro.eu" "datos.voceiro.eu" "sync.voceiro.eu"}`
- 150 peticiones en 10 s por IP; acción Block durante 10 s.

Holgada a propósito: abrir una capa pide hasta 30 ficheros de `datos`, y
detrás de una IP puede haber mucha gente (CGNAT). Frena ráfagas, no un goteo
lento. No activar Bot Fight Mode: pone un desafío JavaScript que un
`fetch()` del front no puede resolver.

`workers_dev = true` mantiene abiertas las URL `*.workers.dev`, que se
saltan el WAF. Se cierran (`workers_dev = false`) cuando no queden clientes
que las usen: el front y el lector de antes de este cambio, y la extensión
instalada sin actualizar.

La sincronización requiere `SYNC_IP_SECRET` idéntico en ambos servicios.
La migración, la revocación de códigos, la retención y las comprobaciones de
producción se describen en [Seguridad de la sincronización](cf-sync/SEGURIDAD.md).
