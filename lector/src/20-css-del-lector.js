/* ============================================================
   16. ASPECTO: PALETA, ICONOS Y CSS DEL LECTOR
   ============================================================ */
// Paleta de Voceiro (plantilla.html, bloque PALETA), puesta aquí por
// build.mjs: { light: {bg:'#fff', …, 'color-scheme':'light'}, sepia: {…}, … }.
const PALETA = /*{{PALETA}}*/{};

// CSS de la paleta para un sitio: base lleva el tema claro y cada tema, su
// selector (por defecto, base[data-theme="…"]; en un Shadow DOM, :host(…)).
function cssPaleta(base, selTema){
  selTema = selTema || (t => base + '[data-theme="' + t + '"]');
  const reglas = t => Object.entries(PALETA[t] || {})
    .map(([k, v]) => (k === 'color-scheme' ? k : '--' + k) + ':' + v).join(';');
  return [base + '{' + reglas('light') + '}']
    .concat(Object.keys(PALETA).filter(t => t !== 'light').map(t => selTema(t) + '{' + reglas(t) + '}'))
    .join('\n');
}

// Iconos del sprite de Voceiro: solo los que se usan aquí, con icono('…')
// escrito tal cual (build.mjs los busca así; un nombre calculado no lo ve).
// Trazados de Lucide (lucide-static 0.460.0, lucide.dev), ISC License.
// Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as
// part of Feather (MIT). All other copyright (c) for Lucide are held by
// Lucide Contributors 2022. Permission to use, copy, modify, and/or
// distribute this software for any purpose with or without fee is hereby
// granted, provided that the above copyright notice and this permission
// notice appear in all copies. THE SOFTWARE IS PROVIDED "AS IS" AND THE
// AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE.
const ICONOS = /*{{ICONOS}}*/{};
function icono(id){
  return '<svg class="il-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    (ICONOS[id] || '') + '</svg>';
}

// Los textos antiguos traen su emoji delante («📋 Copiar texto»); con icono
// sobra.
function sinSimbolo(s){
  return String(s || '').replace(/^[^\p{L}\p{N}]+/u, '');
}

// El tema del perfil en un elemento: data-theme y, con el personalizado
// (shared/tema/personalizado.js), su base clara u oscura y encima, en línea,
// las variables que salen de los colores elegidos.
function aplicarTema(el){
  const p = CFG.prefs || {};
  VARS_PERSONALIZADAS.forEach(k => el.style.removeProperty('--' + k));
  el.style.removeProperty('color-scheme');
  const colores = p.theme === 'custom' ? limpiarColores(p.colores) : null;
  if (!colores){
    el.setAttribute('data-theme', p.theme && p.theme !== 'custom' ? p.theme : 'light');
    return;
  }
  const { base, vars } = paletaPersonalizada(colores);
  el.setAttribute('data-theme', base);
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k === 'color-scheme' ? k : '--' + k, v);
}
// Para «Personalizado» la primera vez: los colores del tema que hay.
function coloresDelTema(tema){
  const p = PALETA[tema] || PALETA.light || {};
  return limpiarColores({ fondo: hex6(p.bg), texto: hex6(p.fg), enlaces: hex6(p.accent), titulos: hex6(p.titulos || p.fg) });
}
function hex6(v){
  v = String(v || '').trim().toLowerCase();
  return /^#[0-9a-f]{3}$/.test(v) ? '#' + [...v.slice(1)].map(c => c + c).join('') : v;
}

// Lo que el lector pinta fuera de #il-full (Ajustes, avisos, diálogos,
// desplegables, herramientas) lleva la clase il-tema y el tema del perfil.
// La paleta para .il-tema va en una sola hoja, que se pone la primera vez.
function temaDe(el){
  if (!document.getElementById('il-tema-css')){
    const st = document.createElement('style');
    st.id = 'il-tema-css';
    st.textContent = cssPaleta('.il-tema') +
      '\n.il-tema :focus-visible{outline:2px solid var(--focus);outline-offset:2px}';
    (document.head || document.documentElement).appendChild(st);
  }
  el.classList.add('il-tema');
  aplicarTema(el);
  return el;
}

// Desplazamientos suaves, salvo si la persona ha pedido menos movimiento.
function desplazar(){
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'; }
  catch(e){ return 'smooth'; }
}

