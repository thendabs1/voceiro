/* ── Super-grupos (prefijo antes de " · ") ── */
function superGrupo(grupo){
  if (!grupo) return 'Otros';
  const i = grupo.indexOf(' · ');
  return i > 0 ? grupo.slice(0, i) : grupo;
}

const ORDEN_SUPER = [
  'Nacional',
  'Deportes', 'Economía', 'Tecnología', 'Ciencia', 'Cultura',
  'Regional',
  'Internacional',      // ← al final
];

function ordenSuper(s){
  const i = ORDEN_SUPER.indexOf(s);
  return i >= 0 ? i : 999;
}

// Bucketea `items` por super-grupo usando `keyFn(item)` como clave.
// Devuelve { buckets: Map<super, items[]>, supers: string[] ordenados }.
function bucketPorSuper(items, keyFn){
  const buckets = new Map();
  items.forEach(it => {
    const s = superGrupo(keyFn(it));
    if (!buckets.has(s)) buckets.set(s, []);
    buckets.get(s).push(it);
  });
  const supers = [...buckets.keys()]
    .sort((a, b) => ordenSuper(a) - ordenSuper(b) || a.localeCompare(b));
  return { buckets, supers };
}


/* ═══════════════════════════════════════════════════════════════
   GRUPOS, LISTAS Y MEDIOS (panel config)
   ═══════════════════════════════════════════════════════════════ */
function ordenarGruposPorIdioma(grupos){
  const target = (ACCES && ACCES.lang) || 'es';
  const stats = {};
  MEDIOS_UNICOS.forEach(m => {
    if (!stats[m.grupo]) stats[m.grupo] = { total: 0, matches: 0 };
    stats[m.grupo].total++;
    if (m.lang === target) stats[m.grupo].matches++;
  });
  return grupos.slice().sort((a, b) => {
    const sa = stats[a] || { total: 0, matches: 0 };
    const sb = stats[b] || { total: 0, matches: 0 };
    if (sa.matches !== sb.matches) return sb.matches - sa.matches;
    const ra = sa.total ? sa.matches / sa.total : 0;
    const rb = sb.total ? sb.matches / sb.total : 0;
    if (ra !== rb) return rb - ra;
    return a.localeCompare(b);
  });
}
function gruposAfinesAlIdioma(){
  const target = (ACCES && ACCES.lang) || 'es';
  const set = new Set();
  MEDIOS_UNICOS.forEach(m => { if (m.lang === target) set.add(m.grupo); });
  return set;
}

function reconstruirSelectores(){
  const grupos = ordenarGruposPorIdioma([...new Set(MEDIOS_UNICOS.map(m => m.grupo))]);
  const { buckets, supers } = bucketPorSuper(grupos, g => g);

  const poblar = (sel, labelTodo) => {
    const prev = sel.value;

    // ── Limpieza TOTAL: options + optgroups ──
    sel.innerHTML = '';
    sel.appendChild(new Option(labelTodo, ''));

    supers.forEach(s => {
      const enCat = buckets.get(s);

      // Si la categoría tiene un único grupo que se llama igual
      // (Nacional, Deportes, Economía…), la mostramos como opción
      // top-level. Sin optgroup redundante → sin "Deportes / Deportes".
      if (enCat.length === 1 && enCat[0] === s){
        sel.appendChild(new Option(s, s));
        return;
      }

      const og = document.createElement('optgroup');
      og.label = s;
      enCat.forEach(g => og.appendChild(new Option(g, g)));
      sel.appendChild(og);
    });

    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
  };

  poblar($('#grupo'), t('fltGrupo'));
  poblar($('#filtro-grupo-medio'), t('cfgTodosGrupos'));
}
function renderListaGrupos(p){
  const contG = $('#lista-grupos');
  const grupos = ordenarGruposPorIdioma([...new Set(MEDIOS_UNICOS.map(m => m.grupo))]);
  const afin   = gruposAfinesAlIdioma();
  const gSet   = new Set(p.grupos);
  const { buckets, supers } = bucketPorSuper(grupos, g => g);

  let html = '';
  supers.forEach(s => {
    const enCat   = buckets.get(s);
    const todos   = enCat.every(g => gSet.has(g));
    const algunos = !todos && enCat.some(g => gSet.has(g));

    // Si el grupo se llama igual que la categoría, no pintamos cabecera
    const esRedundante = enCat.length === 1 && enCat[0] === s;
    if (!esRedundante){
      html += `<div class="grupo-cat-header" data-cat="${escapeHtml(s)}">
        <label class="grupo-cat-toggle-wrap">
          <input type="checkbox" class="grupo-cat-toggle"
                ${todos ? 'checked' : ''}
                ${algunos ? 'data-indeterminate="1"' : ''}>
          <strong>${escapeHtml(s)}</strong>
          <span class="grupo-cat-count">${enCat.length}</span>
        </label>
      </div>`;
    }
    enCat.forEach(g => {
      html += `<label class="grupo-item" data-cat="${escapeHtml(s)}">
        <input type="checkbox" data-grupo="${escapeHtml(g)}" ${gSet.has(g) ? 'checked' : ''}>
        <span>${escapeHtml(g)}</span>
        ${afin.has(g) ? '<span class="flag" title="idioma">●</span>' : ''}
      </label>`;
    });
  });
  contG.innerHTML = html;

  // Estado indeterminado (algunos pero no todos)
  contG.querySelectorAll('.grupo-cat-toggle[data-indeterminate="1"]')
    .forEach(chk => { chk.indeterminate = true; });

  // Toggle de categoría completa
  contG.querySelectorAll('.grupo-cat-toggle').forEach(chk => {
    chk.addEventListener('change', () => {
      const cat = chk.closest('.grupo-cat-header').dataset.cat;
      contG.querySelectorAll(`.grupo-item[data-cat="${CSS.escape(cat)}"] input[data-grupo]`)
        .forEach(g => { g.checked = chk.checked; });
    });
  });
}
// Medios del modo que se edita en Ajustes, con su ✓ (forzar) o ⊘ (bloquear).
function renderListaMedios(){
  const cont = $('#lista-medios');
  const modo = modoEnPanel();
  const { buckets, supers } = bucketPorSuper(MEDIOS_UNICOS, m => m.grupo);

  let html = '';
  supers.forEach(s => {
    const enCat = buckets.get(s);

    // Si el grupo se llama igual que la categoría (Deportes, Economía,
    // Nacional…), no pintamos cabecera: sería una línea redundante.
    const esRedundante = enCat.length === 1 && enCat[0].grupo === s;
    if (!esRedundante){
      html += `<div class="medio-cat-header" data-cat="${escapeHtml(s)}">${escapeHtml(s)}</div>`;
    }

    enCat.forEach(m => {
      const mode  = getOverride(m.dominio, modo) || '';
      html += `
        <div class="medio-fila"
             data-dominio="${escapeHtml(m.dominio)}"
             data-grupo="${escapeHtml(m.grupo)}"
             data-cat="${escapeHtml(s)}"
             data-buscar="${escapeHtml(normalize(m.dominio + ' ' + m.medio + ' ' + m.grupo))}">
          <label class="chk incluir" title="${escapeHtml(t('forceInclude'))}">
            <input type="checkbox" class="chk-incluir" ${mode === 'first' ? 'checked' : ''}><span>${ico('check')}</span>
          </label>
          <label class="chk ignorar" title="${escapeHtml(t('forceExclude'))}">
            <input type="checkbox" class="chk-ignorar" ${mode === 'ignore' ? 'checked' : ''}><span>${ico('ban')}</span>
          </label>
          <span class="celda celda-dominio"><code>${escapeHtml(m.dominio)}</code></span>
          <span class="celda celda-nombre">${escapeHtml(m.medio)}</span>
          <span class="celda celda-grupo">${escapeHtml(m.grupo)}</span>
        </div>`;
    });
  });
  cont.innerHTML = html;
  filtrarMedios();
}

