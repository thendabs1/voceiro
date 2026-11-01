// Generado por scripts/generar_front.py desde front/app/*.js. No editar.

/* ═══════════════════════════════════════════════════════════════
   IMPORTS COMPARTIDOS
   El parser vive en shared/parser.js y se copia a public/parser.js
   (mismo origen que este HTML, servido por GitHub Pages).   Fuente única para frontend y worker. No duplicar.
   ═══════════════════════════════════════════════════════════════ */
import {
  parseQuery,
  parseRelativeDate,
  normalize,
  normStrict,
  normDomain,
  tokenizeQuery,
} from './parser.js?v=1f11c2dd29';
// Núcleo del buscador (shared/busqueda/): una sola definición de qué casa.
import { interpretarConsulta, paraPrensa } from './busqueda/consulta.js?v=1f11c2dd29';
import { palabrasDe, rangosResaltado } from './busqueda/texto.js?v=1f11c2dd29';
import { compilarTemas, temasQueCasan, compiladoDeTemas, etiquetaVisible } from './busqueda/temas.js?v=1f11c2dd29';
import { normalizarRegla, compilarRegla } from './busqueda/reglas.js?v=1f11c2dd29';
import { comparador } from './busqueda/orden.js?v=1f11c2dd29';
// Datos compartidos con el lector (shared/sync/): una regla de fusión.
import {
  normalizeUrlForMatch, fusionarPendientes, fusionarPerfil, limpiarPerfil,
  fusionarLeidas, fusionarModos, masReciente, huella, huellaModo,
  CAMPOS_PERFIL, LEIDAS_MAX, limpiarColores, CLAVES_COLORES,
} from './sync/fusion.js?v=1f11c2dd29';
import { paletaPersonalizada, contraste, VARS_PERSONALIZADAS } from './tema/personalizado.js?v=1f11c2dd29';
// Sincronización entre dispositivos (cliente y código; servidor: workers/cf-sync).
import { crearCliente, SERVIDORES_SYNC } from './sync/cliente.js?v=1f11c2dd29';
import { generarCodigo, limpiarCodigo, formatearCodigo } from './sync/cripto.js?v=1f11c2dd29';
// El tiempo (eltiempo:): búsqueda de municipios; la lista se importa al usarla.
import { indexar, sugerirMunicipios, municipiosExactos, provinciaDe } from './tiempo/lugares.js?v=1f11c2dd29';
import {
  PESO, comunidadDeZona, zonaHorariaAviso, empezado,
  filtrarAvisos, agruparAvisos,
} from './tiempo/avisos.js?v=1f11c2dd29';

import { I18N, traducir } from './idiomas/index.js?v=1f11c2dd29';
// Consultas puntuales (libro:, pelicula:…): competiciones con ficha en ESPN.
import { ESPN, PREFIJOS_CONSULTAS } from './consultas/registro.js?v=1f11c2dd29';
import { AMBITOS, leerConsultaCalendario, noticiaEnAmbitos } from './calendario/consulta.js?v=1f11c2dd29';
import { fechaValida, sumarDiasCalendario, diaEnZona, extremoVisible, ventanaCalendario, moverFecha } from './calendario/fechas.js?v=1f11c2dd29';
import { nombresSesion, nombresEvento, enMinusculas } from './calendario/nombres.js?v=1f11c2dd29';
// Comunidades y provincias para el «dónde» del calendario (los municipios, con el tiempo).
import { ADMINISTRACION } from './territorios/administracion.js?v=1f11c2dd29';
/* ═══════════════════════════════════════════════════════════════
   CONFIG
   ═══════════════════════════════════════════════════════════════ */
const REPORT_EMAIL = 'thendabs1@gmail.com';
const REPORT_REPO = 'thendabs1/voceiro';


// ── Backends (switch CF ↔ Deno) ──
const BACKENDS = {
  cf:   { data: 'https://datos.voceiro.eu',
          buscar: 'https://buscar.voceiro.eu' },
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
  const regla = normalizarRegla(p.regla);
  return {
    id:        String(p.id || 'general'),
    nombre:    String(p.nombre || p.id || 'General'),
    grupos:    Array.isArray(p.grupos)   ? p.grupos   : [],
    palabras:  Array.isArray(p.palabras) ? p.palabras : [],
    overrides: (p.overrides && typeof p.overrides === 'object' && !Array.isArray(p.overrides))
               ? p.overrides : {},
    ...(regla ? { regla } : {}),
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
    normalizarRegla(p.regla) ||
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
  if (btn){
    btn.classList.toggle('active', n > 0);
    btn.classList.toggle('lectura-activa', HIDE_MODE !== 'off');
  }
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
  const etiqueta = b.querySelector('.cab-txt');
  if (etiqueta) etiqueta.textContent = txt;
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

  const recargar = $('#btn-recargar');
  recargar.innerHTML = (temas ? ico('hash') : '')
    + `<span class="preset-nombre">${escapeHtml(nombre)}</span>`;
  recargar.title = `${t('estActualizar')} · ${nombre} (F5)`;
  recargar.setAttribute('aria-label', `${t('estActualizar')} · ${nombre}`);
  btn.title = t('cabCambiarModo');
  btn.setAttribute('aria-label', t('cabCambiarModo'));
  btn.classList.toggle('active', !!activo || temas);
  btn.closest('.preset-wrap').classList.toggle('active', !!activo || temas);

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
        abrirAsistenteModo();
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
    + (n.dominio ? `<button type="button" role="menuitem" class="btn-estadisticas-item" data-idx="${idx}">${iconoEstadisticas()}<span>${escapeHtml(t('estDelMedio'))}</span></button>` : '')
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
    const { default: qrcode } = await import('./vendor/qrcode-1.4.4.js?v=1f11c2dd29');
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
// Se mueven los controles, sin duplicar estados ni manejadores de eventos.
function wireMenuCabecera(barra){
  const menu = document.getElementById('cab-menu');
  const panel = document.getElementById('cab-menu-panel');
  const destinos = [
    [document.querySelector('header .meta'), document.getElementById('cab-meta-home')],
    [document.getElementById('btn-estadisticas'), document.getElementById('cab-est-home')],
    [document.getElementById('cab-deportes'), document.getElementById('cab-deportes-home')],
    ...[...document.querySelectorAll('#cab-feed-home > button')]
      .map(b => [b, document.getElementById('cab-feed-home')]),
  ].filter(([el]) => el);
  let compacto;
  new ResizeObserver(([entrada]) => {
    const siguiente = entrada.contentRect.width < 900;
    if (siguiente === compacto) return;
    compacto = siguiente;
    const foco = document.activeElement;
    const estabaEnMenu = menu.contains(foco);
    for (const [el, origen] of destinos) (compacto ? panel : origen).append(el);
    menu.open = compacto && destinos.some(([el]) => el.contains(foco));
    if (menu.open || (!compacto && estabaEnMenu)) {
      (foco === menu.querySelector('summary') ? document.getElementById('btn-recargar') : foco)
        .focus({ preventScroll: true });
    }
  }).observe(barra);
  const cerrar = () => { menu.open = false; };
  menu.addEventListener('toggle', () => {
    if (menu.open) barra.classList.remove('cab-oculta');
  });
  document.addEventListener('pointerdown', e => { if (!menu.contains(e.target)) cerrar(); });
  menu.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation(); cerrar();
      menu.querySelector('summary').focus({ preventScroll: true });
    }
  });
  menu.addEventListener('focusout', e => {
    if (!menu.contains(e.relatedTarget)) cerrar();
  });
  panel.addEventListener('click', e => {
    if (!e.target.closest('button')) return;
    cerrar();
    if (panel.contains(document.activeElement)) menu.querySelector('summary').focus({ preventScroll: true });
  });
}
function wireCabecera(){
  const barra = document.getElementById('barra-sup');
  const fila = barra?.querySelector('.filtros-row');
  if (!fila) return;
  wireMenuCabecera(barra);
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
    || document.getElementById('cab-menu').open
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
// clave: consulta que trajo los items (prensa). Un item que solo viene de
// ella se ve únicamente mientras esa consulta esté activa (_pasaVista):
// así una búsqueda no deja sus resultados en el feed ni en la siguiente.
// rangoBase: posición del primer item en una respuesta ordenada por
// relevancia; esa posición es su rango. Hoy ninguna fuente lo manda.
function _mergearItemsEnNoticias(items, capaKey, clave = null, rangoBase = null) {
  let añadidos = 0;
  let pos = 0;
  let rango = null;
  // Su clave incluye idioma y país, y a lo suyo no se le exigen las palabras
  // en el titular (_pasaVista).
  const marcar = n => {
    if (!clave) return;
    (n._prensaPara || (n._prensaPara = new Set())).add(clave);
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
  // `p` con solo el día (AAAA-MM-DD): no es un instante, la hora la da `e`.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
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

// Otra capa (la prensa, el archivo) trae la publicación que aquí faltaba
// (o solo tenía el día): se adopta. La hora corta (HH:MM) es relativa al
// día de su fichero.
function _adoptarPublicacion(n, otra){
  if (reconstruirFecha(n.p, n._dia || '') || !otra.p) return;
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

// Una consulta puntual sin comillas toma el resto de la línea
// (shared/parser.js): lo que se añada a la búsqueda va delante de ella.
function partirConsulta(raw) {
  const tk = tokenizeQuery(raw).find(x => x.resto);
  if (!tk) return { antes: raw, consulta: '' };
  const linea = raw.trimEnd();
  return { antes: linea.slice(0, linea.length - tk.raw.length), consulta: tk.raw };
}

// Reescribe #buscar: quita todos los tokens del prefijo indicado
// y añade uno nuevo si `value` es no vacío. Devuelve el nuevo string.
function rebuildInput(raw, prefix, value) {
  const { antes, consulta } = partirConsulta(raw);
  const tokens = tokenizeQuery(antes);
  const kept = tokens.filter(tk => (tk.prefix || '').toLowerCase() !== prefix);
  const parts = kept.map(tk => tk.raw);
  if (value !== null && value !== '' && value !== undefined) {
    const necesitaComillas = /\s/.test(value);
    parts.push(prefix + ':' + (necesitaComillas ? '"' + value + '"' : value));
  }
  if (consulta) parts.push(consulta);
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
  const { antes: raw, consulta } = partirConsulta($('#buscar').value);
  const deMedio = new Set(parseQuery(raw).chips
    .filter(ch => ch.type === 'medio' || ch.type === 'dominio' || ch.type === 'grupo')
    .map(ch => ch.raw));
  const parts = tokenizeQuery(raw).filter(tk => !deMedio.has(tk.raw)).map(tk => tk.raw);
  parts.push('web:' + dominio);
  if (consulta) parts.push(consulta);
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
      <span class="chip-tipo">${escapeHtml(c.type === 'eltiempo' ? t('chipTiempo') : c.type === 'consulta' ? nombreConsulta(c.tipo) : c.type)}</span>
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
  // Lo que sigue a una consulta puntual es su valor: nada que sugerir.
  if (partirConsulta(raw).consulta) return [];
  const calendario = sugerenciasCalendario(raw);
  if (calendario) return calendario;
  const stats = sugerenciasEstadisticas(raw);
  if (stats) return stats;
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

  if (s.kind === 'calendario'){
    input.value = input.value.replace(/[^\s"]*$/, s.value);
    cerrarSugerencias(); aplicarFiltros(); return;
  }

  if (s.kind === 'estadisticas'){
    input.value = input.value.replace(/(^|\s)(?:estadisticas|stats):(?:"[^"]*|[^\s"]*)$/i, (_, antes) => antes + 'estadisticas:' + s.value);
    consumirOrdenEstadisticas();
    return;
  }
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
const haySugerencias = items => items.length > 1 || ['municipio', 'estadisticas'].includes(items[0]?.kind);

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
   ACCESOS DEL BUSCADOR (▾ al final de la barra, como las opciones de Gmail)
   Horarios, resultados y clasificación de las competiciones con el ratón.
   Cada acceso escribe su orden en la barra y la aplica (modelo GitHub: el
   filtro activo se ve y se aprende); los botones de las vistas no escriben.
   ═══════════════════════════════════════════════════════════════ */
const ACCESOS = { abierto: false, pantalla: '', disp: null, cargando: null };
const ACCESOS_PRIMERAS = 4;
const ACCESOS_POR_DEFECTO = ['f1', 'primera', 'nba'];

// Competiciones con algo publicado (disponibilidad global del catálogo): una
// petición al abrir por primera vez; si falla, se ofrecen todas.
async function accesosDisponibilidad(){
  if (ACCESOS.disp || ACCESOS.cargando) return;
  const controller = ACCESOS.cargando = new AbortController();
  try { ACCESOS.disp = (await calPedir('catalogo', { disponibilidad: 1 }, controller.signal)).disponibilidad?.circuitos || {}; }
  catch { ACCESOS.disp = null; }
  ACCESOS.cargando = null;
  if (ACCESOS.abierto) pintarAccesos();
}
const accesoHay = c => !ACCESOS.disp || ACCESOS.disp[c] > 0;

// Sustituye en la barra lo que era de la agenda o una consulta puntual por la
// orden elegida; el resto (medios, palabras, fechas) se queda. Las consultas
// deportivas (resultados:primera) no van al final de la línea: se quitan aquí.
function escribirAcceso(orden){
  const { antes } = partirConsulta($('#buscar').value);
  const resto = tokenizeQuery(antes)
    .filter(tk => !(tk.prefix && (leerConsultaCalendario(tk.raw) || Object.hasOwn(PREFIJOS_CONSULTAS, tk.prefix))))
    .map(tk => tk.raw);
  cerrarAccesos(false);
  // Un prefijo deja un espacio detrás: lo que se escriba después es texto (f1: alonso).
  escribirBusqueda([...resto, orden].filter(Boolean).join(' ') + (orden.endsWith(':') ? ' ' : ''));
}

function pintarAccesos(){
  const panel = $('#accesos-panel');
  if (!panel) return;
  const p = ACCESOS.pantalla, nombre = calNombreCompeticion;
  // La orden no se repite en la fila: al pulsar se escribe en la barra y ahí se aprende.
  const fila = (orden, texto) => `<li><button type="button" data-orden="${calEsc(orden)}">${calEsc(texto)}</button></li>`;
  const ir = (pantalla, texto) => `<li><button type="button" data-pantalla="${calEsc(pantalla)}">${calEsc(texto)}<span aria-hidden="true"> ›</span></button></li>`;
  let titulo = t('accTitulo'), filas = [];
  if (!p){
    // Lo que sigo primero (★ de Deportes); sin nada, unas pocas conocidas.
    const sigo = (calPreferencias()?.competiciones || []).filter(accesoHay);
    const primeras = [...sigo, ...ACCESOS_POR_DEFECTO.filter(c => !sigo.includes(c) && accesoHay(c))].slice(0, ACCESOS_PRIMERAS);
    const futbol = CAL_DEPORTES.futbol.filter(accesoHay);
    filas = [sigo.length > 1 ? fila('calendario:' + sigo.join(','), t('accSigoHorarios')) : '',
      ...primeras.map(c => fila('calendario:' + c, t('accHorarios', { x: nombre(c) }))),
      futbol.length > 1 && !futbol.every(c => primeras.includes(c)) ? fila('calendario:' + futbol.join(','), t('accHorarios', { x: t('calFutbol') })) : '',
      ir('resultados', t('accResultados')), ir('clasificaciones', t('accClasificaciones')), ir('competiciones', t('accCompeticiones'))];
  } else if (p === 'resultados'){
    titulo = t('accResultadosTitulo');
    filas = CAL_COMPETICIONES.filter(c => codigoDeporte('resultados', c)).map(c => fila('resultados:' + c, nombre(c)));
  } else if (p === 'clasificaciones'){
    titulo = t('accClasificacionesTitulo');
    filas = CAL_COMPETICIONES.filter(c => codigoDeporte('clasificacion', c)).map(c => fila('clasificacion:' + c, nombre(c)));
  } else if (p === 'competiciones'){
    titulo = t('accCompeticionesTitulo');
    filas = CAL_COMPETICIONES.map(c => ir('c:' + c, nombre(c)));
  } else {
    // Una competición: solo las operaciones que admite (F1 no tiene resultados).
    const c = p.slice(2);
    titulo = nombre(c);
    filas = [accesoHay(c) ? fila('calendario:' + c, t('accHorarios', { x: nombre(c) })) : '',
      codigoDeporte('resultados', c) ? fila('resultados:' + c, t('accResultadosDe', { x: nombre(c) })) : '',
      codigoDeporte('clasificacion', c) ? fila('clasificacion:' + c, t('accClasificacionDe', { x: nombre(c) })) : '',
      // Solo noticias, sin abrir Deportes; en el modo o en todo, con sus pestañas.
      AMBITOS[c]?.noticias ? fila(c + ':noticias', t('accNoticiasDe', { x: nombre(c) })) : ''];
  }
  const volver = p ? `<button type="button" class="accesos-volver" data-volver="${p.startsWith('c:') ? 'competiciones' : ''}" aria-label="${calEsc(t('accVolver'))}">‹</button>` : '';
  panel.innerHTML = `<div class="accesos-cab">${volver}<h2 id="accesos-titulo" tabindex="-1">${calEsc(titulo)}</h2>
    <button type="button" class="accesos-cerrar" data-cerrar aria-label="${calEsc(t('calCerrar'))}">×</button></div>
    <ul class="accesos-lista">${filas.filter(Boolean).join('')}</ul>
    ${ACCESOS.cargando ? `<p class="accesos-estado" role="status">${calEsc(t('calCargando'))}</p>` : ''}`;
}

function abrirAccesos(){
  ACCESOS.abierto = true; ACCESOS.pantalla = '';
  cerrarSugerencias();
  const panel = $('#accesos-panel');
  panel.hidden = false;
  $('#buscar-accesos').setAttribute('aria-expanded', 'true');
  pintarAccesos();
  accesosDisponibilidad();
  panel.querySelector('.accesos-lista button')?.focus({ preventScroll: true });
}
function cerrarAccesos(volver = true){
  if (!ACCESOS.abierto) return;
  ACCESOS.abierto = false;
  $('#accesos-panel').hidden = true;
  $('#buscar-accesos').setAttribute('aria-expanded', 'false');
  if (volver) $('#buscar-accesos').focus({ preventScroll: true });
}

function wireAccesos(){
  wireIconosDeportes();
  const boton = $('#buscar-accesos'), panel = $('#accesos-panel');
  if (!boton || !panel) return;
  boton.addEventListener('click', () => ACCESOS.abierto ? cerrarAccesos() : abrirAccesos());
  panel.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if ('orden' in b.dataset) return escribirAcceso(b.dataset.orden);
    if ('cerrar' in b.dataset) return cerrarAccesos();
    if ('pantalla' in b.dataset || 'volver' in b.dataset){
      ACCESOS.pantalla = b.dataset.pantalla ?? b.dataset.volver;
      pintarAccesos();
      $('#accesos-titulo')?.focus({ preventScroll: true });
    }
  });
  // Escape cierra y vuelve al ▾; un clic fuera o salir con el tabulador, también.
  panel.addEventListener('keydown', e => { if (e.key === 'Escape'){ e.stopPropagation(); cerrarAccesos(); } });
  document.addEventListener('click', e => {
    // composedPath: al cambiar de pantalla, el botón pulsado ya no está en el panel.
    if (ACCESOS.abierto && !e.composedPath().some(n => n === panel || n === boton)) cerrarAccesos(false);
  });
  panel.addEventListener('focusout', e => {
    if (ACCESOS.abierto && e.relatedTarget && !panel.contains(e.relatedTarget) && e.relatedTarget !== boton) cerrarAccesos(false);
  });
}

// ── Iconos de deporte en la cabecera ──
// Un icono por deporte de las competiciones que sigo (★ de Deportes): escribe
// sus prefijos en la barra (f1: motogp:), que abren Deportes y filtran las
// noticias respetando el modo; pulsado otra vez, los quita (como el ☀).
const ICONOS_DEPORTE = {
  futbol: '<circle cx="12" cy="12" r="9"/><path d="m12 7.5 4 2.9-1.5 4.7h-5L8 10.4Z"/>',
  baloncesto: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5.6 5.6a9 9 0 0 1 0 12.8M18.4 5.6a9 9 0 0 0 0 12.8"/>',
  motor: '<path d="M5 21V4h13l-2 4 2 4H5"/><path d="M9 4v8M13 4v8M5 8h13"/>',
  tenis: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6a9 9 0 0 1 0 12.8M18.4 5.6a9 9 0 0 0 0 12.8"/>',
};
function deportesSeguidos(){
  const sigo = calPreferencias()?.competiciones || [];
  return Object.entries(CAL_DEPORTES).map(([k, cs]) => [k, cs.filter(c => sigo.includes(c))]).filter(([, cs]) => cs.length);
}
// Pulsado si la barra pide exactamente esas competiciones.
function iconoPulsado(cs){
  const o = CALENDARIO.orden, ambitos = o && !o.circuitos.length ? o.ambitos : [];
  return ambitos.length === cs.length && cs.every(c => ambitos.includes(c));
}
function pintarIconosDeportes(){
  const el = $('#cab-deportes');
  if (!el) return;
  const deportes = deportesSeguidos();
  el.hidden = !deportes.length;
  el.setAttribute('aria-label', t('calCompeticiones'));
  el.innerHTML = deportes.map(([k, cs]) => {
    const etiqueta = t(CAL_NOMBRES_DEPORTE[k]) + ': ' + cs.map(calNombreCompeticion).join(', ');
    return `<button type="button" class="btn-cab cab-deporte cal-dep-${k}" data-deporte="${k}" aria-pressed="${iconoPulsado(cs)}" aria-label="${calEsc(etiqueta)}" title="${calEsc(etiqueta)}">
      <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONOS_DEPORTE[k]}</svg></button>`;
  }).join('');
}
function wireIconosDeportes(){
  const el = $('#cab-deportes');
  if (!el) return;
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-deporte]');
    if (!b) return;
    const cs = deportesSeguidos().find(([k]) => k === b.dataset.deporte)?.[1] || [];
    escribirAcceso(iconoPulsado(cs) ? '' : cs.map(c => c + ':').join(' '));
  });
  pintarIconosDeportes();
}
/* Calendario: cliente de la API de agenda de los workers de datos (/calendario/*). */
// Se pide solo lo visible: el catálogo una vez, el resumen de la ventana (cuentas
// y unas muestras por día), la lista de un día al abrirla y el detalle de una
// cita. Resultados y clasificaciones son consultas puntuales.
const CALENDARIO_ACTIVO = true;
// Zonas que prepara la publicación; con otra zona del navegador, la peninsular.
const CAL_ZONAS = ['Europe/Madrid', 'Atlantic/Canary', 'UTC'];
const CAL_ZONA = Intl.DateTimeFormat().resolvedOptions().timeZone;
const CAL_PRECIOS = { gratis: 'calPrecioGratis', pago: 'calPrecioPago', mixto: 'calPrecioMixto' };
// Atajos de fecha (Time Out, Fever): fijan los días que enseña la lista.
const CAL_RANGOS = { hoy: 'calHoy', manana: 'calManana', finde: 'calFinde' };
// Categorías de la barra, con su color (--cat-*); lo demás, «otras».
const CAL_CATEGORIAS = ['cultura', 'deportes'];
const CAL_SEMANAS_MAX = 4;
// Preferencias del calendario, solo en este dispositivo: sitio, intereses y
// competiciones que sigo. «omitido» recuerda «Ahora no».
const CAL_PREF_KEY = 'voceiro-calendario-preferencias-v1';
const CAL_PASOS = ['sitio', 'intereses', 'competiciones', 'resumen'];
// Deportes por deporte y sus competiciones (SofaScore): dos toques hasta una liga.
const CAL_DEPORTES = { futbol: ['primera', 'segunda'], baloncesto: ['nba', 'wnba', 'feb-endesa', 'feb-primera', 'feb-challenge'],
  motor: ['f1', 'motogp', 'wrc'], tenis: ['atp', 'wta'] };
const CAL_NOMBRES_DEPORTE = { futbol: 'calFutbol', baloncesto: 'calBaloncesto', motor: 'calMotor', tenis: 'calTenis' };
const CAL_COMPETICIONES = Object.values(CAL_DEPORTES).flat();
// Cada competición lleva el color de su deporte (--dep-*); lo demás, el de su categoría.
const CAL_DEPORTE_DE = Object.fromEntries(Object.entries(CAL_DEPORTES).flatMap(([k, cs]) => cs.map(c => [c, k])));
const calDeporte = e => (e.competiciones || []).map(c => CAL_DEPORTE_DE[c]).find(Boolean);
const calColor = e => calDeporte(e) ? 'cal-dep cal-dep-' + calDeporte(e) : 'cal-cat-' + calCategoria(e.categoria);
// Marcas del mes por competición, en orden de prioridad; la WTA está casi
// todos los días y va al final para no tapar al resto.
const CAL_MARCAS = { f1: 'F1', motogp: 'MGP', wrc: 'WRC', primera: '1ª', segunda: '2ª', nba: 'NBA', atp: 'ATP',
  'feb-endesa': 'LFE', 'feb-primera': 'FEB', 'feb-challenge': 'LFC', wnba: 'WNBA', wta: 'WTA' };
const CALENDARIO = {
  abierto: false, porPrefijo: false, orden: null, meta: null, cargado: 0, cargando: false, error: '',
  // dia: el elegido en el mes. dias: listas abiertas por «día|citas» o «día|curso».
  // fecha: el día elegido (la lista empieza en él y la tira enseña su semana).
  fecha: '', desdeConsulta: '', rango: '', semanas: 1, mesAbierto: false, mes: null, navEnBarra: '', altoSemana: 0,
  zona: CAL_ZONAS.includes(CAL_ZONA) ? CAL_ZONA : 'Europe/Madrid',
  temas: new Set(), mio: false, prefs: null, asistente: null, temporada: null, temporadaAbierta: false, disp: null,
  // vista: «agenda» (la de un sitio: cultura y ocio, y su deporte local) o
  // «deportes» (por competición, sin sitio), cada una con su botón.
  // capas: competiciones marcadas en Deportes.
  vista: 'agenda', capas: null,
  // desplegado: «día~id» del evento abierto en la lista; detalles: su ficha por id
  // (null si falló), hasta renovar.
  desplegado: '', detalles: new Map(), precio: '', donde: null, dondeAuto: false, editandoDonde: false, clave: '',
  escrito: { donde: '' }, sugerencias: { donde: [] },
  consulta: '', vigente: '', controller: null, resumen: null, dias: new Map(), pendientes: null, origen: null, scroll: 0,
};
const iconoCalendario = () => '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z"/></svg>';
// Trofeo: copa, asas y peana.
const iconoDeportes = () => '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0V4Zm0 2H4v1a3 3 0 0 0 3 3m10-4h3v1a3 3 0 0 1-3 3m-5 4v4m-4 3h8l-1-3H9l-1 3Z"/></svg>';
const calNombre = e => e?.nombres?.[ACCES.lang] || e?.nombres?.es || Object.values(e?.nombres || {})[0] || '—';
const calEsc = s => escapeHtml(String(s ?? ''));
// Singular y plural: «clave1» para uno.
const calN = (clave, n) => t(n === 1 ? clave + '1' : clave, { n });
const calNombreFormato = f => t('calFmt' + f.split('-').map(x => x[0].toUpperCase() + x.slice(1)).join(''));
// Cita, programa o prolongada; por zona si la publicación la distingue.
const calPresentacion = e => (e.presentacion && typeof e.presentacion === 'object'
  ? e.presentacion[CALENDARIO.zona] : e.presentacion) || 'cita';
const calHoy = () => diaEnZona(new Date().toISOString(), CALENDARIO.zona);
const calFormatos = new Map();
function calFormato(opciones){
  const clave = JSON.stringify([ACCES.lang, opciones]);
  if (!calFormatos.has(clave)){
    if (calFormatos.size >= 32) calFormatos.clear();
    calFormatos.set(clave, new Intl.DateTimeFormat(ACCES.lang, opciones));
  }
  return calFormatos.get(clave);
}
const calFecha = (dia, opciones = {}) => fechaValida(dia) ? calFormato({
  timeZone: 'UTC', day: 'numeric', month: 'short', ...opciones,
}).format(new Date(dia + 'T12:00:00Z')) : t('calFechaPendiente');
const calBoton = (accion, label, valor = '', attrs = '') => `<button type="button" data-cal="${accion}" data-valor="${calEsc(valor)}" ${attrs}>${calEsc(label)}</button>`;
function calEnlace(url, label){
  try { if (!/^https?:$/.test(new URL(url).protocol)) return calEsc(label); }
  catch { return calEsc(label); }
  return `<a href="${calEsc(url)}" target="_blank" rel="noopener noreferrer">${calEsc(label)}</a>`;
}
// El texto libre, sin prefijos: las fechas y los filtros van en parámetros propios.
const calLibre = raw => tokenizeQuery(raw || '').filter(tk => !tk.prefix).map(tk => tk.raw).join(' ');
// Mismo orden de backends que los datos. Un 4xx es de la consulta: el otro
// backend respondería lo mismo, así que no se repite. Tampoco el 429: es el
// límite por IP y ambos leen la misma base; se espera lo que diga Retry-After.
let calEsperaHasta = 0;
async function calPedir(ruta, params, signal){
  if (Date.now() < calEsperaHasta) throw Object.assign(new Error('HTTP 429'), { status: 429 });
  const qs = String(new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)));
  let fallo;
  for (const base of [...new Set([DATA_BASE, ...Object.values(BACKENDS).map(b => b.data)])]){
    let r;
    try {
      r = await fetch(`${base}/calendario/${ruta}${qs ? '?' + qs : ''}`, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) });
    } catch (e){ if (signal.aborted) throw e; fallo = e; continue; }
    const dato = await r.json().catch(() => null);
    if (r.ok && dato) return dato;
    fallo = Object.assign(new Error(dato?.error || `HTTP ${r.status}`), { status: r.status });
    if (r.status === 429) calEsperaHasta = Date.now() + (Number(r.headers.get('Retry-After')) || 60) * 1000;
    if (r.status >= 400 && r.status < 500) throw fallo;
  }
  throw fallo;
}
// Temas con algo en el sitio de la agenda (precalculado al publicar): los
// subchips solo ofrecen esos. Mientras llega, o si falla, se ofrecen todos.
async function calDisponibilidadSitio(){
  const s = CALENDARIO, clave = s.donde?.id || '';
  if (s.disp?.clave === clave) return;
  s.disp?.controller.abort();
  const d = s.disp = { clave, temas: null, controller: new AbortController() };
  try {
    const dato = await calPedir('catalogo', { disponibilidad: 1, territorio: clave }, d.controller.signal);
    if (s.disp !== d) return;
    d.temas = dato.disponibilidad?.temas || null;
    pintarCalendario();
  } catch { /* Sin filtro: todas las subcategorías. */ }
}
// Mensaje de un fallo. Un 429 es el límite por IP: se avisa de la espera y, al
// terminar, se vuelve a pedir solo (un reintento aunque fallen varias a la vez).
let calReintentoPendiente = false;
function calFallo(e){
  if (e?.status !== 429) return e?.status === 422 ? 'calFueraHorizonte' : 'calError';
  if (!calReintentoPendiente){
    calReintentoPendiente = true;
    setTimeout(() => {
      calReintentoPendiente = false;
      const s = CALENDARIO;
      if (!s.abierto) return;
      s.error = ''; s.consulta = ''; s.mes = null; consultarCalendario();
    }, Math.max(1000, calEsperaHasta - Date.now()));
  }
  return 'calEspera';
}
const calSegundosEspera = () => Math.max(1, Math.ceil((calEsperaHasta - Date.now()) / 1000));
// La publicación avanza a diario: cada respuesta trae su revisión y cobertura.
function calAnotar(dato){
  const m = CALENDARIO.meta;
  // Otra publicación: las fichas guardadas pueden haber cambiado.
  if (m && dato.revision && dato.revision !== m.revision) CALENDARIO.detalles.clear();
  if (m) for (const k of ['revision', 'generado', 'horizonte', 'cobertura', 'colecciones']) m[k] = dato[k];
}
function calParametros(){
  // Cada vista toma de la orden solo lo suyo: Deportes, las competiciones; la
  // agenda, los temas. Una orden solo de noticias no filtra el calendario.
  const s = CALENDARIO, o = calPideAgenda(s.orden) ? s.orden : null, deportes = calModoDeportes();
  const ambitos = [...(o?.ambitos || []).filter(a => Boolean(AMBITOS[a]?.codigo) === deportes), ...(deportes ? s.capas || [] : [])];
  const circuitos = deportes ? o?.circuitos || [] : [];
  const q = [...ambitos.map(a => a + ':'), ...(circuitos.length ? ['circuito:' + circuitos.join(',')] : [])].join(' ');
  // La agenda va siempre acotada a su sitio (territorio estricto); Deportes,
  // por competición y sin sitio: las competiciones no tienen territorio.
  return { zona: s.zona, q, texto: calLibre(o?.resto), temas: deportes ? '' : [...s.temas].join(','),
    precio: deportes ? '' : s.precio, territorio: deportes ? '' : s.donde?.id || '' };
}
// desde:/hasta: del buscador. Los relativos (hoy, ayer, 7d) el parser los
// cuenta desde el día del navegador; el calendario, desde el hoy de su zona.
function calFechasConsulta(resto){
  const p = parseQuery(resto || ''), desfase = calDiferencia(parseQuery('desde:hoy').desde, calHoy());
  const fecha = tipo => {
    const v = p[tipo], texto = p.chips?.find(c => c.type === tipo)?.value || '';
    return fechaValida(v) && /^(hoy|ayer|\d+[dhm])$/i.test(texto.trim()) ? sumarDiasCalendario(v, desfase) : v;
  };
  return { desde: fecha('desde'), hasta: fecha('hasta') };
}
// Días de la vista y su ventana [desde, hasta) dentro de lo publicado.
// desde:/hasta: del buscador acotan la celebración; en noticias, la publicación.
function calVentana(){
  const s = CALENDARIO, h = s.meta?.horizonte, p = calFechasConsulta(s.orden?.resto);
  // Desde el día elegido, una semana por cada una cargada (la tira enseña la
  // semana entera; sus días anteriores, sin cuentas).
  const dias = Array.from({ length: 7 * s.semanas }, (_, i) => sumarDiasCalendario(s.fecha, i));
  const fin = fechaValida(p.hasta) ? sumarDiasCalendario(p.hasta, 1) : null;
  const desde = [dias[0], h?.desde, fechaValida(p.desde) ? p.desde : null].filter(Boolean).sort().at(-1);
  const hasta = [sumarDiasCalendario(dias.at(-1), 1), h?.hasta, fin].filter(Boolean).sort()[0];
  return { dias, desde, hasta, acotada: Boolean(p.desde || fin) };
}
const calPideAgenda = o => Boolean(o) && (o.desconocidos.length > 0 || !o.tipos.length || o.tipos.includes('calendario'));
async function cargarCalendario(renovar = false){
  if (!CALENDARIO_ACTIVO) return;
  const s = CALENDARIO;
  if (s.orden?.desconocidos.length) return void pintarCalendario();
  if (s.meta && !renovar) return void consultarCalendario();
  if (renovar){ s.mes = null; s.temporada = null; s.disp = null; s.detalles.clear(); s.desplegado = ''; s.detalleLista?.abort(); }
  s.controller?.abort();
  const controller = s.controller = new AbortController();
  s.cargando = true; s.error = ''; pintarCalendario();
  try {
    s.meta = await calPedir('catalogo', {}, controller.signal); s.cargado = Date.now();
  } catch (e){
    if (controller.signal.aborted) return;
    s.cargando = false; s.error = calFallo(e); return void pintarCalendario();
  }
  s.consulta = ''; s.pendientes = null;
  consultarCalendario();
}
async function consultarCalendario(){
  const s = CALENDARIO;
  if (!s.meta) return void cargarCalendario();
  s.fecha ||= calHoy();
  if (calSinSitio() || calMixta()){
    s.controller?.abort(); s.consulta = s.vigente = ''; s.resumen = null; s.barras = []; s.cargando = false;
    return void pintarCalendario();
  }
  const { desde, hasta } = calVentana();
  if (s.mesAbierto) cargarMesCalendario();
  // Los subchips solo se ven con una categoría elegida: solo entonces hace falta.
  if (!calModoDeportes() && calRaizElegida()) calDisponibilidadSitio();
  // Tira y lista salen del mismo resumen: cuentas por categoría, tres muestras
  // por día y, en Deportes, las barras (los GP van a cada día de la lista como
  // «todo el día»; solo las competiciones tienen barra).
  const params = { ...calParametros(), desde, hasta, muestras: 3, barras: calModoDeportes() ? 1 : '' };
  const clave = JSON.stringify(params);
  if (clave === s.consulta && !s.error) return void pintarCalendario();
  s.controller?.abort();
  const controller = s.controller = new AbortController();
  // Lo anterior se queda a la vista hasta que llegue su sustituto.
  if (clave !== s.vigente) s.dias.clear();
  s.consulta = clave; s.error = '';
  // Abortar también corta la lista sin fecha en curso: se vuelve a pedir al pulsar.
  const p = s.pendientes;
  if (p && (p.cargando || p.clave !== JSON.stringify(calParametros()))) s.pendientes = null;
  if (desde >= hasta){ s.cargando = false; return void pintarCalendario(); }
  s.cargando = true; pintarCalendario();
  try {
    const dato = await calPedir('resumen', params, controller.signal);
    calAnotar(dato); s.vigente = clave; s.resumen = dato.dias; s.barras = dato.barras || []; s.dias.clear(); s.reintento = false;
  } catch (e){
    if (controller.signal.aborted) return;
    // Republicación en curso: un reintento lee ya la revisión nueva.
    if (e.status === 409 && !s.reintento){ s.reintento = true; s.consulta = ''; s.cargando = false; return void consultarCalendario(); }
    s.error = calFallo(e);
    // Lo que quedaba a la vista era de otra consulta: no se presenta como suyo.
    if (clave !== s.vigente){ s.resumen = null; s.barras = []; }
  }
  s.cargando = false; pintarCalendario();
}
// Mes desplegado: solo cuentas (sin muestras) de sus 42 días, al abrirlo.
// Ventana [desde, hasta) recortada al horizonte publicado y a desde:/hasta: del buscador.
function calRecortar(desde, hasta){
  const s = CALENDARIO, h = s.meta?.horizonte, p = calFechasConsulta(s.orden?.resto);
  const fin = fechaValida(p.hasta) ? sumarDiasCalendario(p.hasta, 1) : null;
  return { desde: [desde, h?.desde, fechaValida(p.desde) ? p.desde : null].filter(Boolean).sort().at(-1),
    hasta: [hasta, h?.hasta, fin].filter(Boolean).sort()[0] };
}
async function cargarMesCalendario(){
  const s = CALENDARIO, { dias } = calPeriodoMes();
  const { desde, hasta } = calRecortar(dias[0], sumarDiasCalendario(dias.at(-1), 1));
  // En ancho (rejilla con títulos), la agenda pide muestras y Deportes, barras
  // (sus días llevan marcas, que salen de las cuentas); en estrecho, solo cuentas.
  const ancho = calMesAncho(), deportes = calModoDeportes();
  const params = { ...calParametros(), desde, hasta, muestras: !ancho ? 0 : !deportes ? 4 : calPartidosEnMes() ? 5 : 0, barras: ancho && deportes ? 1 : '' }, clave = JSON.stringify(params);
  // Mismos días, otro período (este mes desde hoy y el siguiente entero): el
  // bloque de Deportes sigue al mes elegido aunque la rejilla no cambie.
  if (s.mes?.clave === clave || desde >= hasta) return void (deportes && s.abierto && s.temporadaAbierta && cargarTemporadaCalendario());
  s.controllerMes?.abort();
  const controller = s.controllerMes = new AbortController();
  s.mes = { clave, dias: s.mes?.dias || null, cargando: true };
  try {
    const dato = await calPedir('resumen', params, controller.signal);
    if (s.mes?.clave !== clave) return;
    calAnotar(dato); s.mes = { clave, dias: dato.dias, barras: dato.barras || [], cargando: false };
  } catch (e){
    // Un fallo de un mes que ya no se mira (otra vista u otra selección) no es de esta.
    if (controller.signal.aborted || s.mes?.clave !== clave) return;
    s.mes = null; s.error = calFallo(e);
  }
  pintarCalendario();
  if (calModoDeportes() && s.abierto && s.temporadaAbierta) cargarTemporadaCalendario();
}
// «Este mes en deportes»: los GP y torneos del período del mes desplegado (los
// partidos se cuentan con el resumen). Unos 30 al mes con todas las competiciones; se
// siguen hasta CAL_TEMPORADA_PAGINAS páginas para no contar sobre una parcial.
const CAL_TEMPORADA_PAGINAS = 4;
async function cargarTemporadaCalendario(){
  const s = CALENDARIO, { dias } = calPeriodoMes();
  const { desde, hasta } = calRecortar(dias[0], sumarDiasCalendario(dias.at(-1), 1));
  const params = { ...calParametros(), desde, hasta, presentacion: 'prolongada,programa',
    circuitos: Object.keys(CAL_MARCAS).join(','), limite: 50 }, clave = JSON.stringify(params);
  if (s.temporada?.clave === clave) return;
  if (desde >= hasta){ s.temporada = { clave, eventos: [] }; return; }
  // Su propio controlador: que el mes cambie de consulta no la deja a medias.
  s.controllerTemporada?.abort();
  const controller = s.controllerTemporada = new AbortController(), actual = s.temporada = { clave, eventos: null };
  try {
    const eventos = [];
    let cursor = '';
    for (let i = 0; i < CAL_TEMPORADA_PAGINAS; i++){
      const dato = await calPedir('eventos', { ...params, cursor, revision: s.meta?.revision }, controller.signal);
      if (s.temporada !== actual) return;
      calAnotar(dato); eventos.push(...dato.eventos);
      if (!(cursor = dato.siguiente)) break;
    }
    actual.eventos = eventos; actual.parcial = Boolean(cursor);
  } catch (e){
    // Cortada sin respuesta, se puede volver a pedir.
    if (controller.signal.aborted){ if (s.temporada === actual) s.temporada = null; return; }
    if (s.temporada !== actual) return;
    if (e.status === 409) return void cargarCalendario(true);
    s.temporada = { clave, eventos: [], error: true };
  }
  pintarCalendario();
}
// Lista de un día: lo que pasa ese día (los mismos chips que sus muestras y su
// cuenta; con lecturas sin chips, citas y programas) o lo que está en curso. Se
// pide al abrirla y pagina con el cursor de la API; si la publicación cambió
// (409), se rehace desde el principio para no mezclar lecturas.
async function abrirDiaCalendario(dia, tipo, mas = false){
  const s = CALENDARIO, clave = dia + '|' + tipo;
  let l = s.dias.get(clave);
  if (!l){ l = { eventos: [], siguiente: null, cargando: false, cargada: false }; s.dias.set(clave, l); }
  l.abierta = true;
  if (l.cargando || (mas ? !l.siguiente : l.cargada)) return void pintarCalendario();
  l.cargando = true; pintarCalendario();
  const controller = s.controller ||= new AbortController();
  // «En cartel» va por período («desde~hasta»); las citas, por día.
  const [desde, hasta = sumarDiasCalendario(dia, 1)] = dia.split('~');
  try {
    // Con la revisión del resumen a la vista: si la publicación cambió, 409.
    // En Deportes el día va entero (agrupado por deporte): 50, el máximo de la API.
    const limite = tipo === 'citas' && calModoDeportes() ? 50 : 20;
    const dato = await calPedir('eventos', { ...calParametros(), desde, hasta, limite, revision: s.meta?.revision,
      ...(tipo === 'curso' ? { presentacion: 'prolongada' } : { chips: 1 }), cursor: mas ? l.siguiente : '' }, controller.signal);
    if (s.dias.get(clave) !== l) return;
    calAnotar(dato); l.eventos.push(...dato.eventos); l.siguiente = dato.siguiente; l.cargada = true;
  } catch (e){
    if (controller.signal.aborted || s.dias.get(clave) !== l) return void (l.cargando = false);
    // Otra publicación: se rehace todo (cuentas y listas) para no mezclar lecturas.
    if (e.status === 409) return void cargarCalendario(true);
    s.error = calFallo(e);
  }
  l.cargando = false; pintarCalendario();
}
async function pendientesCalendario(mas = false){
  const s = CALENDARIO, filtros = calParametros(), clave = JSON.stringify(filtros);
  if (s.pendientes?.clave !== clave) s.pendientes = { clave, eventos: [], siguiente: null, cargando: false };
  const p = s.pendientes;
  if (p.cargando || mas && !p.siguiente) return;
  p.cargando = true; pintarCalendario();
  const controller = s.controller;
  try {
    const dato = await calPedir('eventos', { ...filtros, pendientes: 1, limite: 20, cursor: mas ? p.siguiente : '' }, controller.signal);
    if (s.pendientes !== p) return;
    calAnotar(dato); p.eventos.push(...dato.eventos); p.siguiente = dato.siguiente;
  } catch (e){
    if (controller.signal.aborted || s.pendientes !== p) return;
    if (e.status === 409){ s.pendientes = null; return void pendientesCalendario(); }
    s.error = calFallo(e);
  }
  p.cargando = false; pintarCalendario();
}
function calLimpiarFiltros(){
  const s = CALENDARIO;
  s.temas.clear(); s.mio = false; s.capas = null; s.temporada = null; s.precio = ''; s.rango = ''; s.semanas = 1; s.mes = null;
  // Lo abierto tampoco pasa a la siguiente entrada (las fichas sí se guardan).
  s.desplegado = ''; for (const l of s.dias.values()) l.abierta = false;
  s.escrito = { donde: '' }; s.sugerencias = { donde: [] }; s.editandoDonde = false;
}
function calPreferencias(){
  try {
    const p = CALENDARIO.prefs || JSON.parse(localStorage.getItem(CAL_PREF_KEY));
    if (p?.v !== 1 || !['configurado', 'omitido'].includes(p.estado)) return null;
    const lista = x => Array.isArray(x) ? x.filter(v => typeof v === 'string').slice(0, 40) : [];
    const sitio = p.sitio?.id && p.sitio?.nombre ? { id: String(p.sitio.id), nombre: String(p.sitio.nombre) } : null;
    // Sin sitio no hay intereses locales (las guardadas antes podían tenerlos).
    const i = sitio ? p.intereses : null;
    return { v: 1, estado: p.estado, sitio,
      intereses: { cultura: lista(i?.cultura), otraCultura: i?.otraCultura === true, deporteLocal: i?.deporteLocal === true },
      competiciones: lista(p.competiciones).filter(c => CAL_MARCAS[c]) };
  } catch { return null; }
}
function calGuardarPreferencias(p){
  CALENDARIO.prefs = p;
  pintarIconosDeportes();
  try { localStorage.setItem(CAL_PREF_KEY, JSON.stringify(p)); return true; } catch { return false; }
}
// «Lo mío» de la agenda: los temas de mis intereses en mi sitio (con
// «otra:cultura» y el deporte local). Las competiciones que sigo, en Deportes.
const calTemasMios = p => [...p.intereses.cultura, ...(p.intereses.otraCultura ? ['otra:cultura'] : []), ...(p.intereses.deporteLocal ? ['deportes'] : [])];
function calVerLoMio(){
  const s = CALENDARIO, p = calPreferencias();
  if (p?.estado !== 'configurado' || !calTemasMios(p).length) return false;
  s.temas = new Set(calTemasMios(p)); s.mio = true;
  return true;
}
// La ciudad fija también la hora: la canaria en Canarias; si no, la del navegador.
function calElegirDonde(donde){
  const s = CALENDARIO, [, nivel, codigo = ''] = donde?.id.split(':') || [];
  const canarias = nivel === 'autonomia' ? codigo === '05' : ['35', '38'].includes(codigo.slice(0, 2));
  s.donde = donde;
  s.zona = canarias ? 'Atlantic/Canary' : donde ? 'Europe/Madrid' : CAL_ZONAS.includes(CAL_ZONA) ? CAL_ZONA : 'Europe/Madrid';
}
// Ciudad por defecto: la provincia del primer sitio de «Mis sitios» (el
// tiempo), una vez por sesión; quitarla deja toda la agenda.
function calDondePorDefecto(){
  const s = CALENDARIO;
  if (s.dondeAuto) return;
  s.dondeAuto = true;
  // Configurado con el asistente: su sitio (o ninguno) y «Lo mío».
  const p = calPreferencias();
  if (p?.estado === 'configurado'){
    if (!s.donde) calElegirDonde(p.sitio);
    return;
  }
  const ine = sitiosTiempo().find(x => x.lugar?.ine)?.lugar.ine;
  const provincia = ine && ADMINISTRACION.provincias.find(([c]) => c === String(ine).padStart(5, '0').slice(0, 2));
  if (provincia && !s.donde) calElegirDonde({ id: 'es:provincia:' + provincia[0], nombre: provincia[1] });
}
// La identidad de la consulta son sus prefijos de agenda: editar el texto o
// añadir otros servicios (tiempo, consultas) conserva filtros y apertura.
function actualizarConsultaCalendario(orden){
  if (!CALENDARIO_ACTIVO) return;
  const s = CALENDARIO, clave = JSON.stringify(orden && [orden.ambitos, orden.circuitos, orden.tipos, orden.desconocidos]);
  const fecha = calFechasConsulta(orden?.resto).desde || '';
  if (fecha !== s.desdeConsulta){ s.desdeConsulta = fecha; s.fecha = fechaValida(fecha) ? fecha : calHoy(); }
  // La orden va antes que las preferencias: un prefijo no hereda «Lo mío».
  s.orden = orden;
  pintarIconosDeportes();
  if (clave !== s.clave){
    s.clave = clave; calLimpiarFiltros();
    // Un prefijo de agenda abre la vista completa y, al quitarlo, la cierra;
    // cerrada a mano, sigue cerrada mientras no cambie la consulta. El sitio
    // (y con él la zona) se aplica antes de calcular «hoy».
    if (calPideAgenda(orden)){
      if (!s.abierto){ s.origen = document.getElementById('buscar'); s.scroll = window.scrollY; s.abierto = s.porPrefijo = true; calDondePorDefecto(); }
      calEntrarVista(calVistaDe(orden));
    } else if (s.porPrefijo) s.abierto = s.porPrefijo = false;
    // Abierta desde su botón, la vista repone lo suyo (las capas de Deportes, «Lo mío»).
    else if (s.abierto) calEntrarVista(s.vista);
    s.fecha = fechaValida(fecha) ? fecha : calHoy();
  }
  if (s.abierto) return void cargarCalendario();
  pintarCalendario();
}
// Un prefijo de competición es de Deportes; el resto, de la agenda.
const calEsDeportiva = o => Boolean(o?.circuitos.length || o?.ambitos.some(a => AMBITOS[a]?.codigo));
const calVistaDe = o => calEsDeportiva(o) ? 'deportes' : 'agenda';
// Una orden con competiciones y temas a la vez («f1: teatro:») no se resuelve
// en silencio: se pregunta qué parte ver (cada vista toma solo lo suyo).
const calMixta = () => { const o = calPideAgenda(CALENDARIO.orden) && CALENDARIO.orden;
  return Boolean(o) && calEsDeportiva(o) && o.ambitos.some(a => !AMBITOS[a]?.codigo); };
