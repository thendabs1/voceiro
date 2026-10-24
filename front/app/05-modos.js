/* ═══════════════════════════════════════════════════════════════
   MODELO DE CONFIGURACIÓN
   ═══════════════════════════════════════════════════════════════ */
const PRESET_KEY = 'voceiro-presets-v4';
const PRESET_ACTIVO_KEY = 'voceiro-preset-activo';
const PRESET_ID_KEY = 'voceiro-modo-activo';
const SITES_CACHE_KEY = 'voceiro-sites-cache-v1';
const AJ_SECCION_KEY = 'voceiro-aj-seccion';   // última sección de Ajustes (escritorio)
const PRESET_DEF = { grupos: [], palabras: [] };
const PRESET_UNICO_DEF = { id: 'general', nombre: 'General', grupos: [], palabras: [], overrides: {} };
let PRESETS = null;   // { lista: [...], activo: 'id', borrados: { id: ms } }
let _huellasModos = null;   // id → huella de cada modo al guardar (sellarModos)
let PRESET = null;
let PRESET_ACTIVO = false;
// Vista 🔖 Temas: el feed muestra lo que casa con algún tema de cualquier
// modo. Es local (no viaja con el sync de los modos) y excluye al modo activo.
const VISTA_TEMAS_KEY = 'voceiro-vista-temas';
let VISTA_TEMAS = false;
let CHIP_TEMAS = null;   // modo del chip elegido en la vista; null = todos
// Chip de tema, en la vista Temas o en un modo: { modo, etiqueta } o
// { modo, medios: true } («Medios del modo»); null = todos. Lleva el modo
// para caducar solo al cambiar de modo.
let CHIP_TEMA = null;
let SITES = new Map();
let SITES_LIST = [];


const HIDE_MODE_KEY = 'voceiro-hide-mode';
const HIDE_ULTIMO_KEY = 'voceiro-hide-ultimo';
const HIDE_MODES = ['off', 'read', 'viewed', 'both'];
let HIDE_MODE = 'off';
const RECORDAR_FILTROS_KEY = 'voceiro-recordar-filtros';
// Pestaña de resultados al buscar con un modo activo. null = automática
// (Modo, o Todo si el modo no tiene resultados). Se reinicia al cambiar de
// búsqueda; si el usuario elige una, se respeta para esa búsqueda.
let PESTANA_BUSQUEDA = null;
let PESTANA_CLAVE = '';
let RECORDAR_FILTROS = true;
let APP_LISTA = false;

function cargarRecordarFiltros(){
  try {
    const raw = localStorage.getItem(RECORDAR_FILTROS_KEY);
    if (raw === 'false') return false;
    if (raw === 'true')  return true;
  } catch(e){}
  return true;   // por defecto, sí recordamos
}
function guardarRecordarFiltros(){
  try { localStorage.setItem(RECORDAR_FILTROS_KEY, RECORDAR_FILTROS ? 'true' : 'false'); } catch(e){}
  // Si el usuario desactiva la opción, limpiamos lo guardado para
  // que no reaparezca si la vuelve a activar.
  if (!RECORDAR_FILTROS){
    try { localStorage.removeItem('voceiro-buscar'); } catch(e){}
  }
}

function cargarHideMode(){
  try {
    const raw = localStorage.getItem(HIDE_MODE_KEY);
    if (HIDE_MODES.includes(raw)) return raw;
    // migración desde el booleano antiguo
    const old = localStorage.getItem('voceiro-hide-read');
    if (old === 'true') return 'read';
  }catch(e){}
  return 'off';
}
function guardarHideMode(){
  try{ localStorage.setItem(HIDE_MODE_KEY, HIDE_MODE); }catch(e){}
}
function normalizarPreset(p){
  return {
    id:        String(p.id || 'general'),
    nombre:    String(p.nombre || p.id || 'General'),
    grupos:    Array.isArray(p.grupos)   ? p.grupos   : [],
    palabras:  Array.isArray(p.palabras) ? p.palabras : [],
    overrides: (p.overrides && typeof p.overrides === 'object' && !Array.isArray(p.overrides))
               ? p.overrides : {},
    // Fecha del último cambio de este modo (la pone sellarModos).
    ...(Number(p.actualizado) > 0 ? { actualizado: Number(p.actualizado) } : {})
  };
}

