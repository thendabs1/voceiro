function renderizar(){
  if (PASE) return;
  const lista = ULT_FILTRADAS;
  const nMostrados = lista.length;
  const nCargados = NOTICIAS.length;

  const txt = t('contador', {
    n: nMostrados.toLocaleString(),
    total: nCargados.toLocaleString()
  });

  $('#contador').textContent = txt;
  renderTotalR2();
  pintarEstadoPrensa();
  const cont = $('#resultados');
  cont.innerHTML = '';
  RENDER_OFFSET = 0;

  if (!lista.length){
    // Con un modo activo y sin búsqueda, se ofrece editarlo o verlo todo.
    const pista = PRESET_ACTIVO && !$('#buscar').value.trim();
    // Con la prensa en camino aún no es «sin resultados»: lo dice el contador.
    if (_estadoPrensa() === 'prensaBuscando'){
      if (SENTINEL_OBSERVER){ SENTINEL_OBSERVER.disconnect(); SENTINEL_OBSERVER = null; }
      actualizarBotonCargarMas();
      return;
    }
    cont.innerHTML = `<div class="vacio">${escapeHtml(t('vacio'))}${pista ? `
      <p class="vacio-pista">${escapeHtml(t('pistaModoSinResultados', { X: PRESET.nombre }))}</p>
      <div class="vacio-acciones">
        <button type="button" data-vacio="editar">${escapeHtml(t('pistaEditarModo'))}</button>
        <button type="button" data-vacio="todo">${escapeHtml(t('pistaVerTodo'))}</button>
      </div>` : ''}</div>`;
    if (SENTINEL_OBSERVER){ SENTINEL_OBSERVER.disconnect(); SENTINEL_OBSERVER = null; }
    actualizarBotonCargarMas();
    return;
  }

  const sentinel = document.createElement('div');
  sentinel.id = 'render-sentinel';
  cont.appendChild(sentinel);

  appendBatch();

  if (SENTINEL_OBSERVER) SENTINEL_OBSERVER.disconnect();
  SENTINEL_OBSERVER = new IntersectionObserver(entries => {
    if (PASE) return;
    if (!entries[0].isIntersecting) return;

    // Si aún quedan items filtrados sin renderizar → siguiente batch
    if (RENDER_OFFSET < ULT_FILTRADAS.length) {
      appendBatch();
      return;
    }

    // Lista agotada → pedir más (R2 días o Turso página) si hay
    const totalDias = (_manifest && _manifest.dias) ? _manifest.dias.length : 0;
    const capas = capasRequeridas(parseQuery(preprocesarInput($('#buscar').value.trim())));
    const puedeR2 = capas.size > 0 && DIAS_ACTUAL < totalDias;
    if (puedeR2) {
      solicitarMas(cargarMas);
    }
  }, { rootMargin: '400px' });
  SENTINEL_OBSERVER.observe(sentinel);

  if (ACCES.focus) requestAnimationFrame(updateFocus);
  actualizarBotonCargarMas();
}


async function compartirNoticia(n){
  if (!PUEDE_COMPARTIR || !n) return;
  try {
    await navigator.share({
      title: n.titular,
      url:   n.enlace,
    });
  } catch (err) {
    // AbortError = el usuario canceló → silencio total
    // Cualquier otro error, lo dejamos en consola y no molestamos
    if (err && err.name !== 'AbortError') {
      console.warn('[share]', err);
    }
  }
}

