/* ═══════════════════════════════════════════════════════════════
   AJUSTES · navegación
   AJ_PILA son las páginas abiertas, de la primera a la visible. Cada una
   tiene su paso en el historial (history.pushState): el botón atrás del
   móvil sube un nivel y al final cierra Ajustes, en vez de salir de la web.
   Rutas: '' (lista de secciones, solo en móvil), 'modos', 'modo' (el de
   MODO_EDITADO), 'lectura', 'feed', 'avanzado', 'ayuda'.
   ═══════════════════════════════════════════════════════════════ */
const AJ_SECCIONES = ['modos', 'lectura', 'feed', 'sync', 'lector', 'avanzado', 'ayuda'];
const AJ_TITULOS = {
  '': 'ajTitulo', modos: 'ajModos', lectura: 'ajLectura',
  feed: 'ajFeed', sync: 'ajSync', lector: 'ajLector', avanzado: 'ajAvanzado', ayuda: 'ajAyuda',
};
let AJ_PILA = [];             // vacía = Ajustes cerrado
let MODO_EDITADO = null;      // id del modo de la página 'modo'
let _ajPendiente = null;      // sección que mostrar al volver atrás en el historial
let _ajSinReglas = new Set(); // modos vacíos al abrir (ver ajActivarAlCerrar)