function cargarPresets(){
  try{
    const raw = localStorage.getItem(PRESET_KEY);
    if (raw){
      const p = JSON.parse(raw);
      if (p && Array.isArray(p.lista) && p.lista.length){
        const lista = p.lista.map(normalizarPreset);
        const activo = (typeof p.activo === 'string' && lista.some(x => x.id === p.activo))
                       ? p.activo : lista[0].id;
        const borrados = (p.borrados && typeof p.borrados === 'object') ? p.borrados : {};
        return { lista, activo, borrados };
      }
    }
  }catch(e){}
  // Sin datos previos → crear "General" vacío
  return {
    lista: [ structuredClone(PRESET_UNICO_DEF) ],
    activo: 'general',
    borrados: {}
  };
}

function guardarPresets(){
  recompilarTemas();
  if (sellarModos()) sincronizarPronto();
  try{ localStorage.setItem(PRESET_KEY, JSON.stringify(PRESETS)); }catch(e){}
  try{ localStorage.setItem(PRESET_ID_KEY, PRESETS.activo); }catch(e){}
  pintarEstadisticas();
}

// Cada modo lleva la fecha de su último cambio y cada borrado la suya: así
// la sincronización junta los modos de varios dispositivos uno a uno.
function huellasDeModos(){
  return new Map(((PRESETS && PRESETS.lista) || []).map(m => [m.id, huellaModo(m)]));
}
// Sella los modos que cambiaron desde el último guardado y apunta los que
// desaparecieron. Devuelve si hubo algún cambio.
function sellarModos(){
  const antes = _huellasModos || huellasDeModos();
  const ahora = Date.now();
  if (!PRESETS.borrados || typeof PRESETS.borrados !== 'object') PRESETS.borrados = {};
  let cambio = false;
  const vivos = new Set();
  PRESETS.lista.forEach(m => {
    vivos.add(m.id);
    if (antes.get(m.id) !== huellaModo(m)){ m.actualizado = ahora; cambio = true; }
    delete PRESETS.borrados[m.id];
  });
  antes.forEach((h, id) => {
    if (!vivos.has(id)){ PRESETS.borrados[id] = ahora; cambio = true; }
  });
  _huellasModos = huellasDeModos();
  return cambio;
}

// Guarda el modo activo. PRESET es el mismo objeto que su entrada en la
// lista (Ajustes edita la entrada y cuenta con ello).
function guardarPreset(){
  if (!PRESETS || !Array.isArray(PRESETS.lista)) return;
  const idx = PRESETS.lista.findIndex(p => p.id === PRESETS.activo);
  if (idx >= 0 && PRESETS.lista[idx] !== PRESET){
    PRESET = Object.assign(PRESETS.lista[idx], PRESET);
  }
  guardarPresets();
  actualizarBotonPreset();
}
// Excepción por dominio de un modo (por defecto, el activo).
function getOverride(domain, modo = PRESET){
  if (!modo || !modo.overrides) return '';
  return modo.overrides[domain] || '';
}
function overrideIncluye(value){ return value === 'include' || value === 'first'; }

function setOverride(domain, value, modo = PRESET){
  if (!modo) return;
  if (!modo.overrides || typeof modo.overrides !== 'object') modo.overrides = {};
  if (!value){
    delete modo.overrides[domain];
  } else if (value === 'include' || value === 'first' || value === 'ignore'){
    modo.overrides[domain] = value;
  }
  if (modo === PRESET) guardarPreset();
  else guardarPresets();
}

function cargarPresetActivo(){
  try{
    const raw = localStorage.getItem(PRESET_ACTIVO_KEY);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  }catch(e){}
  return presetTieneReglas();
}
function guardarPresetActivo(){
  try{ localStorage.setItem(PRESET_ACTIVO_KEY, PRESET_ACTIVO ? 'true' : 'false'); }catch(e){}
  // Activar un modo (menú, Alt+M, configuración…) sale de la vista Temas.
  if (PRESET_ACTIVO && VISTA_TEMAS) ponerVistaTemas(false);
}
function cargarVistaTemas(){
  try{ return localStorage.getItem(VISTA_TEMAS_KEY) === 'true'; }catch(e){ return false; }
}
function ponerVistaTemas(on){
  VISTA_TEMAS = !!on;
  CHIP_TEMAS = null;
  CHIP_TEMA = null;
  try{ localStorage.setItem(VISTA_TEMAS_KEY, VISTA_TEMAS ? 'true' : 'false'); }catch(e){}
}
// La vista solo existe si hay temas, y nunca a la vez que un modo.
function vistaTemasActiva(){
  return VISTA_TEMAS && !PRESET_ACTIVO && TEMAS_TODOS.length > 0;
}
function presetTieneReglas(p){
  p = p || PRESET;
  if (!p) return false;
  const ov = p.overrides || {};
  return !!(
    (p.grupos && p.grupos.length) ||
    (p.palabras && p.palabras.length) ||
    Object.keys(ov).some(d => overrideIncluye(ov[d]) || ov[d] === 'ignore')
  );
}

