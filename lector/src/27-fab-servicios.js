/* ============================================================
   22. FAB «Abrir en…» (arriba-izquierda)
   Solo aparece si hay servicios configurados. Clic derecho: ocultar.
   ============================================================ */
function crearFabServicios(){
  if (document.getElementById('il-servicios-fab')) return;
  if (!debeMostrarFabServicios()) return;

  const container = document.createElement('div');
  container.id = 'il-servicios-fab';
  container.style.cssText = 'position:fixed;top:' + UI.fabMargin + 'px;left:' + UI.fabMargin + 'px;' +
    'z-index:2147483644;' +
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';

  const dd = crearDesplegableServicios({ position: 'below-left' });
  dd.id = 'il-servicios-dd';
  dd.style.display = 'none';

  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'il-servicios-btn';
  button.title = t('abrirEn');
  button.setAttribute('aria-label', t('abrirEn'));
  button.textContent = '↗';
  button.style.cssText = 'width:' + UI.fabSize + 'px;height:' + UI.fabSize + 'px;border-radius:50%;border:none;' +
    'background:linear-gradient(135deg,#555,#222);color:#fff;font-size:22px;cursor:pointer;' +
    'box-shadow:0 4px 14px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;' +
    'user-select:none;transition:transform .15s,box-shadow .15s;padding:0';
  button.onmouseenter = () => { button.style.transform = 'scale(1.08)'; };
  button.onmouseleave = () => { button.style.transform = 'scale(1)'; };
  button.onclick = e => {
    e.stopPropagation();
    dd.style.display = dd.style.display === 'block' ? 'none' : 'block';
  };
  button.addEventListener('contextmenu', e => {
    e.preventDefault();
    CFG.serviciosFab = CFG.serviciosFab || {};
    CFG.serviciosFab.oculto = true;
    saveCfg(CFG);
    document.removeEventListener('mousedown', closeHandler);
    container.remove();
    toast(t('serviciosFabOculto'), 2000);
  });

  container.appendChild(dd);
  container.appendChild(button);
  document.body.appendChild(container);

  function closeHandler(e){
    if (!container.contains(e.target)) dd.style.display = 'none';
  }
  document.addEventListener('mousedown', closeHandler);
}

