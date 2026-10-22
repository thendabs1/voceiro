function renderPestanasPreset(){
  const el = document.getElementById('preset-pestanas');
  if (!el) return;
  const info = ULT_PESTANAS;
  if (!info){ el.hidden = true; return; }
  const nombre = (PRESET && PRESET.nombre) || 'General';
  for (const b of el.querySelectorAll('button[data-pestana]')){
    const esModo = b.dataset.pestana === 'modo';
    b.textContent = !esModo
      ? t('presetPestanaTodo', { n: info.nTodo.toLocaleString() })
      : info.temas
        ? t('presetPestanaTemas', { n: info.nModo.toLocaleString() })
        : t('presetPestanaModo', { X: nombre, n: info.nModo.toLocaleString() });
    b.setAttribute('aria-selected', String(b.dataset.pestana === info.pestana));
  }
  el.hidden = false;
}

// Total de noticias guardadas en R2 (ventana y archivo, ya sin
// duplicados): el manifest trae el resumen. El de antes solo listaba días
// y se sumaban sus all.n.
function renderTotalR2(){
  const el = $('#total-r2'), sep = $('#total-r2-sep');
  if (!el) return;
  const dias = (_manifest && _manifest.dias) || [];
  const g = (_manifest && _manifest.guardado) || {
    n: dias.reduce((s, d) => s + ((d.all && d.all.n) || 0), 0),
    dias: dias.length,
    desde: dias.length ? dias[dias.length - 1].fecha : '',
  };
  el.hidden = sep.hidden = !g.n;
  if (!g.n) return;
  const [a, m, d] = (g.desde || '').split('-');
  el.textContent = t('contadorR2', { n: g.n.toLocaleString() });
  el.title = t('contadorR2Title', { dias: g.dias, desde: a ? `${d}/${m}/${a}` : '?' });
}

