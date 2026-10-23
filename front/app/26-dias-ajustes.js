/* ── Fase 2 · selector de días ── */
/* ── Fase 2 · selector de días ──
   Los días solo se usan con un modo activo o filtrando por medio: entonces
   se descargan N días de los ficheros de sus grupos y medios. Lo que pesa
   es días × tamaño del modo, y el manifest dice cuántos titulares y kB hay
   de media al día por grupo y medio, así que se puede estimar antes de
   descargar. */
function estimarCarga(modo, dias){
  const lista = (_manifest && _manifest.dias) || [];
  if (!modo || !lista.length) return null;
  const grupos = modo.grupos || [];
  const dominios = Object.entries(modo.overrides || {})
    .filter(([, v]) => v === 'first').map(([d]) => normDomain(d));
  let n = 0, kb = 0;
  const nDias = Math.min(dias, DIAS_MEMORIA_MAX_SCOPE, lista.length);
  const medias = _manifest.medias;
  if (medias){
    for (const g of grupos){
      const f = _buscarGrupoEnDia(medias.grupos, g);
      if (f){ n += f[0] * nDias; kb += f[1] * nDias; }
    }
    for (const d of dominios){
      const f = medias.dominios && medias.dominios[d];
      if (f){ n += f[0] * nDias; kb += f[1] * nDias; }
    }
    return { n, kb };
  }
  for (const dia of lista.slice(0, nDias)){
    for (const g of grupos){
      const f = _buscarGrupoEnDia(dia.grupos, g);
      if (f){ n += f.n || 0; kb += f.kb || 0; }
    }
    for (const d of dominios){
      const f = dia.dominios && dia.dominios[d];
      if (f){ n += f.n || 0; kb += f.kb || 0; }
    }
  }
  return { n, kb };
}
function textoCarga(c){
  const lang = ACCES.lang;
  return {
    n:  Math.round(c.n).toLocaleString(lang),
    mb: (c.kb / 1024).toLocaleString(lang, { maximumFractionDigits: 1 }),
  };
}
function modoParaDias(){
  return (PRESET_ACTIVO && presetTieneReglas()) ? PRESET : null;
}

function renderDiasSelector() {
  const grupo = document.querySelector('.opt-group[data-dias]');
  if (!grupo) return;
  grupo.querySelectorAll('button[data-val]').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.val, 10) === DIAS_MEMORIA);
  });
  const est = $('#dias-estimacion');
  if (!est) return;
  const modo = modoParaDias();
  if (!modo){ est.textContent = t('cfgDiasSinModo'); return; }
  const c = estimarCarga(modo, DIAS_MEMORIA);
  est.textContent = c ? t('cfgDiasEstimacion', { X: modo.nombre, ...textoCarga(c) }) : '';
}

function setDiasMemoria(n, { persistir = true } = {}) {
  if (!DIAS_MEMORIA_VALIDOS.includes(n)) return;
  DIAS_MEMORIA = n;
  if (persistir){
    try { localStorage.setItem(DIAS_MEMORIA_KEY, String(n)); } catch(e){}
  }
  renderDiasSelector();
}

function wireDiasSelector() {
  const grupo = document.querySelector('.opt-group[data-dias]');
  if (!grupo) return;

  const confirmar = $('#dias-confirmar');
  let pendiente = 0;
  const cerrarConfirmar = () => { confirmar.hidden = true; pendiente = 0; };

  grupo.addEventListener('click', e => {
    const b = e.target.closest('button[data-val]');
    if (!b) return;
    const v = parseInt(b.dataset.val, 10);
    if (v === DIAS_MEMORIA){ cerrarConfirmar(); return; }

    // Descarga grande: se explica y se pide confirmación antes.
    const modo = modoParaDias();
    const c = modo && v > DIAS_MEMORIA ? estimarCarga(modo, v) : null;
    const confirmarUnDia = v === 1;
    const confirmarCargaGrande = c && c.n > DIAS_UMBRAL_TITULARES;
    if (confirmarUnDia || confirmarCargaGrande){
      pendiente = v;
      const avisos = [];
      if (confirmarCargaGrande){
        avisos.push(t('cfgDiasConfirmar', { d: v, X: modo.nombre, ...textoCarga(c) }));
      }
      if (confirmarUnDia) avisos.push(t('cfgDiasUnoConfirmar'));
      $('#dias-confirmar-txt').textContent = avisos.join(' ');
      confirmar.hidden = false;
      return;
    }
    cerrarConfirmar();
    aplicarDiasMemoria(v);
  });
  $('#dias-cancelar').addEventListener('click', cerrarConfirmar);
  $('#dias-cargar').addEventListener('click', () => {
    const v = pendiente;
    cerrarConfirmar();
    if (v) aplicarDiasMemoria(v);
  });

  renderDiasSelector();
}