function buildReaderCSS(){
  return `
${cssPaleta('#il-full')}
#il-full{--ambi-op:.25;position:fixed;inset:0;background:var(--bg);color:var(--fg);z-index:2147483646;overflow:auto;-webkit-text-size-adjust:100%}
#il-full[data-theme="dark"]{--ambi-op:.4}
#il-full[data-theme="contrast"]{--ambi-op:.5}
#il-full :focus-visible{outline:2px solid var(--focus);outline-offset:2px}
#il-full *{box-sizing:border-box}
#il-ambi-img{position:fixed;inset:-15%;width:130%;height:130%;object-fit:cover;filter:blur(40px);opacity:var(--ambi-op);z-index:0;pointer-events:none;user-select:none}
#il-full .il-progress{position:fixed;top:0;left:0;right:0;height:4px;background:var(--border);z-index:12;pointer-events:none}
#il-full .il-progress-bar{height:100%;background:var(--accent);width:0%;transition:width .15s linear}
#il-full .il-ico{width:20px;height:20px;flex-shrink:0;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
#il-full .il-vh{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}
#il-full .il-topbar{position:sticky;top:0;background:var(--bg);z-index:10;padding-top:4px;box-shadow:0 4px 10px var(--shadow);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;transition:transform .3s cubic-bezier(.4,0,.2,1)}
#il-full .il-topbar.il-hidden{transform:translateY(-100%)}
#il-full .il-topbar:focus-within,#il-full.il-desplegado .il-topbar{transform:none}
#il-full.il-desplegado .il-top-btn{opacity:0;pointer-events:none}
#il-full .il-nav-row{display:flex;align-items:center;gap:6px;padding:8px 12px}
#il-full .il-nav-espacio{flex:1}
#il-full .il-nav-row button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;min-width:44px;padding:8px 12px}
#il-full .il-nav-row button[aria-expanded="true"]{background:var(--accent);color:var(--on-solid);border-color:var(--accent)}
@media (max-width:600px){
  #il-full .il-nav-row{padding:6px 8px}
  #il-full .il-nav-row .il-lbl{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}
  #il-full .il-nav-row button{padding:8px}
}
#il-full .il-panel,#il-full .il-menu{position:absolute;top:100%;right:12px;max-width:calc(100vw - 24px);max-height:calc(100vh - 90px);overflow:auto;background:var(--bg);color:var(--fg);border:1px solid var(--btn-border);border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.3);font-size:15px;z-index:11}
#il-full .il-panel{width:440px;padding:16px;display:flex;flex-direction:column;gap:16px}
#il-full .il-menu{min-width:250px;padding:6px;display:flex;flex-direction:column}
@media (max-width:600px){
  #il-full .il-panel,#il-full .il-menu{position:fixed;top:auto;bottom:0;left:0;right:0;width:auto;max-width:none;max-height:75vh;border-radius:16px 16px 0 0;padding-bottom:max(16px,env(safe-area-inset-bottom))}
}
#il-full .il-panel fieldset,#il-full .il-paso{border:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
#il-full .il-panel legend,#il-full .il-paso-etq{width:100%;font-size:13px;font-weight:600;color:var(--muted);margin:0 0 6px;padding:0}
#il-full .il-opcion{position:relative;display:inline-flex;cursor:pointer}
#il-full .il-opcion input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
#il-full .il-opcion span{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:8px 14px;border:1px solid var(--btn-border);border-radius:8px;background:var(--btn-bg);color:var(--fg);font-weight:500}
#il-full .il-opcion input:checked+span{background:var(--accent);color:var(--on-solid);border-color:var(--accent)}
#il-full .il-opcion input:checked+span::before{content:"✓";font-weight:700}
#il-full .il-opcion input:focus-visible+span{outline:2px solid var(--focus);outline-offset:2px}
#il-full .il-opcion.il-muestra input:checked+span{background:var(--muestra-bg);color:var(--muestra-fg);border-color:var(--muestra-fg);box-shadow:0 0 0 3px var(--accent)}
#il-full .il-opcion.il-muestra span{background:var(--muestra-bg);color:var(--muestra-fg);border-color:var(--muestra-borde)}
#il-full .il-paso output{min-width:4ch;text-align:center;font-weight:700;font-variant-numeric:tabular-nums}
#il-full .il-paso button{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;padding:8px}
#il-full .il-menu [role="menuitem"]{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;padding:10px 12px;border:none;background:transparent;border-radius:8px;text-align:left;font-size:15px}
#il-full .il-menu [role="menuitem"]:hover,#il-full .il-menu [role="menuitem"]:focus{background:var(--quote-bg);filter:none}
#il-full .il-menu-grupo{font-size:12px;font-weight:600;color:var(--muted);padding:8px 12px 2px}
#il-full .il-menu [role="separator"]{border-top:1px solid var(--border);margin:4px 0}
#il-full button{cursor:pointer;padding:8px 14px;border:1px solid var(--btn-border);background:var(--btn-bg);color:var(--fg);border-radius:6px;font-family:inherit;font-size:14px;font-weight:500;transition:all .1s}
#il-full button:hover{filter:brightness(.95)}
#il-full button.il-primary{background:var(--accent);color:var(--on-solid);border-color:var(--accent);font-size:15px;font-weight:bold}
#il-full button.il-active{background:var(--accent);color:var(--on-solid);border-color:var(--accent)}
#il-full button.il-guardada{background:var(--save);color:var(--on-solid);border-color:var(--save)}
#il-full button.il-leida{background:var(--preset);color:var(--on-solid);border-color:var(--preset)}
#il-full .il-wrap{max-width:var(--w,720px);margin:0 auto;padding:32px 20px 80px;position:relative;z-index:2}
#il-full .il-content{font-family:Georgia,"Times New Roman",serif;font-size:var(--fs,18px);line-height:var(--lh,1.7)}
#il-full[data-font="sans"] .il-content{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
#il-full[data-font="dyslexic"] .il-content{font-family:Verdana,Tahoma,sans-serif;letter-spacing:.03em;word-spacing:.1em}
#il-full .il-content h1{font-size:1.8em;line-height:1.25;margin:0 0 12px;color:var(--titulos)}
#il-full .il-desc{font-size:1.1em;color:var(--muted);font-style:italic;margin:0 0 20px}
#il-full .il-meta{color:var(--muted);font-size:.85em;padding-bottom:14px;margin-bottom:14px;border-bottom:1px solid var(--border);font-family:-apple-system,BlinkMacSystemFont,sans-serif}
#il-full .il-meta-actions{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 28px;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
#il-full .il-meta-actions button{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:7px 12px;font-size:14px}
#il-full .il-meta-actions .il-ico{width:18px;height:18px}
#il-full .il-body p{margin:1.2em 0}
#il-full .il-body blockquote{margin:1.5em 0;padding:1em 1.5em;border-left:4px solid var(--accent);background:var(--quote-bg);font-style:italic}
#il-full .il-body h2,#il-full .il-body h3,#il-full .il-body h4{margin:1.6em 0 .6em;line-height:1.3;color:var(--titulos)}
#il-full .il-colores{gap:10px}
#il-full .il-color{display:flex;align-items:center;gap:10px;width:100%;flex-wrap:wrap}
#il-full .il-color input{width:44px;height:44px;padding:2px;border:1px solid var(--btn-border);border-radius:8px;background:var(--btn-bg);cursor:pointer}
#il-full .il-color .il-cr{color:var(--muted);font-size:13px;font-variant-numeric:tabular-nums}
#il-full .il-color .il-cr.il-poco{color:var(--block);font-weight:600}
#il-full .il-body h2{font-size:1.4em}
#il-full .il-body h3{font-size:1.2em}
#il-full .il-body h4{font-size:1.05em}
#il-full .il-body ul,#il-full .il-body ol{margin:1.2em 0;padding-left:1.6em}
#il-full .il-body li{margin:.4em 0}
#il-full .il-body pre{background:var(--quote-bg);padding:1em;border-radius:6px;overflow-x:auto;font-size:.9em;font-family:ui-monospace,Menlo,Consolas,monospace}
#il-full .il-body code{background:var(--quote-bg);padding:.1em .35em;border-radius:3px;font-size:.9em;font-family:ui-monospace,Menlo,Consolas,monospace}
#il-full .il-body pre code{background:none;padding:0}
#il-full .il-body a{color:var(--accent);text-decoration:underline}
#il-full .il-body hr{border:none;border-top:1px solid var(--border);margin:2em 0}
#il-full .il-body img{max-width:100%;height:auto;display:block;margin:0 auto;border-radius:6px}
#il-full[data-just="1"] .il-body p{text-align:justify;hyphens:auto;-webkit-hyphens:auto}
#il-full[data-imagenes="ninguna"] .il-figure,
#il-full[data-imagenes="ninguna"] .il-inline-figure,
#il-full[data-imagenes="ninguna"] .il-body img,
#il-full[data-imagenes="ninguna"] .il-miniatura,
#il-full[data-imagenes="ninguna"] #il-ambi-img{display:none!important}
#il-full[data-imagenes="conPie"] .il-figure:not(.il-con-pie),
#il-full[data-imagenes="conPie"] .il-inline-figure:not(.il-con-pie),
#il-full[data-imagenes="conPie"] .il-miniatura:not(.il-con-pie){display:none}
#il-full .il-miniatura{float:right;width:96px;height:96px;margin:4px 0 12px 18px;padding:0;border:1px solid var(--btn-border);border-radius:8px;overflow:hidden;background:var(--quote-bg);cursor:pointer}
#il-full .il-miniatura img{width:100%;height:100%;object-fit:cover;display:block}
@media (max-width:560px){#il-full .il-miniatura{width:64px;height:64px;margin-left:12px}}
#il-full.il-focus .il-body>*{opacity:.22;transition:opacity .3s}
#il-full.il-focus .il-body>.il-active{opacity:1}
#il-full .il-figure,
#il-full .il-inline-figure{margin:2em 0;background:var(--quote-bg);border-radius:6px;overflow:hidden}
#il-full .il-figure img,
#il-full .il-inline-figure img{max-width:100%;max-height:600px;display:block;margin:0 auto;object-fit:contain;cursor:zoom-in}
#il-full .il-figure figcaption,
#il-full .il-inline-figure figcaption{font-size:.85em;color:var(--muted);text-align:center;padding:10px 14px;line-height:1.4;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
#il-full .il-footer{color:var(--muted);font-size:.8em;margin-top:20px;padding-top:14px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
#il-full [hidden]{display:none!important}
#il-full .il-fin{margin:48px 0 8px;padding-top:24px;border-top:1px solid var(--border);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
#il-full .il-fin-acciones{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
#il-full .il-fin-acciones button{min-height:44px;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;max-width:100%}
#il-full .il-fin-volver{flex:1 1 100%;font-size:16px}
#il-full .il-fin-sig-titulo{font-size:12px;font-weight:400;max-width:30ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#il-full .il-fin-estado{min-height:1.5em;margin:12px 0 0;text-align:center;color:var(--muted);font-size:14px}
#il-full .il-fin-deshacer{background:none;border:none;color:var(--accent);text-decoration:underline;padding:4px 6px;font-size:inherit;font-weight:bold}
#il-full .il-dict-hint{background:none;border:none;color:var(--accent);cursor:pointer;font-size:inherit;padding:0;font-family:inherit;font-weight:bold;text-decoration:underline}
#il-full .il-source-badge{color:var(--muted);margin-left:4px}
#il-full .il-top-btn{position:fixed;bottom:24px;right:24px;z-index:20;width:48px;height:48px;padding:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--accent);color:var(--on-solid);border:1px solid var(--accent);box-shadow:0 4px 12px var(--shadow);opacity:0;pointer-events:none;transform:translateY(12px);transition:opacity .25s,transform .25s}
#il-full .il-top-btn.il-show{opacity:1;pointer-events:auto;transform:translateY(0)}
#il-full .il-dict-popup{position:fixed;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.35);z-index:30;padding:8px;display:flex;flex-direction:column;gap:4px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;min-width:180px}
#il-full .il-dict-popup-title{padding:6px 10px;font-size:12px;color:var(--muted);border-bottom:1px solid var(--border);margin-bottom:4px}
#il-full .il-dict-popup button{text-align:left;padding:8px 10px;border:none;background:transparent;color:var(--fg);cursor:pointer;border-radius:4px;font-size:14px;font-family:inherit}
#il-full .il-dict-popup button:hover{background:var(--quote-bg)}
@media print{#il-full .il-top-btn,#il-full .il-fin,#il-full .il-topbar,#il-full .il-progress{display:none!important}}
@media (prefers-reduced-motion:reduce){#il-full,#il-full *{transition:none!important;animation:none!important;scroll-behavior:auto!important}}
`;
}

