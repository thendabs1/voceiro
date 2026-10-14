/* ============================================================
   1c. CATÁLOGO DE MEDIOS
   ------------------------------------------------------------
   Es el de Voceiro: build.mjs lo saca de medios.py (con
   lector/catalogo.py) y lo pone aquí: {d, n, lang}. Los medios que
   añade cada persona son reglas suyas (CFG.sites), no catálogo.
   isKnownMediaDomain y getCatalogEntry están en 09.
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
