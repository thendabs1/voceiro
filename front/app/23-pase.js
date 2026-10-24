/* Pase sobre una instantánea de los resultados cargados. No filtra ni pide
   noticias al avanzar; las vistas se guardan con el mecanismo existente. */
let PASE = null;

function abrirPase(){
  if (!ULT_FILTRADAS.length) return;
  cerrarPase(false);
  const filtrosPase = $('#filtros-panel');
  if (filtrosPase.matches(':modal')) filtrosPase.close();
  cerrarMenuMas();
  // Primera tarjeta que se ve: con la mitad, al menos, por debajo de la barra fija.
  const tapa = $('#barra-sup').getBoundingClientRect().bottom;
  const visible = [...document.querySelectorAll('#resultados .noticia')].find(el => {
    const r = el.getBoundingClientRect();
    return (r.top + r.bottom) / 2 > tapa && r.top < window.innerHeight;
  });
  const desde = visible ? Number(visible.dataset.idx) : 0;
  let segundos = 8;
  try {
    const guardado = Number(localStorage.getItem('voceiro-pase-segundos'));
    if (Number.isInteger(guardado) && guardado >= 3 && guardado <= 20) segundos = guardado;
  } catch(e){}
  const root = document.createElement('dialog');
  root.id = 'pase-capa';
  root.setAttribute('aria-label', t('paseCapa'));
  root.innerHTML = `<div class="pase-contenido">
      <div class="pase-medio"></div>
      <a class="pase-titular" target="_blank" rel="noopener"></a>
      <div><button type="button" data-pase-guardar>${escapeHtml(t('saveForLaterTitle'))}</button></div>
    </div><div class="pase-controles">
      <button type="button" data-pase-anterior aria-keyshortcuts="ArrowLeft ArrowUp">${escapeHtml(t('paseAnterior'))}</button>
      <button type="button" data-pase-play></button>
      <button type="button" data-pase-siguiente aria-keyshortcuts="ArrowRight ArrowDown">${escapeHtml(t('paseSiguiente'))}</button>
      <label class="pase-ritmo"><input id="pase-ritmo" type="range" min="3" max="20" step="1" value="${segundos}" data-pase-ritmo><span><output for="pase-ritmo" data-pase-segundos>${segundos}</output> ${escapeHtml(t('paseRitmo'))}</span></label>
      <button type="button" data-pase-cerrar>${escapeHtml(t('paseCerrar'))}</button>
    </div><div class="pase-estado" role="status" aria-live="off"></div>`;
  const pase = PASE = {
    root, lista: ULT_FILTRADAS.slice(desde), pos: 0,
    segundos, jugando: true, timer: null, overflow: document.body.style.overflow,
  };
  document.body.appendChild(root);
  document.body.style.overflow = 'hidden';
  root.showModal();
  root.addEventListener('cancel', e => { e.preventDefault(); cerrarPase(); });
  root.addEventListener('pointerdown', e => {
    if (!e.target.closest('.pase-controles')) pausarPase();
  });
  prepararGestosPase(root);
  root.querySelector('.pase-titular').onclick = () => {
    pausarPase();
    const n = pase.lista[pase.pos];
    if (!n) return;
    marcarLeidaLocal(n.enlace);
    registrarLeido(n);
    pintarLeidasEnLista();
    // Avanzar tras la acción por defecto: si no, el enlace ya apunta al siguiente al abrirse.
    const pos = pase.pos;
    setTimeout(() => { if (PASE === pase && pase.pos === pos){ moverPase(1); pausarPase(); } });
  };
  root.querySelector('[data-pase-guardar]').onclick = () => {
    pausarPase();
    const n = pase.lista[pase.pos];
    if (n){ guardarParaLeerDespues(n); pintarPase(); }
  };
  root.querySelector('[data-pase-anterior]').onclick = () => moverPase(-1);
  root.querySelector('[data-pase-siguiente]').onclick = () => moverPase(1);
  root.querySelector('[data-pase-play]').onclick = () => {
    pase.jugando = !pase.jugando;
    pintarEstadoPase();
    programarPase();
  };
  root.querySelector('[data-pase-cerrar]').onclick = () => cerrarPase();
  root.querySelector('[data-pase-ritmo]').oninput = e => {
    pase.segundos = Number(e.target.value);
    root.querySelector('[data-pase-segundos]').textContent = pase.segundos;
    programarPase();
  };
  root.querySelector('[data-pase-ritmo]').onchange = () => {
    try { localStorage.setItem('voceiro-pase-segundos', String(pase.segundos)); } catch(e){}
  };
  pintarPase();
  programarPase();
  root.querySelector('[data-pase-play]').focus({ preventScroll: true });
}

// El titular no cabe: el desplazamiento vertical sirve para leerlo entero.
function desbordaPase(root){
  return root.scrollHeight > root.clientHeight + 1;
}