// Temas que se marcan en la tarjeta: en la vista Temas, todos los que
// casaron (o los del modo del chip); en un modo, los de ese modo. Con un
// chip de tema, solo ese.
function _temasMarcados(n){
  if (!TEMAS_TODOS.length) return [];
  const ctx = ULT_CTX || {};
  let ts;
  if (vistaTemasActiva()){
    ts = ctx.chipTemas ? _temasDe(n).filter(x => x.id === ctx.chipTemas) : _temasDe(n);
  } else if (PRESET_ACTIVO){
    ts = _temasDe(n).filter(x => x.id === PRESET.id);
  } else return [];
  const c = ctx.chipTema;
  return (c && !c.medios) ? ts.filter(x => x.id === c.modo && x.etiqueta === c.etiqueta) : ts;
}
// Etiqueta de la vista Temas: «tema · Modo», +N si casan más.
function _badgeTema(marcados){
  if (!marcados.length) return '';
  const nombreDe = id => (TEMAS_TODOS.find(m => m.id === id) || {}).nombre || '';
  const txt = x => etiquetaVisible(x.etiqueta) + ' · ' + nombreDe(x.id);
  const extra = marcados.length > 1 ? ` +${marcados.length - 1}` : '';
  const title = marcados.map(x => x.etiqueta + ' · ' + nombreDe(x.id)).join('\n');
  return `<span class="badge tema" title="${escapeHtml(title)}"><span class="tema-txt">${escapeHtml(txt(marcados[0]))}</span>${extra}</span>`;
}
// Lo que se resalta en el titular: el texto de la búsqueda y los temas
// marcados (sus términos incluidos). null si no hay nada que resaltar.
function _compiladoMarcas(marcados){
  const incluir = ULT_TEXTO ? [...ULT_TEXTO.incluir] : [];
  for (const m of TEMAS_TODOS){
    const etiquetas = marcados.filter(x => x.id === m.id).map(x => x.etiqueta);
    if (etiquetas.length) incluir.push(...compiladoDeTemas(m.temas, etiquetas).incluir);
  }
  return incluir.length ? { incluir, excluir: [] } : null;
}

