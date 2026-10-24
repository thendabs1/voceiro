'use strict';
{
  const api = globalThis.browser || globalThis.chrome;
  const estado = document.getElementById('estado');
  const tipos = ['browsingActivity','websiteContent'];
  const firefox = typeof api.runtime.getBrowserInfo === 'function';
  const mostrar = e => { estado.textContent = e.message || String(e); };
  async function enviar(datos){
    const r = await api.runtime.sendMessage({tipo:'lector:permisos',...datos});
    if (!r?.ok) throw new Error(r?.error || 'No se pudieron actualizar los permisos');
    await pintar();
  }
  async function pintar(){
    const p = await api.permissions.getAll();
    const r = await api.runtime.sendMessage({tipo:'lector:iniciar'});
    document.getElementById('conexion').checked = !!r?.estado?.permiso;
    const lista = document.getElementById('sitios');
    lista.replaceChildren();
    for (const origen of (p.origins || []).filter(o => !/^https:\/\/(voceiro-sync\.|sync\.voceiro\.eu\/)/.test(o))){
      const fila = document.createElement('li');
      fila.append(document.createTextNode(origen));
      const quitar = document.createElement('button');
      quitar.textContent = 'Retirar permiso';
      quitar.onclick = () => api.permissions.remove({origins:[origen]}).then(() => enviar({})).catch(mostrar);
      fila.append(quitar); lista.append(fila);
    }
  }
  document.getElementById('todos').onclick = () => {
    api.permissions.request({origins:['http://*/*','https://*/*']})
      .then(ok => { if (!ok) throw new Error('No se concedió el acceso'); return enviar({}); }).catch(mostrar);
  };
  document.getElementById('voceiro').onclick = () => {
    api.permissions.request({origins:['https://thendabs1.github.io/*']})
      .then(async ok => {
        if (!ok) throw new Error('No se concedió el acceso a Voceiro');
        await enviar({}); await api.tabs.create({url:'https://thendabs1.github.io/voceiro/'});
      }).catch(mostrar);
  };
  document.getElementById('conexion').onchange = e => {
    const activo = e.target.checked;
    const permiso = firefox
      ? (activo ? api.permissions.request({data_collection:tipos}) : api.permissions.remove({data_collection:tipos}))
      : Promise.resolve(true);
    permiso.then(ok => {
      if (!ok) throw new Error('No se concedió permiso para sincronizar');
      return enviar({online:activo});
    }).catch(e => { mostrar(e); pintar().catch(mostrar); });
  };
  globalThis.__lectorExtensionListo?.catch(mostrar);
  pintar().catch(mostrar);
}
