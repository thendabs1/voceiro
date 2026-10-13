/* ============================================================
   8. SECCIONES IGNORADAS
   ============================================================ */
function isPlainDomain(){
  const p = location.pathname || '/';
  if (p === '' || p === '/') return true;
  if (/^\/(index\.(html?|php))?$/i.test(p)) return true;
  return false;
}
function sectionPatternFromPath(pathname){
  let p = pathname || '/';
  if (!p.startsWith('/')) p = '/' + p;
  const parts = p.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  return '/' + parts[0] + '/';
}
function isIgnoredSection(rule){
  if (!rule || !Array.isArray(rule.ignorePatterns) || !rule.ignorePatterns.length) return false;
  const p = location.pathname || '/';
  return rule.ignorePatterns.some(pat => p.startsWith(pat));
}
function ignoreCurrentSection(){
  const pattern = sectionPatternFromPath(location.pathname);
  if (!pattern){ toast(t('cannotIgnoreSection')); return; }
  const existedBefore = !!findSiteRule();
  const rule = ensureSiteRule();
  if (!Array.isArray(rule.ignorePatterns)) rule.ignorePatterns = [];
  if (rule.ignorePatterns.includes(pattern)){ toast(t('sectionAlreadyIgnored')); return; }
  rule.ignorePatterns.push(pattern);
  CFG.sites.sort((a, b) => a.domain.localeCompare(b.domain));
  saveCfg(CFG);
  const fab = document.getElementById('il-fab'); if (fab) fab.remove();
  const bfab = document.getElementById('il-servicios-fab'); if (bfab) bfab.remove();
  const afab = document.getElementById('il-add-fab'); if (afab) afab.remove();
  repositionStackFABs();
  toast((existedBefore ? '' : t('siteAddedForIgnore') + '\n') + t('sectionIgnored') + ' ' + pattern);
}

