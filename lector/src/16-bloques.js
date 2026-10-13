/* ============================================================
   13. BLOQUES
   ============================================================ */
function extractBlocks(root){
  const out = [];
  const push = (tipo, extra) => out.push(Object.assign({ tipo: tipo }, extra || {}));
  const plainLen = el => (el.textContent || '').replace(/\s+/g,' ').trim().length;

  function walk(node){
    for (const child of Array.from(node.childNodes)){
      if (child.nodeType === 3){
        const txt = child.textContent.replace(/\s+/g,' ').trim();
        if (txt) push('p', { html: esc(txt) });
        continue;
      }
      if (child.nodeType !== 1) continue;
      const tag = child.tagName;
      if (tag === 'P'){
        const imgs = child.querySelectorAll('img');
        const txtContent = (child.textContent || '').replace(/\s+/g,' ').trim();
        if (imgs.length === 1 && txtContent.length < 5 && isValidImage(imgs[0])){
          push('img', { src: imgs[0].getAttribute('src') || '', alt: imgs[0].getAttribute('alt') || '', caption: '' });
          continue;
        }
        const h = child.innerHTML.trim();
        if (h) push('p', { html: h });
      } else if (tag === 'FIGURE'){
        const img = child.querySelector('img');
        if (img && isValidImage(img)){
          const capEl = child.querySelector('figcaption');
          const cap = capEl ? (capEl.textContent || '').replace(/\s+/g,' ').trim() : '';
          push('img', { src: img.getAttribute('src') || '', alt: img.getAttribute('alt') || '', caption: cap });
        } else {
          walk(child);
        }
      } else if (tag === 'IMG'){
        if (isValidImage(child)){
          push('img', { src: child.getAttribute('src') || '', alt: child.getAttribute('alt') || '' });
        }
      } else if (tag === 'BLOCKQUOTE'){
        const txt = (child.textContent || '').replace(/\s+/g,' ').trim();
        const hasImg = !!child.querySelector('img');
        if (txt.length < 20 && !hasImg) continue;
        const h = child.innerHTML.trim();
        if (h) push('q', { html: h });
      } else if (/^H[1-6]$/.test(tag)){
        const lvl = parseInt(tag[1], 10);
        if (lvl === 1) continue;
        const h = child.innerHTML.trim();
        if (h) push('h', { html: h, level: Math.min(lvl, 4) });
      } else if (tag === 'UL' || tag === 'OL'){
        const items = Array.from(child.children).filter(c => c.tagName === 'LI');
        if (items.length){
          const allShort = items.every(li => plainLen(li) < 200);
          if (allShort){
            push('list', { ordered: tag === 'OL', items: items.map(li => li.innerHTML.trim()) });
          } else {
            items.forEach(li => {
              const h = li.innerHTML.trim();
              if (h) push('p', { html: '— ' + h });
            });
          }
        }
      } else if (tag === 'HR'){
        push('hr');
      } else if (tag === 'PRE'){
        const h = child.innerHTML.trim();
        if (h) push('pre', { html: h });
      } else {
        walk(child);
      }
    }
  }
  walk(root);
  return out;
}
function buildBlocksFromHTML(html){
  const sanitized = sanitizeHTML(html);
  if (!sanitized) return [];
  const doc = new DOMParser().parseFromString('<div>' + sanitized + '</div>', 'text/html');
  const root = doc.body.firstChild;
  if (!root) return [];
  return extractBlocks(root);
}
function buildBlocksFromText(rawBody){
  const frases = rawBody
    .replace(/([.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡«""])/g, '$1|SPLIT|')
    .split('|SPLIT|').map(s => s.trim()).filter(Boolean);
  const blocks = [];
  let actual = [], len = 0;
  const esCita = s => /^\s*[\u00AB\u201C\u201D\u2014]/.test(s);
  const push = (tipo, txt) => blocks.push({ tipo: tipo, html: esc(txt) });
  for (const f of frases){
    if (esCita(f) && actual.length > 0){
      push('p', actual.join(' '));
      actual = [f]; len = f.length;
    } else {
      actual.push(f); len += f.length;
      if (len > 450){ push('p', actual.join(' ')); actual = []; len = 0; }
    }
  }
  if (actual.length) push('p', actual.join(' '));
  blocks.forEach(b => { if (/^[\u00AB\u201C\u201D\u2014]/.test(b.html)) b.tipo = 'q'; });
  return blocks;
}
function bionicizeHTML(html){
  try {
    const doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
    const root = doc.body.firstChild;
    if (!root) return html;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    let n;
    while ((n = walker.nextNode())) textNodes.push(n);
    textNodes.forEach(tn => {
      const raw = tn.textContent;
      if (!raw || !/[\wÁÉÍÓÚÑáéíóúñ]/.test(raw)) return;
      const frag = doc.createDocumentFragment();
      const re = /([\wÁÉÍÓÚÑáéíóúñ]+)/g;
      let last = 0, m;
      while ((m = re.exec(raw)) !== null){
        if (m.index > last) frag.appendChild(doc.createTextNode(raw.slice(last, m.index)));
        const w = m[1];
        const half = Math.max(1, Math.ceil(w.length / 2));
        const b = doc.createElement('b');
        b.textContent = w.slice(0, half);
        frag.appendChild(b);
        frag.appendChild(doc.createTextNode(w.slice(half)));
        last = m.index + w.length;
      }
      if (last < raw.length) frag.appendChild(doc.createTextNode(raw.slice(last)));
      tn.parentNode.replaceChild(frag, tn);
    });
    return root.innerHTML;
  } catch(e){ return html; }
}

