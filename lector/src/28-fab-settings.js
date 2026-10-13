/* ============================================================
   22b. FAB settings
   ============================================================ */
function createSettingsFAB(){
  if (document.getElementById('il-settings-fab')) return;
  if (isDomainDisabled(location.hostname)) return;
  if (!isKnownMediaDomain(location.hostname) && !findSiteRule()) return;

  const fab = document.createElement('button');
  fab.id = 'il-settings-fab';
  fab.type = 'button';
  fab.title = t('settingsFabTitle');
  fab.textContent = '⚙️';
  fab.style.cssText = 'position:fixed;bottom:' + UI.fabMargin + 'px;left:' + UI.fabMargin + 'px;' +
    'z-index:2147483644;width:' + UI.fabSize + 'px;height:' + UI.fabSize + 'px;border-radius:50%;border:none;' +
    'background:linear-gradient(135deg,#4a4a4a,#1f1f1f);color:#fff;font-size:22px;cursor:pointer;' +
    'box-shadow:0 4px 14px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;' +
    'user-select:none;transition:transform .15s,box-shadow .15s;padding:0;' +
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
  fab.onmouseenter = () => { fab.style.transform = 'scale(1.08)'; };
  fab.onmouseleave = () => { fab.style.transform = 'scale(1)'; };
  fab.onclick = () => openSettings('sites');
  document.body.appendChild(fab);
  repositionStackFABs();
}

