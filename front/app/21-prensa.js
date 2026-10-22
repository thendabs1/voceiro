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
let ULT_CTX = null;                // contexto para append incremental


// ── Paginación R2 + Turso ──
let DIAS_ACTUAL = 0;               // días cargados vía R2 para la query actual
let DIAS_CAPAS_KEY = '';            // las capas a las que pertenece ese contador
const DIAS_R2_STEP = 30;           // días por click en "Cargar más"
// Sin tope: se extiende hasta agotar el manifest.

function claveCapas(capas){ return [...capas].sort().join('|'); }

function ajustarDiasActual(capas){
  const clave = claveCapas(capas);
  const total = (_manifest && _manifest.dias) ? _manifest.dias.length : 0;
  if (clave !== DIAS_CAPAS_KEY){
    DIAS_CAPAS_KEY = clave;
    DIAS_ACTUAL = clave ? Math.min(DIAS_MEMORIA, total) : 0;
  } else {
    DIAS_ACTUAL = clave ? Math.min(Math.max(DIAS_ACTUAL, Math.min(DIAS_MEMORIA, total)), total) : 0;
  }
}

let TURSO_OFFSET = 0;              // próximo offset a pedir
let TURSO_HAY_MAS = false;
let TURSO_ACTIVO = false;          // true cuando ya estamos paginando Turso
let TURSO_RAW = '';                // raw con el que se pagina Turso (puede llevar cutoff)
// El archivo se consulta tras una pausa sin cambios (regla 3), no en cada
// pausa del debounce al teclear: menos peticiones y menos respuestas tiradas.
const ARCHIVO_PAUSA_MS = 700;
// TEMPORAL (13-10-2026): Turso sin cuota de lecturas. Con false no se pide
// nada al archivo (ni búsqueda ni «Cargar más»); lo cargado, R2 y la prensa
// siguen igual. Volver a true cuando se restablezca la cuota.
const ARCHIVO_ACTIVO = false;
let _archivoTimer = null;
let ULT_QUERY_KEY = '';            // para detectar cambio de query
let _cargandoMas  = false;
/* ═══════════════════════════════════════════════════════════════
   PRENSA EXTERNA (vía Worker: Google News)
   ═══════════════════════════════════════════════════════════════ */
function prensaCacheGet(rawQuery){
  try {
    const raw = sessionStorage.getItem(PRENSA_CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw);
    const entry = cache[rawQuery];
    if (!entry) return null;
    if (Date.now() - entry.ts > PRENSA_CACHE_TTL_MS) return null;
    return entry.items;
  } catch(e){ return null; }
}
/* ─── Control de estado de prensa externa ─── */
function setPrensaActiva(valor, { persistir = true } = {}){
  PRENSA_ACTIVA = !!valor;
  const chk = document.getElementById('prensa-panel-toggle');
  const sel = document.getElementById('prensa-selects');
  if (chk) chk.checked = PRENSA_ACTIVA;
  if (sel) sel.hidden = !PRENSA_ACTIVA;
  if (persistir){
    try { localStorage.setItem('voceiro-prensa-activa', PRENSA_ACTIVA ? '1' : '0'); } catch(e){}
  }
}

function setPrensaLang(valor, { persistir = true } = {}){
  PRENSA_LANG = valor || 'es';
  const sel = document.getElementById('prensa-lang');
  if (sel) sel.value = PRENSA_LANG;
  if (persistir){
    try { localStorage.setItem('voceiro-prensa-lang', PRENSA_LANG); } catch(e){}
  }
}

function setPrensaPais(valor, { persistir = true } = {}){
  PRENSA_PAIS = valor || 'ES';
  const sel = document.getElementById('prensa-region');
  if (sel) sel.value = PRENSA_PAIS;
  if (persistir){
    try { localStorage.setItem('voceiro-prensa-pais', PRENSA_PAIS); } catch(e){}
  }
}

function resetPrensa(){
  setPrensaLang('es');
  setPrensaPais('ES');
  aplicarFiltros();
}

function prensaCacheKey(rawQuery){
  return `${rawQuery}|${PRENSA_LANG}|${PRENSA_PAIS}`;
}

function pintarSelectsPrensa(){
  const selL = document.getElementById('prensa-lang');
  if (selL && !selL.options.length){
    selL.innerHTML = PRENSA_LANGS.map(o =>
      `<option value="${o.code}">${escapeHtml(t(o.labelKey))}</option>`
    ).join('');
  }

  const selP = document.getElementById('prensa-region');
  if (selP && !selP.options.length){
    selP.innerHTML = PRENSA_PAISES.map(o =>
      `<option value="${o.code}">${escapeHtml(t(o.labelKey))}</option>`
    ).join('');
  }

  // Sincronizar valores
  if (selL) selL.value = PRENSA_LANG;
  if (selP) selP.value = PRENSA_PAIS;
}

