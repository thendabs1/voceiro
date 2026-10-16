// ==UserScript==
// @name         Lector Universal
// @namespace    https://thendabs1.github.io/voceiro/
// @version      2.0.244
// @description  Modo lectura accesible para medios: perfil de lectura, pendientes, diccionarios, lectura rápida, extracción asistida y atajos. Complemento de Voceiro.
// @author       Voceiro
// @license      MIT
// @homepageURL  https://github.com/thendabs1/voceiro/tree/main/lector
// @updateURL    https://thendabs1.github.io/voceiro/lector.user.js
// @downloadURL  https://thendabs1.github.io/voceiro/lector.user.js
// @match        *://*/*
// @exclude      *://localhost/*
// @exclude      *://127.0.0.1/*
// @exclude      *://0.0.0.0/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_addValueChangeListener
// @grant        window.close
// @grant        window.focus
// @require      https://cdn.jsdelivr.net/npm/@mozilla/readability@0.5.0/Readability.js
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function(){
'use strict';

/* ============================================================
   1. CONSTANTES
   ============================================================ */
const SCRIPT_VERSION = '2.0.244';
const READER_SOURCES = ['auto','jsonld','readability','custom'];
// Imágenes del artículo: todas, solo las que traen pie, ninguna. Hay un
// valor para todos los medios (prefs.imagenes) y otro, opcional, por medio.
const IMAGENES = ['todas','conPie','ninguna'];
// Nombres de las redes y servicios de los embebidos (tarjeta con enlace).
const NOMBRES_REDES = { x: 'X', youtube: 'YouTube', vimeo: 'Vimeo', instagram: 'Instagram',
                        tiktok: 'TikTok', bluesky: 'Bluesky', facebook: 'Facebook',
                        datawrapper: 'Datawrapper', flourish: 'Flourish', infogram: 'Infogram',
                        genially: 'Genially', tableau: 'Tableau Public', arcgis: 'ArcGIS',
                        googlemaps: 'Google Maps', umap: 'uMap', googlesheets: 'Google Sheets' };
// Qué es el embebido, si se sabe (data-il-clase): sale en la tarjeta.
const CLASES_EMBEBIDO = { tabla: 'tabla', grafico: 'grafico', mapa: 'mapa' };
const SITE_LANGS     = ['auto','es','gl','ca','en','eu','fr','de','it','pt'];
const UI_LANGS       = ['es','gl','ca','en','eu'];
const EXTRACTION_MODES = ['auto','selector','all'];

const SITE_TYPE_IDS = [
  'diario','digital','revista','deportivo','economico',
  'tecnologia','cultural','tv','radio','agencia','otro'
];

const UI = {
  fsMin: 14, fsMax: 32,
  wMin: 480, wMax: 1400, wStep: 40,
  rsvpWPL: 8, rsvpWpmMin: 100, rsvpWpmMax: 1000, rsvpWpmStep: 50,
  fabSize: 52, fabMargin: 24, fabGap: 12,
  extractMinChars: 100
};

// Voceiro. El puente y sus eventos solo existen en su página: en el resto
// de webs, ningún script ajeno puede pedir ni recibir la configuración.
const VOCEIRO_URL = 'https://thendabs1.github.io/voceiro/';
function esVoceiro(){
  return location.origin === 'https://thendabs1.github.io' &&
         /^\/voceiro(\/|$)/.test(location.pathname);
}

/* ============================================================
   1b. PLATAFORMA (userscript)
   ------------------------------------------------------------
   Lo único que depende del gestor de userscripts: leer y guardar
   la configuración, enterarse de los cambios hechos en otra
   pestaña y el menú del gestor. La extensión tendrá su propia
   versión de este archivo, con la misma forma.
   ============================================================ */
const PLATAFORMA = {
  leer(clave, porDefecto){
    try {
      if (typeof GM_getValue === 'function') return GM_getValue(clave, porDefecto);
      const raw = localStorage.getItem(clave);
      return raw === null ? porDefecto : JSON.parse(raw);
    } catch(e){ return porDefecto; }
  },
  guardar(clave, valor){
    try {
      if (typeof GM_setValue === 'function') GM_setValue(clave, valor);
      else localStorage.setItem(clave, JSON.stringify(valor));
    } catch(e){}
  },
  // fn(valorNuevo), solo con los cambios hechos en otra pestaña.
  alCambiar(clave, fn){
    if (typeof GM_addValueChangeListener !== 'function') return;
    try {
      GM_addValueChangeListener(clave, (nombre, viejo, nuevo, remoto) => {
        if (remoto) fn(nuevo);
      });
    } catch(e){}
  },
  // Cerrar esta pestaña: con @grant window.close el gestor la cierra aunque
  // no la haya abierto un script. Puede no conseguirlo: quien llama lo mira.
  cerrarPestana(){
    try { window.close(); } catch(e){}
  },
  // Traer esta pestaña al frente (@grant window.focus); si el gestor no
  // sabe, no pasa nada.
  enfocarPestana(){
    try { window.focus(); } catch(e){}
  },
  hayMenu(){ return typeof GM_registerMenuCommand === 'function'; },
  menu(texto, fn){
    if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand(texto, fn);
  }
};

/* ── shared/sync/fusion.js (compartido con Voceiro) ── */
// Datos que comparten Voceiro y el lector (y, con la sincronización, los
// dispositivos): Pendientes, el perfil de lectura y los modos.
//
// Regla de fusión: en cada elemento gana el `actualizado` más reciente; si
// empatan, decide un orden fijo. Así fusionar en cualquier orden, o dos
// veces, da lo mismo, y los dos lados acaban con lo mismo. Lo borrado no
// desaparece: queda marcado (`borrado: true`) para que el borrado también
// viaje, y la marca caduca a los BORRADO_DIAS días.
//
// Módulo puro, sin DOM. Lo importa Voceiro (public/sync/fusion.js), el
// lector lo incluye al construirse (lector/build.mjs le quita los `export`)
// y lo prueban los tests (tests/sync/).

const BORRADO_DIAS = 60;
const PENDIENTES_MAX = 1000;   // sin leer que se conservan
const LEIDOS_MAX = 300;        // leídos que se conservan
const CAMPOS_PERFIL = ['lang', 'tema', 'fuente', 'fs', 'just', 'bionic', 'focus', 'colores'];

const DIA_MS = 86400000;

// Clave de una URL para comparar: sin #, sin www., sin parámetros de
// seguimiento y sin barra final.
function normalizeUrlForMatch(u){
  try {
    const base = (typeof location !== 'undefined' && location.href) || undefined;
    const url = new URL(u, base);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content',
     'fbclid','gclid','mc_cid','mc_eid','igshid','_ga','_gl','ref','referrer']
      .forEach(k => url.searchParams.delete(k));
    if (url.pathname.length > 1 && url.pathname.endsWith('/')){
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.href;
  } catch(e){ return String(u || ''); }
}

// Fecha en ms desde un número o una cadena ISO; 0 si no vale.
function fusionMs(v){
  if (typeof v === 'number' && isFinite(v)) return v;
  const n = Date.parse(v);
  return isFinite(n) ? n : 0;
}

// Huella para comparar estados (mismo contenido → misma cadena).
function huella(x){
  return JSON.stringify(x === undefined ? null : x);
}

// Un pendiente con la forma común. Acepta la de Voceiro (date en ms) y la
// del lector (date en ISO). Devuelve null si no vale.
function normalizarPendiente(i){
  if (!i || typeof i !== 'object' || !i.url) return null;
  const creado = fusionMs(i.date);
  const leidoEn = i.read ? fusionMs(i.readAt) : 0;
  const p = {
    url: String(i.url),
    title: String(i.title || ''),
    description: String(i.description || ''),
    image: String(i.image || ''),
    domain: String(i.domain || ''),
    date: creado ? new Date(creado).toISOString() : '',
    read: !!i.read,
    readAt: leidoEn ? new Date(leidoEn).toISOString() : null,
    actualizado: fusionMs(i.actualizado) || Math.max(creado, leidoEn),
  };
  if (i.borrado) p.borrado = true;
  return p;
}

// ¿Gana a sobre b? El más reciente; si empatan, un orden fijo.
function fusionGana(a, b){
  if (a.actualizado !== b.actualizado) return a.actualizado > b.actualizado;
  if (!!a.borrado !== !!b.borrado) return !!a.borrado;
  if (a.read !== b.read) return a.read;
  return huella(a) > huella(b);
}

function fusionPorFecha(x, y){
  return (fusionMs(y.date) - fusionMs(x.date)) || (x.url < y.url ? -1 : x.url > y.url ? 1 : 0);
}

// Une dos listas de pendientes (una URL, un elemento). Conserva los
// PENDIENTES_MAX sin leer más recientes, los LEIDOS_MAX leídos más recientes
// y los borrados de los últimos BORRADO_DIAS días. Más recientes primero.
function fusionarPendientes(a, b, ahora = Date.now()){
  const porClave = new Map();
  for (const lista of [a, b]){
    for (const i of (Array.isArray(lista) ? lista : [])){
      const p = normalizarPendiente(i);
      if (!p) continue;
      const k = normalizeUrlForMatch(p.url);
      const prev = porClave.get(k);
      if (!prev || fusionGana(p, prev)) porClave.set(k, p);
    }
  }
  const caduca = ahora - BORRADO_DIAS * DIA_MS;
  const todos = [...porClave.values()];
  const sinLeer = todos.filter(p => !p.borrado && !p.read)
    .sort(fusionPorFecha).slice(0, PENDIENTES_MAX);
  const leidos = todos.filter(p => !p.borrado && p.read)
    .sort((x, y) => (fusionMs(y.readAt) - fusionMs(x.readAt)) || fusionPorFecha(x, y))
    .slice(0, LEIDOS_MAX);
  const borrados = todos.filter(p => p.borrado && p.actualizado >= caduca);
  return [...sinLeer, ...leidos, ...borrados].sort(fusionPorFecha);
}

// El más reciente de dos bloques con `actualizado` (perfil, modos…).
function masReciente(a, b){
  if (!a) return b || null;
  if (!b) return a;
  const ta = fusionMs(a.actualizado), tb = fusionMs(b.actualizado);
  if (ta !== tb) return ta > tb ? a : b;
  return huella(a) >= huella(b) ? a : b;
}

// Colores del tema personalizado: siempre las mismas cuatro claves, en el
// mismo orden (la huella del perfil depende de él) y como #rrggbb.
const CLAVES_COLORES = ['fondo', 'texto', 'enlaces', 'titulos'];
function limpiarColores(c){
  if (!c || typeof c !== 'object') return null;
  const out = {};
  for (const k of CLAVES_COLORES){
    const v = String(c[k] || '').trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(v)) return null;
    out[k] = v;
  }
  return out;
}

// Perfil de lectura común: los campos de CAMPOS_PERFIL más `actualizado`.
function limpiarPerfil(p){
  if (!p || typeof p !== 'object') return null;
  const out = {};
  for (const k of CAMPOS_PERFIL){
    if (p[k] === undefined) continue;
    if (k === 'colores'){
      const c = limpiarColores(p[k]);
      if (c) out.colores = c;
    } else out[k] = p[k];
  }
  out.actualizado = fusionMs(p.actualizado);
  return out;
}

function fusionarPerfil(a, b){
  return masReciente(limpiarPerfil(a), limpiarPerfil(b));
}

// ── Sincronización entre dispositivos: el documento entero ──────────
// El documento que se guarda (cifrado) en el servidor reúne Pendientes,
// leídas, perfil, modos y el bloque del lector. Su fusión es simétrica:
// da lo mismo en qué orden se junten, para que dos dispositivos no se
// pisen en bucle. La cortesía de «lo que nadie ha tocado (sello 0) no se
// impone» se aplica al volcarlo en cada dispositivo, no aquí.

const LEIDAS_MAX = 5000;
const MODO_BORRADO_DIAS = 365;

function canonico(x){
  if (Array.isArray(x)) return x.map(canonico);
  if (x && typeof x === 'object'){
    const o = {};
    for (const k of Object.keys(x).sort()) o[k] = canonico(x[k]);
    return o;
  }
  return x;
}

// Huella que no depende del orden de las claves.
function huellaCanonica(x){
  return JSON.stringify(canonico(x === undefined ? null : x));
}

// Huella de un modo sin su sello: sirve para saber si cambió.
function huellaModo(m){
  if (!m || typeof m !== 'object') return '';
  const { actualizado, ...resto } = m;
  return huellaCanonica(resto);
}

// Leídas: { url: ms }. Gana la fecha más reciente y se quedan las
// LEIDAS_MAX más recientes. (Desmarcar no viaja: una leída de más no estorba.)
function fusionarLeidas(a, b){
  const m = new Map();
  for (const o of [a, b]){
    if (!o || typeof o !== 'object' || Array.isArray(o)) continue;
    for (const [k, v] of Object.entries(o)){
      const t = fusionMs(v);
      if (!m.has(k) || t > m.get(k)) m.set(k, t);
    }
  }
  const porClave = (x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0);
  const recientes = [...m.entries()]
    .sort((x, y) => (y[1] - x[1]) || porClave(x, y))
    .slice(0, LEIDAS_MAX)
    .sort(porClave);
  return Object.fromEntries(recientes);
}

// Modos: { lista: [modo con id y actualizado], borrados: { id: ms } }.
// Por modo gana el más reciente (en empate, un orden fijo) y un borrado gana
// a lo anterior o igual. La lista sale ordenada por id: quien la vuelca le
// pone su orden.
function fusionarModos(a, b, ahora = Date.now()){
  const vivos = new Map(), borrados = new Map();
  for (const x of [a, b]){
    if (!x || typeof x !== 'object') continue;
    for (const m of (Array.isArray(x.lista) ? x.lista : [])){
      if (!m || typeof m !== 'object' || !m.id) continue;
      const t = fusionMs(m.actualizado);
      const prev = vivos.get(m.id);
      if (!prev || t > prev.t || (t === prev.t && huellaModo(m) > huellaModo(prev.m))){
        vivos.set(m.id, { m, t });
      }
    }
    for (const [id, v] of Object.entries(x.borrados || {})){
      const t = fusionMs(v);
      if (!borrados.has(id) || t > borrados.get(id)) borrados.set(id, t);
    }
  }
  const caduca = ahora - MODO_BORRADO_DIAS * DIA_MS;
  const lista = [], quedan = {};
  for (const id of [...new Set([...vivos.keys(), ...borrados.keys()])].sort()){
    const v = vivos.get(id), tb = borrados.get(id);
    if (v && (tb === undefined || v.t > tb)) lista.push({ ...v.m, actualizado: v.t });
    else if (tb !== undefined && tb >= caduca) quedan[id] = tb;
  }
  return { lista, borrados: quedan };
}

function fusionarDocumento(a, b, ahora = Date.now()){
  a = a && typeof a === 'object' ? a : {};
  b = b && typeof b === 'object' ? b : {};
  return {
    v: 1,
    pendientes: fusionarPendientes(a.pendientes, b.pendientes, ahora),
    leidas: fusionarLeidas(a.leidas, b.leidas),
    perfil: fusionarPerfil(a.perfil, b.perfil),
    modos: fusionarModos(a.modos, b.modos, ahora),
    lector: masReciente(a.lector || null, b.lector || null),
  };
}

/* ── shared/tema/personalizado.js (compartido con Voceiro) ── */
// Tema personalizado, común a Voceiro y al lector (lector/build.mjs lo
// incluye). La persona elige cuatro colores (fondo, texto, enlaces y títulos,
// ya limpios con limpiarColores de shared/sync/fusion.js) y de ellos sale el
// resto de la paleta, con el contraste de lo derivado garantizado: gris
// secundario a 4,5:1, bordes a 3:1, texto sobre color a 4,5:1. Lo elegido no
// se corrige: quien lo pinta avisa si baja de 4,5:1 (contraste()).
// Los colores de estado (modos, guardar, bloquear, resaltado) vienen del tema
// base, claro u oscuro según el fondo: quien lo aplica pone ese data-theme y
// encima estas variables.
// No puede importar nada (el lector lo mete tal cual).

function canales(hex){
  const h = String(hex).replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
function aHex(rgb){
  return '#' + rgb.map(c => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('');
}

function luminancia(hex){
  const [r, g, b] = canales(hex).map(c => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Contraste WCAG entre dos #rrggbb (1 a 21).
function contraste(a, b){
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

// De a hacia b: t = 0 es a; t = 1, b.
function mezcla(a, b, t){
  const ca = canales(a), cb = canales(b);
  return aHex(ca.map((c, i) => c + (cb[i] - c) * t));
}

// Negro o blanco, lo que más contraste con c.
function extremo(c){
  return contraste('#000000', c) >= contraste('#ffffff', c) ? '#000000' : '#ffffff';
}

// Acerca color hacia el texto hasta que contraste con el fondo lo pedido; si
// ni el texto llega (lo eligió con poco contraste), hacia el negro o el blanco.
function hastaContraste(color, fondo, minimo, hacia){
  for (const destino of [hacia, extremo(fondo)]){
    for (let i = 0; i <= 20; i++){
      const c = mezcla(color, destino, i / 20);
      if (contraste(c, fondo) >= minimo) return c;
    }
  }
  return extremo(fondo);
}

// { base: 'light' | 'dark', vars: { bg, fg, accent, titulos, muted, … } }.
// 'color-scheme' va entre las vars: quien la aplica la pone como propiedad.
function paletaPersonalizada(colores){
  const { fondo, texto, enlaces, titulos } = colores;
  const oscuro = luminancia(fondo) < 0.18;
  return {
    base: oscuro ? 'dark' : 'light',
    vars: {
      'color-scheme': oscuro ? 'dark' : 'light',
      bg: fondo, fg: texto, accent: enlaces, titulos,
      muted: hastaContraste(mezcla(texto, fondo, 0.35), fondo, 4.5, texto),
      border: mezcla(fondo, texto, 0.15),
      'quote-bg': mezcla(fondo, texto, 0.05),
      'btn-bg': mezcla(fondo, texto, 0.06),
      'btn-border': hastaContraste(mezcla(fondo, texto, 0.45), fondo, 3, texto),
      'on-solid': extremo(enlaces),
      focus: contraste(enlaces, fondo) >= 3 ? enlaces : texto,
      shadow: oscuro ? 'rgba(0,0,0,.5)' : 'rgba(0,0,0,.08)',
    }
  };
}

// Variables que pone el tema personalizado (para quitarlas al cambiar de tema).
const VARS_PERSONALIZADAS = ['bg', 'fg', 'accent', 'titulos', 'muted', 'border', 'quote-bg',
  'btn-bg', 'btn-border', 'on-solid', 'focus', 'shadow'];

/* ── lector/modulos/codigo-incrustado.js ── */
// Código incrustado en el articleBody del JSON-LD.
//
// Algunos CMS sacan el articleBody quitando las etiquetas al HTML del
// cuerpo, pero sin quitar antes <style> ni <script>. Así, el CSS y el JS de
// un gráfico interactivo acaban dentro del texto, en la misma línea que la
// prosa (Onm, en Nós Diario). Aquí se quitan esos tramos.
//
// Un tramo empieza en algo que solo puede ser código: una regla CSS
// («sel{prop:»), «(function(», «var x =» o «function f(». Termina cuando,
// fuera de cadenas y con todo cerrado, vienen palabras sin símbolos de
// código. Hay que seguir las comillas porque el JS lleva prosa en sus
// cadenas ('Pasa o rato polo gráfico…'), y esa prosa, sola, parece texto.
//
// Sin DOM ni nada de fuera: lector/build.mjs lo mete tal cual en el lector
// y tests/lector lo prueba con node --test.

// Una palabra (lo que hay entre espacios) que delata código.
const SIMBOLOS = /[{}=<>[\]]|;\S|\(\)|=>|&&|\|\||^(?:var|function|return|if|const|let|else)$|[a-z]\(|\d+px|:#|--\w|[+,([]'|'[,)+\];]/;
// Dónde empieza un tramo; el grupo 1 es el código, sin el espacio de antes.
const INICIO = /(?:^|\s)((?:[.#@*>][\w.#:>*-]*,?\s+)*[.#@]?[\w.#:>*-]+\{[\w-]+:|\(function\s*\(|var \w+\s*=|function \w+\s*\()/gi;
const PALABRAS_LIMPIAS = 6;   // las que cierran un tramo
const PROSA_LARGA = 12;       // respaldo si las llaves o las comillas no cuadran

function esCodigo(palabra){ return SIMBOLOS.test(palabra); }

function sigueProsa(texto, desde){
  return !texto.slice(desde, desde + 400).split(/\s+/).filter(Boolean)
    .slice(0, PALABRAS_LIMPIAS).some(esCodigo);
}

// Si nada cuadra (una comilla o una llave sin cerrar), el tramo acaba en la
// última palabra de código antes de PROSA_LARGA palabras limpias seguidas.
function finPorPalabras(texto, inicio){
  const re = /\S+/g;
  re.lastIndex = inicio;
  let ultimo = inicio, limpias = 0, m;
  while ((m = re.exec(texto))){
    if (esCodigo(m[0])){ ultimo = m.index + m[0].length; limpias = 0; }
    else if (++limpias >= PROSA_LARGA) break;
  }
  return ultimo;
}

function finDelTramo(texto, inicio){
  let abiertas = 0, comilla = null;
  for (let j = inicio; j < texto.length; j++){
    const ch = texto[j];
    if (comilla){
      if (ch === '\\') j++;
      else if (ch === comilla) comilla = null;
      continue;
    }
    if (ch === '"' || ch === "'"){ comilla = ch; continue; }
    if (ch === '{' || ch === '(' || ch === '['){ abiertas++; continue; }
    if (ch === '}' || ch === ')' || ch === ']') abiertas = Math.max(0, abiertas - 1);
    if (abiertas === 0 && (ch === ';' || ch === '}' || ch === ')')){
      let k = j + 1;
      while (texto[k] === ';') k++;
      if (sigueProsa(texto, k)) return k;
    }
  }
  return finPorPalabras(texto, inicio);
}

function limpiarCodigoIncrustado(texto){
  texto = String(texto || '');
  const re = new RegExp(INICIO.source, INICIO.flags);
  const trozos = [];
  let pos = 0, m;
  while ((m = re.exec(texto))){
    const ini = m.index + m[0].length - m[1].length;
    const fin = finDelTramo(texto, ini);
    if (fin <= ini){ re.lastIndex = ini + 1; continue; }
    trozos.push(texto.slice(pos, ini));
    pos = re.lastIndex = fin;
  }
  if (!trozos.length) return texto;
  trozos.push(texto.slice(pos));
  return trozos.join('').replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').trim();
}

/* ── lector/modulos/mixto.js ── */
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

function normalizar(texto){
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
function esDeTexto(b){ return !!b && DE_TEXTO.has(b.tipo); }

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
function decidirMixto(bloques, textoJson, textoDe){
  const jsonNorm = ' ' + normalizar(textoJson) + ' ';
  const tejasJson = new Set(tejas(textoJson));
  if (!tejasJson.size) return { origen: 'readability' };

  // Las tablas van con el texto de al lado, como las imágenes, pero su
  // texto cuenta para ver si Readability tiene el JSON entero.
  const textos = bloques.map(b => esDeTexto(b) || b.tipo === 'tabla' ? textoDe(b) : '');
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
function claveImagen(url){
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
function sinImagenesRepetidas(bloques){
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
function sinPromosEnBordes(bloques, textoDe){
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

// Tres o más imágenes seguidas, sin texto entre ellas, forman una galería
// ({tipo: 'galeria', imagenes}): el lector las pinta en rejilla y el visor
// las recorre con ← →.
const MIN_GALERIA = 3;
function agruparGalerias(bloques){
  const out = [];
  let tanda = [];
  const cerrar = () => {
    if (tanda.length >= MIN_GALERIA) out.push({ tipo: 'galeria', imagenes: tanda });
    else out.push(...tanda);
    tanda = [];
  };
  for (const b of bloques){
    if (b.tipo === 'img') tanda.push(b);
    else { cerrar(); out.push(b); }
  }
  cerrar();
  return out;
}

/* ============================================================
   1c. CATÁLOGO DE MEDIOS
   ------------------------------------------------------------
   Es el de Voceiro: build.mjs lo saca de medios.py (con
   lector/catalogo.py) y lo pone aquí: {d, n, lang}. Los medios que
   añade cada persona son reglas suyas (CFG.sites), no catálogo.
   isKnownMediaDomain y getCatalogEntry están en 09.
   ============================================================ */
const MEDIA_CATALOG = [{"group":"Deportes","items":[{"d":"2playbook.com","n":"2Playbook","lang":"es"},{"d":"as.com","n":"Diario AS","lang":"es"},{"d":"eldesmarque.com","n":"El Desmarque","lang":"es"},{"d":"estadiodeportivo.com","n":"Estadio Deportivo","lang":"es"},{"d":"marca.com","n":"Marca","lang":"es"},{"d":"mundodeportivo.com","n":"Mundo Deportivo","lang":"es"},{"d":"palco23.com","n":"Palco23","lang":"es"},{"d":"relevo.com","n":"Relevo","lang":"es"},{"d":"sport.es","n":"Sport","lang":"es"},{"d":"superdeporte.es","n":"Superdeporte","lang":"es"}]},{"group":"Economía","items":[{"d":"bolsamania.com","n":"Bolsamania","lang":"es"},{"d":"brainsre.news","n":"Brains RE","lang":"es"},{"d":"capitalmadrid.com","n":"Capital Madrid","lang":"es"},{"d":"cincodias.com","n":"Cinco Días","lang":"es"},{"d":"theofficer.es","n":"The Officer","lang":"es"},{"d":"economiadigital.es","n":"Economía Digital","lang":"es"},{"d":"elblogsalmon.com","n":"El Blog Salmón","lang":"es"},{"d":"eleconomista.es","n":"El Economista","lang":"es"},{"d":"estrategiasdeinversion.com","n":"Estrategias de Inversión","lang":"es"},{"d":"expansion.com","n":"Expansión","lang":"es"},{"d":"finect.com","n":"Finect","lang":"es"},{"d":"idealista.com","n":"Idealista News","lang":"es"},{"d":"invertia.com","n":"Invertia","lang":"es"},{"d":"libremercado.com","n":"Libre Mercado","lang":"es"},{"d":"mercadofinanciero.com","n":"Mercado Financiero","lang":"es"},{"d":"murciaeconomia.com","n":"Murcia Economía","lang":"es"},{"d":"valenciaplaza.com","n":"Valencia Plaza","lang":"es"},{"d":"viaempresa.cat","n":"Via Empresa","lang":"ca"}]},{"group":"Tecnología","items":[{"d":"adslzone.net","n":"ADSLZone","lang":"es"},{"d":"andro4all.com","n":"Andro4all","lang":"es"},{"d":"applesfera.com","n":"Applesfera","lang":"es"},{"d":"computerhoy.com","n":"Computer Hoy","lang":"es"},{"d":"computerworld.es","n":"Computerworld España","lang":"es"},{"d":"elandroidelibre.elespanol.com","n":"El Androide Libre","lang":"es"},{"d":"elchapuzasinformatico.com","n":"El Chapuzas Informático","lang":"es"},{"d":"genbeta.com","n":"Genbeta","lang":"es"},{"d":"hardzone.es","n":"HardZone","lang":"es"},{"d":"hipertextual.com","n":"Hipertextual","lang":"es"},{"d":"ituser.es","n":"IT User","lang":"es"},{"d":"muycomputer.com","n":"MuyComputer","lang":"es"},{"d":"profesionalreview.com","n":"Profesional Review","lang":"es"},{"d":"silicon.es","n":"Silicon","lang":"es"},{"d":"teknofilo.com","n":"Teknófilo","lang":"es"},{"d":"xataka.com","n":"Xataka","lang":"es"},{"d":"xatakaciencia.com","n":"Xataka Ciencia","lang":"es"},{"d":"xatakamovil.com","n":"Xataka Móvil","lang":"es"}]},{"group":"Ciencia","items":[{"d":"agenciasinc.es","n":"SINC","lang":"es"},{"d":"consalud.es","n":"ConSalud","lang":"es"},{"d":"diariomedico.com","n":"Diario Médico","lang":"es"},{"d":"muyinteresante.okdiario.com","n":"Muy Interesante","lang":"es"},{"d":"nationalgeographic.com.es","n":"National Geographic España","lang":"es"},{"d":"naukas.com","n":"Naukas","lang":"es"},{"d":"quo.es","n":"Quo","lang":"es"}]},{"group":"Cultura","items":[{"d":"alternativaseconomicas.coop","n":"Alternativas Económicas","lang":"es"},{"d":"elcritic.cat","n":"Crític","lang":"ca"},{"d":"ctxt.es","n":"CTXT","lang":"es"},{"d":"culturainquieta.com","n":"Cultura Inquieta","lang":"es"},{"d":"elsaltodiario.com","n":"El Salto","lang":"es"},{"d":"ethic.es","n":"Ethic","lang":"es"},{"d":"jotdown.es","n":"Jot Down","lang":"es"},{"d":"lamarea.com","n":"La Marea","lang":"es"},{"d":"letraslibres.com","n":"Letras Libres","lang":"es"},{"d":"revistamongolia.com","n":"Mongolia","lang":"es"},{"d":"yorokobu.es","n":"Yorokobu","lang":"es"},{"d":"zendalibros.com","n":"Zenda Libros","lang":"es"}]},{"group":"Nacional","items":[{"d":"20minutos.es","n":"20 Minutos","lang":"es"},{"d":"abc.es","n":"ABC","lang":"es"},{"d":"antena3.com","n":"Antena 3","lang":"es"},{"d":"cadenaser.com","n":"Cadena SER","lang":"es"},{"d":"cambio16.com","n":"Cambio16","lang":"es"},{"d":"confilegal.com","n":"Confilegal","lang":"es"},{"d":"cope.es","n":"COPE","lang":"es"},{"d":"cuartopoder.es","n":"Cuarto Poder","lang":"es"},{"d":"cuatro.com","n":"Cuatro","lang":"es"},{"d":"diariocritico.com","n":"Diario Crítico","lang":"es"},{"d":"efe.com","n":"Agencia EFE","lang":"es"},{"d":"elboletin.com","n":"El Boletín","lang":"es"},{"d":"elconfidencial.com","n":"El Confidencial","lang":"es"},{"d":"eldebate.com","n":"El Debate","lang":"es"},{"d":"eldiario.es","n":"elDiario.es","lang":"es"},{"d":"elespanol.com","n":"El Español","lang":"es"},{"d":"elindependiente.com","n":"El Independiente","lang":"es"},{"d":"elmundo.es","n":"El Mundo","lang":"es"},{"d":"elpais.com","n":"El País","lang":"es"},{"d":"elperiodico.com","n":"El Periódico","lang":"es"},{"d":"elplural.com","n":"El Plural","lang":"es"},{"d":"elsiglodeuropa.es","n":"El Siglo de Europa","lang":"es"},{"d":"elviejotopo.com","n":"El Viejo Topo","lang":"es"},{"d":"europapress.es","n":"Europa Press","lang":"es"},{"d":"huffingtonpost.es","n":"El HuffPost","lang":"es"},{"d":"infolibre.es","n":"InfoLibre","lang":"es"},{"d":"larazon.es","n":"La Razón","lang":"es"},{"d":"lasexta.com","n":"La Sexta","lang":"es"},{"d":"lavanguardia.com","n":"La Vanguardia","lang":"es"},{"d":"libertaddigital.com","n":"Libertad Digital","lang":"es"},{"d":"mientrastanto.org","n":"Mientras Tanto","lang":"es"},{"d":"moncloa.com","n":"Moncloa","lang":"es"},{"d":"nuevarevista.net","n":"Nueva Revista","lang":"es"},{"d":"okdiario.com","n":"OK Diario","lang":"es"},{"d":"ondacero.es","n":"Onda Cero","lang":"es"},{"d":"periodistadigital.com","n":"Periodista Digital","lang":"es"},{"d":"publico.es","n":"Público","lang":"es"},{"d":"que.es","n":"Qué!","lang":"es"},{"d":"republica.com","n":"Republica.com","lang":"es"},{"d":"rtve.es","n":"RTVE","lang":"es"},{"d":"servimedia.es","n":"Servimedia","lang":"es"},{"d":"telecinco.es","n":"Telecinco","lang":"es"},{"d":"theobjective.com","n":"The Objective","lang":"es"},{"d":"vientosur.info","n":"Viento Sur","lang":"es"},{"d":"vozpopuli.com","n":"Vozpópuli","lang":"es"}]},{"group":"Regional · Andalucía","items":[{"d":"andaluciainformacion.es","n":"Andalucía Información","lang":"es"},{"d":"cordopolis.eldiario.es","n":"Cordópolis","lang":"es"},{"d":"diariocordoba.com","n":"Diario Córdoba","lang":"es"},{"d":"diariodealmeria.es","n":"Diario de Almería","lang":"es"},{"d":"diariodecadiz.es","n":"Diario de Cádiz","lang":"es"},{"d":"diariodejerez.es","n":"Diario de Jerez","lang":"es"},{"d":"diariodesevilla.es","n":"Diario de Sevilla","lang":"es"},{"d":"diariosur.es","n":"Diario Sur","lang":"es"},{"d":"elcorreoweb.es","n":"El Correo de Andalucía","lang":"es"},{"d":"granadadigital.es","n":"Granada Digital","lang":"es"},{"d":"granadahoy.com","n":"Granada Hoy","lang":"es"},{"d":"huelvaya.es","n":"Huelva Ya","lang":"es"},{"d":"ideal.es","n":"Ideal","lang":"es"},{"d":"laopiniondemalaga.es","n":"La Opinión de Málaga","lang":"es"},{"d":"malagahoy.es","n":"Málaga Hoy","lang":"es"},{"d":"sevillaactualidad.com","n":"Sevilla Actualidad","lang":"es"}]},{"group":"Regional · Aragón","items":[{"d":"elperiodicodearagon.com","n":"El Periódico de Aragón","lang":"es"},{"d":"heraldo.es","n":"Heraldo de Aragón","lang":"es"}]},{"group":"Regional · Asturias","items":[{"d":"elcomercio.es","n":"El Comercio","lang":"es"},{"d":"lavozdeasturias.es","n":"La Voz de Asturias","lang":"es"},{"d":"lne.es","n":"La Nueva España","lang":"es"}]},{"group":"Regional · Baleares","items":[{"d":"diariodeibiza.es","n":"Diario de Ibiza","lang":"es"},{"d":"diariodemallorca.es","n":"Diario de Mallorca","lang":"es"},{"d":"ultimahora.es","n":"Última Hora","lang":"es"}]},{"group":"Regional · Canarias","items":[{"d":"canarias7.es","n":"Canarias 7","lang":"es"},{"d":"diariodeavisos.com","n":"Diario de Avisos","lang":"es"},{"d":"eldia.es","n":"El Día","lang":"es"},{"d":"laprovincia.es","n":"La Provincia","lang":"es"}]},{"group":"Regional · Cantabria","items":[{"d":"eldiariomontanes.es","n":"El Diario Montañés","lang":"es"}]},{"group":"Regional · Castilla-La Mancha","items":[{"d":"encastillalamancha.es","n":"En Castilla-La Mancha","lang":"es"},{"d":"lanzadigital.com","n":"Lanza Digital","lang":"es"},{"d":"latribunadealbacete.es","n":"La Tribuna de Albacete","lang":"es"}]},{"group":"Regional · Castilla y León","items":[{"d":"diariodeleon.es","n":"Diario de León","lang":"es"},{"d":"diariodevalladolid.es","n":"Diario de Valladolid","lang":"es"},{"d":"elcorreodeburgos.com","n":"El Correo de Burgos","lang":"es"},{"d":"eldiadevalladolid.com","n":"El Día de Valladolid","lang":"es"},{"d":"elmirondesoria.es","n":"El Mirón de Soria","lang":"es"},{"d":"elnortedecastilla.es","n":"El Norte de Castilla","lang":"es"},{"d":"lagacetadesalamanca.es","n":"La Gaceta de Salamanca","lang":"es"},{"d":"laopiniondezamora.es","n":"La Opinión de Zamora","lang":"es"},{"d":"sorianoticias.com","n":"Soria Noticias","lang":"es"}]},{"group":"Regional · Cataluña","items":[{"d":"324.cat","n":"324","lang":"ca"},{"d":"acn.cat","n":"Agència Catalana de Notícies","lang":"ca"},{"d":"ara.cat","n":"Ara","lang":"ca"},{"d":"diaridegirona.cat","n":"Diari de Girona","lang":"ca"},{"d":"diaridetarragona.com","n":"Diari de Tarragona","lang":"ca"},{"d":"directa.cat","n":"La Directa","lang":"ca"},{"d":"e-noticies.cat","n":"e-Notícies","lang":"ca"},{"d":"elmon.cat","n":"El Món","lang":"ca"},{"d":"elnacional.cat","n":"El Nacional","lang":"ca"},{"d":"elpuntavui.cat","n":"El Punt Avui","lang":"ca"},{"d":"naciodigital.cat","n":"Nació Digital","lang":"ca"},{"d":"rac1.cat","n":"RAC1","lang":"ca"},{"d":"regio7.cat","n":"Regió7","lang":"ca"},{"d":"reusdigital.cat","n":"Reus Digital","lang":"ca"},{"d":"segre.com","n":"Segre","lang":"ca"},{"d":"vilaweb.cat","n":"VilaWeb","lang":"ca"}]},{"group":"Regional · Comunidad Valenciana","items":[{"d":"alicanteplaza.es","n":"Alicante Plaza","lang":"es"},{"d":"castellonplaza.com","n":"Castellón Plaza","lang":"es"},{"d":"elperiodicomediterraneo.com","n":"El Periódico Mediterráneo","lang":"es"},{"d":"informacion.es","n":"Información","lang":"es"},{"d":"lasprovincias.es","n":"Las Provincias","lang":"es"},{"d":"levante-emv.com","n":"Levante-EMV","lang":"es"},{"d":"valenciaextra.com","n":"Valencia Extra","lang":"es"}]},{"group":"Regional · Extremadura","items":[{"d":"elperiodicoextremadura.com","n":"El Periódico Extremadura","lang":"es"},{"d":"hoy.es","n":"Hoy","lang":"es"}]},{"group":"Regional · Galicia","items":[{"d":"atlantico.net","n":"Atlántico","lang":"es"},{"d":"campogalego.es","n":"Campo Galego","lang":"gl"},{"d":"crtvg.gal","n":"CRTVG (TVG y Radio Galega)","lang":"gl"},{"d":"diariodearousa.com","n":"Diario de Arousa","lang":"es"},{"d":"diariodeferrol.com","n":"Diario de Ferrol","lang":"es"},{"d":"diariodepontevedra.es","n":"Diario de Pontevedra","lang":"es"},{"d":"diariodevigo.com","n":"Diario de Vigo","lang":"es"},{"d":"dxtcampeon.com","n":"DxT Campeón","lang":"es"},{"d":"elcorreogallego.es","n":"El Correo Gallego","lang":"es"},{"d":"elidealgallego.com","n":"El Ideal Gallego","lang":"es"},{"d":"elprogreso.es","n":"El Progreso","lang":"es"},{"d":"farodevigo.es","n":"Faro de Vigo","lang":"es"},{"d":"ferrol360.es","n":"Ferrol 360","lang":"es"},{"d":"ferrolxa.com","n":"FerrolXA","lang":"gl"},{"d":"galiciaconfidencial.com","n":"Galicia Confidencial","lang":"gl"},{"d":"galiciadigital.com","n":"Galicia Digital","lang":"es"},{"d":"galiciae.com","n":"Galiciae","lang":"gl"},{"d":"galiciapress.es","n":"Galicia Press","lang":"es"},{"d":"galiciaunica.es","n":"Galicia Única","lang":"es"},{"d":"laopinioncoruna.es","n":"La Opinión A Coruña","lang":"es"},{"d":"laregion.es","n":"La Región","lang":"es"},{"d":"lavozdegalicia.es","n":"La Voz de Galicia","lang":"es"},{"d":"metropolitano.gal","n":"Metropolitano","lang":"es"},{"d":"mundiario.com","n":"Mundiario","lang":"es"},{"d":"nosdiario.gal","n":"Nós Diario","lang":"gl"},{"d":"pontevedraviva.com","n":"Pontevedra Viva","lang":"es"},{"d":"praza.gal","n":"Praza Pública","lang":"gl"},{"d":"radiovoz.com","n":"Radio Voz","lang":"es"},{"d":"riazor.org","n":"Riazor.org","lang":"es"},{"d":"vigoe.es","n":"Vigoé","lang":"es"}]},{"group":"Regional · La Rioja","items":[{"d":"larioja.com","n":"La Rioja","lang":"es"}]},{"group":"Regional · Madrid","items":[{"d":"madridiario.es","n":"Madridiario","lang":"es"},{"d":"telemadrid.es","n":"Telemadrid","lang":"es"}]},{"group":"Regional · Murcia","items":[{"d":"laopiniondemurcia.es","n":"La Opinión de Murcia","lang":"es"},{"d":"laverdad.es","n":"La Verdad","lang":"es"}]},{"group":"Regional · Navarra","items":[{"d":"diariodenavarra.es","n":"Diario de Navarra","lang":"es"},{"d":"noticiasdenavarra.com","n":"Noticias de Navarra","lang":"es"}]},{"group":"Regional · País Vasco","items":[{"d":"berria.eus","n":"Berria","lang":"eu"},{"d":"deia.eus","n":"Deia","lang":"es"},{"d":"diariovasco.com","n":"Diario Vasco","lang":"es"},{"d":"eitb.eus","n":"EITB","lang":"eu"},{"d":"elcorreo.com","n":"El Correo","lang":"es"},{"d":"naiz.eus","n":"Naiz","lang":"es"},{"d":"noticiasdealava.eus","n":"Noticias de Álava","lang":"es"},{"d":"noticiasdegipuzkoa.eus","n":"Noticias de Gipuzkoa","lang":"es"}]},{"group":"Internacional · Alemania","items":[{"d":"dw.com","n":"Deutsche Welle","lang":"de"},{"d":"faz.net","n":"FAZ","lang":"de"},{"d":"spiegel.de","n":"Der Spiegel","lang":"de"},{"d":"sueddeutsche.de","n":"Süddeutsche Zeitung","lang":"de"},{"d":"zeit.de","n":"Die Zeit","lang":"de"}]},{"group":"Internacional · Argentina","items":[{"d":"clarin.com","n":"Clarín","lang":"es"},{"d":"infobae.com","n":"Infobae","lang":"es"},{"d":"lanacion.com.ar","n":"La Nación","lang":"es"}]},{"group":"Internacional · Bolivia","items":[{"d":"eldeber.com.bo","n":"El Deber","lang":"es"}]},{"group":"Internacional · Brasil","items":[{"d":"cartacapital.com.br","n":"CartaCapital","lang":"pt"},{"d":"estadao.com.br","n":"O Estado de S. Paulo","lang":"pt"},{"d":"folha.uol.com.br","n":"Folha de S.Paulo","lang":"pt"},{"d":"g1.globo.com","n":"G1","lang":"pt"},{"d":"oglobo.globo.com","n":"O Globo","lang":"pt"},{"d":"veja.abril.com.br","n":"Veja","lang":"pt"}]},{"group":"Internacional · Bélgica","items":[{"d":"lalibre.be","n":"La Libre Belgique","lang":"fr"},{"d":"lesoir.be","n":"Le Soir","lang":"fr"},{"d":"politico.eu","n":"PoliticoEU","lang":"es"},{"d":"standaard.be","n":"De Standaard","lang":"nl"}]},{"group":"Internacional · Catar","items":[{"d":"aljazeera.com","n":"Al Jazeera","lang":"en"}]},{"group":"Internacional · Chile","items":[{"d":"biobiochile.cl","n":"BioBioChile","lang":"es"},{"d":"ciperchile.cl","n":"CIPER Chile","lang":"es"},{"d":"cooperativa.cl","n":"Cooperativa","lang":"es"},{"d":"eldesconcierto.cl","n":"El Desconcierto","lang":"es"},{"d":"elmostrador.cl","n":"El Mostrador","lang":"es"},{"d":"latercera.com","n":"La Tercera","lang":"es"}]},{"group":"Internacional · China","items":[{"d":"globaltimes.cn","n":"Global Times","lang":"en"},{"d":"scmp.com","n":"South China Morning Post","lang":"en"},{"d":"xinhuanet.com","n":"Xinhua","lang":"en"}]},{"group":"Internacional · Colombia","items":[{"d":"elespectador.com","n":"El Espectador","lang":"es"},{"d":"eltiempo.com","n":"El Tiempo","lang":"es"}]},{"group":"Internacional · Corea del Sur","items":[{"d":"koreaherald.com","n":"The Korea Herald","lang":"en"}]},{"group":"Internacional · Costa Rica","items":[{"d":"nacion.com","n":"La Nación (CR)","lang":"es"}]},{"group":"Internacional · EE.UU.","items":[{"d":"abcnews.com","n":"ABC News","lang":"en"},{"d":"apnews.com","n":"Associated Press","lang":"en"},{"d":"axios.com","n":"Axios","lang":"en"},{"d":"bloomberg.com","n":"Bloomberg","lang":"en"},{"d":"businessinsider.com","n":"Business Insider","lang":"en"},{"d":"cbsnews.com","n":"CBS News","lang":"en"},{"d":"cnbc.com","n":"CNBC","lang":"en"},{"d":"edition.cnn.com","n":"CNN","lang":"en"},{"d":"elnuevoherald.com","n":"El Nuevo Herald","lang":"es"},{"d":"foreignaffairs.com","n":"Foreign Affairs","lang":"en"},{"d":"foreignpolicy.com","n":"Foreign Policy","lang":"en"},{"d":"foxnews.com","n":"Fox News","lang":"en"},{"d":"msnbc.com","n":"MSNBC","lang":"en"},{"d":"nbcnews.com","n":"NBC News","lang":"en"},{"d":"newyorker.com","n":"The New Yorker","lang":"en"},{"d":"npr.org","n":"NPR","lang":"en"},{"d":"nytimes.com","n":"The New York Times","lang":"en"},{"d":"politico.com","n":"Politico","lang":"en"},{"d":"telemundo.com","n":"Telemundo","lang":"es"},{"d":"theatlantic.com","n":"The Atlantic","lang":"en"},{"d":"time.com","n":"Time","lang":"en"},{"d":"vox.com","n":"Vox","lang":"en"},{"d":"washingtonpost.com","n":"The Washington Post","lang":"en"},{"d":"wsj.com","n":"The Wall Street Journal","lang":"en"}]},{"group":"Internacional · Ecuador","items":[{"d":"elcomercio.com","n":"El Comercio (EC)","lang":"es"},{"d":"eluniverso.com","n":"El Universo","lang":"es"}]},{"group":"Internacional · El Salvador","items":[{"d":"elfaro.net","n":"El Faro","lang":"es"}]},{"group":"Internacional · Francia","items":[{"d":"euronews.com","n":"Euronews","lang":"en"},{"d":"france24.com","n":"France 24","lang":"fr"},{"d":"lefigaro.fr","n":"Le Figaro","lang":"fr"},{"d":"lemonde.fr","n":"Le Monde","lang":"fr"},{"d":"lesechos.fr","n":"Les Échos","lang":"fr"},{"d":"liberation.fr","n":"Libération","lang":"fr"},{"d":"monde-diplomatique.fr","n":"Le Monde Diplomatique","lang":"fr"},{"d":"rfi.fr","n":"RFI","lang":"fr"}]},{"group":"Internacional · Guatemala","items":[{"d":"prensalibre.com","n":"Prensa Libre","lang":"es"}]},{"group":"Internacional · Honduras","items":[{"d":"elheraldo.hn","n":"El Heraldo","lang":"es"}]},{"group":"Internacional · India","items":[{"d":"thehindu.com","n":"The Hindu","lang":"en"},{"d":"timesofindia.indiatimes.com","n":"Times of India","lang":"en"}]},{"group":"Internacional · Irlanda","items":[{"d":"independent.ie","n":"Irish Independent","lang":"en"},{"d":"irishtimes.com","n":"The Irish Times","lang":"en"},{"d":"rte.ie","n":"RTÉ","lang":"en"}]},{"group":"Internacional · Israel","items":[{"d":"haaretz.com","n":"Haaretz","lang":"en"},{"d":"jpost.com","n":"The Jerusalem Post","lang":"en"}]},{"group":"Internacional · Italia","items":[{"d":"ansa.it","n":"ANSA","lang":"it"},{"d":"corriere.it","n":"Corriere della Sera","lang":"it"},{"d":"ilfattoquotidiano.it","n":"Il Fatto Quotidiano","lang":"it"},{"d":"ilmessaggero.it","n":"Il Messaggero","lang":"it"},{"d":"ilsole24ore.com","n":"Il Sole 24 Ore","lang":"it"},{"d":"lastampa.it","n":"La Stampa","lang":"it"},{"d":"repubblica.it","n":"La Repubblica","lang":"it"}]},{"group":"Internacional · Japón","items":[{"d":"japantimes.co.jp","n":"The Japan Times","lang":"en"}]},{"group":"Internacional · México","items":[{"d":"eluniversal.com.mx","n":"El Universal","lang":"es"},{"d":"milenio.com","n":"Milenio","lang":"es"}]},{"group":"Internacional · Nigeria","items":[{"d":"premiumtimesng.com","n":"Premium Times","lang":"en"}]},{"group":"Internacional · Países Bajos","items":[{"d":"nrc.nl","n":"NRC Handelsblad","lang":"nl"},{"d":"telegraaf.nl","n":"De Telegraaf","lang":"nl"},{"d":"trouw.nl","n":"Trouw","lang":"nl"},{"d":"volkskrant.nl","n":"de Volkskrant","lang":"nl"}]},{"group":"Internacional · Paraguay","items":[{"d":"abc.com.py","n":"ABC Color","lang":"es"},{"d":"ultimahora.com","n":"Última Hora (PY)","lang":"es"}]},{"group":"Internacional · Perú","items":[{"d":"elcomercio.pe","n":"El Comercio","lang":"es"},{"d":"gestion.pe","n":"Gestión","lang":"es"},{"d":"rpp.pe","n":"RPP","lang":"es"}]},{"group":"Internacional · Portugal","items":[{"d":"expresso.pt","n":"Expresso","lang":"pt"},{"d":"sol.iol.pt","n":"SOL","lang":"pt"},{"d":"observador.pt","n":"Observador","lang":"pt"},{"d":"publico.pt","n":"Público","lang":"pt"}]},{"group":"Internacional · Reino Unido","items":[{"d":"bbc.com","n":"BBC","lang":"en"},{"d":"dailymail.co.uk","n":"Daily Mail","lang":"en"},{"d":"economist.com","n":"The Economist","lang":"en"},{"d":"ft.com","n":"Financial Times","lang":"en"},{"d":"independent.co.uk","n":"The Independent","lang":"en"},{"d":"middleeasteye.net","n":"Middle East Eye","lang":"en"},{"d":"mirror.co.uk","n":"The Mirror","lang":"en"},{"d":"news.sky.com","n":"Sky News","lang":"en"},{"d":"reuters.com","n":"Reuters","lang":"en"},{"d":"telegraph.co.uk","n":"The Telegraph","lang":"en"},{"d":"theguardian.com","n":"The Guardian","lang":"en"},{"d":"thetimes.com","n":"The Times","lang":"en"}]},{"group":"Internacional · República Dominicana","items":[{"d":"diariolibre.com","n":"Diario Libre","lang":"es"},{"d":"listindiario.com","n":"Listín Diario","lang":"es"}]},{"group":"Internacional · Rusia","items":[{"d":"tass.com","n":"TASS","lang":"en"}]},{"group":"Internacional · Singapur","items":[{"d":"straitstimes.com","n":"The Straits Times","lang":"en"}]},{"group":"Internacional · Sudáfrica","items":[{"d":"mg.co.za","n":"Mail & Guardian","lang":"en"}]},{"group":"Internacional · Suiza","items":[{"d":"swissinfo.ch","n":"SWI swissinfo.ch","lang":"es"}]},{"group":"Internacional · Uruguay","items":[{"d":"elobservador.com.uy","n":"El Observador","lang":"es"},{"d":"elpais.com.uy","n":"El País (UY)","lang":"es"}]},{"group":"Internacional · Venezuela","items":[{"d":"elnacional.com","n":"El Nacional","lang":"es"}]},{"group":"Internacional · África","items":[{"d":"africanews.com","n":"Africanews","lang":"en"}]}];


// ============================================================
// FUNCIONES Y UTILIDADES
// ============================================================

const CATALOG_FLAT = (() => {
  const out = [];
  MEDIA_CATALOG.forEach(g => {
    g.items.forEach(it => out.push(Object.assign({ group: g.group }, it)));
  });
  return out;
})();

const CATALOG_BY_DOMAIN = (() => {
  const m = new Map();
  CATALOG_FLAT.forEach(it => m.set(it.d, it));
  return m;
})();
/* ============================================================
   2. SERVICIOS EXTERNOS («Abrir en…»)
   ------------------------------------------------------------
   Lista configurable de servicios a los que mandar la página que
   se está leyendo, como los diccionarios. Viene vacía: cada
   persona añade los suyos en Ajustes › Abrir en…, a mano o
   importando una lista en JSON.
   Plantilla: una dirección https:// con {url} (la de la página,
   tal cual) o {url_cod} (codificada).
   ============================================================ */
const SERVICIOS_MAX = 30;

function plantillaServicioValida(p){
  p = String(p || '').trim();
  return /^https:\/\/\S+$/i.test(p) && /\{url(_cod)?\}/.test(p);
}

// Deja solo servicios válidos, sin plantillas repetidas (gana el primero).
function normalizarServicios(arr){
  const vistas = new Set();
  const out = [];
  (Array.isArray(arr) ? arr : []).forEach(s => {
    if (!s || typeof s !== 'object') return;
    const nombre = String(s.nombre || '').trim().slice(0, 60);
    const plantilla = String(s.plantilla || '').trim();
    if (!nombre || !plantillaServicioValida(plantilla) || vistas.has(plantilla)) return;
    vistas.add(plantilla);
    out.push({
      id: (typeof s.id === 'string' && s.id) ? s.id : 'svc-' + Math.random().toString(36).slice(2, 9),
      nombre,
      plantilla
    });
  });
  return out.slice(0, SERVICIOS_MAX);
}

function serviciosConfigurados(){
  return Array.isArray(CFG.servicios) ? CFG.servicios : [];
}

function urlEnServicio(svc, url){
  return svc.plantilla
    .replace(/\{url_cod\}/g, encodeURIComponent(url))
    .replace(/\{url\}/g, url);
}

function abrirEnServicio(svc){
  const url = location.href;
  if (!svc || !/^https?:/i.test(url)) return;
  const destino = urlEnServicio(svc, url);
  if (!/^https:\/\//i.test(destino)) return;
  window.open(destino, '_blank', 'noopener,noreferrer');
}

// Añade los servicios de una lista importada; los repetidos se ignoran.
// Acepta { servicios: [...] } o directamente el array. Devuelve cuántos
// se añadieron, o -1 si el formato no vale.
function importarServicios(data){
  const lista = Array.isArray(data) ? data : (data && data.servicios);
  if (!Array.isArray(lista)) return -1;
  const antes = serviciosConfigurados().length;
  CFG.servicios = normalizarServicios(serviciosConfigurados().concat(lista));
  saveCfg(CFG);
  return CFG.servicios.length - antes;
}

/* ============================================================
   3. I18N
   ============================================================ */
/* ============================================================
   3. I18N
   ============================================================ */
const I18N = {
  es: {
    saveToPending: 'Guardar en pendientes',
    saveRemove: 'Quitar de pendientes',
    movedToPending: 'Movida a pendientes',
    movedToRead: 'Movida a leídas',
    fabTitle: 'Modo lectura', 
    close: '✕ Salir', 
    settingsShort: 'Configuración y medios', pendientesShort: 'Pendientes',
    textOnlyOn: 'Solo texto activado en este medio',
    textOnlyOff: 'Imágenes activadas en este medio', 
    theme: 'Tema', font: 'Fuente', size: 'Tamaño', width: 'Ancho', extra: 'Extra',
    source: 'Origen', srcAuto: 'Auto', srcJsonld: 'JSON', srcReadability: 'Lector', srcCustom: 'CSS', srcMixto: 'Mixto',
    sourceLabel: 'Fuente', words: 'palabras', imageLabel: 'Imagen',
    justify: 'Justificar', bionic: 'Bionic', focus: 'Foco',
    teleprompter: '⚡ Teleprompter',
    copyText: '📋 Copiar texto', print: '🖨 Imprimir', email: '✉ Enviar email', share: '📤 Compartir',
    ignoreSection: '🚫 Ignorar esta sección', saveLater: 'Guardar para más tarde',
    savedLater: 'Guardado en pendientes', 
    markRead: 'Marcar como leída', markUnread: 'Marcar como no leída',
    finVolver: '✓ Leída · volver a Voceiro', finSiguiente: 'Siguiente pendiente →',
    finSiguienteDe: 'Siguiente pendiente: {X}', finMarcada: 'Marcada como leída',
    personalizado: 'Personalizado', colorFondo: 'Fondo', colorTexto: 'Texto',
    colorEnlaces: 'Enlaces', colorTitulos: 'Títulos', pocoContraste: 'poco contraste',
    fabMenu: 'Más opciones del lector', fabOcultarAqui: 'Ocultar el botón en este medio',
    fabOcultoAqui: 'Botón oculto en este medio', fabMostrarAqui: 'Mostrar el botón en este medio',
    fabNadaAqui: 'Aquí el botón no tiene nada que ofrecer', fabAutomatico: 'lector automático',
    volverVoceiro: 'Volver a Voceiro', apariencia: 'Apariencia',
    mas: 'Más', masAcciones: 'Más acciones',
    letraMenor: 'Letra más pequeña', letraMayor: 'Letra más grande',
    masEstrecho: 'Más estrecho', masAncho: 'Más ancho',
    imgTodas: 'Con imágenes', imgConPie: 'Solo con pie', imgNinguna: 'Sin imágenes', imgMedio: 'Imágenes en este medio', imgComoSiempre: 'Como en todos los medios', imgEnEsteMedio: 'en este medio', imgCambiarA: 'Pulsa para pasar a', verPortada: 'Ver la portada en el artículo', embebidoDe: 'Contenido de {X}', tabla: 'Tabla', grafico: 'Gráfico', mapa: 'Mapa', verEn: 'Ver en {X}', galeria: '{N} imágenes', galeriaPulsa: 'pulsa una para verlas en grande', visorAnterior: 'Imagen anterior', visorSiguiente: 'Imagen siguiente', sitesHint: 'Medios con ajustes propios: si el lector se abre solo, de dónde saca el texto, las imágenes y las secciones que se ignoran. Los demás medios usan lo de siempre.', medioSinReglas: 'Este medio aún no tiene ajustes propios', ampliarImagen: 'Ampliar imagen',
    readItems: 'Leídas', 
    keepReadItems: 'Guardar historial de leídas',
    clearRead: 'Borrar leídas',
    clearReadConfirm: '¿Borrar todas las noticias marcadas como leídas?',
    up: '↑ Subir', raeHint: 'Doble clic en palabra = Buscar',
    noArticle: 'No se pudo extraer el artículo (sitio no soportado o sin contenido).',
    srcNoJsonld: 'No hay JSON-LD con articleBody en esta página (origen: JSON).',
    srcNoReadability: 'Readability no pudo extraer el artículo de esta página (origen: Lector).',
    srcNoCustom: 'La extracción por selector no encontró contenido. Revisa la configuración del sitio.',
    srcNoAll: 'La extracción total no encontró contenido suficiente.',
    srcFallbackAuto: 'Origen no disponible. Reabriendo en Auto.',
    readerAutoAllLabel: 'Modo lector automático en todos los medios',
    readerAutoAllHint:  'Abre el lector automáticamente al entrar en cualquier medio conocido o página de artículo. Respeta los dominios desactivados y las secciones ignoradas.',
    readerAutoAllOn:    'Modo lector automático global activado',
    readerAutoAllOff:   'Modo lector automático global desactivado',
    srcSiteSaved: 'Origen del sitio: {X}. Reabriendo…',
    addSiteTitle: 'Añadir sitio a la lista',
    addSiteQuestion: '{X} no está en la lista. ¿Añadirlo con origen "{Y}"?',
    btnAddList: 'Añadir a la lista', btnOnlyOnce: 'Solo esta vez',
    btnCancel: 'Cancelar', btnUndo: 'Deshacer',
    siteAddedToast: 'Sitio añadido: {X} ({Y})', siteRemovedToast: 'Sitio eliminado: {X}',
    sessionOnlyToast: 'Origen {Y} solo para esta sesión',
    copied: 'Copiado', copyFailed: 'No se pudo copiar',
    articleCopied: '✉ Artículo copiado al portapapeles.\n\nPega en el cuerpo con Ctrl+V.',
    urlCopied: 'URL copiada al portapapeles', news: 'Noticia',
    pause: '⏸ Pausa', play: '▶ Play', repeat: '↻ Repetir', exit: '✕ Salir',
    speed: 'Velocidad', ppm: 'PPM',
    light: 'Claro', sepia: 'Sepia', dark: 'Oscuro', contrast: 'Alto contraste',
    serif: 'Serif', sans: 'Sans', dyslexic: 'Dislexia',
    settings: 'Configuración', language: 'Idioma', dictionaries: 'Diccionarios',
    dictMode: 'Modo de búsqueda', dictModeDirect: 'Directo (doble clic abre el diccionario)',
    dictModePopup: 'Popup (doble clic muestra opciones)',
    dictDefaultGl: 'Diccionario gallego predeterminado', dictDefaultEs: 'Diccionario castellano predeterminado',
    dictDefaultCa: 'Diccionario catalán predeterminado', dictDefaultEu: 'Diccionario vasco predeterminado',
    dictDefaultEn: 'Diccionario inglés predeterminado',
    dictDefaultFr: 'Diccionario francés predeterminado', dictDefaultDe: 'Diccionario alemán predeterminado',
    dictDefaultIt: 'Diccionario italiano predeterminado', dictDefaultPt: 'Diccionario portugués predeterminado',
    dictName: 'Nombre', dictUrl: 'URL de búsqueda (usa {palabra})',
    dictUrlHint: 'Usa {palabra} donde debe ir el término buscado', 
    sites: 'Medios', pendientes: 'Pendientes', readLater: 'Guardados para más tarde',
    noReadLater: 'No hay artículos pendientes.', 
    domainPh: 'dominio (ej. elpais.com)',
    modeOff: 'Desactivado', modePrompt: 'Botón', modeAuto: 'Automático', add: 'Añadir', remove: 'Eliminar',
    importBtn: 'Importar', exportBtn: 'Exportar', resetBtn: 'Restablecer',
    noSites: 'No hay sitios configurados.', confirmReset: '¿Restablecer toda la configuración?',
    siteAlready: 'Ese sitio ya está en la lista.', siteInvalid: 'Dominio no válido.',
    openReader: 'Abrir modo lectura (aquí)', addCurrent: 'Añadir sitio actual a la lista',
    addCurrentShort: 'Añadir sitio actual',
    currentSiteHint: 'Sitio actual',
    removeCurrent: 'Quitar sitio actual de la lista', ignoreSectionMenu: 'Ignorar esta sección (aquí)',
    openSettings: 'Abrir configuración', openMedias: 'Abrir lista de medios',
    alreadyInList: 'Ya estaba en la lista.', addedTo: 'Añadido:', removedFrom: 'Eliminado:',
    notInList: 'El sitio actual no está en la lista.', 
    ignoredSections: 'Secciones ignoradas', noIgnoredSections: 'Ninguna',
    sectionIgnored: 'Sección ignorada:', sectionAlreadyIgnored: 'Esa sección ya estaba ignorada.',
    cannotIgnoreSection: 'No se puede ignorar (URL sin sección clara).',
    siteAddedForIgnore: 'Sitio añadido a la lista con la sección ignorada.',
    dictNotFound: 'Diccionario no encontrado', dictSearchIn: 'Buscar en:',
    dictNoDefault: 'No hay diccionario configurado para este idioma.',
    colLang: 'Idioma', 
    searchPlaceholder: 'Buscar medio...', filterAll: 'Todos',
    filterLang: 'Idioma', 
    langAuto: 'Auto', langEs: 'Español', langGl: 'Gallego', langCa: 'Catalán',
    langEn: 'Inglés', langEu: 'Euskera', langFr: 'Francés', langDe: 'Alemán',
    langIt: 'Italiano', langPt: 'Portugués',
    openSite: 'Abrir sitio', 
    exportWarningVersion: 'El archivo importado es de una versión distinta. Se intentará importar de todos modos.',
    settingsFabTitle: 'Configuración y medios',
    addFabTitle: 'Añadir este medio a la lista',
    blocked: 'Bloqueado', unblock: 'Desbloquear',
    extractionTitle: 'Análisis de extracción',
    extractionMode: 'Método de extracción',
    extractionModeAuto: 'Automático (recomendado)',
    extractionModeSelector: 'Selector manual',
    extractionModeAll: 'Extraer todo el texto',
    extractionHintAuto: 'Usa Readability y JSON-LD automáticamente. Funciona en la mayoría de medios.',
    extractionHintSelector: 'Extrae el contenido del elemento elegido y sus descendientes.',
    extractionHintAll: 'Extrae todo el texto útil de la página, descartando menús, scripts y overlays.',
    extractionRoot: 'Selector raíz',
    extractionRootPh: 'ej. article, .article-body, [role="main"]',
    extractionExclude: 'Excluir dentro (opcional)',
    extractionExcludePh: 'ej. .ad, .banner, aside, .newsletter',
    extractionMinChars: 'Mínimo de caracteres',
    extractionPickBtn: '🎯 Elegir elemento',
    extractionDiagnoseBtn: '🔄 Analizar página',
    extractionDiagnostics: 'Diagnóstico de la página',
    extractionTitleLbl: 'Título',
    extractionMetricsLbl: 'Contenido',
    extractionPaywallLbl: 'Paywall',
    extractionOverlaysLbl: 'Overlays',
    extractionCandidatesLbl: 'Candidatos de contenedor',
    extractionPreviewLbl: 'Previsualización',
    extractionPreviewEmpty: 'Sin contenido para previsualizar.',
    extractionPaywallYes: 'Detectado',
    extractionPaywallNo: 'No detectado',
    extractionNoCandidates: 'Sin candidatos relevantes',
    extractionPickerHint: 'Pasa el ratón y haz clic para elegir el contenedor. Esc para cancelar.',
    extractionWordsShort: 'palabras',
    extractionImgsShort: 'imgs',
    extractionTestBtn: '👁 Probar en lector',
    extractionSaveBtn: 'Guardar',
    extractionCancelBtn: 'Cancelar',
    extractionSaved: 'Extracción guardada para {X}',
    extractionTestFailed: 'No se pudo extraer contenido con esta configuración.',
    extractionUseThis: 'Usar este',
    extractionSourcePrefix: 'Fuente',
    extractionCharsShort: 'chars',
    shortcuts: 'Atajos', shortcutReader: 'Atajos del lector', shortcutGlobal: 'Atajos globales',
    shortcutNoteTitle: 'Notas sobre los atajos',
    shortcutNoteReader: 'Los atajos del lector solo funcionan con el lector abierto.',
    shortcutNoteGlobal: 'Los atajos globales funcionan en cualquier página y deben incluir Ctrl, Alt o Meta.',
    shortcutNoteCapture: 'Haz clic en ✏️ y pulsa la nueva combinación. Backspace borra la asignación. Esc cancela.',
    shortcutReservedNote: 'Esc cierra el lector y no se puede cambiar.',
    shortcutCapture: 'Pulsa una tecla… (Esc cancela, Backspace borra)',
    shortcutReset: 'Restablecer atajos',
    shortcutResetConfirm: '¿Restablecer todos los atajos a los valores por defecto?',
    shortcutConflict: 'Esa combinación ya está asignada a "{X}".',
    shortcutReservedKey: 'Esa combinación está reservada por el navegador.',
    shortcutNeedsModifier: 'Los atajos globales requieren Ctrl, Alt o Meta.',
    shortcutCleared: 'Atajo eliminado.',
    shortcutSaved: 'Atajo guardado: {X}',
    shortcutEmpty: 'Sin asignar',
    scClose: 'Cerrar lector',
    scFontIncrease: 'Aumentar tamaño de fuente',
    scFontDecrease: 'Reducir tamaño de fuente',
    scToggleTheme: 'Cambiar tema (claro/oscuro)',
    scScrollTop: 'Ir al principio',
    scScrollBottom: 'Ir al final',
    scToggleBionic: 'Activar/desactivar Bionic',
    scToggleFocus: 'Activar/desactivar Foco',
    scToggleJustify: 'Activar/desactivar Justificar',
    scToggleImages: 'Mostrar/ocultar portada',
    scToggleWide: 'Alternar ancho (estrecho/ancho)',
    scSaveLater: 'Guardar en pendientes',
    scOpenSites: 'Abrir lista de medios',
    scOpenQueue: 'Abrir pendientes',
    scOpenRSVP: 'Abrir teleprompter',
    scCopyText: 'Copiar texto completo',
    scOpenReader: 'Abrir lector (en esta página)',
    scOpenMedia: 'Abrir lista de medios (global)',
    scOpenSettings: 'Abrir configuración (global)',
    scToggleTextOnly: 'Alternar solo-texto en este sitio (global)',
    scOpenVoceiro: 'Abrir Voceiro (titulares)',
    abrirEn: 'Abrir en…',
    scAbrirEn: 'Menú «Abrir en…» (global)',
    serviciosAyuda: 'Servicios a los que mandar la página que estás leyendo para abrirla en otra web. La dirección debe empezar por https:// y llevar {url} (la de la página tal cual) o {url_cod} (codificada). También puedes importar una lista.',
    serviciosVacio: 'No hay servicios. Añade uno o importa una lista.',
    serviciosNombre: 'Nombre',
    serviciosQuitar: 'Quitar',
    serviciosGestionar: 'Gestionar servicios…',
    serviciosImportar: 'Importar lista',
    serviciosExportar: 'Exportar lista',
    serviciosImportados: 'Servicios añadidos: {n}',
    serviciosFormato: 'El archivo no tiene una lista de servicios válida.',
    serviciosInvalido: 'Revisa el nombre y la dirección: debe empezar por https:// y llevar {url} o {url_cod}.',
    serviciosRepetido: 'Ese servicio ya está en la lista.',
    serviciosFab: '«Abrir en…» en el menú del botón flotante',
    serviciosFabMenu: 'mostrar u ocultar en el botón flotante',
    serviciosFabOculto: '«Abrir en…» oculto en el botón flotante',
    serviciosFabVisible: '«Abrir en…» visible en el botón flotante',
  },
  gl: {
    saveToPending: 'Gardar en pendentes',
    saveRemove: 'Quitar de pendentes',
    movedToPending: 'Movida a pendentes',
    movedToRead: 'Movida a lidas',
    fabTitle: 'Modo lectura', 
    close: '✕ Saír', 
    settingsShort: 'Configuración e medios', pendientesShort: 'Pendentes',
    textOnlyOn: 'Só texto activado neste medio',
    textOnlyOff: 'Imaxes activadas neste medio', 
    theme: 'Tema', font: 'Fonte', size: 'Tamaño', width: 'Ancho', extra: 'Extra',
    source: 'Orixe', srcAuto: 'Auto', srcJsonld: 'JSON', srcReadability: 'Lector', srcCustom: 'CSS', srcMixto: 'Mixto',
    sourceLabel: 'Fonte', words: 'palabras', imageLabel: 'Imaxe',
    justify: 'Xustificar', bionic: 'Bionic', focus: 'Foco',
    teleprompter: '⚡ Teleprompter',
    copyText: '📋 Copiar texto', print: '🖨 Imprimir', email: '✉ Enviar email', share: '📤 Compartir',
    ignoreSection: '🚫 Ignorar esta sección', saveLater: 'Gardar para máis tarde',
    savedLater: 'Gardado en pendentes', 
    markRead: 'Marcar como lida', markUnread: 'Marcar como non lida',
    finVolver: '✓ Lida · volver a Voceiro', finSiguiente: 'Seguinte pendente →',
    finSiguienteDe: 'Seguinte pendente: {X}', finMarcada: 'Marcada como lida',
    personalizado: 'Personalizado', colorFondo: 'Fondo', colorTexto: 'Texto',
    colorEnlaces: 'Ligazóns', colorTitulos: 'Títulos', pocoContraste: 'pouco contraste',
    fabMenu: 'Máis opcións do lector', fabOcultarAqui: 'Agochar o botón neste medio',
    fabOcultoAqui: 'Botón agochado neste medio', fabMostrarAqui: 'Amosar o botón neste medio',
    fabNadaAqui: 'Aquí o botón non ten nada que ofrecer', fabAutomatico: 'lector automático',
    volverVoceiro: 'Volver a Voceiro', apariencia: 'Aparencia',
    mas: 'Máis', masAcciones: 'Máis accións',
    letraMenor: 'Letra máis pequena', letraMayor: 'Letra máis grande',
    masEstrecho: 'Máis estreito', masAncho: 'Máis ancho',
    imgTodas: 'Con imaxes', imgConPie: 'Só con pé', imgNinguna: 'Sen imaxes', imgMedio: 'Imaxes neste medio', imgComoSiempre: 'Como en todos os medios', imgEnEsteMedio: 'neste medio', imgCambiarA: 'Preme para pasar a', verPortada: 'Ver a portada no artigo', embebidoDe: 'Contido de {X}', tabla: 'Táboa', grafico: 'Gráfico', mapa: 'Mapa', verEn: 'Ver en {X}', galeria: '{N} imaxes', galeriaPulsa: 'preme nunha para velas en grande', visorAnterior: 'Imaxe anterior', visorSiguiente: 'Imaxe seguinte', sitesHint: 'Medios con axustes propios: se o lector se abre só, de onde colle o texto, as imaxes e as seccións que se ignoran. Os demais medios usan o de sempre.', medioSinReglas: 'Este medio aínda non ten axustes propios', ampliarImagen: 'Ampliar imaxe',
    readItems: 'Lidas', 
    keepReadItems: 'Gardar historial de lidas',
    clearRead: 'Borrar lidas',
    clearReadConfirm: '¿Borrar todas as noticias marcadas como lidas?',
    up: '↑ Subir', raeHint: 'Dobre clic nunha palabra = Buscar',
    noArticle: 'Non se puido extraer o artigo (sitio non soportado ou sen contido).',
    srcNoJsonld: 'Non hai JSON-LD con articleBody nesta páxina (orixe: JSON).',
    srcNoReadability: 'Readability non puido extraer o artigo desta páxina (orixe: Lector).',
    srcNoCustom: 'A extracción por selector non atopou contido. Revisa a configuración do sitio.',
    srcNoAll: 'A extracción total non atopou contido suficiente.',
    srcFallbackAuto: 'Orixe non dispoñible. Reabrindo en Auto.',
    readerAutoAllLabel: 'Modo lector automático en todos os medios',
    readerAutoAllHint:  'Abre o lector automaticamente ao entrar en calquera medio coñecido ou páxina de artigo. Respecta os dominios desactivados e as seccións ignoradas.',
    readerAutoAllOn:    'Modo lector automático global activado',
    readerAutoAllOff:   'Modo lector automático global desactivado',
    srcSiteSaved: 'Orixe do sitio: {X}. Reabrindo…',
    addSiteTitle: 'Engadir sitio á lista',
    addSiteQuestion: '{X} non está na lista. ¿Engadilo con orixe "{Y}"?',
    btnAddList: 'Engadir á lista', btnOnlyOnce: 'Só esta vez',
    btnCancel: 'Cancelar', btnUndo: 'Desfacer',
    siteAddedToast: 'Sitio engadido: {X} ({Y})', siteRemovedToast: 'Sitio eliminado: {X}',
    sessionOnlyToast: 'Orixe {Y} só para esta sesión',
    copied: 'Copiado', copyFailed: 'Non se puido copiar',
    articleCopied: '✉ Artigo copiado ao portapapeis.\n\nPega no corpo con Ctrl+V.',
    urlCopied: 'URL copiada ao portapapeis', news: 'Noticia',
    pause: '⏸ Pausa', play: '▶ Reproducir', repeat: '↻ Repetir', exit: '✕ Saír',
    speed: 'Velocidade', ppm: 'PPM',
    light: 'Claro', sepia: 'Sepia', dark: 'Escuro', contrast: 'Alto contraste',
    serif: 'Serif', sans: 'Sans', dyslexic: 'Dislexia',
    settings: 'Configuración', language: 'Idioma', dictionaries: 'Dicionarios',
    dictMode: 'Modo de busca', dictModeDirect: 'Directo (dobre clic abre o dicionario)',
    dictModePopup: 'Popup (dobre clic mostra opcións)',
    dictDefaultGl: 'Dicionario galego predeterminado', dictDefaultEs: 'Dicionario castelán predeterminado',
    dictDefaultCa: 'Dicionario catalán predeterminado', dictDefaultEu: 'Dicionario vasco predeterminado',
    dictDefaultEn: 'Dicionario inglés predeterminado',
    dictDefaultFr: 'Dicionario francés predeterminado', dictDefaultDe: 'Dicionario alemán predeterminado',
    dictDefaultIt: 'Dicionario italiano predeterminado', dictDefaultPt: 'Dicionario portugués predeterminado',
    dictName: 'Nome', dictUrl: 'URL de busca (usa {palabra})',
    dictUrlHint: 'Usa {palabra} onde debe ir o termo buscado', 
    sites: 'Medios', pendientes: 'Pendentes', readLater: 'Gardados para máis tarde',
    noReadLater: 'Non hai artigos pendentes.', 
    domainPh: 'dominio (ex. elpais.com)',
    modeOff: 'Desactivado', modePrompt: 'Botón', modeAuto: 'Automático', add: 'Engadir', remove: 'Eliminar',
    importBtn: 'Importar', exportBtn: 'Exportar', resetBtn: 'Restablecer',
    noSites: 'Non hai sitios configurados.', confirmReset: '¿Restablecer toda a configuración?',
    siteAlready: 'Ese sitio xa está na lista.', siteInvalid: 'Dominio non válido.',
    openReader: 'Abrir modo lectura (aquí)', addCurrent: 'Engadir sitio actual á lista',
    addCurrentShort: 'Engadir sitio actual',
    currentSiteHint: 'Sitio actual',
    removeCurrent: 'Quitar sitio actual da lista', ignoreSectionMenu: 'Ignorar esta sección (aquí)',
    openSettings: 'Abrir configuración', openMedias: 'Abrir lista de medios',
    alreadyInList: 'Xa estaba na lista.', addedTo: 'Engadido:', removedFrom: 'Eliminado:',
    notInList: 'O sitio actual non está na lista.', 
    ignoredSections: 'Seccións ignoradas', noIgnoredSections: 'Ningunha',
    sectionIgnored: 'Sección ignorada:', sectionAlreadyIgnored: 'Esa sección xa estaba ignorada.',
    cannotIgnoreSection: 'Non se pode ignorar (URL sen sección clara).',
    siteAddedForIgnore: 'Sitio engadido á lista coa sección ignorada.',
    dictNotFound: 'Dicionario non atopado', dictSearchIn: 'Buscar en:',
    dictNoDefault: 'Non hai dicionario configurado para este idioma.',
    colLang: 'Idioma', 
    searchPlaceholder: 'Buscar medio...', filterAll: 'Todos',
    filterLang: 'Idioma', 
    langAuto: 'Auto', langEs: 'Español', langGl: 'Galego', langCa: 'Català',
    langEn: 'Inglés', langEu: 'Éuscaro', langFr: 'Francés', langDe: 'Alemán',
    langIt: 'Italiano', langPt: 'Portugués',
    openSite: 'Abrir sitio', 
    exportWarningVersion: 'O ficheiro importado é dunha versión distinta. Intentarase importar de todos xeitos.',
    settingsFabTitle: 'Configuración e medios',
    addFabTitle: 'Engadir este medio á lista',
    blocked: 'Bloqueado', unblock: 'Desbloquear',
    extractionTitle: 'Análise de extracción',
    extractionMode: 'Método de extracción',
    extractionModeAuto: 'Automático (recomendado)',
    extractionModeSelector: 'Selector manual',
    extractionModeAll: 'Extraer todo o texto',
    extractionHintAuto: 'Usa Readability e JSON-LD automaticamente. Funciona na maioría de medios.',
    extractionHintSelector: 'Extrae o contido do elemento elixido e os seus descendentes.',
    extractionHintAll: 'Extrae todo o texto útil da páxina, descartando menús, scripts e overlays.',
    extractionRoot: 'Selector raíz',
    extractionRootPh: 'ex. article, .article-body, [role="main"]',
    extractionExclude: 'Excluír dentro (opcional)',
    extractionExcludePh: 'ex. .ad, .banner, aside, .newsletter',
    extractionMinChars: 'Mínimo de caracteres',
    extractionPickBtn: '🎯 Elixir elemento',
    extractionDiagnoseBtn: '🔄 Analizar páxina',
    extractionDiagnostics: 'Diagnóstico da páxina',
    extractionTitleLbl: 'Título',
    extractionMetricsLbl: 'Contido',
    extractionPaywallLbl: 'Paywall',
    extractionOverlaysLbl: 'Overlays',
    extractionCandidatesLbl: 'Candidatos de contedor',
    extractionPreviewLbl: 'Previsualización',
    extractionPreviewEmpty: 'Sen contido para previsualizar.',
    extractionPaywallYes: 'Detectado',
    extractionPaywallNo: 'Non detectado',
    extractionNoCandidates: 'Sen candidatos relevantes',
    extractionPickerHint: 'Pasa o rato e fai clic para elixir o contedor. Esc para cancelar.',
    extractionWordsShort: 'palabras',
    extractionImgsShort: 'imgs',
    extractionTestBtn: '👁 Probar no lector',
    extractionSaveBtn: 'Gardar',
    extractionCancelBtn: 'Cancelar',
    extractionSaved: 'Extracción gardada para {X}',
    extractionTestFailed: 'Non se puido extraer contido con esta configuración.',
    extractionUseThis: 'Usar este',
    extractionSourcePrefix: 'Fonte',
    extractionCharsShort: 'chars',
    shortcuts: 'Atallos', shortcutReader: 'Atallos do lector', shortcutGlobal: 'Atallos globais',
    shortcutNoteTitle: 'Notas sobre os atallos',
    shortcutNoteReader: 'Os atallos do lector só funcionan co lector aberto.',
    shortcutNoteGlobal: 'Os atallos globais funcionan en calquera páxina e deben incluír Ctrl, Alt ou Meta.',
    shortcutNoteCapture: 'Fai clic en ✏️ e preme a nova combinación. Backspace borra a asignación. Esc cancela.',
    shortcutReservedNote: 'Esc pecha o lector e non se pode cambiar.',
    shortcutCapture: 'Preme unha tecla… (Esc cancela, Backspace borra)',
    shortcutReset: 'Restablecer atallos',
    shortcutResetConfirm: '¿Restablecer todos os atallos aos valores por defecto?',
    shortcutConflict: 'Esa combinación xa está asignada a "{X}".',
    shortcutReservedKey: 'Esa combinación está reservada polo navegador.',
    shortcutNeedsModifier: 'Os atallos globais requiren Ctrl, Alt ou Meta.',
    shortcutCleared: 'Atallo eliminado.',
    shortcutSaved: 'Atallo gardado: {X}',
    shortcutEmpty: 'Sen asignar',
    scClose: 'Pechar lector',
    scFontIncrease: 'Aumentar tamaño da fonte',
    scFontDecrease: 'Reducir tamaño da fonte',
    scToggleTheme: 'Cambiar tema (claro/escuro)',
    scScrollTop: 'Ir ao principio',
    scScrollBottom: 'Ir ao final',
    scToggleBionic: 'Activar/desactivar Bionic',
    scToggleFocus: 'Activar/desactivar Foco',
    scToggleJustify: 'Activar/desactivar Xustificar',
    scToggleImages: 'Amosar/agochar portada',
    scToggleWide: 'Alternar ancho (estreito/ancho)',
    scSaveLater: 'Gardar en pendentes',
    scOpenSites: 'Abrir lista de medios',
    scOpenQueue: 'Abrir pendentes',
    scOpenRSVP: 'Abrir teleprompter',
    scCopyText: 'Copiar texto completo',
    scOpenReader: 'Abrir lector (nesta páxina)',
    scOpenMedia: 'Abrir lista de medios (global)',
    scOpenSettings: 'Abrir configuración (global)',
    scToggleTextOnly: 'Alternar só-texto neste sitio (global)',
    scOpenVoceiro: 'Abrir Voceiro (titulares)',
    abrirEn: 'Abrir en…',
    scAbrirEn: 'Menú «Abrir en…» (global)',
    serviciosAyuda: 'Servizos aos que mandar a páxina que estás lendo para abrila noutra web. O enderezo debe comezar por https:// e levar {url} (o da páxina tal cal) ou {url_cod} (codificado). Tamén podes importar unha lista.',
    serviciosVacio: 'Non hai servizos. Engade un ou importa unha lista.',
    serviciosNombre: 'Nome',
    serviciosQuitar: 'Quitar',
    serviciosGestionar: 'Xestionar servizos…',
    serviciosImportar: 'Importar lista',
    serviciosExportar: 'Exportar lista',
    serviciosImportados: 'Servizos engadidos: {n}',
    serviciosFormato: 'O ficheiro non ten unha lista de servizos válida.',
    serviciosInvalido: 'Revisa o nome e o enderezo: debe comezar por https:// e levar {url} ou {url_cod}.',
    serviciosRepetido: 'Ese servizo xa está na lista.',
    serviciosFab: '«Abrir en…» no menú do botón flotante',
    serviciosFabMenu: 'amosar ou agochar no botón flotante',
    serviciosFabOculto: '«Abrir en…» agochado no botón flotante',
    serviciosFabVisible: '«Abrir en…» visible no botón flotante',
  },
  ca: {
    saveToPending: 'Tornar a pendents',
    saveRemove: 'Treure de pendents',
    movedToPending: 'Moguda a pendents',
    movedToRead: 'Moguda a llegides',
    srcFallbackAuto: 'Origen no disponible. Reobrint amb Auto.',
    readerAutoAllLabel: 'Mode lector automàtic a tots els mitjans',
    readerAutoAllHint:  "Obre el lector automàticament en entrar a qualsevol mitjà conegut o pàgina d'article. Respecta els dominis desactivats i les seccions ignorades.",
    readerAutoAllOn:    'Mode lector automàtic global activat',
    readerAutoAllOff:   'Mode lector automàtic global desactivat',
    fabTitle: 'Mode lectura', 
    close: '✕ Tancar', 
    settingsShort: 'Configuració i mitjans', pendientesShort: 'Pendents',
    textOnlyOn: 'Només text activat en aquest mitjà',
    textOnlyOff: 'Imatges activades en aquest mitjà', 
    theme: 'Tema', font: 'Tipus de lletra', size: 'Mida', width: 'Amplada', extra: 'Extra',
    source: 'Origen', srcAuto: 'Auto', srcJsonld: 'JSON', srcReadability: 'Lector', srcCustom: 'CSS', srcMixto: 'Mixt',
    sourceLabel: 'Font', words: 'paraules', imageLabel: 'Imatge',
    justify: 'Justificar', bionic: 'Bionic', focus: 'Focus',
    teleprompter: '⚡ Teleprompter',
    copyText: '📋 Copiar text', print: '🖨 Imprimir', email: '✉ Enviar correu', share: '📤 Compartir',
    ignoreSection: '🚫 Ignorar aquesta secció', saveLater: 'Desar per a més tard',
    savedLater: 'Desat a pendents', 
    markRead: 'Marcar com llegida', markUnread: 'Marcar com no llegida',
    finVolver: '✓ Llegida · tornar a Voceiro', finSiguiente: 'Següent pendent →',
    finSiguienteDe: 'Següent pendent: {X}', finMarcada: 'Marcada com a llegida',
    personalizado: 'Personalitzat', colorFondo: 'Fons', colorTexto: 'Text',
    colorEnlaces: 'Enllaços', colorTitulos: 'Títols', pocoContraste: 'poc contrast',
    fabMenu: 'Més opcions del lector', fabOcultarAqui: 'Amaga el botó en aquest mitjà',
    fabOcultoAqui: 'Botó amagat en aquest mitjà', fabMostrarAqui: 'Mostra el botó en aquest mitjà',
    fabNadaAqui: 'Aquí el botó no té res a oferir', fabAutomatico: 'lector automàtic',
    volverVoceiro: 'Tornar a Voceiro', apariencia: 'Aparença',
    mas: 'Més', masAcciones: 'Més accions',
    letraMenor: 'Lletra més petita', letraMayor: 'Lletra més grossa',
    masEstrecho: 'Més estret', masAncho: 'Més ample',
    imgTodas: 'Amb imatges', imgConPie: 'Només amb peu', imgNinguna: 'Sense imatges', imgMedio: 'Imatges en aquest mitjà', imgComoSiempre: 'Com a tots els mitjans', imgEnEsteMedio: 'en aquest mitjà', imgCambiarA: 'Prem per passar a', verPortada: 'Veure la portada a l\'article', embebidoDe: 'Contingut de {X}', tabla: 'Taula', grafico: 'Gràfic', mapa: 'Mapa', verEn: 'Veure a {X}', galeria: '{N} imatges', galeriaPulsa: 'prem-ne una per veure-les en gran', visorAnterior: 'Imatge anterior', visorSiguiente: 'Imatge següent', sitesHint: 'Mitjans amb ajustos propis: si el lector s\'obre sol, d\'on treu el text, les imatges i les seccions que s\'ignoren. La resta de mitjans fan servir el de sempre.', medioSinReglas: 'Aquest mitjà encara no té ajustos propis', ampliarImagen: 'Amplia la imatge',
    readItems: 'Llegides', 
    keepReadItems: 'Desar historial de llegides',
    clearRead: 'Esborrar llegides',
    clearReadConfirm: 'Esborrar totes les notícies marcades com llegides?',
    up: '↑ Pujar', raeHint: 'Doble clic a un mot = Cercar',
    noArticle: "No s'ha pogut extreure l'article (lloc no suportat o sense contingut).",
    srcNoJsonld: 'No hi ha JSON-LD amb articleBody en aquesta pàgina (origen: JSON).',
    srcNoReadability: "Readability no ha pogut extreure l'article d'aquesta pàgina (origen: Lector).",
    srcNoCustom: "L'extracció per selector no ha trobat contingut. Revisa la configuració del lloc.",
    srcNoAll: "L'extracció total no ha trobat contingut suficient.",
    srcSiteSaved: 'Origen del lloc: {X}. Reobrint…',
    addSiteTitle: 'Afegir lloc a la llista',
    addSiteQuestion: '{X} no és a la llista. Voleu afegir-lo amb origen "{Y}"?',
    btnAddList: 'Afegir a la llista', btnOnlyOnce: 'Només aquesta vegada',
    btnCancel: 'Cancel·lar', btnUndo: 'Desfer',
    siteAddedToast: 'Lloc afegit: {X} ({Y})', siteRemovedToast: 'Lloc eliminat: {X}',
    sessionOnlyToast: 'Origen {Y} només per a aquesta sessió',
    copied: 'Copiat', copyFailed: "No s'ha pogut copiar",
    articleCopied: '✉ Article copiat al porta-retalls.\n\nEnganxa al cos amb Ctrl+V.',
    urlCopied: 'URL copiada al porta-retalls', news: 'Notícia',
    pause: '⏸ Pausa', play: '▶ Reproduir', repeat: '↻ Repetir', exit: '✕ Sortir',
    speed: 'Velocitat', ppm: 'PPM',
    light: 'Clar', sepia: 'Sèpia', dark: 'Fosc', contrast: 'Alt contrast',
    serif: 'Serif', sans: 'Sans', dyslexic: 'Dislèxia',
    settings: 'Configuració', language: 'Idioma', dictionaries: 'Diccionaris',
    dictMode: 'Mode de cerca', dictModeDirect: 'Directe (doble clic obre el diccionari)',
    dictModePopup: 'Popup (doble clic mostra opcions)',
    dictDefaultGl: 'Diccionari gallec predeterminat', dictDefaultEs: 'Diccionari castellà predeterminat',
    dictDefaultCa: 'Diccionari català predeterminat', dictDefaultEu: 'Diccionari basc predeterminat',
    dictDefaultEn: 'Diccionari anglès predeterminat',
    dictDefaultFr: 'Diccionari francès predeterminat', dictDefaultDe: 'Diccionari alemany predeterminat',
    dictDefaultIt: 'Diccionari italià predeterminat', dictDefaultPt: 'Diccionari portuguès predeterminat',
    dictName: 'Nom', dictUrl: 'URL de cerca (usa {palabra})',
    dictUrlHint: "Usa {palabra} on ha d'anar el terme cercat", 
    sites: 'Mitjans', pendientes: 'Pendents', readLater: 'Desats per a més tard',
    noReadLater: 'No hi ha articles pendents.', 
    domainPh: 'domini (ex. elpais.com)',
    modeOff: 'Desactivat', modePrompt: 'Botó', modeAuto: 'Automàtic', add: 'Afegir', remove: 'Eliminar',
    importBtn: 'Importar', exportBtn: 'Exportar', resetBtn: 'Restablir',
    noSites: 'No hi ha llocs configurats.', confirmReset: 'Restablir tota la configuració?',
    siteAlready: 'Aquest lloc ja és a la llista.', siteInvalid: 'Domini no vàlid.',
    openReader: 'Obrir mode lectura (aquí)', addCurrent: 'Afegir lloc actual a la llista',
    addCurrentShort: 'Afegir lloc actual',
    currentSiteHint: 'Lloc actual',
    removeCurrent: 'Treure lloc actual de la llista', ignoreSectionMenu: 'Ignorar aquesta secció (aquí)',
    openSettings: 'Obrir configuració', openMedias: 'Obrir llista de mitjans',
    alreadyInList: 'Ja era a la llista.', addedTo: 'Afegit:', removedFrom: 'Eliminat:',
    notInList: 'El lloc actual no és a la llista.', 
    ignoredSections: 'Seccions ignorades', noIgnoredSections: 'Cap',
    sectionIgnored: 'Secció ignorada:', sectionAlreadyIgnored: 'Aquesta secció ja estava ignorada.',
    cannotIgnoreSection: 'No es pot ignorar (URL sense secció clara).',
    siteAddedForIgnore: 'Lloc afegit a la llista amb la secció ignorada.',
    dictNotFound: 'Diccionari no trobat', dictSearchIn: 'Cercar a:',
    dictNoDefault: 'No hi ha diccionari configurat per a aquest idioma.',
    colLang: 'Idioma', 
    searchPlaceholder: 'Cercar mitjà...', filterAll: 'Tots',
    filterLang: 'Idioma', 
    langAuto: 'Auto', langEs: 'Castellà', langGl: 'Gallec', langCa: 'Català',
    langEn: 'Anglès', langEu: 'Basc', langFr: 'Francès', langDe: 'Alemany',
    langIt: 'Italià', langPt: 'Portuguès',
    openSite: 'Obrir lloc', 
    exportWarningVersion: "El fitxer importat és d'una versió diferent. S'intentarà importar igualment.",
    settingsFabTitle: 'Configuració i mitjans',
    addFabTitle: 'Afegir aquest mitjà a la llista',
    blocked: 'Bloquejat', unblock: 'Desbloquejar',
    extractionTitle: "Anàlisi d'extracció",
    extractionMode: "Mètode d'extracció",
    extractionModeAuto: 'Automàtic (recomanat)',
    extractionModeSelector: 'Selector manual',
    extractionModeAll: 'Extreure tot el text',
    extractionHintAuto: 'Fa servir Readability i JSON-LD automàticament. Funciona a la majoria de mitjans.',
    extractionHintSelector: "Extreu el contingut de l'element triat i els seus descendents.",
    extractionHintAll: 'Extreu tot el text útil de la pàgina, descartant menús, scripts i overlays.',
    extractionRoot: 'Selector arrel',
    extractionRootPh: 'ex. article, .article-body, [role="main"]',
    extractionExclude: 'Excloure dins (opcional)',
    extractionExcludePh: 'ex. .ad, .banner, aside, .newsletter',
    extractionMinChars: 'Mínim de caràcters',
    extractionPickBtn: '🎯 Triar element',
    extractionDiagnoseBtn: '🔄 Analitzar pàgina',
    extractionDiagnostics: 'Diagnòstic de la pàgina',
    extractionTitleLbl: 'Títol',
    extractionMetricsLbl: 'Contingut',
    extractionPaywallLbl: 'Paywall',
    extractionOverlaysLbl: 'Overlays',
    extractionCandidatesLbl: 'Candidats de contenidor',
    extractionPreviewLbl: 'Previsualització',
    extractionPreviewEmpty: 'Sense contingut per previsualitzar.',
    extractionPaywallYes: 'Detectat',
    extractionPaywallNo: 'No detectat',
    extractionNoCandidates: 'Sense candidats rellevants',
    extractionPickerHint: 'Passa el ratolí i fes clic per triar el contenidor. Esc per cancel·lar.',
    extractionWordsShort: 'paraules',
    extractionImgsShort: 'imgs',
    extractionTestBtn: '👁 Provar al lector',
    extractionSaveBtn: 'Desar',
    extractionCancelBtn: 'Cancel·lar',
    extractionSaved: 'Extracció desada per a {X}',
    extractionTestFailed: "No s'ha pogut extreure contingut amb aquesta configuració.",
    extractionUseThis: 'Usar aquest',
    extractionSourcePrefix: 'Font',
    extractionCharsShort: 'chars',
    shortcuts: 'Dreceres', shortcutReader: 'Dreceres del lector', shortcutGlobal: 'Dreceres globals',
    shortcutNoteTitle: 'Notes sobre les dreceres',
    shortcutNoteReader: 'Les dreceres del lector només funcionen amb el lector obert.',
    shortcutNoteGlobal: "Les dreceres globals funcionen a qualsevol pàgina i han d'incloure Ctrl, Alt o Meta.",
    shortcutNoteCapture: "Fes clic a ✏️ i prem la nova combinació. Backspace esborra l'assignació. Esc cancel·la.",
    shortcutReservedNote: 'Esc tanca el lector i no es pot canviar.',
    shortcutCapture: 'Prem una tecla… (Esc cancel·la, Backspace esborra)',
    shortcutReset: 'Restablir dreceres',
    shortcutResetConfirm: 'Restablir totes les dreceres als valors per defecte?',
    shortcutConflict: 'Aquesta combinació ja està assignada a "{X}".',
    shortcutReservedKey: 'Aquesta combinació està reservada pel navegador.',
    shortcutNeedsModifier: 'Les dreceres globals requereixen Ctrl, Alt o Meta.',
    shortcutCleared: 'Drecera eliminada.',
    shortcutSaved: 'Drecera desada: {X}',
    shortcutEmpty: 'Sense assignar',
    scClose: 'Tancar lector',
    scFontIncrease: 'Augmentar mida de la font',
    scFontDecrease: 'Reduir mida de la font',
    scToggleTheme: 'Canviar tema (clar/fosc)',
    scScrollTop: 'Anar al principi',
    scScrollBottom: 'Anar al final',
    scToggleBionic: 'Activar/desactivar Bionic',
    scToggleFocus: 'Activar/desactivar Focus',
    scToggleJustify: 'Activar/desactivar Justificar',
    scToggleImages: 'Mostrar/amagar portada',
    scToggleWide: 'Alternar amplada (estreta/ampla)',
    scSaveLater: 'Desar a pendents',
    scOpenSites: 'Obrir llista de mitjans',
    scOpenQueue: 'Obrir pendents',
    scOpenRSVP: 'Obrir teleprompter',
    scCopyText: 'Copiar text complet',
    scOpenReader: 'Obrir lector (en aquesta pàgina)',
    scOpenMedia: 'Obrir llista de mitjans (global)',
    scOpenSettings: 'Obrir configuració (global)',
    scToggleTextOnly: 'Alternar només-text en aquest lloc (global)',
    scOpenVoceiro: 'Obrir Voceiro (titulars)',
    abrirEn: 'Obre a…',
    scAbrirEn: 'Menú «Obre a…» (global)',
    serviciosAyuda: "Serveis als quals enviar la pàgina que estàs llegint per obrir-la en un altre web. L'adreça ha de començar per https:// i dur {url} (la de la pàgina tal qual) o {url_cod} (codificada). També pots importar una llista.",
    serviciosVacio: 'No hi ha serveis. Afegeix-ne un o importa una llista.',
    serviciosNombre: 'Nom',
    serviciosQuitar: 'Treu',
    serviciosGestionar: 'Gestiona els serveis…',
    serviciosImportar: 'Importa una llista',
    serviciosExportar: 'Exporta la llista',
    serviciosImportados: 'Serveis afegits: {n}',
    serviciosFormato: 'El fitxer no té una llista de serveis vàlida.',
    serviciosInvalido: "Revisa el nom i l'adreça: ha de començar per https:// i dur {url} o {url_cod}.",
    serviciosRepetido: 'Aquest servei ja és a la llista.',
    serviciosFab: '«Obre a…» al menú del botó flotant',
    serviciosFabMenu: 'mostra o amaga al botó flotant',
    serviciosFabOculto: '«Obre a…» amagat al botó flotant',
    serviciosFabVisible: '«Obre a…» visible al botó flotant',
  },
  en: {
    saveToPending: 'Move to queue',
    saveRemove: 'Remove from queue',
    movedToPending: 'Moved to queue',
    movedToRead: 'Moved to read',
    fabTitle: 'Reading mode', 
    close: '✕ Close', 
    settingsShort: 'Settings & sites', pendientesShort: 'Queue',
    textOnlyOn: 'Text only enabled on this site',
    textOnlyOff: 'Images enabled on this site', 
    theme: 'Theme', font: 'Font', size: 'Size', width: 'Width', extra: 'Extra',
    source: 'Source', srcAuto: 'Auto', srcJsonld: 'JSON', srcReadability: 'Reader', srcCustom: 'CSS', srcMixto: 'Mixed',
    sourceLabel: 'Source', words: 'words', imageLabel: 'Image',
    justify: 'Justify', bionic: 'Bionic', focus: 'Focus',
    teleprompter: '⚡ Teleprompter',
    copyText: '📋 Copy text', print: '🖨 Print', email: '✉ Send email', share: '📤 Share',
    ignoreSection: '🚫 Ignore this section', saveLater: 'Save for later',
    savedLater: 'Saved to queue', 
    markRead: 'Mark as read', markUnread: 'Mark as unread',
    finVolver: '✓ Read · back to Voceiro', finSiguiente: 'Next in queue →',
    finSiguienteDe: 'Next in queue: {X}', finMarcada: 'Marked as read',
    personalizado: 'Custom', colorFondo: 'Background', colorTexto: 'Text',
    colorEnlaces: 'Links', colorTitulos: 'Headings', pocoContraste: 'low contrast',
    fabMenu: 'More reader options', fabOcultarAqui: 'Hide the button on this site',
    fabOcultoAqui: 'Button hidden on this site', fabMostrarAqui: 'Show the button on this site',
    fabNadaAqui: 'The button has nothing to offer here', fabAutomatico: 'automatic reader',
    volverVoceiro: 'Back to Voceiro', apariencia: 'Appearance',
    mas: 'More', masAcciones: 'More actions',
    letraMenor: 'Smaller text', letraMayor: 'Larger text',
    masEstrecho: 'Narrower', masAncho: 'Wider',
    imgTodas: 'With images', imgConPie: 'Captioned only', imgNinguna: 'No images', imgMedio: 'Images on this site', imgComoSiempre: 'Same as all sites', imgEnEsteMedio: 'on this site', imgCambiarA: 'Press to switch to', verPortada: 'See the cover in the article', embebidoDe: 'Content from {X}', tabla: 'Table', grafico: 'Chart', mapa: 'Map', verEn: 'View on {X}', galeria: '{N} images', galeriaPulsa: 'press one to see them full size', visorAnterior: 'Previous image', visorSiguiente: 'Next image', sitesHint: 'Sites with their own settings: whether the reader opens by itself, where the text comes from, images and ignored sections. Other sites use the defaults.', medioSinReglas: 'This site has no settings of its own yet', ampliarImagen: 'Enlarge image',
    readItems: 'Read', 
    keepReadItems: 'Keep history of read items',
    clearRead: 'Clear read',
    clearReadConfirm: 'Delete all news marked as read?',
    up: '↑ Top', raeHint: 'Double-click a word = Look up',
    noArticle: 'Could not extract the article (unsupported site or no content).',
    srcNoJsonld: 'No JSON-LD with articleBody on this page (source: JSON).',
    srcNoReadability: 'Readability could not extract the article from this page (source: Reader).',
    srcNoCustom: 'Selector extraction found no content. Check the site settings.',
    srcNoAll: 'Full-text extraction found insufficient content.',
    srcFallbackAuto: 'Source unavailable. Reopening in Auto.',
    readerAutoAllLabel: 'Automatic reader mode on all sites',
    readerAutoAllHint:  'Opens the reader automatically when entering any known media or article page. Respects disabled domains and ignored sections.',
    readerAutoAllOn:    'Global automatic reader mode enabled',
    readerAutoAllOff:   'Global automatic reader mode disabled',
    srcSiteSaved: 'Site source: {X}. Reopening…',
    addSiteTitle: 'Add site to list',
    addSiteQuestion: '{X} is not in the list. Add it with source "{Y}"?',
    btnAddList: 'Add to list', btnOnlyOnce: 'Just this once',
    btnCancel: 'Cancel', btnUndo: 'Undo',
    siteAddedToast: 'Site added: {X} ({Y})', siteRemovedToast: 'Site removed: {X}',
    sessionOnlyToast: 'Source {Y} for this session only',
    copied: 'Copied', copyFailed: 'Could not copy',
    articleCopied: '✉ Article copied to clipboard.\n\nPaste into the body with Ctrl+V.',
    urlCopied: 'URL copied to clipboard', news: 'News',
    pause: '⏸ Pause', play: '▶ Play', repeat: '↻ Repeat', exit: '✕ Exit',
    speed: 'Speed', ppm: 'WPM',
    light: 'Light', sepia: 'Sepia', dark: 'Dark', contrast: 'High contrast',
    serif: 'Serif', sans: 'Sans', dyslexic: 'Dyslexic',
    settings: 'Settings', language: 'Language', dictionaries: 'Dictionaries',
    dictMode: 'Lookup mode', dictModeDirect: 'Direct (double-click opens the dictionary)',
    dictModePopup: 'Popup (double-click shows options)',
    dictDefaultGl: 'Default Galician dictionary', dictDefaultEs: 'Default Spanish dictionary',
    dictDefaultCa: 'Default Catalan dictionary', dictDefaultEu: 'Default Basque dictionary',
    dictDefaultEn: 'Default English dictionary',
    dictDefaultFr: 'Default French dictionary', dictDefaultDe: 'Default German dictionary',
    dictDefaultIt: 'Default Italian dictionary', dictDefaultPt: 'Default Portuguese dictionary',
    dictName: 'Name', dictUrl: 'Search URL (use {palabra})',
    dictUrlHint: 'Use {palabra} where the search term should go', 
    sites: 'Sites', pendientes: 'Queue', readLater: 'Saved for later',
    noReadLater: 'No pending articles.', 
    domainPh: 'domain (e.g. elpais.com)',
    modeOff: 'Disabled', modePrompt: 'Button', modeAuto: 'Auto', add: 'Add', remove: 'Remove',
    importBtn: 'Import', exportBtn: 'Export', resetBtn: 'Reset',
    noSites: 'No sites configured.', confirmReset: 'Reset all settings?',
    siteAlready: 'That site is already in the list.', siteInvalid: 'Invalid domain.',
    openReader: 'Open reading mode (here)', addCurrent: 'Add current site to list',
    addCurrentShort: 'Add current site',
    currentSiteHint: 'Current site',
    removeCurrent: 'Remove current site from list', ignoreSectionMenu: 'Ignore this section (here)',
    openSettings: 'Open settings', openMedias: 'Open sites list',
    alreadyInList: 'Already in the list.', addedTo: 'Added:', removedFrom: 'Removed:',
    notInList: 'Current site is not in the list.', 
    ignoredSections: 'Ignored sections', noIgnoredSections: 'None',
    sectionIgnored: 'Section ignored:', sectionAlreadyIgnored: 'That section was already ignored.',
    cannotIgnoreSection: 'Cannot ignore (URL has no clear section).',
    siteAddedForIgnore: 'Site added to list with ignored section.',
    dictNotFound: 'Dictionary not found', dictSearchIn: 'Search in:',
    dictNoDefault: 'No dictionary configured for this language.',
    colLang: 'Language', 
    searchPlaceholder: 'Search site...', filterAll: 'All',
    filterLang: 'Language', 
    langAuto: 'Auto', langEs: 'Spanish', langGl: 'Galician', langCa: 'Catalan',
    langEn: 'English', langEu: 'Basque', langFr: 'French', langDe: 'German',
    langIt: 'Italian', langPt: 'Portuguese',
    openSite: 'Open site', 
    exportWarningVersion: 'The imported file is from a different version. Import will be attempted anyway.',
    settingsFabTitle: 'Settings & sites',
    addFabTitle: 'Add this site to the list',
    blocked: 'Blocked', unblock: 'Unblock',
    extractionTitle: 'Extraction analysis',
    extractionMode: 'Extraction method',
    extractionModeAuto: 'Automatic (recommended)',
    extractionModeSelector: 'Manual selector',
    extractionModeAll: 'Extract all text',
    extractionHintAuto: 'Uses Readability and JSON-LD automatically. Works on most sites.',
    extractionHintSelector: 'Extracts the chosen element and its descendants.',
    extractionHintAll: 'Extracts all useful text from the page, skipping menus, scripts and overlays.',
    extractionRoot: 'Root selector',
    extractionRootPh: 'e.g. article, .article-body, [role="main"]',
    extractionExclude: 'Exclude inside (optional)',
    extractionExcludePh: 'e.g. .ad, .banner, aside, .newsletter',
    extractionMinChars: 'Minimum characters',
    extractionPickBtn: '🎯 Pick element',
    extractionDiagnoseBtn: '🔄 Analyze page',
    extractionDiagnostics: 'Page diagnostics',
    extractionTitleLbl: 'Title',
    extractionMetricsLbl: 'Content',
    extractionPaywallLbl: 'Paywall',
    extractionOverlaysLbl: 'Overlays',
    extractionCandidatesLbl: 'Container candidates',
    extractionPreviewLbl: 'Preview',
    extractionPreviewEmpty: 'No content to preview.',
    extractionPaywallYes: 'Detected',
    extractionPaywallNo: 'Not detected',
    extractionNoCandidates: 'No relevant candidates',
    extractionPickerHint: 'Hover and click to pick the container. Esc to cancel.',
    extractionWordsShort: 'words',
    extractionImgsShort: 'imgs',
    extractionTestBtn: '👁 Test in reader',
    extractionSaveBtn: 'Save',
    extractionCancelBtn: 'Cancel',
    extractionSaved: 'Extraction saved for {X}',
    extractionTestFailed: 'Could not extract content with this configuration.',
    extractionUseThis: 'Use this',
    extractionSourcePrefix: 'Source',
    extractionCharsShort: 'chars',
    shortcuts: 'Shortcuts', shortcutReader: 'Reader shortcuts', shortcutGlobal: 'Global shortcuts',
    shortcutNoteTitle: 'Shortcut notes',
    shortcutNoteReader: 'Reader shortcuts only work with the reader open.',
    shortcutNoteGlobal: 'Global shortcuts work on any page and must include Ctrl, Alt or Meta.',
    shortcutNoteCapture: 'Click ✏️ and press the new combo. Backspace clears the binding. Esc cancels.',
    shortcutReservedNote: 'Esc closes the reader and cannot be changed.',
    shortcutCapture: 'Press a key… (Esc cancels, Backspace clears)',
    shortcutReset: 'Reset shortcuts',
    shortcutResetConfirm: 'Reset all shortcuts to defaults?',
    shortcutConflict: 'That combo is already assigned to "{X}".',
    shortcutReservedKey: 'That combo is reserved by the browser.',
    shortcutNeedsModifier: 'Global shortcuts require Ctrl, Alt or Meta.',
    shortcutCleared: 'Shortcut cleared.',
    shortcutSaved: 'Shortcut saved: {X}',
    shortcutEmpty: 'Unassigned',
    scClose: 'Close reader',
    scFontIncrease: 'Increase font size',
    scFontDecrease: 'Decrease font size',
    scToggleTheme: 'Toggle theme (light/dark)',
    scScrollTop: 'Go to top',
    scScrollBottom: 'Go to bottom',
    scToggleBionic: 'Toggle Bionic',
    scToggleFocus: 'Toggle Focus',
    scToggleJustify: 'Toggle Justify',
    scToggleImages: 'Show/hide cover',
    scToggleWide: 'Toggle width (narrow/wide)',
    scSaveLater: 'Save for later',
    scOpenSites: 'Open sites list',
    scOpenQueue: 'Open queue',
    scOpenRSVP: 'Open teleprompter',
    scCopyText: 'Copy full text',
    scOpenReader: 'Open reader (this page)',
    scOpenMedia: 'Open sites list (global)',
    scOpenSettings: 'Open settings (global)',
    scToggleTextOnly: 'Toggle text-only on this site (global)',
    scOpenVoceiro: 'Open Voceiro (headlines)',
    abrirEn: 'Open in…',
    scAbrirEn: '“Open in…” menu (global)',
    serviciosAyuda: 'Services to send the page you are reading to, to open it on another site. The address must start with https:// and contain {url} (the page address as is) or {url_cod} (encoded). You can also import a list.',
    serviciosVacio: 'No services yet. Add one or import a list.',
    serviciosNombre: 'Name',
    serviciosQuitar: 'Remove',
    serviciosGestionar: 'Manage services…',
    serviciosImportar: 'Import list',
    serviciosExportar: 'Export list',
    serviciosImportados: 'Services added: {n}',
    serviciosFormato: 'The file does not contain a valid list of services.',
    serviciosInvalido: 'Check the name and address: it must start with https:// and contain {url} or {url_cod}.',
    serviciosRepetido: 'That service is already on the list.',
    serviciosFab: '“Open in…” in the floating button menu',
    serviciosFabMenu: 'show or hide in the floating button',
    serviciosFabOculto: '“Open in…” hidden in the floating button',
    serviciosFabVisible: '“Open in…” shown in the floating button',
  },
  eu: {
    saveToPending: 'Zainera itzuli',
    saveRemove: 'Zainetik kendu',
    movedToPending: 'Zainera mugitua',
    movedToRead: 'Irakurrietara mugitua',
    fabTitle: 'Irakurketa modua', 
    close: '✕ Itxi', 
    settingsShort: 'Ezarpenak eta hedabideak', pendientesShort: 'Zain',
    textOnlyOn: 'Testua soilik gaituta hedabide honetan',
    textOnlyOff: 'Irudiak gaituta hedabide honetan', 
    theme: 'Gaia', font: 'Letra-tipoa', size: 'Tamaina', width: 'Zabalera', extra: 'Extra',
    source: 'Iturria', srcAuto: 'Auto', srcJsonld: 'JSON', srcReadability: 'Irakurgailua', srcCustom: 'CSS', srcMixto: 'Mistoa',
    sourceLabel: 'Iturria', words: 'hitza', imageLabel: 'Irudia',
    justify: 'Justifikatu', bionic: 'Bionikoa', focus: 'Fokua',
    teleprompter: '⚡ Teleprompter',
    copyText: '📋 Testua kopiatu', print: '🖨 Inprimatu', email: '✉ Posta bidali', share: '📤 Partekatu',
    ignoreSection: '🚫 Atal hau ez ikusi', saveLater: 'Geroagorako gorde',
    savedLater: 'Zain gordeta', 
    markRead: 'Irakurrita markatu', markUnread: 'Irakurri gabe markatu',
    finVolver: '✓ Irakurrita · itzuli Voceirora', finSiguiente: 'Zain dagoen hurrengoa →',
    finSiguienteDe: 'Zain dagoen hurrengoa: {X}', finMarcada: 'Irakurrita markatua',
    personalizado: 'Pertsonalizatua', colorFondo: 'Atzealdea', colorTexto: 'Testua',
    colorEnlaces: 'Estekak', colorTitulos: 'Izenburuak', pocoContraste: 'kontraste gutxi',
    fabMenu: 'Irakurgailuaren aukera gehiago', fabOcultarAqui: 'Ezkutatu botoia hedabide honetan',
    fabOcultoAqui: 'Botoia ezkutatuta hedabide honetan', fabMostrarAqui: 'Erakutsi botoia hedabide honetan',
    fabNadaAqui: 'Botoiak ez du ezer eskaintzeko hemen', fabAutomatico: 'irakurgailu automatikoa',
    volverVoceiro: 'Itzuli Voceirora', apariencia: 'Itxura',
    mas: 'Gehiago', masAcciones: 'Ekintza gehiago',
    letraMenor: 'Letra txikiagoa', letraMayor: 'Letra handiagoa',
    masEstrecho: 'Estuagoa', masAncho: 'Zabalagoa',
    imgTodas: 'Irudiekin', imgConPie: 'Oinarekin soilik', imgNinguna: 'Irudirik gabe', imgMedio: 'Irudiak hedabide honetan', imgComoSiempre: 'Hedabide guztietan bezala', imgEnEsteMedio: 'hedabide honetan', imgCambiarA: 'Sakatu hona aldatzeko', verPortada: 'Ikusi azala artikuluan', embebidoDe: '{X} edukia', tabla: 'Taula', grafico: 'Grafikoa', mapa: 'Mapa', verEn: 'Ikusi {X}-n', galeria: '{N} irudi', galeriaPulsa: 'sakatu bat handian ikusteko', visorAnterior: 'Aurreko irudia', visorSiguiente: 'Hurrengo irudia', sitesHint: 'Ezarpen propioak dituzten hedabideak: irakurgailua bere kabuz irekitzen den, testua nondik ateratzen duen, irudiak eta alde batera uzten diren atalak. Gainerakoek ohikoa erabiltzen dute.', medioSinReglas: 'Hedabide honek ez du oraindik ezarpen propiorik', ampliarImagen: 'Irudia handitu',
    readItems: 'Irakurriak', 
    keepReadItems: 'Irakurrien historia gorde',
    clearRead: 'Irakurriak ezabatu',
    clearReadConfirm: 'Irakurrita markatutako albiste guztiak ezabatu?',
    up: '↑ Igo', raeHint: 'Hitz batean klik bikoitza = Bilatu',
    noArticle: 'Ezin izan da artikulua atera (onartzen ez den gunea edo edukirik ez).',
    srcNoJsonld: 'Ez dago articleBody duen JSON-LDrik orri honetan (iturria: JSON).',
    srcNoReadability: 'Readability-k ezin izan du orri honetako artikulua atera (iturria: Irakurgailua).',
    srcNoCustom: 'Hautatzaile bidezko erauzketak ez du edukirik aurkitu. Egiaztatu gunearen ezarpenak.',
    srcNoAll: 'Testu osoaren erauzketak ez du behar adina eduki aurkitu.',
    srcFallbackAuto: 'Iturria ez dago erabilgarri. Autorekin berriro irekitzen.',
    readerAutoAllLabel: 'Irakurketa modu automatikoa hedabide guztietan',
    readerAutoAllHint:  'Irakurgailua automatikoki irekitzen du ezagutzen den hedabide edo artikulu orri batean sartzean. Desgaitutako domeinuak eta ez ikusitako atalak errespetatzen ditu.',
    readerAutoAllOn:    'Irakurketa modu automatiko globala gaituta',
    readerAutoAllOff:   'Irakurketa modu automatiko globala desgaituta',
    srcSiteSaved: 'Gunearen iturria: {X}. Berriz irekitzen…',
    addSiteTitle: 'Gehitu gunea zerrendara',
    addSiteQuestion: '{X} ez dago zerrendan. "{Y}" iturriarekin gehitu?',
    btnAddList: 'Zerrendara gehitu', btnOnlyOnce: 'Behin bakarrik',
    btnCancel: 'Utzi', btnUndo: 'Desegin',
    siteAddedToast: 'Gunea gehituta: {X} ({Y})', siteRemovedToast: 'Gunea ezabatuta: {X}',
    sessionOnlyToast: '{Y} iturria saio honetan bakarrik',
    copied: 'Kopiatuta', copyFailed: 'Ezin izan da kopiatu',
    articleCopied: '✉ Artikulua arbelean kopiatuta.\n\nItsatsi gorputzean Ctrl+V-rekin.',
    urlCopied: 'URLa arbelean kopiatuta', news: 'Albistea',
    pause: '⏸ Pausa', play: '▶ Erreproduzitu', repeat: '↻ Errepikatu', exit: '✕ Irten',
    speed: 'Abiadura', ppm: 'PPM',
    light: 'Argia', sepia: 'Sepia', dark: 'Iluna', contrast: 'Kontraste handia',
    serif: 'Serif', sans: 'Sans', dyslexic: 'Dislexia',
    settings: 'Ezarpenak', language: 'Hizkuntza', dictionaries: 'Hiztegiak',
    dictMode: 'Bilaketa modua', dictModeDirect: 'Zuzena (klik bikoitzak hiztegia irekitzen du)',
    dictModePopup: 'Popup (klik bikoitzak aukerak erakusten ditu)',
    dictDefaultGl: 'Galizierazko hiztegi lehenetsia', dictDefaultEs: 'Gaztelaniazko hiztegi lehenetsia',
    dictDefaultCa: 'Katalanezko hiztegi lehenetsia', dictDefaultEu: 'Euskarazko hiztegi lehenetsia',
    dictDefaultEn: 'Ingelesezko hiztegi lehenetsia',
    dictDefaultFr: 'Frantsesezko hiztegi lehenetsia', dictDefaultDe: 'Alemanezko hiztegi lehenetsia',
    dictDefaultIt: 'Italierazko hiztegi lehenetsia', dictDefaultPt: 'Portugesezko hiztegi lehenetsia',
    dictName: 'Izena', dictUrl: 'Bilaketa URLa ({palabra} erabili)',
    dictUrlHint: 'Erabili {palabra} bilatutako terminoa joan behar den tokian', 
    sites: 'Hedabideak', pendientes: 'Zain', readLater: 'Geroagorako gordeta',
    noReadLater: 'Ez dago artikulu zainenik.', 
    domainPh: 'domeinua (adib. elpais.com)',
    modeOff: 'Desgaituta', modePrompt: 'Botoia', modeAuto: 'Automatikoa', add: 'Gehitu', remove: 'Ezabatu',
    importBtn: 'Inportatu', exportBtn: 'Esportatu', resetBtn: 'Berrezarri',
    noSites: 'Ez dago gunerik konfiguratuta.', confirmReset: 'Konfigurazio osoa berrezarri?',
    siteAlready: 'Gune hori jada zerrendan dago.', siteInvalid: 'Domeinu baliogabea.',
    openReader: 'Irakurketa modua ireki (hemen)', addCurrent: 'Oraingo gunea zerrendara gehitu',
    addCurrentShort: 'Oraingo gunea gehitu',
    currentSiteHint: 'Oraingo gunea',
    removeCurrent: 'Oraingo gunea zerrendatik kendu', ignoreSectionMenu: 'Atal hau ez ikusi (hemen)',
    openSettings: 'Ezarpenak ireki', openMedias: 'Hedabide zerrenda ireki',
    alreadyInList: 'Jada zerrendan zegoen.', addedTo: 'Gehituta:', removedFrom: 'Ezabatuta:',
    notInList: 'Oraingo gunea ez dago zerrendan.', 
    ignoredSections: 'Ez ikusitako atalak', noIgnoredSections: 'Bat ere ez',
    sectionIgnored: 'Atala ez ikusia:', sectionAlreadyIgnored: 'Atal hori jada ez ikusia zegoen.',
    cannotIgnoreSection: 'Ezin da ez ikusi (URLak ez du atal argirik).',
    siteAddedForIgnore: 'Gunea zerrendara gehituta atal ez ikusiarekin.',
    dictNotFound: 'Hiztegia ez da aurkitu', dictSearchIn: 'Bilatu hemen:',
    dictNoDefault: 'Ez dago hiztegirik konfiguratuta hizkuntza honetarako.',
    colLang: 'Hizkuntza', 
    searchPlaceholder: 'Bilatu hedabidea...', filterAll: 'Guztiak',
    filterLang: 'Hizkuntza', 
    langAuto: 'Auto', langEs: 'Gaztelania', langGl: 'Galiziera', langCa: 'Katalana',
    langEn: 'Ingelesa', langEu: 'Euskara', langFr: 'Frantsesa', langDe: 'Alemana',
    langIt: 'Italiera', langPt: 'Portugesa',
    openSite: 'Gunea ireki', 
    exportWarningVersion: 'Inportatutako fitxategia beste bertsio batekoa da. Dena den inportatzen saiatuko da.',
    settingsFabTitle: 'Ezarpenak eta hedabideak',
    addFabTitle: 'Gehitu hedabide hau zerrendara',
    blocked: 'Blokeatuta', unblock: 'Desblokeatu',
    extractionTitle: 'Erauzketa analisia',
    extractionMode: 'Erauzketa metodoa',
    extractionModeAuto: 'Automatikoa (gomendatua)',
    extractionModeSelector: 'Hautatzaile eskuzkoa',
    extractionModeAll: 'Testu osoa atera',
    extractionHintAuto: 'Readability eta JSON-LD automatikoki erabiltzen ditu. Hedabide gehienetan funtzionatzen du.',
    extractionHintSelector: 'Aukeratutako elementuaren edukia eta bere ondorengoak ateratzen ditu.',
    extractionHintAll: 'Orriko testu erabilgarri osoa ateratzen du, menuak, scriptak eta overlayak baztertuz.',
    extractionRoot: 'Erro hautatzailea',
    extractionRootPh: 'adib. article, .article-body, [role="main"]',
    extractionExclude: 'Barruan baztertu (aukerakoa)',
    extractionExcludePh: 'adib. .ad, .banner, aside, .newsletter',
    extractionMinChars: 'Gutxieneko karaktereak',
    extractionPickBtn: '🎯 Elementua aukeratu',
    extractionDiagnoseBtn: '🔄 Orria aztertu',
    extractionDiagnostics: 'Orriaren diagnostikoa',
    extractionTitleLbl: 'Izenburua',
    extractionMetricsLbl: 'Edukia',
    extractionPaywallLbl: 'Paywall',
    extractionOverlaysLbl: 'Overlayak',
    extractionCandidatesLbl: 'Edukiontzi hautagaiak',
    extractionPreviewLbl: 'Aurrebista',
    extractionPreviewEmpty: 'Ez dago edukirik aurrebistarako.',
    extractionPaywallYes: 'Detektatuta',
    extractionPaywallNo: 'Ez detektatuta',
    extractionNoCandidates: 'Hautagai garrantzitsurik ez',
    extractionPickerHint: 'Pasatu sagua eta egin klik edukiontzia aukeratzeko. Esc utzi.',
    extractionWordsShort: 'hitza',
    extractionImgsShort: 'irudi',
    extractionTestBtn: '👁 Irakurgailuan probatu',
    extractionSaveBtn: 'Gorde',
    extractionCancelBtn: 'Utzi',
    extractionSaved: 'Erauzketa gordeta {X}-(r)entzat',
    extractionTestFailed: 'Ezin izan da edukirik atera konfigurazio honekin.',
    extractionUseThis: 'Hau erabili',
    extractionSourcePrefix: 'Iturria',
    extractionCharsShort: 'kar',
    shortcuts: 'Laster-teklak', shortcutReader: 'Irakurgailuaren laster-teklak', shortcutGlobal: 'Laster-tekla orokorrak',
    shortcutNoteTitle: 'Laster-teklei buruzko oharrak',
    shortcutNoteReader: 'Irakurgailuaren laster-teklak irakurgailua irekita dagoenean bakarrik funtzionatzen dute.',
    shortcutNoteGlobal: 'Laster-tekla orokorrak edozein orritan funtzionatzen dute eta Ctrl, Alt edo Meta eduki behar dute.',
    shortcutNoteCapture: 'Egin klik ✏️-n eta sakatu konbinazio berria. Backspace-k ezabatzen du. Esc-ek uzten du.',
    shortcutReservedNote: 'Esc-ek irakurgailua ixten du eta ezin da aldatu.',
    shortcutCapture: 'Sakatu tekla bat… (Esc utzi, Backspace ezabatu)',
    shortcutReset: 'Laster-teklak berrezarri',
    shortcutResetConfirm: 'Laster-tekla guztiak balio lehenetsietara berrezarri?',
    shortcutConflict: 'Konbinazio hori "{X}"-(r)i esleituta dago jada.',
    shortcutReservedKey: 'Konbinazio hori nabigatzaileak gordeta du.',
    shortcutNeedsModifier: 'Laster-tekla orokorrek Ctrl, Alt edo Meta behar dute.',
    shortcutCleared: 'Laster-tekla ezabatuta.',
    shortcutSaved: 'Laster-tekla gordeta: {X}',
    shortcutEmpty: 'Esleitu gabe',
    scClose: 'Irakurgailua itxi',
    scFontIncrease: 'Letra-tamaina handitu',
    scFontDecrease: 'Letra-tamaina txikitu',
    scToggleTheme: 'Gaia aldatu (argia/iluna)',
    scScrollTop: 'Hasierara joan',
    scScrollBottom: 'Amaierara joan',
    scToggleBionic: 'Bionikoa aktibatu/desaktibatu',
    scToggleFocus: 'Fokua aktibatu/desaktibatu',
    scToggleJustify: 'Justifikatzea aktibatu/desaktibatu',
    scToggleImages: 'Azala erakutsi/ezkutatu',
    scToggleWide: 'Zabalera txandakatu (estua/zabala)',
    scSaveLater: 'Zain gorde',
    scOpenSites: 'Hedabide zerrenda ireki',
    scOpenQueue: 'Zain ireki',
    scOpenRSVP: 'Teleprompter ireki',
    scCopyText: 'Testu osoa kopiatu',
    scOpenReader: 'Irakurgailua ireki (orri honetan)',
    scOpenMedia: 'Hedabide zerrenda ireki (orokorra)',
    scOpenSettings: 'Ezarpenak ireki (orokorra)',
    scToggleTextOnly: 'Testua soilik aldatu gune honetan (orokorra)',
    scOpenVoceiro: 'Ireki Voceiro (izenburuak)',
    abrirEn: 'Ireki honekin…',
    scAbrirEn: '«Ireki honekin…» menua (orokorra)',
    serviciosAyuda: 'Irakurtzen ari zaren orria beste webgune batean irekitzeko zerbitzuak. Helbidea https://-rekin hasi behar da eta {url} (orriarena, dagoen bezala) edo {url_cod} (kodetuta) eraman behar du. Zerrenda bat ere inporta dezakezu.',
    serviciosVacio: 'Ez dago zerbitzurik. Gehitu bat edo inportatu zerrenda bat.',
    serviciosNombre: 'Izena',
    serviciosQuitar: 'Kendu',
    serviciosGestionar: 'Kudeatu zerbitzuak…',
    serviciosImportar: 'Inportatu zerrenda',
    serviciosExportar: 'Esportatu zerrenda',
    serviciosImportados: 'Gehitutako zerbitzuak: {n}',
    serviciosFormato: 'Fitxategiak ez du zerbitzu-zerrenda baliodunik.',
    serviciosInvalido: 'Berrikusi izena eta helbidea: https://-rekin hasi behar da eta {url} edo {url_cod} eraman behar du.',
    serviciosRepetido: 'Zerbitzu hori zerrendan dago jada.',
    serviciosFab: '«Ireki honekin…» botoi mugikorraren menuan',
    serviciosFabMenu: 'erakutsi edo ezkutatu botoi mugikorrean',
    serviciosFabOculto: '«Ireki honekin…» ezkutatuta botoi mugikorrean',
    serviciosFabVisible: '«Ireki honekin…» ikusgai botoi mugikorrean',
  }
};

/* ============================================================
   5. CONFIGURACIÓN
   ============================================================ */
const CFG_KEY = 'lector-universal-cfg-v8';
const SCROLL_KEY = 'lector-universal-scroll';
const LEGACY_KEYS = ['lector-universal-cfg-v7','lector-universal-cfg-v6','lector-universal-cfg-v5','lector-universal-cfg-v4'];

const DEFAULT_DICTS_ES = [
  { id: 'rae', name: 'RAE', url: 'https://dle.rae.es/{palabra}', builtin: true }
];
const DEFAULT_DICTS_GL = [
  { id: 'rag', name: 'RAG', url: 'https://academia.gal/dicionario/-/termo/{palabra}', builtin: true },
  { id: 'estraviz', name: 'Estraviz', url: 'https://www.estraviz.org/pesquisa.php?palavra={palabra}', builtin: true },
  { id: 'ddd', name: 'DdD', url: 'http://sli.uvigo.es/DdD/ddd_pescuda.php?pescuda={palabra}&tipo_busca=lema', builtin: true },
  { id: 'rinoceronte', name: 'Rinoceronte', url: 'https://rinoceronte.gal/dicionario/?busca={palabra}', builtin: true },
  { id: 'digalego', name: 'Digalego', url: 'https://digalego.xunta.gal/gl/termo/{palabra}', builtin: true }
];
const DEFAULT_DICTS_CA = [
  { id: 'diec', name: 'DIEC', url: 'https://dlc.iec.cat/?EntradaText={palabra}&operEntrada=0', builtin: true },
  { id: 'diccionari', name: 'Diccionari.cat', url: 'https://www.diccionari.cat/cerca?mot={palabra}', builtin: true },
  { id: 'viccionari', name: 'Viccionari', url: 'https://ca.wiktionary.org/wiki/{palabra}', builtin: true }
];
const DEFAULT_DICTS_EU = [
  { id: 'elhuyar', name: 'Elhuyar', url: 'https://hiztegiak.elhuyar.eus/eu/{palabra}', builtin: true },
  { id: 'euskaltzaindia', name: 'Euskaltzaindia', url: 'https://www.euskaltzaindia.eus/index.php?option=com_hiztegian&task=bilaketa&Itemid=419&orria=1&hizk=eu&mota=1&bilatu={palabra}', builtin: true },
  { id: 'eu_wiktionary', name: 'Wiktionary', url: 'https://eu.wiktionary.org/wiki/{palabra}', builtin: true }
];
const DEFAULT_DICTS_EN = [
  { id: 'cambridge', name: 'Cambridge', url: 'https://dictionary.cambridge.org/dictionary/english/{palabra}', builtin: true },
  { id: 'merriam', name: 'Merriam-Webster', url: 'https://www.merriam-webster.com/dictionary/{palabra}', builtin: true },
  { id: 'collins', name: 'Collins', url: 'https://www.collinsdictionary.com/dictionary/english/{palabra}', builtin: true },
  { id: 'en_wiktionary', name: 'Wiktionary', url: 'https://en.wiktionary.org/wiki/{palabra}', builtin: true }
];
const DEFAULT_DICTS_FR = [
  { id: 'larousse_fr', name: 'Larousse', url: 'https://www.larousse.fr/dictionnaires/francais/{palabra}', builtin: true },
  { id: 'cnrtl', name: 'CNRTL', url: 'https://www.cnrtl.fr/definition/{palabra}', builtin: true },
  { id: 'fr_wiktionary', name: 'Wiktionary', url: 'https://fr.wiktionary.org/wiki/{palabra}', builtin: true }
];
const DEFAULT_DICTS_DE = [
  { id: 'duden', name: 'Duden', url: 'https://www.duden.de/suchen/dudenonline/{palabra}', builtin: true },
  { id: 'dwds', name: 'DWDS', url: 'https://www.dwds.de/wb/{palabra}', builtin: true },
  { id: 'de_wiktionary', name: 'Wiktionary', url: 'https://de.wiktionary.org/wiki/{palabra}', builtin: true }
];
const DEFAULT_DICTS_IT = [
  { id: 'treccani', name: 'Treccani', url: 'https://www.treccani.it/vocabolario/{palabra}/', builtin: true },
  { id: 'garzanti', name: 'Garzanti', url: 'https://www.garzantilinguistica.it/ricerca/?q={palabra}', builtin: true },
  { id: 'it_wiktionary', name: 'Wiktionary', url: 'https://it.wiktionary.org/wiki/{palabra}', builtin: true }
];
const DEFAULT_DICTS_PT = [
  { id: 'priberam', name: 'Priberam', url: 'https://dicionario.priberam.org/{palabra}', builtin: true },
  { id: 'infopedia', name: 'Infopédia', url: 'https://www.infopedia.pt/dicionarios/lingua-portuguesa/{palabra}', builtin: true },
  { id: 'pt_wiktionary', name: 'Wiktionary', url: 'https://pt.wiktionary.org/wiki/{palabra}', builtin: true }
];
const DEFAULT_DICT_MAP = {
  es: DEFAULT_DICTS_ES, gl: DEFAULT_DICTS_GL, ca: DEFAULT_DICTS_CA,
  eu: DEFAULT_DICTS_EU, en: DEFAULT_DICTS_EN,
  fr: DEFAULT_DICTS_FR, de: DEFAULT_DICTS_DE, it: DEFAULT_DICTS_IT, pt: DEFAULT_DICTS_PT
};

const DEFAULT_EXTRACTION = { mode: 'auto', root: '', exclude: '', minChars: 100 };

const DEFAULT_CFG = {
  lang: 'es',
  sites: [],
  disabledDomains: [],
  readLater: [],
  perfilActualizado: 0,
  configActualizado: 0,
  readerAutoAll: false,
  readerSettings: {
    keepReadItems: true
  },
  // Botón flotante: lado ('izq'/'der'), altura y medios donde se ha ocultado.
  fab: { lado: null, top: null, ocultoEn: [] },
  servicios: [],
  serviciosFab: { oculto: false },
  prefs: {
    fs: 18, theme: 'light', width: 720, font: 'georgia', lh: 1.7,
    just: false, bionic: false, focus: false, imagenes: 'todas',
    panelText: true, panelActions: false
  },
  dict: {
    mode: 'direct',
    defaultEs: 'rae', defaultGl: 'rag', defaultCa: 'diec',
    defaultEu: 'elhuyar', defaultEn: 'cambridge',
    defaultFr: 'larousse_fr', defaultDe: 'duden',
    defaultIt: 'treccani', defaultPt: 'priberam',
    customEs: [], customGl: [], customCa: [], customEu: [], customEn: [],
    customFr: [], customDe: [], customIt: [], customPt: []
  },
  shortcuts: {
    reader: {
      close:         ['escape'],
      fontIncrease:  ['+', '='],
      fontDecrease:  ['-', '_'],
      toggleTheme:   ['d'],
      scrollTop:     ['t'],
      scrollBottom:  ['shift+g'],
      toggleBionic:  ['b'],
      toggleFocus:   ['f'],
      toggleJustify: ['j'],
      toggleImages:  ['i'],
      toggleWide:    ['w'],
      saveLater:     ['s'],
      openSites:     ['l'],
      openQueue:     ['p'],
      openRSVP:      ['r'],
      copyText:      []
    },
    global: {
      openReader:     ['alt+l'],
      openQueue:      ['alt+p'],
      openMedia:      ['alt+m'],
      openSettings:   ['alt+s'],
      abrirEn:        [],
      toggleTextOnly: ['alt+i'],
      openVoceiro:    ['alt+v']
      }
    },
    voceiro: { presets: [] }
};

function deepClone(o){ return JSON.parse(JSON.stringify(o)); }

function normalizeExtraction(ex, oldSel){
  if (!ex || typeof ex !== 'object') ex = {};
  const out = {
    mode: EXTRACTION_MODES.includes(ex.mode) ? ex.mode : 'auto',
    root: typeof ex.root === 'string' ? ex.root : '',
    exclude: typeof ex.exclude === 'string' ? ex.exclude : '',
    minChars: typeof ex.minChars === 'number' ? ex.minChars : UI.extractMinChars
  };
  if (oldSel && typeof oldSel === 'string' && oldSel.trim()){
    out.mode = 'selector';
    out.root = oldSel.trim();
  }
  return out;
}

function migrateCfg(cfg){
  if (!Array.isArray(cfg.sites)) cfg.sites = [];

  if (!Array.isArray(cfg.disabledDomains)) cfg.disabledDomains = [];
  cfg.disabledDomains = cfg.disabledDomains.map(d => String(d||'').toLowerCase()
    .replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0]).filter(Boolean);
  cfg.disabledDomains = Array.from(new Set(cfg.disabledDomains));

  // Los medios propios (customCatalog) pasan a ser reglas: con eso ya sale
  // el botón. Tipos y etiquetas se van: no cambiaban nada.
  if (Array.isArray(cfg.customCatalog)){
    cfg.customCatalog.forEach(it => {
      const d = it && String(it.d || '').toLowerCase();
      if (!d || cfg.sites.some(s => s.domain === d) || (cfg.disabledDomains || []).includes(d)) return;
      cfg.sites.push({ domain: d, mode: 'prompt', lang: it.lang || 'auto' });
    });
  }
  delete cfg.customCatalog;
  delete cfg.siteTypes;
  delete cfg.siteTags;

  cfg.sites.forEach(s => {
    if (!Array.isArray(s.ignorePatterns)) s.ignorePatterns = [];
    if (!s.mode) s.mode = 'prompt';
    if (!s.domain) s.domain = '';
    if (!s.lang || !SITE_LANGS.includes(s.lang)) s.lang = 'auto';
    delete s.type;
    delete s.tags;
    // «Sin imágenes en este medio» (textOnly) pasa a imagenes: 'ninguna'.
    if (s.textOnly === true && !s.imagenes) s.imagenes = 'ninguna';
    delete s.textOnly;
    if (s.imagenes !== undefined && !IMAGENES.includes(s.imagenes)) delete s.imagenes;
    const oldSel = typeof s.customSelector === 'string' ? s.customSelector : '';
    s.extraction = normalizeExtraction(s.extraction, oldSel);
    delete s.customSelector;
    if (!s.readerSource || !READER_SOURCES.includes(s.readerSource)) s.readerSource = 'auto';

  });
  cfg.sites = cfg.sites.filter(s => s.domain);

  cfg.sites.sort((a, b) => a.domain.localeCompare(b.domain));

  cfg.readLater = fusionarPendientes(Array.isArray(cfg.readLater) ? cfg.readLater : [], []);
  if (typeof cfg.perfilActualizado !== 'number') cfg.perfilActualizado = 0;
  if (typeof cfg.configActualizado !== 'number') cfg.configActualizado = 0;

  if (!cfg.readerSettings || typeof cfg.readerSettings !== 'object'){
    cfg.readerSettings = { keepReadItems: true };
  }
  if (typeof cfg.readerSettings.keepReadItems !== 'boolean'){
    cfg.readerSettings.keepReadItems = true;
  }

  if (typeof cfg.readerAutoAll !== 'boolean') cfg.readerAutoAll = false;
  if (cfg.prefs.panelText === undefined) cfg.prefs.panelText = true;
  if (cfg.prefs.panelActions === undefined) cfg.prefs.panelActions = false;
  if ('readerSource' in cfg.prefs) delete cfg.prefs.readerSource;
  // «Portada» (img) pasa a imagenes; quien la ocultaba, ve solo las que tienen pie.
  if (!IMAGENES.includes(cfg.prefs.imagenes)) cfg.prefs.imagenes = cfg.prefs.img === false ? 'conPie' : 'todas';
  delete cfg.prefs.img;

  cfg.servicios = normalizarServicios(cfg.servicios);
  if (!cfg.serviciosFab || typeof cfg.serviciosFab !== 'object') cfg.serviciosFab = { oculto: false };
  if (typeof cfg.serviciosFab.oculto !== 'boolean') cfg.serviciosFab.oculto = false;

  if (!cfg.dict || typeof cfg.dict !== 'object') cfg.dict = deepClone(DEFAULT_CFG.dict);
  if (!cfg.dict.mode) cfg.dict.mode = 'direct';
  if (!cfg.dict.defaultEs) cfg.dict.defaultEs = 'rae';
  if (!cfg.dict.defaultGl) cfg.dict.defaultGl = 'rag';
  if (!cfg.dict.defaultCa) cfg.dict.defaultCa = 'diec';
  if (!cfg.dict.defaultEu) cfg.dict.defaultEu = 'elhuyar';
  if (!cfg.dict.defaultEn) cfg.dict.defaultEn = 'cambridge';
  if (!cfg.dict.defaultFr) cfg.dict.defaultFr = 'larousse_fr';
  if (!cfg.dict.defaultDe) cfg.dict.defaultDe = 'duden';
  if (!cfg.dict.defaultIt) cfg.dict.defaultIt = 'treccani';
  if (!cfg.dict.defaultPt) cfg.dict.defaultPt = 'priberam';
  ['customEs','customGl','customCa','customEu','customEn',
   'customFr','customDe','customIt','customPt'].forEach(k => {
    if (!Array.isArray(cfg.dict[k])) cfg.dict[k] = [];
  });

  if (!UI_LANGS.includes(cfg.lang)) cfg.lang = 'es';

  if (!cfg.shortcuts || typeof cfg.shortcuts !== 'object') cfg.shortcuts = deepClone(DEFAULT_CFG.shortcuts);
  else {
    for (const scope of ['reader', 'global']){
      if (!cfg.shortcuts[scope] || typeof cfg.shortcuts[scope] !== 'object')
        cfg.shortcuts[scope] = {};
      for (const action of Object.keys(DEFAULT_CFG.shortcuts[scope])){
        if (!(action in cfg.shortcuts[scope])){
          cfg.shortcuts[scope][action] = deepClone(DEFAULT_CFG.shortcuts[scope][action]);
        } else if (!Array.isArray(cfg.shortcuts[scope][action])){
          cfg.shortcuts[scope][action] = [];
        } else {
          cfg.shortcuts[scope][action] = cfg.shortcuts[scope][action].map(k => String(k));
        }
      }
    }
  }
  if (!cfg.voceiro || typeof cfg.voceiro !== 'object') cfg.voceiro = { presets: [] };
  if (!Array.isArray(cfg.voceiro.presets)) cfg.voceiro.presets = [];

  return cfg;
}


function mergeCfg(base, over){
  const out = deepClone(base);
  if (!over || typeof over !== 'object') return out;
  for (const k of Object.keys(over)){
    if (k === 'prefs' || k === 'fab' || k === 'dict' || k === 'serviciosFab' || k === 'shortcuts' || k === 'readerSettings')
      out[k] = Object.assign({}, out[k], over[k] || {});
    else out[k] = over[k];
  }
  return migrateCfg(out);
}

function loadCfg(){
  try {
    let stored = PLATAFORMA.leer(CFG_KEY, null);
    if (!stored){
      for (const lk of LEGACY_KEYS){
        const legacy = PLATAFORMA.leer(lk, null);
        if (legacy){ stored = legacy; break; }
      }
    }
    if (!stored) return migrateCfg(deepClone(DEFAULT_CFG));
    return mergeCfg(DEFAULT_CFG, stored);
  } catch(e){ return migrateCfg(deepClone(DEFAULT_CFG)); }
}

// Perfil de lectura común con Voceiro: idioma, tema, fuente, tamaño,
// justificado, biónica y foco. Cuando cambia, se sella perfilActualizado:
// decide qué perfil gana al juntarse con el de Voceiro.
let __perfilFirma = null;
function firmaPerfilLector(cfg){
  const p = cfg.prefs || {};
  return JSON.stringify([cfg.lang, p.theme, p.font, p.fs, !!p.just, !!p.bionic, !!p.focus, limpiarColores(p.colores)]);
}
function perfilDelLector(){
  const p = CFG.prefs || {};
  return limpiarPerfil({
    lang: CFG.lang, tema: p.theme, fuente: p.font === 'georgia' ? 'serif' : p.font,
    fs: p.fs, just: !!p.just, bionic: !!p.bionic, focus: !!p.focus,
    colores: p.colores || undefined,
    actualizado: CFG.perfilActualizado || 0
  });
}
function aplicarPerfilAlLector(perfil){
  const p = CFG.prefs;
  if (UI_LANGS.includes(perfil.lang)) CFG.lang = perfil.lang;
  if (['light', 'sepia', 'dark', 'contrast', 'custom'].includes(perfil.tema)) p.theme = perfil.tema;
  if (limpiarColores(perfil.colores)) p.colores = limpiarColores(perfil.colores);
  if (perfil.fuente) p.font = perfil.fuente === 'serif' ? 'georgia' : perfil.fuente;
  if (typeof perfil.fs === 'number') p.fs = Math.min(UI.fsMax, Math.max(UI.fsMin, perfil.fs));
  ['just', 'bionic', 'focus'].forEach(k => { if (perfil[k] !== undefined) p[k] = !!perfil[k]; });
  CFG.perfilActualizado = perfil.actualizado;
  __perfilFirma = firmaPerfilLector(CFG);   // ya sellado: no es un cambio de aquí
}

// Configuración propia del lector que viaja a otros dispositivos (por
// Voceiro y su sincronización): reglas por sitio, catálogo propio,
// diccionarios, servicios de «Abrir en…», atajos… Todo menos Pendientes, el
// perfil común (va aparte), los sellos, la posición de los botones, qué
// paneles del lector están abiertos (abrir uno no es un cambio que viaje) y
// los avisos de leídas para el Voceiro de este navegador.
const CFG_NO_VIAJA = ['readLater', 'voceiro', 'lang', 'perfilActualizado', 'configActualizado', 'fab',
                     'leidasParaVoceiro'];
const PREFS_DEL_PERFIL = ['theme', 'font', 'fs', 'just', 'bionic', 'focus', 'colores'];
const PREFS_LOCALES = ['panelText', 'panelActions'];
let __configFirma = null;

function configCompartida(cfg){
  const out = {};
  for (const k of Object.keys(cfg)){
    if (!CFG_NO_VIAJA.includes(k)) out[k] = cfg[k];
  }
  if (out.prefs){
    const p = { ...out.prefs };
    [...PREFS_DEL_PERFIL, ...PREFS_LOCALES].forEach(k => delete p[k]);
    out.prefs = p;
  }
  return JSON.parse(JSON.stringify(out));
}
function firmaConfig(cfg){
  return huellaCanonica(configCompartida(cfg));
}
function bloqueConfigLector(){
  return { datos: configCompartida(CFG), actualizado: CFG.configActualizado || 0 };
}
// Adopta la configuración que llega de otro dispositivo (ya sellada).
function aplicarBloqueConfig(bloque){
  const d = (bloque && bloque.datos) || {};
  for (const k of Object.keys(d)){
    if (CFG_NO_VIAJA.includes(k)) continue;
    if (k === 'prefs'){
      const p = { ...(CFG.prefs || {}) };
      for (const [pk, pv] of Object.entries(d.prefs || {})){
        if (!PREFS_DEL_PERFIL.includes(pk) && !PREFS_LOCALES.includes(pk)) p[pk] = pv;
      }
      CFG.prefs = p;
    } else {
      CFG[k] = d[k];
    }
  }
  CFG = migrateCfg(CFG);
  CFG.configActualizado = bloque.actualizado;
  __configFirma = firmaConfig(CFG);    // ya sellado: no es un cambio de aquí
  __perfilFirma = firmaPerfilLector(CFG);
}

function saveCfg(cfg){
  let cambio = false;
  const firma = firmaPerfilLector(cfg);
  if (__perfilFirma !== null && firma !== __perfilFirma){ cfg.perfilActualizado = Date.now(); cambio = true; }
  __perfilFirma = firma;
  const firmaC = firmaConfig(cfg);
  if (__configFirma !== null && firmaC !== __configFirma){ cfg.configActualizado = Date.now(); cambio = true; }
  __configFirma = firmaC;
  PLATAFORMA.guardar(CFG_KEY, cfg);
  // En la página de Voceiro (sus Ajustes › Lector), un cambio de aquí no
  // llega por alCambiar, que solo oye otras pestañas: se manda directamente.
  if (cambio && esVoceiro()) setTimeout(() => enviarEstado(false), 0);
}
let CFG = loadCfg();
__perfilFirma = firmaPerfilLector(CFG);
__configFirma = firmaConfig(CFG);
let __sessionSourceOverride = null;

function t(k){ const L = I18N[CFG.lang] || I18N.es; return L[k] || I18N.es[k] || k; }

/* ============================================================
   6. DICCIONARIOS
   ============================================================ */
function getDictsForLang(lang){
  const base = DEFAULT_DICT_MAP[lang] || DEFAULT_DICTS_ES;
  const keyMap = {
    es: 'customEs', gl: 'customGl', ca: 'customCa', eu: 'customEu',
    en: 'customEn', fr: 'customFr', de: 'customDe', it: 'customIt', pt: 'customPt'
  };
  const custom = CFG.dict[keyMap[lang]] || [];
  return base.concat(custom);
}
function getDefaultDictId(lang){
  if (lang === 'gl') return CFG.dict.defaultGl;
  if (lang === 'ca') return CFG.dict.defaultCa;
  if (lang === 'eu') return CFG.dict.defaultEu;
  if (lang === 'en') return CFG.dict.defaultEn;
  if (lang === 'fr') return CFG.dict.defaultFr;
  if (lang === 'de') return CFG.dict.defaultDe;
  if (lang === 'it') return CFG.dict.defaultIt;
  if (lang === 'pt') return CFG.dict.defaultPt;
  return CFG.dict.defaultEs;
}
function getDefaultDict(lang){
  const id = getDefaultDictId(lang);
  const all = getDictsForLang(lang);
  return all.find(d => d.id === id) || all[0] || null;
}
function detectPageLang(){
  const rule = findSiteRule();
  if (rule && rule.lang && rule.lang !== 'auto') return rule.lang;
  const htmlLang = (document.documentElement.lang || '').toLowerCase().split('-')[0];
  if (SITE_LANGS.includes(htmlLang) && htmlLang !== 'auto') return htmlLang;
  return UI_LANGS.includes(CFG.lang) ? CFG.lang : 'es';
}
function buildDictUrl(dict, word){
  if (!dict || !dict.url) return null;
  return dict.url.replace(/\{palabra\}/g, encodeURIComponent(word.trim()));
}
function openDictionary(dict, word){
  if (!dict) { toast(t('dictNoDefault')); return; }
  const url = buildDictUrl(dict, word);
  if (!url){ toast(t('dictNotFound')); return; }
  window.open(url, '_blank', 'noopener');
}

/* ============================================================
   7. DOMINIOS Y REGLAS
   ============================================================ */
function normalizeDomain(d){
  return String(d || '').trim().toLowerCase()
    .replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
}
function domainMatches(host, rule){
  host = String(host||'').toLowerCase();
  rule = String(rule||'').toLowerCase();
  if (!host || !rule) return false;
  return host === rule || host.endsWith('.' + rule);
}

function isKnownMediaDomain(host){
  host = String(host || '').toLowerCase();
  if (!host) return false;
  if (CATALOG_BY_DOMAIN.has(host)) return true;
  let idx = host.indexOf('.');
  while (idx !== -1){
    const suf = host.slice(idx + 1);
    if (CATALOG_BY_DOMAIN.has(suf)) return true;
    idx = host.indexOf('.', idx + 1);
  }
  for (const s of (CFG.sites || [])){
    if (domainMatches(host, s.domain)) return true;
  }
  return false;
}

function getCatalogEntry(host){
  host = String(host || '').toLowerCase();
  if (!host) return null;
  if (CATALOG_BY_DOMAIN.has(host)) return CATALOG_BY_DOMAIN.get(host);
  let idx = host.indexOf('.');
  while (idx !== -1){
    const suf = host.slice(idx + 1);
    if (CATALOG_BY_DOMAIN.has(suf)) return CATALOG_BY_DOMAIN.get(suf);
    idx = host.indexOf('.', idx + 1);
  }
  for (const s of (CFG.sites || [])){
    if (domainMatches(host, s.domain)) return { d: s.domain, n: s.domain, lang: s.lang };
  }
  return null;
}

function findSiteRule(){
  for (const s of CFG.sites) if (domainMatches(location.hostname, s.domain)) return s;
  return null;
}
function currentReaderSource(){
  if (__sessionSourceOverride && READER_SOURCES.includes(__sessionSourceOverride))
    return __sessionSourceOverride;
  const r = findSiteRule();
  return (r && r.readerSource && READER_SOURCES.includes(r.readerSource)) ? r.readerSource : 'auto';
}
function currentExtraction(){
  const r = findSiteRule();
  return (r && r.extraction) ? r.extraction : { mode: 'auto', root: '', exclude: '', minChars: UI.extractMinChars };
}
function ensureSiteRule(){
  let rule = findSiteRule();
  if (rule) return rule;
  const d = normalizeDomain(location.hostname);
  rule = {
    domain: d, mode: 'prompt', ignorePatterns: [], readerSource: 'auto',
    lang: (getCatalogEntry(d) || {}).lang || 'auto',
    extraction: deepClone(DEFAULT_EXTRACTION)
  };
  CFG.sites.push(rule);
  CFG.sites.sort((a, b) => a.domain.localeCompare(b.domain));
  return rule;
}
function setReaderSourceForCurrentSite(src){
  if (!READER_SOURCES.includes(src)) return;
  const rule = ensureSiteRule();
  rule.readerSource = src;
  __sessionSourceOverride = null;
  saveCfg(CFG);
}
function removeSiteRule(domain){
  const d = normalizeDomain(domain);
  const before = CFG.sites.length;
  CFG.sites = CFG.sites.filter(s => s.domain !== d);
  if (CFG.sites.length < before){
    saveCfg(CFG);
    actualizarBoton();
    return true;
  }
  return false;
}
function isDomainDisabled(host){
  host = String(host || '').toLowerCase();
  if (!host) return false;
  return (CFG.disabledDomains || []).some(d => domainMatches(host, d));
}
function disableDomain(domain){
  const d = normalizeDomain(domain);
  if (!d) return;
  if (!Array.isArray(CFG.disabledDomains)) CFG.disabledDomains = [];
  if (!CFG.disabledDomains.includes(d)) CFG.disabledDomains.push(d);
}
function enableDomain(domain){
  const d = normalizeDomain(domain);
  if (!d) return;
  CFG.disabledDomains = (CFG.disabledDomains || []).filter(x => x !== d);
}
function removeSiteForDomain(domain){
  const d = normalizeDomain(domain);
  const before = CFG.sites.length;
  CFG.sites = CFG.sites.filter(s => s.domain !== d);
  return CFG.sites.length < before;
}

function addSiteAnywhere(domain, opts){
  opts = opts || {};
  const d = normalizeDomain(domain);
  if (!d) return false;
  if (CFG.sites.some(s => s.domain === d)) return false;
  const cat = getCatalogEntry(d) || {};
  CFG.sites.push({
    domain: d,
    mode: opts.mode || 'prompt',
    ignorePatterns: [],
    readerSource: 'auto',
    lang: opts.lang || cat.lang || 'auto',
    extraction: deepClone(DEFAULT_EXTRACTION)
  });
  CFG.sites.sort((a, b) => a.domain.localeCompare(b.domain));
  enableDomain(d);
  return true;
}

/* ============================================================
   8. SECCIONES IGNORADAS
   ============================================================ */
function isPlainDomain(){
  const p = location.pathname || '/';
  if (p === '' || p === '/') return true;
  if (/^\/(index\.(html?|php))?$/i.test(p)) return true;
  return false;
}
function sectionPatternFromPath(pathname){
  let p = pathname || '/';
  if (!p.startsWith('/')) p = '/' + p;
  const parts = p.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  return '/' + parts[0] + '/';
}
function isIgnoredSection(rule){
  if (!rule || !Array.isArray(rule.ignorePatterns) || !rule.ignorePatterns.length) return false;
  const p = location.pathname || '/';
  return rule.ignorePatterns.some(pat => p.startsWith(pat));
}
function ignoreCurrentSection(){
  const pattern = sectionPatternFromPath(location.pathname);
  if (!pattern){ toast(t('cannotIgnoreSection')); return; }
  const existedBefore = !!findSiteRule();
  const rule = ensureSiteRule();
  if (!Array.isArray(rule.ignorePatterns)) rule.ignorePatterns = [];
  if (rule.ignorePatterns.includes(pattern)){ toast(t('sectionAlreadyIgnored')); return; }
  rule.ignorePatterns.push(pattern);
  CFG.sites.sort((a, b) => a.domain.localeCompare(b.domain));
  saveCfg(CFG);
  actualizarBoton();
  toast((existedBefore ? '' : t('siteAddedForIgnore') + '\n') + t('sectionIgnored') + ' ' + pattern);
}

/* ============================================================
   9. PENDIENTES
   ============================================================ */
// La misma lista que Pendientes de Voceiro: se fusionan con la regla de
// shared/sync/fusion.js. Cada cambio lleva su fecha (actualizado) y lo
// borrado queda marcado (borrado) para que el borrado viaje; caduca solo.

// Sustituye la lista (normalizada), la guarda y se la manda a Voceiro.
function cambiarReadLater(nueva){
  CFG.readLater = fusionarPendientes(nueva, []);
  saveCfg(CFG);
  enviarEstado(false);
}
function pendientesVisibles(){
  return (CFG.readLater || []).filter(r => !r.borrado);
}
function conCambio(item, cambio){
  return [...CFG.readLater.filter(r => r !== item), { ...item, ...cambio, actualizado: Date.now() }];
}

function saveForLater(art){
  if (!art || !art.headline) return;
  const url = location.href;
  const existing = findLaterItem(url);

  if (existing){
    // Estaba → alterna pendiente / leída
    const leida = !existing.read;
    cambiarReadLater(conCambio(existing, { read: leida, readAt: leida ? Date.now() : null }));
    toast(t(leida ? 'movedToRead' : 'movedToPending'), 1800);
    return;
  }

  // No estaba → se añade como pendiente
  const ahora = Date.now();
  cambiarReadLater([...CFG.readLater, {
    url: url,
    title: art.headline || document.title || '',
    description: art.description || '',
    image: art.image || '',
    date: ahora,
    domain: normalizeDomain(location.hostname),
    read: false,
    readAt: null,
    actualizado: ahora
  }]);
  toast(t('savedLater'), 1800);
}

function removeFromLater(url){
  const item = pendientesVisibles().find(r => r.url === url);
  if (item) cambiarReadLater(conCambio(item, { borrado: true }));
}

// Quita los leídos (los deja marcados como borrados, para que viaje).
function borrarLeidos(){
  const ahora = Date.now();
  cambiarReadLater(CFG.readLater.map(r =>
    (r.read && !r.borrado) ? { ...r, borrado: true, actualizado: ahora } : r));
}

function toggleReadLater(url){
  const item = pendientesVisibles().find(r => r.url === url);
  if (!item) return false;
  const keepRead = !(CFG.readerSettings && CFG.readerSettings.keepReadItems === false);
  if (item.read){
    if (!keepRead) return false;
    cambiarReadLater(conCambio(item, { read: false, readAt: null }));
  } else if (keepRead){
    cambiarReadLater(conCambio(item, { read: true, readAt: Date.now() }));
  } else {
    cambiarReadLater(conCambio(item, { borrado: true }));
  }
  return true;
}

function findLaterItem(url){
  const href = String(url || '');
  if (!href) return null;

  const norm = normalizeUrlForMatch(href);
  for (const r of pendientesVisibles()){
    if (r.url === href) return r;
    if (normalizeUrlForMatch(r.url) === norm) return r;
  }

  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical){
    const cAbs = absUrl(canonical.getAttribute('href') || '');
    if (cAbs){
      const cNorm = normalizeUrlForMatch(cAbs);
      for (const r of pendientesVisibles()){
        if (r.url === cAbs) return r;
        if (normalizeUrlForMatch(r.url) === cNorm) return r;
      }
    }
  }

  return null;
}




/* ── Al terminar de leer ──
   Voceiro cuenta como leído lo que se abre desde allí; lo que se termina
   aquí (abierto desde donde sea) se le avisa por el puente: leidasParaVoceiro
   es una lista corta de { url, fecha, quitar? } que Voceiro confirma con
   leidasHasta (la fecha más nueva que ya tiene). No viaja a otros
   dispositivos: allí ya llega por la sincronización de Voceiro. */
const LEIDAS_AVISO_MAX = 200;

function avisarLeida(url, quitar){
  const ahora = Date.now();
  const aviso = { url: String(url), fecha: ahora };
  if (quitar) aviso.quitar = true;
  CFG.leidasParaVoceiro = [...(CFG.leidasParaVoceiro || []), aviso].slice(-LEIDAS_AVISO_MAX);
}

// Lo que Voceiro ya tiene (fecha <= hasta) se quita de la lista.
function leidasConfirmadas(hasta){
  const antes = CFG.leidasParaVoceiro || [];
  const quedan = antes.filter(l => l.fecha > (hasta || 0));
  if (quedan.length !== antes.length) CFG.leidasParaVoceiro = quedan;
}
function hayLeidasSinAvisar(hasta){
  return (CFG.leidasParaVoceiro || []).some(l => l.fecha > (hasta || 0));
}

// Marca esta página como leída: en Pendientes, si está (respetando «guardar
// leídas»), y para Voceiro. Devuelve con qué deshacerlo, o null si ya lo
// estaba y no había nada que hacer.
function marcarLeidaAlTerminar(){
  const url = location.href;
  const item = findLaterItem(url);
  const antes = item ? { ...item } : null;
  if (item && !item.read){
    const keepRead = !(CFG.readerSettings && CFG.readerSettings.keepReadItems === false);
    CFG.readLater = conCambio(item, keepRead ? { read: true, readAt: Date.now() } : { borrado: true });
  }
  avisarLeida(url);
  CFG.readLater = fusionarPendientes(CFG.readLater, []);
  saveCfg(CFG);
  enviarEstado(false);
  return () => {
    if (antes && !antes.read){
      const ahora = findLaterItem(url) || (CFG.readLater || []).find(r => r.url === antes.url);
      if (ahora) CFG.readLater = conCambio(ahora, { read: false, readAt: null, borrado: false });
    }
    avisarLeida(url, true);
    CFG.readLater = fusionarPendientes(CFG.readLater, []);
    saveCfg(CFG);
    enviarEstado(false);
  };
}

// La siguiente pendiente sin leer, en el orden de la lista (más recientes
// primero): la que va detrás de esta o, si esta no está, la primera.
function siguientePendiente(url){
  const sinLeer = pendientesVisibles().filter(r => !r.read);
  const aqui = normalizeUrlForMatch(url || location.href);
  const i = sinLeer.findIndex(r => normalizeUrlForMatch(r.url) === aqui);
  const resto = i < 0 ? sinLeer : [...sinLeer.slice(i + 1), ...sinLeer.slice(0, i)];
  return resto.find(r => normalizeUrlForMatch(r.url) !== aqui) || null;
}

/* ── Abrir la siguiente con el lector ya abierto ──
   Antes de ir se apunta adónde (SIGUIENTE_KEY, aparte de CFG: no es
   configuración); al llegar, init lo ve y abre el lector. Vale la misma
   dirección o el mismo medio (por si redirige), durante dos minutos. */
const SIGUIENTE_KEY = 'lector-abrir-al-llegar';

function irASiguientePendiente(siguiente){
  PLATAFORMA.guardar(SIGUIENTE_KEY, { url: siguiente.url, t: Date.now() });
  location.href = siguiente.url;
}

function llegaDeSiguientePendiente(){
  const f = PLATAFORMA.leer(SIGUIENTE_KEY, null);
  if (!f || !f.url) return false;
  if (Date.now() - (f.t || 0) > 2 * 60 * 1000){ PLATAFORMA.guardar(SIGUIENTE_KEY, null); return false; }
  let mismoMedio = false;
  try { mismoMedio = normalizeDomain(new URL(f.url).hostname) === normalizeDomain(location.hostname); } catch(e){}
  if (!mismoMedio && normalizeUrlForMatch(f.url) !== normalizeUrlForMatch(location.href)) return false;
  PLATAFORMA.guardar(SIGUIENTE_KEY, null);
  return true;
}
/* ============================================================
   10. TOAST + DIÁLOGO
   ============================================================ */
function toast(msg, ms, action){
  ms = ms || 2400;
  if (action) ms = Math.max(ms, 6000);
  // Colores invertidos del tema (fondo = texto): se ve sobre cualquier
  // página. role=status: los lectores de pantalla lo leen sin mover el foco.
  const el = temaDe(document.createElement('div'));
  el.setAttribute('role', 'status');
  el.style.cssText = 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%) translateY(20px);' +
    'background:var(--fg);color:var(--bg);padding:12px 18px;border-radius:8px;' +
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;' +
    'z-index:2147483647;box-shadow:0 6px 20px rgba(0,0,0,.35);opacity:0;' +
    'transition:opacity .2s,transform .2s;max-width:90vw;' +
    'display:flex;align-items:center;gap:12px;' +
    'pointer-events:' + (action ? 'auto' : 'none');
  const span = document.createElement('span');
  span.textContent = msg;
  span.style.whiteSpace = 'pre-wrap';
  el.appendChild(span);
  if (action){
    const btn = document.createElement('button');
    btn.textContent = action.label;
    btn.type = 'button';
    btn.style.cssText = 'background:transparent;color:var(--bg);border:1px solid var(--bg);text-decoration:underline;' +
      'min-height:32px;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:13px;font-weight:bold;' +
      'font-family:inherit;flex:0 0 auto';
    btn.onclick = () => { try { action.onClick(); } catch(e){} el.remove(); };
    el.appendChild(btn);
  }
  document.body.appendChild(el);
  requestAnimationFrame(()=>{ el.style.opacity='1'; el.style.transform='translateX(-50%) translateY(0)'; });
  setTimeout(()=>{
    el.style.opacity='0'; el.style.transform='translateX(-50%) translateY(20px)';
    setTimeout(()=>el.remove(), 250);
  }, ms);
}

function showAddSiteDialog(domain, srcLabel, parentEl){
  return new Promise(resolve => {
    const overlay = temaDe(document.createElement('div'));
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483647;' +
      'display:flex;align-items:center;justify-content:center;padding:20px;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
    const focoAntes = document.activeElement;
    const box = document.createElement('div');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'il-dlg-titulo');
    box.style.cssText = 'background:var(--bg);color:var(--fg);border-radius:12px;max-width:460px;width:100%;' +
      'padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.4)';
    box.innerHTML =
      '<h3 id="il-dlg-titulo" style="margin:0 0 10px;font-size:17px">' + esc(t('addSiteTitle')) + '</h3>' +
      '<p style="margin:0 0 18px;font-size:14px;line-height:1.5;color:var(--fg)">' +
        esc(t('addSiteQuestion').replace('{X}', domain).replace('{Y}', srcLabel)) +
      '</p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end">' +
        '<button class="il-dlg-cancel" style="padding:9px 14px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer;font-size:14px">' + esc(t('btnCancel')) + '</button>' +
        '<button class="il-dlg-once" style="padding:9px 14px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer;font-size:14px">' + esc(t('btnOnlyOnce')) + '</button>' +
        '<button class="il-dlg-add" style="padding:9px 14px;background:var(--accent);color:var(--on-solid);border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:bold">' + esc(t('btnAddList')) + '</button>' +
      '</div>';
    overlay.appendChild(box);
    (parentEl || document.body).appendChild(overlay);
    let resolved = false;
    function cleanup(val){
      if (resolved) return;
      resolved = true;
      document.removeEventListener('keydown', escCapture, true);
      overlay.remove();
      if (focoAntes && focoAntes.isConnected && focoAntes.focus) focoAntes.focus();
      resolve(val);
    }
    function escCapture(e){
      if (e.key === 'Escape'){ e.stopImmediatePropagation(); e.preventDefault(); cleanup('cancel'); }
    }
    document.addEventListener('keydown', escCapture, true);
    box.querySelector('.il-dlg-cancel').onclick = () => cleanup('cancel');
    box.querySelector('.il-dlg-once').onclick   = () => cleanup('once');
    box.querySelector('.il-dlg-add').onclick    = () => cleanup('add');
    box.querySelector('.il-dlg-add').focus();
    overlay.addEventListener('click', e => { if (e.target === overlay) cleanup('cancel'); });
  });
}

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

/* ============================================================
   11b. ATAJOS DE TECLADO — infraestructura
   ============================================================ */
const RESERVED_BROWSER_KEYS = new Set([
  'ctrl+w','ctrl+t','ctrl+n','ctrl+shift+t','ctrl+shift+n','ctrl+shift+w',
  'meta+w','meta+t','meta+n','meta+shift+t','meta+shift+n','meta+shift+w',
  'ctrl+tab','ctrl+shift+tab',
  'ctrl+r','f5','ctrl+shift+r','ctrl+f5','ctrl+l','alt+left','alt+right','alt+home',
  'f12','ctrl+shift+i','ctrl+shift+j','ctrl+shift+c','ctrl+shift+k',
  'meta+alt+i','meta+alt+j','meta+alt+c',
  'f11','ctrl+0','ctrl+-','ctrl+=','ctrl++','ctrl+shift+0',
  'alt+f4','ctrl+q','meta+q',
  'ctrl+p','ctrl+s',
  'ctrl+d','ctrl+shift+o','ctrl+h','ctrl+j','ctrl+shift+delete',
  'ctrl+c','ctrl+v','ctrl+x','ctrl+a','ctrl+z','ctrl+y',
  'ctrl+f','ctrl+g','ctrl+shift+g','f3',
  'ctrl+u','ctrl+shift+u','alt+d'
]);

function normalizeKey(e){
  let key = String(e.key || '').toLowerCase();
  if (key === ' ' || e.code === 'Space') key = 'space';
  if (key === 'esc') key = 'escape';
  if (key === 'del') key = 'delete';
  if (key === 'ins') key = 'insert';
  if (key === 'pgup' || key === 'pageup') key = 'pageup';
  if (key === 'pgdn' || key === 'pagedown') key = 'pagedown';
  if (key === 'left') key = 'arrowleft';
  if (key === 'right') key = 'arrowright';
  if (key === 'up') key = 'arrowup';
  if (key === 'down') key = 'arrowdown';
  if (key === 'return' || key === 'enter') key = 'enter';

  const parts = [];
  if (e.ctrlKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey && (key.length > 1 || /^[a-z0-9]$/.test(key))){
    parts.push('shift');
  }
  if (e.metaKey) parts.push('meta');

  parts.push(key);
  return parts.join('+');
}

function hasSafeModifier(nk){
  const parts = String(nk).split('+');
  return parts.includes('ctrl') || parts.includes('alt') || parts.includes('meta');
}
function findActionByKey(scope, nk){
  const map = CFG.shortcuts && CFG.shortcuts[scope];
  if (!map) return null;
  // Solo acciones que existen: una configuración importada de otra versión
  // puede traer acciones que ya no están, y no deben tragarse teclas.
  for (const action of Object.keys(DEFAULT_CFG.shortcuts[scope] || {})){
    if (action === 'close') continue;
    const keys = map[action];
    if (Array.isArray(keys) && keys.some(k => k.toLowerCase() === nk)) return action;
  }
  return null;
}
function findShortcutConflict(scope, except, nk){
  const map = CFG.shortcuts && CFG.shortcuts[scope];
  if (!map) return null;
  for (const action of Object.keys(map)){
    if (action === except) continue;
    if (action === 'close') continue;
    const keys = map[action];
    if (Array.isArray(keys) && keys.some(k => k.toLowerCase() === nk)) return action;
  }
  return null;
}
function formatShortcut(nk){
  if (!nk) return '';
  const labels = {
    ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Meta',
    escape: 'Esc', space: 'Space', enter: 'Enter',
    arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→',
    pageup: 'PgUp', pagedown: 'PgDn', delete: 'Del', backspace: '⌫', tab: 'Tab'
  };
  return String(nk).split('+').map(p => {
    if (labels[p]) return labels[p];
    if (p.length === 1) return p.toUpperCase();
    return p.charAt(0).toUpperCase() + p.slice(1);
  }).join(' + ');
}
function shortcutActionLabel(action){
  return t('sc' + action.charAt(0).toUpperCase() + action.slice(1));
}

/* ============================================================
   12. SANITIZACIÓN
   ============================================================ */
const ALLOWED_TAGS = new Set([
  'B','STRONG','I','EM','U','S','SUP','SUB','CODE','MARK','A','BR','SPAN',
  'P','BLOCKQUOTE','H1','H2','H3','H4','H5','H6','UL','OL','LI','PRE','HR',
  'DIV','SECTION','ARTICLE','FIGURE','FIGCAPTION','IMG',
  'TABLE','CAPTION','THEAD','TBODY','TFOOT','TR','TH','TD'
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
        } else if (tag === 'P' && a.name === 'data-il-clase' && /^[a-z]+$/.test(a.value)){
          // keep
        } else if ((tag === 'TD' || tag === 'TH') && (a.name === 'colspan' || a.name === 'rowspan') && /^[1-9]\d?$/.test(a.value)){
          // keep: celdas unidas
        } else if (tag === 'TH' && a.name === 'scope' && /^(row|col|rowgroup|colgroup)$/.test(a.value)){
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
      if (tag === 'P' && child.hasAttribute('data-il-embed')){
        push('embed', {
          red: child.getAttribute('data-il-embed'),
          url: child.getAttribute('data-il-url') || '',
          clase: child.getAttribute('data-il-clase') || '',
          // «·» es el relleno para que Readability no tire el párrafo vacío.
          texto: (child.textContent || '').replace(/\s+/g,' ').trim().replace(/^·$/, '')
        });
        continue;
      }
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
        const tabla = child.querySelector(':scope > table');
        if (tabla && esTablaDeDatos(tabla)){
          const capEl = child.querySelector(':scope > figcaption');
          push('tabla', bloqueTabla(tabla, capEl ? capEl.textContent : ''));
          continue;
        }
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
      } else if (tag === 'TABLE' && esTablaDeDatos(child)){
        push('tabla', bloqueTabla(child, ''));
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
// Tabla de datos o de maquetación (CMS viejos que meten el artículo en una
// tabla, que se recorre como hasta ahora). De datos: sin otra tabla dentro,
// al menos 2 × 2 y sin texto largo ni intertítulos en las celdas.
function esTablaDeDatos(tabla){
  if (tabla.querySelector('table')) return false;
  const filas = Array.from(tabla.rows);
  if (filas.length < 2 || !filas.some(f => f.cells.length >= 2)) return false;
  return filas.every(f => Array.from(f.cells).every(c =>
    (c.textContent || '').replace(/\s+/g,' ').trim().length <= 300 &&
    !c.querySelector('h1,h2,h3,h4,h5,h6,blockquote,figure,pre')));
}
// {html, caption}: la tabla ya saneada. Si no trae caption y su figure
// tiene pie, el pie pasa a caption. Las imágenes de las celdas (banderas,
// escudos) se quedan en su texto alternativo.
function bloqueTabla(tabla, pieFigura){
  const t = tabla.cloneNode(true);
  t.querySelectorAll('img').forEach(im => im.replaceWith(im.getAttribute('alt') || ''));
  let cap = t.querySelector('caption');
  const pie = (pieFigura || '').replace(/\s+/g,' ').trim();
  if (!cap && pie){
    cap = t.ownerDocument.createElement('caption');
    cap.textContent = pie;
    t.insertBefore(cap, t.firstChild);
  }
  return { html: t.outerHTML, caption: cap ? (cap.textContent || '').replace(/\s+/g,' ').trim() : '' };
}
// Texto plano de una tabla, fila a fila (copiar el texto).
function textoDeTabla(b){
  const doc = new DOMParser().parseFromString(b.html || '', 'text/html');
  const filas = Array.from(doc.querySelectorAll('tr')).map(tr =>
    Array.from(tr.cells).map(c => (c.textContent || '').replace(/\s+/g,' ').trim()).join(' | '));
  return (b.caption ? b.caption + '\n' : '') + filas.join('\n');
}
// Texto plano de un bloque (para comparar con el JSON o contar palabras).
function textoDeBloque(b){
  if (b.tipo === 'tabla') return textoDeTabla(b);
  return b.tipo === 'list' ? b.items.map(stripTags).join(' ') : stripTags(b.html || '');
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

// Embebidos (tweets, vídeos, gráficos…): el sanitizador quita los iframes y
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
// Título de un gráfico: el del iframe, sin el «(Copy)» que deja duplicarlo
// en Datawrapper ni los genéricos que ponen los servicios.
const TITULO_GENERICO = /^(interactive or visual content|chart visualization|embed|iframe|google maps|map|mapa|chart|gr[aá]fico|datawrapper|flourish|infogram|genially|tableau)$/i;
function sinCopia(s){ return String(s || '').replace(/(\s*\((copy|copia|cópia|còpia)\))+\s*$/i, '').trim(); }
function tituloDe(el){ const s = sinCopia(el.getAttribute('title')); return TITULO_GENERICO.test(s) ? '' : s; }
// Las inserciones con script dejan en <noscript> una imagen con el título
// en el alt. En la página, el noscript es texto; en un DOMParser, elementos.
function altDeNoscript(el){
  const ns = el.querySelector('noscript');
  if (!ns) return '';
  const im = ns.querySelector('img');
  const m = im ? null : (ns.textContent || '').match(/\balt="([^"]*)"/i);
  const s = sinCopia(decodeEnt(im ? im.getAttribute('alt') : m ? m[1] : ''));
  return TITULO_GENERICO.test(s) ? '' : s;
}
// Lo que acompaña al embebido sin verse (su script, su estilo, su
// noscript) no cuenta al subir por los envoltorios.
const SIN_VER = new Set(['SCRIPT','STYLE','NOSCRIPT','TEMPLATE']);
const hijosVisibles = el => [...el.children].filter(c => !SIN_VER.has(c.tagName));
function textoVisible(el){
  return [...el.childNodes].map(n => n.nodeType === 3 ? n.data
    : n.nodeType === 1 && !SIN_VER.has(n.tagName) ? textoVisible(n) : '').join('').replace(/\s+/g, ' ').trim();
}
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
  { red: 'facebook', sel: 'iframe[src*="facebook.com/plugins/"]', url: el => parametro(fuenteDe(el), 'href') },

  // Gráficos, tablas y mapas. Solo se avisa de que están y se enlaza la
  // versión interactiva; al cerrar el lector se ven en la página. clase:
  // 'tabla', 'grafico' o 'mapa' si se sabe. Las inserciones con script
  // (div + embed.js) van antes que su iframe: al cambiar el div, el iframe
  // que el script metió dentro ya no está.
  { red: 'datawrapper', sel: 'div[id^="datawrapper-vis-"]',
    url: el => 'https://datawrapper.dwcdn.net/' + encodeURIComponent(el.id.slice(16)) + '/',
    texto: altDeNoscript },
  { red: 'datawrapper', sel: 'iframe[id^="datawrapper-chart-"],iframe[src*="datawrapper.dwcdn.net/"],iframe[data-src*="datawrapper.dwcdn.net/"],iframe[src*="datawrapper.de/_/"]',
    url: fuenteDe, texto: tituloDe,
    clase: el => { const a = el.getAttribute('aria-label') || '';
                   return /table/i.test(a) ? 'tabla' : /map/i.test(a) ? 'mapa' : /chart|graph/i.test(a) ? 'grafico' : ''; } },
  { red: 'flourish', sel: 'div.flourish-embed[data-src]',
    url: el => { const s = el.getAttribute('data-src').replace(/^\/+/, '');
                 return /^(visualisation|story)\/\d+/.test(s) ? 'https://public.flourish.studio/' + s.split('?')[0] + '/' : ''; },
    texto: altDeNoscript, clase: el => /^\/?visualisation\//.test(el.getAttribute('data-src')) ? 'grafico' : '' },
  { red: 'flourish', sel: 'iframe[src*="flo.uri.sh/"],iframe[src*="public.flourish.studio/"]',
    url: fuenteDe, texto: tituloDe, clase: el => /\/visualisation\//.test(fuenteDe(el)) ? 'grafico' : '' },
  { red: 'infogram', sel: 'div.infogram-embed[data-id]',
    url: el => 'https://e.infogram.com/' + encodeURIComponent(el.getAttribute('data-id')),
    texto: el => sinCopia(el.getAttribute('data-title')), clase: () => 'grafico' },
  { red: 'infogram', sel: 'iframe[src*="infogram.com/"]', url: fuenteDe, texto: tituloDe, clase: () => 'grafico' },
  { red: 'tableau', sel: 'div.tableauPlaceholder',
    url: el => { const n = el.querySelector('param[name="name"]');
                 return n && n.getAttribute('value') ? 'https://public.tableau.com/views/' + n.getAttribute('value').split('/').map(encodeURIComponent).join('/') : ''; },
    clase: () => 'grafico' },
  { red: 'tableau', sel: 'iframe[src*="public.tableau.com/"]', url: fuenteDe, texto: tituloDe, clase: () => 'grafico' },
  { red: 'genially', sel: 'iframe[src*="genial.ly/"],iframe[src*="genially.com/"]', url: fuenteDe, texto: tituloDe },
  { red: 'googlesheets', sel: 'iframe[src*="docs.google.com/spreadsheets/"]', url: fuenteDe, texto: tituloDe, clase: () => 'tabla' },
  { red: 'googlemaps', sel: 'iframe[src*="google.com/maps"],iframe[src*="maps.google."],iframe[data-src*="google.com/maps"]',
    url: fuenteDe, texto: tituloDe, clase: () => 'mapa' },
  { red: 'umap', sel: 'iframe[src*="umap.openstreetmap."]', url: fuenteDe, texto: tituloDe, clase: () => 'mapa' },
  { red: 'arcgis', sel: 'iframe[src*="arcgis.com/"]', url: fuenteDe, texto: tituloDe,
    clase: el => /storymaps\./.test(fuenteDe(el)) ? '' : 'mapa' }
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
      while (caja.parentElement && caja.parentElement !== tope && hijosVisibles(caja.parentElement).length === 1 &&
             !/^(ARTICLE|MAIN|SECTION)$/.test(caja.parentElement.tagName) &&
             textoVisible(caja.parentElement) === textoVisible(caja)) caja = caja.parentElement;
      const p = doc.createElement('p');
      p.setAttribute('data-il-embed', e.red);
      p.setAttribute('data-il-url', url);
      const clase = e.clase ? e.clase(el) : '';
      if (CLASES_EMBEBIDO[clase]) p.setAttribute('data-il-clase', clase);
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
    paywall: { detected: false, indicators: [] },
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

  const paywallPatterns = [
    { sel: '[class*="paywall"]', name: 'class~"paywall"' },
    { sel: '[class*="regwall"]', name: 'class~"regwall"' },
    { sel: '[class*="subscriber"]', name: 'class~"subscriber"' },
    { sel: '[class*="subscription"]', name: 'class~"subscription"' },
    { sel: '[data-paywall]', name: '[data-paywall]' },
    { sel: '[class*="premium-content"]', name: 'class~"premium-content"' }
  ];
  paywallPatterns.forEach(p => {
    let n = 0;
    try { n = document.querySelectorAll(p.sel).length; } catch(e){}
    if (n){
      info.paywall.detected = true;
      info.paywall.indicators.push(p.name + ' (' + n + ')');
    }
  });

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

/* ============================================================
   15. DETECCIÓN DE ARTÍCULO / FAB
   ============================================================ */
function isArticlePage(){
  if (document.querySelector('article')) return true;
  const ogType = metaContent('meta[property="og:type"]');
  if (/article|news/i.test(ogType)) return true;
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const s of scripts){
    const txt = (s.textContent || '').slice(0, 4000);
    if (/"@type"\s*:\s*"(NewsArticle|Article|BlogPosting|ReportageNewsArticle|TechArticle|ScholarlyArticle)"/i.test(txt)) return true;
  }
  return false;
}

function debeMostrarFabServicios(){
  if (!serviciosConfigurados().length) return false;
  if (CFG.serviciosFab && CFG.serviciosFab.oculto) return false;
  if (isPlainDomain()) return false;
  if (isDomainDisabled(location.hostname)) return false;
  const rule = findSiteRule();
  if (rule && rule.mode === 'off') return false;
  if (rule && isIgnoredSection(rule)) return false;
  if (rule) return true;
  if (!isKnownMediaDomain(location.hostname)) return false;
  return isArticlePage();
}

function shouldShowReaderFAB(){
  if (isPlainDomain()) return false;
  if (isDomainDisabled(location.hostname)) return false;
  const rule = findSiteRule();
  if (rule && rule.mode === 'off') return false;
  if (rule && isIgnoredSection(rule)) return false;
  if (rule) return true;
  if (!isKnownMediaDomain(location.hostname)) return false;
  return isArticlePage();
}


/* ============================================================
   16. ASPECTO: PALETA, ICONOS Y CSS DEL LECTOR
   ============================================================ */
// Paleta de Voceiro (plantilla.html, bloque PALETA), puesta aquí por
// build.mjs: { light: {bg:'#fff', …, 'color-scheme':'light'}, sepia: {…}, … }.
const PALETA = {"light":{"bg":"#fff","fg":"#222","muted":"#6b6b6b","accent":"#d32f2f","border":"#eee","quote-bg":"#f9f9f9","btn-bg":"#f7f7f7","btn-border":"#8a8a8a","shadow":"rgba(0,0,0,.08)","preset":"#0a7d3f","preset-bg":"#e8f5e9","block":"#b00020","block-bg":"#fde8ec","save":"#1565c0","save-bg":"#e3f2fd","mark":"#ffe680","mark-fg":"#111","on-solid":"#fff","focus":"#1565c0","titulos":"#222","color-scheme":"light"},"sepia":{"bg":"#f4ecd8","fg":"#3b2f1e","muted":"#6b5a3c","accent":"#8f4523","border":"#e0d5b8","quote-bg":"#ede0c4","btn-bg":"#ede0c4","btn-border":"#8c7c58","shadow":"rgba(59,47,30,.15)","preset":"#33682a","preset-bg":"#e4ebd0","block":"#8b2020","block-bg":"#ebd5d0","save":"#2e5a8b","save-bg":"#d8e3ee","mark":"#c9a227","mark-fg":"#2c1c08","on-solid":"#fff","focus":"#2e5a8b","titulos":"#3b2f1e","color-scheme":"light"},"dark":{"bg":"#1a1a1a","fg":"#e0e0e0","muted":"#999","accent":"#ff6b6b","border":"#333","quote-bg":"#252525","btn-bg":"#2a2a2a","btn-border":"#787878","shadow":"rgba(0,0,0,.5)","preset":"#4cc97a","preset-bg":"#173524","block":"#ff8a9c","block-bg":"#3d1a20","save":"#6cb3ff","save-bg":"#1e3550","mark":"#b58600","mark-fg":"#111","on-solid":"#111","focus":"#6cb3ff","titulos":"#e0e0e0","color-scheme":"dark"},"contrast":{"bg":"#000","fg":"#fff","muted":"#ff0","accent":"#0ff","border":"#fff","quote-bg":"#111","btn-bg":"#111","btn-border":"#fff","shadow":"rgba(255,255,255,.2)","preset":"#0f0","preset-bg":"#003300","block":"#f00","block-bg":"#330000","save":"#0ff","save-bg":"#003333","mark":"#ff0","mark-fg":"#000","on-solid":"#000","focus":"#ff0","titulos":"#fff","color-scheme":"dark"}};

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
const ICONOS = {"a-large-small":"<path d=\"M21 14h-5\" /><path d=\"M16 16v-3.5a2.5 2.5 0 0 1 5 0V16\" /><path d=\"M4.5 13h6\" /><path d=\"m3 16 4.5-9 4.5 9\" />","arrow-left":"<path d=\"m12 19-7-7 7-7\" /><path d=\"M19 12H5\" />","arrow-up":"<path d=\"m5 12 7-7 7 7\" /><path d=\"M12 19V5\" />","ban":"<circle cx=\"12\" cy=\"12\" r=\"10\" /><path d=\"m4.9 4.9 14.2 14.2\" />","book-open-text":"<path d=\"M12 7v14\" /><path d=\"M16 12h2\" /><path d=\"M16 8h2\" /><path d=\"M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z\" /><path d=\"M6 12h2\" /><path d=\"M6 8h2\" />","bookmark":"<path d=\"m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z\" />","bookmark-check":"<path d=\"m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z\" /><path d=\"m9 10 2 2 4-4\" />","captions":"<rect width=\"18\" height=\"14\" x=\"3\" y=\"5\" rx=\"2\" ry=\"2\" /><path d=\"M7 15h4M15 15h2M7 11h2M13 11h4\" />","chevron-left":"<path d=\"m15 18-6-6 6-6\" />","chevron-right":"<path d=\"m9 18 6-6-6-6\" />","copy":"<rect width=\"14\" height=\"14\" x=\"8\" y=\"8\" rx=\"2\" ry=\"2\" /><path d=\"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2\" />","ellipsis":"<circle cx=\"12\" cy=\"12\" r=\"1\" /><circle cx=\"19\" cy=\"12\" r=\"1\" /><circle cx=\"5\" cy=\"12\" r=\"1\" />","external-link":"<path d=\"M15 3h6v6\" /><path d=\"M10 14 21 3\" /><path d=\"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\" />","eye-off":"<path d=\"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49\" /><path d=\"M14.084 14.158a3 3 0 0 1-4.242-4.242\" /><path d=\"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143\" /><path d=\"m2 2 20 20\" />","image":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" ry=\"2\" /><circle cx=\"9\" cy=\"9\" r=\"2\" /><path d=\"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\" />","image-off":"<line x1=\"2\" x2=\"22\" y1=\"2\" y2=\"22\" /><path d=\"M10.41 10.41a2 2 0 1 1-2.83-2.83\" /><line x1=\"13.5\" x2=\"6\" y1=\"13.5\" y2=\"21\" /><line x1=\"18\" x2=\"21\" y1=\"12\" y2=\"15\" /><path d=\"M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59\" /><path d=\"M21 15V5a2 2 0 0 0-2-2H9\" />","library":"<path d=\"m16 6 4 14\" /><path d=\"M12 6v14\" /><path d=\"M8 8v12\" /><path d=\"M4 4v16\" />","mail":"<rect width=\"20\" height=\"16\" x=\"2\" y=\"4\" rx=\"2\" /><path d=\"m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7\" />","minus":"<path d=\"M5 12h14\" />","plus":"<path d=\"M5 12h14\" /><path d=\"M12 5v14\" />","printer":"<path d=\"M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2\" /><path d=\"M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6\" /><rect x=\"6\" y=\"14\" width=\"12\" height=\"8\" rx=\"1\" />","settings":"<path d=\"M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z\" /><circle cx=\"12\" cy=\"12\" r=\"3\" />","share-2":"<circle cx=\"18\" cy=\"5\" r=\"3\" /><circle cx=\"6\" cy=\"12\" r=\"3\" /><circle cx=\"18\" cy=\"19\" r=\"3\" /><line x1=\"8.59\" x2=\"15.42\" y1=\"13.51\" y2=\"17.49\" /><line x1=\"15.41\" x2=\"8.59\" y1=\"6.51\" y2=\"10.49\" />","x":"<path d=\"M18 6 6 18\" /><path d=\"m6 6 12 12\" />","zap":"<path d=\"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z\" />"};
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
#il-full[data-imagenes="ninguna"] .il-galeria,
#il-full[data-imagenes="ninguna"] .il-body img,
#il-full[data-imagenes="ninguna"] .il-miniatura,
#il-full[data-imagenes="ninguna"] #il-ambi-img{display:none!important}
#il-full[data-imagenes="conPie"] .il-figure:not(.il-con-pie),
#il-full[data-imagenes="conPie"] .il-inline-figure:not(.il-con-pie),
#il-full[data-imagenes="conPie"] .il-galeria:not(.il-con-pie),
#il-full[data-imagenes="conPie"] .il-miniatura:not(.il-con-pie){display:none}
#il-full .il-miniatura{float:right;width:96px;height:96px;margin:4px 0 12px 18px;padding:0;border:1px solid var(--btn-border);border-radius:8px;overflow:hidden;background:var(--quote-bg);cursor:pointer}
#il-full .il-miniatura img{width:100%;height:100%;object-fit:cover;display:block}
#il-full .il-galeria{margin:2em 0}
#il-full .il-galeria-rejilla{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px}
#il-full .il-body .il-galeria-rejilla img{width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;border-radius:4px;margin:0;cursor:zoom-in}
#il-full .il-galeria figcaption{font-size:.85em;color:var(--muted);text-align:center;padding:8px 14px 0;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
#il-full .il-embed{margin:1.6em 0;padding:12px 16px;border:1px solid var(--btn-border);border-left:4px solid var(--accent);border-radius:6px;background:var(--quote-bg);font-size:.92em}
#il-full .il-embed-red{margin:0 0 4px;font-size:.78em;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);font-family:-apple-system,BlinkMacSystemFont,sans-serif}
#il-full .il-embed-texto{margin:0 0 6px}
#il-full .il-embed a{display:inline-flex;align-items:center;gap:6px;min-height:44px}
#il-full .il-embed .il-ico{width:16px;height:16px}
#il-full .il-tabla{margin:1.6em 0;overflow-x:auto;border:1px solid var(--btn-border);border-radius:6px}
#il-full .il-tabla table{border-collapse:collapse;width:100%;font-size:.86em;line-height:1.45;font-variant-numeric:tabular-nums}
#il-full .il-tabla caption{caption-side:top;text-align:left;font-weight:600;padding:10px 12px 6px}
#il-full .il-tabla th,#il-full .il-tabla td{padding:6px 12px;border-top:1px solid var(--border);text-align:left;vertical-align:top}
#il-full .il-tabla th{font-weight:600;background:var(--quote-bg)}
#il-full .il-body .il-tabla p{margin:0;text-align:left;hyphens:manual}
#il-full .il-visor{position:fixed;inset:0;z-index:30;background:rgba(0,0,0,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:56px 64px 16px;cursor:zoom-out}
#il-full .il-visor-img{max-width:100%;max-height:calc(100% - 60px);object-fit:contain}
#il-full .il-visor-pie{color:#eee;margin:12px 0 0;max-width:60em;text-align:center;font:14px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;cursor:default}
#il-full .il-visor button{position:absolute;width:48px;height:48px;border-radius:50%;border:1px solid rgba(255,255,255,.5);background:rgba(0,0,0,.55);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
#il-full .il-visor button:focus-visible{outline:3px solid #fff;outline-offset:2px}
#il-full .il-visor .il-ico{width:24px;height:24px}
#il-full .il-visor-cerrar{top:8px;right:8px}
#il-full .il-visor-ant{left:8px;top:50%;transform:translateY(-50%)}
#il-full .il-visor-sig{right:8px;top:50%;transform:translateY(-50%)}
@media (max-width:560px){#il-full .il-visor{padding:56px 8px 16px}#il-full .il-visor-ant,#il-full .il-visor-sig{top:auto;bottom:12px;transform:none}}
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

/* ============================================================
   17. DESPLEGABLE «ABRIR EN…»
   ============================================================ */
function crearDesplegableServicios(opts){
  opts = opts || {};
  const dd = temaDe(document.createElement('div'));
  dd.classList.add('il-servicios-dropdown');
  dd.setAttribute('role', 'menu');
  if (opts.position === 'fixed-top-right'){
    dd.style.cssText = 'position:fixed;top:60px;right:20px;' +
      'background:var(--bg,var(--bg));color:var(--fg,var(--fg));border:1px solid var(--border,var(--btn-border));' +
      'border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.35);padding:6px;' +
      'z-index:2147483647;min-width:210px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
  } else if (opts.position === 'below-left'){
    dd.style.cssText = 'position:absolute;top:' + (UI.fabSize + 12) + 'px;left:0;background:var(--bg);color:var(--fg);' +
      'border:1px solid var(--btn-border);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.25);' +
      'padding:6px;min-width:210px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
  } else {
    dd.style.cssText = 'position:absolute;bottom:64px;left:0;background:var(--bg);color:var(--fg);' +
      'border:1px solid var(--btn-border);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.25);' +
      'padding:6px;min-width:210px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
  }

  function boton(texto, alPulsar, secundario){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'menuitem');
    btn.textContent = texto;
    btn.style.cssText = 'display:block;width:100%;text-align:left;padding:8px 12px;' +
      'border:none;background:transparent;color:inherit;cursor:pointer;' +
      'border-radius:6px;font-size:' + (secundario ? '13px' : '14px') + ';font-family:inherit;' +
      'font-weight:' + (secundario ? '400' : '500') + (secundario ? ';color:var(--muted)' : '');
    btn.onmouseenter = () => { btn.style.background = 'var(--quote-bg)'; };
    btn.onmouseleave = () => { btn.style.background = 'transparent'; };
    btn.onclick = (e) => {
      e.stopPropagation();
      if (opts.onClose) opts.onClose();
      alPulsar();
    };
    return btn;
  }

  const servicios = serviciosConfigurados();
  if (!servicios.length){
    const vacio = document.createElement('div');
    vacio.textContent = t('serviciosVacio');
    vacio.style.cssText = 'padding:8px 12px;font-size:13px;color:var(--muted);max-width:260px';
    dd.appendChild(vacio);
  }
  servicios.forEach(svc => dd.appendChild(boton(svc.nombre, () => abrirEnServicio(svc))));

  const sep = document.createElement('div');
  sep.style.cssText = 'border-top:1px solid rgba(0,0,0,.12);margin:4px 0';
  dd.appendChild(sep);
  dd.appendChild(boton(t('serviciosGestionar'), () => openSettings('servicios'), true));
  return dd;
}

/* ============================================================
   18. HERRAMIENTA DE ANÁLISIS DE EXTRACCIÓN
   ============================================================ */
function openExtractionTool(siteIdx, onClose){
  const site = CFG.sites[siteIdx];
  if (!site) return;
  if (document.getElementById('il-extract-tool')) return;

  const work = deepClone(site.extraction || DEFAULT_EXTRACTION);
  let lastExtraction = null;
  let lastError = '';

  const root = temaDe(document.createElement('div'));
  root.id = 'il-extract-tool';
  root.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483647;' +
    'display:flex;align-items:center;justify-content:center;padding:20px;' +
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
  const box = document.createElement('div');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', t('extractionTitle'));
  box.style.cssText = 'background:var(--bg);color:var(--fg);border-radius:12px;max-width:1000px;width:100%;' +
    'max-height:92vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.4);padding:24px';
  root.appendChild(box);
  document.body.appendChild(root);

  function close(){
    root.remove();
    if (onClose) onClose();
  }

  function runExtractionPreview(){
    lastError = '';
    let art;
    try { art = extractArticleWithConfig(work); }
    catch(e){ lastError = String(e.message || e); }
    if (!art || !art.rawBody || art.rawBody.length < (work.minChars || UI.extractMinChars)){
      lastExtraction = null;
      return null;
    }
    lastExtraction = art;
    return art;
  }

  function renderDiagnosticsHTML(diag){
    const cand = (diag.candidates || []).length
      ? diag.candidates.map(c =>
          '<tr style="border-bottom:1px solid var(--border)">' +
            '<td style="padding:6px 8px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:var(--preset)">' + esc(c.selector) + '</td>' +
            '<td style="padding:6px 8px;text-align:right">' + c.count + '</td>' +
            '<td style="padding:6px 8px;text-align:right">' + c.words + ' ' + esc(t('extractionWordsShort')) + '</td>' +
            '<td style="padding:6px 8px;text-align:right">' + c.imgs + ' ' + esc(t('extractionImgsShort')) + '</td>' +
            '<td style="padding:6px 8px"><button class="il-diag-use" data-sel="' + esc(c.selector) + '" ' +
              'style="padding:3px 8px;border:1px solid var(--btn-border);background:var(--bg);border-radius:4px;cursor:pointer;font-size:11px">' +
              esc(t('extractionUseThis')) + '</button></td>' +
          '</tr>').join('')
      : '<tr><td colspan="5" style="padding:12px;color:var(--muted);font-size:12px;text-align:center">' + esc(t('extractionNoCandidates')) + '</td></tr>';
    const overlays = (diag.overlays || []).length
      ? diag.overlays.map(o => '<code style="font-size:11px;background:var(--quote-bg);padding:2px 6px;border-radius:3px;margin:2px 4px 2px 0;display:inline-block">' +
          esc(o.tag + (o.id ? '#' + o.id : '') + (o.cls ? '.' + o.cls.split(/\s+/)[0] : '')) + ' (z-index: ' + esc(o.zIndex) + ')</code>').join('')
      : '<span style="color:var(--muted);font-size:12px">—</span>';
    const paywall = diag.paywall.detected
      ? '<span style="color:var(--block);font-weight:bold">' + esc(t('extractionPaywallYes')) + '</span>' +
        ' <span style="color:var(--muted);font-size:12px">(' + diag.paywall.indicators.map(esc).join(', ') + ')</span>'
      : '<span style="color:var(--preset);font-weight:bold">' + esc(t('extractionPaywallNo')) + '</span>';
    return (
      '<div style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:16px;background:var(--quote-bg)">' +
        '<h4 style="margin:0 0 10px;font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">' +
          esc(t('extractionDiagnostics')) + '</h4>' +
        '<div style="font-size:13px;line-height:1.9">' +
          '<strong>' + esc(t('extractionTitleLbl')) + ':</strong> ' + esc(diag.title.text) +
            ' <span style="color:var(--muted);font-size:11px">(' + esc(diag.title.source) + ')</span><br>' +
          '<strong>' + esc(t('extractionMetricsLbl')) + ':</strong> ' +
            diag.metrics.p + ' &lt;p&gt; · ' + diag.metrics.img + ' img · ' +
            diag.metrics.words + ' ' + esc(t('extractionWordsShort')) + ' · ' +
            diag.metrics.textLen + ' ' + esc(t('extractionCharsShort')) + '<br>' +
          '<strong>' + esc(t('extractionPaywallLbl')) + ':</strong> ' + paywall + '<br>' +
          '<strong>' + esc(t('extractionOverlaysLbl')) + ':</strong> ' +
            (diag.overlays.length ? diag.overlays.length + ' ' + overlays : '<span style="color:var(--muted);font-size:12px">—</span>') +
        '</div>' +
        '<div style="margin-top:12px">' +
          '<div style="font-size:12px;color:var(--muted);margin-bottom:6px"><strong>' + esc(t('extractionCandidatesLbl')) + '</strong></div>' +
          '<div style="border:1px solid var(--border);border-radius:6px;background:var(--bg);overflow:hidden">' +
            '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
              '<thead><tr style="background:var(--btn-bg);font-size:11px;color:var(--muted)">' +
                '<th style="text-align:left;padding:6px 8px">Selector</th>' +
                '<th style="text-align:right;padding:6px 8px">n</th>' +
                '<th style="text-align:right;padding:6px 8px">' + esc(t('extractionWordsShort')) + '</th>' +
                '<th style="text-align:right;padding:6px 8px">' + esc(t('extractionImgsShort')) + '</th>' +
                '<th></th>' +
              '</tr></thead>' +
              '<tbody>' + cand + '</tbody>' +
            '</table>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  function renderPreviewHTML(){
    const art = runExtractionPreview();
    if (!art){
      return '<div style="border:1px dashed var(--btn-border);border-radius:8px;padding:16px;color:var(--muted);font-size:13px;text-align:center">' +
        esc(t('extractionPreviewEmpty')) + (lastError ? ' · ' + esc(lastError) : '') +
      '</div>';
    }
    const words = countWords(art.rawBody);
    const chars = art.rawBody.length;
    const preview = art.rawBody.slice(0, 800).replace(/\s+/g,' ').trim() + (art.rawBody.length > 800 ? '…' : '');
    return (
      '<div style="border:1px solid var(--border);border-radius:8px;padding:14px;background:var(--bg)">' +
        '<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin-bottom:8px">' +
          '<span><strong>' + esc(t('extractionTitleLbl')) + ':</strong> ' + esc(art.headline || '—') + '</span>' +
          '<span><strong>' + esc(t('extractionMetricsLbl')) + ':</strong> ' + words + ' ' + esc(t('extractionWordsShort')) + ' · ' + chars + ' ' + esc(t('extractionCharsShort')) + '</span>' +
          '<span><strong>' + esc(t('extractionSourcePrefix')) + ':</strong> ' + esc(art._source || '—') + '</span>' +
        '</div>' +
        '<div style="font-size:13px;line-height:1.5;color:var(--fg);max-height:180px;overflow:auto;padding:10px;background:var(--quote-bg);border-radius:6px;white-space:pre-wrap">' +
          esc(preview) +
        '</div>' +
      '</div>'
    );
  }

  function render(){
    const diag = analyzeCurrentPage();
    box.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
        '<div>' +
          '<h2 style="margin:0;font-size:20px">' + esc(t('extractionTitle')) + '</h2>' +
          '<div style="font-size:12px;color:var(--muted);margin-top:2px">' + esc(site.domain) + '</div>' +
        '</div>' +
        '<button class="il-et-close" style="padding:8px 14px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer">' + esc(t('close')) + '</button>' +
      '</div>' +

      '<div style="margin-bottom:16px">' +
        '<label style="display:block;font-size:12px;color:var(--muted);text-transform:uppercase;margin-bottom:6px">' + esc(t('extractionMode')) + '</label>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button class="il-et-mode" data-mode="auto" style="flex:1;min-width:180px;text-align:left;padding:10px 12px;' +
            (work.mode === 'auto' ? 'border:2px solid var(--accent);' : 'border:1px solid var(--btn-border);') +
            'background:var(--bg);border-radius:8px;cursor:pointer">' +
            '<div style="font-weight:bold;font-size:13px">' + esc(t('extractionModeAuto')) + '</div>' +
            '<div style="font-size:11px;color:var(--muted);margin-top:3px">' + esc(t('extractionHintAuto')) + '</div>' +
          '</button>' +
          '<button class="il-et-mode" data-mode="selector" style="flex:1;min-width:180px;text-align:left;padding:10px 12px;' +
            (work.mode === 'selector' ? 'border:2px solid var(--accent);' : 'border:1px solid var(--btn-border);') +
            'background:var(--bg);border-radius:8px;cursor:pointer">' +
            '<div style="font-weight:bold;font-size:13px">' + esc(t('extractionModeSelector')) + '</div>' +
            '<div style="font-size:11px;color:var(--muted);margin-top:3px">' + esc(t('extractionHintSelector')) + '</div>' +
          '</button>' +
          '<button class="il-et-mode" data-mode="all" style="flex:1;min-width:180px;text-align:left;padding:10px 12px;' +
            (work.mode === 'all' ? 'border:2px solid var(--accent);' : 'border:1px solid var(--btn-border);') +
            'background:var(--bg);border-radius:8px;cursor:pointer">' +
            '<div style="font-weight:bold;font-size:13px">' + esc(t('extractionModeAll')) + '</div>' +
            '<div style="font-size:11px;color:var(--muted);margin-top:3px">' + esc(t('extractionHintAll')) + '</div>' +
          '</button>' +
        '</div>' +
      '</div>' +

      (work.mode === 'selector' ?
      '<div style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:16px">' +
        '<div style="margin-bottom:10px">' +
          '<label style="display:block;font-size:12px;color:var(--muted);text-transform:uppercase;margin-bottom:4px">' + esc(t('extractionRoot')) + '</label>' +
          '<div style="display:flex;gap:6px">' +
            '<input class="il-et-root" value="' + esc(work.root) + '" placeholder="' + esc(t('extractionRootPh')) + '" ' +
              'style="flex:1;padding:8px 12px;border:1px solid var(--btn-border);border-radius:6px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px">' +
            '<button class="il-et-pick" style="padding:8px 14px;background:var(--accent);color:var(--on-solid);border:none;border-radius:6px;cursor:pointer;white-space:nowrap">' +
              esc(t('extractionPickBtn')) + '</button>' +
          '</div>' +
        '</div>' +
        '<div style="margin-bottom:10px">' +
          '<label style="display:block;font-size:12px;color:var(--muted);text-transform:uppercase;margin-bottom:4px">' + esc(t('extractionExclude')) + '</label>' +
          '<input class="il-et-exclude" value="' + esc(work.exclude) + '" placeholder="' + esc(t('extractionExcludePh')) + '" ' +
            'style="width:100%;padding:8px 12px;border:1px solid var(--btn-border);border-radius:6px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px">' +
        '</div>' +
        '<div>' +
          '<label style="display:block;font-size:12px;color:var(--muted);text-transform:uppercase;margin-bottom:4px">' + esc(t('extractionMinChars')) + '</label>' +
          '<input type="number" class="il-et-min" value="' + work.minChars + '" min="20" max="10000" ' +
            'style="width:120px;padding:8px 12px;border:1px solid var(--btn-border);border-radius:6px;font-size:13px">' +
        '</div>' +
      '</div>' : '') +

      renderDiagnosticsHTML(diag) +

      '<div style="margin-bottom:10px">' +
        '<div style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">' +
          esc(t('extractionPreviewLbl')) + '</div>' +
        renderPreviewHTML() +
      '</div>' +

      '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:16px;border-top:1px solid var(--border);padding-top:14px">' +
        '<button class="il-et-refresh" style="padding:8px 14px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer">' +
          esc(t('extractionDiagnoseBtn')) + '</button>' +
        '<button class="il-et-test" style="padding:8px 14px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer">' +
          esc(t('extractionTestBtn')) + '</button>' +
        '<button class="il-et-cancel" style="padding:8px 14px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer">' +
          esc(t('extractionCancelBtn')) + '</button>' +
        '<button class="il-et-save" style="padding:8px 14px;background:var(--accent);color:var(--on-solid);border:none;border-radius:6px;cursor:pointer;font-weight:bold">' +
          esc(t('extractionSaveBtn')) + '</button>' +
      '</div>';

    wire();
  }

  function wire(){
    box.querySelector('.il-et-close').onclick = close;
    box.querySelector('.il-et-cancel').onclick = close;

    box.querySelectorAll('.il-et-mode').forEach(b => {
      b.onclick = () => { work.mode = b.dataset.mode; render(); };
    });

    const rootInput = box.querySelector('.il-et-root');
    const excludeInput = box.querySelector('.il-et-exclude');
    const minInput = box.querySelector('.il-et-min');
    if (rootInput) rootInput.oninput = () => { work.root = rootInput.value.trim(); };
    if (excludeInput) excludeInput.oninput = () => { work.exclude = excludeInput.value.trim(); };
    if (minInput) minInput.oninput = () => {
      const v = parseInt(minInput.value, 10);
      if (!isNaN(v) && v > 0) work.minChars = v;
    };

    const pickBtn = box.querySelector('.il-et-pick');
    if (pickBtn) pickBtn.onclick = () => {
      root.style.display = 'none';
      startVisualPicker(
        (sel) => {
          work.root = sel;
          work.mode = 'selector';
          root.style.display = '';
          render();
        },
        () => {
          root.style.display = '';
          render();
        }
      );
    };

    box.querySelectorAll('.il-diag-use').forEach(btn => {
      btn.onclick = () => {
        work.mode = 'selector';
        work.root = btn.dataset.sel;
        render();
      };
    });

    box.querySelector('.il-et-refresh').onclick = () => render();
    box.querySelector('.il-et-test').onclick = () => {
      const art = runExtractionPreview();
      if (!art){
        toast(t('extractionTestFailed'), 2400);
        return;
      }
      close();
      setTimeout(() => openReader(art), 100);
    };
    box.querySelector('.il-et-save').onclick = () => {
      CFG.sites[siteIdx].extraction = {
        mode: work.mode,
        root: work.root,
        exclude: work.exclude,
        minChars: work.minChars
      };
      saveCfg(CFG);
      toast(t('extractionSaved').replace('{X}', site.domain), 2000);
      close();
    };
  }

  render();
}

/* ============================================================
   19. LECTOR
   ============================================================ */
// El lector abierto, si lo hay: el puente lo avisa cuando la configuración
// cambia en otra pestaña (o llega de Voceiro) para que se repinte.
let __lectorAbierto = null;

function openReader(art){
  if (document.getElementById('il-full')) return;

  // let: CFG se sustituye entero cuando cambia en otra pestaña (refrescar).
  let prefs = CFG.prefs;
  const pageLang = detectPageLang();
  const defaultDict = getDefaultDict(pageLang);
  const defaultDictName = defaultDict ? defaultDict.name : '—';

  const rawBody = String(art.rawBody || '')
    .replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const rawHTML = String(art.rawHTML || '');
  const useHTML = !!rawHTML;
  const plainBody = useHTML ? stripTags(rawHTML).replace(/\s+/g,' ').trim() : rawBody;
  if (!plainBody || plainBody.length < 100){ toast(t('noArticle')); return; }

  const headline = art.headline || document.title || '';
  const description = art.description || '';
  const articleSection = art.articleSection || '';
  const autores = art.autores || '';
  let fecha = (art.datePublished || '').slice(0,10);
  if (!fecha){
    const tEl = document.querySelector('time[datetime]');
    if (tEl) fecha = (tEl.getAttribute('datetime') || '').slice(0,10);
  }

  const srcKey = art._source || (rawHTML ? 'readability' : 'jsonld');
  const srcName = srcKey === 'jsonld' ? t('srcJsonld')
                : srcKey === 'mixto' ? t('srcMixto')
                : srcKey === 'custom' ? t('srcCustom')
                : srcKey === 'all' ? t('extractionModeAll')
                : t('srcReadability');
  // Fuera las imágenes repetidas y, si viene del DOM, las promociones del
  // medio al principio y al final («¿Ya nos sigues?», newsletters…).
  let parrafos = art.bloques || (useHTML ? buildBlocksFromHTML(rawHTML) : buildBlocksFromText(rawBody));
  parrafos = sinImagenesRepetidas(parrafos);
  if (srcKey !== 'jsonld') parrafos = sinPromosEnBordes(parrafos, textoDeBloque);
  parrafos = agruparGalerias(parrafos);
  // Las palabras del texto que se ve, no las de lo que se ha quitado.
  const wordsCount = countWords(parrafos.filter(esDeTexto).map(textoDeBloque).join(' '));

  const iu = String(art.image || '');
  const iuHi = iu.replace('_16-9-discover-', '_source-');
  const iuFinal = iuHi !== iu ? iuHi : iu;
  const iuFallback = iuHi !== iu ? iu : '';
  const cap = art.imageCaption || '';
  const auImg = art.imageAuthor || '';
  // La portada repetida como primera imagen del cuerpo sale una sola vez,
  // en el cuerpo y con su pie.
  const imagenesCuerpo = parrafos.flatMap(b => b.tipo === 'galeria' ? b.imagenes : b.tipo === 'img' ? [b] : []);
  const enCuerpo = iu ? imagenesCuerpo.find(b => claveImagen(b.src) === claveImagen(iu)) : null;
  if (enCuerpo && !enCuerpo.caption && cap) enCuerpo.caption = cap;

  function renderBlock(b){
    const process = html => prefs.bionic ? bionicizeHTML(html) : html;
    if (b.tipo === 'img'){
      return '<figure class="il-inline-figure' + (b.caption ? ' il-con-pie' : '') + '"' +
        (b === enCuerpo ? ' id="il-portada"' : '') + '>' +
        '<img src="' + esc(b.src) + '" alt="' + esc(b.alt || '') + '" loading="lazy">' +
        (b.caption ? '<figcaption>' + esc(b.caption) + '</figcaption>' : '') +
      '</figure>';
    }
    if (b.tipo === 'galeria'){
      const n = b.imagenes.length;
      return '<figure class="il-galeria' + (b.imagenes.some(x => x.caption) ? ' il-con-pie' : '') + '">' +
        '<div class="il-galeria-rejilla">' + b.imagenes.map(x =>
          '<img src="' + esc(x.src) + '" alt="' + esc(x.alt || '') + '" loading="lazy"' +
          (x.caption ? ' data-pie="' + esc(x.caption) + '"' : '') + (x === enCuerpo ? ' id="il-portada"' : '') + '>').join('') +
        '</div><figcaption>' + esc(t('galeria').replace('{N}', n)) + ' · ' + esc(t('galeriaPulsa')) + '</figcaption></figure>';
    }
    if (b.tipo === 'embed'){
      // Tarjeta con enlace al original: no se carga nada de terceros.
      const nombre = NOMBRES_REDES[b.red] || b.red;
      const clase = CLASES_EMBEBIDO[b.clase] ? t(CLASES_EMBEBIDO[b.clase]) + ' · ' : '';
      return '<aside class="il-embed" aria-label="' + esc(t('embebidoDe').replace('{X}', nombre)) + '">' +
        '<p class="il-embed-red">' + esc(clase + nombre) + '</p>' +
        (b.texto ? '<p class="il-embed-texto">' + process(esc(b.texto)) + '</p>' : '') +
        '<a href="' + esc(b.url) + '" target="_blank" rel="noopener noreferrer">' + icono('external-link') +
        '<span>' + esc(t('verEn').replace('{X}', nombre)) + '</span></a></aside>';
    }
    if (b.tipo === 'tabla'){
      // Con scroll propio en pantallas estrechas; tabindex para moverla con
      // el teclado.
      return '<div class="il-tabla" role="region" tabindex="0" aria-label="' + esc(b.caption || t('tabla')) + '">' +
        process(b.html || '') + '</div>';
    }
    if (b.tipo === 'q') return '<blockquote>' + process(b.html || '') + '</blockquote>';
    if (b.tipo === 'h') return '<h' + b.level + '>' + process(b.html || '') + '</h' + b.level + '>';
    if (b.tipo === 'hr') return '<hr>';
    if (b.tipo === 'pre') return '<pre>' + (b.html || '') + '</pre>';
    if (b.tipo === 'list'){
      const tag = b.ordered ? 'ol' : 'ul';
      return '<' + tag + '>' + b.items.map(i => '<li>' + process(i) + '</li>').join('') + '</' + tag + '>';
    }
    return '<p>' + process(b.html || '') + '</p>';
  }
  function renderBody(){ return parrafos.map(renderBlock).join(''); }

  function buildText(){
    const lines = parrafos.map(b => {
      if (b.tipo === 'hr') return '---';
      if (b.tipo === 'img') return '[' + t('imageLabel') + (b.caption ? ': ' + b.caption : '') + ']';
      if (b.tipo === 'galeria') return '[' + t('galeria').replace('{N}', b.imagenes.length) + ']';
      if (b.tipo === 'embed') return '[' + (CLASES_EMBEBIDO[b.clase] ? t(CLASES_EMBEBIDO[b.clase]) + ' · ' : '') +
        (NOMBRES_REDES[b.red] || b.red) + (b.texto ? ': ' + b.texto : '') + ' — ' + b.url + ']';
      if (b.tipo === 'tabla') return textoDeTabla(b);
      if (b.tipo === 'list') return b.items.map(i => '- ' + stripTags(i)).join('\n');
      if (b.tipo === 'h') return stripTags(b.html || '');
      if (b.tipo === 'q') return '> ' + stripTags(b.html || '');
      if (b.tipo === 'pre') return stripTags(b.html || '');
      return stripTags(b.html || '');
    }).join('\n\n');
    return headline + '\n\n' +
      (description ? description + '\n\n' : '') +
      (fecha ? fecha + ' · ' : '') + articleSection +
      (autores ? ' · ' + autores : '') + '\n\n' +
      lines + '\n\nURL: ' + location.href;
  }

  // «Abrir en…»: los servicios que haya configurado cada persona.
  const servicios = serviciosConfigurados();

  // Una opción del panel Apariencia: radio o casilla nativos (teclado y
  // lectores de pantalla de serie) con su texto; el ✓ dice cuál está
  // elegida, no solo el color.
  function opcion(tipo, nombre, valor, texto, muestra){
    const p = muestra ? (typeof muestra === 'object' ? muestra : (PALETA[muestra] || {})) : null;
    return '<label class="il-opcion' + (p ? ' il-muestra' : '') + '"' +
      (p ? ' style="' + esc('--muestra-bg:' + p.bg + ';--muestra-fg:' + p.fg + ';--muestra-borde:' + p['btn-border']) + '"' : '') + '>' +
      '<input type="' + tipo + '" name="' + nombre + '" value="' + esc(valor) + '">' +
      '<span>' + esc(texto) + '</span></label>';
  }
  function muestraPersonalizada(){
    const c = limpiarColores(prefs.colores) || coloresDelTema(prefs.theme) || {};
    return { bg: c.fondo, fg: c.texto, 'btn-border': c.texto };
  }
  function colorHTML(clave, etiqueta){
    return '<div class="il-color"><input type="color" id="il-color-' + clave + '" data-color="' + clave + '">' +
      '<label for="il-color-' + clave + '">' + esc(etiqueta) + '</label>' +
      (clave === 'fondo' ? '' : '<span class="il-cr" data-cr="' + clave + '"></span>') + '</div>';
  }
  function paso(clase, etiqueta, menos, mas){
    return '<div class="il-paso" role="group" aria-labelledby="il-paso-' + clase + '">' +
      '<span class="il-paso-etq" id="il-paso-' + clase + '">' + esc(etiqueta) + '</span>' +
      '<button type="button" class="il-' + clase + '-minus" aria-label="' + esc(menos) + '">' + icono('minus') + '</button>' +
      '<output class="il-' + clase + '-val" aria-live="polite"></output>' +
      '<button type="button" class="il-' + clase + '-plus" aria-label="' + esc(mas) + '">' + icono('plus') + '</button>' +
    '</div>';
  }
  const panelAa =
    '<div id="il-panel-aa" class="il-panel" role="dialog" aria-label="' + esc(t('apariencia')) + '" hidden>' +
      '<fieldset><legend>' + esc(t('theme')) + '</legend>' +
        opcion('radio', 'il-tema', 'light', t('light'), 'light') +
        opcion('radio', 'il-tema', 'sepia', t('sepia'), 'sepia') +
        opcion('radio', 'il-tema', 'dark', t('dark'), 'dark') +
        opcion('radio', 'il-tema', 'contrast', t('contrast'), 'contrast') +
        opcion('radio', 'il-tema', 'custom', t('personalizado'), muestraPersonalizada()) +
      '</fieldset>' +
      // Tema personalizado: cuatro colores (shared/tema/personalizado.js saca
      // el resto) y el contraste de cada uno con el fondo.
      '<fieldset class="il-colores" hidden><legend>' + esc(t('personalizado')) + '</legend>' +
        colorHTML('fondo', t('colorFondo')) + colorHTML('texto', t('colorTexto')) +
        colorHTML('enlaces', t('colorEnlaces')) + colorHTML('titulos', t('colorTitulos')) +
      '</fieldset>' +
      '<fieldset><legend>' + esc(t('font')) + '</legend>' +
        opcion('radio', 'il-letra', 'georgia', t('serif')) +
        opcion('radio', 'il-letra', 'sans', t('sans')) +
        opcion('radio', 'il-letra', 'dyslexic', t('dyslexic')) +
      '</fieldset>' +
      paso('fs', t('size'), t('letraMenor'), t('letraMayor')) +
      paso('w', t('width'), t('masEstrecho'), t('masAncho')) +
      '<fieldset><legend>' + esc(t('extra')) + '</legend>' +
        opcion('checkbox', 'il-pref', 'just', t('justify')) +
        opcion('checkbox', 'il-pref', 'bionic', t('bionic')) +
        opcion('checkbox', 'il-pref', 'focus', t('focus')) +
      '</fieldset>' +
      '<fieldset><legend>' + esc(t('imgMedio')) + '</legend>' +
        opcion('radio', 'il-img-medio', '', t('imgComoSiempre')) +
        opcion('radio', 'il-img-medio', 'todas', t('imgTodas')) +
        opcion('radio', 'il-img-medio', 'conPie', t('imgConPie')) +
        opcion('radio', 'il-img-medio', 'ninguna', t('imgNinguna')) +
      '</fieldset>' +
      '<fieldset><legend>' + esc(t('source')) + '</legend>' +
        opcion('radio', 'il-origen', 'auto', t('srcAuto')) +
        opcion('radio', 'il-origen', 'jsonld', t('srcJsonld')) +
        opcion('radio', 'il-origen', 'readability', t('srcReadability')) +
      '</fieldset>' +
    '</div>';

  function itemMenu(clase, ico, texto){
    return '<button type="button" role="menuitem" tabindex="-1" class="' + clase + '">' +
      ico + '<span>' + esc(texto) + '</span></button>';
  }
  const menuMasHTML =
    '<div id="il-menu-mas" class="il-menu" role="menu" aria-label="' + esc(t('masAcciones')) + '" hidden>' +
      (servicios.length
        ? '<div role="group" aria-label="' + esc(t('abrirEn')) + '">' +
            '<div class="il-menu-grupo" aria-hidden="true">' + esc(t('abrirEn')) + '</div>' +
            servicios.map(svc =>
              '<button type="button" role="menuitem" tabindex="-1" class="il-servicio" data-servicio="' + esc(svc.id) + '">' +
                icono('external-link') + '<span>' + esc(svc.nombre) + '</span></button>').join('') +
          '</div><div role="separator"></div>'
        : '') +
      itemMenu('il-copytxt', icono('copy'), sinSimbolo(t('copyText'))) +
      itemMenu('il-rsvp-menu', icono('zap'), sinSimbolo(t('teleprompter'))) +
      itemMenu('il-print', icono('printer'), sinSimbolo(t('print'))) +
      itemMenu('il-mail', icono('mail'), sinSimbolo(t('email'))) +
      itemMenu('il-share', icono('share-2'), sinSimbolo(t('share'))) +
      '<div role="separator"></div>' +
      itemMenu('il-ignore-section', icono('ban'), sinSimbolo(t('ignoreSection'))) +
      itemMenu('il-settings-btn', icono('settings'), sinSimbolo(t('settingsShort'))) +
    '</div>';

  const progressHTML =
    '<div class="il-progress" aria-hidden="true"><div class="il-progress-bar"></div></div>';

  // Barra: volver a Voceiro (cierra la pestaña) · Apariencia · Pendientes ·
  // Más · Salir del lector. En pantallas estrechas solo se ven los iconos;
  // los textos siguen ahí para los lectores de pantalla.
  const toolbarHTML =
    progressHTML +
    '<div class="il-topbar">' +
      '<div class="il-nav-row">' +
        '<button type="button" class="il-voceiro-btn" aria-label="' + esc(t('volverVoceiro')) + '">' +
          icono('arrow-left') + '<span class="il-lbl">Voceiro</span></button>' +
        '<span class="il-nav-espacio"></span>' +
        '<button type="button" class="il-aa-btn" aria-expanded="false" aria-controls="il-panel-aa">' +
          icono('a-large-small') + '<span class="il-lbl">' + esc(t('apariencia')) + '</span></button>' +
        '<button type="button" class="il-pendientes-btn">' +
          icono('library') + '<span class="il-lbl">' + esc(t('pendientesShort')) + '</span></button>' +
        '<button type="button" class="il-mas-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="il-menu-mas" aria-label="' + esc(t('masAcciones')) + '">' +
          icono('ellipsis') + '<span class="il-lbl">' + esc(t('mas')) + '</span></button>' +
        '<button type="button" class="il-close">' +
          icono('x') + '<span class="il-lbl">' + esc(sinSimbolo(t('close'))) + '</span></button>' +
      '</div>' +
      panelAa + menuMasHTML +
    '</div>';

  const figura = iuFinal && !enCuerpo
    ? '<figure class="il-figure' + (cap || auImg ? ' il-con-pie' : '') + '"><img src="' + esc(iuFinal) + '"' +
      (iuFallback ? ' data-fallback="' + esc(iuFallback) + '"' : '') +
      ' alt="' + esc(headline) + '" loading="lazy"><figcaption>' +
      esc(cap) + (auImg ? (cap ? ' — ' : '') + esc(auImg) : '') +
      '</figcaption></figure>'
    : '';

  const sourceBadge =
    '<span class="il-source-badge"> · ' + esc(t('sourceLabel')) + ': ' +
    esc(srcName) + ' · ' + wordsCount + ' ' + esc(t('words')) + '</span>';

  const metaActions =
    '<div class="il-meta-actions">' +
      '<button type="button" class="il-save-meta"></button>' +
      '<button type="button" class="il-img-meta"></button>' +
      '<button type="button" class="il-rsvp-meta">' + icono('zap') + '<span>' + esc(sinSimbolo(t('teleprompter'))) + '</span></button>' +
    '</div>';

  const contentHTML =
    '<div class="il-wrap"><div class="il-content" lang="' + esc(pageLang) + '">' +
      // La portada que se repite en el cuerpo: miniatura que lleva hasta ella.
      (enCuerpo && iuFinal ? '<button type="button" class="il-miniatura' + (enCuerpo.caption ? ' il-con-pie' : '') + '"' +
        ' aria-label="' + esc(t('verPortada')) + '"><img src="' + esc(iuFinal) + '"' +
        (iuFallback ? ' data-fallback="' + esc(iuFallback) + '"' : '') + ' alt=""></button>' : '') +
      '<h1 id="il-titulo" tabindex="-1">' + esc(headline) + '</h1>' +
      (description ? '<p class="il-desc">' + esc(description) + '</p>' : '') +
      '<div class="il-meta">' + esc(fecha) +
        (articleSection ? ' · ' + esc(articleSection) : '') +
        (autores ? ' · ' + esc(autores) : '') +
      '</div>' +
      metaActions +
      figura +
      '<div class="il-body">' + renderBody() + '</div>' +
      // Final: volver a Voceiro (marcándola leída), la siguiente pendiente,
      // guardarla para luego o subir. Al llegar aquí se marca leída sola.
      '<section class="il-fin">' +
        '<div class="il-fin-acciones">' +
          '<button type="button" class="il-fin-volver il-primary">' + esc(t('finVolver')) + '</button>' +
          '<button type="button" class="il-fin-siguiente" hidden>' +
            '<span>' + esc(t('finSiguiente')) + '</span><span class="il-fin-sig-titulo"></span>' +
          '</button>' +
          '<button type="button" class="il-fin-guardar"></button>' +
          '<button type="button" class="il-fin-arriba">' + esc(t('up')) + '</button>' +
        '</div>' +
        '<p class="il-fin-estado" role="status" aria-live="polite"></p>' +
      '</section>' +
      '<div class="il-footer">' +
        '<button class="il-dict-hint">' + esc(t('raeHint')) + ' ' + esc(defaultDictName) + '</button>' +
        sourceBadge +
      '</div>' +
    '</div></div>';

  const ambi = iuFinal ? '<img id="il-ambi-img" src="' + esc(iuFinal) + '"' +
    (iuFallback ? ' data-fallback="' + esc(iuFallback) + '"' : '') + ' alt="">' : '';

  const full = '<div id="il-full" role="dialog" aria-modal="true" aria-labelledby="il-titulo"' +
    ' data-theme="' + esc(prefs.theme) + '" data-font="' + esc(prefs.font) +
    '" data-just="' + (prefs.just ? '1' : '0') + '">' +
    '<style>' + buildReaderCSS() + '</style>' + ambi +
    '<div style="position:relative;z-index:1">' + toolbarHTML + contentHTML + '</div>' +
    '<button type="button" class="il-top-btn" aria-label="' + esc(sinSimbolo(t('up'))) + '">' + icono('arrow-up') + '</button>' +
    '</div>';

  // Lo que tenía el foco (el botón del lector, normalmente) lo recupera al
  // salir. La página de debajo queda tapada e inerte mientras (25).
  const focoAntes = document.activeElement;
  document.body.insertAdjacentHTML('beforeend', full);
  const ov = document.getElementById('il-full');
  const pagina = taparPagina(ov);

  // Imágenes: lo del medio, si tiene; si no, lo de todos los medios.
  function imagenesDelMedio(){
    const rule = findSiteRule();
    return rule && IMAGENES.includes(rule.imagenes) ? rule.imagenes : '';
  }
  function imagenesEfectivas(){
    return imagenesDelMedio() || (IMAGENES.includes(prefs.imagenes) ? prefs.imagenes : 'todas');
  }
  // Escritos tal cual: build.mjs solo mete los iconos que ve como icono('…').
  const ICONO_IMAGENES = { todas: icono('image'), conPie: icono('captions'), ninguna: icono('image-off') };
  const TEXTO_IMAGENES = { todas: 'imgTodas', conPie: 'imgConPie', ninguna: 'imgNinguna' };
  const siguienteImagenes = v => IMAGENES[(IMAGENES.indexOf(v) + 1) % IMAGENES.length];
  function pintarImagenes(){
    const v = imagenesEfectivas();
    const delMedio = imagenesDelMedio();
    ov.setAttribute('data-imagenes', v);
    const b = ov.querySelector('.il-img-meta');
    b.innerHTML = ICONO_IMAGENES[v] + '<span>' + esc(t(TEXTO_IMAGENES[v])) + '</span>';
    b.setAttribute('aria-label', t(TEXTO_IMAGENES[v]) + (delMedio ? ' (' + t('imgEnEsteMedio') + ')' : '') +
      '. ' + t('imgCambiarA') + ': ' + t(TEXTO_IMAGENES[siguienteImagenes(v)]));
    ov.querySelectorAll('input[name="il-img-medio"]').forEach(r => { r.checked = r.value === delMedio; });
  }
  // El botón y la tecla pasan al siguiente estado: el del medio si tiene
  // uno propio; si no, el de todos los medios.
  function cambiarImagenes(){
    const sig = siguienteImagenes(imagenesEfectivas());
    const delMedio = !!imagenesDelMedio();
    if (delMedio) findSiteRule().imagenes = sig; else prefs.imagenes = sig;
    applyPrefs();
    toast(t(TEXTO_IMAGENES[sig]) + (delMedio ? ' · ' + t('imgEnEsteMedio') : ''), 1400);
  }

  // Pinta las preferencias; applyPrefs, además, las guarda.
  function pintarPrefs(){
    aplicarTema(ov);
    ov.setAttribute('data-font', prefs.font);
    ov.setAttribute('data-just', prefs.just ? '1' : '0');
    ov.style.setProperty('--w', prefs.width + 'px');
    ov.style.setProperty('--fs', prefs.fs + 'px');
    ov.style.setProperty('--lh', prefs.lh);
    ov.classList.toggle('il-focus', prefs.focus);
    pintarImagenes();

    ov.querySelector('.il-fs-val').textContent = prefs.fs;
    ov.querySelector('.il-w-val').textContent = prefs.width;
    const marcar = (nombre, valor) =>
      ov.querySelectorAll('input[name="' + nombre + '"]').forEach(r => { r.checked = r.value === valor; });
    marcar('il-tema', prefs.theme);
    marcar('il-letra', prefs.font);
    marcar('il-origen', currentReaderSource());
    ov.querySelectorAll('input[name="il-pref"]').forEach(c => { c.checked = !!prefs[c.value]; });
    pintarColores();
    if (prefs.focus) setTimeout(updateFocus, 60);
  }
  function applyPrefs(){
    pintarPrefs();
    saveCfg(CFG);
  }

  // Editor del tema personalizado: se ve con ese tema y dice el contraste de
  // cada color con el fondo (aviso si baja de 4,5:1).
  function pintarColores(){
    const caja = ov.querySelector('.il-colores');
    const colores = prefs.theme === 'custom' ? limpiarColores(prefs.colores) : null;
    caja.hidden = !colores;
    const m = muestraPersonalizada();
    const lbl = ov.querySelector('input[name="il-tema"][value="custom"]').closest('.il-opcion');
    lbl.style.setProperty('--muestra-bg', m.bg);
    lbl.style.setProperty('--muestra-fg', m.fg);
    lbl.style.setProperty('--muestra-borde', m['btn-border']);
    if (!colores) return;
    CLAVES_COLORES.forEach(k => { const inp = ov.querySelector('#il-color-' + k); if (inp.value !== colores[k]) inp.value = colores[k]; });
    caja.querySelectorAll('.il-cr').forEach(sp => {
      const r = contraste(colores[sp.dataset.cr], colores.fondo);
      sp.classList.toggle('il-poco', r < 4.5);
      sp.textContent = r.toLocaleString(CFG.lang, { maximumFractionDigits: 1 }) + ':1' +
        (r < 4.5 ? ' · ⚠ ' + t('pocoContraste') : ' ✓');
    });
  }

  // La configuración ha cambiado fuera (otra pestaña, Voceiro): se toma la
  // nueva y se repinta, sin guardar (guardar aquí la volvería a mandar).
  function refrescar(){
    if (document.getElementById('il-full') !== ov){ __lectorAbierto = null; return; }
    const bionicAntes = !!prefs.bionic;
    prefs = CFG.prefs;
    if (!!prefs.bionic !== bionicAntes){
      ov.querySelector('.il-body').innerHTML = renderBody();
      wireImages();
    }
    pintarPrefs();
    pintarBotonGuardar();
    pintarSiguiente();
  }

  function saveScroll(){
    try {
      const s = JSON.parse(localStorage.getItem(SCROLL_KEY) || '{}');
      s[location.href] = ov.scrollTop;
      const ks = Object.keys(s);
      if (ks.length > 50) for (let i = 0; i < ks.length - 50; i++) delete s[ks[i]];
      localStorage.setItem(SCROLL_KEY, JSON.stringify(s));
    } catch(e){}
  }
  function updateFocus(){
    if (!prefs.focus) return;
    const els = ov.querySelectorAll('.il-body>*');
    if (!els.length) return;
    const mid = window.innerHeight / 2;
    let best = null, bd = Infinity;
    els.forEach(el => {
      const r = el.getBoundingClientRect();
      const d = Math.abs((r.top + r.bottom) / 2 - mid);
      if (d < bd){ bd = d; best = el; }
    });
    els.forEach(el => el.classList.toggle('il-active', el === best));
  }

  // Visor: la imagen en grande, con su pie, y ← → para recorrer todas las
  // que se ven en el artículo (sueltas y de galerías).
  function pieDe(im){
    if (im.hasAttribute('data-pie')) return im.getAttribute('data-pie');
    const fc = im.closest('figure') && im.closest('figure').querySelector('figcaption');
    return fc && !im.closest('.il-galeria') ? (fc.textContent || '').trim() : '';
  }
  function abrirVisor(desde){
    const lista = [...ov.querySelectorAll('.il-figure img, .il-inline-figure img, .il-galeria img')]
      .filter(x => x.getClientRects().length && x.style.display !== 'none');
    let i = Math.max(0, lista.indexOf(desde));
    const lb = document.createElement('div');
    lb.className = 'il-visor';
    lb.tabIndex = -1;
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    const varias = lista.length > 1;
    lb.innerHTML =
      '<img class="il-visor-img" alt="">' +
      '<p class="il-visor-pie" aria-live="polite"></p>' +
      '<button type="button" class="il-visor-cerrar" aria-label="' + esc(sinSimbolo(t('close'))) + '">' + icono('x') + '</button>' +
      (varias ? '<button type="button" class="il-visor-ant" aria-label="' + esc(t('visorAnterior')) + '">' + icono('chevron-left') + '</button>' +
                '<button type="button" class="il-visor-sig" aria-label="' + esc(t('visorSiguiente')) + '">' + icono('chevron-right') + '</button>' : '');
    const big = lb.querySelector('.il-visor-img');
    const pie = lb.querySelector('.il-visor-pie');
    function mostrar(n){
      i = (n + lista.length) % lista.length;
      const x = lista[i];
      big.src = x.currentSrc || x.src;
      big.alt = x.alt || '';
      const texto = pieDe(x);
      pie.textContent = (varias ? (i + 1) + ' / ' + lista.length + (texto ? ' · ' : '') : '') + texto;
      lb.setAttribute('aria-label', x.alt || texto || t('ampliarImagen'));
    }
    const cerrar = () => { lb.remove(); (lista[i] || desde).focus(); };
    lb.onclick = e => { if (e.target === lb || e.target === big) cerrar(); };
    lb.querySelector('.il-visor-cerrar').onclick = cerrar;
    if (varias){
      lb.querySelector('.il-visor-ant').onclick = () => mostrar(i - 1);
      lb.querySelector('.il-visor-sig').onclick = () => mostrar(i + 1);
    }
    lb.onkeydown = e => {
      if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); cerrar(); }
      else if (varias && e.key === 'ArrowLeft'){ e.preventDefault(); e.stopPropagation(); mostrar(i - 1); }
      else if (varias && e.key === 'ArrowRight'){ e.preventDefault(); e.stopPropagation(); mostrar(i + 1); }
    };
    mostrar(i);
    ov.appendChild(lb);
    lb.focus();
  }

  function wireImages(){
    ov.querySelectorAll('.il-figure img, .il-inline-figure img, .il-galeria img, #il-ambi-img').forEach(im => {
      if (im.dataset.ilWired === '1') return;
      im.dataset.ilWired = '1';
      im.addEventListener('error', function(){
        const fb = this.getAttribute('data-fallback');
        if (fb && this.src !== fb){ this.removeAttribute('data-fallback'); this.src = fb; }
        else this.style.display = 'none';
      });
      if (im.closest('.il-figure') || im.closest('.il-inline-figure') || im.closest('.il-galeria')){
        const alt = im.getAttribute('alt') || '';
        im.tabIndex = 0;
        im.setAttribute('role', 'button');
        im.setAttribute('aria-label', (alt ? alt + ' — ' : '') + t('ampliarImagen'));
        const ampliar = () => abrirVisor(im);
        im.addEventListener('click', ampliar);
        im.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); ampliar(); }
        });
      }
    });
  }

  pintarPrefs();
  wireImages();
  // El foco entra en el lector por el título: el lector de pantalla lo lee
  // y el teclado empieza aquí.
  try { ov.querySelector('#il-titulo').focus({ preventScroll: true }); } catch(e){}



  const topBtn = ov.querySelector('.il-top-btn');
  topBtn.onclick = () => ov.scrollTo({ top: 0, behavior: desplazar() });

  let stm, focusTimer = null, lastScroll = 0;
  const topbarEl = ov.querySelector('.il-topbar');
  ov.addEventListener('scroll', () => {
    const st = Math.max(0, ov.scrollTop);
    const sh = ov.scrollHeight - ov.clientHeight;
    ov.querySelector('.il-progress-bar').style.width = (sh > 0 ? st / sh * 100 : 0) + '%';
    topBtn.classList.toggle('il-show', st > 400);
    if (st > lastScroll && st > 80) topbarEl.classList.add('il-hidden');
    else topbarEl.classList.remove('il-hidden');
    lastScroll = st;
    if (prefs.focus && !focusTimer){
      focusTimer = setTimeout(() => { updateFocus(); focusTimer = null; }, 100);
    }
    clearTimeout(stm); stm = setTimeout(saveScroll, 400);
  }, { passive: true });

  setTimeout(() => {
    try {
      const s = JSON.parse(localStorage.getItem(SCROLL_KEY) || '{}');
      if (s[location.href] && s[location.href] > 50) ov.scrollTop = s[location.href];
    } catch(e){}
  }, 350);

  function closeOverlay(){
    saveScroll();
    document.removeEventListener('keydown', keyHandler);
    if (finObservador) finObservador.disconnect();
    __lectorAbierto = null;
    pagina.fin();
    ov.remove();
    if (focoAntes && focoAntes.isConnected){
      if (focoAntes.__enfocar) focoAntes.__enfocar();
      else if (focoAntes.focus) focoAntes.focus();
    }
    setTimeout(() => actualizarBoton(), 100);
  }

  // ── Apariencia y Más: uno abierto a la vez. Esc o pulsar fuera los
  // cierra y, con Esc, el foco vuelve a su botón. ──
  const desplegables = [
    { boton: ov.querySelector('.il-aa-btn'), caja: ov.querySelector('#il-panel-aa') },
    { boton: ov.querySelector('.il-mas-btn'), caja: ov.querySelector('#il-menu-mas'), menu: true },
  ];
  const desplegableAbierto = () => desplegables.find(d => !d.caja.hidden) || null;
  function cerrarDesplegable(devolverFoco){
    const d = desplegableAbierto();
    if (!d) return false;
    d.caja.hidden = true;
    d.boton.setAttribute('aria-expanded', 'false');
    ov.classList.remove('il-desplegado');
    if (devolverFoco) d.boton.focus();
    return true;
  }
  function abrirDesplegable(d){
    cerrarDesplegable(false);
    d.caja.hidden = false;
    d.boton.setAttribute('aria-expanded', 'true');
    ov.classList.add('il-desplegado');
    const primero = d.menu
      ? d.caja.querySelector('[role="menuitem"]')
      : (d.caja.querySelector('input:checked') || d.caja.querySelector('input, button'));
    if (primero) primero.focus();
  }
  desplegables.forEach(d => {
    d.boton.onclick = e => {
      e.stopPropagation();
      if (d.caja.hidden) abrirDesplegable(d);
      else cerrarDesplegable(true);
    };
  });
  ov.addEventListener('pointerdown', e => {
    const d = desplegableAbierto();
    if (d && !d.caja.contains(e.target) && !d.boton.contains(e.target)) cerrarDesplegable(false);
  });
  // Menú: flechas, Inicio y Fin para moverse; Tab lo cierra; elegir, también.
  const menuMas = ov.querySelector('#il-menu-mas');
  menuMas.addEventListener('keydown', e => {
    const items = [...menuMas.querySelectorAll('[role="menuitem"]')];
    const i = items.indexOf(document.activeElement);
    let j = null;
    if (e.key === 'ArrowDown') j = (i + 1) % items.length;
    else if (e.key === 'ArrowUp') j = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = items.length - 1;
    else if (e.key === 'Tab'){ cerrarDesplegable(false); return; }
    if (j === null) return;
    e.preventDefault();
    items[j].focus();
  });
  menuMas.addEventListener('click', e => {
    if (e.target.closest('[role="menuitem"]')) cerrarDesplegable(false);
  });

  ov.querySelectorAll('.il-close').forEach(b => b.onclick = closeOverlay);
  // Cerrar la pestaña y que quede delante Voceiro (VOLVER_KEY: la pestaña de
  // Voceiro se pone delante al enterarse). Si el navegador no deja cerrarla:
  // si ya estás en Voceiro, se sale del lector sin más; si no, esta misma
  // pestaña va a Voceiro.
  function volverAVoceiro(){
    saveScroll();
    PLATAFORMA.guardar(VOLVER_KEY, Date.now());
    // Un respiro para que lo guardado llegue al gestor antes de cerrar.
    setTimeout(() => PLATAFORMA.cerrarPestana(), 120);
    setTimeout(() => {
      if (document.visibilityState === 'hidden') closeOverlay();
      else location.href = VOCEIRO_URL;
    }, 600);
  }
  ov.querySelector('.il-voceiro-btn').onclick = volverAVoceiro;
  ov.querySelector('.il-settings-btn').onclick = (e) => { e.stopPropagation(); openSettings('sites'); };
  ov.querySelector('.il-pendientes-btn').onclick = (e) => { e.stopPropagation(); openSettings('pendientes'); };

  function copyText(txt){
    const done = () => toast('✓ ' + t('copied'), 1500);
    const fb = () => {
      const ta = document.createElement('textarea');
      ta.id = 'il-copia';   // con id il-…: la página tapada no lo tapa
      ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch(e){ toast(t('copyFailed')); }
      ta.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fb);
    else fb();
  }
  ov.querySelector('.il-copytxt').onclick = () => copyText(buildText());
  ov.querySelector('.il-print').onclick = () => window.print();
  ov.querySelector('.il-fin-arriba').onclick = () => ov.scrollTo({ top: 0, behavior: desplazar() });
  ov.querySelector('.il-mail').onclick = () => {
    const txt = buildText();
    const subj = encodeURIComponent(headline || t('news'));
    if (txt.length > 1800){
      if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(()=>{});
      toast(t('articleCopied'));
      window.location.href = 'mailto:?subject=' + subj;
    } else {
      window.location.href = 'mailto:?subject=' + subj + '&body=' + encodeURIComponent(txt);
    }
  };
  ov.querySelector('.il-share').onclick = () => {
    if (navigator.share){
      navigator.share({ title: headline || document.title, text: description || '', url: location.href }).catch(()=>{});
    } else if (navigator.clipboard){
      navigator.clipboard.writeText(location.href).then(() => toast(t('urlCopied')));
    }
  };
  ov.querySelectorAll('.il-servicio').forEach(btn => {
    const svc = servicios.find(s => s.id === btn.getAttribute('data-servicio'));
    if (svc) btn.onclick = () => abrirEnServicio(svc);
  });

  ov.querySelector('.il-ignore-section').onclick = () => { ignoreCurrentSection(); };
  ov.querySelector('.il-rsvp-meta').onclick = () => openRSVP(ov, rawBody);
  ov.querySelector('.il-rsvp-menu').onclick = () => openRSVP(ov, rawBody);
  ov.querySelector('.il-dict-hint').onclick = () => { openSettings('dict'); };

  ov.querySelectorAll('input[name="il-tema"]').forEach(r =>
    r.onchange = () => {
      if (r.value === 'custom' && !limpiarColores(prefs.colores)) prefs.colores = coloresDelTema(prefs.theme);
      prefs.theme = r.value;
      applyPrefs();
    });
  // Al mover un color se ve al momento; al soltarlo se guarda (y viaja).
  ov.querySelectorAll('.il-colores input[type="color"]').forEach(inp => {
    inp.oninput = () => {
      prefs.colores = limpiarColores({ ...(limpiarColores(prefs.colores) || coloresDelTema('light')), [inp.dataset.color]: inp.value });
      pintarPrefs();
    };
    inp.onchange = () => applyPrefs();
  });
  ov.querySelectorAll('input[name="il-letra"]').forEach(r =>
    r.onchange = () => { prefs.font = r.value; applyPrefs(); });
  ov.querySelector('.il-fs-minus').onclick = () => { prefs.fs = Math.max(UI.fsMin, prefs.fs - 1); applyPrefs(); };
  ov.querySelector('.il-fs-plus').onclick  = () => { prefs.fs = Math.min(UI.fsMax, prefs.fs + 1); applyPrefs(); };
  ov.querySelector('.il-w-minus').onclick  = () => { prefs.width = Math.max(UI.wMin, prefs.width - UI.wStep); applyPrefs(); };
  ov.querySelector('.il-w-plus').onclick   = () => { prefs.width = Math.min(UI.wMax, prefs.width + UI.wStep); applyPrefs(); };
  ov.querySelectorAll('input[name="il-pref"]').forEach(c => c.onchange = () => {
    const p = c.value;
    prefs[p] = c.checked;
    if (p === 'bionic'){
      ov.querySelector('.il-body').innerHTML = renderBody();
      wireImages();
    }
    applyPrefs();
  });

  // Imágenes en este medio: '' quita lo del medio y vale lo de todos.
  ov.querySelectorAll('input[name="il-img-medio"]').forEach(r => r.onchange = () => {
    if (r.value) ensureSiteRule().imagenes = r.value;
    else { const rule = findSiteRule(); if (rule) delete rule.imagenes; }
    applyPrefs();
  });
  ov.querySelector('.il-img-meta').onclick = cambiarImagenes;
  const miniatura = ov.querySelector('.il-miniatura');
  if (miniatura) miniatura.onclick = () => {
    const fig = ov.querySelector('#il-portada');
    if (!fig) return;
    fig.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const im = fig.tagName === 'IMG' ? fig : fig.querySelector('img');
    if (im) im.focus({ preventScroll: true });
  };

  ov.querySelectorAll('input[name="il-origen"]').forEach(r => r.onchange = async () => {
    const v = r.value;
    if (!READER_SOURCES.includes(v)) return;
    if (v === currentReaderSource()) return;
    const labels = { auto: t('srcAuto'), jsonld: t('srcJsonld'), readability: t('srcReadability'), custom: t('srcCustom') };
    const srcLabel = labels[v] || v;
    const domain = normalizeDomain(location.hostname);
    const rule = findSiteRule();
    if (!rule){
      if (v === 'auto'){
        __sessionSourceOverride = null;
        closeOverlay();
        setTimeout(() => activateReader(), 150);
        return;
      }
      const choice = await showAddSiteDialog(domain, srcLabel, ov);
      if (choice === 'cancel'){ pintarPrefs(); return; }
      if (choice === 'add'){
        setReaderSourceForCurrentSite(v);
        toast(t('siteAddedToast').replace('{X}', domain).replace('{Y}', srcLabel), 6000,
          { label: t('btnUndo'), onClick: () => {
            if (removeSiteRule(domain)) toast(t('siteRemovedToast').replace('{X}', domain), 1800);
          } });
      } else {
        __sessionSourceOverride = v;
        toast(t('sessionOnlyToast').replace('{Y}', srcLabel), 1800);
      }
      closeOverlay();
      setTimeout(() => activateReader(), 150);
      return;
    }
    setReaderSourceForCurrentSite(v);
    toast(t('srcSiteSaved').replace('{X}', srcLabel), 1200);
    closeOverlay();
    setTimeout(() => activateReader(), 150);
  });

  ov.querySelector('.il-body').addEventListener('dblclick', e => {
    if (e.target && e.target.closest && e.target.closest('a')) return;
    const sel = window.getSelection();
    let w = (sel ? sel.toString() : '').trim();
    w = w.replace(/^[¿¡«"']+|[.!?,\-:;»"']+$/g, '');
    if (!w || w.length > 40 || /\s/.test(w)) return;
    if (CFG.dict.mode === 'popup'){ showDictPopup(w, ov); }
    else { openDictionary(defaultDict, w); }
  });
  // Sin guardar → neutro; pendiente → color de guardar; leída → verde
  // (se puede devolver a pendientes). Colores del tema, con su contraste.
  // Hay dos: arriba, junto al título, y en el final.
  function pintarBotonGuardar(){
    const ex = findLaterItem(location.href);
    ov.querySelectorAll('.il-save-meta, .il-fin-guardar').forEach(btn => {
      btn.classList.toggle('il-guardada', !!ex && !ex.read);
      btn.classList.toggle('il-leida', !!ex && !!ex.read);
      btn.innerHTML = (ex ? icono('bookmark-check') : icono('bookmark')) +
        '<span>' + esc(t(!ex ? 'saveLater' : ex.read ? 'saveToPending' : 'saveRemove')) + '</span>';
    });
  }

  ov.querySelectorAll('.il-save-meta, .il-fin-guardar').forEach(btn => btn.onclick = function(){
    saveForLater(art);
    // Si vuelve a pendientes, ya no cuenta como leída aquí.
    const ex = findLaterItem(location.href);
    if (estadoLeida === 'marcada' && ex && !ex.read){ estadoLeida = 'deshecha'; finEstado.textContent = ''; }
    pintarBotonGuardar();
    pintarSiguiente();
  });

  // ── Final del artículo ──
  // estadoLeida: 'no' (aún no), 'marcada' (se puede deshacer) o 'deshecha'
  // (la persona dijo que no: ya no se marca sola).
  let estadoLeida = 'no', deshacerLeida = null, finObservador = null;
  const finEstado = ov.querySelector('.il-fin-estado');

  function marcarLeida(){
    if (estadoLeida === 'marcada') return;
    estadoLeida = 'marcada';
    deshacerLeida = marcarLeidaAlTerminar();
    pintarBotonGuardar();
    pintarSiguiente();
    finEstado.textContent = '';
    const txt = document.createElement('span');
    txt.textContent = '✓ ' + t('finMarcada') + ' · ';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'il-fin-deshacer';
    btn.textContent = t('btnUndo');
    btn.onclick = () => {
      if (deshacerLeida) deshacerLeida();
      deshacerLeida = null;
      estadoLeida = 'deshecha';
      finEstado.textContent = '';
      pintarBotonGuardar();
      pintarSiguiente();
    };
    finEstado.append(txt, btn);
  }

  function pintarSiguiente(){
    const b = ov.querySelector('.il-fin-siguiente');
    const sig = siguientePendiente(location.href);
    b.hidden = !sig;
    if (!sig) return;
    const titulo = sig.title || sig.url;
    b.querySelector('.il-fin-sig-titulo').textContent = titulo;
    b.setAttribute('aria-label', t('finSiguienteDe').replace('{X}', titulo));
    b.onclick = () => {
      if (estadoLeida !== 'marcada') marcarLeida();
      saveScroll();
      irASiguientePendiente(sig);
    };
  }

  ov.querySelector('.il-fin-volver').onclick = () => {
    if (estadoLeida !== 'marcada') marcarLeida();
    volverAVoceiro();
  };

  // Llegar al final cuenta como leída, si se ha bajado hasta allí (un
  // artículo que cabe entero en pantalla no se marca solo).
  if ('IntersectionObserver' in window){
    finObservador = new IntersectionObserver(entradas => {
      if (estadoLeida !== 'no' || ov.scrollTop <= 0) return;
      if (entradas.some(en => en.isIntersecting)) marcarLeida();
    }, { root: ov, threshold: 0.5 });
    finObservador.observe(ov.querySelector('.il-fin-acciones'));
  }

  // Estado inicial al abrir el lector
  pintarBotonGuardar();
  pintarSiguiente();
  __lectorAbierto = { refrescar };

  function showDictPopup(word, parentEl){
    const existing = parentEl.querySelector('.il-dict-popup');
    if (existing) existing.remove();
    const dicts = getDictsForLang(pageLang);
    if (!dicts.length){ toast(t('dictNoDefault')); return; }
    const pop = document.createElement('div');
    pop.className = 'il-dict-popup';
    const title = document.createElement('div');
    title.className = 'il-dict-popup-title';
    title.textContent = t('dictSearchIn') + ' "' + word + '"';
    pop.appendChild(title);
    dicts.forEach(d => {
      const btn = document.createElement('button');
      btn.textContent = d.name;
      btn.onclick = () => { openDictionary(d, word); pop.remove(); };
      pop.appendChild(btn);
    });
    const sel = window.getSelection();
    if (sel && sel.rangeCount){
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      pop.style.left = Math.max(8, Math.min(window.innerWidth - 220, rect.left + rect.width/2 - 90)) + 'px';
      pop.style.top = Math.max(8, Math.min(window.innerHeight - 220, rect.bottom + 8)) + 'px';
    } else {
      pop.style.left = '50%'; pop.style.top = '50%';
    }
    parentEl.appendChild(pop);
    const dismiss = e => {
      if (!pop.contains(e.target)){ pop.remove(); document.removeEventListener('mousedown', dismiss); }
    };
    setTimeout(() => document.addEventListener('mousedown', dismiss), 0);
  }

  function executeReaderAction(action){
    switch (action){
      case 'fontIncrease': prefs.fs = Math.min(UI.fsMax, prefs.fs + 1); applyPrefs(); break;
      case 'fontDecrease': prefs.fs = Math.max(UI.fsMin, prefs.fs - 1); applyPrefs(); break;
      case 'toggleTheme':  prefs.theme = prefs.theme === 'dark' ? 'light' : 'dark'; applyPrefs(); break;
      case 'scrollTop':    ov.scrollTo({ top: 0, behavior: desplazar() }); break;
      case 'scrollBottom': ov.scrollTo({ top: ov.scrollHeight, behavior: desplazar() }); break;
      case 'toggleBionic':
        prefs.bionic = !prefs.bionic;
        ov.querySelector('.il-body').innerHTML = renderBody();
        wireImages();
        applyPrefs();
        break;
      case 'toggleFocus':   prefs.focus = !prefs.focus; applyPrefs(); break;
      case 'toggleJustify': prefs.just  = !prefs.just;  applyPrefs(); break;
      case 'toggleImages':  cambiarImagenes(); break;
      case 'toggleWide':    prefs.width = prefs.width >= 900 ? 720 : 1100; applyPrefs(); break;
      case 'saveLater':     saveForLater(art); break;
      case 'openSites':     openSettings('sites'); break;
      case 'openQueue':     openSettings('pendientes'); break;
      case 'openRSVP':      openRSVP(ov, rawBody); break;
      case 'copyText':
        copyText(buildText());
        break;
    }
  }

  function keyHandler(e){
    if (!document.getElementById('il-full')) return;
    if (document.getElementById('il-settings')) return;
    if (document.getElementById('il-extract-tool')) return;
    if (isPickerActive()) return;
    if (document.querySelector('#il-full .il-visor')) return;   // el visor lleva sus teclas
    const nk = normalizeKey(e);
    // Esc cierra primero Apariencia o Más, también desde sus casillas.
    if (nk === 'escape' && cerrarDesplegable(true)){ e.preventDefault(); return; }
    const tg = e.target;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;

    if (nk === 'escape'){ closeOverlay(); return; }

    const action = findActionByKey('reader', nk);
    if (!action) return;
    e.preventDefault();
    executeReaderAction(action);
  }
  document.addEventListener('keydown', keyHandler);
}

/* ============================================================
   20. RSVP
   ============================================================ */
function openRSVP(ov, rawBody){
  const allWords = rawBody.split(/\s+/).filter(Boolean);
  if (!allWords.length) return;
  const WPL = UI.rsvpWPL;
  const lines = [];
  for (let i = 0; i < allWords.length; i += WPL) lines.push(allWords.slice(i, i + WPL).join(' '));
  const escW = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const root = document.createElement('div');
  root.id = 'il-rsvp-root';
  root.style.cssText = 'position:fixed;inset:0;background:var(--bg);color:var(--fg);z-index:25;display:flex;flex-direction:column;';

  const linesHtml = lines.map(l =>
    '<div class="il-tp-line" style="padding:6px 24px;display:flex;align-items:center;justify-content:center;' +
    'text-align:center;color:var(--fg);opacity:.5;transition:color .35s ease,opacity .35s ease,font-weight .35s ease">' +
    escW(l) + '</div>').join('');

  root.innerHTML =
    '<div style="flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:20px 20px 0">' +
      '<div id="il-tp-viewport" class="il-content" style="width:100%;max-width:var(--w,720px);height:100%;position:relative;overflow:hidden;' +
        '-webkit-mask-image:linear-gradient(to bottom,transparent 0%,black 30%,black 70%,transparent 100%);' +
        'mask-image:linear-gradient(to bottom,transparent 0%,black 30%,black 70%,transparent 100%)">' +
        '<div id="il-tp-inner" style="width:100%;will-change:transform">' + linesHtml + '</div>' +
        '<div style="position:absolute;top:50%;left:8%;right:8%;height:1px;background:var(--accent);opacity:.28;pointer-events:none;transform:translateY(-1px)"></div>' +
      '</div>' +
    '</div>' +
    '<div style="font-family:-apple-system,sans-serif;padding:18px 20px 24px;display:flex;flex-direction:column;align-items:center;gap:14px">' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center">' +
        '<button id="il-rsvp-sl">🐢 -50</button>' +
        '<button id="il-rsvp-pl" class="il-primary" style="min-width:120px">' + esc(t('pause')) + '</button>' +
        '<button id="il-rsvp-fs">🐇 +50</button>' +
      '</div>' +
      '<div style="color:var(--muted);font-size:14px">' + esc(t('speed')) + ': <span id="il-rsvp-v">300</span> ' + esc(t('ppm')) + '</div>' +
      '<div style="width:100%;max-width:600px;height:4px;background:var(--border);border-radius:2px;overflow:hidden">' +
        '<div id="il-rsvp-bar" style="height:100%;background:var(--accent);width:0%"></div></div>' +
    '</div>' +
    '<button id="il-rsvp-cls" style="position:absolute;top:20px;right:20px;font-size:16px;font-family:-apple-system,sans-serif">' + esc(t('exit')) + '</button>';

  ov.appendChild(root);
  const viewport = root.querySelector('#il-tp-viewport');
  const inner = root.querySelector('#il-tp-inner');
  const lineEls = Array.prototype.slice.call(inner.querySelectorAll('.il-tp-line'));
  const pBtn = root.querySelector('#il-rsvp-pl');
  const vEl = root.querySelector('#il-rsvp-v');
  const barEl = root.querySelector('#il-rsvp-bar');

  let wpm = 300, lineIdx = 0, playing = false, timer = null, rafId = null, activeIdx = -1;

  function offsetFor(idx){
    if (idx < 0) idx = 0;
    if (idx >= lineEls.length) idx = lineEls.length - 1;
    const vh = viewport.clientHeight;
    let top = 0;
    for (let i = 0; i < idx; i++) top += lineEls[i].getBoundingClientRect().height;
    const lh = lineEls[idx].getBoundingClientRect().height;
    return vh / 2 - lh / 2 - top;
  }
  function setActive(i){
    if (i === activeIdx) return;
    if (activeIdx >= 0 && lineEls[activeIdx]){
      lineEls[activeIdx].style.color = 'var(--fg)';
      lineEls[activeIdx].style.opacity = '0.5';
      lineEls[activeIdx].style.fontWeight = 'normal';
    }
    if (lineEls[i]){
      lineEls[i].style.color = 'var(--accent)';
      lineEls[i].style.opacity = '1';
      lineEls[i].style.fontWeight = 'bold';
    }
    activeIdx = i;
  }
  function rAFHighlight(){
    if (!playing){ rafId = null; return; }
    const cy = viewport.clientHeight / 2;
    const vpTop = viewport.getBoundingClientRect().top;
    const start = Math.max(0, lineIdx - 2);
    const end = Math.min(lineEls.length, lineIdx + 3);
    let best = activeIdx, bestD = Infinity;
    for (let k = start; k < end; k++){
      const r = lineEls[k].getBoundingClientRect();
      const lc = (r.top + r.bottom) / 2 - vpTop;
      const d = Math.abs(lc - cy);
      if (d < bestD){ bestD = d; best = k; }
    }
    setActive(best);
    rafId = requestAnimationFrame(rAFHighlight);
  }
  function scheduleNext(){
    clearTimeout(timer);
    if (!playing) return;
    const lastWord = lines[lineIdx].split(' ').slice(-1)[0] || '';
    let dur = (60000 * WPL) / wpm;
    if (/[.!?]$/.test(lastWord)) dur *= 1.7;
    else if (/[,;:]$/.test(lastWord)) dur *= 1.3;
    inner.style.transition = 'transform ' + dur + 'ms linear';
    timer = setTimeout(() => {
      if (lineIdx >= lines.length - 1){ stop(); pBtn.textContent = t('repeat'); return; }
      lineIdx++;
      inner.style.transform = 'translateY(' + offsetFor(lineIdx) + 'px)';
      barEl.style.width = ((lineIdx / Math.max(1, lines.length - 1)) * 100) + '%';
      scheduleNext();
    }, dur);
  }
  function play(){
    playing = true; pBtn.textContent = t('pause');
    if (!rafId) rafId = requestAnimationFrame(rAFHighlight);
    scheduleNext();
  }
  function stop(){
    playing = false; pBtn.textContent = t('play');
    clearTimeout(timer);
    if (rafId){ cancelAnimationFrame(rafId); rafId = null; }
    setActive(lineIdx);
  }
  pBtn.onclick = () => {
    if (playing){ stop(); return; }
    if (pBtn.textContent === t('repeat')){
      lineIdx = 0;
      inner.style.transition = 'none';
      inner.style.transform = 'translateY(' + offsetFor(0) + 'px)';
      barEl.style.width = '0%';
      activeIdx = -1; setActive(0);
    }
    play();
  };
  root.querySelector('#il-rsvp-sl').onclick = () => {
    wpm = Math.max(UI.rsvpWpmMin, wpm - UI.rsvpWpmStep); vEl.textContent = wpm;
    if (playing){ clearTimeout(timer); scheduleNext(); }
  };
  root.querySelector('#il-rsvp-fs').onclick = () => {
    wpm = Math.min(UI.rsvpWpmMax, wpm + UI.rsvpWpmStep); vEl.textContent = wpm;
    if (playing){ clearTimeout(timer); scheduleNext(); }
  };
  root.querySelector('#il-rsvp-cls').onclick = () => { stop(); root.remove(); };

  requestAnimationFrame(() => {
    inner.style.transition = 'none';
    inner.style.transform = 'translateY(' + offsetFor(0) + 'px)';
    setActive(0);
    requestAnimationFrame(() => play());
  });
}

/* ============================================================
   20b. LA PÁGINA DE DEBAJO
   ------------------------------------------------------------
   Mientras el lector está abierto, la página no se ve ni se puede
   tocar: ni lo que ya había ni lo que el medio ponga después (avisos
   de cookies, de suscripción o del bloqueador de anuncios), que con
   un z-index alto quedaría por encima del lector. Al cerrar, todo
   vuelve a estar como estaba, también el scroll: visibility y
   opacity no cambian el tamaño de nada.

   Se respetan las piezas del lector (id «il-…» o clase il-tema) y lo
   que aparece mientras con nombre de elemento personalizado (con
   guion), que suele ser de extensiones del navegador: diccionarios,
   traductores, lectura en voz alta.
   ============================================================ */
const esDelLector = el => (el.id || '').indexOf('il-') === 0 || el.classList.contains('il-tema');
const NO_SE_OCULTA = /^(HEAD|BODY|SCRIPT|STYLE|LINK|META|NOSCRIPT|TEMPLATE)$/;

function taparPagina(ov){
  // El :not(#il-x) sube la especificidad a la de dos ids: gana a un
  // «visibility:visible!important» con id que traiga la página.
  // El filtro o el transform en html o body (hay muros que desenfocan la
  // página así) se llevarían también al lector, que va dentro del body.
  const st = document.createElement('style');
  st.id = 'il-pagina-tapada';
  st.textContent =
    '[data-il-tapado]:not(#il-x):not(#il-y){visibility:hidden!important;opacity:0!important;pointer-events:none!important}' +
    'html,body{filter:none!important;-webkit-filter:none!important;transform:none!important}' +
    '#il-full{pointer-events:auto!important;-webkit-user-select:text!important;user-select:text!important}';
  (document.head || document.documentElement).appendChild(st);

  const tapados = [];
  const inertes = [];
  const tapar = el => {
    if (el.nodeType !== 1 || esDelLector(el) || NO_SE_OCULTA.test(el.tagName) || el.hasAttribute('data-il-tapado')) return;
    el.setAttribute('data-il-tapado', '');
    tapados.push(el);
  };
  const inutilizar = el => { if (!el.inert){ el.inert = true; inertes.push(el); } };

  // Lo que ya había: todo inerte (como siempre: ni el teclado ni los
  // lectores de pantalla se meten en lo que no se ve) y tapado, menos los
  // elementos personalizados, que pueden ser de una extensión.
  [...document.body.children].forEach(el => {
    if (esDelLector(el)) return;
    inutilizar(el);
    if (!el.tagName.includes('-')) tapar(el);
  });
  [...document.documentElement.children].forEach(el => { if (!el.tagName.includes('-')) tapar(el); });

  // Lo que llega después, igual, salvo los elementos personalizados. Si
  // la página se lleva el lector (una SPA que rehace el body), se destapa.
  const obs = new MutationObserver(cambios => {
    if (!ov.isConnected){ fin(); return; }
    cambios.forEach(c => c.addedNodes.forEach(n => {
      if (n.nodeType !== 1 || esDelLector(n) || n.tagName.includes('-') || NO_SE_OCULTA.test(n.tagName)) return;
      tapar(n);
      inutilizar(n);
    }));
  });
  obs.observe(document.body, { childList: true });
  obs.observe(document.documentElement, { childList: true });

  let hecho = false;
  function fin(){
    if (hecho) return;
    hecho = true;
    obs.disconnect();
    tapados.forEach(el => el.removeAttribute('data-il-tapado'));
    inertes.forEach(el => { el.inert = false; });
    st.remove();
  }
  return { fin: fin };
}
/* ============================================================
   21. BOTÓN FLOTANTE
   ------------------------------------------------------------
   Uno solo, dentro de un Shadow DOM: el CSS del medio no le llega. Si
   en la página hay artículo, el botón grande abre el lector y el pequeño
   (⋯) despliega lo demás; si no, el grande despliega el menú. Se arrastra
   y al soltarlo se pega al borde más cercano; recuerda el lado y la
   altura (CFG.fab, que no viaja a otros dispositivos).
   actualizarBoton() lo pone, lo cambia o lo quita según la página: se
   llama cada vez que cambia algo que le afecta.
   ============================================================ */
const FAB_ID = 'il-fab';

function botonOcultoAqui(){
  const d = normalizeDomain(location.hostname);
  return !!(CFG.fab && Array.isArray(CFG.fab.ocultoEn) && CFG.fab.ocultoEn.includes(d));
}
function ocultarBotonAqui(ocultar){
  const d = normalizeDomain(location.hostname);
  if (!d) return;
  CFG.fab = CFG.fab || {};
  const lista = (Array.isArray(CFG.fab.ocultoEn) ? CFG.fab.ocultoEn : []).filter(x => x !== d);
  if (ocultar) lista.push(d);
  CFG.fab.ocultoEn = lista;
  saveCfg(CFG);
  actualizarBoton();
}

function puedeAnadirSitio(){
  return !findSiteRule() && !isDomainDisabled(location.hostname) && !isPlainDomain() &&
         isKnownMediaDomain(location.hostname);
}

// Lo que ofrece el botón en esta página, o null si nada.
function ofertaDelBoton(){
  if (isDomainDisabled(location.hostname) || isPlainDomain()) return null;
  const o = {
    lector: shouldShowReaderFAB(),
    anadir: puedeAnadirSitio(),
    ajustes: isKnownMediaDomain(location.hostname) || !!findSiteRule(),
    servicios: debeMostrarFabServicios() ? serviciosConfigurados() : []
  };
  return (o.lector || o.anadir || o.ajustes || o.servicios.length) ? o : null;
}

function actualizarBoton(){
  if (!document.body) return;
  const o = botonOcultoAqui() ? null : ofertaDelBoton();
  let host = document.getElementById(FAB_ID);
  if (!o){ if (host) host.remove(); return; }
  if (!host || !host.__pintar){ if (host) host.remove(); host = crearBoton(); }
  host.__pintar(o);
}

function anadirSitioActual(){
  const d = normalizeDomain(location.hostname);
  if (!d) return;
  if (CFG.sites.some(s => s.domain === d)){ toast(t('alreadyInList')); actualizarBoton(); return; }
  addSiteAnywhere(d);
  saveCfg(CFG);
  actualizarBoton();
  toast(t('addedTo') + ' ' + d, 6000, { label: t('btnUndo'), onClick: () => {
    if (removeSiteRule(d)) toast(t('siteRemovedToast').replace('{X}', d), 1800);
    actualizarBoton();
  } });
}

function cssBoton(){
  return `
${cssPaleta(':host', t => ':host([data-theme="' + t + '"])')}
*{box-sizing:border-box}
[hidden]{display:none!important}
.caja{position:relative;display:flex;align-items:center;gap:6px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:15px;line-height:1.3}
.caja.derecha{flex-direction:row-reverse}
button{font:inherit;color:var(--fg);background:var(--btn-bg);border:1px solid var(--btn-border);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;margin:0}
button:hover{filter:brightness(.96)}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
svg{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.principal{position:relative;width:${UI.fabSize}px;height:${UI.fabSize}px;border-radius:50%;box-shadow:0 4px 14px rgba(0,0,0,.3);touch-action:none;cursor:grab}
.principal svg{width:26px;height:26px}
.principal .auto{position:absolute;top:3px;right:3px;width:12px;height:12px;border-radius:50%;background:var(--preset);border:2px solid var(--btn-bg)}
.mas{width:32px;height:32px;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.25)}
.mas svg{width:18px;height:18px}
.menu{position:absolute;bottom:calc(100% + 8px);left:0;width:max-content;min-width:240px;max-width:calc(100vw - 24px);max-height:60vh;overflow:auto;background:var(--bg);color:var(--fg);border:1px solid var(--btn-border);border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.3);padding:6px}
.caja.abajo .menu{bottom:auto;top:calc(100% + 8px)}
.caja.derecha .menu{left:auto;right:0}
[role="menuitem"]{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;padding:10px 12px;border:none;background:transparent;border-radius:8px;text-align:left}
[role="menuitem"]:hover,[role="menuitem"]:focus{background:var(--quote-bg);filter:none}
[role="menuitem"] svg{width:20px;height:20px}
.grupo{font-size:12px;font-weight:600;color:var(--muted);padding:8px 12px 2px}
[role="separator"]{border-top:1px solid var(--border);margin:4px 0}
@media print{:host{display:none!important}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;
}

function crearBoton(){
  const host = document.createElement('div');
  host.id = FAB_ID;
  // El host vive en la página: se le quita todo lo que pudiera heredar.
  host.style.cssText = 'all:initial';
  host.style.setProperty('position', 'fixed', 'important');
  host.style.setProperty('z-index', '2147483645', 'important');
  const raiz = host.attachShadow({ mode: 'closed' });
  raiz.innerHTML = '<style>' + cssBoton() + '</style>' +
    '<div class="caja">' +
      '<button type="button" class="principal"></button>' +
      '<button type="button" class="mas" aria-haspopup="menu" aria-expanded="false">' + icono('ellipsis') + '</button>' +
      '<div class="menu" role="menu" hidden></div>' +
    '</div>';
  document.body.appendChild(host);

  const caja = raiz.querySelector('.caja');
  const principal = raiz.querySelector('.principal');
  const mas = raiz.querySelector('.mas');
  const menu = raiz.querySelector('.menu');
  let oferta = null;

  // ── Posición: un lado (izq/der) y una altura. Lo de antes (left/top)
  // se traduce al lado más cercano. ──
  const M = UI.fabMargin, S = UI.fabSize;
  let lado = CFG.fab && CFG.fab.lado;
  let top = CFG.fab && typeof CFG.fab.top === 'number' ? CFG.fab.top : null;
  if (lado !== 'izq' && lado !== 'der'){
    lado = CFG.fab && typeof CFG.fab.left === 'number' && CFG.fab.left > window.innerWidth / 2 ? 'der' : 'izq';
  }
  if (top === null) top = window.innerHeight - M - S;
  function colocar(x){
    const ancho = caja.offsetWidth || S;
    top = Math.max(M / 2, Math.min(window.innerHeight - S - M / 2, top));
    const left = x !== undefined ? x : (lado === 'der' ? window.innerWidth - ancho - M : M);
    host.style.setProperty('left', Math.max(0, Math.min(window.innerWidth - ancho, left)) + 'px', 'important');
    host.style.setProperty('top', top + 'px', 'important');
    caja.classList.toggle('derecha', lado === 'der');
    caja.classList.toggle('abajo', top < window.innerHeight / 2);
  }

  // ── Menú ──
  function item(accion, ico, texto, extra){
    return '<button type="button" role="menuitem" tabindex="-1" data-accion="' + accion + '"' +
      (extra ? ' data-id="' + esc(extra) + '"' : '') + '>' + ico + '<span>' + esc(texto) + '</span></button>';
  }
  function pintarMenu(){
    const o = oferta;
    let h = '';
    if (o.lector) h += item('lector', icono('book-open-text'), t('fabTitle'));
    if (o.anadir) h += item('anadir', icono('plus'), t('addFabTitle'));
    if (o.servicios.length){
      h += '<div role="separator"></div><div role="group" aria-label="' + esc(t('abrirEn')) + '">' +
        '<div class="grupo" aria-hidden="true">' + esc(t('abrirEn')) + '</div>' +
        o.servicios.map(svc => item('servicio', icono('external-link'), svc.nombre, svc.id)).join('') + '</div>';
    }
    h += '<div role="separator"></div>';
    if (o.ajustes) h += item('ajustes', icono('settings'), t('settingsFabTitle'));
    h += item('ocultar', icono('eye-off'), t('fabOcultarAqui'));
    menu.innerHTML = h;
  }
  const conmutador = () => oferta && oferta.lector ? mas : principal;
  function abrirMenu(){
    menu.hidden = false;
    conmutador().setAttribute('aria-expanded', 'true');
    const primero = menu.querySelector('[role="menuitem"]');
    if (primero) primero.focus();
  }
  function cerrarMenu(devolverFoco){
    if (menu.hidden) return;
    menu.hidden = true;
    conmutador().setAttribute('aria-expanded', 'false');
    if (devolverFoco) conmutador().focus();
  }
  menu.addEventListener('keydown', e => {
    const items = [...menu.querySelectorAll('[role="menuitem"]')];
    const i = items.indexOf(raiz.activeElement);
    let j = null;
    if (e.key === 'ArrowDown') j = (i + 1) % items.length;
    else if (e.key === 'ArrowUp') j = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = items.length - 1;
    else if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); cerrarMenu(true); return; }
    else if (e.key === 'Tab'){ cerrarMenu(false); return; }
    if (j === null) return;
    e.preventDefault();
    items[j].focus();
  });
  menu.addEventListener('click', e => {
    const b = e.target.closest('[role="menuitem"]');
    if (!b) return;
    cerrarMenu(false);
    const accion = b.dataset.accion;
    if (accion === 'lector') activateReader();
    else if (accion === 'anadir') anadirSitioActual();
    else if (accion === 'ajustes') openSettings('sites');
    else if (accion === 'servicio'){
      const svc = oferta.servicios.find(s => s.id === b.dataset.id);
      if (svc) abrirEnServicio(svc);
    } else if (accion === 'ocultar'){
      ocultarBotonAqui(true);
      toast(t('fabOcultoAqui'), 6000, { label: t('btnUndo'), onClick: () => ocultarBotonAqui(false) });
    }
  });
  // Pulsar fuera lo cierra (desde fuera, los clics llegan con el host como
  // destino). Los escuchadores de la página se quitan solos si el botón ya
  // no está.
  function fuera(e){
    if (!host.isConnected){ document.removeEventListener('pointerdown', fuera, true); return; }
    if (!menu.hidden && !e.composedPath().includes(host)) cerrarMenu(false);
  }
  document.addEventListener('pointerdown', fuera, true);

  mas.onclick = e => { e.stopPropagation(); if (menu.hidden) abrirMenu(); else cerrarMenu(true); };

  // ── El grande: arrastrar, o pulsar (abre el lector o el menú). Clic
  // derecho o pulsación larga: el menú. ──
  let arrastre = null, arrastrado = false;
  principal.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    arrastre = { x: e.clientX, y: e.clientY, left: host.getBoundingClientRect().left, top, mueve: false };
    principal.setPointerCapture(e.pointerId);
  });
  principal.addEventListener('pointermove', e => {
    if (!arrastre) return;
    const dx = e.clientX - arrastre.x, dy = e.clientY - arrastre.y;
    if (!arrastre.mueve && Math.hypot(dx, dy) < 6) return;
    arrastre.mueve = true;
    cerrarMenu(false);
    top = arrastre.top + dy;
    colocar(arrastre.left + dx);
  });
  const soltar = () => {
    if (!arrastre) return;
    const movido = arrastre.mueve;
    arrastre = null;
    if (!movido) return;
    arrastrado = true;
    const r = host.getBoundingClientRect();
    lado = r.left + r.width / 2 > window.innerWidth / 2 ? 'der' : 'izq';
    colocar();
    CFG.fab = { ...(CFG.fab || {}), lado, top };
    delete CFG.fab.left;
    saveCfg(CFG);
  };
  principal.addEventListener('pointerup', soltar);
  principal.addEventListener('pointercancel', soltar);
  principal.addEventListener('click', e => {
    e.stopPropagation();
    if (arrastrado){ arrastrado = false; return; }
    if (oferta && oferta.lector){ cerrarMenu(false); activateReader(); }
    else if (menu.hidden) abrirMenu();
    else cerrarMenu(true);
  });
  principal.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (menu.hidden) abrirMenu();
  });
  function alRedimensionar(){
    if (!host.isConnected){ window.removeEventListener('resize', alRedimensionar); return; }
    colocar();
  }
  window.addEventListener('resize', alRedimensionar);
  // Para devolverle el foco desde fuera (document.activeElement solo ve el host).
  host.__enfocar = () => principal.focus();

  host.__pintar = o => {
    oferta = o;
    aplicarTema(host);
    const auto = !!(o.lector && CFG.readerAutoAll);
    const nombre = o.lector ? t('fabTitle') + (auto ? ' (' + t('fabAutomatico') + ')' : '') : t('fabMenu');
    principal.innerHTML = (o.lector ? icono('book-open-text') : icono('ellipsis')) + (auto ? '<span class="auto"></span>' : '');
    principal.setAttribute('aria-label', nombre);
    principal.title = nombre;
    if (o.lector){
      principal.removeAttribute('aria-haspopup');
      principal.removeAttribute('aria-expanded');
    } else {
      principal.setAttribute('aria-haspopup', 'menu');
      principal.setAttribute('aria-expanded', String(!menu.hidden));
    }
    mas.hidden = !o.lector;
    mas.setAttribute('aria-label', t('fabMenu'));
    mas.title = t('fabMenu');
    pintarMenu();
    colocar();
  };
  return host;
}
/* ============================================================
   23. ACTIVAR LECTOR
   ============================================================ */
function activateReader(){
  try {
    const ex = currentExtraction();
    let art = extractArticleWithConfig(ex);
    let usedFallback = false;

    // Fallback: si el origen explícito falla, probamos con auto y reabrimos.
    if (!art && ex.mode === 'auto' && currentReaderSource() !== 'auto'){
      art = extractArticleWithConfig(ex, 'auto');
      if (art) usedFallback = true;
    }

    if (!art){
      if (ex.mode === 'selector') toast(t('srcNoCustom'));
      else if (ex.mode === 'all') toast(t('srcNoAll'));
      else {
        const src = currentReaderSource();
        if (src === 'jsonld') toast(t('srcNoJsonld'));
        else if (src === 'readability') toast(t('srcNoReadability'));
        else toast(t('noArticle'));
      }
      return;
    }

    if (usedFallback){
      // El origen elegido no servía: lo dejamos en auto para que el FAB no vuelva a fallar.
      const rule = findSiteRule();
      if (rule && rule.readerSource !== 'auto'){
        rule.readerSource = 'auto';
        saveCfg(CFG);
      }
      __sessionSourceOverride = null;
      toast(t('srcFallbackAuto'), 2200);
    }

    const plain = art.rawHTML ? stripTags(art.rawHTML).trim() : String(art.rawBody || '').trim();
    if (!plain || plain.length < 100){
      if (ex.mode === 'selector') toast(t('srcNoCustom'));
      else if (ex.mode === 'all') toast(t('srcNoAll'));
      else toast(t('noArticle'));
      return;
    }
    openReader(art);
  } catch(e){
    console.error('[Lector Universal]', e);
    toast(t('noArticle'));
  }
}

/* ============================================================
   24. PANEL DE CONFIGURACIÓN
   ============================================================ */
// opts.dentro: un elemento de la página donde pintar el panel, sin fondo ni
// diálogo (la página Lector de Ajustes de Voceiro, que lo abre y lo cierra).
// opts.dominio: el medio que se enseña en Medios en lugar del de la página
// («Cómo leerlo», desde un titular de Voceiro).
function openSettings(initialTab, opts){
  const dentro = opts && opts.dentro;
  if (dentro ? dentro.querySelector('.il-settings-dentro') : document.getElementById('il-settings')) return;
  // Con el tema del perfil; diálogo modal: el foco entra y, al cerrar,
  // vuelve a donde estaba.
  const focoAntes = document.activeElement;
  const root = temaDe(document.createElement('div'));
  const box = document.createElement('div');
  if (dentro){
    root.classList.add('il-settings-dentro');
    root.style.cssText = 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
    box.style.cssText = 'background:var(--bg);color:var(--fg)';
  } else {
    root.id = 'il-settings';
    root.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2147483647;' +
      'display:flex;align-items:center;justify-content:center;padding:20px;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', t('settingsShort'));
    box.tabIndex = -1;
    box.style.cssText = 'background:var(--bg);color:var(--fg);border-radius:12px;max-width:960px;width:100%;' +
      'max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.4);padding:24px';
  }
  root.appendChild(box);
  (dentro || document.body).appendChild(root);

  // «catalog» era la pestaña del catálogo, que ya no existe.
  let activeSection = initialTab && initialTab !== 'catalog' ? initialTab : 'sites';
  let searchQuery = '';
  let filterLang = '';
  const dominioPedido = opts && opts.dominio ? normalizeDomain(opts.dominio) : '';
  const scState = { capture: null };
  let scListener = null;

  const closeSettings = function(){
    if (scListener){
      document.removeEventListener('keydown', scListener, true);
      scListener = null;
    }
    scState.capture = null;
    root.remove();
    document.removeEventListener('keydown', escHandler, true);
    if (dentro) return;
    if (focoAntes && focoAntes.isConnected){
      if (focoAntes.__enfocar) focoAntes.__enfocar();
      else if (focoAntes.focus) focoAntes.focus();
    }
  };
  const escHandler = e => {
    if (e.key === 'Escape'){
      if (scState.capture) return;
      const tg = e.target;
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT')) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      closeSettings();
    }
  };
  // Dentro de Voceiro, Esc y el cierre son cosa de su página de Ajustes.
  if (!dentro){
    document.addEventListener('keydown', escHandler, true);
    root.addEventListener('click', e => { if (e.target === root) closeSettings(); });
  }

  function dictRow(d, lang, isDefault, isBuiltin){
    const canDelete = !isBuiltin;
    return '<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">' +
      '<div style="flex:1;font-size:13px">' + esc(d.name) + '</div>' +
      '<div style="font-size:11px;color:var(--muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(d.url) + '</div>' +
      '<input type="radio" name="def-' + lang + '" value="' + esc(d.id) + '"' + (isDefault ? ' checked' : '') +
        ' data-lang="' + lang + '" class="il-dict-setdef" style="cursor:pointer" title="Predeterminado">' +
      (canDelete ? '<button data-lang="' + lang + '" data-id="' + esc(d.id) + '" class="il-dict-del" ' +
        'style="border:none;background:transparent;cursor:pointer;color:var(--block);font-size:12px;padding:2px 6px">🗑</button>' : '') +
    '</div>';
  }

  function tabBtn(id, label){
    return '<button class="il-set-tab" data-tab="' + id + '" style="padding:8px 16px;border:none;' +
      'border-bottom:2px solid ' + (activeSection === id ? 'var(--accent)' : 'transparent') + ';' +
      'background:transparent;cursor:pointer;font-weight:bold;color:' +
      (activeSection === id ? 'var(--accent)' : 'var(--muted)') + '">' + esc(label) + '</button>';
  }

  function extractionBadge(ex){
    if (!ex || ex.mode === 'auto') return '';
    const label = ex.mode === 'selector' ? '🎯' : ex.mode === 'all' ? '📄' : '';
    const title = ex.mode === 'selector' ? ('Selector: ' + (ex.root || '—'))
                : ex.mode === 'all' ? 'Todo el texto'
                : '';
    return ' · <span style="color:var(--preset);font-weight:bold" title="' + esc(title) + '">' + label + '</span>';
  }

  function langLabel(lang){
    if (lang === 'auto') return t('langAuto');
    const key = 'lang' + lang.charAt(0).toUpperCase() + lang.slice(1);
    return t(key) || lang;
  }

  function renderSitesTab(){
    const currentDomain = dominioPedido || (dentro ? '' : normalizeDomain(location.hostname));
    const currentDomainInList = currentDomain && CFG.sites.some(s => s.domain === currentDomain);

    const sitesFiltered = CFG.sites.filter(s => {
      if (searchQuery && !s.domain.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterLang && s.lang !== filterLang) return false;
      return true;
    });

    const siteRows = sitesFiltered.map((s) => {
      const realIdx = CFG.sites.indexOf(s);
      const pats = (s.ignorePatterns || []).map((p, pi) =>
        '<span style="display:inline-flex;align-items:center;gap:4px;background:var(--quote-bg);' +
          'border-radius:12px;padding:2px 4px 2px 10px;font-family:monospace;font-size:11px;margin:2px 4px 2px 0">' +
          esc(p) +
          '<button data-idx="' + realIdx + '" data-pi="' + pi + '" class="il-set-delpat" ' +
            'style="border:none;background:transparent;cursor:pointer;font-size:12px;padding:0 4px;color:var(--block)">✕</button>' +
        '</span>').join('');
      const patBlock = '<div style="margin-top:4px;font-size:11px;color:var(--muted)">' +
        '<span style="text-transform:uppercase;letter-spacing:.5px">' + esc(t('ignoredSections')) + ':</span> ' +
        (pats || '<span style="color:var(--muted)">' + esc(t('noIgnoredSections')) + '</span>') +
      '</div>';
      const textOnlyBadge = s.imagenes === 'ninguna' ? ' · <span style="color:var(--accent);font-weight:bold" title="' + esc(t('imgNinguna')) + '">📝</span>'
                          : s.imagenes === 'conPie' ? ' · <span style="color:var(--accent)" title="' + esc(t('imgConPie')) + '">🖼✎</span>' : '';
      const exBadge = extractionBadge(s.extraction);
      return '<div class="il-site-row" data-idx="' + realIdx + '" data-domain="' + esc(s.domain) + '" style="padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer">' +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
          '<div style="flex:1;min-width:140px;font-family:monospace;font-size:13px">' + esc(s.domain) + '</div>' +
          '<select data-idx="' + realIdx + '" class="il-set-mode" style="padding:6px 10px;border:1px solid var(--btn-border);border-radius:6px;font-size:13px">' +
            '<option value="off"'    + (s.mode==='off'   ?' selected':'') + '>' + esc(t('modeOff'))    + '</option>' +
            '<option value="prompt"' + (s.mode==='prompt'?' selected':'') + '>' + esc(t('modePrompt')) + '</option>' +
            '<option value="auto"'   + (s.mode==='auto'  ?' selected':'') + '>' + esc(t('modeAuto'))   + '</option>' +
          '</select>' +
          '<select data-idx="' + realIdx + '" class="il-set-src" style="padding:6px 8px;border:1px solid var(--btn-border);border-radius:6px;font-size:12px">' +
            '<option value="auto"' + (s.readerSource==='auto'?' selected':'') + '>' + esc(t('srcAuto')) + '</option>' +
            '<option value="jsonld"' + (s.readerSource==='jsonld'?' selected':'') + '>' + esc(t('srcJsonld')) + '</option>' +
            '<option value="readability"' + (s.readerSource==='readability'?' selected':'') + '>' + esc(t('srcReadability')) + '</option>' +
          '</select>' +
          '<select data-idx="' + realIdx + '" class="il-set-lang" style="padding:6px 8px;border:1px solid var(--btn-border);border-radius:6px;font-size:12px">' +
            SITE_LANGS.map(l => '<option value="' + l + '"' + (s.lang===l?' selected':'') + '>' + esc(langLabel(l)) + '</option>').join('') +
          '</select>' +
          '<button data-idx="' + realIdx + '" class="il-set-extract" title="' + esc(t('extractionTitle')) + '" ' +
            'style="padding:6px 10px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer">🔬</button>' +
          '<button data-idx="' + realIdx + '" class="il-set-visit" title="' + esc(t('openSite')) + '" ' +
            'style="padding:6px 10px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer">🔗</button>' +
          '<button data-idx="' + realIdx + '" class="il-set-del" style="padding:6px 10px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer">🗑</button>' +
        '</div>' +
        '<div style="margin-top:4px;font-size:11px;color:var(--muted)">' +
          '<span style="text-transform:uppercase;letter-spacing:.5px">' + esc(t('colLang')) + ':</span> ' + esc(langLabel(s.lang)) +
          textOnlyBadge + exBadge +
        '</div>' +
        patBlock +
      '</div>';
    }).join('');

    const langFilterOpts = '<option value="">' + esc(t('filterAll')) + ' ' + esc(t('filterLang')) + '</option>' +
      SITE_LANGS.map(l => '<option value="' + l + '"' + (filterLang===l?' selected':'') + '>' + esc(langLabel(l)) + '</option>').join('');
    // Bloqueados: los medios que se han quitado de la lista (o desactivado);
    // en ellos no sale el botón. Aquí se desbloquean.
    const bloqueados = (CFG.disabledDomains || []).slice().sort();
    const bloqueadosHTML = bloqueados.length
      ? '<div style="margin:0 0 18px;font-size:12px;color:var(--muted)">' +
          '<span style="text-transform:uppercase;letter-spacing:.5px">' + esc(t('blocked')) + ':</span> ' +
          bloqueados.map(d =>
            '<span style="display:inline-flex;align-items:center;gap:4px;background:var(--quote-bg);border-radius:12px;' +
              'padding:2px 4px 2px 10px;font-family:monospace;font-size:12px;margin:2px 4px 2px 0">' + esc(d) +
              '<button class="il-set-unblock" data-d="' + esc(d) + '" aria-label="' + esc(t('unblock') + ' ' + d) + '" ' +
                'style="border:none;background:transparent;cursor:pointer;font-size:12px;padding:2px 6px;color:var(--accent)">' + esc(t('unblock')) + '</button>' +
            '</span>').join('') +
        '</div>'
      : '';

    const addCurrentBanner = currentDomain && !currentDomainInList
      ? '<div style="background:var(--preset-bg);border:1px solid var(--preset);border-radius:8px;padding:10px 14px;' +
          'margin-bottom:12px;display:flex;align-items:center;gap:10px;font-size:13px;flex-wrap:wrap">' +
          '<span style="flex:1;min-width:140px">📍 ' + esc(dominioPedido ? t('medioSinReglas') : t('currentSiteHint')) + ': <strong style="font-family:monospace">' + esc(currentDomain) + '</strong></span>' +
          '<button class="il-set-add-current" style="padding:6px 14px;background:var(--preset);color:var(--on-solid);border:none;' +
            'border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;white-space:nowrap">+ ' + esc(t('addCurrentShort')) + '</button>' +
        '</div>'
      : '';

    const html =
      '<p style="margin:0 0 12px;font-size:13px;color:var(--muted)">' + esc(t('sitesHint')) + '</p>' +
      addCurrentBanner +
      '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">' +
        '<input class="il-set-search" placeholder="' + esc(t('searchPlaceholder')) + '" value="' + esc(searchQuery) + '" ' +
          'style="flex:1;min-width:140px;padding:8px 12px;border:1px solid var(--btn-border);border-radius:6px">' +
        '<select class="il-filter-lang" style="padding:8px 12px;border:1px solid var(--btn-border);border-radius:6px">' + langFilterOpts + '</select>' +
      '</div>' +
      '<div style="margin-bottom:10px">' +
        '<div style="border:1px solid var(--border);border-radius:8px;padding:8px 12px;max-height:340px;overflow:auto">' +
          (siteRows || '<div style="color:var(--muted);padding:8px 0;font-size:13px">' + esc(t('noSites')) + '</div>') +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap">' +
        '<input class="il-set-domain" placeholder="' + esc(t('domainPh')) + '" style="flex:1;min-width:180px;padding:8px 12px;border:1px solid var(--btn-border);border-radius:6px">' +
        '<select class="il-set-newmode" style="padding:8px 12px;border:1px solid var(--btn-border);border-radius:6px">' +
          '<option value="prompt" selected>' + esc(t('modePrompt')) + '</option>' +
          '<option value="auto">' + esc(t('modeAuto')) + '</option>' +
          '<option value="off">' + esc(t('modeOff')) + '</option>' +
        '</select>' +
        '<button class="il-set-add" style="padding:8px 14px;background:var(--accent);color:var(--on-solid);border:none;border-radius:6px;cursor:pointer">' + esc(t('add')) + '</button>' +
      '</div>' +
      bloqueadosHTML;

    function wire(){
      const searchInput = box.querySelector('.il-set-search');
      if (searchInput){
        searchInput.oninput = e => {
          const pos = e.target.selectionStart;
          searchQuery = e.target.value;
          render();
          const ni = box.querySelector('.il-set-search');
          if (ni){ ni.focus(); ni.setSelectionRange(pos, pos); }
        };
      }
      const langSel = box.querySelector('.il-filter-lang');
      if (langSel) langSel.onchange = e => { filterLang = e.target.value; render(); };
      box.querySelectorAll('.il-set-unblock').forEach(b => {
        b.onclick = () => { enableDomain(b.dataset.d); saveCfg(CFG); render(); actualizarBoton(); };
      });

      box.querySelectorAll('.il-set-mode').forEach(sel => {
        sel.onchange = () => { CFG.sites[+sel.dataset.idx].mode = sel.value; saveCfg(CFG); };
      });
      box.querySelectorAll('.il-set-src').forEach(sel => {
        sel.onchange = () => {
          const idx = +sel.dataset.idx;
          if (!READER_SOURCES.includes(sel.value)) return;
          CFG.sites[idx].readerSource = sel.value;
          saveCfg(CFG);
        };
      });
      box.querySelectorAll('.il-set-lang').forEach(sel => {
        sel.onchange = () => {
          const idx = +sel.dataset.idx;
          CFG.sites[idx].lang = sel.value;
          saveCfg(CFG);
        };
      });
      box.querySelectorAll('.il-set-extract').forEach(btn => {
        btn.onclick = e => {
          e.stopPropagation();
          openExtractionTool(+btn.dataset.idx, () => render());
        };
      });
      box.querySelectorAll('.il-set-visit').forEach(btn => {
        btn.onclick = e => {
          e.stopPropagation();
          const site = CFG.sites[+btn.dataset.idx];
          if (site) window.open('https://' + site.domain, '_blank', 'noopener');
        };
      });
      box.querySelectorAll('.il-set-del').forEach(btn => {
        btn.onclick = e => {
          e.stopPropagation();
          const removed = CFG.sites[+btn.dataset.idx];
          CFG.sites.splice(+btn.dataset.idx, 1);
          // Quitar un medio lo bloquea (sin botón); se desbloquea abajo.
          if (removed) disableDomain(removed.domain);
          saveCfg(CFG); render();
          if (removed && removed.domain === currentDomain) actualizarBoton();
        };
      });
      box.querySelectorAll('.il-set-delpat').forEach(btn => {
        btn.onclick = e => {
          e.stopPropagation();
          const site = CFG.sites[+btn.dataset.idx];
          if (!site) return;
          site.ignorePatterns.splice(+btn.dataset.pi, 1);
          saveCfg(CFG); render();
        };
      });
      box.querySelectorAll('.il-site-row').forEach(row => {
        row.addEventListener('dblclick', e => {
          if (e.target.closest('select,button,input,label,datalist')) return;
          const site = CFG.sites[+row.dataset.idx];
          if (site) window.open('https://' + site.domain, '_blank', 'noopener');
        });
      });

      const addCurrentBtn = box.querySelector('.il-set-add-current');
      if (addCurrentBtn) addCurrentBtn.onclick = () => {
        if (!currentDomain) return;
        if (CFG.sites.some(s => s.domain === currentDomain)){ toast(t('siteAlready')); return; }
        addSiteAnywhere(currentDomain);
        saveCfg(CFG);
        toast(t('addedTo') + ' ' + currentDomain);
        render();
        actualizarBoton();
      };

      const addBtn = box.querySelector('.il-set-add');
      if (addBtn) addBtn.onclick = () => {
        const inp = box.querySelector('.il-set-domain');
        const mode = box.querySelector('.il-set-newmode').value;
        const d = normalizeDomain(inp.value);
        if (!d || !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(d)){ toast(t('siteInvalid')); return; }
        if (CFG.sites.some(s => s.domain === d)){ toast(t('siteAlready')); return; }
        addSiteAnywhere(d, { mode: mode });
        saveCfg(CFG);
        render();
        if (d === currentDomain) actualizarBoton();
      };

      /* Foco al medio actual */
      if (currentDomain){
        setTimeout(() => {
          const row = box.querySelector('.il-site-row[data-domain="' + currentDomain + '"]');
          if (!row) return;
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const prevBg = row.style.background;
          const prevShadow = row.style.boxShadow;
          const prevRadius = row.style.borderRadius;
          row.style.transition = 'background .3s, box-shadow .3s';
          row.style.background = 'var(--quote-bg)';
          row.style.boxShadow = '0 0 0 2px var(--accent) inset';
          row.style.borderRadius = '6px';
          setTimeout(() => {
            row.style.background = prevBg || '';
            row.style.boxShadow = prevShadow || '';
            row.style.borderRadius = prevRadius || '';
          }, 3000);
        }, 80);
      }
    }

    return { html, wire };
  }

  function renderPendientesTab(){
    const keepRead = !(CFG.readerSettings && CFG.readerSettings.keepReadItems === false);
    const noLeidas = pendientesVisibles().filter(r => !r.read);
    const leidas   = pendientesVisibles().filter(r => r.read);

    function fila(r, esLeida){
      // Leída: gris y tachada, sin transparencia (con ella no llegaba a 3:1).
      return '<div style="display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border)">' +
          '<div style="flex:1;min-width:0">' +
            '<a href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer" ' +
              'style="color:' + (esLeida ? 'var(--muted)' : 'var(--accent)') + ';text-decoration:none;font-weight:bold;font-size:14px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' +
              (esLeida ? ';text-decoration:line-through' : '') + '">' + esc(r.title || r.url) + '</a>' +
            '<div style="font-size:11px;color:var(--muted);margin-top:2px">' +
              esc(r.domain || '') + ' · ' + esc((r.date || '').slice(0,10)) +
              (esLeida && r.readAt ? ' · ✓ ' + esc(r.readAt.slice(0,10)) : '') +
            '</div>' +
          '</div>' +
          '<button data-url="' + esc(r.url) + '" class="il-rl-toggle" title="' + esc(esLeida ? t('markUnread') : t('markRead')) + '" ' +
            'style="border:1px solid var(--preset);background:var(--bg);color:var(--preset);border-radius:6px;cursor:pointer;padding:4px 8px;font-size:12px">' +
            (esLeida ? '↺' : '✓') + '</button>' +
          '<button data-url="' + esc(r.url) + '" class="il-rl-del" title="' + esc(t('remove')) + '" ' +
            'style="border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer;padding:4px 8px;font-size:12px">✕</button>' +
        '</div>';
    }

    const rowsNoLeidas = noLeidas.map(r => fila(r, false)).join('');
    const rowsLeidas   = leidas.map(r => fila(r, true)).join('');

    const html =
      '<div style="margin-bottom:14px">' +
        '<div style="border:1px solid var(--border);border-radius:8px;padding:8px 12px;max-height:400px;overflow:auto">' +
          (rowsNoLeidas || '<div style="color:var(--muted);padding:8px 0;font-size:13px">' + esc(t('noReadLater')) + '</div>') +
        '</div>' +
      '</div>' +
      (keepRead && leidas.length ?
        '<div style="margin-bottom:14px">' +
          '<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">' +
            esc(t('readItems')) + ' (' + leidas.length + ')</div>' +
          '<div style="border:1px solid var(--border);border-radius:8px;padding:8px 12px;max-height:200px;overflow:auto;background:var(--quote-bg)">' +
            rowsLeidas +
          '</div>' +
        '</div>'
        : '') +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<label style="font-size:12px;color:var(--muted);display:flex;align-items:center;gap:6px;cursor:pointer">' +
          '<input type="checkbox" class="il-keep-read"' + (keepRead ? ' checked' : '') + '>' +
          esc(t('keepReadItems')) +
        '</label>' +
        (keepRead && leidas.length ?
          '<button class="il-clear-read" style="padding:6px 12px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer;font-size:12px;color:var(--block)">' +
            esc(t('clearRead')) + '</button>'
          : '') +
      '</div>';

    function wire(){
      box.querySelectorAll('.il-rl-toggle').forEach(btn => {
        btn.onclick = () => { toggleReadLater(btn.dataset.url); render(); };
      });
      box.querySelectorAll('.il-rl-del').forEach(btn => {
        btn.onclick = () => { removeFromLater(btn.dataset.url); render(); };
      });
      const chk = box.querySelector('.il-keep-read');
      if (chk) chk.onchange = () => {
        CFG.readerSettings = CFG.readerSettings || {};
        CFG.readerSettings.keepReadItems = chk.checked;
        saveCfg(CFG);
        if (!chk.checked && pendientesVisibles().some(r => r.read)) borrarLeidos();
        render();
      };
      const clr = box.querySelector('.il-clear-read');
      if (clr) clr.onclick = () => {
        if (!confirm(t('clearReadConfirm'))) return;
        borrarLeidos();
        render();
      };
    }
    return { html, wire };
  }

  function renderDictTab(){
    const langs = [
      { code: 'es', label: t('dictDefaultEs') },
      { code: 'gl', label: t('dictDefaultGl') },
      { code: 'ca', label: t('dictDefaultCa') },
      { code: 'eu', label: t('dictDefaultEu') },
      { code: 'en', label: t('dictDefaultEn') },
      { code: 'fr', label: t('dictDefaultFr') },
      { code: 'de', label: t('dictDefaultDe') },
      { code: 'it', label: t('dictDefaultIt') },
      { code: 'pt', label: t('dictDefaultPt') }
    ];

    const blocks = langs.map(l => {
      const dicts = getDictsForLang(l.code);
      const defaultId = getDefaultDictId(l.code);
      const rows = dicts.map(d => dictRow(d, l.code, d.id === defaultId, !!d.builtin)).join('');
      return '<div style="margin-bottom:16px">' +
        '<label style="display:block;font-size:12px;color:var(--muted);text-transform:uppercase;margin-bottom:6px">' + esc(l.label) + '</label>' +
        '<div style="border:1px solid var(--border);border-radius:8px;padding:8px 12px">' + rows + '</div>' +
      '</div>';
    }).join('');

    const html =
      '<div style="margin-bottom:16px">' +
        '<label style="display:block;font-size:12px;color:var(--muted);text-transform:uppercase;margin-bottom:6px">' + esc(t('dictMode')) + '</label>' +
        '<select class="il-dict-mode" style="padding:8px 12px;border:1px solid var(--btn-border);border-radius:6px;width:100%">' +
          '<option value="direct"' + (CFG.dict.mode === 'direct' ? ' selected' : '') + '>' + esc(t('dictModeDirect')) + '</option>' +
          '<option value="popup"' + (CFG.dict.mode === 'popup' ? ' selected' : '') + '>' + esc(t('dictModePopup')) + '</option>' +
        '</select>' +
      '</div>' +
      blocks +
      '<div style="background:var(--quote-bg);border:1px solid var(--mark);border-radius:8px;padding:12px;margin-bottom:16px;font-size:12px;color:var(--muted)">' +
        esc(t('dictUrlHint')) +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">' +
        '<input class="il-dict-new-name" placeholder="' + esc(t('dictName')) + '" style="flex:1;min-width:120px;padding:8px 12px;border:1px solid var(--btn-border);border-radius:6px">' +
        '<input class="il-dict-new-url" placeholder="' + esc(t('dictUrl')) + '" style="flex:2;min-width:200px;padding:8px 12px;border:1px solid var(--btn-border);border-radius:6px">' +
        '<select class="il-dict-new-lang" style="padding:8px 12px;border:1px solid var(--btn-border);border-radius:6px">' +
          langs.map(l => '<option value="' + l.code + '">' + l.code.toUpperCase() + '</option>').join('') +
        '</select>' +
        '<button class="il-dict-add" style="padding:8px 14px;background:var(--accent);color:var(--on-solid);border:none;border-radius:6px;cursor:pointer">' + esc(t('add')) + '</button>' +
      '</div>';

    function wire(){
      const modeSel = box.querySelector('.il-dict-mode');
      if (modeSel) modeSel.onchange = e => { CFG.dict.mode = e.target.value; saveCfg(CFG); };
      box.querySelectorAll('.il-dict-setdef').forEach(radio => {
        radio.onchange = () => {
          const l = radio.dataset.lang;
          const key = 'default' + l.charAt(0).toUpperCase() + l.slice(1);
          CFG.dict[key] = radio.value;
          saveCfg(CFG);
        };
      });
      box.querySelectorAll('.il-dict-del').forEach(btn => {
        btn.onclick = () => {
          const l = btn.dataset.lang;
          const id = btn.dataset.id;
          const key = 'custom' + l.charAt(0).toUpperCase() + l.slice(1);
          const arr = CFG.dict[key] || [];
          const idx = arr.findIndex(d => d.id === id);
          if (idx >= 0) arr.splice(idx, 1);
          saveCfg(CFG); render();
        };
      });
      const addDictBtn = box.querySelector('.il-dict-add');
      if (addDictBtn) addDictBtn.onclick = () => {
        const name = box.querySelector('.il-dict-new-name').value.trim();
        const url = box.querySelector('.il-dict-new-url').value.trim();
        const l = box.querySelector('.il-dict-new-lang').value;
        if (!name || !url.includes('{palabra}')){ toast(t('siteInvalid')); return; }
        const id = 'custom-' + Date.now();
        const key = 'custom' + l.charAt(0).toUpperCase() + l.slice(1);
        if (!Array.isArray(CFG.dict[key])) CFG.dict[key] = [];
        CFG.dict[key].push({ id: id, name: name, url: url, builtin: false });
        saveCfg(CFG); render();
      };
    }
    return { html, wire };
  }

  // «Abrir en…»: servicios a los que mandar la página. Vacío por defecto.
  function renderServiciosTab(){
    const servicios = serviciosConfigurados();
    const filas = servicios.map(svc =>
      '<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">' +
        '<div style="flex:1;font-size:13px">' + esc(svc.nombre) + '</div>' +
        '<div style="flex:2;font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' +
          esc(svc.plantilla) + '">' + esc(svc.plantilla) + '</div>' +
        '<button data-id="' + esc(svc.id) + '" class="il-svc-del" title="' + esc(t('serviciosQuitar')) +
          '" aria-label="' + esc(t('serviciosQuitar')) + '" ' +
          'style="border:none;background:transparent;cursor:pointer;color:var(--block);font-size:12px;padding:2px 6px">🗑</button>' +
      '</div>'
    ).join('');

    const html =
      '<div style="background:var(--quote-bg);border:1px solid var(--mark);border-radius:8px;padding:12px;margin-bottom:16px;' +
        'font-size:12px;color:var(--muted);line-height:1.6">' + esc(t('serviciosAyuda')) + '</div>' +
      '<div style="border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:16px">' +
        (filas || '<div style="padding:8px 0;font-size:13px;color:var(--muted)">' + esc(t('serviciosVacio')) + '</div>') +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">' +
        '<input class="il-svc-nombre" placeholder="' + esc(t('serviciosNombre')) + '" ' +
          'style="flex:1;min-width:120px;padding:8px 12px;border:1px solid var(--btn-border);border-radius:6px">' +
        '<input class="il-svc-plantilla" placeholder="https://…{url}" ' +
          'style="flex:2;min-width:200px;padding:8px 12px;border:1px solid var(--btn-border);border-radius:6px">' +
        '<button class="il-svc-add" style="padding:8px 14px;background:var(--accent);color:var(--on-solid);border:none;border-radius:6px;cursor:pointer">' +
          esc(t('add')) + '</button>' +
      '</div>' +
      '<label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-bottom:16px;cursor:pointer">' +
        '<input type="checkbox" class="il-svc-fab"' + (CFG.serviciosFab && CFG.serviciosFab.oculto ? '' : ' checked') + '> ' +
        esc(t('serviciosFab')) +
      '</label>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="il-svc-import" style="padding:8px 14px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer">' +
          esc(t('serviciosImportar')) + '</button>' +
        '<button class="il-svc-export" style="padding:8px 14px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer"' +
          (servicios.length ? '' : ' disabled') + '>' + esc(t('serviciosExportar')) + '</button>' +
      '</div>';

    const refrescarFab = actualizarBoton;

    function wire(){
      box.querySelectorAll('.il-svc-del').forEach(btn => {
        btn.onclick = () => {
          CFG.servicios = serviciosConfigurados().filter(svc => svc.id !== btn.dataset.id);
          saveCfg(CFG); render(); refrescarFab();
        };
      });
      box.querySelector('.il-svc-add').onclick = () => {
        const nombre = box.querySelector('.il-svc-nombre').value.trim();
        const plantilla = box.querySelector('.il-svc-plantilla').value.trim();
        if (!nombre || !plantillaServicioValida(plantilla)){ toast(t('serviciosInvalido'), 3200); return; }
        if (importarServicios([{ nombre, plantilla }]) < 1){ toast(t('serviciosRepetido'), 2400); return; }
        render(); refrescarFab();
      };
      box.querySelector('.il-svc-fab').onchange = e => {
        CFG.serviciosFab = { oculto: !e.target.checked };
        saveCfg(CFG); refrescarFab();
      };
      box.querySelector('.il-svc-import').onclick = () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = '.json,application/json';
        inp.onchange = () => {
          const f = inp.files[0]; if (!f) return;
          const r = new FileReader();
          r.onload = () => {
            let n = -1;
            try { n = importarServicios(JSON.parse(r.result)); } catch(e){}
            if (n < 0){ toast(t('serviciosFormato'), 3200); return; }
            toast(t('serviciosImportados').replace('{n}', n), 2400);
            render(); refrescarFab();
          };
          r.readAsText(f);
        };
        inp.click();
      };
      box.querySelector('.il-svc-export').onclick = () => {
        const lista = serviciosConfigurados().map(svc => ({ nombre: svc.nombre, plantilla: svc.plantilla }));
        const blob = new Blob([JSON.stringify({ servicios: lista }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'servicios.json';
        a.click();
        URL.revokeObjectURL(url);
      };
    }
    return { html, wire };
  }

  function renderShortcutsTab(){
    function keysHTML(keys){
      if (!Array.isArray(keys) || !keys.length){
        return '<em style="color:var(--muted)">' + esc(t('shortcutEmpty')) + '</em>';
      }
      return keys.map(k =>
        '<kbd style="display:inline-block;padding:2px 7px;border:1px solid var(--btn-border);border-radius:4px;' +
        'background:var(--btn-bg);font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;margin:0 4px 0 0">' +
        esc(formatShortcut(k)) + '</kbd>'
      ).join('');
    }

    function rowHTML(scope, action){
      const keys = CFG.shortcuts[scope][action] || [];
      const isReserved = (scope === 'reader' && action === 'close');
      const isCapturing = scState.capture
        && scState.capture.scope === scope
        && scState.capture.action === action;
      const display = isCapturing
        ? '<em style="color:var(--accent)">' + esc(t('shortcutCapture')) + '</em>'
        : keysHTML(keys);
      return '<div class="il-sc-row" data-scope="' + scope + '" data-action="' + action + '" ' +
        'style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">' +
        '<div style="flex:1;font-size:13px">' + esc(shortcutActionLabel(action)) + '</div>' +
        '<div style="flex:1;text-align:right">' + display + '</div>' +
        (isReserved
          ? '<span style="font-size:11px;color:var(--muted);min-width:180px">' + esc(t('shortcutReservedNote')) + '</span>'
          : '<button class="il-sc-edit" data-scope="' + scope + '" data-action="' + action + '" ' +
              'style="border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer;padding:4px 8px;font-size:12px">✏️</button>' +
            '<button class="il-sc-del" data-scope="' + scope + '" data-action="' + action + '" ' +
              'style="border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer;padding:4px 8px;font-size:12px">🗑</button>'
        ) +
      '</div>';
    }

    const readerActions = Object.keys(DEFAULT_CFG.shortcuts.reader);
    const globalActions = Object.keys(DEFAULT_CFG.shortcuts.global);

    const html =
      '<div style="background:var(--quote-bg);border:1px solid var(--mark);border-radius:8px;padding:12px;' +
        'margin-bottom:16px;font-size:12px;color:var(--muted);line-height:1.7">' +
        '<strong>' + esc(t('shortcutNoteTitle')) + '</strong><br>' +
        '• ' + esc(t('shortcutNoteReader')) + '<br>' +
        '• ' + esc(t('shortcutNoteGlobal')) + '<br>' +
        '• ' + esc(t('shortcutNoteCapture')) + '<br>' +
        '• ' + esc(t('shortcutReservedNote')) +
      '</div>' +
      '<div style="display:flex;justify-content:flex-end;margin-bottom:16px">' +
        '<button class="il-sc-reset" style="padding:6px 12px;border:1px solid var(--btn-border);background:var(--bg);' +
          'border-radius:6px;cursor:pointer;font-size:12px;color:var(--block)">' + esc(t('shortcutReset')) + '</button>' +
      '</div>' +
      '<div style="margin-bottom:22px">' +
        '<h3 style="font-size:13px;margin:0 0 8px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">' +
          esc(t('shortcutReader')) + '</h3>' +
        '<div style="border:1px solid var(--border);border-radius:8px;padding:0 12px">' +
          readerActions.map(a => rowHTML('reader', a)).join('') +
        '</div>' +
      '</div>' +
      '<div>' +
        '<h3 style="font-size:13px;margin:0 0 8px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">' +
          esc(t('shortcutGlobal')) + '</h3>' +
        '<div style="border:1px solid var(--border);border-radius:8px;padding:0 12px">' +
          globalActions.map(a => rowHTML('global', a)).join('') +
        '</div>' +
      '</div>';

    function wire(){
      box.querySelectorAll('.il-sc-edit').forEach(btn => {
        btn.onclick = () => {
          scState.capture = { scope: btn.dataset.scope, action: btn.dataset.action };
          render();
        };
      });
      box.querySelectorAll('.il-sc-del').forEach(btn => {
        btn.onclick = () => {
          const scope = btn.dataset.scope, action = btn.dataset.action;
          CFG.shortcuts[scope][action] = [];
          saveCfg(CFG);
          render();
        };
      });
      const resetBtn = box.querySelector('.il-sc-reset');
      if (resetBtn) resetBtn.onclick = () => {
        if (!confirm(t('shortcutResetConfirm'))) return;
        CFG.shortcuts = deepClone(DEFAULT_CFG.shortcuts);
        saveCfg(CFG);
        render();
      };

      if (scState.capture && !scListener){
        scListener = (e) => {
          if (!scState.capture) return;
          e.stopImmediatePropagation();
          e.preventDefault();

          if (e.key === 'Escape'){
            scState.capture = null;
            render();
            return;
          }
          if (e.key === 'Backspace' || e.key === 'Delete'){
            CFG.shortcuts[scState.capture.scope][scState.capture.action] = [];
            saveCfg(CFG);
            toast(t('shortcutCleared'), 1500);
            scState.capture = null;
            render();
            return;
          }
          if (['Control','Alt','Shift','Meta','OS'].includes(e.key)) return;

          const nk = normalizeKey(e);
          const scope  = scState.capture.scope;
          const action = scState.capture.action;

          if (RESERVED_BROWSER_KEYS.has(nk)){
            toast(t('shortcutReservedKey'), 2400);
            return;
          }
          if (scope === 'global' && !hasSafeModifier(nk)){
            toast(t('shortcutNeedsModifier'), 2600);
            return;
          }
          const conflict = findShortcutConflict(scope, action, nk);
          if (conflict){
            toast(t('shortcutConflict').replace('{X}', shortcutActionLabel(conflict)), 2600);
            return;
          }

          CFG.shortcuts[scope][action] = [nk];
          saveCfg(CFG);
          toast(t('shortcutSaved').replace('{X}', formatShortcut(nk)), 1500);
          scState.capture = null;
          render();
        };
        document.addEventListener('keydown', scListener, true);
      } else if (!scState.capture && scListener){
        document.removeEventListener('keydown', scListener, true);
        scListener = null;
      }
    }

    return { html, wire };
  }

  function renderGeneralTab(){
    const html =
      '<div style="margin-bottom:18px">' +
        '<label style="display:block;font-size:12px;color:var(--muted);text-transform:uppercase;margin-bottom:6px">' + esc(t('language')) + '</label>' +
        '<select class="il-set-lang-app" style="padding:8px 12px;border:1px solid var(--btn-border);border-radius:6px">' +
          '<option value="es"' + (CFG.lang==='es'?' selected':'') + '>Español</option>' +
          '<option value="gl"' + (CFG.lang==='gl'?' selected':'') + '>Galego</option>' +
          '<option value="ca"' + (CFG.lang==='ca'?' selected':'') + '>Català</option>' +
          '<option value="en"' + (CFG.lang==='en'?' selected':'') + '>English</option>' +
          '<option value="eu"' + (CFG.lang==='eu'?' selected':'') + '>Euskara</option>' +
        '</select>' +
      '</div>' +
      '<div style="margin-bottom:18px;padding:14px;border:2px solid ' + (CFG.readerAutoAll ? 'var(--preset)' : 'var(--btn-border)') + ';border-radius:8px;background:' + (CFG.readerAutoAll ? 'var(--preset-bg)' : 'var(--quote-bg)') + '">' +
        '<label style="display:flex;align-items:flex-start;gap:12px;cursor:pointer">' +
          '<input type="checkbox" class="il-set-auto-all"' + (CFG.readerAutoAll ? ' checked' : '') + ' style="margin-top:3px;width:18px;height:18px;cursor:pointer;flex:0 0 auto">' +
          '<span>' +
            '<span style="display:block;font-weight:bold;font-size:14px;color:' + (CFG.readerAutoAll ? 'var(--preset)' : 'var(--fg)') + '">' +
              (CFG.readerAutoAll ? '🟢 ACTIVADO — ' : '⚪ DESACTIVADO — ') +
              esc(t('readerAutoAllLabel')) +
            '</span>' +
            '<span style="display:block;font-size:12px;color:var(--muted);margin-top:4px">' + esc(t('readerAutoAllHint')) + '</span>' +
          '</span>' +
        '</label>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid var(--border);padding-top:14px">' +
        '<button class="il-set-export" style="padding:8px 14px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer">' + esc(t('exportBtn')) + '</button>' +
        '<button class="il-set-import" style="padding:8px 14px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer">' + esc(t('importBtn')) + '</button>' +
        '<button class="il-set-reset"  style="padding:8px 14px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer;color:var(--block);margin-left:auto">' + esc(t('resetBtn')) + '</button>' +
      '</div>';

    function wire(){
      const appLangSel = box.querySelector('.il-set-lang-app');
      if (appLangSel) appLangSel.onchange = e => {
        CFG.lang = e.target.value;
        saveCfg(CFG);
        render();
        actualizarBoton();
      };

      const autoAllChk = box.querySelector('.il-set-auto-all');
      if (autoAllChk) autoAllChk.onchange = () => {
        CFG.readerAutoAll = autoAllChk.checked;
        saveCfg(CFG);
        actualizarBoton();
        toast(CFG.readerAutoAll ? t('readerAutoAllOn') : t('readerAutoAllOff'), 1800);
        render();
      };

      box.querySelector('.il-set-export').onclick = () => {
        const data = JSON.stringify(Object.assign({}, CFG, { _version: SCRIPT_VERSION }), null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'lector-universal-config.json';
        a.click();
        URL.revokeObjectURL(url);
      };
      box.querySelector('.il-set-import').onclick = () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = '.json,application/json';
        inp.onchange = () => {
          const f = inp.files[0]; if (!f) return;
          const r = new FileReader();
          r.onload = () => {
            try {
              const data = JSON.parse(r.result);

              if (data._app === 'voceiro'){
                const importData = {};
                if (Array.isArray(data.sites))                 importData.sites = data.sites;
                if (Array.isArray(data.disabledDomains))       importData.disabledDomains = data.disabledDomains;
                if (data.prefs && typeof data.prefs === 'object') importData.prefs = data.prefs;
                if (typeof data.lang === 'string')             importData.lang = data.lang;
                if (typeof data.readerAutoAll === 'boolean')   importData.readerAutoAll = data.readerAutoAll;
                if (data.readerSettings && typeof data.readerSettings === 'object')
                  importData.readerSettings = data.readerSettings;
                CFG = mergeCfg(DEFAULT_CFG, importData);
                saveCfg(CFG);
                toast('✅ Configuración de Voceiro importada', 2400);
                render();
                return;
              }

              if (data._version && data._version !== SCRIPT_VERSION){
                toast(t('exportWarningVersion'), 3200);
              }
              delete data._version;
              CFG = mergeCfg(DEFAULT_CFG, data);
              saveCfg(CFG);
              render();
            } catch(e){ toast('Error: ' + e.message); }
          };
          r.readAsText(f);
        };
        inp.click();
      };
      box.querySelector('.il-set-reset').onclick = () => {
        if (!confirm(t('confirmReset'))) return;
        CFG = migrateCfg(deepClone(DEFAULT_CFG));
        saveCfg(CFG);
        render();
      };
    }

    return { html, wire };
  }

  function render(){
    const tabsHTML =
      '<div style="display:flex;gap:4px;border-bottom:1px solid var(--border);margin-bottom:18px;flex-wrap:wrap">' +
        tabBtn('sites', t('sites')) +
        tabBtn('pendientes', t('pendientes')) +
        tabBtn('dict', t('dictionaries')) +
        tabBtn('servicios', t('abrirEn')) +
        tabBtn('shortcuts', t('shortcuts')) +
        tabBtn('general', t('settings')) +
      '</div>';

    const headerHTML = dentro ? '' :
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
        '<h2 style="margin:0;font-size:20px">' + esc(t('settings')) + '</h2>' +
        '<button class="il-set-close" style="padding:8px 14px;border:1px solid var(--btn-border);background:var(--bg);border-radius:6px;cursor:pointer">' + esc(t('close')) + '</button>' +
      '</div>';

    let payload;
    if (activeSection === 'sites')         payload = renderSitesTab();
    else if (activeSection === 'pendientes') payload = renderPendientesTab();
    else if (activeSection === 'dict')       payload = renderDictTab();
    else if (activeSection === 'servicios')  payload = renderServiciosTab();
    else if (activeSection === 'shortcuts')  payload = renderShortcutsTab();
    else                                     payload = renderGeneralTab();

    box.innerHTML = headerHTML + tabsHTML + payload.html;

    const cerrar = box.querySelector('.il-set-close');
    if (cerrar) cerrar.onclick = closeSettings;
    box.querySelectorAll('.il-set-tab').forEach(b => {
      b.onclick = () => { activeSection = b.dataset.tab; render(); };
    });

    payload.wire();
  }

  render();
  if (!dentro) box.focus({ preventScroll: true });
}

/* ============================================================
   25. ATAJOS GLOBALES
   ============================================================ */
function executeGlobalAction(action){
  switch (action){
    case 'openReader': {
      if (document.getElementById('il-full')) return;
      activateReader();
      break;
    }
    case 'openQueue':    openSettings('pendientes'); break;
    case 'openMedia':    openSettings('sites'); break;
    case 'openSettings': openSettings(); break;
    case 'abrirEn': {
      const existing = document.getElementById('il-global-servicios-dd');
      if (existing){ existing.remove(); return; }
      const dd = crearDesplegableServicios({ position: 'fixed-top-right', onClose: () => dd.remove() });
      dd.id = 'il-global-servicios-dd';
      document.body.appendChild(dd);
      setTimeout(() => {
        const close = (ev) => {
          if (!dd.contains(ev.target)){
            dd.remove();
            document.removeEventListener('mousedown', close);
          }
        };
        document.addEventListener('mousedown', close);
      }, 0);
      break;
    }
    case 'toggleTextOnly': {
      // Sin imágenes en este medio, o vuelta a lo de todos los medios.
      const rule = ensureSiteRule();
      const sinImagenes = rule.imagenes !== 'ninguna';
      if (sinImagenes) rule.imagenes = 'ninguna'; else delete rule.imagenes;
      saveCfg(CFG);
      if (__lectorAbierto) __lectorAbierto.refrescar();
      toast(sinImagenes ? t('textOnlyOn') : t('textOnlyOff'), 1500);
      break;
    }
    case 'openVoceiro': {
      window.open(VOCEIRO_URL, '_blank', 'noopener,noreferrer');
      break;
    }
  }
}

function globalKeyHandler(e){
  // En Voceiro mandan sus atajos (Alt+P, Alt+M, Alt+B…): los del lector
  // no actúan allí. La revisión completa de atajos, antes de publicar.
  if (esVoceiro()) return;
  const tg = e.target;
  if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
  if (document.getElementById('il-settings')) return;
  if (document.getElementById('il-extract-tool')) return;
  if (isPickerActive()) return;

  const nk = normalizeKey(e);
  if (!hasSafeModifier(nk)) return;

  const action = findActionByKey('global', nk);
  if (!action) return;
  e.preventDefault();
  e.stopPropagation();
  executeGlobalAction(action);
}

/* ============================================================
   26. MENÚS GM + INIT + SPA
   ============================================================ */
let __menusRegistered = false;
function registerMenus(){
  if (__menusRegistered) return;
  if (!PLATAFORMA.hayMenu()) return;
  __menusRegistered = true;
  PLATAFORMA.menu('📰 ' + t('scOpenVoceiro'), () => {
    window.open(VOCEIRO_URL, '_blank', 'noopener,noreferrer');
  });
  PLATAFORMA.menu(t('openReader'), () => activateReader());
  PLATAFORMA.menu(t('openMedias'), () => openSettings('sites'));
  PLATAFORMA.menu(t('pendientes'), () => openSettings('pendientes'));
  PLATAFORMA.menu(t('openSettings'), () => openSettings());
  PLATAFORMA.menu(t('addCurrent'), () => {
    const d = normalizeDomain(location.hostname);
    if (CFG.sites.some(s => s.domain === d)){ toast(t('alreadyInList')); return; }
    addSiteAnywhere(d);
    saveCfg(CFG);
    toast(t('addedTo') + ' ' + d);
    actualizarBoton();
  });
  PLATAFORMA.menu(t('removeCurrent'), () => {
    const d = normalizeDomain(location.hostname);
    const before = CFG.sites.length;
    CFG.sites = CFG.sites.filter(s => s.domain !== d);
    if (CFG.sites.length < before){
      disableDomain(d);
      saveCfg(CFG);
      toast(t('removedFrom') + ' ' + d);
      actualizarBoton();
    } else {
      toast(t('notInList'));
    }
  });
  PLATAFORMA.menu(t('ignoreSectionMenu'), () => ignoreCurrentSection());
  PLATAFORMA.menu('↗ ' + t('abrirEn') + ' — ' + t('serviciosFabMenu'), () => {
    CFG.serviciosFab = CFG.serviciosFab || { oculto: false };
    CFG.serviciosFab.oculto = !CFG.serviciosFab.oculto;
    saveCfg(CFG);
    actualizarBoton();
    toast(t(CFG.serviciosFab.oculto ? 'serviciosFabOculto' : 'serviciosFabVisible'), 2000);
  });
  // El botón se oculta por medio desde su propio menú; aquí se recupera.
  PLATAFORMA.menu(t('fabMostrarAqui'), () => {
    ocultarBotonAqui(false);
    if (!document.getElementById(FAB_ID)) toast(t('fabNadaAqui'), 2400);
  });
}

function shouldActivateHere(){
  if (isPlainDomain()) return false;
  if (isDomainDisabled(location.hostname)) return false;
  const rule = findSiteRule();
  if (rule && rule.mode === 'off') return false;
  if (rule && isIgnoredSection(rule)) return false;

  if (CFG.readerAutoAll){
    if (rule) return true;
    return isKnownMediaDomain(location.hostname) && isArticlePage();
  }

  return !!(rule && rule.mode === 'auto');
}

function init(){
  registerMenus();

  if (isDomainDisabled(location.hostname)) return;

  const goBoton = () => actualizarBoton();
  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(goBoton, 250);
  else window.addEventListener('load', () => setTimeout(goBoton, 250));

  // Llegando desde «Siguiente pendiente», el lector se abre solo.
  if (llegaDeSiguientePendiente() || shouldActivateHere()){
    const go = () => activateReader();
    if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(go, 400);
    else window.addEventListener('load', () => setTimeout(go, 400));
  }
}

let __lastHref = location.href;
function checkUrlChange(){
  if (location.href === __lastHref) return;
  __lastHref = location.href;
  if (document.getElementById('il-full')) return;
  actualizarBoton();

  const attempt = (delay) => setTimeout(() => {
    if (document.getElementById('il-full')) return;
    actualizarBoton();
    if (isDomainDisabled(location.hostname)) return;
    if (shouldActivateHere()) init();
  }, delay);
  attempt(400);
  attempt(1600);
}
['pushState','replaceState'].forEach(m => {
  const orig = history[m];
  history[m] = function(){
    const r = orig.apply(this, arguments);
    setTimeout(checkUrlChange, 60);
    return r;
  };
});
window.addEventListener('popstate', () => setTimeout(checkUrlChange, 60));

document.addEventListener('keydown', globalKeyHandler, true);

/* ═══════════════════════════════════════════════════════════════
   PUENTE CON VOCEIRO (v2)
   ═══════════════════════════════════════════════════════════════
   Solo existe en la página de Voceiro. Eventos en document, uno por
   sentido para que nadie se oiga a sí mismo:
     · 'voceiro-ping'   Voceiro → lector; se responde 'voceiro-pong' {v}.
     · 'voceiro-ready'  lector → Voceiro, al arrancar {v}.
     · 'voceiro-estado' Voceiro → lector {v, respuesta, pendientes, perfil, lector,
                        leidasHasta}.
     · 'lector-estado'  lector → Voceiro {…, leidas}: lo terminado en el lector
                        (11-pendientes.js); Voceiro lo confirma con leidasHasta.
     · 'voceiro-ajustes-lector' Voceiro → lector {v, dominio?}: pinta tus
                        ajustes en #aj-lector-panel (página Lector de Ajustes);
                        con dominio («Cómo leerlo»), en Medios y con ese medio.
   Pendientes y perfil se fusionan con shared/sync/fusion.js. «lector» es
   la configuración propia del lector: Voceiro la guarda sin mirarla y la
   lleva a otros dispositivos con su sincronización; gana la más reciente.
   Cada lado contesta una vez, si lo suyo no coincide y el mensaje no era
   ya una respuesta: tras ese ida y vuelta, coinciden.
   ─────────────────────────────────────────────────────────────── */
const PUENTE_V = 2;

function estadoDelLector(respuesta){
  return {
    v: PUENTE_V, respuesta: !!respuesta,
    pendientes: CFG.readLater || [], perfil: perfilDelLector(), lector: bloqueConfigLector(),
    leidas: CFG.leidasParaVoceiro || []
  };
}

function comparableEstado(d){
  return huella({
    pendientes: fusionarPendientes(d && d.pendientes, []),
    perfil: limpiarPerfil(d && d.perfil),
    lector: d && d.lector ? { datos: d.lector.datos, actualizado: d.lector.actualizado || 0 } : null
  });
}

function enviarEstado(respuesta){
  if (!esVoceiro()) return;
  try {
    document.dispatchEvent(new CustomEvent('lector-estado', {
      detail: JSON.parse(JSON.stringify(estadoDelLector(respuesta)))
    }));
  } catch(e){}
}

// Volver a Voceiro: la pestaña que se cierra lo apunta aquí y la de Voceiro,
// al enterarse, se pone delante (si el gestor sabe hacerlo).
const VOLVER_KEY = 'lector-volver-a-voceiro';

(function initVoceiroBridge(){
  if (window.__voceiroBridgeReady) return;
  window.__voceiroBridgeReady = true;

  // Cambios hechos en otra pestaña: CFG se refresca en todas las páginas;
  // a Voceiro se le mandan solo en la suya (enviarEstado lo comprueba).
  PLATAFORMA.alCambiar(CFG_KEY, nuevo => {
    CFG = mergeCfg(DEFAULT_CFG, nuevo);
    __perfilFirma = firmaPerfilLector(CFG);
    __configFirma = firmaConfig(CFG);
    if (__lectorAbierto) __lectorAbierto.refrescar();
    actualizarBoton();
    enviarEstado(false);
  });

  // Lo demás solo existe en Voceiro.
  if (!esVoceiro()) return;

  PLATAFORMA.alCambiar(VOLVER_KEY, () => PLATAFORMA.enfocarPestana());

  // Página Lector de Ajustes de Voceiro: deja un hueco y avisa; el panel de
  // ajustes del lector se pinta ahí (una vez: si ya está, no se repite).
  // Con dominio se vuelve a pintar, en Medios y con ese medio delante.
  document.addEventListener('voceiro-ajustes-lector', e => {
    const d = e.detail;
    if (!d || d.v !== PUENTE_V) return;
    const hueco = document.getElementById('aj-lector-panel');
    if (!hueco) return;
    const dominio = typeof d.dominio === 'string' ? normalizeDomain(d.dominio) : '';
    if (dominio){
      const viejo = hueco.querySelector('.il-settings-dentro');
      if (viejo) viejo.remove();
    }
    openSettings('sites', { dentro: hueco, dominio });
  });

  document.addEventListener('voceiro-ping', () => {
    document.dispatchEvent(new CustomEvent('voceiro-pong', { detail: { v: PUENTE_V } }));
  });

  document.addEventListener('voceiro-estado', e => {
    const d = e.detail;
    if (!d || typeof d !== 'object' || d.v !== PUENTE_V) return;

    CFG.readLater = fusionarPendientes(CFG.readLater, d.pendientes);

    // Un perfil sin sellar no se impone: se unifican con el primer cambio.
    const mio = perfilDelLector();
    const perfil = fusionarPerfil(mio, d.perfil);
    if (perfil && perfil.actualizado > 0 && huella(perfil) !== huella(mio)) aplicarPerfilAlLector(perfil);

    // Configuración que llega de otro dispositivo: solo si es más nueva.
    const mia = bloqueConfigLector();
    const llega = d.lector;
    if (llega && llega.datos && (llega.actualizado || 0) > (mia.actualizado || 0)){
      aplicarBloqueConfig(llega);
    }

    // Leídas que Voceiro ya tiene: fuera. Si quedan, se le vuelven a mandar.
    leidasConfirmadas(d.leidasHasta);

    saveCfg(CFG);
    if (__lectorAbierto) __lectorAbierto.refrescar();
    if (!d.respuesta && (comparableEstado(estadoDelLector()) !== comparableEstado(d) ||
                         hayLeidasSinAvisar(d.leidasHasta))){
      enviarEstado(true);
    }
  });

  try {
    document.dispatchEvent(new CustomEvent('voceiro-ready', { detail: { v: PUENTE_V } }));
  } catch(e){}
})();

if (document.body) init();
else window.addEventListener('DOMContentLoaded', init);

})();