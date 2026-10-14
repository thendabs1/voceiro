/* ============================================================
   17. DESPLEGABLE «ABRIR EN…»
   ============================================================ */
function crearDesplegableServicios(opts){
  opts = opts || {};
  const dd = temaDe(document.createElement('div'));
  dd.classList.add('il-servicios-dropdown');
  dd.setAttribute('role', 'menu');
  if (opts.position === 'fixed-top-right'){
    dd.style.cssText = 'position:fixed;top:60px;right:20px;' +
      'background:var(--bg,var(--bg));color:var(--fg,var(--fg));border:1px solid var(--border,var(--btn-border));' +
      'border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.35);padding:6px;' +
      'z-index:2147483647;min-width:210px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
  } else if (opts.position === 'below-left'){
    dd.style.cssText = 'position:absolute;top:' + (UI.fabSize + 12) + 'px;left:0;background:var(--bg);color:var(--fg);' +
      'border:1px solid var(--btn-border);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.25);' +
      'padding:6px;min-width:210px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
  } else {
    dd.style.cssText = 'position:absolute;bottom:64px;left:0;background:var(--bg);color:var(--fg);' +
      'border:1px solid var(--btn-border);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.25);' +
      'padding:6px;min-width:210px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
  }

  function boton(texto, alPulsar, secundario){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'menuitem');
    btn.textContent = texto;
    btn.style.cssText = 'display:block;width:100%;text-align:left;padding:8px 12px;' +
      'border:none;background:transparent;color:inherit;cursor:pointer;' +
      'border-radius:6px;font-size:' + (secundario ? '13px' : '14px') + ';font-family:inherit;' +
      'font-weight:' + (secundario ? '400' : '500') + (secundario ? ';color:var(--muted)' : '');
    btn.onmouseenter = () => { btn.style.background = 'var(--quote-bg)'; };
    btn.onmouseleave = () => { btn.style.background = 'transparent'; };
    btn.onclick = (e) => {
      e.stopPropagation();
      if (opts.onClose) opts.onClose();
      alPulsar();
    };
    return btn;
  }

  const servicios = serviciosConfigurados();
  if (!servicios.length){
    const vacio = document.createElement('div');
    vacio.textContent = t('serviciosVacio');
    vacio.style.cssText = 'padding:8px 12px;font-size:13px;color:var(--muted);max-width:260px';
    dd.appendChild(vacio);
  }
  servicios.forEach(svc => dd.appendChild(boton(svc.nombre, () => abrirEnServicio(svc))));

  const sep = document.createElement('div');
  sep.style.cssText = 'border-top:1px solid rgba(0,0,0,.12);margin:4px 0';
  dd.appendChild(sep);
  dd.appendChild(boton(t('serviciosGestionar'), () => openSettings('servicios'), true));
  return dd;
}

