'use strict';
{
  const api = globalThis.browser || globalThis.chrome;
  let actual;
  const estado = document.getElementById('estado');
  const error = e => { estado.textContent = e.message || String(e); };
  async function enviar(m){
    const r = await api.runtime.sendMessage(m);
    if (!r?.ok) throw new Error(r?.error || 'No se pudo abrir el lector');
  }
  document.getElementById('leer').disabled = true;
  document.getElementById('medio').disabled = true;
  api.tabs.query({active:true,currentWindow:true}).then(tabs => {
    actual = tabs[0];
    const web = /^https?:\/\//i.test(actual?.url || '');
    document.getElementById('leer').disabled = !web;
    document.getElementById('medio').disabled = !web;
    if (!web) estado.textContent = 'Abre una noticia en una página web. El lector no actúa en páginas internas ni en el visor PDF.';
  }).catch(error);
  document.getElementById('leer').onclick = () => enviar({tipo:'lector:abrir-pagina',pestana:actual.id}).then(() => window.close()).catch(error);
  document.getElementById('medio').onclick = () => {
    const origen = new URL(actual.url).origin+'/*';
    api.permissions.request({origins:[origen]}).then(async ok => {
      if (!ok) throw new Error('No se concedió el acceso a este medio');
      await enviar({tipo:'lector:habilitar',url:actual.url,pestana:actual.id});
      estado.textContent = 'Permiso concedido. Puedes configurar la apertura automática en Opciones › Medios.';
    }).catch(error);
  };
  document.getElementById('opciones').onclick = () => enviar({tipo:'lector:ajustes',tab:'sites',pestana:actual?.id,dominio:actual?.url ? new URL(actual.url).hostname : ''}).then(() => window.close()).catch(error);
}
