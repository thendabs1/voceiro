# Revisión común antes de ampliar las recogidas

25/10/2026. Se continúa sobre el núcleo y sus observaciones actuales. El
[relacionador territorial](../shared/territorios/relacionador.md) se aplica al
proyectar la lectura, también a los datos ya guardados. No requiere migrar SQL
ni repetir una descarga para incorporar una correspondencia revisada.

## Qué debe pasar por el clasificador

Toda incorporación debe conservar primero su referencia y evidencia; después
debe evaluar por separado tema, identidad territorial y relaciones con papel
explícito. Cada paso conserva lo desconocido o conflictivo para revisión.
Un dato sin clasificación sigue siendo importable: no se le asigna una categoría
o un municipio solo para completar el registro.

El clasificador temático y el relacionador tienen catálogos distintos. `teatro`
no identifica un municipio; resolver un municipio no acredita que el evento
sea cultural ni que un medio lo cubra. La revisión común comprueba ambos ejes.

Estado del código:

- Galicia usa el catálogo temático compartido en el piloto y la transición
  conserva sus asignaciones con evidencia en el núcleo.
- Madrid y Kulturklik asignan temas mediante reglas de sus adaptadores,
  guardando el tipo original y la correspondencia usada. Falta trasladar esas
  reglas al catálogo compartido para reclasificar sin volver a importar.
- Las correspondencias territoriales pasan por el relacionador de la
  publicación. Se conservan los IDs propios y los estados con sus motivos.
- Los medios conservan país del catálogo y cobertura separados. La clasificación
  municipal/provincial y la evidencia individual de cobertura siguen pendientes;
  el respaldo regional actual sirve mientras se revisan.

## Qué hemos contrastado

Resultados sobre las muestras de pruebas, **no sobre todo el estado remoto**:

| Fuente | Ubicación | Pendiente |
| --- | --- | --- |
| Galicia | El caso de prueba resuelve INE con control y enlaza evento → recinto → municipio → provincia → autonomía. | Auditar todos los registros guardados y revisar los códigos pendientes/conflictivos que aparezcan. No se añade Galicia por el proveedor. |
| Madrid | Cuatro eventos, tres recintos enlazados a `28079` por identidad exacta `vgnextoid`. | Revisar más recintos con evidencia; los desconocidos quedan pendientes. Barrio y distrito se conservan en las pruebas, sin crear aún niveles nuevos. |
| Kulturklik | Tres eventos, dos referencias municipales conservadas y pendientes. | Acreditar el espacio municipal que publica Kulturklik; sus valores no son intercambiables con los del servicio territorial NORA. |
| Tiempo | Se mantienen los dos códigos sin correspondencia INE y doce municipios sin entrada meteorológica. | Revisar sucesión administrativa y asociaciones de previsión/avisos por separado. |

`correspondencias.json` conserva fuente, URL, huella de la respuesta, ruta, campos
observados y comprobación. Los catálogos oficiales de [salas](https://datos.madrid.es/dataset/208862-7650046-ocio_salas)
y [centros culturales](https://datos.madrid.es/dataset/200304-0-centros-culturales)
declaran para esos recintos la jerarquía `Provincia/Madrid/Municipio/Madrid`.
El cruce revisado con INE `28079` es explícito; no se usa el nombre del recinto,
el código postal, la cercanía de coordenadas ni la administración del proveedor.

En las muestras Kulturklik publica Pamplona `31/476` y Vitoria-Gasteiz `1/46`.
Las consultas oficiales NORA de [Navarra](https://www.geo.euskadi.eus/t17iApiRestWar/rest/v1/municipios?provinciaId=31&withParents=false)
y [Álava](https://www.geo.euskadi.eus/t17iApiRestWar/rest/v1/municipios?provinciaId=01&withParents=false)
devuelven para esas denominaciones `31/201` y `01/059`. El contraste por
denominación documenta la diferencia, **no acredita una equivalencia**.
Se distingue `kulturklik:municipio_nora` de `nora:municipio` y se conserva el
contexto original. No se cambia la referencia del núcleo ya persistida.

## Informe local reproducible

```sh
python -m agenda.revision --entrada /ruta/exportacion-nucleo.json
python -m agenda.revision --entrada /ruta/calendario.json --fuentes madrid,kulturklik
```

Lee una exportación v2 o el calendario que la contiene. Informa eventos por
fuente, presencia/ausencia de temas, ubicación resuelta/parcial/pendiente/en
conflicto y referencias territoriales pendientes con sus pruebas. Un evento
puede tener varios municipios legítimos; eso no implica conflicto por sí solo.
El informe no descarga, publica ni modifica la base. Tener algún tema asignado
no mide su precisión: una categoría amplia como `cultura` cuenta como asignada.
Un evento sin referencia de lugar cuenta como pendiente aunque no haya una
referencia territorial que listar al final.

El siguiente incremento debe unificar las correspondencias temáticas de las
fuentes actuales y permitir revisar/reclasificar lo guardado. Después, extender
los cruces acreditados y organizar ventanas, límites y frecuencias por colección.
La persistencia del núcleo sirve para ello; la lectura SQL permanece preparada
sin activar el cliente. No hace falta sustituir la infraestructura para avanzar.
