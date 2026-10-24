'use strict';
async function crearPlataformaExtension(){
  const api = globalThis.browser || globalThis.chrome;
  const propia = location.href.startsWith(api.runtime.getURL(''));
  const CFG = 'lector-universal-cfg-v8';
  const STATUS = 'lector-extension-estado';
  const SIGUIENTE = 'lector-abrir-al-llegar';
  const valores = await api.runtime.sendMessage({ tipo: 'lector:iniciar' });
  if (!valores?.ok) throw new Error(valores?.error || 'No se pudo iniciar el lector');
  const copia = x => x === undefined ? undefined : structuredClone(x);
  const cache = { [CFG]: valores.cfg, [STATUS]: valores.estado, [SIGUIENTE]: valores.siguiente };
  const oyentes = new Map();
  let cola = Promise.resolve(), version = 0;
  function notificar(clave, valor){
    if (JSON.stringify(cache[clave]) === JSON.stringify(valor)) return;
    cache[clave] = copia(valor);
    for (const fn of oyentes.get(clave) || []) fn(copia(valor));
  }
  function enviar(m){
    const tarea = cola.catch(() => {}).then(() => api.runtime.sendMessage(m)).then(r => {
      if (!r?.ok) throw new Error(r?.error || 'No se pudo guardar el cambio');
      return r;
    });
    cola = tarea;
    tarea.catch(e => console.error('[Lector Universal]', e.message));
    return tarea;
  }
  api.storage.onChanged.addListener((cambios, area) => {
    if (area !== 'local') return;
    if (cambios[STATUS]) notificar(STATUS, cambios[STATUS].newValue);
    // Las respuestas a nuestros propios cambios llevan el resultado fusionado.
    // Mientras hay escrituras, ese resultado evita sustituir una edición local.
    if (cambios[CFG]){
      const pendiente = cola;
      pendiente.then(() => {
        if (pendiente !== cola) return;
        const esta = version;
        return api.runtime.sendMessage({tipo:'lector:iniciar'}).then(r => {
          if (r?.ok && esta === version && pendiente === cola) notificar(CFG, r.cfg);
        });
      }).catch(() => {});
    }
  });
  return {
    esExtension: true, esPaginaPropia: propia,
    leer: (clave, defecto) => copia(cache[clave] ?? defecto),
    guardar(clave, valor){
      if (![CFG, SIGUIENTE].includes(clave)) throw new Error('Clave de almacenamiento no permitida');
      const base = copia(cache[clave]);
      cache[clave] = copia(valor);
      const esta = ++version;
      return enviar({tipo:'lector:guardar', clave, base, valor:copia(valor)}).then(r => {
        if (clave === CFG && esta === version && JSON.stringify(cache[CFG]) !== JSON.stringify(r.cfg)) notificar(CFG, r.cfg);
      });
    },
    vaciar: () => cola,
    alCambiar(clave, fn){
      if (!oyentes.has(clave)) oyentes.set(clave, new Set());
      oyentes.get(clave).add(fn);
      return () => oyentes.get(clave)?.delete(fn);
    },
    hayMenu: () => false, menu(){},
    abrirAjustes: (tab, dominio) => enviar({tipo:'lector:ajustes', tab, dominio}),
    analizar: dominio => enviar({tipo:'lector:analizar', dominio, pestana: Number(new URL(location.href).searchParams.get('pestana')) || null}),
    volverAVoceiro: () => enviar({tipo:'lector:volver'}),
    sync: (accion, datos = {}) => enviar({tipo:'lector:sync', accion, ...datos}),
    estado: () => copia(cache[STATUS] || {}),
    iniciar(acciones){
      if (propia){
        const p = new URL(location.href).searchParams;
        acciones.ajustes(p.get('tab') || 'sites', { dentro: document.getElementById('lector-opciones'), dominio: p.get('dominio') || '' });
      }
      api.runtime.onMessage.addListener((m, emisor, responder) => {
        if (emisor.id !== api.runtime.id || !m?.tipo?.startsWith('lector:')) return;
        if (m.tipo === 'lector:ping'){ responder({ok:true}); return; }
        if (m.tipo === 'lector:abrir'){ acciones.abrir(); responder({ok:true}); }
        if (m.tipo === 'lector:extraer'){
          const idx = acciones.sitio();
          if (idx < 0) responder({ok:false,error:'Añade primero este medio a los ajustes'});
          else { acciones.analizar(idx); responder({ok:true}); }
        }
      });
    }
  };
}
