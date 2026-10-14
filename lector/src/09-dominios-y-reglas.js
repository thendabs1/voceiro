/* ============================================================
   7. DOMINIOS Y REGLAS
   ============================================================ */
function normalizeDomain(d){
  return String(d || '').trim().toLowerCase()
    .replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
}
function domainMatches(host, rule){
  host = String(host||'').toLowerCase();
  rule = String(rule||'').toLowerCase();
  if (!host || !rule) return false;
  return host === rule || host.endsWith('.' + rule);
}

function isKnownMediaDomain(host){
  host = String(host || '').toLowerCase();
  if (!host) return false;
  if (CATALOG_BY_DOMAIN.has(host)) return true;
  let idx = host.indexOf('.');
  while (idx !== -1){
    const suf = host.slice(idx + 1);
    if (CATALOG_BY_DOMAIN.has(suf)) return true;
    idx = host.indexOf('.', idx + 1);
  }
  for (const it of (CFG.customCatalog || [])){
    if (domainMatches(host, it.d)) return true;
  }
  for (const s of (CFG.sites || [])){
    if (domainMatches(host, s.domain)) return true;
  }
  return false;
}

function getCatalogEntry(host){
  host = String(host || '').toLowerCase();
  if (!host) return null;
  if (CATALOG_BY_DOMAIN.has(host)) return CATALOG_BY_DOMAIN.get(host);
  let idx = host.indexOf('.');
  while (idx !== -1){
    const suf = host.slice(idx + 1);
    if (CATALOG_BY_DOMAIN.has(suf)) return CATALOG_BY_DOMAIN.get(suf);
    idx = host.indexOf('.', idx + 1);
  }
  for (const it of (CFG.customCatalog || [])){
    if (domainMatches(host, it.d)) return it;
  }
  for (const s of (CFG.sites || [])){
    if (domainMatches(host, s.domain)){
      return { d: s.domain, n: s.domain, lang: s.lang, type: s.type, tags: s.tags };
    }
  }
  return null;
}

function getCustomCatalogEntry(domain){
  const d = normalizeDomain(domain);
  if (!d) return null;
  return (CFG.customCatalog || []).find(x => x.d === d) || null;
}
function addOrUpdateCustomCatalogEntry(domain, opts){
  const d = normalizeDomain(domain);
  if (!d) return;
  opts = opts || {};
  if (!Array.isArray(CFG.customCatalog)) CFG.customCatalog = [];
  const existing = CFG.customCatalog.find(x => x.d === d);
  if (existing){
    if (opts.lang) existing.lang = opts.lang;
    if (opts.type !== undefined) existing.type = opts.type;
    if (opts.tags) existing.tags = opts.tags.slice();
    if (opts.n) existing.n = opts.n;
  } else {
    CFG.customCatalog.push({
      d: d,
      n: opts.n || d,
      lang: opts.lang || 'auto',
      type: opts.type || '',
      tags: Array.isArray(opts.tags) ? opts.tags.slice() : [],
      group: 'Personalizados'
    });
  }
}
function removeCustomCatalogEntry(domain){
  const d = normalizeDomain(domain);
  if (!d) return;
  CFG.customCatalog = (CFG.customCatalog || []).filter(x => x.d !== d);
}
function isBaseCatalogDomain(domain){
  const d = normalizeDomain(domain);
  if (!d) return false;
  if (CATALOG_BY_DOMAIN.has(d)) return true;
  let idx = d.indexOf('.');
  while (idx !== -1){
    const suf = d.slice(idx + 1);
    if (CATALOG_BY_DOMAIN.has(suf)) return true;
    idx = d.indexOf('.', idx + 1);
  }
  return false;
}

