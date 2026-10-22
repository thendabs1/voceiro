/* ═══════════════════════════════════════════════════════════════
   INICIALIZACIÓN
   ═══════════════════════════════════════════════════════════════ */
async function init(){
  // ── 0) UI inmediata: tema, textos y listeners ANTES de tocar la red ──
  aplicarAcces();

  PRESETS = cargarPresets();
  _huellasModos = huellasDeModos();
  cargarSync();
  const _activeId = localStorage.getItem(PRESET_ID_KEY) || PRESETS.activo;
  const _active = PRESETS.lista.find(p => p.id === _activeId) || PRESETS.lista[0];
  PRESETS.activo = _active.id;
  PRESET = _active;

  recompilarPreset();
  PRESET_ACTIVO  = cargarPresetActivo() && presetTieneReglas();
  VISTA_TEMAS    = !PRESET_ACTIVO && cargarVistaTemas();
  if (VISTA_TEMAS && !TEMAS_TODOS.length) ponerVistaTemas(false);
  HIDE_MODE      = cargarHideMode();
  RECORDAR_FILTROS = cargarRecordarFiltros();
    // Preferencias de prensa externa
  cargarPrensaDeLocalStorage();
  rebuildPendientes();

  setSitesFromArray(cargarSitesCache());

  // Textos + listeners: ya con esto la UI está viva y clicable
  aplicarTextos();
  wireBackToTop();
  wireCabecera();
  wireStaticEvents();
  wireAjustes();
  wireSync();
  wireVistasObserver();

  initUserScriptBridge();
  leerEnlaceSync();
  if (SYNC_CODIGO) sincronizarAhora();

  // ── 1.5) Restaurar búsqueda ANTES de tocar datos ──
  if (RECORDAR_FILTROS){
    try {
      const savedBuscar = localStorage.getItem('voceiro-buscar');
      if (savedBuscar){
        const input = $('#buscar');
        input.value = savedBuscar;
        $('.filtros-wrap').classList.add('busqueda-abierta');
        $('#btn-buscar').setAttribute('aria-expanded', 'true');
        const clearBtn = $('#buscar-clear');
        if (clearBtn) clearBtn.hidden = !savedBuscar;
      }
    } catch(e){}
  }

  // ── 2) Carga inicial (await) ──
  try {
    await cargarBase();
  } catch(err){
    $('#resultados').innerHTML =
      '<div class="vacio">Error cargando datos: ' + escapeHtml(err.message) + '</div>';
    return;
  }

  // ── 3) Tipos ──
  const selT = $('#tipo');
  while (selT.options.length > 1) selT.remove(1);
  [...new Set(MEDIOS_UNICOS.map(m => m.tipo).filter(Boolean))].sort()
    .forEach(t2 => selT.add(new Option(t2, t2)));
  if (selT.options[0]) selT.options[0].text = t('fltTipo');

  reconstruirSelectores();
  aplicarFiltros();

  // ── 4) A partir de aquí aplicarFiltros() ya puede persistir ──
  APP_LISTA = true;

  // ── DIAG TEMPORAL ──
  window.__diag = {
    get NOTICIAS()     { return NOTICIAS; },
    get ULT_FILTRADAS(){ return ULT_FILTRADAS; },
    get MEDIOS()       { return MEDIOS; },
    get LAYERS()       { return LAYERS; },
    get PRESET()       { return PRESET; },
    get PRESET_ACTIVO(){ return PRESET_ACTIVO; },
    get SET_GRUPOS()   { return SET_GRUPOS; },
    get TEMAS_TODOS()  { return TEMAS_TODOS; },
    get _manifest()    { return _manifest; },
  };

  // ── 5) Histórico en background ──
  }


init().catch(err => {
  $('#resultados').innerHTML =
    '<div class="vacio">Error cargando datos: ' + escapeHtml(err.message) + '</div>';
});
