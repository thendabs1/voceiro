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