function renderItemHtml(n, idx){
  let fechaHtml = '';
  if (n._tipoShow === 'pub'){
    const esFuturo = n._esFuturo;
    fechaHtml = `<span class="badge${esFuturo ? ' futuro' : ''}">· ${fechaTarjetaHtml(n._tsShow)}</span>`;
  } else if (n._tipoShow === 'est'){
    fechaHtml = `<span class="badge estimada" title="${escapeHtml(t('sinFechaReal'))}">≈ ${fechaTarjetaHtml(n._tsShow)}</span>`;
  } else if (!isNaN(n._tsShow)){
    fechaHtml = `<span class="badge recolectado">${escapeHtml(t('recolectado'))} ${fechaTarjetaHtml(n._tsShow)}</span>`;
  } else {
    fechaHtml = `<span class="badge recolectado">${escapeHtml(t('recolectado'))}</span>`;
  }

  const marcados = _temasMarcados(n);
  const enVistaTemas = vistaTemasActiva();
  const marcas = _compiladoMarcas(marcados);
  let tituloHtml;
  if (marcas) tituloHtml = resaltarTitular(n.titular, marcas);
  else        tituloHtml = n._titularEsc;
  if (ACCES.bionic) tituloHtml = bionicize(tituloHtml);

  const key = normalizeUrlForMatch(n.enlace);

  // ── Estado del guardado / lectura ──
  //   enCola  = está en la lista de pendientes (plugin o local)
  //   leida   = marcada como leída (por estar en cola + leída, o por LEIDAS_LOCAL)
  //   vista   = pasó por pantalla sin marcarse como leída
  const enCola = PENDIENTES_URLS.has(key);
  const item   = PENDIENTES_MAP.get(key);
  const enColaLeida = enCola && item && item.read;
  const leida  = enColaLeida || LEIDAS_LOCAL.has(key);
  const vista  = !leida && VISTAS_LOCAL.has(key);

  // ── Botón Guardar ──
  //   - En cola + leída    → "Leída"     (click → marcar como no leída)
  //   - En cola + pendiente → "Pendiente" (click → marcar como leída)
  //   - No en cola          → "Guardar"   (click → añadir a pendientes)
  const estadoGuardar = enColaLeida ? 'leida' : enCola ? 'pendiente' : 'guardar';

  // En la vista Temas el grupo no es «el modo»: va sin color y la marca es el tema.
  const presetBadge = n.grupo
    ? (n._esPreset && !enVistaTemas
        ? `<span class="badge preset">${n._grupoEsc}</span>`
        : `<span class="badge">${n._grupoEsc}</span>`)
    : '';
  const temaBadge = enVistaTemas ? _badgeTema(marcados) : '';

  // Solo los medios del catálogo: los de prensa sin identificar (news.google.com…)
  // no tienen un dominio por el que filtrar.
  const medioHtml = (n.dominio && MEDIOS[n.dominio])
    ? `<button class="medio" type="button" data-dominio="${escapeHtml(n.dominio)}" title="${escapeHtml(t('medioFiltrarTitle', { medio: n.medio || n.dominio }))}">${n._medioEsc}</button>`
    : `<span class="medio">${n._medioEsc}</span>`;
  const prensaBadge = (n._capas && n._capas.size === 1 && n._capas.has('prensa'))
    ? `<span class="badge prensa" title="Encontrado en prensa externa">${ico('globe')} prensa</span>`
    : '';

  // Añadir al modo, bloquear y reportar van en el menú ⋯ (abrirMenuMas).
  const shareBtnHtml = PUEDE_COMPARTIR
    ? `<button class="btn-mini btn-share-item" type="button" data-idx="${idx}" title="${escapeHtml(t('shareTitle'))}" aria-label="${escapeHtml(t('shareTitle'))}">${ico('share-2')}</button>`
    : '';
  // Otras fuentes siempre disponibles, plegadas dentro de la tarjeta.
  let dupsHtml = '';
  if (n._dupHidden && n._dupHidden.length){
    const otros = n._dupHidden.map(o => {
      return `<div class="dup-item">
        <span class="dup-medio">${escapeHtml(o.medio)}</span>
        <a href="${escapeHtml(o.enlace)}" target="_blank" rel="noopener">Abrir</a>
      </div>`;
    }).join('');
    const nLabel = n._dupHidden.length;
    dupsHtml = `<details class="dups-details">
      <summary>${escapeHtml(t('dupsMore', { n: nLabel }))}</summary>
      <div class="dups-list">
        <div style="font-size:.85em;color:var(--muted);margin-bottom:4px;">${escapeHtml(t('dupsTitle'))}</div>
        ${otros}
      </div>
    </details>`;
  }

  return `<article class="noticia${leida ? ' leida' : (vista ? ' vista' : '')}" data-idx="${idx}">
    <div class="cabecera">
      ${medioHtml}
      ${n.tipo ? `<span class="badge tipo">${n._tipoEsc}</span>` : ''}
      ${presetBadge}
      ${temaBadge}
      ${prensaBadge}
      ${fechaHtml}
      <button class="btn-save-text btn-save-item" type="button" data-idx="${idx}" data-estado="${estadoGuardar}" title="${escapeHtml(t(GUARDAR_ESTADOS[estadoGuardar].titulo))}">${guardarHtml(estadoGuardar)}</button>
      <span class="cab-spacer"></span>
      ${shareBtnHtml}
      <button class="btn-mini btn-mas-item" type="button" data-idx="${idx}" title="${escapeHtml(t('masAcciones'))}" aria-label="${escapeHtml(t('masAcciones'))}" aria-haspopup="menu" aria-expanded="false">${ico('ellipsis')}</button>
    </div>
    <a class="titular" href="${n._enlaceEsc}" target="_blank" rel="noopener">${tituloHtml}</a>
    ${dupsHtml}
    <div class="destino-inline" hidden data-idx="${idx}"></div>
  </article>`;
}
function appendBatch(){
  const cont = $('#resultados');
  const sentinel = document.getElementById('render-sentinel');
  if (!sentinel) return;

  const total = ULT_FILTRADAS.length;
  const end = Math.min(RENDER_OFFSET + RENDER_BATCH, total);
  if (RENDER_OFFSET >= end) {
    if (SENTINEL_OBSERVER){ SENTINEL_OBSERVER.disconnect(); SENTINEL_OBSERVER = null; }
    sentinel.remove();
    return;
  }

  let html = '';
  for (let i = RENDER_OFFSET; i < end; i++){
    html += renderItemHtml(ULT_FILTRADAS[i], i);
  }
  sentinel.insertAdjacentHTML('beforebegin', html);
  RENDER_OFFSET = end;
  observarNoticias();

  if (RENDER_OFFSET >= total){
    if (SENTINEL_OBSERVER){ SENTINEL_OBSERVER.disconnect(); SENTINEL_OBSERVER = null; }
    sentinel.remove();
  }
}

