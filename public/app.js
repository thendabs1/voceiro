// Generado por scripts/generar_front.py desde front/app/*.js. No editar.

/* ═══════════════════════════════════════════════════════════════
   IMPORTS COMPARTIDOS
   El parser vive en shared/parser.js y se copia a public/parser.js
   (mismo origen que este HTML, servido por GitHub Pages).   Fuente única para frontend y worker. No duplicar.
   ═══════════════════════════════════════════════════════════════ */
import {
  parseQuery,
  buildFtsQuery,
  parseRelativeDate,
  normalize,
  normStrict,
  normDomain,
  tokenizeQuery,
} from './parser.js?v=d338c86cf3';
// Núcleo del buscador (shared/busqueda/): una sola definición de qué casa.
import { interpretarConsulta, paraArchivo, paraPrensa } from './busqueda/consulta.js?v=d338c86cf3';
import { palabrasDe, rangosResaltado } from './busqueda/texto.js?v=d338c86cf3';
import { compilarTemas, temasQueCasan, compiladoDeTemas, etiquetaVisible } from './busqueda/temas.js?v=d338c86cf3';
import { comparador } from './busqueda/orden.js?v=d338c86cf3';
// Datos compartidos con el lector (shared/sync/): una regla de fusión.
import {
  normalizeUrlForMatch, fusionarPendientes, fusionarPerfil, limpiarPerfil,
  fusionarLeidas, fusionarModos, masReciente, huella, huellaModo,
  CAMPOS_PERFIL, LEIDAS_MAX, limpiarColores, CLAVES_COLORES,
} from './sync/fusion.js?v=d338c86cf3';
import { paletaPersonalizada, contraste, VARS_PERSONALIZADAS } from './tema/personalizado.js?v=d338c86cf3';
// Sincronización entre dispositivos (cliente y código; servidor: workers/cf-sync).
import { crearCliente, SERVIDORES_SYNC } from './sync/cliente.js?v=d338c86cf3';
import { generarCodigo, limpiarCodigo, formatearCodigo } from './sync/cripto.js?v=d338c86cf3';
// El tiempo (eltiempo:): búsqueda de municipios; la lista se importa al usarla.
import { indexar, sugerirMunicipios, municipiosExactos, provinciaDe } from './tiempo/lugares.js?v=d338c86cf3';
import {
  PESO, comunidadDeZona, zonaHorariaAviso, empezado,
  filtrarAvisos, agruparAvisos,
} from './tiempo/avisos.js?v=d338c86cf3';

import { I18N, traducir } from './idiomas/index.js?v=d338c86cf3';
/* ═══════════════════════════════════════════════════════════════
   CONFIG
   ═══════════════════════════════════════════════════════════════ */
const REPORT_EMAIL = 'thendabs1@gmail.com';
const REPORT_REPO = 'thendabs1/voceiro';


// ── Backends (switch CF ↔ Deno) ──
const BACKENDS = {
  cf:   { data: 'https://voceiro-datos.toriorecorda.workers.dev',
          buscar: 'https://voceiro-buscar.toriorecorda.workers.dev' },
  deno: { data: 'https://voceiro-datos.thendabs1.deno.net',
          buscar: 'https://voceiro-buscar.thendabs1.deno.net' },
};
const BACKEND_KEY = 'voceiro-backend-v1';
const BACKEND_TIMEOUT_MANIFEST_MS = 5000;
const BACKEND_TIMEOUT_CF_MS = 10000;
const BACKEND_RECHECK_MS = 5 * 60 * 1000;

let BACKEND_ACTIVO = 'cf';
let DATA_BASE     = BACKENDS.cf.data;
let WORKER_BUSCAR = BACKENDS.cf.buscar;
let _ultimoRecheckCF = 0;
let _conmutacionEnCurso = null;




const PRENSA_CACHE_KEY = 'voceiro-prensa-cache-v1';
const PRENSA_CACHE_TTL_MS = 30 * 60 * 1000;
const PRENSA_DEBOUNCE_MS = 1500;




/* ═══════════════════════════════════════════════════════════════
   SWITCH DE BACKEND (CF ↔ Deno)
   - Al arrancar, intenta el backend guardado (por defecto CF).
   - Si el manifest falla, conmuta al otro backend.
   - Si un fetch falla mid-sesión estando en CF, conmuta a Deno y reintenta.
   - Al volver a la pestaña tras >5 min oculta, re-prueba CF si estamos en Deno.
   ═══════════════════════════════════════════════════════════════ */

function _leerBackendGuardado(){
  try {
    const v = localStorage.getItem(BACKEND_KEY);
    if (v === 'cf' || v === 'deno') return v;
  } catch(e){}
  return 'cf';
}

function _guardarBackend(nombre){
  try { localStorage.setItem(BACKEND_KEY, nombre); } catch(e){}
}

function _aplicarBackend(nombre){
  if (nombre !== 'cf' && nombre !== 'deno') nombre = 'cf';
  BACKEND_ACTIVO = nombre;
  DATA_BASE     = BACKENDS[nombre].data;
  WORKER_BUSCAR = BACKENDS[nombre].buscar;
}

function _otroBackend(){
  return BACKEND_ACTIVO === 'cf' ? 'deno' : 'cf';
}

// Combina un signal externo con timeout si estamos en CF.
function _signalConTimeout(signal, timeoutMs){
  if (BACKEND_ACTIVO !== 'cf' || !timeoutMs) return signal;
  const t = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, t]) : t;
}

// Conmuta al otro backend una sola vez por ráfaga de fallos.
async function _conmutarBackendPorFallo(){
  if (_conmutacionEnCurso) return _conmutacionEnCurso;
  const nuevo = _otroBackend();
  _conmutacionEnCurso = (async () => {
    console.info(`[backend] fallo en ${BACKEND_ACTIVO} → conmutando a ${nuevo}`);
    _aplicarBackend(nuevo);
    _guardarBackend(nuevo);
    setTimeout(() => { _conmutacionEnCurso = null; }, 5000);
  })();
  return _conmutacionEnCurso;
}

// Probe silencioso a CF. No bloquea, no avisa.
async function _probarCFEnBackground(){
  _ultimoRecheckCF = Date.now();
  try {
    const r = await fetch(`${BACKENDS.cf.data}/manifest.json`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    });
    if (!r.ok) return false;
    // Cuerpo completo dentro del plazo: CF puede dar cabeceras al momento
    // y atascarse después.
    await r.arrayBuffer();
    if (BACKEND_ACTIVO === 'deno'){
      console.info('[backend] CF responde de nuevo → volviendo a CF');
      _aplicarBackend('cf');
      _guardarBackend('cf');
    }
    return true;
  } catch(e){
    return false;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (BACKEND_ACTIVO !== 'deno') return;
  if (Date.now() - _ultimoRecheckCF < BACKEND_RECHECK_MS) return;
  _probarCFEnBackground();
});

// Manifest con timeout y fallback automático.
// Devuelve el objeto parseado, o lanza si ambos backends fallan.
async function _fetchManifestConFallback(signal){
  const intentar = async (nombre) => {
    const url = `${BACKENDS[nombre].data}/manifest.json`;
    let sig = signal;
    if (nombre === 'cf'){
      const t = AbortSignal.timeout(BACKEND_TIMEOUT_MANIFEST_MS);
      sig = signal ? AbortSignal.any([signal, t]) : t;
    }
    const r = await fetch(url, { cache: 'no-cache', signal: sig });
    if (!r.ok) throw new Error('manifest HTTP ' + r.status);
    return await r.json();
  };

  const principal = _leerBackendGuardado();
  _aplicarBackend(principal);

  try {
    return await intentar(principal);
  } catch(e){
    if (signal && signal.aborted) throw e;   // abort real del caller
    const otro = principal === 'cf' ? 'deno' : 'cf';
    console.info(`[backend] ${principal} falló (${e.message}) → probando ${otro}`);
    const data = await intentar(otro);
    _aplicarBackend(otro);
    _guardarBackend(otro);
    return data;
  }
}
const PUEDE_COMPARTIR =   //dejar vacío para autodetectar, poner true para TEST.
  typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/* ── Fase 2 · días en memoria ── */
const DIAS_MEMORIA_KEY = 'voceiro-dias-memoria';
const DIAS_MEMORIA_DEF = 3;
const DIAS_MEMORIA_VALIDOS = [1, 3, 7, 20, 30];
const DIAS_MEMORIA_MAX_SCOPE = 30;
// Por encima de esta estimación, cambiar los días pide confirmación.
const DIAS_UMBRAL_TITULARES = 10000;

function cargarDiasMemoria() {
  try {
    const raw = localStorage.getItem(DIAS_MEMORIA_KEY);
    const n = parseInt(raw, 10);
    if (DIAS_MEMORIA_VALIDOS.includes(n)) return n;
  } catch(e){}
  return DIAS_MEMORIA_DEF;
}

let DIAS_MEMORIA = cargarDiasMemoria();

let PRENSA_ACTIVA = true;    // encendida salvo que se apague en este dispositivo
let PRENSA_ABORT = null;
let PRENSA_TIMER = null;
let PRENSA_CLAVE = null;   // clave de la consulta con prensa pendiente
let PRENSA_HECHA = null;   // clave cuya prensa ya está en NOTICIAS
let PRENSA_FALLO = null;   // clave cuya petición falló (no se repite sola)
let PRENSA_LANG = 'es';
let PRENSA_PAIS = 'ES';

// Listas de opciones para los selects de prensa externa
const PRENSA_LANGS = [
  { code: 'es', labelKey: 'optLangEs' },
  { code: 'gl', labelKey: 'optLangGl' },
  { code: 'ca', labelKey: 'optLangCa' },
  { code: 'eu', labelKey: 'optLangEu' },
  { code: 'en', labelKey: 'optLangEn' },
];

const PRENSA_PAISES = [
  { code: 'ES', labelKey: 'prensaPaisES' },
  { code: 'MX', labelKey: 'prensaPaisMX' },
  { code: 'AR', labelKey: 'prensaPaisAR' },
  { code: 'CO', labelKey: 'prensaPaisCO' },
  { code: 'CL', labelKey: 'prensaPaisCL' },
  { code: 'GB', labelKey: 'prensaPaisUK' },
  { code: 'US', labelKey: 'prensaPaisUS' },
];
function t(key, vars){
  return traducir((ACCES && ACCES.lang) || 'es', key, vars);
}

const $ = sel => document.querySelector(sel);


function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
// Icono del sprite (ver <svg class="sprite"> al principio del body).
function ico(nombre){
  return `<svg class="ico" aria-hidden="true"><use href="#i-${nombre}"/></svg>`;
}
function limpiarCdata(s){
  if (!s) return '';
  let x = String(s).trim();
  let changed = true;
  while (changed){
    changed = false;
    if (x.startsWith('<![CDATA[')){ x = x.slice(9); changed = true; }
    if (x.endsWith(']]>')){ x = x.slice(0, -3); changed = true; }
    x = x.trim();
  }
  return x;
}
function _escapeRegex(s){
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function parseLista(txt){
  return txt.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
}
// accion (opcional): { texto, fn } → botón dentro del aviso, p. ej. «Deshacer».
function toast(msg, ms, accion){
  ms = ms || 2400;
  const wrap = $('#toast-wrap');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  if (accion){
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast-accion';
    b.textContent = accion.texto;
    b.addEventListener('click', () => { el.remove(); accion.fn(); }, { once: true });
    el.appendChild(b);
  }
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, ms);
}
function debounce(fn, ms){
  let t;
  const wrapped = function(){
    const args = arguments, ctx = this;
    clearTimeout(t);
    t = setTimeout(() => { t = null; fn.apply(ctx, args); }, ms);
  };
  wrapped.cancel = () => { clearTimeout(t); t = null; };
  return wrapped;
}

/* ═══════════════════════════════════════════════════════════════
   FECHAS
   ═══════════════════════════════════════════════════════════════ */
const HORIZONTE_FUTURO_MS = 1 * 60 * 60 * 1000;

let ABS_FMT = null;
let ABS_FMT_LANG = null;
const ABS_CACHE = new Map();

function getAbsFmt(){
  if (ABS_FMT_LANG !== ACCES.lang){
    ABS_FMT = new Intl.DateTimeFormat(ACCES.lang, {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
    ABS_FMT_LANG = ACCES.lang;
    ABS_CACHE.clear();
  }
  return ABS_FMT;
}


function parseFecha(s){
  if (!s) return NaN;
  const str = String(s).trim();
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m){
    const [, d, mo, y, h = 0, mi = 0, se = 0] = m;
    const t = new Date(+y, +mo - 1, +d, +h, +mi, +se).getTime();
    return isNaN(t) ? NaN : t;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(str)){
    const t = Date.parse(str);
    if (!isNaN(t)) return t;
  }
  const t = Date.parse(str);
  return !isNaN(t) ? t : NaN;
}

// En la tarjeta la parte absoluta va aparte para ocultarla en móvil (CSS).
function fechaTarjetaHtml(ts){
  const txt = formatearFecha(ts);
  const corte = txt.lastIndexOf(' · ');
  if (corte < 0 || ts > Date.now()) return escapeHtml(txt);
  return `<span class="fecha-abs">${escapeHtml(txt.slice(0, corte + 3))}</span>${escapeHtml(txt.slice(corte + 3))}`;
}

function formatearFecha(ts){
  if (isNaN(ts)) return '';
  let abs = ABS_CACHE.get(ts);
  if (abs === undefined){
    abs = getAbsFmt().format(ts);
    ABS_CACHE.set(ts, abs);
  }
  const diff = Date.now() - ts;
  if (diff < 0) return abs + ' · ' + t('fechaProgramado');
  if (diff >= 7 * 86400000) return abs;
  const min = (diff / 60000) | 0;
  const hr  = (diff / 3600000) | 0;
  const dia = (diff / 86400000) | 0;
  let rel;
  if (min < 1) rel = t('fechaAhora');
  else if (min < 60) rel = t('fechaHaceMin', { n: min });
  else if (hr < 24) rel = t('fechaHaceH', { n: hr });
  else rel = t('fechaHaceD', { n: dia });
  return abs + ' · ' + rel;
}
/* ═══════════════════════════════════════════════════════════════
   ACCESIBILIDAD
   ═══════════════════════════════════════════════════════════════ */
const ACCES_DEF = {
  lang: 'es', tema: 'light', fuente: 'sans',
  fs: 18, width: 1100,
  just: false, bionic: false, focus: false, fechaLarga: false,
};
const LIM = {
  fs: { min: 14, max: 32, step: 1 },
  width: { min: 480, max: 1600, step: 40 },
};

/* ═══════════════════════════════════════════════════════════════
   EDICIONES
   Portadas complementarias por dominio. El recolector las publica en
   manifest.portadas (EDICIONES en recolector.py); aquí cada edición
   dice qué idioma toma por defecto y qué portadas añade a la general.
   ═══════════════════════════════════════════════════════════════ */
const EDICIONES_FRONT = {
  gal: { lang: 'gl', portadas: ['gal'] },
  cat: { lang: 'ca', portadas: ['cat'] },
  eus: { lang: 'eu', portadas: ['eus'] },
  es:  { lang: 'es', portadas: ['nac'] },
  en:  { lang: 'en', portadas: ['int'] },
};
// hostname (sin www.) → edición. Se rellena al tener los dominios.
const HOST_EDICION = {};

// ?ed= (solo esa carga, para probar en cualquier dominio) → hostname → ninguna.
function resolverEdicion(){
  try {
    const ed = new URLSearchParams(location.search).get('ed');
    if (ed && EDICIONES_FRONT[ed]) return ed;
  } catch(e){}
  return HOST_EDICION[location.hostname.replace(/^www\./, '')] || '';
}
const EDICION = resolverEdicion();
// Idioma por defecto de la edición; si el usuario guardó uno, manda el suyo.
if (EDICION) ACCES_DEF.lang = EDICIONES_FRONT[EDICION].lang;

// Portadas adicionales activas: la elección guardada o, si no hay, las de
// la edición.
const PORTADAS_KEY = 'voceiro-portadas-v1';
function cargarPortadasActivas(){
  try {
    const a = JSON.parse(localStorage.getItem(PORTADAS_KEY) || 'null');
    if (Array.isArray(a)) return a;
  } catch(e){}
  return EDICION ? [...EDICIONES_FRONT[EDICION].portadas] : [];
}
function guardarPortadasActivas(){
  try { localStorage.setItem(PORTADAS_KEY, JSON.stringify(PORTADAS_ACTIVAS)); } catch(e){}
}
let PORTADAS_ACTIVAS = cargarPortadasActivas();

let _firmaPerfilVoceiro = null;   // campos comunes con el lector, al guardar
let ACCES = cargarAcces();
_firmaPerfilVoceiro = firmaPerfil(ACCES);

function cargarAcces(){
  try{
    const raw = localStorage.getItem('voceiro-acces-v2');
    const o = raw ? { ...ACCES_DEF, ...JSON.parse(raw) } : accesPrimeraVisita();
    if (!I18N[o.lang]) o.lang = 'es';
    return o;
  }catch(e){ return { ...ACCES_DEF }; }
}
// Primera visita (ninguna clave voceiro- guardada): idioma y tema claro u
// oscuro del navegador. Se guarda ya, para que no cambie en la siguiente
// visita; a quien ya usaba la web sin tocar nada no se le cambia.
function accesPrimeraVisita(){
  const o = { ...ACCES_DEF };
  if (Object.keys(localStorage).some(k => k.startsWith('voceiro-'))) return o;
  const langs = navigator.languages && navigator.languages.length
    ? navigator.languages : [navigator.language || ''];
  for (const l of langs){
    const c = String(l).toLowerCase().split('-')[0];
    if (I18N[c]){ o.lang = c; break; }
  }
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) o.tema = 'dark';
  localStorage.setItem('voceiro-acces-v2', JSON.stringify(o));
  return o;
}
function guardarAcces(){
  // Si cambia algo del perfil común con el lector, se sella y se le manda.
  const firma = firmaPerfil(ACCES);
  if (firma !== _firmaPerfilVoceiro){
    ACCES.actualizado = Date.now();
    _firmaPerfilVoceiro = firma;
    enviarEstadoAlLector();
    sincronizarPronto();
  }
  try{ localStorage.setItem('voceiro-acces-v2', JSON.stringify(ACCES)); }catch(e){}
}
// Tema personalizado: data-theme es su base (claro u oscuro, por los colores
// de estado) y encima, en línea, las variables que salen de sus colores.
function aplicarTemaPersonalizado(h){
  VARS_PERSONALIZADAS.forEach(k => h.style.removeProperty('--' + k));
  h.style.removeProperty('color-scheme');
  const colores = ACCES.tema === 'custom' ? limpiarColores(ACCES.colores) : null;
  if (!colores) return null;
  const { base, vars } = paletaPersonalizada(colores);
  for (const [k, v] of Object.entries(vars)) h.style.setProperty(k === 'color-scheme' ? k : '--' + k, v);
  return base;
}
// Al elegir «Personalizado» la primera vez se parte de los colores que hay.
function coloresDelTemaActual(){
  const cs = getComputedStyle(document.documentElement);
  const hex6 = v => {
    v = String(v || '').trim().toLowerCase();
    if (/^#[0-9a-f]{3}$/.test(v)) v = '#' + [...v.slice(1)].map(c => c + c).join('');
    return /^#[0-9a-f]{6}$/.test(v) ? v : null;
  };
  return limpiarColores({
    fondo: hex6(cs.getPropertyValue('--bg')) || '#ffffff',
    texto: hex6(cs.getPropertyValue('--fg')) || '#222222',
    enlaces: hex6(cs.getPropertyValue('--accent')) || '#d32f2f',
    titulos: hex6(cs.getPropertyValue('--titulos')) || '#222222',
  });
}
function pintarEditorColores(){
  const caja = $('#ac-colores');
  if (!caja) return;
  const colores = ACCES.tema === 'custom' ? limpiarColores(ACCES.colores) : null;
  caja.hidden = !colores;
  if (!colores) return;
  CLAVES_COLORES.forEach(k => { const inp = $('#ac-color-' + k); if (inp && inp.value !== colores[k]) inp.value = colores[k]; });
  caja.querySelectorAll('.ac-contraste').forEach(sp => {
    const r = contraste(colores[sp.dataset.cr], colores.fondo);
    const poco = r < 4.5;
    sp.classList.toggle('poco', poco);
    sp.textContent = r.toLocaleString(ACCES.lang, { maximumFractionDigits: 1 }) + ':1' +
      (poco ? ' · ⚠ ' + t('acPocoContraste') : ' ✓');
  });
}

function aplicarAcces(){
  const h = document.documentElement;
  h.lang = ACCES.lang;
  h.dataset.theme  = aplicarTemaPersonalizado(h) || ACCES.tema;
  h.dataset.font   = ACCES.fuente;
  h.dataset.fechaLarga = ACCES.fechaLarga ? '1' : '0';
  h.dataset.just   = ACCES.just ? '1' : '0';
  h.dataset.bionic = ACCES.bionic ? '1' : '0';
  h.dataset.focus  = ACCES.focus ? '1' : '0';
  h.style.setProperty('--fs', ACCES.fs + 'px');
  h.style.setProperty('--w', ACCES.width + 'px');

  document.querySelectorAll('.opt-group').forEach(g => {
    const clave = g.dataset.grupo;
    if (clave !== 'tema' && clave !== 'fuente' && clave !== 'extra') return;
    g.querySelectorAll('button').forEach(b => {
      if (clave === 'extra') b.classList.toggle('active', !!ACCES[b.dataset.val]);
      else                   b.classList.toggle('active', b.dataset.val === String(ACCES[clave]));
    });
  });

  $('#fs-val').textContent = ACCES.fs;
  $('#w-val').textContent  = ACCES.width;
  pintarEditorColores();

  if (ACCES.focus) setTimeout(updateFocus, 30);
}
function ajustarFs(d){
  ACCES.fs = Math.max(LIM.fs.min, Math.min(LIM.fs.max, ACCES.fs + d * LIM.fs.step));
  guardarAcces(); aplicarAcces();
}
function ajustarWidth(d){
  ACCES.width = Math.max(LIM.width.min, Math.min(LIM.width.max, ACCES.width + d * LIM.width.step));
  guardarAcces(); aplicarAcces();
}
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
/* ═══════════════════════════════════════════════════════════════
   MENÚ ⋯ DE CADA TITULAR
   Uno solo, dentro de #resultados. Sus botones llevan las clases y el
   data-idx que antes estaban en la tarjeta (.btn-add-item, .btn-block-item,
   .btn-report-item), así que wireResultadosDelegation los atiende igual.
   ═══════════════════════════════════════════════════════════════ */
function cerrarMenuMas(){
  // Quitar el listener siempre: un repintado del feed borra el menú sin pasar por aquí.
  document.removeEventListener('pointerdown', _menuMasFuera, true);
  const m = document.getElementById('menu-mas');
  if (!m) return;
  m.remove();
  document.querySelectorAll('.btn-mas-item[aria-expanded="true"]')
    .forEach(b => b.setAttribute('aria-expanded', 'false'));
}
function _menuMasFuera(e){
  if (e.target.closest('#menu-mas') || e.target.closest('.btn-mas-item')) return;
  cerrarMenuMas();
}
function abrirMenuMas(btn){
  const idx = btn.dataset.idx;
  const abierto = document.getElementById('menu-mas');
  cerrarMenuMas();
  if (abierto && abierto.dataset.idx === idx) return;   // segundo clic: cierra
  const n = ULT_FILTRADAS[parseInt(idx, 10)];
  const cont = $('#resultados');
  if (!n || !cont) return;

  // Si el medio ya está incluido en el modo activo, «Añadir» no tiene sentido.
  const yaForzado = PRESET_ACTIVO && overrideIncluye(getOverride(n.dominio));
  const item = (cls, icono, texto) =>
    `<button type="button" role="menuitem" class="${cls}" data-idx="${idx}">${ico(icono)}<span>${escapeHtml(texto)}</span></button>`;
  const m = document.createElement('div');
  m.id = 'menu-mas';
  m.className = 'menu-mas';
  m.dataset.idx = idx;
  m.setAttribute('role', 'menu');
  m.innerHTML =
    (yaForzado ? '' : item('btn-add-item', 'plus', t('addToModoTitle')))
    + item('btn-block-item', 'ban', t('blockMedia'))
    // Cómo se lee este medio en el lector: su regla, en Ajustes › Lector.
    + (USCRIPT_OK ? item('btn-leer-item', 'book-open-text', t('comoLeerlo')) : '')
    + item('btn-report-item', 'flag', t('repBtnTitle'));
  cont.appendChild(m);

  // Bajo el botón, alineado por la derecha con él.
  const rb = btn.getBoundingClientRect();
  const rc = cont.getBoundingClientRect();
  m.style.top   = (rb.bottom - rc.top + 4) + 'px';
  m.style.right = Math.max(0, rc.right - rb.right) + 'px';
  btn.setAttribute('aria-expanded', 'true');
  document.addEventListener('pointerdown', _menuMasFuera, true);
}

/* ═══════════════════════════════════════════════════════════════
   DESTINO DE OVERRIDE (➕ / 🚫) CUANDO NO HAY MODO ACTIVO
   Fila expandida dentro de la propia tarjeta
   ═══════════════════════════════════════════════════════════════ */
let _destinoIdxAbierto = -1;

function cerrarDestinoInline(){
  if (_destinoIdxAbierto < 0) return;
  const el = document.querySelector('.destino-inline[data-idx="' + _destinoIdxAbierto + '"]');
  if (el){ el.hidden = true; el.innerHTML = ''; }
  _destinoIdxAbierto = -1;
}

function abrirDestinoInline(idx, accion){
  // Toggle: si ya estaba abierto en esta tarjeta, cerrar
  if (_destinoIdxAbierto === idx){
    cerrarDestinoInline();
    return;
  }
  cerrarDestinoInline();

  const cont = document.querySelector('.destino-inline[data-idx="' + idx + '"]');
  if (!cont) return;

  const activoId = PRESET_ACTIVO && PRESETS ? PRESETS.activo : null;

  let html = `<span class="destino-lbl">${
    escapeHtml(accion === 'include' ? t('destinoAnadirA') : t('destinoBloquearEn'))
  }</span>`;

  if (accion === 'ignore'){
    html += `<button type="button" class="destino-btn" data-destino-id="__todos">${escapeHtml(t('destinoTodosModos'))}</button>`;
  }
  PRESETS.lista.forEach(p => {
    const activo = p.id === activoId;
    html += `<button type="button" class="destino-btn${activo ? ' activo' : ''}"
                    data-destino-id="${escapeHtml(p.id)}">${escapeHtml(p.nombre)}</button>`;
  });

  html += `<button type="button" class="destino-btn nuevo" data-destino-id="__nuevo">+ ${escapeHtml(t('destinoNuevoModo'))}</button>`;

  cont.innerHTML = html;
  cont.hidden = false;
  _destinoIdxAbierto = idx;

  cont.querySelectorAll('.destino-btn').forEach(b => {
    b.addEventListener('click', ev => {
      ev.stopPropagation();
      ev.preventDefault();
      const id = b.dataset.destinoId;
      const n = ULT_FILTRADAS[idx];
      if (!n) { cerrarDestinoInline(); return; }

      if (id === '__todos'){
        PRESETS.lista.forEach(p => {
          if (!p.overrides) p.overrides = {};
          p.overrides[n.dominio] = 'ignore';
        });
        guardarPresets();
        ajRefrescar();
        toast(`${t('destinoOkTodos')} · ${n.medio || n.dominio}`, 2400);
        cerrarDestinoInline();
        return;
      }
      if (id === '__nuevo'){
        const nuevo = crearModoYDevolver();
        if (nuevo) aplicarOverrideEnModo(nuevo, accion, n.dominio, n.medio || n.dominio);
        cerrarDestinoInline();
        return;
      }
      const target = PRESETS.lista.find(p => p.id === id);
      if (target) aplicarOverrideEnModo(target, accion, n.dominio, n.medio || n.dominio);
      cerrarDestinoInline();
    });
  });
}

function aplicarOverrideEnModo(targetPreset, accion, dominio, medioNombre){
  if (!targetPreset) return;

  if (targetPreset === PRESET){
    // Ruta normal: reusa setOverride (persiste, refresca botón de preset)
    setOverride(dominio, accion);
  } else {
    if (!targetPreset.overrides || typeof targetPreset.overrides !== 'object'){
      targetPreset.overrides = {};
    }
    targetPreset.overrides[dominio] = accion;
    guardarPresets();
  }

  ajRefrescar();

  if (PRESET_ACTIVO && targetPreset === PRESET){
    aplicarFiltros();
    const ok = accion === 'include' ? t('destinoOkAnadido') : t('destinoOkBloqueado');
    toast(`${ok} · ${medioNombre}`, 2000);
  } else {
    const ok = accion === 'include' ? t('destinoOkAnadidoEn') : t('destinoOkBloqueadoEn');
    toast(`${ok} «${targetPreset.nombre}» · ${medioNombre}`, 2400);
  }
}

function crearModoYDevolver(){
  const nombre = prompt(t('cfgModoNombrePrompt'), '');
  if (nombre == null) return null;
  const limpio = nombre.trim();
  if (!limpio) return null;

  const nuevo = {
    id: 'm-' + Date.now().toString(36),
    nombre: limpio,
    grupos: [],
    palabras: [],
    overrides: {},
  };
  PRESETS.lista.push(nuevo);
  guardarPresets();
  ajRefrescar();
  return nuevo;
}
/* ═══════════════════════════════════════════════════════════════
   BIONIC
   ═══════════════════════════════════════════════════════════════ */
const BIONIC_CACHE = new Map();
const BIONIC_CACHE_MAX = 8000;

function bionicize(html){
  if (!ACCES.bionic) return html;
  const cached = BIONIC_CACHE.get(html);
  if (cached !== undefined) return cached;
  let result = html;
  try{
    const doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
    const root = doc.body.firstChild;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    let n; while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(tn => {
      const raw = tn.textContent;
      if (!raw || !/[\wÁÉÍÓÚÑáéíóúñ]/.test(raw)) return;
      const frag = doc.createDocumentFragment();
      const re = /([\wÁÉÍÓÚÑáéíóúñ]+)/g;
      let last = 0, m;
      while ((m = re.exec(raw)) !== null){
        if (m.index > last) frag.appendChild(doc.createTextNode(raw.slice(last, m.index)));
        const w = m[1];
        const half = Math.max(1, Math.ceil(w.length / 2));
        const b = doc.createElement('b');
        b.textContent = w.slice(0, half);
        frag.appendChild(b);
        frag.appendChild(doc.createTextNode(w.slice(half)));
        last = m.index + w.length;
      }
      if (last < raw.length) frag.appendChild(doc.createTextNode(raw.slice(last)));
      tn.parentNode.replaceChild(frag, tn);
    });
    result = root.innerHTML;
  }catch(e){ result = html; }
  if (BIONIC_CACHE.size >= BIONIC_CACHE_MAX) BIONIC_CACHE.clear();
  BIONIC_CACHE.set(html, result);
  return result;
}

function updateFocus(){
  const items = document.querySelectorAll('.noticia');
  if (!ACCES.focus){
    items.forEach(el => el.classList.remove('foco-dim','foco-active'));
    return;
  }
  if (!items.length) return;
  const mid = window.innerHeight / 2;
  let best = null, bd = Infinity;
  items.forEach(el => {
    const r = el.getBoundingClientRect();
    const d = Math.abs((r.top + r.bottom) / 2 - mid);
    if (d < bd){ bd = d; best = el; }
  });
  items.forEach(el => {
    el.classList.toggle('foco-dim', el !== best);
    el.classList.toggle('foco-active', el === best);
  });
}
window.addEventListener('scroll', () => {
  if (ACCES.focus) requestAnimationFrame(updateFocus);
}, { passive: true });




/* ═══════════════════════════════════════════════════════════════
   RESALTADO + IDIOMA
   El resaltado marca exactamente lo que casó con el texto de la búsqueda
   (rangosResaltado, shared/busqueda/texto.js): misma regla que el filtro.
   ═══════════════════════════════════════════════════════════════ */
function resaltarTitular(texto, compilado){
  if (!texto) return '';
  let out = '', last = 0;
  for (const [i, j] of rangosResaltado(texto, compilado)){
    out += escapeHtml(texto.slice(last, i)) + '<mark>' + escapeHtml(texto.slice(i, j)) + '</mark>';
    last = j;
  }
  return out + escapeHtml(texto.slice(last));
}

const LANG_OPTIONS = [
  { code: 'es', label: 'optLangEs' },
  { code: 'gl', label: 'optLangGl' },
  { code: 'ca', label: 'optLangCa' },
  { code: 'en', label: 'optLangEn' },
  { code: 'eu', label: 'optLangEu' },
];

function renderLangSelect(){
  const sel = $('#lang-select');
  sel.innerHTML = LANG_OPTIONS.map(o =>
    `<option value="${o.code}">${escapeHtml(t(o.label))}</option>`
  ).join('');
  sel.value = ACCES.lang;
  sel.setAttribute('aria-label', t('lblIdioma'));
}
/* ═══════════════════════════════════════════════════════════════
   LECTOR UNIVERSAL: PENDIENTES, PERFIL Y PUENTE
   Leídas y vistas son de esta página; Pendientes, el perfil de
   lectura y los modos se comparten con el lector por el puente.
   ═══════════════════════════════════════════════════════════════ */
// Leídas: URL → cuándo (ms). Con fecha, para juntarlas entre dispositivos
// y quedarse con las más recientes.
const LEIDAS_KEY = 'voceiro-leidas-v2';
const LEIDAS_KEY_V1 = 'voceiro-leidas-v1';
let LEIDAS_LOCAL = cargarLeidas();

function cargarLeidas(){
  try {
    const raw = localStorage.getItem(LEIDAS_KEY);
    if (raw) return new Map(JSON.parse(raw));
    const v1 = JSON.parse(localStorage.getItem(LEIDAS_KEY_V1) || '[]');
    return new Map((Array.isArray(v1) ? v1 : []).map(u => [u, 0]));
  } catch(e){ return new Map(); }
}
function guardarLeidas(){
  try { localStorage.setItem(LEIDAS_KEY, JSON.stringify([...LEIDAS_LOCAL])); } catch(e){}
}
function marcarLeidaLocal(url){
  const k = normalizeUrlForMatch(url);
  if (!k || LEIDAS_LOCAL.has(k)) return;
  LEIDAS_LOCAL.set(k, Date.now());
  if (LEIDAS_LOCAL.size > LEIDAS_MAX){
    LEIDAS_LOCAL = new Map([...LEIDAS_LOCAL].sort((a, b) => b[1] - a[1]).slice(0, LEIDAS_MAX - 1000));
  }
  guardarLeidas();
  sincronizarPronto();
}

const VISTAS_KEY = 'voceiro-vistas-v1';
let VISTAS_LOCAL = new Set();
try { VISTAS_LOCAL = new Set(JSON.parse(localStorage.getItem(VISTAS_KEY) || '[]')); } catch(e){}

let VISTAS_DIRTY = false;
function marcarVistaLocal(url){
  const k = normalizeUrlForMatch(url);
  if (!k || VISTAS_LOCAL.has(k)) return;
  VISTAS_LOCAL.add(k);
  if (VISTAS_LOCAL.size > 10000) VISTAS_LOCAL = new Set([...VISTAS_LOCAL].slice(-8000));
  VISTAS_DIRTY = true;
}
const persistirVistas = debounce(() => {
  if (!VISTAS_DIRTY) return;
  try { localStorage.setItem(VISTAS_KEY, JSON.stringify([...VISTAS_LOCAL])); } catch(e){}
  VISTAS_DIRTY = false;
}, 1000);
/* Lector conectado a esta página. USCRIPT_OK: hay lector con el puente v2.
   LECTOR_VIEJO: responde, pero con el puente antiguo (hay que actualizarlo). */
const PUENTE_V = 2;
let USCRIPT_OK = false;
let USCRIPT_CHECKED = false;
let LECTOR_VIEJO = false;

/* ── Pendientes: una sola lista, compartida con el lector ──
   PENDIENTES guarda también lo borrado (marcado, caduca solo): así el
   borrado viaja al lector. PENDIENTES_CACHE es lo que se ve. La fusión con
   lo del lector está en shared/sync/fusion.js. */
const PEND_KEY = 'voceiro-pendientes-v2';
const PEND_KEY_V1 = 'voceiro-pendientes-local-v1';
let PENDIENTES = cargarPendientes();
let PENDIENTES_CACHE = [];
let PENDIENTES_URLS = new Set();
let PENDIENTES_MAP  = new Map();

function cargarPendientes(){
  try {
    const raw = localStorage.getItem(PEND_KEY);
    if (raw){
      const arr = JSON.parse(raw);
      return fusionarPendientes(Array.isArray(arr) ? arr : [], []);
    }
    // Primera vez con la lista nueva: se trae la de este navegador.
    const v1 = JSON.parse(localStorage.getItem(PEND_KEY_V1) || '[]');
    const lista = fusionarPendientes(Array.isArray(v1) ? v1 : [], []);
    localStorage.setItem(PEND_KEY, JSON.stringify(lista));
    return lista;
  } catch(e){ return []; }
}
function guardarPendientes(){
  try { localStorage.setItem(PEND_KEY, JSON.stringify(PENDIENTES)); } catch(e){}
}

function actualizarSyncBanner(){
  const banner = $('#sync-banner');
  const txt = $('#sync-banner-text');
  if (!banner || !txt) return;
  banner.style.display = '';
  banner.querySelector('.sync-dot').classList.toggle('offline', !USCRIPT_OK);
  txt.textContent = USCRIPT_OK ? t('syncOnline')
                  : LECTOR_VIEJO ? t('syncLectorViejo')
                  : t('syncOffline');
  banner.title = USCRIPT_OK ? '' : t('syncOfflineHint');
}

function rebuildPendientes(){
  const visibles = PENDIENTES.filter(i => !i.borrado);
  PENDIENTES_CACHE = visibles;
  const map = new Map();
  visibles.forEach(i => map.set(normalizeUrlForMatch(i.url), i));
  PENDIENTES_MAP  = map;
  PENDIENTES_URLS = new Set(map.keys());

  refrescarBotonesGuardar();
  actualizarBotonPendientes();
  if ($('#panel-pendientes').classList.contains('open')){
    renderPendientes(PENDIENTES_CACHE);
  }
}

// Sustituye la lista, la guarda, la repinta y se la manda al lector.
function cambiarPendientes(nueva){
  PENDIENTES = fusionarPendientes(nueva, []);
  guardarPendientes();
  rebuildPendientes();
  enviarEstadoAlLector();
  sincronizarPronto();
}
function buscarPendiente(url){
  const k = normalizeUrlForMatch(url);
  return PENDIENTES.find(i => normalizeUrlForMatch(i.url) === k) || null;
}
function dominioDe(url){
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch(e){ return ''; }
}

// Guarda un titular para después (si estaba borrado, vuelve).
function addPendiente({ url, title, description, image }){
  if (!url) return false;
  const previo = buscarPendiente(url);
  if (previo && !previo.borrado) return false;
  const ahora = Date.now();
  cambiarPendientes([...PENDIENTES, {
    url, title: title || '', description: description || '', image: image || '',
    domain: dominioDe(url), date: ahora, read: false, readAt: null, actualizado: ahora
  }]);
  return true;
}
function setPendienteRead(url, read){
  const previo = buscarPendiente(url);
  if (!previo || previo.borrado || previo.read === !!read) return false;
  const ahora = Date.now();
  cambiarPendientes([...PENDIENTES.filter(i => i !== previo), {
    ...previo, read: !!read, readAt: read ? ahora : null, actualizado: ahora
  }]);
  return true;
}
function removePendiente(url){
  const previo = buscarPendiente(url);
  if (!previo || previo.borrado) return false;
  cambiarPendientes([...PENDIENTES.filter(i => i !== previo),
                     { ...previo, borrado: true, actualizado: Date.now() }]);
  return true;
}
// Al abrir un titular queda en Pendientes como leído: es el historial de
// lo leído que ya llevaba el lector, ahora el mismo con o sin él.
function registrarLeido(n){
  const previo = buscarPendiente(n.enlace);
  if (previo && !previo.borrado){
    setPendienteRead(n.enlace, true);
    return;
  }
  const ahora = Date.now();
  cambiarPendientes([...PENDIENTES.filter(i => i !== previo), {
    url: n.enlace, title: n.titular || '', description: n.grupo || '', image: '',
    domain: dominioDe(n.enlace), date: ahora, read: true, readAt: ahora, actualizado: ahora
  }]);
}

function desmarcarLeidaLocal(url){
  const k = normalizeUrlForMatch(url);
  if (!LEIDAS_LOCAL.has(k)) return;
  LEIDAS_LOCAL.delete(k);
  guardarLeidas();
}

/* ── Perfil de lectura común con el lector ──
   Idioma, tema, fuente, tamaño, justificado, biónica y foco; el ancho es de
   cada uno. ACCES.actualizado sella el último cambio de esos campos
   (guardarAcces) y decide qué perfil gana. */
function firmaPerfil(o){
  return huella(CAMPOS_PERFIL.map(k => o[k]));
}
function perfilDeVoceiro(){
  return limpiarPerfil({ ...ACCES, actualizado: ACCES.actualizado || 0 });
}
function aplicarPerfilEnVoceiro(p){
  const langAntes = ACCES.lang;
  CAMPOS_PERFIL.forEach(k => { if (p[k] !== undefined) ACCES[k] = p[k]; });
  if (!I18N[ACCES.lang]) ACCES.lang = langAntes;
  ACCES.fs = Math.min(LIM.fs.max, Math.max(LIM.fs.min, Number(ACCES.fs) || ACCES_DEF.fs));
  ACCES.actualizado = p.actualizado;
  _firmaPerfilVoceiro = firmaPerfil(ACCES);   // ya sellado: no es un cambio de aquí
  try{ localStorage.setItem('voceiro-acces-v2', JSON.stringify(ACCES)); }catch(e){}
  aplicarAcces();
  if (ACCES.lang !== langAntes){
    aplicarTextos();
    reconstruirSelectores();
    construirIndicesBusqueda();
    ajRefrescar();
  }
  renderizar();
}

/* ── Puente con el lector (v2) ──
   Eventos en document, uno por sentido para que nadie se oiga a sí mismo:
     · 'voceiro-ping'   Voceiro → lector; responde 'voceiro-pong' {v}.
     · 'voceiro-ready'  lector → Voceiro, al arrancar {v}.
     · 'voceiro-estado' Voceiro → lector {v, respuesta, pendientes, perfil, lector,
                        leidasHasta, sync}. sync: el código de sincronización, o
                        null; el lector lo sigue y sincroniza también por su cuenta
                        en las demás webs (lector/src/28-sincronizacion.js).
     · 'lector-estado'  lector → Voceiro {…, leidas}: lo que se ha terminado de
                        leer en el lector, [{url, fecha, quitar?}]. Voceiro lo
                        marca como leído y lo confirma con leidasHasta (la fecha
                        más nueva que ya tiene); el lector borra lo confirmado.
   Cada lado fusiona lo que le llega y, si lo suyo no coincide y el mensaje
   no era ya una respuesta, contesta una vez con lo suyo. Como fusionar da
   lo mismo en cualquier orden, tras ese ida y vuelta los dos coinciden. */
// Configuración propia del lector (reglas por sitio, diccionarios, servicios
// de «Abrir en…»…): Voceiro la guarda tal cual, sin mirarla, para llevarla a
// otros dispositivos con la sincronización. { datos, actualizado }.
const LECTOR_BLOQUE_KEY = 'voceiro-lector-bloque';
function cargarBloqueLector(){
  try {
    const b = JSON.parse(localStorage.getItem(LECTOR_BLOQUE_KEY) || 'null');
    return b && typeof b === 'object' ? b : null;
  } catch(e){ return null; }
}
function guardarBloqueLector(b){
  try { localStorage.setItem(LECTOR_BLOQUE_KEY, JSON.stringify(b)); } catch(e){}
}
function estadoDeVoceiro(respuesta){
  return {
    v: PUENTE_V, respuesta: !!respuesta,
    pendientes: PENDIENTES, perfil: perfilDeVoceiro(), lector: cargarBloqueLector(),
    leidasHasta: leidasDelLectorHasta(), sync: codigoSyncGuardado()
  };
}
// El guardado, no el de memoria: otra pestaña de Voceiro puede haberlo
// quitado o cambiado, y esta no debe devolvérselo al lector.
function codigoSyncGuardado(){
  try { return limpiarCodigo(localStorage.getItem(SYNC_CODIGO_KEY) || '') || null; } catch(e){ return null; }
}

// Leídas que manda el lector (lo terminado allí): hasta qué fecha las tengo.
const LEIDAS_LECTOR_KEY = 'voceiro-leidas-lector-hasta';
function leidasDelLectorHasta(){
  try { return Number(localStorage.getItem(LEIDAS_LECTOR_KEY)) || 0; } catch(e){ return 0; }
}
// Devuelve si ha marcado o desmarcado algo.
function recibirLeidasDelLector(lista){
  if (!Array.isArray(lista)) return false;
  const hasta = leidasDelLectorHasta();
  let nueva = hasta, cambio = false;
  for (const l of lista){
    const fecha = Number(l && l.fecha) || 0;
    if (!l || !l.url || fecha <= hasta) continue;
    const k = normalizeUrlForMatch(l.url);
    if (l.quitar){
      if (LEIDAS_LOCAL.has(k)){ desmarcarLeidaLocal(l.url); cambio = true; }
    } else if (!LEIDAS_LOCAL.has(k)){
      marcarLeidaLocal(l.url);
      cambio = true;
    }
    nueva = Math.max(nueva, fecha);
  }
  if (nueva > hasta){
    try { localStorage.setItem(LEIDAS_LECTOR_KEY, String(nueva)); } catch(e){}
  }
  return cambio || nueva > hasta;
}

// Repinta como leídas (o no) las tarjetas de la lista, sin rehacerla: lo
// que llega del lector mientras Voceiro está detrás no debe moverte el scroll.
function pintarLeidasEnLista(){
  document.querySelectorAll('#resultados .noticia').forEach(art => {
    const n = ULT_FILTRADAS[parseInt(art.dataset.idx, 10)];
    if (!n) return;
    const key = normalizeUrlForMatch(n.enlace);
    const item = PENDIENTES_MAP.get(key);
    const leida = !!(item && item.read) || LEIDAS_LOCAL.has(key);
    art.classList.toggle('leida', leida);
    if (leida) art.classList.remove('vista');
  });
  refrescarBotonesGuardar();
}
function comparable(d){
  return huella({
    pendientes: fusionarPendientes(d && d.pendientes, []),
    perfil: limpiarPerfil(d && d.perfil),
    lector: d && d.lector ? { datos: d.lector.datos, actualizado: d.lector.actualizado || 0 } : null
  });
}
let __lectorPuenteJSON = false;
function enviarEstadoAhora(respuesta){
  if (!USCRIPT_OK) return;
  try {
    document.dispatchEvent(new CustomEvent('voceiro-estado', {
      detail: __lectorPuenteJSON ? JSON.stringify(estadoDeVoceiro(respuesta)) : structuredClone(estadoDeVoceiro(respuesta))
    }));
  } catch(e){}
}
// Cambios de aquí: se juntan los de unos instantes en un solo envío.
var _enviarEstadoDiferido;
function enviarEstadoAlLector(){
  if (!_enviarEstadoDiferido) _enviarEstadoDiferido = debounce(() => enviarEstadoAhora(false), 300);
  _enviarEstadoDiferido();
}

function recibirEstadoDelLector(d){
  const fusion = fusionarPendientes(PENDIENTES, d.pendientes);
  const pendCambian = huella(fusion) !== huella(PENDIENTES);
  if (pendCambian){
    PENDIENTES = fusion;
    guardarPendientes();
    rebuildPendientes();
    sincronizarPronto();
  }
  const hastaAntes = leidasDelLectorHasta();
  const leidasCambian = recibirLeidasDelLector(d.leidas);
  if (pendCambian || leidasCambian) pintarLeidasEnLista();
  // Un perfil sin sellar (nadie lo ha cambiado desde que se comparten) no
  // se impone: se unifican con el primer cambio, en cualquiera de los dos.
  const mio = perfilDeVoceiro();
  const perfil = fusionarPerfil(mio, d.perfil);
  if (perfil && perfil.actualizado > 0 && huella(perfil) !== huella(mio)){
    aplicarPerfilEnVoceiro(perfil);
    sincronizarPronto();
  }

  // Configuración del lector: se guarda la más reciente, para el servidor.
  const bloque = cargarBloqueLector();
  const elegido = masReciente(bloque, d.lector || null);
  if (elegido && ((elegido.actualizado || 0) > 0 || !bloque) && huella(elegido) !== huella(bloque)){
    guardarBloqueLector(elegido);
    sincronizarPronto();
  }
  // Se contesta si lo mío no coincide o si hay leídas nuevas que confirmar
  // (esto último, aunque lo recibido ya fuera una respuesta: la mía también
  // lo es, y el lector no contesta a respuestas).
  const confirmar = leidasDelLectorHasta() > hastaAntes;
  if (confirmar || (!d.respuesta && comparable(estadoDeVoceiro()) !== comparable(d))) enviarEstadoAhora(true);
}

function initUserScriptBridge(){
  rebuildPendientes();

  const conectar = e => {
    let d;
    try { d = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail; } catch(e){ return; }
    const v = d && d.v;
    if (typeof e.detail === 'string' && v === PUENTE_V) __lectorPuenteJSON = true;
    USCRIPT_CHECKED = true;
    if (v === PUENTE_V){
      const primera = !USCRIPT_OK;
      USCRIPT_OK = true;
      LECTOR_VIEJO = false;
      if (primera) enviarEstadoAhora(false);
    } else if (!USCRIPT_OK){
      LECTOR_VIEJO = true;
    }
    actualizarBotonPendientes();
    actualizarSyncBanner();
    if (ajRuta() === 'lector') ajPintarLector();
  };
  document.addEventListener('voceiro-ready', conectar);
  document.addEventListener('voceiro-pong', conectar);

  document.addEventListener('lector-estado', e => {
    let d;
    try { d = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail; } catch(e){ return; }
    if (!d || typeof d !== 'object' || d.v !== PUENTE_V) return;
    if (!USCRIPT_OK) conectar({ detail: { v: PUENTE_V } });
    recibirEstadoDelLector(d);
  });

  document.dispatchEvent(new CustomEvent('voceiro-ping'));

  setTimeout(() => {
    if (!USCRIPT_CHECKED){
      USCRIPT_CHECKED = true;
      actualizarBotonPendientes();
      actualizarSyncBanner();
    }
  }, 900);
}

function guardarParaLeerDespues(n){
  const url = n.enlace;
  const item = PENDIENTES_MAP.get(normalizeUrlForMatch(url));

  // No está → se añade
  if (!item){
    addPendiente({ url, title: n.titular, description: n.grupo || '' });
    toast(t('savedToReader'), 1800);
    return;
  }

  // Ya está → alterna leída / no leída
  const nuevaLeida = !item.read;
  if (nuevaLeida) marcarLeidaLocal(url);
  else            desmarcarLeidaLocal(url);
  setPendienteRead(url, nuevaLeida);
}
/* ═══════════════════════════════════════════════════════════════
   SINCRONIZACIÓN ENTRE DISPOSITIVOS
   Sin cuentas: un código que solo tienen tus dispositivos. Todo se cifra
   aquí (shared/sync/cripto.js) y el servidor (workers/cf-sync) guarda un
   bloque que no puede leer. Viajan Pendientes, leídas, perfil de lectura,
   modos y la configuración del lector. La fusión es la de
   shared/sync/fusion.js; aquí se decide cuándo y se vuelca el resultado.
   ═══════════════════════════════════════════════════════════════ */
const SYNC_CODIGO_KEY = 'voceiro-sync-codigo';
const SYNC_ULTIMA_KEY = 'voceiro-sync-ultima';
const SYNC_UNIRSE_KEY = 'voceiro-sync-unirse';   // hasta la primera sincronización
// var: guardarPresets, marcarLeidaLocal… pueden llamar a sincronizarPronto
// antes de que este bloque se haya evaluado.
var SYNC_CODIGO = null;
var _sync = { enCurso: null, otraVez: false, ultima: 0, error: '', espera: 0,
              diferido: null, reintento: null, volcando: false, cliente: null, unirse: false };

function cargarSync(){
  try {
    SYNC_CODIGO = limpiarCodigo(localStorage.getItem(SYNC_CODIGO_KEY) || '') || null;
    _sync.ultima = Number(localStorage.getItem(SYNC_ULTIMA_KEY)) || 0;
    _sync.unirse = localStorage.getItem(SYNC_UNIRSE_KEY) === '1';
  } catch(e){}
}

// Un cambio de aquí: se sube a los pocos segundos, juntando los seguidos.
function sincronizarPronto(){
  if (!SYNC_CODIGO || _sync.volcando || _sync.borrando) return;
  clearTimeout(_sync.diferido);
  _sync.diferido = setTimeout(sincronizarAhora, 4000);
}

function documentoLocal(){
  const doc = {
    v: 1,
    pendientes: PENDIENTES,
    leidas: Object.fromEntries(LEIDAS_LOCAL),
    perfil: perfilDeVoceiro(),
    modos: { lista: PRESETS.lista, borrados: PRESETS.borrados || {} },
    lector: cargarBloqueLector(),
  };
  // Al unir este dispositivo, lo que nadie ha tocado aquí (sin sello) cede
  // ante lo que ya hay en los otros: se trae, en vez de juntarse a ciegas.
  if (_sync.unirse){
    if (!(doc.perfil && doc.perfil.actualizado > 0)) doc.perfil = null;
    doc.modos = { lista: PRESETS.lista.filter(m => m.actualizado > 0), borrados: doc.modos.borrados };
    if (!(doc.lector && doc.lector.actualizado > 0)) doc.lector = null;
  }
  return doc;
}

async function sincronizarAhora(){
  if (!SYNC_CODIGO || _sync.borrando) return;
  const codigo = SYNC_CODIGO;
  if (_sync.enCurso){ _sync.otraVez = true; return _sync.enCurso; }
  clearTimeout(_sync.diferido);
  clearTimeout(_sync.reintento);
  if (!_sync.cliente) _sync.cliente = crearCliente({ servidores: SERVIDORES_SYNC });
  _sync.enCurso = (async () => {
    try {
      const { documento } = await _sync.cliente.sincronizar(codigo, documentoLocal());
      if (codigo !== SYNC_CODIGO) return;
      const eraUnirse = _sync.unirse;
      volcarDocumento(documento);
      _sync.ultima = Date.now();
      _sync.error = '';
      _sync.espera = 0;
      _sync.unirse = false;
      // Lo de aquí que no se mandó al unirse (modos sin sello nuevos) sube ahora.
      if (eraUnirse) sincronizarPronto();
      try {
        localStorage.setItem(SYNC_ULTIMA_KEY, String(_sync.ultima));
        localStorage.removeItem(SYNC_UNIRSE_KEY);
      } catch(e){}
    } catch (e){
      if (codigo !== SYNC_CODIGO) return;
      if (e?.code === 'SYNC_REVOCADO'){
        olvidarSync();
        toast(t('syncRevocado'), 6000);
        return;
      }
      // Sin red, servidor caído (p. ej. Cloudflare bloqueado durante un
      // partido)…: no pasa nada, todo sigue aquí; se reintenta con calma.
      _sync.error = (e && e.message) || String(e);
      _sync.espera = Math.min((_sync.espera || 15000) * 2, 15 * 60000);
      _sync.reintento = setTimeout(sincronizarAhora, _sync.espera);
    } finally {
      _sync.enCurso = null;
      ajPintarSyncEstado();
      if (_sync.otraVez){ _sync.otraVez = false; sincronizarPronto(); }
    }
  })();
  return _sync.enCurso;
}

// Vuelca aquí lo que viene del servidor, fusionándolo con lo que haya ahora
// (puede haber cambiado mientras iba y venía). Lo que nadie ha tocado
// (sello 0) no se impone sobre lo de este dispositivo.
function volcarDocumento(doc){
  const unirse = _sync.unirse;
  _sync.volcando = true;
  try {
    let refiltrar = false;

    const pendientes = fusionarPendientes(PENDIENTES, doc.pendientes);
    if (huella(pendientes) !== huella(PENDIENTES)){
      PENDIENTES = pendientes;
      guardarPendientes();
      rebuildPendientes();
      enviarEstadoAlLector();
    }

    const leidas = fusionarLeidas(Object.fromEntries(LEIDAS_LOCAL), doc.leidas);
    if (Object.keys(leidas).length !== LEIDAS_LOCAL.size ||
        Object.entries(leidas).some(([k, v]) => LEIDAS_LOCAL.get(k) !== v)){
      LEIDAS_LOCAL = new Map(Object.entries(leidas));
      guardarLeidas();
      refiltrar = true;
    }

    // Al unirse, lo que llega se adopta y se sella ahora: así llega también
    // al lector de este dispositivo y a los demás.
    const mio = perfilDeVoceiro();
    let perfil = unirse ? (doc.perfil || null) : fusionarPerfil(mio, doc.perfil);
    if (perfil && unirse && !(perfil.actualizado > 0)) perfil = { ...perfil, actualizado: Date.now() };
    if (perfil && perfil.actualizado > 0 && huella(perfil) !== huella(mio)){
      aplicarPerfilEnVoceiro(perfil);
      enviarEstadoAlLector();
    }

    const misModos = unirse ? PRESETS.lista.filter(m => m.actualizado > 0) : PRESETS.lista;
    if (volcarModos(fusionarModos({ lista: misModos, borrados: PRESETS.borrados || {} }, doc.modos), unirse)){
      refiltrar = true;
    }

    const bloque = cargarBloqueLector();
    let elegido = unirse ? (doc.lector || bloque) : masReciente(bloque, doc.lector || null);
    if (elegido && unirse && elegido !== bloque && !(elegido.actualizado > 0)){
      elegido = { ...elegido, actualizado: Date.now() };
    }
    if (elegido && (elegido.actualizado || 0) > 0 && huella(elegido) !== huella(bloque)){
      guardarBloqueLector(elegido);
      enviarEstadoAlLector();
    }

    if (refiltrar){
      refrescarBotonesGuardar();
      if (typeof NOTICIAS !== 'undefined' && NOTICIAS.length) aplicarFiltros();
    }
  } finally {
    _sync.volcando = false;
  }
}

// Modos que llegan: cada uno sustituye al de aquí salvo que ninguno de los
// dos esté sellado; los nuevos se añaden al final y los borrados se quitan.
// El orden de la lista es el de este dispositivo.
function volcarModos(m, unirse){
  if (!m || !Array.isArray(m.lista)) return false;
  const llegan = new Map(m.lista.map(x => [x.id, x]));
  const borrados = m.borrados || {};
  const nueva = [];
  let cambio = false;
  for (const local of PRESETS.lista){
    const r = llegan.get(local.id);
    if (r){
      llegan.delete(local.id);
      const sinSello = !(local.actualizado > 0) && !(r.actualizado > 0);
      if ((sinSello && !unirse) || huellaModo(r) === huellaModo(local)){ nueva.push(local); continue; }
      nueva.push(normalizarPreset(r));
      cambio = true;
    } else if (borrados[local.id] !== undefined){
      cambio = true;
    } else {
      nueva.push(local);
    }
  }
  for (const r of llegan.values()){ nueva.push(normalizarPreset(r)); cambio = true; }
  const borradosAntes = huella(PRESETS.borrados || {});
  PRESETS.borrados = { ...borrados };
  if (!cambio){
    if (huella(PRESETS.borrados) !== borradosAntes){
      try{ localStorage.setItem(PRESET_KEY, JSON.stringify(PRESETS)); }catch(e){}
    }
    return false;
  }
  if (!nueva.length) nueva.push(structuredClone(PRESET_UNICO_DEF));
  PRESETS.lista = nueva;
  if (!nueva.some(x => x.id === PRESETS.activo)) PRESETS.activo = nueva[0].id;
  PRESET = PRESETS.lista.find(x => x.id === PRESETS.activo);
  _huellasModos = huellasDeModos();   // lo que llega no se vuelve a sellar
  try{ localStorage.setItem(PRESET_KEY, JSON.stringify(PRESETS)); }catch(e){}
  try{ localStorage.setItem(PRESET_ID_KEY, PRESETS.activo); }catch(e){}
  recompilarPreset();
  actualizarBotonPreset();
  ajRefrescar();
  return true;
}

// unirse: el código ya existe (otro dispositivo); si no, es uno nuevo.
function activarSync(codigo, unirse){
  SYNC_CODIGO = codigo;
  _sync.error = '';
  _sync.unirse = !!unirse;
  try {
    localStorage.setItem(SYNC_CODIGO_KEY, codigo);
    if (unirse) localStorage.setItem(SYNC_UNIRSE_KEY, '1');
    else localStorage.removeItem(SYNC_UNIRSE_KEY);
  } catch(e){}
  ajPintarSync();
  enviarEstadoAlLector();
  sincronizarAhora();
}
function olvidarSync(){
  SYNC_CODIGO = null;
  _sync.ultima = 0;
  _sync.error = '';
  _sync.unirse = false;
  clearTimeout(_sync.diferido);
  clearTimeout(_sync.reintento);
  try {
    localStorage.removeItem(SYNC_CODIGO_KEY);
    localStorage.removeItem(SYNC_ULTIMA_KEY);
    localStorage.removeItem(SYNC_UNIRSE_KEY);
  } catch(e){}
  ajPintarSync();
  enviarEstadoAlLector();
}
function enlaceSync(){
  return location.origin + location.pathname + '#sync=' + formatearCodigo(SYNC_CODIGO);
}

// Enlace …/voceiro/#sync=CÓDIGO (lo de tras # no llega a ningún servidor):
// se quita de la barra de direcciones y se pregunta antes de unirse.
function leerEnlaceSync(){
  const m = location.hash.match(/^#sync=([A-Za-z0-9-]+)$/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  const c = limpiarCodigo(m[1]);
  if (!c || c === SYNC_CODIGO) return;
  if (!confirm(t('syncUnirConfirm'))) return;
  activarSync(c, true);
  abrirAjustes('sync');
}

async function copiarTexto(texto, aviso){
  try {
    await navigator.clipboard.writeText(texto);
    toast(aviso, 2000);
  } catch(e){
    prompt('', texto);
  }
}

async function alternarQr(){
  const caja = $('#sync-qr'), btn = $('#sync-qr-btn');
  if (!caja.hidden){
    caja.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    return;
  }
  try {
    const { default: qrcode } = await import('./vendor/qrcode-1.4.4.js?v=d338c86cf3');
    const qr = qrcode(0, 'M');
    qr.addData(enlaceSync());
    qr.make();
    caja.innerHTML = qr.createSvgTag(4, 2);
    const svg = caja.querySelector('svg');
    if (svg){
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', t('syncQrAlt'));
    }
    caja.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  } catch(e){
    toast(t('syncQrError'), 2400);
  }
}

function haceCuanto(ms){
  const rtf = new Intl.RelativeTimeFormat(ACCES.lang, { numeric: 'auto' });
  const seg = Math.round((ms - Date.now()) / 1000);
  if (Math.abs(seg) < 60) return rtf.format(seg, 'second');
  const min = Math.round(seg / 60);
  if (Math.abs(min) < 60) return rtf.format(min, 'minute');
  const h = Math.round(min / 60);
  if (Math.abs(h) < 24) return rtf.format(h, 'hour');
  return rtf.format(Math.round(h / 24), 'day');
}

// Ajustes › Sincronización
function ajPintarSync(){
  const on = !!SYNC_CODIGO;
  $('#sync-off').hidden = on;
  $('#sync-on').hidden = !on;
  if (on) $('#sync-codigo').textContent = formatearCodigo(SYNC_CODIGO);
  else { $('#sync-qr').hidden = true; $('#sync-qr-btn').setAttribute('aria-expanded', 'false'); }
  ajPintarSyncEstado();
}
function ajPintarSyncEstado(){
  const el = $('#sync-estado');
  if (!el || !SYNC_CODIGO) return;
  el.textContent = _sync.enCurso ? t('syncSincronizando')
    : _sync.error ? t('syncError', { X: _sync.error })
    : _sync.ultima ? t('syncUltima', { X: haceCuanto(_sync.ultima) })
    : t('syncNunca');
}

function wireSync(){
  $('#sync-activar').addEventListener('click', () => activarSync(limpiarCodigo(generarCodigo())));
  const unir = () => {
    const c = limpiarCodigo($('#sync-unir-codigo').value);
    const error = $('#sync-unir-error');
    if (!c){
      error.textContent = t('syncCodigoInvalido');
      error.hidden = false;
      return;
    }
    error.hidden = true;
    $('#sync-unir-codigo').value = '';
    activarSync(c, true);
  };
  $('#sync-unir').addEventListener('click', unir);
  $('#sync-unir-codigo').addEventListener('keydown', e => { if (e.key === 'Enter') unir(); });
  $('#sync-copiar').addEventListener('click', () => copiarTexto(formatearCodigo(SYNC_CODIGO), t('syncCopiado')));
  $('#sync-enlace').addEventListener('click', () => copiarTexto(enlaceSync(), t('syncEnlaceCopiado')));
  $('#sync-qr-btn').addEventListener('click', alternarQr);
  $('#sync-ahora').addEventListener('click', () => { sincronizarAhora(); ajPintarSyncEstado(); });
  $('#sync-desvincular').addEventListener('click', () => {
    if (confirm(t('syncDesvincularConfirm'))) olvidarSync();
  });
  $('#sync-borrar').addEventListener('click', async () => {
    if (!confirm(t('syncBorrarConfirm'))) return;
    if (_sync.borrando) return;
    const codigo = SYNC_CODIGO;
    _sync.borrando = true;
    try {
      // Esperar una primera alta en curso antes de borrar, y no lanzar otra.
      await _sync.enCurso;
      if (!_sync.cliente) _sync.cliente = crearCliente({ servidores: SERVIDORES_SYNC });
      await _sync.cliente.borrar(codigo);
      if (codigo === SYNC_CODIGO) olvidarSync();
      toast(t('syncBorrado'), 2400);
    } catch(e){
      toast(t('syncError', { X: (e && e.message) || e }), 3200);
    } finally { _sync.borrando = false; }
  });
  // Al volver a la pestaña, lo último de los otros dispositivos.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && SYNC_CODIGO && Date.now() - _sync.ultima > 60000) sincronizarAhora();
  });
}
// Botón Guardar de la tarjeta: texto, título e icono de cada estado.
const GUARDAR_ESTADOS = {
  guardar:   { txt: 'saveLabelSave',    titulo: 'saveForLaterTitle', ico: 'clock-plus' },
  pendiente: { txt: 'saveLabelPending', titulo: 'markRead',          ico: 'clock' },
  leida:     { txt: 'saveLabelRead',    titulo: 'markUnread',        ico: 'circle-check' },
};
function guardarHtml(estado){
  const e = GUARDAR_ESTADOS[estado];
  return `${ico(e.ico)}<span class="save-txt">${escapeHtml(t(e.txt))}</span>`;
}
function pintarBotonGuardar(b, estado){
  b.dataset.estado = estado;
  b.title = t(GUARDAR_ESTADOS[estado].titulo);
  b.innerHTML = guardarHtml(estado);
}

function refrescarBotonesGuardar(){
  document.querySelectorAll('.btn-save-item').forEach(b => {
    const i = parseInt(b.dataset.idx, 10);
    const n = ULT_FILTRADAS[i];
    if (!n) return;
    const key = normalizeUrlForMatch(n.enlace);
    const guardada = PENDIENTES_URLS.has(key);
    const item = PENDIENTES_MAP.get(key);
    const leida = (guardada && item && item.read) || LEIDAS_LOCAL.has(key);

    pintarBotonGuardar(b, leida ? 'leida' : guardada ? 'pendiente' : 'guardar');
  });
}
// Al bajar se esconde lo que hay encima de la fila de filtros (en columna
// estrecha, la cabecera; en ancha, la línea de fecha) y vuelve completo tras
// subir SUBIR_CAB px seguidos. No se esconde con el foco de teclado dentro,
// con la búsqueda de móvil abierta ni con el menú de modo desplegado (ahí
// se queda como esté).
const SUBIR_CAB = 60;
function wireCabecera(){
  const barra = document.getElementById('barra-sup');
  const fila = barra?.querySelector('.filtros-row');
  if (!fila) return;
  let alto = 0;
  const medir = () => {
    // Las dos cajas llevan el mismo transform: la resta no depende de él.
    alto = Math.max(0, fila.getBoundingClientRect().top - barra.getBoundingClientRect().top - 6);
    barra.style.setProperty('--cab-h', alto + 'px');
  };
  new ResizeObserver(medir).observe(barra);
  medir();
  const fija = () => !!barra.querySelector(':focus-visible')
    || barra.querySelector('.filtros-wrap').classList.contains('busqueda-abierta')
    || document.getElementById('preset-menu').style.display !== 'none';
  const ocultar = v => barra.classList.toggle('cab-oculta', v);
  let ultY = window.scrollY, bajado = 0, subido = 0;
  window.addEventListener('scroll', () => {
    const y = window.scrollY, d = y - ultY;
    ultY = y;
    if (y <= alto){ bajado = subido = 0; ocultar(false); return; }
    if (fija()){ bajado = subido = 0; return; }
    if (d > 0){ bajado += d; subido = 0; if (bajado > alto) ocultar(true); }
    else if (d < 0){ subido -= d; bajado = 0; if (subido >= SUBIR_CAB) ocultar(false); }
  }, { passive: true });
  barra.addEventListener('focusin', () => { if (barra.querySelector(':focus-visible')) ocultar(false); });
}
function wireBackToTop(){
  const b = document.getElementById('btn-top');
  if (!b) return;
  const onScroll = () => {
    b.classList.toggle('show', window.scrollY > 400);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  b.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}
function abrirPendientes(){
  abrirPanel('panel-pendientes');
  renderPendientes(PENDIENTES_CACHE);
  enviarEstadoAhora(false);   // el lector contesta si tiene algo nuevo
}

function renderPendientes(items){
  const cont = $('#pendientes-lista');
  const local = USCRIPT_OK ? '' : `<p class="pend-local">${escapeHtml(t('pendLocalHint'))}</p>`;
  if (!items || !items.length){
    cont.innerHTML = `<div class="vacio">${escapeHtml(t('noPendientes'))}
      <p class="vacio-pista">${escapeHtml(t('pendVacioPista'))}</p></div>${local}`;
    return;
  }
  const noLeidas = items.filter(i => !i.read);
  const leidas   = items.filter(i => i.read);

  function fila(p, esLeida){
    const fecha = p.date ? new Date(p.date).toLocaleString(ACCES.lang) : '';
    return `
      <div class="pendiente-item${esLeida ? ' leida' : ''}">
        <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.title || p.url)}</a>
        <div class="pendiente-meta">
          ${p.domain ? `<span>${escapeHtml(p.domain)}</span>` : ''}
          ${fecha ? `<span>· ${escapeHtml(fecha)}</span>` : ''}
          ${esLeida && p.readAt ? `<span>· ${ico('check')} ${escapeHtml(p.readAt.slice(0,10))}</span>` : ''}
        </div>
        <div class="pendiente-actions">
          <button class="btn-pend-toggle" data-url="${escapeHtml(p.url)}" title="${esLeida ? escapeHtml(t('markUnread')) : escapeHtml(t('markRead'))}" aria-label="${esLeida ? escapeHtml(t('markUnread')) : escapeHtml(t('markRead'))}">${ico(esLeida ? 'rotate-ccw' : 'check')}</button>
          <button class="btn-pend-remove" data-url="${escapeHtml(p.url)}" title="${escapeHtml(t('deletePending'))}" aria-label="${escapeHtml(t('deletePending'))}">${ico('x')}</button>
        </div>
      </div>`;
  }

  let html = '';
  if (noLeidas.length){
    html += `<div style="font-size:.68em; color:var(--muted); text-transform:uppercase; letter-spacing:.05em; margin:8px 0 6px;">${escapeHtml(t('readItemsNo'))} (${noLeidas.length})</div>`;
    html += noLeidas.map(p => fila(p, false)).join('');
  } else {
    html += `<div class="vacio">${escapeHtml(t('noPendientes'))}</div>`;
  }

  if (leidas.length){
    html += `<div style="font-size:.68em; color:var(--muted); text-transform:uppercase; letter-spacing:.05em; margin:18px 0 6px;">${escapeHtml(t('readItems'))} (${leidas.length})</div>`;
    html += leidas.map(p => fila(p, true)).join('');
  }

  cont.innerHTML = html + local;

cont.querySelectorAll('.btn-pend-toggle').forEach(b => {
  b.onclick = () => {
    const url = b.dataset.url;
    const item = PENDIENTES_MAP.get(normalizeUrlForMatch(url));
    const nuevaLeida = !(item && item.read);
    if (nuevaLeida) marcarLeidaLocal(url);
    else            desmarcarLeidaLocal(url);
    setPendienteRead(url, nuevaLeida);
  };
});
cont.querySelectorAll('.btn-pend-remove').forEach(b => {
  b.onclick = () => {
    if (!confirm(t('confirmDeletePending'))) return;
    const url = b.dataset.url;
    removePendiente(url);
    desmarcarLeidaLocal(url);   // coherencia con LEIDAS_LOCAL
  };
});
}
/**
 * Busca un grupo en el bloque dias[i].grupos del manifest.
 * Match robusto por normStrict: 'Galicia' == 'Regional · Galicia' == 'regional-galicia'.
 */
function _buscarGrupoEnDia(diaGrupos, nombreGrupo) {
  if (!diaGrupos) return null;
  const objetivo = normStrict(nombreGrupo);
  for (const [k, v] of Object.entries(diaGrupos)) {
    if (normStrict(k) === objetivo) return v;
  }
  return null;
}

// Fichero de un grupo o de un medio en un día del manifest. El manifest
// da el nombre del de grupo (lleva hash) y no lista los de medio: se
// deducen, para los medios con noticias en la ventana (medias). El de
// antes traía {file, n, hash, kb} para los dos.
function _ficheroDeCapaEnDia(dia, tipo, valor) {
  if (tipo === 'grupo') {
    const g = _buscarGrupoEnDia(dia.grupos, valor);
    return !g ? '' : (typeof g === 'string' ? g : (g.file || ''));
  }
  if (tipo !== 'dominio') return '';
  if (dia.dominios) {
    const d = dia.dominios[valor];
    return (d && d.file) || '';
  }
  // Los días de antes del troceado no tienen ficheros de grupo ni de medio.
  if (!dia.grupos || !Object.keys(dia.grupos).length) return '';
  const medias = _manifest && _manifest.medias && _manifest.medias.dominios;
  return (medias && medias[valor]) ? `d-${valor}-${dia.fecha}.json` : '';
}


// ─── Decidir qué capas necesita el estado actual ───
// Con más dominios que esto, no se cargan ficheros por medio (sería
// demasiado): se filtra solo lo ya cargado.
const CAPAS_MAX_DOMINIOS = 12;

// Capas de R2 que necesita la consulta. Los filtros explícitos salen de lo
// que el núcleo ya resolvió (consulta.medios), así que coinciden con la
// lista: grupo:galicia carga «Regional · Galicia» (antes buscaba un grupo
// llamado 'galicia' y no cargaba nada).
function capasRequeridas(parsed, consulta = ULT_CTX && ULT_CTX.consulta) {
  const set = new Set();

    // 1) Preset activo → sus grupos + medios incluidos o favoritos
  if (PRESET_ACTIVO && presetTieneReglas()) {
    (PRESET.grupos || []).forEach(g => set.add('grupo:' + normStrict(g)));
    Object.entries(PRESET.overrides || {}).forEach(([d, v]) => {
      if (overrideIncluye(v)) set.add('dominio:' + normDomain(d));
    });
  }

  // 2) Filtros explícitos del usuario
  const doms = consulta && consulta.medios.dominios;
  if (doms && doms.size){
    if ((parsed.grupos || []).length){
      // Ficheros por grupo (uno por grupo y día), con el nombre real.
      for (const d of doms){
        const g = MEDIOS[d] && MEDIOS[d].g;
        if (g) set.add('grupo:' + normStrict(g));
      }
    } else if (doms.size <= CAPAS_MAX_DOMINIOS){
      for (const d of doms) set.add('dominio:' + d);
    }
  }

  return set;
}

// ─── Mergear items de una capa/base en NOTICIAS con dedup global ───
// Devuelve cuántos items NUEVOS se añadieron.
// clave: consulta que trajo los items (Turso y prensa). Un item que solo viene
// de ellas se ve únicamente mientras esa consulta esté activa (_pasaVista):
// así una búsqueda no deja sus resultados en el feed ni en la siguiente.
// rangoBase: posición del primer item en la respuesta del archivo (offset);
// con order:relevancia el worker los devuelve por bm25 y esa posición es el rango.
function _mergearItemsEnNoticias(items, capaKey, clave = null, rangoBase = null) {
  let añadidos = 0;
  let pos = 0;
  let rango = null;
  // La prensa lleva marca propia: su clave incluye idioma y país, y a lo suyo
  // no se le exigen las palabras en el titular (_pasaVista).
  const campo = capaKey === 'prensa' ? '_prensaPara' : '_consultas';
  const marcar = n => {
    if (!clave) return;
    (n[campo] || (n[campo] = new Set())).add(clave);
    if (rango !== null) n._rango = { clave, valor: rango };
  };

  for (const n of items) {
    rango = rangoBase === null ? null : rangoBase + pos++;
    const u = _claveUrl(n.u || '', n.d || '');
    const t = n.t ? normalize(n.t) : '';

    // ¿Ya existe por URL?
    if (u) {
      const existente = _itemPorUrl.get(u);
      if (existente) {
        _adoptarPublicacion(existente, n);
        existente._capas.add(capaKey);
        marcar(existente);
        continue;
      }
    }
    // ¿Ya existe por título? En prensa, el mismo titular en otro medio es
    // otra noticia (las de agencia): solo se une si es del mismo medio o si
    // el medio no se pudo resolver.
    if (t) {
      const existente = _itemPorTitulo.get(t);
      if (existente && (capaKey !== 'prensa' || n.d === 'news.google.com'
          || (existente.dominio || existente.d) === n.d)) {
        existente._capas.add(capaKey);
        marcar(existente);
        continue;
      }
    }

    // Es nuevo
    if (u) _urlsCargadas.add(u);
    if (t) _titulosCargados.add(t);

    n._capas = new Set([capaKey]);
    marcar(n);
    n._dia = n._dia || '';
    n._generado = n._generado || '';
    NOTICIAS.push(n);
    if (u) _itemPorUrl.set(u, n);
    if (t && !_itemPorTitulo.has(t)) _itemPorTitulo.set(t, n);
    añadidos++;
  }

  return añadidos;
}

// ─── Cargar una capa desde R2 ───
async function _cargarCapa(key, signal) {
  console.count('capa ' + key);
  const [tipo, valor] = key.split(':', 2);
  if (!_manifest || !_manifest.dias || !_manifest.dias.length) return 0;

  const diasMax = Math.min(DIAS_MEMORIA, DIAS_MEMORIA_MAX_SCOPE);
  const dias = _manifest.dias.slice(0, diasMax);
  const files = [];

  for (const dia of dias) {
    const f = _ficheroDeCapaEnDia(dia, tipo, valor);
    if (f) files.push(f);
  }

  if (!files.length) return 0;

  // Fetch con concurrencia 3
  const cola = files.slice();
  const nuevos = [];
  const workers = Array.from({ length: Math.min(3, cola.length) }, async () => {
    while (cola.length) {
      if (signal.aborted) return;
      const f = cola.shift();
      const data = await _fetchJSON(f, signal);
      if (!data) continue;
      if (data.medios) {
        for (const d in data.medios) MEDIOS[d] = data.medios[d];
      }
      const diaFecha = data.fecha || '';
      const generadoIso = data.generado || '';
      for (const n of (data.noticias || [])) {
        n._dia = diaFecha;
        n._generado = generadoIso;
        nuevos.push(n);
      }
    }
  });
  await Promise.all(workers);

  const añadidos = _mergearItemsEnNoticias(nuevos, key);
  if (añadidos > 0) {
    hidratarNoticias();
    construirMediosUnicos();
    construirIndicesBusqueda();
    if (ajRuta() === 'modo') {
      renderListaMedios();
    }
  }
  LAYERS.set(key, {
    files,
    cargada: Date.now(),
    lastUse: Date.now(),
    n: añadidos,
  });
  _itemsCargadosDeCapas += añadidos;
  return añadidos;
}

// Extiende una o varias capas pidiendo días [desde, hasta) desde el manifest.
// Diferencia con _cargarCapa: aquella carga [0, DIAS_MEMORIA), esta carga
// un rango arbitrario para paginación.
async function extenderCapasR2(capas, desde, hasta) {
  for (const key of capas) {
    const [tipo, valor] = key.split(':', 2);
    const dias = (_manifest.dias || []).slice(desde, hasta);
    if (!dias.length) continue;

    const files = [];
    for (const dia of dias) {
      const f = _ficheroDeCapaEnDia(dia, tipo, valor);
      if (f) files.push(f);
    }
    if (!files.length) continue;

    const cola = files.slice();
    const nuevos = [];
    const workers = Array.from({ length: Math.min(8, cola.length) }, async () => {
      while (cola.length) {
        const f = cola.shift();
        const data = await _fetchJSON(f);
        if (!data) continue;
        if (data.medios) {
          for (const d in data.medios) MEDIOS[d] = data.medios[d];
        }
        const diaFecha = data.fecha || '';
        const generadoIso = data.generado || '';
        for (const n of (data.noticias || [])) {
          n._dia = diaFecha;
          n._generado = generadoIso;
          nuevos.push(n);
        }
      }
    });
    await Promise.all(workers);

    const añadidos = _mergearItemsEnNoticias(nuevos, key);
    if (añadidos > 0) {
      hidratarNoticias();
      construirMediosUnicos();
      construirIndicesBusqueda();
      if (ajRuta() === 'modo') {
        renderListaMedios();
      }
    }
    _itemsCargadosDeCapas += añadidos;
  }
}


async function asegurarCapas(capas, signal) {
  const faltantes = [...capas].filter(k => !LAYERS.has(k));
  if (!faltantes.length) return false;

  // Si ya hay una carga en curso, nos colgamos de ella. Cuando termine,
  // re-evaluamos: puede que ya no falte nada (caso típico: aplicarFiltros
  // se dispara dos veces seguidas por el evento del userscript).
  if (_capaEnVuelo) {
    try { await _capaEnVuelo; } catch(e){}
    return asegurarCapas(capas, signal);
  }

  if (_itemsCargadosDeCapas >= LAYER_MAX_ITEMS) {
    toast('Límite de capas alcanzado. Recarga la página para resetear.', 3200);
    return false;
  }

  _capaEnVuelo = (async () => {
    let total = 0;
    for (const key of faltantes) {
      if (signal.aborted) return total;
      if (_itemsCargadosDeCapas >= LAYER_MAX_ITEMS) break;
      try {
        total += await _cargarCapa(key, signal);
      } catch(e) {
        if (e.name !== 'AbortError') console.warn('[capa]', key, e.message);
      }
    }
    return total;
  })();

  try {
    return (await _capaEnVuelo) > 0;
  } finally {
    _capaEnVuelo = null;
  }
}
// ─── Cargar base (portada) ───
async function cargarBase() {
  _cargandoScope = true;
  let myGen = 0;
  try {
    if (_scopeAbort) _scopeAbort.abort();
    _scopeAbort = new AbortController();
    myGen = ++_scopeGeneration;
    const signal = _scopeAbort.signal;

    _manifest = await _fetchManifestConFallback(signal);
    if (myGen !== _scopeGeneration) return;
    if (BACKEND_ACTIVO === 'deno') _probarCFEnBackground();

    // 2) Reset
    MEDIOS = {};
    NOTICIAS = [];
    BASE.items = [];
    BASE.cargada = false;
    LAYERS.clear();
    _itemsCargadosDeCapas = 0;
    _itemPorUrl.clear();
    _itemPorTitulo.clear();
    _urlsCargadas = new Set();
    _titulosCargados = new Set();
    _hidratadasHasta = 0;
    PRENSA_HECHA = null;       // su prensa ya no está en NOTICIAS
    PRENSA_FALLO = null;
    _dupsHechosHasta = 0;
    _dupsLogged = false;

    // 2.5) Catálogo completo (346 medios desde el manifest)
    //      Va antes de la portada para que MEDIOS_UNICOS arranque completo.
    //      La portada luego sobreescribe con datos frescos (mismos valores).
    if (_manifest.catalogo) {
      for (const d in _manifest.catalogo) {
        MEDIOS[d] = _manifest.catalogo[d];
      }
    }

    // 3) Base = portada general + portadas adicionales activas, pedidas
    //    en paralelo y mezcladas en orden (primero la general).
    const portadaFile = (_manifest.portada && _manifest.portada.file)
                        ? _manifest.portada.file : 'portada.json';
    const pExtras = _fetchPortadasExtra(PORTADAS_ACTIVAS, signal);
    const data = await _fetchJSON(portadaFile, signal);
    if (data) {
      if (data.medios) {
        for (const d in data.medios) MEDIOS[d] = data.medios[d];
      }
      const generado = data.generado || '';
      for (const n of (data.noticias || [])) {
        n._dia = data.fecha || '';
        n._generado = generado;
        BASE.items.push(n);
      }
      BASE.cargada = true;
      BASE.generado = generado;
      _mergearItemsEnNoticias(BASE.items, 'base');
      pintarFechaCabecera(generado);
    }
    _mergearPortadasExtra(await pExtras);
    renderListaPortadas();

    if (myGen === _scopeGeneration) refrescarVistaCompleta();
  } catch(e) {
    if (e.name === 'AbortError') return;
    throw e;
  } finally {
    if (myGen === _scopeGeneration) {
      _cargandoScope = false;
    }
  }
}

// ─── Portadas adicionales (ediciones) ───
// Pide las portadas de edición que existan en el manifest. Nunca falla:
// una portada que no llega se queda en data null y se ignora al mezclar.
function _fetchPortadasExtra(slugs, signal) {
  const portadas = (_manifest && _manifest.portadas) || {};
  const pedidas = slugs.filter(s => portadas[s] && portadas[s].file);
  return Promise.all(pedidas.map(slug =>
    _fetchJSON(portadas[slug].file, signal).then(data => ({ slug, data }))));
}

// Mezcla en NOTICIAS lo que trajo _fetchPortadasExtra. Devuelve cuántas
// noticias nuevas entraron (las que ya estaban en la general no cuentan).
function _mergearPortadasExtra(lista) {
  let añadidos = 0;
  for (const { slug, data } of lista) {
    if (!data) continue;
    if (data.medios) {
      for (const d in data.medios) MEDIOS[d] = data.medios[d];
    }
    const items = data.noticias || [];
    for (const n of items) {
      n._dia = data.fecha || '';
      n._generado = data.generado || '';
    }
    añadidos += _mergearItemsEnNoticias(items, 'portada:' + slug);
  }
  return añadidos;
}

// Casillas del panel: una por portada de edición que publique el manifest.
function renderListaPortadas() {
  const cont = $('#lista-portadas');
  if (!cont) return;
  const portadas = (_manifest && _manifest.portadas) || {};
  const slugs = Object.keys(portadas);
  $('#cfg-portadas-bloque').hidden = !slugs.length;
  cont.innerHTML = slugs.map(slug => {
    const clave = 'portada' + slug.charAt(0).toUpperCase() + slug.slice(1);
    const nombre = t(clave) === clave ? slug : t(clave);
    const marcada = PORTADAS_ACTIVAS.includes(slug) ? ' checked' : '';
    return `<label class="cfg-toggle">
      <input type="checkbox" data-portada="${escapeHtml(slug)}"${marcada}>
      <span class="cfg-toggle-txt">
        <span class="cfg-toggle-title">${escapeHtml(nombre)}</span>
        <span class="cfg-toggle-hint">${escapeHtml(t('cfgPortadaN', { n: portadas[slug].n || 0 }))}</span>
      </span>
    </label>`;
  }).join('');
}

// Activar una portada la añade sin recargar; quitarla obliga a rehacer la
// base, porque sus noticias ya están mezcladas en NOTICIAS.
function wirePortadas() {
  const cont = $('#lista-portadas');
  if (!cont) return;
  cont.addEventListener('change', async e => {
    const chk = e.target.closest('input[data-portada]');
    if (!chk) return;
    const slug = chk.dataset.portada;
    PORTADAS_ACTIVAS = PORTADAS_ACTIVAS.filter(s => s !== slug);
    if (chk.checked) PORTADAS_ACTIVAS.push(slug);
    guardarPortadasActivas();
    if (chk.checked) {
      if (_mergearPortadasExtra(await _fetchPortadasExtra([slug]))) {
        refrescarVistaCompleta();
      }
    } else {
      await cargarBase();
    }
  });
}
/* ═══════════════════════════════════════════════════════════════
   CARGA DE DATOS
   ═══════════════════════════════════════════════════════════════ */
let NOTICIAS = [];
let MEDIOS = {};
let MEDIOS_UNICOS = [];
let MEDIOS_STRICT   = new Map();
let DOMINIOS_STRICT = new Map();
let _manifest = null;   // guardamos el manifest para la fase 2

function pintarFechaCabecera(iso){
  const el = document.getElementById('fecha');
  if (!el) return;
  if (!iso) { el.textContent = ''; return; }
  const ts = parseFecha(iso);
  if (isNaN(ts)) { el.textContent = ''; return; }
  try {
    el.textContent = getAbsFmt().format(ts);
  } catch(e){
    el.textContent = new Date(ts).toLocaleString();
  }
}

/* ═══════════════════════════════════════════════════════════════
   FASE 2 · CARGA POR SCOPE
   ═══════════════════════════════════════════════════════════════ */

// Estado de dedup a nivel módulo (compartido entre cargas)
let _urlsCargadas = new Set();
let _titulosCargados = new Set();

// Fuente: 'all' | 'scope'
let _scopeActual = null;

/**
 * Punto de entrada. Reemplaza a cargarPortada().
 * Descarga el manifest, decide el scope y lanza la carga.
 */
let _scopeAbort = null;
let _scopeGeneration = 0;



// ═══════════════════════════════════════════════════════════════
// MODELO BASE + CAPAS
// BASE  = portada (siempre cargada)
// LAYER = slice (grupo o dominio) cargado on-demand
// NOTICIAS = vista materializada (BASE ∪ LAYERS)
// ═══════════════════════════════════════════════════════════════

const BASE = { items: [], cargada: false, generado: '' };

// key: 'grupo:nacional' | 'dominio:elpais.com'
// { items, files: [urls], cargada: ts, lastUse: ts }
const LAYERS = new Map();

const LAYER_MAX_ITEMS = 40000;   // cap de items únicos cargados desde capas
let _itemsCargadosDeCapas = 0;
let _capaEnVuelo = null;

// Índice inverso: url/título → item en NOTICIAS. Para añadir capas sin duplicar.
const _itemPorUrl = new Map();
const _itemPorTitulo = new Map();


/* ── Helpers de merge ── */

function _claveUrl(u, dominio) {
  const full = u.startsWith('http') ? u
             : (u.startsWith('/') ? `https://${dominio || ''}${u}` : u);
  return normalizeUrlForMatch(full);
}

// Los ficheros con hash en el nombre no cambian: force-cache. Los de medio
// (d-<dominio>-<fecha>) se reescriben con el mismo nombre mientras el día
// está vivo: caché normal, con la duración que da el worker (60 s y 304 si
// sigue igual; 1 día los congelados).
async function _fetchJSON(path, signal) {
  const cache = path.startsWith('d-') ? 'default' : 'force-cache';
  const intentar = async () => {
    const url = `${DATA_BASE}/${path}`;
    const sig = _signalConTimeout(signal, BACKEND_TIMEOUT_CF_MS);
    const r = await fetch(url, { cache, signal: sig });
    if (r.status >= 400 && r.status < 500) return null;   // 4xx: no retry
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  };

  try {
    return await intentar();
  } catch(e){
    if (signal && signal.aborted) return null;   // cancelado por el caller
    if (BACKEND_ACTIVO !== 'cf') return null;    // ya en Deno y falla: nada más
    await _conmutarBackendPorFallo();
    try { return await intentar(); } catch { return null; }
  }
}

/**
 * Mergea un slice/portada en NOTICIAS con dedup por URL + título.
 * Devuelve cuántas noticias se añadieron.
 */

function refrescarVistaCompleta(){
  hidratarNoticias();
  construirMediosUnicos();
  construirGruposDuplicados();
  construirIndicesBusqueda();
  reconstruirSelectores();
  aplicarFiltros();
  actualizarFiltrosCount();
  ajRefrescar();   // Ajustes abierto antes de que llegaran los datos
}

// Offset de Europe/Madrid ('+02:00' o '+01:00') para una hora local dada.
// Las HH:MM de los ficheros se escriben en hora de Madrid (recolector _hhmm),
// así que un '+02:00' fijo desplaza 1 h todo lo publicado en horario de
// invierno. Cacheado por día+hora: se llama por cada item al hidratar.
const _OFFSET_MADRID = new Map();
const _FMT_MADRID = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Madrid', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit',
});
function _horaMadridComoUTC(t){
  const p = {};
  for (const x of _FMT_MADRID.formatToParts(new Date(t))) p[x.type] = x.value;
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
}
function _offsetMadrid(dia, hhmm){
  const clave = dia + 'T' + hhmm;
  const enCache = _OFFSET_MADRID.get(clave);
  if (enCache) return enCache;
  const [y, m, d] = dia.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const local = Date.UTC(y, m - 1, d, h, mi);
  // Candidatos: los offsets de 12 h antes y después (uno a cada lado de un
  // posible cambio de hora) y el del instante corregido. Gana el mayor que
  // reproduce la hora local: en la hora ambigua de octubre es la primera
  // aparición, como zoneinfo con fold=0 en el recolector. Si la hora no
  // existe (marzo), queda el offset de antes del cambio, también como fold=0.
  const offEn = t => _horaMadridComoUTC(t) - t;
  const o1 = offEn(local);
  const o2 = offEn(local - o1);
  const candidatos = [...new Set([
    offEn(local - 12 * 3600e3), offEn(local + 12 * 3600e3), o1, o2,
  ])].sort((a, b) => b - a);
  const ms = candidatos.find(o => _horaMadridComoUTC(local - o) === local) ?? o2;
  const mins = Math.round(ms / 60000);
  const abs = Math.abs(mins);
  const off = (mins >= 0 ? '+' : '-')
            + String(Math.floor(abs / 60)).padStart(2, '0') + ':'
            + String(abs % 60).padStart(2, '0');
  _OFFSET_MADRID.set(clave, off);
  return off;
}

function reconstruirFecha(raw, dia){
  if (!raw) return '';
  const s = String(raw).trim();
  if (s.includes('T') && s.length > 10) return s;
  if (/^\d{2}:\d{2}$/.test(s) && dia){
    return `${dia}T${s}:00${_offsetMadrid(dia, s)}`;
  }
  return s;
}
let _hidratadasHasta = 0;
function hidratarNoticias(){
  const ahora = Date.now();
  const horizonte = ahora + HORIZONTE_FUTURO_MS;

  for (let i = _hidratadasHasta; i < NOTICIAS.length; i++){
    const n = NOTICIAS[i];
    if (n._hidratada) continue;
    n._hidratada = true;
    if (n.dominio === undefined) n.dominio = n.d || '';
    if (n.titular === undefined) n.titular = n.t || '';
    if (n.fuente === undefined) n.fuente = n.f || '';

    // ── URL: path (nuevo) o completa (viejo) ──
        // ── URL: path (nuevo) o completa (viejo) ──
    const u_raw = n.u || '';
    if (u_raw.startsWith('http://') || u_raw.startsWith('https://')){
      n.enlace = u_raw;
    } else if (u_raw.startsWith('/')){
      const m = MEDIOS[n.dominio] || {};
      const host = m.h || `www.${n.dominio}`;
      n.enlace = `https://${host}${u_raw}`;
    } else {
      n.enlace = u_raw;
    }

    // ── Fechas: HH:MM (nuevo) o ISO (viejo) ──
    n.fecha_pub      = reconstruirFecha(n.p, n._dia);
    n.fecha_estimada = reconstruirFecha(n.e, n._dia);
    // `c`: primera recogida. Los ficheros de antes no la traen: el generado.
    n.fecha          = reconstruirFecha(n.c, n._dia) || n._generado || '';

    n.titular = limpiarCdata(n.titular);

    const m = MEDIOS[n.dominio] || {};
    if (n.medio === undefined || !n.medio) n.medio = m.n || '';
    if (n.grupo === undefined || !n.grupo) n.grupo = m.g || '';
    if (n.tipo  === undefined || !n.tipo ) n.tipo  = m.t || '';
    if (n.lang  === undefined || !n.lang ) n.lang  = m.l || '';
    if (!Array.isArray(n.tags) || !n.tags.length) n.tags = m.tags || [];

    n._titularEsc = escapeHtml(n.titular);
    n._medioEsc   = escapeHtml(n.medio);
    n._tipoEsc    = escapeHtml(n.tipo);
    n._grupoEsc   = escapeHtml(n.grupo);
    n._enlaceEsc  = escapeHtml(n.enlace);
    n._esPreset   = false;

    _calcularFechas(n, horizonte);
  }
  _hidratadasHasta = NOTICIAS.length;
}

// Instantes de una noticia ya hidratada. Para ordenar y mostrar vale la
// publicación, la estimada o la recogida; para los filtros de tiempo
// (_tsActualidad), solo la publicación: la estimada sale de la posición en
// la portada y la recogida dice cuándo la vimos, no cuándo se publicó.
function _calcularFechas(n, horizonte){
  const tsPub = parseFecha(n.fecha_pub);
  const tsEst = parseFecha(n.fecha_estimada);
  const tsRec = parseFecha(n.fecha);

  let tsOrden = NaN;
  if (!isNaN(tsPub) && tsPub <= horizonte) tsOrden = tsPub;
  else if (!isNaN(tsEst)) tsOrden = tsEst;
  else if (!isNaN(tsRec)) tsOrden = tsRec;

  let tsShow = NaN;
  let tipoShow = 'none';
  if (!isNaN(tsPub)){ tsShow = tsPub; tipoShow = 'pub'; }
  else if (!isNaN(tsEst)){ tsShow = tsEst; tipoShow = 'est'; }
  else if (!isNaN(tsRec)){ tsShow = tsRec; tipoShow = 'rec'; }

  n._tsOrden      = tsOrden;
  n._tsActualidad = (!isNaN(tsPub) && tsPub <= horizonte) ? tsPub : NaN;
  n._tsShow       = tsShow;
  n._tipoShow     = tipoShow;
  n._esFuturo     = !isNaN(tsPub) && (tsPub > horizonte);
  n._tieneFecha   = !isNaN(tsOrden);
}

// Otra capa (la prensa, el archivo) trae la publicación que aquí faltaba:
// se adopta. La hora corta (HH:MM) es relativa al día de su fichero.
function _adoptarPublicacion(n, otra){
  if (n.p || !otra.p) return;
  const p = reconstruirFecha(otra.p, otra._dia || '');
  if (isNaN(parseFecha(p))) return;
  n.p = p;
  if (!n._hidratada) return;
  n.fecha_pub = p;
  _calcularFechas(n, Date.now() + HORIZONTE_FUTURO_MS);
}

function construirMediosUnicos(){
  MEDIOS_UNICOS = Object.entries(MEDIOS).map(([dominio, m]) => ({
    dominio,
    medio: m.n || '',
    grupo: m.g || '',
    tipo:  m.t || '',
    lang:  m.l || '',
    tags:  Array.isArray(m.tags) ? m.tags : [],
  })).sort((a,b) =>
    a.grupo.localeCompare(b.grupo) || a.medio.localeCompare(b.medio)
  );
}
let _dupsHechosHasta = 0;
let _dupsLogged = false;
function construirGruposDuplicados(){
  let total = 0;
  for (let i = _dupsHechosHasta; i < NOTICIAS.length; i++){
    const n = NOTICIAS[i];
    if (n._dupsHecho) continue;
    n._dupsHecho = true;

    if (Array.isArray(n.a) && n.a.length){
      n._dupHidden = n.a.map(o => {
        const dom = o.d || '';
        const u_raw = o.u || '';
        let enlace;
        if (u_raw.startsWith('http://') || u_raw.startsWith('https://')){
          enlace = u_raw;
        } else if (u_raw.startsWith('/')){
          const m = MEDIOS[dom] || {};
          const host = m.h || `www.${dom}`;
          enlace = `https://${host}${u_raw}`;
        } else {
          enlace = u_raw;
        }
        return {
          dominio: dom,
          medio:   (MEDIOS[dom] && MEDIOS[dom].n) || dom,
          enlace:  enlace,
        };
      });
      total += n.a.length;
    } else {
      n._dupHidden = null;
    }
  }
  _dupsHechosHasta = NOTICIAS.length;

  if (total && !_dupsLogged){
    console.log(`[dups] ${total} noticias referenciadas como 'alt'`);
    _dupsLogged = true;
  }
}

const MEDIOS_POR_NOMBRE = new Map();

function construirIndicesBusqueda(){
  MEDIOS_STRICT.clear();
  DOMINIOS_STRICT.clear();
  MEDIOS_POR_NOMBRE.clear();

  MEDIOS_UNICOS.forEach(m => {
    if (m.medio)   MEDIOS_STRICT.set(normStrict(m.medio), m.medio);
    if (m.dominio) DOMINIOS_STRICT.set(normDomain(m.dominio), m.dominio);
    if (m.medio && m.dominio){
      const clave = normStrict(m.medio);
      // Guarda anti-colisión: nombres de menos de 4 letras no entran
      // (Vox, EFE, ABC... son ambiguos y colisionan con partidos, siglas, etc.)
      if (clave.length >= 4 && !MEDIOS_POR_NOMBRE.has(clave)){
        MEDIOS_POR_NOMBRE.set(clave, m.dominio);
      }
    }
  });
}
/* ═══════════════════════════════════════════════════════════════
   HELPERS DE UNIFICACIÓN DE FILTROS
   Los selectores del panel escriben tokens en #buscar. #buscar es
   el estado único. aplicarFiltros lee solo de parseQuery.
   ═══════════════════════════════════════════════════════════════ */

// Reescribe #buscar: quita todos los tokens del prefijo indicado
// y añade uno nuevo si `value` es no vacío. Devuelve el nuevo string.
function rebuildInput(raw, prefix, value) {
  const tokens = tokenizeQuery(raw);
  const kept = tokens.filter(tk => (tk.prefix || '').toLowerCase() !== prefix);
  const parts = kept.map(tk => tk.raw);
  if (value !== null && value !== '' && value !== undefined) {
    const necesitaComillas = /\s/.test(value);
    parts.push(prefix + ':' + (necesitaComillas ? '"' + value + '"' : value));
  }
  return parts.join(' ');
}

// Aplica un cambio desde un selector al input y refiltra.
function writeFilterToInput(prefix, value) {
  aplicarFiltrosDebounced.cancel();
  const nuevo = rebuildInput($('#buscar').value, prefix, value);
  $('#buscar').value = nuevo;
  const clearBtn = $('#buscar-clear');
  if (clearBtn) clearBtn.hidden = !nuevo;
  aplicarFiltros();
}

// Clic en el nombre del medio de una tarjeta: afina la búsqueda actual a
// ese medio. Se conservan el texto, las fechas y el resto de filtros; los
// filtros de medio (medio:, web:, grupo:, y un dominio escrito suelto) se
// sustituyen por web:<dominio>.
function filtrarPorMedio(dominio) {
  if (!dominio) return;
  aplicarFiltrosDebounced.cancel();
  const raw = $('#buscar').value;
  const deMedio = new Set(parseQuery(raw).chips
    .filter(ch => ch.type === 'medio' || ch.type === 'dominio' || ch.type === 'grupo')
    .map(ch => ch.raw));
  const parts = tokenizeQuery(raw).filter(tk => !deMedio.has(tk.raw)).map(tk => tk.raw);
  parts.push('web:' + dominio);
  const nuevo = parts.join(' ');
  $('#buscar').value = nuevo;
  const clearBtn = $('#buscar-clear');
  if (clearBtn) clearBtn.hidden = !nuevo;
  aplicarFiltros();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Lee de parsed el primer valor de un prefijo (o null).
// parsed.grupos → prefijo 'grupo'; parsed.tipos → 'tipo'; parsed.order → 'order' (string)
function getParsedFirst(parsed, prefix) {
  switch (prefix) {
    case 'grupo':  return parsed.grupos[0] || null;   // normalizado
    case 'tipo':   return parsed.tipos[0]  || null;   // normalizado
    case 'lang':   return parsed.lang[0]   || null;   // normalizado
    case 'desde':  return parsed.desde     || null;   // ISO
    case 'hasta':  return parsed.hasta     || null;   // ISO
    case 'order':  return (parsed.order && parsed.order !== 'recientes') ? parsed.order : null;
    default:       return null;
  }
}
// Sincroniza los controles del panel con el estado de parsed.
// No dispara 'change' (usa .value = ...), así que no rebota.
function syncPanelFromParsed(parsed) {
  // Grupo: parsed.grupos[0] está normalizado ("espananacionales").
  // El select tiene valores display ("España · Nacionales"). Buscamos por normStrict.
  const gVal = getParsedFirst(parsed, 'grupo');
  const selG = $('#grupo');
  if (selG) {
    let match = '';
    if (gVal) {
      for (const opt of selG.options) {
        if (opt.value && normStrict(opt.value) === gVal) { match = opt.value; break; }
      }
    }
    if (selG.value !== match) selG.value = match;
  }

  // Tipo: parsed.tipos[0] normalizado, opciones display.
  const tVal = getParsedFirst(parsed, 'tipo');
  const selT = $('#tipo');
  if (selT) {
    let match = '';
    if (tVal) {
      for (const opt of selT.options) {
        if (opt.value && normStrict(opt.value) === tVal) { match = opt.value; break; }
      }
    }
    if (selT.value !== match) selT.value = match;
  }

  // Orden
  const oVal = getParsedFirst(parsed, 'order') || 'recientes';
  const selO = $('#orden');
  if (selO && selO.value !== oVal) selO.value = oVal;

  // Fechas (los <input type="date">)
  // NOTA: aquí SOLO sincronizamos valores. Los listeners 'change' van
  // en wireStaticEvents, porque esta función se llama en cada aplicarFiltros
  // y acumularía listeners (uno por tecla).
  const desde = getParsedFirst(parsed, 'desde') || '';
  const hasta = getParsedFirst(parsed, 'hasta') || '';
  const fD = $('#fecha-desde');
  const fH = $('#fecha-hasta');
  if (fD && fD.value !== desde) fD.value = desde;
  if (fH && fH.value !== hasta) fH.value = hasta;

  // Rango: «24 h» y «48 h» son exactamente desde:24h y desde:48h. Otro desde
  // (hoy, ayer, 2d, una fecha) no es una ventana móvil: el selector, en «Todo».
  const selR = $('#rango');
  if (selR) {
    // parsed.desde ya es un día: se mira lo escrito (gana el último desde:).
    const chD = (parsed.chips || []).filter(ch => ch.type === 'desde').pop();
    const vD = chD ? String(chD.value).toLowerCase() : '';
    const rMatch = vD === '24h' ? '1' : vD === '48h' ? '2' : '';
    if (selR.value !== rMatch) selR.value = rMatch;
  }
}

/* ═══════════════════════════════════════════════════════════════
   PREPROCESAR INPUT
   El parser shared no conoce el catálogo (MEDIOS_POR_NOMBRE) — es
   frontend-only. Aquí convertimos palabras sueltas que coincidan con
   un medio del catálogo a su token canónico "web:dominio", antes de
   pasarlas al parser. Así "elpais" funciona igual que "web:elpais.com".
   ═══════════════════════════════════════════════════════════════ */
function preprocesarInput(raw) {
  if (!raw) return raw;
  const tokens = tokenizeQuery(raw);
  const out = [];
  for (const tk of tokens) {

    // ── NUEVO: medio:elpais → web:elpais.com ──
    // Convierte el prefijo medio: en su dominio canónico. Así
    // el worker lo trata como dominio (que ya soporta OR via IN).
    if (tk.prefix === 'medio' || tk.prefix === 'medios'){
      const strict = normStrict(tk.text);
      const dom = MEDIOS_POR_NOMBRE.get(strict);
      if (dom){ out.push('web:' + dom); continue; }
      // si no hay match, cae al push normal (queda como medio:foo)
    }

    // Las palabras sueltas se quedan como texto. Antes, cualquier palabra
    // de 4+ letras que fuera prefijo de un medio se convertía en web:dominio
    // ('economia', 'madrid', 'vigo'…), y 'crisis economia' buscaba solo en
    // un medio. Para filtrar por medio: medio:X, web:X o el autocompletado.
    out.push(tk.raw);
  }
  return out.join(' ');
}
/* ═══════════════════════════════════════════════════════════════
   CHIPS DE FILTROS ACTIVOS
   ═══════════════════════════════════════════════════════════════ */
function renderChips(parsed, rawQuery){
  const cont = $('#chips-busqueda');
  if (!cont) return;

  if (!parsed.chips.length){
    cont.style.display = 'none';
    cont.innerHTML = '';
    return;
  }

  cont.style.display = '';
  cont.innerHTML = parsed.chips.map((c, i) =>
    `<span class="chip">
      <span class="chip-tipo">${escapeHtml(c.type === 'eltiempo' ? t('chipTiempo') : c.type)}</span>
      <span>${escapeHtml(c.value)}</span>
      <button type="button" class="chip-x" data-idx="${i}" title="${escapeHtml(t('chipLiteral'))}">×</button>
    </span>`
  ).join('');

  cont.querySelectorAll('.chip-x').forEach(b => {
    b.addEventListener('click', () => {
      const i = parseInt(b.dataset.idx, 10);
      const chip = parsed.chips[i];
      if (!chip || !chip.raw) return;

      // Reconstruimos el input quitando el token que corresponde a este chip.
      // Como el parser preprocesa cada token individualmente (medio:elpais → web:elpais.com),
      // comparamos cada token del input crudo contra el chip tras pasarlo por
      // el mismo preprocesador. Así encontramos el que le corresponde.
      const tokensRaw = tokenizeQuery(rawQuery);
      const kept = [];
      let removed = false;

      for (const tk of tokensRaw) {
        const pre = preprocesarInput(tk.raw);
        if (!removed && pre === chip.raw){
          removed = true;
          continue;   // este es el token del chip → lo descartamos
        }
        kept.push(tk.raw);
      }

      let nueva;
      if (removed){
        nueva = kept.join(' ');
      } else {
        // Fallback: no hubo match en el input crudo.
        // Probamos sobre el input preprocesado (por si el chip vino de un selector
        // que escribe el token canónico directamente).
        const rawProcesado = preprocesarInput(rawQuery);
        const esc = _escapeRegex(chip.raw);
        const rx = new RegExp('(^|\\s)' + esc + '(?=\\s|$)', 'g');
        const limpio = rawProcesado.replace(rx, ' ').replace(/\s+/g, ' ').trim();
        if (limpio === rawProcesado) return;   // no se pudo quitar nada
        nueva = limpio;
      }

      $('#buscar').value = nueva;
      const clearBtn = $('#buscar-clear');
      if (clearBtn) clearBtn.hidden = !nueva;
      aplicarFiltros();
    });
  });
}
/* ═══════════════════════════════════════════════════════════════
   AUTOCOMPLETE DEL BUSCADOR
   ═══════════════════════════════════════════════════════════════ */
const SUG_STATE = { open: false, items: [], sel: 0 };

function fragmentoActual(raw){
  const trimmed = raw.replace(/\s+$/, '');
  const words = trimmed.split(/\s+/);
  const last = words[words.length - 1] || '';
  const pi = last.indexOf(':');
  if (pi > 0 && /^[a-z]+$/i.test(last.slice(0, pi))){
    return { prefix: last.slice(0, pi).toLowerCase(), text: last.slice(pi + 1) };
  }
  return { prefix: '', text: last };
}

function scoreMatch(haystack, needle){
  if (!haystack || !needle) return 0;
  if (haystack === needle) return 3;
  if (haystack.startsWith(needle)) return 2;
  if (haystack.includes(needle)) return 1;
  return 0;
}

function sugerenciasBuscar(raw){
  // eltiempo: sugiere municipios, no medios.
  const fragTiempo = fragmentoTiempo(raw);
  if (fragTiempo !== null) return TIEMPO_ACTIVO ? sugerenciasTiempo(fragTiempo) : [];

  const frag = fragmentoActual(raw);
  const low = normalize(frag.text);
  if (frag.prefix) return [];

  const out = [];

  if (frag.text){
    out.push({
      kind: 'titulo',
      value: frag.text,
      label: `Buscar "${frag.text}" en el titular`,
      tipo: 'texto',
    });
  }

  if (!low) return out;

  const grupos = [...new Set(MEDIOS_UNICOS.map(m => m.grupo).filter(Boolean))];
  const grupoHits = grupos
    .map(g => ({ g, score: scoreMatch(normalize(g), low) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.g.localeCompare(b.g))
    .slice(0, 4);

  grupoHits.forEach(({ g, score }) => {
    const n = MEDIOS_UNICOS.filter(m => m.grupo === g).length;
    out.push({
      kind: 'grupo', value: g, label: g, meta: `${n} medios`,
      tipo: 'grupo', score,
    });
  });

  const medioHits = MEDIOS_UNICOS
    .filter(m => m.medio)
    .map(m => ({ m, score: scoreMatch(normalize(m.medio), low) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.m.medio.localeCompare(b.m.medio))
    .slice(0, 6);

  const yaDominios = new Set();
  medioHits.forEach(({ m, score }) => {
    yaDominios.add(m.dominio);
    out.push({
      kind: 'dominio', value: m.dominio, label: m.medio, meta: m.dominio,
      tipo: 'medio', score,
    });
  });

  const domHits = MEDIOS_UNICOS
    .map(m => ({ m, score: scoreMatch(normalize(m.dominio), low) }))
    .filter(x => x.score > 0 && !yaDominios.has(x.m.dominio))
    .sort((a, b) => b.score - a.score || a.m.dominio.localeCompare(b.m.dominio))
    .slice(0, 4);

  domHits.forEach(({ m, score }) => {
    out.push({
      kind: 'dominio', value: m.dominio, label: m.medio || m.dominio, meta: m.dominio,
      tipo: 'dominio', score,
    });
  });

  return out;
}

function renderSugerencias(items){
  const cont = document.getElementById('buscar-sugerencias');
  if (!cont) return;
  if (!items.length){ cont.style.display = 'none'; return; }

  cont.innerHTML = items.map((s, i) => {
    const cls = 'sug-item'
      + (i === SUG_STATE.sel ? ' sel' : '')
      + (s.score === 3 ? ' exact' : '');
    return `<div class="${cls}" data-idx="${i}">
      <span class="sug-label">${escapeHtml(s.label)}</span>
      ${s.meta ? `<span class="sug-meta">${escapeHtml(s.meta)}</span>` : ''}
      <span class="sug-tipo">${escapeHtml(s.tipo)}</span>
    </div>`;
  }).join('');

  cont.style.display = '';
}

function cerrarSugerencias(){
  SUG_STATE.open = false;
  SUG_STATE.items = [];
  SUG_STATE.sel = 0;
  const c = document.getElementById('buscar-sugerencias');
  if (c) c.style.display = 'none';
}

function abrirSugerencias(items){
  SUG_STATE.open = true;
  SUG_STATE.items = items;
  SUG_STATE.sel = 0;
  renderSugerencias(items);
}

function aplicarSugerencia(idx){
  const s = SUG_STATE.items[idx];
  if (!s) return;
  const input = document.getElementById('buscar');

  if (s.kind === 'municipio'){
    // eltiempo:"A Coruña" con el municipio elegido (hay nombres repetidos).
    recordarLugar(s.value, { ine: s.ine });
    const token = /\s/.test(s.value) ? `"${s.value}"` : s.value;
    input.value = input.value.replace(RX_TIEMPO_FINAL, (_, antes, prefijo) => `${antes}${prefijo}${token}`) + ' ';
    cerrarSugerencias();
    input.focus();
    aplicarFiltros();
    return;
  }

  if (s.kind === 'titulo'){
    cerrarSugerencias();
    input.blur();
    aplicarFiltros();
    return;
  }

  // Token a insertar
  let token;
  if (s.kind === 'grupo'){
    token = 'grupo:"' + s.value + '"';
  } else if (s.kind === 'dominio'){
    token = 'web:' + s.value;
  } else {
    token = s.value;
  }

  const raw = input.value.replace(/\s+$/, '');
  const palabrasInput = raw ? raw.split(/\s+/) : [];
  const palabrasLabel = (s.label || '').split(/\s+/).filter(Boolean);

  // Buscar la coincidencia más larga entre el final del input
  // y el principio del label. Ej: input="diario de arousa", label="Diario de Arousa"
  // → match de 3 palabras → reemplazamos las 3 por el token.
  let mejorMatch = 0;
  const maxN = Math.min(palabrasLabel.length, palabrasInput.length);
  for (let n = maxN; n >= 1; n--){
    const tail = palabrasInput.slice(-n).join(' ');
    const head = palabrasLabel.slice(0, n).join(' ');
    if (normalize(tail) === normalize(head)){
      mejorMatch = n;
      break;
    }
  }

  let nuevoRaw;
  if (mejorMatch > 0){
    const antes = palabrasInput.slice(0, -mejorMatch).join(' ');
    nuevoRaw = antes ? antes + ' ' + token : token;
  } else {
    // Fallback: reemplaza solo la última palabra (comportamiento anterior)
    const idxUlt = raw.lastIndexOf(' ');
    const antes = idxUlt >= 0 ? raw.slice(0, idxUlt + 1) : '';
    nuevoRaw = antes + token;
  }

  input.value = nuevoRaw + ' ';
  cerrarSugerencias();
  input.focus();
  aplicarFiltros();
}
// Las sugerencias normales empiezan por «Buscar en el titular» y se abren
// con 2 o más; las de municipios, con una basta.
const haySugerencias = items => items.length > 1 || items[0]?.kind === 'municipio';

function wireAutocomplete(){
  const input = document.getElementById('buscar');
  const cont  = document.getElementById('buscar-sugerencias');
  if (!input || !cont) return;

  input.addEventListener('input', () => {
    const items = sugerenciasBuscar(input.value);
    if (haySugerencias(items)) abrirSugerencias(items);
    else cerrarSugerencias();
  });

  input.addEventListener('keydown', e => {
    if (!SUG_STATE.open){
      if (e.key === 'ArrowDown'){
        const items = sugerenciasBuscar(input.value);
        if (haySugerencias(items)){ abrirSugerencias(items); e.preventDefault(); }
      }
      return;
    }

    if (e.key === 'ArrowDown'){
      SUG_STATE.sel = (SUG_STATE.sel + 1) % SUG_STATE.items.length;
      renderSugerencias(SUG_STATE.items);
      e.preventDefault();
    } else if (e.key === 'ArrowUp'){
      SUG_STATE.sel = (SUG_STATE.sel - 1 + SUG_STATE.items.length) % SUG_STATE.items.length;
      renderSugerencias(SUG_STATE.items);
      e.preventDefault();
    } else if (e.key === 'Enter'){
      const s = SUG_STATE.items[SUG_STATE.sel];
      if (s && s.kind !== 'titulo'){
        aplicarSugerencia(SUG_STATE.sel);
        e.preventDefault();
      } else {
        cerrarSugerencias();
      }
    } else if (e.key === 'Tab'){
      aplicarSugerencia(SUG_STATE.sel);
      e.preventDefault();
    } else if (e.key === 'Escape'){
      cerrarSugerencias();
      e.preventDefault();
    }
  });

  cont.addEventListener('mousedown', e => {
    const item = e.target.closest('.sug-item');
    if (!item) return;
    e.preventDefault();
    aplicarSugerencia(parseInt(item.dataset.idx, 10));
  });

  cont.addEventListener('mousemove', e => {
    const item = e.target.closest('.sug-item');
    if (!item) return;
    const idx = parseInt(item.dataset.idx, 10);
    if (SUG_STATE.sel !== idx){
      SUG_STATE.sel = idx;
      renderSugerencias(SUG_STATE.items);
    }
  });

  input.addEventListener('blur', () => setTimeout(cerrarSugerencias, 120));

  input.addEventListener('focus', () => {
    if (input.value.trim()){
      const items = sugerenciasBuscar(input.value);
      if (haySugerencias(items)) abrirSugerencias(items);
    }
  });
}
/* ═══════════════════════════════════════════════════════════════
   EL TIEMPO (eltiempo:Lugar o tiempo:Lugar)
   Tarjeta encima de la lista, fuera del flujo de noticias. Los municipios
   se buscan aquí (shared/tiempo/; la lista se carga al escribir eltiempo:)
   y la previsión la da el worker de Deno (/tiempo), que habla con AEMET y
   Open-Meteo: Cloudflare se bloquea en España. eltiempo: vacío (o el sol de
   la cabecera) abre Mis sitios: hasta 5 lugares guardados en el dispositivo,
   con su previsión y sus avisos; la pestaña Avisos es alertas:.
   ═══════════════════════════════════════════════════════════════ */
const TIEMPO_ACTIVO_KEY  = 'voceiro-tiempo-activo';
const TIEMPO_LUGARES_KEY = 'voceiro-tiempo-lugares-v1';
const TIEMPO_SITIOS_KEY  = 'voceiro-tiempo-sitios-v1';
const TIEMPO_HORAS_KEY   = 'voceiro-tiempo-horas';
const TIEMPO_AVISOS_KEY  = 'voceiro-tiempo-avisos';
const TIEMPO_MAX_SITIOS  = 5;
const PREFIJOS_TIEMPO = { es: 'eltiempo', gl: 'otempo', ca: 'eltemps', en: 'weather', eu: 'eguraldia' };
const TIEMPO_URL = BACKENDS.deno.buscar;
const TIEMPO_CIELO = {
  despejado: ['sun', 'tiempoDespejado'],      poco:     ['cloud-sun', 'tiempoPoco'],
  nuboso:    ['cloud', 'tiempoNuboso'],       cubierto: ['cloud', 'tiempoCubierto'],
  lluvia:    ['cloud-rain', 'tiempoLluvia'],  nieve:    ['cloud-snow', 'tiempoNieve'],
  tormenta:  ['cloud-lightning', 'tiempoTormenta'], niebla: ['cloud-fog', 'tiempoNiebla'],
};
// sitios: la última previsión de cada lugar (clave → { p, pedida }) y
// cargas, las peticiones en curso; fallos, las claves que fallaron y fallo,
// si falló renovar la tarjeta.
const TIEMPO = { valor: null, timer: null, indice: null, carga: null, ultima: null, lugar: null, pedida: 0,
  sitios: new Map(), cargas: new Map(), fallos: new Set(), fallo: false };
let TIEMPO_ACTIVO = cargarTiempoActivo();

function cargarTiempoActivo(){
  try { return localStorage.getItem(TIEMPO_ACTIVO_KEY) !== 'false'; } catch(e){ return true; }
}

// La lista de municipios (~90 KB) solo se descarga la primera vez que hace falta.
function municipiosTiempo(){
  if (!TIEMPO.carga){
    TIEMPO.carga = import('./tiempo/municipios.js?v=d338c86cf3')
      .then(m => (TIEMPO.indice = indexar(m.MUNICIPIOS)))
      .catch(e => { TIEMPO.carga = null; throw e; });
  }
  return TIEMPO.carga;
}

// El lugar que se eligió para cada nombre (en el autocompletado o al haber
// varios): la próxima vez no se pregunta.
function lugaresRecordados(){
  try { return JSON.parse(localStorage.getItem(TIEMPO_LUGARES_KEY)) || {}; } catch(e){ return {}; }
}
function recordarLugar(nombre, lugar){
  const r = lugaresRecordados();
  if (lugar) r[normalize(nombre).trim()] = lugar;
  else delete r[normalize(nombre).trim()];
  try { localStorage.setItem(TIEMPO_LUGARES_KEY, JSON.stringify(r)); } catch(e){}
}

// Mis sitios: { nombre, lugar, zona }. lugar es { ine } o { lat, lon, cc,
// nombre, region, pais }; zona, la de los avisos de AEMET (o null).
function sitiosTiempo(){
  try {
    const s = JSON.parse(localStorage.getItem(TIEMPO_SITIOS_KEY));
    return Array.isArray(s) ? s.filter(x => x && x.lugar).slice(0, TIEMPO_MAX_SITIOS) : [];
  } catch(e){ return []; }
}
function guardarSitios(sitios){
  try { localStorage.setItem(TIEMPO_SITIOS_KEY, JSON.stringify(sitios)); } catch(e){}
}
const claveLugar = l => (l.ine ? String(l.ine) : `${(+l.lat).toFixed(3)},${(+l.lon).toFixed(3)}`);
// El lugar de una previsión: los de España, por su INE.
const lugarDe = (p, lugar) => (p.ine ? { ine: p.ine } : lugar);

// El prefijo del tiempo que se está escribiendo al final del buscador
// («eltiempo:"A Cor»).
const RX_TIEMPO_FINAL = /(^|\s)((?:eltiempo|tiempo|t|otempo|tempo|eltemps|temps|weather|eguraldia):)(?:"[^"]*|[^\s"]*)$/i;
function fragmentoTiempo(raw){
  const m = raw.match(/(?:^|\s)(?:eltiempo|tiempo|t|otempo|tempo|eltemps|temps|weather|eguraldia):(?:"([^"]*)|([^\s"]*))$/i);
  return m ? (m[1] ?? m[2]) : null;
}

function sugerenciasTiempo(texto){
  if (!TIEMPO.indice){
    // Cuando llegue la lista, se sugiere si el usuario sigue en el buscador.
    municipiosTiempo().then(() => {
      const input = document.getElementById('buscar');
      if (document.activeElement !== input) return;
      const items = sugerenciasBuscar(input.value);
      if (haySugerencias(items)) abrirSugerencias(items);
    }).catch(() => {});
    return [];
  }
  return sugerirMunicipios(TIEMPO.indice, texto).map(m => ({
    kind: 'municipio', value: m.nombre, ine: m.ine, label: m.nombre,
    meta: provinciaDe(m.ine), tipo: t('tiempoSugTipo'),
  }));
}

function pintarTiempo(html, prevision = null){
  const el = document.getElementById('tiempo-tarjeta');
  if (!el) return;
  TIEMPO.ultima = prevision;
  el.innerHTML = html;
  el.hidden = !html;
}
const msgTiempo = (clave, vars) => `<p class="tiempo-msg">${escapeHtml(t(clave, vars))}</p>`;

function actualizarTiempo(valor){
  if (valor === TIEMPO.valor) return;
  TIEMPO.valor = valor;
  clearTimeout(TIEMPO.timer);
  if (valor == null){ pintarTiempo(''); return; }
  if (valor === ''){
    if (TIEMPO_ACTIVO) pintarSitios();
    else pintarTiempo(msgTiempo('tiempoDesactivado'));
    return;
  }
  // Pausa: mientras se escribe «eltiempo:Vi…» no se pide nada.
  TIEMPO.timer = setTimeout(() => resolverTiempo(valor), 500);
}

async function pedirTiempo(ruta){
  const r = await fetch(TIEMPO_URL + ruta, { signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || String(r.status));
  return j;
}

// Primero lo recordado; luego los municipios de España (sin red); si no,
// el worker geocodifica (ciudades de fuera, nombres en castellano…).
async function resolverTiempo(valor){
  if (!TIEMPO_ACTIVO){ pintarTiempo(msgTiempo('tiempoDesactivado')); return; }
  const vigente = () => TIEMPO.valor === valor;
  const clave = normalize(valor).trim();
  const recordado = lugaresRecordados()[clave];
  if (recordado) return mostrarPrevision(recordado, valor);

  let exactos = [];
  try { exactos = municipiosExactos(await municipiosTiempo(), valor); } catch(e){}
  if (!vigente()) return;
  if (exactos.length === 1) return mostrarPrevision({ ine: exactos[0].ine }, valor);
  if (exactos.length > 1){
    return pintarEleccion(valor, exactos.map(m => ({ ine: m.ine, nombre: m.nombre, region: provinciaDe(m.ine), pais: '' })));
  }
  if (clave.length < 3){ pintarTiempo(''); return; }

  pintarTiempo(msgTiempo('tiempoCargando'));
  let lugares;
  try {
    lugares = (await pedirTiempo(`/tiempo/lugares?q=${encodeURIComponent(valor)}&lang=${(ACCES && ACCES.lang) || 'es'}`)).lugares || [];
  } catch(e){
    if (vigente()) pintarTiempo(msgTiempo('tiempoError'));
    return;
  }
  if (!vigente()) return;
  if (!lugares.length){ pintarTiempo(msgTiempo('tiempoNoEncontrado', { X: valor })); return; }
  const iguales = lugares.filter(l => normalize(l.nombre).trim() === clave);
  if (iguales.length === 1) return mostrarPrevision(iguales[0], valor);
  pintarEleccion(valor, (iguales.length ? iguales : lugares).slice(0, 6));
}

function pintarEleccion(valor, lugares){
  pintarTiempo(msgTiempo('tiempoElegir', { X: valor })
    + `<div class="tiempo-elegir">${lugares.map((l, i) =>
        `<button type="button" data-i="${i}">${escapeHtml(l.nombre)} <span>${escapeHtml([l.region, l.pais].filter(Boolean).join(' · '))}</span></button>`
      ).join('')}</div>`);
  document.querySelectorAll('#tiempo-tarjeta .tiempo-elegir button').forEach(b => {
    b.addEventListener('click', () => {
      const l = lugares[+b.dataset.i];
      const lugar = l.ine ? { ine: l.ine }
        : { lat: l.lat, lon: l.lon, cc: l.cc, nombre: l.nombre, region: l.region, pais: l.pais };
      recordarLugar(valor, lugar);
      mostrarPrevision(lugar, valor);
    });
  });
}

function rutaTiempo(lugar){
  return lugar.ine ? `/tiempo?ine=${encodeURIComponent(lugar.ine)}`
    : '/tiempo?' + new URLSearchParams({
        lat: lugar.lat, lon: lugar.lon, cc: lugar.cc || '',
        nombre: lugar.nombre || '', region: lugar.region || '', pais: lugar.pais || '',
      });
}

// callado: al renovarla se deja la tarjeta que había hasta que llegue la nueva.
async function mostrarPrevision(lugar, valor, { callado = false } = {}){
  if (!callado) pintarTiempo(msgTiempo('tiempoCargando'));
  try {
    const p = await pedirTiempo(rutaTiempo(lugar));
    if (TIEMPO.valor !== valor) return;
    TIEMPO.lugar = lugar;
    TIEMPO.pedida = Date.now();
    TIEMPO.fallo = false;
    TIEMPO.sitios.set(claveLugar(lugarDe(p, lugar)), { p, pedida: TIEMPO.pedida });
    pintarTiempo(htmlPrevision(p), p);
    // Los avisos de su zona: los de toda España, en una petición que se
    // reutiliza 15 minutos.
    if (p.zonaAviso) pedirAvisos().then(() => { if (TIEMPO.ultima === p) repintarTiempo(); });
  } catch(e){
    if (TIEMPO.valor !== valor) return;
    if (!callado) pintarTiempo(msgTiempo('tiempoError'));
    // Al renovarla se queda la que había, pero se dice y se puede reintentar.
    else if (TIEMPO.ultima){ TIEMPO.fallo = true; pintarTiempo(htmlPrevision(TIEMPO.ultima), TIEMPO.ultima); }
  }
}

const grados = v => (v == null ? '–' : `${v}°`);
function cieloTiempo(c, noche){
  const x = TIEMPO_CIELO[c];
  if (!x) return { ico: '', txt: '' };
  let nombre = x[0];
  if (noche && c === 'despejado') nombre = 'moon';
  if (noche && c === 'poco') nombre = 'cloud-moon';
  return { ico: ico(nombre), txt: t(x[1]) };
}

function htmlPrevision(p){
  const lang = (ACCES && ACCES.lang) || 'es';
  const cielo = cieloTiempo;
  const diaSemana = new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: 'UTC' });
  const region = p.lugar.region || (p.ine ? provinciaDe(p.ine) : '');

  const a = p.ahora;
  const ca = a ? cielo(a.cielo, a.noche) : null;
  const sol = p.sol
    ? `<span class="tiempo-sol">${ico('sun')}
       <span class="tiempo-sol-hora"><span class="sr">${escapeHtml(t('tiempoOrto'))}: </span><span aria-hidden="true">↑</span>${escapeHtml(p.sol.orto)}</span>
       <span class="tiempo-sol-hora"><span class="sr">${escapeHtml(t('tiempoOcaso'))}: </span><span aria-hidden="true">↓</span>${escapeHtml(p.sol.ocaso)}</span></span>`
    : '';
  const ahora = a
    ? `<div class="tiempo-ahora">${ca.ico}<span class="tiempo-temp">${grados(a.temp)}</span><span>${escapeHtml(ca.txt)}</span>${sol}</div>`
    : '';

  const dias = p.dias.slice(0, 5).map((d, i) => {
    const c = cielo(d.cielo);
    return `<li>
      <span class="tiempo-dia">${escapeHtml(i === 0 ? t('tiempoHoy') : diaSemana.format(new Date(d.fecha + 'T12:00:00Z')))}</span>
      ${c.ico}<span class="sr">${escapeHtml(c.txt)}</span>
      <span><b>${grados(d.max)}</b> <span class="tiempo-min">${grados(d.min)}</span></span>
      ${d.lluvia == null ? '' : `<span class="tiempo-lluvia">${ico('droplet')}<span class="sr">${escapeHtml(t('tiempoProbLluvia'))}</span> ${d.lluvia}%</span>`}
    </li>`;
  }).join('');

  const enlace = /^https:\/\//.test(p.enlace || '') ? p.enlace : '';
  const fuente = p.fuente === 'aemet' ? 'AEMET' : 'Open-Meteo';
  const pie = `${escapeHtml(t('tiempoFuente'))}: `
    + (enlace ? `<a href="${escapeHtml(enlace)}" target="_blank" rel="noopener">${fuente}</a>` : fuente)
    + (p.elaborado ? ' · ' + escapeHtml(t('tiempoElaborado', { h: p.elaborado.slice(11, 16) })) : '')
    + (p.sinAemet ? ' · ' + escapeHtml(t('tiempoSinAemet')) : '')
    + (TIEMPO.fallo ? ' · ' + escapeHtml(t('tiempoNoActualizado')) + htmlReintentar() : '')
    + `<button type="button" class="tiempo-cambiar">${escapeHtml(t('tiempoCambiar'))}</button>`;

  return `${htmlPestanasTiempo(null)}
    <div class="tiempo-cab"><strong>${escapeHtml(p.lugar.nombre)}</strong><span>${escapeHtml([region, p.lugar.pais].filter(Boolean).join(' · '))}</span>${htmlGuardar(p)}</div>
    ${ahora}
    <ol class="tiempo-dias">${dias}</ol>
    ${htmlHoras(p)}
    ${htmlAvisosLugar(p)}
    <div class="tiempo-pie">${pie}</div>`;
}

// Mis sitios, Avisos (alertas:) y los ajustes; activa: 'sitios', 'avisos' o null.
function htmlPestanasTiempo(activa){
  const p = (ir, clave) => `<button type="button" class="tiempo-pestana" data-ir="${ir}"${activa === ir ? ' aria-current="page"' : ''}>${escapeHtml(t(clave))}</button>`;
  const aj = t('tiempoAjustes');
  const cerrar = `${t('btnCerrar')} ${t('ajTiempoTit')}`;
  return `<nav class="tiempo-pestanas" aria-label="${escapeHtml(t('ajTiempoTit'))}">${p('sitios', 'tiempoMisSitios')}${p('avisos', 'avisosBotonTxt')}
    <button type="button" class="tiempo-cerrar" title="${escapeHtml(cerrar)}" aria-label="${escapeHtml(cerrar)}">${ico('x')}</button>
    <button type="button" class="tiempo-ajustes" title="${escapeHtml(aj)}" aria-label="${escapeHtml(aj)}">${ico('settings')}</button></nav>`;
}

// ☆ / ★: guardar o quitar de Mis sitios (con 5, no deja guardar más).
function htmlGuardar(p){
  const lugar = lugarDe(p, TIEMPO.lugar || {});
  if (!lugar.ine && lugar.lat == null) return '';
  const sitios = sitiosTiempo();
  const guardado = sitios.some(s => claveLugar(s.lugar) === claveLugar(lugar));
  const lleno = !guardado && sitios.length >= TIEMPO_MAX_SITIOS;
  return `<button type="button" class="tiempo-guardar" aria-pressed="${guardado}" aria-label="${escapeHtml(t('tiempoGuardar'))}"
    title="${escapeHtml(t(guardado ? 'tiempoQuitar' : lleno ? 'tiempoLleno' : 'tiempoGuardar'))}"${lleno ? ' aria-disabled="true"' : ''}><span aria-hidden="true">${guardado ? '★' : '☆'}</span></button>`;
}

function alternarSitio(p){
  const lugar = lugarDe(p, TIEMPO.lugar);
  const k = claveLugar(lugar);
  const sitios = sitiosTiempo();
  const i = sitios.findIndex(s => claveLugar(s.lugar) === k);
  if (i >= 0) sitios.splice(i, 1);
  else if (sitios.length < TIEMPO_MAX_SITIOS) sitios.push({ nombre: p.lugar.nombre, lugar, zona: p.zonaAviso || null });
  else return;
  guardarSitios(sitios);
  repintarTiempo();
  document.querySelector('#tiempo-tarjeta .tiempo-guardar')?.focus();
  pintarBotonTiempo();
  refrescarAvisos();
}

// Las próximas 24 horas, plegadas; abiertas o no, como se dejaron la última vez.
function htmlHoras(p){
  if (!p.horas?.length) return '';
  const lang = (ACCES && ACCES.lang) || 'es';
  const diaSemana = new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: 'UTC' });
  let abiertas = false;
  try { abiertas = localStorage.getItem(TIEMPO_HORAS_KEY) === 'true'; } catch(e){}
  const horas = p.horas.map((h, i) => {
    const c = cieloTiempo(h.cielo, h.noche);
    // A medianoche, el día va bajo «0h» sin desplazar el resto de la fila.
    const dia = h.hora === 0 && i > 0 ? diaSemana.format(new Date(h.fecha + 'T12:00:00Z')) : '';
    return `<li>
      <span class="tiempo-dia">${h.hora}h${dia ? `<small>${escapeHtml(dia)}</small>` : ''}</span>
      ${c.ico}<span class="sr">${escapeHtml(c.txt)}</span>
      <b>${grados(h.temp)}</b>
      ${h.lluvia ? `<span class="tiempo-lluvia">${ico('droplet')}<span class="sr">${escapeHtml(t('tiempoProbLluvia'))}</span> ${h.lluvia}%</span>` : ''}
    </li>`;
  }).join('');
  return `<details class="tiempo-horas"${abiertas ? ' open' : ''}><summary>${escapeHtml(t('tiempoPorHoras'))}</summary>
    <ol class="tiempo-dias" tabindex="0" aria-label="${escapeHtml(t('tiempoPorHoras'))}">${horas}</ol></details>`;
}

// Avisos de la zona del municipio y de su costa (la misma zona con C).
function avisosDeZona(zona){
  return avisosVigentes().filter(a => a.zona === zona || a.zona === zona + 'C')
    .sort((a, b) => PESO[b.nivel] - PESO[a.nivel] || empezado(b) - empezado(a) || Date.parse(a.inicio) - Date.parse(b.inicio));
}
function htmlAvisosLugar(p){
  const d = AVISOS.datos;
  if (!p.zonaAviso || (!d && !AVISOS.error)) return '';
  // Plegados como «Por horas» y como se dejaron; sin abrir se ven cuántos y
  // el más grave con su momento: «Avisos (3) · Naranja mañana».
  const lista = d ? avisosDeZona(p.zonaAviso) : [];
  let abiertos = false;
  try { abiertos = localStorage.getItem(TIEMPO_AVISOS_KEY) === 'true'; } catch(e){}
  const a = lista[0];
  const resumen = a ? ` (${lista.length}) · ${t('avisoNivel' + a.nivel)} ${momentoAviso(a)}` : '';
  const cuerpo = !d ? msgTiempo('avisosError')
    : (lista.length ? `<ul class="aviso-zonas">${lista.map(a => htmlAviso(a, { nivel: '' })).join('')}</ul>` : msgTiempo('avisosNinguno'))
      + (d.incompleto || AVISOS.error ? `<div class="tiempo-pie">${pieAvisos(d)}</div>` : '');
  return `<details class="tiempo-avisos"${abiertos ? ' open' : ''}><summary>${escapeHtml(t('avisosBotonTxt') + resumen)}</summary>`
    + cuerpo + '</details>';
}

// La previsión de un sitio guardado: la de la última hora sirve.
function previsionSitio(s){
  const k = claveLugar(s.lugar);
  const c = TIEMPO.sitios.get(k);
  if (c && Date.now() - c.pedida < 60 * 60e3 && new Date(c.pedida).toDateString() === new Date().toDateString()) return Promise.resolve(c.p);
  if (!TIEMPO.cargas.has(k)){
    TIEMPO.cargas.set(k, pedirTiempo(rutaTiempo(s.lugar))
      .then(p => { TIEMPO.sitios.set(k, { p, pedida: Date.now() }); TIEMPO.fallos.delete(k); return p; },
        e => { TIEMPO.fallos.add(k); throw e; })
      .finally(() => TIEMPO.cargas.delete(k)));
  }
  return TIEMPO.cargas.get(k);
}

// eltiempo: vacío: Mis sitios, cada uno con el cielo, la temperatura, la
// máxima y la mínima de hoy y su aviso más grave. Pinta lo que tiene y
// repinta según llega lo demás, siempre con la lista guardada: una
// respuesta que llega tarde no devuelve un sitio ya quitado.
function pintarSitios(){
  const pintar = () => {
    if (TIEMPO.valor !== '') return;
    const sitios = sitiosTiempo();
    pintarTiempo(htmlPestanasTiempo('sitios') + (sitios.length ? htmlSitios(sitios) : msgTiempo('tiempoSinSitios')));
  };
  pintar();
  const sitios = sitiosTiempo();
  if (sitios.some(s => s.zona)) pedirAvisos().then(pintar);
  sitios.forEach(s => previsionSitio(s).then(pintar, pintar));
}

const htmlReintentar = () => `<button type="button" class="tiempo-reintentar">${escapeHtml(t('tiempoReintentar'))}</button>`;
const regionSitio = l => (l.ine ? provinciaDe(l.ine) : [l.region, l.pais].filter(Boolean).join(' · '));

// Los botones llevan la clave del lugar, no la posición en la lista.
function htmlSitios(sitios){
  const repetido = s => sitios.filter(x => normalize(x.nombre) === normalize(s.nombre)).length > 1;
  const filas = sitios.map(s => {
    const k = claveLugar(s.lugar);
    const p = TIEMPO.sitios.get(k)?.p;
    const hoy = p?.dias?.[0];
    const a = p?.ahora;
    const c = a ? cieloTiempo(a.cielo, a.noche) : hoy ? cieloTiempo(hoy.cielo) : null;
    const avisos = s.zona && AVISOS.datos ? avisosDeZona(s.zona) : [];
    const av = avisos[0];
    // Dos sitios con el mismo nombre: con su provincia (o región y país).
    const nombre = s.nombre + (repetido(s) && regionSitio(s.lugar) ? ` (${regionSitio(s.lugar)})` : '');
    const quitar = `${t('tiempoQuitar')}: ${nombre}`;
    return `<li><button type="button" class="tiempo-sitio" data-k="${escapeHtml(k)}">
        <strong>${escapeHtml(nombre)}</strong>
        ${c ? c.ico + `<span class="sr">${escapeHtml(c.txt)}</span>` : ''}
        ${a ? `<b>${grados(a.temp)}</b>` : ''}
        ${hoy ? `<span>${grados(hoy.max)} <span class="tiempo-min">${grados(hoy.min)}</span></span>` : (p ? '' : `<span class="tiempo-min">${TIEMPO.fallos.has(k) ? '–' : '…'}</span>`)}
        ${av ? `<span class="tiempo-sitio-aviso" data-nivel="${escapeHtml(av.nivel)}">${escapeHtml(`${t('avisoNivel' + av.nivel)} · ${nombreFen(av.fen)} · ${momentoAviso(av)}`)}${avisos.length > 1 ? ` +${avisos.length - 1}` : ''}</span>` : ''}
      </button><button type="button" class="tiempo-quitar" data-k="${escapeHtml(k)}" aria-label="${escapeHtml(quitar)}" title="${escapeHtml(quitar)}">${ico('x')}</button></li>`;
  }).join('');
  const fallo = sitios.some(s => TIEMPO.fallos.has(claveLugar(s.lugar)) && !TIEMPO.sitios.has(claveLugar(s.lugar)));
  return `<ul class="tiempo-sitios">${filas}</ul>
    <div class="tiempo-pie"><button type="button" class="tiempo-otro">${ico('search')}${escapeHtml(t('tiempoOtro'))}</button>`
    + (fallo ? ` ${escapeHtml(t('tiempoNoActualizado'))}${htmlReintentar()}` : '') + '</div>';
}

const sitioPorClave = k => sitiosTiempo().find(s => claveLugar(s.lugar) === k);
function abrirSitio(s){
  if (!s) return;
  recordarLugar(s.nombre, s.lugar);   // que no pregunte «¿Qué Castro?»
  ponerTiempo(tokenTiempo(/\s/.test(s.nombre) ? `"${s.nombre}"` : s.nombre));
}
function quitarSitio(k){
  const sitios = sitiosTiempo().filter(s => claveLugar(s.lugar) !== k);
  guardarSitios(sitios);
  pintarSitios();
  document.querySelector('#tiempo-tarjeta .tiempo-sitio, #tiempo-tarjeta .tiempo-pestana')?.focus();
  pintarBotonTiempo();
}

// El sol y las pestañas cambian un prefijo del tiempo por otro sin tocar
// el resto de la búsqueda; '' los quita (cierra el panel).
const RX_TOKENS_TIEMPO = /(^|\s)(?:eltiempo|tiempo|t|otempo|tempo|eltemps|temps|weather|eguraldia|alertas|avisos):(?:"[^"]*"?|[^\s"]*)/gi;
const RX_HAY_TIEMPO = /(^|\s)(?:eltiempo|tiempo|t|otempo|tempo|eltemps|temps|weather|eguraldia|alertas|avisos):/i;
function tokenTiempo(valor = ''){
  return `${PREFIJOS_TIEMPO[(ACCES && ACCES.lang) || 'es'] || 'eltiempo'}:${valor}`;
}
function ponerTiempo(token){
  const input = $('#buscar');
  const resto = input.value.replace(RX_TOKENS_TIEMPO, ' ').replace(/\s+/g, ' ').trim();
  input.value = [resto, token].filter(Boolean).join(' ');
  if (token){
    $('.filtros-wrap').classList.add('busqueda-abierta');
    $('#btn-buscar').setAttribute('aria-expanded', 'true');
    const clear = $('#buscar-clear');
    if (clear) clear.hidden = false;
  }
  aplicarFiltros();
  const barra = document.getElementById('barra-sup');
  barra?.classList.remove('cab-oculta');
  requestAnimationFrame(() => {
    const panel = document.getElementById(token.startsWith('alertas') ? 'avisos-panel' : 'tiempo-tarjeta');
    const chips = ['chips-busqueda', 'preset-pestanas', 'temas-chips']
      .map(id => document.getElementById(id)).find(el => el?.getClientRects().length);
    const destino = chips || (token && panel && !panel.hidden ? panel : null);
    if (!destino) return;
    const altoBarra = barra?.getBoundingClientRect().height || 0;
    window.scrollTo({ top: Math.max(0, window.scrollY + destino.getBoundingClientRect().top - altoBarra - 8), behavior: 'auto' });
  });
}
// Sin sitios guardados, el panel se abre con el cursor tras eltiempo:.
function enfocarBuscador(){
  const input = $('#buscar');
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}
function cambiarLugarTiempo(){
  ponerTiempo(tokenTiempo());
  requestAnimationFrame(enfocarBuscador);
}
function abrirSitios(){
  ponerTiempo(tokenTiempo());
  if (!sitiosTiempo().length) enfocarBuscador();
}
function abrirTiempo(){
  if (RX_HAY_TIEMPO.test($('#buscar').value)) ponerTiempo('');
  else abrirSitios();
}
// Pestañas y ajustes, en el panel del tiempo y en el de avisos.
function pulsarPestanaTiempo(b){
  if (b.classList.contains('tiempo-cerrar')) ponerTiempo('');
  else if (b.classList.contains('tiempo-ajustes')) abrirAjustes('feed');
  else if (b.dataset.ir === 'avisos') ponerTiempo('alertas:');
  else if (b.dataset.ir === 'sitios') abrirSitios();
}

// El sol: con el tiempo activado. Con aviso naranja o rojo en uno de mis
// sitios (y el ajuste puesto), se colorea y lo dice.
function pintarBotonTiempo(){
  const b = document.getElementById('btn-tiempo');
  if (!b) return;
  b.hidden = !TIEMPO_ACTIVO;
  const graves = AVISOS_CABECERA && AVISOS.datos
    ? sitiosTiempo().filter(s => s.zona).map(s => ({ s, a: avisosDeZona(s.zona)[0] })).filter(x => x.a && PESO[x.a.nivel] >= 2)
    : [];
  const nivel = graves.some(x => x.a.nivel === 'rojo') ? 'rojo' : graves.length ? 'naranja' : '';
  if (nivel) b.dataset.nivel = nivel;
  else delete b.dataset.nivel;
  const etiqueta = t('ajTiempoTit') + (nivel ? ` · ${t('avisoNivel' + nivel)}: ${graves.map(x => x.s.nombre).join(', ')}` : '');
  b.innerHTML = ico('sun');
  b.title = etiqueta;
  b.setAttribute('aria-label', etiqueta);
  b.setAttribute('aria-pressed', String(RX_HAY_TIEMPO.test($('#buscar')?.value || '')));
}

// Etiqueta, idioma y «Cambiar de lugar» de la tarjeta ya pintada.
function wireTiempo(){
  const el = document.getElementById('tiempo-tarjeta');
  if (!el) return;
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.classList.contains('tiempo-cambiar')) cambiarLugarTiempo();
    else if (b.classList.contains('tiempo-guardar')){
      if (TIEMPO.ultima && b.getAttribute('aria-disabled') !== 'true') alternarSitio(TIEMPO.ultima);
    }
    else if (b.classList.contains('tiempo-sitio')) abrirSitio(sitioPorClave(b.dataset.k));
    else if (b.classList.contains('tiempo-quitar')) quitarSitio(b.dataset.k);
    else if (b.classList.contains('tiempo-reintentar')) reintentarTiempo();
    else if (b.classList.contains('tiempo-otro')) enfocarBuscador();
    else pulsarPestanaTiempo(b);
  });
  // «Por horas» y los avisos se quedan abiertos o cerrados para la próxima
  // vez (toggle no burbujea: se escucha en la captura).
  el.addEventListener('toggle', e => {
    const clave = e.target.classList?.contains('tiempo-horas') ? TIEMPO_HORAS_KEY
      : e.target.classList?.contains('tiempo-avisos') ? TIEMPO_AVISOS_KEY : null;
    if (!clave) return;
    try { localStorage.setItem(clave, String(e.target.open)); } catch(err){}
  }, true);
  // Una pestaña abierta desde hace rato: al volver, si la previsión tiene
  // más de una hora (lo que la guarda el worker) o es de otro día, se pide
  // de nuevo. Sin temporizadores.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !TIEMPO_ACTIVO) return;
    if (TIEMPO.valor === ''){ pintarSitios(); return; }   // pide solo lo de hace más de una hora
    if (!TIEMPO.ultima || !TIEMPO.lugar) return;
    const h = TIEMPO.pedida;
    if (Date.now() - h < 60 * 60e3 && new Date(h).toDateString() === new Date().toDateString()) return;
    TIEMPO.pedida = Date.now();   // una vez, aunque falle
    mostrarPrevision(TIEMPO.lugar, TIEMPO.valor, { callado: true });
  });
}
// En Mis sitios, los que fallaron; en la tarjeta, renovarla.
function reintentarTiempo(){
  if (TIEMPO.valor === ''){ TIEMPO.fallos.clear(); pintarSitios(); }
  else if (TIEMPO.lugar && TIEMPO.valor) mostrarPrevision(TIEMPO.lugar, TIEMPO.valor, { callado: true });
}
function repintarTiempo(){
  const el = document.getElementById('tiempo-tarjeta');
  if (el && TIEMPO.valor === '' && TIEMPO_ACTIVO) pintarSitios();
  else if (el && TIEMPO.ultima) pintarTiempo(htmlPrevision(TIEMPO.ultima), TIEMPO.ultima);
  if (el) el.setAttribute('aria-label', TIEMPO.valor === '' ? t('tiempoMisSitios') : t('tiempoRegion', { X: TIEMPO.valor || '' }));
}
/* ═══════════════════════════════════════════════════════════════
   AVISOS (alertas:)
   Panel encima de la lista (la pestaña Avisos del panel del tiempo). Los
   de mis sitios salen en su tarjeta y en Mis sitios, y colorean el sol de
   la cabecera si son naranjas o rojos (ajuste «Avisos en el sol», puesto
   por defecto). Los da el worker de Deno (/avisos): AEMET y, si falla,
   MeteoAlarm. Solo se piden con alertas:, con el panel del tiempo o con
   sitios guardados que tengan zona, y entonces cada 15 min con la página
   a la vista; con el tiempo desactivado, nunca. Nombres, filtro y grupos
   en shared/tiempo/avisos.js; allí, la nota sobre «noticias relacionadas».
   ═══════════════════════════════════════════════════════════════ */
const AVISOS_CADA = 15 * 60e3;
// pintada y pintadaTiempo: la firma con la que se pintaron el panel y la
// tarjeta (o Mis sitios).
const AVISOS = { datos: null, pedido: 0, carga: null, error: false, valor: null, pintada: '', pintadaTiempo: '' };
const AVISOS_CABECERA_KEY = 'voceiro-avisos-sol';
let AVISOS_CABECERA = (() => {
  try { return localStorage.getItem(AVISOS_CABECERA_KEY) !== 'false'; } catch(e){ return true; }
})();

// Una petición a la vez; si lo que hay tiene menos de 15 min, sirve. Tras
// un fallo se reintenta al minuto, no a cada tecla.
function pedirAvisos(){
  if (AVISOS.carga) return AVISOS.carga;
  if (Date.now() - AVISOS.pedido < (AVISOS.error ? 60e3 : AVISOS_CADA)) return Promise.resolve(AVISOS.datos);
  AVISOS.carga = pedirTiempo('/avisos')
    .then(d => { AVISOS.datos = d; AVISOS.error = false; return d; })
    .catch(() => { AVISOS.error = true; return AVISOS.datos; })
    .finally(() => { AVISOS.pedido = Date.now(); AVISOS.carga = null; });
  return AVISOS.carga;
}
const avisosVigentes = () => (AVISOS.datos?.avisos || []).filter(a => Date.parse(a.fin) > Date.now());
// Lo que cambia el panel: datos nuevos, avisos que caducan o empiezan y
// el día («hoy», «mañana»).
function firmaAvisos(){
  const v = avisosVigentes();
  return [AVISOS.datos?.consultado, AVISOS.error, v.length, v.filter(a => empezado(a)).length,
    new Date().toDateString()].join('|');
}

// Panel, tarjeta y Mis sitios se repintan solo si cambió lo que mostraban.
async function refrescarAvisos(){
  const enSitios = AVISOS_CABECERA && sitiosTiempo().some(s => s.zona);
  const enTiempo = TIEMPO.valor === '' || !!TIEMPO.ultima?.zonaAviso;
  if (!TIEMPO_ACTIVO || document.hidden || (!enSitios && !enTiempo && AVISOS.valor == null)) return;
  await pedirAvisos();
  pintarBotonTiempo();
  const firma = firmaAvisos();
  if (AVISOS.valor != null && firma !== AVISOS.pintada) pintarAvisos();
  if (enTiempo && firma !== AVISOS.pintadaTiempo){
    AVISOS.pintadaTiempo = firma;
    repintarTiempo();
  }
}

// null: sin panel; '': toda España; si no, el filtro (Galicia, lluvia…).
function actualizarAlertas(valor){
  if (valor === AVISOS.valor) return;
  AVISOS.valor = valor;
  pintarAvisos();
}

async function pintarAvisos(){
  const el = document.getElementById('avisos-panel');
  if (!el) return;
  const valor = AVISOS.valor;
  el.hidden = valor === null;
  if (valor === null){ el.innerHTML = ''; return; }
  if (!TIEMPO_ACTIVO){ el.innerHTML = msgTiempo('avisosDesactivado'); return; }
  if (!AVISOS.datos) el.innerHTML = msgTiempo('avisosCargando');
  await pedirAvisos();
  if (AVISOS.valor !== valor) return;
  pintarBotonTiempo();
  if (AVISOS.datos) pintarPanelAvisos(el, htmlAvisos(valor));
  else el.innerHTML = msgTiempo('avisosError');
}

// Lo desplegado sigue desplegado tras repintar.
function pintarPanelAvisos(el, html){
  const abiertos = new Set([...el.querySelectorAll('details[open]')].map(d => d.dataset.k));
  el.innerHTML = html;
  el.querySelectorAll('details[data-k]').forEach(d => { if (abiertos.has(d.dataset.k)) d.open = true; });
  AVISOS.pintada = firmaAvisos();
}

// Para alertas:lluvia o alertas:naranja, en el idioma de la página y en castellano.
function nombresAvisos(){
  const ambos = clave => [t(clave), I18N.es[clave]];
  return {
    fen: Object.fromEntries(FENOMENOS.map(f => [f, ambos('avisoFen' + f)])),
    nivel: Object.fromEntries(NIVELES.map(n => [n, ambos('avisoNivel' + n)])),
  };
}

// «hoy», «mañana» o «jue», en la hora del sitio (Canarias, una menos).
const fechaAviso = (ms, timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
function diaAviso(ms, timeZone){
  const dias = Math.round((Date.parse(fechaAviso(ms, timeZone)) - Date.parse(fechaAviso(Date.now(), timeZone))) / 864e5);
  return dias === 0 ? t('avisosHoy') : dias === 1 ? t('avisosManana')
    : new Intl.DateTimeFormat((ACCES && ACCES.lang) || 'es', { timeZone, weekday: 'short' }).format(ms);
}
// Sin horas, para los títulos: «en vigor» o el día en que empieza.
const momentoAviso = a => (empezado(a) ? t('avisosAhora').toLocaleLowerCase() : diaAviso(Date.parse(a.inicio), zonaHorariaAviso(a.zona)));

// «En vigor · hasta mañana 17:59» o «jue 06:00 – 23:59», en la hora del
// sitio; una comunidad con huecos entre sus avisos, «varios periodos» (las
// horas, dentro). Devuelve HTML: las horas, en negrita.
function cuandoAviso(a){
  const lang = (ACCES && ACCES.lang) || 'es';
  const timeZone = zonaHorariaAviso(a.zona);
  const fecha = ms => fechaAviso(ms, timeZone);
  const hora = ms => `<b class="aviso-hora">${escapeHtml(new Intl.DateTimeFormat(lang, { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms))}</b>`;
  const hoy = fecha(Date.now());
  const dia = ms => escapeHtml(diaAviso(ms, timeZone));
  const ahora = `<span class="aviso-ahora">${escapeHtml(t('avisosAhora'))}</span> · `;
  if (a.varios){
    const varios = t('avisosVarios');
    return empezado(a) ? ahora + escapeHtml(varios) : escapeHtml(varios.charAt(0).toLocaleUpperCase() + varios.slice(1));
  }
  const ini = Date.parse(a.inicio), fin = Date.parse(a.fin);
  const hasta = fecha(fin) === hoy ? hora(fin) : `${dia(fin)} ${hora(fin)}`;
  if (empezado(a)) return ahora + escapeHtml(t('avisosHasta', { h: '\u0000' })).replace('\u0000', hasta);
  return `${dia(ini)} ${hora(ini)} – ${fecha(fin) === fecha(ini) ? hora(fin) : `${dia(fin)} ${hora(fin)}`}`;
}

const nombreFen = fen => (I18N.es['avisoFen' + fen] ? t('avisoFen' + fen) : fen);

// Una zona dentro de su comunidad: fenómeno y zona; el nivel, solo si no
// es el de la línea (el borde lo acompaña siempre).
function htmlAviso(a, g){
  const lang = (ACCES && ACCES.lang) || 'es';
  const texto = a.texto ? (lang === 'en' && a.texto.en) || a.texto.es : '';
  return `<li class="aviso-zona" data-nivel="${escapeHtml(a.nivel)}">
    ${a.nivel !== g.nivel ? `<span class="aviso-nivel">${escapeHtml(t('avisoNivel' + a.nivel))}</span>` : ''}${escapeHtml(nombreFen(a.fen))} · <strong>${escapeHtml(a.area || '')}</strong>
    <span class="aviso-cuando">${cuandoAviso(a)}</span>
    ${texto ? `<p class="aviso-texto">${escapeHtml(texto)}</p>` : ''}
  </li>`;
}

// «[GALICIA] Naranja Lluvias · Amarillo Vientos, Costeros · 3 zonas / En
// vigor · hasta 18:00»; al desplegarla, todas sus zonas con su texto.
function htmlGrupoAvisos(g, seccion){
  const niveles = g.niveles.map(n => `<span class="aviso-nivel">${escapeHtml(t('avisoNivel' + n.nivel))}</span>`
    + escapeHtml(n.fens.map(nombreFen).join(', '))).join(' · ');
  const donde = g.zonas === 1 ? g.avisos[0].area : t('avisosZonas', { n: g.zonas });
  return `<li><details class="aviso" data-nivel="${escapeHtml(g.nivel)}" data-k="${escapeHtml(seccion + '|' + g.clave)}">
    <summary><span class="aviso-ccaa">${escapeHtml(g.comunidad || g.clave)}</span>${niveles} · ${escapeHtml(donde || '')}
      <span class="aviso-cuando">${cuandoAviso(g)}</span></summary>
    <ul class="aviso-zonas">${g.avisos.map(a => htmlAviso(a, g)).join('')}</ul>
  </details></li>`;
}

// Una línea por comunidad con algún naranja o rojo, con sus amarillos
// dentro; las comunidades con solo amarillos, en una línea plegada (abierta
// si se ha filtrado: alertas:Galicia).
function htmlAvisos(valor){
  const d = AVISOS.datos;
  const lista = filtrarAvisos(avisosVigentes(), valor, nombresAvisos());
  const todos = agruparAvisos(lista);
  const graves = todos.filter(g => g.nivel !== 'amarillo');
  const amarillos = todos.filter(g => g.nivel === 'amarillo');
  const comunidades = amarillos.map(g => g.comunidad);
  const grupos = (graves.length ? `<ul class="avisos-lista">${graves.map(g => htmlGrupoAvisos(g, 'g')).join('')}</ul>` : '')
    + (amarillos.length ? `<details class="avisos-amarillos" data-k="amarillos"${valor ? ' open' : ''}>
        <summary>${escapeHtml(t('avisosAmarillos', { n: amarillos.reduce((n, g) => n + g.avisos.length, 0) }))}
          · ${escapeHtml(comunidades.slice(0, 3).join(', ') + (comunidades.length > 3 ? '…' : ''))}</summary>
        <ul class="avisos-lista">${amarillos.map(g => htmlGrupoAvisos(g, 'a')).join('')}</ul></details>` : '');
  return `${htmlPestanasTiempo('avisos')}<div class="tiempo-cab"><strong>${escapeHtml(t('avisosTitulo'))}</strong>${valor ? `<span>${escapeHtml(valor)}</span>` : ''}</div>
    ${lista.length ? grupos : msgTiempo(valor ? 'avisosNingunoX' : 'avisosNinguno', { X: valor })}
    <div class="tiempo-pie">${pieAvisos(d)}</div>`;
}

// Fuente, hora de la consulta y lo que falta (MeteoAlarm) o falló.
function pieAvisos(d){
  const enlace = /^https:\/\//.test(d.enlace || '') ? d.enlace : '';
  const fuente = d.fuente === 'aemet' ? 'AEMET' : 'MeteoAlarm';
  const consultado = new Date(d.consultado);
  return `${escapeHtml(t('tiempoFuente'))}: `
    + (enlace ? `<a href="${escapeHtml(enlace)}" target="_blank" rel="noopener">${fuente}</a>` : fuente)
    + (isNaN(consultado) ? '' : ' · ' + escapeHtml(t('avisosConsultado', {
        h: consultado.toLocaleTimeString((ACCES && ACCES.lang) || 'es', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) })))
    + (d.incompleto ? ' · ' + escapeHtml(t('avisosIncompleto')) : '')
    + (AVISOS.error ? ' · ' + escapeHtml(t('avisosError')) : '');
}

function wireAvisos(){
  document.getElementById('btn-tiempo')?.addEventListener('click', abrirTiempo);
  document.getElementById('avisos-panel')?.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) pulsarPestanaTiempo(b);
  });
  // Cada minuto se quitan los caducados (sin red); la petición, cada 15. Sin
  // panel ni sitios con zona no hace nada.
  setInterval(refrescarAvisos, 60e3);
  document.addEventListener('visibilitychange', refrescarAvisos);
  setTimeout(refrescarAvisos, 2000);
}
function repintarAvisos(){
  const el = document.getElementById('avisos-panel');
  if (el) el.setAttribute('aria-label', t('avisosRegion'));
  pintarBotonTiempo();
  if (AVISOS.valor != null && AVISOS.datos) pintarPanelAvisos(el, htmlAvisos(AVISOS.valor));
}
/* ── Super-grupos (prefijo antes de " · ") ── */
function superGrupo(grupo){
  if (!grupo) return 'Otros';
  const i = grupo.indexOf(' · ');
  return i > 0 ? grupo.slice(0, i) : grupo;
}

const ORDEN_SUPER = [
  'Nacional',
  'Deportes', 'Economía', 'Tecnología', 'Ciencia', 'Cultura',
  'Regional',
  'Internacional',      // ← al final
];

function ordenSuper(s){
  const i = ORDEN_SUPER.indexOf(s);
  return i >= 0 ? i : 999;
}

// Bucketea `items` por super-grupo usando `keyFn(item)` como clave.
// Devuelve { buckets: Map<super, items[]>, supers: string[] ordenados }.
function bucketPorSuper(items, keyFn){
  const buckets = new Map();
  items.forEach(it => {
    const s = superGrupo(keyFn(it));
    if (!buckets.has(s)) buckets.set(s, []);
    buckets.get(s).push(it);
  });
  const supers = [...buckets.keys()]
    .sort((a, b) => ordenSuper(a) - ordenSuper(b) || a.localeCompare(b));
  return { buckets, supers };
}


/* ═══════════════════════════════════════════════════════════════
   GRUPOS, LISTAS Y MEDIOS (panel config)
   ═══════════════════════════════════════════════════════════════ */
function ordenarGruposPorIdioma(grupos){
  const target = (ACCES && ACCES.lang) || 'es';
  const stats = {};
  MEDIOS_UNICOS.forEach(m => {
    if (!stats[m.grupo]) stats[m.grupo] = { total: 0, matches: 0 };
    stats[m.grupo].total++;
    if (m.lang === target) stats[m.grupo].matches++;
  });
  return grupos.slice().sort((a, b) => {
    const sa = stats[a] || { total: 0, matches: 0 };
    const sb = stats[b] || { total: 0, matches: 0 };
    if (sa.matches !== sb.matches) return sb.matches - sa.matches;
    const ra = sa.total ? sa.matches / sa.total : 0;
    const rb = sb.total ? sb.matches / sb.total : 0;
    if (ra !== rb) return rb - ra;
    return a.localeCompare(b);
  });
}
function gruposAfinesAlIdioma(){
  const target = (ACCES && ACCES.lang) || 'es';
  const set = new Set();
  MEDIOS_UNICOS.forEach(m => { if (m.lang === target) set.add(m.grupo); });
  return set;
}

function reconstruirSelectores(){
  const grupos = ordenarGruposPorIdioma([...new Set(MEDIOS_UNICOS.map(m => m.grupo))]);
  const { buckets, supers } = bucketPorSuper(grupos, g => g);

  const poblar = (sel, labelTodo) => {
    const prev = sel.value;

    // ── Limpieza TOTAL: options + optgroups ──
    sel.innerHTML = '';
    sel.appendChild(new Option(labelTodo, ''));

    supers.forEach(s => {
      const enCat = buckets.get(s);

      // Si la categoría tiene un único grupo que se llama igual
      // (Nacional, Deportes, Economía…), la mostramos como opción
      // top-level. Sin optgroup redundante → sin "Deportes / Deportes".
      if (enCat.length === 1 && enCat[0] === s){
        sel.appendChild(new Option(s, s));
        return;
      }

      const og = document.createElement('optgroup');
      og.label = s;
      enCat.forEach(g => og.appendChild(new Option(g, g)));
      sel.appendChild(og);
    });

    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
  };

  poblar($('#grupo'), t('fltGrupo'));
  poblar($('#filtro-grupo-medio'), t('cfgTodosGrupos'));
}
function renderListaGrupos(p){
  const contG = $('#lista-grupos');
  const grupos = ordenarGruposPorIdioma([...new Set(MEDIOS_UNICOS.map(m => m.grupo))]);
  const afin   = gruposAfinesAlIdioma();
  const gSet   = new Set(p.grupos);
  const { buckets, supers } = bucketPorSuper(grupos, g => g);

  let html = '';
  supers.forEach(s => {
    const enCat   = buckets.get(s);
    const todos   = enCat.every(g => gSet.has(g));
    const algunos = !todos && enCat.some(g => gSet.has(g));

    // Si el grupo se llama igual que la categoría, no pintamos cabecera
    const esRedundante = enCat.length === 1 && enCat[0] === s;
    if (!esRedundante){
      html += `<div class="grupo-cat-header" data-cat="${escapeHtml(s)}">
        <label class="grupo-cat-toggle-wrap">
          <input type="checkbox" class="grupo-cat-toggle"
                ${todos ? 'checked' : ''}
                ${algunos ? 'data-indeterminate="1"' : ''}>
          <strong>${escapeHtml(s)}</strong>
          <span class="grupo-cat-count">${enCat.length}</span>
        </label>
      </div>`;
    }
    enCat.forEach(g => {
      html += `<label class="grupo-item" data-cat="${escapeHtml(s)}">
        <input type="checkbox" data-grupo="${escapeHtml(g)}" ${gSet.has(g) ? 'checked' : ''}>
        <span>${escapeHtml(g)}</span>
        ${afin.has(g) ? '<span class="flag" title="idioma">●</span>' : ''}
      </label>`;
    });
  });
  contG.innerHTML = html;

  // Estado indeterminado (algunos pero no todos)
  contG.querySelectorAll('.grupo-cat-toggle[data-indeterminate="1"]')
    .forEach(chk => { chk.indeterminate = true; });

  // Toggle de categoría completa
  contG.querySelectorAll('.grupo-cat-toggle').forEach(chk => {
    chk.addEventListener('change', () => {
      const cat = chk.closest('.grupo-cat-header').dataset.cat;
      contG.querySelectorAll(`.grupo-item[data-cat="${CSS.escape(cat)}"] input[data-grupo]`)
        .forEach(g => { g.checked = chk.checked; });
    });
  });
}
// Medios del modo que se edita en Ajustes: incluir, destacar o bloquear.
function renderListaMedios(){
  const cont = $('#lista-medios');
  const modo = modoEnPanel();
  const medios = mediosDelPanel(modo);
  const { buckets, supers } = bucketPorSuper(medios, m => m.grupo);

  let html = '';
  supers.forEach(s => {
    const enCat = buckets.get(s);

    // Si el grupo se llama igual que la categoría (Deportes, Economía,
    // Nacional…), no pintamos cabecera: sería una línea redundante.
    const esRedundante = enCat.length === 1 && enCat[0].grupo === s;
    if (!esRedundante){
      html += `<div class="medio-cat-header" data-cat="${escapeHtml(s)}">${escapeHtml(s)}</div>`;
    }

    enCat.forEach(m => {
      const mode  = getOverride(m.dominio, modo) || '';
      html += `
        <div class="medio-fila${overrideIncluye(mode) ? ' estado-incluir' : mode === 'ignore' ? ' estado-ignorar' : ''}"
             data-dominio="${escapeHtml(m.dominio)}"
             data-grupo="${escapeHtml(m.grupo)}"
             data-cat="${escapeHtml(s)}"
             data-buscar="${escapeHtml(normalize(m.dominio + ' ' + m.medio + ' ' + m.grupo))}">
          <span class="medio-identidad">
            <strong>${escapeHtml(m.medio)}</strong>
            <span class="medio-dominio">${escapeHtml(m.dominio)}</span>
            <small>${escapeHtml(m.grupo)}</small>
          </span>
          <select class="medio-estado" aria-label="${escapeHtml(t('cfgEstadoMedio', { X: m.medio }))}">
            ${['', 'include', 'first', 'ignore'].map(v =>
              `<option value="${v}"${mode === v ? ' selected' : ''}>${escapeHtml(t(MEDIO_ESTADOS[v]))}</option>`
            ).join('')}
          </select>
        </div>`;
    });
  });
  cont.innerHTML = html;
  filtrarMedios();
}

const MEDIO_ESTADOS = {
  '': 'cfgMedioAutomatico', include: 'cfgMedioIncluir', first: 'cfgMedioDestacar', ignore: 'cfgMedioBloquear',
};

// Los dominios añadidos a mano se editan en la misma lista que el catálogo.
function mediosDelPanel(modo){
  const conocidos = new Set(MEDIOS_UNICOS.map(m => m.dominio));
  const extras = Object.keys((modo && modo.overrides) || {}).filter(d => !conocidos.has(d))
    .map(d => ({ dominio: d, medio: d, grupo: t('cfgMediosOtros') }));
  return [...MEDIOS_UNICOS, ...extras];
}
function actualizarFilaMedio(dominio, modo){
  const fila = [...document.querySelectorAll('#lista-medios .medio-fila')]
    .find(f => f.dataset.dominio === dominio);
  if (!fila){ actualizarResumen(); return; }
  const estado = getOverride(dominio, modo);
  if (!estado && !MEDIOS_UNICOS.some(m => m.dominio === dominio)){
    fila.remove();
    filtrarMedios();
    return;
  }
  fila.querySelector('.medio-estado').value = estado;
  fila.classList.toggle('estado-incluir', overrideIncluye(estado));
  fila.classList.toggle('estado-ignorar', estado === 'ignore');
  filtrarMedios();
}
function filtrarMedios(){
  const q = normalize($('#filtro-medio').value.trim());
  const g = $('#filtro-grupo-medio').value;
  const estado = $('#filtro-estado-medio').value;
  const modo = modoEnPanel();
  let visibles = 0;

  document.querySelectorAll('#lista-medios .medio-fila').forEach(f => {
    const okQ = !q || f.dataset.buscar.includes(q);
    const okG = !g || f.dataset.grupo === g;
    const valor = getOverride(f.dataset.dominio, modo);
    const okEstado = !estado || (estado === 'configurados' ? !!valor : valor === estado);
    const show = okQ && okG && okEstado;
    f.style.display = show ? '' : 'none';
    if (show) visibles++;
  });

  // Ocultar cabeceras de categoría sin filas visibles
  document.querySelectorAll('#lista-medios .medio-cat-header').forEach(hdr => {
    let sib = hdr.nextElementSibling;
    let hasVisible = false;
    while (sib && !sib.classList.contains('medio-cat-header')){
      if (sib.classList.contains('medio-fila') && sib.style.display !== 'none'){
        hasVisible = true;
        break;
      }
      sib = sib.nextElementSibling;
    }
    hdr.style.display = hasVisible ? '' : 'none';
  });

  actualizarResumen(visibles);
  actualizarAddBar(visibles);
  $('#medios-vacio').hidden = visibles > 0;
}

function actualizarAddBar(visibles){
  const bar   = $('#filtro-medio-add');
  const label = $('#filtro-medio-add-label');
  if (!bar || !label) return;

  const raw = $('#filtro-medio').value.trim();
  const dom = normalizarDominioInput(raw);

  // Solo ofrecemos añadir si:
  //  - hay texto
  //  - parece un dominio válido
  //  - no hay ningún medio visible
  //  - ese dominio no está ya como override
  const esValido = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(dom);
  const modo     = modoEnPanel();
  const yaEsta   = !!(modo && modo.overrides && modo.overrides[dom]);

  const enCatalogo = MEDIOS_UNICOS.some(m => m.dominio === dom);
  if (!raw || !esValido || visibles > 0 || yaEsta || enCatalogo){
    bar.hidden = true;
    return;
  }

  label.innerHTML = t('cfgMedioAddLabel', { X: '<code>' + escapeHtml(dom) + '</code>' });
  bar.hidden = false;
}
function actualizarResumen(visiblesOverride){
  const total = mediosDelPanel(modoEnPanel()).length;
  const visibles = visiblesOverride != null
    ? visiblesOverride
    : document.querySelectorAll('#lista-medios .medio-fila:not([style*="display: none"])').length;
  const ov = Object.values((modoEnPanel() || {}).overrides || {});
  const inc = ov.filter(overrideIncluye).length;
  const fav = ov.filter(v => v === 'first').length;
  const ign = ov.filter(v => v === 'ignore').length;
  $('#resumen-medios').textContent = t('cfgResumen', {
    vis: visibles, total: total, inc: inc, fav: fav, ign: ign
  });
}
/* ═══════════════════════════════════════════════════════════════
   AJUSTES · navegación
   AJ_PILA son las páginas abiertas, de la primera a la visible. Cada una
   tiene su paso en el historial (history.pushState): el botón atrás del
   móvil sube un nivel y al final cierra Ajustes, en vez de salir de la web.
   Rutas: '' (lista de secciones, solo en móvil), las de AJ_SECCIONES
   y 'modo' (el de MODO_EDITADO).
   ═══════════════════════════════════════════════════════════════ */
const AJ_SECCIONES = ['modos', 'lectura', 'feed', 'sync', 'lector', 'avanzado', 'ayuda'];
const AJ_TITULOS = {
  '': 'ajTitulo', modos: 'ajModos', lectura: 'ajLectura',
  feed: 'ajFeed', sync: 'ajSync', lector: 'ajLector', avanzado: 'ajAvanzado', ayuda: 'ajAyuda',
};
let AJ_PILA = [];             // vacía = Ajustes cerrado
let MODO_EDITADO = null;      // id del modo de la página 'modo'
let _ajPendiente = null;      // sección que mostrar al volver atrás en el historial
let _ajSinReglas = new Set(); // modos vacíos al abrir (ver ajActivarAlCerrar)
let _ajOrigen = null;

function ajEsMovil(){ return window.matchMedia('(max-width: 819.98px)').matches; }
function ajAbierto(){ return AJ_PILA.length > 0; }
function ajRuta(){ return AJ_PILA.length ? AJ_PILA[AJ_PILA.length - 1] : null; }
function ajAnchoLimites(){ return [Math.min(700, window.innerWidth), window.innerWidth]; }
function ajFijarAncho(ancho){
  const inner = $('#panel-ajustes .aj-inner');
  const control = $('#aj-resize');
  if (ajEsMovil()){
    inner.style.removeProperty('width');
    return;
  }
  const [min, max] = ajAnchoLimites();
  const valor = Math.round(Math.max(min, Math.min(max, ancho)));
  inner.style.width = valor + 'px';
  control.setAttribute('aria-valuemin', min);
  control.setAttribute('aria-valuemax', max);
  control.setAttribute('aria-valuenow', valor);
}
function ajPrepararAncho(){
  const control = $('#aj-resize');
  let guardado;
  try { guardado = Number(localStorage.getItem('voceiro-aj-ancho')); } catch(e){}
  let ancho = guardado > 0 ? guardado : 900;
  const aplicar = () => ajFijarAncho(ancho);
  aplicar();
  window.addEventListener('resize', aplicar);
  let inicioX, anchoInicial;
  control.addEventListener('pointerdown', e => {
    if (ajEsMovil() || e.button !== 0) return;
    inicioX = e.clientX;
    anchoInicial = $('#panel-ajustes .aj-inner').getBoundingClientRect().width;
    control.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  control.addEventListener('pointermove', e => {
    if (!control.hasPointerCapture(e.pointerId)) return;
    ancho = anchoInicial + inicioX - e.clientX;
    ajFijarAncho(ancho);
  });
  const terminar = e => {
    if (!control.hasPointerCapture(e.pointerId)) return;
    control.releasePointerCapture(e.pointerId);
    ancho = Number(control.getAttribute('aria-valuenow'));
    try { localStorage.setItem('voceiro-aj-ancho', ancho); } catch(e){}
  };
  control.addEventListener('pointerup', terminar);
  control.addEventListener('pointercancel', terminar);
  control.addEventListener('keydown', e => {
    if (ajEsMovil() || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    ancho = Number(control.getAttribute('aria-valuenow')) + (e.key === 'ArrowLeft' ? 1 : -1) * (e.shiftKey ? 80 : 20);
    ajFijarAncho(ancho);
    ancho = Number(control.getAttribute('aria-valuenow'));
    try { localStorage.setItem('voceiro-aj-ancho', ancho); } catch(e){}
  });
}
function modoEnPanel(){
  return (PRESETS && PRESETS.lista.find(p => p.id === MODO_EDITADO)) || null;
}
function ajSeccionGuardada(){
  let r = null;
  try { r = localStorage.getItem(AJ_SECCION_KEY); } catch(e){}
  return AJ_SECCIONES.includes(r) ? r : 'modos';
}

// Abre Ajustes en una ruta, o cambia de sección si ya está abierto. Sin
// ruta: en móvil, la lista de secciones; en escritorio, la última vista.
function abrirAjustes(ruta){
  if (ruta == null) ruta = ajEsMovil() ? '' : ajSeccionGuardada();
  if (ajAbierto()){
    if (ruta === 'modo') ajEmpujar('modo');
    else ajIrSeccion(ruta);
    return;
  }
  _ajOrigen = document.activeElement;
  cerrarPresetMenu();
  abrirPanel('panel-ajustes');
  AJ_PILA = [ruta];
  if (ruta !== 'modo') MODO_EDITADO = null;
  _ajSinReglas = new Set(PRESETS.lista.filter(p => !presetTieneReglas(p)).map(p => p.id));
  history.pushState({ aj: 1 }, '');
  ajPintar();
}

// Un nivel más: una sección desde la lista (móvil) o un modo desde Modos.
function ajEmpujar(ruta){
  ajGuardarTemas();
  AJ_PILA.push(ruta);
  history.pushState({ aj: AJ_PILA.length }, '');
  ajPintar();
}

// Sección elegida en la lista (móvil) o en la barra lateral (escritorio).
function ajIrSeccion(ruta){
  ajGuardarTemas();
  if (ajRuta() === ruta) return;
  if (ajEsMovil()){
    if (ajRuta() === '') ajEmpujar(ruta);
    else { AJ_PILA[AJ_PILA.length - 1] = ruta; ajPintar(); }
    return;
  }
  if (AJ_PILA.length > 1){
    // Dentro de un modo: se vuelve al primer paso del historial y ahí se
    // muestra la sección, para que atrás no lleve a páginas viejas.
    _ajPendiente = ruta;
    history.go(-(AJ_PILA.length - 1));
    return;
  }
  AJ_PILA[0] = ruta;
  ajPintar();
}

// Botón «‹» de la cabecera: de un modo a Modos; de una sección a la lista.
function ajAtras(){
  ajGuardarTemas();
  const padre = ajRuta() === 'modo' ? 'modos' : '';
  if (AJ_PILA.length > 1 && AJ_PILA[AJ_PILA.length - 2] === padre){
    history.back();
    return;
  }
  AJ_PILA[AJ_PILA.length - 1] = padre;   // sin paso previo: se sustituye
  ajPintar();
}

function ajPopstate(e){
  if (!ajAbierto()) return;
  const d = (e.state && e.state.aj) || 0;
  ajGuardarTemas();
  if (d <= 0){ ajCerrarVista(); return; }
  if (d < AJ_PILA.length) AJ_PILA.length = d;
  if (_ajPendiente != null){
    AJ_PILA[AJ_PILA.length - 1] = _ajPendiente;
    _ajPendiente = null;
  }
  ajPintar();
}

function cerrarAjustes(){
  if (!ajAbierto()) return;
  const pasos = AJ_PILA.length;
  ajCerrarVista();
  history.go(-pasos);   // el popstate llega con Ajustes ya cerrado y se ignora
}
function ajCerrarVista(){
  ajGuardarTemas();
  ajVaciarLector();
  AJ_PILA = [];
  _ajPendiente = null;
  cerrarPanel('panel-ajustes');
  ajActivarAlCerrar();
  const origen = _ajOrigen && _ajOrigen.isConnected && _ajOrigen.getClientRects().length
    ? _ajOrigen : $('#btn-config');
  origen.focus({ preventScroll: true });
  _ajOrigen = null;
}

// Muestra la página de la ruta visible y la rellena.
function ajPintar(){
  const panel = $('#panel-ajustes');
  if (!panel || !ajAbierto()) return;
  let ruta = ajRuta();
  if (ruta === '' && !ajEsMovil()) ruta = AJ_PILA[AJ_PILA.length - 1] = ajSeccionGuardada();
  if (ruta === 'modo' && !modoEnPanel()) ruta = AJ_PILA[AJ_PILA.length - 1] = 'modos';
  panel.dataset.ruta = ruta;
  const seccion = ruta === 'modo' ? 'modos' : ruta;
  panel.querySelectorAll('.aj-secciones button').forEach(b => {
    if (b.dataset.ir === seccion) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  panel.querySelectorAll('.aj-pagina').forEach(p => { p.hidden = p.dataset.pagina !== ruta; });
  if (ruta !== 'lector') ajVaciarLector();
  if (AJ_SECCIONES.includes(ruta)){
    try { localStorage.setItem(AJ_SECCION_KEY, ruta); } catch(e){}
  }
  const cuerpo = panel.querySelector('.aj-cuerpo');
  if (cuerpo) cuerpo.scrollTop = 0;
  ajRefrescar();
  panel.setAttribute('aria-labelledby', ruta ? 'aj-titulo-pagina' : 'aj-titulo');
  const titulo = ruta ? $('#aj-titulo-pagina') : $('#aj-titulo');
  titulo.focus({ preventScroll: true });
}

// Repinta la página visible con los datos actuales. Se llama tras cualquier
// cambio que venga de fuera (plugin, importar, titulares, idioma…).
function ajRefrescar(){
  if (!ajAbierto()) return;
  const ruta = ajRuta();
  if (ruta === 'modo' && !modoEnPanel()){ ajPintar(); return; }
  const modo = modoEnPanel();
  $('#aj-titulo-pagina').textContent = ruta === 'modo' ? modo.nombre : t(AJ_TITULOS[ruta] || 'ajTitulo');
  $('#aj-atras-lbl').textContent = t(ruta === 'modo' ? 'ajModos' : 'ajTitulo');
  $('#aj-atras').setAttribute('aria-label', $('#aj-atras-lbl').textContent);
  if (ruta === 'modos') renderListaModos();
  else if (ruta === 'modo') pintarModo();
  else if (ruta === 'feed'){ ajPintarVista(); renderListaPortadas(); }
  else if (ruta === 'avanzado') renderDiasSelector();
  else if (ruta === 'sync') ajPintarSync();
  else if (ruta === 'lector') ajPintarLector();
}

// Página Lector: el panel lo pinta el propio lector en #aj-lector-panel; aquí
// solo se le avisa (lo ignora si ya está). Al salir de la página se vacía.
// AJ_LECTOR_DOMINIO: el medio de «Cómo leerlo»; el lector lo pone delante.
let AJ_LECTOR_DOMINIO = '';
function ajPintarLector(){
  actualizarSyncBanner();
  $('#aj-plugin-hint').hidden = USCRIPT_OK;
  $('#aj-lector-instalar').hidden = USCRIPT_OK;
  $('#aj-lector-hint').hidden = USCRIPT_OK;
  if (!USCRIPT_OK){ ajVaciarLector(); return; }
  const dominio = AJ_LECTOR_DOMINIO;
  AJ_LECTOR_DOMINIO = '';
  try {
    document.dispatchEvent(new CustomEvent('voceiro-ajustes-lector',
      { detail: dominio ? { v: PUENTE_V, dominio } : { v: PUENTE_V } }));
  } catch(e){}
}
function ajVaciarLector(){
  const c = document.getElementById('aj-lector-panel');
  if (c) c.replaceChildren();
}

/* ═══════════════════════════════════════════════════════════════
   AJUSTES · modos
   Se edita cualquier modo, no solo el activo, y todo se guarda al momento.
   Si el modo editado es el activo, el feed se reconfigura detrás.
   ═══════════════════════════════════════════════════════════════ */
function resumenModo(p){
  if (!presetTieneReglas(p)) return t('ajModoVacio');
  return t('ajResumenModo', {
    t: compilarTemas(p.palabras || []).length,
    g: (p.grupos || []).length,
    m: Object.keys(p.overrides || {}).length,
  });
}
function renderListaModos(){
  const cont = $('#lista-modos');
  if (!cont) return;
  cont.innerHTML = PRESETS.lista.map(p => {
    const activo = PRESET_ACTIVO && p.id === PRESETS.activo;
    return `<button type="button" class="aj-modo-fila" data-modo-id="${escapeHtml(p.id)}">
      <span class="aj-modo-txt">
        <span class="aj-modo-nombre">${escapeHtml(p.nombre)}</span>
        <span class="aj-modo-resumen">${escapeHtml(resumenModo(p))}</span>
      </span>
      ${activo ? `<span class="aj-activo">${escapeHtml(t('ajModoActivo'))}</span>` : ''}
      <span class="aj-modo-editar">${escapeHtml(t('ajModoEditar'))}${ico('chevron-right')}</span>
    </button>`;
  }).join('');
}
function ajEditarModo(id){
  ajGuardarTemas();
  MODO_EDITADO = id;
  $('#filtro-medio').value = '';
  $('#filtro-grupo-medio').value = '';
  $('#filtro-estado-medio').value = '';
  $('#ov-pegar').value = '';
  $('#aj-bloque-temas').open = true;
  $('#aj-bloque-medios').open = true;
  $('#aj-bloque-grupos').open = false;
  if (ajRuta() === 'modo') ajPintar();
  else ajEmpujar('modo');
}

function pintarModo(){
  const modo = modoEnPanel();
  if (!modo) return;
  const activo = PRESET_ACTIVO && modo.id === PRESETS.activo;
  const estado = $('#aj-modo-estado');
  estado.textContent = t('ajModoActivo');
  estado.hidden = !activo;
  $('#aj-modo-activar').hidden = activo;
  const pista = $('#aj-modo-pista');
  pista.textContent = t('pistaModoVacio');
  pista.hidden = presetTieneReglas(modo);
  // No se pisa lo que se está escribiendo.
  const ta = $('#aj-temas');
  if (document.activeElement !== ta || ta.dataset.modoId !== modo.id){
    ta.value = (modo.palabras || []).join('\n');
    ta.dataset.modoId = modo.id;
  }
  renderListaGrupos(modo);
  renderListaMedios();
  ajContadores(modo);
}
function ajContadores(modo){
  $('#aj-temas-n').textContent = '· ' + compilarTemas(parseLista($('#aj-temas').value)).length;
  const ov = Object.values(modo.overrides || {});
  $('#aj-medios-n').textContent = '· ' + t('ajMediosN', {
    f: ov.filter(overrideIncluye).length,
    s: ov.filter(v => v === 'first').length,
    b: ov.filter(v => v === 'ignore').length,
  });
  $('#aj-grupos-n').textContent = '· ' + (modo.grupos || []).length;
}

// Tras guardar un cambio de un modo. Si es el activo, se recompila; el feed
// se vuelve a filtrar con espera, para agrupar clics y teclas seguidos.
const _ajFiltrar = debounce(() => aplicarFiltros(), 400);
function ajModoCambiado(modo){
  if (modo.id === PRESETS.activo){
    PRESET = modo;
    recompilarPreset();
    if (PRESET_ACTIVO && !presetTieneReglas()){
      PRESET_ACTIVO = false;
      guardarPresetActivo();
    }
  }
  if (VISTA_TEMAS && !TEMAS_TODOS.length) ponerVistaTemas(false);
  actualizarBotonPreset();
  _ajFiltrar();
  if (ajRuta() === 'modo'){
    ajContadores(modo);
    $('#aj-modo-pista').hidden = presetTieneReglas(modo);
    const activo = PRESET_ACTIVO && modo.id === PRESETS.activo;
    $('#aj-modo-estado').hidden = !activo;
    $('#aj-modo-activar').hidden = activo;
  }
}

// Temas: se guardan al dejar de escribir y al salir de la caja. La caja
// lleva el id de su modo por si se cambia de modo con algo sin guardar.
let _ajTemasTimer = 0;
function ajGuardarTemas(){
  clearTimeout(_ajTemasTimer);
  _ajTemasTimer = 0;
  const ta = $('#aj-temas');
  if (!ta || !ta.dataset.modoId || !PRESETS) return;
  const modo = PRESETS.lista.find(p => p.id === ta.dataset.modoId);
  if (!modo) return;
  const nuevas = parseLista(ta.value);
  const antes = modo.palabras || [];
  if (nuevas.length === antes.length && nuevas.every((x, i) => x === antes[i])) return;
  modo.palabras = nuevas;
  guardarPresets();
  ajModoCambiado(modo);
}

// Lo que antes hacía «Guardar»: si el modo editado ha pasado de vacío a
// tener reglas y no hay modo activo ni vista Temas, se activa al cerrar.
function ajActivarAlCerrar(){
  const modo = modoEnPanel();
  if (!modo || PRESET_ACTIVO || vistaTemasActiva()) return;
  if (!_ajSinReglas.has(modo.id) || !presetTieneReglas(modo)) return;
  PRESETS.activo = modo.id;
  PRESET = modo;
  PRESET_ACTIVO = true;
  guardarPresets();
  guardarPresetActivo();
  recompilarPreset();
  actualizarBotonPreset();
  aplicarFiltros();
  toast(t('presetGuardadoActivado', { X: modo.nombre }), 2600);
}

// Copia para «Deshacer» (vaciar o borrar un modo).
function ajCapturar(){
  return { presets: structuredClone(PRESETS), activo: PRESET_ACTIVO };
}
function ajRestaurar(copia){
  PRESETS = copia.presets;
  PRESET = PRESETS.lista.find(p => p.id === PRESETS.activo) || PRESETS.lista[0];
  PRESETS.activo = PRESET.id;
  PRESET_ACTIVO = copia.activo && presetTieneReglas();
  guardarPresets();
  guardarPresetActivo();
  recompilarPreset();
  actualizarBotonPreset();
  aplicarFiltros();
  ajRefrescar();
}

function activarModo(id){
  const target = PRESETS.lista.find(p => p.id === id);
  if (!target) return;
  if (!presetTieneReglas(target)){
    toast(t('presetVacio'), 3200);
    return;
  }
  PRESETS.activo = id;
  PRESET = target;
  PRESET_ACTIVO = true;
  guardarPresets();
  guardarPresetActivo();
  recompilarPreset();
  actualizarBotonPreset();
  ajRefrescar();
  aplicarFiltros();
}

function renombrarModo(id){
  const p = PRESETS.lista.find(x => x.id === id);
  if (!p) return;
  const nuevo = prompt(t('cfgModoRenombrarPrompt', { X: p.nombre }), p.nombre);
  if (nuevo == null) return;
  const limpio = nuevo.trim();
  if (!limpio) return;
  p.nombre = limpio;
  guardarPresets();
  actualizarBotonPreset();
  ajRefrescar();
}

function duplicarModo(id){
  const p = PRESETS.lista.find(x => x.id === id);
  if (!p) return null;
  ajGuardarTemas();
  const copia = structuredClone(p);
  copia.id = 'm-' + Date.now().toString(36);
  copia.nombre = p.nombre + ' ' + t('cfgModoDuplicarSufijo');
  PRESETS.lista.push(copia);
  guardarPresets();
  ajRefrescar();
  return copia;
}

function vaciarModo(id){
  const modo = PRESETS.lista.find(p => p.id === id);
  if (!modo) return;
  if (!confirm(t('ajModoConfirmVaciar', { X: modo.nombre }))) return;
  const copia = ajCapturar();
  modo.grupos = [];
  modo.palabras = [];
  modo.overrides = {};
  const ta = $('#aj-temas');
  if (ta && ta.dataset.modoId === id) ta.value = '';
  guardarPresets();
  ajModoCambiado(modo);
  ajRefrescar();
  toast(t('ajModoVaciado', { X: modo.nombre }), 6000,
        { texto: t('ajDeshacer'), fn: () => ajRestaurar(copia) });
}

function borrarModo(id){
  if (PRESETS.lista.length <= 1){
    toast(t('cfgModoUnicoNoBorrar'), 2400);
    return;
  }
  const p = PRESETS.lista.find(x => x.id === id);
  if (!p) return;
  if (!confirm(t('cfgModoConfirmBorrar', { X: p.nombre }))) return;
  const copia = ajCapturar();

  PRESETS.lista = PRESETS.lista.filter(x => x.id !== id);
  if (PRESETS.activo === id){
    PRESETS.activo = PRESETS.lista[0].id;
    PRESET = PRESETS.lista[0];
    PRESET_ACTIVO = PRESET_ACTIVO && presetTieneReglas();
    guardarPresetActivo();
    recompilarPreset();
  }
  guardarPresets();
  actualizarBotonPreset();
  aplicarFiltros();
  if (ajRuta() === 'modo' && MODO_EDITADO === id) ajAtras();
  else ajRefrescar();
  toast(t('cfgModoBorrado', { X: p.nombre }), 6000,
        { texto: t('ajDeshacer'), fn: () => ajRestaurar(copia) });
}

function normalizarDominioInput(s){
  return String(s || '').trim().toLowerCase()
    .replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
}



function aplicarListaOverrides(){
  const modo = modoEnPanel();
  if (!modo) return;
  const txt = $('#ov-pegar').value || '';
  const lineas = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let ok = 0, ko = 0;
  lineas.forEach(l => {
    const m = l.match(/^([+-]?)\s*(.+)$/);
    if (!m){ ko++; return; }
    const signo = m[1] || '-';
    const d = normalizarDominioInput(m[2]);
    if (!d || !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(d)){ ko++; return; }
    setOverride(d, signo === '+' ? 'include' : 'ignore', modo);
    ok++;
  });
  $('#ov-pegar').value = '';
  ajModoCambiado(modo);
  pintarModo();
  toast(`OK: ${ok} · KO: ${ko}`, 2200);
}
/* ═══════════════════════════════════════════════════════════════
   CUMPLE PRESET
   ═══════════════════════════════════════════════════════════════ */
let SET_GRUPOS = new Set();
// Temas: las palabras de cada modo, una búsqueda pequeña por línea
// (shared/busqueda/temas.js). Se compilan los de TODOS los modos: el modo
// activo los usa para ampliar su feed y la vista 🔖 Temas los junta.
// TEMAS_VER invalida la caché de cada noticia (n._temas) al recompilar.
let TEMAS_TODOS = [];   // [{ id, nombre, temas, ignorar: Set(dominios) }]
let TEMAS_VER = 0;

function recompilarPreset(){
  SET_GRUPOS = new Set(PRESET.grupos);
  recompilarTemas();
}
// Depende de toda la lista de modos: la llaman recompilarPreset y
// guardarPresets (renombrar, duplicar, borrar, silenciar un medio…).
function recompilarTemas(){
  const lista = (PRESETS && PRESETS.lista) || [];
  TEMAS_TODOS = lista.map(p => {
    const ov = p.overrides || {};
    return {
      id: p.id,
      nombre: p.nombre,
      temas: compilarTemas(p.palabras),
      ignorar: new Set(Object.keys(ov).filter(d => ov[d] === 'ignore')),
    };
  }).filter(m => m.temas.length);
  TEMAS_VER++;
}
// Temas que casan con la noticia, de todos los modos: [{ id, etiqueta }].
// Un modo no aporta temas en los medios que tiene silenciados.
function _temasDe(n){
  if (n._temasVer === TEMAS_VER) return n._temas;
  const palabras = n._palabras || (n._palabras = palabrasDe(n.titular));
  const out = [];
  for (const m of TEMAS_TODOS){
    if (m.ignorar.has(n.dominio)) continue;
    for (const etiqueta of temasQueCasan(palabras, m.temas, n.titular)) out.push({ id: m.id, etiqueta });
  }
  n._temas = out;
  n._temasVer = TEMAS_VER;
  return out;
}
// Lo que filtra el feed: los temas en la vista 🔖 Temas (con el chip de
// modo, si hay), o el modo activo; y encima, el chip de tema.
function cumpleFiltro(n, ctx){
  if (ctx && ctx.vistaTemas){
    const ts = _temasDe(n);
    if (!(ctx.chipTemas ? ts.some(x => x.id === ctx.chipTemas) : ts.length > 0)) return false;
  } else if (!cumplePreset(n)) return false;
  return !(ctx && ctx.chipTema) || _pasaChipTema(n, ctx.chipTema);
}
function _pasaChipTema(n, chip){
  if (chip.medios) return _entraPorMedios(n);
  return _temasDe(n).some(x => x.id === chip.modo && x.etiqueta === chip.etiqueta);
}
// Lo que entra en el modo activo por sus medios (grupos o incluidos), no
// por sus temas.
function _entraPorMedios(n){
  return overrideIncluye(getOverride(n.dominio)) || SET_GRUPOS.has(n.grupo);
}
function _modoTieneMedios(){
  const ov = PRESET.overrides || {};
  return SET_GRUPOS.size > 0 || Object.keys(ov).some(d => overrideIncluye(ov[d]));
}
function cumplePreset(n){
  const ov = getOverride(n.dominio);
  if (ov === 'ignore') return false;
  if (overrideIncluye(ov)) return true;
  if (SET_GRUPOS.has(n.grupo)) return true;
  return _temasDe(n).some(x => x.id === PRESET.id);
}
/* ═══════════════════════════════════════════════════════════════
   REPORTES
   ═══════════════════════════════════════════════════════════════ */
let REPORTE_CONTEXTO = null;

function abrirReporte(contexto){
  REPORTE_CONTEXTO = contexto || null;
  const ctxBox = $('#rep-contexto');
  if (!ctxBox) return;
  const ctx = REPORTE_CONTEXTO;
  if (!ctx){
    ctxBox.className = 'rep-ctx empty';
    ctxBox.textContent = t('repCtxEmpty');
  } else {
    ctxBox.className = 'rep-ctx';
    const rows = [
      ctx.medio     ? `<div><strong>${escapeHtml(t('repCtxMedio'))}:</strong> ${escapeHtml(ctx.medio)}</div>` : '',
      ctx.dominio   ? `<div><strong>Domain:</strong> ${escapeHtml(ctx.dominio)}</div>` : '',
      ctx.grupo     ? `<div><strong>${escapeHtml(t('repCtxGrupo'))}:</strong> ${escapeHtml(ctx.grupo)}</div>` : '',
      ctx.tipo      ? `<div><strong>${escapeHtml(t('repCtxTipo'))}:</strong> ${escapeHtml(ctx.tipo)}</div>` : '',
      ctx.titular   ? `<div><strong>${escapeHtml(t('repCtxTitular'))}:</strong> ${escapeHtml(ctx.titular)}</div>` : '',
      ctx.enlace    ? `<div><strong>${escapeHtml(t('repCtxEnlace'))}:</strong> <a href="${escapeHtml(ctx.enlace)}" target="_blank" rel="noopener" style="color:var(--accent)">${escapeHtml(ctx.enlace)}</a></div>` : '',
      ctx.fecha     ? `<div><strong>${escapeHtml(t('repCtxFecha'))}:</strong> ${escapeHtml(ctx.fecha)}</div>` : '',
      ctx.fuente    ? `<div><strong>${escapeHtml(t('repCtxFuente'))}:</strong> ${escapeHtml(ctx.fuente)}</div>` : '',
    ].filter(Boolean).join('');
    ctxBox.innerHTML = rows || `<div>${escapeHtml(t('repCtxEmpty'))}</div>`;
  }
  $('#rep-motivo').value = 'no_se_muestra';
  $('#rep-detalles').value = '';
  abrirPanel('panel-reporte');
}

function construirTextoReporte(){
  const motivoSel = $('#rep-motivo');
  const motivoTxt = motivoSel.options[motivoSel.selectedIndex].textContent;
  const detalles = $('#rep-detalles').value.trim();
  const incluirConfig = $('#rep-config-incluir').checked;

  const L = [];
  L.push(`### ${t('repTitle')}`);
  L.push('');
  L.push(`**${t('repMotivoLbl')}:** ${motivoTxt}`);
  L.push(`**${t('repFecha')}:** ${new Date().toISOString()}`);
  L.push('');

  if (detalles){
    L.push(`**${t('repDetallesLbl')}:**`);
    L.push(detalles);
    L.push('');
  }

  if (REPORTE_CONTEXTO){
    const c = REPORTE_CONTEXTO;
    L.push(`### ${t('repContexto')}`);
    if (c.medio)   L.push(`- **${t('repCtxMedio')}:** ${c.medio}`);
    if (c.dominio) L.push(`- **Domain:** ${c.dominio}`);
    if (c.grupo)   L.push(`- **${t('repCtxGrupo')}:** ${c.grupo}`);
    if (c.tipo)    L.push(`- **${t('repCtxTipo')}:** ${c.tipo}`);
    if (c.fuente)  L.push(`- **${t('repCtxFuente')}:** ${c.fuente}`);
    if (c.fecha)   L.push(`- **${t('repCtxFecha')}:** ${c.fecha}`);
    if (c.titular) L.push(`- **${t('repCtxTitular')}:** ${c.titular}`);
    if (c.enlace)  L.push(`- **${t('repCtxEnlace')}:** ${c.enlace}`);
    L.push('');
  }

  L.push(`- **${t('repCtxIdioma')}:** ${ACCES.lang}`);

  if (incluirConfig){
    L.push('');
    L.push(`### ${t('repCtxConfig')}`);
    L.push('```json');
    L.push(JSON.stringify({
      acces: ACCES,
      preset: PRESET,
      presetActivo: PRESET_ACTIVO,
      sites: [...SITES.entries()].map(([d, s]) => ({ domain: d, ...s }))
    }, null, 2));
    L.push('```');
  }

  return L.join('\n');
}

function construirTituloReporte(){
  const motivoSel = $('#rep-motivo');
  const motivoTxt = motivoSel.options[motivoSel.selectedIndex].textContent;
  if (REPORTE_CONTEXTO && REPORTE_CONTEXTO.medio){
    return `[Reporte] ${motivoTxt} — ${REPORTE_CONTEXTO.medio}${REPORTE_CONTEXTO.grupo ? ' (' + REPORTE_CONTEXTO.grupo + ')' : ''}`;
  }
  return `[Reporte] ${motivoTxt}`;
}

function reportarViaGithub(){
  const title = encodeURIComponent(construirTituloReporte());
  const body  = encodeURIComponent(construirTextoReporte());
  const url = `https://github.com/${REPORT_REPO}/issues/new?title=${title}&body=${body}`;
  try{
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if (!w) throw new Error('popup blocked');
  }catch(e){ toast(t('repErrGithub'), 3200); }
}
function reportarViaEmail(){
  const subject = encodeURIComponent(construirTituloReporte());
  const body    = encodeURIComponent(construirTextoReporte());
  window.location.href = `mailto:${REPORT_EMAIL}?subject=${subject}&body=${body}`;
}
function copiarReporte(){
  const texto = construirTextoReporte();
  const done = () => toast(t('repCopiado'), 1800);
  const fb = () => {
    const ta = document.createElement('textarea');
    ta.value = texto; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch(e){ toast('No se pudo copiar', 2000); }
    ta.remove();
  };
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(texto).then(done, fb);
  } else fb();
}
/* ═══════════════════════════════════════════════════════════════
   IMPORT / EXPORT
   ═══════════════════════════════════════════════════════════════ */
const FONT_MAP_TO_LECTOR = { serif: 'georgia', sans: 'sans', dyslexic: 'dyslexic' };
const FONT_MAP_FROM_LECTOR = { georgia: 'serif', serif: 'serif', sans: 'sans', dyslexic: 'dyslexic' };

function detectarFormato(data){
  if (!data || typeof data !== 'object') return 'invalid';
  if (data._app === 'voceiro') return 'voceiro';
  if (Array.isArray(data.sites) || data.prefs || Array.isArray(data.disabledDomains)) return 'userscript';
  if (data.acces || data.preset) return 'voceiro';
  return 'unknown';
}

function exportarConfig(){
  const sitesArr = [...SITES.entries()].map(([d, s]) => ({
    domain: d,
    lang: s.lang || 'auto',
    type: s.type || '',
    tags: s.tags || [],
    ignorePatterns: [],
    readerSource: 'auto',
    textOnly: false
  }));

  const lectorPrefs = {
    fs: ACCES.fs,
    theme: ACCES.tema,
    width: ACCES.width,
    font: FONT_MAP_TO_LECTOR[ACCES.fuente] || 'sans',
    lh: 1.7,
    just: ACCES.just,
    bionic: ACCES.bionic,
    focus: ACCES.focus,
    img: true,
    panelText: true,
    panelActions: false,
  };

  const payload = {
    _app: 'voceiro',
    _version: 5,
    _format: 'combo',
    _exported: new Date().toISOString(),
    acces: ACCES,
    preset: PRESET,
    presetActivo: PRESET_ACTIVO,
    _lectorVersion: '1.1.0',
    lang: ACCES.lang,
    sites: sitesArr,
    voceiro: { presets: PRESETS.lista },
    prefs: lectorPrefs,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const fecha = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `voceiro-config-${fecha}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast(t('expOk'), 1800);
}


function importarDesdeFormatoVoceiro(data){
  if (data.acces && typeof data.acces === 'object'){
    ACCES = { ...ACCES_DEF, ...data.acces };
    if (!I18N[ACCES.lang]) ACCES.lang = 'es';
    guardarAcces();
  }

  if (Array.isArray(data.sites)){
    setSitesFromArray(data.sites);
    guardarSitesCache();
  }

  if (data.voceiro && Array.isArray(data.voceiro.presets) && data.voceiro.presets.length){
    const lista = data.voceiro.presets.map(normalizarPreset);
    PRESETS = { lista, activo: lista[0].id };
    PRESET = PRESETS.lista[0];
    guardarPresets();
    recompilarPreset();
  }

  if (typeof data.presetActivo === 'boolean'){
    PRESET_ACTIVO = data.presetActivo && presetTieneReglas();
  } else {
    PRESET_ACTIVO = presetTieneReglas();
  }
  guardarPresetActivo();
}

function importarDesdeFormatoLector(data){
  if (data.prefs && typeof data.prefs === 'object'){
    const p = data.prefs;
    if (['light','sepia','dark','contrast'].includes(p.theme)) ACCES.tema = p.theme;
    if (FONT_MAP_FROM_LECTOR[p.font]) ACCES.fuente = FONT_MAP_FROM_LECTOR[p.font];
    if (typeof p.fs === 'number' && p.fs >= LIM.fs.min && p.fs <= LIM.fs.max) ACCES.fs = p.fs;
    if (typeof p.width === 'number'){
      ACCES.width = Math.max(LIM.width.min, Math.min(LIM.width.max, p.width));
    }
    if (typeof p.just === 'boolean') ACCES.just = p.just;
    if (typeof p.bionic === 'boolean') ACCES.bionic = p.bionic;
    if (typeof p.focus === 'boolean') ACCES.focus = p.focus;
  }
  if (typeof data.lang === 'string' && I18N[data.lang]) ACCES.lang = data.lang;
  guardarAcces();

  const known = new Set(MEDIOS_UNICOS.map(m => m.dominio));
  const arr = [];
  (data.sites || []).forEach(s => {
    if (!s || !s.domain) return;
    const d = String(s.domain).toLowerCase().trim();
    if (!known.has(d)) return;
    arr.push({
      domain: d,
      lang: s.lang || 'auto',
      type: s.type || '',
      tags: s.tags || []
    });
  });
  (data.disabledDomains || []).forEach(d0 => {
    const d = String(d0).toLowerCase().trim();
    if (!known.has(d)) return;
    if (!arr.some(x => x.domain === d)){
      arr.push({
        domain: d,
        lang: 'auto',
        type: '',
        tags: []
      });
    }
  });
  setSitesFromArray(arr);
  guardarSitesCache();
  if (data.voceiro && Array.isArray(data.voceiro.presets) && data.voceiro.presets.length){
    const lista = data.voceiro.presets.map(normalizarPreset);
    PRESETS = { lista, activo: lista[0].id };
    PRESET = PRESETS.lista[0];
    guardarPresets();
    recompilarPreset();
  }
  PRESET_ACTIVO = presetTieneReglas();
  guardarPresetActivo();
}

function importarConfig(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      if (!data || typeof data !== 'object') throw new Error('JSON inválido');
      if (!confirm(t('impConfirm'))) return;

      const formato = detectarFormato(data);
      let msgOk = t('impOk');

      if (formato === 'voceiro' || formato === 'combo'){
        importarDesdeFormatoVoceiro(data);
        msgOk = t('impFromVoceiro');
      } else if (formato === 'userscript'){
        importarDesdeFormatoLector(data);
        msgOk = t('impFromLector');
      } else {
        throw new Error('Formato no reconocido');
      }

      aplicarAcces();
      aplicarTextos();
      reconstruirSelectores();
      construirIndicesBusqueda();
      actualizarBotonPreset();
      ajRefrescar();
      aplicarFiltros();
      toast(msgOk, 2400);
    }catch(e){
      toast(t('impErr', { msg: e.message || String(e) }), 3000);
    }
  };
  reader.onerror = () => toast(t('impErr', { msg: 'read error' }), 3000);
  reader.readAsText(file);
}
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
// Texto, medios y fechas: lo decide el núcleo (shared/busqueda/consulta.js).
function _pasaConsulta(n, consulta){
  return consulta.pasa({
    dominio: n.dominio,
    titular: n.titular,
    ts: n._tsActualidad,
    palabras: n._palabras || (n._palabras = palabrasDe(n.titular)),
  });
}
// Lo mismo para lo que trajo la prensa: las palabras buscadas pueden estar
// en el cuerpo (consulta.pasaExterno).
function _pasaExterno(n, consulta){
  return consulta.pasaExterno({
    dominio: n.dominio,
    titular: n.titular,
    ts: n._tsActualidad,
    palabras: n._palabras || (n._palabras = palabrasDe(n.titular)),
  });
}
// ¿Todo lo que tiene el item viene de capas de una consulta (archivo, prensa)?
function _soloDeConsulta(n){
  for (const c of n._capas) if (c !== 'turso' && c !== 'prensa') return false;
  return true;
}

// Vista de un item para el comparador del núcleo (shared/busqueda/orden.js).
// El rango (relevancia) solo vale para la consulta que lo produjo.
function _paraOrden(n, clave){
  return {
    ts: n._tsOrden,
    dominio: n.dominio,
    titular: n.titular,
    rango: (n._rango && n._rango.clave === clave) ? n._rango.valor : NaN,
  };
}

// Timestamp de ordenación para el feed. Un programado futuro no debe flotar
// por encima de lo ya publicado, así que se trata como si fuera "ahora".
function _tsOrdenFeed(n, ahora){
  if (n._esFuturo && !isNaN(n._tsShow) && n._tsShow > ahora) return ahora;
  return n._tsOrden;
}

// Vista del feed: igual que _paraOrden, pero con el timestamp ajustado para
// que los programados no tapen las noticias ya publicadas.
function _paraOrdenFeed(n, clave, ahora){
  return { ..._paraOrden(n, clave), ts: _tsOrdenFeed(n, ahora) };
}

// Ocultar leídas / vistas (HIDE_MODE). Una sola copia: la usan la lista
// y el recuento de las pestañas.
function _ocultaPorLectura(n, hm){
  if (hm === 'off') return false;
  const key = normalizeUrlForMatch(n.enlace);
  const pluginItem = PENDIENTES_MAP.get(key);
  const esLeida = LEIDAS_LOCAL.has(key) || (pluginItem && pluginItem.read);
  if ((hm === 'read' || hm === 'both') && esLeida) return true;
  if ((hm === 'viewed' || hm === 'both') && VISTAS_LOCAL.has(key)) return true;
  return false;
}

// Predicado único de la lista (antes había dos copias: el filtro de
// aplicarFiltros y _pasaFiltroIndividual), también para la prensa. Encima de
// la consulta solo quedan filtros de vista del cliente: selects, ocultar
// leídas/vistas y modo (preset). Devuelve true, false o 'fuera-preset'.
function _pasaVista(n, ctx){
  const { g, t2, consulta, clavePrensa, presetEfectivo, soloPreset, marcarPreset, HIDE_MODE: hm } = ctx;
  if (g && n.grupo !== g) return false;
  if (t2 && n.tipo  !== t2) return false;
  if (_ocultaPorLectura(n, hm)) return false;
  // Lo que trajo la prensa para esta consulta, con la prensa encendida.
  const dePrensa = PRENSA_ACTIVA && !!n._prensaPara && n._prensaPara.has(clavePrensa);
  if (n._capas && _soloDeConsulta(n) && !dePrensa
      && !(n._capas.has('turso') && n._consultas && n._consultas.has(consulta.clave))) return false;
  if (!(dePrensa ? _pasaExterno(n, consulta) : _pasaConsulta(n, consulta))) return false;
  if (presetEfectivo || soloPreset){
    const cumple = cumpleFiltro(n, ctx);
    n._esPreset = cumple;
    return cumple ? true : 'fuera-preset';
  }
  n._esPreset = marcarPreset ? cumpleFiltro(n, ctx) : false;
  return true;
}

// Aviso de medio desconocido (medio:noexiste → 0 resultados). Con retardo,
// para no avisar de cada prefijo mientras se teclea.
let _avisoMedioTimer = null;
function _avisarMediosDesconocidos(consulta){
  if (_avisoMedioTimer){ clearTimeout(_avisoMedioTimer); _avisoMedioTimer = null; }
  const desc = consulta.medios.desconocidos;
  if (!desc.length) return;
  _avisoMedioTimer = setTimeout(() => {
    _avisoMedioTimer = null;
    toast(`Sin medios para: ${desc.map(d => d.valor).join(', ')}`, 3000);
  }, 1500);
}

function aplicarFiltros(){
  if (PASE) return;   // lo que llegue durante el pase espera: cerrarPase vuelve a filtrar
  hidratarNoticias();
  const raw = $('#buscar').value.trim();
  const rawProcesado = preprocesarInput(raw);
  const parsed = parseQuery(rawProcesado);
  // Semántica de la búsqueda (texto, medios, fechas): shared/busqueda/.
  // Se interpreta una vez y la usan el filtro, Turso y la prensa.
  const consulta = interpretarConsulta(raw, { catalogo: MEDIOS, ahora: Date.now() });
  renderChips(parsed, raw);
  syncPanelFromParsed(parsed);
  actualizarTiempo(parsed.eltiempo);
  actualizarAlertas(parsed.alertas);
  pintarBotonTiempo();

const capas = capasRequeridas(parsed, consulta);
// El archivo (Turso) es para búsquedas concretas: solo con texto. Un medio,
// grupo, tag… sin texto se sirve de lo cargado y de R2.
const usarTurso = consulta.texto.incluir.length > 0;

// Reset solo si cambia la consulta (por su clave: un espacio o cambiar
// 'Sánchez' por 'sanchez' no es otra búsqueda).
if (consulta.clave !== ULT_QUERY_KEY) {
  ULT_QUERY_KEY = consulta.clave;
  TURSO_OFFSET  = 0;
  TURSO_HAY_MAS = false;
  TURSO_ACTIVO  = !capas.size;
  TURSO_RAW     = '';
}

// El cursor solo sirve para las capas que se cargaron con él. Al cambiar de
// modo o de medio, la nueva capa empieza tras los días cargados en memoria.
ajustarDiasActual(capas);
    // Disparo R2 en background
  if (capas.size) {
    const signal = new AbortController().signal;
    asegurarCapas(capas, signal).then(trajo => {
      if (trajo) aplicarFiltros();
    });
  }

  // Archivo (Turso): solo con texto (usarTurso), primera página automática
  // tras la pausa; las siguientes, solo con el botón «Buscar más en el archivo».
  // Al archivo se le manda la consulta ya interpretada (inicio de palabra,
  // dominios exactos, días de Madrid): el worker no tiene que reinterpretar.
  const rawArchivo = consulta.imposible ? '' : paraArchivo(consulta);
  if (ARCHIVO_ACTIVO && usarTurso && rawArchivo && !TURSO_RAW) {
    TURSO_RAW = rawArchivo;
    TURSO_OFFSET = 0;

    // Se descarta solo si la consulta cambió, no por cualquier otra llamada
    // a aplicarFiltros (un espacio, una capa R2, un toggle…): si no, la
    // respuesta se perdía y no se volvía a pedir.
    const claveTurso = TURSO_RAW;
    const claveConsulta = consulta.clave;
    if (_archivoTimer) clearTimeout(_archivoTimer);
    _archivoTimer = setTimeout(() => {
      _archivoTimer = null;
      if (TURSO_RAW !== claveTurso) return;      // la consulta cambió durante la pausa
      buscarEnWorker(TURSO_RAW, { offset: 0, limit: 50 }).then(res => {
        if (TURSO_RAW !== claveTurso) return;
        if (!res.items || !res.items.length) {
          TURSO_HAY_MAS = false;
          actualizarBotonCargarMas();
          return;
        }
        TURSO_OFFSET  = (res.nextOffset ?? res.items.length);
        TURSO_HAY_MAS = res.nextOffset !== null && res.nextOffset !== undefined;

        // Se repinta aunque no haya items nuevos: los que ya estaban en
        // NOTICIAS (de otra búsqueda) pasan a ser visibles para esta.
        const nuevos = _mergearItemsEnNoticias(res.items, 'turso', claveConsulta, 0);
        if (nuevos > 0) {
          _hidratadasHasta = 0;
          hidratarNoticias();
        }
        aplicarFiltros();
      });
    }, ARCHIVO_PAUSA_MS);
  }

  // ── Filtrado ──
  const g = $('#grupo').value;
  const t2 = $('#tipo').value;
  const orden = $('#orden').value || 'recientes';   // sincronizado con order:/orden: de la consulta

  const ahora = Date.now();

  const hayMedio   = parsed.medios.length   > 0;
  const hayDominio = parsed.dominios.length > 0;
  const hayGrupo   = parsed.grupos.length   > 0;
  const hayTipo    = parsed.tipos.length    > 0;
  const hayTag     = parsed.tags.length     > 0;
  const hayTitulo  = parsed.titulo.length   > 0;

  const hayFuenteExplicita = hayDominio || hayMedio;
  const hayBusquedaActiva =
    hayTitulo || hayGrupo || hayTipo || hayTag ||
    !!g || !!t2 || !!parsed.desde || !!parsed.hasta;

  const presetConReglas = PRESET_ACTIVO && presetTieneReglas();
  // La vista 🔖 Temas filtra como un modo, con los temas de todos los modos.
  const vistaTemas = vistaTemasActiva();
  if (CHIP_TEMAS && !TEMAS_TODOS.some(m => m.id === CHIP_TEMAS)) CHIP_TEMAS = null;
  const conFiltro = presetConReglas || vistaTemas;
  // Sin búsqueda, el modo filtra el feed (es tu forma de leerlo). Buscando,
  // el modo no esconde nada: los resultados se separan en dos pestañas,
  // «Modo · N» y «Todo · M» (en Todo, los del modo van marcados). Un filtro
  // de medio escrito en la búsqueda manda sobre el modo: sin pestañas.
  const presetEfectivo = conFiltro && !hayFuenteExplicita && !hayBusquedaActiva;
  const conPestanas    = conFiltro && !hayFuenteExplicita &&  hayBusquedaActiva;

  _avisarMediosDesconocidos(consulta);
  const ctx = {
    g, t2, ahora, parsed, consulta, clavePrensa: _clavePrensa(consulta), orden, HIDE_MODE,
    presetEfectivo, marcarPreset: conPestanas, soloPreset: false,
    vistaTemas, chipTemas: null, chipTema: null,
  };

  let filtradas = NOTICIAS.filter(n => _pasaVista(n, ctx) === true);

  // Chips. En la vista Temas, uno por modo; con un modo elegido (o si solo
  // hay uno), uno por cada tema suyo. En un modo con temas, «Medios del
  // modo» y uno por tema. Se cuenta sobre la lista sin el chip y luego se
  // filtra. Los chips pasan al ctx para que el añadido incremental
  // (ULT_CTX) los respete.
  let infoChips = null;
  const filtrarPorChips = lista => {
    const total = lista.length;
    let porModo = null;
    if (vistaTemas){
      porModo = new Map();
      for (const n of lista){
        for (const id of new Set(_temasDe(n).map(x => x.id))) porModo.set(id, (porModo.get(id) || 0) + 1);
      }
      ctx.chipTemas = CHIP_TEMAS;
      if (CHIP_TEMAS) lista = lista.filter(n => _temasDe(n).some(x => x.id === CHIP_TEMAS));
    }
    const idModo = vistaTemas
      ? CHIP_TEMAS || (TEMAS_TODOS.length === 1 ? TEMAS_TODOS[0].id : null)
      : PRESET.id;
    const modo = idModo && TEMAS_TODOS.find(m => m.id === idModo);
    if (CHIP_TEMA && (!modo || CHIP_TEMA.modo !== modo.id)) CHIP_TEMA = null;
    let porTema = null, nMedios = null;
    if (modo){
      // Todos los temas del modo, también los que no casan con nada (a 0):
      // así se ve si una palabra recién añadida no está trayendo noticias.
      porTema = new Map(modo.temas.map(x => [x.etiqueta, 0]));
      for (const n of lista){
        for (const e of new Set(_temasDe(n).filter(x => x.id === modo.id).map(x => x.etiqueta))){
          porTema.set(e, porTema.get(e) + 1);
        }
      }
      if (!vistaTemas && _modoTieneMedios()) nMedios = lista.filter(_entraPorMedios).length;
      // Si todo lo del modo entra por sus medios, el chip es igual que «Todo».
      if (nMedios === lista.length) nMedios = null;
      if (CHIP_TEMA && (CHIP_TEMA.medios ? nMedios === null : !porTema.has(CHIP_TEMA.etiqueta))) CHIP_TEMA = null;
    }
    if (porModo || porTema) infoChips = { total, porModo, modo: modo ? modo.id : null, totalModo: lista.length, porTema, nMedios };
    ctx.chipTema = CHIP_TEMA;
    return CHIP_TEMA ? lista.filter(n => _pasaChipTema(n, CHIP_TEMA)) : lista;
  };

  let infoPestanas = null;
  if (conPestanas){
    // Una búsqueda nueva vuelve a la pestaña automática.
    if (PESTANA_CLAVE !== consulta.clave){ PESTANA_CLAVE = consulta.clave; PESTANA_BUSQUEDA = null; }
    const delModo = filtradas.filter(n => n._esPreset);
    const pestana = PESTANA_BUSQUEDA || (delModo.length ? 'modo' : 'todo');
    // La automática se decide con los primeros resultados y se mantiene: lo
    // que llegue después (archivo, prensa) cambia las cifras, no la pestaña.
    if (filtradas.length) PESTANA_BUSQUEDA = pestana;
    infoPestanas = { pestana, nModo: delModo.length, nTodo: filtradas.length, temas: vistaTemas };
    if (pestana === 'modo'){
      filtradas = filtrarPorChips(delModo);
      ctx.soloPreset = true;
    }
  } else if (presetEfectivo){
    filtradas = filtrarPorChips(filtradas);
  }

  const FAV_WINDOW_MS = 3 * 3600 * 1000;
  const cmpNucleo = comparador(orden);
  filtradas.sort((a, b) => {
    if (presetEfectivo && !vistaTemas){
      const aFav = getOverride(a.dominio) === 'first'
                   && !isNaN(a._tsOrden)
                   && (ahora - a._tsOrden) < FAV_WINDOW_MS;
      const bFav = getOverride(b.dominio) === 'first'
                   && !isNaN(b._tsOrden)
                   && (ahora - b._tsOrden) < FAV_WINDOW_MS;
      const fa = aFav ? 1 : 0;
      const fb = bFav ? 1 : 0;
      if (fa !== fb) return fb - fa;
    }
    const aLejos = a._esFuturo && !isNaN(a._tsShow) && (a._tsShow - ahora > HORIZONTE_FUTURO_MS);
    const bLejos = b._esFuturo && !isNaN(b._tsShow) && (b._tsShow - ahora > HORIZONTE_FUTURO_MS);
    if (aLejos !== bLejos) return aLejos - bLejos;
    // El resto lo decide el núcleo: fecha según el orden, sin fecha siempre
    // al final (antes, con 'antiguos', salían las primeras) y relevancia
    // por el rango que dio el archivo para esta consulta.
    // Los programados futuros se ordenan como "ahora", para no tapar lo
    // publicado recientemente.
    return cmpNucleo(_paraOrdenFeed(a, consulta.clave, ahora), _paraOrdenFeed(b, consulta.clave, ahora));
  });

  ULT_FILTRADAS = filtradas;
  ULT_TEXTO = consulta.texto.incluir.length ? consulta.texto : null;

  // Contexto para el append incremental
  ULT_CTX = ctx;

  ULT_PESTANAS = infoPestanas;
  renderPestanasPreset();
  ULT_CHIPS = infoChips;
  renderChipsTemas();

  actualizarFiltrosCount();
  requestAnimationFrame(renderizar);

  if (APP_LISTA && RECORDAR_FILTROS){
    try { localStorage.setItem('voceiro-buscar', raw); } catch(e){}
  }
  programarPrensa(consulta);
}


/* ── Renombrada: cuerpo de aplicarFiltros sin el trigger de scope ── */
let _cargandoScope = false;
function renderPestanasPreset(){
  const el = document.getElementById('preset-pestanas');
  if (!el) return;
  const info = ULT_PESTANAS;
  if (!info){ el.hidden = true; return; }
  const nombre = (PRESET && PRESET.nombre) || 'General';
  for (const b of el.querySelectorAll('button[data-pestana]')){
    const esModo = b.dataset.pestana === 'modo';
    b.textContent = !esModo
      ? t('presetPestanaTodo', { n: info.nTodo.toLocaleString() })
      : info.temas
        ? t('presetPestanaTemas', { n: info.nModo.toLocaleString() })
        : t('presetPestanaModo', { X: nombre, n: info.nModo.toLocaleString() });
    b.setAttribute('aria-selected', String(b.dataset.pestana === info.pestana));
  }
  el.hidden = false;
}

// Total de noticias guardadas en R2 (ventana y archivo, ya sin
// duplicados): el manifest trae el resumen. El de antes solo listaba días
// y se sumaban sus all.n.
function renderTotalR2(){
  const el = $('#total-r2'), sep = $('#total-r2-sep');
  if (!el) return;
  const dias = (_manifest && _manifest.dias) || [];
  const g = (_manifest && _manifest.guardado) || {
    n: dias.reduce((s, d) => s + ((d.all && d.all.n) || 0), 0),
    dias: dias.length,
    desde: dias.length ? dias[dias.length - 1].fecha : '',
  };
  el.hidden = sep.hidden = !g.n;
  if (!g.n) return;
  const [a, m, d] = (g.desde || '').split('-');
  el.textContent = t('contadorR2', { n: g.n.toLocaleString() });
  el.title = t('contadorR2Title', { dias: g.dias, desde: a ? `${d}/${m}/${a}` : '?' });
}

// Chips, en una o dos filas. Fila de modos (vista Temas, si hay temas en
// dos modos o más): «Todo» y un chip por modo con noticias. Fila de temas
// (un modo elegido, o el único): un chip por tema, también a 0 (atenuado),
// y en un modo, «Medios del modo». Lleva su propio «Todo» solo si va sola;
// con dos filas se vuelve a todos con el chip del modo.
function renderChipsTemas(){
  const el = document.getElementById('temas-chips');
  if (!el) return;
  const info = ULT_CHIPS;
  if (!info){ el.hidden = true; el.innerHTML = ''; return; }
  const enBusquedaModo = !!(ULT_PESTANAS && ULT_PESTANAS.pestana === 'modo' && !info.porModo);
  const cerosAbiertos = !!el.querySelector('.temas-chips-cero[open]');
  // Solo un chip de tema se atenúa a 0: los «Todo» y los de modo, nunca.
  const chip = (attrs, label, n, pulsado, title, atenuable = false) =>
    `<button type="button" ${attrs} aria-pressed="${String(pulsado)}"`
    + (n || pulsado || !atenuable ? '' : ' class="cero" disabled')
    + (title ? ` title="${escapeHtml(title)}"` : '')
    + `>${escapeHtml(label)} · ${n.toLocaleString()}</button>`;
  const filas = [];
  const ceros = [];
  if (info.porModo && TEMAS_TODOS.length >= 2){
    let html = chip('data-chip=""', t('temaChipTodo'), info.total, !CHIP_TEMAS);
    for (const m of [...TEMAS_TODOS].sort((a, b) => (info.porModo.get(b.id) || 0) - (info.porModo.get(a.id) || 0))){
      const n = info.porModo.get(m.id) || 0;
      if (n || m.id === CHIP_TEMAS) html += chip(`data-chip="${escapeHtml(m.id)}"`, m.nombre, n, m.id === CHIP_TEMAS);
    }
    filas.push(html);
  }
  if (info.porTema){
    const modo = `data-modo="${escapeHtml(info.modo)}"`;
    let html = '';
    if (!filas.length) html += chip(`data-tema="" ${modo}`, t(enBusquedaModo ? 'temaChipSinFiltro' : 'temaChipTodo'), info.totalModo, !CHIP_TEMA);
    const temasOrdenados = [...info.porTema].map(([e, n]) => ({ e, n }));
    if (info.nMedios !== null) temasOrdenados.push({ medios: true, n: info.nMedios });
    temasOrdenados.sort((a, b) => b.n - a.n);
    for (const { e, n, medios } of temasOrdenados){
      if (medios){
        html += chip(`data-medios="1" ${modo}`, t(enBusquedaModo ? 'temaChipSoloMedios' : 'temaChipMedios'), n, !!(CHIP_TEMA && CHIP_TEMA.medios));
        continue;
      }
      const pulsado = !!(CHIP_TEMA && CHIP_TEMA.etiqueta === e);
      const etiqueta = etiquetaVisible(e);
      const boton = chip(`data-tema="${escapeHtml(e)}" ${modo}`,
        enBusquedaModo ? t('temaChipTema', { X: etiqueta }) : etiqueta, n, pulsado, e, true);
      if (enBusquedaModo && n === 0 && !pulsado) ceros.push(boton);
      else html += boton;
    }
    filas.push(html);
  }
  const contexto = enBusquedaModo
    ? `<div class="temas-chips-contexto"><span>${escapeHtml(t('temaFiltroEnModo', { X: PRESET.nombre }))}</span>`
      + (ceros.length
        ? `<details class="temas-chips-cero"><summary>${escapeHtml(t('temaChipsSinCoincidencias', { n: ceros.length.toLocaleString() }))}</summary><div class="temas-chips-cero-lista">${ceros.join('')}</div></details>`
        : '') + '</div>'
    : '';
  // Con dos filas, la de temas cuelga del modo elegido: va sangrada.
  el.innerHTML = contexto + filas.map((h, i) => `<div class="temas-chips-fila${i ? ' hija' : ''}">${h}</div>`).join('');
  if (cerosAbiertos){
    const details = el.querySelector('.temas-chips-cero');
    if (details) details.open = true;
  }
  el.hidden = false;
}
/* Pase sobre una instantánea de los resultados cargados. No filtra ni pide
   noticias al avanzar; las vistas se guardan con el mecanismo existente. */
let PASE = null;

function abrirPase(){
  if (!ULT_FILTRADAS.length) return;
  cerrarPase(false);
  const filtrosPase = $('#filtros-panel');
  if (filtrosPase.matches(':modal')) filtrosPase.close();
  cerrarMenuMas();
  // Primera tarjeta que se ve: con la mitad, al menos, por debajo de la barra fija.
  const tapa = $('#barra-sup').getBoundingClientRect().bottom;
  const visible = [...document.querySelectorAll('#resultados .noticia')].find(el => {
    const r = el.getBoundingClientRect();
    return (r.top + r.bottom) / 2 > tapa && r.top < window.innerHeight;
  });
  const desde = visible ? Number(visible.dataset.idx) : 0;
  let segundos = 8;
  try {
    const guardado = Number(localStorage.getItem('voceiro-pase-segundos'));
    if (Number.isInteger(guardado) && guardado >= 3 && guardado <= 20) segundos = guardado;
  } catch(e){}
  const root = document.createElement('dialog');
  root.id = 'pase-capa';
  root.setAttribute('aria-label', t('paseCapa'));
  root.innerHTML = `<div class="pase-contenido">
      <div class="pase-medio"></div>
      <a class="pase-titular" target="_blank" rel="noopener"></a>
      <div><button type="button" data-pase-guardar>${escapeHtml(t('saveForLaterTitle'))}</button></div>
    </div><div class="pase-controles">
      <button type="button" data-pase-anterior aria-keyshortcuts="ArrowLeft ArrowUp">${escapeHtml(t('paseAnterior'))}</button>
      <button type="button" data-pase-play></button>
      <button type="button" data-pase-siguiente aria-keyshortcuts="ArrowRight ArrowDown">${escapeHtml(t('paseSiguiente'))}</button>
      <label class="pase-ritmo"><input id="pase-ritmo" type="range" min="3" max="20" step="1" value="${segundos}" data-pase-ritmo><span><output for="pase-ritmo" data-pase-segundos>${segundos}</output> ${escapeHtml(t('paseRitmo'))}</span></label>
      <button type="button" data-pase-cerrar>${escapeHtml(t('paseCerrar'))}</button>
    </div><div class="pase-estado" role="status" aria-live="off"></div>`;
  const pase = PASE = {
    root, lista: ULT_FILTRADAS.slice(desde), pos: 0,
    segundos, jugando: true, timer: null, overflow: document.body.style.overflow,
  };
  document.body.appendChild(root);
  document.body.style.overflow = 'hidden';
  root.showModal();
  root.addEventListener('cancel', e => { e.preventDefault(); cerrarPase(); });
  root.addEventListener('pointerdown', e => {
    if (!e.target.closest('.pase-controles')) pausarPase();
  });
  prepararGestosPase(root);
  root.querySelector('.pase-titular').onclick = () => {
    pausarPase();
    const n = pase.lista[pase.pos];
    if (!n) return;
    marcarLeidaLocal(n.enlace);
    registrarLeido(n);
    pintarLeidasEnLista();
    // Avanzar tras la acción por defecto: si no, el enlace ya apunta al siguiente al abrirse.
    const pos = pase.pos;
    setTimeout(() => { if (PASE === pase && pase.pos === pos){ moverPase(1); pausarPase(); } });
  };
  root.querySelector('[data-pase-guardar]').onclick = () => {
    pausarPase();
    const n = pase.lista[pase.pos];
    if (n){ guardarParaLeerDespues(n); pintarPase(); }
  };
  root.querySelector('[data-pase-anterior]').onclick = () => moverPase(-1);
  root.querySelector('[data-pase-siguiente]').onclick = () => moverPase(1);
  root.querySelector('[data-pase-play]').onclick = () => {
    pase.jugando = !pase.jugando;
    pintarEstadoPase();
    programarPase();
  };
  root.querySelector('[data-pase-cerrar]').onclick = () => cerrarPase();
  root.querySelector('[data-pase-ritmo]').oninput = e => {
    pase.segundos = Number(e.target.value);
    root.querySelector('[data-pase-segundos]').textContent = pase.segundos;
    programarPase();
  };
  root.querySelector('[data-pase-ritmo]').onchange = () => {
    try { localStorage.setItem('voceiro-pase-segundos', String(pase.segundos)); } catch(e){}
  };
  pintarPase();
  programarPase();
  root.querySelector('[data-pase-play]').focus({ preventScroll: true });
}

// El titular no cabe: el desplazamiento vertical sirve para leerlo entero.
function desbordaPase(root){
  return root.scrollHeight > root.clientHeight + 1;
}

function prepararGestosPase(root){
  let inicio = null;
  root.addEventListener('touchstart', e => {
    inicio = null;
    // Si hace falta scroll, se conserva para poder leer todo el titular.
    if (e.touches.length !== 1 || desbordaPase(root) ||
        e.target.closest('.pase-controles,button,input,select,textarea,[contenteditable]')) return;
    const dedo = e.touches[0];
    inicio = { x: dedo.clientX, y: dedo.clientY, id: dedo.identifier };
  }, { passive: true });
  root.addEventListener('touchmove', e => {
    if (e.touches.length !== 1){ inicio = null; return; }
    if (!inicio) return;
    const dedo = e.touches[0];
    // Reservar el gesto vertical desde el primer movimiento evita que el
    // navegador lo convierta en scroll. El zoom con dos dedos sigue libre.
    if (Math.abs(dedo.clientY - inicio.y) > Math.abs(dedo.clientX - inicio.x) && e.cancelable){
      e.preventDefault();
    }
  }, { passive: false });
  root.addEventListener('touchend', e => {
    const desde = inicio;
    inicio = null;
    if (!desde || e.touches.length) return;
    const dedo = Array.from(e.changedTouches).find(t => t.identifier === desde.id);
    if (!dedo) return;
    const dy = dedo.clientY - desde.y, dx = dedo.clientX - desde.x;
    if (Math.abs(dy) < 50 || Math.abs(dy) < Math.abs(dx) * 1.5) return;
    // Un deslizamiento sobre el enlace no debe abrir la noticia al soltar.
    if (e.cancelable) e.preventDefault();
    pausarPase();
    moverPase(dy < 0 ? 1 : -1);
  }, { passive: false });
  root.addEventListener('touchcancel', () => { inicio = null; }, { passive: true });
}

function pintarEstadoPase(){
  const p = PASE;
  if (!p) return;
  const fin = p.pos === p.lista.length;
  p.root.querySelector('[data-pase-anterior]').disabled = p.pos === 0;
  p.root.querySelector('[data-pase-siguiente]').disabled = fin;
  const play = p.root.querySelector('[data-pase-play]');
  play.disabled = fin;
  play.textContent = t(p.jugando ? 'pasePausa' : 'paseContinuar');
  p.root.querySelector('.pase-estado').textContent =
    `${t('paseCapa')} · ${Math.min(p.pos + 1, p.lista.length)}/${p.lista.length} · ${t(fin ? 'paseFin' : p.jugando ? 'paseMarcha' : 'paseParado')}`;
}

function pintarPase(){
  const p = PASE;
  if (!p) return;
  const n = p.lista[p.pos];
  const fin = !n;
  pintarEstadoPase();
  p.root.querySelector('.pase-medio').textContent = n ? n.medio : '';
  const link = p.root.querySelector('.pase-titular');
  link.innerHTML = n ? bionicize(escapeHtml(n.titular)) : escapeHtml(t('paseFin'));
  if (n) link.href = n.enlace;
  else link.removeAttribute('href');
  p.root.querySelector('[data-pase-guardar]').hidden = fin;
  if (n){
    const item = PENDIENTES_MAP.get(normalizeUrlForMatch(n.enlace));
    p.root.querySelector('[data-pase-guardar]').textContent = t(!item ? 'saveLabelSave' : item.read ? 'saveLabelRead' : 'saveLabelPending');
  }
}

function programarPase(){
  const p = PASE;
  if (!p) return;
  clearTimeout(p.timer);
  p.timer = null;
  if (p.jugando && !document.hidden && p.pos < p.lista.length){
    p.timer = setTimeout(() => { if (PASE === p) moverPase(1); }, p.segundos * 1000);
  }
}

function pausarPase(){
  if (!PASE || !PASE.jugando) return;
  PASE.jugando = false;
  programarPase();
  pintarEstadoPase();
}

function moverPase(delta){
  const p = PASE;
  if (!p || (delta < 0 && p.pos === 0) || (delta > 0 && p.pos === p.lista.length)) return;
  const n = p.lista[p.pos];
  if (delta > 0 && n){
    marcarVistaLocal(n.enlace);
    persistirVistas();
  }
  p.pos += delta;
  if (p.pos === p.lista.length) p.jugando = false;
  pintarPase();
  programarPase();
}

function cerrarPase(refiltrar = true){
  const p = PASE;
  if (!p) return;
  PASE = null;
  clearTimeout(p.timer);
  p.root.close();
  document.body.style.overflow = p.overflow;
  p.root.remove();
  if (refiltrar){
    aplicarFiltros();
    $('#btn-pase').focus({ preventScroll: true });
  }
}

document.addEventListener('click', e => {
  if (e.target.closest('#btn-pase')) abrirPase();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pausarPase(); });
window.addEventListener('blur', pausarPase);
// Interactuar fuera de los controles o desplazarse a mano detiene el avance.
function pausarPaseFuera(e){
  if (PASE && !e.target.closest('#pase-capa')) pausarPase();
}
document.addEventListener('pointerdown', pausarPaseFuera, true);
document.addEventListener('focusin', pausarPaseFuera);
document.addEventListener('wheel', pausarPase, { passive: true });
// Solo arrastrar el deslizador del ritmo deja el pase en marcha.
document.addEventListener('touchmove', e => {
  if (!e.target.closest('[data-pase-ritmo]')) pausarPase();
}, { passive: true });
document.addEventListener('keydown', e => {
  if (!PASE) return;
  if (e.key === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); cerrarPase(); }
  else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) &&
           !e.target.closest('select,input,textarea,[contenteditable]')){
    // Como con el dedo: si el titular no cabe, ↑ ↓ desplazan y pausan.
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && desbordaPase(PASE.root)){ pausarPase(); return; }
    e.preventDefault();
    moverPase(e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1);
  } else pausarPaseFuera(e);
}, true);
function renderizar(){
  if (PASE) return;
  const lista = ULT_FILTRADAS;
  const nMostrados = lista.length;
  const nCargados = NOTICIAS.length;

  const txt = t('contador', {
    n: nMostrados.toLocaleString(),
    total: nCargados.toLocaleString()
  });

  $('#contador').textContent = txt;
  renderTotalR2();
  pintarEstadoPrensa();
  const cont = $('#resultados');
  cont.innerHTML = '';
  RENDER_OFFSET = 0;

  if (!lista.length){
    // Con un modo activo y sin búsqueda, se ofrece editarlo o verlo todo.
    const pista = PRESET_ACTIVO && !$('#buscar').value.trim();
    // Con la prensa en camino aún no es «sin resultados»: lo dice el contador.
    if (_estadoPrensa() === 'prensaBuscando'){
      if (SENTINEL_OBSERVER){ SENTINEL_OBSERVER.disconnect(); SENTINEL_OBSERVER = null; }
      actualizarBotonCargarMas();
      return;
    }
    cont.innerHTML = `<div class="vacio">${escapeHtml(t('vacio'))}${pista ? `
      <p class="vacio-pista">${escapeHtml(t('pistaModoSinResultados', { X: PRESET.nombre }))}</p>
      <div class="vacio-acciones">
        <button type="button" data-vacio="editar">${escapeHtml(t('pistaEditarModo'))}</button>
        <button type="button" data-vacio="todo">${escapeHtml(t('pistaVerTodo'))}</button>
      </div>` : ''}</div>`;
    if (SENTINEL_OBSERVER){ SENTINEL_OBSERVER.disconnect(); SENTINEL_OBSERVER = null; }
    actualizarBotonCargarMas();
    return;
  }

  const sentinel = document.createElement('div');
  sentinel.id = 'render-sentinel';
  cont.appendChild(sentinel);

  appendBatch();

  if (SENTINEL_OBSERVER) SENTINEL_OBSERVER.disconnect();
  SENTINEL_OBSERVER = new IntersectionObserver(entries => {
    if (PASE) return;
    if (!entries[0].isIntersecting) return;

    // Si aún quedan items filtrados sin renderizar → siguiente batch
    if (RENDER_OFFSET < ULT_FILTRADAS.length) {
      appendBatch();
      return;
    }

    // Lista agotada → pedir más (R2 días o Turso página) si hay
    const totalDias = (_manifest && _manifest.dias) ? _manifest.dias.length : 0;
    const capas = capasRequeridas(parseQuery(preprocesarInput($('#buscar').value.trim())));
    const puedeR2 = capas.size > 0 && DIAS_ACTUAL < totalDias;
    if (puedeR2) {
      solicitarMas(cargarMas);
    }
  }, { rootMargin: '400px' });
  SENTINEL_OBSERVER.observe(sentinel);

  if (ACCES.focus) requestAnimationFrame(updateFocus);
  actualizarBotonCargarMas();
}


async function compartirNoticia(n){
  if (!PUEDE_COMPARTIR || !n) return;
  try {
    await navigator.share({
      title: n.titular,
      url:   n.enlace,
    });
  } catch (err) {
    // AbortError = el usuario canceló → silencio total
    // Cualquier otro error, lo dejamos en consola y no molestamos
    if (err && err.name !== 'AbortError') {
      console.warn('[share]', err);
    }
  }
}

// Temas que se marcan en la tarjeta: en la vista Temas, todos los que
// casaron (o los del modo del chip); en un modo, los de ese modo. Con un
// chip de tema, solo ese.
function _temasMarcados(n){
  if (!TEMAS_TODOS.length) return [];
  const ctx = ULT_CTX || {};
  let ts;
  if (vistaTemasActiva()){
    ts = ctx.chipTemas ? _temasDe(n).filter(x => x.id === ctx.chipTemas) : _temasDe(n);
  } else if (PRESET_ACTIVO){
    ts = _temasDe(n).filter(x => x.id === PRESET.id);
  } else return [];
  const c = ctx.chipTema;
  return (c && !c.medios) ? ts.filter(x => x.id === c.modo && x.etiqueta === c.etiqueta) : ts;
}
// Etiqueta de la vista Temas: «tema · Modo», +N si casan más.
function _badgeTema(marcados){
  if (!marcados.length) return '';
  const nombreDe = id => (TEMAS_TODOS.find(m => m.id === id) || {}).nombre || '';
  const txt = x => etiquetaVisible(x.etiqueta) + ' · ' + nombreDe(x.id);
  const extra = marcados.length > 1 ? ` +${marcados.length - 1}` : '';
  const title = marcados.map(x => x.etiqueta + ' · ' + nombreDe(x.id)).join('\n');
  return `<span class="badge tema" title="${escapeHtml(title)}"><span class="tema-txt">${escapeHtml(txt(marcados[0]))}</span>${extra}</span>`;
}
// Lo que se resalta en el titular: el texto de la búsqueda y los temas
// marcados (sus términos incluidos). null si no hay nada que resaltar.
function _compiladoMarcas(marcados){
  const incluir = ULT_TEXTO ? [...ULT_TEXTO.incluir] : [];
  for (const m of TEMAS_TODOS){
    const etiquetas = marcados.filter(x => x.id === m.id).map(x => x.etiqueta);
    if (etiquetas.length) incluir.push(...compiladoDeTemas(m.temas, etiquetas).incluir);
  }
  return incluir.length ? { incluir, excluir: [] } : null;
}

function renderItemHtml(n, idx){
  let fechaHtml = '';
  if (n._tipoShow === 'pub'){
    const esFuturo = n._esFuturo;
    fechaHtml = `<span class="badge${esFuturo ? ' futuro' : ''}">· ${fechaTarjetaHtml(n._tsShow)}</span>`;
  } else if (n._tipoShow === 'est'){
    fechaHtml = `<span class="badge estimada" title="${escapeHtml(t('sinFechaReal'))}">≈ ${fechaTarjetaHtml(n._tsShow)}</span>`;
  } else if (!isNaN(n._tsShow)){
    fechaHtml = `<span class="badge recolectado">${escapeHtml(t('recolectado'))} ${fechaTarjetaHtml(n._tsShow)}</span>`;
  } else {
    fechaHtml = `<span class="badge recolectado">${escapeHtml(t('recolectado'))}</span>`;
  }

  const marcados = _temasMarcados(n);
  const enVistaTemas = vistaTemasActiva();
  const marcas = _compiladoMarcas(marcados);
  let tituloHtml;
  if (marcas) tituloHtml = resaltarTitular(n.titular, marcas);
  else        tituloHtml = n._titularEsc;
  if (ACCES.bionic) tituloHtml = bionicize(tituloHtml);

  const key = normalizeUrlForMatch(n.enlace);

  // ── Estado del guardado / lectura ──
  //   enCola  = está en la lista de pendientes (plugin o local)
  //   leida   = marcada como leída (por estar en cola + leída, o por LEIDAS_LOCAL)
  //   vista   = pasó por pantalla sin marcarse como leída
  const enCola = PENDIENTES_URLS.has(key);
  const item   = PENDIENTES_MAP.get(key);
  const enColaLeida = enCola && item && item.read;
  const leida  = enColaLeida || LEIDAS_LOCAL.has(key);
  const vista  = !leida && VISTAS_LOCAL.has(key);

  // ── Botón Guardar ──
  //   - En cola + leída    → "Leída"     (click → marcar como no leída)
  //   - En cola + pendiente → "Pendiente" (click → marcar como leída)
  //   - No en cola          → "Guardar"   (click → añadir a pendientes)
  const estadoGuardar = enColaLeida ? 'leida' : enCola ? 'pendiente' : 'guardar';

  // En la vista Temas el grupo no es «el modo»: va sin color y la marca es el tema.
  const presetBadge = n.grupo
    ? (n._esPreset && !enVistaTemas
        ? `<span class="badge preset">${n._grupoEsc}</span>`
        : `<span class="badge">${n._grupoEsc}</span>`)
    : '';
  const temaBadge = enVistaTemas ? _badgeTema(marcados) : '';

  // Solo los medios del catálogo: los de prensa sin identificar (news.google.com…)
  // no tienen un dominio por el que filtrar.
  const medioHtml = (n.dominio && MEDIOS[n.dominio])
    ? `<button class="medio" type="button" data-dominio="${escapeHtml(n.dominio)}" title="${escapeHtml(t('medioFiltrarTitle', { medio: n.medio || n.dominio }))}">${n._medioEsc}</button>`
    : `<span class="medio">${n._medioEsc}</span>`;
  const prensaBadge = (n._capas && n._capas.size === 1 && n._capas.has('prensa'))
    ? `<span class="badge prensa" title="Encontrado en prensa externa">${ico('globe')} prensa</span>`
    : '';

  // Añadir al modo, bloquear y reportar van en el menú ⋯ (abrirMenuMas).
  const shareBtnHtml = PUEDE_COMPARTIR
    ? `<button class="btn-mini btn-share-item" type="button" data-idx="${idx}" title="${escapeHtml(t('shareTitle'))}" aria-label="${escapeHtml(t('shareTitle'))}">${ico('share-2')}</button>`
    : '';
  // Otras fuentes siempre disponibles, plegadas dentro de la tarjeta.
  let dupsHtml = '';
  if (n._dupHidden && n._dupHidden.length){
    const otros = n._dupHidden.map(o => {
      return `<div class="dup-item">
        <span class="dup-medio">${escapeHtml(o.medio)}</span>
        <a href="${escapeHtml(o.enlace)}" target="_blank" rel="noopener">Abrir</a>
      </div>`;
    }).join('');
    const nLabel = n._dupHidden.length;
    dupsHtml = `<details class="dups-details">
      <summary>${escapeHtml(t('dupsMore', { n: nLabel }))}</summary>
      <div class="dups-list">
        <div style="font-size:.85em;color:var(--muted);margin-bottom:4px;">${escapeHtml(t('dupsTitle'))}</div>
        ${otros}
      </div>
    </details>`;
  }

  return `<article class="noticia${leida ? ' leida' : (vista ? ' vista' : '')}" data-idx="${idx}">
    <div class="cabecera">
      ${medioHtml}
      ${n.tipo ? `<span class="badge tipo">${n._tipoEsc}</span>` : ''}
      ${presetBadge}
      ${temaBadge}
      ${prensaBadge}
      ${fechaHtml}
      <button class="btn-save-text btn-save-item" type="button" data-idx="${idx}" data-estado="${estadoGuardar}" title="${escapeHtml(t(GUARDAR_ESTADOS[estadoGuardar].titulo))}">${guardarHtml(estadoGuardar)}</button>
      <span class="cab-spacer"></span>
      ${shareBtnHtml}
      <button class="btn-mini btn-mas-item" type="button" data-idx="${idx}" title="${escapeHtml(t('masAcciones'))}" aria-label="${escapeHtml(t('masAcciones'))}" aria-haspopup="menu" aria-expanded="false">${ico('ellipsis')}</button>
    </div>
    <a class="titular" href="${n._enlaceEsc}" target="_blank" rel="noopener">${tituloHtml}</a>
    ${dupsHtml}
    <div class="destino-inline" hidden data-idx="${idx}"></div>
  </article>`;
}
function appendBatch(){
  const cont = $('#resultados');
  const sentinel = document.getElementById('render-sentinel');
  if (!sentinel) return;

  const total = ULT_FILTRADAS.length;
  const end = Math.min(RENDER_OFFSET + RENDER_BATCH, total);
  if (RENDER_OFFSET >= end) {
    if (SENTINEL_OBSERVER){ SENTINEL_OBSERVER.disconnect(); SENTINEL_OBSERVER = null; }
    sentinel.remove();
    return;
  }

  let html = '';
  for (let i = RENDER_OFFSET; i < end; i++){
    html += renderItemHtml(ULT_FILTRADAS[i], i);
  }
  sentinel.insertAdjacentHTML('beforebegin', html);
  RENDER_OFFSET = end;
  observarNoticias();

  if (RENDER_OFFSET >= total){
    if (SENTINEL_OBSERVER){ SENTINEL_OBSERVER.disconnect(); SENTINEL_OBSERVER = null; }
    sentinel.remove();
  }
}

// Añade items nuevos al final del DOM sin re-render completo.
// Devuelve true si el append fue limpio, false si hay que re-renderizar.
function _anexarItemsIncremental(items, ctx) {
  if (!items.length || !ctx) return false;

  // Filtrar los nuevos que pasan los filtros actuales. Se trabaja siempre
  // con el objeto que vive en NOTICIAS (hidratado): si el item de Turso era
  // un duplicado por URL o por título, el crudo no tiene titular ni fecha
  // y acabaría como tarjeta vacía.
  const nuevos = [];
  const vistos = new Set();
  for (const n of items) {
    const u = _claveUrl(n.u || '', n.d || '');
    const real = (u && _itemPorUrl.get(u))
              || (n.t && _itemPorTitulo.get(normalize(n.t)))
              || n;
    if (vistos.has(real) || ULT_FILTRADAS.includes(real)) continue;
    vistos.add(real);
    if (_pasaVista(real, ctx) === true) nuevos.push(real);
  }
  if (!nuevos.length) return true;   // nada nuevo, pero no bloqueamos

  const orden = ctx.orden || 'recientes';
  const ahora = ctx.ahora || Date.now();

  // ¿Todos los nuevos van DESPUÉS del último renderizado?
  const ultimo = ULT_FILTRADAS[ULT_FILTRADAS.length - 1];
  if (!ultimo) return false;

  const tsUlt = isNaN(ultimo._tsOrden) ? 0 : _tsOrdenFeed(ultimo, ahora);

  for (const n of nuevos) {
    const ts = isNaN(n._tsOrden) ? 0 : _tsOrdenFeed(n, ahora);
    const vaDespues = orden === 'antiguos' ? (ts >= tsUlt) : (ts <= tsUlt);
    if (!vaDespues) return false;
  }

  // Los nuevos van al final → append limpio. Se ordenan solo ellos: la
  // lista ya pintada NO se reordena, porque las tarjetas guardan su índice
  // (data-idx) y las acciones (leída, guardar, ➕/🚫) lo usan.
  const cmp = comparador(orden);
  nuevos.sort((a, b) => cmp(_paraOrden(a, ctx.consulta.clave), _paraOrden(b, ctx.consulta.clave)));
  const desde = ULT_FILTRADAS.length;
  ULT_FILTRADAS.push(...nuevos);

  // Si aún quedaban tarjetas sin pintar, el scroll infinito las pintará en
  // orden (incluidas estas); pintar desde 'desde' se saltaría las del medio.
  if (RENDER_OFFSET < desde) return true;

  appendBatchDesdeOffset(desde, ULT_FILTRADAS.length);
  return true;
}

// Añade al DOM las tarjetas [desde, hasta) sin tocar las que ya hay.
function appendBatchDesdeOffset(desde, hasta) {
  const cont = $('#resultados');
  const sentinel = document.getElementById('render-sentinel');

  let html = '';
  for (let i = desde; i < hasta; i++) {
    html += renderItemHtml(ULT_FILTRADAS[i], i);
  }

  if (sentinel) {
    sentinel.insertAdjacentHTML('beforebegin', html);
  } else {
    cont.insertAdjacentHTML('beforeend', html);
  }
  RENDER_OFFSET = Math.max(RENDER_OFFSET, hasta);
  observarNoticias();
}

// Scroll infinito y «Cargar más»: solo R2 (ficheros estáticos: gratis y sin
// cuota). El archivo se pagina únicamente con el botón «Buscar más en el
// archivo» (cargarMasDeTurso), nunca solo: así no puede recorrerse entero
// en bucle si sus páginas no añaden nada visible.
async function solicitarMas(pedir){
  if (_cargandoMas) return;
  _cargandoMas = true;
  actualizarBotonCargarMas();
  try { await pedir(); }
  catch(e){ console.warn('[cargar más]', e); }
  finally {
    _cargandoMas = false;
    actualizarBotonCargarMas();
  }
}

async function cargarMas() {
  const raw = $('#buscar').value.trim();
  const parsed = parseQuery(preprocesarInput(raw));
  const capas = capasRequeridas(parsed);
  if (!capas.size || claveCapas(capas) !== DIAS_CAPAS_KEY) return;

  const totalDias = (_manifest && _manifest.dias) ? _manifest.dias.length : 0;
  if (DIAS_ACTUAL >= totalDias) return;

  const clave = DIAS_CAPAS_KEY;
  const desde = DIAS_ACTUAL;
  const hasta = Math.min(DIAS_ACTUAL + DIAS_R2_STEP, totalDias);

  await extenderCapasR2(capas, desde, hasta);
  if (DIAS_CAPAS_KEY !== clave) return;
  DIAS_ACTUAL = hasta;

  aplicarFiltros();
}

// ─── Paginación Turso ───
async function cargarMasDeTurso() {
  if (!ARCHIVO_ACTIVO || !TURSO_HAY_MAS || !TURSO_RAW) return;

  const claveTurso = TURSO_RAW;
  const claveConsulta = ULT_QUERY_KEY;
  const offsetPedido = TURSO_OFFSET;
  const res = await buscarEnWorker(TURSO_RAW, {
    offset: TURSO_OFFSET,
    limit: 50
  });

  // La consulta cambió (o ya se cargó esta página) mientras esperábamos.
  if (TURSO_RAW !== claveTurso || TURSO_OFFSET !== offsetPedido) return;

  if (!res.items || !res.items.length) {
    TURSO_HAY_MAS = false;
    actualizarBotonCargarMas();
    return;
  }

  TURSO_OFFSET  = (res.nextOffset ?? (TURSO_OFFSET + res.items.length));
  TURSO_HAY_MAS = res.nextOffset !== null && res.nextOffset !== undefined;

  // Como en la primera página: también los items ya cargados cuentan para
  // esta consulta, así que se anexan aunque no haya ninguno nuevo.
  const nuevos = _mergearItemsEnNoticias(res.items, 'turso', claveConsulta, offsetPedido);
  if (nuevos > 0) hidratarNoticias();
  if (!_anexarItemsIncremental(res.items, ULT_CTX)) {
    aplicarFiltros();
  } else {
    renderPestanasPreset();
    actualizarFiltrosCount();
    actualizarBotonCargarMas();
  }
}

function actualizarBotonCargarMas() {
  const wrap = document.getElementById('cargar-mas-wrap');
  const btn  = document.getElementById('btn-cargar-mas');
  if (!wrap || !btn) return;

  // 1) R2: extender días si quedan en el manifest
  const raw = $('#buscar').value.trim();
  const parsed = parseQuery(preprocesarInput(raw));
  const capas = capasRequeridas(parsed);
  if (capas.size) {
    const totalDias = (_manifest && _manifest.dias) ? _manifest.dias.length : 0;
    if (DIAS_ACTUAL < totalDias) {
      wrap.style.display = '';
      btn.textContent = _cargandoMas ? 'Cargando…' : `Cargar más · ${DIAS_ACTUAL}/${totalDias} días`;
      btn.dataset.modo = 'r2';
      btn.disabled = _cargandoMas;
      return;
    }
  }

  // 2) Archivo: solo a mano, cuando R2 no da más y la búsqueda tiene más páginas.
  if (ARCHIVO_ACTIVO && TURSO_HAY_MAS) {
    wrap.style.display = '';
    btn.textContent = _cargandoMas ? 'Cargando…' : 'Buscar más en el archivo';
    btn.dataset.modo = 'archivo';
    btn.disabled = _cargandoMas;
    return;
  }

  wrap.style.display = 'none';
}


function wireResultadosDelegation(){
  const cont = $('#resultados');
  // ── Vista por hover ──
  const VISTA_HOVER_MS = 1200;

  cont.addEventListener('mouseover', e => {
    const art = e.target.closest('.noticia');
    if (!art) return;
    if (art.classList.contains('vista') || art.classList.contains('leida')) return;
    if (VISTAS_TIMERS.has(art)) return;

    const i = parseInt(art.dataset.idx, 10);
    const n = ULT_FILTRADAS[i];
    if (!n) return;

    const tmr = setTimeout(() => {
      VISTAS_TIMERS.delete(art);
      if (art.classList.contains('vista') || art.classList.contains('leida')) return;
      marcarVistaLocal(n.enlace);
      art.classList.add('vista');
      persistirVistas();
    }, VISTA_HOVER_MS);
    VISTAS_TIMERS.set(art, tmr);
  });

  cont.addEventListener('mouseout', e => {
    const art = e.target.closest('.noticia');
    if (!art) return;
    // Si el ratón sigue dentro de la tarjeta (movimiento entre hijos), no cancelamos
    if (e.relatedTarget && art.contains(e.relatedTarget)) return;
    const tmr = VISTAS_TIMERS.get(art);
    if (tmr){ clearTimeout(tmr); VISTAS_TIMERS.delete(art); }
  });

  cont.addEventListener('click', e => {
    const vacioBtn = e.target.closest('[data-vacio]');
    if (vacioBtn){
      if (vacioBtn.dataset.vacio === 'editar'){
        abrirAjustes('modos');
        ajEditarModo(PRESETS.activo);
      } else {
        PRESET_ACTIVO = false;
        guardarPresetActivo();
        actualizarBotonPreset();
        aplicarFiltros();
      }
      return;
    }
    const masBtn = e.target.closest('.btn-mas-item');
    if (masBtn){
      e.preventDefault();
      e.stopPropagation();
      abrirMenuMas(masBtn);
      return;
    }
    // Una opción del menú ⋯ se atiende abajo como si fuera de la tarjeta;
    // el menú se cierra en cuanto termina.
    if (e.target.closest('#menu-mas')) queueMicrotask(cerrarMenuMas);

    // Cerrar fila destino si el clic no es en ella ni en ➕/🚫
    if (!e.target.closest('.destino-inline') &&
        !e.target.closest('.btn-add-item') &&
        !e.target.closest('.btn-block-item')){
      cerrarDestinoInline();
    }
    const shareBtn = e.target.closest('.btn-share-item');
    if (shareBtn){
      e.preventDefault();
      e.stopPropagation();
      const i = parseInt(shareBtn.dataset.idx, 10);
      const n = ULT_FILTRADAS[i];
      if (n) compartirNoticia(n);
      return;
    }
    const medioBtn = e.target.closest('button.medio');
    if (medioBtn){
      e.preventDefault();
      filtrarPorMedio(medioBtn.dataset.dominio);
      return;
    }
    // Al clicar un titular: guardar como leída automáticamente
    const link = e.target.closest('a.titular');
    if (link){
      const art = link.closest('.noticia');
      const i = parseInt(art.dataset.idx, 10);
      const n = ULT_FILTRADAS[i];
      if (n){
        marcarLeidaLocal(n.enlace);
        registrarLeido(n);
        art.classList.remove('vista');
        art.classList.add('leida');
        const saveBtnInCard = art.querySelector('.btn-save-item');
        if (saveBtnInCard) pintarBotonGuardar(saveBtnInCard, 'leida');
      }
      return;   // dejamos que abra normalmente
    }

    const saveBtn = e.target.closest('.btn-save-item');
    if (saveBtn){
      e.preventDefault();
      e.stopPropagation();
      const i = parseInt(saveBtn.dataset.idx, 10);
      const n = ULT_FILTRADAS[i];
      if (n) guardarParaLeerDespues(n);
      return;
    }

    // ➕ Añadir al modo activo (o elegir destino si no hay)
    const addBtn = e.target.closest('.btn-add-item');
    if (addBtn){
      e.preventDefault();
      e.stopPropagation();
      const i = parseInt(addBtn.dataset.idx, 10);
      const n = ULT_FILTRADAS[i];
      if (!n) return;

      const dom    = n.dominio;
      const nombre = n.medio || dom;

      if (PRESET_ACTIVO && PRESET){
        setOverride(dom, 'include');
        aplicarFiltros();
        toast(`${t('destinoOkAnadido')} · ${nombre}`, 2000);
        return;
      }
      if (PRESETS.lista.length === 1){
        aplicarOverrideEnModo(PRESETS.lista[0], 'include', dom, nombre);
        return;
      }
      abrirDestinoInline(i, 'include');
      return;
    }

    // 🚫 Bloquear del modo activo (o elegir destino si no hay)
    const blockBtn = e.target.closest('.btn-block-item');
    if (blockBtn){
      e.preventDefault();
      e.stopPropagation();
      const i = parseInt(blockBtn.dataset.idx, 10);
      const n = ULT_FILTRADAS[i];
      if (!n) return;

      const dom    = n.dominio;
      const nombre = n.medio || dom;

      if (PRESET_ACTIVO && PRESET){
        setOverride(dom, 'ignore');
        aplicarFiltros();
        toast(`${t('destinoOkBloqueado')} · ${nombre}`, 2000);
        return;
      }
      abrirDestinoInline(i, 'ignore');
      return;
    }

    // Cómo leerlo: Ajustes › Lector con la regla de ese medio delante.
    const leerBtn = e.target.closest('.btn-leer-item');
    if (leerBtn){
      e.preventDefault();
      e.stopPropagation();
      const n = ULT_FILTRADAS[parseInt(leerBtn.dataset.idx, 10)];
      if (!n) return;
      AJ_LECTOR_DOMINIO = n.dominio;
      if (ajAbierto() && ajRuta() === 'lector') ajPintarLector();
      else abrirAjustes('lector');
      return;
    }

    const repBtn = e.target.closest('.btn-report-item');
    if (repBtn){
      e.preventDefault();
      e.stopPropagation();
      const i = parseInt(repBtn.dataset.idx, 10);
      const n = ULT_FILTRADAS[i];
      if (!n) return;
      abrirReporte({
        medio:   n.medio,
        dominio: n.dominio,
        grupo:   n.grupo,
        tipo:    n.tipo,
        titular: n.titular,
        enlace:  n.enlace,
        fecha:   n.fecha_pub || n.fecha_estimada || n.fecha || '',
        fuente:  n.fuente || ''
      });
    }
  });
}



let VISTAS_OBSERVER = null;
const VISTAS_TIMERS = new WeakMap();

const VISTA_SCROLL_MS = 2500;   // 2,5 s visible antes de marcar

function marcarVista(art, n){
  const tmr = VISTAS_TIMERS.get(art);
  if (tmr){ clearTimeout(tmr); VISTAS_TIMERS.delete(art); }
  if (art.classList.contains('vista') || art.classList.contains('leida')) return;
  marcarVistaLocal(n.enlace);
  art.classList.add('vista');
  persistirVistas();
}

function programarVista(art, n, ms){
  if (art.classList.contains('vista') || art.classList.contains('leida')) return;
  if (VISTAS_TIMERS.has(art)) return;
  const tmr = setTimeout(() => marcarVista(art, n), ms);
  VISTAS_TIMERS.set(art, tmr);
}

function cancelarVista(art){
  const tmr = VISTAS_TIMERS.get(art);
  if (tmr){ clearTimeout(tmr); VISTAS_TIMERS.delete(art); }
}

const VISTAS_SEEN = new WeakSet();



function wireVistasObserver(){
  if (VISTAS_OBSERVER) VISTAS_OBSERVER.disconnect();
  VISTAS_OBSERVER = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const art = entry.target;
      if (art.classList.contains('vista') || art.classList.contains('leida')) return;

      const i = parseInt(art.dataset.idx, 10);
      const n = ULT_FILTRADAS[i];
      if (!n) return;

      if (entry.isIntersecting){
        // La tarjeta ha estado visible al menos una vez → candidata
        VISTAS_SEEN.add(art);
      } else {
        // Solo marcamos si YA había estado visible y sale por ARRIBA
        if (VISTAS_SEEN.has(art) && entry.boundingClientRect.top < 0){
          marcarVistaLocal(n.enlace);
          art.classList.add('vista');
          persistirVistas();
        }
      }
    });
  }, { threshold: 0 });
}

function observarNoticias(){
  if (!VISTAS_OBSERVER) return;
  document.querySelectorAll('.noticia').forEach(el => VISTAS_OBSERVER.observe(el));
}
/* ═══════════════════════════════════════════════════════════════
   MODALES
   ═══════════════════════════════════════════════════════════════ */
function abrirPanel(id){
  const p = document.getElementById(id);
  if (!p) return;
  if (id !== 'panel-ajustes' && ajAbierto()) cerrarAjustes();
  document.querySelectorAll('.panel.open').forEach(o => { if (o !== p) o.classList.remove('open'); });
  p.classList.add('open');
  const body = p.querySelector('.panel-body');
  if (body) body.scrollTop = 0;
  document.body.style.overflow = 'hidden';
}
function cerrarPanel(id){
  if (id === 'panel-ajustes' && ajAbierto()){ cerrarAjustes(); return; }
  const p = document.getElementById(id);
  if (!p) return;
  p.classList.remove('open');
  if (!document.querySelector('.panel.open')){
    document.body.style.overflow = '';
  }
}

/* ═══════════════════════════════════════════════════════════════
   TEXTOS
   ═══════════════════════════════════════════════════════════════ */
function aplicarTextos(){
  document.title = t('pageTitle');
  $('#h-title').textContent = t('headerTitle');
  $('#meta-prefix').textContent = t('metaPrefix');

  actualizarBotonPreset();
  // Cabecera: icono y palabra (en móvil y en la fila ancha la palabra se oculta, ver .cab-txt).
  const cab = (sel, icono, clave) => {
    const b = $(sel);
    b.innerHTML = icono + `<span class="cab-txt">${escapeHtml(t(clave))}</span>`;
    b.title = t(clave);
  };
  cab('#btn-config', ico('settings'), 'ajTitulo');
  cab('#btn-acces', '<span class="cab-aa" aria-hidden="true">Aa</span>', 'ajLectura');
  cab('#btn-pendientes', ico('bookmark'), 'btnPendientes');
  $('#btn-pendientes').insertAdjacentHTML('beforeend', '<span class="pend-count" data-count="0">0</span>');

  // Filtros de lectura.
  $('#btn-pase').title = t('paseCapa');
  $('#btn-pase').setAttribute('aria-label', t('paseCapa'));
  $('#vs-title-hide').textContent  = t('vsTitleHide');
  $('#vs-ayuda-lbl').textContent = t('vsAyudaLbl');
  $('#aj-hide-ayuda-lbl').textContent = t('vsAyudaLbl');
  const descripcionesOcultar = t('vsAyuda').split('|');
  const opcionesOcultar = ['vsHideOff', 'vsHideRead', 'vsHideViewed', 'vsHideBoth'];
  document.querySelectorAll('.vs-ayuda-lista').forEach(lista => {
    lista.innerHTML = opcionesOcultar.map((clave, i) =>
      `<li><strong>${escapeHtml(t(clave))}:</strong> ${escapeHtml(descripcionesOcultar[i])}</li>`
    ).join('');
  });
  $('#vs-hide-off').innerHTML    = escapeHtml(t('vsHideOff'));
  $('#vs-hide-read').innerHTML   = escapeHtml(t('vsHideRead'))
    + `<small>${escapeHtml(t('vsHideReadHint'))}</small>`;
  $('#vs-hide-viewed').innerHTML = escapeHtml(t('vsHideViewed'))
    + `<small>${escapeHtml(t('vsHideViewedHint'))}</small>`;
  $('#vs-hide-both').innerHTML   = escapeHtml(t('vsHideBoth'));

  pintarFiltroLectura();
  pintarBotonLectura();
  actualizarFiltrosCount();

  // ── Ajustes ──
  $('#aj-titulo').textContent = t('ajTitulo');
  $('#aj-resize').setAttribute('aria-label', t('ajRedimensionar'));
  AJ_SECCIONES.forEach(s =>
    $('#aj-nav-' + s).textContent = t(AJ_TITULOS[s]));

  // Modos
  $('#cfg-modos-hint').textContent = t('cfgModosHint');
  $('#btn-nuevo-modo-lbl').textContent = t('cfgModoNuevo');
  $('#aj-modo-activar-lbl').textContent   = t('ajModoActivar');
  $('#aj-modo-renombrar-lbl').textContent = t('ajModoRenombrar');
  $('#aj-modo-duplicar-lbl').textContent  = t('ajModoDuplicar');
  $('#aj-modo-vaciar-lbl').textContent    = t('ajModoVaciar');
  $('#aj-modo-borrar-lbl').textContent    = t('ajModoBorrar');
  $('#aj-temas-tit').textContent = t('cfgPalabras');
  $('#aj-temas').placeholder = t('cfgPalabrasPlaceholder');
  $('#cfg-palabras-hint').textContent = t('cfgPalabrasHint');
  // Ejemplos: una línea por ejemplo, «tema|qué casa».
  $('#cfg-temas-ayuda').innerHTML = t('cfgTemasAyuda').split('\n').map(l => {
    const [ej, txt] = l.split('|');
    return `<li><code>${escapeHtml(ej)}</code> → ${escapeHtml(txt || '')}</li>`;
  }).join('');
  $('#cfg-medios').textContent = t('cfgMedios');
  $('#aj-guardado').textContent = t('ajGuardadoAutomatico');
  $('#ov-add-include').textContent = t('cfgMedioAddForce');
  $('#ov-add-ignore').textContent = t('cfgMedioAddIgnore');
  $('#ov-pegar-aplicar').textContent = t('cfgOverrideAplicar');
  const det = $('#ov-pegar-wrap summary');
  if (det) det.textContent = t('cfgOverridePegar');
  $('#cfg-medios-hint').textContent = t('cfgMediosHint');
  $('#filtro-medio').placeholder = t('cfgBuscarMedio');
  $('#filtro-medio').setAttribute('aria-label', t('cfgBuscarMedio'));
  $('#filtro-grupo-medio').setAttribute('aria-label', t('cfgTodosGrupos'));
  const estados = $('#filtro-estado-medio');
  const estadoActual = estados.value;
  estados.setAttribute('aria-label', t('cfgFiltrarEstado'));
  estados.innerHTML = [
    ['', 'cfgMediosTodos'], ['configurados', 'cfgMediosConfigurados'],
    ['include', 'cfgMedioIncluir'], ['first', 'cfgMedioDestacar'], ['ignore', 'cfgMedioBloquear'],
  ].map(([v, k]) => `<option value="${v}">${escapeHtml(t(k))}</option>`).join('');
  estados.value = estadoActual;
  $('#medios-vacio').textContent = t('cfgMediosVacio');
  $('#aj-temas').setAttribute('aria-labelledby', 'aj-temas-tit');
  $('#ov-pegar').setAttribute('aria-label', t('cfgOverridePegar'));
  if ($('#filtro-grupo-medio').options[0]) $('#filtro-grupo-medio').options[0].text = t('cfgTodosGrupos');
  $('#cfg-grupos').textContent = t('cfgGrupos');
  $('#cfg-grupos-hint').textContent = t('cfgGruposHint');

  // Lectura
  $('#ac-tema').textContent = t('acTema');
  $('#ac-fuente').textContent = t('acFuente');
  $('#ac-tamano').textContent = t('acTamano');
  $('#ac-ancho').textContent = t('acAncho');
  $('#ac-extra').textContent = t('acExtra');
  $('#acces-reset-lbl').textContent = t('acReset');

  // Pie del menú de Ajustes - selector de idioma
  $('#nav-idioma-lbl').textContent = t('lblIdioma');

  // Feed
  $('#aj-vista-tit').textContent = t('ajVistaTit');
  $('#aj-hide-tit').textContent = t('vsTitleHide');
  document.querySelectorAll('.aj-radios span[data-txt]').forEach(sp => {
    sp.innerHTML = escapeHtml(t(sp.dataset.txt))
      + (sp.dataset.hint ? `<small>${escapeHtml(t(sp.dataset.hint))}</small>` : '');
  });
  $('#cfg-recordar-filtros-lbl').textContent = t('cfgRecordarFiltros');
  $('#cfg-recordar-filtros-hint').textContent = t('cfgRecordarFiltrosHint');
  $('#cfg-portadas').textContent = t('cfgPortadas');
  $('#cfg-portadas-hint').textContent = t('cfgPortadasHint');
  renderListaPortadas();
  const elDias = $('#cfg-dias'); if (elDias) elDias.textContent = t('cfgDias');
  const elDiasHint = $('#cfg-dias-hint'); if (elDiasHint) elDiasHint.textContent = t('cfgDiasHint');
  $('#dias-cancelar').textContent = t('cfgDiasCancelar');
  $('#dias-cargar').textContent = t('cfgDiasCargar');
  renderDiasSelector();
  const grupoDias = document.querySelector('.opt-group[data-dias]');
  if (grupoDias){
    grupoDias.querySelectorAll('button[data-val]').forEach(b => {
      b.textContent = b.dataset.val;
    });
  }

  // Avanzado
  $('#aj-prensa-tit').textContent = t('prensaPanelLabel');
  $('#aj-tiempo-tit').textContent = t('ajTiempoTit');
  $('#cfg-tiempo-lbl').textContent = t('cfgTiempo');
  $('#cfg-tiempo-hint').textContent = t('cfgTiempoHint');
  $('#cfg-avisos-cab-lbl').textContent = t('cfgAvisosCab');
  $('#cfg-avisos-cab-hint').textContent = t('cfgAvisosCabHint');
  $('#cfg-fecha-larga-lbl').textContent = t('cfgFechaLarga');
  $('#cfg-fecha-larga-hint').textContent = t('cfgFechaLargaHint');
  repintarTiempo();
  repintarAvisos();
  $('#cfg-backup').textContent = t('cfgBackup');
  $('#cfg-backup-msg').textContent = t('cfgBackupMsg');
  $('#btn-export-lbl').textContent = t('btnExport');
  $('#btn-import-lbl').textContent = t('btnImport');
  $('#aj-plugin-tit').textContent = t('ajPluginTit');
  $('#aj-plugin-hint').textContent = t('syncOfflineHint');
  $('#aj-lector-instalar-lbl').textContent = t('ajLectorInstalar');
  $('#aj-lector-hint').textContent = t('ajLectorHint');

  // Sincronización
  $('#sync-intro').textContent = t('syncIntro');
  $('#sync-activar-lbl').textContent = t('syncActivar');
  $('#sync-unir-tit').textContent = t('syncUnirTit');
  $('#sync-unir-hint').textContent = t('syncUnirHint');
  $('#sync-unir-codigo').placeholder = 'XXXXX-XXXXX-XXXXX-XXXXX-XXXXX';
  $('#sync-unir').textContent = t('syncUnir');
  $('#sync-codigo-tit').textContent = t('syncCodigoTit');
  $('#sync-codigo-hint').textContent = t('syncCodigoHint');
  $('#sync-copiar-lbl').textContent = t('syncCopiar');
  $('#sync-enlace-lbl').textContent = t('syncEnlace');
  $('#sync-qr-lbl').textContent = t('syncQr');
  $('#sync-ahora-lbl').textContent = t('syncAhora');
  $('#sync-quitar-tit').textContent = t('syncQuitarTit');
  $('#sync-desvincular').textContent = t('syncDesvincular');
  $('#sync-borrar-lbl').textContent = t('syncBorrar');
  $('#sync-privacidad').textContent = t('syncPrivacidad');

  // Ayuda
  $('#cfg-help-lbl').textContent = t('cfgHelpLbl');
  $('#cfg-help-msg').textContent = t('cfgHelpMsg');
  $('#cfg-help-btn').textContent = t('cfgHelpBtn');
  $('#aj-atajos-tit').textContent = t('ajAtajosTit');
  $('#aj-atajos').innerHTML = t('ajAtajos').split('\n').map(l => {
    const [tecla, txt] = l.split('|');
    return `<dt>${escapeHtml(tecla)}</dt><dd>${escapeHtml(txt || '')}</dd>`;
  }).join('');

  // Prensa externa (panel)
  const pl = document.getElementById('prensa-panel-label');
  if (pl) pl.textContent = t('ajPrensaActivar');
  const pll = document.getElementById('prensa-lang-label');
  if (pll) pll.textContent = t('prensaLang');
  const plp = document.getElementById('prensa-region-label');
  if (plp) plp.textContent = t('prensaPais');
  const prst = document.getElementById('prensa-reset');
  if (prst){
    prst.title = t('prensaReset');
    prst.setAttribute('aria-label', t('prensaReset'));
  }

  // Repoblar los selects si el idioma de UI cambia
  const selPrensaL = document.getElementById('prensa-lang');
  const selPrensaP = document.getElementById('prensa-region');
  if (selPrensaL) selPrensaL.innerHTML = '';
  if (selPrensaP) selPrensaP.innerHTML = '';
  pintarSelectsPrensa();
  const bTema = document.querySelectorAll('.opt-group[data-grupo="tema"] button');
  [t('acClaro'), t('acSepia'), t('acOscuro'), t('acContraste'), t('acPersonalizado')].forEach((txt, i) => {
    if (bTema[i]) bTema[i].textContent = txt;
  });
  $('#ac-colores-pista').textContent = t('acColoresPista');
  CLAVES_COLORES.forEach(k => {
    $('#ac-color-' + k + '-lbl').textContent = t('acColor' + k[0].toUpperCase() + k.slice(1));
  });
  const bFuente = document.querySelectorAll('.opt-group[data-grupo="fuente"] button');
  [t('acSerif'), t('acSans'), t('acDislexia')].forEach((txt, i) => {
    if (bFuente[i]) bFuente[i].textContent = txt;
  });
  const bExtra = document.querySelectorAll('.opt-group[data-grupo="extra"] button');
  [t('acJustificar'), t('acBionic'), t('acFoco')].forEach((txt, i) => {
    if (bExtra[i]) bExtra[i].textContent = txt;
  });

  $('#pend-title').textContent = t('pendTitle');
  $('#pend-refresh').innerHTML = ico('refresh-cw') + `<span>${escapeHtml(t('pendRefresh'))}</span>`;

  $('#rep-title').textContent = t('repTitle');
  $('#rep-motivo-lbl').textContent = t('repMotivoLbl');
  $('#rep-detalles-lbl').textContent = t('repDetallesLbl');
  $('#rep-detalles').placeholder = t('repDetallesPh');
  $('#rep-config-lbl').textContent = t('repConfigLbl');
  $('#rep-copy').textContent = t('repCopy');
  $('#rep-mail').textContent = t('repMail');
  $('#rep-github').textContent = t('repGithub');
  const motivoLabels = [
    t('repMotivoNoSeMuestra'), t('repMotivoEnlaceRoto'), t('repMotivoPaywall'),
    t('repMotivoMedioIncorrecto'), t('repMotivoDuplicado'),
    t('repMotivoContenido'), t('repMotivoFecha'), t('repMotivoOtro')
  ];
  const selMot = $('#rep-motivo');
  [...selMot.options].forEach((o, i) => { if (motivoLabels[i]) o.textContent = motivoLabels[i]; });


  $('#buscar').placeholder = t('fltBuscar');
  $('#filtros-label').textContent = t('fltBtn');
  $('#filtros-titulo').textContent = t('fltBtn');
  $('#filtros-cerrar').textContent = t('btnCerrar');
  $('#btn-buscar span').textContent = t('fltBuscarBoton');
  $('#buscar').setAttribute('aria-label', t('fltBuscarBoton'));
  document.querySelectorAll('[data-filtro-label]').forEach((el, i) => {
    el.textContent = t('fltCampos').split('|')[i];
  });
  document.querySelectorAll('.panel-close').forEach(b => {
    b.title = t('btnCerrar');
    b.setAttribute('aria-label', t('btnCerrar'));
  });
  if ($('#grupo').options[0]) $('#grupo').options[0].text = t('fltGrupo');
  if ($('#tipo').options[0])  $('#tipo').options[0].text  = t('fltTipo');

  const rOpts = $('#rango').options;
  rOpts[0].text = t('fltTodo');
  rOpts[1].text = t('flt24h');
  rOpts[2].text = t('flt48h');
  const oOpts = $('#orden').options;
  oOpts[0].text = t('ordenRecientes');
  oOpts[1].text = t('ordenAntiguos');
  oOpts[2].text = t('ordenRelevancia');

  renderLangSelect();
  actualizarSyncBanner();
  actualizarBotonPendientes();
  // Si cambia el idioma, el chip del tiempo muestra la nueva traducción.
  if ($('#chips-busqueda').style.display !== 'none'){
    const raw = $('#buscar').value.trim();
    renderChips(parseQuery(preprocesarInput(raw)), raw);
  }
}
/* ── Fase 2 · selector de días ── */
/* ── Fase 2 · selector de días ──
   Los días solo se usan con un modo activo o filtrando por medio: entonces
   se descargan N días de los ficheros de sus grupos y medios. Lo que pesa
   es días × tamaño del modo, y el manifest dice cuántos titulares y kB hay
   de media al día por grupo y medio, así que se puede estimar antes de
   descargar. */
function estimarCarga(modo, dias){
  const lista = (_manifest && _manifest.dias) || [];
  if (!modo || !lista.length) return null;
  const grupos = modo.grupos || [];
  const dominios = Object.entries(modo.overrides || {})
    .filter(([, v]) => overrideIncluye(v)).map(([d]) => normDomain(d));
  let n = 0, kb = 0;
  const nDias = Math.min(dias, DIAS_MEMORIA_MAX_SCOPE, lista.length);
  const medias = _manifest.medias;
  if (medias){
    for (const g of grupos){
      const f = _buscarGrupoEnDia(medias.grupos, g);
      if (f){ n += f[0] * nDias; kb += f[1] * nDias; }
    }
    for (const d of dominios){
      const f = medias.dominios && medias.dominios[d];
      if (f){ n += f[0] * nDias; kb += f[1] * nDias; }
    }
    return { n, kb };
  }
  for (const dia of lista.slice(0, nDias)){
    for (const g of grupos){
      const f = _buscarGrupoEnDia(dia.grupos, g);
      if (f){ n += f.n || 0; kb += f.kb || 0; }
    }
    for (const d of dominios){
      const f = dia.dominios && dia.dominios[d];
      if (f){ n += f.n || 0; kb += f.kb || 0; }
    }
  }
  return { n, kb };
}
function textoCarga(c){
  const lang = ACCES.lang;
  return {
    n:  Math.round(c.n).toLocaleString(lang),
    mb: (c.kb / 1024).toLocaleString(lang, { maximumFractionDigits: 1 }),
  };
}
function modoParaDias(){
  return (PRESET_ACTIVO && presetTieneReglas()) ? PRESET : null;
}

function renderDiasSelector() {
  const grupo = document.querySelector('.opt-group[data-dias]');
  if (!grupo) return;
  grupo.querySelectorAll('button[data-val]').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.val, 10) === DIAS_MEMORIA);
  });
  const est = $('#dias-estimacion');
  if (!est) return;
  const modo = modoParaDias();
  if (!modo){ est.textContent = t('cfgDiasSinModo'); return; }
  const c = estimarCarga(modo, DIAS_MEMORIA);
  est.textContent = c ? t('cfgDiasEstimacion', { X: modo.nombre, ...textoCarga(c) }) : '';
}

function setDiasMemoria(n, { persistir = true } = {}) {
  if (!DIAS_MEMORIA_VALIDOS.includes(n)) return;
  DIAS_MEMORIA = n;
  if (persistir){
    try { localStorage.setItem(DIAS_MEMORIA_KEY, String(n)); } catch(e){}
  }
  renderDiasSelector();
}

function wireDiasSelector() {
  const grupo = document.querySelector('.opt-group[data-dias]');
  if (!grupo) return;

  const confirmar = $('#dias-confirmar');
  let pendiente = 0;
  const cerrarConfirmar = () => { confirmar.hidden = true; pendiente = 0; };

  grupo.addEventListener('click', e => {
    const b = e.target.closest('button[data-val]');
    if (!b) return;
    const v = parseInt(b.dataset.val, 10);
    if (v === DIAS_MEMORIA){ cerrarConfirmar(); return; }

    // Descarga grande: se explica y se pide confirmación antes.
    const modo = modoParaDias();
    const c = modo && v > DIAS_MEMORIA ? estimarCarga(modo, v) : null;
    const confirmarUnDia = v === 1;
    const confirmarCargaGrande = c && c.n > DIAS_UMBRAL_TITULARES;
    if (confirmarUnDia || confirmarCargaGrande){
      pendiente = v;
      const avisos = [];
      if (confirmarCargaGrande){
        avisos.push(t('cfgDiasConfirmar', { d: v, X: modo.nombre, ...textoCarga(c) }));
      }
      if (confirmarUnDia) avisos.push(t('cfgDiasUnoConfirmar'));
      $('#dias-confirmar-txt').textContent = avisos.join(' ');
      confirmar.hidden = false;
      return;
    }
    cerrarConfirmar();
    aplicarDiasMemoria(v);
  });
  $('#dias-cancelar').addEventListener('click', cerrarConfirmar);
  $('#dias-cargar').addEventListener('click', () => {
    const v = pendiente;
    cerrarConfirmar();
    if (v) aplicarDiasMemoria(v);
  });

  renderDiasSelector();
}

function aplicarDiasMemoria(v){
  setDiasMemoria(v);

  // Reset total del estado de capas para que se vuelvan a pedir con el
  // nuevo DIAS_MEMORIA
  LAYERS.clear();
  _itemsCargadosDeCapas = 0;
  DIAS_ACTUAL = 0;
  ULT_QUERY_KEY = '';       // fuerza el reset en el siguiente aplicarFiltros
  _hidratadasHasta = 0;
  _dupsHechosHasta = 0;

  aplicarFiltros();
}

function wireAjustes(){
  const panel = $('#panel-ajustes');
  if (!panel) return;
  ajPrepararAncho();
  window.matchMedia('(max-width: 819.98px)').addEventListener('change', () => {
    if (ajAbierto()){ ajGuardarTemas(); ajPintar(); }
  });
  window.addEventListener('popstate', ajPopstate);
  panel.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const controles = [...panel.querySelectorAll('button, input, select, textarea, summary, [tabindex="0"]')]
      .filter(el => !el.disabled && el.getClientRects().length);
    const primero = controles[0], ultimo = controles[controles.length - 1];
    if (!primero) return;
    if (e.shiftKey && (document.activeElement === primero || document.activeElement.tabIndex < 0)){
      e.preventDefault(); ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo){
      e.preventDefault(); primero.focus();
    }
  });
  // Si se recargó con Ajustes abierto, el paso del historial queda huérfano.
  if (history.state && history.state.aj) history.replaceState(null, '');

  panel.querySelectorAll('.aj-secciones button[data-ir]').forEach(b =>
    b.addEventListener('click', () => ajIrSeccion(b.dataset.ir)));
  $('#aj-atras').addEventListener('click', ajAtras);

  // ── Modos ──
  $('#lista-modos').addEventListener('click', e => {
    const fila = e.target.closest('[data-modo-id]');
    if (fila) ajEditarModo(fila.dataset.modoId);
  });
  $('#btn-nuevo-modo').addEventListener('click', () => {
    const nuevo = crearModoYDevolver();
    if (nuevo) ajEditarModo(nuevo.id);
  });
  $('#aj-modo-activar').addEventListener('click', () => activarModo(MODO_EDITADO));
  $('#aj-modo-renombrar').addEventListener('click', () => renombrarModo(MODO_EDITADO));
  $('#aj-modo-duplicar').addEventListener('click', () => {
    const copia = duplicarModo(MODO_EDITADO);
    if (copia) ajEditarModo(copia.id);
  });
  $('#aj-modo-vaciar').addEventListener('click', () => vaciarModo(MODO_EDITADO));
  $('#aj-modo-borrar').addEventListener('click', () => borrarModo(MODO_EDITADO));

  const ta = $('#aj-temas');
  ta.addEventListener('input', () => {
    $('#aj-temas-n').textContent = '· ' + compilarTemas(parseLista(ta.value)).length;
    clearTimeout(_ajTemasTimer);
    _ajTemasTimer = setTimeout(ajGuardarTemas, 600);
  });
  ta.addEventListener('blur', ajGuardarTemas);

  $('#lista-grupos').addEventListener('change', () => {
    const modo = modoEnPanel();
    if (!modo) return;
    modo.grupos = [...document.querySelectorAll('#lista-grupos input[data-grupo]:checked')]
      .map(c => c.dataset.grupo);
    guardarPresets();
    ajModoCambiado(modo);
  });

  // ── Feed: mismo estado que el panel Filtros ──
  document.querySelectorAll('input[name="aj-hide"]').forEach(r =>
    r.addEventListener('change', () => { if (r.checked) ponerHideMode(r.value); }));

  // ── Ayuda ──
  $('#btn-report-generic').addEventListener('click', () => {
    cerrarAjustes();
    abrirReporte(null);
  });
}
/* ═══════════════════════════════════════════════════════════════
   EVENTOS
   ═══════════════════════════════════════════════════════════════ */
const aplicarFiltrosDebounced = debounce(aplicarFiltros, 350);

function wireStaticEvents(){
  const btnP = $('#btn-preset');
  actualizarBotonPreset();
  wireDiasSelector();
  const hTitle = document.getElementById('h-title');
  if (hTitle){
    hTitle.style.cursor = 'pointer';
    hTitle.title = 'F5';
    hTitle.addEventListener('click', () => {
      if ('scrollRestoration' in history){
        history.scrollRestoration = 'manual';
      }
      location.reload();
    });
  }

  btnP.addEventListener('click', e => {
    e.stopPropagation();
    const menu = $('#preset-menu');
    if (!menu) return;
    if (menu.style.display !== 'none'){
      cerrarPresetMenu();
    } else {
      abrirPresetMenu();
    }
  });
  document.querySelectorAll('input[name="vs-hide"]').forEach(r => {
    r.addEventListener('change', () => { if (r.checked) ponerHideMode(r.value); });
  });

  $('#btn-lectura').addEventListener('click', () =>
    ponerHideMode(HIDE_MODE === 'off' ? hideModeUltimo() : 'off'));
    // ── Toggle "Recordar filtros" ──
  const chkRec = $('#cfg-recordar-filtros');
  if (chkRec){
    chkRec.checked = RECORDAR_FILTROS;
    chkRec.addEventListener('change', () => {
      RECORDAR_FILTROS = chkRec.checked;
      guardarRecordarFiltros();
    });
  }
  // ── Toggle "Consultar el tiempo" ──
  const chkTiempo = $('#cfg-tiempo');
  if (chkTiempo){
    chkTiempo.checked = TIEMPO_ACTIVO;
    chkTiempo.addEventListener('change', () => {
      TIEMPO_ACTIVO = chkTiempo.checked;
      try { localStorage.setItem(TIEMPO_ACTIVO_KEY, TIEMPO_ACTIVO ? 'true' : 'false'); } catch(e){}
      TIEMPO.valor = null;   // la tarjeta se vuelve a resolver con el ajuste nuevo
      AVISOS.valor = undefined;   // y el panel de avisos se repinta
      aplicarFiltros();
      pintarBotonTiempo();
      refrescarAvisos();
    });
  }
  // ── Toggle "Avisos en el sol" ──
  const chkAvisosCab = $('#cfg-avisos-cab');
  if (chkAvisosCab){
    chkAvisosCab.checked = AVISOS_CABECERA;
    chkAvisosCab.addEventListener('change', () => {
      AVISOS_CABECERA = chkAvisosCab.checked;
      try { localStorage.setItem(AVISOS_CABECERA_KEY, AVISOS_CABECERA ? 'true' : 'false'); } catch(e){}
      pintarBotonTiempo();
      refrescarAvisos();
    });
  }
  // Toggle de fecha completa en las tarjetas.
  const chkFechaLarga = $('#cfg-fecha-larga');
  if (chkFechaLarga){
    chkFechaLarga.checked = !!ACCES.fechaLarga;
    chkFechaLarga.addEventListener('change', () => {
      ACCES.fechaLarga = chkFechaLarga.checked;
      guardarAcces();
      aplicarAcces();
    });
  }
  wireTiempo();
  wireAvisos();
  wirePortadas();
  // ── Chips de modo y de tema ──
  // Elegir un modo quita el chip de tema; pulsar el tema elegido lo quita.
  const chipsTemas = $('#temas-chips');
  if (chipsTemas){
    chipsTemas.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      const d = b.dataset;
      if (d.chip !== undefined){
        CHIP_TEMAS = d.chip || null;
        CHIP_TEMA = null;
      } else {
        const nuevo = d.medios ? { modo: d.modo, medios: true }
                    : d.tema   ? { modo: d.modo, etiqueta: d.tema }
                    : null;
        const igual = nuevo && CHIP_TEMA && CHIP_TEMA.modo === nuevo.modo
          && !!CHIP_TEMA.medios === !!nuevo.medios && CHIP_TEMA.etiqueta === nuevo.etiqueta;
        CHIP_TEMA = igual ? null : nuevo;
      }
      aplicarFiltros();
    });
  }
  // ── Pestañas Modo / Todo ──
  const pestanas = $('#preset-pestanas');
  if (pestanas){
    pestanas.addEventListener('click', e => {
      const b = e.target.closest('button[data-pestana]');
      if (!b) return;
      PESTANA_BUSQUEDA = b.dataset.pestana;
      aplicarFiltros();
    });
  }
  // ── Checkbox del panel de filtros ──
  const chkPrensaPanel = $('#prensa-panel-toggle');
  if (chkPrensaPanel){
    chkPrensaPanel.addEventListener('change', () => {
      setPrensaActiva(chkPrensaPanel.checked);
      PRENSA_FALLO = null;     // volver a encenderla reintenta lo que falló
      aplicarFiltros();
    });
  }

  // ── Selects de idioma y país ──
  const selPrensaLang = $('#prensa-lang');
  if (selPrensaLang){
    selPrensaLang.addEventListener('change', () => {
      setPrensaLang(selPrensaLang.value);
      aplicarFiltros();
    });
  }
  const selPrensaPais = $('#prensa-region');
  if (selPrensaPais){
    selPrensaPais.addEventListener('change', () => {
      setPrensaPais(selPrensaPais.value);
      aplicarFiltros();
    });
  }

  // ── Botón reset ──
  const btnResetPrensa = $('#prensa-reset');
  if (btnResetPrensa){
    btnResetPrensa.addEventListener('click', resetPrensa);
  }

  // ── Poblar los selects la primera vez ──
  pintarSelectsPrensa();
  setPrensaActiva(PRENSA_ACTIVA, { persistir: false });
  // ── Botones que abren paneles ──
  // ── Botón "Cargar más" (paginación R2 + Turso) ──
  const btnCargarMas = document.getElementById('btn-cargar-mas');
  if (btnCargarMas) btnCargarMas.addEventListener('click', () => {
    const pedir = btnCargarMas.dataset.modo === 'archivo' ? cargarMasDeTurso : cargarMas;
    solicitarMas(pedir);
  });

  $('#btn-pendientes').addEventListener('click', abrirPendientes);
  $('#btn-acces').addEventListener('click', () => abrirAjustes('lectura'));
  $('#btn-config').addEventListener('click', () => abrirAjustes());


  document.querySelectorAll('.panel-close').forEach(b => {
    b.addEventListener('click', () => cerrarPanel(b.dataset.close));
  });
  document.querySelectorAll('.panel').forEach(p => {
    p.addEventListener('click', e => {
      if (e.target === p) cerrarPanel(p.id);
    });
  });

  document.addEventListener('keydown', e => {
      if (e.key === 'Escape'){
        cerrarPresetMenu();
        if ($('#filtros-panel').matches(':modal')) $('#filtros-panel').close();
        cerrarMenuMas();
        const abierto = document.querySelector('.panel.open');
        if (abierto){ cerrarPanel(abierto.id); return; }
      }
    const tg = e.target;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT')) return;
    if (e.altKey && e.key.toLowerCase() === 'a'){ e.preventDefault(); abrirAjustes('lectura'); }
    if (e.altKey && e.key.toLowerCase() === 'c'){ e.preventDefault(); abrirAjustes(); }
    if (e.altKey && e.key.toLowerCase() === 'p'){ e.preventDefault(); abrirPendientes(); }
    if (e.altKey && e.key.toLowerCase() === 'm'){
      e.preventDefault();
      if (!PRESET_ACTIVO && !presetTieneReglas()){
        toast(t('presetVacio'), 3200);
        return;
      }
      PRESET_ACTIVO = !PRESET_ACTIVO;
      guardarPresetActivo();
      actualizarBotonPreset();
      aplicarFiltros();
    }
  });

  $('#lang-select').addEventListener('change', e => {
    const v = e.target.value;
    if (!I18N[v]) return;
    ACCES.lang = v;
    guardarAcces();
    aplicarTextos();
    reconstruirSelectores();
    construirIndicesBusqueda();
    ajRefrescar();
    renderizar();
  });

  $('#btn-export').addEventListener('click', exportarConfig);
  $('#btn-import').addEventListener('click', () => $('#file-import').click());
  $('#file-import').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) importarConfig(f);
    e.target.value = '';
  });

  $('#pend-refresh').addEventListener('click', abrirPendientes);

  $('#rep-copy').addEventListener('click', copiarReporte);
  $('#rep-mail').addEventListener('click', reportarViaEmail);
  $('#rep-github').addEventListener('click', reportarViaGithub);

  $('#acces-reset').addEventListener('click', () => {
    const lang = ACCES.lang;
    ACCES = { ...ACCES_DEF, lang, actualizado: ACCES.actualizado };
    guardarAcces(); aplicarAcces(); renderizar();
  });

  document.querySelectorAll('.opt-group[data-grupo]').forEach(g => {
    const clave = g.dataset.grupo;
    if (clave !== 'tema' && clave !== 'fuente' && clave !== 'extra') return;
    g.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      const v = b.dataset.val;
      if (clave === 'tema' && v === 'custom' && !limpiarColores(ACCES.colores)) ACCES.colores = coloresDelTemaActual();
      if (clave === 'tema' || clave === 'fuente') ACCES[clave] = v;
      if (clave === 'extra') ACCES[v] = !ACCES[v];
      guardarAcces(); aplicarAcces();
      if (clave === 'extra' && (v === 'focus' || v === 'bionic')) renderizar();
    });
  });
  // Tema personalizado: se ve al momento al mover el color; se guarda (y
  // viaja al lector y a otros dispositivos) al soltarlo.
  document.querySelectorAll('#ac-colores input[type="color"]').forEach(inp => {
    inp.addEventListener('input', () => {
      const antes = limpiarColores(ACCES.colores) || coloresDelTemaActual();
      ACCES.colores = limpiarColores({ ...antes, [inp.dataset.color]: inp.value });
      aplicarAcces();
    });
    inp.addEventListener('change', () => guardarAcces());
  });

  $('#fs-menos').addEventListener('click', () => ajustarFs(-1));
  $('#fs-mas').addEventListener('click', () => ajustarFs(+1));
  $('#w-menos').addEventListener('click', () => ajustarWidth(-1));
  $('#w-mas').addEventListener('click', () => ajustarWidth(+1));

  const filtrarMediosDebounced = debounce(filtrarMedios, 120);
  $('#filtro-medio').addEventListener('input', filtrarMediosDebounced);
  $('#filtro-grupo-medio').addEventListener('change', filtrarMedios);
  $('#filtro-estado-medio').addEventListener('change', filtrarMedios);

  $('#buscar').addEventListener('input', () => {
    aplicarFiltrosDebounced();
  });
  // Cada select escribe su token en #buscar.
  // #buscar es la fuente única; aplicarFiltros lee de ahí.
  const selG = $('#grupo');
  if (selG) selG.addEventListener('change', () => writeFilterToInput('grupo', selG.value));

  const selT = $('#tipo');
  if (selT) selT.addEventListener('change', () => writeFilterToInput('tipo', selT.value));

  const selO = $('#orden');
  if (selO) selO.addEventListener('change', () => {
    // "recientes" es el default → no escribimos token
    const v = selO.value === 'recientes' ? null : selO.value;
    writeFilterToInput('order', v);
  });

  const selR = $('#rango');
  if (selR) selR.addEventListener('change', () => {
    // «24 h»/«48 h» → desde:24h / desde:48h: ventana móvil, la misma para la
    // lista, el archivo y la prensa. "Todo" quita el desde.
    if (selR.value === '1')      writeFilterToInput('desde', '24h');
    else if (selR.value === '2') writeFilterToInput('desde', '48h');
    else                         writeFilterToInput('desde', null);
  });
    // Inputs de fecha — se enganchan una sola vez al arrancar.
  // Si estuvieran en syncPanelFromParsed se acumularían (esa función
  // se llama en cada aplicarFiltros).
  const fD = $('#fecha-desde');
  if (fD) fD.addEventListener('change', () => writeFilterToInput('desde', fD.value));

  const fH = $('#fecha-hasta');
  if (fH) fH.addEventListener('change', () => writeFilterToInput('hasta', fH.value));
// ── Panel de filtros: en escritorio va en línea bajo la barra y recuerda si
// estaba abierto; en móvil es una hoja modal ──
const btnFiltros   = $('#btn-filtros');
const filtrosPanel = $('#filtros-panel');
if (btnFiltros && filtrosPanel){
  const FILTROS_OPEN_KEY = 'voceiro-filtros-abierto';
  const preferenciaEnLinea = () => {
    try { return localStorage.getItem(FILTROS_OPEN_KEY) !== 'false'; } catch(e){ return true; }
  };
  // Con el atributo y no con show(): show() movería el foco al panel.
  const ponerEnLinea = abierto => {
    filtrosPanel.toggleAttribute('open', abierto);
    btnFiltros.setAttribute('aria-expanded', String(abierto));
  };
  const sincronizarModo = () => {
    if (filtrosPanel.matches(':modal')) filtrosPanel.close();
    const movil = ajEsMovil();
    btnFiltros.setAttribute('aria-haspopup', movil ? 'dialog' : 'false');
    ponerEnLinea(!movil && preferenciaEnLinea());
  };
  sincronizarModo();
  window.matchMedia('(max-width: 819.98px)').addEventListener('change', sincronizarModo);

  btnFiltros.addEventListener('click', () => {
    cerrarPresetMenu();
    pintarFiltroLectura();
    if (!ajEsMovil()){
      const abrir = !filtrosPanel.open;
      try { localStorage.setItem(FILTROS_OPEN_KEY, String(abrir)); } catch(e){}
      ponerEnLinea(abrir);
      return;
    }
    filtrosPanel.showModal();
    btnFiltros.setAttribute('aria-expanded', 'true');
  });
  $('#filtros-cerrar').addEventListener('click', () => filtrosPanel.close());
  // Tocar el fondo cierra la hoja. Un clic en el relleno del diálogo también
  // llega con target = diálogo, así que se mira si cae fuera de su caja.
  filtrosPanel.addEventListener('click', e => {
    if (e.target !== filtrosPanel || !filtrosPanel.matches(':modal')) return;
    const r = filtrosPanel.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom){
      filtrosPanel.close();
    }
  });
  // Puede llegar después de que sincronizarModo lo haya reabierto en línea.
  filtrosPanel.addEventListener('close', () => {
    btnFiltros.setAttribute('aria-expanded', String(filtrosPanel.open));
    btnFiltros.focus({ preventScroll: true });
  });
}
  const barra = $('.filtros-wrap');
  const btnBuscar = $('#btn-buscar');
  const mostrarBusqueda = abrir => {
    barra.classList.toggle('busqueda-abierta', abrir);
    btnBuscar.setAttribute('aria-expanded', String(abrir));
  };
  mostrarBusqueda(!!$('#buscar').value);
  btnBuscar.addEventListener('click', () => {
    const abrir = !barra.classList.contains('busqueda-abierta');
    mostrarBusqueda(abrir);
    if (abrir) $('#buscar').focus({ preventScroll: true });
  });

  // ── Clear del buscador ──
  const buscarInput = $('#buscar');
  const buscarClear = $('#buscar-clear');
  if (buscarInput && buscarClear){
    const syncClear = () => { buscarClear.hidden = !buscarInput.value; };
    syncClear();
    buscarInput.addEventListener('input', syncClear);
    buscarClear.addEventListener('click', () => {
      buscarInput.value = '';
      syncClear();
      aplicarFiltros();
      buscarInput.focus();
    });
  }

  const ovInclude = $('#ov-add-include');
  const ovIgnore = $('#ov-add-ignore');

  function aplicarOverrideDesdeBuscador(tipo){
    const v = $('#filtro-medio').value.trim();
    const d = normalizarDominioInput(v);
    if (!d || !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(d)){
      toast(t('cfgOverrideBad', { X: v }), 2400);
      return;
    }
    const modo = modoEnPanel();
    if (!modo) return;
    setOverride(d, tipo, modo);
    $('#filtro-medio').value = '';
    $('#filtro-medio-add').hidden = true;
    ajModoCambiado(modo);
    pintarModo();
  }

  if (ovInclude) ovInclude.addEventListener('click', () => aplicarOverrideDesdeBuscador('include'));
  if (ovIgnore) ovIgnore.addEventListener('click', () => aplicarOverrideDesdeBuscador('ignore'));

  const ovAplicar = $('#ov-pegar-aplicar');
  if (ovAplicar) ovAplicar.addEventListener('click', aplicarListaOverrides);
  wireResultadosDelegation();
  wireAutocomplete();
    // Delegación para #lista-medios (un único listener en todo el contenedor)
  const contMedios = $('#lista-medios');
  if (contMedios){
    contMedios.addEventListener('change', e => {
      const select = e.target.closest('.medio-estado');
      const fila = select && select.closest('.medio-fila');
      const modo = modoEnPanel();
      if (!fila || !modo) return;
      setOverride(fila.dataset.dominio, select.value, modo);
      actualizarFilaMedio(fila.dataset.dominio, modo);
      ajModoCambiado(modo);
      if (!fila.isConnected) $('#filtro-medio').focus();
      else if (fila.style.display === 'none') $('#filtro-estado-medio').focus();
    });
  }
}
/* ═══════════════════════════════════════════════════════════════
   INICIALIZACIÓN
   ═══════════════════════════════════════════════════════════════ */
async function init(){
  // ── 0) UI inmediata: tema, textos y listeners ANTES de tocar la red ──
  aplicarAcces();

  PRESETS = cargarPresets();
  _huellasModos = huellasDeModos();
  cargarSync();
  const _activeId = localStorage.getItem(PRESET_ID_KEY) || PRESETS.activo;
  const _active = PRESETS.lista.find(p => p.id === _activeId) || PRESETS.lista[0];
  PRESETS.activo = _active.id;
  PRESET = _active;

  recompilarPreset();
  PRESET_ACTIVO  = cargarPresetActivo() && presetTieneReglas();
  VISTA_TEMAS    = !PRESET_ACTIVO && cargarVistaTemas();
  if (VISTA_TEMAS && !TEMAS_TODOS.length) ponerVistaTemas(false);
  HIDE_MODE      = cargarHideMode();
  RECORDAR_FILTROS = cargarRecordarFiltros();
    // Preferencias de prensa externa
  cargarPrensaDeLocalStorage();
  rebuildPendientes();

  setSitesFromArray(cargarSitesCache());

  // Textos + listeners: ya con esto la UI está viva y clicable
  aplicarTextos();
  wireBackToTop();
  wireCabecera();
  wireStaticEvents();
  wireAjustes();
  wireSync();
  wireVistasObserver();

  initUserScriptBridge();
  leerEnlaceSync();
  if (SYNC_CODIGO) sincronizarAhora();

  // ── 1.5) Restaurar búsqueda ANTES de tocar datos ──
  if (RECORDAR_FILTROS){
    try {
      const savedBuscar = localStorage.getItem('voceiro-buscar');
      if (savedBuscar){
        const input = $('#buscar');
        input.value = savedBuscar;
        $('.filtros-wrap').classList.add('busqueda-abierta');
        $('#btn-buscar').setAttribute('aria-expanded', 'true');
        const clearBtn = $('#buscar-clear');
        if (clearBtn) clearBtn.hidden = !savedBuscar;
      }
    } catch(e){}
  }

  // ── 2) Carga inicial (await) ──
  try {
    await cargarBase();
  } catch(err){
    $('#resultados').innerHTML =
      '<div class="vacio">Error cargando datos: ' + escapeHtml(err.message) + '</div>';
    return;
  }

  // ── 3) Tipos ──
  const selT = $('#tipo');
  while (selT.options.length > 1) selT.remove(1);
  [...new Set(MEDIOS_UNICOS.map(m => m.tipo).filter(Boolean))].sort()
    .forEach(t2 => selT.add(new Option(t2, t2)));
  if (selT.options[0]) selT.options[0].text = t('fltTipo');

  reconstruirSelectores();
  aplicarFiltros();

  // ── 4) A partir de aquí aplicarFiltros() ya puede persistir ──
  APP_LISTA = true;

  // ── DIAG TEMPORAL ──
  window.__diag = {
    get NOTICIAS()     { return NOTICIAS; },
    get ULT_FILTRADAS(){ return ULT_FILTRADAS; },
    get MEDIOS()       { return MEDIOS; },
    get LAYERS()       { return LAYERS; },
    get PRESET()       { return PRESET; },
    get PRESET_ACTIVO(){ return PRESET_ACTIVO; },
    get SET_GRUPOS()   { return SET_GRUPOS; },
    get TEMAS_TODOS()  { return TEMAS_TODOS; },
    get _manifest()    { return _manifest; },
  };

  // ── 5) Histórico en background ──
  }


init().catch(err => {
  $('#resultados').innerHTML =
    '<div class="vacio">Error cargando datos: ' + escapeHtml(err.message) + '</div>';
});
