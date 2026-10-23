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