// Añade items nuevos al final del DOM sin re-render completo.
// Devuelve true si el append fue limpio, false si hay que re-renderizar.
function _anexarItemsIncremental(items, ctx) {
  if (!items.length || !ctx) return false;

  // Filtrar los nuevos que pasan los filtros actuales. Se trabaja siempre
  // con el objeto que vive en NOTICIAS (hidratado): si el item de Turso era
  // un duplicado por URL o por título, el crudo no tiene titular ni fecha
  // y acabaría como tarjeta vacía.
  const nuevos = [];
  const vistos = new Set();
  for (const n of items) {
    const u = _claveUrl(n.u || '', n.d || '');
    const real = (u && _itemPorUrl.get(u))
              || (n.t && _itemPorTitulo.get(normalize(n.t)))
              || n;
    if (vistos.has(real) || ULT_FILTRADAS.includes(real)) continue;
    vistos.add(real);
    if (_pasaVista(real, ctx) === true) nuevos.push(real);
  }
  if (!nuevos.length) return true;   // nada nuevo, pero no bloqueamos

  const orden = ctx.orden || 'recientes';
  const ahora = ctx.ahora || Date.now();

  // ¿Todos los nuevos van DESPUÉS del último renderizado?
  const ultimo = ULT_FILTRADAS[ULT_FILTRADAS.length - 1];
  if (!ultimo) return false;

  const tsUlt = isNaN(ultimo._tsOrden) ? 0 : _tsOrdenFeed(ultimo, ahora);

  for (const n of nuevos) {
    const ts = isNaN(n._tsOrden) ? 0 : _tsOrdenFeed(n, ahora);
    const vaDespues = orden === 'antiguos' ? (ts >= tsUlt) : (ts <= tsUlt);
    if (!vaDespues) return false;
  }

  // Los nuevos van al final → append limpio. Se ordenan solo ellos: la
  // lista ya pintada NO se reordena, porque las tarjetas guardan su índice
  // (data-idx) y las acciones (leída, guardar, ➕/🚫) lo usan.
  const cmp = comparador(orden);
  nuevos.sort((a, b) => cmp(_paraOrden(a, ctx.consulta.clave), _paraOrden(b, ctx.consulta.clave)));
  const desde = ULT_FILTRADAS.length;
  ULT_FILTRADAS.push(...nuevos);

  // Si aún quedaban tarjetas sin pintar, el scroll infinito las pintará en
  // orden (incluidas estas); pintar desde 'desde' se saltaría las del medio.
  if (RENDER_OFFSET < desde) return true;

  appendBatchDesdeOffset(desde, ULT_FILTRADAS.length);
  return true;
}

// Añade al DOM las tarjetas [desde, hasta) sin tocar las que ya hay.
function appendBatchDesdeOffset(desde, hasta) {
  const cont = $('#resultados');
  const sentinel = document.getElementById('render-sentinel');

  let html = '';
  for (let i = desde; i < hasta; i++) {
    html += renderItemHtml(ULT_FILTRADAS[i], i);
  }

  if (sentinel) {
    sentinel.insertAdjacentHTML('beforebegin', html);
  } else {
    cont.insertAdjacentHTML('beforeend', html);
  }
  RENDER_OFFSET = Math.max(RENDER_OFFSET, hasta);
  observarNoticias();
}

// Scroll infinito y «Cargar más»: solo R2 (ficheros estáticos: gratis y sin
// cuota). El archivo se pagina únicamente con el botón «Buscar más en el
// archivo» (cargarMasDeTurso), nunca solo: así no puede recorrerse entero
// en bucle si sus páginas no añaden nada visible.
async function solicitarMas(pedir){
  if (_cargandoMas) return;
  _cargandoMas = true;
  actualizarBotonCargarMas();
  try { await pedir(); }
  catch(e){ console.warn('[cargar más]', e); }
  finally {
    _cargandoMas = false;
    actualizarBotonCargarMas();
  }
}

