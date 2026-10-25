# Muestras del núcleo deportivo

Archivos de contraste, sin acceso a red en pruebas y sin cobertura completa.

`feb-revisada.json` es una **extracción manual revisada**, no una respuesta
de una API FEB. Conserva los fragmentos retenidos por la investigación del
25/10/2026 y los hechos extraídos de ellos: competición 4, temporada 2026,
fase 89975, partidos 2522807 y 2522809, un marcador con cuatro cuartos y dos
filas de clasificación. No se retuvo una hora exacta de captura: se guarda
solo la fecha, sin convertirla en un instante. El importador registra por
separado cuándo incorpora esta muestra.

Las URLs y los fragmentos literales están en `fragmentos`. La muestra de fases
incluye al final la fase LF Endesa aunque su nombre de archivo procede del
contraste junior. El HTML retenido está recortado; no permite probar un parser
completo. Los IDs de equipos no acreditados en la evidencia elegida son nulos;
las filas de la tabla no se concilian con equipos por nombre.

`espn-wta.json` procede del JSON guardado durante la investigación del
25/10/2026 de
`https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard`.
Conserva los encuentros 186929 y 185604 de la edición 345-2026 y el encuentro
185705 de la edición 232-2026. Se recortan el catálogo de liga, los campos de
torneo y los cuadros para incluir exclusivamente esas citas; los objetos de
los tres encuentros se conservan íntegros, con sus valores originales.
No se retuvo aquí el instante exacto de la descarga: los sellos de observación
de las pruebas son entradas sintéticas explícitas, no una fecha de publicación.

Las referencias y límites de la investigación están en
[FEB](../../../agenda/investigacion/06-feb.md) y
[multideporte](../../../agenda/investigacion/07-multideporte-y-seleccion.md).
Estas muestras permiten verificar estructura, identidad y conservación;
no acreditan reutilización pública, frescura ni disponibilidad de la fuente.
