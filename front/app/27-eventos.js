/* ═══════════════════════════════════════════════════════════════
   EVENTOS
   ═══════════════════════════════════════════════════════════════ */
const aplicarFiltrosDebounced = debounce(aplicarFiltros, 350);

function wireStaticEvents(){
  const btnP = $('#btn-preset');
  actualizarBotonPreset();
  wireDiasSelector();
  const hTitle = document.getElementById('btn-recargar');
  if (hTitle){
    hTitle.addEventListener('click', () => {
      if ('scrollRestoration' in history){
        history.scrollRestoration = 'manual';
      }
      location.reload();
    });
  }

  btnP.addEventListener('click', e => {
    e.stopPropagation();
    const menu = $('#preset-menu');
    if (!menu) return;
    if (menu.style.display !== 'none'){
      cerrarPresetMenu();
    } else {
      abrirPresetMenu();
    }
  });
  document.querySelectorAll('input[name="vs-hide"]').forEach(r => {
    r.addEventListener('change', () => { if (r.checked) ponerHideMode(r.value); });
  });

  $('#btn-lectura').addEventListener('click', () =>
    ponerHideMode(HIDE_MODE === 'off' ? hideModeUltimo() : 'off'));
    // ── Toggle "Recordar filtros" ──
  const chkRec = $('#cfg-recordar-filtros');
  if (chkRec){
    chkRec.checked = RECORDAR_FILTROS;
    chkRec.addEventListener('change', () => {
      RECORDAR_FILTROS = chkRec.checked;
      guardarRecordarFiltros();
    });
  }
  // ── Toggle "Consultar el tiempo" ──
  const chkTiempo = $('#cfg-tiempo');
  if (chkTiempo){
    chkTiempo.checked = TIEMPO_ACTIVO;
    chkTiempo.addEventListener('change', () => {
      TIEMPO_ACTIVO = chkTiempo.checked;
      try { localStorage.setItem(TIEMPO_ACTIVO_KEY, TIEMPO_ACTIVO ? 'true' : 'false'); } catch(e){}
      TIEMPO.valor = null;   // la tarjeta se vuelve a resolver con el ajuste nuevo
      AVISOS.valor = undefined;   // y el panel de avisos se repinta
      aplicarFiltros();
      pintarBotonTiempo();
      refrescarAvisos();
    });
  }
  // ── Toggle "Avisos en el sol" ──
  const chkAvisosCab = $('#cfg-avisos-cab');
  if (chkAvisosCab){
    chkAvisosCab.checked = AVISOS_CABECERA;
    chkAvisosCab.addEventListener('change', () => {
      AVISOS_CABECERA = chkAvisosCab.checked;
      try { localStorage.setItem(AVISOS_CABECERA_KEY, AVISOS_CABECERA ? 'true' : 'false'); } catch(e){}
      pintarBotonTiempo();
      refrescarAvisos();
    });
  }
  // Toggle de fecha completa en las tarjetas.
  const chkFechaLarga = $('#cfg-fecha-larga');
  if (chkFechaLarga){
    chkFechaLarga.checked = !!ACCES.fechaLarga;
    chkFechaLarga.addEventListener('change', () => {
      ACCES.fechaLarga = chkFechaLarga.checked;
      guardarAcces();
      aplicarAcces();
    });
  }
  wireTiempo();
  wireEstadisticas();
  wireCalendario();
  wireAvisos();
  wirePortadas();
  // ── Chips de modo y de tema ──
  // Elegir un modo quita el chip de tema; pulsar el tema elegido lo quita.
  const chipsTemas = $('#temas-chips');
  if (chipsTemas){
    chipsTemas.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      const d = b.dataset;
      if (d.chip !== undefined){
        CHIP_TEMAS = d.chip || null;
        CHIP_TEMA = null;
      } else {
        const nuevo = d.medios ? { modo: d.modo, medios: true }
                    : d.tema   ? { modo: d.modo, etiqueta: d.tema }
                    : null;
        const igual = nuevo && CHIP_TEMA && CHIP_TEMA.modo === nuevo.modo
          && !!CHIP_TEMA.medios === !!nuevo.medios && CHIP_TEMA.etiqueta === nuevo.etiqueta;
        CHIP_TEMA = igual ? null : nuevo;
      }
      aplicarFiltros();
    });
  }
  // ── Pestañas Modo / Todo ──
  const pestanas = $('#preset-pestanas');
  if (pestanas){
    pestanas.addEventListener('click', e => {
      const b = e.target.closest('button[data-pestana]');
      if (!b) return;
      PESTANA_BUSQUEDA = b.dataset.pestana;
      aplicarFiltros();
    });
  }
  // ── Checkbox del panel de filtros ──
  const chkPrensaPanel = $('#prensa-panel-toggle');
  if (chkPrensaPanel){
    chkPrensaPanel.addEventListener('change', () => {
      setPrensaActiva(chkPrensaPanel.checked);
      PRENSA_FALLO = null;     // volver a encenderla reintenta lo que falló
      aplicarFiltros();
    });
  }

  // ── Selects de idioma y país ──
  const selPrensaLang = $('#prensa-lang');
  if (selPrensaLang){
    selPrensaLang.addEventListener('change', () => {
      setPrensaLang(selPrensaLang.value);
      aplicarFiltros();
    });
  }
  const selPrensaPais = $('#prensa-region');
  if (selPrensaPais){
    selPrensaPais.addEventListener('change', () => {
      setPrensaPais(selPrensaPais.value);
      aplicarFiltros();
    });
  }

  // ── Botón reset ──
  const btnResetPrensa = $('#prensa-reset');
  if (btnResetPrensa){
    btnResetPrensa.addEventListener('click', resetPrensa);
  }

  // ── Poblar los selects la primera vez ──
  pintarSelectsPrensa();
  setPrensaActiva(PRENSA_ACTIVA, { persistir: false });
  // ── Botones que abren paneles ──
  // ── Botón "Cargar más" (paginación R2) ──
  const btnCargarMas = document.getElementById('btn-cargar-mas');
  if (btnCargarMas) btnCargarMas.addEventListener('click', () => solicitarMas(cargarMas));

  $('#btn-pendientes').addEventListener('click', abrirPendientes);
  $('#btn-acces').addEventListener('click', () => abrirAjustes('lectura'));
  $('#btn-config').addEventListener('click', () => abrirAjustes());


  document.querySelectorAll('.panel-close').forEach(b => {
    b.addEventListener('click', () => cerrarPanel(b.dataset.close));
  });
  document.querySelectorAll('.panel').forEach(p => {
    p.addEventListener('click', e => {
      if (e.target === p) cerrarPanel(p.id);
    });
  });

  document.addEventListener('keydown', e => {
      if (e.key === 'Escape'){
        if (document.getElementById('cal-evento-dialogo').open) return;
        cerrarPresetMenu();
        if ($('#filtros-panel').matches(':modal')) $('#filtros-panel').close();
        cerrarMenuMas();
        const abierto = document.querySelector('.panel.open');
        if (abierto){ cerrarPanel(abierto.id); return; }
        if (ESTADISTICAS.abierto){ cerrarEstadisticas(); return; }
        if (CALENDARIO.asistente){ CALENDARIO.asistente = null; pintarCalendario(); return; }
        if (CALENDARIO.abierto){ salirCalendario(); return; }
      }
    const tg = e.target;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT')) return;
    if (e.altKey && e.key.toLowerCase() === 'a'){ e.preventDefault(); abrirAjustes('lectura'); }
    if (e.altKey && e.key.toLowerCase() === 'c'){ e.preventDefault(); abrirAjustes(); }
    if (e.altKey && e.key.toLowerCase() === 'p'){ e.preventDefault(); abrirPendientes(); }
    if (e.altKey && e.key.toLowerCase() === 'm'){
      e.preventDefault();
      if (!PRESET_ACTIVO && !presetTieneReglas()){
        toast(t('presetVacio'), 3200);
        return;
      }
      PRESET_ACTIVO = !PRESET_ACTIVO;
      guardarPresetActivo();
      actualizarBotonPreset();
      aplicarFiltros();
    }
  });

  $('#lang-select').addEventListener('change', e => {
    const v = e.target.value;
    if (!I18N[v]) return;
    ACCES.lang = v;
    guardarAcces();
    aplicarTextos();
    reconstruirSelectores();
    construirIndicesBusqueda();
    ajRefrescar();
    renderizar();
  });

  $('#btn-export').addEventListener('click', exportarConfig);
  $('#btn-import').addEventListener('click', () => $('#file-import').click());
  $('#file-import').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) importarConfig(f);
    e.target.value = '';
  });

  $('#pend-refresh').addEventListener('click', abrirPendientes);

  $('#rep-copy').addEventListener('click', copiarReporte);
  $('#rep-mail').addEventListener('click', reportarViaEmail);
  $('#rep-github').addEventListener('click', reportarViaGithub);

  $('#acces-reset').addEventListener('click', () => {
    const lang = ACCES.lang;
    ACCES = { ...ACCES_DEF, lang, actualizado: ACCES.actualizado };
    guardarAcces(); aplicarAcces(); renderizar();
  });

  document.querySelectorAll('.opt-group[data-grupo]').forEach(g => {
    const clave = g.dataset.grupo;
    if (clave !== 'tema' && clave !== 'fuente' && clave !== 'extra') return;
    g.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      const v = b.dataset.val;
      if (clave === 'tema' && v === 'custom' && !limpiarColores(ACCES.colores)) ACCES.colores = coloresDelTemaActual();
      if (clave === 'tema' || clave === 'fuente') ACCES[clave] = v;
      if (clave === 'extra') ACCES[v] = !ACCES[v];
      guardarAcces(); aplicarAcces();
      if (clave === 'extra' && (v === 'focus' || v === 'bionic')) renderizar();
    });
  });
  // Tema personalizado: se ve al momento al mover el color; se guarda (y
  // viaja al lector y a otros dispositivos) al soltarlo.
  document.querySelectorAll('#ac-colores input[type="color"]').forEach(inp => {
    inp.addEventListener('input', () => {
      const antes = limpiarColores(ACCES.colores) || coloresDelTemaActual();
      ACCES.colores = limpiarColores({ ...antes, [inp.dataset.color]: inp.value });
      aplicarAcces();
    });
    inp.addEventListener('change', () => guardarAcces());
  });

  $('#fs-menos').addEventListener('click', () => ajustarFs(-1));
  $('#fs-mas').addEventListener('click', () => ajustarFs(+1));
  $('#w-menos').addEventListener('click', () => ajustarWidth(-1));
  $('#w-mas').addEventListener('click', () => ajustarWidth(+1));

  const filtrarMediosDebounced = debounce(filtrarMedios, 120);
  $('#filtro-medio').addEventListener('input', filtrarMediosDebounced);
  $('#filtro-grupo-medio').addEventListener('change', filtrarMedios);
  $('#filtro-estado-medio').addEventListener('change', filtrarMedios);

  $('#buscar').addEventListener('input', () => {
    aplicarFiltrosDebounced();
  });
  // Cada select escribe su token en #buscar.
  // #buscar es la fuente única; aplicarFiltros lee de ahí.
  const selG = $('#grupo');
  if (selG) selG.addEventListener('change', () => writeFilterToInput('grupo', selG.value));

  const selT = $('#tipo');
  if (selT) selT.addEventListener('change', () => writeFilterToInput('tipo', selT.value));

  const selO = $('#orden');
  if (selO) selO.addEventListener('change', () => {
    // "recientes" es el default → no escribimos token
    const v = selO.value === 'recientes' ? null : selO.value;
    writeFilterToInput('order', v);
  });

  const selR = $('#rango');
  if (selR) selR.addEventListener('change', () => {
    // «24 h»/«48 h» → desde:24h / desde:48h: ventana móvil, la misma para la
    // lista, el archivo y la prensa. "Todo" quita el desde.
    if (selR.value === '1')      writeFilterToInput('desde', '24h');
    else if (selR.value === '2') writeFilterToInput('desde', '48h');
    else                         writeFilterToInput('desde', null);
  });
    // Inputs de fecha — se enganchan una sola vez al arrancar.
  // Si estuvieran en syncPanelFromParsed se acumularían (esa función
  // se llama en cada aplicarFiltros).
  const fD = $('#fecha-desde');
  if (fD) fD.addEventListener('change', () => writeFilterToInput('desde', fD.value));

  const fH = $('#fecha-hasta');
  if (fH) fH.addEventListener('change', () => writeFilterToInput('hasta', fH.value));
