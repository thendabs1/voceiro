/* ═══════════════════════════════════════════════════════════════
   LECTOR UNIVERSAL: PENDIENTES, PERFIL Y PUENTE
   Leídas y vistas son de esta página; Pendientes, el perfil de
   lectura y los modos se comparten con el lector por el puente.
   ═══════════════════════════════════════════════════════════════ */
// Leídas: URL → cuándo (ms). Con fecha, para juntarlas entre dispositivos
// y quedarse con las más recientes.
const LEIDAS_KEY = 'voceiro-leidas-v2';
const LEIDAS_KEY_V1 = 'voceiro-leidas-v1';
let LEIDAS_LOCAL = cargarLeidas();

function cargarLeidas(){
  try {
    const raw = localStorage.getItem(LEIDAS_KEY);
    if (raw) return new Map(JSON.parse(raw));
    const v1 = JSON.parse(localStorage.getItem(LEIDAS_KEY_V1) || '[]');
    return new Map((Array.isArray(v1) ? v1 : []).map(u => [u, 0]));
  } catch(e){ return new Map(); }
}
function guardarLeidas(){
  try { localStorage.setItem(LEIDAS_KEY, JSON.stringify([...LEIDAS_LOCAL])); } catch(e){}
}
function marcarLeidaLocal(url){
  const k = normalizeUrlForMatch(url);
  if (!k || LEIDAS_LOCAL.has(k)) return;
  LEIDAS_LOCAL.set(k, Date.now());
  if (LEIDAS_LOCAL.size > LEIDAS_MAX){
    LEIDAS_LOCAL = new Map([...LEIDAS_LOCAL].sort((a, b) => b[1] - a[1]).slice(0, LEIDAS_MAX - 1000));
  }
  guardarLeidas();
  sincronizarPronto();
}

const VISTAS_KEY = 'voceiro-vistas-v1';
let VISTAS_LOCAL = new Set();
try { VISTAS_LOCAL = new Set(JSON.parse(localStorage.getItem(VISTAS_KEY) || '[]')); } catch(e){}

let VISTAS_DIRTY = false;
function marcarVistaLocal(url){
  const k = normalizeUrlForMatch(url);
  if (!k || VISTAS_LOCAL.has(k)) return;
  VISTAS_LOCAL.add(k);
  if (VISTAS_LOCAL.size > 10000) VISTAS_LOCAL = new Set([...VISTAS_LOCAL].slice(-8000));
  VISTAS_DIRTY = true;
}
const persistirVistas = debounce(() => {
  if (!VISTAS_DIRTY) return;
  try { localStorage.setItem(VISTAS_KEY, JSON.stringify([...VISTAS_LOCAL])); } catch(e){}
  VISTAS_DIRTY = false;
}, 1000);
/* Lector conectado a esta página. USCRIPT_OK: hay lector con el puente v2.
   LECTOR_VIEJO: responde, pero con el puente antiguo (hay que actualizarlo). */
const PUENTE_V = 2;
let USCRIPT_OK = false;
let USCRIPT_CHECKED = false;
let LECTOR_VIEJO = false;

/* ── Pendientes: una sola lista, compartida con el lector ──
   PENDIENTES guarda también lo borrado (marcado, caduca solo): así el
   borrado viaja al lector. PENDIENTES_CACHE es lo que se ve. La fusión con
   lo del lector está en shared/sync/fusion.js. */
const PEND_KEY = 'voceiro-pendientes-v2';
const PEND_KEY_V1 = 'voceiro-pendientes-local-v1';
let PENDIENTES = cargarPendientes();
let PENDIENTES_CACHE = [];
let PENDIENTES_URLS = new Set();
let PENDIENTES_MAP  = new Map();

function cargarPendientes(){
  try {
    const raw = localStorage.getItem(PEND_KEY);
    if (raw){
      const arr = JSON.parse(raw);
      return fusionarPendientes(Array.isArray(arr) ? arr : [], []);
    }
    // Primera vez con la lista nueva: se trae la de este navegador.
    const v1 = JSON.parse(localStorage.getItem(PEND_KEY_V1) || '[]');
    const lista = fusionarPendientes(Array.isArray(v1) ? v1 : [], []);
    localStorage.setItem(PEND_KEY, JSON.stringify(lista));
    return lista;
  } catch(e){ return []; }
}
function guardarPendientes(){
  try { localStorage.setItem(PEND_KEY, JSON.stringify(PENDIENTES)); } catch(e){}
}

