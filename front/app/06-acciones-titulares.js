/* ═══════════════════════════════════════════════════════════════
   MENÚ ⋯ DE CADA TITULAR
   Uno solo, dentro de #resultados. Sus botones llevan las clases y el
   data-idx que antes estaban en la tarjeta (.btn-add-item, .btn-block-item,
   .btn-report-item), así que wireResultadosDelegation los atiende igual.
   ═══════════════════════════════════════════════════════════════ */
function cerrarMenuMas(){
  // Quitar el listener siempre: un repintado del feed borra el menú sin pasar por aquí.
  document.removeEventListener('pointerdown', _menuMasFuera, true);
  const m = document.getElementById('menu-mas');
  if (!m) return;
  m.remove();
  document.querySelectorAll('.btn-mas-item[aria-expanded="true"]')
    .forEach(b => b.setAttribute('aria-expanded', 'false'));
}
function _menuMasFuera(e){
  if (e.target.closest('#menu-mas') || e.target.closest('.btn-mas-item')) return;
  cerrarMenuMas();
}
function abrirMenuMas(btn){
  const idx = btn.dataset.idx;
  const abierto = document.getElementById('menu-mas');
  cerrarMenuMas();
  if (abierto && abierto.dataset.idx === idx) return;   // segundo clic: cierra
  const n = ULT_FILTRADAS[parseInt(idx, 10)];
  const cont = $('#resultados');
  if (!n || !cont) return;

  // Si el medio ya está incluido en el modo activo, «Añadir» no tiene sentido.
  const yaForzado = PRESET_ACTIVO && overrideIncluye(getOverride(n.dominio));
  const item = (cls, icono, texto) =>
    `<button type="button" role="menuitem" class="${cls}" data-idx="${idx}">${ico(icono)}<span>${escapeHtml(texto)}</span></button>`;
  const m = document.createElement('div');
  m.id = 'menu-mas';
  m.className = 'menu-mas';
  m.dataset.idx = idx;
  m.setAttribute('role', 'menu');
  m.innerHTML =
    (yaForzado ? '' : item('btn-add-item', 'plus', t('addToModoTitle')))
    + item('btn-block-item', 'ban', t('blockMedia'))
    // Cómo se lee este medio en el lector: su regla, en Ajustes › Lector.
    + (USCRIPT_OK ? item('btn-leer-item', 'book-open-text', t('comoLeerlo')) : '')
    + item('btn-report-item', 'flag', t('repBtnTitle'));
  cont.appendChild(m);

  // Bajo el botón, alineado por la derecha con él.
  const rb = btn.getBoundingClientRect();
  const rc = cont.getBoundingClientRect();
  m.style.top   = (rb.bottom - rc.top + 4) + 'px';
  m.style.right = Math.max(0, rc.right - rb.right) + 'px';
  btn.setAttribute('aria-expanded', 'true');
  document.addEventListener('pointerdown', _menuMasFuera, true);
}

/* ═══════════════════════════════════════════════════════════════
   DESTINO DE OVERRIDE (➕ / 🚫) CUANDO NO HAY MODO ACTIVO
   Fila expandida dentro de la propia tarjeta
   ═══════════════════════════════════════════════════════════════ */
let _destinoIdxAbierto = -1;

function cerrarDestinoInline(){
  if (_destinoIdxAbierto < 0) return;
  const el = document.querySelector('.destino-inline[data-idx="' + _destinoIdxAbierto + '"]');
  if (el){ el.hidden = true; el.innerHTML = ''; }
  _destinoIdxAbierto = -1;
}

function abrirDestinoInline(idx, accion){
  // Toggle: si ya estaba abierto en esta tarjeta, cerrar
  if (_destinoIdxAbierto === idx){
    cerrarDestinoInline();
    return;
  }
  cerrarDestinoInline();

  const cont = document.querySelector('.destino-inline[data-idx="' + idx + '"]');
  if (!cont) return;

  const activoId = PRESET_ACTIVO && PRESETS ? PRESETS.activo : null;

  let html = `<span class="destino-lbl">${
    escapeHtml(accion === 'include' ? t('destinoAnadirA') : t('destinoBloquearEn'))
  }</span>`;

  if (accion === 'ignore'){
    html += `<button type="button" class="destino-btn" data-destino-id="__todos">${escapeHtml(t('destinoTodosModos'))}</button>`;
  }
  PRESETS.lista.forEach(p => {
    const activo = p.id === activoId;
    html += `<button type="button" class="destino-btn${activo ? ' activo' : ''}"
                    data-destino-id="${escapeHtml(p.id)}">${escapeHtml(p.nombre)}</button>`;
  });

  html += `<button type="button" class="destino-btn nuevo" data-destino-id="__nuevo">+ ${escapeHtml(t('destinoNuevoModo'))}</button>`;

  cont.innerHTML = html;
  cont.hidden = false;
  _destinoIdxAbierto = idx;

  cont.querySelectorAll('.destino-btn').forEach(b => {
    b.addEventListener('click', ev => {
      ev.stopPropagation();
      ev.preventDefault();
      const id = b.dataset.destinoId;
      const n = ULT_FILTRADAS[idx];
      if (!n) { cerrarDestinoInline(); return; }

      if (id === '__todos'){
        PRESETS.lista.forEach(p => {
          if (!p.overrides) p.overrides = {};
          p.overrides[n.dominio] = 'ignore';
        });
        guardarPresets();
        ajRefrescar();
        toast(`${t('destinoOkTodos')} · ${n.medio || n.dominio}`, 2400);
        cerrarDestinoInline();
        return;
      }
      if (id === '__nuevo'){
        const nuevo = crearModoYDevolver();
        if (nuevo) aplicarOverrideEnModo(nuevo, accion, n.dominio, n.medio || n.dominio);
        cerrarDestinoInline();
        return;
      }
      const target = PRESETS.lista.find(p => p.id === id);
      if (target) aplicarOverrideEnModo(target, accion, n.dominio, n.medio || n.dominio);
      cerrarDestinoInline();
    });
  });
}

