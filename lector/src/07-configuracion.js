/* ============================================================
   5. CONFIGURACIÓN
   ============================================================ */
const CFG_KEY = 'lector-universal-cfg-v8';
const SCROLL_KEY = 'lector-universal-scroll';
const LEGACY_KEYS = ['lector-universal-cfg-v7','lector-universal-cfg-v6','lector-universal-cfg-v5','lector-universal-cfg-v4'];

const DEFAULT_DICTS_ES = [
  { id: 'rae', name: 'RAE', url: 'https://dle.rae.es/{palabra}', builtin: true }
];
const DEFAULT_DICTS_GL = [
  { id: 'rag', name: 'RAG', url: 'https://academia.gal/dicionario/-/termo/{palabra}', builtin: true },
  { id: 'estraviz', name: 'Estraviz', url: 'https://www.estraviz.org/pesquisa.php?palavra={palabra}', builtin: true },
  { id: 'ddd', name: 'DdD', url: 'http://sli.uvigo.es/DdD/ddd_pescuda.php?pescuda={palabra}&tipo_busca=lema', builtin: true },
  { id: 'rinoceronte', name: 'Rinoceronte', url: 'https://rinoceronte.gal/dicionario/?busca={palabra}', builtin: true },
  { id: 'digalego', name: 'Digalego', url: 'https://digalego.xunta.gal/gl/termo/{palabra}', builtin: true }
];
const DEFAULT_DICTS_CA = [
  { id: 'diec', name: 'DIEC', url: 'https://dlc.iec.cat/?EntradaText={palabra}&operEntrada=0', builtin: true },
  { id: 'diccionari', name: 'Diccionari.cat', url: 'https://www.diccionari.cat/cerca?mot={palabra}', builtin: true },
  { id: 'viccionari', name: 'Viccionari', url: 'https://ca.wiktionary.org/wiki/{palabra}', builtin: true }
];
const DEFAULT_DICTS_EU = [
  { id: 'elhuyar', name: 'Elhuyar', url: 'https://hiztegiak.elhuyar.eus/eu/{palabra}', builtin: true },
  { id: 'euskaltzaindia', name: 'Euskaltzaindia', url: 'https://www.euskaltzaindia.eus/index.php?option=com_hiztegian&task=bilaketa&Itemid=419&orria=1&hizk=eu&mota=1&bilatu={palabra}', builtin: true },
  { id: 'eu_wiktionary', name: 'Wiktionary', url: 'https://eu.wiktionary.org/wiki/{palabra}', builtin: true }
];
const DEFAULT_DICTS_EN = [
  { id: 'cambridge', name: 'Cambridge', url: 'https://dictionary.cambridge.org/dictionary/english/{palabra}', builtin: true },
  { id: 'merriam', name: 'Merriam-Webster', url: 'https://www.merriam-webster.com/dictionary/{palabra}', builtin: true },
  { id: 'collins', name: 'Collins', url: 'https://www.collinsdictionary.com/dictionary/english/{palabra}', builtin: true },
  { id: 'en_wiktionary', name: 'Wiktionary', url: 'https://en.wiktionary.org/wiki/{palabra}', builtin: true }
];
const DEFAULT_DICTS_FR = [
  { id: 'larousse_fr', name: 'Larousse', url: 'https://www.larousse.fr/dictionnaires/francais/{palabra}', builtin: true },
  { id: 'cnrtl', name: 'CNRTL', url: 'https://www.cnrtl.fr/definition/{palabra}', builtin: true },
  { id: 'fr_wiktionary', name: 'Wiktionary', url: 'https://fr.wiktionary.org/wiki/{palabra}', builtin: true }
];
const DEFAULT_DICTS_DE = [
  { id: 'duden', name: 'Duden', url: 'https://www.duden.de/suchen/dudenonline/{palabra}', builtin: true },
  { id: 'dwds', name: 'DWDS', url: 'https://www.dwds.de/wb/{palabra}', builtin: true },
  { id: 'de_wiktionary', name: 'Wiktionary', url: 'https://de.wiktionary.org/wiki/{palabra}', builtin: true }
];
const DEFAULT_DICTS_IT = [
  { id: 'treccani', name: 'Treccani', url: 'https://www.treccani.it/vocabolario/{palabra}/', builtin: true },
  { id: 'garzanti', name: 'Garzanti', url: 'https://www.garzantilinguistica.it/ricerca/?q={palabra}', builtin: true },
  { id: 'it_wiktionary', name: 'Wiktionary', url: 'https://it.wiktionary.org/wiki/{palabra}', builtin: true }
];
const DEFAULT_DICTS_PT = [
  { id: 'priberam', name: 'Priberam', url: 'https://dicionario.priberam.org/{palabra}', builtin: true },
  { id: 'infopedia', name: 'Infopédia', url: 'https://www.infopedia.pt/dicionarios/lingua-portuguesa/{palabra}', builtin: true },
  { id: 'pt_wiktionary', name: 'Wiktionary', url: 'https://pt.wiktionary.org/wiki/{palabra}', builtin: true }
];
const DEFAULT_DICT_MAP = {
  es: DEFAULT_DICTS_ES, gl: DEFAULT_DICTS_GL, ca: DEFAULT_DICTS_CA,
  eu: DEFAULT_DICTS_EU, en: DEFAULT_DICTS_EN,
  fr: DEFAULT_DICTS_FR, de: DEFAULT_DICTS_DE, it: DEFAULT_DICTS_IT, pt: DEFAULT_DICTS_PT
};

