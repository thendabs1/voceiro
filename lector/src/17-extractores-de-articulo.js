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
// De varias imágenes (suelen ser la misma en tamaños distintos), la más ancha.
function imagenPrincipal(im){
  if (!Array.isArray(im)) return im;
  const conAncho = im.filter(x => x && typeof x === 'object' && Number(x.width) > 0);
  if (!conAncho.length) return im[0];
  return conAncho.reduce((a, b) => Number(b.width) > Number(a.width) ? b : a);
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
  const im = imagenPrincipal(ld.image);
  return {
    headline: decodeEnt(ld.headline || ''),
    description: decodeEnt(ld.description || ''),
    articleSection: decodeEnt(ld.articleSection || ''),
    autores: decodeEnt(normAuth(ld.author).join(', ')),
    // Hay CMS que dejan dentro el CSS y el JS de los gráficos (Onm).
    rawBody: limpiarCodigoIncrustado(decodeEnt(String(ld.articleBody || ''))),
    rawHTML: '',
    image: imgUrlFrom(im),
    imageCaption: decodeEnt(imgCaptionFrom(im)),
    imageAuthor: decodeEnt(imgAuthorFrom(im)),
    datePublished: ld.datePublished || ''
  };
}
// Publicidad metida entre los párrafos (Nós Diario: div.ad-slot con un GIF
// enlazado a /ads/): Readability la deja pasar y el modo mixto también,
// porque va entre bloques que se quedan. Se quita antes.
const SEL_PUBLICIDAD = [
  '.ad-slot', '[data-mark^="Publici"]', 'a[href*="/ads/"]', 'ins.adsbygoogle', '[id^="div-gpt-ad"]',
  '[class*="outbrain"]', '[id*="outbrain"]', '[class*="taboola"]', '[id*="taboola"]',
  '[class~="publicidad"]', '[class~="publicidade"]', '[class~="publicitat"]', '[class~="advertisement"]'
].join(',');
const ALT_PUBLICIDAD = /^\s*(publicidad|publicidade|publicitat|advertisement|anuncio)\b/i;
function limpiarPublicidad(doc){
  try {
    doc.querySelectorAll(SEL_PUBLICIDAD).forEach(n => n.remove());
    doc.querySelectorAll('img[alt]').forEach(im => {
      if (ALT_PUBLICIDAD.test(im.getAttribute('alt') || '')) (im.closest('a') || im).remove();
    });
  } catch(e){}
  return doc;
}

