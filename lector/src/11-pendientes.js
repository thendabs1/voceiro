/* ============================================================
   9. PENDIENTES
   ============================================================ */
function notifyLaterChanged(){
  if (!esVoceiro()) return;
  try {
    // La lista entera (como 'voceiro-later-list'): Voceiro sustituye su
    // copia con lo que llega, y con un recorte perdería el resto.
    document.dispatchEvent(new CustomEvent('voceiro-later-changed', {
      detail: { items: CFG.readLater.slice(0, PENDIENTES_PUENTE_MAX) }
    }));
  } catch(e){}
}

function saveForLater(art){
  if (!art || !art.headline) return;
  const url = location.href;

  const existing = findLaterItem(url);

  if (existing){
    if (existing.read){
      // Estaba leída → pasa a pendientes
      existing.read = false;
      delete existing.readAt;
      saveCfg(CFG);
      notifyLaterChanged();
      toast(t('movedToPending'), 1800);
    } else {
      // Estaba pendiente → vuelve a leídas
      existing.read = true;
      existing.readAt = new Date().toISOString();
      saveCfg(CFG);
      notifyLaterChanged();
      toast(t('movedToRead'), 1800);
    }
    return;
  }

  // No estaba → se añade como pendiente
  CFG.readLater.unshift({
    url: url,
    title: art.headline || document.title || '',
    description: art.description || '',
    image: art.image || '',
    date: new Date().toISOString(),
    domain: normalizeDomain(location.hostname),
    read: false
  });
  try {
    const size = JSON.stringify(CFG.readLater).length;
    if (size > 500000) CFG.readLater = CFG.readLater.slice(0, 200);
  } catch(e){}
  saveCfg(CFG);
  notifyLaterChanged();
  toast(t('savedLater'), 1800);
}

function removeFromLater(url){
  const before = CFG.readLater.length;
  CFG.readLater = CFG.readLater.filter(r => r.url !== url);
  if (CFG.readLater.length < before){
    saveCfg(CFG);
    notifyLaterChanged();
  }
}

function toggleReadLater(url){
  const item = CFG.readLater.find(r => r.url === url);
  if (!item) return false;
  const keepRead = !(CFG.readerSettings && CFG.readerSettings.keepReadItems === false);
  if (item.read){
    if (keepRead){
      item.read = false;
      delete item.readAt;
    } else {
      return false;
    }
  } else {
    if (keepRead){
      item.read = true;
      item.readAt = new Date().toISOString();
    } else {
      CFG.readLater = CFG.readLater.filter(r => r.url !== url);
    }
  }
  saveCfg(CFG);
  notifyLaterChanged();
  return true;
}

/* ─── Normalización de URLs para comparar ─── */
function normalizeUrlForMatch(u){
  try {
    const url = new URL(u, location.href);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content',
     'fbclid','gclid','mc_cid','mc_eid','igshid','_ga','_gl','ref','referrer']
      .forEach(k => url.searchParams.delete(k));
    if (url.pathname.length > 1 && url.pathname.endsWith('/')){
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.href;
  } catch(e){ return String(u || ''); }
}

function findLaterItem(url){
  const href = String(url || '');
  if (!href) return null;

  const norm = normalizeUrlForMatch(href);
  for (const r of CFG.readLater){
    if (r.url === href) return r;
    if (normalizeUrlForMatch(r.url) === norm) return r;
  }

  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical){
    const cAbs = absUrl(canonical.getAttribute('href') || '');
    if (cAbs){
      const cNorm = normalizeUrlForMatch(cAbs);
      for (const r of CFG.readLater){
        if (r.url === cAbs) return r;
        if (normalizeUrlForMatch(r.url) === cNorm) return r;
      }
    }
  }

  return null;
}




