# Municipios, previsión y avisos de AEMET: revisión del 25/10/2026

## Contraste de catálogos

El catálogo territorial local reproduce el [diccionario INE de 2026](https://www.ine.es/daco/daco42/codmun/diccionario26.xlsx), con referencia a 01/01/2026: 8.132 municipios. `node scripts/revisar-base-territorial.mjs` encuentra 14 códigos discordantes con las tablas meteorológicas versionadas.

Se consultó en vivo el [maestro de municipios de AEMET OpenData](https://opendata.aemet.es/dist/) el 25/10/2026. Su respuesta tiene 8.122 filas, 3.008.591 bytes y SHA-256 `ed3a9513c3837c5a04039669379913bc3963daf422d47bfde36ced254e785199`. **Antes de aplicar esta revisión**, coincidía con la tabla local del worker en todos los códigos, zonas y coordenadas redondeadas a tres decimales. Regenerarlo sin la revisión reintroduciría las diferencias. No se compararon aquí nombres ni población.

La disponibilidad de un producto se comprobó por separado en `/prediccion/especifica/municipio/diaria/{codigo}`. Un `estado: 200` en el primer paso no basta: también se revisaron la descarga, `elaborado` y las fechas de `prediccion.dia` de los cinco códigos que respondieron.

| Código | Municipio | Maestro | Predicción diaria el 25/10/2026 | Conclusión |
| --- | --- | --- | --- | --- |
| `04904` | Balanegra | Ausente | Vigente, elaborada 19:13 | Punto municipal acreditado. |
| `11903` | San Martín del Tesorillo | Ausente | `estado: 404` | Sin punto AEMET acreditado. |
| `14901` | Fuente Carreteros | Ausente | `estado: 404` | Sin punto AEMET acreditado. |
| `14902` | La Guijarrosa | Ausente | `estado: 404` | Sin punto AEMET acreditado. |
| `18077` | Fornes | Ausente | `estado: 404` | Sin punto AEMET acreditado. |
| `18106` | Játar | Ausente | Vigente, elaborada 19:13 | Punto municipal acreditado. |
| `18915` | Domingo Pérez de Granada | Ausente | Vigente, elaborada 19:13 | Punto municipal acreditado. |
| `18916` | Torrenueva Costa | Ausente | Responde, pero pronostica del 10 al 16/09/2025; `id: 18140` | Producto obsoleto: no usar como previsión actual. |
| `21902` | La Zarza-Perrunal | Ausente | `estado: 404` | Sin punto AEMET acreditado. |
| `36902` | Cerdedo-Cotobade | Ausente | Vigente, elaborada 19:09 | Punto municipal acreditado. |
| `41904` | El Palmar de Troya | Ausente | `estado: 404` | Sin punto AEMET acreditado. |
| `48916` | Usansolo | Ausente | `estado: 404` | Sin punto AEMET acreditado. |
| `36011` | Cerdedo, antiguo | Presente | `estado: 404` | Entrada obsoleta del maestro. |
| `36012` | Cotobade, antiguo | Presente | `estado: 404` | Entrada obsoleta del maestro. |

Los dos últimos municipios se [fusionaron oficialmente en Cerdedo-Cotobade](https://www.boe.es/buscar/doc.php?id=BOE-A-2017-898). Es una sucesión administrativa histórica, no una equivalencia de identidad ni una autorización para atribuir la previsión del municipio nuevo a cada punto antiguo. La [web de AEMET](https://www.aemet.es/es/eltiempo/prediccion/municipios/) anuncia 8.124 municipios; ese contador tampoco describe el maestro de OpenData ni demuestra que cada código tenga producto vigente.

## Zonas verificadas

Las fichas municipales oficiales identifican la zona por nombre y el [anexo de zonas de aviso de AEMET](https://www.aemet.es/documentos/es/eltiempo/prediccion/avisos/plan_meteoalerta/METEOALERTA_ANX2_Zonas_aviso.pdf) permite convertir ese nombre, dentro de la provincia, en código. Se han comprobado estas cuatro asociaciones:

| Municipio | Ficha AEMET | Zona de avisos |
| --- | --- | --- |
| `04904` Balanegra | [Ficha](https://www.aemet.es/es/eltiempo/prediccion/municipios/balanegra-id04904) | `610403` Poniente y Almería Capital. |
| `18106` Játar | [Ficha](https://www.aemet.es/es/eltiempo/prediccion/municipios/jatar-id18106) | `611801` Cuenca del Genil. |
| `18915` Domingo Pérez de Granada | [Ficha](https://www.aemet.es/es/eltiempo/prediccion/municipios/domingo-perez-de-granada-id18915) | `611801` Cuenca del Genil. |
| `36902` Cerdedo-Cotobade | [Ficha](https://www.aemet.es/es/eltiempo/prediccion/municipios/cerdedo-cotobade-chan-a-id36902) | `713602` Interior de Pontevedra. |

No se deduce la zona de los otros ocho municipios por proximidad ni por el municipio del que se segregaron. Una zona indicada en la ficha es una referencia meteorológica municipal; sin geometría de cobertura no afirmamos que abarque todos los lugares del término.

## Comprobación del respaldo geográfico

La [API de geocodificación de Open-Meteo](https://open-meteo.com/en/docs/geocoding-api) devuelve lugares y coordenadas, pero no códigos INE. Consultada el 25/10/2026 con `countryCode=ES`, no encontró San Martín del Tesorillo, La Guijarrosa, La Zarza-Perrunal ni Torrenueva Costa. Sí encontró Fuente Carreteros, Fornes, El Palmar de Troya y Usansolo, pero los situó respectivamente bajo Fuente Palmera, Arenas del Rey, Utrera y Galdakao como tercer nivel administrativo. Sus coordenadas pueden representar núcleos de población; esos resultados no acreditan la identidad del municipio actual ni su zona de avisos.

## Contrato propuesto para revisar

1. `es:municipio:{INE}` conserva la identidad administrativa. `aemet:prediccion_municipio:{codigo}` identifica el producto de predicción; `aemet:zona_avisos:{codigo}` identifica la zona de Meteoalerta. Los tres espacios no se funden aunque coincidan los cinco dígitos del municipio y del producto.
2. `punto_prevision` une municipio → producto con `estado`, `metodo`, `alcance`, `vigencia` y `evidencias`. Una fila del maestro acredita que AEMET *declara* el punto; una descarga con fechas actuales acredita que el producto *funciona*. Para los cuatro casos nuevos vigentes, el método es `codigo_ine_y_producto_vigente` y el alcance es `capital_municipal`, conforme a la [descripción de la predicción municipal de AEMET](https://www.aemet.es/es/eltiempo/prediccion/municipios/).
3. `zona_avisos` une municipio → zona con evidencia independiente de la previsión. Para las cuatro fichas revisadas, el método es `ficha_municipal_y_anexo_zonas`; el alcance es `referencia_de_ficha_municipal`. Si falta ficha o delimitación suficiente, queda pendiente y no se toma la zona del punto más cercano.
4. Cada evidencia guarda fuente, URL/ruta del dato, momento de observación y, cuando exista una descarga, huella. `vigencia: null` mientras no haya prueba de un intervalo histórico. Las comprobaciones del 25/10/2026 son una instantánea, no garantía futura.
5. Los siete códigos sin respuesta y `18916` necesitan una política de respaldo de previsión; `18916` exige además rechazar días caducados. La proximidad a otro punto AEMET puede ser una aproximación explícita con distancia, nunca una relación de identidad ni una asignación automática de zona de aviso. La fusión `36011`/`36012` → `36902` pertenece a `sucesion_administrativa` y se documenta aparte.

## Aplicación limitada en el tiempo

`scripts/municipios-aemet-revisados.json` conserva las cuatro excepciones con producto y zona comprobados. El generador las incorpora a las sugerencias y al worker, y retira `36011` y `36012`. Los ocho municipios sin previsión actual quedan excluidos, también de los resultados del geocodificador y de nuevas peticiones por nombre y coordenadas. Así no se presentan previsiones o avisos de un municipio vecino como propios. No se cambia la localización de agenda ni la cobertura editorial. Las ubicaciones ya guardadas en el dispositivo bajo otro municipio no pueden reinterpretarse automáticamente sin revisar su procedencia.
