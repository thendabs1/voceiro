/* ═══════════════════════════════════════════════════════════════
   SINCRONIZACIÓN ENTRE DISPOSITIVOS
   Sin cuentas: un código que solo tienen tus dispositivos. Todo se cifra
   aquí (shared/sync/cripto.js) y el servidor (workers/cf-sync) guarda un
   bloque que no puede leer. Viajan Pendientes, leídas, perfil de lectura,
   modos y la configuración del lector. La fusión es la de
   shared/sync/fusion.js; aquí se decide cuándo y se vuelca el resultado.
   ═══════════════════════════════════════════════════════════════ */
const SYNC_CODIGO_KEY = 'voceiro-sync-codigo';
const SYNC_ULTIMA_KEY = 'voceiro-sync-ultima';
const SYNC_UNIRSE_KEY = 'voceiro-sync-unirse';   // hasta la primera sincronización
// var: guardarPresets, marcarLeidaLocal… pueden llamar a sincronizarPronto
// antes de que este bloque se haya evaluado.
var SYNC_CODIGO = null;
var _sync = { enCurso: null, otraVez: false, ultima: 0, error: '', espera: 0,
              diferido: null, reintento: null, volcando: false, cliente: null, unirse: false };

function cargarSync(){
  try {
    SYNC_CODIGO = limpiarCodigo(localStorage.getItem(SYNC_CODIGO_KEY) || '') || null;
    _sync.ultima = Number(localStorage.getItem(SYNC_ULTIMA_KEY)) || 0;
    _sync.unirse = localStorage.getItem(SYNC_UNIRSE_KEY) === '1';
  } catch(e){}
}

// Un cambio de aquí: se sube a los pocos segundos, juntando los seguidos.
function sincronizarPronto(){
  if (!SYNC_CODIGO || _sync.volcando || _sync.borrando) return;
  clearTimeout(_sync.diferido);
  _sync.diferido = setTimeout(sincronizarAhora, 4000);
}

function documentoLocal(){
  const doc = {
    v: 1,
    pendientes: PENDIENTES,
    leidas: Object.fromEntries(LEIDAS_LOCAL),
    perfil: perfilDeVoceiro(),
    modos: { lista: PRESETS.lista, borrados: PRESETS.borrados || {} },
    lector: cargarBloqueLector(),
  };
  // Al unir este dispositivo, lo que nadie ha tocado aquí (sin sello) cede
  // ante lo que ya hay en los otros: se trae, en vez de juntarse a ciegas.
  if (_sync.unirse){
    if (!(doc.perfil && doc.perfil.actualizado > 0)) doc.perfil = null;
    doc.modos = { lista: PRESETS.lista.filter(m => m.actualizado > 0), borrados: doc.modos.borrados };
    if (!(doc.lector && doc.lector.actualizado > 0)) doc.lector = null;
  }
  return doc;
}

async function sincronizarAhora(){
  if (!SYNC_CODIGO || _sync.borrando) return;
  const codigo = SYNC_CODIGO;
  if (_sync.enCurso){ _sync.otraVez = true; return _sync.enCurso; }
  clearTimeout(_sync.diferido);
  clearTimeout(_sync.reintento);
  if (!_sync.cliente) _sync.cliente = crearCliente({ servidores: SERVIDORES_SYNC });
  _sync.enCurso = (async () => {
    try {
      const { documento } = await _sync.cliente.sincronizar(codigo, documentoLocal());
      if (codigo !== SYNC_CODIGO) return;
      const eraUnirse = _sync.unirse;
      volcarDocumento(documento);
      _sync.ultima = Date.now();
      _sync.error = '';
      _sync.espera = 0;
      _sync.unirse = false;
      // Lo de aquí que no se mandó al unirse (modos sin sello nuevos) sube ahora.
      if (eraUnirse) sincronizarPronto();
      try {
        localStorage.setItem(SYNC_ULTIMA_KEY, String(_sync.ultima));
        localStorage.removeItem(SYNC_UNIRSE_KEY);
      } catch(e){}
    } catch (e){
      if (codigo !== SYNC_CODIGO) return;
      if (e?.code === 'SYNC_REVOCADO'){
        olvidarSync();
        toast(t('syncRevocado'), 6000);
        return;
      }
      // Sin red, servidor caído (p. ej. Cloudflare bloqueado durante un
      // partido)…: no pasa nada, todo sigue aquí; se reintenta con calma.
      _sync.error = (e && e.message) || String(e);
      _sync.espera = Math.min((_sync.espera || 15000) * 2, 15 * 60000);
      _sync.reintento = setTimeout(sincronizarAhora, _sync.espera);
    } finally {
      _sync.enCurso = null;
      ajPintarSyncEstado();
      if (_sync.otraVez){ _sync.otraVez = false; sincronizarPronto(); }
    }
  })();
  return _sync.enCurso;
}

