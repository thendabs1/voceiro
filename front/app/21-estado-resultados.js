/* ═══════════════════════════════════════════════════════════════
   FILTRADO + RENDER
   ═══════════════════════════════════════════════════════════════ */
let ULT_FILTRADAS = [];
let ULT_TEXTO = null;   // texto compilado de la búsqueda actual (para resaltar)
let ULT_CHIPS = null;      // { total, porModo, modo, totalModo, porTema, nMedios } o null
let ULT_PESTANAS = null;   // { pestana, nModo, nTodo } o null si no hay pestañas

const RENDER_BATCH = 60;
let RENDER_OFFSET = 0;
let SENTINEL_OBSERVER = null;
let ULT_CTX = null;                // contexto del último filtrado
