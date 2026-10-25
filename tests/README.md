# Pruebas y diagnóstico

## Pruebas automáticas (CI)

El workflow **Tests** ejecuta la suite completa en cada PR:

- `node --test 'tests/**/*.test.mjs'` (Node 24): buscador y equivalencia con SQLite FTS5, filtros y fechas de Madrid, limpieza del lector, temas y contraste, sincronización, cifrado y servicio con almacén simulado.
- `node scripts/sync-workers.mjs --check`: comprueba que cada despliegue contiene la versión vigente de los módulos comunes. `tests/workers` verifica los contratos HTTP de CF y Deno, las credenciales de cada adaptador, errores parciales sin caché, paginación, revalidación y compresión.
- `node scripts/sync-parser.mjs` y `node scripts/test-parser.mjs`: comprueban las cuatro copias generadas del parser.
- `python -m unittest discover -s tests/fuentes -v` (Python 3.11 y `requirements.txt`): extracción RSS/Atom, parser alternativo, sitemap, scraping y JSON-LD, WordPress, Google News, errores HTTP, relay y selección de fuentes alternativas. Cubre fechas de feeds, relativas y estimadas; fusión y deduplicación del histórico, y la relectura de su formato corto. También prueba el diagnóstico y sus informes. Las peticiones se simulan; no depende de que un periódico esté disponible.

Las pruebas Python importan directamente los módulos de `cosecha/`. La integración
de publicación comprueba portadas, slices, índices, estado y reutilización de
archivos entre dos runs locales.

`test_agenda.py` comprueba además el [piloto de calendario común](../agenda/README.md):
identidad de funciones y traducciones, regiones y grupos, fechas de celebración,
paginación y conservación de la última salida buena, sin peticiones reales.
`test_calendario_almacen.py` contrasta el ICS de Vidmar y la persistencia SQLite:
reapertura, revisiones, reversión ante fallos y recuperación de la exportación.
`test_calendario_turso.py` comprueba el batch HTTP con SQLite real y red simulada:
rollback, escritores concurrentes, respuestas perdidas o incompletas, observaciones
sin reescrituras de contenido, copia completa, migración v1 y otras disciplinas.

**Lector** construye el userscript y comprueba su sintaxis, cabecera y dominios cuando cambian sus archivos.

## Medios actuales que fallan

Para una revisión general, empezar por los logs del recolector y
`runs.intentos`: ya registran los intentos y la alternativa elegida en cada
pasada. Reservar las peticiones nuevas para los casos que no expliquen esos
datos. El [inventario del extractor](../cosecha/REVISION-EXTRACTOR.md)
documenta las incidencias observadas y las alternativas aún sin comprobar.

En Actions → **Salud de fuentes**, elige `tipos` y, si quieres, `dominios` separados por comas. Prueba cada fuente configurada con el mismo código que el recolector, incluidas las alternativas. `gn` permite hacer el diagnóstico de Google News que antes tenía un workflow propio.

```sh
python salud_fuentes.py --dominios elpais.com --tipos rss,sitemap,wp,scrape,gn --muestras 3 --json salud.json
```

La tabla muestra errores HTTP, fuentes vacías, escasas (menos de 5 titulares) o antiguas (última fecha de hace más de 48 horas). El JSON incluye muestras. `--exigir-ok` hace fallar la ejecución si alguna fuente tiene problemas. Sin esa opción el informe es informativo. Un filtro inválido o sin fuentes siempre falla.

Una fuente sin fechas puede dar `ok`: el diagnóstico indica cuántas fechas obtuvo, pero no puede confirmar su frescura. El umbral de 48 horas puede marcar medios que publican con poca frecuencia.

## Dominio nuevo o estructura desconocida

En Actions → **Diagnóstico de dominio**, introduce una URL completa. El modo `auto` muestra HTTP, URL final, tamaño, etiquetas HTML, tipos de JSON-LD, bloques inválidos y candidatos de los extractores actuales; después prueba las fuentes del catálogo y los feeds RSS/Atom anunciados por la página. Para un dominio nuevo prueba el scraping de esa URL y los feeds descubiertos. No modifica `medios.py`.

```sh
python diagnosticar_dominio.py https://ejemplo.es/ --json diagnostico.json
python diagnosticar_dominio.py https://ejemplo.es/feed.xml --tipo rss
python diagnosticar_dominio.py https://ejemplo.es/sitemap-news.xml --tipo sitemap
python diagnosticar_dominio.py https://ejemplo.es/ --tipo wp
python diagnosticar_dominio.py https://ejemplo.es/ --tipo gn --lang es
```

Los tipos explícitos permiten probar rutas conocidas o métodos alternativos aunque no se anuncien en la portada. `wp` y `gn` usan el dominio, mientras que `rss`, `sitemap` y `scrape` usan la URL indicada. Hay un máximo de ocho fuentes por diagnóstico; el informe indica las omitidas. Los candidatos de headings y slugs pueden solaparse y todavía no representan el total final deduplicado.

El JSON guarda configuración, estado, recencia, muestras y mensajes del extractor; se publica como artefacto incluso si ninguna fuente da `ok` y el run falla. Un HTTP 200 por sí solo no implica extracción correcta. Estos diagnósticos hacen peticiones reales y se ejecutan manualmente; la IP de GitHub puede recibir bloqueos distintos de la de tu equipo.

## Depuración realizada

Se conservan las pruebas de comportamiento de buscador, lector, temas y sincronización: cubren reglas distintas o su integración. Se eliminan las comprobaciones del parser que solo verificaban tipos de retorno, ya cubiertas por pruebas de resultados concretos.

Se retiran `test_feeds.py` (seis URLs fijas y combinaciones de clientes), `test_scraping.py` (copia antigua de estrategias y fechas con offset fijo) y `test_google_news.py` (lista antigua de medios y lógica separada del recolector). Sus usos quedan cubiertos por salud de fuentes y diagnóstico por URL usando los extractores actuales; la comparación experimental entre clientes HTTP no se conserva. `check_run.py` se mantiene para analizar los datos ya recolectados.
