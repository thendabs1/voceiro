/* ============================================================
   14b. ANÁLISIS DE PÁGINA + SELECTOR VISUAL
   ============================================================ */
function analyzeCurrentPage(){
  const info = {
    url: location.href,
    domain: location.hostname,
    title: { text: '', source: '' },
    metrics: { p: 0, img: 0, figure: 0, blockquote: 0, textLen: 0, words: 0 },
    candidates: [],
    overlays: []
  };

  const ogTitle = metaContent('meta[property="og:title"]');
  const h1 = document.querySelector('h1');
  if (ogTitle) { info.title.text = ogTitle; info.title.source = 'og:title'; }
  else if (h1) { info.title.text = h1.textContent.trim(); info.title.source = 'h1'; }
  else { info.title.text = document.title; info.title.source = 'document.title'; }

  const body = document.body;
  if (body){
    info.metrics.p = body.querySelectorAll('p').length;
    info.metrics.img = body.querySelectorAll('img').length;
    info.metrics.figure = body.querySelectorAll('figure').length;
    info.metrics.blockquote = body.querySelectorAll('blockquote').length;
    const txt = (body.innerText || body.textContent || '').replace(/\s+/g, ' ').trim();
    info.metrics.textLen = txt.length;
    info.metrics.words = txt.split(/\s+/).filter(Boolean).length;
  }

  const patterns = [
    'article', 'main', '[role="main"]', '[itemprop="articleBody"]',
    '[data-qa="article-body"]', '[data-testid*="article"]',
    '.article-body', '.article-content', '.article__body', '.article__content',
    '.post-content', '.entry-content', '.story-body', '.content-body',
    '#article', '#content', '#main-content',
    'article .content', 'main article'
  ];
  patterns.forEach(sel => {
    let els;
    try { els = document.querySelectorAll(sel); } catch(e){ return; }
    if (!els.length) return;
    let totalText = 0, totalImgs = 0;
    els.forEach(el => {
      const txt = (el.innerText || el.textContent || '').replace(/\s+/g,' ').trim();
      totalText += txt.length;
      totalImgs += el.querySelectorAll('img').length;
    });
    if (totalText < 50) return;
    info.candidates.push({
      selector: sel,
      count: els.length,
      textLen: totalText,
      words: Math.round(totalText / 6),
      imgs: totalImgs
    });
  });
  info.candidates.sort((a, b) => b.textLen - a.textLen);
  info.candidates = info.candidates.slice(0, 8);

  Array.from(document.querySelectorAll('body > *')).forEach(el => {
    const cs = window.getComputedStyle(el);
    if (cs.position !== 'fixed') return;
    const z = parseInt(cs.zIndex || '0', 10);
    if (isNaN(z) || z < 100) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 200 || rect.height < 200) return;
    info.overlays.push({
      tag: el.tagName.toLowerCase(),
      id: el.id || '',
      cls: (typeof el.className === 'string') ? el.className.slice(0, 80) : '',
      zIndex: cs.zIndex
    });
  });

  return info;
}

function generateSelector(el){
  if (!el || el.nodeType !== 1) return '';
  if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)){
    const sel = '#' + el.id;
    try { if (document.querySelectorAll(sel).length === 1) return sel; } catch(e){}
  }
  if (typeof el.className === 'string' && el.className){
    const classes = el.className.split(/\s+/)
      .filter(c => c && /^[a-zA-Z][\w-]*$/.test(c))
      .filter(c => !/^(il-|js-|is-|has-|active|hover|open|selected|shown|visible|loaded|ready)/i.test(c))
      .slice(0, 3);
    if (classes.length){
      const trySel = el.tagName.toLowerCase() + '.' + classes.map(cssEscape).join('.');
      try { if (document.querySelectorAll(trySel).length === 1) return trySel; } catch(e){}
    }
  }
  const parts = [];
  let cur = el;
  while (cur && cur.nodeType === 1 && cur !== document.body && cur !== document.documentElement){
    let tag = cur.tagName.toLowerCase();
    const parent = cur.parentElement;
    if (parent){
      const sameTag = Array.from(parent.children).filter(c => c.tagName === cur.tagName);
      if (sameTag.length > 1){
        const idx = sameTag.indexOf(cur) + 1;
        tag += ':nth-of-type(' + idx + ')';
      }
    }
    parts.unshift(tag);
    cur = parent;
  }
  return parts.join(' > ');
}

let __pickerState = null;

function startVisualPicker(onPick, onCancel){
  if (__pickerState) stopVisualPicker();

  const style = document.createElement('style');
  style.id = 'il-picker-style';
  style.textContent = '.il-picker-hover{outline:2px dashed var(--accent) !important;outline-offset:-2px !important;background:rgba(211,47,47,.08) !important;cursor:crosshair !important}';
  document.head.appendChild(style);

  const bar = document.createElement('div');
  bar.id = 'il-picker-bar';
  temaDe(bar);
  bar.setAttribute('role', 'status');
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;background:var(--fg);color:var(--bg);' +
    'padding:12px 16px;z-index:2147483647;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
    'text-align:center;box-shadow:0 4px 12px rgba(0,0,0,.3)';
  bar.textContent = '🎯 ' + t('extractionPickerHint');
  document.body.appendChild(bar);

  let current = null;
  function onMove(e){
    if (current) current.classList.remove('il-picker-hover');
    current = e.target;
    if (current && current !== document.body && current !== document.documentElement && current.nodeType === 1){
      current.classList.add('il-picker-hover');
    } else {
      current = null;
    }
  }
  function onClick(e){
    e.preventDefault();
    e.stopPropagation();
    if (bar.contains(e.target)) return;
    const el = e.target;
    if (!el || el === document.body || el.nodeType !== 1) return;
    const sel = generateSelector(el);
    stopVisualPicker();
    if (onPick) onPick(sel, el);
  }
  function onKey(e){
    if (e.key === 'Escape'){
      e.preventDefault();
      e.stopPropagation();
      stopVisualPicker();
      if (onCancel) onCancel();
    }
  }

  document.addEventListener('mouseover', onMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);

  __pickerState = { onMove, onClick, onKey, getCurrent: () => current, style, bar };
}

function stopVisualPicker(){
  if (!__pickerState) return;
  document.removeEventListener('mouseover', __pickerState.onMove, true);
  document.removeEventListener('click', __pickerState.onClick, true);
  document.removeEventListener('keydown', __pickerState.onKey, true);
  const cur = __pickerState.getCurrent();
  if (cur) cur.classList.remove('il-picker-hover');
  if (__pickerState.style && __pickerState.style.parentNode) __pickerState.style.remove();
  if (__pickerState.bar && __pickerState.bar.parentNode) __pickerState.bar.remove();
  __pickerState = null;
}

function isPickerActive(){ return !!__pickerState; }

