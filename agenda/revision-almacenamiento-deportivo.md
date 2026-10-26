# Deportes: persistencia, consulta y calendario desactivado

Revisión del 26/10/2026. La desactivación del cliente está implementada; la
selección de datos y proveedores de este documento es una propuesta de diseño.
No activa recogidas ni cambia los datos guardados o la selección pública.

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

## Qué unir y qué guardar

Propuesta: una sección **Deportes**, con agenda, resultados y consulta externa.
Compartir el núcleo de agenda y sus servicios con cultura. Cada proveedor y
competición mantiene su alcance, actualización y presupuesto; una sección
común no requiere otra base ni un catálogo duplicado.

| Información | Tratamiento propuesto |
| --- | --- |
| Partido o sesión | Turso: ID estable, referencia de proveedor, deporte, competición/edición, horario y precisión, estado, enlace y comprobación. |
| Participantes | Turso: ID y nombre cuando existan, más su participación concreta. Basta para buscar equipos/deportistas; no requiere descargar perfiles. |
| Equipos FEB | Mantener las identidades mínimas que ya vienen en calendario/resultados. No ampliar a clubes, plantillas, entrenadores o trayectorias. |
| Pabellón, pista y localidad | Conservar el literal si ya viene en la respuesta. Aplazar fichas, geocodificación y correspondencias territoriales; no consultar un detalle por partido para rellenarlos. |
| Marcador y ganador | Guardar el último dato coherente, su condición y momento de observación. No anunciar directo por tener un marcador ni dar por final un 0-0 pendiente. |
| Clasificación de liga | Ofrecer una instantánea por ámbito solo si se decide incluir esa función. Recibirla en la misma página ahorra peticiones, pero también necesita política de almacenamiento. |
| Actas, estadísticas, plantillas, telemetría y detalle extenso | Enlace al proveedor inicialmente. Una futura consulta puntual se decide por utilidad y coste; no recolectarlo todo. |
| Consulta externa iniciada por la persona | Respuesta temporal en el navegador o caché del Worker; no crea entidades, resultados ni historial en Turso automáticamente. |
| Operación por colección | Turso: ventana solicitada/completada, última descarga válida, errores, próxima revisión y consumo. Esta parte sigue pendiente. |

En FEB el coste de unas decenas de equipos mínimos es pequeño frente a sus
partidos, documentos y observaciones. El límite útil es evitar el recorrido de
fichas y sedes, no perder los IDs que permiten buscar esos equipos.
La recogida actual usa dos páginas por liga y no recorre esos detalles.

## Consulta desde el navegador

Consultar al pulsar y ofrecer resultados deportivos en tiempo real son funciones
distintas. La primera puede existir sin persistir la respuesta; la segunda
necesita actualizaciones, cuota y una señal de frescura contrastadas.

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

## Antes de reactivar

1. Acordar competiciones iniciales y campos públicos, con un alcance FEB mínimo.
2. Conectar el cliente a fechas, búsqueda y paginación de nuestra API.
3. Registrar cobertura y antigüedad por colección; un vacío sin cobertura no
   demuestra que no haya eventos.
4. Medir lecturas/escrituras y evitar reconstruir todo el estado en cada pasada.
5. Acordar retención deportiva: hoy el informe de 45 días protege los deportes
   y no borra nada. No existe una poda deportiva automática.

Verificación: consultas HTTP y agregados SQL de lectura, sin escrituras en
Turso ni publicaciones. Para el cambio del cliente se comprobaron ausencia de
descargas y activación, búsqueda sin interpretación deportiva, generación,
sintaxis y pruebas existentes de calendario, cabecera y publicación del front.
La suite completa corresponde a CI.
