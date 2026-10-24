'use strict';
const API_LECTOR = globalThis.browser || globalThis.chrome;
let colaMensajes = Promise.resolve();
const fondoListo = (async () => {
  const valores = await API_LECTOR.storage.local.get(null);
  let escrituras = Promise.resolve(), permisoSync = false;
  const STATUS = 'lector-extension-estado';
  const SIGUIENTES = 'lector-extension-siguientes';
  const copia = x => x === undefined ? undefined : structuredClone(x);
  function persistir(clave, valor){
    const snapshot = copia(valor);
    valores[clave] = snapshot;
    escrituras = escrituras.catch(() => {}).then(() => API_LECTOR.storage.local.set({[clave]:snapshot}));
    return escrituras;
  }
  function publicar(){
    const s = valores['lector-sync'] || {};
    return persistir(STATUS, { activo:!!s.codigo, deVoceiro:!!s.deVoceiro, permiso:permisoSync,
      subido:s.subido || 0, fallo:s.fallo || 0, error:String(s.error || '').slice(0,250) });
  }
  const PLATAFORMA = {
    leer: (k,d) => copia(valores[k] ?? d),
    guardar(k,v){ const r = persistir(k,v); if (k === 'lector-sync') publicar(); return r; },
    async pedir(url, opciones){
      if (!permisoSync || !SERVIDORES_SYNC.some(s => url.startsWith(s + '/v1/s/'))) throw new Error('Sin permiso para sincronizar');
      const p = await API_LECTOR.permissions.getAll();
      if (Array.isArray(p.data_collection) && !['browsingActivity','websiteContent'].every(k => p.data_collection.includes(k))) throw new Error('Permiso de sincronización retirado');
      return fetch(url, {...opciones, credentials:'omit', redirect:'error'});
    },
    puedeSincronizar: () => permisoSync,
    programarSync(){ API_LECTOR.alarms.create('lector-sync', {when:Date.now()+5000}); },
  };
  const window = globalThis;
  let __lectorAbierto = null;
  function actualizarBoton(){}
  /*{{COMUN}}*/
  if (!valores[CFG_KEY]){ CFG.fab.visible = false; saveCfg(CFG); }
  async function permisos(){
    const p = await API_LECTOR.permissions.getAll();
    permisoSync = Array.isArray(p.data_collection)
      ? ['browsingActivity','websiteContent'].every(k => p.data_collection.includes(k))
      : valores['lector-extension-online'] === true;
    await publicar();
  }
  async function registrar(){
    const p = await API_LECTOR.permissions.getAll();
    const matches = (p.origins || []).filter(o => !SERVIDORES_SYNC.some(s => o === s+'/*'));
    const scripts = await API_LECTOR.scripting.getRegisteredContentScripts();
    if (scripts.some(s => s.id === 'lector')) await API_LECTOR.scripting.unregisterContentScripts({ids:['lector']});
    if (matches.length) await API_LECTOR.scripting.registerContentScripts([{
      id:'lector', matches, js:['vendor/Readability.js','plataforma.js','lector.js'],
      allFrames:false, runAt:'document_idle', persistAcrossSessions:true
    }]);
    await permisos();
  }
  const propia = emisor => !!emisor.url?.startsWith(API_LECTOR.runtime.getURL(''));
  const voceiro = emisor => {
    try { const u = new URL(emisor.url); return u.origin === 'https://thendabs1.github.io' && /^\/voceiro(\/|$)/.test(u.pathname); }
    catch(e){ return false; }
  };
  async function inyectar(pestana){
    try { const r = await API_LECTOR.tabs.sendMessage(pestana, {tipo:'lector:ping'}); if (r?.ok) return; } catch(e){}
    await API_LECTOR.scripting.executeScript({target:{tabId:pestana}, files:['vendor/Readability.js','plataforma.js','lector.js']});
  }
  async function ajustes(m, emisor){
    const url = new URL(API_LECTOR.runtime.getURL('opciones.html'));
    const tab = ['sites','pendientes','dict','servicios','shortcuts','general'].includes(m.tab) ? m.tab : 'sites';
    url.searchParams.set('tab', tab);
    const dominio = normalizeDomain(m.dominio);
    if (dominio) url.searchParams.set('dominio', dominio);
    const pestana = emisor.tab?.id || (propia(emisor) && Number.isInteger(m.pestana) ? m.pestana : null);
    if (pestana) url.searchParams.set('pestana', pestana);
    await API_LECTOR.tabs.create({url:url.href});
  }
  async function manejar(m, emisor){
    if (emisor.id !== API_LECTOR.runtime.id || (emisor.frameId !== undefined && emisor.frameId !== 0)) throw new Error('Emisor no permitido');
    switch(m.tipo){
      case 'lector:iniciar': return {ok:true,cfg:copia(CFG),estado:copia(valores[STATUS]),siguiente:valores[SIGUIENTES]?.[emisor.tab?.id] || null};
      case 'lector:guardar': {
        if (m.clave === CFG_KEY){
          const base = mergeCfg(DEFAULT_CFG, m.base), nuevo = mergeCfg(DEFAULT_CFG, m.valor);
          CFG = mergeCfg(DEFAULT_CFG, fusionarCambiosCfg(CFG, base, nuevo, fusionarPendientes));
          saveCfg(CFG);
        } else if (m.clave === SIGUIENTE_KEY && emisor.tab?.id){
          const siguientes = {...(valores[SIGUIENTES] || {})};
          if (m.valor && urlWebValida(m.valor.url)) siguientes[emisor.tab.id] = {url:m.valor.url,t:Date.now()};
          else delete siguientes[emisor.tab.id];
          persistir(SIGUIENTES, siguientes);
        } else throw new Error('Clave no permitida');
        break;
      }
      case 'lector:ajustes': await ajustes(m, emisor); break;
      case 'lector:abrir-pagina': {
        if (!propia(emisor) || !Number.isInteger(m.pestana)) throw new Error('Acción no permitida');
        await inyectar(m.pestana);
        const r = await API_LECTOR.tabs.sendMessage(m.pestana,{tipo:'lector:abrir'});
        if (!r?.ok) throw new Error(r?.error || 'No se pudo abrir la noticia');
        break;
      }
      case 'lector:habilitar': {
        if (!propia(emisor)) throw new Error('Acción no permitida');
        const url = urlWebValida(m.url);
        if (!url || !await API_LECTOR.permissions.contains({origins:[new URL(url).origin+'/*']})) throw new Error('Falta permiso para este medio');
        addSiteAnywhere(new URL(url).hostname);
        CFG.fab.visible = true; saveCfg(CFG);
        await registrar();
        if (Number.isInteger(m.pestana)) await inyectar(m.pestana);
        break;
      }
      case 'lector:analizar': {
        if (!propia(emisor) || !Number.isInteger(m.pestana)) throw new Error('Abre los ajustes desde la noticia que quieres analizar');
        const tab = await API_LECTOR.tabs.get(m.pestana);
        if (!urlWebValida(tab.url) || !domainMatches(new URL(tab.url).hostname, normalizeDomain(m.dominio))) throw new Error('Abre una noticia de ese medio');
        await inyectar(m.pestana);
        const r = await API_LECTOR.tabs.sendMessage(m.pestana,{tipo:'lector:extraer'});
        if (!r?.ok) throw new Error(r?.error || 'No se pudo analizar la noticia');
        await API_LECTOR.tabs.update(m.pestana,{active:true});
        break;
      }
      case 'lector:volver': {
        if (!emisor.tab?.id) throw new Error('No hay una noticia abierta');
        const tabs = await API_LECTOR.tabs.query({});
        const destino = tabs.find(t => t.id !== emisor.tab.id && t.url && voceiro({url:t.url}));
        await escrituras;
        if (destino){
          await API_LECTOR.tabs.update(destino.id,{active:true});
          await API_LECTOR.windows.update(destino.windowId,{focused:true});
          await API_LECTOR.tabs.remove(emisor.tab.id);
        } else await API_LECTOR.tabs.update(emisor.tab.id,{url:VOCEIRO_URL});
        break;
      }
      case 'lector:permisos':
        if (!propia(emisor)) throw new Error('Acción no permitida');
        if (typeof m.online === 'boolean') persistir('lector-extension-online',m.online);
        await registrar();
        if (permisoSync) sincronizarLectorSiQuedoAlgo();
        break;
      case 'lector:sync': {
        if (['vincular','olvidar','ahora'].includes(m.accion) && !propia(emisor)) throw new Error('Abre la configuración para sincronizar');
        if (m.accion === 'voceiro'){
          if (!voceiro(emisor)) throw new Error('El código debe proceder de Voceiro');
          codigoDesdeVoceiro(m.codigo);
        } else if (m.accion === 'vincular'){
          if (!activarSyncLector(m.codigo,false)) throw new Error('Código no válido');
        } else if (m.accion === 'olvidar') olvidarSyncLector();
        else if (m.accion === 'ahora'){ if (!permisoSync) throw new Error('Permite primero la sincronización en Opciones'); await sincronizarLector(); }
        else if (m.accion === 'leida'){
          if (!urlWebValida(m.url)) throw new Error('Dirección no válida');
          apuntarLeidaEnSync(m.url, !!m.quitar);
        } else if (m.accion === 'programar') sincronizarLectorPronto();
        else if (m.accion === 'al-abrir') sincronizarLectorAlAbrir();
        else throw new Error('Operación de sincronización no permitida');
        break;
      }
      default: throw new Error('Operación no permitida');
    }
    await escrituras;
    return {ok:true,cfg:copia(CFG),estado:copia(valores[STATUS])};
  }
  await registrar();
  sincronizarLectorSiQuedoAlgo();
  return {manejar, registrar, async sincronizar(){ await sincronizarLector(); await escrituras; }};
})();
function ejecutar(fn){
  const tarea = colaMensajes.catch(() => {}).then(() => fondoListo).then(fn);
  colaMensajes = tarea;
  return tarea;
}
API_LECTOR.runtime.onMessage.addListener((m, emisor, responder) => {
  if (!m?.tipo?.startsWith('lector:')) return;
  ejecutar(f => f.manejar(m,emisor)).then(responder, e => responder({ok:false,error:e.message}));
  return true;
});
API_LECTOR.alarms.onAlarm.addListener(a => {
  if (a.name === 'lector-sync') ejecutar(f => f.sincronizar()).catch(console.error);
});
for (const evento of [API_LECTOR.permissions.onAdded, API_LECTOR.permissions.onRemoved]){
  evento.addListener(() => ejecutar(f => f.registrar()).catch(console.error));
}
API_LECTOR.runtime.onStartup.addListener(() => ejecutar(f => f.registrar()).catch(console.error));