// Vuelca aquí lo que viene del servidor, fusionándolo con lo que haya ahora
// (puede haber cambiado mientras iba y venía). Lo que nadie ha tocado
// (sello 0) no se impone sobre lo de este dispositivo.
function volcarDocumento(doc){
  const unirse = _sync.unirse;
  _sync.volcando = true;
  try {
    let refiltrar = false;

    const pendientes = fusionarPendientes(PENDIENTES, doc.pendientes);
    if (huella(pendientes) !== huella(PENDIENTES)){
      PENDIENTES = pendientes;
      guardarPendientes();
      rebuildPendientes();
      enviarEstadoAlLector();
    }

    const leidas = fusionarLeidas(Object.fromEntries(LEIDAS_LOCAL), doc.leidas);
    if (Object.keys(leidas).length !== LEIDAS_LOCAL.size ||
        Object.entries(leidas).some(([k, v]) => LEIDAS_LOCAL.get(k) !== v)){
      LEIDAS_LOCAL = new Map(Object.entries(leidas));
      guardarLeidas();
      refiltrar = true;
    }

    // Al unirse, lo que llega se adopta y se sella ahora: así llega también
    // al lector de este dispositivo y a los demás.
    const mio = perfilDeVoceiro();
    let perfil = unirse ? (doc.perfil || null) : fusionarPerfil(mio, doc.perfil);
    if (perfil && unirse && !(perfil.actualizado > 0)) perfil = { ...perfil, actualizado: Date.now() };
    if (perfil && perfil.actualizado > 0 && huella(perfil) !== huella(mio)){
      aplicarPerfilEnVoceiro(perfil);
      enviarEstadoAlLector();
    }

    const misModos = unirse ? PRESETS.lista.filter(m => m.actualizado > 0) : PRESETS.lista;
    if (volcarModos(fusionarModos({ lista: misModos, borrados: PRESETS.borrados || {} }, doc.modos), unirse)){
      refiltrar = true;
    }

    const bloque = cargarBloqueLector();
    let elegido = unirse ? (doc.lector || bloque) : masReciente(bloque, doc.lector || null);
    if (elegido && unirse && elegido !== bloque && !(elegido.actualizado > 0)){
      elegido = { ...elegido, actualizado: Date.now() };
    }
    if (elegido && (elegido.actualizado || 0) > 0 && huella(elegido) !== huella(bloque)){
      guardarBloqueLector(elegido);
      enviarEstadoAlLector();
    }

    if (refiltrar){
      refrescarBotonesGuardar();
      if (typeof NOTICIAS !== 'undefined' && NOTICIAS.length) aplicarFiltros();
    }
  } finally {
    _sync.volcando = false;
  }
}