function cargarPrensaDeLocalStorage(){
  try {
    const activa  = localStorage.getItem('voceiro-prensa-activa') !== '0';
    const lang    = localStorage.getItem('voceiro-prensa-lang')  || 'es';
    let pais      = localStorage.getItem('voceiro-prensa-pais')  || 'ES';
    // Reino Unido se guardaba como 'UK'; Google usa el código ISO ('GB').
    if (pais === 'UK') pais = 'GB';

    PRENSA_ACTIVA = activa;
    PRENSA_LANG = lang;
    PRENSA_PAIS = pais;
  } catch(e){}
}
function prensaCacheSet(rawQuery, items){
  try {
    let cache = {};
    const raw = sessionStorage.getItem(PRENSA_CACHE_KEY);
    if (raw) cache = JSON.parse(raw);
    cache[rawQuery] = { ts: Date.now(), items };
    const keys = Object.keys(cache);
    if (keys.length > 20){
      const oldest = keys.sort((a, b) => cache[a].ts - cache[b].ts)[0];
      delete cache[oldest];
    }
    sessionStorage.setItem(PRENSA_CACHE_KEY, JSON.stringify(cache));
  } catch(e){}
}

// El worker responde 200 aunque falle una fuente y pone el motivo en
// _errores. Sin esto, una fuente caída se ve como "0 resultados".
// Se avisa como mucho una vez por minuto y fuente.
const _ERRORES_AVISADOS = new Map();
function _avisarErroresFuente(data){
  const errs = data && data._errores;
  if (!errs) return false;
  const ahora = Date.now();
  for (const fuente in errs){
    const ult = _ERRORES_AVISADOS.get(fuente) || 0;
    if (ahora - ult < 60000) continue;
    _ERRORES_AVISADOS.set(fuente, ahora);
    const nombre = fuente === 'turso' ? 'Archivo' : fuente;
    console.warn(`[${fuente}]`, errs[fuente]);
    toast(`${nombre} no disponible: ${String(errs[fuente]).slice(0, 120)}`, 4000);
  }
  return true;
}

async function buscarEnPrensa(parsed, rawQuery, { silent = false } = {}){
  // Cache primero
  const cacheKey = prensaCacheKey(rawQuery);
  const cached = prensaCacheGet(cacheKey);
  if (cached) return { items: cached, _cache: true };

  if (PRENSA_ABORT) PRENSA_ABORT.abort();
  PRENSA_ABORT = new AbortController();

  const params = new URLSearchParams();
  params.set('raw', rawQuery || '');
  params.set('fuentes', 'gnews');
  params.set('limit', '40');
  params.set('offset', '0');
  params.set('lang', PRENSA_LANG);
  params.set('region', PRENSA_PAIS);

  const signal = PRENSA_ABORT.signal;
  const intentar = async () => {
    const sig = _signalConTimeout(signal, BACKEND_TIMEOUT_CF_MS);
    const r = await fetch(`${WORKER_BUSCAR}/buscar?${params}`, { signal: sig });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  };

  // No se cachea una respuesta con fuentes fallidas: si no, el fallo
  // se serviría como "0 resultados" durante toda la vida de la caché.
  // Con la fuente caída no hay respuesta (null): lo indica el estado junto
  // al contador, sin toast en cada búsqueda.
  const procesar = (data) => {
    if (data._errores){ console.warn('[prensa]', data._errores); return null; }
    const items = data.items || [];
    prensaCacheSet(cacheKey, items);
    return { items };
  };

  try {
    return procesar(await intentar());
  } catch (e) {
    if (e.name === 'AbortError') return null;
    if (BACKEND_ACTIVO === 'cf'){
      await _conmutarBackendPorFallo();
      try {
        return procesar(await intentar());
      } catch(e2){
        if (e2.name === 'AbortError') return null;
      }
    }
    console.warn('[prensa]', e.message);
    if (!silent) toast(`Error buscando en prensa: ${e.message}`, 2600);
    return null;
  }
}

async function buscarEnWorker(rawQuery, { offset = 0, limit = 50 } = {}) {
  const params = new URLSearchParams();
  params.set('raw', rawQuery || '');
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  params.set('fuentes', 'turso');

  const mapear = (data) => ({
    items: (data.items || []).map(it => ({
      u: it.u, d: it.d, t: it.t, p: it.p, e: it.e, f: it.f || 'TURSO',
      _src: 'turso',
    })),
    total: data.total || 0,
    nextOffset: data.next_offset ?? null,
  });

  const intentar = async () => {
    const sig = _signalConTimeout(null, BACKEND_TIMEOUT_CF_MS);
    const r = await fetch(`${WORKER_BUSCAR}/buscar?${params}`, { signal: sig });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  };

  try {
    const data = await intentar();
    _avisarErroresFuente(data);
    return mapear(data);
  } catch(e) {
    if (e.name !== 'AbortError') console.warn('[worker]', e.message);
    if (BACKEND_ACTIVO === 'cf' && e.name !== 'AbortError'){
      await _conmutarBackendPorFallo();
      try {
        const data = await intentar();
        _avisarErroresFuente(data);
        return mapear(data);
      } catch(e2){ /* fall through */ }
    }
    return { items: [], total: 0, nextOffset: null };
  }
}



