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
    // Lo del modo sale de filtrar «Toda la búsqueda»: con las mismas cifras son
    // las mismas noticias y esa pestaña sobra. Si es la elegida, se queda; si
    // luego llega más (archivo, prensa) y las cifras se separan, vuelve.
    b.hidden = !esModo && info.pestana === 'modo' && info.nModo === info.nTodo;
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
// con dos filas se vuelve a todos con el chip del modo. Buscando dentro de
// un modo van en la línea de las pestañas: solo los temas con noticias (o
// el elegido), y «Sin filtro» solo si hay alguno con el que alternar.
function renderChipsTemas(){
  const el = document.getElementById('temas-chips');
  if (!el) return;
  const info = ULT_CHIPS;
  if (!info){ el.hidden = true; el.innerHTML = ''; return; }
  const enBusquedaModo = !!(ULT_PESTANAS && ULT_PESTANAS.pestana === 'modo' && !info.porModo);
  // Solo un chip de tema se atenúa a 0: los «Todo» y los de modo, nunca.
  const chip = (attrs, label, n, pulsado, title, atenuable = false) =>
    `<button type="button" ${attrs} aria-pressed="${String(pulsado)}"`
    + (n || pulsado || !atenuable ? '' : ' class="cero" disabled')
    + (title ? ` title="${escapeHtml(title)}"` : '')
    + `>${escapeHtml(label)} · ${n.toLocaleString()}</button>`;
  const filas = [];
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
    const temasOrdenados = [...info.porTema].map(([e, n]) => ({ e, n }));
    if (info.nMedios !== null) temasOrdenados.push({ medios: true, n: info.nMedios });
    temasOrdenados.sort((a, b) => b.n - a.n);
    for (const { e, n, medios } of temasOrdenados){
      const pulsado = medios ? !!(CHIP_TEMA && CHIP_TEMA.medios) : !!(CHIP_TEMA && CHIP_TEMA.etiqueta === e);
      if (enBusquedaModo && n === 0 && !pulsado) continue;
      if (medios){
        html += chip(`data-medios="1" ${modo}`, t(enBusquedaModo ? 'temaChipSoloMedios' : 'temaChipMedios'), n, pulsado);
        continue;
      }
      const etiqueta = etiquetaVisible(e);
      html += chip(`data-tema="${escapeHtml(e)}" ${modo}`,
        enBusquedaModo ? t('temaChipTema', { X: etiqueta }) : etiqueta, n, pulsado, e, true);
    }
    if (!filas.length && (html || !enBusquedaModo)){
      html = chip(`data-tema="" ${modo}`, t(enBusquedaModo ? 'temaChipSinFiltro' : 'temaChipTodo'), info.totalModo, !CHIP_TEMA) + html;
    }
    if (html) filas.push(html);
  }
  if (!filas.length){ el.hidden = true; el.innerHTML = ''; return; }
  // Con dos filas, la de temas cuelga del modo elegido: va sangrada.
  el.innerHTML = filas.map((h, i) => `<div class="temas-chips-fila${i ? ' hija' : ''}">${h}</div>`).join('');
  el.hidden = false;
}

// ── Resumen de medios de una búsqueda ──
// Modelo: los filtros con cifras de la barra lateral del buscador de GitHub.
// Cuenta lo que enseña el feed (tras pestañas y chips); un medio con dominio
// escribe web:dominio en la barra (filtrarPorMedio), como su nombre en la
// tarjeta. Es un chip plegable que flota sobre las noticias: contar es una
// pasada por la lista ya filtrada; la lista de medios solo se pinta abierta.
// Con más de RESUMEN_MEDIOS_VISIBLES medios lleva un buscador (como el filtro
// de lenguajes de GitHub); al escribir solo se repinta lo de debajo.
const RESUMEN_MEDIOS = { lista: null, orden: 'n', todos: false, q: '' };
const RESUMEN_MEDIOS_VISIBLES = 12;
// Google News sin <source url> deja news.google.com como dominio: esas
// fuentes se distinguen por nombre y no filtran (no hay dominio que escribir).
const claveResumenMedio = n => (n.dominio === 'news.google.com' ? '~' + normStrict(n.medio || 'Google News') : n.dominio);