function actualizarSyncBanner(){
  const banner = $('#sync-banner');
  const txt = $('#sync-banner-text');
  if (!banner || !txt) return;
  banner.style.display = '';
  banner.querySelector('.sync-dot').classList.toggle('offline', !USCRIPT_OK);
  txt.textContent = USCRIPT_OK ? t('syncOnline')
                  : LECTOR_VIEJO ? t('syncLectorViejo')
                  : t('syncOffline');
  banner.title = USCRIPT_OK ? '' : t('syncOfflineHint');
}

function rebuildPendientes(){
  const visibles = PENDIENTES.filter(i => !i.borrado);
  PENDIENTES_CACHE = visibles;
  const map = new Map();
  visibles.forEach(i => map.set(normalizeUrlForMatch(i.url), i));
  PENDIENTES_MAP  = map;
  PENDIENTES_URLS = new Set(map.keys());

  refrescarBotonesGuardar();
  actualizarBotonPendientes();
  if ($('#panel-pendientes').classList.contains('open')){
    renderPendientes(PENDIENTES_CACHE);
  }
}

// Sustituye la lista, la guarda, la repinta y se la manda al lector.
function cambiarPendientes(nueva){
  PENDIENTES = fusionarPendientes(nueva, []);
  guardarPendientes();
  rebuildPendientes();
  enviarEstadoAlLector();
  sincronizarPronto();
}
function buscarPendiente(url){
  const k = normalizeUrlForMatch(url);
  return PENDIENTES.find(i => normalizeUrlForMatch(i.url) === k) || null;
}
function dominioDe(url){
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch(e){ return ''; }
}

// Guarda un titular para después (si estaba borrado, vuelve).
function addPendiente({ url, title, description, image }){
  if (!url) return false;
  const previo = buscarPendiente(url);
  if (previo && !previo.borrado) return false;
  const ahora = Date.now();
  cambiarPendientes([...PENDIENTES, {
    url, title: title || '', description: description || '', image: image || '',
    domain: dominioDe(url), date: ahora, read: false, readAt: null, actualizado: ahora
  }]);
  return true;
}
function setPendienteRead(url, read){
  const previo = buscarPendiente(url);
  if (!previo || previo.borrado || previo.read === !!read) return false;
  const ahora = Date.now();
  cambiarPendientes([...PENDIENTES.filter(i => i !== previo), {
    ...previo, read: !!read, readAt: read ? ahora : null, actualizado: ahora
  }]);
  return true;
}
function removePendiente(url){
  const previo = buscarPendiente(url);
  if (!previo || previo.borrado) return false;
  cambiarPendientes([...PENDIENTES.filter(i => i !== previo),
                     { ...previo, borrado: true, actualizado: Date.now() }]);
  return true;
}
// Al abrir un titular queda en Pendientes como leído: es el historial de
// lo leído que ya llevaba el lector, ahora el mismo con o sin él.
function registrarLeido(n){
  const previo = buscarPendiente(n.enlace);
  if (previo && !previo.borrado){
    setPendienteRead(n.enlace, true);
    return;
  }
  const ahora = Date.now();
  cambiarPendientes([...PENDIENTES.filter(i => i !== previo), {
    url: n.enlace, title: n.titular || '', description: n.grupo || '', image: '',
    domain: dominioDe(n.enlace), date: ahora, read: true, readAt: ahora, actualizado: ahora
  }]);
}

function desmarcarLeidaLocal(url){
  const k = normalizeUrlForMatch(url);
  if (!LEIDAS_LOCAL.has(k)) return;
  LEIDAS_LOCAL.delete(k);
  guardarLeidas();
}

/* ── Perfil de lectura común con el lector ──
   Idioma, tema, fuente, tamaño, justificado, biónica y foco; el ancho es de
   cada uno. ACCES.actualizado sella el último cambio de esos campos
   (guardarAcces) y decide qué perfil gana. */
function firmaPerfil(o){
  return huella(CAMPOS_PERFIL.map(k => o[k]));
}
function perfilDeVoceiro(){
  return limpiarPerfil({ ...ACCES, actualizado: ACCES.actualizado || 0 });
}
function aplicarPerfilEnVoceiro(p){
  const langAntes = ACCES.lang;
  CAMPOS_PERFIL.forEach(k => { if (p[k] !== undefined) ACCES[k] = p[k]; });
  if (!I18N[ACCES.lang]) ACCES.lang = langAntes;
  ACCES.fs = Math.min(LIM.fs.max, Math.max(LIM.fs.min, Number(ACCES.fs) || ACCES_DEF.fs));
  ACCES.actualizado = p.actualizado;
  _firmaPerfilVoceiro = firmaPerfil(ACCES);   // ya sellado: no es un cambio de aquí
  try{ localStorage.setItem('voceiro-acces-v2', JSON.stringify(ACCES)); }catch(e){}
  aplicarAcces();
  if (ACCES.lang !== langAntes){
    aplicarTextos();
    reconstruirSelectores();
    construirIndicesBusqueda();
    ajRefrescar();
  }
  renderizar();
}

