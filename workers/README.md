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
| `/buscar` (CF y Deno) | 30 consultas por IP y minuto que lleguen a las fuentes; lo servido de caché no cuenta. `limit` entre 1 y 200, también dentro de `raw`; cada fuente se consulta una sola vez. `offset` hasta `MAX_OFFSET` (1000): OFFSET lee las filas que se salta y Turso cobra las leídas. |
| Archivo (Turso) | `TURSO_PAUSADO` lo apaga en el servidor, desde el código: `[vars]` en `cf-buscar/wrangler.toml` y el valor por defecto en `deno-buscar/src/sources/turso.js`. Se reactiva quitando los dos y con `ARCHIVO_ACTIVO` en el front. |
| `/tiempo`, `/avisos` (Deno) | 30 peticiones por IP y minuto. |
| `sync` (CF y Deno) | 120 peticiones por IP y minuto, antes de tocar D1; además, el cupo de altas. |
| Relays de Deno | Con `RELAY_CLAVE` puesta, solo atienden a quien manda `X-Voceiro-Relay` con ella: los workers de búsqueda (`RELAY_CLAVE` en CF y en Deno) y el recolector (secreto de Actions). Sin ella, siguen abiertos. |

El límite por IP cuenta en memoria, en cada instancia por separado: frena a
quien insiste desde una IP, no ataques distribuidos, y la petición frenada
sigue contando en la cuota diaria de la plataforma. Para eso harían falta
reglas delante del worker: las del WAF de voceiro.eu. El front no cambia
de backend por un 429.

### Búsquedas en Turso

El archivo exige texto también al llamar directamente a la API. Navegar solo
por medio, grupo o fecha se resuelve con R2 en el front.

Sin `desde:` ni `hasta:`, el worker consulta los últimos 30 días naturales de
Madrid y responde con `archivo_desde` (el primer día incluido). Al agotar ese
tramo, el front ofrece **Ampliar al histórico**: pide el tramo anterior con
`hasta:` y reinicia su paginación. Las fechas expresas se respetan, aunque sean
anteriores a los 30 días. Google News conserva sus fechas independientes:
sin fechas expresas no añadimos un corte temporal, pero su adaptador recoge
como máximo 60 resultados y no los pagina.

Cada página del archivo hace una sola consulta SQL. Se pide una fila de más
para resolver `next_offset`, sin recuento adicional: `total` es `null` mientras
no se conozca el total. Al llegar al final, se deduce del offset y de las filas
devueltas; una página vacía con offset mayor que cero no permite deducirlo.
El front usa `next_offset`, no `total`, para seguir buscando.

La relevancia usa `ORDER BY rank` con `bm25()` fijado por consulta para que
FTS pueda entregar el orden directamente. La caché identifica la consulta
interpretada: `q`/`raw`, espacios, overrides equivalentes y parámetros ajenos
no generan consultas distintas.

Esto reduce el trabajo, pero **LIMIT y una ventana de fechas no son un tope
de filas leídas**: con FTS, los filtros por fecha o medio aún pueden examinar
coincidencias descartadas. No se ha medido el ahorro en producción: las
lecturas estaban bloqueadas por cuota durante esta revisión (24-10-2026).
Antes de reactivar, comprobar el esquema e índices reales de `noticias` y
`noticias_fts`, sus triggers y los planes con búsquedas comunes y selectivas.
El código de creación de esquema no declara la tabla FTS ni sus triggers;
las pruebas locales no sustituyen esa comprobación.

Para seguimiento sin hacer recuentos sobre las noticias, la API de gestión
documenta [uso mensual por base](https://docs.turso.tech/api-reference/databases/usage)
y [consultas con más filas leídas](https://docs.turso.tech/api-reference/databases/stats).
Requiere autenticación de gestión; el token SQL de una base no la sustituye.
También está documentado `turso db inspect <base> --queries`.
Hay que medir por separado la búsqueda y la cosecha: `medios`, `runs`, sus
índices y el mantenimiento de FTS también gastan cuota. La selección de
nacionales reduce las noticias nuevas, pero no reduce esos diagnósticos.
Turso sigue sin una poda automática de noticias: revisar el crecimiento
antes de decidir una retención; no se ha borrado histórico.

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