function prepararGestosPase(root){
  let inicio = null;
  root.addEventListener('touchstart', e => {
    inicio = null;
    // Si hace falta scroll, se conserva para poder leer todo el titular.
    if (e.touches.length !== 1 || desbordaPase(root) ||
        e.target.closest('.pase-controles,button,input,select,textarea,[contenteditable]')) return;
    const dedo = e.touches[0];
    inicio = { x: dedo.clientX, y: dedo.clientY, id: dedo.identifier };
  }, { passive: true });
  root.addEventListener('touchmove', e => {
    if (e.touches.length !== 1){ inicio = null; return; }
    if (!inicio) return;
    const dedo = e.touches[0];
    // Reservar el gesto vertical desde el primer movimiento evita que el
    // navegador lo convierta en scroll. El zoom con dos dedos sigue libre.
    if (Math.abs(dedo.clientY - inicio.y) > Math.abs(dedo.clientX - inicio.x) && e.cancelable){
      e.preventDefault();
    }
  }, { passive: false });
  root.addEventListener('touchend', e => {
    const desde = inicio;
    inicio = null;
    if (!desde || e.touches.length) return;
    const dedo = Array.from(e.changedTouches).find(t => t.identifier === desde.id);
    if (!dedo) return;
    const dy = dedo.clientY - desde.y, dx = dedo.clientX - desde.x;
    if (Math.abs(dy) < 50 || Math.abs(dy) < Math.abs(dx) * 1.5) return;
    // Un deslizamiento sobre el enlace no debe abrir la noticia al soltar.
    if (e.cancelable) e.preventDefault();
    pausarPase();
    moverPase(dy < 0 ? 1 : -1);
  }, { passive: false });
  root.addEventListener('touchcancel', () => { inicio = null; }, { passive: true });
}

function pintarEstadoPase(){
  const p = PASE;
  if (!p) return;
  const fin = p.pos === p.lista.length;
  p.root.querySelector('[data-pase-anterior]').disabled = p.pos === 0;
  p.root.querySelector('[data-pase-siguiente]').disabled = fin;
  const play = p.root.querySelector('[data-pase-play]');
  play.disabled = fin;
  play.textContent = t(p.jugando ? 'pasePausa' : 'paseContinuar');
  p.root.querySelector('.pase-estado').textContent =
    `${t('paseCapa')} · ${Math.min(p.pos + 1, p.lista.length)}/${p.lista.length} · ${t(fin ? 'paseFin' : p.jugando ? 'paseMarcha' : 'paseParado')}`;
}

function pintarPase(){
  const p = PASE;
  if (!p) return;
  const n = p.lista[p.pos];
  const fin = !n;
  pintarEstadoPase();
  p.root.querySelector('.pase-medio').textContent = n ? n.medio : '';
  const link = p.root.querySelector('.pase-titular');
  link.innerHTML = n ? bionicize(escapeHtml(n.titular)) : escapeHtml(t('paseFin'));
  if (n) link.href = n.enlace;
  else link.removeAttribute('href');
  p.root.querySelector('[data-pase-guardar]').hidden = fin;
  if (n){
    const item = PENDIENTES_MAP.get(normalizeUrlForMatch(n.enlace));
    p.root.querySelector('[data-pase-guardar]').textContent = t(!item ? 'saveLabelSave' : item.read ? 'saveLabelRead' : 'saveLabelPending');
  }
}

function programarPase(){
  const p = PASE;
  if (!p) return;
  clearTimeout(p.timer);
  p.timer = null;
  if (p.jugando && !document.hidden && p.pos < p.lista.length){
    p.timer = setTimeout(() => { if (PASE === p) moverPase(1); }, p.segundos * 1000);
  }
}

function pausarPase(){
  if (!PASE || !PASE.jugando) return;
  PASE.jugando = false;
  programarPase();
  pintarEstadoPase();
}

function moverPase(delta){
  const p = PASE;
  if (!p || (delta < 0 && p.pos === 0) || (delta > 0 && p.pos === p.lista.length)) return;
  const n = p.lista[p.pos];
  if (delta > 0 && n){
    marcarVistaLocal(n.enlace);
    persistirVistas();
  }
  p.pos += delta;
  if (p.pos === p.lista.length) p.jugando = false;
  pintarPase();
  programarPase();
}

function cerrarPase(refiltrar = true){
  const p = PASE;
  if (!p) return;
  PASE = null;
  clearTimeout(p.timer);
  p.root.close();
  document.body.style.overflow = p.overflow;
  p.root.remove();
  if (refiltrar){
    aplicarFiltros();
    $('#btn-pase').focus({ preventScroll: true });
  }
}

document.addEventListener('click', e => {
  if (e.target.closest('#btn-pase')) abrirPase();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pausarPase(); });
window.addEventListener('blur', pausarPase);
// Interactuar fuera de los controles o desplazarse a mano detiene el avance.
function pausarPaseFuera(e){
  if (PASE && !e.target.closest('#pase-capa')) pausarPase();
}
document.addEventListener('pointerdown', pausarPaseFuera, true);
document.addEventListener('focusin', pausarPaseFuera);
document.addEventListener('wheel', pausarPase, { passive: true });
// Solo arrastrar el deslizador del ritmo deja el pase en marcha.
document.addEventListener('touchmove', e => {
  if (!e.target.closest('[data-pase-ritmo]')) pausarPase();
}, { passive: true });
document.addEventListener('keydown', e => {
  if (!PASE) return;
  if (e.key === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); cerrarPase(); }
  else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) &&
           !e.target.closest('select,input,textarea,[contenteditable]')){
    // Como con el dedo: si el titular no cabe, ↑ ↓ desplazan y pausan.
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && desbordaPase(PASE.root)){ pausarPase(); return; }
    e.preventDefault();
    moverPase(e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1);
  } else pausarPaseFuera(e);
}, true);