const DEFAULT_EXTRACTION = { mode: 'auto', root: '', exclude: '', minChars: 100 };

const DEFAULT_CFG = {
  lang: 'es',
  sites: [],
  siteTypes: null,
  siteTags: [],
  disabledDomains: [],
  customCatalog: [],
  readLater: [],
  perfilActualizado: 0,
  configActualizado: 0,
  readerAutoAll: false,
  readerSettings: {
    keepReadItems: true
  },
  fab: { left: null, top: null },
  servicios: [],
  serviciosFab: { oculto: false },
  prefs: {
    fs: 18, theme: 'light', width: 720, font: 'georgia', lh: 1.7,
    just: false, bionic: false, focus: false, img: true,
    panelText: true, panelActions: false
  },
  dict: {
    mode: 'direct',
    defaultEs: 'rae', defaultGl: 'rag', defaultCa: 'diec',
    defaultEu: 'elhuyar', defaultEn: 'cambridge',
    defaultFr: 'larousse_fr', defaultDe: 'duden',
    defaultIt: 'treccani', defaultPt: 'priberam',
    customEs: [], customGl: [], customCa: [], customEu: [], customEn: [],
    customFr: [], customDe: [], customIt: [], customPt: []
  },
  shortcuts: {
    reader: {
      close:         ['escape'],
      fontIncrease:  ['+', '='],
      fontDecrease:  ['-', '_'],
      toggleTheme:   ['d'],
      scrollTop:     ['t'],
      scrollBottom:  ['shift+g'],
      toggleBionic:  ['b'],
      toggleFocus:   ['f'],
      toggleJustify: ['j'],
      toggleImages:  ['i'],
      toggleWide:    ['w'],
      saveLater:     ['s'],
      openSites:     ['l'],
      openQueue:     ['p'],
      openRSVP:      ['r'],
      copyText:      []
    },
    global: {
      openReader:     ['alt+l'],
      openQueue:      ['alt+p'],
      openMedia:      ['alt+m'],
      openSettings:   ['alt+s'],
      abrirEn:        [],
      toggleTextOnly: ['alt+i'],
      openVoceiro:    ['alt+v']
      }
    },
    voceiro: { presets: [] }
};

function deepClone(o){ return JSON.parse(JSON.stringify(o)); }

function normalizeExtraction(ex, oldSel){
  if (!ex || typeof ex !== 'object') ex = {};
  const out = {
    mode: EXTRACTION_MODES.includes(ex.mode) ? ex.mode : 'auto',
    root: typeof ex.root === 'string' ? ex.root : '',
    exclude: typeof ex.exclude === 'string' ? ex.exclude : '',
    minChars: typeof ex.minChars === 'number' ? ex.minChars : UI.extractMinChars
  };
  if (oldSel && typeof oldSel === 'string' && oldSel.trim()){
    out.mode = 'selector';
    out.root = oldSel.trim();
  }
  return out;
}