// Chips, en una o dos filas. Fila de modos (vista Temas, si hay temas en
// dos modos o más): «Todo» y un chip por modo con noticias. Fila de temas
// (un modo elegido, o el único): un chip por tema, también a 0 (atenuado),
// y en un modo, «Medios del modo». Lleva su propio «Todo» solo si va sola;
// con dos filas se vuelve a todos con el chip del modo.
function renderChipsTemas(){
  const el = document.getElementById('temas-chips');
  if (!el) return;
  const info = ULT_CHIPS;
  if (!info){ el.hidden = true; el.innerHTML = ''; return; }
  const enBusquedaModo = !!(ULT_PESTANAS && ULT_PESTANAS.pestana === 'modo' && !info.porModo);
  const cerosAbiertos = !!el.querySelector('.temas-chips-cero[open]');
  // Solo un chip de tema se atenúa a 0: los «Todo» y los de modo, nunca.
  const chip = (attrs, label, n, pulsado, title, atenuable = false) =>
    `<button type="button" ${attrs} aria-pressed="${String(pulsado)}"`
    + (n || pulsado || !atenuable ? '' : ' class="cero" disabled')
    + (title ? ` title="${escapeHtml(title)}"` : '')
    + `>${escapeHtml(label)} · ${n.toLocaleString()}</button>`;
  const filas = [];
  const ceros = [];
  if (info.porModo && TEMAS_TODOS.length >= 2){
    let html = chip('data-chip=""', t('temaChipTodo'), info.total, !CHIP_TEMAS);
    for (const m of [...TEMAS_TODOS].sort((a, b) => (info.porModo.get(b.id) || 0) - (info.porModo.get(a.id) || 0))){
      const n = info.porModo.get(m.id) || 0;
      if (n || m.id === CHIP_TEMAS) html += chip(`data-chip="${escapeHtml(m.id)}"`, m.nombre, n, m.id === CHIP_TEMAS);
    }
    filas.push(html);
  }
  if (info.porTema){
    const modo = `data-modo="${escapeHtml(info.modo)}"`;
    let html = '';
    if (!filas.length) html += chip(`data-tema="" ${modo}`, t(enBusquedaModo ? 'temaChipSinFiltro' : 'temaChipTodo'), info.totalModo, !CHIP_TEMA);
    const temasOrdenados = [...info.porTema].map(([e, n]) => ({ e, n }));
    if (info.nMedios !== null) temasOrdenados.push({ medios: true, n: info.nMedios });
    temasOrdenados.sort((a, b) => b.n - a.n);
    for (const { e, n, medios } of temasOrdenados){
      if (medios){
        html += chip(`data-medios="1" ${modo}`, t(enBusquedaModo ? 'temaChipSoloMedios' : 'temaChipMedios'), n, !!(CHIP_TEMA && CHIP_TEMA.medios));
        continue;
      }
      const pulsado = !!(CHIP_TEMA && CHIP_TEMA.etiqueta === e);
      const etiqueta = etiquetaVisible(e);
      const boton = chip(`data-tema="${escapeHtml(e)}" ${modo}`,
        enBusquedaModo ? t('temaChipTema', { X: etiqueta }) : etiqueta, n, pulsado, e, true);
      if (enBusquedaModo && n === 0 && !pulsado) ceros.push(boton);
      else html += boton;
    }
    filas.push(html);
  }
  const contexto = enBusquedaModo
    ? `<div class="temas-chips-contexto"><span>${escapeHtml(t('temaFiltroEnModo', { X: PRESET.nombre }))}</span>`
      + (ceros.length
        ? `<details class="temas-chips-cero"><summary>${escapeHtml(t('temaChipsSinCoincidencias', { n: ceros.length.toLocaleString() }))}</summary><div class="temas-chips-cero-lista">${ceros.join('')}</div></details>`
        : '') + '</div>'
    : '';
  // Con dos filas, la de temas cuelga del modo elegido: va sangrada.
  el.innerHTML = contexto + filas.map((h, i) => `<div class="temas-chips-fila${i ? ' hija' : ''}">${h}</div>`).join('');
  if (cerosAbiertos){
    const details = el.querySelector('.temas-chips-cero');
    if (details) details.open = true;
  }
  el.hidden = false;
}

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
  const root = document.createElement('dialog');
  root.id = 'pase-capa';
  root.setAttribute('aria-label', t('paseCapa'));
  root.innerHTML = `<div class="pase-contenido">
      <div class="pase-medio"></div>
      <a class="pase-titular" target="_blank" rel="noopener"></a>
      <div><button type="button" data-pase-guardar>${escapeHtml(t('saveForLaterTitle'))}</button></div>
    </div><div class="pase-controles">
      <button type="button" data-pase-anterior>${escapeHtml(t('paseAnterior'))}</button>
      <button type="button" data-pase-play></button>
      <button type="button" data-pase-siguiente>${escapeHtml(t('paseSiguiente'))}</button>
      <label><select data-pase-ritmo>${[3, 5, 8, 12, 20].map(s => `<option value="${s}"${s === 8 ? ' selected' : ''}>${s}</option>`).join('')}</select> ${escapeHtml(t('paseRitmo'))}</label>
      <button type="button" data-pase-cerrar>${escapeHtml(t('paseCerrar'))}</button>
    </div><div class="pase-estado" role="status" aria-live="off"></div>`;
  const pase = PASE = {
    root, lista: ULT_FILTRADAS.slice(desde), pos: 0,
    segundos: 8, jugando: true, timer: null, overflow: document.body.style.overflow,
  };
  document.body.appendChild(root);
  document.body.style.overflow = 'hidden';
  root.showModal();
  root.addEventListener('cancel', e => { e.preventDefault(); cerrarPase(); });
  root.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') pausarPase();
  }, { passive: true });
  root.addEventListener('pointerdown', e => {
    if (!e.target.closest('.pase-controles')) pausarPase();
  });
  root.querySelector('.pase-titular').onclick = () => {
    pausarPase();
    const n = pase.lista[pase.pos];
    if (!n) return;
    marcarLeidaLocal(n.enlace);
    registrarLeido(n);
    pintarLeidasEnLista();
    moverPase(1);
    pausarPase();
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
    pintarPase();
    programarPase();
  };
  root.querySelector('[data-pase-cerrar]').onclick = () => cerrarPase();
  root.querySelector('[data-pase-ritmo]').onchange = e => {
    pase.segundos = Number(e.target.value);
    programarPase();
  };
  pintarPase();
  programarPase();
  root.querySelector('[data-pase-play]').focus({ preventScroll: true });
}

function pintarPase(){
  const p = PASE;
  if (!p) return;
  const n = p.lista[p.pos];
  const fin = !n;
  p.root.querySelector('[data-pase-anterior]').disabled = p.pos === 0;
  p.root.querySelector('[data-pase-siguiente]').disabled = fin;
  const play = p.root.querySelector('[data-pase-play]');
  play.disabled = fin;
  play.textContent = t(p.jugando ? 'pasePausa' : 'paseContinuar');
  p.root.querySelector('.pase-estado').textContent =
    `${t('paseCapa')} · ${Math.min(p.pos + 1, p.lista.length)}/${p.lista.length} · ${t(fin ? 'paseFin' : p.jugando ? 'paseMarcha' : 'paseParado')}`;
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
  if (!PASE) return;
  PASE.jugando = false;
  programarPase();
  pintarPase();
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
document.addEventListener('touchmove', pausarPase, { passive: true });
document.addEventListener('keydown', e => {
  if (!PASE) return;
  if (e.key === 'Escape'){ e.preventDefault(); e.stopImmediatePropagation(); cerrarPase(); }
  else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.target.closest('select,input,textarea')){
    e.preventDefault();
    moverPase(e.key === 'ArrowRight' ? 1 : -1);
  } else pausarPaseFuera(e);
}, true);
