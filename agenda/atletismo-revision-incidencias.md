# Revisión de incidencias previa a WA

2/11/2026. Revisados los cinco issues abiertos y los dos casos sin issue del
snapshot remoto, revisión 135. Solo lectura remota; ninguna conciliación aplicada
en Turso/R2 ni activación de publicación o cron.

| Caso | Qué ocurre | Corrección o decisión |
| --- | --- | --- |
| [261](https://github.com/thendabs1/voceiro/issues/261), clubes máster ST | Identidad compartida por enlace. FCA publica 5/12, Madrid; RFEA 5–6/12, «a designar». | Discrepancia real de datos, pendiente. No elegir fecha o sede por orden de descarga. |
| [262](https://github.com/thendabs1/voceiro/issues/262), marcha máster | FCA recoge 10 km máster; la ficha RFEA incluye promoción y máster. El enlace antiguo de FCA a la ficha exclusiva devuelve 404. | Mantener separadas las identidades. Hace falta acreditar la relación entre programa y parte; no ampliar la igualdad de nombres. |
| [263](https://github.com/thendabs1/voceiro/issues/263), Nassos | FCA anuncia 5 y 10 km. Las pruebas publicadas por RFEA 67588 solo enumeran 5 km masculino/femenino. | Mantener separadas. No eliminar las distancias al comparar ni equiparar programa completo y carrera de 5 km. |
| [264](https://github.com/thendabs1/voceiro/issues/264), Jean Bouin | «103a … (RFEA)» frente a «103 …». Misma edición, día y sede. | Normalización corregida; conciliación explícita preparada para los dos IDs ya guardados. |
| [265](https://github.com/thendabs1/voceiro/issues/265), San Martiño | Misma XLIX carrera y fecha; RFEA pone «San Martiño» como sede, FGA acredita Ourense y su organizador municipal. | Correspondencia revisada por IDs y evidencias. Conservar ambos literales y su conflicto de sede; no crear un alias geográfico general. |
| Sin issue, Granollers FCA 89086 / RFEA 69182 | «60è … (RFEA)» frente a «60 …». | Misma corrección de ordinal y etiqueta; conciliación preparada. |
| Sin issue, Dakar FCA 83346 / RFEA 65028 | Identidad ya compartida por enlace. FCA publica 8–10/11; RFEA el periodo de los Juegos, 30/10–15/11. | Pendiente acreditar el programa de atletismo. No presentar todos los días de los Juegos como jornadas atléticas. |

Fuentes primarias adicionales a los enlaces de los issues:

- [Pruebas RFEA de Nassos](https://atletismorfea.es/calendario/pruebas/excel/a0bQs00000KNu4PIAT),
  XLSX consultado sin importar resultados ni sesiones.
- [Pruebas RFEA de marcha](https://atletismorfea.es/calendario/pruebas/excel/a0bQs00000DqlHCIAZ),
  con distancias de 3, 5 y 10 km; el nombre acredita promoción y máster.
- [Granollers FCA](https://fcatletisme.cat/event/60e-cros-internacional-de-catalunya-ciutat-de-granollers-rfea/)
  y [RFEA](https://atletismorfea.es/calendario/campeonato/60-cros-internacional-de-catalunya-ciutat-de-granollers).
- [Dakar FCA](https://fcatletisme.cat/event/jocs-olimpics-de-la-joventut/)
  y [RFEA](https://atletismorfea.es/calendario/campeonato/juegos-olimpicos-de-la-juventud).

## Corrección y conciliación preparadas

La comparación versión 3 elimina únicamente el paréntesis administrativo
exacto `(RFEA)` y los sufijos ordinales, conservando su número. No baja el
umbral 0,90 ni borra distancias, edades, ediciones o paréntesis de campeonatos.
Los nombres originales permanecen intactos.

`atletismo-conciliaciones.json` registra las tres identidades revisadas, sus
referencias exactas, evidencia y la fuente cuyo ID existente se conserva.
Las importaciones nuevas pueden usar estas correspondencias; las identidades
ya persistidas requieren un paso separado. Fechas o modalidades discrepantes
siguen generando incidencias aunque la identidad esté revisada. Un enlace
contradictorio con la revisión mantiene la ambigüedad.

`atletismo_conciliacion` prepara otra copia **local** del núcleo. No tiene
opción de escritura remota y no se ejecuta desde la recogida:

```sh
python -m agenda.atletismo_conciliacion \
  --nucleo /tmp/nucleo-original.json \
  --salida /tmp/nucleo-conciliado.json \
  --informe /tmp/conciliacion.json
```

Se limita a principales sin sesiones, resultados, políticas o referencias
adicionales afectadas. Mantiene los grupos de cada fuente y sus pertenencias,
documentos y observaciones sin reescribirlos. Registra los IDs absorbidos y la
revisión en la entidad conservada. Las dependencias fuera de ese alcance
rechazan la operación completa. Repetirla no cambia el resultado.

Comprobado en la copia del snapshot real: tres conciliaciones preparadas,
siete incidencias pasan a cuatro, originales conservados e ida/vuelta R2
válida. Los IDs conservados son los ya persistidos por FCA en Jean Bouin y
Granollers y por FGA en San Martiño. Esta comprobación no cambia los issues
ni acredita que se haya aplicado la conciliación en producción.

## Nivel II: informe remoto frente a la muestra aislada

El informe guardado por la pasada real declara **11 citas en ventana** y
**36 filas pendientes del inventario anual**, dos dentro de noviembre/diciembre.
La prueba local aislada anterior no tenía todo el núcleo territorial y no
producía exactamente la misma resolución. No reutilizar sus recuentos como
si fueran los del guardado remoto.

- Ourense, 12/12: «CAMPIONATO … CLUBS SUB 16 PC» frente a FGA 112623,
  «II Campionato … Sub16 en Pista Curta». Hay otras filas parecidas de la
  temporada, distintas sedes y fechas. Revisar la correspondencia concreta;
  no borrar ediciones ni unir todas las filas por parecido.
- Ordes, 12/12 en el PDF: FGA 112625 es la quinta jornada del segundo circuito,
  del 12 al 13/12. Su
  [reglamento](https://atletismo.gal/wp-content/uploads/2025/10/V-Xornada-Circuito-Lanzamentos-Longos-2026.pdf)
  acredita ambos días y distribuye las pruebas entre sábado y domingo.
  La discrepancia de duración es real; la coincidencia de identidad necesita
  una revisión específica, conservando la fila original del PDF.

Ambas están retenidas y no se han creado nuevas citas duplicadas para sortear
la revisión. Faltan el circuito de issues para pendientes PDF y la distinción
entre cobertura resuelta de la ventana y del inventario anual.

## Antes de cerrar WA

Continúa pendiente el adaptador WA. La
[lista de requisitos de integración](atletismo-preparacion-wa.md#lo-que-falta-para-incorporar-wa)
sigue vigente, con estos puntos reforzados por datos reales:

1. Modelar programa y partes sin identificarlos entre sí: Nassos y marcha
   son casos de aceptación obligatorios para el cruce territorial/RFEA/WA.
2. Acreditar días de atletismo en Juegos y otros eventos multideportivos;
   las fechas de la competición contenedora no bastan. Dakar ya demuestra
   el problema en los datos guardados.
3. Aplicar la conciliación preparada contra una carga remota nueva, con control
   de revisión y las mismas guardas, antes de dar por resueltos los duplicados.
   No subir este snapshot completo más adelante: podría pisar otras recogidas.
   La herramienta local no cubre todavía la conciliación de sesiones/resultados.
4. Resolver las dos filas futuras de Nivel II y separar sus indicadores de
   cobertura. No declarar completo el anual porque se resuelva una ventana.
5. Mantener pendientes selección versionada WA, lector y paginación completos,
   pertenencias múltiples, fechas indeterminadas, enlaces/IDs contrastados,
   reconciliación fuera de ventana y manejo de presupuesto/429/caché.

Publicación y periodicidad requieren validación posterior; esta revisión no
las activa ni equivale a terminar WA.