function ajEsMovil(){ return window.matchMedia('(max-width: 819.98px)').matches; }
function ajAbierto(){ return AJ_PILA.length > 0; }
function ajRuta(){ return AJ_PILA.length ? AJ_PILA[AJ_PILA.length - 1] : null; }
function ajAnchoLimites(){ return [Math.min(700, window.innerWidth), window.innerWidth]; }
function ajFijarAncho(ancho){
  const inner = $('#panel-ajustes .aj-inner');
  const control = $('#aj-resize');
  if (ajEsMovil()){
    inner.style.removeProperty('width');
    return;
  }
  const [min, max] = ajAnchoLimites();
  const valor = Math.round(Math.max(min, Math.min(max, ancho)));
  inner.style.width = valor + 'px';
  control.setAttribute('aria-valuemin', min);
  control.setAttribute('aria-valuemax', max);
  control.setAttribute('aria-valuenow', valor);
}
function ajPrepararAncho(){
  const control = $('#aj-resize');
  let guardado;
  try { guardado = Number(localStorage.getItem('voceiro-aj-ancho')); } catch(e){}
  let ancho = guardado > 0 ? guardado : 900;
  const aplicar = () => ajFijarAncho(ancho);
  aplicar();
  window.addEventListener('resize', aplicar);
  let inicioX, anchoInicial;
  control.addEventListener('pointerdown', e => {
    if (ajEsMovil() || e.button !== 0) return;
    inicioX = e.clientX;
    anchoInicial = $('#panel-ajustes .aj-inner').getBoundingClientRect().width;
    control.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  control.addEventListener('pointermove', e => {
    if (!control.hasPointerCapture(e.pointerId)) return;
    ancho = anchoInicial + inicioX - e.clientX;
    ajFijarAncho(ancho);
  });
  const terminar = e => {
    if (!control.hasPointerCapture(e.pointerId)) return;
    control.releasePointerCapture(e.pointerId);
    ancho = Number(control.getAttribute('aria-valuenow'));
    try { localStorage.setItem('voceiro-aj-ancho', ancho); } catch(e){}
  };
  control.addEventListener('pointerup', terminar);
  control.addEventListener('pointercancel', terminar);
  control.addEventListener('keydown', e => {
    if (ajEsMovil() || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    ancho = Number(control.getAttribute('aria-valuenow')) + (e.key === 'ArrowLeft' ? 1 : -1) * (e.shiftKey ? 80 : 20);
    ajFijarAncho(ancho);
    ancho = Number(control.getAttribute('aria-valuenow'));
    try { localStorage.setItem('voceiro-aj-ancho', ancho); } catch(e){}
  });
}
function modoEnPanel(){
  return (PRESETS && PRESETS.lista.find(p => p.id === MODO_EDITADO)) || null;
}
function ajSeccionGuardada(){
  let r = null;
  try { r = localStorage.getItem(AJ_SECCION_KEY); } catch(e){}
  return AJ_SECCIONES.includes(r) ? r : 'modos';
}

// Abre Ajustes en una ruta, o cambia de sección si ya está abierto. Sin
// ruta: en móvil, la lista de secciones; en escritorio, la última vista.
function abrirAjustes(ruta){
  if (ruta == null) ruta = ajEsMovil() ? '' : ajSeccionGuardada();
  if (ajAbierto()){
    if (ruta === 'modo') ajEmpujar('modo');
    else ajIrSeccion(ruta);
    return;
  }
  abrirPanel('panel-ajustes');
  AJ_PILA = [ruta];
  if (ruta !== 'modo') MODO_EDITADO = null;
  _ajSinReglas = new Set(PRESETS.lista.filter(p => !presetTieneReglas(p)).map(p => p.id));
  history.pushState({ aj: 1 }, '');
  ajPintar();
}

// Un nivel más: una sección desde la lista (móvil) o un modo desde Modos.
function ajEmpujar(ruta){
  ajGuardarTemas();
  AJ_PILA.push(ruta);
  history.pushState({ aj: AJ_PILA.length }, '');
  ajPintar();
}

// Sección elegida en la lista (móvil) o en la barra lateral (escritorio).
function ajIrSeccion(ruta){
  ajGuardarTemas();
  if (ajRuta() === ruta) return;
  if (ajEsMovil()){
    if (ajRuta() === '') ajEmpujar(ruta);
    else { AJ_PILA[AJ_PILA.length - 1] = ruta; ajPintar(); }
    return;
  }
  if (AJ_PILA.length > 1){
    // Dentro de un modo: se vuelve al primer paso del historial y ahí se
    // muestra la sección, para que atrás no lleve a páginas viejas.
    _ajPendiente = ruta;
    history.go(-(AJ_PILA.length - 1));
    return;
  }
  AJ_PILA[0] = ruta;
  ajPintar();
}

// Botón «‹» de la cabecera: de un modo a Modos; de una sección a la lista.
function ajAtras(){
  ajGuardarTemas();
  const padre = ajRuta() === 'modo' ? 'modos' : '';
  if (AJ_PILA.length > 1 && AJ_PILA[AJ_PILA.length - 2] === padre){
    history.back();
    return;
  }
  AJ_PILA[AJ_PILA.length - 1] = padre;   // sin paso previo: se sustituye
  ajPintar();
}

function ajPopstate(e){
  if (!ajAbierto()) return;
  const d = (e.state && e.state.aj) || 0;
  ajGuardarTemas();
  if (d <= 0){ ajCerrarVista(); return; }
  if (d < AJ_PILA.length) AJ_PILA.length = d;
  if (_ajPendiente != null){
    AJ_PILA[AJ_PILA.length - 1] = _ajPendiente;
    _ajPendiente = null;
  }
  ajPintar();
}

function cerrarAjustes(){
  if (!ajAbierto()) return;
  const pasos = AJ_PILA.length;
  ajCerrarVista();
  history.go(-pasos);   // el popstate llega con Ajustes ya cerrado y se ignora
}
function ajCerrarVista(){
  ajGuardarTemas();
  ajVaciarLector();
  AJ_PILA = [];
  _ajPendiente = null;
  cerrarPanel('panel-ajustes');
  ajActivarAlCerrar();
}

// Muestra la página de la ruta visible y la rellena.
function ajPintar(){
  const panel = $('#panel-ajustes');
  if (!panel || !ajAbierto()) return;
  let ruta = ajRuta();
  if (ruta === '' && !ajEsMovil()) ruta = AJ_PILA[AJ_PILA.length - 1] = ajSeccionGuardada();
  if (ruta === 'modo' && !modoEnPanel()) ruta = AJ_PILA[AJ_PILA.length - 1] = 'modos';
  panel.dataset.ruta = ruta;
  const seccion = ruta === 'modo' ? 'modos' : ruta;
  panel.querySelectorAll('.aj-secciones button').forEach(b => {
    if (b.dataset.ir === seccion) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  panel.querySelectorAll('.aj-pagina').forEach(p => { p.hidden = p.dataset.pagina !== ruta; });
  if (ruta !== 'lector') ajVaciarLector();
  if (AJ_SECCIONES.includes(ruta)){
    try { localStorage.setItem(AJ_SECCION_KEY, ruta); } catch(e){}
  }
  const cuerpo = panel.querySelector('.aj-cuerpo');
  if (cuerpo) cuerpo.scrollTop = 0;
  ajRefrescar();
}

// Repinta la página visible con los datos actuales. Se llama tras cualquier
// cambio que venga de fuera (plugin, importar, titulares, idioma…).
function ajRefrescar(){
  if (!ajAbierto()) return;
  const ruta = ajRuta();
  if (ruta === 'modo' && !modoEnPanel()){ ajPintar(); return; }
  const modo = modoEnPanel();
  $('#aj-titulo-pagina').textContent = ruta === 'modo' ? modo.nombre : t(AJ_TITULOS[ruta] || 'ajTitulo');
  $('#aj-atras-lbl').textContent = t(ruta === 'modo' ? 'ajModos' : 'ajTitulo');
  if (ruta === 'modos') renderListaModos();
  else if (ruta === 'modo') pintarModo();
  else if (ruta === 'feed'){ ajPintarVista(); renderListaPortadas(); renderDiasSelector(); }
  else if (ruta === 'sync') ajPintarSync();
  else if (ruta === 'lector') ajPintarLector();
}

// Página Lector: el panel lo pinta el propio lector en #aj-lector-panel; aquí
// solo se le avisa (lo ignora si ya está). Al salir de la página se vacía.
// AJ_LECTOR_DOMINIO: el medio de «Cómo leerlo»; el lector lo pone delante.
let AJ_LECTOR_DOMINIO = '';
function ajPintarLector(){
  actualizarSyncBanner();
  $('#aj-plugin-hint').hidden = USCRIPT_OK;
  $('#aj-lector-instalar').hidden = USCRIPT_OK;
  $('#aj-lector-hint').hidden = USCRIPT_OK;
  if (!USCRIPT_OK){ ajVaciarLector(); return; }
  const dominio = AJ_LECTOR_DOMINIO;
  AJ_LECTOR_DOMINIO = '';
  try {
    document.dispatchEvent(new CustomEvent('voceiro-ajustes-lector',
      { detail: dominio ? { v: PUENTE_V, dominio } : { v: PUENTE_V } }));
  } catch(e){}
}
function ajVaciarLector(){
  const c = document.getElementById('aj-lector-panel');
  if (c) c.replaceChildren();
}

/* ═══════════════════════════════════════════════════════════════
   AJUSTES · modos
   Se edita cualquier modo, no solo el activo, y todo se guarda al momento.
   Si el modo editado es el activo, el feed se reconfigura detrás.
   ═══════════════════════════════════════════════════════════════ */
function resumenModo(p){
  if (!presetTieneReglas(p)) return t('ajModoVacio');
  return t('ajResumenModo', {
    t: compilarTemas(p.palabras || []).length,
    g: (p.grupos || []).length,
    m: Object.keys(p.overrides || {}).length,
  });
}
function renderListaModos(){
  const cont = $('#lista-modos');
  if (!cont) return;
  cont.innerHTML = PRESETS.lista.map(p => {
    const activo = PRESET_ACTIVO && p.id === PRESETS.activo;
    return `<button type="button" class="aj-modo-fila" data-modo-id="${escapeHtml(p.id)}">
      <span class="aj-modo-txt">
        <span class="aj-modo-nombre">${escapeHtml(p.nombre)}</span>
        <span class="aj-modo-resumen">${escapeHtml(resumenModo(p))}</span>
      </span>
      ${activo ? `<span class="aj-activo">${escapeHtml(t('ajModoActivo'))}</span>` : ''}
      ${ico('chevron-right')}
    </button>`;
  }).join('');
}
function ajEditarModo(id){
  MODO_EDITADO = id;
  $('#filtro-medio').value = '';
  $('#filtro-grupo-medio').value = '';
  if (ajRuta() === 'modo') ajPintar();
  else ajEmpujar('modo');
}

function pintarModo(){
  const modo = modoEnPanel();
  if (!modo) return;
  const activo = PRESET_ACTIVO && modo.id === PRESETS.activo;
  const estado = $('#aj-modo-estado');
  estado.textContent = t('ajModoActivo');
  estado.hidden = !activo;
  $('#aj-modo-activar').hidden = activo;
  const pista = $('#aj-modo-pista');
  pista.textContent = t('pistaModoVacio');
  pista.hidden = presetTieneReglas(modo);
  // No se pisa lo que se está escribiendo.
  const ta = $('#aj-temas');
  if (document.activeElement !== ta || ta.dataset.modoId !== modo.id){
    ta.value = (modo.palabras || []).join('\n');
    ta.dataset.modoId = modo.id;
  }
  renderListaGrupos(modo);
  renderOverridesModo(modo);
  renderListaMedios();
  ajContadores(modo);
}
function renderOverridesModo(modo){
  const ovList = $('#ov-list');
  if (!ovList) return;
  ovList.innerHTML = Object.entries(modo.overrides || {}).map(([d, v]) =>
    `<span class="ov-item ${v}">
      <span>${escapeHtml(d)}</span>
      <button data-dom="${escapeHtml(d)}" type="button" title="${escapeHtml(t('deletePending'))}" aria-label="${escapeHtml(t('deletePending'))}">${ico('x')}</button>
    </span>`
  ).join('');
}
function ajContadores(modo){
  $('#aj-temas-n').textContent = '· ' + compilarTemas(parseLista($('#aj-temas').value)).length;
  const ov = Object.values(modo.overrides || {});
  $('#aj-medios-n').textContent = '· ' + t('ajMediosN', {
    f: ov.filter(v => v === 'first').length,
    b: ov.filter(v => v === 'ignore').length,
  });
  $('#aj-grupos-n').textContent = '· ' + (modo.grupos || []).length;
}

// Tras guardar un cambio de un modo. Si es el activo, se recompila; el feed
// se vuelve a filtrar con espera, para agrupar clics y teclas seguidos.
const _ajFiltrar = debounce(() => aplicarFiltros(), 400);
function ajModoCambiado(modo){
  if (modo.id === PRESETS.activo){
    PRESET = modo;
    recompilarPreset();
    if (PRESET_ACTIVO && !presetTieneReglas()){
      PRESET_ACTIVO = false;
      guardarPresetActivo();
    }
  }
  if (VISTA_TEMAS && !TEMAS_TODOS.length) ponerVistaTemas(false);
  actualizarBotonPreset();
  _ajFiltrar();
  if (ajRuta() === 'modo'){
    ajContadores(modo);
    $('#aj-modo-pista').hidden = presetTieneReglas(modo);
  }
}

// Temas: se guardan al dejar de escribir y al salir de la caja. La caja
// lleva el id de su modo por si se cambia de modo con algo sin guardar.
let _ajTemasTimer = 0;
function ajGuardarTemas(){
  clearTimeout(_ajTemasTimer);
  _ajTemasTimer = 0;
  const ta = $('#aj-temas');
  if (!ta || !ta.dataset.modoId || !PRESETS) return;
  const modo = PRESETS.lista.find(p => p.id === ta.dataset.modoId);
  if (!modo) return;
  const nuevas = parseLista(ta.value);
  const antes = modo.palabras || [];
  if (nuevas.length === antes.length && nuevas.every((x, i) => x === antes[i])) return;
  modo.palabras = nuevas;
  guardarPresets();
  ajModoCambiado(modo);
}

// Lo que antes hacía «Guardar»: si el modo editado ha pasado de vacío a
// tener reglas y no hay modo activo ni vista Temas, se activa al cerrar.
function ajActivarAlCerrar(){
  const modo = modoEnPanel();
  if (!modo || PRESET_ACTIVO || vistaTemasActiva()) return;
  if (!_ajSinReglas.has(modo.id) || !presetTieneReglas(modo)) return;
  PRESETS.activo = modo.id;
  PRESET = modo;
  PRESET_ACTIVO = true;
  guardarPresets();
  guardarPresetActivo();
  recompilarPreset();
  actualizarBotonPreset();
  aplicarFiltros();
  toast(t('presetGuardadoActivado', { X: modo.nombre }), 2600);
}

// Copia para «Deshacer» (vaciar o borrar un modo).
function ajCapturar(){
  return { presets: structuredClone(PRESETS), activo: PRESET_ACTIVO };
}
function ajRestaurar(copia){
  PRESETS = copia.presets;
  PRESET = PRESETS.lista.find(p => p.id === PRESETS.activo) || PRESETS.lista[0];
  PRESETS.activo = PRESET.id;
  PRESET_ACTIVO = copia.activo && presetTieneReglas();
  guardarPresets();
  guardarPresetActivo();
  recompilarPreset();
  actualizarBotonPreset();
  aplicarFiltros();
  ajRefrescar();
}

function activarModo(id){
  const target = PRESETS.lista.find(p => p.id === id);
  if (!target) return;
  if (!presetTieneReglas(target)){
    toast(t('presetVacio'), 3200);
    return;
  }
  PRESETS.activo = id;
  PRESET = target;
  PRESET_ACTIVO = true;
  guardarPresets();
  guardarPresetActivo();
  recompilarPreset();
  actualizarBotonPreset();
  ajRefrescar();
  aplicarFiltros();
}

function renombrarModo(id){
  const p = PRESETS.lista.find(x => x.id === id);
  if (!p) return;
  const nuevo = prompt(t('cfgModoRenombrarPrompt', { X: p.nombre }), p.nombre);
  if (nuevo == null) return;
  const limpio = nuevo.trim();
  if (!limpio) return;
  p.nombre = limpio;
  guardarPresets();
  actualizarBotonPreset();
  ajRefrescar();
}

function duplicarModo(id){
  const p = PRESETS.lista.find(x => x.id === id);
  if (!p) return null;
  ajGuardarTemas();
  const copia = structuredClone(p);
  copia.id = 'm-' + Date.now().toString(36);
  copia.nombre = p.nombre + ' ' + t('cfgModoDuplicarSufijo');
  PRESETS.lista.push(copia);
  guardarPresets();
  ajRefrescar();
  return copia;
}

function vaciarModo(id){
  const modo = PRESETS.lista.find(p => p.id === id);
  if (!modo) return;
  if (!confirm(t('ajModoConfirmVaciar', { X: modo.nombre }))) return;
  const copia = ajCapturar();
  modo.grupos = [];
  modo.palabras = [];
  modo.overrides = {};
  const ta = $('#aj-temas');
  if (ta && ta.dataset.modoId === id) ta.value = '';
  guardarPresets();
  ajModoCambiado(modo);
  ajRefrescar();
  toast(t('ajModoVaciado', { X: modo.nombre }), 6000,
        { texto: t('ajDeshacer'), fn: () => ajRestaurar(copia) });
}

function borrarModo(id){
  if (PRESETS.lista.length <= 1){
    toast(t('cfgModoUnicoNoBorrar'), 2400);
    return;
  }
  const p = PRESETS.lista.find(x => x.id === id);
  if (!p) return;
  if (!confirm(t('cfgModoConfirmBorrar', { X: p.nombre }))) return;
  const copia = ajCapturar();

  PRESETS.lista = PRESETS.lista.filter(x => x.id !== id);
  if (PRESETS.activo === id){
    PRESETS.activo = PRESETS.lista[0].id;
    PRESET = PRESETS.lista[0];
    PRESET_ACTIVO = PRESET_ACTIVO && presetTieneReglas();
    guardarPresetActivo();
    recompilarPreset();
  }
  guardarPresets();
  actualizarBotonPreset();
  aplicarFiltros();
  if (ajRuta() === 'modo' && MODO_EDITADO === id) ajAtras();
  else ajRefrescar();
  toast(t('cfgModoBorrado', { X: p.nombre }), 6000,
        { texto: t('ajDeshacer'), fn: () => ajRestaurar(copia) });
}

function normalizarDominioInput(s){
  return String(s || '').trim().toLowerCase()
    .replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
}



function aplicarListaOverrides(){
  const modo = modoEnPanel();
  if (!modo) return;
  const txt = $('#ov-pegar').value || '';
  const lineas = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let ok = 0, ko = 0;
  lineas.forEach(l => {
    const m = l.match(/^([+-]?)\s*(.+)$/);
    if (!m){ ko++; return; }
    const signo = m[1] || '-';
    const d = normalizarDominioInput(m[2]);
    if (!d || !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(d)){ ko++; return; }
    setOverride(d, signo === '+' ? 'first' : 'ignore', modo);
    ok++;
  });
  $('#ov-pegar').value = '';
  ajModoCambiado(modo);
  pintarModo();
  toast(`OK: ${ok} · KO: ${ko}`, 2200);
}
