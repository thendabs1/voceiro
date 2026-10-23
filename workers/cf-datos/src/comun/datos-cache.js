// Generado desde workers/comun/datos-cache.js por scripts/sync-workers.mjs. No editar.
export function cacheControlFor(key) {
  // Índices: 60s
  if (key === 'manifest.json' || key === 'inventario.json') return 'public, max-age=60';

  // Portada rodante: 60s
  if (key.startsWith('portada-')) return 'public, max-age=60';

  // Slice por dominio (nombre estable): 60s, coherente con el manifest,
  // salvo los de días congelados, que ya no cambian: 1 día.
  const dominio = key.match(/^d-[a-z0-9.-]+-(\d{4}-\d{2}-\d{2})\.json$/);
  if (dominio) {
    return _congelado(dominio[1]) ? 'public, max-age=86400' : 'public, max-age=60';
  }

  // Día completo "all": YYYY-MM-DD-<hash>.json → inmutable
  if (/^\d{4}-\d{2}-\d{2}-[a-f0-9]{10}\.json$/.test(key)) {
    return 'public, max-age=31536000, immutable';
  }

  // Slice por grupo: YYYY-MM-DD-g-<slug>-<hash>.json → inmutable
  if (/^\d{4}-\d{2}-\d{2}-g-[a-z0-9-]+-[a-f0-9]{10}\.json$/.test(key)) {
    return 'public, max-age=31536000, immutable';
  }

  // Compat: dominios.json (obsoleto, ya no se genera)
  if (key === 'dominios.json') return 'public, max-age=300';

  // Fallback
  return 'public, max-age=3600';
}

// El recolector reescribe hoy y los 3 días anteriores (hora de Madrid).
// Contando en UTC sale como mucho un día menos: con 5 hay margen.
function _congelado(fecha) {
  return (Date.now() - Date.parse(fecha + 'T00:00:00Z')) / 86400000 >= 5;
}