function renderResumenMedios(lista){
  const el = document.getElementById('medios-resumen');
  if (!el) return;
  if (lista !== undefined) RESUMEN_MEDIOS.lista = lista;
  const cuentas = new Map();
  for (const n of RESUMEN_MEDIOS.lista || []){
    const k = n.dominio && claveResumenMedio(n);
    if (k) cuentas.set(k, (cuentas.get(k) || 0) + 1);
  }
  if (cuentas.size < 2){ el.hidden = true; el.open = false; el.innerHTML = ''; return; }
  if (!el.firstElementChild) el.innerHTML = '<summary></summary><div class="medios-resumen-cuerpo"></div>';
  el.firstElementChild.textContent = t('resMedios', { n: cuentas.size.toLocaleString() });
  el.hidden = false;
  const cuerpo = el.lastElementChild;
  if (!el.open){ cuerpo.innerHTML = ''; return; }

  const nombreDe = new Map();
  for (const n of RESUMEN_MEDIOS.lista){
    const k = n.dominio && claveResumenMedio(n);
    if (k && !nombreDe.has(k)) nombreDe.set(k, n.medio || MEDIOS[n.dominio]?.n || n.dominio);
  }
  const lang = (ACCES && ACCES.lang) || 'es';
  const porNombre = (a, b) => nombreDe.get(a).localeCompare(nombreDe.get(b), lang);
  const porCifra = (a, b) => cuentas.get(b) - cuentas.get(a) || porNombre(a, b);
  const fila = d => {
    const nombre = escapeHtml(nombreDe.get(d)), n = `<span class="medios-resumen-n">${cuentas.get(d).toLocaleString()}</span>`;
    // Con dominio real filtra aunque no esté en el catálogo (web: lo acepta);
    // sin él (news.google.com, por nombre), solo se cuenta.
    return !d.startsWith('~')
      ? `<li><button type="button" data-dominio="${escapeHtml(d)}" title="${escapeHtml(t('medioFiltrarTitle', { medio: nombreDe.get(d) }))}"><span>${nombre}</span>${n}</button></li>`
      : `<li><span class="medios-resumen-fuera"><span>${nombre}</span>${n}</span></li>`;
  };
  // Lo enfocado y los grupos abiertos sobreviven al repintado.
  const foco = cuerpo.contains(document.activeElement) ? document.activeElement : null;
  const conBuscador = cuentas.size > RESUMEN_MEDIOS_VISIBLES;
  const q = conBuscador ? normStrict(RESUMEN_MEDIOS.q.trim()) : '';
  const selFoco = foco && (foco.dataset.orden ? `[data-orden="${foco.dataset.orden}"]`
    : 'todos' in foco.dataset ? '[data-todos]'
    : foco.dataset.dominio ? `[data-dominio="${CSS.escape(foco.dataset.dominio)}"]`
    : foco.closest('[data-grupo]') ? `[data-grupo="${CSS.escape(foco.closest('[data-grupo]').dataset.grupo)}"] > summary` : '');
  const abiertos = new Set([...cuerpo.querySelectorAll('.medios-resumen-grupo[open]')].map(g => g.dataset.grupo));

  const o = RESUMEN_MEDIOS.orden;
  const botonOrden = (v, clave) => `<button type="button" data-orden="${v}" aria-pressed="${o === v}">${escapeHtml(t(clave))}</button>`;
  let html = `<div class="medios-resumen-orden" role="group" aria-label="${escapeHtml(t('resOrdenar'))}">`
    + botonOrden('n', 'resOrdenNoticias') + botonOrden('az', 'resOrdenNombre') + botonOrden('grupo', 'resOrdenGrupo') + '</div>';
  const dominios = [...cuentas.keys()].filter(d => !q || normStrict(nombreDe.get(d)).includes(q) || d.includes(q));
  if (!dominios.length) html += `<p class="medios-resumen-vacio">${escapeHtml(t('resSinMedios'))}</p>`;
  else if (o === 'grupo'){
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
    const vistos = RESUMEN_MEDIOS.todos || q ? dominios : dominios.slice(0, RESUMEN_MEDIOS_VISIBLES);
    html += `<ul class="medios-resumen-lista">${vistos.map(fila).join('')}</ul>`;
    if (vistos.length < dominios.length) html += `<button type="button" class="medios-resumen-todos" data-todos>${escapeHtml(t('resVerTodos', { n: dominios.length.toLocaleString() }))}</button>`;
  }
  // El buscador no se repinta: así conserva el foco y el cursor al escribir.
  const contenido = cuerpo.querySelector('.medios-resumen-contenido');
  if (conBuscador && contenido && cuerpo.querySelector('.medios-resumen-buscar')) contenido.innerHTML = html;
  else {
    cuerpo.innerHTML = (conBuscador
      ? `<input type="search" class="medios-resumen-buscar" placeholder="${escapeHtml(t('resBuscar'))}" aria-label="${escapeHtml(t('resBuscar'))}" value="${escapeHtml(RESUMEN_MEDIOS.q)}">`
      : '') + `<div class="medios-resumen-contenido">${html}</div>`;
  }
  // Si lo enfocado ya no está (salió de las 12 primeras), al chip.
  if (foco && !cuerpo.contains(foco)) (selFoco && cuerpo.querySelector(selFoco) || el.firstElementChild).focus({ preventScroll: true });
}

function wireResumenMedios(){
  const el = document.getElementById('medios-resumen');
  if (!el) return;
  // toggle no burbujea: este es el del propio resumen, no el de un grupo.
  el.addEventListener('toggle', () => {
    if (!el.open){ RESUMEN_MEDIOS.todos = false; RESUMEN_MEDIOS.q = ''; }
    renderResumenMedios();
  });
  // Flota sobre las noticias: se cierra con Esc o al pulsar fuera, como un menú.
  const cerrar = () => { el.open = false; };
  document.addEventListener('pointerdown', e => { if (el.open && !el.contains(e.target)) cerrar(); });
  el.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !el.open) return;
    e.preventDefault(); e.stopPropagation(); cerrar();
    el.firstElementChild.focus({ preventScroll: true });
  });
  el.addEventListener('input', e => {
    if (!e.target.matches('.medios-resumen-buscar')) return;
    RESUMEN_MEDIOS.q = e.target.value;
    renderResumenMedios();
  });
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.dominio){
      el.open = false;
      filtrarPorMedio(b.dataset.dominio);
      // El resumen desaparece (hay un medio elegido): el foco, a la barra con web:.
      const input = document.getElementById('buscar');
      (input?.getClientRects().length ? input : document.getElementById('btn-buscar'))?.focus({ preventScroll: true });
      return;
    }
    if (b.dataset.orden) RESUMEN_MEDIOS.orden = b.dataset.orden;
    else if ('todos' in b.dataset){
      RESUMEN_MEDIOS.todos = true;
      renderResumenMedios();
      // El foco pasa a la primera fila nueva que se pueda pulsar; si no hay, al chip.
      const nuevas = [...el.querySelectorAll('.medios-resumen-lista > li')].slice(RESUMEN_MEDIOS_VISIBLES);
      (nuevas.map(li => li.querySelector('button')).find(Boolean) || el.firstElementChild).focus();
      return;
    }
    renderResumenMedios();
  });
}
