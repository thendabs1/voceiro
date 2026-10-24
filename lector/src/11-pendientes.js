/* ============================================================
   9. PENDIENTES
   ============================================================ */
// La misma lista que Pendientes de Voceiro: se fusionan con la regla de
// shared/sync/fusion.js. Cada cambio lleva su fecha (actualizado) y lo
// borrado queda marcado (borrado) para que el borrado viaje; caduca solo.

// Sustituye la lista (normalizada), la guarda y se la manda a Voceiro.
function cambiarReadLater(nueva){
  CFG.readLater = fusionarPendientes(nueva, []);
  saveCfg(CFG);
  enviarEstado(false);
  sincronizarLectorPronto();
}
function pendientesVisibles(){
  return (CFG.readLater || []).filter(r => !r.borrado);
}
function conCambio(item, cambio){
  return [...CFG.readLater.filter(r => r !== item), { ...item, ...cambio, actualizado: Date.now() }];
}

function saveForLater(art){
  if (!art || !art.headline) return;
  const url = urlWebValida(art.url || location.href);
  if (!url) return;
  const existing = findLaterItem(url);

  if (existing){
    // Estaba → alterna pendiente / leída
    const leida = !existing.read;
    const quitar = leida && CFG.readerSettings?.keepReadItems === false;
    cambiarReadLater(conCambio(existing, { read: leida, readAt: leida ? Date.now() : null, ...(quitar ? { borrado: true } : {}) }));
    toast(t(leida ? 'movedToRead' : 'movedToPending'), 1800);
    return;
  }

  // No estaba → se añade como pendiente
  const ahora = Date.now();
  cambiarReadLater([...CFG.readLater, {
    url: url,
    title: art.headline || document.title || '',
    description: art.description || '',
    image: art.image || '',
    date: ahora,
    domain: normalizeDomain(new URL(url).hostname),
    read: false,
    readAt: null,
    actualizado: ahora
  }]);
  toast(t('savedLater'), 1800);
}

function removeFromLater(url){
  const item = pendientesVisibles().find(r => r.url === url);
  if (item) cambiarReadLater(conCambio(item, { borrado: true }));
}

// Quita los leídos (los deja marcados como borrados, para que viaje).
function borrarLeidos(){
  const ahora = Date.now();
  cambiarReadLater(CFG.readLater.map(r =>
    (r.read && !r.borrado) ? { ...r, borrado: true, actualizado: ahora } : r));
}

function toggleReadLater(url){
  const item = pendientesVisibles().find(r => r.url === url);
  if (!item) return false;
  const keepRead = !(CFG.readerSettings && CFG.readerSettings.keepReadItems === false);
  if (item.read){
    if (!keepRead) return false;
    cambiarReadLater(conCambio(item, { read: false, readAt: null }));
  } else if (keepRead){
    cambiarReadLater(conCambio(item, { read: true, readAt: Date.now() }));
  } else {
    cambiarReadLater(conCambio(item, { borrado: true }));
  }
  return true;
}

function findLaterItem(url){
  const href = String(url || '');
  if (!href) return null;

  const norm = normalizeUrlForMatch(href);
  for (const r of pendientesVisibles()){
    if (r.url === href) return r;
    if (normalizeUrlForMatch(r.url) === norm) return r;
  }

  if (normalizeUrlForMatch(href) !== normalizeUrlForMatch(location.href)) return null;
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical){
    const cAbs = absUrl(canonical.getAttribute('href') || '');
    if (cAbs){
      const cNorm = normalizeUrlForMatch(cAbs);
      for (const r of pendientesVisibles()){
        if (r.url === cAbs) return r;
        if (normalizeUrlForMatch(r.url) === cNorm) return r;
      }
    }
  }

  return null;
}




/* ── Al terminar de leer ──
   Voceiro cuenta como leído lo que se abre desde allí; lo que se termina
   aquí (abierto desde donde sea) se le avisa por el puente: leidasParaVoceiro
   es una lista corta de { url, fecha, quitar? } que Voceiro confirma con
   leidasHasta (la fecha más nueva que ya tiene). No viaja a otros
   dispositivos: allí llega por la sincronización, la de Voceiro o la
   propia del lector (apuntarLeidaEnSync, si hay código). */
