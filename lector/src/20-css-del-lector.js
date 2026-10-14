/* ============================================================
   16. CSS DEL LECTOR
   ============================================================ */
function buildReaderCSS(){
  return `
/*{{PALETA}}*/
#il-full{--ambi-op:.25;position:fixed;inset:0;background:var(--bg);color:var(--fg);z-index:2147483646;overflow:auto;-webkit-text-size-adjust:100%}
#il-full[data-theme="dark"]{--ambi-op:.4}
#il-full[data-theme="contrast"]{--ambi-op:.5}
#il-full :focus-visible{outline:2px solid var(--focus);outline-offset:2px}
#il-full *{box-sizing:border-box}
#il-ambi-img{position:fixed;inset:-15%;width:130%;height:130%;object-fit:cover;filter:blur(40px);opacity:var(--ambi-op);z-index:0;pointer-events:none;user-select:none}
#il-full .il-progress{position:fixed;top:0;left:0;right:0;height:4px;background:var(--border);z-index:12;pointer-events:none}
#il-full .il-progress-bar{height:100%;background:var(--accent);width:0%;transition:width .15s linear}
#il-full .il-topbar{position:sticky;top:0;background:var(--bg);z-index:10;padding-top:4px;box-shadow:0 4px 10px var(--shadow);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;transition:transform .3s cubic-bezier(.4,0,.2,1)}
#il-full .il-topbar.il-hidden{transform:translateY(-100%)}
#il-full .il-nav-row{display:flex;justify-content:center;align-items:center;padding:10px 12px;gap:8px;overflow-x:auto;flex-wrap:nowrap;-webkit-overflow-scrolling:touch;scrollbar-width:none}
#il-full .il-nav-row::-webkit-scrollbar{display:none}
#il-full .il-nav-row button{flex:0 0 auto}
@media (max-width:520px){
  #il-full .il-nav-row{padding:8px;gap:6px}
  #il-full .il-nav-row button{padding:7px 10px;font-size:13px}
}
#il-full .il-settings-bar{display:flex;background:var(--bg);padding:12px 14px 16px;border-top:1px solid var(--border);flex-wrap:wrap;gap:14px;align-items:center;justify-content:center;font-size:14px}
#il-full .il-group{display:flex;align-items:center;gap:6px;padding:4px 12px;border-right:1px solid var(--border)}
#il-full .il-group:last-child{border-right:none}
#il-full .il-group>label{color:var(--muted);font-size:12px;margin-right:4px;text-transform:uppercase;letter-spacing:.5px}
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
#il-full .il-content h1{font-size:1.8em;line-height:1.25;margin:0 0 12px}
#il-full .il-desc{font-size:1.1em;color:var(--muted);font-style:italic;margin:0 0 20px}
#il-full .il-meta{color:var(--muted);font-size:.85em;padding-bottom:14px;margin-bottom:14px;border-bottom:1px solid var(--border);font-family:-apple-system,BlinkMacSystemFont,sans-serif}
#il-full .il-meta-actions{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 28px;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
#il-full .il-meta-actions button{padding:7px 12px;font-size:13px}
#il-full .il-body p{margin:1.2em 0}
#il-full .il-body blockquote{margin:1.5em 0;padding:1em 1.5em;border-left:4px solid var(--accent);background:var(--quote-bg);font-style:italic}
#il-full .il-body h2,#il-full .il-body h3,#il-full .il-body h4{margin:1.6em 0 .6em;line-height:1.3}
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
#il-full.il-hideimg .il-figure{display:none}
#il-full.il-textonly .il-figure,
#il-full.il-textonly .il-inline-figure,
#il-full.il-textonly .il-body img,
#il-full.il-textonly #il-ambi-img{display:none!important}
#il-full.il-focus .il-body>*{opacity:.22;transition:opacity .3s}
#il-full.il-focus .il-body>.il-active{opacity:1}
#il-full .il-figure,
#il-full .il-inline-figure{margin:2em 0;background:var(--quote-bg);border-radius:6px;overflow:hidden}
#il-full .il-figure img,
#il-full .il-inline-figure img{max-width:100%;max-height:600px;display:block;margin:0 auto;object-fit:contain;cursor:zoom-in}
#il-full .il-figure figcaption,
#il-full .il-inline-figure figcaption{font-size:.85em;color:var(--muted);text-align:center;padding:10px 14px;line-height:1.4;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
#il-full .il-footer{color:var(--muted);font-size:.8em;margin-top:20px;padding-top:14px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
#il-full .il-footer-top,#il-full .il-footer-back{background:none;border:none;color:var(--accent);cursor:pointer;font-size:inherit;padding:0;font-family:inherit;font-weight:bold;text-decoration:underline}
#il-full .il-dict-hint{background:none;border:none;color:var(--accent);cursor:pointer;font-size:inherit;padding:0;font-family:inherit;font-weight:bold;text-decoration:underline}
#il-full .il-source-badge{color:var(--muted);margin-left:4px}
#il-full .il-top-btn{position:fixed;bottom:24px;right:24px;z-index:20;width:48px;height:48px;padding:0;border-radius:50%;font-size:22px;line-height:1;background:var(--accent);color:var(--on-solid);border:1px solid var(--accent);box-shadow:0 4px 12px var(--shadow);opacity:0;pointer-events:none;transform:translateY(12px);transition:opacity .25s,transform .25s}
#il-full .il-top-btn.il-show{opacity:1;pointer-events:auto;transform:translateY(0)}
#il-full .il-dict-popup{position:fixed;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.35);z-index:30;padding:8px;display:flex;flex-direction:column;gap:4px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;min-width:180px}
#il-full .il-dict-popup-title{padding:6px 10px;font-size:12px;color:var(--muted);border-bottom:1px solid var(--border);margin-bottom:4px}
#il-full .il-dict-popup button{text-align:left;padding:8px 10px;border:none;background:transparent;color:var(--fg);cursor:pointer;border-radius:4px;font-size:14px;font-family:inherit}
#il-full .il-dict-popup button:hover{background:var(--quote-bg)}
@media print{#il-full .il-top-btn{display:none!important}}
`;
}

