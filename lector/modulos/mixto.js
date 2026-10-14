// Modo mixto y limpieza de bloques del lector.
//
// El JSON-LD trae el texto bueno del artículo, pero sin estructura.
// Readability trae la estructura (intertítulos, figuras, listas) y también
// lo que se le cuela: newsletters, relacionados, avisos de carga. El modo
// mixto se queda con los bloques de Readability cuyo texto está en el
// JSON. Se compara por «tejas» (grupos de K palabras seguidas, ya
// normalizadas), así que comillas, espacios o entidades distintas no
// importan. Con artículos reales la cobertura sale binaria: cada bloque
// está entero en el JSON (100 %) o no está (0 %).
//
// Los bloques son los de 16-bloques.js ({tipo, html, src, items…}).
// Quien llama pasa textoDe(bloque) → texto plano, porque aquí no hay DOM.
// lector/build.mjs lo mete tal cual en el lector y tests/lector lo prueba.

const K = 5;
const UMBRAL_BLOQUE = 0.5;   // parte del bloque que tiene que estar en el JSON
const UMBRAL_JSON = 0.8;     // parte del JSON que tiene que estar en Readability
const PARRAFO_LARGO = 40;    // palabras; dos así seguidos tras el final del JSON = JSON recortado

export function normalizar(texto){
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
function tejas(texto){
  const p = normalizar(texto).split(' ').filter(Boolean);
  const out = [];
  for (let i = 0; i + K <= p.length; i++) out.push(p.slice(i, i + K).join(' '));
  return out;
}
function palabras(texto){ return normalizar(texto).split(' ').filter(Boolean).length; }

const DE_TEXTO = new Set(['p', 'q', 'h', 'list', 'pre']);
export function esDeTexto(b){ return !!b && DE_TEXTO.has(b.tipo); }

// Parte del texto que está en el JSON. Lo que no llega a K palabras (un
// intertítulo corto) cuenta si aparece tal cual.
function cobertura(texto, tejasJson, jsonNorm){
  const t = tejas(texto);
  if (t.length) return t.filter(x => tejasJson.has(x)).length / t.length;
  const n = normalizar(texto);
  return n && jsonNorm.includes(' ' + n + ' ') ? 1 : 0;
}

// origen: 'mixto' (conservar = índices de los bloques que se quedan),
// 'jsonld' (Readability no tiene el artículo entero: el DOM está recortado
// o ha cogido otra cosa) o 'readability' (no hay JSON, el JSON está
// recortado o no sobra nada).
export function decidirMixto(bloques, textoJson, textoDe){
  const jsonNorm = ' ' + normalizar(textoJson) + ' ';
  const tejasJson = new Set(tejas(textoJson));
  if (!tejasJson.size) return { origen: 'readability' };

  const textos = bloques.map(b => esDeTexto(b) ? textoDe(b) : '');
  const tejasR = new Set(tejas(textos.join(' ')));
  let enR = 0;
  tejasJson.forEach(x => { if (tejasR.has(x)) enR++; });
  if (enR / tejasJson.size < UMBRAL_JSON) return { origen: 'jsonld' };

  const dentro = bloques.map((b, i) => esDeTexto(b) && cobertura(textos[i], tejasJson, jsonNorm) >= UMBRAL_BLOQUE);
  const ultimo = dentro.lastIndexOf(true);
  if (ultimo < 0) return { origen: 'jsonld' };

  // JSON recortado (muro de pago en el JSON-LD): tras su último bloque
  // siguen párrafos largos que no están. Lo que se cuela suele ser corto.
  let largos = 0;
  for (let i = ultimo + 1; i < bloques.length; i++){
    if (bloques[i].tipo === 'p' && palabras(textos[i]) >= PARRAFO_LARGO) largos++;
  }
  if (largos >= 2) return { origen: 'readability' };

  // Una imagen (o un separador) se queda si el bloque de texto que la sigue
  // se queda; si no hay texto después, mira el de antes.
  const conservar = [];
  bloques.forEach((b, i) => {
    if (esDeTexto(b)){ if (dentro[i]) conservar.push(i); return; }
    let j = i + 1;
    while (j < bloques.length && !esDeTexto(bloques[j])) j++;
    if (j < bloques.length){ if (dentro[j]) conservar.push(i); return; }
    j = i - 1;
    while (j >= 0 && !esDeTexto(bloques[j])) j--;
    if (j >= 0 && dentro[j]) conservar.push(i);
  });
  if (conservar.length === bloques.length) return { origen: 'readability' };
  return { origen: 'mixto', conservar };
}

// La misma foto en tamaños distintos: «…_1200.jpg», «…_600.jpg»,
// «…_orig.jpg», «…-1024x768.webp», «…_320w_0.webp», ?w=… La clave es el
// UUID si lo hay (Prensa Ibérica, La Región) o la ruta sin extensión ni
// sufijos de tamaño.
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const SUFIJO = /(?:[_-](?:\d{2,4}w?|\d{2,4}x\d{2,4}|orig|original|large|medium|small|thumb|default|scaled)|@\dx)$/i;
export function claveImagen(url){
  let ruta = String(url || '').trim();
  if (!ruta) return '';
  ruta = ruta.replace(/^(?:[a-z]+:)?\/\/[^/]+/i, '').split(/[?#]/)[0];
  const uuid = ruta.match(UUID);
  if (uuid) return uuid[0].toLowerCase();
  const corte = ruta.lastIndexOf('/');
  let nombre = ruta.slice(corte + 1).replace(/\.(?:jpe?g|png|webp|gif|avif)$/i, '');
  let antes;
  do { antes = nombre; nombre = nombre.replace(SUFIJO, ''); } while (nombre && nombre !== antes);
  return (ruta.slice(0, corte + 1) + nombre).toLowerCase();
}

// Fuera las imágenes que repiten una anterior (galerías que traen la misma
// foto en otro tamaño). Si la repetida trae pie y la primera no, se lo pasa.
export function sinImagenesRepetidas(bloques){
  const vistas = new Map();
  return bloques.filter(b => {
    if (b.tipo !== 'img') return true;
    const k = claveImagen(b.src);
    if (!k) return true;
    const primera = vistas.get(k);
    if (!primera){ vistas.set(k, b); return true; }
    if (!primera.caption && b.caption) primera.caption = b.caption;
    return false;
  });
}

// Promociones del medio al principio o al final del texto: «¿Ya nos
// sigues?», newsletters, «Si deseas leer más artículos…». Solo en los
// bordes y solo bloques cortos, para no tocar el artículo.
const PROMO = new RegExp([
  'newsletter', 'bolet[ií]n', 'suscr[ií]b', 'subscri', 'ap[uú]nta', 'an[oó]ta(te|nos)',
  'm[aá]rcanos', '(medio|fuente) preferente', 'ya nos sigues', 's[ií]gu?enos', 'seg[uú]enos',
  'si deseas leer m[aá]s', 'te puede interesar', 'lee tambi[eé]n', 'noticias relacionadas',
  'reg[ií]strate', 'rex[ií]strate', 'descarga (la|nuestra) app', 'canal de (whatsapp|telegram)',
  'follow us', 'sign up'
].join('|'), 'i');
const PROMO_MAX = 60;   // palabras
export function sinPromosEnBordes(bloques, textoDe){
  const esPromo = b => esDeTexto(b) && palabras(textoDe(b)) <= PROMO_MAX && PROMO.test(textoDe(b));
  const fuera = new Set();
  for (const orden of [bloques.map((_, i) => i), bloques.map((_, i) => bloques.length - 1 - i)]){
    let quitados = 0;
    for (const i of orden){
      const b = bloques[i];
      if (!esDeTexto(b)) continue;   // las imágenes del borde se quedan
      if (quitados >= 3 || !esPromo(b)) break;
      fuera.add(i); quitados++;
    }
  }
  return fuera.size ? bloques.filter((_, i) => !fuera.has(i)) : bloques;
}