function aplicarOverrideEnModo(targetPreset, accion, dominio, medioNombre){
  if (!targetPreset) return;

  if (targetPreset === PRESET){
    // Ruta normal: reusa setOverride (persiste, refresca botón de preset)
    setOverride(dominio, accion);
  } else {
    if (!targetPreset.overrides || typeof targetPreset.overrides !== 'object'){
      targetPreset.overrides = {};
    }
    targetPreset.overrides[dominio] = accion;
    guardarPresets();
  }

  ajRefrescar();

  if (PRESET_ACTIVO && targetPreset === PRESET){
    aplicarFiltros();
    const ok = accion === 'include' ? t('destinoOkAnadido') : t('destinoOkBloqueado');
    toast(`${ok} · ${medioNombre}`, 2000);
  } else {
    const ok = accion === 'include' ? t('destinoOkAnadidoEn') : t('destinoOkBloqueadoEn');
    toast(`${ok} «${targetPreset.nombre}» · ${medioNombre}`, 2400);
  }
}

function crearModoYDevolver(){
  const nombre = prompt(t('cfgModoNombrePrompt'), '');
  if (nombre == null) return null;
  const limpio = nombre.trim();
  if (!limpio) return null;

  const nuevo = {
    id: 'm-' + Date.now().toString(36),
    nombre: limpio,
    grupos: [],
    palabras: [],
    overrides: {},
  };
  PRESETS.lista.push(nuevo);
  guardarPresets();
  ajRefrescar();
  return nuevo;
}
/* ═══════════════════════════════════════════════════════════════
   BIONIC
   ═══════════════════════════════════════════════════════════════ */
const BIONIC_CACHE = new Map();
const BIONIC_CACHE_MAX = 8000;

function bionicize(html){
  if (!ACCES.bionic) return html;
  const cached = BIONIC_CACHE.get(html);
  if (cached !== undefined) return cached;
  let result = html;
  try{
    const doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
    const root = doc.body.firstChild;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    let n; while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(tn => {
      const raw = tn.textContent;
      if (!raw || !/[\wÁÉÍÓÚÑáéíóúñ]/.test(raw)) return;
      const frag = doc.createDocumentFragment();
      const re = /([\wÁÉÍÓÚÑáéíóúñ]+)/g;
      let last = 0, m;
      while ((m = re.exec(raw)) !== null){
        if (m.index > last) frag.appendChild(doc.createTextNode(raw.slice(last, m.index)));
        const w = m[1];
        const half = Math.max(1, Math.ceil(w.length / 2));
        const b = doc.createElement('b');
        b.textContent = w.slice(0, half);
        frag.appendChild(b);
        frag.appendChild(doc.createTextNode(w.slice(half)));
        last = m.index + w.length;
      }
      if (last < raw.length) frag.appendChild(doc.createTextNode(raw.slice(last)));
      tn.parentNode.replaceChild(frag, tn);
    });
    result = root.innerHTML;
  }catch(e){ result = html; }
  if (BIONIC_CACHE.size >= BIONIC_CACHE_MAX) BIONIC_CACHE.clear();
  BIONIC_CACHE.set(html, result);
  return result;
}

function updateFocus(){
  const items = document.querySelectorAll('.noticia');
  if (!ACCES.focus){
    items.forEach(el => el.classList.remove('foco-dim','foco-active'));
    return;
  }
  if (!items.length) return;
  const mid = window.innerHeight / 2;
  let best = null, bd = Infinity;
  items.forEach(el => {
    const r = el.getBoundingClientRect();
    const d = Math.abs((r.top + r.bottom) / 2 - mid);
    if (d < bd){ bd = d; best = el; }
  });
  items.forEach(el => {
    el.classList.toggle('foco-dim', el !== best);
    el.classList.toggle('foco-active', el === best);
  });
}
window.addEventListener('scroll', () => {
  if (ACCES.focus) requestAnimationFrame(updateFocus);
}, { passive: true });




/* ═══════════════════════════════════════════════════════════════
   RESALTADO + IDIOMA
   El resaltado marca exactamente lo que casó con el texto de la búsqueda
   (rangosResaltado, shared/busqueda/texto.js): misma regla que el filtro.
   ═══════════════════════════════════════════════════════════════ */
function resaltarTitular(texto, compilado){
  if (!texto) return '';
  let out = '', last = 0;
  for (const [i, j] of rangosResaltado(texto, compilado)){
    out += escapeHtml(texto.slice(last, i)) + '<mark>' + escapeHtml(texto.slice(i, j)) + '</mark>';
    last = j;
  }
  return out + escapeHtml(texto.slice(last));
}

const LANG_OPTIONS = [
  { code: 'es', label: 'optLangEs' },
  { code: 'gl', label: 'optLangGl' },
  { code: 'ca', label: 'optLangCa' },
  { code: 'en', label: 'optLangEn' },
  { code: 'eu', label: 'optLangEu' },
];

function renderLangSelect(){
  const sel = $('#lang-select');
  sel.innerHTML = LANG_OPTIONS.map(o =>
    `<option value="${o.code}">${escapeHtml(t(o.label))}</option>`
  ).join('');
  sel.value = ACCES.lang;
  sel.setAttribute('aria-label', t('lblIdioma'));
}
