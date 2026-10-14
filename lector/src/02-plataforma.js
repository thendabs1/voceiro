/* ============================================================
   1b. PLATAFORMA (userscript)
   ------------------------------------------------------------
   Lo único que depende del gestor de userscripts: leer y guardar
   la configuración, enterarse de los cambios hechos en otra
   pestaña y el menú del gestor. La extensión tendrá su propia
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
  hayMenu(){ return typeof GM_registerMenuCommand === 'function'; },
  menu(texto, fn){
    if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand(texto, fn);
  }
};

