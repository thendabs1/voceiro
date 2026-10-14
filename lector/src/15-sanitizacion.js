/* ============================================================
   12. SANITIZACIÓN
   ============================================================ */
const ALLOWED_TAGS = new Set([
  'B','STRONG','I','EM','U','S','SUP','SUB','CODE','MARK','A','BR','SPAN',
  'P','BLOCKQUOTE','H1','H2','H3','H4','H5','H6','UL','OL','LI','PRE','HR',
  'DIV','SECTION','ARTICLE','FIGURE','FIGCAPTION','IMG'
]);
const DROP_TAGS = new Set(['SCRIPT','STYLE','IFRAME','FORM','INPUT','SVG','NOSCRIPT','OBJECT','EMBED',
                           'VIDEO','AUDIO','CANVAS','BUTTON','SELECT','TEXTAREA','SOURCE']);

function sanitizeNode(node){
  Array.from(node.childNodes).forEach(child => {
    if (child.nodeType === 3) return;
    if (child.nodeType !== 1){ child.remove(); return; }
    const tag = child.tagName;
    if (DROP_TAGS.has(tag)){ child.remove(); return; }
    sanitizeNode(child);
    if (!ALLOWED_TAGS.has(tag)){
      const parent = child.parentNode;
      while (child.firstChild) parent.insertBefore(child.firstChild, child);
      parent.removeChild(child);
    } else {
      Array.from(child.attributes).forEach(a => {
        if (tag === 'A' && a.name === 'href'){
          const v = a.value.trim();
          if (/^(https?:|mailto:|#|\/)/i.test(v)){
            child.setAttribute('target','_blank');
            child.setAttribute('rel','noopener noreferrer');
          } else {
            child.removeAttribute('href');
          }
        } else if (tag === 'IMG' && a.name === 'src'){
          child.setAttribute('src', absUrl(a.value));
        } else if (tag === 'IMG' && a.name === 'alt'){
          // keep
        } else if (tag === 'P' && a.name === 'data-il-embed' && /^[a-z]+$/.test(a.value)){
          // keep: embebido marcado en 17-extractores
        } else if (tag === 'P' && a.name === 'data-il-url' && /^https?:\/\//i.test(a.value)){
          // keep
        } else {
          child.removeAttribute(a.name);
        }
      });
    }
  });
}
function sanitizeHTML(html){
  if (!html) return '';
  try {
    const doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
    const root = doc.body.firstChild;
    if (!root) return '';
    sanitizeNode(root);
    return root.innerHTML;
  } catch(e){ return ''; }
}

