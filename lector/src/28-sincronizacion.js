/* ============================================================
   SINCRONIZACIÓN PROPIA
   ------------------------------------------------------------
   El lector es un dispositivo más de la sincronización de Voceiro
   (shared/sync/cliente.js): el mismo código y el mismo documento.
   Así lo de aquí llega a los otros dispositivos aunque Voceiro no
   esté abierto en este navegador.
   · Documento: se guarda entero (LECTOR_SYNC_DOC_KEY). Lo que el
     lector no usa (leídas, modos) se conserva y la fusión lo respeta.
   · Código: el de Voceiro, que llega por el puente y manda (si
     Voceiro lo quita, se quita aquí el que vino de allí), o uno
     escrito a mano en Ajustes › General, solo en la página de Voceiro:
     en otra web, la web podría leerlo.
   · Cuándo: tras un cambio de aquí (con espera, juntando los
     seguidos) y al abrir el lector si hace rato de la última vez.
     Nunca por cargar una página: el lector corre en todas. Si la
     página se cierra antes de subir, queda apuntado y lo hace la
     siguiente donde arranque el lector.
   · Dónde no: sin https (no hay WebCrypto) ni en la página de
     Voceiro, que sincroniza ella y recibe lo de aquí por el puente.
   ============================================================ */
const LECTOR_SYNC_KEY = 'lector-sync';            // { codigo, deVoceiro, cambio, subido, fallo, error }
const LECTOR_SYNC_DOC_KEY = 'lector-sync-doc';    // el último documento fusionado
const LECTOR_SYNC_CANDADO_KEY = 'lector-sync-candado';
const LECTOR_SYNC_ESPERA = 5000;
const LECTOR_SYNC_AL_ABRIR = 10 * 60 * 1000;
const LECTOR_SYNC_TRAS_FALLO = 5 * 60 * 1000;
const LECTOR_SYNC_CANDADO_MS = 3 * 60 * 1000;     // más que el peor caso del cliente
// var: saveCfg o el puente pueden llamar antes de que se evalúe este bloque.
var __syncLector = { diferido: null, enCurso: null, otraVez: false, cliente: null,
                     yo: Math.random().toString(36).slice(2) };

function estadoSyncLector(){
  const s = PLATAFORMA.leer(LECTOR_SYNC_KEY, null);
  return s && typeof s === 'object' ? s : {};
}
function guardarEstadoSyncLector(cambio){
  PLATAFORMA.guardar(LECTOR_SYNC_KEY, { ...estadoSyncLector(), ...cambio });
}
function codigoSyncLector(){
  return limpiarCodigo(estadoSyncLector().codigo || '');
}
// subido es cuándo empezó la última que salió bien: un cambio en ese mismo
// instante puede no haber ido, así que cuenta como pendiente.
function haySyncSinSubir(s = estadoSyncLector()){
  return (s.cambio || 0) > 0 && s.cambio >= (s.subido || 0);
}
function puedeSincronizarAqui(){
  return !!(window.isSecureContext && window.crypto && crypto.subtle) && !esVoceiro();
}

function activarSyncLector(codigo, deVoceiro){
  const c = limpiarCodigo(codigo);
  if (!c) return false;
  const s = estadoSyncLector();
  if (s.codigo === c && !!s.deVoceiro === !!deVoceiro) return true;
  // Otro código, otra cuenta: lo guardado de la anterior no se mezcla.
  if (s.codigo !== c){
    PLATAFORMA.guardar(LECTOR_SYNC_DOC_KEY, null);
    PLATAFORMA.guardar(LECTOR_SYNC_KEY, { codigo: c, deVoceiro: !!deVoceiro, cambio: Date.now() });
  } else {
    guardarEstadoSyncLector({ deVoceiro: !!deVoceiro });
  }
  sincronizarLectorPronto();
  return true;
}
function olvidarSyncLector(){
  clearTimeout(__syncLector.diferido);
  PLATAFORMA.guardar(LECTOR_SYNC_KEY, null);
  PLATAFORMA.guardar(LECTOR_SYNC_DOC_KEY, null);
}
// Lo que dice Voceiro por el puente: su código manda. Si no tiene, se
// quita aquí el que vino de allí; uno escrito a mano se queda.
function codigoDesdeVoceiro(codigo){
  const c = codigo ? limpiarCodigo(codigo) : null;
  if (c) activarSyncLector(c, true);
  else if (estadoSyncLector().deVoceiro) olvidarSyncLector();
}

// Un cambio de aquí: se apunta y se sube a los pocos segundos.
function sincronizarLectorPronto(){
  if (!codigoSyncLector()) return;
  guardarEstadoSyncLector({ cambio: Date.now() });
  if (!puedeSincronizarAqui()) return;
  clearTimeout(__syncLector.diferido);
  __syncLector.diferido = setTimeout(sincronizarLector, LECTOR_SYNC_ESPERA);
}
// Al abrir el lector: si queda algo por subir o hace rato de la última vez.
// Tras un fallo, espera: hay medios que abren el lector solos en cada noticia.
function sincronizarLectorAlAbrir(){
  const s = estadoSyncLector();
  if (Date.now() - (s.fallo || 0) < LECTOR_SYNC_TRAS_FALLO) return;
  if (haySyncSinSubir(s) || Date.now() - (s.subido || 0) > LECTOR_SYNC_AL_ABRIR) sincronizarLector();
}
// Al arrancar en una página: solo si quedó algo por subir (y no acaba de
// fallar: sin red no se reintenta en cada página).
function sincronizarLectorSiQuedoAlgo(){
  const s = estadoSyncLector();
  if (!haySyncSinSubir(s) || Date.now() - (s.fallo || 0) < LECTOR_SYNC_TRAS_FALLO) return;
  if (!puedeSincronizarAqui() || !codigoSyncLector()) return;
  clearTimeout(__syncLector.diferido);
  __syncLector.diferido = setTimeout(sincronizarLector, LECTOR_SYNC_ESPERA);
}

