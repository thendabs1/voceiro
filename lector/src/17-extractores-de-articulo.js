/* ============================================================
   14. EXTRACTORES DE ARTÍCULO
   ============================================================ */
function decodeEnt(s){
  if (s == null) return '';
  try { return new DOMParser().parseFromString(String(s), 'text/html').body.textContent || ''; }
  catch(e){ return String(s); }
}
function findLdArt(o){
  if (!o) return null;
  if (Array.isArray(o)){ for (const x of o){ const r = findLdArt(x); if (r) return r; } return null; }
  if (typeof o !== 'object') return null;
  if (o.articleBody) return o;
  if (o['@graph']) return findLdArt(o['@graph']);
  if (o.mainEntity) return findLdArt(o.mainEntity);
  return null;
}
function extractFromJSONLD(){
  const ss = document.querySelectorAll('script[type="application/ld+json"]');
  for (const s of ss){
    try { const j = JSON.parse(s.textContent); const r = findLdArt(j); if (r) return r; } catch(e){}
  }
  return null;
}
function normAuth(a){
  if (!a) return [];
  if (Array.isArray(a)) return a.map(x => typeof x === 'string' ? x : (x && x.name) || '').filter(Boolean);
  if (typeof a === 'string') return [a];
  return [(a && a.name) || ''].filter(Boolean);
}
function imgUrlFrom(im){
  if (!im) return '';
  if (typeof im === 'string') return im;
  if (Array.isArray(im)) return imgUrlFrom(im[0]);
  if (typeof im.url === 'string') return im.url;
  if (typeof im.contentUrl === 'string') return im.contentUrl;
  if (typeof im.thumbnailUrl === 'string') return im.thumbnailUrl;
  if (im.url && typeof im.url === 'object') return imgUrlFrom(im.url);
  if (im.contentUrl && typeof im.contentUrl === 'object') return imgUrlFrom(im.contentUrl);
  return '';
}
function imgCaptionFrom(im){
  if (!im) return '';
  if (Array.isArray(im)) return imgCaptionFrom(im[0]);
  return im.name || im.caption || im.description || '';
}
function imgAuthorFrom(im){
  if (!im) return '';
  if (Array.isArray(im)) return imgAuthorFrom(im[0]);
  if (typeof im.author === 'string') return im.author;
  if (im.author && im.author.name) return im.author.name;
  return '';
}
function metaContent(sel){
  const el = document.querySelector(sel);
  return el ? (el.getAttribute('content') || '') : '';
}
function buildFromJSONLD(ld){
  return {
    headline: decodeEnt(ld.headline || ''),
    description: decodeEnt(ld.description || ''),
    articleSection: decodeEnt(ld.articleSection || ''),
    autores: decodeEnt(normAuth(ld.author).join(', ')),
    rawBody: decodeEnt(String(ld.articleBody || '')),
    rawHTML: '',
    image: imgUrlFrom(ld.image),
    imageCaption: decodeEnt(imgCaptionFrom(ld.image)),
    imageAuthor: decodeEnt(imgAuthorFrom(ld.image)),
    datePublished: ld.datePublished || ''
  };
}
function extractFromReadability(){
  if (typeof Readability !== 'function') return null;
  try {
    const clone = document.cloneNode(true);
    const reader = new Readability(clone);
    const art = reader.parse();
    if (!art || !art.textContent || art.textContent.trim().length < 200) return null;
    let image = metaContent('meta[property="og:image"]') || metaContent('meta[name="twitter:image"]');
    if (!image && art.content){
      const m = art.content.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (m) image = m[1];
    }
    return {
      headline: art.title || document.title,
      description: art.excerpt || metaContent('meta[name="description"]') || '',
      articleSection: art.siteName || '',
      autores: art.byline || '',
      rawBody: art.textContent,
      rawHTML: art.content || '',
      image: image || '',
      imageCaption: '', imageAuthor: '',
      datePublished: art.publishedTime || metaContent('meta[property="article:published_time"]') || ''
    };
  } catch(e){ return null; }
}

function extractFromSelector(rootSel, excludeSel, minChars){
  if (!rootSel) return null;
  let root;
  try { root = document.querySelector(rootSel); } catch(e){ return null; }
  if (!root) return null;
  const clone = root.cloneNode(true);
  clone.querySelectorAll('script,style,noscript').forEach(n => n.remove());
  if (excludeSel){
    try { clone.querySelectorAll(excludeSel).forEach(n => n.remove()); } catch(e){}
  }
  const rawHTML = clone.innerHTML;
  const rawBody = (clone.textContent || '').replace(/\s+/g, ' ').trim();
  if (!rawBody || rawBody.length < (minChars || UI.extractMinChars)) return null;
  let headline = metaContent('meta[property="og:title"]');
  if (!headline){
    const h1 = clone.querySelector('h1');
    if (h1) headline = h1.textContent.trim();
  }
  if (!headline){
    const h1 = document.querySelector('h1');
    if (h1) headline = h1.textContent.trim();
  }
  if (!headline) headline = document.title;
  let image = metaContent('meta[property="og:image"]') || metaContent('meta[name="twitter:image"]');
  if (!image){
    const im = clone.querySelector('img');
    if (im) image = im.getAttribute('src') || '';
  }
  return {
    headline,
    description: metaContent('meta[name="description"]') || '',
    articleSection: metaContent('meta[property="article:section"]') || '',
    autores: metaContent('meta[name="author"]') || metaContent('meta[property="article:author"]') || '',
    rawBody, rawHTML,
    image: image ? absUrl(image) : '',
    imageCaption: '', imageAuthor: '',
    datePublished: metaContent('meta[property="article:published_time"]') || '',
    _source: 'custom'
  };
}

