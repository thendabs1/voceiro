/* ============================================================
   22c. FAB añadir sitio actual
   ============================================================ */
function createAddFAB(){
  if (document.getElementById('il-add-fab')) return;
  if (findSiteRule()) return;
  if (isDomainDisabled(location.hostname)) return;
  if (isPlainDomain()) return;
  if (!isKnownMediaDomain(location.hostname)) return;

  const fab = document.createElement('button');
  fab.id = 'il-add-fab';
  fab.type = 'button';
  fab.title = t('addFabTitle');
  fab.textContent = '＋';
  fab.style.cssText = 'position:fixed;bottom:' + UI.fabMargin + 'px;left:' + UI.fabMargin + 'px;' +
    'z-index:2147483644;width:' + UI.fabSize + 'px;height:' + UI.fabSize + 'px;border-radius:50%;border:none;' +
    'background:linear-gradient(135deg,#2e7d32,#1b5e20);color:#fff;font-size:26px;cursor:pointer;' +
    'box-shadow:0 4px 14px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;' +
    'user-select:none;transition:transform .15s,box-shadow .15s;padding:0;line-height:1;' +
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-weight:bold';
  fab.onmouseenter = () => { fab.style.transform = 'scale(1.08)'; };
  fab.onmouseleave = () => { fab.style.transform = 'scale(1)'; };
  fab.onclick = () => {
    const d = normalizeDomain(location.hostname);
    if (!d) return;
    if (CFG.sites.some(s => s.domain === d)){
      toast(t('alreadyInList'));
      fab.remove(); repositionStackFABs();
      return;
    }
    const cat = getCatalogEntry(d) || {};
    addSiteAnywhere(d, {
      n: cat.n || d,
      lang: cat.lang || 'auto',
      type: cat.type || '',
      tags: cat.tags || []
    });
    saveCfg(CFG);
    toast(t('addedTo') + ' ' + d, 6000,
      { label: t('btnUndo'), onClick: () => {
        if (removeSiteRule(d)){
          toast(t('siteRemovedToast').replace('{X}', d), 1800);
          setTimeout(() => { ensureAddFAB(); repositionStackFABs(); }, 50);
        }
      } });
    fab.remove();
    repositionStackFABs();
    if (!document.getElementById('il-fab')) ensureReaderFAB();
    if (!document.getElementById('il-servicios-fab') && debeMostrarFabServicios()) crearFabServicios();
  };
  document.body.appendChild(fab);
  repositionStackFABs();
}

function ensureAddFAB(){
  if (findSiteRule()) return;
  if (isDomainDisabled(location.hostname)) return;
  if (isPlainDomain()) return;
  if (!isKnownMediaDomain(location.hostname)) return;
  if (document.getElementById('il-add-fab')) return;
  createAddFAB();
}

