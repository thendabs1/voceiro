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
  PLATAFORMA.menu(t('pendientes'), () => openSettings('pendientes'));
  PLATAFORMA.menu(t('openSettings'), () => openSettings());
  PLATAFORMA.menu(t('addCurrent'), () => {
    const d = normalizeDomain(location.hostname);
    if (CFG.sites.some(s => s.domain === d)){ toast(t('alreadyInList')); return; }
    addSiteAnywhere(d);
    saveCfg(CFG);
    toast(t('addedTo') + ' ' + d);
    actualizarBoton();
  });
  PLATAFORMA.menu(t('removeCurrent'), () => {
    const d = normalizeDomain(location.hostname);
    const before = CFG.sites.length;
    CFG.sites = CFG.sites.filter(s => s.domain !== d);
    if (CFG.sites.length < before){
      disableDomain(d);
      saveCfg(CFG);
      toast(t('removedFrom') + ' ' + d);
      actualizarBoton();
    } else {
      toast(t('notInList'));
    }
  });
  PLATAFORMA.menu(t('ignoreSectionMenu'), () => ignoreCurrentSection());
  PLATAFORMA.menu('↗ ' + t('abrirEn') + ' — ' + t('serviciosFabMenu'), () => {
    CFG.serviciosFab = CFG.serviciosFab || { oculto: false };
    CFG.serviciosFab.oculto = !CFG.serviciosFab.oculto;
    saveCfg(CFG);
    actualizarBoton();
    toast(t(CFG.serviciosFab.oculto ? 'serviciosFabOculto' : 'serviciosFabVisible'), 2000);
  });
  // El botón se oculta por medio desde su propio menú; aquí se recupera.
  PLATAFORMA.menu(t('fabMostrarAqui'), () => {
    ocultarBotonAqui(false);
    if (!document.getElementById(FAB_ID)) toast(t('fabNadaAqui'), 2400);
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

function init(){
  registerMenus();
  sincronizarLectorSiQuedoAlgo();

  if (isDomainDisabled(location.hostname)) return;

  const goBoton = () => actualizarBoton();
  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(goBoton, 250);
  else window.addEventListener('load', () => setTimeout(goBoton, 250));

  // Llegando desde «Siguiente pendiente», el lector se abre solo.
  if (llegaDeSiguientePendiente() || shouldActivateHere()){
    const go = () => activateReader();
    if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(go, 400);
    else window.addEventListener('load', () => setTimeout(go, 400));
  }
}

let __lastHref = location.href;
function checkUrlChange(){
  if (location.href === __lastHref) return;
  const cambioArticulo = normalizeUrlForMatch(location.href) !== normalizeUrlForMatch(__lastHref);
  __lastHref = location.href;
  if (!cambioArticulo) return;
  if (__lectorAbierto) __lectorAbierto.cerrar();
  actualizarBoton();
  const href = location.href;
  for (const delay of [400, 1600]) setTimeout(() => {
    if (location.href !== href || document.getElementById('il-full')) return;
    actualizarBoton();
    if (!isDomainDisabled(location.hostname) && shouldActivateHere()) activateReader();
  }, delay);
}
// Comparar la URL no modifica el historial de la página y funciona también
// desde el contexto aislado de una extensión. La caché Atrás/Adelante
// pausa el intervalo y lo reanuda al volver: solo se cancela al descartar.
const __navegacion = setInterval(checkUrlChange, 1000);
window.addEventListener('pagehide', e => {
  if (!e.persisted) clearInterval(__navegacion);
});

document.addEventListener('keydown', globalKeyHandler, true);

