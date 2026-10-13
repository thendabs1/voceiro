/* ═══════════════════════════════════════════════════════════════
   PUENTE CON VOCEIRO
   ═══════════════════════════════════════════════════════════════
   Eventos entrantes (Voceiro → UserScript):
     · 'voceiro-ping'             → responde 'voceiro-pong'
     · 'voceiro-get-config'       → responde 'voceiro-config-data'
     · 'voceiro-save-later'       → guarda en CFG.readLater, responde 'voceiro-save-later-done'
     · 'voceiro-mark-read'        → toggle read, responde 'voceiro-mark-read-done'
     · 'voceiro-remove-later'     → quita de CFG.readLater, responde 'voceiro-remove-later-done'
     · 'voceiro-later-list'       → responde 'voceiro-later-list-data'

   Eventos salientes (UserScript → Voceiro):
     · 'voceiro-ready'            → al arrancar
     · 'voceiro-config-changed'   → cuando CFG cambia (local o remoto)
     · 'voceiro-later-changed'    → cuando readLater cambia
   ─────────────────────────────────────────────────────────── */
(function initVoceiroBridge(){
  if (window.__voceiroBridgeReady) return;
  window.__voceiroBridgeReady = true;

  function _configSnapshot(){
    return {
      sites: CFG.sites || [],
      prefs: CFG.prefs || {},
      lang: CFG.lang || 'es',
      disabledDomains: CFG.disabledDomains || [],
      siteTypes: CFG.siteTypes || [],
      siteTags: CFG.siteTags || [],
      customCatalog: CFG.customCatalog || [],
      readLater: CFG.readLater || [],
      readerSettings: CFG.readerSettings || { keepReadItems: true },
      readerAutoAll: !!CFG.readerAutoAll,
      voceiro: CFG.voceiro || { presets: [] },
    };
  }

  function _saveExternal(item){
    if (!item || !item.url || !item.title) return { ok: false, reason: 'invalid' };
    const wantsRead = !!item.read;

    const existing = CFG.readLater.find(r => r.url === item.url);
    if (existing){
      if (wantsRead && !existing.read){
        existing.read = true;
        existing.readAt = new Date().toISOString();
        saveCfg(CFG);
        return { ok: true, added: false, updated: true };
      }
      return { ok: true, added: false };
    }

    let domain = '';
    try { domain = normalizeDomain(new URL(item.url).hostname); } catch(e){}
    const entry = {
      url: item.url,
      title: item.title,
      description: item.description || '',
      image: item.image || '',
      date: new Date().toISOString(),
      domain,
      read: wantsRead
    };
    if (wantsRead) entry.readAt = new Date().toISOString();
    CFG.readLater.unshift(entry);
    try {
      const size = JSON.stringify(CFG.readLater).length;
      if (size > 500000) CFG.readLater = CFG.readLater.slice(0, 200);
    } catch(e){}
    saveCfg(CFG);
    return { ok: true, added: true };
  }

  function _notifyConfigChanged(){
    document.dispatchEvent(new CustomEvent('voceiro-config-changed', {
      detail: _configSnapshot()
    }));
  }

  /* Cambios externos (otra pestaña, otro medio) vía GM storage. CFG se
     refresca en todas las páginas; los avisos a Voceiro, solo en la suya. */
  PLATAFORMA.alCambiar(CFG_KEY, nuevo => {
    CFG = mergeCfg(DEFAULT_CFG, nuevo);
    try {
      __lastSitesSerialized = JSON.stringify({
        sites: CFG.sites || [],
        readerAutoAll: !!CFG.readerAutoAll,
        disabledDomains: CFG.disabledDomains || [],
      });
    } catch(e){}
    notifyConfigChanged();
    notifyLaterChanged();
  });

  // El resto del puente (oyentes y aviso de arranque) solo existe en
  // Voceiro: en cualquier otra web no hay nada que pedir ni que escuchar.
  if (!esVoceiro()) return;

  document.addEventListener('voceiro-ping', () => {
    document.dispatchEvent(new CustomEvent('voceiro-pong'));
  });

  document.addEventListener('voceiro-get-config', () => {
    document.dispatchEvent(new CustomEvent('voceiro-config-data', {
      detail: _configSnapshot()
    }));
  });

  document.addEventListener('voceiro-update-site', e => {
    const d = e.detail || {};
    const domain = normalizeDomain(d.domain || '');
    if (!domain){
      document.dispatchEvent(new CustomEvent('voceiro-update-site-done', {
        detail: { ok: false, reason: 'invalid-domain' }
      }));
      return;
    }
    let site = CFG.sites.find(s => s.domain === domain);
    let created = false;
    if (!site){
      created = addSiteAnywhere(domain, {
        mode: 'prompt',
        lang: d.lang || 'auto',
        type: d.type || '',
        tags: d.tags || []
      });
      site = CFG.sites.find(s => s.domain === domain);
      if (!site){
        document.dispatchEvent(new CustomEvent('voceiro-update-site-done', {
          detail: { ok: false, reason: 'could-not-add' }
        }));
        return;
      }
    } else {
      if (d.lang !== undefined) site.lang = d.lang;
      if (d.type !== undefined) site.type = d.type;
      if (d.tags !== undefined) site.tags = d.tags;
    }

    // NUEVO: feedMode es exclusivo de Voceiro. El plugin solo lo persiste.
    if (typeof d.feedMode === 'string' && ['', 'first', 'ignore'].includes(d.feedMode)){
      site.feedMode = d.feedMode;
    }

    saveCfg(CFG);
    _notifyConfigChanged();
    document.dispatchEvent(new CustomEvent('voceiro-update-site-done', {
      detail: { ok: true, created }
    }));
  });

  document.addEventListener('voceiro-save-voceiro-state', e => {
    const data = e.detail;
    if (!data || typeof data !== 'object'){
      document.dispatchEvent(new CustomEvent('voceiro-save-voceiro-state-done', {
        detail: { ok: false, reason: 'invalid' }
      }));
      return;
    }
    if (!Array.isArray(data.presets)){
      document.dispatchEvent(new CustomEvent('voceiro-save-voceiro-state-done', {
        detail: { ok: false, reason: 'no-presets-array' }
      }));
      return;
    }
    // Con su fecha: Voceiro solo adopta la copia del plugin si es más nueva.
    CFG.voceiro = {
      presets: data.presets,
      actualizado: Number(data.actualizado) || Date.now()
    };
    saveCfg(CFG);
    document.dispatchEvent(new CustomEvent('voceiro-save-voceiro-state-done', {
      detail: { ok: true }
    }));
  });

  document.addEventListener('voceiro-set-auto-all', e => {
    const d = e.detail || {};
    const next = !!d.enabled;
    if (CFG.readerAutoAll === next){
      document.dispatchEvent(new CustomEvent('voceiro-set-auto-all-done', {
        detail: { ok: true, changed: false, readerAutoAll: next }
      }));
      return;
    }
    CFG.readerAutoAll = next;
    saveCfg(CFG);
    paintReaderFAB();
    _notifyConfigChanged();
    if (next && !document.getElementById('il-full') && shouldActivateHere()){
      setTimeout(() => activateReader(), 200);
    }
    document.dispatchEvent(new CustomEvent('voceiro-set-auto-all-done', {
      detail: { ok: true, changed: true, readerAutoAll: next }
    }));
  });

  document.addEventListener('voceiro-save-later', e => {
    const res = _saveExternal(e.detail || {});
    if (res.ok && (res.added || res.updated)) notifyLaterChanged();
    document.dispatchEvent(new CustomEvent('voceiro-save-later-done', { detail: res }));
  });

  document.addEventListener('voceiro-mark-read', e => {
    const url = (e.detail && e.detail.url) || '';
    if (!url){
      document.dispatchEvent(new CustomEvent('voceiro-mark-read-done', {
        detail: { ok: false, reason: 'no-url' }
      }));
      return;
    }
    const ok = toggleReadLater(url);
    document.dispatchEvent(new CustomEvent('voceiro-mark-read-done', { detail: { ok, url } }));
  });

  document.addEventListener('voceiro-remove-later', e => {
    const url = (e.detail && e.detail.url) || '';
    if (!url) return;
    removeFromLater(url);
    document.dispatchEvent(new CustomEvent('voceiro-remove-later-done', {
      detail: { ok: true, url }
    }));
  });

  document.addEventListener('voceiro-later-list', () => {
    document.dispatchEvent(new CustomEvent('voceiro-later-list-data', {
      detail: { items: (CFG.readLater || []).slice(0, PENDIENTES_PUENTE_MAX) }
    }));
  });

  try {
    document.dispatchEvent(new CustomEvent('voceiro-ready'));
  } catch(e){}
})();

if (document.body) init();
else window.addEventListener('DOMContentLoaded', init);

