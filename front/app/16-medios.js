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
// Medios del modo que se edita en Ajustes: incluir, destacar o bloquear.
let MEDIOS_CATS_MODO = null;
let MEDIOS_CATS_ABIERTAS = new Set();
function medioActivoEnModo(m, modo){
  const estado = getOverride(m.dominio, modo);
  return overrideIncluye(estado) || (estado !== 'ignore' && (modo?.grupos || []).includes(m.grupo));
}
function ordenarCategoriasMedios(medios, modo){
  const categorias = new Map();
  medios.forEach(m => {
    if (!categorias.has(m.grupo)) categorias.set(m.grupo, []);
    categorias.get(m.grupo).push(m);
  });
  const activos = new Map();
  categorias.forEach((enCat, grupo) => {
    enCat.sort((a, b) => Number(medioActivoEnModo(b, modo)) - Number(medioActivoEnModo(a, modo))
      || a.medio.localeCompare(b.medio));
    activos.set(grupo, enCat.filter(m => medioActivoEnModo(m, modo)).length);
  });
  const grupos = [...categorias.keys()].sort((a, b) =>
    activos.get(b) - activos.get(a) || a.localeCompare(b));
  return { categorias, grupos, activos };
}
function renderListaMedios(){
  const cont = $('#lista-medios');
  const modo = modoEnPanel();
  const medios = mediosDelPanel(modo);
  if (MEDIOS_CATS_MODO !== modo?.id){
    MEDIOS_CATS_MODO = modo?.id;
    MEDIOS_CATS_ABIERTAS = new Set();
  }
  const { categorias, grupos, activos } = ordenarCategoriasMedios(medios, modo);

  let html = '';
  grupos.forEach(g => {
    const enCat = categorias.get(g);
    html += `<details class="medio-cat" data-cat="${escapeHtml(g)}"${MEDIOS_CATS_ABIERTAS.has(g) ? ' open' : ''}>
      <summary class="medio-cat-header"><span>${escapeHtml(g)}</span>
        <small>${escapeHtml(t('cfgMediosCategoria', { activos: activos.get(g), total: enCat.length }))}</small></summary>`;
    enCat.forEach(m => {
      const mode  = getOverride(m.dominio, modo) || '';
      html += `
        <div class="medio-fila${overrideIncluye(mode) ? ' estado-incluir' : mode === 'ignore' ? ' estado-ignorar' : ''}"
             data-dominio="${escapeHtml(m.dominio)}"
             data-grupo="${escapeHtml(m.grupo)}"
             data-buscar="${escapeHtml(normalize(m.dominio + ' ' + m.medio + ' ' + m.grupo))}">
          <span class="medio-identidad">
            <strong>${escapeHtml(m.medio)}</strong>
            <span class="medio-dominio">${escapeHtml(m.dominio)}</span>
            <small>${escapeHtml(m.grupo)}</small>
          </span>
          <select class="medio-estado" aria-label="${escapeHtml(t('cfgEstadoMedio', { X: m.medio }))}">
            ${['', 'include', 'first', 'ignore'].map(v =>
              `<option value="${v}"${mode === v ? ' selected' : ''}>${escapeHtml(t(MEDIO_ESTADOS[v]))}</option>`
            ).join('')}
          </select>
        </div>`;
    });
    html += '</details>';
  });
  cont.innerHTML = html;
  filtrarMedios();
}

const MEDIO_ESTADOS = {
  '': 'cfgMedioAutomatico', include: 'cfgMedioIncluir', first: 'cfgMedioDestacar', ignore: 'cfgMedioBloquear',
};

// Los dominios añadidos a mano se editan en la misma lista que el catálogo.
function mediosDelPanel(modo){
  const conocidos = new Set(MEDIOS_UNICOS.map(m => m.dominio));
  const extras = Object.keys((modo && modo.overrides) || {}).filter(d => !conocidos.has(d))
    .map(d => ({ dominio: d, medio: d, grupo: t('cfgMediosOtros') }));
  return [...MEDIOS_UNICOS, ...extras];
}
function actualizarFilaMedio(dominio){
  renderListaMedios();
  const fila = [...document.querySelectorAll('#lista-medios .medio-fila')]
    .find(f => f.dataset.dominio === dominio);
  if (fila && fila.style.display !== 'none') fila.querySelector('.medio-estado').focus();
  else $(fila ? '#filtro-estado-medio' : '#filtro-medio').focus();
}
function filtrarMedios(){
  const q = normalize($('#filtro-medio').value.trim());
  const g = $('#filtro-grupo-medio').value;
  const estado = $('#filtro-estado-medio').value;
  const modo = modoEnPanel();
  let visibles = 0;

  document.querySelectorAll('#lista-medios .medio-fila').forEach(f => {
    const okQ = !q || f.dataset.buscar.includes(q);
    const okG = !g || f.dataset.grupo === g;
    const valor = getOverride(f.dataset.dominio, modo);
    const okEstado = !estado || (estado === 'configurados' ? !!valor : valor === estado);
    const show = okQ && okG && okEstado;
    f.style.display = show ? '' : 'none';
    if (show) visibles++;
  });

  const filtrando = !!(q || g || estado);
  document.querySelectorAll('#lista-medios .medio-cat').forEach(cat => {
    const tieneVisibles = [...cat.querySelectorAll('.medio-fila')]
      .some(f => f.style.display !== 'none');
    cat.style.display = tieneVisibles ? '' : 'none';
    cat.open = (filtrando && tieneVisibles) || MEDIOS_CATS_ABIERTAS.has(cat.dataset.cat);
  });

  actualizarResumen(visibles);
  actualizarAddBar(visibles);
  $('#medios-vacio').hidden = visibles > 0;
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

  const enCatalogo = MEDIOS_UNICOS.some(m => m.dominio === dom);
  if (!raw || !esValido || visibles > 0 || yaEsta || enCatalogo){
    bar.hidden = true;
    return;
  }

  label.innerHTML = t('cfgMedioAddLabel', { X: '<code>' + escapeHtml(dom) + '</code>' });
  bar.hidden = false;
}
function actualizarResumen(visiblesOverride){
  const total = mediosDelPanel(modoEnPanel()).length;
  const visibles = visiblesOverride != null
    ? visiblesOverride
    : document.querySelectorAll('#lista-medios .medio-fila:not([style*="display: none"])').length;
  const ov = Object.values((modoEnPanel() || {}).overrides || {});
  const inc = ov.filter(overrideIncluye).length;
  const fav = ov.filter(v => v === 'first').length;
  const ign = ov.filter(v => v === 'ignore').length;
  $('#resumen-medios').textContent = t('cfgResumen', {
    vis: visibles, total: total, inc: inc, fav: fav, ign: ign
  });
}