function migrateCfg(cfg){
  if (!Array.isArray(cfg.sites)) cfg.sites = [];

  if (!Array.isArray(cfg.disabledDomains)) cfg.disabledDomains = [];
  cfg.disabledDomains = cfg.disabledDomains.map(d => String(d||'').toLowerCase()
    .replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0]).filter(Boolean);
  cfg.disabledDomains = Array.from(new Set(cfg.disabledDomains));

  if (!Array.isArray(cfg.customCatalog)) cfg.customCatalog = [];
  cfg.customCatalog.forEach(it => {
    if (!it.d) it.d = '';
    if (!it.n) it.n = it.d;
    if (!it.lang) it.lang = 'auto';
    if (!it.type) it.type = '';
    if (!Array.isArray(it.tags)) it.tags = [];
    if (!it.group) it.group = 'Personalizados';
  });
  cfg.customCatalog = cfg.customCatalog.filter(it => it.d);

  cfg.sites.forEach(s => {
    if (!Array.isArray(s.ignorePatterns)) s.ignorePatterns = [];
    if (!s.mode) s.mode = 'prompt';
    if (!s.domain) s.domain = '';
    if (!s.lang || !SITE_LANGS.includes(s.lang)) s.lang = 'auto';
    if (!s.type) s.type = '';
    if (!Array.isArray(s.tags)) s.tags = [];
    if (typeof s.textOnly !== 'boolean') s.textOnly = false;
    const oldSel = typeof s.customSelector === 'string' ? s.customSelector : '';
    s.extraction = normalizeExtraction(s.extraction, oldSel);
    delete s.customSelector;
    if (!s.readerSource || !READER_SOURCES.includes(s.readerSource)) s.readerSource = 'auto';

  });
  cfg.sites = cfg.sites.filter(s => s.domain);

  if (!Array.isArray(cfg.siteTags)) cfg.siteTags = [];
  cfg.siteTags = Array.from(new Set(cfg.siteTags.map(x => String(x).trim()).filter(Boolean)));

  const langKey = (DEFAULT_SITE_TYPES[cfg.lang] ? cfg.lang : 'es');
  const userTypes = Array.isArray(cfg.siteTypes) ? cfg.siteTypes.slice() : [];
  const existingById = new Map();
  userTypes.forEach(tt => {
    if (!tt.id) tt.id = 't-' + Math.random().toString(36).slice(2, 8);
    if (!tt.label) tt.label = tt.id;
    if (!existingById.has(tt.id)) existingById.set(tt.id, tt);
  });

  const universalTypes = DEFAULT_SITE_TYPES[langKey];
  universalTypes.forEach(def => {
    if (!existingById.has(def.id)){
      existingById.set(def.id, { id: def.id, label: def.label, builtin: true });
    } else {
      const cur = existingById.get(def.id);
      if (!cur.builtin) cur.builtin = true;
    }
  });

  cfg.siteTypes = Array.from(existingById.values());

  const baseDomains = new Set(CATALOG_FLAT.map(x => x.d));
  const customDomains = new Set(cfg.customCatalog.map(x => x.d));
  cfg.sites.forEach(s => {
    if (!baseDomains.has(s.domain) && !customDomains.has(s.domain)){
      cfg.customCatalog.push({
        d: s.domain, n: s.domain, lang: s.lang || 'auto',
        type: s.type || '', tags: (s.tags||[]).slice(),
        group: 'Personalizados'
      });
      customDomains.add(s.domain);
    }
  });
  cfg.disabledDomains.forEach(d => {
    if (!baseDomains.has(d) && !customDomains.has(d)){
      cfg.customCatalog.push({
        d, n: d, lang: 'auto', type: '', tags: [],
        group: 'Personalizados'
      });
      customDomains.add(d);
    }
  });

  cfg.readLater = fusionarPendientes(Array.isArray(cfg.readLater) ? cfg.readLater : [], []);
  if (typeof cfg.perfilActualizado !== 'number') cfg.perfilActualizado = 0;
  if (typeof cfg.configActualizado !== 'number') cfg.configActualizado = 0;

  if (!cfg.readerSettings || typeof cfg.readerSettings !== 'object'){
    cfg.readerSettings = { keepReadItems: true };
  }
  if (typeof cfg.readerSettings.keepReadItems !== 'boolean'){
    cfg.readerSettings.keepReadItems = true;
  }

  if (typeof cfg.readerAutoAll !== 'boolean') cfg.readerAutoAll = false;
  if (cfg.prefs.panelText === undefined) cfg.prefs.panelText = true;
  if (cfg.prefs.panelActions === undefined) cfg.prefs.panelActions = false;
  if ('readerSource' in cfg.prefs) delete cfg.prefs.readerSource;

  cfg.servicios = normalizarServicios(cfg.servicios);
  if (!cfg.serviciosFab || typeof cfg.serviciosFab !== 'object') cfg.serviciosFab = { oculto: false };
  if (typeof cfg.serviciosFab.oculto !== 'boolean') cfg.serviciosFab.oculto = false;

  if (!cfg.dict || typeof cfg.dict !== 'object') cfg.dict = deepClone(DEFAULT_CFG.dict);
  if (!cfg.dict.mode) cfg.dict.mode = 'direct';
  if (!cfg.dict.defaultEs) cfg.dict.defaultEs = 'rae';
  if (!cfg.dict.defaultGl) cfg.dict.defaultGl = 'rag';
  if (!cfg.dict.defaultCa) cfg.dict.defaultCa = 'diec';
  if (!cfg.dict.defaultEu) cfg.dict.defaultEu = 'elhuyar';
  if (!cfg.dict.defaultEn) cfg.dict.defaultEn = 'cambridge';
  if (!cfg.dict.defaultFr) cfg.dict.defaultFr = 'larousse_fr';
  if (!cfg.dict.defaultDe) cfg.dict.defaultDe = 'duden';
  if (!cfg.dict.defaultIt) cfg.dict.defaultIt = 'treccani';
  if (!cfg.dict.defaultPt) cfg.dict.defaultPt = 'priberam';
  ['customEs','customGl','customCa','customEu','customEn',
   'customFr','customDe','customIt','customPt'].forEach(k => {
    if (!Array.isArray(cfg.dict[k])) cfg.dict[k] = [];
  });

  if (!UI_LANGS.includes(cfg.lang)) cfg.lang = 'es';

  if (!cfg.shortcuts || typeof cfg.shortcuts !== 'object') cfg.shortcuts = deepClone(DEFAULT_CFG.shortcuts);
  else {
    for (const scope of ['reader', 'global']){
      if (!cfg.shortcuts[scope] || typeof cfg.shortcuts[scope] !== 'object')
        cfg.shortcuts[scope] = {};
      for (const action of Object.keys(DEFAULT_CFG.shortcuts[scope])){
        if (!(action in cfg.shortcuts[scope])){
          cfg.shortcuts[scope][action] = deepClone(DEFAULT_CFG.shortcuts[scope][action]);
        } else if (!Array.isArray(cfg.shortcuts[scope][action])){
          cfg.shortcuts[scope][action] = [];
        } else {
          cfg.shortcuts[scope][action] = cfg.shortcuts[scope][action].map(k => String(k));
        }
      }
    }
  }
  if (!cfg.voceiro || typeof cfg.voceiro !== 'object') cfg.voceiro = { presets: [] };
  if (!Array.isArray(cfg.voceiro.presets)) cfg.voceiro.presets = [];

  return cfg;
}


