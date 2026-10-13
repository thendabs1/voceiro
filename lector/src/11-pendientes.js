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
}
function pendientesVisibles(){
  return (CFG.readLater || []).filter(r => !r.borrado);
}
function conCambio(item, cambio){
  return [...CFG.readLater.filter(r => r !== item), { ...item, ...cambio, actualizado: Date.now() }];
}

function saveForLater(art){
  if (!art || !art.headline) return;
  const url = location.href;
  const existing = findLaterItem(url);

  if (existing){
    // Estaba → alterna pendiente / leída
    const leida = !existing.read;
    cambiarReadLater(conCambio(existing, { read: leida, readAt: leida ? Date.now() : null }));
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
    domain: normalizeDomain(location.hostname),
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




