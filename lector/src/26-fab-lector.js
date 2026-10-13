/* ============================================================
   21. FAB (lector)
   ============================================================ */
function paintReaderFAB(){
  const fab = document.getElementById('il-fab');
  if (!fab) return;
  if (CFG.readerAutoAll){
    fab.style.setProperty('background', 'linear-gradient(135deg,#43a047,#1b5e20)', 'important');
    fab.style.setProperty('box-shadow', '0 4px 14px rgba(67,160,71,.65)', 'important');
  } else {
    fab.style.setProperty('background', 'linear-gradient(135deg,#d32f2f,#b71c1c)', 'important');
    fab.style.setProperty('box-shadow', '0 4px 14px rgba(0,0,0,.3)', 'important');
  }
}
function createFAB(){
  if (document.getElementById('il-fab')) return;
  const fab = document.createElement('button');
  fab.id = 'il-fab';
  fab.title = t('fabTitle') + '\n' + t('fabHidden');
  fab.textContent = '📖';
  fab.style.cssText = 'position:fixed;z-index:2147483645;width:' + UI.fabSize + 'px;height:' + UI.fabSize + 'px;' +
    'border-radius:50%;border:none;' +
    'background:linear-gradient(135deg,#d32f2f,#b71c1c);color:#fff;font-size:24px;cursor:grab;' +
    'box-shadow:0 4px 14px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;' +
    'user-select:none;touch-action:none;transition:transform .15s,box-shadow .15s;font-family:-apple-system,sans-serif;padding:0';
  document.body.appendChild(fab);

  const M = UI.fabMargin, S = UI.fabSize, GAP = UI.fabGap;
  let left, top;
  if (CFG.fab.left == null || CFG.fab.top == null){
    left = M;
    const n = countStackFABs();
    top  = window.innerHeight - M - S - n * (S + GAP);
  } else { left = CFG.fab.left; top = CFG.fab.top; }
  const clamp = () => {
    left = Math.max(4, Math.min(window.innerWidth  - S - 4, left));
    top  = Math.max(4, Math.min(window.innerHeight - S - 4, top));
  };
  clamp();
  fab.style.left = left + 'px';
  fab.style.top  = top  + 'px';

  let dragging = false, moved = false, startX = 0, startY = 0, offX = 0, offY = 0;
  function onDown(e){
    const p = e.touches ? e.touches[0] : e;
    dragging = true; moved = false;
    startX = p.clientX; startY = p.clientY;
    offX = p.clientX - left; offY = p.clientY - top;
    fab.style.cursor = 'grabbing';
    fab.style.transition = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  }
  function onMove(e){
    if (!dragging) return;
    const p = e.touches ? e.touches[0] : e;
    if (Math.abs(p.clientX - startX) > 4 || Math.abs(p.clientY - startY) > 4) moved = true;
    left = p.clientX - offX; top = p.clientY - offY;
    clamp();
    fab.style.left = left + 'px';
    fab.style.top  = top  + 'px';
    if (e.cancelable) e.preventDefault();
  }
  function onUp(){
    if (!dragging) return;
    dragging = false;
    fab.style.cursor = 'grab';
    fab.style.transition = 'transform .15s,box-shadow .15s';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
    if (moved){ CFG.fab.left = left; CFG.fab.top = top; saveCfg(CFG); }
    else activateReader();
  }
  fab.addEventListener('mousedown', onDown);
  fab.addEventListener('touchstart', onDown, { passive: true });
  fab.addEventListener('contextmenu', e => { e.preventDefault(); fab.remove(); toast(t('fabHidden')); });
  window.addEventListener('resize', () => {
    clamp();
    fab.style.left = left + 'px';
    fab.style.top  = top  + 'px';
  });

  paintReaderFAB();   // ← AQUÍ, al final de todo
}

