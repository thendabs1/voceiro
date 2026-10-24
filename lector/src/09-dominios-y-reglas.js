/* ============================================================
   7. DOMINIOS Y REGLAS
   ============================================================ */
function normalizeDomain(d){
  const valor = String(d || '').trim();
  if (!valor) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(valor) ? valor : 'https://' + valor);
    if (!/^https?:$/.test(u.protocol) || u.username || u.password || u.port) return '';
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch(e){ return ''; }
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
  for (const s of (CFG.sites || [])){
    if (domainMatches(host, s.domain)) return { d: s.domain, n: s.domain, lang: s.lang };
  }
  return null;
}

function findSiteRule(){
  return CFG.sites.filter(s => domainMatches(location.hostname, s.domain))
    .reduce((mejor, s) => !mejor || s.domain.length > mejor.domain.length ? s : mejor, null);
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
    domain: d, mode: 'prompt', ignorePatterns: [], readerSource: 'auto',
    lang: (getCatalogEntry(d) || {}).lang || 'auto',
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
    extraction: deepClone(DEFAULT_EXTRACTION)
  });
  CFG.sites.sort((a, b) => a.domain.localeCompare(b.domain));
  enableDomain(d);
  return true;
}

