# Revisión previa a World Athletics

2/11/2026. La recogida federativa está operativa; WA aún no tiene adaptador.
No se han habilitado publicación ni cron de atletismo. Esta revisión no amplía
la selección acordada en [el contrato WA](atletismo-world-athletics.md).

## Resultado de la primera recogida compartida

El [PR 259](https://github.com/thendabs1/voceiro/pull/259) está fusionado por
autorización del usuario. La
[segunda ejecución](https://github.com/thendabs1/voceiro/actions/runs/41529257572)
terminó correctamente para 1/11–31/12/2026:

| Fuente | Peticiones declaradas | Citas de la fuente | Cobertura declarada |
| --- | ---: | ---: | --- |
| FGA | 64 | 56 | Completa para la ventana recorrida |
| FCA | 2 | 53 | Páginas y total comprobados |
| RFEA mensual | 66 | 61 | Sin pendientes mensuales; el indicador conjunto sigue incompleto por Nivel II |

Son recuentos por proveedor: no deben sumarse como competiciones únicas.
RFEA procesa además el PDF Nivel II; su descarga no está incluida en las 66
peticiones del mensual. El informe íntegro de Nivel II se guarda en
`agenda_estado`, clave `atletismo-informe-rfea`. Extraer las 441 filas no
acredita que todas tengan identidad resuelta.

Se detectaron siete incidencias entre referencias importadas. El límite de
cinco issues por pasada creó [261](https://github.com/thendabs1/voceiro/issues/261),
[262](https://github.com/thendabs1/voceiro/issues/262),
[263](https://github.com/thendabs1/voceiro/issues/263),
[264](https://github.com/thendabs1/voceiro/issues/264) y
[265](https://github.com/thendabs1/voceiro/issues/265); dos casos quedaron sin
issue por ese límite. No se han conciliado identidades ni cerrado esos casos.

Los casos ilustran problemas relevantes también para WA: discrepancia de
fechas y sede en una cita enlazada, conjunto/partes en marcha y Nassos, títulos
con variante de edición en Jean Bouin y sede literal «San Martiño» frente a
Ourense. No basta con bajar el umbral de semejanza ni fusionar por fecha/sede.
Los pendientes del PDF aún no se convierten automáticamente en issues.

## Base común comprobada

- La primera ejecución reveló que R2 rechazaba entidades de dos proveedores.
  La corrección guarda una sola copia física por entidad compartida y conserva
  todas las referencias y evidencias. El dueño físico no decide la autoridad
  de los datos. El manifiesto sigue confirmándose atómicamente con Turso.
- Pasan las 15 pruebas de R2, incluido guardado/recarga con tres proveedores,
  cambio de dueño físico y rechazo de objetos contradictorios entre fragmentos.
  La [CI completa](https://github.com/thendabs1/voceiro/actions/runs/41528950393)
  pasó y la segunda recogida verificó el guardado real de las tres federaciones.
- El núcleo admite varias relaciones de pertenencia. `publicacion.proyectar`
  reúne todos los padres y la lectura compartida indexa sus códigos. Falta
  una prueba específica de un meeting WA perteneciente a varios circuitos.
- La proyección federativa resuelve las variantes usando las fuentes
  permitidas; las pruebas de atletismo cubren las vistas por proveedor.
- El importador RFEA/territorial exige inicio y fin acreditados. No debe
  reutilizarse sin adaptación para las fechas indeterminadas de WA. Las
  funciones temporales comunes sí admiten extremos desconocidos.

## Contraste actual de la web WA

Fuente primaria: [calendario oficial](https://worldathletics.org/competition/calendar-results).
Consultas de lectura, sin importar citas ni activar recogida:

1. Sin filtros: `props.pageProps.initialEvents` contenía 100 resultados y
   `hits=40277`, incluyendo historia y futuras ediciones. No es una selección
   de interés ni un coste estimado para nuestra recogida.
2. [Noviembre/diciembre](https://worldathletics.org/competition/calendar-results?startDate=2026-11-01&endDate=2026-12-31):
   `hits=572`, `limit=100`, `offset=0`. La segunda página con `offset=100`
   mantuvo el total y aportó otros 100 IDs sin repetirse con la primera.
   No se recorrieron las seis páginas: no se declara cubierta esa ventana.
3. [Cross Country Tour](https://worldathletics.org/competition/calendar-results?startDate=2026-11-01&endDate=2026-12-31&competitionGroupId=3664):
   el servidor acreditó `competitionGroupId=3664`, 16 resultados de 16 y
   subgrupos Gold, Silver y Bronze. Es un circuito completo en esa ventana,
   no una prueba de todos los grupos seleccionados.
4. Tres de esos IDs estaban en las dos páginas generales revisadas. Nombre,
   sede, inicio, fin e `iaafId` coincidieron. La representación de pertenencia
   varía: ID 7244465 aparece como «World Athletics Cross Country Tour – Bronze»
   en la consulta general y como grupo base + subgrupo `Bronze` al filtrar.
   No identificar el circuito por igualdad de esas cadenas ni inferir que
   cambia la identidad de la competición. Conservar parámetros y originales.
5. La vista general puede combinar varios grupos en una cadena. No separarla
   automáticamente por comas sin contrastar la pertenencia. Consultar por
   grupos conocidos permite conservar relaciones con evidencia de la consulta.
6. La respuesta mantiene separados `competitionGroups`, `rankingCategories`
   y `permitLevels`. Sus IDs no son intercambiables. Los grupos observados
   incluyen Diamond League meetings `627`, final `3520`, Continental Tour
   `3773`, Indoor Tour `3677`, Label Road Races `3775`, Combined Events `3767`,
   Race Walking `3692` y Cross Country `3664`. Hay grupos históricos y otros
   fuera del alcance; observar una opción no autoriza a importarla.
7. La primera cita sin filtros era Brisbane 2032, ID 7173264, con fechas del
   23/7 al 8/8. Esa fila de Juegos Olímpicos no acredita por sí sola las fechas
   específicas del atletismo. Resolver el alcance del evento o su programa
   antes de presentar todos esos días como sesiones de atletismo.

Las capturas utilizadas no contenían una fecha indeterminada. Ese caso sigue
sin acreditarse con una muestra real. `hasResults`, `hasApiResults` y
`hasStartlist` son señales, no resultados importados ni un programa horario.

## Lo que falta para incorporar WA

1. Versionar la selección de grupos y subgrupos respaldada por el catálogo,
   incluyendo campeonatos mundiales/continentales y categorías inferiores
   acordadas. Montaña/trail y FISU/juegos regionales continúan pendientes de
   decisión; no se incluyen por defecto. No activar grupos históricos extintos.
2. Implementar un lector WA propio: IDs externos, originales, pertenencias,
   fechas sin inventar extremos, sede literal y enlaces publicados acreditados.
   No asumir que `iaafId`, SFID RFEA y `championship` son la misma referencia.
3. Recorrer y comprobar todas las páginas de cada unidad de cobertura. Un ID
   presente en varios grupos se consolida conservando todas sus pertenencias.
   Verificar los parámetros que devuelve el servidor; una consulta ignorada
   no puede convertirse en una importación mundial accidental.
4. Probar varios circuitos en una sola cita, todos sus niveles, varios días,
   categoría inferior, fecha indeterminada, cambio de ventana y enlaces reales.
   La agrupación anual de un circuito no es otro meeting ni una sesión.
5. Extender el registro de proveedores, las referencias de fichas y el
   contraste RFEA/WA. Antes de añadir más solapamientos hace falta una vía
   explícita de conciliación para dos identidades que ya estén persistidas.
6. Completar los informes: distinguir cobertura de ventana y del PDF anual,
   contar todas las peticiones y guardar fallos/Retry-After. Conservar fichas
   válidas en caché también cuando falle después otro paso del workflow.
7. Resolver la reconciliación de citas conocidas que se trasladan fuera de
   ventana. La última lectura buena no equivale a fecha vigente confirmada.
   Mantener presupuesto y última lectura válida ante paginación inestable,
   cambios de esquema, 429 o errores de cualquier fuente.

Conclusión operativa: base común de persistencia y lectura validada, recogidas
federativas guardadas y contrato WA contrastado en parte. No equivale a tener
WA implementada ni a estar listo para publicación automática de todo atletismo.