// Item de prensa → item crudo de NOTICIAS, como los de Turso. El medio se
// resuelve por dominio (el de <source url>, vía relay) y, si ese dominio no
// está en el catálogo, por nombre.
function _itemDePrensa(it){
  if (!it.u) return null;
  let dom = it.d || '';
  let m = MEDIOS[dom] || {};
  // Mínimo 4 letras para evitar colisiones ("Vox", "ABC", "EFE"...)
  if (!m.n && it.f){
    const clave = normStrict(it.f);
    if (clave.length >= 4){
      const domPorNombre = MEDIOS_POR_NOMBRE.get(clave);
      if (domPorNombre && MEDIOS[domPorNombre]){
        dom = domPorNombre;
        m = MEDIOS[dom];
      }
    }
  }
  return {
    u: it.u, d: dom, t: it.t || '', p: it.p || '', e: '', f: it.f || 'prensa',
    // Fuera del catálogo, el nombre que dio el proveedor (o el dominio).
    medio: m.n || it.f || dom || 'Prensa',
  };
}

// La prensa entra en NOTICIAS como capa 'prensa', marcada con la clave de la
// consulta (_prensaPara), y se filtra, cuenta y ordena con todo lo demás en
// aplicarFiltros. Cada aplicarFiltros pasa por aquí: lo ya pedido, en camino
// o fallido para la misma clave no se repite (si no, su llegada la volvería a
// pedir); un fallo se reintenta con otra búsqueda o al volver a encenderla.
function programarPrensa(consulta){
  // Con un filtro de medios de más de 3 dominios (p. ej. grupo:galicia) la
  // prensa no puede acotarse (site: admite 3) y lo que trae no pasa el
  // filtro de medios: medido, 0 de 100. No se pide.
  const dominios = consulta.medios.dominios;
  const tieneQuery = !consulta.imposible
    && (consulta.texto.incluir.length || dominios !== null)
    && !(dominios && dominios.size > 3);
  if (!tieneQuery || !PRENSA_ACTIVA){
    _cancelarPrensa();
    return;
  }

  const clave = _clavePrensa(consulta);
  if (clave === PRENSA_CLAVE) return;
  _cancelarPrensa();
  if (clave === PRENSA_HECHA || clave === PRENSA_FALLO) return;

  PRENSA_CLAVE = clave;
  PRENSA_FALLO = null;
  const texto = paraPrensa(consulta);
  // Lo que ya está en caché no espera a que se deje de teclear.
  const espera = prensaCacheGet(prensaCacheKey(texto)) ? 0 : PRENSA_DEBOUNCE_MS;
  PRENSA_TIMER = setTimeout(() => {
    PRENSA_TIMER = null;
    if (PRENSA_CLAVE !== clave) return;

    buscarEnPrensa(consulta.parsed, texto, { silent: true }).then(res => {
      if (PRENSA_CLAVE !== clave) return;
      PRENSA_CLAVE = null;
      if (res) PRENSA_HECHA = clave; else PRENSA_FALLO = clave;
      const items = res ? (res.items || []).map(_itemDePrensa).filter(Boolean) : [];
      if (items.length){
        if (_mergearItemsEnNoticias(items, 'prensa', clave) > 0) hidratarNoticias();
        aplicarFiltros();
      } else if (!ULT_FILTRADAS.length) renderizar();   // el vacío deja de «buscar»
      else pintarEstadoPrensa();
    });
  }, espera);
}

// Otra edición (idioma, país) es otra respuesta: va en la clave.
function _clavePrensa(consulta){
  return `${consulta.clave}|${PRENSA_LANG}|${PRENSA_PAIS}`;
}

// Anula la petición programada o en camino; su respuesta, si llega, se descarta.
function _cancelarPrensa(){
  if (PRENSA_TIMER){ clearTimeout(PRENSA_TIMER); PRENSA_TIMER = null; }
  if (PRENSA_ABORT){ PRENSA_ABORT.abort(); PRENSA_ABORT = null; }
  PRENSA_CLAVE = null;
}

// Estado de la prensa para la consulta en pantalla, junto al contador.
function _estadoPrensa(){
  const k = ULT_CTX && ULT_CTX.clavePrensa;
  if (!k || !PRENSA_ACTIVA) return '';
  return k === PRENSA_CLAVE ? 'prensaBuscando' : k === PRENSA_FALLO ? 'prensaFallo' : '';
}
function pintarEstadoPrensa(){
  const el = document.getElementById('prensa-estado');
  if (!el) return;
  const estado = _estadoPrensa();
  el.textContent = estado ? t(estado) : '';
  el.hidden = document.getElementById('prensa-estado-sep').hidden = !estado;
}