// Entre pestañas, una sola a la vez. No es atómico: si dos coinciden, el
// servidor (409) lo arregla; esto evita el caso normal.
function tomarCandadoSync(){
  const ahora = Date.now();
  const c = PLATAFORMA.leer(LECTOR_SYNC_CANDADO_KEY, null);
  if (c && c.quien !== __syncLector.yo && c.hasta > ahora) return false;
  PLATAFORMA.guardar(LECTOR_SYNC_CANDADO_KEY, { quien: __syncLector.yo, hasta: ahora + LECTOR_SYNC_CANDADO_MS });
  return true;
}
function soltarCandadoSync(){
  const c = PLATAFORMA.leer(LECTOR_SYNC_CANDADO_KEY, null);
  if (c && c.quien === __syncLector.yo) PLATAFORMA.guardar(LECTOR_SYNC_CANDADO_KEY, null);
}

// Las leídas van también con los avisos para Voceiro (11-pendientes.js):
// si dos pestañas apuntan a la vez en el documento, una puede pisar a la
// otra; en la cola sigue estando. Gana lo último de cada dirección.
function documentoDelLector(){
  const guardado = PLATAFORMA.leer(LECTOR_SYNC_DOC_KEY, null) || {};
  const leidas = { ...(guardado.leidas || {}) };
  const avisos = [...(CFG.leidasParaVoceiro || [])].sort((a, b) => a.fecha - b.fecha);
  for (const l of avisos){
    const k = normalizeUrlForMatch(l.url);
    if (!k) continue;
    if (l.quitar){ if ((leidas[k] || 0) <= l.fecha) delete leidas[k]; }
    else leidas[k] = Math.max(leidas[k] || 0, l.fecha);
  }
  return { ...guardado, v: 1, leidas, pendientes: CFG.readLater || [], perfil: perfilDelLector(),
           lector: bloqueConfigLector() };
}

// Con la sincronización activa, lo terminado aquí va también a las leídas
// del documento: así llega a Voceiro en los otros dispositivos.
function apuntarLeidaEnSync(url, quitar){
  const k = normalizeUrlForMatch(url);
  if (!k || !codigoSyncLector()) return;
  const doc = PLATAFORMA.leer(LECTOR_SYNC_DOC_KEY, null) || {};
  const leidas = { ...(doc.leidas || {}) };
  if (quitar) delete leidas[k];
  else leidas[k] = Date.now();
  PLATAFORMA.guardar(LECTOR_SYNC_DOC_KEY, { ...doc, leidas });
}

async function sincronizarLector(){
  const codigo = codigoSyncLector();
  if (!codigo || !puedeSincronizarAqui()) return;
  // Un cambio mientras va y viene: otra vuelta al terminar.
  if (__syncLector.enCurso){ __syncLector.otraVez = true; return __syncLector.enCurso; }
  clearTimeout(__syncLector.diferido);
  if (!tomarCandadoSync()){
    __syncLector.diferido = setTimeout(sincronizarLector, LECTOR_SYNC_ESPERA);
    return;
  }
  if (!__syncLector.cliente){
    __syncLector.cliente = crearCliente({ servidores: SERVIDORES_SYNC, fetch: PLATAFORMA.pedir });
  }
  __syncLector.enCurso = (async () => {
    const empezo = Date.now();
    try {
      const { documento } = await __syncLector.cliente.sincronizar(codigo, documentoDelLector());
      if (codigoSyncLector() !== codigo) return;    // lo cambiaron mientras
      // Las leídas apuntadas mientras iba y venía no se pierden.
      const ahora = PLATAFORMA.leer(LECTOR_SYNC_DOC_KEY, null) || {};
      PLATAFORMA.guardar(LECTOR_SYNC_DOC_KEY, { ...documento, leidas: fusionarLeidas(documento.leidas, ahora.leidas) });
      const antes = JSON.stringify(CFG);
      adoptarEnLector(documento);
      if (JSON.stringify(CFG) !== antes){
        saveCfg(CFG);
        if (__lectorAbierto) __lectorAbierto.refrescar();
        actualizarBoton();
      }
      guardarEstadoSyncLector({ subido: empezo, fallo: 0, error: '' });
    } catch(e){
      // Sin red o con los dos servidores caídos: todo sigue aquí y queda
      // apuntado; se reintenta con el próximo cambio o al abrir el lector.
      guardarEstadoSyncLector({ fallo: Date.now(), error: (e && e.message) || String(e) });
    } finally {
      soltarCandadoSync();
      __syncLector.enCurso = null;
      if (__syncLector.otraVez){
        __syncLector.otraVez = false;
        if (haySyncSinSubir()) __syncLector.diferido = setTimeout(sincronizarLector, LECTOR_SYNC_ESPERA);
      }
    }
  })();
  return __syncLector.enCurso;
}
