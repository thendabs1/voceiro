# Calendario común — piloto de datos

Una función de teatro, un partido y una sesión de F1 son citas del mismo
calendario. El primer importador es Cultura de Galicia; el núcleo no conoce
sus campos. Esta fase produce un JSON revisable. El panel de calendario,
las órdenes del buscador y la publicación periódica se diseñarán después
de comprobar los datos. No hay despliegue ni tarea programada nueva.

## Ejecutar

Solo requiere Python 3.11 o posterior (biblioteca estándar):

```sh
python calendario.py --inicio 2026-10-25 --fin 2026-11-23 \
  --idioma gl --salida /tmp/calendario.json

# Siguiente pasada: conservar identidades y primeras observaciones.
python calendario.py --anterior /tmp/calendario.json \
  --idioma gl --idioma es --salida /tmp/calendario.json

# Examinar una o varias páginas ya descargadas, sin red.
python calendario.py --entrada /tmp/pagina-0.json --entrada /tmp/pagina-1.json \
  --salida /tmp/calendario-muestra.json
```

Por defecto se pide desde hoy hasta dentro de 30 días, ambos incluidos. El
adaptador limita cada consulta a 91 días y 20 páginas de 1000 registros por
idioma. No descarga una ficha de detalle por evento. Si cambia el total,
se repiten IDs o faltan páginas, falla sin sustituir la salida anterior.
Una muestra local queda identificada como tal, aunque declare más resultados.

La comprobación real encontró un solapamiento entre páginas de 50 registros:
el ID 156840 aparecía en dos páginas y faltaba el 156877, aunque el total
seguía siendo 185. Una respuesta de 1000 devolvió las 185 identidades distintas.
Se usa ese tamaño para reducir los cortes y se mantiene el rechazo de
solapamientos. No se presupone que la API ofrezca una instantánea transaccional;
si falla con un intervalo grande, hay que reducirlo y revisar la recogida.

El workflow manual **Calendario (piloto)** guarda el JSON como artefacto
durante 14 días. Cada ejecución del workflow parte de cero; para comparar
pasadas con estado se descargan los artefactos y se usa `--anterior` localmente.
No sustituye la cosecha de titulares, ni escribe en R2 o Turso. Aún no hay
retención, restauración automática del estado ni publicación para el navegador.

## Contrato inicial del JSON (versión 1)

| Campo | Significado |
| --- | --- |
| `fuentes` | Identidad de cada flujo de datos, atribución, catálogo y licencia. No se limita a un dominio de periódico. |
| `eventos` | Citas con ID interno, títulos por idioma, celebración, estado, lugar y referencias. |
| `registros` | Registros externos por fuente e ID, datos normalizados y originales, modificación declarada, primera y última recogida. |
| `vinculos` | Correspondencias persistentes entre IDs externos y evento interno, incluidas equivalencias explícitas de traducción. |
| `regiones` | Lugares o territorios identificados con nombres, identificadores externos y posibles padres. |
| `grupos` | Actividades, ciclos, fichas y futuras colecciones o competiciones identificadas por separado. |
| `consultas` | Alcance de la última recogida: intervalo e idioma, o muestra local. No garantiza cubrir todos los eventos de un territorio. |

Cada cita concreta tiene ID propio, aunque comparta ficha con otras funciones.
La relación `celebracion_de` enlaza esa ficha; un ciclo pertenece a `grupos`.
Un futuro gran premio podrá agrupar sus sesiones mediante referencias del
mismo modelo. Las clasificaciones de campeonato tendrán un ámbito propio;
no se fabricará un evento para representar una tabla de temporada.

Los IDs no dependen de título, slug ni horario. Se generan de forma
determinista a partir de una referencia externa y se conservan con
`--anterior`. Las equivalencias declaradas por una fuente permiten añadir
traducciones al mismo evento. Si una equivalencia intenta unir dos eventos
internos ya separados, la pasada falla para revisarlos. No hay conciliación
automática entre proveedores por título, fecha o parecido. Antes de publicar
periódicamente hará falta persistir el estado y diseñar la conciliación
reversible entre fuentes.

`datos_de` identifica el registro elegido para mostrar horario, estado y
lugar: se elige de forma estable por referencia, sin afirmar que sea el más
fiable. Si las traducciones discrepan, `conflictos` señala el campo y ambas
versiones quedan en `registros`. Los títulos por idioma se conservan juntos.
Las listas de regiones, grupos y relaciones admiten pertenencia múltiple.