// Modos que llegan: cada uno sustituye al de aquí salvo que ninguno de los
// dos esté sellado; los nuevos se añaden al final y los borrados se quitan.
// El orden de la lista es el de este dispositivo.
function volcarModos(m, unirse){
  if (!m || !Array.isArray(m.lista)) return false;
  const llegan = new Map(m.lista.map(x => [x.id, x]));
  const borrados = m.borrados || {};
  const nueva = [];
  let cambio = false;
  for (const local of PRESETS.lista){
    const r = llegan.get(local.id);
    if (r){
      llegan.delete(local.id);
      const sinSello = !(local.actualizado > 0) && !(r.actualizado > 0);
      if ((sinSello && !unirse) || huellaModo(r) === huellaModo(local)){ nueva.push(local); continue; }
      nueva.push(normalizarPreset(r));
      cambio = true;
    } else if (borrados[local.id] !== undefined){
      cambio = true;
    } else {
      nueva.push(local);
    }
  }
  for (const r of llegan.values()){ nueva.push(normalizarPreset(r)); cambio = true; }
  const borradosAntes = huella(PRESETS.borrados || {});
  PRESETS.borrados = { ...borrados };
  if (!cambio){
    if (huella(PRESETS.borrados) !== borradosAntes){
      try{ localStorage.setItem(PRESET_KEY, JSON.stringify(PRESETS)); }catch(e){}
    }
    return false;
  }
  if (!nueva.length) nueva.push(structuredClone(PRESET_UNICO_DEF));
  PRESETS.lista = nueva;
  if (!nueva.some(x => x.id === PRESETS.activo)) PRESETS.activo = nueva[0].id;
  PRESET = PRESETS.lista.find(x => x.id === PRESETS.activo);
  _huellasModos = huellasDeModos();   // lo que llega no se vuelve a sellar
  try{ localStorage.setItem(PRESET_KEY, JSON.stringify(PRESETS)); }catch(e){}
  try{ localStorage.setItem(PRESET_ID_KEY, PRESETS.activo); }catch(e){}
  recompilarPreset();
  actualizarBotonPreset();
  ajRefrescar();
  return true;
}

// unirse: el código ya existe (otro dispositivo); si no, es uno nuevo.
function activarSync(codigo, unirse){
  SYNC_CODIGO = codigo;
  _sync.error = '';
  _sync.unirse = !!unirse;
  try {
    localStorage.setItem(SYNC_CODIGO_KEY, codigo);
    if (unirse) localStorage.setItem(SYNC_UNIRSE_KEY, '1');
    else localStorage.removeItem(SYNC_UNIRSE_KEY);
  } catch(e){}
  ajPintarSync();
  enviarEstadoAlLector();
  sincronizarAhora();
}
function olvidarSync(){
  SYNC_CODIGO = null;
  _sync.ultima = 0;
  _sync.error = '';
  _sync.unirse = false;
  clearTimeout(_sync.diferido);
  clearTimeout(_sync.reintento);
  try {
    localStorage.removeItem(SYNC_CODIGO_KEY);
    localStorage.removeItem(SYNC_ULTIMA_KEY);
    localStorage.removeItem(SYNC_UNIRSE_KEY);
  } catch(e){}
  ajPintarSync();
  enviarEstadoAlLector();
}
function enlaceSync(){
  return location.origin + location.pathname + '#sync=' + formatearCodigo(SYNC_CODIGO);
}