async function cargarMas() {
  const raw = $('#buscar').value.trim();
  const parsed = parseQuery(preprocesarInput(raw));
  const capas = capasRequeridas(parsed);
  if (!capas.size || claveCapas(capas) !== DIAS_CAPAS_KEY) return;

  const totalDias = (_manifest && _manifest.dias) ? _manifest.dias.length : 0;
  if (DIAS_ACTUAL >= totalDias) return;

  const clave = DIAS_CAPAS_KEY;
  const desde = DIAS_ACTUAL;
  const hasta = Math.min(DIAS_ACTUAL + DIAS_R2_STEP, totalDias);

  await extenderCapasR2(capas, desde, hasta);
  if (DIAS_CAPAS_KEY !== clave) return;
  DIAS_ACTUAL = hasta;

  aplicarFiltros();
}

// ─── Paginación Turso ───
async function cargarMasDeTurso() {
  if (!ARCHIVO_ACTIVO || !TURSO_HAY_MAS || !TURSO_RAW) return;

  const claveTurso = TURSO_RAW;
  const claveConsulta = ULT_QUERY_KEY;
  const offsetPedido = TURSO_OFFSET;
  const res = await buscarEnWorker(TURSO_RAW, {
    offset: TURSO_OFFSET,
    limit: 50
  });

  // La consulta cambió (o ya se cargó esta página) mientras esperábamos.
  if (TURSO_RAW !== claveTurso || TURSO_OFFSET !== offsetPedido) return;

  if (!res.items || !res.items.length) {
    TURSO_HAY_MAS = false;
    actualizarBotonCargarMas();
    return;
  }

  TURSO_OFFSET  = (res.nextOffset ?? (TURSO_OFFSET + res.items.length));
  TURSO_HAY_MAS = res.nextOffset !== null && res.nextOffset !== undefined;

  // Como en la primera página: también los items ya cargados cuentan para
  // esta consulta, así que se anexan aunque no haya ninguno nuevo.
  const nuevos = _mergearItemsEnNoticias(res.items, 'turso', claveConsulta, offsetPedido);
  if (nuevos > 0) hidratarNoticias();
  if (!_anexarItemsIncremental(res.items, ULT_CTX)) {
    aplicarFiltros();
  } else {
    renderPestanasPreset();
    actualizarFiltrosCount();
    actualizarBotonCargarMas();
  }
}

function actualizarBotonCargarMas() {
  const wrap = document.getElementById('cargar-mas-wrap');
  const btn  = document.getElementById('btn-cargar-mas');
  if (!wrap || !btn) return;

  // 1) R2: extender días si quedan en el manifest
  const raw = $('#buscar').value.trim();
  const parsed = parseQuery(preprocesarInput(raw));
  const capas = capasRequeridas(parsed);
  if (capas.size) {
    const totalDias = (_manifest && _manifest.dias) ? _manifest.dias.length : 0;
    if (DIAS_ACTUAL < totalDias) {
      wrap.style.display = '';
      btn.textContent = _cargandoMas ? 'Cargando…' : `Cargar más · ${DIAS_ACTUAL}/${totalDias} días`;
      btn.dataset.modo = 'r2';
      btn.disabled = _cargandoMas;
      return;
    }
  }

  // 2) Archivo: solo a mano, cuando R2 no da más y la búsqueda tiene más páginas.
  if (ARCHIVO_ACTIVO && TURSO_HAY_MAS) {
    wrap.style.display = '';
    btn.textContent = _cargandoMas ? 'Cargando…' : 'Buscar más en el archivo';
    btn.dataset.modo = 'archivo';
    btn.disabled = _cargandoMas;
    return;
  }

  wrap.style.display = 'none';
}


