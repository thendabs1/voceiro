"""Límites y rutas de la cosecha. No realiza peticiones ni lee credenciales."""

from zoneinfo import ZoneInfo


# ─────────────────────────────────────────────────────────────
# CONFIGURACIÓN
# ─────────────────────────────────────────────────────────────
N_FEED              = 60
# Una fuente que trae menos titulares que esto no se da por buena: se
# prueba la siguiente y, si ninguna llega, se usa la que más trajo.
MIN_ITEMS_FUENTE    = 5
DIAS_RETENCION      = 15    # working set: días que el runner deduplica y reescribe
DIAS_VENTANA        = 30    # días que lista el manifest público (lo que muestra el lector)
DIAS_ARCHIVO        = 365   # días que R2 conserva: pasada la ventana, solo los ficheros por medio
VENTANA_GRACIA_DIAS = 3     # días recientes que se reescriben (hoy + 2)
MAX_WORKERS         = 8
TIMEOUT             = 25
TZ_MADRID = ZoneInfo('Europe/Madrid')

# Intervalo por defecto si no hay datos.json previo (primer run)
INTERVALO_DEFAULT_SEG = 3600        # 1 hora
INTERVALO_MIN_SEG     = 60          # no menos de 1 min
INTERVALO_MAX_SEG     = 24 * 3600   # no más de 24 h

# Horizonte de "futuro legítimo": si fecha_pub está dentro de este margen
# respecto a ahora, se considera programada. Si está más allá, se
# considera futura y se usa otra fecha para agrupar.
HORIZONTE_FUTURO_HORAS = 6
GRUPOS_INCLUIDOS = []

# Portada: ventana y tope. Con ~20 000 noticias al día el tope manda: el
# reparto con cupo por medio (_seleccionar_con_cupo) hace que la ventana
# cuente de verdad y que entren todos los medios que publicaron en ella.
PORTADA_HORAS = 24
PORTADA_MAX   = 2000

# Tiempo máximo del barrido completo de R2 por run (el job tiene 15 min).
R2_SCAN_MAX_SEG = 180

# Ediciones: portadas complementarias que el front carga además de la
# general (por dominio, ?ed= o elección del usuario). Filtro sobre el
# catálogo por 'regiones' o 'ambito'; 'max' es el tope de la portada.
EDICIONES = {
    'gal': {'regiones': ['galicia'], 'max': 1500},
    'cat': {'regiones': ['cataluna', 'baleares', 'comunidad-valenciana'], 'max': 1500},
    'eus': {'regiones': ['pais-vasco', 'navarra'], 'max': 1500},
    'nac': {'ambito': 'nacional', 'max': 3000},
    'int': {'ambito': 'internacional', 'max': 2000},
}

# Google News fallback
GN_MAX_ITEMS      = 80
GN_DIAS_MAX       = 14
GN_SLEEP          = 0.3

DATOS_DIR         = 'public/datos'
MANIFEST_PATH     = 'public/datos/manifest.json'
# Memoria del recolector entre runs: ficheros, hashes y tamaños de los días
# de la ventana, y una línea por día del archivo. El lector no lo usa.
INVENTARIO_PATH   = 'public/datos/inventario.json'
STATE_PATH        = 'state.json'
# Relay del recolector: app de Deno Deploy enlazada a workers/deno-relay.
# (El playground secret-worm-9453 es otro: lo usa el front para Google News.)
DENO_RELAY_BASE = 'https://voceiro-relay-hzvcanr0wjdj.thendabs1.deno.net/rss?u='