function marca(fila){
  const inc = fila.querySelector('.chk-incluir').checked;
  const ign = fila.querySelector('.chk-ignorar').checked;
  fila.classList.toggle('estado-incluir', inc);
  fila.classList.toggle('estado-ignorar', ign);
  actualizarResumen();
}
function filtrarMedios(){
  const q = normalize($('#filtro-medio').value.trim());
  const g = $('#filtro-grupo-medio').value;
  let visibles = 0;

  document.querySelectorAll('#lista-medios .medio-fila').forEach(f => {
    const okQ = !q || f.dataset.buscar.includes(q);
    const okG = !g || f.dataset.grupo === g;
    const show = okQ && okG;
    f.style.display = show ? '' : 'none';
    if (show) visibles++;
  });

  // Ocultar cabeceras de categoría sin filas visibles
  document.querySelectorAll('#lista-medios .medio-cat-header').forEach(hdr => {
    let sib = hdr.nextElementSibling;
    let hasVisible = false;
    while (sib && !sib.classList.contains('medio-cat-header')){
      if (sib.classList.contains('medio-fila') && sib.style.display !== 'none'){
        hasVisible = true;
        break;
      }
      sib = sib.nextElementSibling;
    }
    hdr.style.display = hasVisible ? '' : 'none';
  });

  actualizarResumen(visibles);
  actualizarAddBar(visibles);
}

function actualizarAddBar(visibles){
  const bar   = $('#filtro-medio-add');
  const label = $('#filtro-medio-add-label');
  if (!bar || !label) return;

  const raw = $('#filtro-medio').value.trim();
  const dom = normalizarDominioInput(raw);

  // Solo ofrecemos añadir si:
  //  - hay texto
  //  - parece un dominio válido
  //  - no hay ningún medio visible
  //  - ese dominio no está ya como override
  const esValido = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(dom);
  const modo     = modoEnPanel();
  const yaEsta   = !!(modo && modo.overrides && modo.overrides[dom]);

  if (!raw || !esValido || visibles > 0 || yaEsta){
    bar.hidden = true;
    return;
  }

  label.innerHTML = t('cfgMedioAddLabel', { X: '<code>' + escapeHtml(dom) + '</code>' });
  bar.hidden = false;
}
function actualizarResumen(visiblesOverride){
  const total = MEDIOS_UNICOS.length;
  const visibles = visiblesOverride != null
    ? visiblesOverride
    : document.querySelectorAll('#lista-medios .medio-fila:not([style*="display: none"])').length;
  const inc = document.querySelectorAll('#lista-medios .chk-incluir:checked').length;
  const ign = document.querySelectorAll('#lista-medios .chk-ignorar:checked').length;
  $('#resumen-medios').textContent = t('cfgResumen', {
    vis: visibles, total: total, inc: inc, ign: ign
  });
}
