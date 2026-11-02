// Galerías independientes del origen del texto. Solo se recogen colecciones
// declaradas o contenedores de galería; nunca todas las imágenes de la página.
import { claveImagen } from './mixto.js';

const SEL_GALERIAS = [
  '[itemtype$="/ImageGallery"]', '[data-component="gallery"]',
  '.wp-block-gallery', '.gallery', '.photo-gallery', '.photogallery',
  '.fotogaleria', '.galeria', '.c-detail__gallery'
].join(',');
const AJENOS_GALERIA = 'nav,aside,footer,[role="navigation"],.related,.related-news,[class*="recommend"],#il-full';
const PIE_GALERIA = 'figcaption,[itemprop="caption"],.gallery-caption';
const AUTOR_GALERIA = '[itemprop="author"],[itemprop="creditText"],.c-detail__media__author,.credit,.author';
const arrayGaleria = x => x == null ? [] : Array.isArray(x) ? x : [x];
const textoGaleria = x => typeof x === 'string' ? x.replace(/\s+/g, ' ').trim() : '';
const tipoGaleria = (x, tipo) => arrayGaleria(x && x['@type']).some(t => String(t).split(/[\/#]/).pop() === tipo);
const nombreGaleria = x => arrayGaleria(x).map(a => typeof a === 'string' ? a : a && a.name || '').filter(Boolean).join(', ');

function urlGaleria(valor, base){
  if (typeof valor !== 'string' || !valor.trim()) return '';
  try {
    const u = new URL(valor, base);
    return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.href : '';
  } catch(e){ return ''; }
}
export function claveImagenGaleria(url){
  // Este CMS inserta la transformación antes de /uploads/ (Diario de León).
  const ruta = String(url || '').replace(/\/files\/[^/]+(?=\/uploads\/)/, '');
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(ruta)) return claveImagen(ruta);
  // Una foto numerada (partido-125.jpg) no es una versión de partido.jpg.
  return ruta.replace(/^(?:[a-z]+:)?\/\/[^/]+/i, '').split(/[?#]/)[0]
    .replace(/\.(?:jpe?g|png|webp|gif|avif)$/i, '')
    .replace(/(?:[_-](?:\d{2,4}x\d{2,4}|\d{2,4}w(?:_\d+)?|orig|original|large|medium|small|thumb)|@\dx)$/i, '').toLowerCase();
}
function imagenGaleria(im, base){
  if (typeof im === 'string') im = { url: im };
  if (!im || typeof im !== 'object') return null;
  const src = urlGaleria(im.contentUrl || im.url, base);
  if (!src || /\/(?:logo|logos|avatar|avatars|icons)\//i.test(src) ||
      /(?:pixel|tracker|beacon|spacer|blank|transparent)\.(?:gif|png|jpe?g)(?:[?#]|$)/i.test(src)) return null;
  const miniatura = urlGaleria(im.thumbnailUrl, base);
  return { tipo: 'img', src,
    miniatura: miniatura && !/(?:pixel|tracker|beacon|spacer|blank|transparent)\.(?:gif|png|jpe?g)(?:[?#]|$)/i.test(miniatura) ? miniatura : src,
    alt: textoGaleria(im.alt || im.name),
    caption: textoGaleria(im.caption || im.description),
    autor: textoGaleria(im.creditText || nombreGaleria(im.creator || im.author)),
    posicion: Number(im.position) || 0 };
}
function unicasGaleria(imagenes){
  const vistas = new Map();
  for (const im of imagenes.filter(Boolean)){
    const k = claveImagenGaleria(im.src);
    const antes = vistas.get(k);
    if (!antes){ vistas.set(k, { ...im }); continue; }
    for (const campo of ['caption', 'autor', 'alt']) if (!antes[campo]) antes[campo] = im[campo];
  }
  return [...vistas.values()];
}

export function galeriasDeJSONLD(datos, base){
  const out = [];
  const nodos = new Map();
  const objetos = [];
  function indexar(x){
    if (!x || typeof x !== 'object') return;
    objetos.push(x);
    if (x['@id'] && Object.keys(x).length > 1) nodos.set(x['@id'], x);
    Object.values(x).forEach(v => { if (Array.isArray(v)) v.forEach(indexar); else if (v && typeof v === 'object') indexar(v); });
  }
  datos.forEach(indexar);
  // Un bloque ImageGallery suelto no demuestra que sea el contenido principal
  // si la página también declara una noticia con texto propio.
  const hayArticuloConTexto = objetos.some(o => /Article$|BlogPosting/.test(arrayGaleria(o['@type']).join(' ')) && textoGaleria(o.articleBody));
  const resolver = x => x && x['@id'] && nodos.get(x['@id']) || x;
  const secundarias = new Set(), propietarios = new Map();
  for (const o of objetos){
    for (const parte of arrayGaleria(o.hasPart)) secundarias.add(resolver(parte));
    if (/Article$|BlogPosting/.test(arrayGaleria(o['@type']).join(' '))){
      for (const parte of [...arrayGaleria(o.hasPart), ...arrayGaleria(o.mainEntityOfPage), ...arrayGaleria(o.mainEntity)])
        propietarios.set(resolver(parte), o);
    }
  }
  const visitados = new Set();
  function visitar(x, propietario, principal){
    for (let o of arrayGaleria(x)){
      o = resolver(o);
      if (!o || typeof o !== 'object' || visitados.has(o)) continue;
      visitados.add(o);
      const esArticulo = /Article$|BlogPosting/.test(arrayGaleria(o['@type']).join(' '));
      const meta = esArticulo ? o : propietarios.get(o) || propietario;
      // Algunos medios declaran la fotogalería como NewsArticle y ponen las
      // fotos en image. Solo se interpreta así en rutas de fotogalerías.
      const rutaFotos = /\/(?:fotos|fotogalerias?|galleries)\//i.test(new URL(base).pathname);
      if (tipoGaleria(o, 'ImageGallery') || esArticulo && rutaFotos){
        const pagina = urlGaleria(o.url || o['@id'], base);
        if (pagina && new URL(pagina).origin + new URL(pagina).pathname !== new URL(base).origin + new URL(base).pathname) continue;
        const lista = o.image || o.associatedMedia || o.itemListElement || [];
        const imagenes = unicasGaleria(arrayGaleria(lista).map(x => {
          x = resolver(x);
          return imagenGaleria(resolver(x && x.item || x), base);
        }));
        if (imagenes.every(im => im.posicion)) imagenes.sort((a, b) => a.posicion - b.posicion);
        if (imagenes.length >= 2) out.push({ tipo: 'galeria', titulo: textoGaleria(o.headline || o.name),
          imagenes, principal: !secundarias.has(o) && principal && (!!meta || !hayArticuloConTexto),
          metadata: { ...meta, ...o, articleBody: meta && meta.articleBody || o.articleBody || '' } });
      }
      visitar(o['@graph'], meta, principal);
      visitar(o.mainEntityOfPage, meta, true);
      visitar(o.mainEntity, meta, principal);
      visitar(o.hasPart, meta, false);
    }
  }
  datos.forEach(x => visitar(x, null, true));
  return out;
}

function srcsetGaleria(valor){
  return String(valor || '').split(',').map(s => s.trim().split(/\s+/))
    .sort((a, b) => (parseFloat(b[1]) || 0) - (parseFloat(a[1]) || 0))[0]?.[0] || '';
}
export function galeriasDelDOM(root, base, exclude = ''){
  const raices = [...root.querySelectorAll(SEL_GALERIAS)];
  if (root.matches && root.matches(SEL_GALERIAS)) raices.unshift(root);
  const out = [];
  for (const nodo of raices){
    if (nodo.closest(AJENOS_GALERIA) || out.some(g => g.nodo.contains(nodo))) continue;
    if (exclude && nodo.closest(exclude)) continue;
    const imagenes = unicasGaleria([...nodo.querySelectorAll('img')].map(im => {
      if (im.closest(AJENOS_GALERIA) || exclude && im.closest(exclude)) return null;
      const ancho = Number(im.getAttribute('width')), alto = Number(im.getAttribute('height'));
      if (ancho > 0 && ancho <= 3 || alto > 0 && alto <= 3) return null;
      const src = ['data-full-src', 'data-original', 'data-src'].map(a => im.getAttribute(a)).find(u => urlGaleria(u, base)) ||
        srcsetGaleria(im.getAttribute('data-srcset') || im.getAttribute('srcset')) || im.getAttribute('src');
      const figura = im.closest('figure') || im.parentElement;
      const pie = figura.querySelector(PIE_GALERIA);
      const autor = figura.querySelector(AUTOR_GALERIA);
      const limpio = pie && pie.cloneNode(true);
      if (limpio){
        if (limpio.matches(AUTOR_GALERIA)) limpio.textContent = '';
        else limpio.querySelectorAll(AUTOR_GALERIA).forEach(n => n.remove());
      }
      return imagenGaleria({ url: src, thumbnailUrl: im.getAttribute('src'), alt: im.getAttribute('alt'),
        caption: limpio && limpio.textContent, creditText: autor && autor.textContent }, base);
    }));
    if (imagenes.length >= 2) out.push({ tipo: 'galeria', nodo, imagenes,
      titulo: textoGaleria(nodo.getAttribute('aria-label') || nodo.getAttribute('data-title')),
      principal: false });
  }
  return out;
}

export function detectarGalerias(doc, base, { root = doc, exclude = '' } = {}){
  if (exclude){ try { root.querySelector(exclude); } catch(e){ exclude = ''; } }
  const datos = [];
  // Un selector manual delimita también las fotos: no recupera colecciones
  // del JSON de otra zona de la página.
  if (root === doc) for (const s of doc.querySelectorAll('script[type="application/ld+json"]')){
    try { datos.push(JSON.parse(s.textContent)); } catch(e){}
  }
  const json = galeriasDeJSONLD(datos, base);
  const dom = galeriasDelDOM(root, base, exclude);
  const principalDOM = root === doc ? !!doc.querySelector('body.article-gallery,body.gallery-page')
    : !!root.matches && root.matches(SEL_GALERIAS);
  const galerias = [...json];
  for (const g of dom){
    const claves = new Set(g.imagenes.map(im => claveImagenGaleria(im.src)));
    const coincide = galerias.find(j => {
      const comunes = j.imagenes.filter(im => claves.has(claveImagenGaleria(im.src))).length;
      return comunes >= 2 && comunes >= Math.min(j.imagenes.length, g.imagenes.length) / 2;
    });
    if (coincide){
      // El DOM suele ofrecer el original y el JSON una versión recortada.
      const originales = new Map(g.imagenes.map(im => [claveImagenGaleria(im.src), im]));
      coincide.imagenes = unicasGaleria([...coincide.imagenes.map(im => {
        const original = originales.get(claveImagenGaleria(im.src));
        return original ? { ...im, ...original, alt: original.alt || im.alt,
          caption: original.caption || im.caption, autor: original.autor || im.autor } : im;
      }), ...g.imagenes]);
    } else galerias.push({ ...g, principal: principalDOM });
  }
  return { galerias, principal: galerias.some(g => g.principal) };
}

// Solo las raíces comprobadas, sobre copias desconectadas del documento.
// Así los contadores y los títulos repetidos no llegan al texto del lector.
export function retirarGaleriasDelDOM(root, base){
  for (const g of galeriasDelDOM(root, base)){
    if (g.nodo !== root) g.nodo.remove();
    else g.nodo.replaceChildren();
  }
  return root;
}

export function separarImagenesDeGalerias(bloques, galerias){
  const claves = new Set(galerias.flatMap(g => g.imagenes.map(im => claveImagenGaleria(im.src))));
  return bloques.filter(b => b.tipo !== 'img' || !claves.has(claveImagenGaleria(b.src)));
}

export function pieImagenGaleria(im){
  return [im.caption, im.autor && im.autor !== im.caption ? im.autor : ''].filter(Boolean).join(' — ');
}
