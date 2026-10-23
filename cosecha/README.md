# Cosecha de titulares

`python recolector.py` coordina la cosecha. Las reglas y operaciones viven
en estos módulos, que también usan las herramientas de diagnóstico:

| Módulo | Responsabilidad |
| --- | --- |
| `config.py` | Límites, rutas, ediciones y dirección del relay. |
| `fuentes.py` | Sesión HTTP, RSS/Atom, sitemap, scraping, WordPress, Google News y selección de alternativas. |
| `texto.py` | Limpieza de titulares, URLs y dominios; hashes. |
| `fechas.py` | Fechas reales, relativas y estimadas; conversión a la hora de Madrid. |
| `catalogo.py` | Catálogo cargado bajo demanda, tablas de medios y ediciones. |
| `historico.py` | Relectura, fusión, deduplicación editorial y `state.json`. |
| `formatos.py` | Formato corto, índices de ventana y archivo e inventario de ficheros. |
| `publicacion.py` | Portadas y slices locales; registro de archivos escritos en el run. |
| `r2.py` | Descarga, subida ordenada y limpieza remota. |
| `turso.py` | Archivo, esquema y diagnóstico mediante HTTP v2. |

La configuración se consulta en `config`, sin copiar valores mutables entre
módulos. Las credenciales de R2 y Turso se leen en sus respectivos adaptadores.
Importar los módulos no inicia la cosecha ni realiza peticiones.

El inventario y el manifest se suben después de los datos y en ese orden.
Si falla una subida, no se avanza el estado ni se limpia R2. La selección de
fuentes mantiene el acceso directo o mediante relay según el catálogo.

Las pruebas de `tests/fuentes` se ejecutan completas en CI, con respuestas
de red simuladas. Incluyen la generación y relectura entre dos runs.
