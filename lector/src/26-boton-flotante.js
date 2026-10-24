/* ============================================================
   21. BOTÓN FLOTANTE
   ------------------------------------------------------------
   Uno solo, dentro de un Shadow DOM: el CSS del medio no le llega. Si
   en la página hay artículo, el botón grande abre el lector y el pequeño
   (⋯) despliega lo demás; si no, el grande despliega el menú. Se arrastra
   y al soltarlo se pega al borde más cercano; recuerda el lado y la
   altura (CFG.fab, que no viaja a otros dispositivos).
   actualizarBoton() lo pone, lo cambia o lo quita según la página: se
   llama cada vez que cambia algo que le afecta.
   ============================================================ */
const FAB_ID = 'il-fab';

function botonOcultoAqui(){
  const d = normalizeDomain(location.hostname);
  return !!(CFG.fab && Array.isArray(CFG.fab.ocultoEn) && CFG.fab.ocultoEn.includes(d));
}
function ocultarBotonAqui(ocultar){
  const d = normalizeDomain(location.hostname);
  if (!d) return;
  CFG.fab = CFG.fab || {};
  const lista = (Array.isArray(CFG.fab.ocultoEn) ? CFG.fab.ocultoEn : []).filter(x => x !== d);
  if (ocultar) lista.push(d);
  CFG.fab.ocultoEn = lista;
  saveCfg(CFG);
  actualizarBoton();
}

function puedeAnadirSitio(){
  return !findSiteRule() && !isDomainDisabled(location.hostname) && !isPlainDomain() &&
         isKnownMediaDomain(location.hostname);
}

// Lo que ofrece el botón en esta página, o null si nada.
function ofertaDelBoton(){
  if (isDomainDisabled(location.hostname) || isPlainDomain()) return null;
  const o = {
    lector: shouldShowReaderFAB(),
    anadir: puedeAnadirSitio(),
    ajustes: isKnownMediaDomain(location.hostname) || !!findSiteRule(),
    servicios: debeMostrarFabServicios() ? serviciosConfigurados() : []
  };
  return (o.lector || o.anadir || o.ajustes || o.servicios.length) ? o : null;
}

function actualizarBoton(){
  if (!document.body) return;
  const o = CFG.fab?.visible === false || botonOcultoAqui() ? null : ofertaDelBoton();
  let host = document.getElementById(FAB_ID);
  if (!o){ if (host) host.remove(); return; }
  if (!host || !host.__pintar){ if (host) host.remove(); host = crearBoton(); }
  host.__pintar(o);
}

function anadirSitioActual(){
  const d = normalizeDomain(location.hostname);
  if (!d) return;
  if (CFG.sites.some(s => s.domain === d)){ toast(t('alreadyInList')); actualizarBoton(); return; }
  addSiteAnywhere(d);
  saveCfg(CFG);
  actualizarBoton();
  toast(t('addedTo') + ' ' + d, 6000, { label: t('btnUndo'), onClick: () => {
    if (removeSiteRule(d)) toast(t('siteRemovedToast').replace('{X}', d), 1800);
    actualizarBoton();
  } });
}