// La agenda es siempre de un sitio: sin él no se consulta, se pide (P05).
const calSinSitio = () => !calModoDeportes() && !CALENDARIO.donde;
// Deportes con un prefijo de competición manda el prefijo: solo esas, sin capas.
const calPrefijoDeportivo = () => calPideAgenda(CALENDARIO.orden) && calVistaDe(CALENDARIO.orden) === 'deportes';
// Cada vista con lo suyo: Deportes abre el mes con sus capas (las que sigo o
// todas); la agenda, la semana y, sin prefijo, «Lo mío». Al cambiar de vista
// no queda nada de la anterior: ni sus datos, ni sus peticiones, ni lo abierto.
function calEntrarVista(vista){
  const s = CALENDARIO;
  if (s.vista !== vista){
    calCortarCargas();
    s.resumen = null; s.barras = []; s.vigente = s.consulta = ''; s.dias.clear(); s.pendientes = null; s.cargando = false; s.error = '';
  }
  s.vista = vista; s.mesAbierto = vista === 'deportes';
  if (vista === 'deportes'){ s.capas = null; if (!calPrefijoDeportivo()) calEntrarDeportes(); }
  else if (!calPideAgenda(s.orden)) calVerLoMio();
}
function abrirCalendario(origen = null, vista = 'agenda'){
  if (!CALENDARIO_ACTIVO) return;
  const s = CALENDARIO;
  // El botón de la otra vista no hereda sus prefijos: se quitan del buscador.
  if (calPideAgenda(s.orden) && calVistaDe(s.orden) !== vista) calQuitarPrefijos();
  // Cada entrada empieza hoy (en la zona del sitio), sin los filtros de la
  // anterior; el pasado se visita navegando.
  cerrarEstadisticas(false);
  calDondePorDefecto();
  if (!s.abierto || s.vista !== vista){
    // Al cerrar, el foco vuelve al botón de la vista en la que se estaba.
    if (!s.abierto){ s.origen = origen || document.activeElement; s.scroll = window.scrollY; }
    else if (origen) s.origen = origen;
    calElegirDia(calHoy()); calLimpiarFiltros(); calEntrarVista(vista);
  }
  s.abierto = true; s.porPrefijo = false;
  // Tras un rato cerrado, la publicación del día pudo cambiar.
  cargarCalendario(Date.now() - s.cargado > 10 * 60000);
  requestAnimationFrame(() => {
    document.getElementById('cal-titulo')?.focus({ preventScroll: true });
    document.getElementById('calendario-panel')?.scrollIntoView({ block: 'start' });
  });
}
// Cerrar corta todo lo que estaba en curso; lo cortado queda sin cargar para
// volver a pedirlo al entrar. El borrador del asistente no sobrevive al cierre.
function calCortarCargas(){
  const s = CALENDARIO;
  for (const c of [s.controller, s.controllerMes, s.controllerTemporada, s.detalleLista, s.asistente?.controller]) c?.abort();
  if (s.cargando){ s.cargando = false; s.consulta = ''; }
  if (s.mes?.cargando) s.mes = null;
  if (s.temporada && !s.temporada.eventos) s.temporada = null;
  if (s.pendientes?.cargando) s.pendientes = null;
  for (const [k, l] of s.dias) if (l.cargando) s.dias.delete(k);
  if (s.desplegado && s.detalles.get(s.desplegado.split('~').at(-1)) === undefined) s.desplegado = '';
}
function cerrarCalendario(volver = true){
  const s = CALENDARIO;
  if (!s.abierto) return;
  calCortarCargas(); s.asistente = null;
  s.abierto = s.porPrefijo = false; pintarCalendario();
  if (!volver) return;
  const origen = s.origen?.isConnected ? s.origen : document.getElementById(calModoDeportes() ? 'btn-deportes' : 'btn-calendario');
  const menu = origen?.closest?.('#cab-menu');
  (menu && !menu.open ? menu.querySelector('summary') : origen)?.focus({ preventScroll: true });
  window.scrollTo({ top: s.scroll, behavior: 'auto' });
}
// Salir de la vista: con una agenda que admite noticias quedan sus noticias;
// si no, se quitan sus prefijos del buscador (como al cerrar el tiempo) para
// no dejar un feed vacío por construcción.
function salirCalendario(){
  const s = CALENDARIO;
  if (!s.orden || s.orden.noticias) return cerrarCalendario();
  cerrarCalendario();
  calQuitarPrefijos();
}
// Quita del buscador los prefijos de agenda (o solo los que diga `quitar`).
function calQuitarPrefijos(quitar = () => true){
  const input = document.getElementById('buscar');
  const { antes, consulta } = partirConsulta(input.value);
  const fuera = tk => { const o = tk.prefix && leerConsultaCalendario(tk.raw); return Boolean(o) && quitar(o); };
  input.value = [tokenizeQuery(antes).filter(tk => !fuera(tk)).map(tk => tk.raw).join(' '), consulta]
    .filter(Boolean).join(' ');
  aplicarFiltros();
}
function calHora(e, conFecha = false){
  const c = e.programacion?.valor?.cuando;
  const a = extremoVisible(c?.inicio, CALENDARIO.zona), b = extremoVisible(c?.fin, CALENDARIO.zona);
  if (!a.fecha) return c?.restricciones_pendientes ? t('calHorarioRevisar') : t('calFechaPendiente');
  if (e.programacion?.valor?.modalidad === 'intervalo') return calFecha(a.fecha)
    + (b.fecha ? ' → ' + calFecha(b.fecha) : '') + ' · ' + t('calPeriodo');
  // GP o torneo de varios días sin hora: su intervalo, no una cita sin hora.
  if (!a.hora && b.fecha && b.fecha !== a.fecha) return calFecha(a.fecha) + ' → ' + calFecha(b.fecha)
    + (c.fin_exclusivo ? ' · ' + t('calFinExclusivo') : '');
  let s = (conFecha ? calFecha(a.fecha) + ' · ' : '') + (a.hora || t('calSinHora'));
  if (a.hora && a.sinZona) s += ' · ' + t('calSinZona');
  if (b.fecha) s += ' → ' + (conFecha && b.fecha === a.fecha && b.hora ? b.hora : calFecha(b.fecha) + (b.hora ? ' ' + b.hora : ''))
    + (c.fin_exclusivo ? ' · ' + t('calFinExclusivo') : '');
  return s;
}
// La tarjeta trae el lugar compacto; el detalle, la selección con su valor.
// Las fuentes deportivas a veces lo mandan en mayúsculas («BEIJING»).
const calLugarValor = e => { const l = e?.lugar; return l && typeof l === 'object' && 'valor' in l ? l.valor : l; };
const calLugarPartes = v => !v ? [] : typeof v === 'string' ? [v] : [v.nombre || v.fullName || v.displayName,
  v.municipio_literal || v.municipio || v.address?.city];
function calLugar(e){
  return [...new Set(calLugarPartes(calLugarValor(e)).filter(Boolean).map(enMinusculas))].join(' · ');
}
// Nombre del evento sin patrocinio ni la ciudad repetida, traducido si es un GP.
const calNombreEvento = e => calNombre({ nombres: nombresEvento(e?.nombres, calLugarPartes(calLugarValor(e))) || e?.nombres });
// Fuente: su nombre enlaza a la ficha original; luego, comprobación y licencia.
function calFuentes(e){
  const m = CALENDARIO.meta, vistas = new Set();
  return e.fuentes.filter(f => { const k = f.fuente + '/' + f.url; if (vistas.has(k)) return false; vistas.add(k); return true; })
    .map(f => {
      const fuente = m?.fuentes?.[f.fuente];
      const comprobado = f.comprobado || m?.cobertura?.find(c => c.fuente === f.fuente)?.comprobado;
      return `<p class="cal-nota">${calEsc(t('calFuente'))}: ${calEnlace(f.url || fuente?.url, fuente?.atribucion || fuente?.nombre || f.fuente)}
        ${comprobado ? ' · ' + calEsc(t('calComprobado', { fecha: calFormato({ dateStyle: 'short', timeStyle: 'short', timeZone: CALENDARIO.zona }).format(new Date(comprobado)) })) : ''}
        ${fuente?.licencia ? ' · ' + calEnlace(fuente.licencia_url, fuente.licencia) : ''}</p>`;
    }).join('');
}
// Detalle completo, en el diálogo y todo a la vista: cuándo, dónde, programa,
// participantes y fuente (sin desplegables que repitan lo mismo).
function calEvento(e){
  return `<article class="cal-evento"><h3>${calEsc(calNombreEvento(e))}</h3>${calEtiquetasDeportes(e)}${calEventoCuerpo(e)}</article>`;
}
// Sesión de un GP: por su código («Libres 1», «Carrera»); si no se conoce, su
// nombre sin el prefijo exacto del GP, que ya va en el título.
function calNombreSesion(p, e){
  const traducida = nombresSesion(p.agenda?.tipo_sesion ?? p.tipo_sesion);
  if (traducida) return calNombre({ nombres: traducida });
  const nombre = calNombre(p), padre = calNombre(e).trim();
  if (!nombre.startsWith(padre)) return nombre;
  const resto = nombre.slice(padre.length), separador = resto.match(/^\s+[—–-]\s+|^\s*:\s+/);
  return separador ? resto.slice(separador[0].length).trim() || nombre : nombre;
}
// Cuerpo del detalle; desplegado en la lista, sin el lugar si la tarjeta ya lo dice.
function calEventoCuerpo(e, lugarVisto = ''){
  const v = e.programacion?.valor, estado = v?.programacion;
  const aviso = e.programacion?.conflicto || e.lugar?.conflicto;
  const lugar = calLugar(e);
  const avisoEstado = estado === 'cancelado' || estado === 'aplazado' ? `<p class="cal-aviso">${calEsc(t(estado === 'cancelado' ? 'calCancelado' : 'calAplazado'))}</p>` : '';
  const horario = v?.cuando?.horario_textual, ejecucion = v?.ejecucion;
  const textoHorario = typeof horario === 'string' ? horario : horario?.[ACCES.lang] || horario?.es || Object.values(horario || {})[0];
  const dias = v?.cuando?.dias_semana?.map(d => calFecha(sumarDiasCalendario('2026-10-19', d), { weekday: 'short', day: undefined, month: undefined })).join(', ');
  return `<p class="cal-cuando">${calEsc(calHora(e))}</p>${lugar && lugar !== lugarVisto ? `<p>${calEsc(lugar)}</p>` : ''}
    ${textoHorario || dias ? `<p class="cal-nota">${calEsc([dias, textoHorario].filter(Boolean).join(' · '))}</p>` : ''}
    ${avisoEstado}
    ${ejecucion === 'en_curso' || ejecucion === 'terminado' ? `<p class="cal-nota">${calEsc(t(ejecucion === 'en_curso' ? 'calEnCurso' : 'calTerminado'))}</p>` : ''}
    ${aviso ? `<p class="cal-aviso">${calEsc(t('calConflicto'))}</p>` : ''}
    ${e.programa?.length ? `<section class="cal-programa"><h4>${calEsc(t('calPrograma'))}</h4><ul>${e.programa.map(p => {
      const anulada = calEstadoAnulado(p.programacion?.valor?.programacion);
      return `<li${anulada ? ' class="cal-anulada"' : ''}><span>${calEsc(calNombreSesion(p, e))}</span> <span class="cal-cuando">${calEsc(calHora(p, true))}</span>${anulada ? ` · ${calEsc(t(anulada))}` : ''}</li>`;
    }).join('')}</ul></section>` : ''}
    ${e.participaciones?.length ? `<ul class="cal-participantes">${e.participaciones.map(p => `<li>${calEsc(p.literal)}</li>`).join('')}</ul>` : ''}
    <footer class="cal-evento-fuente">${calFuentes(e)}
    ${(e.enlaces || []).filter(url => !e.fuentes.some(f => f.url === url)).map(url => `<p class="cal-nota">${calEnlace(url, t('calVerOriginal'))}</p>`).join('')}</footer>`;
}
async function abrirEventoCalendario(id){
  const s = CALENDARIO, dialogo = document.getElementById('cal-evento-dialogo');
  const cerrar = `<form method="dialog"><button autofocus>${calEsc(t('calCerrar'))}</button></form>`;
  dialogo.innerHTML = cerrar + `<p class="cal-estado" role="status">${calEsc(t('calCargando'))}</p>`;
  dialogo.removeAttribute('aria-labelledby'); dialogo.setAttribute('aria-label', t('calTitulo'));
  if (!dialogo.open) dialogo.showModal();
  s.detalle?.abort();
  const controller = s.detalle = new AbortController();
  dialogo.addEventListener('close', () => controller.abort(), { once: true });
  try {
    const d = await calPedir('eventos/' + encodeURIComponent(id), {}, controller.signal);
    calAnotar(d);
    dialogo.innerHTML = cerrar + calEvento(d.evento);
    dialogo.querySelector('h3').id = 'cal-evento-titulo';
    dialogo.removeAttribute('aria-label'); dialogo.setAttribute('aria-labelledby', 'cal-evento-titulo');
  } catch {
    if (controller.signal.aborted) return;
    dialogo.innerHTML = cerrar + `<p class="cal-aviso" role="status">${calEsc(t('calError'))}</p>`;
  }
  dialogo.querySelector('form button')?.focus();
}
// Hora de la columna: no la llevan lo prolongado ni los programas (su inicio
// puede ser de otro día).
// Las muestras de chips traen su hora de ese día (la de la sesión, en un GP).
const calHoraCita = e => 'hora_muestra' in e ? e.hora_muestra || '' : ['prolongada', 'programa'].includes(calPresentacion(e)) ? ''
  : extremoVisible(e.programacion?.valor?.cuando?.inicio, CALENDARIO.zona).hora || '';
