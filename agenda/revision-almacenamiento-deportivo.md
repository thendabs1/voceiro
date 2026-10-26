# Deportes: persistencia, consulta y calendario desactivado

Revisión del 26/10/2026, corregida con el usuario: guardar citas y su organización,
sin ofrecer resultados desde nuestra base. En tenis se empieza solo por torneos.
Este alcance sustituye las propuestas anteriores de resultados diferidos y
clasificaciones periódicas. La desactivación del cliente está implementada;
la separación de los importadores y las consultas externas están pendientes.
No activa recogidas ni cambia los datos guardados o la selección pública.

El [diseño por deporte y proveedor](calendario-deportivo.md) concreta las doce
colecciones iniciales confirmadas, la parte común ESPN y la recogida OCB desde
nuestro servidor. Sustituye el borrador anterior de ese documento; sus módulos
y controles operativos siguen pendientes de implementación.

## Estado real comprobado

Una transacción de lectura en Turso, esquema 4, revisión 10, devuelve:

- Vidmar F1: 128 eventos y una agrupación. No hay participantes ni lugares
  deportivos identificados en esa colección.
- No hay referencias de FEB, ESPN o los demás proveedores deportivos.
- Las tablas de resultados y clasificaciones están vacías.

FEB y tenis tienen adaptadores y muestras locales; eso no implica que sus datos
estén en Turso. La [revisión FEB](feb-alcance.md) documenta 786 partidos y unos
50 equipos entre tres ligas contrastadas en memoria, sin ubicaciones acreditadas.

El JSON público generado el 26/10 a las 05:03 UTC contiene 3.754 eventos,
4.978 entidades y ninguna clasificación: Galicia, Madrid y Kulturklik.
Su cuerpo sin comprimir pesa 12.026.139 bytes. No incluye F1 ni FEB/tenis.
El cliente actual descargaba ese conjunto completo; la
[API de lectura acotada](api-lectura.md) está preparada, pero falta conectarlo.

`CALENDARIO_ACTIVO = false` oculta el botón desde el HTML y bloquea panel,
descarga, órdenes y sugerencias del calendario. La reactivación requiere
conectar la API, comprobar cobertura y coste y validar el cliente; cambiar
solo la constante recuperaría la lectura antigua.

## Alcance acordado: una base de citas

Deportes se integra en la misma agenda consultable que cultura y otras citas,
con su filtro temático y sus competiciones. Se comparte núcleo y API; no hace
falta otra base deportiva. El valor propio es buscar y combinar citas, fechas
y preferencias. Ofrecer marcadores desde nuestra base exigiría otra operación
y otra frescura que no asumimos en esta fase.

| Información | Tratamiento propuesto |
| --- | --- |
| Cita | Turso: ID estable, referencia y enlace del proveedor, nombre, deporte, fechas/horas con su precisión y momento de comprobación. Una fecha pendiente no se completa por suposición. |
| Organización | Turso: competición, edición/temporada y pertenencias acreditadas; fase, jornada o tipo de sesión cuando permitan organizar las citas. No inferir una temporada del año de la fecha. |
| Participantes de una cita | ID y nombre cuando vengan con el calendario y sean útiles para buscar, como los dos equipos de un partido. No recorrer inscritos, perfiles ni plantillas; no exigir participantes para importar una cita. |
| Equipos FEB | Mantener las identidades mínimas del calendario y sus participaciones local/visitante. No ampliar a clubes, plantillas, entrenadores o trayectorias. |
| Pabellón, pista y localidad | Conservar el literal si ya viene en la respuesta. Aplazar fichas, geocodificación y correspondencias territoriales; no consultar un detalle por partido para rellenarlos. |
| Cambios de agenda | Guardar nueva fecha/hora, aplazamiento o cancelación cuando la fuente los declare. No deducir cancelación por desaparición, ni final deportivo porque haya pasado la hora. |
| Marcador, ganador, parciales, estado en curso/final y clasificación | Fuera de la recogida y publicación propias en esta fase. Que vengan en la respuesta no obliga a guardarlos ni a generar observaciones por sus cambios. |
| Actas, estadísticas, plantillas, telemetría y detalle extenso | Enlace al proveedor inicialmente. No recolectarlo todo. |
| Consulta externa iniciada por la persona | Función opcional posterior, por proveedor: respuesta temporal en el navegador o caché del Worker; no crea entidades, resultados ni historial en Turso automáticamente. |
| Operación por colección | Turso: ventana solicitada/completada, última descarga válida, errores, próxima revisión y consumo. Esta parte sigue pendiente. |

