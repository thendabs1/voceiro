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
  const el = $('#total-r2');
  if (!el) return;
  const dias = (_manifest && _manifest.dias) || [];
  const g = (_manifest && _manifest.guardado) || {
    n: dias.reduce((s, d) => s + ((d.all && d.all.n) || 0), 0),
    dias: dias.length,
    desde: dias.length ? dias[dias.length - 1].fecha : '',
  };
  el.hidden = !g.n;
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

// ── Resumen de medios de una búsqueda ──
// Modelo: los filtros con cifras de la barra lateral del buscador de GitHub.
// Cuenta lo que enseña el feed (tras pestañas y chips); un medio del catálogo
// escribe web:dominio en la barra (filtrarPorMedio), como su nombre en la
// tarjeta. Es un chip plegable: contar es una pasada por la lista ya
// filtrada; la lista de medios solo se pinta abierta.
const RESUMEN_MEDIOS = { lista: null, orden: 'n', todos: false };
const RESUMEN_MEDIOS_VISIBLES = 12;

function renderResumenMedios(lista){
  const el = document.getElementById('medios-resumen');
  if (!el) return;
  if (lista !== undefined) RESUMEN_MEDIOS.lista = lista;
  const cuentas = new Map();
  for (const n of RESUMEN_MEDIOS.lista || []) if (n.dominio) cuentas.set(n.dominio, (cuentas.get(n.dominio) || 0) + 1);
  if (cuentas.size < 2){ el.hidden = true; el.open = false; el.innerHTML = ''; return; }
  if (!el.firstElementChild) el.innerHTML = '<summary></summary><div class="medios-resumen-cuerpo"></div>';
  el.firstElementChild.textContent = t('resMedios', { n: cuentas.size.toLocaleString() });
  el.hidden = false;
  const cuerpo = el.lastElementChild;
  if (!el.open){ cuerpo.innerHTML = ''; return; }

  const nombreDe = new Map();
  for (const n of RESUMEN_MEDIOS.lista) if (n.dominio && !nombreDe.has(n.dominio)) nombreDe.set(n.dominio, n.medio || MEDIOS[n.dominio]?.n || n.dominio);
  const lang = (ACCES && ACCES.lang) || 'es';
  const porNombre = (a, b) => nombreDe.get(a).localeCompare(nombreDe.get(b), lang);
  const porCifra = (a, b) => cuentas.get(b) - cuentas.get(a) || porNombre(a, b);
  const fila = d => {
    const nombre = escapeHtml(nombreDe.get(d)), n = `<span class="medios-resumen-n">${cuentas.get(d).toLocaleString()}</span>`;
    // Fuera del catálogo (lo trae la prensa): se cuenta, pero no filtra.
    return MEDIOS[d]
      ? `<li><button type="button" data-dominio="${escapeHtml(d)}" title="${escapeHtml(t('medioFiltrarTitle', { medio: nombreDe.get(d) }))}"><span>${nombre}</span>${n}</button></li>`
      : `<li><span class="medios-resumen-fuera"><span>${nombre}</span>${n}</span></li>`;
  };
  // Lo enfocado y los grupos abiertos sobreviven al repintado.
  const foco = cuerpo.contains(document.activeElement) ? document.activeElement : null;
  const selFoco = foco && (foco.dataset.orden ? `[data-orden="${foco.dataset.orden}"]`
    : foco.dataset.dominio ? `[data-dominio="${CSS.escape(foco.dataset.dominio)}"]`
    : foco.closest('[data-grupo]') ? `[data-grupo="${CSS.escape(foco.closest('[data-grupo]').dataset.grupo)}"] > summary` : '');
  const abiertos = new Set([...cuerpo.querySelectorAll('.medios-resumen-grupo[open]')].map(g => g.dataset.grupo));

  const o = RESUMEN_MEDIOS.orden;
  const botonOrden = (v, clave) => `<button type="button" data-orden="${v}" aria-pressed="${o === v}">${escapeHtml(t(clave))}</button>`;
  let html = `<div class="medios-resumen-orden" role="group" aria-label="${escapeHtml(t('resOrdenar'))}">`
    + botonOrden('n', 'resOrdenNoticias') + botonOrden('az', 'resOrdenNombre') + botonOrden('grupo', 'resOrdenGrupo') + '</div>';
  const dominios = [...cuentas.keys()];
  if (o === 'grupo'){
    // Esquema: grupo (suma de sus noticias) → medios, plegado como en Estadísticas.
    const grupos = new Map();
    for (const d of dominios){
      const g = MEDIOS[d]?.g || t('resOtros');
      if (!grupos.has(g)) grupos.set(g, { n: 0, ds: [] });
      const x = grupos.get(g); x.n += cuentas.get(d); x.ds.push(d);
    }
    html += [...grupos].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0], lang)).map(([g, x]) =>
      `<details class="medios-resumen-grupo" data-grupo="${escapeHtml(g)}"${abiertos.has(g) ? ' open' : ''}><summary><span>${escapeHtml(g)}</span><span class="medios-resumen-n">${x.n.toLocaleString()}</span></summary>`
      + `<ul class="medios-resumen-lista">${x.ds.sort(porCifra).map(fila).join('')}</ul></details>`).join('');
  } else {
    dominios.sort(o === 'az' ? porNombre : porCifra);
    const vistos = RESUMEN_MEDIOS.todos ? dominios : dominios.slice(0, RESUMEN_MEDIOS_VISIBLES);
    html += `<ul class="medios-resumen-lista">${vistos.map(fila).join('')}</ul>`;
    if (vistos.length < dominios.length) html += `<button type="button" class="medios-resumen-todos" data-todos>${escapeHtml(t('resVerTodos', { n: dominios.length.toLocaleString() }))}</button>`;
  }
  cuerpo.innerHTML = html;
  if (selFoco) cuerpo.querySelector(selFoco)?.focus({ preventScroll: true });
}

function wireResumenMedios(){
  const el = document.getElementById('medios-resumen');
  if (!el) return;
  // toggle no burbujea: este es el del propio resumen, no el de un grupo.
  el.addEventListener('toggle', () => {
    if (!el.open) RESUMEN_MEDIOS.todos = false;
    renderResumenMedios();
  });
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.dominio){ el.open = false; filtrarPorMedio(b.dataset.dominio); return; }
    if (b.dataset.orden) RESUMEN_MEDIOS.orden = b.dataset.orden;
    else if ('todos' in b.dataset){
      RESUMEN_MEDIOS.todos = true;
      renderResumenMedios();
      // El foco pasa a la primera fila nueva, no se pierde con el botón.
      el.querySelectorAll('.medios-resumen-lista li button')[RESUMEN_MEDIOS_VISIBLES]?.focus();
      return;
    }
    renderResumenMedios();
  });
}