// Tarjeta de la lista: la hora en su columna; título, lugar y tipo de plan con
// precio. Lo prolongado lleva sus fechas en vez de hora.
// Desplegar un evento en la lista (agenda de Google Calendar): su detalle va
// bajo la tarjeta, sin diálogo; la ficha se pide una vez por evento. La clave
// distingue cada función (ocurrencia) y la fila «todo el día» de su carrera.
const calClaveDesplegable = (dia, e, barra = false) => [dia || '', barra ? '*' : e.ocurrencia || '', e.id].join('~');
const calIdDesplegado = clave => 'cal-det-' + clave.replace(/[^\w-]/g, '_');
function calTituloDesplegable(e, dia, barra = false, nombre = calNombreEvento(e)){
  const clave = calClaveDesplegable(dia, e, barra), abierto = CALENDARIO.desplegado === clave;
  return calBoton('desplegar', nombre, clave, `data-id="${calEsc(e.id)}" aria-expanded="${abierto}"${abierto ? ` aria-controls="${calIdDesplegado(clave)}"` : ''}`);
}
function calDesplegado(e, dia, barra = false){
  const s = CALENDARIO, clave = calClaveDesplegable(dia, e, barra);
  if (s.desplegado !== clave) return '';
  const d = s.detalles.get(e.id);
  return `<div class="cal-desplegado" id="${calIdDesplegado(clave)}">${d ? calEventoCuerpo(d, calLugar(e))
    : d === null ? `<p class="cal-aviso">${calEsc(t('calError'))}</p>` : `<p class="cal-nota">${calEsc(t('calCargando'))}</p>`}</div>`;
}
// Con su propio controlador: el diálogo del mes no corta la carga de la lista.
async function desplegarEventoCalendario(clave, id){
  const s = CALENDARIO;
  s.desplegado = s.desplegado === clave ? '' : clave;
  s.detalleLista?.abort();
  if (!s.desplegado || s.detalles.get(id)) return void pintarCalendario();
  s.detalles.delete(id); pintarCalendario();
  const controller = s.detalleLista = new AbortController();
  try {
    const d = await calPedir('eventos/' + encodeURIComponent(id), {}, controller.signal);
    calAnotar(d); s.detalles.set(id, d.evento);
  } catch {
    if (controller.signal.aborted) return;
    s.detalles.set(id, null);
  }
  pintarCalendario();
}
// Cancelado o aplazado: visible en su sitio, apagado y sin contar (SofaScore).
const calEstadoAnulado = estado => estado === 'cancelado' || estado === 'aplazado' ? (estado === 'cancelado' ? 'calCancelado' : 'calAplazado') : '';
// La lista conserva la competición aunque sus filtros queden fuera de la pantalla.
function calEtiquetasDeportes(e){
  const competiciones = [...new Set(e.competiciones || [])];
  return competiciones.length ? `<p class="cal-etiquetas">${competiciones.map(c =>
    `<span class="cal-etiqueta ${calColor({ competiciones: [c], categoria: 'deportes' })}">${calEsc(calNombreCompeticion(c))}</span>`).join('')}</p>` : '';
}
function calCita(e, dia = ''){
  // Un chip de sesión trae su propio estado; si no, el del evento.
  const v = e.programacion?.valor, anulado = calEstadoAnulado(e.estado || v?.programacion);
  const prolongada = calPresentacion(e) === 'prolongada', hora = calHoraCita(e);
  const lugar = calLugar(e);
  const plan = [...(e.formatos || []).map(calNombreFormato), e.precio && CAL_PRECIOS[e.precio] ? t(CAL_PRECIOS[e.precio]) : '',
    e.tiene_programa ? '▸ ' + t('calPrograma') : ''].filter(Boolean).join(' · ');
  // Una sesión o función lleva encima el GP o programa al que pertenece, si su nombre no lo dice ya.
  const padre = e.padre ? calNombreEvento({ nombres: e.padre, lugar: e.lugar }) : '';
  const titulo = e.padre ? calNombreSesion(e, { nombres: e.padre }) : calNombreEvento(e);
  return `<article class="cal-cita${anulado ? ' cal-anulada' : ''}"><span class="cal-hora">${calEsc(hora)}</span><div class="cal-cita-cuerpo">
    ${padre && !titulo.includes(calNombre({ nombres: e.padre })) ? `<p class="cal-nota cal-padre">${calEsc(padre)}</p>` : ''}
    <h3>${calTituloDesplegable(e, dia, false, titulo)}</h3>
    ${calEtiquetasDeportes(e)}
    ${prolongada ? `<p class="cal-cuando">${calEsc(calHora(e))}</p>` : ''}${lugar ? `<p class="cal-nota">${calEsc(lugar)}</p>` : ''}
    ${plan ? `<p class="cal-plan">${calEsc(plan)}</p>` : ''}
    ${anulado ? `<p class="cal-aviso">${calEsc(t(anulado))}</p>` : ''}${calDesplegado(e, dia)}</div></article>`;
}
// Citas de un día: primero con hora (así llegan de la API) y después, bajo su
// rótulo, las que no la tienen y los programas.
function calCitas(eventos, dia){
  let rotulo = false;
  return eventos.map(e => {
    const sinHora = !rotulo && calPresentacion(e) !== 'prolongada' && !calHoraCita(e);
    if (sinHora) rotulo = true;
    return (sinHora ? `<p class="cal-sin-hora">${calEsc(t('calSinHora'))}</p>` : '') + calCita(e, dia);
  }).join('');
}
const calDiaLargo = dia => calFecha(dia, { weekday: 'long', month: 'long' });
// Citas de un día: sus chips (cada función o carrera cuenta) o, en lecturas sin
// ellos o pedidas sin muestras, los eventos.
const calNDia = d => d.chips ?? d.citas + d.programas;
function calCuentas(d){
  return [calN('calNCitas', calNDia(d)), d.en_curso ? t('calNEnCurso', { n: d.en_curso }) : ''].filter(Boolean).join(' · ');
}
const calCategoria = c => CAL_CATEGORIAS.includes(c) ? c : 'otras';
// Categorías con algo ese día, para los puntos. Lo prolongado de cultura
// (exposiciones, ciclos) está casi todos los días y taparía lo demás: allí
// solo cuentan citas y programas; en el resto, también lo que está en curso
// (un GP o un torneo).
function calPuntos(d){
  const hay = new Set();
  for (const [c, n] of Object.entries(d?.categorias || {})){
    if (n.citas + n.programas > 0 || (calCategoria(c) !== 'cultura' && n.en_curso > 0)) hay.add(calCategoria(c));
  }
  return [...CAL_CATEGORIAS, 'otras'].filter(c => hay.has(c));
}
// En Deportes el mes enseña competiciones: «NBA 9» (partidos) o «F1» (GP,
// torneo), con el color de su deporte; tres como mucho y «+N». Con una sola
// capa, la suya va primero.
const calModoDeportes = () => CALENDARIO.vista === 'deportes';
const calUnica = () => CALENDARIO.capas?.size === 1 ? [...CALENDARIO.capas][0] : '';
function calMarcas(d, orden = Object.keys(CAL_MARCAS)){
  const unica = calUnica();
  const hay = Object.entries(d?.competiciones || {}).filter(([c, n]) => CAL_MARCAS[c] && n.citas + n.programas + n.en_curso > 0)
    .sort(([a], [b]) => (b === unica) - (a === unica) || orden.indexOf(a) - orden.indexOf(b));
  return hay.map(([c, n]) => ({ c, texto: CAL_MARCAS[c] + (n.citas > 1 ? ' ' + n.citas : ''),
    nombre: calNombreCompeticion(c) + (n.citas ? ' · ' + calN('calNPartidos', n.citas) : '') }));
}
const CAL_MARCAS_DIA = 3;
const calMarcasHtml = marcas => marcas.length ? `<span class="cal-marcas" aria-hidden="true">${marcas.slice(0, CAL_MARCAS_DIA).map(m => `<span class="cal-marca cal-dep cal-dep-${CAL_DEPORTE_DE[m.c]}">${calEsc(m.texto)}</span>`).join('')}
  ${marcas.length > CAL_MARCAS_DIA ? `<span class="cal-marca cal-mas">+${marcas.length - CAL_MARCAS_DIA}</span>` : ''}</span>` : '';
