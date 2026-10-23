/* ============================================================
   1b. PLATAFORMA (userscript)
   ------------------------------------------------------------
   Lo único que depende del gestor de userscripts: leer y guardar
   la configuración, enterarse de los cambios hechos en otra
   pestaña, pedir al servidor de sincronización y el menú del
   gestor. La extensión tendrá su propia
   versión de este archivo, con la misma forma.
   ============================================================ */
const PLATAFORMA = {
  leer(clave, porDefecto){
    try {
      if (typeof GM_getValue === 'function') return GM_getValue(clave, porDefecto);
      const raw = localStorage.getItem(clave);
      return raw === null ? porDefecto : JSON.parse(raw);
    } catch(e){ return porDefecto; }
  },
  guardar(clave, valor){
    try {
      if (typeof GM_setValue === 'function') GM_setValue(clave, valor);
      else localStorage.setItem(clave, JSON.stringify(valor));
    } catch(e){}
  },
  // fn(valorNuevo), solo con los cambios hechos en otra pestaña.
  alCambiar(clave, fn){
    if (typeof GM_addValueChangeListener !== 'function') return;
    try {
      GM_addValueChangeListener(clave, (nombre, viejo, nuevo, remoto) => {
        if (remoto) fn(nuevo);
      });
    } catch(e){}
  },
  // Cerrar esta pestaña: con @grant window.close el gestor la cierra aunque
  // no la haya abierto un script. Puede no conseguirlo: quien llama lo mira.
  cerrarPestana(){
    try { window.close(); } catch(e){}
  },
  // Traer esta pestaña al frente (@grant window.focus); si el gestor no
  // sabe, no pasa nada.
  enfocarPestana(){
    try { window.focus(); } catch(e){}
  },
  // Petición al servidor de sincronización, con la forma de fetch (la usa
  // shared/sync/cliente.js). La hace el gestor (@grant GM_xmlhttpRequest y
  // @connect en la cabecera): desde cualquier web, sin CORS ni cookies. En
  // la extensión será un fetch desde el fondo.
  pedir(url, opciones = {}){
    if (typeof GM_xmlhttpRequest !== 'function') return fetch(url, opciones);
    const signal = opciones.signal;
    return new Promise((resolver, rechazar) => {
      if (signal && signal.aborted){ rechazar(signal.reason); return; }
      let peticion = null;
      const abortar = () => {
        try { if (peticion) peticion.abort(); } catch(e){}
        rechazar(signal.reason);
      };
      const fin = () => { if (signal) signal.removeEventListener('abort', abortar); };
      peticion = GM_xmlhttpRequest({
        url, method: opciones.method || 'GET', headers: opciones.headers || {},
        data: opciones.body ? new Blob([opciones.body]) : undefined,
        responseType: 'arraybuffer', nocache: true, anonymous: true,
        onload: r => {
          fin();
          const cabeceras = new Headers();
          for (const linea of String(r.responseHeaders || '').split(/\r?\n/)){
            const i = linea.indexOf(':');
            if (i > 0) try { cabeceras.append(linea.slice(0, i).trim(), linea.slice(i + 1).trim()); } catch(e){}
          }
          // Sin respuesta (estado 0) es un fallo de red: Response lo rechaza.
          try {
            resolver(new Response([204, 205, 304].includes(r.status) ? null : r.response,
                                  { status: r.status, headers: cabeceras }));
          } catch(e){ rechazar(new TypeError('sin respuesta')); }
        },
        onerror: () => { fin(); rechazar(new TypeError('sin red')); },
        ontimeout: () => { fin(); rechazar(new TypeError('sin respuesta')); },
        onabort: () => { fin(); rechazar(new TypeError('cancelada')); },
      });
      if (signal) signal.addEventListener('abort', abortar, { once: true });
    });
  },
  hayMenu(){ return typeof GM_registerMenuCommand === 'function'; },
  menu(texto, fn){
    if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand(texto, fn);
  }
};

