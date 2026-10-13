/* ============================================================
   10. TOAST + DIÁLOGO
   ============================================================ */
function toast(msg, ms, action){
  ms = ms || 2400;
  if (action) ms = Math.max(ms, 6000);
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%) translateY(20px);' +
    'background:#222;color:#fff;padding:12px 18px;border-radius:8px;' +
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;' +
    'z-index:2147483647;box-shadow:0 6px 20px rgba(0,0,0,.35);opacity:0;' +
    'transition:opacity .2s,transform .2s;max-width:90vw;' +
    'display:flex;align-items:center;gap:12px;' +
    'pointer-events:' + (action ? 'auto' : 'none');
  const span = document.createElement('span');
  span.textContent = msg;
  span.style.whiteSpace = 'pre-wrap';
  el.appendChild(span);
  if (action){
    const btn = document.createElement('button');
    btn.textContent = action.label;
    btn.style.cssText = 'background:transparent;color:#ffb4b4;border:1px solid #ffb4b4;' +
      'padding:4px 10px;border-radius:4px;cursor:pointer;font-size:13px;font-weight:bold;' +
      'font-family:inherit;flex:0 0 auto';
    btn.onclick = () => { try { action.onClick(); } catch(e){} el.remove(); };
    el.appendChild(btn);
  }
  document.body.appendChild(el);
  requestAnimationFrame(()=>{ el.style.opacity='1'; el.style.transform='translateX(-50%) translateY(0)'; });
  setTimeout(()=>{
    el.style.opacity='0'; el.style.transform='translateX(-50%) translateY(20px)';
    setTimeout(()=>el.remove(), 250);
  }, ms);
}

function showAddSiteDialog(domain, srcLabel, parentEl){
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483647;' +
      'display:flex;align-items:center;justify-content:center;padding:20px;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;color:#222;border-radius:12px;max-width:460px;width:100%;' +
      'padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.4)';
    box.innerHTML =
      '<h3 style="margin:0 0 10px;font-size:17px">' + esc(t('addSiteTitle')) + '</h3>' +
      '<p style="margin:0 0 18px;font-size:14px;line-height:1.5;color:#444">' +
        esc(t('addSiteQuestion').replace('{X}', domain).replace('{Y}', srcLabel)) +
      '</p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end">' +
        '<button class="il-dlg-cancel" style="padding:9px 14px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer;font-size:14px">' + esc(t('btnCancel')) + '</button>' +
        '<button class="il-dlg-once" style="padding:9px 14px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer;font-size:14px">' + esc(t('btnOnlyOnce')) + '</button>' +
        '<button class="il-dlg-add" style="padding:9px 14px;background:#d32f2f;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:bold">' + esc(t('btnAddList')) + '</button>' +
      '</div>';
    overlay.appendChild(box);
    (parentEl || document.body).appendChild(overlay);
    let resolved = false;
    function cleanup(val){
      if (resolved) return;
      resolved = true;
      document.removeEventListener('keydown', escCapture, true);
      overlay.remove();
      resolve(val);
    }
    function escCapture(e){
      if (e.key === 'Escape'){ e.stopImmediatePropagation(); e.preventDefault(); cleanup('cancel'); }
    }
    document.addEventListener('keydown', escCapture, true);
    box.querySelector('.il-dlg-cancel').onclick = () => cleanup('cancel');
    box.querySelector('.il-dlg-once').onclick   = () => cleanup('once');
    box.querySelector('.il-dlg-add').onclick    = () => cleanup('add');
    overlay.addEventListener('click', e => { if (e.target === overlay) cleanup('cancel'); });
  });
}