function mergeCfg(base, over){
  const out = deepClone(base);
  if (!over || typeof over !== 'object') return out;
  for (const k of Object.keys(over)){
    if (k === 'prefs' || k === 'fab' || k === 'dict' || k === 'serviciosFab' || k === 'shortcuts' || k === 'readerSettings')
      out[k] = Object.assign({}, out[k], over[k] || {});
    else out[k] = over[k];
  }
  return migrateCfg(out);
}

function loadCfg(){
  try {
    let stored = PLATAFORMA.leer(CFG_KEY, null);
    if (!stored){
      for (const lk of LEGACY_KEYS){
        const legacy = PLATAFORMA.leer(lk, null);
        if (legacy){ stored = legacy; break; }
      }
    }
    if (!stored) return migrateCfg(deepClone(DEFAULT_CFG));
    return mergeCfg(DEFAULT_CFG, stored);
  } catch(e){ return migrateCfg(deepClone(DEFAULT_CFG)); }
}

// Perfil de lectura común con Voceiro: idioma, tema, fuente, tamaño,
// justificado, biónica y foco. Cuando cambia, se sella perfilActualizado:
// decide qué perfil gana al juntarse con el de Voceiro.
let __perfilFirma = null;
function firmaPerfilLector(cfg){
  const p = cfg.prefs || {};
  return JSON.stringify([cfg.lang, p.theme, p.font, p.fs, !!p.just, !!p.bionic, !!p.focus]);
}
function perfilDelLector(){
  const p = CFG.prefs || {};
  return limpiarPerfil({
    lang: CFG.lang, tema: p.theme, fuente: p.font === 'georgia' ? 'serif' : p.font,
    fs: p.fs, just: !!p.just, bionic: !!p.bionic, focus: !!p.focus,
    actualizado: CFG.perfilActualizado || 0
  });
}
function aplicarPerfilAlLector(perfil){
  const p = CFG.prefs;
  if (UI_LANGS.includes(perfil.lang)) CFG.lang = perfil.lang;
  if (['light', 'sepia', 'dark', 'contrast'].includes(perfil.tema)) p.theme = perfil.tema;
  if (perfil.fuente) p.font = perfil.fuente === 'serif' ? 'georgia' : perfil.fuente;
  if (typeof perfil.fs === 'number') p.fs = Math.min(UI.fsMax, Math.max(UI.fsMin, perfil.fs));
  ['just', 'bionic', 'focus'].forEach(k => { if (perfil[k] !== undefined) p[k] = !!perfil[k]; });
  CFG.perfilActualizado = perfil.actualizado;
  __perfilFirma = firmaPerfilLector(CFG);   // ya sellado: no es un cambio de aquí
}

