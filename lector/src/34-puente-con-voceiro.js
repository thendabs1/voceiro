/* ═══════════════════════════════════════════════════════════════
   PUENTE CON VOCEIRO (v2)
   ═══════════════════════════════════════════════════════════════
   Solo existe en la página de Voceiro. Eventos en document, uno por
   sentido para que nadie se oiga a sí mismo:
     · 'voceiro-ping'   Voceiro → lector; se responde 'voceiro-pong' {v}.
     · 'voceiro-ready'  lector → Voceiro, al arrancar {v}.
     · 'voceiro-estado' Voceiro → lector {v, respuesta, pendientes, perfil, modos}.
     · 'lector-estado'  lector → Voceiro, igual.
   Pendientes y perfil se fusionan con shared/sync/fusion.js. Los modos
   son de Voceiro: el lector solo los guarda (para llevarlos a otros
   dispositivos) y adopta los de Voceiro salvo que los suyos sean más
   nuevos. Cada lado contesta una vez, si lo suyo no coincide y el
   mensaje no era ya una respuesta: tras ese ida y vuelta, coinciden.
   ─────────────────────────────────────────────────────────────── */
const PUENTE_V = 2;

function modosDelLector(){
  const m = CFG.voceiro || {};
  return Array.isArray(m.presets) && m.presets.length
    ? { presets: m.presets, actualizado: m.actualizado || 0 }
    : null;
}

function estadoDelLector(respuesta){
  return {
    v: PUENTE_V, respuesta: !!respuesta,
    pendientes: CFG.readLater || [], perfil: perfilDelLector(), modos: modosDelLector()
  };
}

function comparableEstado(d){
  return huella({
    pendientes: fusionarPendientes(d && d.pendientes, []),
    perfil: limpiarPerfil(d && d.perfil),
    modos: d && d.modos ? { presets: d.modos.presets, actualizado: d.modos.actualizado || 0 } : null
  });
}

function enviarEstado(respuesta){
  if (!esVoceiro()) return;
  try {
    document.dispatchEvent(new CustomEvent('lector-estado', {
      detail: JSON.parse(JSON.stringify(estadoDelLector(respuesta)))
    }));
  } catch(e){}
}

(function initVoceiroBridge(){
  if (window.__voceiroBridgeReady) return;
  window.__voceiroBridgeReady = true;

  // Cambios hechos en otra pestaña: CFG se refresca en todas las páginas;
  // a Voceiro se le mandan solo en la suya (enviarEstado lo comprueba).
  PLATAFORMA.alCambiar(CFG_KEY, nuevo => {
    CFG = mergeCfg(DEFAULT_CFG, nuevo);
    __perfilFirma = firmaPerfilLector(CFG);
    enviarEstado(false);
  });

  // Lo demás solo existe en Voceiro.
  if (!esVoceiro()) return;

  document.addEventListener('voceiro-ping', () => {
    document.dispatchEvent(new CustomEvent('voceiro-pong', { detail: { v: PUENTE_V } }));
  });

  document.addEventListener('voceiro-estado', e => {
    const d = e.detail;
    if (!d || typeof d !== 'object' || d.v !== PUENTE_V) return;

    CFG.readLater = fusionarPendientes(CFG.readLater, d.pendientes);

    // Un perfil sin sellar no se impone: se unifican con el primer cambio.
    const mio = perfilDelLector();
    const perfil = fusionarPerfil(mio, d.perfil);
    if (perfil && perfil.actualizado > 0 && huella(perfil) !== huella(mio)) aplicarPerfilAlLector(perfil);

    const misModos = modosDelLector();
    if (d.modos && Array.isArray(d.modos.presets) &&
        (!misModos || (d.modos.actualizado || 0) >= misModos.actualizado)){
      CFG.voceiro = { presets: d.modos.presets, actualizado: d.modos.actualizado || 0 };
    }

    saveCfg(CFG);
    if (!d.respuesta && comparableEstado(estadoDelLector()) !== comparableEstado(d)){
      enviarEstado(true);
    }
  });

  try {
    document.dispatchEvent(new CustomEvent('voceiro-ready', { detail: { v: PUENTE_V } }));
  } catch(e){}
})();

if (document.body) init();
else window.addEventListener('DOMContentLoaded', init);

