/* ═══════════════════════════════════════════════════════════════
   PUENTE CON VOCEIRO (v2)
   ═══════════════════════════════════════════════════════════════
   Solo existe en la página de Voceiro. Eventos en document, uno por
   sentido para que nadie se oiga a sí mismo:
     · 'voceiro-ping'   Voceiro → lector; se responde 'voceiro-pong' {v}.
     · 'voceiro-ready'  lector → Voceiro, al arrancar {v}.
     · 'voceiro-estado' Voceiro → lector {v, respuesta, pendientes, perfil, lector,
                        leidasHasta, sync}. sync: el código de sincronización
                        de Voceiro, o null; el lector lo sigue (28-sincronizacion.js).
     · 'lector-estado'  lector → Voceiro {…, leidas}: lo terminado en el lector
                        (11-pendientes.js); Voceiro lo confirma con leidasHasta.
     · 'voceiro-ajustes-lector' Voceiro → lector {v, dominio?}: pinta tus
                        ajustes en #aj-lector-panel (página Lector de Ajustes);
                        con dominio («Cómo leerlo»), en Medios y con ese medio.
   Pendientes y perfil se fusionan con shared/sync/fusion.js. «lector» es
   la configuración propia del lector: Voceiro la guarda sin mirarla y la
   lleva a otros dispositivos con su sincronización; gana la más reciente.
   Cada lado contesta una vez, si lo suyo no coincide y el mensaje no era
   ya una respuesta: tras ese ida y vuelta, coinciden.
   ─────────────────────────────────────────────────────────────── */
const PUENTE_V = 2;

function datosDelPuente(detail){
  try { return typeof detail === 'string' ? JSON.parse(detail) : detail; }
  catch(e){ return null; }
}

function estadoDelLector(respuesta){
  return {
    v: PUENTE_V, respuesta: !!respuesta,
    pendientes: CFG.readLater || [], perfil: perfilDelLector(), lector: bloqueConfigLector(),
    leidas: CFG.leidasParaVoceiro || []
  };
}

function comparableEstado(d){
  return huella({
    pendientes: fusionarPendientes(d && d.pendientes, []),
    perfil: limpiarPerfil(d && d.perfil),
    lector: d && d.lector ? { datos: d.lector.datos, actualizado: d.lector.actualizado || 0 } : null
  });
}

// Lo que llega de fuera (Voceiro por el puente o el servidor de
// sincronización): Pendientes se fusionan; perfil y configuración, el más
// reciente. Un perfil sin sellar no se impone: se unifican con el primer cambio.
function adoptarEnLector(d){
  CFG.readLater = fusionarPendientes(CFG.readLater, d.pendientes);

  const mio = perfilDelLector();
  const perfil = fusionarPerfil(mio, d.perfil);
  if (perfil && perfil.actualizado > 0 && huella(perfil) !== huella(mio)) aplicarPerfilAlLector(perfil);

  const mia = bloqueConfigLector();
  const llega = d.lector;
  if (llega && llega.datos && (llega.actualizado || 0) > (mia.actualizado || 0)){
    aplicarBloqueConfig(llega);
  }
}

function enviarEstado(respuesta){
  if (!esVoceiro()) return;
  try {
    document.dispatchEvent(new CustomEvent('lector-estado', {
      detail: JSON.stringify(estadoDelLector(respuesta))
    }));
  } catch(e){}
}

// Volver a Voceiro: la pestaña que se cierra lo apunta aquí y la de Voceiro,
// al enterarse, se pone delante (si el gestor sabe hacerlo).
const VOLVER_KEY = 'lector-volver-a-voceiro';

(function initVoceiroBridge(){
  if (window.__voceiroBridgeReady) return;
  window.__voceiroBridgeReady = true;

  // Cambios hechos en otra pestaña: CFG se refresca en todas las páginas;
  // a Voceiro se le mandan solo en la suya (enviarEstado lo comprueba).
  PLATAFORMA.alCambiar(CFG_KEY, nuevo => {
    CFG = mergeCfg(DEFAULT_CFG, nuevo);
    __perfilFirma = firmaPerfilLector(CFG);
    __configFirma = firmaConfig(CFG);
    if (__lectorAbierto) __lectorAbierto.refrescar();
    actualizarBoton();
    enviarEstado(false);
  });

  // Lo demás solo existe en Voceiro.
  if (!esVoceiro()) return;

  PLATAFORMA.alCambiar(VOLVER_KEY, () => PLATAFORMA.enfocarPestana());

  // Página Lector de Ajustes de Voceiro: deja un hueco y avisa; el panel de
  // ajustes del lector se pinta ahí (una vez: si ya está, no se repite).
  // Con dominio se vuelve a pintar, en Medios y con ese medio delante.
  document.addEventListener('voceiro-ajustes-lector', e => {
    const d = datosDelPuente(e.detail);
    if (!d || d.v !== PUENTE_V) return;
    const hueco = document.getElementById('aj-lector-panel');
    if (!hueco) return;
    const dominio = typeof d.dominio === 'string' ? normalizeDomain(d.dominio) : '';
    if (dominio){
      const viejo = hueco.querySelector('.il-settings-dentro');
      if (viejo) viejo.remove();
    }
    openSettings('sites', { dentro: hueco, dominio });
  });

  document.addEventListener('voceiro-ping', () => {
    document.dispatchEvent(new CustomEvent('voceiro-pong', { detail: JSON.stringify({ v: PUENTE_V }) }));
  });

  document.addEventListener('voceiro-estado', e => {
    const d = datosDelPuente(e.detail);
    if (!d || typeof d !== 'object' || d.v !== PUENTE_V) return;

    adoptarEnLector(d);
    // Un Voceiro anterior no manda el campo: entonces no se toca nada.
    if ('sync' in d) codigoDesdeVoceiro(d.sync);

    // Leídas que Voceiro ya tiene: fuera. Si quedan, se le vuelven a mandar.
    leidasConfirmadas(d.leidasHasta);

    saveCfg(CFG);
    if (__lectorAbierto) __lectorAbierto.refrescar();
    if (!d.respuesta && (comparableEstado(estadoDelLector()) !== comparableEstado(d) ||
                         hayLeidasSinAvisar(d.leidasHasta))){
      enviarEstado(true);
    }
  });

  try {
    document.dispatchEvent(new CustomEvent('voceiro-ready', { detail: JSON.stringify({ v: PUENTE_V }) }));
  } catch(e){}
})();

function abrirAjustesDesdeEnlace(){
  if (!esVoceiro()) return;
  const p = new URLSearchParams(location.hash.slice(1));
  const tab = p.get('lector');
  if (!['sites','pendientes','dict','servicios','shortcuts','general'].includes(tab)) return;
  openSettings(tab, { dominio: normalizeDomain(p.get('dominio')) });
}
window.addEventListener('hashchange', abrirAjustesDesdeEnlace);
abrirAjustesDesdeEnlace();

if (document.body) init();
else window.addEventListener('DOMContentLoaded', init);