function collectAllText(){
  const out = [];
  const skip = new Set(['SCRIPT','STYLE','NOSCRIPT','IFRAME','SVG','CANVAS','VIDEO','AUDIO','FORM','BUTTON','INPUT','SELECT','TEXTAREA','NAV','HEADER','FOOTER','ASIDE','LINK','META']);
  const PAYWALL_RE = /(paywall|regwall|subscriber?[-_]?(?:banner|modal|overlay)|newsletter[-_]?(?:modal|popup))/i;

  function walk(node){
    if (node.nodeType === 3){
      const txt = (node.textContent || '').replace(/\s+/g,' ').trim();
      if (txt) out.push(txt);
      return;
    }
    if (node.nodeType !== 1) return;
    if (skip.has(node.tagName)) return;
    const role = node.getAttribute('role');
    if (role === 'navigation' || role === 'banner' || role === 'complementary') return;

    if (node.getClientRects().length === 0){
      let cs;
      try { cs = window.getComputedStyle(node); } catch(e){ return; }
      if (cs.display !== 'contents' && (cs.display === 'none' || cs.visibility === 'hidden')) return;
    }

    const cls = (typeof node.className === 'string') ? node.className.toLowerCase() : '';
    if (cls && PAYWALL_RE.test(cls)){
      if ((node.textContent || '').length > 200) return;
    }

    if (node.parentNode === document.body){
      let cs;
      try { cs = window.getComputedStyle(node); } catch(e){ cs = null; }
      if (cs && cs.position === 'fixed'){
        const z = parseInt(cs.zIndex, 10);
        if (z >= 1000){
          const rect = node.getBoundingClientRect();
          if (rect.width > 300 && rect.height > 300) return;
        }
      }
    }

    for (const child of node.childNodes) walk(child);
  }
  if (document.body) walk(document.body);
  return out.join('\n\n');
}

function extractFromAll(){
  try {
    if (typeof Readability === 'function'){
      const clone = document.cloneNode(true);
      clone.querySelectorAll('script,style,iframe,noscript,svg,canvas,video,audio,form,button,select,textarea,input,nav,header,footer,aside,[role="navigation"],[role="banner"],[role="complementary"]').forEach(n => n.remove());
      const reader = new Readability(clone);
      const art = reader.parse();
      if (art && art.textContent && art.textContent.trim().length > 200){
        return {
          headline: art.title || document.title,
          description: art.excerpt || metaContent('meta[name="description"]') || '',
          articleSection: '',
          autores: art.byline || '',
          rawBody: art.textContent,
          rawHTML: art.content || '',
          image: metaContent('meta[property="og:image"]') || '',
          imageCaption: '', imageAuthor: '',
          datePublished: art.publishedTime || '',
          _source: 'all'
        };
      }
    }
  } catch(e){}

  const text = collectAllText();
  if (!text || text.length < 200) return null;
  return {
    headline: metaContent('meta[property="og:title"]') || document.title,
    description: metaContent('meta[name="description"]') || '',
    articleSection: '',
    autores: metaContent('meta[name="author"]') || '',
    rawBody: text,
    rawHTML: '',
    image: metaContent('meta[property="og:image"]') || metaContent('meta[name="twitter:image"]') || '',
    imageCaption: '', imageAuthor: '',
    datePublished: '',
    _source: 'all'
  };
}

function extractAuto(){
  const ld = extractFromJSONLD();
  const jsonArt = (ld && ld.articleBody) ? buildFromJSONLD(ld) : null;
  const readArt = extractFromReadability();
  if (!jsonArt && !readArt) return null;
  if (!jsonArt){ readArt._source = 'readability'; return readArt; }
  if (!readArt){ jsonArt._source = 'jsonld'; return jsonArt; }
  const lJson = (jsonArt.rawBody || '').trim().length;
  const lRead = (readArt.rawBody || '').trim().length;
  const rich  = countRichElements(readArt.rawHTML);
  if (lJson < AUTO_MIN_LEN && lRead < AUTO_MIN_LEN){
    if (lRead > lJson){ readArt._source = 'readability'; return readArt; }
    jsonArt._source = 'jsonld'; return jsonArt;
  }
  if (lRead >= AUTO_MIN_RATIO * lJson && rich >= AUTO_MIN_RICH){
    readArt._source = 'readability'; return readArt;
  }
  jsonArt._source = 'jsonld'; return jsonArt;
}

function extractArticleWithConfig(extraction, overrideSrc){
  const ex = extraction || currentExtraction();
  if (ex.mode === 'selector'){
    return extractFromSelector(ex.root, ex.exclude, ex.minChars);
  }
  if (ex.mode === 'all'){
    return extractFromAll();
  }
  const src = overrideSrc || currentReaderSource();
  if (src === 'jsonld'){
    const ld = extractFromJSONLD();
    if (ld && ld.articleBody){
      const art = buildFromJSONLD(ld);
      art._source = 'jsonld';
      return art;
    }
    return null;
  }
  if (src === 'readability'){
    const art = extractFromReadability();
    if (art) art._source = 'readability';
    return art;
  }
  return extractAuto();
}
function extractArticle(){
  return extractArticleWithConfig(currentExtraction());
}