function cssBoton(){
  return `
${cssPaleta(':host', t => ':host([data-theme="' + t + '"])')}
*{box-sizing:border-box}
[hidden]{display:none!important}
.caja{position:relative;display:flex;align-items:center;gap:6px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:15px;line-height:1.3}
.caja.derecha{flex-direction:row-reverse}
button{font:inherit;color:var(--fg);background:var(--btn-bg);border:1px solid var(--btn-border);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;margin:0}
button:hover{filter:brightness(.96)}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
svg{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.principal{position:relative;width:${UI.fabSize}px;height:${UI.fabSize}px;border-radius:50%;box-shadow:0 4px 14px rgba(0,0,0,.3);touch-action:none;cursor:grab}
.principal svg{width:26px;height:26px}
.principal .auto{position:absolute;top:3px;right:3px;width:12px;height:12px;border-radius:50%;background:var(--preset);border:2px solid var(--btn-bg)}
.mas{width:32px;height:32px;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.25)}
.mas svg{width:18px;height:18px}
.menu{position:absolute;bottom:calc(100% + 8px);left:0;width:max-content;min-width:240px;max-width:calc(100vw - 24px);max-height:60vh;overflow:auto;background:var(--bg);color:var(--fg);border:1px solid var(--btn-border);border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.3);padding:6px}
.caja.abajo .menu{bottom:auto;top:calc(100% + 8px)}
.caja.derecha .menu{left:auto;right:0}
[role="menuitem"]{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;padding:10px 12px;border:none;background:transparent;border-radius:8px;text-align:left}
[role="menuitem"]:hover,[role="menuitem"]:focus{background:var(--quote-bg);filter:none}
[role="menuitem"] svg{width:20px;height:20px}
.grupo{font-size:12px;font-weight:600;color:var(--muted);padding:8px 12px 2px}
[role="separator"]{border-top:1px solid var(--border);margin:4px 0}
@media print{:host{display:none!important}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;
}

function crearBoton(){
  const host = document.createElement('div');
  host.id = FAB_ID;
  // El host vive en la página: se le quita todo lo que pudiera heredar.
  host.style.cssText = 'all:initial';
  host.style.setProperty('position', 'fixed', 'important');
  host.style.setProperty('z-index', '2147483645', 'important');
  const raiz = host.attachShadow({ mode: 'closed' });
  raiz.innerHTML = '<style>' + cssBoton() + '</style>' +
    '<div class="caja">' +
      '<button type="button" class="principal"></button>' +
      '<button type="button" class="mas" aria-haspopup="menu" aria-expanded="false">' + icono('ellipsis') + '</button>' +
      '<div class="menu" role="menu" hidden></div>' +
    '</div>';
  document.body.appendChild(host);

  const caja = raiz.querySelector('.caja');
  const principal = raiz.querySelector('.principal');
  const mas = raiz.querySelector('.mas');
  const menu = raiz.querySelector('.menu');
  let oferta = null;

  // ── Posición: un lado (izq/der) y una altura. Lo de antes (left/top)
  // se traduce al lado más cercano. ──
  const M = UI.fabMargin, S = UI.fabSize;
  let lado = CFG.fab && CFG.fab.lado;
  let top = CFG.fab && typeof CFG.fab.top === 'number' ? CFG.fab.top : null;
  if (lado !== 'izq' && lado !== 'der'){
    lado = CFG.fab && typeof CFG.fab.left === 'number' && CFG.fab.left > window.innerWidth / 2 ? 'der' : 'izq';
  }
  if (top === null) top = window.innerHeight - M - S;
  function colocar(x){
    const ancho = caja.offsetWidth || S;
    top = Math.max(M / 2, Math.min(window.innerHeight - S - M / 2, top));
    const left = x !== undefined ? x : (lado === 'der' ? window.innerWidth - ancho - M : M);
    host.style.setProperty('left', Math.max(0, Math.min(window.innerWidth - ancho, left)) + 'px', 'important');
    host.style.setProperty('top', top + 'px', 'important');
    caja.classList.toggle('derecha', lado === 'der');
    caja.classList.toggle('abajo', top < window.innerHeight / 2);
  }

  // ── Menú ──
  function item(accion, ico, texto, extra){
    return '<button type="button" role="menuitem" tabindex="-1" data-accion="' + accion + '"' +
      (extra ? ' data-id="' + esc(extra) + '"' : '') + '>' + ico + '<span>' + esc(texto) + '</span></button>';
  }
  function pintarMenu(){
    const o = oferta;
    let h = '';
    if (o.lector) h += item('lector', icono('book-open-text'), t('fabTitle'));
    if (o.anadir) h += item('anadir', icono('plus'), t('addFabTitle'));
    if (o.servicios.length){
      h += '<div role="separator"></div><div role="group" aria-label="' + esc(t('abrirEn')) + '">' +
        '<div class="grupo" aria-hidden="true">' + esc(t('abrirEn')) + '</div>' +
        o.servicios.map(svc => item('servicio', icono('external-link'), svc.nombre, svc.id)).join('') + '</div>';
    }
    h += '<div role="separator"></div>';
    if (o.ajustes) h += item('ajustes', icono('settings'), t('settingsFabTitle'));
    if (findSiteRule()) h += item('extraccion', icono('settings'), t('extractionTitle'));
    h += item('ocultar', icono('eye-off'), t('fabOcultarAqui'));
    menu.innerHTML = h;
  }
  const conmutador = () => oferta && oferta.lector ? mas : principal;
  function abrirMenu(){
    menu.hidden = false;
    conmutador().setAttribute('aria-expanded', 'true');
    const primero = menu.querySelector('[role="menuitem"]');
    if (primero) primero.focus();
  }
  function cerrarMenu(devolverFoco){
    if (menu.hidden) return;
    menu.hidden = true;
    conmutador().setAttribute('aria-expanded', 'false');
    if (devolverFoco) conmutador().focus();
  }
  menu.addEventListener('keydown', e => {
    const items = [...menu.querySelectorAll('[role="menuitem"]')];
    const i = items.indexOf(raiz.activeElement);
    let j = null;
    if (e.key === 'ArrowDown') j = (i + 1) % items.length;
    else if (e.key === 'ArrowUp') j = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = items.length - 1;
    else if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); cerrarMenu(true); return; }
    else if (e.key === 'Tab'){ cerrarMenu(false); return; }
    if (j === null) return;
    e.preventDefault();
    items[j].focus();
  });
  menu.addEventListener('click', e => {
    const b = e.target.closest('[role="menuitem"]');
    if (!b) return;
    cerrarMenu(false);
    const accion = b.dataset.accion;
    if (accion === 'lector') activateReader();
    else if (accion === 'anadir') anadirSitioActual();
    else if (accion === 'ajustes') openSettings('sites');
    else if (accion === 'extraccion') openExtractionTool(CFG.sites.indexOf(findSiteRule()));
    else if (accion === 'servicio'){
      const svc = oferta.servicios.find(s => s.id === b.dataset.id);
      if (svc) abrirEnServicio(svc);
    } else if (accion === 'ocultar'){
      ocultarBotonAqui(true);
      toast(t('fabOcultoAqui'), 6000, { label: t('btnUndo'), onClick: () => ocultarBotonAqui(false) });
    }
  });
  // Pulsar fuera lo cierra (desde fuera, los clics llegan con el host como
  // destino). Los escuchadores de la página se quitan solos si el botón ya
  // no está.
  function fuera(e){
    if (!host.isConnected){ document.removeEventListener('pointerdown', fuera, true); return; }
    if (!menu.hidden && !e.composedPath().includes(host)) cerrarMenu(false);
  }
  document.addEventListener('pointerdown', fuera, true);

  mas.onclick = e => { e.stopPropagation(); if (menu.hidden) abrirMenu(); else cerrarMenu(true); };

  // ── El grande: arrastrar, o pulsar (abre el lector o el menú). Clic
  // derecho o pulsación larga: el menú. ──
  let arrastre = null, arrastrado = false;
  principal.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    arrastre = { x: e.clientX, y: e.clientY, left: host.getBoundingClientRect().left, top, mueve: false };
    principal.setPointerCapture(e.pointerId);
  });
  principal.addEventListener('pointermove', e => {
    if (!arrastre) return;
    const dx = e.clientX - arrastre.x, dy = e.clientY - arrastre.y;
    if (!arrastre.mueve && Math.hypot(dx, dy) < 6) return;
    arrastre.mueve = true;
    cerrarMenu(false);
    top = arrastre.top + dy;
    colocar(arrastre.left + dx);
  });
  const soltar = () => {
    if (!arrastre) return;
    const movido = arrastre.mueve;
    arrastre = null;
    if (!movido) return;
    arrastrado = true;
    const r = host.getBoundingClientRect();
    lado = r.left + r.width / 2 > window.innerWidth / 2 ? 'der' : 'izq';
    colocar();
    CFG.fab = { ...(CFG.fab || {}), lado, top };
    delete CFG.fab.left;
    saveCfg(CFG);
  };
  principal.addEventListener('pointerup', soltar);
  principal.addEventListener('pointercancel', soltar);
  principal.addEventListener('click', e => {
    e.stopPropagation();
    if (arrastrado){ arrastrado = false; return; }
    if (oferta && oferta.lector){ cerrarMenu(false); activateReader(); }
    else if (menu.hidden) abrirMenu();
    else cerrarMenu(true);
  });
  principal.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (menu.hidden) abrirMenu();
  });
  function alRedimensionar(){
    if (!host.isConnected){ window.removeEventListener('resize', alRedimensionar); return; }
    colocar();
  }
  window.addEventListener('resize', alRedimensionar);
  // Para devolverle el foco desde fuera (document.activeElement solo ve el host).
  host.__enfocar = () => principal.focus();

  host.__pintar = o => {
    oferta = o;
    aplicarTema(host);
    const auto = !!(o.lector && CFG.readerAutoAll);
    const nombre = o.lector ? t('fabTitle') + (auto ? ' (' + t('fabAutomatico') + ')' : '') : t('fabMenu');
    principal.innerHTML = (o.lector ? icono('book-open-text') : icono('ellipsis')) + (auto ? '<span class="auto"></span>' : '');
    principal.setAttribute('aria-label', nombre);
    principal.title = nombre;
    if (o.lector){
      principal.removeAttribute('aria-haspopup');
      principal.removeAttribute('aria-expanded');
    } else {
      principal.setAttribute('aria-haspopup', 'menu');
      principal.setAttribute('aria-expanded', String(!menu.hidden));
    }
    mas.hidden = !o.lector;
    mas.setAttribute('aria-label', t('fabMenu'));
    mas.title = t('fabMenu');
    pintarMenu();
    colocar();
  };
  return host;
}
