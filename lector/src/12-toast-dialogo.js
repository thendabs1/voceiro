/* ============================================================
   10. TOAST + DIÁLOGO
   ============================================================ */
function toast(msg, ms, action){
  ms = ms || 2400;
  if (action) ms = Math.max(ms, 6000);
  // Colores invertidos del tema (fondo = texto): se ve sobre cualquier
  // página. role=status: los lectores de pantalla lo leen sin mover el foco.
  const el = temaDe(document.createElement('div'));
  el.setAttribute('role', 'status');
  el.style.cssText = 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%) translateY(20px);' +
    'background:var(--fg);color:var(--bg);padding:12px 18px;border-radius:8px;' +
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
    btn.type = 'button';
    btn.style.cssText = 'background:transparent;color:var(--bg);border:1px solid var(--bg);text-decoration:underline;' +
      'min-height:32px;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:13px;font-weight:bold;' +
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
    const overlay = temaDe(document.createElement('div'));
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483647;' +
      'display:flex;align-items:center;justify-content:center;padding:20px;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
    const focoAntes = document.activeElement;
    const box = document.createElement('div');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'il-dlg-titulo');
    box.style.cssText = 'background:var(--bg);color:var(--fg);border-radius:12px;max-width:460px;width:100%;' +
      'padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.4)';
    box.innerHTML =
      '<h3 id="il-dlg-titulo" style="margin:0 0 10px;font-size:17px">' + esc(t('addSiteTitle')) + '</h3>' +
      '<p style="margin:0 0 18px;font-size:14px;line-height:1.5;color:var(--fg)">' +
        esc(t('addSiteQuestion').replace('{X}', domain).replace('{Y}', srcLabel)) +
      '</p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end">' +
        '<button class="il-dlg-cancel" style="padding:9px 14px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer;font-size:14px">' + esc(t('btnCancel')) + '</button>' +
        '<button class="il-dlg-once" style="padding:9px 14px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer;font-size:14px">' + esc(t('btnOnlyOnce')) + '</button>' +
        '<button class="il-dlg-add" style="padding:9px 14px;background:var(--accent);color:var(--on-solid);border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:bold">' + esc(t('btnAddList')) + '</button>' +
      '</div>';
    overlay.appendChild(box);
    (parentEl || document.body).appendChild(overlay);
    let resolved = false;
    function cleanup(val){
      if (resolved) return;
      resolved = true;
      document.removeEventListener('keydown', escCapture, true);
      overlay.remove();
      if (focoAntes && focoAntes.isConnected && focoAntes.focus) focoAntes.focus();
      resolve(val);
    }
    function escCapture(e){
      if (e.key === 'Escape'){ e.stopImmediatePropagation(); e.preventDefault(); cleanup('cancel'); }
    }
    document.addEventListener('keydown', escCapture, true);
    box.querySelector('.il-dlg-cancel').onclick = () => cleanup('cancel');
    box.querySelector('.il-dlg-once').onclick   = () => cleanup('once');
    box.querySelector('.il-dlg-add').onclick    = () => cleanup('add');
    box.querySelector('.il-dlg-add').focus();
    overlay.addEventListener('click', e => { if (e.target === overlay) cleanup('cancel'); });
  });
}

