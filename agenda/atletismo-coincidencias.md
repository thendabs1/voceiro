# Coincidencias automáticas e incidencias de atletismo

Decisión del usuario, 2/11/2026: automatizar la comparación y crear un issue
cuando haya que revisar un caso. Sustituye el requisito inicial de registrar
manualmente cada correspondencia. Sigue sin activar recogida de las fuentes.

## Durante la importación

`atletismo_coincidencias` compara citas de las distintas federaciones y las
dos distribuciones RFEA (fichas mensuales y Nivel II). No consulta webs.
Normaliza mayúsculas, acentos, puntuación, orden de palabras, año de la fecha
y una tabla explícita de variantes castellanas, gallegas y catalanas.
Los originales se conservan íntegros.

Una cita nueva se une automáticamente a una identidad existente cuando:

- Existe una sola identidad candidata, sin lecturas ambiguas ni otra cita
  de la misma distribución que ya ocupe esa identidad.
- Las fechas completas coinciden y no hay contradicciones de distancia,
  edad, edición, sexo, formato o modalidad publicados.
- Hay enlace directo a la misma ficha federativa; o coinciden sede y al
  menos tres palabras significativas, con similitud de conjuntos de palabras
  de al menos 0,90 (coeficiente Dice).
- No hay indicios de conjunto/partes. Si dos citas del mismo lote reclaman
  una misma identidad, ambas quedan sin fusionar para revisión.

No bastan fecha y sede, ni la portada compartida de un organizador. Tampoco
se confunden controles semanales con el mismo nombre y recinto. Un enlace
de ficha permite conservar dos sedes literales distintas bajo la misma cita;
la proyección sigue mostrando esa discrepancia.

La primera referencia conserva su identidad: nombre, fecha y sede nunca se
usan como ID. Al añadir una fuente, se guardan su referencia, su evidencia y
el criterio automático. Las recogidas posteriores reutilizan esa referencia,
incluso si se reprograma; una discrepancia posterior de fechas genera revisión.
Las correspondencias editoriales siguen teniendo prioridad. No se fusionan
dos identidades que ya estaban guardadas: ese caso pide conciliación explícita.

La muestra catalana de noviembre-diciembre contiene 15 enlaces directos a
fichas RFEA; no se depende solo de semejanzas de títulos. Atapuerca sigue
requiriendo revisión de alcance porque el título catalán reúne campeonato y
cross internacional. No se afirma que todas las coincidencias estén resueltas.

## Nivel II

El extractor admite `--nucleo /tmp/nucleo.json` junto al registro de revisiones.
Las filas que coinciden inequívocamente con una cita identificada se incorporan
sin revisión individual. Su ID `nivel-ii:auto-…` se ancla en la referencia
existente, no en el título, fecha, número de fila ni huella del PDF. Repetir
la extracción reutiliza el ID guardado. Dos filas candidatas a una misma cita
quedan pendientes. Las filas sin identidad resoluble siguen en el inventario;
este cambio no acredita cobertura completa ni importación de todas las nuevas
citas que solo aparecen en el PDF.

## Issues de revisión

`atletismo_revision` examina el núcleo ya guardado. El informe contiene IDs,
nombres, fechas, sedes, enlaces, señales de comparación y motivo de la duda.
No recoge fuentes ni modifica el núcleo. Se puede revisar localmente:

```sh
python -m agenda.atletismo_revision --nucleo /tmp/nucleo.json --salida /tmp/incidencias.json
python -m agenda.atletismo_revision --nucleo /tmp/nucleo.json --issues --repo thendabs1/voceiro
```

El envío usa `gh` autenticado. Un marcador derivado del par ordenado de IDs
evita repetir el issue cuando cambian datos o el orden de lectura. Se comprueban
issues abiertos y cerrados mediante listado paginado, sin depender del índice
del buscador. Cerrar un issue no fusiona datos ni provoca que vuelva a abrirse.
La decisión se registra en correspondencias o conciliación cuando proceda.
No se modifica el contenido de issues existentes.

Se crean como máximo cinco issues nuevos por pasada (límite configurable de
1 a 20); los demás se informan como pendientes. Una escritura con resultado
incierto no se reintenta: la siguiente pasada vuelve a consultar el listado.
Sin casos no se hace ninguna petición a GitHub. No se añaden dependencias.

El workflow de Calendario ejecuta este paso después de publicación, dentro
de la pasada que ya carga el núcleo. Usa su `GITHUB_TOKEN` con permiso
`issues: write` y el grupo de concurrencia existente serializa los envíos.
Si falla GitHub, el paso marca la pasada como fallida sin deshacer datos
válidos. No se habilitan fuentes deportivas ni su publicación.
