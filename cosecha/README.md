# Cosecha de titulares

`python recolector.py` coordina la cosecha. Las reglas y operaciones viven
en estos módulos, que también usan las herramientas de diagnóstico:

| Módulo | Responsabilidad |
| --- | --- |
| `config.py` | Límites, rutas, ediciones y dirección del relay. |
| `fuentes.py` | Sesión HTTP, RSS/Atom, sitemap, scraping, WordPress, Google News y selección de alternativas. |
| `texto.py` | Limpieza de titulares, URLs y dominios; hashes. |
| `fechas.py` | Fechas reales, relativas y estimadas; conversión a la hora de Madrid. |
| `catalogo.py` | Catálogo cargado bajo demanda, tablas de medios y ediciones. |
| `historico.py` | Relectura, fusión, deduplicación editorial y `state.json`. |
| `formatos.py` | Formato corto, índices de ventana y archivo e inventario de ficheros. |
| `publicacion.py` | Portadas y slices locales; registro de archivos escritos en el run. |
| `r2.py` | Descarga, subida ordenada y limpieza remota. |
| `turso.py` | Catálogo de medios, pasadas (`runs`) y tablas de estadísticas mediante HTTP v2. |
| `estadisticas.py` | Resúmenes por medio y día de las pasadas y los titulares publicados (sin red). |

La configuración se consulta en `config`, sin copiar valores mutables entre
módulos. Las credenciales de R2 y Turso se leen en sus respectivos adaptadores.
Importar los módulos no inicia la cosecha ni realiza peticiones.

`python estadisticas.py [días]` (workflow `estadisticas.yml`, a diario)
resume los últimos días en las tablas `medio_dia` y `dia_stats` de Turso y
publica en R2 `estadisticas.json` (índice y series de 30 días),
`estadisticas-dia-AAAA-MM-DD.json` (detalle de un día) y
`estadisticas-medio-<dominio>.json` (serie completa de un medio). La
limpieza de huérfanos de R2 no los toca: no siguen los patrones de los
ficheros del recolector.

El inventario y el manifest se suben después de los datos y en ese orden.
Si falla una subida, no se avanza el estado ni se limpia R2. La selección de
fuentes mantiene el acceso directo o mediante relay según el catálogo.

Las pruebas de `tests/fuentes` se ejecutan completas en CI, con respuestas
de red simuladas. Incluyen la generación y relectura entre dos runs.

## Almacenamiento y fechas

R2 conserva los titulares; Turso solo recibe catálogo, diagnóstico de pasadas
y resúmenes estadísticos. No hay escritura ni migración de noticias a Turso.
La agenda tiene su propia base independiente.

`config.py` mantiene 15 días de trabajo para fusión, una ventana pública de
30 días y archivo por medio de hasta 365 días. Hoy y los dos días anteriores
se pueden reescribir; los índices públicos se actualizan después de los datos.

El formato corto de los ficheros diarios es:

| Campo | Contenido |
| --- | --- |
| `d`, `t`, `u`, `f` | Dominio, titular, enlace y fuente. |
| `p` | Fecha declarada: `HH:MM` si corresponde al día del fichero en Madrid; ISO completo si no o si la hora es ambigua por cambio de horario; `AAAA-MM-DD` cuando solo consta el día. |
| `e` | Fecha estimada para noticias sin hora propia; se conserva la primera estimación y se acota al día conocido. |
| `c` | Primera recogida conservada; no se sustituye en cada pasada. |
| `a` | Alternativas, con su dominio, enlace y fechas propios; fuente y titular cuando difieren del representante. |

En memoria, `dia_pub` conserva el día sin hora separado de `fecha_pub`.
Una fecha de día no es medianoche. Se conserva la primera fecha válida salvo
mejora de precisión. La agrupación usa la declarada dentro del margen de seis
horas desde la primera recogida; después, estimada o recogida. Este margen
no demuestra que una fecha sea de publicación y no de celebración.

## Diagnóstico y límites de cobertura

Empezar por los logs y `runs.intentos`: indican alternativas probadas y fuente
elegida. Que una fuente devuelva titulares no acredita frescura ni cobertura
completa. Las alternativas no utilizadas en una pasada tampoco quedan probadas.
Para una comprobación puntual, usar
[salud de fuentes o diagnóstico por URL](../tests/README.md).

Las fechas se toman de cada noticia o tarjeta, nunca de la colección ni de
tarjetas vecinas. Algunas fuentes solo dan día o necesitan estimación; una
periodicidad larga no prueba inactividad. Los bloqueos locales y de Actions
pueden diferir. El [seguimiento pendiente](../PENDIENTES.md#cosecha-y-fechas)
recoge las revisiones aún abiertas, sin repetir barridos del catálogo.
