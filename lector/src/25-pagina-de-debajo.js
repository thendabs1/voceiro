/* ============================================================
   20b. LA PÁGINA DE DEBAJO
   ------------------------------------------------------------
   Mientras el lector está abierto, la página no se ve ni se puede
   tocar: ni lo que ya había ni lo que el medio ponga después (avisos
   de cookies, de suscripción o del bloqueador de anuncios), que con
   un z-index alto quedaría por encima del lector. Al cerrar, todo
   vuelve a estar como estaba, también el scroll: visibility y
   opacity no cambian el tamaño de nada.

   Se respetan las piezas del lector (id «il-…» o clase il-tema) y lo
   que aparece mientras con nombre de elemento personalizado (con
   guion), que suele ser de extensiones del navegador: diccionarios,
   traductores, lectura en voz alta.
   ============================================================ */
const esDelLector = el => (el.id || '').indexOf('il-') === 0 || el.classList.contains('il-tema');
const NO_SE_OCULTA = /^(HEAD|BODY|SCRIPT|STYLE|LINK|META|NOSCRIPT|TEMPLATE)$/;

function taparPagina(ov){
  // El :not(#il-x) sube la especificidad a la de dos ids: gana a un
  // «visibility:visible!important» con id que traiga la página.
  // El filtro o el transform en html o body (hay muros que desenfocan la
  // página así) se llevarían también al lector, que va dentro del body.
  const st = document.createElement('style');
  st.id = 'il-pagina-tapada';
  st.textContent =
    '[data-il-tapado]:not(#il-x):not(#il-y){visibility:hidden!important;opacity:0!important;pointer-events:none!important}' +
    'html,body{filter:none!important;-webkit-filter:none!important;transform:none!important}' +
    '#il-full{pointer-events:auto!important;-webkit-user-select:text!important;user-select:text!important}';
  (document.head || document.documentElement).appendChild(st);

  const tapados = [];
  const inertes = [];
  const tapar = el => {
    if (el.nodeType !== 1 || esDelLector(el) || NO_SE_OCULTA.test(el.tagName) || el.hasAttribute('data-il-tapado')) return;
    el.setAttribute('data-il-tapado', '');
    tapados.push(el);
  };
  const inutilizar = el => { if (!el.inert){ el.inert = true; inertes.push(el); } };

  // Lo que ya había: todo inerte (como siempre: ni el teclado ni los
  // lectores de pantalla se meten en lo que no se ve) y tapado, menos los
  // elementos personalizados, que pueden ser de una extensión.
  [...document.body.children].forEach(el => {
    if (esDelLector(el)) return;
    inutilizar(el);
    if (!el.tagName.includes('-')) tapar(el);
  });
  [...document.documentElement.children].forEach(el => { if (!el.tagName.includes('-')) tapar(el); });

  // Lo que llega después, igual, salvo los elementos personalizados. Si
  // la página se lleva el lector (una SPA que rehace el body), se destapa.
  const obs = new MutationObserver(cambios => {
    if (!ov.isConnected){ fin(); return; }
    cambios.forEach(c => c.addedNodes.forEach(n => {
      if (n.nodeType !== 1 || esDelLector(n) || n.tagName.includes('-') || NO_SE_OCULTA.test(n.tagName)) return;
      tapar(n);
      inutilizar(n);
    }));
  });
  obs.observe(document.body, { childList: true });
  obs.observe(document.documentElement, { childList: true });

  let hecho = false;
  function fin(){
    if (hecho) return;
    hecho = true;
    obs.disconnect();
    tapados.forEach(el => el.removeAttribute('data-il-tapado'));
    inertes.forEach(el => { el.inert = false; });
    st.remove();
  }
  return { fin: fin };
}