function cargarSitesCache(){
  try{
    const raw = localStorage.getItem(SITES_CACHE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  }catch(e){ return []; }
}
function guardarSitesCache(){
  try{
    const arr = [...SITES.entries()].map(([d, s]) => ({ domain: d, ...s }));
    localStorage.setItem(SITES_CACHE_KEY, JSON.stringify(arr));
  }catch(e){}
}
function setSitesFromArray(arr){
  SITES = new Map();
  SITES_LIST = [];
  (arr || []).forEach(s => {
    if (!s || !s.domain) return;
    SITES.set(s.domain, {
      lang: s.lang || 'auto',
      type: s.type || '',
      tags: Array.isArray(s.tags) ? s.tags.slice() : []
    });
    SITES_LIST.push({ domain: s.domain, ...SITES.get(s.domain) });
  });
}

function actualizarBotonPendientes(){
  const b = $('#btn-pendientes');
  if (!b) return;

  // Sin plugin, Pendientes guarda en este navegador: solo sobra «Actualizar».
  const refrescar = $('#pend-refresh');
  if (refrescar) refrescar.hidden = !USCRIPT_OK;

  const countEl = b.querySelector('.pend-count');
  if (!countEl) return;

  const n = (PENDIENTES_CACHE || []).filter(i => !i.read).length;
  countEl.textContent = n;
  countEl.dataset.count = String(n);
  b.classList.toggle('has-pendientes', n > 0);
}
function actualizarFiltrosCount(){
  let n = 0;
  const g = $('#grupo'), tp = $('#tipo'), r = $('#rango'), o = $('#orden');
  if (g  && g.value)  n++;
  if (tp && tp.value) n++;
  if ((r && r.value) || $('#fecha-desde').value) n++;
  if ($('#fecha-hasta').value) n++;
  if (o  && o.value && o.value !== 'recientes') n++;

  const count = $('#filtros-count');
  const btn   = $('#btn-filtros');
  if (count){
    count.textContent = n;
    count.dataset.count = String(n);
  }
  if (btn) btn.classList.toggle('active', n > 0);
}

// El ojo de la barra alterna entre ver todos y el último modo de ocultar
// elegido en Filtros o Ajustes (por defecto, ya leídos).
function hideModeUltimo(){
  try {
    const raw = localStorage.getItem(HIDE_ULTIMO_KEY);
    if (raw !== 'off' && HIDE_MODES.includes(raw)) return raw;
  }catch(e){}
  return 'read';
}
function pintarBotonLectura(){
  const b = $('#btn-lectura');
  const activo = HIDE_MODE !== 'off';
  const modo = activo ? HIDE_MODE : hideModeUltimo();
  const clave = { read: 'vsHideRead', viewed: 'vsHideViewed', both: 'vsHideBoth' }[modo];
  const txt = `${t('vsTitleHide')} ${t(clave).toLowerCase()}`;
  b.classList.toggle('active', activo);
  b.setAttribute('aria-pressed', String(activo));
  b.setAttribute('aria-label', txt);
  b.title = txt;
  b.querySelector('use').setAttribute('href', activo ? '#i-eye-off' : '#i-eye');
}

function pintarFiltroLectura(){
  document.querySelectorAll('input[name="vs-hide"]').forEach(r => {
    r.checked = (r.value === HIDE_MODE);
  });
}

// Lectura se cambia desde Filtros y Ajustes › Feed.
function ponerHideMode(v){
  if (!HIDE_MODES.includes(v)) return;
  HIDE_MODE = v;
  guardarHideMode();
  if (v !== 'off') try{ localStorage.setItem(HIDE_ULTIMO_KEY, v); }catch(e){}
  pintarFiltroLectura();
  ajPintarVista();
  pintarBotonLectura();
  aplicarFiltros();
}
function ajPintarVista(){
  document.querySelectorAll('input[name="aj-hide"]').forEach(r => { r.checked = r.value === HIDE_MODE; });
}

/* ── Fase 2 · relanzar carga (cambio de días o de preset) ── */

let _relanzarTimer = null;

function actualizarBotonPreset(){
  const btn = $('#btn-preset');
  if (!btn) return;

  const activo = PRESET_ACTIVO && PRESET;
  const temas = vistaTemasActiva();
  const nombre = temas  ? t('presetVistaTemas')
               : activo ? (PRESET.nombre || 'General') : t('presetSinFiltro');

  btn.innerHTML = (temas ? ico('hash') : '')
    + `<span class="preset-nombre">${escapeHtml(nombre)}</span>` + ico('chevron-down');
  btn.classList.toggle('active', !!activo || temas);

  const menu = $('#preset-menu');
  if (menu && menu.style.display !== 'none'){
    renderPresetMenu();
  }
}
function renderPresetMenu(){
  const menu = $('#preset-menu');
  if (!menu) return;

  const lista = (PRESETS && PRESETS.lista) || [];
  const activo = PRESETS ? PRESETS.activo : '';

  let html = '';
  lista.forEach(p => {
    const isActive = PRESET_ACTIVO && p.id === activo;
    html += `<div class="preset-opcion"><button type="button" class="preset-item${isActive ? ' active' : ''}" data-preset-id="${escapeHtml(p.id)}" aria-pressed="${!!isActive}">
      <span class="preset-check">${ico('check')}</span>
      <span>${escapeHtml(p.nombre)}</span>
    </button><button type="button" class="preset-editar" data-editar-modo="${escapeHtml(p.id)}"
      aria-label="${escapeHtml(t('ajEditarModo', { X: p.nombre }))}">${ico('pencil')}<span>${escapeHtml(t('ajModoEditar'))}</span></button></div>`;
  });

  if (!lista.some(p => presetTieneReglas(p))){
    html += `<button type="button" class="preset-item preset-empezar" data-preset-id="__empezar">
      ${ico('plus')}<span>${escapeHtml(t('pistaEmpezar'))}</span>
    </button>`;
  }
  html += '<div class="preset-sep"></div>';
  const enTemas = vistaTemasActiva();
  if (TEMAS_TODOS.length){
    html += `<button type="button" class="preset-item${enTemas ? ' active' : ''}" data-preset-id="__temas">
    <span class="preset-check">${ico('check')}</span>
    ${ico('hash')}<span>${escapeHtml(t('presetVistaTemas'))}</span>
  </button>`;
  }
  html += `<button type="button" class="preset-item${!PRESET_ACTIVO && !enTemas ? ' active' : ''}" data-preset-id="__sinfiltro">
    <span class="preset-check">${ico('check')}</span>
    <span>${escapeHtml(t('presetSinFiltro'))}</span>
  </button>`;
  html += '<div class="preset-sep"></div>';
  html += `<button type="button" class="preset-item preset-manage" data-preset-id="__gestionar">
    ${ico('settings')}
    <span>${escapeHtml(t('presetGestionar'))}</span>
  </button>`;

  menu.innerHTML = html;
  menu.querySelectorAll('[data-editar-modo]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      cerrarPresetMenu();
      abrirAjustes('modos');
      ajEditarModo(btn.dataset.editarModo);
    });
  });

  menu.querySelectorAll('.preset-item').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.presetId;
      if (id === '__gestionar'){
        cerrarPresetMenu();
        abrirAjustes('modos');
        return;
      }
      if (id === '__empezar'){
        cerrarPresetMenu();
        abrirAjustes('modos');
        ajEditarModo(PRESETS.activo);
        return;
      }
      if (id === '__temas'){
        PRESET_ACTIVO = false;
        guardarPresetActivo();
        ponerVistaTemas(true);
        actualizarBotonPreset();
        aplicarFiltros();
        cerrarPresetMenu();
        return;
      }
      if (id === '__sinfiltro'){
        PRESET_ACTIVO = false;
        guardarPresetActivo();
        ponerVistaTemas(false);
        actualizarBotonPreset();
        aplicarFiltros();
        cerrarPresetMenu();
        return;
      }
      cerrarPresetMenu();
      activarModo(id);
    });
  });
}

function abrirPresetMenu(){
  const menu = $('#preset-menu');
  const btn  = $('#btn-preset');
  if (!menu) return;
  renderPresetMenu();
  menu.style.display = '';
  if (btn) btn.setAttribute('aria-expanded', 'true');
  setTimeout(() => {
    document.addEventListener('mousedown', _presetOutsideClick, true);
    document.addEventListener('keydown', _presetEscKey, true);
  }, 0);
}
function cerrarPresetMenu(){
  const menu = $('#preset-menu');
  const btn  = $('#btn-preset');
  if (!menu) return;
  const devolverFoco = menu.contains(document.activeElement);
  menu.style.display = 'none';
  if (btn) btn.setAttribute('aria-expanded', 'false');
  if (devolverFoco && btn) btn.focus({ preventScroll: true });
  document.removeEventListener('mousedown', _presetOutsideClick, true);
  document.removeEventListener('keydown', _presetEscKey, true);
}

function _presetOutsideClick(e){
  const wrap = document.querySelector('.preset-wrap');
  if (wrap && !wrap.contains(e.target)) cerrarPresetMenu();
}

function _presetEscKey(e){
  if (e.key === 'Escape'){ e.stopPropagation(); cerrarPresetMenu(); }
}
