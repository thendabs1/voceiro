/* ============================================================
   11. UTILIDADES
   ============================================================ */
function esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function stripTags(html){
  if (!html) return '';
  try {
    return new DOMParser().parseFromString(String(html), 'text/html').body.textContent || '';
  } catch(e){ return String(html).replace(/<[^>]+>/g, ''); }
}
function countWords(s){ return String(s || '').split(/\s+/).filter(Boolean).length; }
function countRichElements(html){
  if (!html) return 0;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    let n = 0;
    n += doc.querySelectorAll('b,strong').length;
    n += doc.querySelectorAll('i,em').length;
    n += doc.querySelectorAll('a[href]').length;
    n += doc.querySelectorAll('h2,h3,h4').length;
    n += doc.querySelectorAll('ul,ol').length;
    n += doc.querySelectorAll('blockquote').length;
    n += doc.querySelectorAll('img').length;
    return n;
  } catch(e){ return 0; }
}
function absUrl(u){
  if (!u) return '';
  try { return new URL(u, location.href).href; } catch(e){ return u; }
}
function isValidImage(el){
  if (!el) return false;
  const src = (el.getAttribute('src') || '').trim();
  if (!src) return false;
  if (src.startsWith('data:image') && src.length < 800) return false;
  if (/[?&](w|width)=\d{1,3}\b/i.test(src)){
    const m = src.match(/[?&](w|width)=(\d+)/i);
    if (m && parseInt(m[2], 10) <= 3) return false;
  }
  if (/[?&](h|height)=\d{1,3}\b/i.test(src)){
    const m = src.match(/[?&](h|height)=(\d+)/i);
    if (m && parseInt(m[2], 10) <= 3) return false;
  }
  if (/(pixel|tracker|beacon|spacer|blank|transparent)\.(gif|png|jpg|jpeg)/i.test(src)) return false;
  if (/\/(icon|icons|logo|logos|avatar|avatars|thumb|thumbs|sprite|favicon)\b/i.test(src)) return false;
  const w = parseInt(el.getAttribute('width') || '0', 10);
  const h = parseInt(el.getAttribute('height') || '0', 10);
  if ((w > 0 && w <= 3) || (h > 0 && h <= 3)) return false;
  return true;
}
function cssEscape(s){
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
  return String(s).replace(/([^\w-])/g, '\\$1');
}