const LEIDAS_AVISO_MAX = 200;

function avisarLeida(url, quitar){
  const ahora = Date.now();
  const aviso = { url: String(url), fecha: ahora };
  if (quitar) aviso.quitar = true;
  CFG.leidasParaVoceiro = [...(CFG.leidasParaVoceiro || []), aviso].slice(-LEIDAS_AVISO_MAX);
  apuntarLeidaEnSync(url, quitar);
}

// Lo que Voceiro ya tiene (fecha <= hasta) se quita de la lista.
function leidasConfirmadas(hasta){
  const antes = CFG.leidasParaVoceiro || [];
  const quedan = antes.filter(l => l.fecha > (hasta || 0));
  if (quedan.length !== antes.length) CFG.leidasParaVoceiro = quedan;
}
function hayLeidasSinAvisar(hasta){
  return (CFG.leidasParaVoceiro || []).some(l => l.fecha > (hasta || 0));
}

// Marca esta página como leída: en Pendientes, si está (respetando «guardar
// leídas»), y para Voceiro. Devuelve con qué deshacerlo, o null si ya lo
// estaba y no había nada que hacer.
function marcarLeidaAlTerminar(url = location.href){
  if (!urlWebValida(url)) return null;
  const item = findLaterItem(url);
  const antes = item ? { ...item } : null;
  if (item && !item.read){
    const keepRead = !(CFG.readerSettings && CFG.readerSettings.keepReadItems === false);
    CFG.readLater = conCambio(item, keepRead ? { read: true, readAt: Date.now() } : { borrado: true });
  }
  avisarLeida(url);
  cambiarReadLater(CFG.readLater);
  return () => {
    if (antes && !antes.read){
      const ahora = findLaterItem(url) || (CFG.readLater || []).find(r => r.url === antes.url);
      if (ahora) CFG.readLater = conCambio(ahora, { read: false, readAt: null, borrado: false });
    }
    avisarLeida(url, true);
    cambiarReadLater(CFG.readLater);
  };
}

// La siguiente pendiente sin leer, en el orden de la lista (más recientes
// primero): la que va detrás de esta o, si esta no está, la primera.
function siguientePendiente(url){
  const sinLeer = pendientesVisibles().filter(r => !r.read);
  const aqui = normalizeUrlForMatch(url || location.href);
  const i = sinLeer.findIndex(r => normalizeUrlForMatch(r.url) === aqui);
  const resto = i < 0 ? sinLeer : [...sinLeer.slice(i + 1), ...sinLeer.slice(0, i)];
  return resto.find(r => normalizeUrlForMatch(r.url) !== aqui) || null;
}

/* ── Abrir la siguiente con el lector ya abierto ──
   Antes de ir se apunta adónde (SIGUIENTE_KEY, aparte de CFG: no es
   configuración); al llegar, init lo ve y abre el lector. Vale la misma
   dirección o el mismo medio (por si redirige), durante dos minutos. */
const SIGUIENTE_KEY = 'lector-abrir-al-llegar';

async function irASiguientePendiente(siguiente){
  const url = urlWebValida(siguiente && siguiente.url);
  if (!url) return;
  await PLATAFORMA.guardar(SIGUIENTE_KEY, { url, t: Date.now() });
  if (PLATAFORMA.vaciar) await PLATAFORMA.vaciar();
  location.href = url;
}

function llegaDeSiguientePendiente(){
  const f = PLATAFORMA.leer(SIGUIENTE_KEY, null);
  if (!f || !f.url) return false;
  if (Date.now() - (f.t || 0) > 2 * 60 * 1000){ PLATAFORMA.guardar(SIGUIENTE_KEY, null); return false; }
  let mismoMedio = false;
  try { mismoMedio = normalizeDomain(new URL(f.url).hostname) === normalizeDomain(location.hostname); } catch(e){}
  if (!mismoMedio && normalizeUrlForMatch(f.url) !== normalizeUrlForMatch(location.href)) return false;
  PLATAFORMA.guardar(SIGUIENTE_KEY, null);
  return true;
}