Las regiones de esta integración proceden del municipio de celebración,
con ID propio de la fuente y el código INE original **CPRO+CMUN+DC**, incluido
su control. No se asigna «Galicia» por el dominio del proveedor. La jerarquía
territorial y la correspondencia entre códigos de diferentes fuentes quedan
pendientes de tablas verificadas. Los grupos de actividad también mantienen
el vocabulario del proveedor: aún no son una clasificación común entre agendas.

`cuando` distingue precisión `dia`, `hora` y `desconocida`. Una hora lleva
desplazamiento UTC y zona; los días no reciben horas inventadas. En Galicia,
inicio y fin iguales se conservan en el original y se omite el fin normalizado
porque no se ha confirmado una duración. Una medianoche declarada conserva
un aviso de precisión pendiente: no se interpreta como actividad de todo el
día. Una hora local ambigua o inexistente por el cambio horario conserva el
original y se marca como desconocida. No se extrapolan repeticiones desde
el texto de una ficha, ni se crean citas diarias para una exposición.
`fin_exclusivo` admite verdadero, falso o desconocido: un futuro adaptador
ICS deberá declarar su fin exclusivo, sin restar un día al dato original.
El JSON gallego no se interpreta con las reglas de ICS.

Las fechas de modificación y recogida no se presentan como publicación.
`dataOrixinal` conserva la celebración anterior cuando la fuente la declara;
los estados cancelado y aplazado necesitan señales explícitas. Un evento
ausente de la siguiente consulta se conserva con su última observación:
la ausencia no prueba cancelación ni vigencia. Para la futura interfaz será
necesario mostrar frescura y definir cuándo revalidar o retirar citas.

## Investigación y siguientes pasos

OpenCode Go (`opencode-go/kimi-k3`) trabajó en dos lotes acotados, escribiendo
progreso en disco antes de entregar el resultado. Se conservan sus informes:

- [Agendas territoriales: Galicia y Kulturklik](investigacion/01-agendas-territoriales.md).
- [Directos: elDiario.es, RTVE y 20minutos](investigacion/02-directos.md).

Son notas de investigación, con límites y dudas expresos. Dos precisiones de
la revisión: inicio=fin no demuestra que la actividad sea instantánea, y
la correspondencia de los códigos de Kulturklik con INE no se aplica sin
validar el conjunto y sus excepciones. La cobertura entre idiomas tampoco
se da por completa. El lote de agendas propuso un vocabulario común, que
queda pendiente de comprobar con una segunda fuente real.

Fuentes primarias del primer importador:
[catálogo y licencia](https://abertos.xunta.gal/catalogo/cultura-ocio-deporte/-/dataset/0045/axenda-cultura-galicia),
[manual del servicio](https://ficheiros-web.xunta.gal/cultura/servizo-web/Manual_Servizo%20Web_Axenda_Cultura.pdf)
y [JSON público](https://www.cultura.gal/v1/axenda/eventos.json?idioma=gl).
La atribución y licencia CC BY-SA 4.0 viajan en el calendario generado.

Próximo contraste: una segunda agenda territorial o de prensa para probar
intervalos y territorio; después sesiones deportivas y resultados con ámbito
de sesión/competición/temporada. Antes del panel habrá que concretar filtros
y la capa de regiones o grupos con el usuario. El piloto no decide esa UI.

Los directos quedan documentados: harían falta seguimiento por cobertura,
identidad y revisiones de cada entrada, paginación, caché compartida y cadencia
propia según estado. El endpoint incremental localizado en elDiario.es no
demuestra acceso a todo el histórico ni permite detectar por sí solo todas
las correcciones. Se investigará antes de actualizar servidores.

## Verificación

`tests/fuentes/test_agenda.py` entra en la suite Python completa del workflow
**Tests**. Cubre funciones múltiples, traducciones, cambios de fecha,
equivalencias conflictivas, ausencias, regiones y grupos múltiples, fechas
sin hora y cambios de horario, paginación y conservación de la última salida
buena ante errores. Todas las peticiones de esas pruebas son simuladas.

Comprobación real del 24/10/2026: el intervalo 25/10–23/11 devolvió 185
registros e identidades distintas y 41 municipios. Una segunda integración
local de esa respuesta conservó las 185 identidades y primeras recogidas.
La muestra del nodo 127829 produjo tres funciones distintas enlazadas a
una misma ficha. No se simularon cambios reales del proveedor entre descargas;
los aplazamientos y cancelaciones se cubren con respuestas simuladas en CI.
