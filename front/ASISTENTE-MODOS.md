# Modos y asistente web

El asistente es una guía opcional para crear modos. Su implementación está
en `app/17-asistente-modos.js` y utiliza las reglas compartidas de
`shared/busqueda/reglas.js`.

## Recorrido

- Acceso desde Modos y desde la invitación a empezar del menú de modos.
  Se conserva la creación directa y el editor existente.
- Elegir entre seguir medios o seguir temas. En el segundo caso, elegir
  todas las fuentes o solo determinados grupos y medios.
- Explicar categorías, grupos, inclusiones, silencios y búsquedas con
  ejemplos; explorar los medios dentro de cada grupo y buscar por nombre
  o dominio. Las categorías clasifican medios, no artículos.
- Probar la selección con titulares propios cargados, nombrarla y crearla.
  Todo el recorrido trabaja sobre un borrador; salir lo descarta.
- Reutilizar el mismo motor de coincidencia en la prueba, el feed y la
  vista Temas. Conservar el formato al exportar, importar y sincronizar.
- Ofrecer un acceso a las portadas existentes en Noticias.
- Textos en castellano, gallego, catalán, inglés y euskera; navegación con
  teclado, retroceso del navegador y disposición móvil.

## Regla y compatibilidad

Los campos del modo siguen siendo `grupos`, `palabras` y `overrides`.
Un campo opcional distingue la selección de fuentes cruzada con temas:

```json
{
  "regla": { "v": 1, "fuentes": "elegidas" },
  "grupos": ["Economía"],
  "palabras": ["vivienda", "alquiler -turistico"],
  "overrides": { "otro.es": "include", "silenciado.es": "ignore" }
}
```

`fuentes` es `elegidas` o `todas`. En `elegidas`, los grupos y medios
incluidos se suman para formar las fuentes. En `todas`, se aceptan las
fuentes disponibles. Los silencios se aplican siempre. Si hay temas,
debe coincidir alguno; sin temas, se siguen todos los titulares de esas
fuentes. Un medio incluido o destacado no se salta el filtro de palabras.
Una selección de fuentes vacía nunca se interpreta como todas las fuentes.

Cada línea es un tema; todas las palabras de la línea son necesarias y
las líneas son alternativas. Se conservan frases, exclusiones, siglas
cortas y términos sensibles a mayúsculas del motor compartido existente.
La guía rechaza líneas sin palabras que incluir y prefijos de filtros,
también si otras líneas sí son válidas. Las fuentes se configuran en su
paso, no en las líneas. Si en el editor avanzado o al importar solo hay
temas inválidos, la regla no coincide con nada: no se amplía a todos los
titulares como si se hubieran dejado las palabras vacías.

Un modo sin `regla` conserva el comportamiento anterior: fuentes OR temas.
No se convierten los modos existentes. El editor explica el comportamiento
y permite cambiarlo explícitamente. Duplicar conserva la regla; vaciar
el modo elimina también la regla.

El frontend normaliza `regla` al leer, importar y recibir modos por
sincronización; la fusión compartida ya conserva los campos de cada modo.
Los clientes web antiguos desconocen `regla` y pueden perderla si vuelven
a guardar un modo: hay que recargar las pestañas antiguas antes de editar
las nuevas selecciones. No se modifica el cifrado de sincronización.

Las estadísticas siguen contando titulares de las fuentes del modo, sin
filtrar por sus palabras. En una selección de todas las fuentes, ese ámbito
incluye todas salvo los silencios; no se presenta como un recuento de temas.

## Qué significa la prueba

Solo utiliza los titulares propios que ya están cargados. No consulta
Google News, no descarga capas adicionales y no modifica los filtros ni
el modo activo. La muestra puede proceder de portadas con cupos; un cero
no demuestra ausencia de coincidencias en el archivo. Se indica cuántos
titulares se han probado y se muestran hasta ocho ejemplos.

No se llama «volumen diario estimado» a esa muestra. Para estimar entregas
hará falta una ventana temporal con cobertura conocida. La prueba ignora
la búsqueda activa, los filtros de vista y los titulares leídos u ocultos;
se explica que esos ajustes sí afectarán al feed después de activar el modo.
La guía no borra esos ajustes al crear la selección.

Añadir un dominio configura una preferencia: no da de alta una fuente en
el recolector. La guía lo explica cuando se añade uno fuera del catálogo.

## Ampliaciones del asistente

Los pasos se calculan en `pasosAsistente`, separados de las reglas. Seguir
medios omite el paso de palabras. Los futuros pasos no necesitan cambiar
el predicado que decide si coincide un titular.

### Ubicación, tiempo y avisos

Pendiente de diseño e implementación:

- Elegir una localidad identificada por el catálogo geográfico, no solo
  una cadena de texto. Mostrar municipio, provincia y comunidad para
  distinguir nombres repetidos.
- Ofrecer reutilizarla para el tiempo y los avisos de su zona.
- Elegir aparte si interesa seguir noticias sobre ese lugar y en qué
  fuentes. No convertir automáticamente la localidad del tiempo en un
  tema, ni limitar por ella todos los intereses de la persona.
- Distinguir «medios de Galicia» de «titulares que mencionan Caldas»;
  pertenencia regional del medio y localización de la noticia no equivalen.
- Decidir si la ubicación es una preferencia general, admite varias o es
  distinta para cada modo. El tiempo actual y sus avisos son ajustes
  separados del modo; revisar su persistencia y sincronización antes de
  unirlos en un paso.
- Separar guardar un modo de aplicar ajustes generales: el resumen final
  debe indicar qué se cambiará y cancelar no debe escribir ninguna parte.

### Telegram

Pendiente, sin conexión ni envíos implementados:

- Entrada desde un modo: escoger temas concretos y transferir una regla
  con sus fuentes y silencios, sin noticias ni configuración privada ajena.
- Entrada desde el bot: portada, selección guiada sencilla o editor web.
- Vinculación explícita y revocable. Nunca pedir el código de
  sincronización; el bot no puede leer los modos cifrados del servidor.
- Mantener aparte la selección y la entrega: horario, zona horaria,
  frecuencia, cupo, pausa y enlaces ya enviados.
- Tratar varias líneas con las mismas fuentes y horario como una
  suscripción; concretar límites configurables de suscripciones activas
  a partir de volumen, coste y número de personas.
- Cupo total por persona, deduplicación entre sus selecciones y decisión
  explícita sobre los resultados que no caben. Evitar acumular atrasos.
- Actualización explícita de la selección compartida cuando cambie el modo.
- Filtrar los datos propios antes de aplicar el cupo. Una portada ya
  recortada no puede ser la única base de una alerta temática completa.
- Portadas general y de edición como suscripciones directas con entrega
  limitada; medir demanda antes de añadir más. No prometer importancia
  editorial: hoy se reparten titulares recientes entre medios.

## Verificación

Pruebas de reglas para intersección de fuentes y temas, inclusiones y
silencios, fuentes vacías y sintaxis de palabras. Pruebas de integración
para borradores, validación, creación, restauración JSON, fusión entre
dispositivos y convivencia con modos anteriores en feed y vista Temas.
Se comprueba también el ámbito de estadísticas para todas las fuentes.
La suite completa se ejecuta en CI.