En FEB el coste de unas decenas de equipos mínimos es pequeño frente a sus
partidos, documentos y observaciones. El límite útil es evitar el recorrido de
fichas y sedes, no perder los IDs que permiten buscar esos equipos.
La recogida actual usa dos páginas por liga y no recorre esos detalles.

## Qué constituye una cita según el deporte

| Ámbito | Alcance de agenda |
| --- | --- |
| Fútbol y baloncesto, incluida FEB | Partidos anunciados, equipos conocidos, competición/temporada y fecha/hora disponible. No fabricar cruces de eliminatorias ni horarios pendientes. |
| Tenis ATP/WTA | Solo torneos: edición e intervalo de celebración cuando esté acreditado. Sin recoger partidos, cuadros ni listas de jugadores en esta fase. |
| F1/MotoGP | Cita principal de gran premio de varios días, con sesiones dentro. Mantener la agrupación para identidad/temporada y las citas de sesión con horario publicado, sin tarjetas duplicadas. No exigir pilotos, escuderías, ganador ni clasificación. |
| Rallies | Rally como cita de varios días, vinculado al campeonato/temporada. Sin bajar a tramos ni clasificación. |

Estas son reglas de selección, no cobertura ya implementada de todas las
competiciones. Cada colección debe acreditar que su proveedor permite obtener
el calendario con un coste asumible. Si para construir unas pocas citas hay
que reconstruir partidos, resultados o detalles continuamente, se reduce el
alcance o se deja el enlace oficial.

Una temporada organiza citas; no es una cita diaria repetida. Las agrupaciones
de torneo o gran premio tampoco deben duplicar sus citas en una misma vista.
En tenis hay que preparar la cita de torneo a partir de sus fechas acreditadas:
el importador actual crea ediciones/cuadros y partidos, y no basta con ocultar
los encuentros para disponer de ese calendario.

## Mantenimiento y separación pendiente

La agenda también necesita revisar cambios de horario y cancelaciones. Su
cadencia se decide por colección, horizonte y estabilidad del calendario,
tras medir peticiones y cobertura; no por cada cambio de marcador. Una fuente
con calendario de temporada permite una carga inicial y revalidaciones, pero
no se presume esa capacidad para todos los proveedores. No se fija todavía
una frecuencia común ni se amplía a todas las ligas de cada deporte.

Los importadores actuales de FEB y tenis normalizan resultados cuando los
reciben; FEB también crea clasificaciones. Antes de programar deportes hay que
separar la extracción de agenda de esos datos, sin borrar tablas ni reescribir
las muestras que acreditan las capacidades existentes. La evidencia guardada
para la agenda debe acotarse a sus campos y contexto: conservar el scoreboard
entero e historizar cada marcador mantendría el coste que queremos evitar.

La prueba de esa separación deberá comprobar que un cambio exclusivo de
marcador no modifica el contenido de agenda ni crea historial deportivo,
mientras que un cambio de horario conserva la identidad y actualiza la cita.
No se ha implementado ese cambio en esta revisión.

## Consulta desde el navegador

Las consultas de agenda van a nuestra API sobre Turso, sin llamar al proveedor
por cada búsqueda. Una futura acción para consultar resultados llama al
proveedor solo cuando se solicita, sin persistir la respuesta en Turso.
La tarjeta de agenda sigue disponible aunque esa consulta falle.

