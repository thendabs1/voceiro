// Botón Guardar de la tarjeta: texto, título e icono de cada estado.
const GUARDAR_ESTADOS = {
  guardar:   { txt: 'saveLabelSave',    titulo: 'saveForLaterTitle', ico: 'clock-plus' },
  pendiente: { txt: 'saveLabelPending', titulo: 'markRead',          ico: 'clock' },
  leida:     { txt: 'saveLabelRead',    titulo: 'markUnread',        ico: 'circle-check' },
};
function guardarHtml(estado){
  const e = GUARDAR_ESTADOS[estado];
  return `${ico(e.ico)}<span class="save-txt">${escapeHtml(t(e.txt))}</span>`;
}
function pintarBotonGuardar(b, estado){
  b.dataset.estado = estado;
  b.title = t(GUARDAR_ESTADOS[estado].titulo);
  b.innerHTML = guardarHtml(estado);
}

function refrescarBotonesGuardar(){
  document.querySelectorAll('.btn-save-item').forEach(b => {
    const i = parseInt(b.dataset.idx, 10);
    const n = ULT_FILTRADAS[i];
    if (!n) return;
    const key = normalizeUrlForMatch(n.enlace);
    const guardada = PENDIENTES_URLS.has(key);
    const item = PENDIENTES_MAP.get(key);
    const leida = (guardada && item && item.read) || LEIDAS_LOCAL.has(key);

    pintarBotonGuardar(b, leida ? 'leida' : guardada ? 'pendiente' : 'guardar');
  });
}
// Al bajar se esconde lo que hay encima de la fila de filtros (en columna
// estrecha, la cabecera; en ancha, la línea de fecha) y vuelve completo tras
// subir SUBIR_CAB px seguidos. No se esconde con el foco de teclado dentro,
// con la búsqueda de móvil abierta ni con el menú de modo desplegado (ahí
// se queda como esté).
const SUBIR_CAB = 60;
// Se mueven los controles, sin duplicar estados ni manejadores de eventos.
function wireMenuCabecera(barra){
  const menu = document.getElementById('cab-menu');
  const panel = document.getElementById('cab-menu-panel');
  const destinos = [
    [document.querySelector('header .meta'), document.getElementById('cab-meta-home')],
    [document.getElementById('btn-estadisticas'), document.getElementById('cab-est-home')],
    ...[...document.querySelectorAll('#cab-feed-home > button')]
      .map(b => [b, document.getElementById('cab-feed-home')]),
  ];
  let compacto;
  new ResizeObserver(([entrada]) => {
    const siguiente = entrada.contentRect.width < 900;
    if (siguiente === compacto) return;
    compacto = siguiente;
    const foco = document.activeElement;
    const estabaEnMenu = menu.contains(foco);
    for (const [el, origen] of destinos) (compacto ? panel : origen).append(el);
    menu.open = compacto && destinos.some(([el]) => el.contains(foco));
    if (menu.open || (!compacto && estabaEnMenu)) {
      (foco === menu.querySelector('summary') ? document.getElementById('btn-recargar') : foco)
        .focus({ preventScroll: true });
    }
  }).observe(barra);
  const cerrar = () => { menu.open = false; };
  menu.addEventListener('toggle', () => {
    if (menu.open) barra.classList.remove('cab-oculta');
  });
  document.addEventListener('pointerdown', e => { if (!menu.contains(e.target)) cerrar(); });
  menu.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation(); cerrar();
      menu.querySelector('summary').focus({ preventScroll: true });
    }
  });
  menu.addEventListener('focusout', e => {
    if (!menu.contains(e.relatedTarget)) cerrar();
  });
  panel.addEventListener('click', e => {
    if (!e.target.closest('button')) return;
    cerrar();
    if (panel.contains(document.activeElement)) menu.querySelector('summary').focus({ preventScroll: true });
  });
}
function wireCabecera(){
  const barra = document.getElementById('barra-sup');
  const fila = barra?.querySelector('.filtros-row');
  if (!fila) return;
  wireMenuCabecera(barra);
  let alto = 0;
  const medir = () => {
    // Las dos cajas llevan el mismo transform: la resta no depende de él.
    alto = Math.max(0, fila.getBoundingClientRect().top - barra.getBoundingClientRect().top - 6);
    barra.style.setProperty('--cab-h', alto + 'px');
  };
  new ResizeObserver(medir).observe(barra);
  medir();
  const fija = () => !!barra.querySelector(':focus-visible')
    || barra.querySelector('.filtros-wrap').classList.contains('busqueda-abierta')
    || document.getElementById('cab-menu').open
    || document.getElementById('preset-menu').style.display !== 'none';
  const ocultar = v => barra.classList.toggle('cab-oculta', v);
  let ultY = window.scrollY, bajado = 0, subido = 0;
  window.addEventListener('scroll', () => {
    const y = window.scrollY, d = y - ultY;
    ultY = y;
    if (y <= alto){ bajado = subido = 0; ocultar(false); return; }
    if (fija()){ bajado = subido = 0; return; }
    if (d > 0){ bajado += d; subido = 0; if (bajado > alto) ocultar(true); }
    else if (d < 0){ subido -= d; bajado = 0; if (subido >= SUBIR_CAB) ocultar(false); }
  }, { passive: true });
  barra.addEventListener('focusin', () => { if (barra.querySelector(':focus-visible')) ocultar(false); });
}
function wireBackToTop(){
  const b = document.getElementById('btn-top');
  if (!b) return;
  const onScroll = () => {
    b.classList.toggle('show', window.scrollY > 400);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  b.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}
function abrirPendientes(){
  abrirPanel('panel-pendientes');
  renderPendientes(PENDIENTES_CACHE);
  enviarEstadoAhora(false);   // el lector contesta si tiene algo nuevo
}

function renderPendientes(items){
  const cont = $('#pendientes-lista');
  const local = USCRIPT_OK ? '' : `<p class="pend-local">${escapeHtml(t('pendLocalHint'))}</p>`;
  if (!items || !items.length){
    cont.innerHTML = `<div class="vacio">${escapeHtml(t('noPendientes'))}
      <p class="vacio-pista">${escapeHtml(t('pendVacioPista'))}</p></div>${local}`;
    return;
  }
  const noLeidas = items.filter(i => !i.read);
  const leidas   = items.filter(i => i.read);

  function fila(p, esLeida){
    const fecha = p.date ? new Date(p.date).toLocaleString(ACCES.lang) : '';
    return `
      <div class="pendiente-item${esLeida ? ' leida' : ''}">
        <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.title || p.url)}</a>
        <div class="pendiente-meta">
          ${p.domain ? `<span>${escapeHtml(p.domain)}</span>` : ''}
          ${fecha ? `<span>· ${escapeHtml(fecha)}</span>` : ''}
          ${esLeida && p.readAt ? `<span>· ${ico('check')} ${escapeHtml(p.readAt.slice(0,10))}</span>` : ''}
        </div>
        <div class="pendiente-actions">
          <button class="btn-pend-toggle" data-url="${escapeHtml(p.url)}" title="${esLeida ? escapeHtml(t('markUnread')) : escapeHtml(t('markRead'))}" aria-label="${esLeida ? escapeHtml(t('markUnread')) : escapeHtml(t('markRead'))}">${ico(esLeida ? 'rotate-ccw' : 'check')}</button>
          <button class="btn-pend-remove" data-url="${escapeHtml(p.url)}" title="${escapeHtml(t('deletePending'))}" aria-label="${escapeHtml(t('deletePending'))}">${ico('x')}</button>
        </div>
      </div>`;
  }

  let html = '';
  if (noLeidas.length){
    html += `<div style="font-size:.68em; color:var(--muted); text-transform:uppercase; letter-spacing:.05em; margin:8px 0 6px;">${escapeHtml(t('readItemsNo'))} (${noLeidas.length})</div>`;
    html += noLeidas.map(p => fila(p, false)).join('');
  } else {
    html += `<div class="vacio">${escapeHtml(t('noPendientes'))}</div>`;
  }

  if (leidas.length){
    html += `<div style="font-size:.68em; color:var(--muted); text-transform:uppercase; letter-spacing:.05em; margin:18px 0 6px;">${escapeHtml(t('readItems'))} (${leidas.length})</div>`;
    html += leidas.map(p => fila(p, true)).join('');
  }

  cont.innerHTML = html + local;

cont.querySelectorAll('.btn-pend-toggle').forEach(b => {
  b.onclick = () => {
    const url = b.dataset.url;
    const item = PENDIENTES_MAP.get(normalizeUrlForMatch(url));
    const nuevaLeida = !(item && item.read);
    if (nuevaLeida) marcarLeidaLocal(url);
    else            desmarcarLeidaLocal(url);
    setPendienteRead(url, nuevaLeida);
  };
});
cont.querySelectorAll('.btn-pend-remove').forEach(b => {
  b.onclick = () => {
    if (!confirm(t('confirmDeletePending'))) return;
    const url = b.dataset.url;
    removePendiente(url);
    desmarcarLeidaLocal(url);   // coherencia con LEIDAS_LOCAL
  };
});
}
