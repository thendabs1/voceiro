/* ============================================================
   26. MENÚS GM + INIT + SPA
   ============================================================ */
let __menusRegistered = false;
function registerMenus(){
  if (__menusRegistered) return;
  if (!PLATAFORMA.hayMenu()) return;
  __menusRegistered = true;
  PLATAFORMA.menu('📰 ' + t('scOpenVoceiro'), () => {
    window.open(VOCEIRO_URL, '_blank', 'noopener,noreferrer');
  });
  PLATAFORMA.menu(t('openReader'), () => activateReader());
  PLATAFORMA.menu(t('openMedias'), () => openSettings('sites'));
  PLATAFORMA.menu(t('catalog'), () => openSettings('catalog'));
  PLATAFORMA.menu(t('pendientes'), () => openSettings('pendientes'));
  PLATAFORMA.menu(t('openSettings'), () => openSettings());
  PLATAFORMA.menu(t('addCurrent'), () => {
    const d = normalizeDomain(location.hostname);
    if (CFG.sites.some(s => s.domain === d)){ toast(t('alreadyInList')); return; }
    const cat = getCatalogEntry(d) || {};
    addSiteAnywhere(d, {
      n: cat.n || d,
      lang: cat.lang || 'auto',
      type: cat.type || '',
      tags: cat.tags || []
    });
    saveCfg(CFG);
    toast(t('addedTo') + ' ' + d);
    const afab = document.getElementById('il-add-fab'); if (afab) afab.remove();
    if (!isPlainDomain() && !isIgnoredSection(findSiteRule())) createFAB();
    if (!document.getElementById('il-servicios-fab') && debeMostrarFabServicios()) crearFabServicios();
    repositionStackFABs();
  });
  PLATAFORMA.menu(t('removeCurrent'), () => {
    const d = normalizeDomain(location.hostname);
    const before = CFG.sites.length;
    CFG.sites = CFG.sites.filter(s => s.domain !== d);
    if (CFG.sites.length < before){
      disableDomain(d);
      saveCfg(CFG);
      toast(t('removedFrom') + ' ' + d);
      const f = document.getElementById('il-fab'); if (f) f.remove();
      const bf = document.getElementById('il-servicios-fab'); if (bf) bf.remove();
      ensureAddFAB();
      repositionStackFABs();
    } else {
      toast(t('notInList'));
    }
  });
  PLATAFORMA.menu(t('ignoreSectionMenu'), () => ignoreCurrentSection());
  PLATAFORMA.menu('↗ ' + t('abrirEn') + ' — ' + t('serviciosFabMenu'), () => {
    CFG.serviciosFab = CFG.serviciosFab || { oculto: false };
    CFG.serviciosFab.oculto = !CFG.serviciosFab.oculto;
    saveCfg(CFG);
    if (CFG.serviciosFab.oculto){
      const el = document.getElementById('il-servicios-fab');
      if (el) el.remove();
      toast(t('serviciosFabOculto'), 2000);
    } else {
      crearFabServicios();
      toast(t('serviciosFabVisible'), 2000);
    }
  });
}

function shouldActivateHere(){
  if (isPlainDomain()) return false;
  if (isDomainDisabled(location.hostname)) return false;
  const rule = findSiteRule();
  if (rule && rule.mode === 'off') return false;
  if (rule && isIgnoredSection(rule)) return false;

  if (CFG.readerAutoAll){
    if (rule) return true;
    return isKnownMediaDomain(location.hostname) && isArticlePage();
  }

  return !!(rule && rule.mode === 'auto');
}

function ensureSettingsFAB(){
  if (document.getElementById('il-settings-fab')) return;
  if (isDomainDisabled(location.hostname)) return;
  if (!isKnownMediaDomain(location.hostname) && !findSiteRule()) return;
  createSettingsFAB();
}

function init(){
  registerMenus();

  if (isDomainDisabled(location.hostname)) return;
  if (!isPlainDomain()) ensureSettingsFAB();

  if (debeMostrarFabServicios()){
    const goServicios = () => crearFabServicios();
    if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(goServicios, 300);
    else window.addEventListener('load', () => setTimeout(goServicios, 300));
  }

  if (shouldShowReaderFAB()){
    const goFab = () => ensureReaderFAB();
    if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(goFab, 250);
    else window.addEventListener('load', () => setTimeout(goFab, 250));
  }

  if (shouldActivateHere()){
    const go = () => activateReader();
    if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(go, 400);
    else window.addEventListener('load', () => setTimeout(go, 400));
  }
}

let __lastHref = location.href;
function checkUrlChange(){
  if (location.href === __lastHref) return;
  __lastHref = location.href;
  if (document.getElementById('il-full')) return;
  const fab = document.getElementById('il-fab');
  if (fab) fab.remove();
  const bfab = document.getElementById('il-servicios-fab');
  if (bfab) bfab.remove();
  const sfab = document.getElementById('il-settings-fab');
  if (sfab) sfab.remove();
  const afab = document.getElementById('il-add-fab');
  if (afab) afab.remove();

  const attempt = (delay) => setTimeout(() => {
    if (document.getElementById('il-full')) return;
    if (isDomainDisabled(location.hostname)) return;
    if (!isPlainDomain() && !document.getElementById('il-settings-fab')){
      ensureSettingsFAB();
    }
    if (!isPlainDomain()) ensureAddFAB();
    if (debeMostrarFabServicios() && !document.getElementById('il-servicios-fab')){
      crearFabServicios();
    }
    ensureReaderFAB();
    repositionStackFABs();
    if (shouldActivateHere()) init();
  }, delay);
  attempt(400);
  attempt(1600);
}
['pushState','replaceState'].forEach(m => {
  const orig = history[m];
  history[m] = function(){
    const r = orig.apply(this, arguments);
    setTimeout(checkUrlChange, 60);
    return r;
  };
});
window.addEventListener('popstate', () => setTimeout(checkUrlChange, 60));

document.addEventListener('keydown', globalKeyHandler, true);