Consultar al pulsar y ofrecer resultados deportivos en tiempo real son funciones
distintas. La segunda no forma parte de este alcance. Una cuota alta o CORS
abierto no obligan a integrar resultados; primero debe justificarlo su utilidad.
Cada consulta externa debe indicar fuente y momento, y limitar peticiones.

Se enviaron GET con `Origin: https://voceiro.eu`, sin credenciales deportivas:

| Fuente/rutas | Resultado y consecuencia |
| --- | --- |
| ESPN ATP, NBA y F1, scoreboards | HTTP 200, JSON y `Access-Control-Allow-Origin: *`. Candidatos técnicos a consulta directa al pulsar; no se ha probado toda ESPN ni una integración completa en navegador. |
| FEB, calendario LF Endesa | HTTP 200, HTML, sin cabecera CORS. No permite leer esa respuesta con el `fetch` ordinario de Voceiro; mantener recogida compartida o enlace oficial. |
| SportsEvents24, una fila de baloncesto español | HTTP 200, JSON, sin CORS y `no-store`. Enlace o adaptador de servidor si se concreta su uso; no es una fuente directa del front. |
| MotoGP, detalle del GP de Malasia | HTTP 403 sin CORS en esta petición con origen Voceiro. El acceso directo queda sin acreditar; el contraste anterior sin ese origen no basta. |

La [documentación de OCBlacktop](https://ocblacktop.com/api) establece llamadas
desde servidor para Free y acceso CORS en planes de pago. Mantener la clave
en el servidor; una consulta puntual puede pasar por un Worker con caché y
presupuesto, sin guardarse en Turso. Free no incluye conexiones de directo.

[SportsAPI365](https://sportsapi365.com/docs/direct/tennis/guides/api-access)
requiere clave. El presupuesto local anotado es 150 peticiones/mes: mantenerlo
como reserva acotada, sin distribuir la credencial ni sondear por visitante.
No se consumió cuota de estas dos cuentas en esta revisión.

La ausencia de CORS no impide abrir la web oficial en otra pestaña. Un Worker
resuelve el acceso técnico desde el cliente, pero no concede capacidades,
derechos ni presupuesto adicionales del proveedor. ESPN sigue con condiciones
de uso pendientes según las investigaciones existentes.

Para leer una API de otro origen desde JavaScript, la respuesta debe autorizar
nuestro origen mediante [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS).
No necesitar una clave no elimina ese requisito; `no-cors` no permite leer el
JSON. Si requiere una clave privada, se mantiene en el servidor aunque permita
CORS. Las opciones son consulta directa viable, Worker acotado o enlace; ninguna
exige guardar el resultado en Turso.

## Antes de reactivar

1. Acordar competiciones iniciales y comprobar sus calendarios; tenis solo por torneos.
2. Separar la importación de agenda de resultados y clasificaciones, y acotar su evidencia.
3. Conectar el cliente a fechas, búsqueda y paginación de nuestra API común con cultura.
4. Registrar cobertura y antigüedad por colección; un vacío sin cobertura no
   demuestra que no haya eventos.
5. Medir lecturas/escrituras y evitar reconstruir todo el estado en cada pasada.
6. Acordar retención deportiva: hoy el informe de 45 días protege los deportes
   y no borra nada. No existe una poda deportiva automática.

Integrar resultados externos es una decisión posterior e independiente de
reactivar la agenda. No es un requisito de esa reactivación.

Verificación: consultas HTTP y agregados SQL de lectura, sin escrituras en
Turso ni publicaciones. Para el cambio del cliente se comprobaron ausencia de
descargas y activación, búsqueda sin interpretación deportiva, generación,
sintaxis y pruebas existentes de calendario, cabecera y publicación del front.
La suite completa corresponde a CI.

La corrección de alcance posterior revisó importadores y documentación, sin
peticiones nuevas a proveedores ni escrituras en Turso. Solo cambia el diseño;
se comprobó el diff y la coherencia de las referencias locales.