/* ── Puente con el lector (v2) ──
   Eventos en document, uno por sentido para que nadie se oiga a sí mismo:
     · 'voceiro-ping'   Voceiro → lector; responde 'voceiro-pong' {v}.
     · 'voceiro-ready'  lector → Voceiro, al arrancar {v}.
     · 'voceiro-estado' Voceiro → lector {v, respuesta, pendientes, perfil, lector,
                        leidasHasta, sync}. sync: el código de sincronización, o
                        null; el lector lo sigue y sincroniza también por su cuenta
                        en las demás webs (lector/src/28-sincronizacion.js).
     · 'lector-estado'  lector → Voceiro {…, leidas}: lo que se ha terminado de
                        leer en el lector, [{url, fecha, quitar?}]. Voceiro lo
                        marca como leído y lo confirma con leidasHasta (la fecha
                        más nueva que ya tiene); el lector borra lo confirmado.
   Cada lado fusiona lo que le llega y, si lo suyo no coincide y el mensaje
   no era ya una respuesta, contesta una vez con lo suyo. Como fusionar da
   lo mismo en cualquier orden, tras ese ida y vuelta los dos coinciden. */
// Configuración propia del lector (reglas por sitio, diccionarios, servicios
// de «Abrir en…»…): Voceiro la guarda tal cual, sin mirarla, para llevarla a
// otros dispositivos con la sincronización. { datos, actualizado }.
const LECTOR_BLOQUE_KEY = 'voceiro-lector-bloque';
function cargarBloqueLector(){
  try {
    const b = JSON.parse(localStorage.getItem(LECTOR_BLOQUE_KEY) || 'null');
    return b && typeof b === 'object' ? b : null;
  } catch(e){ return null; }
}
function guardarBloqueLector(b){
  try { localStorage.setItem(LECTOR_BLOQUE_KEY, JSON.stringify(b)); } catch(e){}
}
function estadoDeVoceiro(respuesta){
  return {
    v: PUENTE_V, respuesta: !!respuesta,
    pendientes: PENDIENTES, perfil: perfilDeVoceiro(), lector: cargarBloqueLector(),
    leidasHasta: leidasDelLectorHasta(), sync: codigoSyncGuardado()
  };
}
// El guardado, no el de memoria: otra pestaña de Voceiro puede haberlo
// quitado o cambiado, y esta no debe devolvérselo al lector.
function codigoSyncGuardado(){
  try { return limpiarCodigo(localStorage.getItem(SYNC_CODIGO_KEY) || '') || null; } catch(e){ return null; }
}

// Leídas que manda el lector (lo terminado allí): hasta qué fecha las tengo.
const LEIDAS_LECTOR_KEY = 'voceiro-leidas-lector-hasta';
function leidasDelLectorHasta(){
  try { return Number(localStorage.getItem(LEIDAS_LECTOR_KEY)) || 0; } catch(e){ return 0; }
}
// Devuelve si ha marcado o desmarcado algo.
function recibirLeidasDelLector(lista){
  if (!Array.isArray(lista)) return false;
  const hasta = leidasDelLectorHasta();
  let nueva = hasta, cambio = false;
  for (const l of lista){
    const fecha = Number(l && l.fecha) || 0;
    if (!l || !l.url || fecha <= hasta) continue;
    const k = normalizeUrlForMatch(l.url);
    if (l.quitar){
      if (LEIDAS_LOCAL.has(k)){ desmarcarLeidaLocal(l.url); cambio = true; }
    } else if (!LEIDAS_LOCAL.has(k)){
      marcarLeidaLocal(l.url);
      cambio = true;
    }
    nueva = Math.max(nueva, fecha);
  }
  if (nueva > hasta){
    try { localStorage.setItem(LEIDAS_LECTOR_KEY, String(nueva)); } catch(e){}
  }
  return cambio || nueva > hasta;
}

