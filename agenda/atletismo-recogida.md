# Recogida de atletismo preparada, sin habilitar publicación

Acuerdos del 2/11/2026: cerrar RFEA, Nivel II, Galicia y Cataluña antes de
World Athletics. Nivel II incorpora pruebas autonómicas de toda España,
incluidos controles; no equivale a integrar todos los calendarios territoriales.
Las filas exclusivas inequívocas reciben un ID interno aleatorio persistido en
el núcleo. El día publicado se muestra con duración y programa sin confirmar.
Las reprogramaciones, duplicados y coincidencias ambiguas quedan para revisión.

## Contrato y ampliación

`agenda.atletismo_recogida` separa los lectores de la importación común.
Cada lector entrega `version`, `fuente`, `eventos` y, cuando procede,
`agrupaciones`. El informe separa consultas, ventana, número de peticiones,
pendientes y completitud. Fuente federativa, modalidad, territorio y pertenencia
a circuito siguen siendo dimensiones distintas.

Una territorial adicional requiere un lector propio, referencia estable,
comprobación de su paginación/ventana y pruebas del contrato; después se añade
a `FUENTES` y `LECTORES`. Las equivalencias se resuelven en el importador común.
WA necesita su propia selección de circuitos y cobertura antes de añadirse;
no se incorpora por aparecer como área en RFEA.

RFEA mensual consulta también meses adyacentes para cerrar los extremos de las
citas seleccionadas. Solo descarga sus fichas, con una pausa entre peticiones;
las conserva en caché 24 horas. Los meses se refrescan siempre. Un 429 falla
sin reintentar ni guardar una importación parcial. Días no consecutivos se
informan pendientes, sin rellenar el intervalo.

FCA verifica el total y todas las páginas. FGA conserva las relaciones que
publica el listado, identifica las agrupaciones enlazadas fuera de ventana y
no importa su anuncio como una jornada adicional. Las agrupaciones externas
se representan como colecciones mientras no se acredite una clase más precisa.
Los títulos que parecen anunciar circuitos sin relación acreditada requieren
revisión; las excepciones tienen evidencia en `atletismo-citas-revisadas.json`.

Nivel II extrae el documento completo y contrasta las filas con el núcleo.
Reconocer el mismo contenido reutiliza el ID persistido; no se deriva del
nombre, la fecha, la fila ni su huella. La primera extracción sin importar
es un borrador: para repetirla hay que conservar el núcleo importado.
Las revisiones explícitas siguen teniendo prioridad. La cobertura anual
continúa incompleta donde existen pendientes; el informe no los oculta.

## Ejecución y persistencia

```sh
python -m agenda.atletismo_recogida --db /tmp/atletismo.db --fuente fga --inicio 2026-11-01 --fin 2026-12-31 --informe /tmp/fga.json
python -m agenda.atletismo_recogida --db /tmp/atletismo.db --fuente fca --inicio 2026-11-01 --fin 2026-12-31 --informe /tmp/fca.json
python -m agenda.atletismo_recogida --db /tmp/atletismo.db --fuente rfea --inicio 2026-11-01 --fin 2026-12-31 --informe /tmp/rfea.json
```

`--turso` sustituye a `--db`. RFEA recoge también el PDF Nivel II; requiere
Poppler. Ventana máxima de 91 días, por defecto hoy y los 60 días siguientes.
El informe completo se guarda atómicamente junto al núcleo en `agenda_estado`,
clave `atletismo-informe-{fuente}`. Un fallo conserva la última lectura buena.
Los pendientes del inventario Nivel II permanecen en este informe; todavía no
se convierten automáticamente en issues. Las incidencias entre referencias
ya importadas sí siguen el mecanismo de issues existente.

El workflow ofrece el input `atletismo`, desactivado por defecto. El cron solo
recogerá atletismo si `CALENDARIO_ATLETISMO_RECOGIDA=true`; esta entrega no
establece esa variable. `operacion=preparar-nucleo`, `atletismo=true` y
`publicar=false` permiten una recogida manual sin publicar. Las fuentes públicas
se controlan por separado mediante `CALENDARIO_FUENTES_PUBLICAS`.

No declarar toda RFEA cubierta por tener sus recogidas operativas: revisar el
informe Nivel II, las citas no consecutivas y el cambio de temporada del PDF.
La ausencia de una cita no la cancela. Una cita conocida trasladada fuera de la
ventana actual puede seguir conservando su lectura previa: queda pendiente una
reconciliación periódica más amplia antes de activar publicación automática.