// Enlace …/voceiro/#sync=CÓDIGO (lo de tras # no llega a ningún servidor):
// se quita de la barra de direcciones y se pregunta antes de unirse.
function leerEnlaceSync(){
  const m = location.hash.match(/^#sync=([A-Za-z0-9-]+)$/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  const c = limpiarCodigo(m[1]);
  if (!c || c === SYNC_CODIGO) return;
  if (!confirm(t('syncUnirConfirm'))) return;
  activarSync(c, true);
  abrirAjustes('sync');
}

async function copiarTexto(texto, aviso){
  try {
    await navigator.clipboard.writeText(texto);
    toast(aviso, 2000);
  } catch(e){
    prompt('', texto);
  }
}

async function alternarQr(){
  const caja = $('#sync-qr'), btn = $('#sync-qr-btn');
  if (!caja.hidden){
    caja.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    return;
  }
  try {
    const { default: qrcode } = await import('./vendor/qrcode-1.4.4.js');
    const qr = qrcode(0, 'M');
    qr.addData(enlaceSync());
    qr.make();
    caja.innerHTML = qr.createSvgTag(4, 2);
    const svg = caja.querySelector('svg');
    if (svg){
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', t('syncQrAlt'));
    }
    caja.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  } catch(e){
    toast(t('syncQrError'), 2400);
  }
}

function haceCuanto(ms){
  const rtf = new Intl.RelativeTimeFormat(ACCES.lang, { numeric: 'auto' });
  const seg = Math.round((ms - Date.now()) / 1000);
  if (Math.abs(seg) < 60) return rtf.format(seg, 'second');
  const min = Math.round(seg / 60);
  if (Math.abs(min) < 60) return rtf.format(min, 'minute');
  const h = Math.round(min / 60);
  if (Math.abs(h) < 24) return rtf.format(h, 'hour');
  return rtf.format(Math.round(h / 24), 'day');
}

// Ajustes › Sincronización
function ajPintarSync(){
  const on = !!SYNC_CODIGO;
  $('#sync-off').hidden = on;
  $('#sync-on').hidden = !on;
  if (on) $('#sync-codigo').textContent = formatearCodigo(SYNC_CODIGO);
  else { $('#sync-qr').hidden = true; $('#sync-qr-btn').setAttribute('aria-expanded', 'false'); }
  ajPintarSyncEstado();
}
function ajPintarSyncEstado(){
  const el = $('#sync-estado');
  if (!el || !SYNC_CODIGO) return;
  el.textContent = _sync.enCurso ? t('syncSincronizando')
    : _sync.error ? t('syncError', { X: _sync.error })
    : _sync.ultima ? t('syncUltima', { X: haceCuanto(_sync.ultima) })
    : t('syncNunca');
}

function wireSync(){
  $('#sync-activar').addEventListener('click', () => activarSync(limpiarCodigo(generarCodigo())));
  const unir = () => {
    const c = limpiarCodigo($('#sync-unir-codigo').value);
    const error = $('#sync-unir-error');
    if (!c){
      error.textContent = t('syncCodigoInvalido');
      error.hidden = false;
      return;
    }
    error.hidden = true;
    $('#sync-unir-codigo').value = '';
    activarSync(c, true);
  };
  $('#sync-unir').addEventListener('click', unir);
  $('#sync-unir-codigo').addEventListener('keydown', e => { if (e.key === 'Enter') unir(); });
  $('#sync-copiar').addEventListener('click', () => copiarTexto(formatearCodigo(SYNC_CODIGO), t('syncCopiado')));
  $('#sync-enlace').addEventListener('click', () => copiarTexto(enlaceSync(), t('syncEnlaceCopiado')));
  $('#sync-qr-btn').addEventListener('click', alternarQr);
  $('#sync-ahora').addEventListener('click', () => { sincronizarAhora(); ajPintarSyncEstado(); });
  $('#sync-desvincular').addEventListener('click', () => {
    if (confirm(t('syncDesvincularConfirm'))) olvidarSync();
  });
  $('#sync-borrar').addEventListener('click', async () => {
    if (!confirm(t('syncBorrarConfirm'))) return;
    if (_sync.borrando) return;
    const codigo = SYNC_CODIGO;
    _sync.borrando = true;
    try {
      // Esperar una primera alta en curso antes de borrar, y no lanzar otra.
      await _sync.enCurso;
      if (!_sync.cliente) _sync.cliente = crearCliente({ servidores: SERVIDORES_SYNC });
      await _sync.cliente.borrar(codigo);
      if (codigo === SYNC_CODIGO) olvidarSync();
      toast(t('syncBorrado'), 2400);
    } catch(e){
      toast(t('syncError', { X: (e && e.message) || e }), 3200);
    } finally { _sync.borrando = false; }
  });
  // Al volver a la pestaña, lo último de los otros dispositivos.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && SYNC_CODIGO && Date.now() - _sync.ultima > 60000) sincronizarAhora();
  });
}
