# Nivel II: extracción y resolución revisada

2/11/2026. Primera extracción local; cobertura de identidad **incompleta**.
No activa recogida periódica ni publicación. World Athletics sigue aparte.

Continuación acordada: [comparación automática e issues](atletismo-coincidencias.md).
Con `--nucleo` también se resuelven filas coincidentes con citas ya identificadas,
sin tener que añadir cada fila al registro manual. Los recuentos de este
documento describen la primera extracción, sin ese contraste adicional.

El enlace Nivel II del calendario RFEA sigue apuntando al PDF general 2026,
actualizado el 15/10/2026. Su nombre interno es `Calendario NII.xlsx`, pero
la descarga publicada es PDF: no se ha acreditado acceso a esa hoja original.
La captura completa contiene 15 páginas y 441 filas. Son filas publicadas,
no un recuento de competiciones únicas. Una carece de federación y otra de
tipo; se conservan los vacíos. También se conservan nombres con «Aprazado»
y «SUSPENDIDO», sin darles estado por una interpretación automática.

Fuente: https://atletismorfea.es/calendario y
https://atletismorfea.es/sites/default/files/2025-03/CalendarioNivel_II_general.pdf .

## Identidad y equivalencias

`agenda.atletismo_nivel_ii` separa dos pasos:

1. `leer(texto, paginas_esperadas)` interpreta texto de `pdftotext -layout`.
   Comprueba páginas, temporada, actualización y todas las líneas. Conserva
   federación, fecha, tipo, nombre, instalación, ciudad y página. Un cambio
   incompatible de distribución falla; no se acepta una extracción parcial.
2. `resolver(inventario, revisiones)` solo genera citas para filas con revisión
   explícita. Devuelve también pendientes, revisiones que ya no se aplican y
   `completo`. No equivale a declarar cubierta toda la temporada RFEA.

Una huella identifica el contenido de una fila; **no identifica una cita**.
El registro `atletismo-nivel-ii-revisiones.json` asigna un ID editorial estable
con prefijo `nivel-ii:`, fecha, criterio, evidencias, inicio/fin y estado
revisados. No se presenta como un ID publicado por RFEA. Su espacio está
separado de los IDs numéricos `championship` de las fichas mensuales.

Cada revisión decide `equivalencia` (requiere entrada en el registro común)
o `nueva` (la revisión acredita una cita adicional). No se asignan identidades
desde nombre+fecha ni desde el número de fila. Si cambia fecha, nombre o sede,
la fila queda pendiente hasta revisar su nueva huella y conservar el ID
editorial. Reordenar filas o moverlas de página no altera su identidad.
Dos filas exactamente iguales se mantienen pendientes: no se elige una por
posición. La ausencia no cancela ni retira una cita ya importada.

La equivalencia se aplica al importar, antes de publicar o servir consultas.
La lectura pública recibe una cita con varias procedencias. La comparación
aproximada puede proponer candidatos para revisión; no decide la fusión.
Si ya existen dos identidades distintas en una base, el importador exige
conciliación explícita; añadir una equivalencia no reescribe el historial.

## Primer caso resuelto y límites

XIX campeonato gallego de marcha de invierno, 21/11/2026, Pontevedra:

- PDF Nivel II, página 15: referencia editorial
  `nivel-ii:xunta-galicia-marcha-invierno-2026`.
- FGA: ficha `112621`, contrastada por su ID y por celebración en la ficha.
- Una identidad común y capas RFEA/FGA, con procedencias propias. Se conserva
  tipo `AL` del PDF frente a `Marcha` de la territorial; no se corrige el PDF.
  La fecha de actualización del documento queda en los metadatos.

Las otras **440 filas** no están aprobadas para importación. Entre los casos
que requieren revisar alcance está Vic: la ficha catalana reúne campeonato
de clubes y Cros Ciutat de Vic. Tampoco se ha resuelto el campeonato sub-16
aplazado en julio y anunciado en octubre. No prometer Nivel II completo ni
recogida autónoma con este registro inicial. Las duraciones no se deducen
de la fecha de fila: una competición puede durar varios días.

## Uso local

Poppler (`pdfinfo` y `pdftotext`) se usa solo para la extracción del PDF
descargado. No se añade dependencia Python ni petición por visitante.

```sh
python -m agenda.atletismo_nivel_ii --pdf /tmp/nivel-ii.pdf --salida /tmp/nivel-ii-inventario.json --revisiones agenda/atletismo-nivel-ii-revisiones.json --entrada /tmp/nivel-ii-revisado.json
python calendario.py --db /tmp/nivel-ii.db --entrada-atletismo /tmp/nivel-ii-revisado.json --exportar-nucleo --salida /tmp/nivel-ii-nucleo.json
```

El inventario conserva huellas del PDF y del texto, además de los pendientes.
La entrada importable contiene únicamente citas revisadas: actualmente una.
La captura íntegra de texto está en las muestras; no contiene inscritos.

Verificación local: extracción del PDF real y 21 pruebas de atletismo,
incluidas cobertura de páginas, campos vacíos, formatos desconocidos,
cambios pendientes de revisión, duplicados, estados revisados, identidad
tras reprogramación, una cita con dos procedencias y guardado conjunto de
fuentes equivalentes con discrepancia de sede. Suite completa en CI
antes de dar por validada esta entrega.