const calNombreCompeticion = c => AMBITOS[c]?.noticias?.[0] || c;
const calPuntosHtml = cats => cats.length ? `<span class="cal-puntos" aria-hidden="true">${cats.map(c => `<span class="cal-punto cal-cat-${c}"></span>`).join('')}</span>` : '';
const calNombreCategoria = c => c === 'otras' ? t('calOtras') : calNombre(CALENDARIO.meta?.catalogo?.conceptos?.[c]);
// GP y programas de competición que siguen ese día: sus días sin carrera no
// tienen chip, así que van arriba como «todo el día» (Google, Apple).
const calBarrasDia = dia => (CALENDARIO.barras || []).filter(b => calPresentacion(b) === 'programa' && b.desde <= dia && dia < b.hasta);
function calBarraDia(b, dia){
  // Duración del programa (no de los tramos que tocan la ventana); sin fechas, nada.
  const v = b.programacion?.valor?.cuando, a = extremoVisible(v?.inicio, CALENDARIO.zona).fecha, z = extremoVisible(v?.fin, CALENDARIO.zona).fecha;
  const total = a && z ? calDiferencia(a, z) + 1 : 0, n = a ? calDiferencia(a, dia) + 1 : 0;
  return `<article class="cal-cita cal-todo-dia"><span class="cal-hora ${calColor(b)}">${calEsc(t('calTodoElDia'))}</span><div class="cal-cita-cuerpo">
    <h3>${calTituloDesplegable(b, dia, true)}</h3>
    ${calEtiquetasDeportes(b)}
    ${total > 1 && n >= 1 && n <= total ? `<p class="cal-nota">${calEsc(t('calDiaDeN', { n, total }))}</p>` : ''}${calDesplegado(b, dia, true)}</div></article>`;
}
// En Deportes el día va por deporte (FlashScore, SofaScore): cada grupo con
// las cuentas de sus competiciones (del resumen, sin pedir nada) y, abierto,
// sus citas por hora. Abierto de entrada si lleva algo que sigo o pocas citas;
// lo que se abre o cierra a mano vale para todos los días y se recuerda en el
// dispositivo. El día entero llega en una petición al verlo (calObservarDias).
const CAL_GRUPOS_KEY = 'voceiro-calendario-grupos-v1', CAL_GRUPO_POCOS = 4;
function calGrupos(){
  const s = CALENDARIO;
  if (!s.grupos){
    let g = null;
    try { g = JSON.parse(localStorage.getItem(CAL_GRUPOS_KEY)); } catch {}
    s.grupos = Object.fromEntries(Object.entries(g && typeof g === 'object' ? g : {}).filter(([, v]) => typeof v === 'boolean'));
  }
  return s.grupos;
}
function calElegirGrupo(k, abierto){
  const g = calGrupos();
  g[k] = abierto;
  try { localStorage.setItem(CAL_GRUPOS_KEY, JSON.stringify(g)); } catch {}
}
function calDiaDeportes(d){
  const s = CALENDARIO, l = s.dias.get(d.dia + '|citas'), cargada = Boolean(l?.cargada), elegidos = calGrupos();
  const sigo = new Set(calPreferencias()?.competiciones || []), sigoEn = k => (CAL_DEPORTES[k] || []).some(c => sigo.has(c));
  const deDeporte = e => calDeporte(e) || 'otras', barras = calBarrasDia(d.dia), eventos = cargada ? l.eventos : [];
  // Primero los deportes de lo que sigo; después, en su orden de siempre.
  const orden = [...Object.keys(CAL_DEPORTES), 'otras'].sort((a, b) => sigoEn(b) - sigoEn(a));
  const grupos = orden.map(k => {
    const comps = (CAL_DEPORTES[k] || []).filter(c => d.competiciones?.[c]?.citas + d.competiciones?.[c]?.programas > 0);
    const propias = eventos.filter(e => deDeporte(e) === k), suyas = barras.filter(b => deDeporte(b) === k);
    if (!comps.length && !propias.length && !suyas.length) return '';
    const total = comps.reduce((n, c) => n + d.competiciones[c].citas + d.competiciones[c].programas, 0);
    const abierto = elegidos[k] ?? (sigoEn(k) || total <= CAL_GRUPO_POCOS);
    const cuentas = comps.map(c => calNombreCompeticion(c) + (d.competiciones[c].citas ? ' ' + d.competiciones[c].citas : '')).join(' · ');
    // Con una sola competición, su etiqueta en cada cita sobra.
    const una = new Set([...comps, ...[...propias, ...suyas].flatMap(e => e.competiciones || [])]).size <= 1;
    const id = `cal-grupo-${d.dia}-${k}`, nombre = k === 'otras' ? t('calOtras') : t(CAL_NOMBRES_DEPORTE[k]);
    return `<div class="cal-grupo cal-dep-${k}${una ? ' cal-grupo-una' : ''}"><button type="button" class="cal-grupo-cab" data-cal="grupo" data-valor="${d.dia}|${k}" data-abierto="${abierto}" aria-expanded="${abierto}"${abierto ? ` aria-controls="${id}"` : ''}>
      <span class="cal-grupo-nombre">${abierto ? '▾' : '▸'} ${calEsc(nombre)}</span> <span class="cal-grupo-cuentas">${calEsc(cuentas)}</span></button>
      ${abierto ? `<div id="${id}">${suyas.map(b => calBarraDia(b, d.dia)).join('')}${cargada ? calCitas(propias, d.dia) : `<p class="cal-nota">${calEsc(t('calCargando'))}</p>`}</div>` : ''}</div>`;
  }).join('');
  const mas = cargada && l.siguiente ? `<div class="cal-paginacion">${calBoton('mas-dia', t('calCargarMas'), d.dia, l.cargando ? 'disabled' : '')}</div>` : '';
  const hoy = calHoy();
  // data-cargar: días sin pedir todavía; un fallo no se reintenta solo (se reintenta al abrir un grupo).
  return `<section class="cal-dia${d.dia < hoy ? ' cal-pasado' : ''}" id="cal-dia-${d.dia}"${l ? '' : ` data-cargar="${d.dia}"`}><h2>${calEsc(d.dia === hoy ? t('calHoy') + ' · ' + calFecha(d.dia, { weekday: 'long' }) : calDiaLargo(d.dia))}
    <small>${calEsc(calN('calNCitas', calNDia(d)))}${d.dia < hoy ? ' · ' + calEsc(t('calPasado')) : ''}</small></h2>${grupos}${mas}</section>`;
}
// Deportes carga cada día al verlo: sus grupos se rellenan sin pedir la semana
// de golpe. Sin observador, solo el primero.
function calObservarDias(p){
  const s = CALENDARIO;
  s.observador?.disconnect(); s.observador = null;
  const pendientes = calModoDeportes() ? [...p.querySelectorAll('.cal-dia[data-cargar]')] : [];
  if (!pendientes.length) return;
  if (typeof IntersectionObserver !== 'function') return void abrirDiaCalendario(pendientes[0].dataset.cargar, 'citas');
  s.observador = new IntersectionObserver(entradas => {
    for (const x of entradas) if (x.isIntersecting) abrirDiaCalendario(x.target.dataset.cargar, 'citas');
  }, { rootMargin: '200px 0px' });
  pendientes.forEach(x => s.observador.observe(x));
}
// Un día de la lista: sus muestras y «Ver las N citas»; abierta, todas.
function calDiaLista(d){
  if (calModoDeportes()) return calDiaDeportes(d);
  const s = CALENDARIO, l = s.dias.get(d.dia + '|citas'), citas = calNDia(d);
  let cuerpo;
  if (l?.abierta && l.cargada){
    cuerpo = calCitas(l.eventos, d.dia) + `<div class="cal-paginacion">${l.siguiente ? calBoton('mas-dia', t('calCargarMas'), d.dia, l.cargando ? 'disabled' : '') : ''}
      ${calBoton('ocultar-dia', t('calOcultar'), d.dia)}</div>`;
  } else {
    cuerpo = calCitas(d.muestras, d.dia) + (citas > d.muestras.length
      ? `<div class="cal-paginacion">${calBoton('ver-dia', t('calVerCitas', { n: citas, dia: calFecha(d.dia, { weekday: 'long', day: undefined, month: undefined }) }), d.dia, l?.cargando ? 'disabled' : '')}</div>` : '');
  }
  cuerpo = calBarrasDia(d.dia).map(b => calBarraDia(b, d.dia)).join('') + cuerpo;
  const hoy = calHoy();
  return `<section class="cal-dia${d.dia < hoy ? ' cal-pasado' : ''}" id="cal-dia-${d.dia}"><h2>${calEsc(d.dia === hoy ? t('calHoy') + ' · ' + calFecha(d.dia, { weekday: 'long' }) : calDiaLargo(d.dia))}
    <small>${calEsc(calN('calNCitas', citas))}${d.dia < hoy ? ' · ' + calEsc(t('calPasado')) : ''}</small></h2>${cuerpo}</section>`;
}
// «En cartel» (Time Out): lo prolongado (exposiciones, ciclos, torneos) de todos
// los días que enseña la lista, plegado y aparte de las citas; lo que empieza
// después del primero, con su día de apertura. Una sola lista: «desde~hasta».
const calVentanaCartel = dias => dias.length ? dias[0].dia + '~' + sumarDiasCalendario(dias.at(-1).dia, 1) : '';
// Fechas de un evento de varios días: «24 oct.–1 nov.».
function calRango(e){
  const v = e.programacion?.valor?.cuando, a = extremoVisible(v?.inicio, CALENDARIO.zona).fecha, b = extremoVisible(v?.fin, CALENDARIO.zona).fecha;
  return a ? calFecha(a) + (b && b !== a ? '–' + calFecha(b) : '') : t('calFechaPendiente');
}
// En Deportes, torneos en curso (calendario de ESPN): una fila por torneo con
// su competición, sede y fechas; el detalle se despliega debajo.
function calFilaCurso(e){
  const lugar = calLugar(e);
  return `<article class="cal-curso-fila"><h3>${calTituloDesplegable(e, e.dia)}</h3><span class="cal-cuando">${calEsc(calRango(e))}</span>
    <p class="cal-nota">${(e.competiciones || []).map(c => `<span class="cal-etiqueta ${calColor({ competiciones: [c], categoria: 'deportes' })}">${calEsc(calNombreCompeticion(c))}</span> `).join('')}${calEsc(lugar)}</p>
    ${calDesplegado(e, e.dia)}</article>`;
}
function calEnCurso(dias){
  if (!dias.some(d => d.en_curso)) return '';
  const s = CALENDARIO, clave = calVentanaCartel(dias), l = s.dias.get(clave + '|curso'), abierta = Boolean(l?.abierta), deportes = calModoDeportes();
  // Cuántas el primer día; el resto del período se ve al abrirlo.
  const titulo = dias.length > 1 ? t(deportes ? 'calEnCursoPeriodo' : 'calEnCartelPeriodo') : t(deportes ? 'calEnCursoN' : 'calEnCartel', { n: dias[0].en_curso });
  return `<section class="cal-en-curso">${calBoton('curso', (abierta ? '▾ ' : '▸ ') + titulo, clave, `aria-expanded="${abierta}"`)}
    ${abierta && deportes ? (l.eventos || []).map(calFilaCurso).join('') : ''}
    ${abierta && !deportes ? `<p class="cal-nota">${calEsc(t('calProgramacionesNota'))}</p>${(l.eventos || []).map(e => (e.dia > dias[0].dia
      ? `<p class="cal-nota cal-abre">${calEsc(t('calAbre', { dia: calFecha(e.dia, { weekday: 'short' }) }))}</p>` : '') + calCita(e, e.dia)).join('')}` : ''}
    ${abierta && l.siguiente ? `<div class="cal-paginacion">${calBoton('mas-curso', t('calCargarMas'), clave, l.cargando ? 'disabled' : '')}</div>` : ''}</section>`;
}
// Días que enseña la lista: los del atajo o, sin él, desde el día elegido.
function calDiasLista(){
  const s = CALENDARIO, r = s.resumen || [];
  if (s.rango === 'finde'){
    const fin = ventanaCalendario(s.fecha, 'semana').slice(5);
    return r.filter(d => fin.includes(d.dia) && d.dia >= calHoy());
  }
  if (s.rango) return r.filter(d => d.dia === s.fecha);
  return r.filter(d => d.dia >= s.fecha);
}
function calLista(){
  const s = CALENDARIO;
  if (!s.resumen) return '';
  const dias = calDiasLista(), conCitas = dias.filter(d => calNDia(d) || calBarrasDia(d.dia).length);
  // Sin citas pero con algo en cartel, no es un período vacío.
  const vacio = !conCitas.length ? `<p class="cal-nota cal-vacio">${calEsc(t(dias.some(d => d.en_curso) ? (calModoDeportes() ? 'calSinCitasEnCurso' : 'calSinCitasEnCartel')
    : s.rango ? 'calDiaSinCitas' : 'calSinCitas'))}</p>` : '';
  const mas = !s.rango && s.semanas < CAL_SEMANAS_MAX ? `<div class="cal-paginacion">${calBoton('mas-semanas', t('calSemanaSiguiente'), '', s.cargando ? 'disabled' : '')}</div>` : '';
  return calEnCurso(dias) + conCitas.map(calDiaLista).join('') + vacio + mas;
}
// Una celda de la tira o del mes: inicial del día, número y puntos.
function calCeldaDia(dia, d, { otroMes = false, rodante = false } = {}){
  const s = CALENDARIO, hoy = calHoy(), deportes = calModoDeportes();
  const cats = deportes ? [] : calPuntos(d), marcas = deportes ? calMarcas(d) : [];
  const detalle = deportes ? marcas.map(m => m.nombre) : cats.map(calNombreCategoria);
  const etiqueta = `${calDiaLargo(dia)}: ${d ? calCuentas(d) : calN('calNCitas', 0)}${detalle.length ? ' · ' + detalle.join(', ') : ''}`;
  return `<button type="button" class="cal-celda${otroMes ? ' cal-otro-mes' : ''}${dia < hoy ? ' cal-pasado' : ''}" data-cal="dia" data-valor="${dia}"
    aria-pressed="${dia === s.fecha}"${dia === hoy ? ' aria-current="date"' : ''} aria-label="${calEsc(etiqueta)}">
    <span class="cal-num">${calEsc(calNumDia(dia, rodante))}</span>${deportes ? calMarcasHtml(marcas) : calPuntosHtml(cats)}</button>`;
}
// En el mes que empieza en esta semana, el día 1 lleva su mes («1 nov»).
const calNumDia = (dia, rodante = false) => calFecha(dia, rodante && dia.endsWith('-01') ? {} : { month: undefined });
const calCabeceraSemana = dias => dias.slice(0, 7).map(dia => `<abbr class="cal-semana-nombre" title="${calEsc(calFecha(dia, { weekday: 'long', day: undefined, month: undefined }))}">${calEsc(calFecha(dia, { weekday: 'narrow', day: undefined, month: undefined }))}</abbr>`).join('');
// Tira (Apple Calendar, SofaScore): la semana del día elegido; desplegada, el mes.
// Mes estilo Google Calendar cuando el panel deja sitio para títulos: en em,
// para que la letra grande de Aa cuente como un panel estrecho.
const CAL_MES_ANCHO_EM = 44;
const calMesAncho = () => (document.getElementById('calendario-panel')?.clientWidth || 0) >= CAL_MES_ANCHO_EM * calEm();
// Mes desplegado: bloques de CAL_SEMANAS_MES semanas alineados con la de hoy
// (vista «4 semanas» de Google Calendar): el primero empieza en la semana de hoy
// y ‹ › van de bloque en bloque, sin huecos ni semanas repetidas. Cuatro semanas
// caben en una ventana baja; el calendario no da resultados.
const CAL_SEMANAS_MES = 4;
function calPeriodoMes(fecha = CALENDARIO.fecha){
  const lunes = ventanaCalendario(calHoy(), 'semana')[0], n = CAL_SEMANAS_MES * 7;
  const inicio = sumarDiasCalendario(lunes, Math.floor(calDiferencia(lunes, fecha) / n) * n);
  return { dias: Array.from({ length: n }, (_, i) => sumarDiasCalendario(inicio, i)), rodante: true };
}
// Alto de cada semana (Google Calendar): el mes entero cabe en la ventana bajo
// la cabecera fija, la barra del calendario (medidas) y la fila de los días con
// los márgenes (≈ 4,5 líneas); lo que no cabe en un día va en «+N».
const calEm = () => parseFloat(globalThis.getComputedStyle?.(document.getElementById('calendario-panel'))?.fontSize) || 16;
function calAltoSemana(em = calEm()){
  const encima = (document.getElementById('barra-sup')?.offsetHeight || 0)
    + (document.getElementById('calendario-panel')?.querySelector?.('.cal-barra')?.offsetHeight || em * 3) + em * 4.5;
  return Math.round(Math.min(em * 10, Math.max(em * 4.5, ((window.innerHeight || 900) - encima) / CAL_SEMANAS_MES)));
}
// Deportes con una o dos competiciones: caben sus partidos en el mes (Google
// Calendar); con más, solo las marcas por competición.
const calPartidosEnMes = () => calModoDeportes() && CALENDARIO.capas?.size <= 2;
// Último día publicado de lo elegido en Deportes: las competiciones sin
// calendario completo se publican a unas dos semanas; las que lo tienen (F1,
// MotoGP) no ponen límite. Más allá, el mes no está vacío sino sin publicar.
function calPublicadoHasta(){
  const s = CALENDARIO, fines = [];
  for (const c of s.capas || []){
    const activas = (s.meta?.colecciones || []).filter(x => x.coleccion === c && x.estado === 'activa');
    if (!activas.length || activas.some(x => x.calendario_completo)) continue;
    const fin = activas.flatMap(x => x.unidades || []).map(u => u.fin).filter(Boolean).sort().at(-1);
    if (fin) fines.push(fin);
  }
  return fines.sort()[0] || '';
}
const calDiferencia = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
// Cada semana, una cuadrícula: el día es un botón con su número, el hueco de
// las barras y, en la agenda, hasta cuatro chips «hora título» (+N). En
// Deportes no caben los partidos (un sábado, diez competiciones y cuarenta
// partidos): cada día lleva sus marcas («NBA 12», «ATP»), todas, y la semana
// crece lo que haga falta. Solo el motor va en barra encima (un GP o rally a la
// vez); los torneos de tenis (varios a la vez, toda la temporada) son marcas.
function calMesTitulos(dias, rodante = false){
  const s = CALENDARIO, hoy = calHoy(), porDia = new Map((s.mes?.dias || []).map(d => [d.dia, d])), deportes = calModoDeportes();
  const barras = (s.mes?.barras || []).filter(b => b.competiciones?.some(c => CAL_DEPORTE_DE[c] === 'motor'));
  // Carril de 24 px como mínimo: barra de 22 con 1 px de margen arriba y abajo; las
  // barras quedan a 24 px una de otra (excepción de espaciado de AA, 2.5.8).
  const em = calEm(), alto = calAltoSemana(em), carril = Math.max(em * 1.3, 24), semanas = [];
  if (!deportes) s.altoSemana = alto;
  const partidos = deportes && calPartidosEnMes(), publicado = deportes ? calPublicadoHasta() : '';
  const sinPublicar = dia => Boolean(publicado) && dia > publicado;
  for (let i = 0; i < dias.length; i += 7) semanas.push(dias.slice(i, i + 7));
  return `<div class="cal-mg" role="group" aria-label="${calEsc(t('calMes'))}"><div class="cal-mg-cabecera">${calCabeceraSemana(dias)}</div>${semanas.map(semana => {
    const fin = sumarDiasCalendario(semana[6], 1), carriles = [];
    const colocadas = barras.filter(b => b.desde < fin && b.hasta > semana[0]).map(b => {
      const a = Math.max(0, calDiferencia(semana[0], b.desde)), z = Math.min(7, calDiferencia(semana[0], b.hasta));
      let n = carriles.findIndex(libre => libre <= a);
      if (n < 0) n = carriles.push(0) - 1;
      carriles[n] = z;
      return { b, a, z, carril: n };
    });
    const n = carriles.length;
    // Chips que caben bajo el número, las barras y la línea de «+N».
    const caben = Math.max(0, Math.floor((alto - em * (1.3 + 1.1) - carril * n - 6) / (em * 1.15)));
    const celdas = semana.map((dia, i) => {
      const d = porDia.get(dia);
      let contenido, detalle;
      if (deportes && partidos){
        // Una o dos competiciones: sus partidos, hasta cinco, y «+N»; lo que va en barra no se repite.
        const enBarra = new Set(colocadas.filter(x => x.a <= i && x.z > i).flatMap(x => x.b.competiciones || []));
        const muestras = (d?.muestras || []).filter(m => !(m.competiciones || []).some(c => enBarra.has(c)));
        const mas = Math.max(0, (d ? calNDia(d) : 0) - (d?.muestras || []).length);
        contenido = muestras.map(m => `<span class="cal-mg-chip ${calColor(m)}">${calHoraCita(m) ? `<b>${calEsc(calHoraCita(m))}</b> ` : ''}${calEsc(calNombreEvento(m))}</span>`).join('')
          + (mas ? `<span class="cal-mg-mas">${calEsc(t('calMasN', { n: mas }))}</span>` : '');
        detalle = muestras.map(m => calNombreEvento(m));
      } else if (deportes){
        // Lo que ya va en barra ese día no se repite como marca.
        const enBarra = new Set(colocadas.filter(x => x.a <= i && x.z > i).flatMap(x => x.b.competiciones || []));
        const marcas = calMarcas(d, CAL_COMPETICIONES).filter(m => !enBarra.has(m.c));
        contenido = marcas.length ? `<span class="cal-mg-marcas">${marcas.map(m => `<span class="cal-mg-marca cal-dep cal-dep-${CAL_DEPORTE_DE[m.c]}" title="${calEsc(m.nombre)}">${calEsc(m.texto)}</span>`).join('')}</span>` : '';
        detalle = calMarcas(d).map(m => m.nombre);
      } else {
        const muestras = (d?.muestras || []).slice(0, caben), mas = Math.max(0, (d?.chips ?? muestras.length) - muestras.length);
        contenido = muestras.map(m => {
          const titulo = calNombreEvento(m.padre ? { nombres: m.padre, lugar: m.lugar } : m), hora = calHoraCita(m);
          return `<span class="cal-mg-chip ${calColor(m)}">${hora ? `<b>${calEsc(hora)}</b> ` : ''}${calEsc(titulo)}</span>`;
        }).join('') + (mas ? `<span class="cal-mg-mas">${calEsc(t('calMasN', { n: mas }))}</span>` : '');
        detalle = muestras.map(m => calNombreEvento(m.padre ? { nombres: m.padre, lugar: m.lugar } : m));
      }
      const etiqueta = `${calDiaLargo(dia)}: ${sinPublicar(dia) && !d ? t('calSinPublicar') : d ? calCuentas(d) : calN('calNCitas', 0)}${detalle.length ? ' · ' + detalle.join(', ') : ''}`;
      return `<button type="button" class="cal-mg-dia${!rodante && dia.slice(0, 7) !== s.fecha.slice(0, 7) ? ' cal-otro-mes' : ''}${dia < hoy ? ' cal-pasado' : ''}${sinPublicar(dia) ? ' cal-sin-publicar' : ''}" style="grid-column:${i + 1}"
        data-cal="dia" data-valor="${dia}" aria-pressed="${dia === s.fecha}"${dia === hoy ? ' aria-current="date"' : ''} aria-label="${calEsc(etiqueta)}">
        <span class="cal-num">${calEsc(calNumDia(dia, rodante))}</span><span class="cal-mg-hueco" aria-hidden="true"></span>${contenido}</button>`;
    }).join('');
    const lineas = colocadas.map(({ b, a, z, carril: c }) => calBoton('evento', calNombreEvento(b), b.id,
      `class="cal-mg-barra ${calColor(b)}${b.desde < semana[a] ? ' sigue-antes' : ''}${b.hasta > sumarDiasCalendario(semana[z - 1], 1) ? ' sigue-despues' : ''}" style="grid-column:${a + 1}/${z + 1};grid-row:${c + 2}" aria-haspopup="dialog" title="${calEsc(calNombreEvento(b))}"`)).join('');
    return `<div class="cal-mg-semana" style="--carriles:${n};--carril:${carril}px${deportes ? '' : `;height:${alto}px`}">${celdas}${lineas}</div>`;
  }).join('')}</div>${dias.some(sinPublicar) ? `<p class="cal-nota cal-leyenda-sin-publicar">${calEsc(t('calSinPublicarNota'))}</p>` : ''}`;
}
function calTira(){
  const s = CALENDARIO, porDia = new Map([...(s.resumen || []), ...(s.mesAbierto ? s.mes?.dias || [] : [])].map(d => [d.dia, d]));
  const { dias: diasMes, rodante } = s.mesAbierto ? calPeriodoMes() : { dias: null, rodante: false };
  const dias = diasMes || ventanaCalendario(s.fecha, 'semana');
  const titulo = rodante ? calFecha(dias[0], { month: 'short', day: undefined }) + ' – ' + calFecha(dias.at(-1), { month: 'short', year: 'numeric', day: undefined })
    : calFecha(s.fecha, { month: 'long', year: 'numeric', day: undefined });
  const [ant, sig] = s.mesAbierto ? ['calMesAnterior', 'calMesSiguiente'] : ['calSemanaAnterior', 'calSemanaPosterior'];
  const nav = `<div class="cal-tira-cabecera">${calBoton('anterior', '‹', '', `aria-label="${calEsc(t(ant))}"`)}
    ${calBoton('mes', titulo + (s.mesAbierto ? ' ▴' : ' ▾'), '', `class="cal-tira-titulo" aria-expanded="${s.mesAbierto}"`)}${calBoton('siguiente', '›', '', `aria-label="${calEsc(t(sig))}"`)}</div>`;
  // Mes ancho (Google Calendar): ‹ mes › sube a la barra del calendario, en la
  // fila de los atajos, y deja el alto de la ventana a las semanas.
  const ancho = s.mesAbierto && calMesAncho();
  if (ancho) s.navEnBarra = nav;
  return `<div class="cal-tira">${ancho ? '' : nav}
    ${ancho ? calMesTitulos(dias, rodante) : `<div class="cal-mes" role="group" aria-label="${calEsc(t(s.mesAbierto ? 'calMes' : 'calSemana'))}">${calCabeceraSemana(dias)}${dias.map(dia =>
      calCeldaDia(dia, porDia.get(dia), { otroMes: s.mesAbierto && !rodante && dia.slice(0, 7) !== s.fecha.slice(0, 7), rodante })).join('')}</div>`}
    ${calModoDeportes() ? '' : `<p class="cal-leyenda">${[...CAL_CATEGORIAS, 'otras'].map(c => `<span><span class="cal-punto cal-cat-${c}" aria-hidden="true"></span>${calEsc(calNombreCategoria(c))}</span>`).join('')}</p>`}
    ${s.mesAbierto && calModoDeportes() ? calTemporada(diasMes, rodante) : ''}</div>`;
}
// Este mes en deportes (calendario de temporada de la app de F1, SofaScore):
// por competición, sus GP o torneos con fechas y los partidos publicados. Va
// plegado y se pide al abrirlo: abierto empujaba la lista una pantalla abajo.
// Con el mes que empieza en esta semana, el mismo período que la rejilla.
function calTemporada(periodo, rodante){
  const s = CALENDARIO, mes = s.fecha.slice(0, 7), abierta = s.temporadaAbierta;
  const nombre = rodante ? t('calProximasSemanas') : t('calEsteMes', { mes: calFecha(s.fecha, { month: 'long', day: undefined }) });
  const cabecera = calBoton('temporada', (abierta ? '▾ ' : '▸ ') + nombre, '', `class="cal-temporada-boton" aria-expanded="${abierta}"`);
  if (!abierta) return `<section class="cal-temporada">${cabecera}</section>`;
  const dias = (s.mes?.dias || []).filter(d => rodante ? periodo.includes(d.dia) : d.dia.slice(0, 7) === mes);
  const partidos = {};
  for (const d of dias) for (const [c, n] of Object.entries(d.competiciones || {})) partidos[c] = (partidos[c] || 0) + n.citas;
  const largos = {};
  for (const e of s.temporada?.eventos || []) for (const c of e.competiciones || []) (largos[c] ||= []).push(e);
  const parcial = c => s.meta?.colecciones?.some(x => x.coleccion === c && x.calendario_completo === false);
  const filas = Object.keys(CAL_MARCAS).filter(c => partidos[c] || largos[c]?.length).map(c => {
    const lista = largos[c] || [];
    return `<li class="cal-temporada-fila">${s.capas ? calBoton('solo', calNombreCompeticion(c), c, `aria-pressed="${calUnica() === c}"`) : `<b>${calEsc(calNombreCompeticion(c))}</b>`}
      ${partidos[c] ? `<span class="cal-nota">${calEsc(calN('calNPartidos', partidos[c]))}</span>` : ''}${parcial(c) ? `<span class="cal-nota">· ${calEsc(t('calParcial'))}</span>` : ''}
      ${lista.length ? `<ul>${lista.slice(0, 4).map(e => `<li>${calBoton('evento', calNombreEvento(e), e.id, 'aria-haspopup="dialog"')} <span class="cal-cuando">${calEsc(calRango(e))}</span></li>`).join('')}
        ${lista.length > 4 ? `<li class="cal-nota">${calEsc(t('calYMas', { n: lista.length - 4 }))}</li>` : ''}</ul>` : ''}</li>`;
  });
  return `<section class="cal-temporada">${cabecera}
    ${s.temporada?.error ? `<p class="cal-aviso">${calEsc(t('calError'))}</p>` : ''}
    ${filas.length ? `<ul>${filas.join('')}</ul>` : `<p class="cal-nota">${calEsc(s.temporada?.eventos ? t('calSinDeportes') : t('calCargando'))}</p>`}
    ${s.temporada?.parcial ? `<p class="cal-nota">${calEsc(t('calTemporadaParcial'))}</p>` : ''}</section>`;
}
function calPendientes(){
  const p = CALENDARIO.pendientes;
  if (!p) return `<div class="cal-pendientes">${calBoton('pendientes', t('calVerPendientes'))}</div>`;
  return `<section class="cal-pendientes"><h2>${calEsc(t('calSinFecha'))}</h2>
    ${p.eventos.map(e => calCita(e)).join('') || (p.cargando ? '' : `<p class="cal-nota">${calEsc(t('calNingunaPendiente'))}</p>`)}
    ${p.siguiente ? calBoton('mas-pendientes', t('calCargarMas'), '', p.cargando ? 'disabled' : '') : ''}</section>`;
}
// Dónde: comunidades, provincias y municipios del catálogo territorial común
// (los municipios, con la lista del tiempo).
function sugerirDonde(texto){
  const s = CALENDARIO, q = normalize(texto).trim();
  if (q.length < 2){ s.sugerencias.donde = []; return void pintarSugerencias('donde'); }
  if (!TIEMPO.indice) municipiosTiempo().then(() => { if (s.escrito.donde === texto) sugerirDonde(texto); }).catch(() => {});
  const casa = x => x.nombre.split('/').some(n => normalize(n).trim().startsWith(q));
  const fijos = [...ADMINISTRACION.regiones.map(([c, n]) => ({ id: 'es:autonomia:' + c, nombre: n, meta: t('calComunidad') })),
    ...ADMINISTRACION.provincias.map(([c, n]) => ({ id: 'es:provincia:' + c, nombre: n, meta: t('calProvincia') }))].filter(casa);
  const municipios = TIEMPO.indice ? sugerirMunicipios(TIEMPO.indice, texto, 6)
    .map(m => ({ id: 'es:municipio:' + m.ine, nombre: m.nombre, meta: provinciaDe(m.ine) })) : [];
  s.sugerencias.donde = [...fijos.slice(0, 3), ...municipios].slice(0, 8);
  pintarSugerencias('donde');
}
const calSugerenciasHtml = campo => CALENDARIO.sugerencias[campo].map(x => `<button type="button" data-cal="elegir-${campo}" data-valor="${calEsc(x.id)}" data-nombre="${calEsc(x.nombre)}">${calEsc(x.nombre)}${x.meta ? ` <small>${calEsc(x.meta)}</small>` : ''}</button>`).join('');
function pintarSugerencias(campo){
  const el = document.getElementById('cal-sug-' + campo);
  if (el) el.innerHTML = calSugerenciasHtml(campo);
}
// La ciudad, arriba (Time Out, Fever): su nombre abre el buscador de sitios.
function calDonde(){
  const s = CALENDARIO;
  // Sin «Toda España» ni quitar el sitio: se cambia por otro (la agenda es local).
  if (!s.editandoDonde) return `<div class="cal-donde">${calBoton('editar-donde', '📍 ' + (s.donde?.nombre || t('calEligeSitio')) + ' ▾', '', `class="cal-donde-nombre" aria-label="${calEsc(s.donde ? t('calCambiarSitio', { x: s.donde.nombre }) : t('calEligeSitio'))}"`)}</div>`;
  return `<div class="cal-donde cal-campo-sug"><label for="cal-donde" class="sr-only">${calEsc(t('calDonde'))}</label>
    <input id="cal-donde" type="search" autocomplete="off" value="${calEsc(s.escrito.donde)}" placeholder="${calEsc(t('calDondeEjemplo'))}" aria-controls="cal-sug-donde">
    <div id="cal-sug-donde" class="cal-sugerencias" role="group" aria-label="${calEsc(t('calSugerencias'))}">${calSugerenciasHtml('donde')}</div></div>`;
}
// Chips: Todo · Cultura · Deportes · Gratis; elegida una categoría, una
// segunda fila con sus subcategorías o competiciones (SofaScore, Fever).
const calHijos = (conceptos, r) => Object.keys(conceptos).filter(i => conceptos[i].padres.includes(r));
function calRaizElegida(){
  const s = CALENDARIO, conceptos = s.meta.catalogo.conceptos;
  if (s.mio) return '';
  return CAL_CATEGORIAS.find(c => s.temas.has(c) || calHijos(conceptos, c).some(h => s.temas.has(h))) || '';
}
function calChips(){
  const s = CALENDARIO, m = s.meta;
  if (!m) return '';
  const conceptos = m.catalogo.conceptos, raiz = calRaizElegida();
  const chip = (accion, label, valor, pulsado, clase = '') => calBoton(accion, label, valor, `class="${clase}" aria-pressed="${pulsado}"`);
  const fijas = CAL_CATEGORIAS.filter(c => conceptos[c]);
  const gratis = calBoton('gratis', t('calPrecioGratis'), '', `aria-pressed="${s.precio === 'gratis'}" title="${calEsc(t('calGratisNota'))}"`);
  // Con un prefijo de tema en el buscador, manda él: se ve como chip pulsado que
  // se quita, en vez de un «Todo» que no es verdad (como Deportes con prefijo).
  const prefijos = calPideAgenda(s.orden) ? s.orden.ambitos.filter(a => !AMBITOS[a]?.codigo) : [];
  if (prefijos.length) return `<div class="cal-chips ui-tira" role="group" aria-label="${calEsc(t('calTemas'))}">${prefijos.map(a => {
    const nombre = calNombre(conceptos[AMBITOS[a].tema]);
    return calBoton('quitar-prefijo', nombre + ' ✕', a, `aria-pressed="true" aria-label="${calEsc(t('calQuitar', { x: nombre }))}"`);
  }).join('')}${gratis}</div>`;
  const p = calPreferencias(), loMio = p?.estado === 'configurado' && calTemasMios(p).length ? chip('categoria', t('calLoMio'), 'mio', s.mio) : '';
  // En la agenda, «Deportes» es el deporte del sitio; las competiciones tienen su vista.
  const primera = `<div class="cal-chips ui-tira" role="group" aria-label="${calEsc(t('calTemas'))}">${loMio}${chip('categoria', t('calTodo'), '', !raiz && !s.mio)}
    ${fijas.map(c => chip('categoria', c === 'deportes' ? t('calAsDeporteLocal') : calNombre(conceptos[c]), c, raiz === c, 'cal-cat cal-cat-' + c)).join('')}
    ${gratis}</div>`;
  // Solo las subcategorías con algo en el sitio; la elegida se queda aunque no tenga.
  const hay = s.disp?.clave === (s.donde?.id || '') ? s.disp.temas : null;
  const segunda = raiz ? calHijos(conceptos, raiz).filter(i => !hay || hay[i] || s.temas.has(i))
    .map(i => chip('tema', calNombre(conceptos[i]), i, s.temas.has(i))).join('') : '';
  return primera + (segunda ? `<div class="cal-chips cal-subchips ui-tira" role="group" aria-label="${calEsc(calNombre(conceptos[raiz]))}">${segunda}</div>` : '');
}
function calContenido(){
  const s = CALENDARIO;
  if (s.orden?.desconocidos.length) return `<p class="cal-aviso">${calEsc(t('calConsultaDesconocida', { x: s.orden.desconocidos.join(', ') }))}</p>`;
  if (!s.meta) return '';
  if (calMixta()) return calElegirParte();
  if (calSinSitio()) return calInvitacion() + calPedirSitio();
  const { desde, hasta, acotada } = calVentana();
  if (desde >= hasta) return `<p class="cal-aviso">${calEsc(t('calFueraHorizonte'))}</p>`;
  return calInvitacion() + calTira() + calLista() + (s.resumen && !acotada ? calPendientes() : '');
}
// Sitios que ya conozco del usuario: los de «Mis sitios» (el tiempo) y su provincia.
function calSitiosCandidatos(){
  const candidatos = new Map();
  for (const x of sitiosTiempo()){
    const ine = x.lugar?.ine && String(x.lugar.ine).padStart(5, '0');
    if (!ine) continue;
    candidatos.set('es:municipio:' + ine, x.nombre);
    const prov = ADMINISTRACION.provincias.find(([c]) => c === ine.slice(0, 2));
    if (prov) candidatos.set('es:provincia:' + prov[0], t('calAsProvincia', { x: prov[1] }));
  }
  return candidatos;
}
function calPedirSitio(){
  const candidatos = [...calSitiosCandidatos()];
  return `<section class="cal-invitacion cal-pedir-sitio"><h2>${calEsc(t('calEligeSitio'))}</h2><p>${calEsc(t('calEligeSitioTexto'))}</p>
    ${candidatos.length ? `<div class="cal-chips ui-tira" role="group" aria-label="${calEsc(t('calSugerencias'))}">${candidatos.map(([id, nombre]) =>
      `<button type="button" data-cal="elegir-donde" data-valor="${calEsc(id)}" data-nombre="${calEsc(nombre)}">${calEsc(nombre)}</button>`).join('')}</div>` : ''}
    <div class="as-acciones">${calBoton('editar-donde', t('calBuscarSitio'))}${calBoton('ir-deportes', t('calIrDeportes'))}</div></section>`;
}
// Orden mixta: dos botones, uno por parte, con lo que se verá en cada una.
function calElegirParte(){
  const o = CALENDARIO.orden, conceptos = CALENDARIO.meta?.catalogo?.conceptos || {};
  const deportes = [...o.ambitos.filter(a => AMBITOS[a]?.codigo), ...o.circuitos].map(calNombreCompeticion).join(', ');
  const temas = o.ambitos.filter(a => !AMBITOS[a]?.codigo).map(a => calNombre(conceptos[AMBITOS[a].tema]) || a).join(', ');
  const sitio = CALENDARIO.donde?.nombre;
  return `<section class="cal-invitacion cal-elegir-parte"><h2>${calEsc(t('calMezcla'))}</h2><p>${calEsc(t('calMezclaTexto'))}</p>
    <div class="as-acciones">${calBoton('quedarse', t('calVerEnDeportes', { x: deportes }), 'deportes')}
    ${calBoton('quedarse', t(sitio ? 'calVerEnSitio' : 'calVerEnAgenda', { x: temas, sitio }), 'agenda')}</div></section>`;
}
// Calendario deportivo: cada competición es una capa («Mis calendarios» de
// Google Calendar) y se eligen arriba, como los deportes de SofaScore o ESPN y
// los chips de la agenda: un deporte se elige entero («mixed» si solo algunas)
// y solo entonces salen debajo sus competiciones, con su marca del mes y su
// nombre, que hacen de leyenda. Con color, las marcadas. Siempre queda una.
// El deporte elegido: el único al que pertenecen todas las capas.
const calDeporteElegido = () => Object.keys(CAL_DEPORTES).find(k => [...CALENDARIO.capas].every(c => CAL_DEPORTE_DE[c] === k)) || '';
function calChipsDeportes(){
  const s = CALENDARIO, sigo = calPreferencias()?.competiciones || [], elegido = calDeporteElegido();
  const igual = cs => cs.length === s.capas.size && cs.every(c => s.capas.has(c));
  const chip = (accion, html, valor, pulsado, clase = '', attrs = '') => `<button type="button" data-cal="${accion}" data-valor="${calEsc(valor)}" class="${clase}" aria-pressed="${pulsado}"${attrs}>${html}</button>`;
  const deportes = Object.entries(CAL_DEPORTES).map(([k, cs]) =>
    chip('deporte', calEsc(t(CAL_NOMBRES_DEPORTE[k])), k, k !== elegido ? 'false' : igual(cs) ? 'true' : 'mixed', `cal-dep cal-dep-${k}`)).join('');
  // Cada competición: su nombre filtra (lo que veo) y su ★ la sigue (Apple
  // Sports, «Mis calendarios» de Google): dos botones hermanos, sin asistente.
  const competiciones = (CAL_DEPORTES[elegido] || []).map(c => {
    const nombre = calNombreCompeticion(c), marca = CAL_MARCAS[c], sigue = sigo.includes(c);
    return `<span class="cal-capa">${chip('capa', (marca && marca !== nombre ? `<b class="cal-chip-marca">${calEsc(marca)}</b> ` : '') + calEsc(nombre), c, s.capas.has(c),
      `cal-dep cal-dep-${CAL_DEPORTE_DE[c]}`)}${chip('seguir', sigue ? '★' : '☆', c, sigue, 'cal-seguir', ` aria-label="${calEsc(t(sigue ? 'calDejarDeSeguir' : 'calSeguir', { x: nombre }))}"`)}</span>`;
  }).join('');
  return `<div class="cal-chips ui-tira" role="group" aria-label="${calEsc(t('calCompeticiones'))}">${chip('capas-todas', calEsc(t('calTodas')), '', igual(CAL_COMPETICIONES))}
    ${sigo.length ? chip('capas-sigo', calEsc(t('calLasQueSigo')), '', igual(sigo)) : ''}${deportes}</div>
    ${elegido ? `<div class="cal-chips cal-subchips ui-tira" role="group" aria-label="${calEsc(t('calCompeticionesN', { n: s.capas.size, total: CAL_DEPORTES[elegido].length }))}">${competiciones}</div>`
      : sigo.length ? '' : `<p class="cal-nota cal-pista-seguir">${calEsc(t('calPistaSeguir'))}</p>`}`;
}
// Seguir o dejar de seguir una competición: solo guarda la preferencia; lo que
// se ve no cambia hasta pulsar «Las que sigo». Sin asistente hecho, no lo
// marca como hecho (el sitio de la agenda sigue saliendo de «Mis sitios»).
function calSeguir(c){
  const p = calPreferencias() || { v: 1, estado: 'omitido' }, sigo = new Set(p.competiciones || []);
  if (sigo.has(c)) sigo.delete(c); else sigo.add(c);
  const ok = calGuardarPreferencias({ ...p, competiciones: [...sigo], actualizado: new Date().toISOString() });
  if (!ok) toast(t('calAsNoGuardado'), 3000);
  pintarCalendario();
}
// Al entrar en Deportes: las competiciones que sigo o, sin ninguna, todas.
function calEntrarDeportes(){
  const p = calPreferencias();
  CALENDARIO.capas = new Set(p?.competiciones.length ? p.competiciones : CAL_COMPETICIONES);
}
// Primera vez sin configurar: invitar al asistente (se puede dejar para otro día).
function calInvitacion(){
  if (CALENDARIO.orden || calPreferencias()) return '';
  return `<section class="cal-invitacion"><h2>${calEsc(t('calAsInvitacion'))}</h2><p>${calEsc(t('calAsInvitacionTexto'))}</p>
    <div class="as-acciones">${calBoton('ahora-no', t('calAsAhoraNo'))}${calBoton('asistente', t('calAsTitulo'), '0', 'class="primary"')}</div></section>`;
}
// Asistente: borrador en memoria; solo se escribe al guardar (como el de modos).
function calAbrirAsistente(paso = 0){
  const s = CALENDARIO, p = calPreferencias();
  s.asistente = { paso, disp: null, clave: null, error: '', b: {
    sitio: p?.estado === 'configurado' ? p.sitio : s.donde, cultura: new Set(p?.intereses.cultura || []),
    otraCultura: p?.estado === 'configurado' ? p.intereses.otraCultura : true, deporteLocal: Boolean(p?.intereses.deporteLocal),
    competiciones: new Set(p?.competiciones || []) } };
  s.escrito.donde = ''; s.sugerencias.donde = [];
  calPasoAsistente(paso);
}
function calPasoAsistente(paso){
  const a = CALENDARIO.asistente;
  a.paso = paso; a.error = '';
  pintarCalendario();
  document.getElementById('cal-as-titulo')?.focus();
  if (paso > 0) calDisponibilidad();
}
// Lo que hay en el sitio elegido y en cada competición: solo se ofrece eso.
async function calDisponibilidad(){
  const a = CALENDARIO.asistente, clave = a.b.sitio?.id || '';
  if (a.clave === clave) return;
  a.controller?.abort();
  const controller = a.controller = new AbortController();
  a.clave = clave; a.disp = null; pintarCalendario();
  try {
    const d = await calPedir('catalogo', { disponibilidad: 1, territorio: clave }, controller.signal);
    if (CALENDARIO.asistente !== a || a.clave !== clave) return;
    a.disp = d.disponibilidad; a.error = '';
  } catch {
    if (controller.signal.aborted || CALENDARIO.asistente !== a || a.clave !== clave) return;
    a.error = t('calError'); a.clave = null;
  }
  pintarCalendario();
}
function calAsistente(){
  const s = CALENDARIO, a = s.asistente, b = a.b, d = a.disp, paso = CAL_PASOS[a.paso];
  const conceptos = s.meta?.catalogo?.conceptos || {};
  const caja = (tipo, valor, label, marcado, n = null, ayuda = '') => `<label class="cal-as-opcion"><input type="${tipo === 'cal-as-sitio' ? 'radio' : 'checkbox'}" name="${tipo}" value="${calEsc(valor)}" data-nombre="${calEsc(label)}"${marcado ? ' checked' : ''}>
    <span>${calEsc(label)}${n != null ? ` <small>· ${n}</small>` : ''}${ayuda ? `<small class="cal-as-ayuda">${calEsc(ayuda)}</small>` : ''}</span></label>`;
  const cargando = `<p class="cal-estado" role="status">${calEsc(t('calCargando'))}</p>`;
  let titulo, cuerpo;
  if (paso === 'sitio'){
    titulo = t('calAsSitio');
    const candidatos = calSitiosCandidatos();
    if (b.sitio && !candidatos.has(b.sitio.id)) candidatos.set(b.sitio.id, b.sitio.nombre);
    cuerpo = `<p class="aj-hint">${calEsc(t('calAsSitioAyuda'))}</p><fieldset class="cal-as-grupo"><legend class="sr-only">${calEsc(titulo)}</legend>
      ${[...candidatos].map(([id, nombre]) => caja('cal-as-sitio', id, nombre, b.sitio?.id === id)).join('')}
      ${caja('cal-as-sitio', '', t('calAsSinSitio'), !b.sitio)}</fieldset>
      <div class="cal-campo-sug"><label for="cal-donde">${calEsc(t('calAsBuscarOtro'))}</label>
      <input id="cal-donde" type="search" autocomplete="off" value="${calEsc(s.escrito.donde)}" placeholder="${calEsc(t('calDondeEjemplo'))}" aria-controls="cal-sug-donde">
      <div id="cal-sug-donde" class="cal-sugerencias" role="group" aria-label="${calEsc(t('calSugerencias'))}">${calSugerenciasHtml('donde')}</div></div>`;
  } else if (paso === 'intereses'){
    titulo = b.sitio ? t('calAsIntereses', { x: b.sitio.nombre }) : t('calAsInteresesSinSitio');
    if (!d) cuerpo = cargando;
    else {
      const hijos = calHijos(conceptos, 'cultura').filter(h => d.temas[h] || b.cultura.has(h)).sort((x, y) => (d.temas[y] || 0) - (d.temas[x] || 0));
      const hay = hijos.length || d.sin_subcategoria.cultura || d.raices.deportes;
      cuerpo = `<p class="aj-hint">${calEsc(t('calAsInteresesAyuda'))}</p>
        ${!hay && b.sitio ? `<p class="cal-aviso">${calEsc(t('calAsSinCobertura', { x: b.sitio.nombre }))}</p>` : ''}
        <fieldset class="cal-as-grupo"><legend>${calEsc(calNombre(conceptos.cultura))}</legend>
        ${hijos.map(h => caja('cal-as-interes', h, calNombre(conceptos[h]), b.cultura.has(h), d.temas[h] || 0)).join('')}
        ${d.sin_subcategoria.cultura || b.otraCultura ? caja('cal-as-interes', 'otra', t('calAsOtraCultura'), b.otraCultura, d.sin_subcategoria.cultura || 0, t('calAsOtraCulturaAyuda')) : ''}</fieldset>
        ${d.raices.deportes || b.deporteLocal ? `<fieldset class="cal-as-grupo"><legend>${calEsc(calNombre(conceptos.deportes))}</legend>
          ${caja('cal-as-interes', 'deporte', t('calAsDeporteLocal'), b.deporteLocal, d.raices.deportes || 0)}</fieldset>` : ''}`;
    }
  } else if (paso === 'competiciones'){
    titulo = t('calAsCompeticiones');
    cuerpo = !d ? cargando : `<p class="aj-hint">${calEsc(t('calAsCompeticionesAyuda'))}</p>`
      + Object.entries(CAL_DEPORTES).map(([dep, codigos]) => {
        const lista = codigos.filter(c => d.circuitos[c] || b.competiciones.has(c));
        return lista.length ? `<fieldset class="cal-as-grupo"><legend>${calEsc(t(CAL_NOMBRES_DEPORTE[dep]))}</legend>
          ${lista.map(c => caja('cal-as-comp', c, calNombreCompeticion(c), b.competiciones.has(c), d.circuitos[c] || 0)).join('')}</fieldset>` : '';
      }).join('');
  } else {
    titulo = t('calAsResumen');
    const intereses = [...[...b.cultura].map(h => calNombre(conceptos[h])), ...(b.otraCultura ? [t('calAsOtraCultura')] : []),
      ...(b.deporteLocal ? [t('calAsDeporteLocal')] : [])];
    const fila = (k, valor, i) => `<div class="cal-as-fila"><dt>${calEsc(t(k))}</dt><dd>${calEsc(valor || t('calAsNinguno'))}</dd>
      <dd>${calBoton('as-ir', t('calAsCambiar'), String(i), `aria-label="${calEsc(t('calAsCambiar') + ': ' + t(k))}"`)}</dd></div>`;
    cuerpo = `<dl class="cal-as-resumen">${fila('calAsSitioRes', b.sitio?.nombre, 0)}${b.sitio ? fila('calAsInteresesRes', intereses.join(', '), 1) : ''}
      ${fila('calAsCompeticionesRes', [...b.competiciones].map(calNombreCompeticion).join(', '), 2)}</dl>`;
  }
  const ultimo = a.paso === CAL_PASOS.length - 1;
  return `<section class="cal-asistente" aria-labelledby="cal-as-titulo"><p class="aj-hint">${calEsc(t('calAsPaso', { n: a.paso + 1, total: CAL_PASOS.length }))}</p>
    <ol class="cal-as-progreso" aria-hidden="true">${CAL_PASOS.map((_, i) => `<li class="${i <= a.paso ? 'hecho' : ''}"></li>`).join('')}</ol>
    <h2 id="cal-as-titulo" tabindex="-1">${calEsc(titulo)}</h2>${cuerpo}
    <p class="as-error" role="alert">${calEsc(a.error)}</p>
    <div class="as-acciones">${calBoton('as-cancelar', t('calAsCancelar'))}${a.paso ? calBoton('as-anterior', t('calAsAnterior')) : ''}
    ${calBoton(ultimo ? 'as-guardar' : 'as-siguiente', t(ultimo ? 'calAsGuardar' : 'calAsSiguiente'), '', 'class="primary"')}</div></section>`;
}
// Desde Ajustes → Asistentes: se cierra Ajustes y el asistente se abre sobre el calendario.
function asistenteCalendarioDesdeAjustes(){
  cerrarAjustes();
  abrirCalendario(document.getElementById('btn-calendario'), 'agenda');
  calAbrirAsistente(0);
}
const calEnfocarAjustes = () => document.getElementById('calendario-panel')?.querySelector('[data-cal="asistente"]')?.focus({ preventScroll: true });
function calGuardarAsistente(){
  const s = CALENDARIO, b = s.asistente.b;
  // Sin sitio, solo competiciones: no quedan intereses de toda España.
  if (!b.sitio){ b.cultura.clear(); b.otraCultura = false; b.deporteLocal = false; }
  if (!b.cultura.size && !b.otraCultura && !b.deporteLocal && !b.competiciones.size){
    s.asistente.error = t('calAsVacio'); return void pintarCalendario();
  }
  const ok = calGuardarPreferencias({ v: 1, estado: 'configurado', sitio: b.sitio,
    intereses: { cultura: [...b.cultura], otraCultura: b.otraCultura, deporteLocal: b.deporteLocal },
    competiciones: [...b.competiciones], actualizado: new Date().toISOString() });
  s.asistente = null;
  calElegirDonde(b.sitio);
  if (calModoDeportes()) calEntrarVista('deportes');
  else if (!calVerLoMio()){ s.temas.clear(); s.mio = false; }
  toast(t(ok ? 'calAsGuardado' : 'calAsNoGuardado'), 3000);
  consultarCalendario();
  calEnfocarAjustes();
}
const CAL_FOCO_SUSTITUTO = { 'ver-dia': 'ocultar-dia', 'mas-dia': 'ocultar-dia', 'ocultar-dia': 'ver-dia', 'mas-curso': 'curso' };
function pintarCalendario(repintado = false){
  const s = CALENDARIO, p = document.getElementById('calendario-panel');
  if (!p) return;
  const visible = CALENDARIO_ACTIVO && s.abierto;
  p.hidden = !visible;
  document.body.classList.toggle('calendario-abierto', visible);
  document.getElementById('btn-calendario')?.setAttribute('aria-expanded', String(visible && !calModoDeportes()));
  document.getElementById('btn-deportes')?.setAttribute('aria-expanded', String(visible && calModoDeportes()));
  if (!visible) return;
  s.fecha ||= calHoy();
  const foco = p.contains(document.activeElement) ? document.activeElement : null;
  const id = foco?.id, accion = foco?.dataset.cal, valor = foco?.dataset.valor;
  const seleccion = foco?.type === 'search' ? [foco.selectionStart, foco.selectionEnd] : null;
  p.setAttribute('aria-busy', String(s.cargando));
  p.classList.toggle('cal-compacto', !s.mesAbierto);
  if (s.asistente){
    p.innerHTML = `<h1 id="cal-titulo" class="sr-only" tabindex="-1">${calEsc(t('calTitulo'))}</h1>${calAsistente()}`;
    const vuelta = id ? document.getElementById(id) : foco?.name
      ? [...p.querySelectorAll('input')].find(b => b.name === foco.name && b.value === foco.value)
      : [...p.querySelectorAll('[data-cal]')].find(b => b.dataset.cal === accion && b.dataset.valor === valor);
    vuelta?.focus({ preventScroll: true });
    return;
  }
  const hoy = calHoy(), manana = sumarDiasCalendario(hoy, 1);
  const rango = (k, dia) => calBoton('rango', t(CAL_RANGOS[k]), k, `aria-pressed="${s.rango === k}"${dia ? ` data-dia="${dia}"` : ''}`);
  const deportes = calModoDeportes();
  // Las tiras de chips conservan su desplazamiento: si no, al elegir un chip
  // lejano la tira vuelve al principio y lo elegido queda fuera de la vista.
  const desplazadas = [...p.querySelectorAll('.ui-tira')].map(x => x.scrollLeft);
  // El contenido va antes que la barra: el mes ancho le pasa su ‹ mes › y anota el alto de semana usado.
  s.navEnBarra = ''; s.altoSemana = 0;
  const contenido = calContenido();
  // Arriba la ciudad (en Deportes, el título) y las acciones; debajo, atajos de
  // fecha y chips: en la agenda, temas; en Deportes, deportes y competiciones.
  p.innerHTML = `<div class="cal-barra"><h1 id="cal-titulo" class="${deportes ? 'cal-titulo-vista' : 'sr-only'}" tabindex="-1">${calEsc(t(deportes ? 'calDeportesTitulo' : 'calTitulo'))}</h1>
    ${deportes ? '' : calDonde()}<div class="cal-acciones">${deportes ? '' : calBoton('asistente', '⚙', '0', `class="cal-icono" aria-label="${calEsc(t('calAsTitulo'))}" title="${calEsc(t('calAsTitulo'))}"`)}${calBoton('renovar', '↻', '', `class="cal-icono" aria-label="${calEsc(t('calActualizar'))}" title="${calEsc(t('calActualizar'))}"${s.cargando ? ' disabled' : ''}`)}
    ${s.orden?.noticias ? calBoton('cerrar', t('calVerNoticias')) : calBoton('cerrar', '✕', '', `class="cal-icono" aria-label="${calEsc(t('calCerrar'))}" title="${calEsc(t('calCerrar'))}"`)}</div>
    <div class="cal-chips cal-rangos ui-tira" role="group" aria-label="${calEsc(t('calCuando'))}">${rango('hoy', hoy)}${rango('manana', manana)}${rango('finde')}
    ${calBoton('elegir-fecha', '📅', '', `class="cal-icono" aria-label="${calEsc(t('calFecha'))}" title="${calEsc(t('calFecha'))}"`)}
    <input id="cal-fecha" class="sr-only" type="date" tabindex="-1" aria-hidden="true" value="${s.fecha}"></div>
    ${s.navEnBarra}${deportes ? s.capas ? calChipsDeportes() : '' : calChips()}</div>
    <div class="cal-cuerpo"><p class="cal-estado" role="status">${calEsc(s.error ? t(s.error, { n: calSegundosEspera() }) : s.cargando ? t('calCargando') : '')}</p>
    ${s.error === 'calError' ? calBoton('renovar', t('calReintentar')) : ''}<div class="cal-contenido">${contenido}</div>
    ${s.meta ? `<p class="cal-nota cal-pie">${calEsc(t('calCobertura'))} ${calEsc(t('calGenerado', { fecha: calFormato({ dateStyle: 'short', timeStyle: 'short', timeZone: s.zona }).format(new Date(s.meta.generado)) }))}</p>` : ''}
    ${s.orden?.noticias ? `<p class="cal-nota">${calEsc(t('calNoticiasTexto'))}</p>` : ''}</div>`;
  p.querySelectorAll('.ui-tira').forEach((x, i) => { if (desplazadas[i]) x.scrollLeft = desplazadas[i]; });
  // Si el botón con el foco se sustituye al pintar («Ver las N» → «Mostrar menos»,
  // y al revés), el foco pasa a su sustituto del mismo día en vez de perderse.
  const botonCal = a => [...p.querySelectorAll('[data-cal]')].find(b => b.dataset.cal === a && b.dataset.valor === valor);
  const siguiente = id ? document.getElementById(id) : foco?.name ? [...p.querySelectorAll('input')].find(b => b.name === foco.name && b.value === foco.value)
    : botonCal(accion) || botonCal(CAL_FOCO_SUSTITUTO[accion]);
  siguiente?.focus({ preventScroll: true });
  if (seleccion && siguiente?.type === 'search') siguiente.setSelectionRange(...seleccion);
  calObservarDias(p);
  // El alto de semana se midió con la barra anterior: si al pintar cambió (abrir
  // el mes la deja en una fila), se pinta otra vez con la medida buena.
  if (s.altoSemana && s.altoSemana !== calAltoSemana() && !repintado) pintarCalendario(true);
}
// Fecha elegida: la tira salta a su semana y la lista empieza en ese día.
function calElegirDia(dia, rango = ''){
  const s = CALENDARIO;
  s.fecha = dia; s.rango = rango; s.semanas = 1;
}
function wireCalendario(){
  const s = CALENDARIO, p = document.getElementById('calendario-panel');
  document.getElementById('btn-as-calendario')?.addEventListener('click', asistenteCalendarioDesdeAjustes);
  // Dos entradas a la misma vista: la agenda y Deportes. Pulsar la abierta la cierra.
  for (const [id, vista] of [['btn-calendario', 'agenda'], ['btn-deportes', 'deportes']]){
    const boton = document.getElementById(id);
    boton.hidden = !CALENDARIO_ACTIVO;
    boton.addEventListener('click', e => s.abierto && s.vista === vista ? salirCalendario() : abrirCalendario(e.currentTarget, vista));
  }
  p.addEventListener('click', e => {
    const b = e.target.closest('[data-cal]');
    if (!b) return;
    const a = b.dataset.cal, v = b.dataset.valor;
    if (a === 'cerrar') return salirCalendario();
    if (a === 'asistente') return calAbrirAsistente(Number(v) || 0);
    if (a === 'ahora-no'){ calGuardarPreferencias({ v: 1, estado: 'omitido' }); return void pintarCalendario(); }
    if (a === 'seguir') return calSeguir(v);
    if (s.asistente){
      const as = s.asistente;
      if (a === 'as-cancelar'){ as.controller?.abort(); s.asistente = null; pintarCalendario(); return void calEnfocarAjustes(); }
      // Sin sitio no hay agenda local: del sitio se pasa a las competiciones.
      const salto = !as.b.sitio && as.paso === (a === 'as-siguiente' ? 0 : 2) ? 2 : 1;
      if (a === 'as-anterior') return calPasoAsistente(as.paso - salto);
      if (a === 'as-siguiente') return calPasoAsistente(as.paso + salto);
      if (a === 'as-ir') return calPasoAsistente(Number(v));
      if (a === 'as-guardar') return calGuardarAsistente();
      if (a === 'elegir-donde'){
        as.b.sitio = { id: v, nombre: b.dataset.nombre }; s.escrito.donde = ''; s.sugerencias.donde = [];
        return void pintarCalendario();
      }
      return;
    }
    if (a === 'elegir-fecha'){
      const f = document.getElementById('cal-fecha');
      try { return void f.showPicker(); } catch { return void f.click(); }
    }
    if (a === 'renovar') return void cargarCalendario(true);
    if (a === 'evento') return void abrirEventoCalendario(v);
    if (a === 'desplegar') return void desplegarEventoCalendario(v, b.dataset.id);
    if (a === 'pendientes' || a === 'mas-pendientes') return void pendientesCalendario(a === 'mas-pendientes');
    if (a === 'ver-dia' || a === 'mas-dia') return void abrirDiaCalendario(v, 'citas', a === 'mas-dia');
    if (a === 'mas-curso') return void abrirDiaCalendario(v, 'curso', true);
    if (a === 'grupo'){
      // Abrir un grupo de un día sin cargar (o que falló) lo pide.
      const [dia, k] = v.split('|'), abrir = b.dataset.abierto !== 'true', l = s.dias.get(dia + '|citas');
      calElegirGrupo(k, abrir);
      return void (abrir && !l?.cargada ? abrirDiaCalendario(dia, 'citas') : pintarCalendario());
    }
    if (a === 'curso' || a === 'ocultar-dia'){
      const l = s.dias.get(v + (a === 'curso' ? '|curso' : '|citas'));
      if (a === 'curso' && !l?.abierta) return void abrirDiaCalendario(v, 'curso');
      l.abierta = false; return void pintarCalendario();
    }
    if (a === 'mes'){ s.mesAbierto = !s.mesAbierto; return void consultarCalendario(); }
    if (a === 'temporada'){
      s.temporadaAbierta = !s.temporadaAbierta; pintarCalendario();
      return void (s.temporadaAbierta && cargarTemporadaCalendario());
    }
    if (a === 'editar-donde'){
      s.editandoDonde = true; pintarCalendario();
      return void document.getElementById('cal-donde')?.focus();
    }
    let enfocar = '';
    if (a === 'elegir-donde'){
      calElegirDonde({ id: v, nombre: b.dataset.nombre }); s.escrito.donde = ''; s.sugerencias.donde = []; s.editandoDonde = false;
      enfocar = '[data-cal="editar-donde"]';
    }
    // Quitar el prefijo no cierra la agenda abierta por él: se queda con lo suyo.
    if (a === 'quitar-prefijo'){ s.porPrefijo = false; return calQuitarPrefijos(o => !calEsDeportiva(o) && o.ambitos.includes(v)); }
    if (a === 'ir-deportes') return abrirCalendario(document.getElementById('btn-deportes'), 'deportes');
    if (a === 'quedarse') return calQuitarPrefijos(o => v === 'deportes' ? !calEsDeportiva(o) : calEsDeportiva(o));
    // En el mes, tocar un día lo elige y pliega la tira (Apple Calendar).
    if (a === 'dia'){ calElegirDia(v); s.mesAbierto = false; }
    if (a === 'rango'){
      if (s.rango === v) calElegirDia(calHoy());
      else calElegirDia(v === 'finde' ? ventanaCalendario(calHoy(), 'semana')[5] : b.dataset.dia, v);
      if (v === 'finde' && s.fecha < calHoy()) s.fecha = calHoy();
    }
    // Semana o bloque de semanas vecinos: su primer día, o hoy si cae en ellos.
    if (a === 'anterior' || a === 'siguiente'){
      const paso = a === 'anterior' ? -1 : 1;
      const dias = s.mesAbierto ? calPeriodoMes(sumarDiasCalendario(calPeriodoMes().dias[0], paso * CAL_SEMANAS_MES * 7)).dias
        : ventanaCalendario(moverFecha(s.fecha, 'semana', paso), 'semana');
      calElegirDia(dias.includes(calHoy()) ? calHoy() : dias[0]);
    }
    if (a === 'mas-semanas') s.semanas = Math.min(CAL_SEMANAS_MAX, s.semanas + 1);
    if (a === 'categoria'){
      s.temas.clear(); s.mio = false;
      if (v === 'mio') calVerLoMio();
      else if (v) s.temas.add(v);
    }
    // Capas: solo una (su nombre en «Este mes en deportes»), todas o las que sigo.
    // Con un prefijo de competición no hay capas: manda el prefijo.
    if (s.capas){
      if (a === 'solo') s.capas = new Set([v]);
      if (a === 'capas-todas') s.capas = new Set(CAL_COMPETICIONES);
      if (a === 'capas-sigo') s.capas = new Set(calPreferencias().competiciones);
      // Un deporte se elige entero y, pulsado otra vez, vuelve a todas; dentro
      // de él, cada competición se enciende o se apaga. Nunca sin capas.
      if (a === 'deporte') s.capas = new Set(calDeporteElegido() === v ? CAL_COMPETICIONES : CAL_DEPORTES[v]);
      if (a === 'capa'){
        const capas = new Set(s.capas);
        capas.has(v) ? capas.delete(v) : capas.add(v);
        if (capas.size) s.capas = capas;
      }
    }
    // Una subcategoría sustituye a su raíz y se quita volviendo a pulsarla.
    if (a === 'tema'){
      const raiz = calRaizElegida(), pulsado = s.temas.has(v);
      s.temas.clear(); s.temas.add(pulsado ? raiz : v);
    }
    if (a === 'gratis') s.precio = s.precio === 'gratis' ? '' : 'gratis';
    consultarCalendario();
    if (enfocar) p.querySelector(enfocar)?.focus({ preventScroll: true });
  });
  p.addEventListener('change', e => {
    const id = e.target.id, v = e.target.value, as = s.asistente;
    if (as && e.target.name?.startsWith('cal-as-')){
      const b = as.b, n = e.target.name, marcado = e.target.checked;
      if (n === 'cal-as-sitio') b.sitio = v ? { id: v, nombre: e.target.dataset.nombre } : null;
      if (n === 'cal-as-interes'){
        if (v === 'otra') b.otraCultura = marcado;
        else if (v === 'deporte') b.deporteLocal = marcado;
        else marcado ? b.cultura.add(v) : b.cultura.delete(v);
      }
      if (n === 'cal-as-comp') marcado ? b.competiciones.add(v) : b.competiciones.delete(v);
      as.error = '';
      return;
    }
    if (id !== 'cal-fecha' || !fechaValida(v)) return;
    calElegirDia(v); consultarCalendario();
  });
  p.addEventListener('input', e => {
    if (e.target.id === 'cal-donde'){ s.escrito.donde = e.target.value; sugerirDonde(e.target.value); }
  });
  // Teclado en el buscador de sitios: ↓ entra en la lista, Intro elige la
  // primera, Escape la cierra y vuelve al nombre de la ciudad.
  p.addEventListener('keydown', e => {
    if (e.target.id !== 'cal-donde' && e.target.dataset?.cal !== 'elegir-donde') return;
    const botones = [...p.querySelectorAll('#cal-sug-donde button')], i = botones.indexOf(e.target);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){
      const destino = e.key === 'ArrowDown' ? botones[i + 1] : i > 0 ? botones[i - 1] : document.getElementById('cal-donde');
      if (destino){ e.preventDefault(); destino.focus(); }
    } else if (e.key === 'Enter' && i < 0 && botones[0]){
      e.preventDefault(); botones[0].click();
    } else if (e.key === 'Escape'){
      e.preventDefault(); e.stopPropagation();
      s.sugerencias.donde = []; s.editandoDonde = false; s.escrito.donde = ''; pintarCalendario();
      p.querySelector('[data-cal="editar-donde"]')?.focus();
    }
  });
  if (typeof ResizeObserver !== 'undefined'){
    let ancho = calMesAncho();
    new ResizeObserver(() => {
      if (calMesAncho() === ancho) return;
      ancho = calMesAncho();
      if (s.abierto && s.mesAbierto) consultarCalendario();
    }).observe(p);
  }
  // El alto de las semanas sigue al de la ventana.
  let alto = calAltoSemana();
  window.addEventListener?.('resize', () => {
    if (calAltoSemana() === alto) return;
    alto = calAltoSemana();
    if (s.abierto && s.mesAbierto && !s.asistente && calMesAncho()) pintarCalendario();
  });
  // Escribir cierra la vista abierta desde la cabecera; la de un prefijo sigue al prefijo.
  document.getElementById('buscar').addEventListener('input', () => { if (!s.porPrefijo) cerrarCalendario(false); });
}
function sugerenciasCalendario(raw){
  if (!CALENDARIO_ACTIVO) return null;
  const m = raw.match(/(?:^|\s)([^\s"]*)$/);
  if (!m || !m[1]) return null;
  const q = normalize(m[1]);
  const opciones = [...Object.keys(AMBITOS).map(a => a + ':'), 'calendario:', 'circuito:atp,wta'];
  const seleccion = opciones.filter(v => normalize(v).startsWith(q));
  if (!seleccion.length) return q.includes(':') && leerConsultaCalendario(q) ? [] : null;
  return seleccion.slice(0,8).map(value => ({ kind: 'calendario', value, label: value,
    tipo: t('calTitulo') }));
}
/* ═══════════════════════════════════════════════════════════════
   CONSULTAS PUNTUALES: libro:, autor:, pelicula:, serie:, contexto:,
   clasificacion: y resultados: (alias en shared/consultas/registro.js).
   Un panel encima de las noticias, como el tiempo, con una consulta
   activa. Los candidatos se eligen con un toque aunque haya uno solo (el
   nombre no asegura la identidad); los deportes van directos a su ficha.
   Todo sale por deno-buscar (/consulta, /consulta/ficha); aquí solo hay
   una caché de sesión hasta `caduca`, sin sondeos.
   ═══════════════════════════════════════════════════════════════ */
const CONSULTA_URL = BACKENDS.deno.buscar;
const CONSULTA_MIN_LETRAS = 3;
const CONSULTA_CACHE_MAX = 30;
const CONSULTA_IDIOMAS = ['es', 'gl', 'ca', 'eu', 'en'];
const CONSULTA_DEPORTES = { primera: 'Primera', segunda: 'Segunda', nba: 'NBA', wnba: 'WNBA', f1: 'F1' };
const CONSULTA_EJEMPLOS = {
  libro: 'Los besos en el pan', autor: 'Almudena Grandes', pelicula: 'La infiltrada',
  serie: 'La mesías', contexto: 'Almudena Grandes',
};

const PUNTUAL = {
  lista: [], elegida: -1, claveLista: '', clave: '',
  activa: null,           // { tipo, texto, prefijo, raw }
  estado: '',             // ayuda | corta | cargando | candidatos | ficha | error
  candidatos: null, ficha: null, id: '', candidato: null,
  error: '', fallo: '', reintentar: null, enfocar: '',
  seq: 0, timer: null,
  cache: new Map(), enCurso: new Map(),
  texto: null, claveTexto: '',   // palabras de la búsqueda, marcadas en los equipos
};

const idiomaConsulta = () => {
  const lang = (ACCES && ACCES.lang) || 'es';
  return CONSULTA_IDIOMAS.includes(lang) ? lang : 'es';
};
const nombreConsulta = tipo => t('con' + tipo[0].toUpperCase() + tipo.slice(1));
// Singular y plural: «clave1» para uno.
const tn = (clave, n) => t(n === 1 ? clave + '1' : clave, { n });
const esDeporteConsulta = tipo => tipo === 'clasificacion' || tipo === 'resultados';
const codigoDeporte = (tipo, codigo) => Object.hasOwn(ESPN, codigo) && !(tipo === 'resultados' && codigo === 'f1');

// Desde aplicarFiltros: la consulta activa es la última escrita, salvo que
// se haya elegido otra entre varias. `texto` (compilado, como el del feed):
// las palabras sueltas de la búsqueda, que se marcan en los equipos.
function actualizarConsultaPuntual(parsed, texto = null){
  const lista = parsed.chips.filter(c => c.type === 'consulta').map(c => ({
    tipo: c.tipo, texto: c.value.trim(), prefijo: c.raw.slice(0, c.raw.indexOf(':')), raw: c.raw,
  }));
  const claveTexto = texto?.incluir?.length ? JSON.stringify(texto.incluir) : '';
  const otroTexto = claveTexto !== PUNTUAL.claveTexto;
  Object.assign(PUNTUAL, { texto: claveTexto ? texto : null, claveTexto });
  const claveLista = JSON.stringify(lista) + idiomaConsulta();
  if (claveLista === PUNTUAL.claveLista){
    if (otroTexto && PUNTUAL.estado === 'ficha') pintarConsulta({ conservarPlegado: true });
    return;
  }
  PUNTUAL.claveLista = claveLista;
  PUNTUAL.lista = lista;
  if (!lista.length){ ocultarConsulta(); return; }
  if (!lista[PUNTUAL.elegida]) PUNTUAL.elegida = lista.length - 1;
  activarConsulta(lista[PUNTUAL.elegida]);
}

function activarConsulta(c){
  const clave = `${c.tipo}|${c.texto}|${idiomaConsulta()}`;
  PUNTUAL.activa = c;
  if (clave === PUNTUAL.clave){ pintarConsulta(); return; }
  PUNTUAL.clave = clave;
  PUNTUAL.seq++;   // lo que esté en camino ya no se pinta
  clearTimeout(PUNTUAL.timer);
  Object.assign(PUNTUAL, { candidatos: null, ficha: null, id: '', candidato: null, error: '', fallo: '', reintentar: null, enfocar: '' });
  if (esDeporteConsulta(c.tipo)){
    const codigo = normalize(c.texto);
    if (codigoDeporte(c.tipo, codigo)){ abrirFichaConsulta(`espn:${c.tipo}/${codigo}`); return; }
    PUNTUAL.estado = 'ayuda';
  } else if (!c.texto) PUNTUAL.estado = 'ayuda';
  else if (c.texto.length < CONSULTA_MIN_LETRAS) PUNTUAL.estado = 'corta';
  else { cargarCandidatos(c); return; }
  pintarConsulta();
}

function ocultarConsulta(){
  PUNTUAL.seq++;
  clearTimeout(PUNTUAL.timer);
  Object.assign(PUNTUAL, { clave: '', activa: null, elegida: -1, estado: '' });
  const el = document.getElementById('consulta-panel');
  if (el){ el.hidden = true; el.innerHTML = ''; }
}

const errorConsulta = motivo => Object.assign(new Error(motivo), { motivo });

// Una petición por URL: lo vigente sale de la caché y lo que está en camino
// se comparte. Los fallos no se guardan.
function pedirConsulta(ruta, params){
  const url = `${CONSULTA_URL}${ruta}?${new URLSearchParams({ ...params, idioma: idiomaConsulta() })}`;
  const guardada = PUNTUAL.cache.get(url);
  if (guardada && guardada.caduca > Date.now()) return Promise.resolve(guardada.datos);
  if (PUNTUAL.enCurso.has(url)) return PUNTUAL.enCurso.get(url);
  const peticion = (async () => {
    let r;
    try { r = await fetch(url, { signal: AbortSignal.timeout(20000) }); }
    catch(e){ throw errorConsulta('red'); }
    if (r.status === 429) throw errorConsulta('limite');
    const datos = await r.json().catch(() => null);
    if (!datos || typeof datos !== 'object' || !datos.estado) throw errorConsulta('red');
    if (r.status === 400) datos.estado = 'invalida';
    const caduca = Date.parse(datos.caduca);
    if (r.ok && datos.estado !== 'no_disponible' && caduca > Date.now()){
      PUNTUAL.cache.delete(url);
      PUNTUAL.cache.set(url, { datos, caduca });
      if (PUNTUAL.cache.size > CONSULTA_CACHE_MAX) PUNTUAL.cache.delete(PUNTUAL.cache.keys().next().value);
    }
    return datos;
  })().finally(() => PUNTUAL.enCurso.delete(url));
  PUNTUAL.enCurso.set(url, peticion);
  return peticion;
}

async function cargarCandidatos(c){
  const seq = ++PUNTUAL.seq;
  Object.assign(PUNTUAL, { estado: 'cargando', reintentar: () => cargarCandidatos(c) });
  pintarConsulta();
  try {
    const d = await pedirConsulta('/consulta', { tipo: c.tipo, texto: c.texto });
    if (seq !== PUNTUAL.seq) return;
    Object.assign(PUNTUAL, { candidatos: d, estado: 'candidatos' });
  } catch(e){
    if (seq !== PUNTUAL.seq) return;
    Object.assign(PUNTUAL, { estado: 'error', error: e.motivo || 'red' });
  }
  pintarConsulta();
}

// callado: al actualizar se deja la ficha que había hasta que llegue la nueva.
async function abrirFichaConsulta(id, { candidato = null, callado = false } = {}){
  const seq = ++PUNTUAL.seq;
  clearTimeout(PUNTUAL.timer);
  if (!callado){
    Object.assign(PUNTUAL, { id, candidato, ficha: null, fallo: '', estado: 'cargando',
      reintentar: () => abrirFichaConsulta(id, { candidato }) });
    pintarConsulta();
  }
  try {
    const d = await pedirConsulta('/consulta/ficha', { id });
    if (seq !== PUNTUAL.seq) return;
    Object.assign(PUNTUAL, { ficha: d, estado: 'ficha', fallo: '' });
  } catch(e){
    if (seq !== PUNTUAL.seq) return;
    if (callado) PUNTUAL.fallo = e.motivo || 'red';
    else Object.assign(PUNTUAL, { estado: 'error', error: e.motivo || 'red' });
  }
  pintarConsulta();
  // Deportes: al caducar se ofrece Actualizar; no se pide nada solo.
  const caduca = Date.parse(PUNTUAL.ficha?.caduca);
  if (PUNTUAL.estado === 'ficha' && esDeporteConsulta(PUNTUAL.ficha.tipo) && caduca > Date.now()){
    PUNTUAL.timer = setTimeout(pintarConsulta, caduca - Date.now() + 1000);
  }
}

// conservarPlegado: al cambiar solo las palabras marcadas, la ficha se queda
// plegada si el lector la plegó.
function pintarConsulta({ conservarPlegado = false } = {}){
  const el = document.getElementById('consulta-panel');
  if (!el || !PUNTUAL.activa) return;
  if (!el.dataset.escucha){ el.dataset.escucha = '1'; el.addEventListener('click', pulsarConsulta); }
  const plegada = conservarPlegado && el.querySelector('.consulta-ficha')?.open === false;
  el.innerHTML = htmlConsulta();
  if (plegada) el.querySelector('.consulta-ficha').open = false;
  el.hidden = false;
  // El foco solo se mueve tras un toque en el panel, nunca al llegar datos de lo que se escribe.
  const destino = PUNTUAL.enfocar && el.querySelector(PUNTUAL.enfocar);
  if (destino){ PUNTUAL.enfocar = ''; destino.focus(); }
}

function pulsarConsulta(ev){
  const b = ev.target.closest('button[data-accion]');
  if (!b) return;
  const p = PUNTUAL;
  switch (b.dataset.accion){
    case 'cerrar': quitarConsultas(); break;
    case 'elegir':
      p.elegida = +b.dataset.i;
      activarConsulta(p.lista[p.elegida]);
      break;
    case 'candidato': {
      const c = p.candidatos?.candidatos?.[+b.dataset.i];
      if (c){ p.enfocar = '.consulta-ficha summary'; abrirFichaConsulta(c.id, { candidato: c }); }
      break;
    }
    case 'ficha': p.enfocar = '.consulta-ficha summary'; abrirFichaConsulta(b.dataset.id); break;
    case 'cambiar':
      p.seq++;
      Object.assign(p, { estado: 'candidatos', ficha: null, id: '', candidato: null, enfocar: '.consulta-candidatos button' });
      pintarConsulta();
      break;
    case 'reintentar': p.reintentar?.(); break;
    case 'actualizar': abrirFichaConsulta(p.id, { candidato: p.candidato, callado: true }); break;
    case 'valor': cambiarTextoConsulta(b.dataset.valor); break;
    case 'forzar': cargarCandidatos(p.activa); break;
  }
}

function escribirBusqueda(nuevo){
  aplicarFiltrosDebounced.cancel();
  $('#buscar').value = nuevo;
  const clear = $('#buscar-clear');
  if (clear) clear.hidden = !nuevo;
  aplicarFiltros();
}
function quitarConsultas(){
  const raws = new Set(PUNTUAL.lista.map(c => c.raw));
  escribirBusqueda(tokenizeQuery($('#buscar').value).filter(tk => !raws.has(tk.raw)).map(tk => tk.raw).join(' '));
}
function cambiarTextoConsulta(valor){
  const c = PUNTUAL.activa;
  escribirBusqueda(tokenizeQuery($('#buscar').value)
    .map(tk => (tk.raw === c.raw ? `${c.prefijo}:${valor}` : tk.raw)).join(' '));
}

/* ── HTML ── */
const enlaceSeguro = url => (/^https:\/\/[^\s"'<>]+$/.test(url || '') ? url : '');
function enlaceConsulta(url, texto){
  const u = enlaceSeguro(url);
  return u ? `<a href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer">${escapeHtml(texto)}</a>` : '';
}
const msgConsulta = (clave, vars) => `<p class="consulta-msg" role="status">${escapeHtml(t(clave, vars))}</p>`;
const botonConsulta = (accion, texto, attrs = '') => `<button type="button" data-accion="${accion}"${attrs}>${escapeHtml(texto)}</button>`;
const opcionesConsulta = botones => `<div class="consulta-opciones">${botones}</div>`;
const botonFicha = (id, texto) => `<button type="button" class="consulta-enlace" data-accion="ficha" data-id="${escapeHtml(id)}">${escapeHtml(texto)} →</button>`;
const plegadoConsulta = (resumen, contenido, abierto = false) =>
  `<details${abierto ? ' open' : ''}><summary>${escapeHtml(resumen)}</summary>${contenido}</details>`;
const listaConsulta = items => `<ul class="consulta-lista">${items.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`;
// Miniatura: el worker da la imagen grande.
function imgConsulta(url){
  const u = enlaceSeguro(url).replace('/t/p/w500/', '/t/p/w185/').replace(/-L\.jpg$/, '-M.jpg');
  return u ? `<img class="consulta-img" src="${escapeHtml(u)}" alt="" width="64" height="96" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '';
}
const olUrl = id => {
  const v = String(id).split(':')[1] || '';
  return `https://openlibrary.org/${v.endsWith('A') ? 'authors' : 'works'}/${v}`;
};
const historialWikipedia = () => (PUNTUAL.id.startsWith('wikipedia:')
  ? `https://${idiomaConsulta()}.wikipedia.org/w/index.php?title=${encodeURIComponent(PUNTUAL.id.slice(10))}&action=history` : '');

function htmlConsulta(){
  const p = PUNTUAL, c = p.activa;
  const cerrar = t('conCerrar');
  const cambiar = p.id && p.candidatos?.estado === 'ok' ? botonConsulta('cambiar', t('conCambiar')) : '';
  const otras = p.lista.length > 1
    ? `<div class="consulta-otras">${escapeHtml(t('conVarias'))} ${p.lista.map((o, i) =>
        botonConsulta('elegir', `${nombreConsulta(o.tipo)}: ${o.texto}`, ` data-i="${i}" aria-pressed="${i === p.elegida}"`)).join('')}</div>`
    : '';
  return `<div class="consulta-cab"><span class="consulta-tipo">${escapeHtml(nombreConsulta(c.tipo))}</span>${cambiar}
    <button type="button" class="consulta-cerrar" data-accion="cerrar" title="${escapeHtml(cerrar)}" aria-label="${escapeHtml(cerrar)}">${ico('x')}</button></div>
    ${otras}${cuerpoConsulta()}`;
}

function cuerpoConsulta(){
  const p = PUNTUAL, c = p.activa;
  switch (p.estado){
    case 'ayuda':
      if (esDeporteConsulta(c.tipo)){
        return msgConsulta('conCompeticion') + opcionesConsulta(Object.keys(ESPN).filter(k => codigoDeporte(c.tipo, k))
          .map(k => botonConsulta('valor', CONSULTA_DEPORTES[k] || k, ` data-valor="${k}"`)).join(''));
      }
      return msgConsulta('conAyuda', { p: c.prefijo, ej: CONSULTA_EJEMPLOS[c.tipo] });
    case 'corta': return msgConsulta('conCorta') + opcionesConsulta(botonConsulta('forzar', t('conBuscarIgual', { x: c.texto })));
    case 'cargando': return msgConsulta('conCargando');
    case 'error':
      return msgConsulta(p.error === 'limite' ? 'conLimite' : 'conErrorRed') + opcionesConsulta(botonConsulta('reintentar', t('conReintentar')));
    case 'candidatos': return htmlCandidatos(p.candidatos);
    case 'ficha': return htmlFicha(p.ficha);
  }
  return '';
}

// '' si la respuesta trae contenido; si no, por qué.
function estadoConsulta(d, claveVacio, vars){
  if (d.estado === 'ok') return '';
  if (d.estado === 'vacio') return msgConsulta(claveVacio, vars);
  if (d.estado === 'invalida') return msgConsulta('conNoAdmitida');
  return msgConsulta('conNoDisponible', { x: d.fuente || '' }) + opcionesConsulta(botonConsulta('reintentar', t('conReintentar')));
}

function htmlCandidatos(d){
  const estado = estadoConsulta(d, 'conSinResultados', { x: PUNTUAL.activa.texto });
  if (estado) return estado + htmlPieConsulta(d);
  const items = d.candidatos.map((x, i) => {
    const det = [x.detalle && x.detalle !== x.titulo ? x.detalle : '', x.anio || ''].filter(Boolean).join(' · ');
    return `<li><button type="button" data-accion="candidato" data-i="${i}"><span class="consulta-cand-tit">${escapeHtml(x.titulo || '')}</span>${
      det ? `<span class="consulta-cand-det">${escapeHtml(det)}</span>` : ''}</button></li>`;
  }).join('');
  return msgConsulta('conElige') + `<ul class="consulta-candidatos">${items}</ul>` + htmlPieConsulta(d);
}

function htmlFicha(d){
  const vacio = d.tipo === 'resultados' ? 'conSinPartidos' : d.tipo === 'clasificacion' ? 'conSinTabla' : 'conSinResultados';
  const estado = estadoConsulta(d, vacio, { x: PUNTUAL.activa.texto });
  if (estado) return estado + htmlPieConsulta(d);
  if (!FICHAS_CONSULTA[d.tipo] || !d.ficha) return msgConsulta('conNoAdmitida');
  const r = FICHAS_CONSULTA[d.tipo](d.ficha);
  const linea = [r.linea, d.incompleto ? t('conParcial') : ''].filter(Boolean).join(' · ');
  return `<details class="consulta-ficha" open><summary><strong class="consulta-titulo">${escapeHtml(r.titulo || '')}</strong>${
    linea ? `<span class="consulta-linea">${escapeHtml(linea)}</span>` : ''}</summary>
    <div class="consulta-cuerpo">${r.cuerpo}</div></details>${htmlPieConsulta(d)}`;
}

// Fuente y licencia, siempre a la vista; en deportes, la hora y Actualizar.
function htmlPieConsulta(d){
  const enlace = (url, texto) => enlaceConsulta(url, texto) || escapeHtml(texto);
  const partes = [];
  if (d.tipo === 'contexto'){
    partes.push(enlace('https://www.wikipedia.org', 'Wikipedia'), enlace(d.licencia?.enlace, 'CC BY-SA'));
    if (d.ficha && historialWikipedia()) partes.push(enlace(historialWikipedia(), t('conAutores')));
  } else {
    if (d.fuente) partes.push(enlace(d.enlace, d.fuente));
    if (d.tipo === 'pelicula' || d.tipo === 'serie') partes.push('JustWatch');
    if (d.licencia) partes.push(enlace(d.licencia.enlace, /^Condiciones/.test(d.licencia.nombre) ? t('conCondiciones') : d.licencia.nombre));
  }
  if (!partes.length) return '';
  let pie = partes.join(' · ');
  if (esDeporteConsulta(d.tipo) && d.ficha){
    const hora = new Intl.DateTimeFormat(idiomaConsulta(), { hour: '2-digit', minute: '2-digit' });
    if (!isNaN(Date.parse(d.consultado))) pie += ' · ' + escapeHtml(t('conConsultado', { h: hora.format(new Date(d.consultado)) }));
    if (PUNTUAL.fallo) pie += ' · ' + escapeHtml(t('conNoActualizada'));
    if (PUNTUAL.fallo || !(Date.parse(d.caduca) > Date.now())) pie += ' ' + botonConsulta('actualizar', t('conActualizar'));
  }
  return `<p class="consulta-pie">${pie}</p>`;
}

function nombresIdioma(codigos = []){
  let dn = null;
  try { dn = new Intl.DisplayNames([idiomaConsulta()], { type: 'language' }); } catch(e){}
  const nombre = c => { try { return (dn && dn.of(c)) || c; } catch(e){ return c; } };
  return codigos.slice(0, 5).map(nombre).join(', ') + (codigos.length > 5 ? ` +${codigos.length - 5}` : '');
}

// Las palabras sueltas de la búsqueda (resultados:primera levante) se marcan
// en los equipos, con la regla del feed, sin filtrar: la lista es corta y la
// posición en la tabla o la jornada es parte del dato.
const casaEquipo = nombre => !!(PUNTUAL.texto && nombre && rangosResaltado(nombre, PUNTUAL.texto).length);
const equipoConsulta = nombre => (nombre == null ? '—' : PUNTUAL.texto ? resaltarTitular(String(nombre), PUNTUAL.texto) : escapeHtml(nombre));
const claseMarcada = si => (si ? ' class="consulta-marcada"' : '');

const COLUMNAS_CONSULTA = { pj: 'conColPJ', pts: 'conColPts', g: 'conColG', e: 'conColE', p: 'conColP' };
function tablaConsulta(filas, cols, nombre){
  const val = v => escapeHtml(v ?? '—');
  const th = k => { const [abr, largo] = t(COLUMNAS_CONSULTA[k]).split('|'); return `<th scope="col"><abbr title="${escapeHtml(largo || abr)}">${escapeHtml(abr)}</abbr></th>`; };
  return `<table class="consulta-tabla"><thead><tr><th scope="col">#</th><th scope="col">${escapeHtml(t(nombre))}</th>${cols.map(th).join('')}</tr></thead>
    <tbody>${filas.map(r => `<tr${claseMarcada(casaEquipo(r.equipo))}><td>${val(r.pos)}</td><td>${equipoConsulta(r.equipo)}</td>${cols.map(k => `<td>${val(r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function fichaAudiovisual(f, serie){
  const personas = (serie ? f.creacion : f.direccion) || [];
  const modos = { suscripcion: [], alquiler: [], compra: [] };
  for (const p of f.donde_ver || []) modos[p.modo]?.push(p.nombre);
  const donde = (f.donde_ver || []).length
    ? (modos.suscripcion.length ? `<p class="consulta-sub">${escapeHtml(t('conSuscripcion'))} (${modos.suscripcion.length})</p>${listaConsulta(modos.suscripcion)}` : '')
      + (modos.alquiler.length ? plegadoConsulta(`${t('conAlquiler')} (${modos.alquiler.length})`, listaConsulta(modos.alquiler)) : '')
      + (modos.compra.length ? plegadoConsulta(`${t('conCompra')} (${modos.compra.length})`, listaConsulta(modos.compra)) : '')
    : `<p>${escapeHtml(t('conSinDondeVer'))}</p>`;
  const reparto = (f.reparto || []).map(r => (r.personaje ? `${r.nombre} — ${r.personaje}` : r.nombre));
  const ficha = enlaceConsulta(`https://www.themoviedb.org/${PUNTUAL.id.split(':')[1] || ''}`, t('conVerEn', { x: 'TMDB' }));
  return {
    titulo: f.titulo,
    linea: (serie ? [f.anio, f.temporadas ? tn('conTemporadas', f.temporadas) : '']
      : [f.anio, f.duracion ? t('conMin', { n: f.duracion }) : '']).filter(Boolean).join(' · '),
    cuerpo: `<div class="consulta-media">${imgConsulta(f.poster)}<div>
        ${f.titulo_original && f.titulo_original !== f.titulo ? `<p>${escapeHtml(t('conOriginal'))}: ${escapeHtml(f.titulo_original)}</p>` : ''}
        ${personas.length ? `<p>${escapeHtml(t(serie ? 'conCreacion' : 'conDireccion'))}: ${escapeHtml(personas.join(', '))}</p>` : ''}
        ${f.generos?.length ? `<p>${escapeHtml(f.generos.join(' · '))}</p>` : ''}</div></div>
      ${f.sinopsis ? plegadoConsulta(t('conSinopsis'), `<p>${escapeHtml(f.sinopsis)}</p>`) : ''}
      ${reparto.length ? plegadoConsulta(t('conReparto', { n: reparto.length }), listaConsulta(reparto)) : ''}
      <p class="consulta-sub">${escapeHtml(t('conDondeVer'))}</p>${donde}
      <p class="consulta-nota">${escapeHtml(t('conJustWatch'))}${f.enlace_donde_ver && enlaceSeguro(f.enlace_donde_ver) ? ' · ' + enlaceConsulta(f.enlace_donde_ver, t('conVerOpciones')) : ''}</p>
      <p class="consulta-nota">${ficha ? ficha + ' · ' : ''}${escapeHtml(t('conAvisoTmdb'))}</p>`,
  };
}

// Cada tipo: título, segunda línea (lo que identifica la ficha) y el desplegable.
const FICHAS_CONSULTA = {
  libro(f){
    const autores = f.autores || [];
    const datos = [f.ediciones != null ? tn('conEdiciones', f.ediciones) : '', nombresIdioma(f.idiomas)].filter(Boolean).join(' · ');
    return {
      titulo: f.titulo,
      linea: [autores.map(a => a.nombre).filter(Boolean).join(', '), f.primer_anio].filter(Boolean).join(' · '),
      cuerpo: `<div class="consulta-media">${imgConsulta(f.portada)}<div>
        ${datos ? `<p>${escapeHtml(datos)}</p>` : ''}
        ${autores.map(a => botonFicha(a.id, a.nombre || t('conAutor'))).join('')}
        <p>${enlaceConsulta(olUrl(PUNTUAL.id), t('conVerEn', { x: 'Open Library' }))}</p></div></div>`,
    };
  },
  autor(f){
    const obras = f.obras_principales || [];
    const boton = o => botonFicha(o.id, o.titulo);
    return {
      titulo: f.nombre,
      linea: [[f.nacimiento, f.fallecimiento].filter(Boolean).join('–'), obras.length ? tn('conObrasRecibidas', obras.length) : ''].filter(Boolean).join(' · '),
      cuerpo: `<div class="consulta-media">${imgConsulta(f.foto)}<div>
        ${obras.length ? `<p class="consulta-sub">${escapeHtml(t('conObras'))}</p>${obras.slice(0, 3).map(boton).join('')}` : ''}
        ${obras.length > 3 ? plegadoConsulta(t('conVerTodas', { n: obras.length }), obras.slice(3).map(boton).join('')) : ''}
        <p>${enlaceConsulta(olUrl(PUNTUAL.id), t('conVerEn', { x: 'Open Library' }))}</p></div></div>`,
    };
  },
  pelicula: f => fichaAudiovisual(f, false),
  serie: f => fichaAudiovisual(f, true),
  clasificacion(f){
    const deporte = ESPN[f.competicion]?.[0];
    const grupos = f.grupos || [];
    const primero = grupos[0]?.filas?.[0];
    let linea = '';
    if (primero) linea = deporte === 'basketball'
      ? `${grupos[0].nombre ? grupos[0].nombre + ': ' : ''}${primero.equipo} · ${primero.g ?? '—'}–${primero.p ?? '—'}`
      : `${primero.pos ?? '—'}. ${primero.equipo}${primero.pts != null ? ' · ' + tn('conPuntos', primero.pts) : ''}`;
    const cols = deporte === 'basketball' ? ['g', 'p'] : deporte === 'racing' ? ['pts'] : ['pj', 'pts'];
    const nombre = deporte === 'racing' ? 'conColNombre' : 'conColEquipo';
    const tablas = grupos.length === 1 ? tablaConsulta(grupos[0].filas, cols, nombre)
      : grupos.map((g, i) => plegadoConsulta(`${g.nombre || ''} (${g.filas.length})`, tablaConsulta(g.filas, cols, nombre),
        i === 0 || g.filas.some(r => casaEquipo(r.equipo)))).join('');
    const desglose = deporte === 'soccer'
      ? grupos.map(g => plegadoConsulta(t('conDesglose'), tablaConsulta(g.filas, ['g', 'e', 'p'], nombre))).join('') : '';
    return { titulo: [CONSULTA_DEPORTES[f.competicion] || f.competicion, f.temporada].filter(Boolean).join(' · '), linea, cuerpo: tablas + desglose };
  },
  resultados(f){
    const lang = idiomaConsulta();
    const dia = new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short' });
    const hora = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' });
    const partidos = f.partidos || [];
    const cuenta = {};
    for (const p of partidos) cuenta[p.estado] = (cuenta[p.estado] || 0) + 1;
    const estado = { en_juego: 'conEnJuego', final: 'conFinal', programado: 'conProgramado' };
    // Por día en la zona del lector, en el orden de la respuesta.
    const dias = new Map();
    for (const p of partidos){
      const fecha = new Date(p.inicio);
      const clave = isNaN(fecha) ? '' : dia.format(fecha);
      if (!dias.has(clave)) dias.set(clave, []);
      dias.get(clave).push(p);
    }
    const marcador = v => escapeHtml(v ?? '—');
    const cuerpo = [...dias].map(([fecha, lista]) => `${fecha ? `<p class="consulta-sub">${escapeHtml(fecha)}</p>` : ''}<ul class="consulta-partidos">${
      lista.map(p => {
        const inicio = new Date(p.inicio);
        const cab = [p.estado === 'programado' && !isNaN(inicio) ? hora.format(inicio) : '', estado[p.estado] ? t(estado[p.estado]) : ''].filter(Boolean).join(' · ');
        return `<li${claseMarcada(casaEquipo(p.local) || casaEquipo(p.visitante))}><span class="consulta-estado">${escapeHtml(cab)}</span><span>${equipoConsulta(p.local)}</span><b>${marcador(p.marcador?.local)}</b><span>${equipoConsulta(p.visitante)}</span><b>${marcador(p.marcador?.visitante)}</b></li>`;
      }).join('')}</ul>`).join('');
    return {
      titulo: `${CONSULTA_DEPORTES[f.competicion] || f.competicion} · ${tn('conPartidos', partidos.length)}`,
      linea: [['en_juego', 'conNEnJuego'], ['final', 'conNFinal'], ['programado', 'conNProgramado']]
        .filter(([e]) => cuenta[e]).map(([e, k]) => tn(k, cuenta[e])).join(' · '),
      cuerpo,
    };
  },
  contexto(f){
    const ol = (f.ids?.openlibrary || []).find(x => /^OL\d+[AW]$/.test(x));
    const qid = /^Q\d+$/.test(f.qid || '') ? f.qid : '';
    const articulo = enlaceConsulta(f.enlace, t('conArticulo'));
    return {
      titulo: f.titulo,
      linea: (PUNTUAL.candidato?.id === PUNTUAL.id && PUNTUAL.candidato.detalle) || f.resumen || '',
      cuerpo: `${f.resumen ? `<p>${escapeHtml(f.resumen)}</p>` : ''}
        ${articulo ? `<p>${articulo}</p>` : ''}
        ${qid ? `<p class="consulta-nota">${escapeHtml(t('conDatos'))}: ${enlaceConsulta(`https://www.wikidata.org/wiki/${qid}`, 'Wikidata')} · CC0</p>` : ''}
        ${ol ? botonFicha(`openlibrary:${ol}`, t('conFichaOL')) : ''}`,
    };
  },
};
/* Panel técnico: lee los resúmenes públicos ya calculados, bajo demanda.
   Cuenta los titulares guardados en el archivo de cada día, no artículos
   únicos por publicación. Solo se muestra lo que trae datos: un hueco no es un cero. */
const ESTADISTICAS = {
  abierto: false, vista: 'resumen', fecha: '', ambito: '', dominio: '', consulta: '', destino: null,
  indice: null, dia: null, cargando: false, error: false, familias: new Set(), secuencia: 0,
  controller: null, cache: new Map(), origen: null, scroll: 0,
};
const iconoEstadisticas = () => '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3v17h17M8 16v-5m5 5V6m5 10v-8"/></svg>';
const estNumero = n => Number.isFinite(n) ? new Intl.NumberFormat(ACCES.lang).format(n) : '—';
const estHoy = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
const estFechaValida = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
function estFecha(s, corta = false){
  return estFechaValida(s) ? new Intl.DateTimeFormat(ACCES.lang, { day: 'numeric', month: 'short', ...(corta ? {} : { year: 'numeric' }), timeZone: 'UTC' }).format(new Date(s + 'T12:00:00Z')) : '—';
}
function estGenerado(s){
  const d = new Date(s);
  return isNaN(d) ? '—' : new Intl.DateTimeFormat(ACCES.lang, { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Madrid' }).format(d);
}
const estPorcentaje = (n, total) => Number.isFinite(n) && total > 0 ? `${Math.round(n / total * 100)} %` : null;
const estDuracion = min => !Number.isFinite(min) ? null : min < 90 ? `${min} min` : `${Math.round(min / 60)} h`;

// Ámbito: 'todos', 'modo:<id>' o 'grupo:<grupo o familia>'. Sin elección
// propia (o si el modo elegido ya no existe) sigue al modo activo.
const estModo = ambito => ambito?.startsWith('modo:') ? PRESETS.lista.find(p => 'modo:' + p.id === ambito) || null : null;
function estAmbito(){
  const a = ESTADISTICAS.ambito;
  if (a && (!a.startsWith('modo:') || estModo(a))) return a;
  return PRESET_ACTIVO && estModo('modo:' + PRESETS.activo) ? 'modo:' + PRESETS.activo : 'todos';
}
// Los temas y palabras de un modo no amplían este conjunto. ignore gana a su grupo.
// `extra`: dominios con datos que ya no están en el catálogo; sin ellos «Todos»
// no cuadra con el total del día.
function seleccionEstadisticas(catalogo, ambito, modos = [], extra = []){
  const todos = [...new Set([...Object.keys(catalogo), ...extra])];
  if (ambito.startsWith('grupo:')){
    const g = ambito.slice(6);
    return todos.filter(d => catalogo[d]?.g === g || catalogo[d]?.g.startsWith(g + ' · '));
  }
  if (!ambito.startsWith('modo:')) return todos;
  const modo = modos.find(p => 'modo:' + p.id === ambito);
  if (!modo) return [];
  if (modo.regla){
    const regla = compilarRegla(modo);
    if (regla) return [...new Set([...todos, ...Object.keys(modo.overrides || {})])]
      .filter(d => regla.pasaFuentes({ dominio: d, grupo: catalogo[d]?.g }));
  }
  const ov = modo.overrides || {}, grupos = new Set(modo.grupos || []);
  const incluido = d => ov[d] === 'include' || ov[d] === 'first';
  return [...new Set([...todos, ...Object.keys(ov)])].filter(d => ov[d] !== 'ignore' && (incluido(d) || grupos.has(catalogo[d]?.g)));
}
function sumarEstadisticas(medios, dominios){
  const pubs = dominios.map(d => medios[d]?.pub).filter(p => Number.isFinite(p?.titulares));
  const porHora = Array(24).fill(0);
  for (const p of pubs) (p.por_hora || []).slice(0, 24).forEach((n, h) => { if (Number.isFinite(n)) porHora[h] += n; });
  return { titulares: pubs.length ? pubs.reduce((n, p) => n + p.titulares, 0) : null,
    conHora: pubs.reduce((n, p) => n + (p.fechas?.con_hora || 0), 0), disponibles: pubs.length, conTitulares: pubs.filter(p => p.titulares > 0).length,
    seleccionados: dominios.length, porHora };
}
// «Regional · Galicia» se pliega bajo «Regional»; una familia de un solo grupo
// se muestra como ese grupo. Mapa familia → grupo → dominios.
function familiasEstadisticas(catalogo, dominios, sinGrupo){
  const familias = new Map();
  for (const d of dominios){
    const g = catalogo[d]?.g || sinGrupo, f = g.split(' · ')[0];
    if (!familias.has(f)) familias.set(f, new Map());
    const grupos = familias.get(f);
    if (!grupos.has(g)) grupos.set(g, []);
    grupos.get(g).push(d);
  }
  return familias;
}
// Días con fichero publicado (35 en el índice; la serie solo trae 30).
function estDias(indice){ return indice.dias.map(d => d.fecha).filter(f => f <= estHoy()).sort(); }
function estUltimoDia(indice){ return estDias(indice).at(-1); }
// Los 30 días del índice, siempre enteros: elegir un día no mueve la gráfica.
function serieEstadisticas(indice, dominios, campo = 'titulares'){
  return indice.serie_dias.map((fecha, i) => {
    const valores = dominios.map(d => indice.serie[d]?.[campo]?.[i]).filter(Number.isFinite);
    return { fecha, valor: valores.length ? valores.reduce((a, b) => a + b, 0) : null, medios: valores.length };
  });
}
function validarIndiceEstadisticas(p){
  if (!p || !Array.isArray(p.dias) || !p.medios || Array.isArray(p.medios) || typeof p.medios !== 'object'
      || !Array.isArray(p.serie_dias) || !p.serie || typeof p.serie !== 'object' || Array.isArray(p.serie)
      || typeof p.generado !== 'string' || isNaN(Date.parse(p.generado))
      || !p.dias.every(d => estFechaValida(d.fecha)) || !p.serie_dias.every(estFechaValida)
      || !Object.values(p.serie).every(s => s && Array.isArray(s.titulares) && s.titulares.length === p.serie_dias.length && s.titulares.every(n => n == null || Number.isFinite(n) && n >= 0))
      || !Object.values(p.medios).every(m => m && typeof m.n === 'string' && typeof m.g === 'string')) throw new Error('formato');
  return p;
}
function estDominios(){
  const { indice } = ESTADISTICAS;
  return seleccionEstadisticas(indice.medios, estAmbito(), PRESETS.lista, [...Object.keys(indice.serie), ...Object.keys(estDatoDia()?.medios || {})]);
}
function estDatoDia(){ return ESTADISTICAS.dia?.fecha === ESTADISTICAS.fecha ? ESTADISTICAS.dia : null; }
function estBoton(accion, texto, valor = ''){
  return `<button type="button" data-est="${accion}" data-valor="${escapeHtml(valor)}">${escapeHtml(texto)}</button>`;
}
function estTabla(cabeceras, filas){
  return `<div class="est-tabla" tabindex="0"><table><thead><tr>${cabeceras.map(c => `<th scope="col">${escapeHtml(t(c))}</th>`).join('')}</tr></thead><tbody>${filas.map(f => `<tr>${f.map((v, i) => i ? `<td>${v}</td>` : `<th scope="row">${v}</th>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
// Lo que no tiene dato no se pinta: un «0» o un «—» de relleno no informa.
function estMetricas(pares){
  const visibles = pares.filter(([, v]) => v != null && v !== '');
  return visibles.length ? `<dl class="est-metricas">${visibles.map(([clave, v]) => `<div><dt>${escapeHtml(t(clave))}</dt><dd>${typeof v === 'number' ? estNumero(v) : escapeHtml(v)}</dd></div>`).join('')}</dl>` : '';
}
const estAlto = (n, max) => `--est-valor:${n ? Math.max(2, n / max * 100) : 0}%`;
function estEvolucion(dominios, nota = ''){
  const puntos = serieEstadisticas(ESTADISTICAS.indice, dominios);
  if (!puntos.some(p => p.valor != null)) return '';
  const max = Math.max(1, ...puntos.map(p => p.valor || 0));
  // Cada barra abre su día: en móvil no hay title que leer al pasar.
  return `<h3>${escapeHtml(t('estEvolucion'))}</h3><div class="est-grafico"><span class="est-escala">${estNumero(max)}</span>
    <div class="est-barras" role="group" aria-label="${escapeHtml(t('estEvolucion'))}">${puntos.map(p => {
      const texto = `${estFecha(p.fecha)}: ${p.valor == null ? t('estSinDatos') : estNumero(p.valor)}`;
      return `<button type="button" data-est="fecha" data-valor="${p.fecha}"${p.fecha === ESTADISTICAS.fecha ? ' aria-current="date"' : ''}${p.valor == null ? ' disabled' : ''} style="${estAlto(p.valor, max)}" aria-label="${escapeHtml(texto)}" title="${escapeHtml(texto)}"><i></i></button>`;
    }).join('')}</div>
    <div class="est-eje"><span>${escapeHtml(estFecha(puntos[0].fecha, true))}</span><span>${escapeHtml(estFecha(puntos.at(-1).fecha, true))}</span></div></div>
    <p class="est-nota">${nota ? escapeHtml(nota) + ' ' : ''}${escapeHtml(t('estBarrasDia'))}</p>`;
}
// Sin hora de publicación, el titular cuenta a la estimada o a la de recogida.
function estHoras(porHora, sinHora = 0){
  if (!porHora?.some(n => n > 0)) return '';
  const max = Math.max(...porHora), pico = t('estPico', { hora: porHora.indexOf(max), n: estNumero(max) });
  return `<h3>${escapeHtml(t('estPorHora'))}</h3><div class="est-grafico"><span class="est-escala">${estNumero(max)}</span>
    <div class="est-barras est-horas" role="img" aria-label="${escapeHtml(pico)}">${porHora.map((n, h) => `<span style="${estAlto(n, max)}" title="${h} h: ${estNumero(n)}"><i></i></span>`).join('')}</div>
    <div class="est-eje">${[0, 6, 12, 18, 23].map(h => `<span>${h} h</span>`).join('')}</div></div>
    <p class="est-nota">${escapeHtml(pico)}${sinHora > 0 ? ' ' + escapeHtml(t('estHorasEstimadas', { n: estNumero(sinHora) })) : ''}</p>`;
}
function estSecciones(secciones){
  const filas = Object.entries(secciones || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (filas.length < 2) return '';
  return `<h3>${escapeHtml(t('estSecciones'))}</h3><ul class="est-ranking">${filas.map(([s, n]) =>
    `<li><span>${escapeHtml(s.replaceAll('-', ' '))}</span><b>${estNumero(n)}</b><i style="${estAlto(n, filas[0][1])}"></i></li>`).join('')}</ul>`;
}
// Familias y grupos, de más a menos titulares. Con una sola fila no hay desglose.
function estGrupos(dia, ids){
  const volumen = ds => sumarEstadisticas(dia.medios, ds).titulares ?? -1;
  const fila = (nombre, ds) => { const s = sumarEstadisticas(dia.medios, ds); return [nombre, estNumero(s.titulares), t('estNDe', { n: estNumero(s.conTitulares), total: estNumero(ds.length) })]; };
  const familias = [...familiasEstadisticas(ESTADISTICAS.indice.medios, ids, t('estSinSeguimiento'))]
    .map(([f, grupos]) => [f, grupos, [...grupos.values()].flat()]).sort((a, b) => volumen(b[2]) - volumen(a[2]));
  if (familias.length < 2 && (familias[0]?.[1].size || 0) < 2) return '';
  const filas = [];
  for (const [f, grupos, ds] of familias){
    if (grupos.size === 1){ filas.push(fila(escapeHtml([...grupos.keys()][0]), ds)); continue; }
    const abierta = ESTADISTICAS.familias.has(f);
    filas.push(fila(`<button type="button" data-est="familia" data-valor="${escapeHtml(f)}" aria-expanded="${abierta}">${escapeHtml(f)}</button>`, ds));
    if (abierta) for (const [g, gs] of [...grupos].sort((a, b) => volumen(b[1]) - volumen(a[1])))
      filas.push(fila(`<span class="est-subgrupo">${escapeHtml(g.slice(f.length).replace(/^ · /, '') || g)}</span>`, gs));
  }
  return `<h3>${escapeHtml(t('estPorGrupo'))}</h3>${estTabla(['estGrupo', 'estTitulares', 'estMediosTitulares'], filas)}`;
}
// Pasadas del recolector: solo cuando el día las trae. Un contador a cero
// (rescates, huecos, rachas) no se pinta; «48 de 48 buenas» sí informa.
function estRecogida(runs){
  if (!runs?.pasadas) return '';
  const errores = Object.entries(runs.errores || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return `<h3>${escapeHtml(t('estRecogida'))}</h3>`
    + (runs.ultimo_estado === 'fallo' ? `<p class="est-aviso">${escapeHtml(t('estUltimaFallo'))}</p>` : '')
    + estMetricas([
      ['estPasadasBuenas', t('estNDe', { n: estNumero(runs.ok), total: estNumero(runs.pasadas) })],
      ['estVentana', estDuracion(runs.ventana_min?.p50)],
      ['estRescates', runs.rescates || null],
      ['estRachaFallos', runs.racha_fallos_min ? estDuracion(runs.racha_fallos_min) : null],
    ])
    + (errores.length ? estTabla(['estError', 'estOcurrencias'], errores.map(([k, v]) => [escapeHtml(k), estNumero(v)])) : '');
}
function estSinDia(){
  const ultimo = estUltimoDia(ESTADISTICAS.indice);
  return `<p class="est-aviso">${escapeHtml(t('estSinDia'))}${ultimo && ultimo !== ESTADISTICAS.fecha ? ' ' + estBoton('fecha', t('estVerDia', { fecha: estFecha(ultimo) }), ultimo) : ''}</p>`;
}
function estResumen(){
  const dia = estDatoDia(), ids = estDominios();
  // La pestaña ya dice dónde se está: el título queda para el lector de pantalla y el foco.
  const titulo = `<h2 id="est-vista-titulo" class="sr-only" tabindex="-1">${escapeHtml(t('estResumen'))}</h2>`;
  if (!dia) return titulo + estSinDia() + estEvolucion(ids);
  const total = sumarEstadisticas(dia.medios, ids);
  return titulo + estMetricas([['estTitulares', total.titulares],
      ['estMediosTitulares', total.disponibles ? t('estNDe', { n: estNumero(total.conTitulares), total: estNumero(total.seleccionados) }) : null]])
    + estEvolucion(ids) + estHoras(total.porHora, total.titulares - total.conHora) + estGrupos(dia, ids);
}
// Miniatura de 30 días: deja ver de un vistazo un medio que se ha callado.
function estMiniatura(valores){
  const v = (valores || []).map(n => Number.isFinite(n) ? n : null);
  if (!v.some(n => n != null)) return '';
  const max = Math.max(1, ...v.filter(n => n != null)), paso = 100 / Math.max(1, v.length - 1), tramos = [[]];
  v.forEach((n, i) => n == null ? tramos.push([]) : tramos.at(-1).push(`${(i * paso).toFixed(1)},${(19 - n / max * 18).toFixed(1)}`));
  return `<svg class="est-mini" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">${tramos.filter(p => p.length).map(p => `<polyline points="${p.length > 1 ? p.join(' ') : p[0] + ' ' + p[0]}"/>`).join('')}</svg>`;
}
function estListaMedios(){
  const s = ESTADISTICAS, catalogo = s.indice.medios, dia = estDatoDia(), q = normalize(s.consulta);
  const nombre = d => catalogo[d]?.n || d, titulares = d => dia?.medios[d]?.pub?.titulares;
  // Cualquier pasada fallida cuenta; que fallara la última se dice aparte.
  const fallo = d => {
    const r = dia?.medios[d]?.runs;
    if (!(r?.pasadas > r?.ok)) return [];
    return [`${t('estConFallos')} (${t('estNDe', { n: estNumero(r.pasadas - r.ok), total: estNumero(r.pasadas) })})`,
      ...(r.ultimo_estado === 'fallo' ? [t('estFalloUltima')] : [])];
  };
  const ids = estDominios().filter(d => normalize(d + ' ' + nombre(d)).includes(q))
    .sort((a, b) => (titulares(b) ?? -1) - (titulares(a) ?? -1) || nombre(a).localeCompare(nombre(b)));
  return ids.length ? estTabla(['estMedio', 'estTitulares', 'estUltimos30'], ids.map(d => [
      estBoton('medio', nombre(d), d) + `<small>${escapeHtml([d, catalogo[d]?.g || t('estSinSeguimiento'), ...fallo(d)].join(' · '))}</small>`,
      estNumero(titulares(d)), estMiniatura(s.indice.serie[d]?.titulares),
    ])) : `<p>${escapeHtml(t('estSinMedios'))}</p>`;
}
// Al escribir solo cambia la lista: recrear el campo cierra el teclado del móvil.
function estDirectorio(){
  return `<h2 id="est-vista-titulo" class="sr-only" tabindex="-1">${escapeHtml(t('estMedios'))}</h2>
    <label class="est-buscar">${escapeHtml(t('estBuscarMedio'))}<input type="search" id="est-buscar-medio" value="${escapeHtml(ESTADISTICAS.consulta)}" autocomplete="off"></label>
    <div id="est-lista">${estListaMedios()}</div>`;
}
function estFicha(){
  const s = ESTADISTICAS, d = s.dominio, m = s.indice.medios[d], dia = estDatoDia(), pub = dia?.medios[d]?.pub, runs = dia?.medios[d]?.runs;
  const cabecera = `<div class="est-ficha-cab">${estBoton('medios', t('estVolverMedios'))}<h2 id="est-vista-titulo" tabindex="-1">${escapeHtml(m?.n || d)}</h2></div>
    <p class="est-nota">${[d, m?.g || t('estSinSeguimiento'), pub?.fuentes && Object.keys(pub.fuentes).join(', ')].filter(Boolean).map(escapeHtml).join(' · ')}</p>`;
  // Un medio que salió del catálogo conserva su ficha mientras tenga datos.
  const serie = s.indice.serie[d];
  if (!m && !serie && !dia?.medios[d]) return cabecera;
  // Un día con pasadas y sin titulares (feed caído) también entra en el histórico.
  const dias = s.indice.serie_dias.map((fecha, i) => ({ fecha, titulares: serie?.titulares?.[i], conHora: serie?.con_hora?.[i], pasadas: serie?.pasadas?.[i], ok: serie?.ok?.[i] }))
    .filter(x => Number.isFinite(x.titulares) || x.pasadas > 0);
  const conTitulares = dias.filter(x => Number.isFinite(x.titulares)), conPasadas = dias.some(x => x.pasadas > 0);
  const media = conTitulares.length ? Math.round(conTitulares.reduce((n, x) => n + x.titulares, 0) / conTitulares.length) : null;
  // La media es de los 30 días: va con su gráfica, no entre las cifras del día.
  const notaMedia = media == null ? '' : t('estMediaDias', { n: estNumero(media), dias: estNumero(conTitulares.length) });
  // Como en la serie, con titulares del medio la cuenta que falta es 0, no un hueco.
  const conHora = pub ? pub.fechas?.con_hora || 0 : null;
  const delDia = !dia ? estSinDia() : !pub ? `<p class="est-aviso">${escapeHtml(t('estSinDatos'))}</p>` : estMetricas([
    ['estTitulares', pub.titulares],
    ['estConHora', estPorcentaje(conHora, pub.titulares)],
    ['estHorario', pub.primera && pub.ultima ? `${pub.primera}–${pub.ultima}` : null],
    ['estRetraso', estDuracion(pub.retraso_min?.p50)],
  ]);
  return cabecera + delDia + estEvolucion([d], notaMedia) + estHoras(pub?.por_hora, pub ? pub.titulares - conHora : 0) + estSecciones(pub?.secciones) + estRecogida(runs)
    + (dias.length ? `<h3>${escapeHtml(t('estHistorico'))}</h3>` + estTabla(['estDia', 'estTitulares', 'estConHora', ...(conPasadas ? ['estPasadasBuenas'] : [])], dias.reverse().map(x => [
      estBoton('fecha', estFecha(x.fecha), x.fecha), estNumero(x.titulares), estPorcentaje(x.conHora, x.titulares) || '—',
      ...(conPasadas ? [x.pasadas > 0 ? t('estNDe', { n: estNumero(x.ok), total: estNumero(x.pasadas) }) : '—'] : [])])) : '');
}
// ‹ día › como en Plausible: se pasa de un día con datos al siguiente sin abrir
// el calendario. El calendario solo ofrece días con fichero publicado.
function estFiltros(){
  const s = ESTADISTICAS, ambito = estAmbito(), catalogo = s.indice?.medios || {};
  const option = (valor, texto) => `<option value="${escapeHtml(valor)}"${ambito === valor ? ' selected' : ''}>${escapeHtml(texto)}</option>`;
  // Las familias con varios grupos («Regional») van delante de los suyos.
  const grupos = [...new Set(Object.values(catalogo).flatMap(m => m.g.includes(' · ') ? [m.g, m.g.split(' · ')[0]] : [m.g]))].sort((a, b) => a.localeCompare(b));
  const dias = s.indice ? estDias(s.indice) : [];
  const anterior = dias.filter(f => f < s.fecha).at(-1), siguiente = dias.find(f => f > s.fecha), datos = estDatoDia();
  const paso = (id, valor, clave, icono) => `<button type="button" id="${id}" class="est-paso" data-est="fecha" data-valor="${valor || ''}"${valor ? '' : ' disabled'} aria-label="${escapeHtml(t(clave))}" title="${escapeHtml(t(clave))}">${ico(icono)}</button>`;
  const fecha = `<div class="est-dia">${paso('est-dia-anterior', anterior, 'estDiaAnterior', 'chevron-left')}
    <label><span class="sr-only">${escapeHtml(t('estDiaArchivo'))}</span><input id="est-fecha" type="date" value="${escapeHtml(s.fecha)}"${dias.length ? ` min="${dias[0]}" max="${dias.at(-1)}"` : ''}></label>
    ${paso('est-dia-siguiente', siguiente, 'estDiaSiguiente', 'chevron-right')}${datos && !datos.cerrado ? `<span class="est-revisable">${escapeHtml(t('estRevisable'))}</span>` : ''}</div>`;
  if (s.vista === 'medio') return `<div class="est-filtros">${fecha}</div>`;
  return `<div class="est-filtros">${fecha}<label><span class="sr-only">${escapeHtml(t('estAmbito'))}</span><select id="est-ambito">${option('todos', t('estTodos'))}
    ${PRESETS.lista.length ? `<optgroup label="${escapeHtml(t('estModos'))}">${PRESETS.lista.map(p => option('modo:' + p.id, p.nombre)).join('')}</optgroup>` : ''}
    ${grupos.length ? `<optgroup label="${escapeHtml(t('estGrupos'))}">${grupos.map(g => option('grupo:' + g, g)).join('')}</optgroup>` : ''}</select></label></div>`;
}
function pintarEstadisticas(){
  const s = ESTADISTICAS, panel = document.getElementById('estadisticas-panel');
  if (!panel) return;
  panel.hidden = !s.abierto;
  document.body.classList.toggle('estadisticas-abiertas', s.abierto);
  document.getElementById('btn-estadisticas')?.setAttribute('aria-expanded', String(s.abierto));
  if (!s.abierto) return;
  const foco = panel.contains(document.activeElement) ? document.activeElement : null;
  const idFoco = foco?.id, accionFoco = foco?.dataset.est, valorFoco = foco?.dataset.valor;
  // Mientras llega otro día se deja el contenido anterior, no un aviso de «sin datos».
  const previo = panel.querySelector('.est-contenido');
  panel.setAttribute('aria-label', t('estTitulo'));
  panel.setAttribute('aria-busy', String(s.cargando));
  let contenido = '';
  if (s.indice){
    if (estModo(estAmbito()) && !estDominios().length) contenido = `<p>${escapeHtml(t('estModoSinMedios'))}</p>`;
    else contenido = ({ resumen: estResumen, medios: estDirectorio, medio: estFicha }[s.vista] || estResumen)();
    if (s.cargando && !estDatoDia() && previo) contenido = previo.innerHTML;
  }
  const datos = estDatoDia(), generado = datos?.generado || s.indice?.generado;
  // Dos filas arriba: pestañas y acciones; luego día y selección. El nombre
  // del panel ya lo lleva su aria-label.
  panel.innerHTML = `<div class="est-cabecera">
    <nav class="est-nav" aria-label="${escapeHtml(t('estTitulo'))}">${['resumen', 'medios'].map(v => `<button type="button" data-est="${v}"${(v === 'medios' ? s.vista !== 'resumen' : s.vista === v) ? ' aria-current="page"' : ''}>${escapeHtml(t(v === 'resumen' ? 'estResumen' : 'estMedios'))}</button>`).join('')}</nav>
    <div class="est-acciones">
      <button type="button" data-est="renovar"${s.cargando ? ' disabled' : ''} aria-label="${escapeHtml(t('estActualizar'))}" title="${escapeHtml(t('estActualizar'))}">${ico('refresh-cw')}</button>
      <button type="button" data-est="cerrar" aria-label="${escapeHtml(t('estCerrar'))}" title="${escapeHtml(t('estCerrar'))}">${ico('x')}</button></div>
    ${estFiltros()}</div>
    <div class="est-cuerpo">
    <p class="est-estado" role="status">${s.error ? escapeHtml(t('estErrorCarga')) + ' ' + estBoton('renovar', t('estReintentar')) : s.cargando ? escapeHtml(t('estCargando')) : ''}</p>
    <div class="est-contenido">${contenido}</div>
    <p id="total-r2" class="est-nota est-pie" hidden></p>
    <p class="est-nota est-pie">${escapeHtml(t('estMetodo'))}${generado ? ' ' + escapeHtml(t('estGenerado', { fecha: estGenerado(generado) })) : ''}</p></div>`;
  renderTotalR2();
  // Repintar una tabla no debe expulsar el teclado al body.
  const siguiente = idFoco ? document.getElementById(idFoco) : [...panel.querySelectorAll('[data-est]')].find(b => b.dataset.est === accionFoco && b.dataset.valor === valorFoco);
  // Al llegar al primer o último día la flecha se desactiva: el foco pasa a la fecha.
  (siguiente?.disabled ? document.getElementById('est-fecha') : siguiente)?.focus({ preventScroll: true });
}

async function pedirEstadisticas(nombre, signal){
  const bases = [DATA_BASE, ...Object.values(BACKENDS).map(b => b.data)].filter((b, i, a) => a.indexOf(b) === i);
  let error;
  for (const base of bases){
    try {
      const r = await fetch(`${base}/${nombre}`, { cache: 'no-cache', signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e){ if (signal.aborted) throw e; error = e; }
  }
  throw error;
}
async function cargarEstadisticas(renovar = false){
  const s = ESTADISTICAS, secuencia = ++s.secuencia;
  s.controller?.abort();
  const controller = s.controller = new AbortController();
  s.cargando = true; s.error = false; pintarEstadisticas();
  try {
    const indice = renovar || !s.indice ? validarIndiceEstadisticas(await pedirEstadisticas('estadisticas.json', controller.signal)) : s.indice;
    // Sin día elegido, el último calculado: el de hoy casi nunca lo está aún.
    const fecha = s.fecha || estUltimoDia(indice) || estHoy();
    let dia = null;
    const cacheKey = indice.generado + '/' + fecha;
    if (indice.dias.some(d => d.fecha === fecha)){
      dia = !renovar && s.cache.get(cacheKey) || await pedirEstadisticas(`estadisticas-dia-${fecha}.json`, controller.signal);
      if (dia.fecha !== fecha || !dia.medios || typeof dia.medios !== 'object' || Array.isArray(dia.medios)
          || !Object.values(dia.medios).every(m => m && (!m.pub || Number.isFinite(m.pub.titulares) && m.pub.titulares >= 0))) throw new Error('formato');
    }
    if (secuencia !== s.secuencia || !s.abierto) return;
    // Publicar juntos índice y detalle: un fallo conserva el resultado anterior.
    s.indice = indice; s.dia = dia; s.fecha = fecha;
    if (dia){ if (s.cache.size >= 30) s.cache.clear(); s.cache.set(cacheKey, dia); }
    if (s.destino != null){
      const destino = s.destino; s.destino = null;
      if (destino === 'mis-medios') { s.ambito = ''; s.vista = 'medios'; }
      else if (destino){
        const hits = Object.entries(indice.medios).filter(([d, m]) => normDomain(d) === normDomain(destino) || normalize(m.n) === normalize(destino));
        if (hits.length === 1){ s.dominio = hits[0][0]; s.vista = 'medio'; }
        else if (!hits.length && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(destino)){ s.dominio = destino.toLowerCase(); s.vista = 'medio'; }
        else { s.ambito = 'todos'; s.consulta = destino; s.vista = 'medios'; }
      }
    }
  } catch (e){ if (secuencia === s.secuencia && !controller.signal.aborted) s.error = true; }
  finally { if (secuencia === s.secuencia){ s.cargando = false; pintarEstadisticas(); } }
}
function abrirEstadisticas(destino = '', origen = null){
  cerrarCalendario(false);
  const s = ESTADISTICAS;
  if (!s.abierto){ s.origen = origen || document.activeElement; s.scroll = window.scrollY; }
  s.abierto = true; s.destino = destino;
  if (destino && destino !== 'mis-medios') s.consulta = '';
  const carga = cargarEstadisticas(), secuencia = s.secuencia;
  carga.then(() => { if (s.abierto && s.secuencia === secuencia) document.getElementById('est-vista-titulo')?.focus({ preventScroll: true }); });
  estEncajar(true);
}
// Al abrir, y al cambiar de vista o de día desde más abajo, el panel vuelve a
// empezar bajo la cabecera: una ficha más corta no deja ver el feed.
function estEncajar(siempre = false){
  const barra = document.getElementById('barra-sup');
  requestAnimationFrame(() => {
    const p = document.getElementById('estadisticas-panel');
    if (!ESTADISTICAS.abierto || !p) return;
    const alto = barra?.getBoundingClientRect().height || 0, top = p.getBoundingClientRect().top - alto - 8;
    if (!siempre && top >= 0) return;
    barra?.classList.remove('cab-oculta');
    window.scrollTo({ top: Math.max(0, window.scrollY + top), behavior: 'auto' });
  });
}
function cerrarEstadisticas(volver = true){
  const s = ESTADISTICAS;
  if (!s.abierto) return;
  s.abierto = false; s.secuencia++; s.controller?.abort(); s.cargando = false;
  pintarEstadisticas();
  if (!volver) return;
  const origen = s.origen?.isConnected && s.origen.getClientRects().length ? s.origen : document.getElementById('btn-estadisticas');
  const menu = origen?.closest?.('#cab-menu');
  (menu && !menu.open ? menu.querySelector('summary') : origen)?.focus({ preventScroll: true });
  window.scrollTo({ top: s.scroll, behavior: 'auto' });
}

// Se consume la orden solo al confirmarla. Escribir «estadísticas» sigue
// siendo una búsqueda normal; el texto restante nunca contiene la orden.
function ordenEstadisticas(raw){
  // tokenizeQuery espera comillas cerradas. Mientras se completa un nombre,
  // tampoco enviar ese fragmento a la búsqueda de noticias.
  const abierto = raw.match(/(?:^|\s)(?:estadisticas|stats):"([^"]*)$/i);
  const incompleto = abierto && (raw.slice(0, abierto.index).match(/"/g) || []).length % 2 === 0 ? abierto : null;
  const todos = tokenizeQuery(incompleto ? raw.slice(0, incompleto.index) : raw), esOrden = x => /^(estadisticas|stats)$/i.test(x.prefix);
  const tokens = todos.filter(esOrden);
  if (!tokens.length && !incompleto) return null;
  return { destino: incompleto ? incompleto[1] : tokens.at(-1).text, resto: todos.filter(x => !esOrden(x)).map(x => x.raw).join(' ') };
}
function consumirOrdenEstadisticas(){
  const input = document.getElementById('buscar'), orden = ordenEstadisticas(input.value);
  if (!orden) return false;
  input.value = orden.resto; cerrarSugerencias();
  document.getElementById('buscar-clear').hidden = !input.value;
  aplicarFiltros(); abrirEstadisticas(orden.destino, input);
  return true;
}
function sugerenciasEstadisticas(raw){
  const m = raw.match(/(?:^|\s)(?:estadisticas|stats):(?:"([^"]*)|([^\s"]*))$/i);
  if (!m) return null;
  const q = normalize(m[1] ?? m[2]);
  const items = [{ value: '', label: t('estTitulo') }, { value: 'mis-medios', label: t('estMisMedios') },
    ...MEDIOS_UNICOS.map(m => ({ value: m.dominio, label: m.medio || m.dominio, meta: m.dominio }))];
  return items.filter(x => normalize(x.label + ' ' + x.value).includes(q)).slice(0, 8).map(x => ({ ...x, kind: 'estadisticas', tipo: t('estTitulo') }));
}
function wireEstadisticas(){
  const s = ESTADISTICAS, p = document.getElementById('estadisticas-panel');
  document.getElementById('btn-estadisticas').addEventListener('click', e => s.abierto ? cerrarEstadisticas() : abrirEstadisticas('', e.currentTarget));
  p.addEventListener('click', e => {
    const b = e.target.closest('[data-est]');
    if (!b) return;
    const accion = b.dataset.est;
    if (accion === 'cerrar') return cerrarEstadisticas();
    if (accion === 'renovar') return void cargarEstadisticas(true);
    if (accion === 'fecha') { s.fecha = b.dataset.valor; estEncajar(); return void cargarEstadisticas(); }
    if (accion === 'familia') { const f = b.dataset.valor; s.familias.has(f) ? s.familias.delete(f) : s.familias.add(f); }
    else if (accion === 'medio') { s.destino = null; s.vista = 'medio'; s.dominio = b.dataset.valor; }
    else if (accion === 'resumen' || accion === 'medios') { s.destino = null; s.vista = accion; }
    pintarEstadisticas();
    if (accion !== 'familia') { document.getElementById('est-vista-titulo')?.focus({ preventScroll: true }); estEncajar(); }
  });
  p.addEventListener('change', e => {
    if (e.target.id === 'est-fecha'){
      if (!estFechaValida(e.target.value)) return;
      s.fecha = e.target.value; cargarEstadisticas();
    } else if (e.target.id === 'est-ambito') { s.destino = null; s.ambito = e.target.value; pintarEstadisticas(); }
  });
  p.addEventListener('input', e => {
    if (e.target.id !== 'est-buscar-medio') return;
    s.consulta = e.target.value;
    document.getElementById('est-lista').innerHTML = estListaMedios();
  });
  // El panel tapa el feed: escribir otra búsqueda vuelve a él sin mover el foco.
  document.getElementById('buscar').addEventListener('input', e => {
    if (s.abierto && !/(?:^|\s)(?:estadisticas|stats):/i.test(e.target.value)) cerrarEstadisticas(false);
  });
  document.getElementById('buscar').addEventListener('keydown', e => {
    if (e.key === 'Enter' && ordenEstadisticas(e.target.value)) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (SUG_STATE.open && SUG_STATE.items[SUG_STATE.sel]?.kind === 'estadisticas') aplicarSugerencia(SUG_STATE.sel);
      else consumirOrdenEstadisticas();
    }
  }, true);
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
    TIEMPO.carga = import('./tiempo/municipios.js?v=1f11c2dd29')
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
  if (document.getElementById('estadisticas-panel')?.hidden === false) cerrarEstadisticas();
  cerrarCalendario(false);
  const input = $('#buscar');
  const { antes, consulta } = partirConsulta(input.value);
  const resto = antes.replace(RX_TOKENS_TIEMPO, ' ').replace(/\s+/g, ' ').trim();
  input.value = [resto, token, consulta].filter(Boolean).join(' ');
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
    // De arriba abajo: chips de la búsqueda, el panel y, bajo él, los del feed.
    const visible = id => { const el = document.getElementById(id); return el?.getClientRects().length ? el : null; };
    const destino = visible('chips-busqueda') || (token && panel && !panel.hidden ? panel : null)
      || visible('preset-pestanas') || visible('temas-chips');
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
  if (RX_HAY_TIEMPO.test(partirConsulta($('#buscar').value).antes)) ponerTiempo('');
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
  b.setAttribute('aria-pressed', String(RX_HAY_TIEMPO.test(partirConsulta($('#buscar')?.value || '').antes)));
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
let MEDIOS_CATS_MODO = null;
let MEDIOS_CATS_ABIERTAS = new Set();
function medioActivoEnModo(m, modo){
  const estado = getOverride(m.dominio, modo);
  return overrideIncluye(estado) || (estado !== 'ignore' && (modo?.grupos || []).includes(m.grupo));
}
function ordenarCategoriasMedios(medios, modo){
  const categorias = new Map();
  medios.forEach(m => {
    if (!categorias.has(m.grupo)) categorias.set(m.grupo, []);
    categorias.get(m.grupo).push(m);
  });
  const activos = new Map();
  categorias.forEach((enCat, grupo) => {
    enCat.sort((a, b) => Number(medioActivoEnModo(b, modo)) - Number(medioActivoEnModo(a, modo))
      || a.medio.localeCompare(b.medio));
    activos.set(grupo, enCat.filter(m => medioActivoEnModo(m, modo)).length);
  });
  const grupos = [...categorias.keys()].sort((a, b) =>
    activos.get(b) - activos.get(a) || a.localeCompare(b));
  return { categorias, grupos, activos };
}
function renderListaMedios(){
  const cont = $('#lista-medios');
  const modo = modoEnPanel();
  const medios = mediosDelPanel(modo);
  if (MEDIOS_CATS_MODO !== modo?.id){
    MEDIOS_CATS_MODO = modo?.id;
    MEDIOS_CATS_ABIERTAS = new Set();
  }
  const { categorias, grupos, activos } = ordenarCategoriasMedios(medios, modo);

  let html = '';
  grupos.forEach(g => {
    const enCat = categorias.get(g);
    html += `<details class="medio-cat" data-cat="${escapeHtml(g)}"${MEDIOS_CATS_ABIERTAS.has(g) ? ' open' : ''}>
      <summary class="medio-cat-header"><span>${escapeHtml(g)}</span>
        <small>${escapeHtml(t('cfgMediosCategoria', { activos: activos.get(g), total: enCat.length }))}</small></summary>`;
    enCat.forEach(m => {
      const mode  = getOverride(m.dominio, modo) || '';
      html += `
        <div class="medio-fila${overrideIncluye(mode) ? ' estado-incluir' : mode === 'ignore' ? ' estado-ignorar' : ''}"
             data-dominio="${escapeHtml(m.dominio)}"
             data-grupo="${escapeHtml(m.grupo)}"
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
    html += '</details>';
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
function actualizarFilaMedio(dominio){
  renderListaMedios();
  const fila = [...document.querySelectorAll('#lista-medios .medio-fila')]
    .find(f => f.dataset.dominio === dominio);
  if (fila && fila.style.display !== 'none') fila.querySelector('.medio-estado').focus();
  else $(fila ? '#filtro-estado-medio' : '#filtro-medio').focus();
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

  const filtrando = !!(q || g || estado);
  document.querySelectorAll('#lista-medios .medio-cat').forEach(cat => {
    const tieneVisibles = [...cat.querySelectorAll('.medio-fila')]
      .some(f => f.style.display !== 'none');
    cat.style.display = tieneVisibles ? '' : 'none';
    cat.open = (filtrando && tieneVisibles) || MEDIOS_CATS_ABIERTAS.has(cat.dataset.cat);
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
   y 'modo' (el de MODO_EDITADO) o 'asistente' (un borrador sin guardar).
   ═══════════════════════════════════════════════════════════════ */
const AJ_SECCIONES = ['modos', 'asistentes', 'lectura', 'feed', 'sync', 'lector', 'avanzado', 'ayuda'];
const AJ_TITULOS = {
  '': 'ajTitulo', modos: 'ajModos', asistentes: 'ajAsistentes', lectura: 'ajLectura',
  feed: 'ajFeed', sync: 'ajSync', lector: 'ajLector', avanzado: 'ajAvanzado', ayuda: 'ajAyuda',
  asistente: 'asTitulo',
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
    ancho = anchoInicial + e.clientX - inicioX;
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
    ancho = Number(control.getAttribute('aria-valuenow')) + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 80 : 20);
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
  if (ajRuta() === 'asistente' && ASISTENTE_MODO?.paso > 0){ avanzarAsistente(-1); return; }
  const padre = ['modo', 'asistente'].includes(ajRuta()) ? 'modos' : '';
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
  ASISTENTE_MODO = null;
  ajVaciarLector();
  AJ_PILA = [];
  _ajPendiente = null;
  cerrarPanel('panel-ajustes');
  ajActivarAlCerrar();
  const origen = _ajOrigen && _ajOrigen.isConnected && _ajOrigen.getClientRects().length
    ? _ajOrigen : $('#btn-config');
  const menu = origen.closest('#cab-menu');
  (menu && !menu.open ? menu.querySelector('summary') : origen).focus({ preventScroll: true });
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
  if (ruta !== 'asistente') ASISTENTE_MODO = null;
  const seccion = ['modo', 'asistente'].includes(ruta) ? 'modos' : ruta;
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
  $('#aj-atras-lbl').textContent = t(['modo', 'asistente'].includes(ruta) ? 'ajModos' : 'ajTitulo');
  $('#aj-atras').setAttribute('aria-label', $('#aj-atras-lbl').textContent);
  if (ruta === 'modos') renderListaModos();
  else if (ruta === 'asistente') pintarAsistenteModo();
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
  MEDIOS_CATS_ABIERTAS = new Set();
  $('#filtro-medio').value = '';
  $('#filtro-grupo-medio').value = '';
  $('#filtro-estado-medio').value = '';
  $('#ov-pegar').value = '';
  $('#aj-bloque-temas').open = true;
  $('#aj-bloque-medios').open = false;
  $('#aj-bloque-grupos').open = false;
  if (ajRuta() === 'modo') ajPintar();
  else ajEmpujar('modo');
}

function pintarModo(){
  const modo = modoEnPanel();
  if (!modo) return;
  const regla = normalizarRegla(modo.regla);
  $('#aj-regla').value = regla ? regla.fuentes : 'sumar';
  $('#aj-regla-hint').textContent = t(regla ? 'asRegla' + (regla.fuentes === 'todas' ? 'Todas' : 'Elegidas') : 'asReglaSumar');
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
  delete modo.regla;
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
// Borrador en memoria: ni los pasos ni la prueba escriben modos o ajustes.
// La única escritura se hace al confirmar la selección en el último paso.
let ASISTENTE_MODO = null;

function abrirAsistenteModo(){
  ajGuardarTemas();
  ASISTENTE_MODO = {
    paso: 0, tipo: 'medios', fuentes: 'elegidas', grupos: [], overrides: {},
    textoTemas: '', nombre: '', categoria: '', buscar: '',
  };
  ajEmpujar('asistente');
}
function pasosAsistente(){
  return ASISTENTE_MODO?.tipo === 'temas'
    ? ['intencion', 'fuentes', 'temas', 'resumen'] : ['intencion', 'fuentes', 'resumen'];
}
function modoAsistente(){
  const b = ASISTENTE_MODO;
  return {
    nombre: b.nombre.trim(), grupos: b.fuentes === 'todas' ? [] : [...b.grupos],
    palabras: b.tipo === 'temas' ? parseLista(b.textoTemas) : [],
    overrides: { ...b.overrides }, regla: { v: 1, fuentes: b.fuentes },
  };
}
function errorAsistente(paso){
  const m = modoAsistente();
  if (paso === 'fuentes' && m.regla.fuentes === 'elegidas'
      && !m.grupos.length && !Object.values(m.overrides).some(overrideIncluye)) return t('asSinFuentes');
  if (paso === 'temas' || paso === 'resumen'){
    if (ASISTENTE_MODO.tipo === 'temas'){
      const validas = new Set(compilarTemas(m.palabras).map(x => x.etiqueta));
      const invalidas = m.palabras.filter(x => !validas.has(x) || tokenizeQuery(x).some(tk => tk.prefix));
      if (!m.palabras.length || invalidas.length)
        return t('asTemasInvalidos', { X: invalidas.join(' · ') });
    }
  }
  if (paso === 'resumen' && !m.nombre) return t('asNombreFalta');
  return '';
}
function avanzarAsistente(delta){
  const b = ASISTENTE_MODO;
  if (!b) return;
  const pasos = pasosAsistente();
  const error = delta > 0 ? errorAsistente(pasos[b.paso]) : '';
  if (error){ $('#as-error').textContent = error; return; }
  b.paso = Math.max(0, Math.min(pasos.length - 1, b.paso + delta));
  pintarAsistenteModo();
  $('#as-paso-titulo').focus();
  $('#panel-ajustes .aj-cuerpo').scrollTop = 0;
}
function pintarAsistenteModo(){
  const b = ASISTENTE_MODO;
  if (!b) return;
  // Una carga de datos no debe sustituir un campo mientras se escribe.
  const form = $('#asistente-modo');
  if (form.contains(document.activeElement) && form.dataset.paso === String(b.paso)) return;
  const pasos = pasosAsistente(), paso = pasos[b.paso];
  const e = escapeHtml;
  let contenido = '';
  if (paso === 'intencion'){
    contenido = `<p class="aj-hint">${e(t('asIntencionHint'))}</p>`
      + `<div class="aj-radios">${['medios', 'temas'].map(tipo =>
        `<label><input type="radio" name="as-tipo" value="${tipo}"${b.tipo === tipo ? ' checked' : ''}>`
        + `<span>${e(t(tipo === 'medios' ? 'asMedios' : 'asTemas'))}</span></label>`).join('')}</div>`
      + `<details class="as-ayuda"><summary>${e(t('asPortadas'))}</summary>`
      + `<p class="aj-hint">${e(t('asPortadasHint'))}</p>`
      + `<button type="button" data-as="portadas">${e(t('asVerPortadas'))}</button></details>`;
  } else if (paso === 'fuentes'){
    contenido = `<p class="aj-hint">${e(t('asFuentesHint'))}</p><p class="aj-hint">${e(t('asEstadosHint'))}</p>`
      + `<div class="aj-radios">${['elegidas', 'todas'].map(f =>
        `<label><input type="radio" name="as-fuentes" value="${f}"${b.fuentes === f ? ' checked' : ''}>`
        + `<span>${e(t(f === 'todas' ? 'asFuentesTodas' : 'asFuentesElegidas'))}</span></label>`).join('')}</div>`
      + `<label class="as-campo" for="as-categoria">${e(t('asCategoria'))}<select id="as-categoria">`
      + `<option value="">${e(t('asCategoria'))}</option>`
      + [...new Set(MEDIOS_UNICOS.map(m => superGrupo(m.grupo)))].sort((a, c) => ordenSuper(a) - ordenSuper(c))
        .map(c => `<option value="${e(c)}"${b.categoria === c ? ' selected' : ''}>${e(c)}</option>`).join('') + '</select></label>'
      + `<label class="as-campo" for="as-buscar">${e(t('cfgBuscarMedio'))}`
      + `<input id="as-buscar" type="search" value="${e(b.buscar)}" autocomplete="off"></label>`
      + `<div id="as-fuentes-lista"></div><div id="as-excepciones"></div>`
      + `<p id="as-fuentes-resumen" class="aj-pista" role="status"></p>`;
  } else if (paso === 'temas'){
    contenido = `<p class="aj-hint">${e(t('asTemasHint'))}</p>`
      + `<label class="as-campo" for="as-temas">${e(t('cfgPalabras'))}`
      + `<textarea id="as-temas" class="preset-texto" spellcheck="false" placeholder="${e(t('cfgPalabrasPlaceholder'))}">${e(b.textoTemas)}</textarea></label>`
      + `<details class="as-ayuda"><summary>${e(t('cfgPalabrasHint'))}</summary><ul>`
      + t('cfgTemasAyuda').split('\n').map(l => {
        const [ej, txt] = l.split('|');
        return `<li><code>${e(ej)}</code> → ${e(txt || '')}</li>`;
      }).join('') + '</ul></details>';
  } else {
    contenido = `<label class="as-campo" for="as-nombre">${e(t('asNombre'))}`
      + `<input id="as-nombre" maxlength="100" value="${e(b.nombre)}" autocomplete="off" required></label>`
      + `<div id="as-seleccion-resumen" class="aj-pista"></div>`
      + `<p id="as-preview-count" role="status"></p><p class="aj-hint">${e(t('asVistaParcial'))}</p>`
      + `<ul id="as-preview" class="as-preview"></ul>`
      + `<p class="aj-hint">${e(t('asFiltrosVista'))}</p>`;
  }
  const titulos = { intencion: 'asIntencion', fuentes: 'cfgMedios', temas: 'cfgPalabras', resumen: 'asRevisar' };
  form.dataset.paso = String(b.paso);
  form.innerHTML = `<p class="aj-hint">${e(t('asPaso', { n: b.paso + 1, total: pasos.length }))}</p>`
    + `<h3 id="as-paso-titulo" tabindex="-1">${e(t(titulos[paso]))}</h3>`
    + contenido + `<p id="as-error" class="as-error" role="alert"></p>`
    + `<p class="aj-hint">${e(t('asBorrador'))}</p><div class="as-acciones">`
    + `<button type="button" data-as="cancelar">${e(t('asCancelar'))}</button>`
    + (b.paso ? `<button type="button" data-as="anterior">${e(t('asAnterior'))}</button>` : '')
    + `<button type="submit" class="primary">${e(t(paso === 'resumen' ? 'asGuardar' : 'asSiguiente'))}</button></div>`;
  if (paso === 'fuentes') pintarFuentesAsistente();
  if (paso === 'resumen') pintarPruebaAsistente();
}
function filaMedioAsistente(m){
  const e = escapeHtml, ov = ASISTENTE_MODO.overrides[m.dominio] || '';
  return `<label class="as-medio"><span><strong>${e(m.medio)}</strong><small>${e(m.dominio)}</small></span>`
    + `<select data-as-medio="${e(m.dominio)}" aria-label="${e(t('cfgEstadoMedio', { X: m.medio }))}">`
    + [['', 'cfgMedioAutomatico'], ['include', 'cfgMedioIncluir'], ['ignore', 'cfgMedioBloquear']]
      .map(([v, k]) => `<option value="${v}"${ov === v ? ' selected' : ''}>${e(t(k))}</option>`).join('')
    + '</select></label>';
}
function pintarFuentesAsistente(){
  const b = ASISTENTE_MODO, e = escapeHtml;
  const q = normalize(b.buscar.trim());
  const lista = $('#as-fuentes-lista');
  if (q){
    const medios = MEDIOS_UNICOS.filter(m => normalize(m.medio + ' ' + m.dominio + ' ' + m.grupo).includes(q));
    lista.innerHTML = medios.slice(0, 25).map(filaMedioAsistente).join('');
    if (medios.length > 25) lista.innerHTML += `<p class="aj-hint">${e(t('asLimiteMedios', { n: 25, total: medios.length }))}</p>`;
    const dominio = normalizarDominioInput(b.buscar);
    if (!medios.length){
      lista.innerHTML = `<p class="aj-hint">${e(t('cfgMediosVacio'))}</p>`;
      if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(dominio) && !Object.hasOwn(b.overrides, dominio))
        lista.innerHTML += `<button type="button" data-as-dominio="${e(dominio)}">${e(t('asAnadirDominio', { X: dominio }))}</button>`
          + `<p class="aj-hint">${e(t('asDominioHint'))}</p>`;
    }
  } else {
    const medios = MEDIOS_UNICOS.filter(m => superGrupo(m.grupo) === b.categoria);
    const grupos = ordenarGruposPorIdioma([...new Set(medios.map(m => m.grupo))]);
    lista.innerHTML = grupos.map(g => {
      const delGrupo = medios.filter(m => m.grupo === g);
      return `<details class="as-grupo"><summary>${e(g)} · ${delGrupo.length}</summary>`
        + `<label class="as-grupo-elegir"><input type="checkbox" data-as-grupo="${e(g)}"${b.grupos.includes(g) ? ' checked' : ''}`
        + `${b.fuentes === 'todas' ? ' disabled' : ''}> ${e(t('asIncluirGrupo'))}</label>`
        + delGrupo.map(filaMedioAsistente).join('') + '</details>';
    }).join('');
    if (!MEDIOS_UNICOS.length) lista.innerHTML = `<p class="aj-hint">${e(t('asSinCatalogo'))}</p>`;
  }
  pintarResumenFuentesAsistente();
}
function pintarResumenFuentesAsistente(){
  const b = ASISTENTE_MODO, e = escapeHtml, m = modoAsistente();
  const regla = compilarRegla(m);
  const n = MEDIOS_UNICOS.filter(medio => regla.pasaFuentes(medio)).length;
  $('#as-fuentes-resumen').textContent = t('asResumenFuentes', {
    g: m.grupos.length, i: Object.values(m.overrides).filter(overrideIncluye).length,
    s: Object.values(m.overrides).filter(x => x === 'ignore').length, n,
  });
  const propios = Object.keys(b.overrides).map(d =>
    MEDIOS_UNICOS.find(m => m.dominio === d) || { dominio: d, medio: d });
  $('#as-excepciones').innerHTML = (b.grupos.length && b.fuentes === 'elegidas'
    ? `<p class="aj-hint">${b.grupos.map(g => `<button type="button" data-as-quitar-grupo="${e(g)}">${e(g)} ×</button>`).join(' ')}</p>` : '')
    + (propios.length ? `<details class="as-grupo" open><summary>${e(t('asExcepciones'))}</summary>`
      + propios.map(filaMedioAsistente).join('') + '</details>' : '')
    + (propios.some(m => !MEDIOS_UNICOS.some(c => c.dominio === m.dominio))
      ? `<p class="aj-hint">${e(t('asDominioHint'))}</p>` : '');
  // Una excepción puede aparecer en el catálogo y en el resumen.
  $('#as-fuentes-lista').querySelectorAll('select[data-as-medio]').forEach(s => {
    s.value = b.overrides[s.dataset.asMedio] || '';
  });
}
function pintarPruebaAsistente(){
  const modo = modoAsistente(), regla = compilarRegla(modo), e = escapeHtml;
  const fuentes = modo.regla.fuentes === 'todas' ? t('asResumenTodas')
    : t('asResumenElegidas', { X: [...modo.grupos, ...Object.entries(modo.overrides)
      .filter(([, v]) => overrideIncluye(v)).map(([d]) => d)].join(' · ') });
  const silencios = Object.entries(modo.overrides).filter(([, v]) => v === 'ignore').map(([d]) => d);
  $('#as-seleccion-resumen').innerHTML = `<p>${e(fuentes)}</p>`
    + `<p>${e(modo.palabras.length ? t('asResumenTemas', { X: modo.palabras.join(' / ') }) : t('asSinTemas'))}</p>`
    + (silencios.length ? `<p>${e(t('cfgMedioBloquear'))}: ${e(silencios.join(' · '))}</p>` : '');
  // Solo datos propios ya cargados: nunca se lanza una consulta ni una
  // descarga masiva para probar un borrador. No influye el modo activo.
  const propias = NOTICIAS.filter(n => !(n._capas && _soloDeConsulta(n)));
  const noticias = propias.filter(regla.pasa).sort((a, b) => (b._tsActualidad || 0) - (a._tsActualidad || 0));
  $('#as-preview-count').textContent = t('asVistaPrevia', { n: noticias.length, total: propias.length });
  $('#as-preview').innerHTML = noticias.slice(0, 8).map(n =>
    `<li><strong>${e(n.titular)}</strong><small>${e(n.medio || n.dominio)}</small></li>`).join('')
    || `<li>${e(t('asSinCoincidencias'))}</li>`;
}
function guardarAsistenteModo(){
  if (!ASISTENTE_MODO) return;
  for (const paso of pasosAsistente()){
    const error = errorAsistente(paso);
    if (error){ $('#as-error').textContent = error; return; }
  }
  const modo = normalizarPreset({ ...modoAsistente(), id: 'm-' + crypto.randomUUID() });
  PRESETS.lista.push(modo);
  MODO_EDITADO = modo.id;
  ASISTENTE_MODO = null;
  AJ_PILA[AJ_PILA.length - 1] = 'modo';
  activarModo(modo.id);  // Guarda y recompila con el mismo motor de la prueba.
  ajPintar();
  toast(t('asGuardado', { X: modo.nombre }), 3000);
}
function wireAsistenteModo(){
  $('#btn-asistente-modo').addEventListener('click', abrirAsistenteModo);
  $('#btn-as-modo').addEventListener('click', abrirAsistenteModo);
  const form = $('#asistente-modo');
  form.addEventListener('submit', ev => {
    ev.preventDefault();
    if (!ASISTENTE_MODO) return;
    if (pasosAsistente()[ASISTENTE_MODO.paso] === 'resumen') guardarAsistenteModo();
    else avanzarAsistente(1);
  });
  form.addEventListener('input', ev => {
    const b = ASISTENTE_MODO;
    if (!b) return;
    if (ev.target.id === 'as-temas') b.textoTemas = ev.target.value;
    if (ev.target.id === 'as-nombre') b.nombre = ev.target.value;
    if (ev.target.id === 'as-buscar'){ b.buscar = ev.target.value; pintarFuentesAsistente(); }
    $('#as-error').textContent = '';
  });
  form.addEventListener('change', ev => {
    const b = ASISTENTE_MODO, el = ev.target;
    if (!b) return;
    if (el.name === 'as-tipo'){
      b.tipo = el.value;
      b.fuentes = b.tipo === 'temas' ? 'todas' : 'elegidas';
      // Solo cambia el número de pasos; se conserva el control enfocado.
      form.querySelector('.aj-hint').textContent = t('asPaso', { n: 1, total: pasosAsistente().length });
    }
    if (el.name === 'as-fuentes'){ b.fuentes = el.value; pintarFuentesAsistente(); }
    if (el.id === 'as-categoria'){ b.categoria = el.value; b.buscar = ''; $('#as-buscar').value = ''; pintarFuentesAsistente(); }
    if (el.dataset.asGrupo){
      b.grupos = b.grupos.filter(g => g !== el.dataset.asGrupo);
      if (el.checked) b.grupos.push(el.dataset.asGrupo);
      pintarResumenFuentesAsistente();
    }
    if (el.dataset.asMedio){
      if (el.value) b.overrides[el.dataset.asMedio] = el.value;
      else delete b.overrides[el.dataset.asMedio];
      // No se recrea el selector enfocado ni se cierran los grupos.
      if (!el.closest('#as-excepciones')) pintarResumenFuentesAsistente();
      else {
        const id = el.dataset.asMedio;
        pintarResumenFuentesAsistente();
        form.querySelector(`select[data-as-medio="${CSS.escape(id)}"]`)?.focus();
      }
    }
    $('#as-error').textContent = '';
  });
  form.addEventListener('click', ev => {
    const el = ev.target.closest('button');
    if (!el || !ASISTENTE_MODO) return;
    if (el.dataset.as === 'anterior') avanzarAsistente(-1);
    if (el.dataset.as === 'cancelar'){ ASISTENTE_MODO = null; ajAtras(); }
    if (el.dataset.as === 'portadas'){ ASISTENTE_MODO = null; ajIrSeccion('feed'); }
    if (el.dataset.asDominio){
      ASISTENTE_MODO.overrides[el.dataset.asDominio] = 'include';
      pintarFuentesAsistente();
    }
    if (el.dataset.asQuitarGrupo){
      ASISTENTE_MODO.grupos = ASISTENTE_MODO.grupos.filter(g => g !== el.dataset.asQuitarGrupo);
      pintarFuentesAsistente();
    }
  });
}
/* ═══════════════════════════════════════════════════════════════
   CUMPLE PRESET
   ═══════════════════════════════════════════════════════════════ */
let SET_GRUPOS = new Set();
let REGLA_PRESET = null;
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
  REGLA_PRESET = compilarRegla(PRESET);
  const lista = (PRESETS && PRESETS.lista) || [];
  TEMAS_TODOS = lista.map(p => {
    const ov = p.overrides || {};
    return {
      id: p.id,
      nombre: p.nombre,
      temas: compilarTemas(p.palabras),
      regla: compilarRegla(p),
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
    if (m.regla && !m.regla.pasaFuentes(n)) continue;
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
// Aporte de las fuentes al modo. En las selecciones nuevas pasa también
// por las palabras: nunca debe ofrecer un atajo que se salte ese filtro.
function _entraPorMedios(n){
  if (REGLA_PRESET) return REGLA_PRESET.pasa(n);
  return overrideIncluye(getOverride(n.dominio)) || SET_GRUPOS.has(n.grupo);
}
function _modoTieneMedios(){
  const ov = PRESET.overrides || {};
  return SET_GRUPOS.size > 0 || Object.keys(ov).some(d => overrideIncluye(ov[d]));
}
function cumplePreset(n){
  if (REGLA_PRESET) return REGLA_PRESET.pasa(n);
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
let ULT_CTX = null;                // contexto del último filtrado
// ── Paginación R2 ──
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

async function buscarEnPrensa(parsed, rawQuery, { silent = false, signal: signalExterno = null } = {}){
  // Cache primero
  const cacheKey = prensaCacheKey(rawQuery);
  const cached = prensaCacheGet(cacheKey);
  if (cached) return { items: cached, _cache: true };

  if (!signalExterno){
    if (PRENSA_ABORT) PRENSA_ABORT.abort();
    PRENSA_ABORT = new AbortController();
  }

  const params = new URLSearchParams();
  params.set('raw', rawQuery || '');
  params.set('fuentes', 'gnews');
  params.set('limit', '40');
  params.set('offset', '0');
  params.set('lang', PRENSA_LANG);
  params.set('region', PRENSA_PAIS);

  const signal = signalExterno || PRENSA_ABORT.signal;
  const intentar = async () => {
    const sig = _signalConTimeout(signal, BACKEND_TIMEOUT_CF_MS);
    const r = await fetch(`${WORKER_BUSCAR}/buscar?${params}`, { signal: sig });
    if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
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
    // Un 429 es el límite por IP del worker, no un backend caído: no se conmuta.
    if (BACKEND_ACTIVO === 'cf' && e.status !== 429){
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

// Item de prensa → item crudo de NOTICIAS, como los de R2. El medio se
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
  const calendario = consulta.calendario;
  const ambitos = calendario ? (calendario.circuitos.length ? calendario.circuitos : calendario.ambitos) : [];
  const tieneQuery = !consulta.imposible
    && (!calendario || calendario.noticias && !calendario.desconocidos.length)
    && (consulta.texto.incluir.length || dominios !== null || ambitos.length)
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
  const textos = ambitos.length ? [...new Set(ambitos.map(a => `"${AMBITOS[a].noticias[0]}" ${texto}`.trim()))] : [texto];
  // Lo que ya está en caché no espera a que se deje de teclear.
  const espera = textos.every(t => prensaCacheGet(prensaCacheKey(t))) ? 0 : PRENSA_DEBOUNCE_MS;
  PRENSA_TIMER = setTimeout(async () => {
    PRENSA_TIMER = null;
    if (PRENSA_CLAVE !== clave) return;

    PRENSA_ABORT = new AbortController();
    const signal = PRENSA_ABORT.signal;
    // Una consulta por ámbito, con cancelación compartida y sin que una
    // respuesta aborte a las demás. Se conserva la deduplicación del feed.
    const respuestas = [];
    for (const texto of textos){
      if (signal.aborted || PRENSA_CLAVE !== clave) return;
      respuestas.push(await buscarEnPrensa(consulta.parsed, texto, { silent: true, signal }));
    }
    const res = respuestas.every(Boolean) ? { items: respuestas.flatMap(r => r.items || []) } : null;
    {
      if (PRENSA_CLAVE !== clave) return;
      PRENSA_CLAVE = null;
      if (res) PRENSA_HECHA = clave; else PRENSA_FALLO = clave;
      const items = respuestas.filter(Boolean).flatMap(r => r.items || []).map(_itemDePrensa).filter(Boolean);
      if (items.length){
        if (_mergearItemsEnNoticias(items, 'prensa', clave) > 0) hidratarNoticias();
        aplicarFiltros();
      } else if (!ULT_FILTRADAS.length) renderizar();   // el vacío deja de «buscar»
      else pintarEstadoPrensa();
    }
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
  if (consulta.calendario && !noticiaEnAmbitos(n.titular, consulta.calendario)) return false;
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
  if (consulta.calendario && !noticiaEnAmbitos(n.titular, consulta.calendario)) return false;
  return consulta.pasaExterno({
    dominio: n.dominio,
    titular: n.titular,
    ts: n._tsActualidad,
    palabras: n._palabras || (n._palabras = palabrasDe(n.titular)),
  });
}
// ¿Todo lo que tiene el item viene de la prensa (lo trae una consulta)?
function _soloDeConsulta(n){
  for (const c of n._capas) if (c !== 'prensa') return false;
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
  if (n._capas && _soloDeConsulta(n) && !dePrensa) return false;
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
  const rawInput = $('#buscar').value.trim();
  const sinStats = ordenEstadisticas(rawInput)?.resto ?? rawInput;
  const ordenCalendario = CALENDARIO_ACTIVO ? leerConsultaCalendario(sinStats) : null;
  actualizarConsultaCalendario(ordenCalendario);
  const raw = ordenCalendario?.resto ?? sinStats;
  const rawProcesado = preprocesarInput(raw);
  const parsed = parseQuery(rawProcesado);
  // Semántica de la búsqueda (texto, medios, fechas): shared/busqueda/.
  // Se interpreta una vez y la usan el filtro y la prensa.
  const consulta = interpretarConsulta(raw, { catalogo: MEDIOS, ahora: Date.now() });
  consulta.calendario = ordenCalendario;
  if (ordenCalendario) consulta.clave += '|' + JSON.stringify(ordenCalendario);
  renderChips(parsed, raw);
  syncPanelFromParsed(parsed);
  actualizarTiempo(parsed.eltiempo);
  actualizarAlertas(parsed.alertas);
  actualizarConsultaPuntual(parsed, consulta.texto);
  pintarBotonTiempo();

const capas = capasRequeridas(parsed, consulta);

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
    !!g || !!t2 || !!parsed.desde || !!parsed.hasta || !!ordenCalendario;

  const presetConReglas = PRESET_ACTIVO && presetTieneReglas();
  // La vista 🔖 Temas filtra como un modo, con los temas de todos los modos.
  const vistaTemas = vistaTemasActiva();
  if (CHIP_TEMAS && !TEMAS_TODOS.some(m => m.id === CHIP_TEMAS)) CHIP_TEMAS = null;
  const conFiltro = presetConReglas || vistaTemas;
  // Sin búsqueda, el modo filtra el feed (es tu forma de leerlo). Buscando,
  // el modo no esconde nada: los resultados se separan en dos pestañas,
  // «Modo · N» y «Todo · M» (en Todo, los del modo van marcados). Un filtro
  // de medio escrito en la búsqueda manda sobre el modo: sin pestañas. Una
  // competición (f1:) también: sus noticias, en el modo o en todo. Un prefijo
  // sin noticias (teatro:) no deja nada que separar.
  const presetEfectivo = conFiltro && !hayFuenteExplicita && !hayBusquedaActiva;
  const conPestanas    = conFiltro && !hayFuenteExplicita && hayBusquedaActiva && (!ordenCalendario || ordenCalendario.noticias);

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
  // filtra. Los chips pasan al ctx para que lo que lee ULT_CTX (las marcas
  // de tema de cada tarjeta) los respete.
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
    // por el rango que dio la fuente para esta consulta, si lo dio.
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
  // Resumen de medios: buscando y sin un medio ya elegido.
  renderResumenMedios(hayBusquedaActiva && !hayFuenteExplicita ? filtradas : null);

  actualizarFiltrosCount();
  requestAnimationFrame(renderizar);

  if (APP_LISTA && RECORDAR_FILTROS){
    try { localStorage.setItem('voceiro-buscar', rawInput); } catch(e){}
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
  const el = $('#total-r2');
  if (!el) return;
  const dias = (_manifest && _manifest.dias) || [];
  const g = (_manifest && _manifest.guardado) || {
    n: dias.reduce((s, d) => s + ((d.all && d.all.n) || 0), 0),
    dias: dias.length,
    desde: dias.length ? dias[dias.length - 1].fecha : '',
  };
  el.hidden = !g.n;
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

// ── Resumen de medios de una búsqueda ──
// Modelo: los filtros con cifras de la barra lateral del buscador de GitHub.
// Cuenta lo que enseña el feed (tras pestañas y chips); un medio con dominio
// escribe web:dominio en la barra (filtrarPorMedio), como su nombre en la
// tarjeta. Es un chip plegable: contar es una pasada por la lista ya
// filtrada; la lista de medios solo se pinta abierta.
const RESUMEN_MEDIOS = { lista: null, orden: 'n', todos: false };
const RESUMEN_MEDIOS_VISIBLES = 12;
// Google News sin <source url> deja news.google.com como dominio: esas
// fuentes se distinguen por nombre y no filtran (no hay dominio que escribir).
const claveResumenMedio = n => (n.dominio === 'news.google.com' ? '~' + normStrict(n.medio || 'Google News') : n.dominio);

function renderResumenMedios(lista){
  const el = document.getElementById('medios-resumen');
  if (!el) return;
  if (lista !== undefined) RESUMEN_MEDIOS.lista = lista;
  const cuentas = new Map();
  for (const n of RESUMEN_MEDIOS.lista || []){
    const k = n.dominio && claveResumenMedio(n);
    if (k) cuentas.set(k, (cuentas.get(k) || 0) + 1);
  }
  if (cuentas.size < 2){ el.hidden = true; el.open = false; el.innerHTML = ''; return; }
  if (!el.firstElementChild) el.innerHTML = '<summary></summary><div class="medios-resumen-cuerpo"></div>';
  el.firstElementChild.textContent = t('resMedios', { n: cuentas.size.toLocaleString() });
  el.hidden = false;
  const cuerpo = el.lastElementChild;
  if (!el.open){ cuerpo.innerHTML = ''; return; }

  const nombreDe = new Map();
  for (const n of RESUMEN_MEDIOS.lista){
    const k = n.dominio && claveResumenMedio(n);
    if (k && !nombreDe.has(k)) nombreDe.set(k, n.medio || MEDIOS[n.dominio]?.n || n.dominio);
  }
  const lang = (ACCES && ACCES.lang) || 'es';
  const porNombre = (a, b) => nombreDe.get(a).localeCompare(nombreDe.get(b), lang);
  const porCifra = (a, b) => cuentas.get(b) - cuentas.get(a) || porNombre(a, b);
  const fila = d => {
    const nombre = escapeHtml(nombreDe.get(d)), n = `<span class="medios-resumen-n">${cuentas.get(d).toLocaleString()}</span>`;
    // Con dominio real filtra aunque no esté en el catálogo (web: lo acepta);
    // sin él (news.google.com, por nombre), solo se cuenta.
    return !d.startsWith('~')
      ? `<li><button type="button" data-dominio="${escapeHtml(d)}" title="${escapeHtml(t('medioFiltrarTitle', { medio: nombreDe.get(d) }))}"><span>${nombre}</span>${n}</button></li>`
      : `<li><span class="medios-resumen-fuera"><span>${nombre}</span>${n}</span></li>`;
  };
  // Lo enfocado y los grupos abiertos sobreviven al repintado.
  const foco = cuerpo.contains(document.activeElement) ? document.activeElement : null;
  const selFoco = foco && (foco.dataset.orden ? `[data-orden="${foco.dataset.orden}"]`
    : 'todos' in foco.dataset ? '[data-todos]'
    : foco.dataset.dominio ? `[data-dominio="${CSS.escape(foco.dataset.dominio)}"]`
    : foco.closest('[data-grupo]') ? `[data-grupo="${CSS.escape(foco.closest('[data-grupo]').dataset.grupo)}"] > summary` : '');
  const abiertos = new Set([...cuerpo.querySelectorAll('.medios-resumen-grupo[open]')].map(g => g.dataset.grupo));

  const o = RESUMEN_MEDIOS.orden;
  const botonOrden = (v, clave) => `<button type="button" data-orden="${v}" aria-pressed="${o === v}">${escapeHtml(t(clave))}</button>`;
  let html = `<div class="medios-resumen-orden" role="group" aria-label="${escapeHtml(t('resOrdenar'))}">`
    + botonOrden('n', 'resOrdenNoticias') + botonOrden('az', 'resOrdenNombre') + botonOrden('grupo', 'resOrdenGrupo') + '</div>';
  const dominios = [...cuentas.keys()];
  if (o === 'grupo'){
    // Esquema: grupo (suma de sus noticias) → medios, plegado como en Estadísticas.
    const grupos = new Map();
    for (const d of dominios){
      const g = MEDIOS[d]?.g || t('resOtros');
      if (!grupos.has(g)) grupos.set(g, { n: 0, ds: [] });
      const x = grupos.get(g); x.n += cuentas.get(d); x.ds.push(d);
    }
    html += [...grupos].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0], lang)).map(([g, x]) =>
      `<details class="medios-resumen-grupo" data-grupo="${escapeHtml(g)}"${abiertos.has(g) ? ' open' : ''}><summary><span>${escapeHtml(g)}</span><span class="medios-resumen-n">${x.n.toLocaleString()}</span></summary>`
      + `<ul class="medios-resumen-lista">${x.ds.sort(porCifra).map(fila).join('')}</ul></details>`).join('');
  } else {
    dominios.sort(o === 'az' ? porNombre : porCifra);
    const vistos = RESUMEN_MEDIOS.todos ? dominios : dominios.slice(0, RESUMEN_MEDIOS_VISIBLES);
    html += `<ul class="medios-resumen-lista">${vistos.map(fila).join('')}</ul>`;
    if (vistos.length < dominios.length) html += `<button type="button" class="medios-resumen-todos" data-todos>${escapeHtml(t('resVerTodos', { n: dominios.length.toLocaleString() }))}</button>`;
  }
  cuerpo.innerHTML = html;
  // Si lo enfocado ya no está (salió de las 12 primeras), al chip.
  if (foco) (selFoco && cuerpo.querySelector(selFoco) || el.firstElementChild).focus({ preventScroll: true });
}

function wireResumenMedios(){
  const el = document.getElementById('medios-resumen');
  if (!el) return;
  // toggle no burbujea: este es el del propio resumen, no el de un grupo.
  el.addEventListener('toggle', () => {
    if (!el.open) RESUMEN_MEDIOS.todos = false;
    renderResumenMedios();
  });
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.dominio){
      el.open = false;
      filtrarPorMedio(b.dataset.dominio);
      // El resumen desaparece (hay un medio elegido): el foco, a la barra con web:.
      const input = document.getElementById('buscar');
      (input?.getClientRects().length ? input : document.getElementById('btn-buscar'))?.focus({ preventScroll: true });
      return;
    }
    if (b.dataset.orden) RESUMEN_MEDIOS.orden = b.dataset.orden;
    else if ('todos' in b.dataset){
      RESUMEN_MEDIOS.todos = true;
      renderResumenMedios();
      // El foco pasa a la primera fila nueva que se pueda pulsar; si no hay, al chip.
      const nuevas = [...el.querySelectorAll('.medios-resumen-lista > li')].slice(RESUMEN_MEDIOS_VISIBLES);
      (nuevas.map(li => li.querySelector('button')).find(Boolean) || el.firstElementChild).focus();
      return;
    }
    renderResumenMedios();
  });
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
    const btn = $('#btn-pase'), menu = btn.closest('#cab-menu');
    (menu && !menu.open ? menu.querySelector('summary') : btn).focus({ preventScroll: true });
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

    // Lista agotada → pedir más días de R2 si hay
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

// Scroll infinito y «Cargar más»: R2 (ficheros estáticos: gratis y sin cuota).
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

function actualizarBotonCargarMas() {
  const wrap = document.getElementById('cargar-mas-wrap');
  const btn  = document.getElementById('btn-cargar-mas');
  if (!wrap || !btn) return;

  // R2: extender días si quedan en el manifest
  const raw = $('#buscar').value.trim();
  const parsed = parseQuery(preprocesarInput(raw));
  const capas = capasRequeridas(parsed);
  if (capas.size) {
    const totalDias = (_manifest && _manifest.dias) ? _manifest.dias.length : 0;
    if (DIAS_ACTUAL < totalDias) {
      wrap.style.display = '';
      btn.textContent = _cargandoMas ? 'Cargando…' : `Cargar más · ${DIAS_ACTUAL}/${totalDias} días`;
      btn.disabled = _cargandoMas;
      return;
    }
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
    const statsBtn = e.target.closest('.btn-estadisticas-item');
    if (statsBtn){
      e.preventDefault();
      const n = ULT_FILTRADAS[Number(statsBtn.dataset.idx)];
      const origen = cont.querySelector(`.btn-mas-item[data-idx="${statsBtn.dataset.idx}"]`);
      if (n?.dominio) abrirEstadisticas(n.dominio, origen);
      return;
    }
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
  $('#cab-menu-label').textContent = t('masAcciones');
  $('#meta-prefix').textContent = t('metaPrefix');

  actualizarBotonPreset();
  // Cabecera: icono y palabra (en móvil y en la fila ancha la palabra se oculta, ver .cab-txt).
  const cab = (sel, icono, clave) => {
    const b = $(sel);
    b.innerHTML = icono + `<span class="cab-txt">${escapeHtml(t(clave))}</span>`;
    b.title = t(clave);
  };
  cab('#btn-config', ico('settings'), 'ajTitulo');
  cab('#btn-estadisticas', iconoEstadisticas(), 'estTitulo');
  cab('#btn-calendario', iconoCalendario(), 'calTitulo');
  $('#btn-calendario').setAttribute('aria-label', t('calTitulo'));
  cab('#btn-deportes', iconoDeportes(), 'calDeportesTitulo');
  $('#btn-deportes').setAttribute('aria-label', t('calDeportesTitulo'));
  $('#btn-estadisticas').setAttribute('aria-label', t('estTitulo'));
  cab('#btn-acces', '<span class="cab-aa" aria-hidden="true">Aa</span>', 'ajLectura');
  cab('#btn-pendientes', ico('bookmark'), 'btnPendientes');
  $('#btn-pendientes').insertAdjacentHTML('beforeend', '<span class="pend-count" data-count="0">0</span>');

  // Filtros de lectura.
  $('#btn-pase').title = t('paseCapa');
  $('#btn-pase').setAttribute('aria-label', t('paseCapa'));
  $('#btn-pase .cab-txt').textContent = t('paseCapa');
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
  // Accesos del buscador
  $('#buscar-accesos').setAttribute('aria-label', t('accAbrir'));
  $('#buscar-accesos').title = t('accAbrir');
  // Asistentes
  $('#aj-asistentes-hint').textContent = t('ajAsistentesHint');
  $('#btn-as-modo-lbl').textContent = t('asTitulo');
  $('#btn-as-calendario-lbl').textContent = t('ajAsCalendario');
  $('#aj-as-calendario-hint').textContent = t('ajAsCalendarioHint');
  $('#btn-nuevo-modo-lbl').textContent = t('cfgModoNuevo');
  $('#btn-asistente-modo-lbl').textContent = t('asTitulo');
  $('#as-entrada-hint').textContent = t('asEntrada');
  $('#aj-regla-lbl').textContent = t('asComportamiento');
  $('#aj-regla').innerHTML = [['sumar', 'asSumar'], ['elegidas', 'asCruzar'], ['todas', 'asTodas']]
    .map(([v, k]) => `<option value="${v}">${escapeHtml(t(k))}</option>`).join('');
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
  pintarEstadisticas();
  pintarCalendario();
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
  wireAsistenteModo();
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
  $('#aj-regla').addEventListener('change', e => {
    const modo = modoEnPanel();
    if (!modo) return;
    if (e.target.value === 'sumar') delete modo.regla;
    else modo.regla = { v: 1, fuentes: e.target.value };
    guardarPresets();
    ajModoCambiado(modo);
    pintarModo();
  });

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
    renderListaMedios();
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
  const hTitle = document.getElementById('btn-recargar');
  if (hTitle){
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
  wireEstadisticas();
  wireCalendario();
  wireAccesos();
  wireResumenMedios();
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
  // ── Botón "Cargar más" (paginación R2) ──
  const btnCargarMas = document.getElementById('btn-cargar-mas');
  if (btnCargarMas) btnCargarMas.addEventListener('click', () => solicitarMas(cargarMas));

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
        if (document.getElementById('cal-evento-dialogo').open) return;
        cerrarPresetMenu();
        if ($('#filtros-panel').matches(':modal')) $('#filtros-panel').close();
        cerrarMenuMas();
        const abierto = document.querySelector('.panel.open');
        if (abierto){ cerrarPanel(abierto.id); return; }
        if (ESTADISTICAS.abierto){ cerrarEstadisticas(); return; }
        if (CALENDARIO.asistente){ CALENDARIO.asistente = null; pintarCalendario(); return; }
        if (CALENDARIO.abierto){ salirCalendario(); return; }
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
    MEDIOS_CATS_ABIERTAS.add(t('cfgMediosOtros'));
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
    contMedios.addEventListener('click', e => {
      const summary = e.target.closest('.medio-cat-header');
      if (!summary || $('#filtro-medio').value.trim() || $('#filtro-grupo-medio').value || $('#filtro-estado-medio').value) return;
      const cat = summary.closest('.medio-cat');
      if (cat.open) MEDIOS_CATS_ABIERTAS.delete(cat.dataset.cat);
      else MEDIOS_CATS_ABIERTAS.add(cat.dataset.cat);
    });
    contMedios.addEventListener('change', e => {
      const select = e.target.closest('.medio-estado');
      const fila = select && select.closest('.medio-fila');
      const modo = modoEnPanel();
      if (!fila || !modo) return;
      setOverride(fila.dataset.dominio, select.value, modo);
      actualizarFilaMedio(fila.dataset.dominio);
      ajModoCambiado(modo);
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