function aplicarDiasMemoria(v){
  setDiasMemoria(v);

  // Reset total del estado de capas para que se vuelvan a pedir con el
  // nuevo DIAS_MEMORIA
  LAYERS.clear();
  _itemsCargadosDeCapas = 0;
  DIAS_ACTUAL = 0;
  ULT_QUERY_KEY = '';       // fuerza el reset en el siguiente aplicarFiltros
  _hidratadasHasta = 0;
  _dupsHechosHasta = 0;

  aplicarFiltros();
}

function wireAjustes(){
  const panel = $('#panel-ajustes');
  if (!panel) return;
  ajPrepararAncho();
  window.addEventListener('popstate', ajPopstate);
  // Si se recargó con Ajustes abierto, el paso del historial queda huérfano.
  if (history.state && history.state.aj) history.replaceState(null, '');

  panel.querySelectorAll('.aj-secciones button[data-ir]').forEach(b =>
    b.addEventListener('click', () => ajIrSeccion(b.dataset.ir)));
  $('#aj-atras').addEventListener('click', ajAtras);

  // ── Modos ──
  $('#lista-modos').addEventListener('click', e => {
    const fila = e.target.closest('[data-modo-id]');
    if (fila) ajEditarModo(fila.dataset.modoId);
  });
  $('#btn-nuevo-modo').addEventListener('click', () => {
    const nuevo = crearModoYDevolver();
    if (nuevo) ajEditarModo(nuevo.id);
  });
  $('#aj-modo-activar').addEventListener('click', () => activarModo(MODO_EDITADO));
  $('#aj-modo-renombrar').addEventListener('click', () => renombrarModo(MODO_EDITADO));
  $('#aj-modo-duplicar').addEventListener('click', () => {
    const copia = duplicarModo(MODO_EDITADO);
    if (copia) ajEditarModo(copia.id);
  });
  $('#aj-modo-vaciar').addEventListener('click', () => vaciarModo(MODO_EDITADO));
  $('#aj-modo-borrar').addEventListener('click', () => borrarModo(MODO_EDITADO));

  const ta = $('#aj-temas');
  ta.addEventListener('input', () => {
    $('#aj-temas-n').textContent = '· ' + compilarTemas(parseLista(ta.value)).length;
    clearTimeout(_ajTemasTimer);
    _ajTemasTimer = setTimeout(ajGuardarTemas, 600);
  });
  ta.addEventListener('blur', ajGuardarTemas);

  $('#lista-grupos').addEventListener('change', () => {
    const modo = modoEnPanel();
    if (!modo) return;
    modo.grupos = [...document.querySelectorAll('#lista-grupos input[data-grupo]:checked')]
      .map(c => c.dataset.grupo);
    guardarPresets();
    ajModoCambiado(modo);
  });
  $('#ov-list').addEventListener('click', e => {
    const b = e.target.closest('button[data-dom]');
    const modo = modoEnPanel();
    if (!b || !modo) return;
    setOverride(b.dataset.dom, '', modo);
    ajModoCambiado(modo);
    pintarModo();
  });

  // ── Feed: mismo estado que el panel Filtros ──
  document.querySelectorAll('input[name="aj-hide"]').forEach(r =>
    r.addEventListener('change', () => { if (r.checked) ponerHideMode(r.value); }));

  // ── Ayuda ──
  $('#btn-report-generic').addEventListener('click', () => {
    cerrarAjustes();
    abrirReporte(null);
  });
}