// Embebidos (tweets, vídeos…): el sanitizador quita los iframes y
// Readability se deja muchos, así que desaparecían sin rastro. Antes de
// extraer se cambian por un párrafo marcado (data-il-embed, data-il-url)
// que llega a los bloques como tarjeta con enlace al original. No se carga
// nada de terceros.
function textoPlano(el){ return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : ''; }
function enlaceQueCasa(el, re){
  const a = [...el.querySelectorAll('a[href]')].reverse().find(x => re.test(x.getAttribute('href')));
  return a ? a.getAttribute('href') : '';
}
function parametro(url, nombre){
  try { return new URL(url, location.href).searchParams.get(nombre) || ''; } catch(e){ return ''; }
}
const fuenteDe = el => el.getAttribute('src') || el.getAttribute('data-src') || '';
const EMBEBIDOS = [
  { red: 'x', sel: 'blockquote.twitter-tweet',
    url: el => enlaceQueCasa(el, /\/status\/\d+/), texto: el => textoPlano(el.querySelector('p')) },
  { red: 'x', sel: 'iframe[src*="platform.twitter.com/embed"],iframe[data-tweet-id]',
    url: el => { const id = el.getAttribute('data-tweet-id') || parametro(fuenteDe(el), 'id');
                 return /^\d+$/.test(id) ? 'https://x.com/i/status/' + id : ''; } },
  { red: 'youtube', sel: 'iframe[src*="youtube.com/embed/"],iframe[src*="youtube-nocookie.com/embed/"],iframe[data-src*="youtube.com/embed/"]',
    url: el => { const m = fuenteDe(el).match(/\/embed\/([\w-]{6,})/); return m ? 'https://www.youtube.com/watch?v=' + m[1] : ''; },
    texto: el => el.getAttribute('title') || '' },
  { red: 'youtube', sel: 'lite-youtube[videoid]',
    url: el => 'https://www.youtube.com/watch?v=' + encodeURIComponent(el.getAttribute('videoid')),
    texto: el => el.getAttribute('playlabel') || '' },
  { red: 'vimeo', sel: 'iframe[src*="player.vimeo.com/video/"]',
    url: el => { const m = fuenteDe(el).match(/\/video\/(\d+)/); return m ? 'https://vimeo.com/' + m[1] : ''; },
    texto: el => el.getAttribute('title') || '' },
  { red: 'instagram', sel: 'blockquote.instagram-media,iframe[src*="instagram.com/p/"],iframe[src*="instagram.com/reel/"]',
    url: el => (el.getAttribute('data-instgrm-permalink') || enlaceQueCasa(el, /instagram\.com\/(p|reel)\//) || fuenteDe(el))
                 .replace(/\/embed.*$/, '/').split('?')[0] },
  { red: 'tiktok', sel: 'blockquote.tiktok-embed',
    url: el => el.getAttribute('cite') || enlaceQueCasa(el, /tiktok\.com\/.+\/video\//),
    texto: el => textoPlano(el.querySelector('section > p') || el.querySelector('p')) },
  { red: 'bluesky', sel: 'blockquote.bluesky-embed,iframe[src*="embed.bsky.app/embed/"]',
    url: el => enlaceQueCasa(el, /bsky\.app\/profile\/.+\/post\//) ||
               fuenteDe(el).replace(/^.*\/embed\/([^/]+)\/app\.bsky\.feed\.post\/([\w]+).*$/, 'https://bsky.app/profile/$1/post/$2'),
    texto: el => textoPlano(el.querySelector('p')) },
  { red: 'facebook', sel: 'iframe[src*="facebook.com/plugins/"]', url: el => parametro(fuenteDe(el), 'href') }
];
// raiz: un documento (clonado) o un elemento (modo selector).
function marcarEmbebidos(raiz){
  const doc = raiz.ownerDocument || raiz;
  const tope = raiz.body || raiz;
  try {
    EMBEBIDOS.forEach(e => raiz.querySelectorAll(e.sel).forEach(el => {
      if (!el.isConnected) return;
      const url = absUrl(e.url(el) || '');
      if (!/^https?:\/\//i.test(url)) return;
      // Se sube por los envoltorios que no tienen nada más: Readability tira
      // los div con clases como «media» o «widget» aunque lleven el párrafo.
      let caja = el;
      while (caja.parentElement && caja.parentElement !== tope && caja.parentElement.children.length === 1 &&
             !/^(ARTICLE|MAIN|SECTION)$/.test(caja.parentElement.tagName) &&
             textoPlano(caja.parentElement) === textoPlano(caja)) caja = caja.parentElement;
      const p = doc.createElement('p');
      p.setAttribute('data-il-embed', e.red);
      p.setAttribute('data-il-url', url);
      p.textContent = (e.texto ? e.texto(el) : '').slice(0, 500) || '·';
      caja.replaceWith(p);
    }));
  } catch(e){}
  return raiz;
}

function extractFromReadability(){
  if (typeof Readability !== 'function') return null;
  try {
    const clone = marcarEmbebidos(limpiarPublicidad(document.cloneNode(true)));
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
  marcarEmbebidos(clone);
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
      const clone = marcarEmbebidos(limpiarPublicidad(document.cloneNode(true)));
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
  // Mixto (lector/modulos/mixto.js): los bloques de Readability que están
  // en el JSON. Los metadatos (autor, sección, pie de la portada) son los
  // del JSON, que suelen ser mejores.
  const bloques = buildBlocksFromHTML(readArt.rawHTML);
  const d = decidirMixto(bloques, jsonArt.rawBody, textoDeBloque);
  if (d.origen === 'jsonld'){ jsonArt._source = 'jsonld'; return jsonArt; }
  if (d.origen === 'readability'){ readArt._source = 'readability'; return readArt; }
  const elegidos = d.conservar.map(i => bloques[i]);
  return Object.assign({}, jsonArt, {
    bloques: elegidos,
    rawBody: elegidos.filter(esDeTexto).map(textoDeBloque).join('\n\n'),
    rawHTML: '',
    _source: 'mixto'
  });
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