// ── Panel de filtros: en escritorio va en línea bajo la barra y recuerda si
// estaba abierto; en móvil es una hoja modal ──
const btnFiltros   = $('#btn-filtros');
const filtrosPanel = $('#filtros-panel');
if (btnFiltros && filtrosPanel){
  const FILTROS_OPEN_KEY = 'voceiro-filtros-abierto';
  const preferenciaEnLinea = () => {
    try { return localStorage.getItem(FILTROS_OPEN_KEY) !== 'false'; } catch(e){ return true; }
  };
  // Con el atributo y no con show(): show() movería el foco al panel.
  const ponerEnLinea = abierto => {
    filtrosPanel.toggleAttribute('open', abierto);
    btnFiltros.setAttribute('aria-expanded', String(abierto));
  };
  const sincronizarModo = () => {
    if (filtrosPanel.matches(':modal')) filtrosPanel.close();
    const movil = ajEsMovil();
    btnFiltros.setAttribute('aria-haspopup', movil ? 'dialog' : 'false');
    ponerEnLinea(!movil && preferenciaEnLinea());
  };
  sincronizarModo();
  window.matchMedia('(max-width: 819.98px)').addEventListener('change', sincronizarModo);

  btnFiltros.addEventListener('click', () => {
    cerrarPresetMenu();
    pintarFiltroLectura();
    if (!ajEsMovil()){
      const abrir = !filtrosPanel.open;
      try { localStorage.setItem(FILTROS_OPEN_KEY, String(abrir)); } catch(e){}
      ponerEnLinea(abrir);
      return;
    }
    filtrosPanel.showModal();
    btnFiltros.setAttribute('aria-expanded', 'true');
  });
  $('#filtros-cerrar').addEventListener('click', () => filtrosPanel.close());
  // Tocar el fondo cierra la hoja. Un clic en el relleno del diálogo también
  // llega con target = diálogo, así que se mira si cae fuera de su caja.
  filtrosPanel.addEventListener('click', e => {
    if (e.target !== filtrosPanel || !filtrosPanel.matches(':modal')) return;
    const r = filtrosPanel.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom){
      filtrosPanel.close();
    }
  });
  // Puede llegar después de que sincronizarModo lo haya reabierto en línea.
  filtrosPanel.addEventListener('close', () => {
    btnFiltros.setAttribute('aria-expanded', String(filtrosPanel.open));
    btnFiltros.focus({ preventScroll: true });
  });
}
  const barra = $('.filtros-wrap');
  const btnBuscar = $('#btn-buscar');
  const mostrarBusqueda = abrir => {
    barra.classList.toggle('busqueda-abierta', abrir);
    btnBuscar.setAttribute('aria-expanded', String(abrir));
  };
  mostrarBusqueda(!!$('#buscar').value);
  btnBuscar.addEventListener('click', () => {
    const abrir = !barra.classList.contains('busqueda-abierta');
    mostrarBusqueda(abrir);
    if (abrir) $('#buscar').focus({ preventScroll: true });
  });

  // ── Clear del buscador ──
  const buscarInput = $('#buscar');
  const buscarClear = $('#buscar-clear');
  if (buscarInput && buscarClear){
    const syncClear = () => { buscarClear.hidden = !buscarInput.value; };
    syncClear();
    buscarInput.addEventListener('input', syncClear);
    buscarClear.addEventListener('click', () => {
      buscarInput.value = '';
      syncClear();
      aplicarFiltros();
      buscarInput.focus();
    });
  }

  const ovInclude = $('#ov-add-include');
  const ovIgnore = $('#ov-add-ignore');

  function aplicarOverrideDesdeBuscador(tipo){
    const v = $('#filtro-medio').value.trim();
    const d = normalizarDominioInput(v);
    if (!d || !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(d)){
      toast(t('cfgOverrideBad', { X: v }), 2400);
      return;
    }
    const modo = modoEnPanel();
    if (!modo) return;
    setOverride(d, tipo, modo);
    MEDIOS_CATS_ABIERTAS.add(t('cfgMediosOtros'));
    $('#filtro-medio').value = '';
    $('#filtro-medio-add').hidden = true;
    ajModoCambiado(modo);
    pintarModo();
  }

  if (ovInclude) ovInclude.addEventListener('click', () => aplicarOverrideDesdeBuscador('include'));
  if (ovIgnore) ovIgnore.addEventListener('click', () => aplicarOverrideDesdeBuscador('ignore'));

  const ovAplicar = $('#ov-pegar-aplicar');
  if (ovAplicar) ovAplicar.addEventListener('click', aplicarListaOverrides);
  wireResultadosDelegation();
  wireAutocomplete();
    // Delegación para #lista-medios (un único listener en todo el contenedor)
  const contMedios = $('#lista-medios');
  if (contMedios){
    contMedios.addEventListener('click', e => {
      const summary = e.target.closest('.medio-cat-header');
      if (!summary || $('#filtro-medio').value.trim() || $('#filtro-grupo-medio').value || $('#filtro-estado-medio').value) return;
      const cat = summary.closest('.medio-cat');
      if (cat.open) MEDIOS_CATS_ABIERTAS.delete(cat.dataset.cat);
      else MEDIOS_CATS_ABIERTAS.add(cat.dataset.cat);
    });
    contMedios.addEventListener('change', e => {
      const select = e.target.closest('.medio-estado');
      const fila = select && select.closest('.medio-fila');
      const modo = modoEnPanel();
      if (!fila || !modo) return;
      setOverride(fila.dataset.dominio, select.value, modo);
      actualizarFilaMedio(fila.dataset.dominio);
      ajModoCambiado(modo);
    });
  }
}
