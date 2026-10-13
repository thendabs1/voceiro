/* ============================================================
   1c. CATÁLOGO DE MEDIOS
   ------------------------------------------------------------
   Es el de Voceiro: build.mjs lo saca de medios.py (con
   lector/catalogo.py) y lo pone aquí. Un solo catálogo; los medios
   que añada cada persona van en su customCatalog.
   ============================================================ */
const MEDIA_CATALOG = /*{{CATALOGO}}*/[];


// ============================================================
// FUNCIONES Y UTILIDADES
// ============================================================

const CATALOG_FLAT = (() => {
  const out = [];
  MEDIA_CATALOG.forEach(g => {
    g.items.forEach(it => out.push(Object.assign({ group: g.group }, it)));
  });
  return out;
})();

const CATALOG_BY_DOMAIN = (() => {
  const m = new Map();
  CATALOG_FLAT.forEach(it => m.set(it.d, it));
  return m;
})();

const CATALOG_TOTAL = CATALOG_FLAT.length;

function isKnownMediaDomain(host){
  host = String(host || '').toLowerCase();
  if (!host) return false;
  if (CATALOG_BY_DOMAIN.has(host)) return true;
  let idx = host.indexOf('.');
  while (idx !== -1){
    const suf = host.slice(idx + 1);
    if (CATALOG_BY_DOMAIN.has(suf)) return true;
    idx = host.indexOf('.', idx + 1);
  }
  return false;
}

function getCatalogEntry(host){
  host = String(host || '').toLowerCase();
  if (!host) return null;
  if (CATALOG_BY_DOMAIN.has(host)) return CATALOG_BY_DOMAIN.get(host);
  let idx = host.indexOf('.');
  while (idx !== -1){
    const suf = host.slice(idx + 1);
    if (CATALOG_BY_DOMAIN.has(suf)) return CATALOG_BY_DOMAIN.get(suf);
    idx = host.indexOf('.', idx + 1);
  }
  return null;
}

const CATALOG_TYPES = (() => {
  const s = new Set();
  CATALOG_FLAT.forEach(it => { if (it.type) s.add(it.type); });
  return Array.from(s).sort();
})();

const CATALOG_TAGS = (() => {
  const s = new Set();
  CATALOG_FLAT.forEach(it => (it.tags||[]).forEach(tg => s.add(tg)));
  return Array.from(s).sort();
})();

const CATALOG_LANGS = (() => {
  const s = new Set();
  CATALOG_FLAT.forEach(it => { if (it.lang) s.add(it.lang); });
  return Array.from(s).sort();
})();

