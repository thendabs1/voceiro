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
