/* ═══════════════════════════════════════════════════════════════
   MODALES
   ═══════════════════════════════════════════════════════════════ */
function abrirPanel(id){
  const p = document.getElementById(id);
  if (!p) return;
  if (id !== 'panel-ajustes' && ajAbierto()) cerrarAjustes();
  document.querySelectorAll('.panel.open').forEach(o => { if (o !== p) o.classList.remove('open'); });
  p.classList.add('open');
  const body = p.querySelector('.panel-body');
  if (body) body.scrollTop = 0;
  document.body.style.overflow = 'hidden';
}
function cerrarPanel(id){
  if (id === 'panel-ajustes' && ajAbierto()){ cerrarAjustes(); return; }
  const p = document.getElementById(id);
  if (!p) return;
  p.classList.remove('open');
  if (!document.querySelector('.panel.open')){
    document.body.style.overflow = '';
  }
}

/* ═══════════════════════════════════════════════════════════════
   TEXTOS
   ═══════════════════════════════════════════════════════════════ */
function aplicarTextos(){
  document.title = t('pageTitle');
  $('#cab-menu-label').textContent = t('masAcciones');
  $('#meta-prefix').textContent = t('metaPrefix');

  actualizarBotonPreset();
  // Cabecera: icono y palabra (en móvil y en la fila ancha la palabra se oculta, ver .cab-txt).
  const cab = (sel, icono, clave) => {
    const b = $(sel);
    b.innerHTML = icono + `<span class="cab-txt">${escapeHtml(t(clave))}</span>`;
    b.title = t(clave);
  };
  cab('#btn-config', ico('settings'), 'ajTitulo');
  cab('#btn-estadisticas', iconoEstadisticas(), 'estTitulo');
  cab('#btn-calendario', iconoCalendario(), 'calTitulo');
  $('#btn-calendario').setAttribute('aria-label', t('calTitulo'));
  cab('#btn-deportes', iconoDeportes(), 'calDeportesTitulo');
  $('#btn-deportes').setAttribute('aria-label', t('calDeportesTitulo'));
  $('#btn-estadisticas').setAttribute('aria-label', t('estTitulo'));
  cab('#btn-acces', '<span class="cab-aa" aria-hidden="true">Aa</span>', 'ajLectura');
  cab('#btn-pendientes', ico('bookmark'), 'btnPendientes');
  $('#btn-pendientes').insertAdjacentHTML('beforeend', '<span class="pend-count" data-count="0">0</span>');

  // Filtros de lectura.
  $('#btn-pase').title = t('paseCapa');
  $('#btn-pase').setAttribute('aria-label', t('paseCapa'));
  $('#btn-pase .cab-txt').textContent = t('paseCapa');
  $('#aj-hide-ayuda-lbl').textContent = t('vsAyudaLbl');
  const descripcionesOcultar = t('vsAyuda').split('|');
  const opcionesOcultar = ['vsHideOff', 'vsHideRead', 'vsHideViewed', 'vsHideBoth'];
  document.querySelectorAll('.vs-ayuda-lista').forEach(lista => {
    lista.innerHTML = opcionesOcultar.map((clave, i) =>
      `<li><strong>${escapeHtml(t(clave))}:</strong> ${escapeHtml(descripcionesOcultar[i])}</li>`
    ).join('');
  });
  pintarBotonLectura();
  actualizarFiltrosCount();

  // ── Ajustes ──
  $('#aj-titulo').textContent = t('ajTitulo');
  $('#aj-resize').setAttribute('aria-label', t('ajRedimensionar'));
  AJ_SECCIONES.forEach(s =>
    $('#aj-nav-' + s).textContent = t(AJ_TITULOS[s]));

  // Modos
  $('#cfg-modos-hint').textContent = t('cfgModosHint');
  // Accesos del buscador
  $('#buscar-accesos').setAttribute('aria-label', t('accAbrir'));
  $('#buscar-accesos').title = t('accAbrir');
  // Asistentes
  $('#aj-asistentes-hint').textContent = t('ajAsistentesHint');
  $('#btn-as-modo-lbl').textContent = t('asTitulo');
  $('#btn-as-calendario-lbl').textContent = t('ajAsCalendario');
  $('#aj-as-calendario-hint').textContent = t('ajAsCalendarioHint');
  $('#btn-nuevo-modo-lbl').textContent = t('cfgModoNuevo');
  $('#btn-asistente-modo-lbl').textContent = t('asTitulo');
  $('#as-entrada-hint').textContent = t('asEntrada');
  $('#aj-regla-lbl').textContent = t('asComportamiento');
  $('#aj-regla').innerHTML = [['sumar', 'asSumar'], ['elegidas', 'asCruzar'], ['todas', 'asTodas']]
    .map(([v, k]) => `<option value="${v}">${escapeHtml(t(k))}</option>`).join('');
  $('#aj-modo-activar-lbl').textContent   = t('ajModoActivar');
  $('#aj-modo-renombrar-lbl').textContent = t('ajModoRenombrar');
  $('#aj-modo-duplicar-lbl').textContent  = t('ajModoDuplicar');
  $('#aj-modo-vaciar-lbl').textContent    = t('ajModoVaciar');
  $('#aj-modo-borrar-lbl').textContent    = t('ajModoBorrar');
  $('#aj-temas-tit').textContent = t('cfgPalabras');
  $('#aj-temas').placeholder = t('cfgPalabrasPlaceholder');
  $('#cfg-palabras-hint').textContent = t('cfgPalabrasHint');
  // Ejemplos: una línea por ejemplo, «tema|qué casa».
  $('#cfg-temas-ayuda').innerHTML = t('cfgTemasAyuda').split('\n').map(l => {
    const [ej, txt] = l.split('|');
    return `<li><code>${escapeHtml(ej)}</code> → ${escapeHtml(txt || '')}</li>`;
  }).join('');
  $('#cfg-medios').textContent = t('cfgMedios');
  $('#aj-guardado').textContent = t('ajGuardadoAutomatico');
  $('#ov-add-include').textContent = t('cfgMedioAddForce');
  $('#ov-add-ignore').textContent = t('cfgMedioAddIgnore');
  $('#ov-pegar-aplicar').textContent = t('cfgOverrideAplicar');
  const det = $('#ov-pegar-wrap summary');
  if (det) det.textContent = t('cfgOverridePegar');
  $('#cfg-medios-hint').textContent = t('cfgMediosHint');
  $('#filtro-medio').placeholder = t('cfgBuscarMedio');
  $('#filtro-medio').setAttribute('aria-label', t('cfgBuscarMedio'));
  $('#filtro-grupo-medio').setAttribute('aria-label', t('cfgTodosGrupos'));
  const estados = $('#filtro-estado-medio');
  const estadoActual = estados.value;
  estados.setAttribute('aria-label', t('cfgFiltrarEstado'));
  estados.innerHTML = [
    ['', 'cfgMediosTodos'], ['configurados', 'cfgMediosConfigurados'],
    ['include', 'cfgMedioIncluir'], ['first', 'cfgMedioDestacar'], ['ignore', 'cfgMedioBloquear'],
  ].map(([v, k]) => `<option value="${v}">${escapeHtml(t(k))}</option>`).join('');
  estados.value = estadoActual;
  $('#medios-vacio').textContent = t('cfgMediosVacio');
  $('#aj-temas').setAttribute('aria-labelledby', 'aj-temas-tit');
  $('#ov-pegar').setAttribute('aria-label', t('cfgOverridePegar'));
  if ($('#filtro-grupo-medio').options[0]) $('#filtro-grupo-medio').options[0].text = t('cfgTodosGrupos');
  $('#cfg-grupos').textContent = t('cfgGrupos');
  $('#cfg-grupos-hint').textContent = t('cfgGruposHint');

  // Lectura
  $('#ac-tema').textContent = t('acTema');
  $('#ac-fuente').textContent = t('acFuente');
  $('#ac-tamano').textContent = t('acTamano');
  $('#ac-ancho').textContent = t('acAncho');
  $('#ac-extra').textContent = t('acExtra');
  $('#acces-reset-lbl').textContent = t('acReset');

  // Pie del menú de Ajustes - selector de idioma
  $('#nav-idioma-lbl').textContent = t('lblIdioma');

  // Feed
  $('#aj-vista-tit').textContent = t('ajVistaTit');
  $('#aj-hide-tit').textContent = t('vsTitleHide');
  document.querySelectorAll('.aj-radios span[data-txt]').forEach(sp => {
    sp.innerHTML = escapeHtml(t(sp.dataset.txt))
      + (sp.dataset.hint ? `<small>${escapeHtml(t(sp.dataset.hint))}</small>` : '');
  });
  $('#cfg-recordar-filtros-lbl').textContent = t('cfgRecordarFiltros');
  $('#cfg-recordar-filtros-hint').textContent = t('cfgRecordarFiltrosHint');
  $('#cfg-portadas').textContent = t('cfgPortadas');
  $('#cfg-portadas-hint').textContent = t('cfgPortadasHint');
  renderListaPortadas();
  const elDias = $('#cfg-dias'); if (elDias) elDias.textContent = t('cfgDias');
  const elDiasHint = $('#cfg-dias-hint'); if (elDiasHint) elDiasHint.textContent = t('cfgDiasHint');
  $('#dias-cancelar').textContent = t('cfgDiasCancelar');
  $('#dias-cargar').textContent = t('cfgDiasCargar');
  renderDiasSelector();
  const grupoDias = document.querySelector('.opt-group[data-dias]');
  if (grupoDias){
    grupoDias.querySelectorAll('button[data-val]').forEach(b => {
      b.textContent = b.dataset.val;
    });
  }

  // Avanzado
  $('#aj-prensa-tit').textContent = t('prensaPanelLabel');
  $('#aj-tiempo-tit').textContent = t('ajTiempoTit');
  $('#cfg-tiempo-lbl').textContent = t('cfgTiempo');
  $('#cfg-tiempo-hint').textContent = t('cfgTiempoHint');
  $('#cfg-avisos-cab-lbl').textContent = t('cfgAvisosCab');
  $('#cfg-avisos-cab-hint').textContent = t('cfgAvisosCabHint');
  $('#cfg-fecha-larga-lbl').textContent = t('cfgFechaLarga');
  $('#cfg-fecha-larga-hint').textContent = t('cfgFechaLargaHint');
  repintarTiempo();
  repintarAvisos();
  $('#cfg-backup').textContent = t('cfgBackup');
  $('#cfg-backup-msg').textContent = t('cfgBackupMsg');
  $('#btn-export-lbl').textContent = t('btnExport');
  $('#btn-import-lbl').textContent = t('btnImport');
  $('#aj-plugin-tit').textContent = t('ajPluginTit');
  $('#aj-plugin-hint').textContent = t('syncOfflineHint');
  $('#aj-lector-instalar-lbl').textContent = t('ajLectorInstalar');
  $('#aj-lector-hint').textContent = t('ajLectorHint');

  // Sincronización
  $('#sync-intro').textContent = t('syncIntro');
  $('#sync-activar-lbl').textContent = t('syncActivar');
  $('#sync-unir-tit').textContent = t('syncUnirTit');
  $('#sync-unir-hint').textContent = t('syncUnirHint');
  $('#sync-unir-codigo').placeholder = 'XXXXX-XXXXX-XXXXX-XXXXX-XXXXX';
  $('#sync-unir').textContent = t('syncUnir');
  $('#sync-codigo-tit').textContent = t('syncCodigoTit');
  $('#sync-codigo-hint').textContent = t('syncCodigoHint');
  $('#sync-copiar-lbl').textContent = t('syncCopiar');
  $('#sync-enlace-lbl').textContent = t('syncEnlace');
  $('#sync-qr-lbl').textContent = t('syncQr');
  $('#sync-ahora-lbl').textContent = t('syncAhora');
  $('#sync-quitar-tit').textContent = t('syncQuitarTit');
  $('#sync-desvincular').textContent = t('syncDesvincular');
  $('#sync-borrar-lbl').textContent = t('syncBorrar');
  $('#sync-privacidad').textContent = t('syncPrivacidad');

  // Ayuda
  $('#cfg-help-lbl').textContent = t('cfgHelpLbl');
  $('#cfg-help-msg').textContent = t('cfgHelpMsg');
  $('#cfg-help-btn').textContent = t('cfgHelpBtn');
  $('#aj-atajos-tit').textContent = t('ajAtajosTit');
  $('#aj-atajos').innerHTML = t('ajAtajos').split('\n').map(l => {
    const [tecla, txt] = l.split('|');
    return `<dt>${escapeHtml(tecla)}</dt><dd>${escapeHtml(txt || '')}</dd>`;
  }).join('');

  // Prensa externa (panel)
  const pl = document.getElementById('prensa-panel-label');
  if (pl) pl.textContent = t('ajPrensaActivar');
  const pll = document.getElementById('prensa-lang-label');
  if (pll) pll.textContent = t('prensaLang');
  const plp = document.getElementById('prensa-region-label');
  if (plp) plp.textContent = t('prensaPais');
  const prst = document.getElementById('prensa-reset');
  if (prst){
    prst.title = t('prensaReset');
    prst.setAttribute('aria-label', t('prensaReset'));
  }

  // Repoblar los selects si el idioma de UI cambia
  const selPrensaL = document.getElementById('prensa-lang');
  const selPrensaP = document.getElementById('prensa-region');
  if (selPrensaL) selPrensaL.innerHTML = '';
  if (selPrensaP) selPrensaP.innerHTML = '';
  pintarSelectsPrensa();
  const bTema = document.querySelectorAll('.opt-group[data-grupo="tema"] button');
  [t('acClaro'), t('acSepia'), t('acOscuro'), t('acContraste'), t('acPersonalizado')].forEach((txt, i) => {
    if (bTema[i]) bTema[i].textContent = txt;
  });
  $('#ac-colores-pista').textContent = t('acColoresPista');
  CLAVES_COLORES.forEach(k => {
    $('#ac-color-' + k + '-lbl').textContent = t('acColor' + k[0].toUpperCase() + k.slice(1));
  });
  const bFuente = document.querySelectorAll('.opt-group[data-grupo="fuente"] button');
  [t('acSerif'), t('acSans'), t('acDislexia')].forEach((txt, i) => {
    if (bFuente[i]) bFuente[i].textContent = txt;
  });
  const bExtra = document.querySelectorAll('.opt-group[data-grupo="extra"] button');
  [t('acJustificar'), t('acBionic'), t('acFoco')].forEach((txt, i) => {
    if (bExtra[i]) bExtra[i].textContent = txt;
  });

  $('#pend-title').textContent = t('pendTitle');
  $('#pend-refresh').innerHTML = ico('refresh-cw') + `<span>${escapeHtml(t('pendRefresh'))}</span>`;

  $('#rep-title').textContent = t('repTitle');
  $('#rep-motivo-lbl').textContent = t('repMotivoLbl');
  $('#rep-detalles-lbl').textContent = t('repDetallesLbl');
  $('#rep-detalles').placeholder = t('repDetallesPh');
  $('#rep-config-lbl').textContent = t('repConfigLbl');
  $('#rep-copy').textContent = t('repCopy');
  $('#rep-mail').textContent = t('repMail');
  $('#rep-github').textContent = t('repGithub');
  const motivoLabels = [
    t('repMotivoNoSeMuestra'), t('repMotivoEnlaceRoto'), t('repMotivoPaywall'),
    t('repMotivoMedioIncorrecto'), t('repMotivoDuplicado'),
    t('repMotivoContenido'), t('repMotivoFecha'), t('repMotivoOtro')
  ];
  const selMot = $('#rep-motivo');
  [...selMot.options].forEach((o, i) => { if (motivoLabels[i]) o.textContent = motivoLabels[i]; });


  $('#buscar').placeholder = t('fltBuscar');
  $('#filtros-label').textContent = t('fltBtn');
  $('#filtros-titulo').textContent = t('fltBtn');
  $('#filtros-cerrar').textContent = t('btnCerrar');
  $('#btn-buscar span').textContent = t('fltBuscarBoton');
  $('#buscar').setAttribute('aria-label', t('fltBuscarBoton'));
  document.querySelectorAll('[data-filtro-label]').forEach((el, i) => {
    el.textContent = t('fltCampos').split('|')[i];
  });
  document.querySelectorAll('.panel-close').forEach(b => {
    b.title = t('btnCerrar');
    b.setAttribute('aria-label', t('btnCerrar'));
  });
  if ($('#grupo').options[0]) $('#grupo').options[0].text = t('fltGrupo');
  if ($('#tipo').options[0])  $('#tipo').options[0].text  = t('fltTipo');

  const rOpts = $('#rango').options;
  rOpts[0].text = t('fltTodo');
  rOpts[1].text = t('flt24h');
  rOpts[2].text = t('flt48h');
  rOpts[3].text = t('fltIntervalo');
  const oOpts = $('#orden').options;
  oOpts[0].text = t('ordenRecientes');
  oOpts[1].text = t('ordenAntiguos');
  oOpts[2].text = t('ordenRelevancia');

  renderLangSelect();
  actualizarSyncBanner();
  actualizarBotonPendientes();
  pintarEstadisticas();
  pintarCalendario();
  // Si cambia el idioma, el chip del tiempo muestra la nueva traducción.
  if ($('#chips-busqueda').style.display !== 'none'){
    const raw = $('#buscar').value.trim();
    renderChips(parseQuery(preprocesarInput(raw)), raw);
  }
}