function wireResultadosDelegation(){
  const cont = $('#resultados');
  // ── Vista por hover ──
  const VISTA_HOVER_MS = 1200;

  cont.addEventListener('mouseover', e => {
    const art = e.target.closest('.noticia');
    if (!art) return;
    if (art.classList.contains('vista') || art.classList.contains('leida')) return;
    if (VISTAS_TIMERS.has(art)) return;

    const i = parseInt(art.dataset.idx, 10);
    const n = ULT_FILTRADAS[i];
    if (!n) return;

    const tmr = setTimeout(() => {
      VISTAS_TIMERS.delete(art);
      if (art.classList.contains('vista') || art.classList.contains('leida')) return;
      marcarVistaLocal(n.enlace);
      art.classList.add('vista');
      persistirVistas();
    }, VISTA_HOVER_MS);
    VISTAS_TIMERS.set(art, tmr);
  });

  cont.addEventListener('mouseout', e => {
    const art = e.target.closest('.noticia');
    if (!art) return;
    // Si el ratón sigue dentro de la tarjeta (movimiento entre hijos), no cancelamos
    if (e.relatedTarget && art.contains(e.relatedTarget)) return;
    const tmr = VISTAS_TIMERS.get(art);
    if (tmr){ clearTimeout(tmr); VISTAS_TIMERS.delete(art); }
  });

  cont.addEventListener('click', e => {
    const vacioBtn = e.target.closest('[data-vacio]');
    if (vacioBtn){
      if (vacioBtn.dataset.vacio === 'editar'){
        abrirAjustes('modos');
        ajEditarModo(PRESETS.activo);
      } else {
        PRESET_ACTIVO = false;
        guardarPresetActivo();
        actualizarBotonPreset();
        aplicarFiltros();
      }
      return;
    }
    const masBtn = e.target.closest('.btn-mas-item');
    if (masBtn){
      e.preventDefault();
      e.stopPropagation();
      abrirMenuMas(masBtn);
      return;
    }
    // Una opción del menú ⋯ se atiende abajo como si fuera de la tarjeta;
    // el menú se cierra en cuanto termina.
    if (e.target.closest('#menu-mas')) queueMicrotask(cerrarMenuMas);

    // Cerrar fila destino si el clic no es en ella ni en ➕/🚫
    if (!e.target.closest('.destino-inline') &&
        !e.target.closest('.btn-add-item') &&
        !e.target.closest('.btn-block-item')){
      cerrarDestinoInline();
    }
    const shareBtn = e.target.closest('.btn-share-item');
    if (shareBtn){
      e.preventDefault();
      e.stopPropagation();
      const i = parseInt(shareBtn.dataset.idx, 10);
      const n = ULT_FILTRADAS[i];
      if (n) compartirNoticia(n);
      return;
    }
    const medioBtn = e.target.closest('button.medio');
    if (medioBtn){
      e.preventDefault();
      filtrarPorMedio(medioBtn.dataset.dominio);
      return;
    }
    // Al clicar un titular: guardar como leída automáticamente
    const link = e.target.closest('a.titular');
    if (link){
      const art = link.closest('.noticia');
      const i = parseInt(art.dataset.idx, 10);
      const n = ULT_FILTRADAS[i];
      if (n){
        marcarLeidaLocal(n.enlace);
        registrarLeido(n);
        art.classList.remove('vista');
        art.classList.add('leida');
        const saveBtnInCard = art.querySelector('.btn-save-item');
        if (saveBtnInCard) pintarBotonGuardar(saveBtnInCard, 'leida');
      }
      return;   // dejamos que abra normalmente
    }

    const saveBtn = e.target.closest('.btn-save-item');
    if (saveBtn){
      e.preventDefault();
      e.stopPropagation();
      const i = parseInt(saveBtn.dataset.idx, 10);
      const n = ULT_FILTRADAS[i];
      if (n) guardarParaLeerDespues(n);
      return;
    }

    // ➕ Añadir al modo activo (o elegir destino si no hay)
    const addBtn = e.target.closest('.btn-add-item');
    if (addBtn){
      e.preventDefault();
      e.stopPropagation();
      const i = parseInt(addBtn.dataset.idx, 10);
      const n = ULT_FILTRADAS[i];
      if (!n) return;

      const dom    = n.dominio;
      const nombre = n.medio || dom;

      if (PRESET_ACTIVO && PRESET){
        setOverride(dom, 'include');
        aplicarFiltros();
        toast(`${t('destinoOkAnadido')} · ${nombre}`, 2000);
        return;
      }
      if (PRESETS.lista.length === 1){
        aplicarOverrideEnModo(PRESETS.lista[0], 'include', dom, nombre);
        return;
      }
      abrirDestinoInline(i, 'include');
      return;
    }

    // 🚫 Bloquear del modo activo (o elegir destino si no hay)
    const blockBtn = e.target.closest('.btn-block-item');
    if (blockBtn){
      e.preventDefault();
      e.stopPropagation();
      const i = parseInt(blockBtn.dataset.idx, 10);
      const n = ULT_FILTRADAS[i];
      if (!n) return;

      const dom    = n.dominio;
      const nombre = n.medio || dom;

      if (PRESET_ACTIVO && PRESET){
        setOverride(dom, 'ignore');
        aplicarFiltros();
        toast(`${t('destinoOkBloqueado')} · ${nombre}`, 2000);
        return;
      }
      abrirDestinoInline(i, 'ignore');
      return;
    }

    // Cómo leerlo: Ajustes › Lector con la regla de ese medio delante.
    const leerBtn = e.target.closest('.btn-leer-item');
    if (leerBtn){
      e.preventDefault();
      e.stopPropagation();
      const n = ULT_FILTRADAS[parseInt(leerBtn.dataset.idx, 10)];
      if (!n) return;
      AJ_LECTOR_DOMINIO = n.dominio;
      if (ajAbierto() && ajRuta() === 'lector') ajPintarLector();
      else abrirAjustes('lector');
      return;
    }

    const repBtn = e.target.closest('.btn-report-item');
    if (repBtn){
      e.preventDefault();
      e.stopPropagation();
      const i = parseInt(repBtn.dataset.idx, 10);
      const n = ULT_FILTRADAS[i];
      if (!n) return;
      abrirReporte({
        medio:   n.medio,
        dominio: n.dominio,
        grupo:   n.grupo,
        tipo:    n.tipo,
        titular: n.titular,
        enlace:  n.enlace,
        fecha:   n.fecha_pub || n.fecha_estimada || n.fecha || '',
        fuente:  n.fuente || ''
      });
    }
  });
}



