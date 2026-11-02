# Contrato propuesto: World Athletics

Diseño de 2 de noviembre de 2026; sin adaptador activado.
Alcance confirmado en [diseño común](atletismo-diseno.md).
Fuente: https://worldathletics.org/competition/calendar-results .

Revisión posterior a la recogida federativa:
[base validada y requisitos previos a WA](atletismo-preparacion-wa.md).
Se han contrastado el filtro `competitionGroupId`, dos páginas y un circuito
completo. Esto actualiza las comprobaciones iniciales de este documento;
todavía no hay adaptador WA ni cobertura de todos los circuitos seleccionados.

## Selección de interés

Todos los niveles de Diamond League (meetings y final), Continental Tour,
Indoor Tour, Label Road Races, Combined Events Tour, Race Walking Tour y
Cross Country Tour; campeonatos mundiales y continentales, incluidos sub-20,
sub-23 y otras categorías inferiores publicadas. Incluir Juegos Olímpicos
y de la Juventud en su componente de atletismo. La tabla exacta de grupos
seleccionados debe quedar versionada y respaldada por las opciones de WA.

No importar todo el calendario mundial. Los campeonatos nacionales de cada
país y los meetings con permiso continental genérico no se incorporan por
el mero permiso: verificar si pertenecen al circuito seleccionado. La categoría
de puntuación WA no equivale al circuito ni a la edad. Los grupos históricos
extintos no se activan solo por seguir en las opciones.

Hay que revisar explícitamente la cobertura de montaña/trail y FISU/juegos
regionales antes de incluirlos en esta selección: estar publicados no demuestra
que formen parte de los circuitos acordados. Excluir ventanas administrativas
como National Championships Window; no son un campeonato con sede concreta.

## Extracción y modelo

La página contiene JSON Next en `props.pageProps.initialEvents`. Comprobados:
filtros `startDate`, `endDate`, páginas de 100 y `offset=100`. Faltan pruebas
del filtro por cada grupo seleccionado y lectura completa de una ventana.
No depender del identificador de compilación de Next ni copiar claves de red.

Identidad candidata: proveedor `world-athletics`, tipo `competition`, ID
numérico `results[].id`. Guardar `iaafId` cuando exista como referencia
adicional, sin asumir equivalencia. No incorporar fecha, nombre o sede al ID.
Comprobar persistencia del ID entre ventanas y cambios antes de fijar contrato.

Una competición/meeting es un evento. Circuito y edición anual son agrupaciones
distintas; relacionar el evento con todos los grupos acreditados. La pertenencia
múltiple debe llegar a la lectura sin duplicar el evento. El `padre` único del
constructor deportivo no basta por sí solo para todas estas relaciones.
La revisión confirma que `agenda/publicacion.py` recorre varios padres y la
lectura indexa todos sus códigos. El adaptador deberá emitir las relaciones
múltiples y comprobarlas de extremo a extremo, sin duplicar el meeting.

Campos útiles: nombre, ID, inicio/fin, sede literal, área geográfica, disciplinas,
grupo/subgrupo, categoría WA y URL original. Conservar fecha indeterminada y
sede TBC como tales. No confundir área geográfica con federación ni inferir
un municipio/recinto desde la cadena de sede. Inicio/fin con precisión día
se conservan sin convertirlos a instantes UTC.

`hasResults`, `hasApiResults` y `hasStartlist` se pueden conservar como señales
del proveedor; no son resultados ni garantía de programa. Una competición
pasada no se marca finalizada solo por la fecha. No construir URLs de detalle
por un patrón aún sin contrastar; usar enlaces publicados acreditados.

## Recogida, cobertura y coste

Unidad de cobertura: ventana de fechas y selección explícita de grupos,
independiente de las otras fuentes. Conservar parámetros, total y páginas
recibidas. Comprobar selección y ausencia de IDs repetidos; si se consulta por
grupo, consolidar un ID presente en varios grupos y conservar sus pertenencias.
Totales por grupo no pueden sumarse como número de competiciones únicas.

Validar estabilidad de totales entre páginas; si hay cambios incompatibles,
fallar la unidad y conservar la publicación anterior. Revisar eventos conocidos
movidos fuera de la ventana mediante una estrategia contrastada de detalle o
reconciliación más amplia. Leer páginas completas no resuelve por sí solo ese caso.

Coste por pasada: suma de páginas por selección más reconciliaciones y errores;
la estrategia de una ventana amplia filtrada localmente frente a varias por
grupo se decidirá con mediciones. La revisión posterior de noviembre-diciembre
declaraba 572 eventos de todo el mundo, no 572 del alcance elegido. No sirve para estimar
todavía el volumen anual seleccionado.

## Condiciones para darlo por integrado

Selección acordada demostrable con ejemplos, identidad y enlaces contrastados,
todos los niveles de circuitos, categoría inferior, meeting de varios días,
pertenencia múltiple, cita indeterminada y recorrido completo paginado.
Publicación local revisada y tests CI del contrato antes de activar recogida.
