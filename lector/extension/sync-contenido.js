// El fondo cifra y sincroniza. Los mensajes entregan solo estado público,
// sin código ni un proxy de peticiones. El código está en storage.local de
// la extensión, accesible a sus contextos aislados pero no a la web.
function estadoSyncLector(){ return PLATAFORMA.estado(); }
function codigoSyncLector(){ return estadoSyncLector().activo ? true : null; }
function puedeSincronizarAqui(){ return !!estadoSyncLector().permiso; }
function activarSyncLector(codigo){
  const limpio = limpiarCodigo(codigo);
  if (!limpio) return false;
  PLATAFORMA.sync('vincular', {codigo:limpio});
  return true;
}
function codigoDesdeVoceiro(codigo){ PLATAFORMA.sync('voceiro', {codigo}); }
function olvidarSyncLector(){ PLATAFORMA.sync('olvidar'); }
function sincronizarLectorPronto(){ PLATAFORMA.sync('programar'); }
function sincronizarLectorAlAbrir(){ PLATAFORMA.sync('al-abrir'); }
function sincronizarLectorSiQuedoAlgo(){}
function sincronizarLector(){ return PLATAFORMA.sync('ahora'); }
function apuntarLeidaEnSync(url, quitar){ PLATAFORMA.sync('leida', {url, quitar:!!quitar}); }
