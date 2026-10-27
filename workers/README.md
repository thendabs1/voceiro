# Workers y respaldo entre plataformas

Cloudflare y Deno mantienen despliegues independientes. El navegador puede
cambiar de backend si uno falla o queda bloqueado. La lógica compartida se
edita en `workers/comun/`:

- `buscar.js`: parámetros, consulta a fuentes, deduplicación, orden y caché.
- `gnews.js`: prensa por el relay de Google News, también desde Deno.
- `datos-cache.js`: caducidad de índices, portadas y slices de R2.
- `calendario.js` y `calendario-turso.js`: API de agenda sobre la proyección
  pública de Turso. Activación, contrato y mediciones en
  [Agenda: lectura pública](../agenda/README.md#lectura-pública).
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
Las dependencias `shared/` de datos se sincronizan con ese mismo script. Las
copias del parser de búsqueda se generan con `scripts/sync-parser.mjs`.

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

## Tiempo y avisos

`deno-buscar/src/tiempo/` sirve `/tiempo`, `/tiempo/lugares` y `/avisos`.
España usa AEMET con `AEMET_API_KEY` en el servidor; Open-Meteo sirve el
resto y respalda las previsiones. Los avisos españoles usan CAP de AEMET,
con MeteoAlarm como respaldo; el cliente indica la fuente y la limitación
de cobertura cuando cambia. Sin datos no se afirma «sin avisos».

La Cache API conserva previsiones AEMET 60 minutos, Open-Meteo 30 minutos,
geocodificación siete días y avisos diez minutos. La descarga de AEMET va
en dos pasos: hay que comprobar también el contenido de la segunda respuesta.
`index.js` gestiona la codificación y `avisos.js` extrae los CAP del archivo tar.

El cliente carga municipios bajo demanda. Para regenerar sus sugerencias y
la tabla del worker se usa `node scripts/generar-municipios.mjs`, que consulta
AEMET y necesita su clave (del entorno o del `.env` local). Aplica las
excepciones de `scripts/municipios-aemet-revisados.json`; su
[evidencia](../shared/territorios/revision-aemet-2026-10-25.md) sigue siendo
necesaria para no reintroducir códigos antiguos o productos sin previsión vigente.

El panel vive en `front/app/14-tiempo.js`. `eltiempo:` y `tiempo:` abren
Mis sitios o una localidad; `alertas:` abre los avisos. Mis sitios guarda
hasta cinco lugares en el dispositivo. El sol puede destacar naranja o
rojo de sus zonas. Estos ajustes se habilitan con «Tiempo y avisos» y
son independientes de los modos de noticias.

## Límites de peticiones

Las URL de los workers son públicas: cualquiera puede llamarlas sin pasar por
el front. Lo que protege las cuotas de detrás:

| Dónde | Límite |
| --- | --- |
| `/buscar` (CF y Deno) | 30 consultas por IP y minuto que lleguen a las fuentes; lo servido de caché no cuenta. Cada fuente se consulta una sola vez; sin `fuentes` no se consulta ninguna. |
| `/tiempo`, `/avisos` (Deno) | 30 peticiones por IP y minuto. |
| `sync` (CF y Deno) | 120 peticiones por IP y minuto, antes de tocar D1; además, el cupo de altas. |
| Relays de Deno | Con `RELAY_CLAVE` puesta, solo atienden a quien manda `X-Voceiro-Relay` con ella: los workers de búsqueda (`RELAY_CLAVE` en CF y en Deno) y el recolector (secreto de Actions). Sin ella, siguen abiertos. |

El límite por IP cuenta en memoria, en cada instancia por separado: frena a
quien insiste desde una IP, no ataques distribuidos, y la petición frenada
sigue contando en la cuota diaria de la plataforma. Para eso harían falta
reglas delante del worker: las del WAF de voceiro.eu. El front no cambia
de backend por un 429.

### Búsqueda sin Turso

`/buscar` solo consulta Google News (`fuentes=gnews`) por el relay de Deno.
Da una página de hasta 60 resultados: `limit` y `offset` se aceptan y no
cambian nada; `next_offset` es siempre `null`. `fuentes=turso`, de clientes
antiguos, se ignora y devuelve una respuesta vacía sin consultar nada.

Lo reciente se busca en el navegador sobre los ficheros de R2: los días del
manifest (hasta 30), con «Cargar más». La búsqueda pública de noticias no consulta
Turso: el coste
de una búsqueda de texto con FTS crece con las coincidencias en todo el
archivo, no con la página pedida, y la cuota de lecturas es una sola para
todos.

La caché identifica la consulta interpretada: `q`/`raw`, espacios, overrides
equivalentes y parámetros ajenos no generan consultas distintas.

Turso recibe el catálogo y el diagnóstico de las pasadas (`cosecha/turso.py`)
y los resúmenes de estadísticas; las noticias se almacenan en R2.
Para seguir el consumo, la API de gestión documenta
[uso mensual por base](https://docs.turso.tech/api-reference/databases/usage)
y [consultas con más filas leídas](https://docs.turso.tech/api-reference/databases/stats);
requiere autenticación de gestión, el token SQL de una base no la sustituye.
También está documentado `turso db inspect <base> --queries`.

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
