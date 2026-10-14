/* ============================================================
   15. DETECCIÓN DE ARTÍCULO / FAB
   ============================================================ */
function isArticlePage(){
  if (document.querySelector('article')) return true;
  const ogType = metaContent('meta[property="og:type"]');
  if (/article|news/i.test(ogType)) return true;
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const s of scripts){
    const txt = (s.textContent || '').slice(0, 4000);
    if (/"@type"\s*:\s*"(NewsArticle|Article|BlogPosting|ReportageNewsArticle|TechArticle|ScholarlyArticle)"/i.test(txt)) return true;
  }
  return false;
}

function debeMostrarFabServicios(){
  if (!serviciosConfigurados().length) return false;
  if (CFG.serviciosFab && CFG.serviciosFab.oculto) return false;
  if (isPlainDomain()) return false;
  if (isDomainDisabled(location.hostname)) return false;
  const rule = findSiteRule();
  if (rule && rule.mode === 'off') return false;
  if (rule && isIgnoredSection(rule)) return false;
  if (rule) return true;
  if (!isKnownMediaDomain(location.hostname)) return false;
  return isArticlePage();
}

function shouldShowReaderFAB(){
  if (isPlainDomain()) return false;
  if (isDomainDisabled(location.hostname)) return false;
  const rule = findSiteRule();
  if (rule && rule.mode === 'off') return false;
  if (rule && isIgnoredSection(rule)) return false;
  if (rule) return true;
  if (!isKnownMediaDomain(location.hostname)) return false;
  return isArticlePage();
}


