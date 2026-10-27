# Voceiro

Agregador de titulares con búsqueda, modos personales y lector de noticias.
La web se sirve en [GitHub Pages](https://thendabs1.github.io/voceiro/).

## Código y manuales

| Parte | Fuentes | Documentación |
| --- | --- | --- |
| Interfaz | `plantilla.html`, `front/` y `shared/` | [Construcción y funcionamiento](front/README.md), [modos](front/ASISTENTE-MODOS.md) |
| Cosecha y estadísticas | `recolector.py`, `estadisticas.py`, `cosecha/`, `medios.py` | [Cosecha de titulares](cosecha/README.md) |
| Agenda | `calendario.py`, `agenda/` | [Modelo y operación](agenda/README.md), [fuentes](agenda/fuentes.md) |
| Territorios | `shared/territorios/` | [Catálogos y generación](shared/territorios/README.md), [relacionador](shared/territorios/relacionador.md) |
| Servicios | `workers/` | [Workers y despliegues](workers/README.md), [sincronización](workers/cf-sync/SEGURIDAD.md) |
| Lector | `lector/` | [Construcción](lector/README.md), [manual de usuario](lector/MANUAL.md), [extensión](lector/extension/README.md) |
| Pruebas y diagnóstico | `tests/`, `salud_fuentes.py`, `diagnosticar_dominio.py` | [Pruebas y herramientas](tests/README.md) |

Los asuntos abiertos están en [Pendientes](PENDIENTES.md) y en los manuales
enlazados. El historial de cambios y decisiones cerradas se consulta en Git.

## Datos y servicios

- Los titulares, portadas y archivos por medio se guardan en R2. La búsqueda
  propia se hace en el navegador sobre la ventana pública de hasta 30 días;
  la prensa externa se consulta en Google News mediante los workers.
- Turso guarda el catálogo, las pasadas y los resúmenes de la cosecha;
  **no almacena noticias**. La agenda usa una base Turso independiente.
- La sincronización opcional cifra en el dispositivo y guarda el bloque en
  D1. Cloudflare y Deno comparten esa base.
- La interfaz del calendario está desactivada mientras se revisa su diseño.
  La recogida y la API de lectura conservan su implementación.

## Trabajar en local

Python 3.11 y Node 24 son las versiones que utiliza CI. Para las herramientas
Python, instala las dependencias en un entorno virtual:

```sh
python3 -m venv venv
venv/bin/pip install -r requirements.txt
```

Para generar y servir la interfaz sin recoger titulares ni escribir en los
servicios remotos:

```sh
python3 scripts/generar_front.py
python3 -m http.server 8000 --directory public
```

La web consulta los backends configurados en `front/app/01-backends.js`.
Las salidas de `public/` se generan desde las fuentes; no se editan a mano.
Para los workers, usa `node scripts/sync-workers.mjs` y
`node scripts/sync-parser.mjs` después de modificar sus fuentes comunes.

`python recolector.py` sí recoge y publica datos cuando tiene credenciales.
Estas se leen del entorno: R2 usa `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY` y `R2_BUCKET`; el diagnóstico de cosecha usa
`TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`; el relay usa `RELAY_CLAVE`.
La agenda tiene sus propias variables, documentadas en su manual.
El recolector no carga `.env` automáticamente.

La suite completa se ejecuta en CI con el workflow **Tests**; **Lector**
comprueba además las construcciones del userscript y de las extensiones.
Los procedimientos de publicación están en `.github/workflows/`.