let VISTAS_OBSERVER = null;
const VISTAS_TIMERS = new WeakMap();

const VISTA_SCROLL_MS = 2500;   // 2,5 s visible antes de marcar

function marcarVista(art, n){
  const tmr = VISTAS_TIMERS.get(art);
  if (tmr){ clearTimeout(tmr); VISTAS_TIMERS.delete(art); }
  if (art.classList.contains('vista') || art.classList.contains('leida')) return;
  marcarVistaLocal(n.enlace);
  art.classList.add('vista');
  persistirVistas();
}

function programarVista(art, n, ms){
  if (art.classList.contains('vista') || art.classList.contains('leida')) return;
  if (VISTAS_TIMERS.has(art)) return;
  const tmr = setTimeout(() => marcarVista(art, n), ms);
  VISTAS_TIMERS.set(art, tmr);
}

function cancelarVista(art){
  const tmr = VISTAS_TIMERS.get(art);
  if (tmr){ clearTimeout(tmr); VISTAS_TIMERS.delete(art); }
}

const VISTAS_SEEN = new WeakSet();



function wireVistasObserver(){
  if (VISTAS_OBSERVER) VISTAS_OBSERVER.disconnect();
  VISTAS_OBSERVER = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const art = entry.target;
      if (art.classList.contains('vista') || art.classList.contains('leida')) return;

      const i = parseInt(art.dataset.idx, 10);
      const n = ULT_FILTRADAS[i];
      if (!n) return;

      if (entry.isIntersecting){
        // La tarjeta ha estado visible al menos una vez → candidata
        VISTAS_SEEN.add(art);
      } else {
        // Solo marcamos si YA había estado visible y sale por ARRIBA
        if (VISTAS_SEEN.has(art) && entry.boundingClientRect.top < 0){
          marcarVistaLocal(n.enlace);
          art.classList.add('vista');
          persistirVistas();
        }
      }
    });
  }, { threshold: 0 });
}

function observarNoticias(){
  if (!VISTAS_OBSERVER) return;
  document.querySelectorAll('.noticia').forEach(el => VISTAS_OBSERVER.observe(el));
}
