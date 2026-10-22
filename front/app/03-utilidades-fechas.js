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