// Repinta como leídas (o no) las tarjetas de la lista, sin rehacerla: lo
// que llega del lector mientras Voceiro está detrás no debe moverte el scroll.
function pintarLeidasEnLista(){
  document.querySelectorAll('#resultados .noticia').forEach(art => {
    const n = ULT_FILTRADAS[parseInt(art.dataset.idx, 10)];
    if (!n) return;
    const key = normalizeUrlForMatch(n.enlace);
    const item = PENDIENTES_MAP.get(key);
    const leida = !!(item && item.read) || LEIDAS_LOCAL.has(key);
    art.classList.toggle('leida', leida);
    if (leida) art.classList.remove('vista');
  });
  refrescarBotonesGuardar();
}
function comparable(d){
  return huella({
    pendientes: fusionarPendientes(d && d.pendientes, []),
    perfil: limpiarPerfil(d && d.perfil),
    lector: d && d.lector ? { datos: d.lector.datos, actualizado: d.lector.actualizado || 0 } : null
  });
}
function enviarEstadoAhora(respuesta){
  if (!USCRIPT_OK) return;
  try {
    document.dispatchEvent(new CustomEvent('voceiro-estado', {
      detail: structuredClone(estadoDeVoceiro(respuesta))
    }));
  } catch(e){}
}
// Cambios de aquí: se juntan los de unos instantes en un solo envío.
var _enviarEstadoDiferido;
function enviarEstadoAlLector(){
  if (!_enviarEstadoDiferido) _enviarEstadoDiferido = debounce(() => enviarEstadoAhora(false), 300);
  _enviarEstadoDiferido();
}

function recibirEstadoDelLector(d){
  const fusion = fusionarPendientes(PENDIENTES, d.pendientes);
  const pendCambian = huella(fusion) !== huella(PENDIENTES);
  if (pendCambian){
    PENDIENTES = fusion;
    guardarPendientes();
    rebuildPendientes();
    sincronizarPronto();
  }
  const hastaAntes = leidasDelLectorHasta();
  const leidasCambian = recibirLeidasDelLector(d.leidas);
  if (pendCambian || leidasCambian) pintarLeidasEnLista();
  // Un perfil sin sellar (nadie lo ha cambiado desde que se comparten) no
  // se impone: se unifican con el primer cambio, en cualquiera de los dos.
  const mio = perfilDeVoceiro();
  const perfil = fusionarPerfil(mio, d.perfil);
  if (perfil && perfil.actualizado > 0 && huella(perfil) !== huella(mio)){
    aplicarPerfilEnVoceiro(perfil);
    sincronizarPronto();
  }

  // Configuración del lector: se guarda la más reciente, para el servidor.
  const bloque = cargarBloqueLector();
  const elegido = masReciente(bloque, d.lector || null);
  if (elegido && ((elegido.actualizado || 0) > 0 || !bloque) && huella(elegido) !== huella(bloque)){
    guardarBloqueLector(elegido);
    sincronizarPronto();
  }
  // Se contesta si lo mío no coincide o si hay leídas nuevas que confirmar
  // (esto último, aunque lo recibido ya fuera una respuesta: la mía también
  // lo es, y el lector no contesta a respuestas).
  const confirmar = leidasDelLectorHasta() > hastaAntes;
  if (confirmar || (!d.respuesta && comparable(estadoDeVoceiro()) !== comparable(d))) enviarEstadoAhora(true);
}

function initUserScriptBridge(){
  rebuildPendientes();

  const conectar = e => {
    const v = e.detail && e.detail.v;
    USCRIPT_CHECKED = true;
    if (v === PUENTE_V){
      const primera = !USCRIPT_OK;
      USCRIPT_OK = true;
      LECTOR_VIEJO = false;
      if (primera) enviarEstadoAhora(false);
    } else if (!USCRIPT_OK){
      LECTOR_VIEJO = true;
    }
    actualizarBotonPendientes();
    actualizarSyncBanner();
    if (ajRuta() === 'lector') ajPintarLector();
  };
  document.addEventListener('voceiro-ready', conectar);
  document.addEventListener('voceiro-pong', conectar);

  document.addEventListener('lector-estado', e => {
    const d = e.detail;
    if (!d || typeof d !== 'object' || d.v !== PUENTE_V) return;
    if (!USCRIPT_OK) conectar({ detail: { v: PUENTE_V } });
    recibirEstadoDelLector(d);
  });

  document.dispatchEvent(new CustomEvent('voceiro-ping'));

  setTimeout(() => {
    if (!USCRIPT_CHECKED){
      USCRIPT_CHECKED = true;
      actualizarBotonPendientes();
      actualizarSyncBanner();
    }
  }, 900);
}

function guardarParaLeerDespues(n){
  const url = n.enlace;
  const item = PENDIENTES_MAP.get(normalizeUrlForMatch(url));

  // No está → se añade
  if (!item){
    addPendiente({ url, title: n.titular, description: n.grupo || '' });
    toast(t('savedToReader'), 1800);
    return;
  }

  // Ya está → alterna leída / no leída
  const nuevaLeida = !item.read;
  if (nuevaLeida) marcarLeidaLocal(url);
  else            desmarcarLeidaLocal(url);
  setPendienteRead(url, nuevaLeida);
}
