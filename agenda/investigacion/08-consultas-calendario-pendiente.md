# Consultas remotas del calendario: pendiente de diseño

25/10/2026. Se detiene la implementación por indicación del usuario para
estudiar juntos la arquitectura. No hay worker nuevo, migración ni cambio
en producción. El PR se limita a rendimiento local y Municipio visible.

Continuación: [propuesta de arquitectura de agenda, deportes y territorio](../arquitectura-servicios.md).
Recoge la revisión del código, los códigos territoriales compartidos, la lectura
indexada desde Turso y las consultas puntuales externas. Primera fase sin
marcadores en directo; la interfaz de recintos sigue sin decidir.

## Funcionamiento comprobado

- `front/app/14-calendario.js` descarga `calendario.json` completo desde el
  backend de datos; selección, fechas y vistas se calculan en el navegador.
- `agenda/publicacion.py` publica la lectura desde el núcleo v2. La recogida
  usa una base Turso dedicada (`CALENDARIO_TURSO_URL`), con historial,
  selecciones, relaciones e índices temporales en `agenda/esquema.sql`.
- Las consultas públicas de noticias ya no usan Turso: los workers de
  búsqueda solo consultan Google News; las noticias propias se leen desde
  archivos de R2. `workers/README.md` documenta la retirada de Turso público
  por consumo de lecturas. No confundir esta operación con la recogida,
  que sigue guardando noticias en Turso.
- Hay parser y selección compartidos en `shared/parser.js`,
  `shared/busqueda/texto.js` y `shared/calendario/consulta.js`. Los workers de
  Cloudflare y Deno comparten lógica mediante `scripts/sync-workers.mjs`.

## Medición y arreglo local

Muestra pública descargada el 25/10: 3.724 eventos y unos 9,6 MB de JSON.
En Node, generar el mes tardó 15–17 s; tras alternar cinco vistas, el RSS del
proceso llegó a unos 3,7 GB. La creación repetida de `Intl.DateTimeFormat`,
las conversiones dentro del comparador y la ordenación repetida por día
explican el bloqueo observado. No es una medición de la descarga ni del DOM.

Reutilizar formatos con cachés acotadas, convertir y ordenar antes de agrupar,
y reutilizar el catálogo de filtros dejó el cálculo del mes en unos 75–86 ms
y el RSS del proceso alrededor de 120–150 MB en la misma muestra. El cliente
todavía descarga la lectura completa: este arreglo no resuelve el crecimiento
futuro del volumen. Scripts/muestra de diagnóstico locales en `/tmp`;
no forman parte del repositorio ni garantizan persistencia.

## Decisiones abiertas para la próxima conversación

1. Elegir cómo servir lecturas parciales: consultas SQL desde worker,
   archivos particionados o una combinación. Comparar filas leídas,
   transferencia, latencia y coste con más servicios y usuarios.
2. Si se usa Turso, decidir qué base y qué modelo de lectura se consultan.
   El núcleo histórico no debe reconstruirse completo en cada petición.
   Estudiar índices de fechas, temas, fuentes y objetivos antes de implementar.
3. Definir contratos para agenda paginada, conteos y muestras por día en
   semana/mes, detalles y catálogo de filtros. Acordar si «Ver más» acumula
   páginas o las sustituye y cómo se vuelve atrás.
4. Conservar frases, exclusiones y consultas temáticas del parser, así como
   precisión de fecha/hora, zonas, cambios de hora, fin exclusivo, días
   permitidos, exclusiones y programaciones prolongadas sin duplicar citas.
5. Decidir caché, revisión de publicación, peticiones canceladas y respaldo
   Cloudflare/Deno. La API debería devolver datos acotados y las credenciales
   quedarse en el servidor; estudiar un token de solo lectura.
6. Organizar identidades territoriales entre calendario, tiempo y noticias.
   Los municipios actuales se filtran por su identidad publicada. Galicia
   conserva `ine_cpro_cmun_dc` y Kulturklik `nora`/`provincia_nora` en el
   núcleo, pero la proyección pública no los expone. Las correspondencias y
   la jerarquía municipio → provincia → comunidad requieren verificación;
   no asumir equivalencia NORA/INE ni resolver por nombres solamente.

Referencias técnicas consultadas, sin elección de arquitectura:
[SQL por HTTP de Turso](https://docs.turso.tech/sdk/http/reference),
[tokens de solo lectura](https://docs.turso.tech/cli/db/tokens/create),
[Cache API de Cloudflare](https://developers.cloudflare.com/workers/runtime-apis/cache/).