// Configuración propia del lector que viaja a otros dispositivos (por
// Voceiro y su sincronización): reglas por sitio, catálogo propio,
// diccionarios, servicios de «Abrir en…», atajos… Todo menos Pendientes, el
// perfil común (va aparte), los sellos y la posición de los botones.
const CFG_NO_VIAJA = ['readLater', 'voceiro', 'lang', 'perfilActualizado', 'configActualizado', 'fab'];
const PREFS_DEL_PERFIL = ['theme', 'font', 'fs', 'just', 'bionic', 'focus'];
let __configFirma = null;

function configCompartida(cfg){
  const out = {};
  for (const k of Object.keys(cfg)){
    if (!CFG_NO_VIAJA.includes(k)) out[k] = cfg[k];
  }
  if (out.prefs){
    const p = { ...out.prefs };
    PREFS_DEL_PERFIL.forEach(k => delete p[k]);
    out.prefs = p;
  }
  return JSON.parse(JSON.stringify(out));
}
function firmaConfig(cfg){
  return huellaCanonica(configCompartida(cfg));
}
function bloqueConfigLector(){
  return { datos: configCompartida(CFG), actualizado: CFG.configActualizado || 0 };
}
// Adopta la configuración que llega de otro dispositivo (ya sellada).
function aplicarBloqueConfig(bloque){
  const d = (bloque && bloque.datos) || {};
  for (const k of Object.keys(d)){
    if (CFG_NO_VIAJA.includes(k)) continue;
    if (k === 'prefs'){
      const p = { ...(CFG.prefs || {}) };
      for (const [pk, pv] of Object.entries(d.prefs || {})){
        if (!PREFS_DEL_PERFIL.includes(pk)) p[pk] = pv;
      }
      CFG.prefs = p;
    } else {
      CFG[k] = d[k];
    }
  }
  CFG = migrateCfg(CFG);
  CFG.configActualizado = bloque.actualizado;
  __configFirma = firmaConfig(CFG);    // ya sellado: no es un cambio de aquí
  __perfilFirma = firmaPerfilLector(CFG);
}

function saveCfg(cfg){
  const firma = firmaPerfilLector(cfg);
  if (__perfilFirma !== null && firma !== __perfilFirma) cfg.perfilActualizado = Date.now();
  __perfilFirma = firma;
  const firmaC = firmaConfig(cfg);
  if (__configFirma !== null && firmaC !== __configFirma) cfg.configActualizado = Date.now();
  __configFirma = firmaC;
  PLATAFORMA.guardar(CFG_KEY, cfg);
}
let CFG = loadCfg();
__perfilFirma = firmaPerfilLector(CFG);
__configFirma = firmaConfig(CFG);
let __sessionSourceOverride = null;

function t(k){ const L = I18N[CFG.lang] || I18N.es; return L[k] || I18N.es[k] || k; }

