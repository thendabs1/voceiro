/* ============================================================
   6. DICCIONARIOS
   ============================================================ */
function getDictsForLang(lang){
  const base = DEFAULT_DICT_MAP[lang] || DEFAULT_DICTS_ES;
  const keyMap = {
    es: 'customEs', gl: 'customGl', ca: 'customCa', eu: 'customEu',
    en: 'customEn', fr: 'customFr', de: 'customDe', it: 'customIt', pt: 'customPt'
  };
  const custom = CFG.dict[keyMap[lang]] || [];
  return base.concat(custom);
}
function getDefaultDictId(lang){
  if (lang === 'gl') return CFG.dict.defaultGl;
  if (lang === 'ca') return CFG.dict.defaultCa;
  if (lang === 'eu') return CFG.dict.defaultEu;
  if (lang === 'en') return CFG.dict.defaultEn;
  if (lang === 'fr') return CFG.dict.defaultFr;
  if (lang === 'de') return CFG.dict.defaultDe;
  if (lang === 'it') return CFG.dict.defaultIt;
  if (lang === 'pt') return CFG.dict.defaultPt;
  return CFG.dict.defaultEs;
}
function getDefaultDict(lang){
  const id = getDefaultDictId(lang);
  const all = getDictsForLang(lang);
  return all.find(d => d.id === id) || all[0] || null;
}
function detectPageLang(){
  const rule = findSiteRule();
  if (rule && rule.lang && rule.lang !== 'auto') return rule.lang;
  const htmlLang = (document.documentElement.lang || '').toLowerCase().split('-')[0];
  if (SITE_LANGS.includes(htmlLang) && htmlLang !== 'auto') return htmlLang;
  return UI_LANGS.includes(CFG.lang) ? CFG.lang : 'es';
}
function buildDictUrl(dict, word){
  if (!dict || !dict.url) return null;
  return dict.url.replace(/\{palabra\}/g, encodeURIComponent(word.trim()));
}
function openDictionary(dict, word){
  if (!dict) { toast(t('dictNoDefault')); return; }
  const url = buildDictUrl(dict, word);
  if (!url){ toast(t('dictNotFound')); return; }
  window.open(url, '_blank', 'noopener');
}