function findSiteRule(){
  for (const s of CFG.sites) if (domainMatches(location.hostname, s.domain)) return s;
  return null;
}
function currentReaderSource(){
  if (__sessionSourceOverride && READER_SOURCES.includes(__sessionSourceOverride))
    return __sessionSourceOverride;
  const r = findSiteRule();
  return (r && r.readerSource && READER_SOURCES.includes(r.readerSource)) ? r.readerSource : 'auto';
}
function currentExtraction(){
  const r = findSiteRule();
  return (r && r.extraction) ? r.extraction : { mode: 'auto', root: '', exclude: '', minChars: UI.extractMinChars };
}
function ensureSiteRule(){
  let rule = findSiteRule();
  if (rule) return rule;
  const d = normalizeDomain(location.hostname);
  rule = {
    domain: d, mode: 'prompt', ignorePatterns: [], readerSource: 'auto', lang: 'auto',
    type: '', tags: [], textOnly: false,
    extraction: deepClone(DEFAULT_EXTRACTION)
  };
  CFG.sites.push(rule);
  CFG.sites.sort((a, b) => a.domain.localeCompare(b.domain));
  return rule;
}
function setReaderSourceForCurrentSite(src){
  if (!READER_SOURCES.includes(src)) return;
  const rule = ensureSiteRule();
  rule.readerSource = src;
  __sessionSourceOverride = null;
  saveCfg(CFG);
}
function removeSiteRule(domain){
  const d = normalizeDomain(domain);
  const before = CFG.sites.length;
  CFG.sites = CFG.sites.filter(s => s.domain !== d);
  if (CFG.sites.length < before){
    saveCfg(CFG);
    actualizarBoton();
    return true;
  }
  return false;
}
function getTypeLabel(id){
  if (!id) return '';
  const tt = (CFG.siteTypes || []).find(x => x.id === id);
  return tt ? tt.label : id;
}
function getAllKnownTags(){
  const set = new Set(CFG.siteTags || []);
  CFG.sites.forEach(s => (s.tags || []).forEach(tg => set.add(tg)));
  (CFG.customCatalog || []).forEach(it => (it.tags || []).forEach(tg => set.add(tg)));
  return Array.from(set).sort();
}

function isDomainDisabled(host){
  host = String(host || '').toLowerCase();
  if (!host) return false;
  return (CFG.disabledDomains || []).some(d => domainMatches(host, d));
}
function disableDomain(domain){
  const d = normalizeDomain(domain);
  if (!d) return;
  if (!Array.isArray(CFG.disabledDomains)) CFG.disabledDomains = [];
  if (!CFG.disabledDomains.includes(d)) CFG.disabledDomains.push(d);
}
function enableDomain(domain){
  const d = normalizeDomain(domain);
  if (!d) return;
  CFG.disabledDomains = (CFG.disabledDomains || []).filter(x => x !== d);
}
function removeSiteForDomain(domain){
  const d = normalizeDomain(domain);
  const before = CFG.sites.length;
  CFG.sites = CFG.sites.filter(s => s.domain !== d);
  return CFG.sites.length < before;
}

function addSiteFromCatalog(entry){
  const d = normalizeDomain(entry.d);
  if (!d) return false;
  if (CFG.sites.some(s => s.domain === d)) return false;
  CFG.sites.push({
    domain: d,
    mode: 'prompt',
    ignorePatterns: [],
    readerSource: 'auto',
    lang: entry.lang || 'auto',
    type: entry.type || '',
    tags: Array.isArray(entry.tags) ? entry.tags.slice() : [],
    textOnly: false,
    extraction: deepClone(DEFAULT_EXTRACTION)
  });
  CFG.sites.sort((a, b) => a.domain.localeCompare(b.domain));
  enableDomain(d);
  if (!isBaseCatalogDomain(d)){
    addOrUpdateCustomCatalogEntry(d, {
      n: entry.n || d, lang: entry.lang || 'auto',
      type: entry.type || '', tags: entry.tags || []
    });
  }
  return true;
}

function addSiteAnywhere(domain, opts){
  opts = opts || {};
  const d = normalizeDomain(domain);
  if (!d) return false;
  if (CFG.sites.some(s => s.domain === d)) return false;
  const cat = getCatalogEntry(d) || {};
  CFG.sites.push({
    domain: d,
    mode: opts.mode || 'prompt',
    ignorePatterns: [],
    readerSource: 'auto',
    lang: opts.lang || cat.lang || 'auto',
    type: opts.type !== undefined ? opts.type : (cat.type || ''),
    tags: opts.tags || (cat.tags ? cat.tags.slice() : []),
    textOnly: false,
    extraction: deepClone(DEFAULT_EXTRACTION)
  });
  CFG.sites.sort((a, b) => a.domain.localeCompare(b.domain));
  enableDomain(d);
  if (!isBaseCatalogDomain(d)){
    addOrUpdateCustomCatalogEntry(d, {
      n: opts.n || d, lang: opts.lang || cat.lang || 'auto',
      type: opts.type !== undefined ? opts.type : (cat.type || ''),
      tags: opts.tags || (cat.tags ? cat.tags.slice() : [])
    });
  }
  return true;
}

