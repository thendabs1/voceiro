// ==UserScript==
// @name         Lector Universal
// @namespace    https://thendabs1.github.io/voceiro/
// @version      2.0.4
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
// @require      https://cdn.jsdelivr.net/npm/@mozilla/readability@0.5.0/Readability.js
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function(){
'use strict';

/* ============================================================
   1. CONSTANTES
   ============================================================ */
const SCRIPT_VERSION = '2.0.4';
const AUTO_MIN_RATIO = 0.80;
const AUTO_MIN_RICH  = 3;
const AUTO_MIN_LEN   = 300;
const READER_SOURCES = ['auto','jsonld','readability','custom'];
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
const CAMPOS_PERFIL = ['lang', 'tema', 'fuente', 'fs', 'just', 'bionic', 'focus'];

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

// Perfil de lectura común: los campos de CAMPOS_PERFIL más `actualizado`.
function limpiarPerfil(p){
  if (!p || typeof p !== 'object') return null;
  const out = {};
  for (const k of CAMPOS_PERFIL) if (p[k] !== undefined) out[k] = p[k];
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

/* ============================================================
   1c. CATÁLOGO DE MEDIOS
   ------------------------------------------------------------
   ► PEGA AQUÍ TU BLOQUE MEDIA_CATALOG COMPLETO ◄
     (el mismo que ya tienes, sin cambios)
   ============================================================ */
const MEDIA_CATALOG = [
  // ============================================================
  // ESPAÑA · NACIONALES GENERALISTAS
  // ============================================================
  { group:'España · Nacionales', items:[
    { d:'elpais.com',          n:'El País',              lang:'es', type:'diario',  tags:['generalista','nacional'] },
    { d:'elmundo.es',          n:'El Mundo',             lang:'es', type:'diario',  tags:['generalista','nacional'] },
    { d:'abc.es',              n:'ABC',                  lang:'es', type:'diario',  tags:['generalista','nacional','conservador'] },
    { d:'lavanguardia.com',    n:'La Vanguardia',        lang:'es', type:'diario',  tags:['generalista','nacional','catalan'] },
    { d:'elperiodico.com',     n:'El Periódico',         lang:'es', type:'diario',  tags:['generalista','nacional','catalan'] },
    { d:'larazon.es',          n:'La Razón',             lang:'es', type:'diario',  tags:['generalista','nacional','conservador'] },
    { d:'20minutos.es',        n:'20 Minutos',           lang:'es', type:'diario',  tags:['generalista','gratuito'] },
    { d:'que.es',              n:'Qué!',                 lang:'es', type:'diario',  tags:['generalista','gratuito'] },

    // Nativos digitales
    { d:'elconfidencial.com',  n:'El Confidencial',      lang:'es', type:'digital', tags:['generalista','digital'] },
    { d:'eldiario.es',         n:'elDiario.es',          lang:'es', type:'digital', tags:['generalista','digital','progresista'] },
    { d:'elespanol.com',       n:'El Español',           lang:'es', type:'digital', tags:['generalista','digital'] },
    { d:'publico.es',          n:'Público',              lang:'es', type:'digital', tags:['generalista','digital','progresista'] },
    { d:'vozpopuli.com',       n:'Vozpópuli',            lang:'es', type:'digital', tags:['generalista','digital'] },
    { d:'okdiario.com',        n:'OK Diario',            lang:'es', type:'digital', tags:['generalista','digital','conservador'] },
    { d:'huffingtonpost.es',   n:'El HuffPost',          lang:'es', type:'digital', tags:['generalista','digital','progresista'] },
    { d:'elplural.com',        n:'El Plural',            lang:'es', type:'digital', tags:['generalista','digital','progresista'] },
    { d:'infolibre.es',        n:'InfoLibre',            lang:'es', type:'digital', tags:['generalista','digital','progresista'] },
    { d:'eldebate.com',        n:'El Debate',            lang:'es', type:'digital', tags:['generalista','digital','conservador'] },
    { d:'theobjective.com',    n:'The Objective',        lang:'es', type:'digital', tags:['generalista','digital'] },
    { d:'libertaddigital.com', n:'Libertad Digital',     lang:'es', type:'digital', tags:['generalista','digital','liberal'] },
    { d:'elindependiente.com', n:'El Independiente',     lang:'es', type:'digital', tags:['generalista','digital'] },
    { d:'moncloa.com',         n:'Moncloa',              lang:'es', type:'digital', tags:['generalista','digital'] },

    // TV y Radio
    { d:'rtve.es',             n:'RTVE',                 lang:'es', type:'tv',      tags:['generalista','publico','tv','radio'] },
    { d:'antena3.com',         n:'Antena 3',             lang:'es', type:'tv',      tags:['generalista','privado','tv'] },
    { d:'telecinco.es',        n:'Telecinco',            lang:'es', type:'tv',      tags:['generalista','privado','tv'] },
    { d:'lasexta.com',         n:'La Sexta',             lang:'es', type:'tv',      tags:['generalista','privado','tv'] },
    { d:'cuatro.com',          n:'Cuatro',               lang:'es', type:'tv',      tags:['generalista','privado','tv'] },
    { d:'cadenaser.com',       n:'Cadena SER',           lang:'es', type:'radio',   tags:['generalista','radio'] },
    { d:'cope.es',             n:'COPE',                 lang:'es', type:'radio',   tags:['generalista','radio','conservador'] },
    { d:'ondacero.es',         n:'Onda Cero',            lang:'es', type:'radio',   tags:['generalista','radio'] },

    // Agencias
    { d:'europapress.es',      n:'Europa Press',         lang:'es', type:'agencia', tags:['agencia','nacional'] },
    { d:'efe.com',             n:'Agencia EFE',          lang:'es', type:'agencia', tags:['agencia','nacional'] },
    { d:'servimedia.es',       n:'Servimedia',           lang:'es', type:'agencia', tags:['agencia','social'] },
    { d:'colpisa.com',         n:'Agencia Colpisa',      lang:'es', type:'agencia', tags:['agencia','nacional'] },
  ]},

  // ============================================================
  // ESPAÑA · DEPORTIVOS
  // ============================================================
  { group:'España · Deportivos', items:[
    { d:'marca.com',           n:'Marca',                lang:'es', type:'deportivo', tags:['deportes','futbol'] },
    { d:'as.com',              n:'Diario AS',            lang:'es', type:'deportivo', tags:['deportes','futbol'] },
    { d:'mundodeportivo.com',  n:'Mundo Deportivo',      lang:'es', type:'deportivo', tags:['deportes','futbol','catalan'] },
    { d:'sport.es',            n:'Sport',                lang:'es', type:'deportivo', tags:['deportes','futbol','catalan'] },
    { d:'superdeporte.es',     n:'Superdeporte',         lang:'es', type:'deportivo', tags:['deportes','valencia'] },
    { d:'estadiodeportivo.com',n:'Estadio Deportivo',    lang:'es', type:'deportivo', tags:['deportes','andalucia'] },
    { d:'eldesmarque.com',     n:'El Desmarque',         lang:'es', type:'deportivo', tags:['deportes','digital'] },
    { d:'relevo.com',          n:'Relevo',               lang:'es', type:'deportivo', tags:['deportes','digital'] },
    { d:'palco23.com',         n:'Palco23',              lang:'es', type:'deportivo', tags:['deportes','negocio'] },
    { d:'2playbook.com',       n:'2Playbook',            lang:'es', type:'deportivo', tags:['deportes','negocio'] },
  ]},

  // ============================================================
  // ESPAÑA · ECONÓMICOS
  // ============================================================
  { group:'España · Económicos', items:[
    { d:'expansion.com',       n:'Expansión',            lang:'es', type:'economico', tags:['economia','negocios'] },
    { d:'cincodias.com',       n:'Cinco Días',           lang:'es', type:'economico', tags:['economia','negocios'] },
    { d:'eleconomista.es',     n:'El Economista',        lang:'es', type:'economico', tags:['economia','negocios'] },
    { d:'economiadigital.es',  n:'Economía Digital',     lang:'es', type:'economico', tags:['economia','digital'] },
    { d:'lainformacion.com',   n:'La Información',       lang:'es', type:'digital',   tags:['economico','digital'] },
    { d:'libremercado.com',    n:'Libre Mercado',        lang:'es', type:'economico', tags:['economia','liberal'] },
    { d:'invertia.com',        n:'Invertia',             lang:'es', type:'economico', tags:['economia','mercados'] },
    { d:'bolsamania.com',      n:'Bolsamania',           lang:'es', type:'economico', tags:['economia','mercados'] },
  ]},

  // ============================================================
  // ESPAÑA · TECNOLOGÍA
  // ============================================================
  { group:'España · Tecnología', items:[
    { d:'xataka.com',          n:'Xataka',               lang:'es', type:'tecnologia', tags:['tecnologia','gadgets'] },
    { d:'genbeta.com',         n:'Genbeta',              lang:'es', type:'tecnologia', tags:['tecnologia','software'] },
    { d:'applesfera.com',      n:'Applesfera',           lang:'es', type:'tecnologia', tags:['tecnologia','apple'] },
    { d:'computerhoy.com',     n:'Computer Hoy',         lang:'es', type:'tecnologia', tags:['tecnologia'] },
    { d:'hipertextual.com',    n:'Hipertextual',         lang:'es', type:'tecnologia', tags:['tecnologia','cultura'] },
    { d:'adslzone.net',        n:'ADSLZone',             lang:'es', type:'tecnologia', tags:['tecnologia','internet'] },
  ]},

  // ============================================================
  // ESPAÑA · CULTURALES / REVISTAS
  // ============================================================
  { group:'España · Culturales', items:[
    { d:'jotdown.es',          n:'Jot Down',             lang:'es', type:'revista', tags:['cultural','entrevistas'] },
    { d:'elcultural.com',      n:'El Cultural',          lang:'es', type:'revista', tags:['cultural'] },
    { d:'zendalibros.com',     n:'Zenda Libros',         lang:'es', type:'revista', tags:['cultural','libros'] },
    { d:'letraslibres.com',    n:'Letras Libres',        lang:'es', type:'revista', tags:['cultural','literatura'] },
    { d:'ethic.es',            n:'Ethic',                lang:'es', type:'revista', tags:['cultural','sociedad'] },
    { d:'yorokobu.es',         n:'Yorokobu',             lang:'es', type:'revista', tags:['cultural','creatividad'] },
    { d:'elsaltodiario.com',   n:'El Salto',             lang:'es', type:'digital', tags:['generalista','digital','progresista'] },
    { d:'lamarea.com',         n:'La Marea',             lang:'es', type:'revista', tags:['cultural','progresista'] },
    { d:'ctxt.es',             n:'CTXT',                 lang:'es', type:'revista', tags:['cultural','investigacion'] },
    { d:'alternativaseconomicas.coop', n:'Alternativas Económicas', lang:'es', type:'revista', tags:['economia','social'] },
    { d:'revistamongolia.com', n:'Mongolia',             lang:'es', type:'revista', tags:['cultural','humor'] },
    { d:'critic.cat',          n:'Crític',               lang:'ca', type:'revista', tags:['cultural','investigacion'] },
    { d:'culturainquieta.com', n:'Cultura Inquieta',     lang:'es', type:'revista', tags:['cultural'] },
  ]},

  // ============================================================
  // AUTONÓMICOS · CATALUÑA
  // ============================================================
  { group:'Cataluña', items:[
    { d:'elpuntavui.cat',      n:'El Punt Avui',         lang:'ca', type:'diario',  tags:['generalista','catalan'] },
    { d:'ara.cat',             n:'Ara',                  lang:'ca', type:'diario',  tags:['generalista','catalan'] },
    { d:'naciodigital.cat',    n:'Nació Digital',        lang:'ca', type:'digital', tags:['generalista','digital'] },
    { d:'vilaweb.cat',         n:'VilaWeb',              lang:'ca', type:'digital', tags:['generalista','digital'] },
    { d:'elnacional.cat',      n:'El Nacional',          lang:'ca', type:'digital', tags:['generalista','digital'] },
    { d:'elmon.cat',           n:'El Món',               lang:'ca', type:'digital', tags:['generalista','digital'] },
    { d:'324.cat',             n:'324',                  lang:'ca', type:'tv',      tags:['generalista','tv','publico'] },
    { d:'ccma.cat',            n:'CCMA',                 lang:'ca', type:'tv',      tags:['generalista','tv','publico'] },
    { d:'rac1.cat',            n:'RAC1',                 lang:'ca', type:'radio',   tags:['generalista','radio'] },
    { d:'viaempresa.cat',      n:'Via Empresa',          lang:'ca', type:'economico', tags:['economia'] },
    { d:'acn.cat',             n:'Agència Catalana de Notícies', lang:'ca', type:'agencia', tags:['agencia','catalan'] },
  ]},

  // ============================================================
  // AUTONÓMICOS · GALICIA (VERIFICADOS Y AMPLIADOS)
  // ============================================================
  { group:'Galicia', items:[
    // Diarios de alcance autonómico y provincial
    { d:'lavozdegalicia.es',   n:'La Voz de Galicia',    lang:'es', type:'diario',  tags:['generalista','galicia'] },
    { d:'farodevigo.es',       n:'Faro de Vigo',         lang:'es', type:'diario',  tags:['generalista','galicia'] },
    { d:'elcorreogallego.es',  n:'El Correo Gallego',    lang:'es', type:'diario',  tags:['generalista','galicia'] },
    { d:'laregion.es',         n:'La Región',            lang:'es', type:'diario',  tags:['generalista','galicia','ourense'] },
    { d:'elprogreso.es',       n:'El Progreso',          lang:'es', type:'diario',  tags:['generalista','galicia','lugo'] },
    { d:'laopinioncoruna.es',  n:'La Opinión A Coruña',  lang:'es', type:'diario',  tags:['generalista','galicia','coruña'] },
    { d:'elidealgallego.com',  n:'El Ideal Gallego',     lang:'es', type:'diario',  tags:['generalista','galicia','coruña'] },
    { d:'diariodepontevedra.es', n:'Diario de Pontevedra', lang:'es', type:'diario', tags:['generalista','galicia','pontevedra'] },
    { d:'atlantico.net',       n:'Atlántico',            lang:'es', type:'diario',  tags:['generalista','galicia','vigo'] },
    { d:'diariodeferrol.com',  n:'Diario de Ferrol',     lang:'es', type:'diario',  tags:['generalista','galicia','ferrol'] },
    { d:'diariodearousa.com',  n:'Diario de Arousa',     lang:'es', type:'diario',  tags:['generalista','galicia','arousa'] },

    // Nativos Digitales Autonómicos y Análisis
    { d:'galiciaconfidencial.com', n:'Galicia Confidencial', lang:'gl', type:'digital', tags:['generalista','galicia'] },
    { d:'nosdiario.gal',       n:'Nós Diario',           lang:'gl', type:'digital', tags:['generalista','galicia'] },
    { d:'praza.gal',           n:'Praza Pública',        lang:'gl', type:'digital', tags:['generalista','galicia'] },
    { d:'galiciapress.es',     n:'Galicia Press',        lang:'es', type:'digital', tags:['generalista','galicia'] },
    { d:'mundiario.com',       n:'Mundiario',            lang:'es', type:'digital', tags:['generalista','galicia'] },
    { d:'galiciadigital.com',  n:'Galicia Digital',      lang:'es', type:'digital', tags:['generalista','galicia'] },

    // Digitales Locales y Comarcales
    { d:'pontevedraviva.com',  n:'Pontevedra Viva',      lang:'es', type:'digital', tags:['generalista','local','pontevedra'] },
    { d:'vigoe.es',            n:'Vigoé',                lang:'es', type:'digital', tags:['generalista','local','vigo'] },
    { d:'metropolitano.gal',   n:'Metropolitano',        lang:'es', type:'digital', tags:['generalista','local','vigo'] },
    { d:'ferrol360.es',        n:'Ferrol 360',           lang:'es', type:'digital', tags:['generalista','local','ferrol'] },

    // Deportes
    { d:'dxtcampeon.com',      n:'DxT Campeón',          lang:'es', type:'deportivo', tags:['deportes','galicia','coruña'] },
    { d:'riazor.org',          n:'Riazor.org',           lang:'es', type:'deportivo', tags:['deportes','galicia','coruña'] },

    // Radio y TV Autonómica
    { d:'crtvg.gal',           n:'CRTVG (TVG y Radio Galega)', lang:'gl', type:'tv', tags:['generalista','publico','galicia','radio'] },
    { d:'radiovoz.com',        n:'Radio Voz',            lang:'es', type:'radio',   tags:['generalista','privado','galicia'] },
  ]},

  // ============================================================
  // AUTONÓMICOS · PAÍS VASCO / NAVARRA
  // ============================================================
  { group:'País Vasco · Navarra', items:[
    { d:'elcorreo.com',        n:'El Correo',            lang:'es', type:'diario',  tags:['generalista','euskadi'] },
    { d:'diariovasco.com',     n:'Diario Vasco',         lang:'es', type:'diario',  tags:['generalista','euskadi'] },
    { d:'deia.eus',            n:'Deia',                 lang:'es', type:'diario',  tags:['generalista','euskadi'] },
    { d:'noticiasdegipuzkoa.eus', n:'Noticias de Gipuzkoa', lang:'es', type:'diario', tags:['generalista','euskadi'] },
    { d:'noticiasdealava.eus', n:'Noticias de Álava',    lang:'es', type:'diario',  tags:['generalista','euskadi'] },
    { d:'naiz.eus',            n:'Naiz',                 lang:'es', type:'digital', tags:['generalista','euskadi'] },
    { d:'berria.eus',          n:'Berria',               lang:'eu', type:'diario',  tags:['generalista','euskadi'] },
    { d:'eitb.eus',            n:'EITB',                 lang:'eu', type:'tv',      tags:['generalista','tv','publico'] },
    { d:'diariodenavarra.es',  n:'Diario de Navarra',    lang:'es', type:'diario',  tags:['generalista','navarra'] },
    { d:'noticiasdenavarra.es',n:'Noticias de Navarra',  lang:'es', type:'diario',  tags:['generalista','navarra'] },
  ]},

  // ============================================================
  // AUTONÓMICOS · ARAGÓN · LA RIOJA · CANTABRIA · ASTURIAS
  // ============================================================
  { group:'Norte · Aragón · La Rioja · Cantabria · Asturias', items:[
    { d:'heraldo.es',          n:'Heraldo de Aragón',    lang:'es', type:'diario',  tags:['generalista','aragon'] },
    { d:'elperiodicodearagon.com', n:'El Periódico de Aragón', lang:'es', type:'diario', tags:['generalista','aragon'] },
    { d:'larioja.com',         n:'La Rioja',             lang:'es', type:'diario',  tags:['generalista','rioja'] },
    { d:'eldiariomontanes.es', n:'El Diario Montañés',   lang:'es', type:'diario',  tags:['generalista','cantabria'] },
    { d:'lne.es',              n:'La Nueva España',      lang:'es', type:'diario',  tags:['generalista','asturias'] },
    { d:'elcomercio.es',       n:'El Comercio',          lang:'es', type:'diario',  tags:['generalista','asturias'] },
    { d:'lavozdeasturias.es',  n:'La Voz de Asturias',   lang:'es', type:'digital', tags:['generalista','asturias'] },
  ]},

  // ============================================================
  // AUTONÓMICOS · CASTILLA Y LEÓN
  // ============================================================
  { group:'Castilla y León', items:[
    { d:'elnortedecastilla.es',n:'El Norte de Castilla', lang:'es', type:'diario',  tags:['generalista','castillaleon'] },
    { d:'diariodeleon.es',     n:'Diario de León',       lang:'es', type:'diario',  tags:['generalista','castillaleon'] },
    { d:'diariodeburgos.es',   n:'Diario de Burgos',     lang:'es', type:'diario',  tags:['generalista','castillaleon'] },
    { d:'laopiniondezamora.es',n:'La Opinión de Zamora', lang:'es', type:'diario',  tags:['generalista','castillaleon'] },
    { d:'lagacetadesalamanca.es', n:'La Gaceta de Salamanca', lang:'es', type:'diario', tags:['generalista','castillaleon'] },
    { d:'diariodeavila.es',    n:'Diario de Ávila',      lang:'es', type:'diario',  tags:['generalista','castillaleon'] },
    { d:'eldiadevalladolid.com', n:'El Día de Valladolid', lang:'es', type:'diario', tags:['generalista','castillaleon'] },
  ]},

  // ============================================================
  // AUTONÓMICOS · CASTILLA-LA MANCHA
  // ============================================================
  { group:'Castilla-La Mancha', items:[
    { d:'lanzadigital.com',    n:'Lanza Digital',        lang:'es', type:'digital', tags:['generalista','clm'] },
    { d:'latribunadealbacete.es', n:'La Tribuna de Albacete', lang:'es', type:'diario', tags:['generalista','clm'] },
    { d:'latribunadeciudadreal.es', n:'La Tribuna de Ciudad Real', lang:'es', type:'diario', tags:['generalista','clm'] },
    { d:'encastillalamancha.es', n:'En Castilla-La Mancha', lang:'es', type:'digital', tags:['generalista','clm'] },
  ]},

  // ============================================================
  // AUTONÓMICOS · COMUNIDAD VALENCIANA · MURCIA
  // ============================================================
  { group:'Comunidad Valenciana · Murcia', items:[
    { d:'lasprovincias.es',    n:'Las Provincias',       lang:'es', type:'diario',  tags:['generalista','valencia'] },
    { d:'levante-emv.com',     n:'Levante-EMV',          lang:'es', type:'diario',  tags:['generalista','valencia'] },
    { d:'informacion.es',      n:'Información',          lang:'es', type:'diario',  tags:['generalista','alicante'] },
    { d:'elperiodicomediterraneo.com', n:'El Periódico Mediterráneo', lang:'es', type:'diario', tags:['generalista','castellon'] },
    { d:'valenciaplaza.com',   n:'Valencia Plaza',       lang:'es', type:'digital', tags:['economia','valencia'] },
    { d:'laverdad.es',         n:'La Verdad',            lang:'es', type:'diario',  tags:['generalista','murcia'] },
    { d:'laopiniondemurcia.es',n:'La Opinión de Murcia', lang:'es', type:'diario',  tags:['generalista','murcia'] },
    { d:'murciaeconomia.com',  n:'Murcia Economía',      lang:'es', type:'economico', tags:['economia','murcia'] },
  ]},

  // ============================================================
  // AUTONÓMICOS · ANDALUCÍA
  // ============================================================
  { group:'Andalucía', items:[
    { d:'diariosur.es',        n:'Diario Sur',           lang:'es', type:'diario',  tags:['generalista','andalucia'] },
    { d:'diariodesevilla.es',  n:'Diario de Sevilla',    lang:'es', type:'diario',  tags:['generalista','andalucia'] },
    { d:'ideal.es',            n:'Ideal',                lang:'es', type:'diario',  tags:['generalista','andalucia'] },
    { d:'laopiniondemalaga.es',n:'La Opinión de Málaga', lang:'es', type:'diario',  tags:['generalista','andalucia'] },
    { d:'malagahoy.es',        n:'Málaga Hoy',           lang:'es', type:'diario',  tags:['generalista','andalucia'] },
    { d:'diariocordoba.com',   n:'Diario Córdoba',       lang:'es', type:'diario',  tags:['generalista','andalucia'] },
    { d:'granadahoy.com',      n:'Granada Hoy',          lang:'es', type:'diario',  tags:['generalista','andalucia'] },
    { d:'diariodecadiz.es',    n:'Diario de Cádiz',      lang:'es', type:'diario',  tags:['generalista','andalucia'] },
    { d:'diariodejerez.es',    n:'Diario de Jerez',      lang:'es', type:'diario',  tags:['generalista','andalucia'] },
    { d:'elcorreoweb.es',      n:'El Correo de Andalucía', lang:'es', type:'digital', tags:['generalista','andalucia'] },
  ]},

  // ============================================================
  // AUTONÓMICOS · EXTREMADURA · MADRID
  // ============================================================
  { group:'Extremadura · Madrid', items:[
    { d:'hoy.es',              n:'Hoy',                  lang:'es', type:'diario',  tags:['generalista','extremadura'] },
    { d:'elperiodicoextremadura.com', n:'El Periódico Extremadura', lang:'es', type:'diario', tags:['generalista','extremadura'] },
    { d:'madridiario.es',      n:'Madridiario',          lang:'es', type:'digital', tags:['generalista','madrid'] },
    { d:'telemadrid.es',       n:'Telemadrid',           lang:'es', type:'tv',      tags:['generalista','tv','publico'] },
  ]},

  // ============================================================
  // AUTONÓMICOS · BALEARES · CANARIAS
  // ============================================================
  { group:'Baleares · Canarias', items:[
    { d:'diariodemallorca.es', n:'Diario de Mallorca',   lang:'es', type:'diario',  tags:['generalista','baleares'] },
    { d:'ultimahora.es',       n:'Última Hora',          lang:'es', type:'diario',  tags:['generalista','baleares'] },
    { d:'diariodeibiza.es',    n:'Diario de Ibiza',      lang:'es', type:'diario',  tags:['generalista','baleares'] },
    { d:'canarias7.es',        n:'Canarias 7',           lang:'es', type:'diario',  tags:['generalista','canarias'] },
    { d:'laprovincia.es',      n:'La Provincia',         lang:'es', type:'diario',  tags:['generalista','canarias'] },
    { d:'eldia.es',            n:'El Día',               lang:'es', type:'diario',  tags:['generalista','canarias'] },
    { d:'diariodeavisos.com',  n:'Diario de Avisos',     lang:'es', type:'diario',  tags:['generalista','canarias'] },
  ]},

  // ============================================================
  // INTERNACIONAL · USA / UK
  // ============================================================
  { group:'Internacional · USA / UK', items:[
    { d:'nytimes.com',         n:'The New York Times',   lang:'en', type:'diario',  tags:['generalista','usa','referencia'] },
    { d:'washingtonpost.com',  n:'The Washington Post',  lang:'en', type:'diario',  tags:['generalista','usa'] },
    { d:'wsj.com',             n:'The Wall Street Journal', lang:'en', type:'economico', tags:['economia','usa'] },
    { d:'theguardian.com',     n:'The Guardian',         lang:'en', type:'diario',  tags:['generalista','uk'] },
    { d:'thetimes.com',        n:'The Times',            lang:'en', type:'diario',  tags:['generalista','uk'] },
    { d:'telegraph.co.uk',     n:'The Telegraph',        lang:'en', type:'diario',  tags:['generalista','uk'] },
    { d:'independent.co.uk',   n:'The Independent',      lang:'en', type:'digital', tags:['generalista','uk'] },
    { d:'bbc.com',             n:'BBC',                  lang:'en', type:'tv',      tags:['generalista','uk','publico'] },
    { d:'cnn.com',             n:'CNN',                  lang:'en', type:'tv',      tags:['generalista','usa','tv'] },
    { d:'reuters.com',         n:'Reuters',              lang:'en', type:'agencia', tags:['agencia','internacional'] },
    { d:'apnews.com',          n:'Associated Press',     lang:'en', type:'agencia', tags:['agencia','internacional'] },
    { d:'bloomberg.com',       n:'Bloomberg',            lang:'en', type:'economico', tags:['economia','internacional'] },
    { d:'ft.com',              n:'Financial Times',      lang:'en', type:'economico', tags:['economia','uk'] },
    { d:'economist.com',       n:'The Economist',        lang:'en', type:'revista', tags:['economia','internacional'] },
    { d:'time.com',            n:'Time',                 lang:'en', type:'revista', tags:['generalista','usa'] },
    { d:'politico.com',        n:'Politico',             lang:'en', type:'digital', tags:['politica','usa'] },
    { d:'npr.org',             n:'NPR',                  lang:'en', type:'radio',   tags:['generalista','usa','radio'] },
  ]},

  // ============================================================
  // INTERNACIONAL · FRANCIA, ALEMANIA, ITALIA, PORTUGAL
  // ============================================================
  { group:'Internacional · Europa', items:[
    { d:'lemonde.fr',          n:'Le Monde',             lang:'fr', type:'diario',  tags:['generalista','francia'] },
    { d:'lefigaro.fr',         n:'Le Figaro',            lang:'fr', type:'diario',  tags:['generalista','francia'] },
    { d:'liberation.fr',       n:'Libération',           lang:'fr', type:'diario',  tags:['generalista','francia'] },
    { d:'lesechos.fr',         n:'Les Échos',            lang:'fr', type:'economico', tags:['economia','francia'] },
    { d:'monde-diplomatique.fr', n:'Le Monde Diplomatique', lang:'fr', type:'revista', tags:['generalista','francia'] },
    { d:'zeit.de',             n:'Die Zeit',             lang:'de', type:'diario',  tags:['generalista','alemania'] },
    { d:'spiegel.de',          n:'Der Spiegel',          lang:'de', type:'revista', tags:['generalista','alemania'] },
    { d:'faz.net',             n:'FAZ',                  lang:'de', type:'diario',  tags:['generalista','alemania'] },
    { d:'sueddeutsche.de',     n:'Süddeutsche Zeitung',  lang:'de', type:'diario',  tags:['generalista','alemania'] },
    { d:'corriere.it',         n:'Corriere della Sera',  lang:'it', type:'diario',  tags:['generalista','italia'] },
    { d:'repubblica.it',       n:'La Repubblica',        lang:'it', type:'diario',  tags:['generalista','italia'] },
    { d:'ilsole24ore.com',     n:'Il Sole 24 Ore',       lang:'it', type:'economico', tags:['economia','italia'] },
    { d:'publico.pt',          n:'Público',              lang:'pt', type:'diario',  tags:['generalista','portugal'] },
    { d:'expresso.pt',         n:'Expresso',             lang:'pt', type:'revista', tags:['generalista','portugal'] },
    { d:'observador.pt',       n:'Observador',           lang:'pt', type:'digital', tags:['generalista','portugal'] },
    { d:'ionline.sapo.pt',     n:'Jornal i',             lang:'pt', type:'diario',  tags:['generalista','portugal'] },
  ]},

  // ============================================================
  // LATINOAMÉRICA
  // ============================================================
  { group:'Latinoamérica', items:[
    { d:'eluniversal.com.mx',  n:'El Universal',         lang:'es', type:'diario',  tags:['generalista','mexico'] },
    { d:'milenio.com',         n:'Milenio',              lang:'es', type:'diario',  tags:['generalista','mexico'] },
    { d:'clarin.com',          n:'Clarín',               lang:'es', type:'diario',  tags:['generalista','argentina'] },
    { d:'lanacion.com.ar',     n:'La Nación',            lang:'es', type:'diario',  tags:['generalista','argentina'] },
    { d:'infobae.com',         n:'Infobae',              lang:'es', type:'digital', tags:['generalista','argentina'] },
    { d:'eltiempo.com',        n:'El Tiempo',            lang:'es', type:'diario',  tags:['generalista','colombia'] },
    { d:'elespectador.com',    n:'El Espectador',        lang:'es', type:'diario',  tags:['generalista','colombia'] },
    { d:'elcomercio.pe',       n:'El Comercio',          lang:'es', type:'diario',  tags:['generalista','peru'] },
    { d:'latercera.com',       n:'La Tercera',           lang:'es', type:'diario',  tags:['generalista','chile'] },
    { d:'emol.com',            n:'Emol',                 lang:'es', type:'digital', tags:['generalista','chile'] },
    { d:'elpais.com.uy',       n:'El País (UY)',         lang:'es', type:'diario',  tags:['generalista','uruguay'] },
    { d:'elnacional.com',      n:'El Nacional',          lang:'es', type:'diario',  tags:['generalista','venezuela'] },
    { d:'univision.com',       n:'Univisión',            lang:'es', type:'tv',      tags:['generalista','usa','latino'] },
    { d:'telemundo.com',       n:'Telemundo',            lang:'es', type:'tv',      tags:['generalista','usa','latino'] },
    { d:'folha.uol.com.br',    n:'Folha de S.Paulo',     lang:'pt', type:'diario',  tags:['generalista','brasil'] },
    { d:'oglobo.globo.com',    n:'O Globo',              lang:'pt', type:'diario',  tags:['generalista','brasil'] },
  ]},
];


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

const CATALOG_TOTAL = CATALOG_FLAT.length;

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
  return null;
}

const CATALOG_TYPES = (() => {
  const s = new Set();
  CATALOG_FLAT.forEach(it => { if (it.type) s.add(it.type); });
  return Array.from(s).sort();
})();

const CATALOG_TAGS = (() => {
  const s = new Set();
  CATALOG_FLAT.forEach(it => (it.tags||[]).forEach(tg => s.add(tg)));
  return Array.from(s).sort();
})();

const CATALOG_LANGS = (() => {
  const s = new Set();
  CATALOG_FLAT.forEach(it => { if (it.lang) s.add(it.lang); });
  return Array.from(s).sort();
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
    fabTitle: 'Modo lectura', options: 'Aa Opciones', actions: '📤 Acciones',
    back: '← Atrás', close: '✕ Salir', closeTab: 'Cerrar pestaña',
    settingsShort: 'Configuración y medios', pendientesShort: 'Pendientes',
    textOnlyShort: 'Solo texto', textOnlyOn: 'Solo texto activado en este medio',
    textOnlyOff: 'Imágenes activadas en este medio', mediasShort: 'Lista de medios',
    visitSite: 'Ir al sitio',
    theme: 'Tema', font: 'Fuente', size: 'Tamaño', width: 'Ancho', extra: 'Extra',
    source: 'Origen', srcAuto: 'Auto', srcJsonld: 'JSON', srcReadability: 'Lector', srcCustom: 'CSS',
    sourceLabel: 'Fuente', words: 'palabras', imageLabel: 'Imagen',
    coverImage: 'Portada', coverImageTitle: 'Mostrar/ocultar imagen de portada',
    justify: 'Justificar', bionic: 'Bionic', focus: 'Foco',
    teleprompter: '⚡ Teleprompter',
    copyText: '📋 Copiar texto', print: '🖨 Imprimir', email: '✉ Enviar email', share: '📤 Compartir',
    ignoreSection: '🚫 Ignorar esta sección', saveLater: 'Guardar para más tarde',
    savedLater: 'Guardado en pendientes', alreadySaved: 'Ya estaba en pendientes',
    markRead: 'Marcar como leída', markUnread: 'Marcar como no leída',
    readItems: 'Leídas', readItemsNo: 'Pendientes',
    keepReadItems: 'Guardar historial de leídas',
    clearRead: 'Borrar leídas',
    clearReadConfirm: '¿Borrar todas las noticias marcadas como leídas?',
    up: '↑ Subir', raeHint: 'Doble clic en palabra = Buscar',
    noArticle: 'No se pudo extraer el artículo (Paywall, sitio no soportado o sin contenido).',
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
    dictAdd: 'Añadir diccionario', dictName: 'Nombre', dictUrl: 'URL de búsqueda (usa {palabra})',
    dictUrlHint: 'Usa {palabra} donde debe ir el término buscado', dictCustom: 'Personalizado', dictRemove: 'Eliminar',
    sites: 'Medios', pendientes: 'Pendientes', readLater: 'Guardados para más tarde',
    noReadLater: 'No hay artículos pendientes.', removeFromLater: 'Quitar de pendientes',
    addSite: 'Añadir sitio', domainPh: 'dominio (ej. elpais.com)',
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
    notInList: 'El sitio actual no está en la lista.', fabHidden: 'Icono oculto hasta recargar.',
    ignoredSections: 'Secciones ignoradas', noIgnoredSections: 'Ninguna',
    sectionIgnored: 'Sección ignorada:', sectionAlreadyIgnored: 'Esa sección ya estaba ignorada.',
    cannotIgnoreSection: 'No se puede ignorar (URL sin sección clara).',
    siteAddedForIgnore: 'Sitio añadido a la lista con la sección ignorada.',
    dictNotFound: 'Diccionario no encontrado', dictSearchIn: 'Buscar en:',
    dictNoDefault: 'No hay diccionario configurado para este idioma.',
    colSite: 'Sitio', colMode: 'Modo', colSource: 'Origen',
    colLang: 'Idioma', colType: 'Tipo', colTags: 'Etiquetas',
    searchPlaceholder: 'Buscar medio...', filterAll: 'Todos',
    filterLang: 'Idioma', filterType: 'Tipo', filterTag: 'Etiqueta',
    langAuto: 'Auto', langEs: 'Español', langGl: 'Gallego', langCa: 'Catalán',
    langEn: 'Inglés', langEu: 'Euskera', langFr: 'Francés', langDe: 'Alemán',
    langIt: 'Italiano', langPt: 'Portugués',
    openSite: 'Abrir sitio', siteLang: 'Idioma del sitio', siteType: 'Tipo de medio',
    siteTags: 'Etiquetas (separadas por comas)', saveBtn: 'Guardar', cancelBtn: 'Cancelar',
    typesAndTags: 'Tipos y etiquetas', typesSection: 'Tipos de medio', tagsSection: 'Etiquetas',
    newTypePh: 'Nuevo tipo (ej. Podcast)', newTagPh: 'Nueva etiqueta (ej. política)',
    deleteTypeConfirm: '¿Borrar el tipo "{X}"? {N} sitio(s) lo usan y quedarán sin tipo.',
    deleteTagConfirm: '¿Borrar la etiqueta "{X}"? Se quitará de {N} sitio(s).',
    typeDeleted: 'Tipo borrado: {X} ({N} sitios afectados)',
    tagDeleted: 'Etiqueta borrada: {X} ({N} sitios afectados)',
    noTypes: 'No hay tipos configurados.', noTags: 'No hay etiquetas configuradas.',
    typeAlreadyExists: 'Ese tipo ya existe.', tagAlreadyExists: 'Esa etiqueta ya existe.',
    typeInvalid: 'Nombre de tipo no válido.', tagInvalid: 'Nombre de etiqueta no válido.',
    typesHint: 'Los tipos predefinidos tienen un ID fijo en todos los idiomas; puedes cambiar su etiqueta visible o crear tipos nuevos.',
    tagsHint: 'Al escribir una etiqueta nueva en un sitio, se añadirá automáticamente aquí.',
    typeLabelCol: 'Etiqueta', typeIdCol: 'ID',
    defaultTypes: 'Predefinidos', customTypes: 'Personalizados',
    exportWarningVersion: 'El archivo importado es de una versión distinta. Se intentará importar de todos modos.',
    settingsFabTitle: 'Configuración y medios',
    addFabTitle: 'Añadir este medio a la lista',
    catalog: 'Catálogo',
    catalogInfo: 'Explora los {N} medios predefinidos. Puedes añadirlos a tu lista, abrirlos en una pestaña nueva, o bloquearlos para que no aparezcan los botones flotantes. También puedes añadir medios propios.',
    filterAdded: 'Añadidos', filterNotAdded: 'No añadidos', filterBlocked: 'Bloqueados',
    searchCatalog: 'Buscar dominio o nombre…',
    inYourList: 'En tu lista', blocked: 'Bloqueado', unblock: 'Desbloquear',
    addToMyList: 'Añadir a mi lista', visitSite: 'Visitar',
    yourList: 'Tu lista', allMedia: 'Todos los medios',
    catalogSubMedia: 'Medios', catalogSubTypes: 'Tipos y etiquetas',
    extraction: 'Extracción',
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
    extractionExtractAllBtn: 'Extraer todo el texto',
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
    extractionClear: 'Limpiar',
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
    shortcutInvalid: 'Combinación no válida.',
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
    serviciosFab: 'Botón flotante «Abrir en…» en las noticias',
    serviciosFabMenu: 'mostrar u ocultar el botón',
    serviciosFabOculto: 'Botón «Abrir en…» oculto',
    serviciosFabVisible: 'Botón «Abrir en…» visible',
    btnTitulares: 'TITULARES',
  },
  gl: {
    saveToPending: 'Gardar en pendentes',
    saveRemove: 'Quitar de pendentes',
    movedToPending: 'Movida a pendentes',
    movedToRead: 'Movida a lidas',
    fabTitle: 'Modo lectura', options: 'Aa Opcións', actions: '📤 Accións',
    back: '← Atrás', close: '✕ Saír', closeTab: 'Pechar lapela',
    settingsShort: 'Configuración e medios', pendientesShort: 'Pendentes',
    textOnlyShort: 'Só texto', textOnlyOn: 'Só texto activado neste medio',
    textOnlyOff: 'Imaxes activadas neste medio', mediasShort: 'Lista de medios',
    visitSite: 'Ir ao sitio',
    theme: 'Tema', font: 'Fonte', size: 'Tamaño', width: 'Ancho', extra: 'Extra',
    source: 'Orixe', srcAuto: 'Auto', srcJsonld: 'JSON', srcReadability: 'Lector', srcCustom: 'CSS',
    sourceLabel: 'Fonte', words: 'palabras', imageLabel: 'Imaxe',
    coverImage: 'Portada', coverImageTitle: 'Amosar/agochar imaxe de portada',
    justify: 'Xustificar', bionic: 'Bionic', focus: 'Foco',
    teleprompter: '⚡ Teleprompter',
    copyText: '📋 Copiar texto', print: '🖨 Imprimir', email: '✉ Enviar email', share: '📤 Compartir',
    ignoreSection: '🚫 Ignorar esta sección', saveLater: 'Gardar para máis tarde',
    savedLater: 'Gardado en pendentes', alreadySaved: 'Xa estaba en pendentes',
    markRead: 'Marcar como lida', markUnread: 'Marcar como non lida',
    readItems: 'Lidas', readItemsNo: 'Pendentes',
    keepReadItems: 'Gardar historial de lidas',
    clearRead: 'Borrar lidas',
    clearReadConfirm: '¿Borrar todas as noticias marcadas como lidas?',
    up: '↑ Subir', raeHint: 'Dobre clic nunha palabra = Buscar',
    noArticle: 'Non se puido extraer o artigo (Paywall, sitio non soportado ou sen contido).',
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
    dictAdd: 'Engadir dicionario', dictName: 'Nome', dictUrl: 'URL de busca (usa {palabra})',
    dictUrlHint: 'Usa {palabra} onde debe ir o termo buscado', dictCustom: 'Personalizado', dictRemove: 'Eliminar',
    sites: 'Medios', pendientes: 'Pendentes', readLater: 'Gardados para máis tarde',
    noReadLater: 'Non hai artigos pendentes.', removeFromLater: 'Quitar de pendentes',
    addSite: 'Engadir sitio', domainPh: 'dominio (ex. elpais.com)',
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
    notInList: 'O sitio actual non está na lista.', fabHidden: 'Icona agochada ata recargar.',
    ignoredSections: 'Seccións ignoradas', noIgnoredSections: 'Ningunha',
    sectionIgnored: 'Sección ignorada:', sectionAlreadyIgnored: 'Esa sección xa estaba ignorada.',
    cannotIgnoreSection: 'Non se pode ignorar (URL sen sección clara).',
    siteAddedForIgnore: 'Sitio engadido á lista coa sección ignorada.',
    dictNotFound: 'Dicionario non atopado', dictSearchIn: 'Buscar en:',
    dictNoDefault: 'Non hai dicionario configurado para este idioma.',
    colSite: 'Sitio', colMode: 'Modo', colSource: 'Orixe',
    colLang: 'Idioma', colType: 'Tipo', colTags: 'Etiquetas',
    searchPlaceholder: 'Buscar medio...', filterAll: 'Todos',
    filterLang: 'Idioma', filterType: 'Tipo', filterTag: 'Etiqueta',
    langAuto: 'Auto', langEs: 'Español', langGl: 'Galego', langCa: 'Català',
    langEn: 'Inglés', langEu: 'Éuscaro', langFr: 'Francés', langDe: 'Alemán',
    langIt: 'Italiano', langPt: 'Portugués',
    openSite: 'Abrir sitio', siteLang: 'Idioma do sitio', siteType: 'Tipo de medio',
    siteTags: 'Etiquetas (separadas por comas)', saveBtn: 'Gardar', cancelBtn: 'Cancelar',
    typesAndTags: 'Tipos e etiquetas', typesSection: 'Tipos de medio', tagsSection: 'Etiquetas',
    newTypePh: 'Novo tipo (ex. Podcast)', newTagPh: 'Nova etiqueta (ex. política)',
    deleteTypeConfirm: '¿Borrar o tipo "{X}"? {N} sitio(s) úsano e quedarán sen tipo.',
    deleteTagConfirm: '¿Borrar a etiqueta "{X}"? Quitarase de {N} sitio(s).',
    typeDeleted: 'Tipo borrado: {X} ({N} sitios afectados)',
    tagDeleted: 'Etiqueta borrada: {X} ({N} sitios afectados)',
    noTypes: 'Non hai tipos configurados.', noTags: 'Non hai etiquetas configuradas.',
    typeAlreadyExists: 'Ese tipo xa existe.', tagAlreadyExists: 'Esa etiqueta xa existe.',
    typeInvalid: 'Nome de tipo non válido.', tagInvalid: 'Nome de etiqueta non válido.',
    typesHint: 'Os tipos predefinidos teñen un ID fixo en todos os idiomas; podes cambiar a súa etiqueta visible ou crear tipos novos.',
    tagsHint: 'Ao escribir unha etiqueta nova nun sitio, engadirase automaticamente aquí.',
    typeLabelCol: 'Etiqueta', typeIdCol: 'ID',
    defaultTypes: 'Predefinidos', customTypes: 'Personalizados',
    exportWarningVersion: 'O ficheiro importado é dunha versión distinta. Intentarase importar de todos xeitos.',
    settingsFabTitle: 'Configuración e medios',
    addFabTitle: 'Engadir este medio á lista',
    catalog: 'Catálogo',
    catalogInfo: 'Explora os {N} medios predefinidos. Podes engadilos á túa lista, abrilos nunha pestana nova, ou bloquealos para que non aparezan os botóns flotantes. Tamén podes engadir medios propios.',
    filterAdded: 'Engadidos', filterNotAdded: 'Non engadidos', filterBlocked: 'Bloqueados',
    searchCatalog: 'Buscar dominio ou nome…',
    inYourList: 'Na túa lista', blocked: 'Bloqueado', unblock: 'Desbloquear',
    addToMyList: 'Engadir á miña lista', visitSite: 'Visitar',
    yourList: 'A túa lista', allMedia: 'Todos os medios',
    catalogSubMedia: 'Medios', catalogSubTypes: 'Tipos e etiquetas',
    extraction: 'Extracción',
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
    extractionExtractAllBtn: 'Extraer todo o texto',
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
    extractionClear: 'Limpar',
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
    shortcutInvalid: 'Combinación non válida.',
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
    serviciosFab: 'Botón flotante «Abrir en…» nas noticias',
    serviciosFabMenu: 'amosar ou agochar o botón',
    serviciosFabOculto: 'Botón «Abrir en…» agochado',
    serviciosFabVisible: 'Botón «Abrir en…» visible',
    btnTitulares: 'TITULARES',
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
    fabTitle: 'Mode lectura', options: 'Aa Opcions', actions: '📤 Accions',
    back: '← Enrere', close: '✕ Tancar', closeTab: 'Tancar pestanya',
    settingsShort: 'Configuració i mitjans', pendientesShort: 'Pendents',
    textOnlyShort: 'Només text', textOnlyOn: 'Només text activat en aquest mitjà',
    textOnlyOff: 'Imatges activades en aquest mitjà', mediasShort: 'Llista de mitjans',
    visitSite: 'Anar al lloc',
    theme: 'Tema', font: 'Tipus de lletra', size: 'Mida', width: 'Amplada', extra: 'Extra',
    source: 'Origen', srcAuto: 'Auto', srcJsonld: 'JSON', srcReadability: 'Lector', srcCustom: 'CSS',
    sourceLabel: 'Font', words: 'paraules', imageLabel: 'Imatge',
    coverImage: 'Portada', coverImageTitle: 'Mostrar/amagar imatge de portada',
    justify: 'Justificar', bionic: 'Bionic', focus: 'Focus',
    teleprompter: '⚡ Teleprompter',
    copyText: '📋 Copiar text', print: '🖨 Imprimir', email: '✉ Enviar correu', share: '📤 Compartir',
    ignoreSection: '🚫 Ignorar aquesta secció', saveLater: 'Desar per a més tard',
    savedLater: 'Desat a pendents', alreadySaved: 'Ja era a pendents',
    markRead: 'Marcar com llegida', markUnread: 'Marcar com no llegida',
    readItems: 'Llegides', readItemsNo: 'Pendents',
    keepReadItems: 'Desar historial de llegides',
    clearRead: 'Esborrar llegides',
    clearReadConfirm: 'Esborrar totes les notícies marcades com llegides?',
    up: '↑ Pujar', raeHint: 'Doble clic a un mot = Cercar',
    noArticle: "No s'ha pogut extreure l'article (Paywall, lloc no suportat o sense contingut).",
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
    dictAdd: 'Afegir diccionari', dictName: 'Nom', dictUrl: 'URL de cerca (usa {palabra})',
    dictUrlHint: "Usa {palabra} on ha d'anar el terme cercat", dictCustom: 'Personalitzat', dictRemove: 'Eliminar',
    sites: 'Mitjans', pendientes: 'Pendents', readLater: 'Desats per a més tard',
    noReadLater: 'No hi ha articles pendents.', removeFromLater: 'Treure de pendents',
    addSite: 'Afegir lloc', domainPh: 'domini (ex. elpais.com)',
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
    notInList: 'El lloc actual no és a la llista.', fabHidden: 'Icona amagada fins a recarregar.',
    ignoredSections: 'Seccions ignorades', noIgnoredSections: 'Cap',
    sectionIgnored: 'Secció ignorada:', sectionAlreadyIgnored: 'Aquesta secció ja estava ignorada.',
    cannotIgnoreSection: 'No es pot ignorar (URL sense secció clara).',
    siteAddedForIgnore: 'Lloc afegit a la llista amb la secció ignorada.',
    dictNotFound: 'Diccionari no trobat', dictSearchIn: 'Cercar a:',
    dictNoDefault: 'No hi ha diccionari configurat per a aquest idioma.',
    colSite: 'Lloc', colMode: 'Mode', colSource: 'Origen',
    colLang: 'Idioma', colType: 'Tipus', colTags: 'Etiquetes',
    searchPlaceholder: 'Cercar mitjà...', filterAll: 'Tots',
    filterLang: 'Idioma', filterType: 'Tipus', filterTag: 'Etiqueta',
    langAuto: 'Auto', langEs: 'Castellà', langGl: 'Gallec', langCa: 'Català',
    langEn: 'Anglès', langEu: 'Basc', langFr: 'Francès', langDe: 'Alemany',
    langIt: 'Italià', langPt: 'Portuguès',
    openSite: 'Obrir lloc', siteLang: 'Idioma del lloc', siteType: 'Tipus de mitjà',
    siteTags: 'Etiquetes (separades per comes)', saveBtn: 'Desar', cancelBtn: 'Cancel·lar',
    typesAndTags: 'Tipus i etiquetes', typesSection: 'Tipus de mitjà', tagsSection: 'Etiquetes',
    newTypePh: 'Nou tipus (ex. Podcast)', newTagPh: 'Nova etiqueta (ex. política)',
    deleteTypeConfirm: 'Esborrar el tipus "{X}"? {N} lloc(s) l\'usen i quedaran sense tipus.',
    deleteTagConfirm: 'Esborrar l\'etiqueta "{X}"? Es traurà de {N} lloc(s).',
    typeDeleted: 'Tipus esborrat: {X} ({N} llocs afectats)',
    tagDeleted: 'Etiqueta esborrada: {X} ({N} llocs afectats)',
    noTypes: 'No hi ha tipus configurats.', noTags: 'No hi ha etiquetes configurades.',
    typeAlreadyExists: 'Aquest tipus ja existeix.', tagAlreadyExists: 'Aquesta etiqueta ja existeix.',
    typeInvalid: 'Nom de tipus no vàlid.', tagInvalid: "Nom d'etiqueta no vàlid.",
    typesHint: 'Els tipus predefinits tenen un ID fix a tots els idiomes; pots canviar-ne l\'etiqueta visible o crear tipus nous.',
    tagsHint: "En escriure una etiqueta nova en un lloc, s'afegirà automàticament aquí.",
    typeLabelCol: 'Etiqueta', typeIdCol: 'ID',
    defaultTypes: 'Predefinits', customTypes: 'Personalitzats',
    exportWarningVersion: "El fitxer importat és d'una versió diferent. S'intentarà importar igualment.",
    settingsFabTitle: 'Configuració i mitjans',
    addFabTitle: 'Afegir aquest mitjà a la llista',
    catalog: 'Catàleg',
    catalogInfo: 'Explora els {N} mitjans predefinits. Pots afegir-los a la teva llista, obrir-los en una pestanya nova, o bloquejar-los perquè no apareguin els botons flotants. També pots afegir mitjans propis.',
    filterAdded: 'Afegits', filterNotAdded: 'No afegits', filterBlocked: 'Bloquejats',
    searchCatalog: 'Cercar domini o nom…',
    inYourList: 'A la teva llista', blocked: 'Bloquejat', unblock: 'Desbloquejar',
    addToMyList: 'Afegir a la meva llista', visitSite: 'Visitar',
    yourList: 'La teva llista', allMedia: 'Tots els mitjans',
    catalogSubMedia: 'Mitjans', catalogSubTypes: 'Tipus i etiquetes',
    extraction: 'Extracció',
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
    extractionExtractAllBtn: 'Extreure tot el text',
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
    extractionClear: 'Netejar',
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
    shortcutInvalid: 'Combinació no vàlida.',
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
    serviciosFab: 'Botó flotant «Obre a…» a les notícies',
    serviciosFabMenu: 'mostra o amaga el botó',
    serviciosFabOculto: 'Botó «Obre a…» amagat',
    serviciosFabVisible: 'Botó «Obre a…» visible',
    btnTitulares: 'TITULARS',
  },
  en: {
    saveToPending: 'Move to queue',
    saveRemove: 'Remove from queue',
    movedToPending: 'Moved to queue',
    movedToRead: 'Moved to read',
    fabTitle: 'Reading mode', options: 'Aa Options', actions: '📤 Actions',
    back: '← Back', close: '✕ Close', closeTab: 'Close tab',
    settingsShort: 'Settings & sites', pendientesShort: 'Queue',
    textOnlyShort: 'Text only', textOnlyOn: 'Text only enabled on this site',
    textOnlyOff: 'Images enabled on this site', mediasShort: 'Sites list',
    visitSite: 'Go to site',
    theme: 'Theme', font: 'Font', size: 'Size', width: 'Width', extra: 'Extra',
    source: 'Source', srcAuto: 'Auto', srcJsonld: 'JSON', srcReadability: 'Reader', srcCustom: 'CSS',
    sourceLabel: 'Source', words: 'words', imageLabel: 'Image',
    coverImage: 'Cover', coverImageTitle: 'Show/hide cover image',
    justify: 'Justify', bionic: 'Bionic', focus: 'Focus',
    teleprompter: '⚡ Teleprompter',
    copyText: '📋 Copy text', print: '🖨 Print', email: '✉ Send email', share: '📤 Share',
    ignoreSection: '🚫 Ignore this section', saveLater: 'Save for later',
    savedLater: 'Saved to queue', alreadySaved: 'Already in queue',
    markRead: 'Mark as read', markUnread: 'Mark as unread',
    readItems: 'Read', readItemsNo: 'Pending',
    keepReadItems: 'Keep history of read items',
    clearRead: 'Clear read',
    clearReadConfirm: 'Delete all news marked as read?',
    up: '↑ Top', raeHint: 'Double-click a word = Look up',
    noArticle: 'Could not extract the article (paywall, unsupported site, or no content).',
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
    dictAdd: 'Add dictionary', dictName: 'Name', dictUrl: 'Search URL (use {palabra})',
    dictUrlHint: 'Use {palabra} where the search term should go', dictCustom: 'Custom', dictRemove: 'Remove',
    sites: 'Sites', pendientes: 'Queue', readLater: 'Saved for later',
    noReadLater: 'No pending articles.', removeFromLater: 'Remove from queue',
    addSite: 'Add site', domainPh: 'domain (e.g. elpais.com)',
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
    notInList: 'Current site is not in the list.', fabHidden: 'Icon hidden until reload.',
    ignoredSections: 'Ignored sections', noIgnoredSections: 'None',
    sectionIgnored: 'Section ignored:', sectionAlreadyIgnored: 'That section was already ignored.',
    cannotIgnoreSection: 'Cannot ignore (URL has no clear section).',
    siteAddedForIgnore: 'Site added to list with ignored section.',
    dictNotFound: 'Dictionary not found', dictSearchIn: 'Search in:',
    dictNoDefault: 'No dictionary configured for this language.',
    colSite: 'Site', colMode: 'Mode', colSource: 'Source',
    colLang: 'Language', colType: 'Type', colTags: 'Tags',
    searchPlaceholder: 'Search site...', filterAll: 'All',
    filterLang: 'Language', filterType: 'Type', filterTag: 'Tag',
    langAuto: 'Auto', langEs: 'Spanish', langGl: 'Galician', langCa: 'Catalan',
    langEn: 'English', langEu: 'Basque', langFr: 'French', langDe: 'German',
    langIt: 'Italian', langPt: 'Portuguese',
    openSite: 'Open site', siteLang: 'Site language', siteType: 'Site type',
    siteTags: 'Tags (comma separated)', saveBtn: 'Save', cancelBtn: 'Cancel',
    typesAndTags: 'Types & tags', typesSection: 'Site types', tagsSection: 'Tags',
    newTypePh: 'New type (e.g. Podcast)', newTagPh: 'New tag (e.g. politics)',
    deleteTypeConfirm: 'Delete type "{X}"? {N} site(s) use it and will be left without type.',
    deleteTagConfirm: 'Delete tag "{X}"? It will be removed from {N} site(s).',
    typeDeleted: 'Type deleted: {X} ({N} sites affected)',
    tagDeleted: 'Tag deleted: {X} ({N} sites affected)',
    noTypes: 'No types configured.', noTags: 'No tags configured.',
    typeAlreadyExists: 'That type already exists.', tagAlreadyExists: 'That tag already exists.',
    typeInvalid: 'Invalid type name.', tagInvalid: 'Invalid tag name.',
    typesHint: 'Predefined types have a fixed ID across languages; you can change their visible label or create new types.',
    tagsHint: 'When typing a new tag on a site, it will be added here automatically.',
    typeLabelCol: 'Label', typeIdCol: 'ID',
    defaultTypes: 'Built-in', customTypes: 'Custom',
    exportWarningVersion: 'The imported file is from a different version. Import will be attempted anyway.',
    settingsFabTitle: 'Settings & sites',
    addFabTitle: 'Add this site to the list',
    catalog: 'Catalog',
    catalogInfo: 'Browse the {N} predefined media. You can add them to your list, open them in a new tab, or block them so the floating buttons don\'t appear. You can also add your own media.',
    filterAdded: 'Added', filterNotAdded: 'Not added', filterBlocked: 'Blocked',
    searchCatalog: 'Search domain or name…',
    inYourList: 'In your list', blocked: 'Blocked', unblock: 'Unblock',
    addToMyList: 'Add to my list', visitSite: 'Visit',
    yourList: 'Your list', allMedia: 'All media',
    catalogSubMedia: 'Sites', catalogSubTypes: 'Types & tags',
    extraction: 'Extraction',
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
    extractionExtractAllBtn: 'Extract all text',
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
    extractionClear: 'Clear',
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
    shortcutInvalid: 'Invalid combo.',
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
    serviciosFab: 'Floating “Open in…” button on news pages',
    serviciosFabMenu: 'show or hide the button',
    serviciosFabOculto: '“Open in…” button hidden',
    serviciosFabVisible: '“Open in…” button shown',
    btnTitulares: 'HEADLINES',
  },
  eu: {
    saveToPending: 'Zainera itzuli',
    saveRemove: 'Zainetik kendu',
    movedToPending: 'Zainera mugitua',
    movedToRead: 'Irakurrietara mugitua',
    fabTitle: 'Irakurketa modua', options: 'Aa Aukerak', actions: '📤 Ekintzak',
    back: '← Atzera', close: '✕ Itxi', closeTab: 'Itxi fitxa',
    settingsShort: 'Ezarpenak eta hedabideak', pendientesShort: 'Zain',
    textOnlyShort: 'Testua soilik', textOnlyOn: 'Testua soilik gaituta hedabide honetan',
    textOnlyOff: 'Irudiak gaituta hedabide honetan', mediasShort: 'Hedabide zerrenda',
    visitSite: 'Gunera joan',
    theme: 'Gaia', font: 'Letra-tipoa', size: 'Tamaina', width: 'Zabalera', extra: 'Extra',
    source: 'Iturria', srcAuto: 'Auto', srcJsonld: 'JSON', srcReadability: 'Irakurgailua', srcCustom: 'CSS',
    sourceLabel: 'Iturria', words: 'hitza', imageLabel: 'Irudia',
    coverImage: 'Azala', coverImageTitle: 'Azaleko irudia erakutsi/ezkutatu',
    justify: 'Justifikatu', bionic: 'Bionikoa', focus: 'Fokua',
    teleprompter: '⚡ Teleprompter',
    copyText: '📋 Testua kopiatu', print: '🖨 Inprimatu', email: '✉ Posta bidali', share: '📤 Partekatu',
    ignoreSection: '🚫 Atal hau ez ikusi', saveLater: 'Geroagorako gorde',
    savedLater: 'Zain gordeta', alreadySaved: 'Jada zegoen zain',
    markRead: 'Irakurrita markatu', markUnread: 'Irakurri gabe markatu',
    readItems: 'Irakurriak', readItemsNo: 'Zain',
    keepReadItems: 'Irakurrien historia gorde',
    clearRead: 'Irakurriak ezabatu',
    clearReadConfirm: 'Irakurrita markatutako albiste guztiak ezabatu?',
    up: '↑ Igo', raeHint: 'Hitz batean klik bikoitza = Bilatu',
    noArticle: 'Ezin izan da artikulua atera (paywall, onartzen ez den gunea edo edukirik ez).',
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
    dictAdd: 'Hiztegia gehitu', dictName: 'Izena', dictUrl: 'Bilaketa URLa ({palabra} erabili)',
    dictUrlHint: 'Erabili {palabra} bilatutako terminoa joan behar den tokian', dictCustom: 'Pertsonalizatua', dictRemove: 'Ezabatu',
    sites: 'Hedabideak', pendientes: 'Zain', readLater: 'Geroagorako gordeta',
    noReadLater: 'Ez dago artikulu zainenik.', removeFromLater: 'Zaindik kendu',
    addSite: 'Gunea gehitu', domainPh: 'domeinua (adib. elpais.com)',
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
    notInList: 'Oraingo gunea ez dago zerrendan.', fabHidden: 'Ikonoa ezkutatuta birkargatu arte.',
    ignoredSections: 'Ez ikusitako atalak', noIgnoredSections: 'Bat ere ez',
    sectionIgnored: 'Atala ez ikusia:', sectionAlreadyIgnored: 'Atal hori jada ez ikusia zegoen.',
    cannotIgnoreSection: 'Ezin da ez ikusi (URLak ez du atal argirik).',
    siteAddedForIgnore: 'Gunea zerrendara gehituta atal ez ikusiarekin.',
    dictNotFound: 'Hiztegia ez da aurkitu', dictSearchIn: 'Bilatu hemen:',
    dictNoDefault: 'Ez dago hiztegirik konfiguratuta hizkuntza honetarako.',
    colSite: 'Gunea', colMode: 'Modua', colSource: 'Iturria',
    colLang: 'Hizkuntza', colType: 'Mota', colTags: 'Etiketak',
    searchPlaceholder: 'Bilatu hedabidea...', filterAll: 'Guztiak',
    filterLang: 'Hizkuntza', filterType: 'Mota', filterTag: 'Etiketa',
    langAuto: 'Auto', langEs: 'Gaztelania', langGl: 'Galiziera', langCa: 'Katalana',
    langEn: 'Ingelesa', langEu: 'Euskara', langFr: 'Frantsesa', langDe: 'Alemana',
    langIt: 'Italiera', langPt: 'Portugesa',
    openSite: 'Gunea ireki', siteLang: 'Gunearen hizkuntza', siteType: 'Hedabide mota',
    siteTags: 'Etiketak (komaz banatuta)', saveBtn: 'Gorde', cancelBtn: 'Utzi',
    typesAndTags: 'Motak eta etiketak', typesSection: 'Hedabide motak', tagsSection: 'Etiketak',
    newTypePh: 'Mota berria (adib. Podcast)', newTagPh: 'Etiketa berria (adib. politika)',
    deleteTypeConfirm: '"{X}" mota ezabatu? {N} gune(k) erabiltzen dute eta motarik gabe geratuko dira.',
    deleteTagConfirm: '"{X}" etiketa ezabatu? {N} gune(eta)tik kenduko da.',
    typeDeleted: 'Mota ezabatuta: {X} ({N} gune kaltetuta)',
    tagDeleted: 'Etiketa ezabatuta: {X} ({N} gune kaltetuta)',
    noTypes: 'Ez dago motarik konfiguratuta.', noTags: 'Ez dago etiketarik konfiguratuta.',
    typeAlreadyExists: 'Mota hori jada existitzen da.', tagAlreadyExists: 'Etiketa hori jada existitzen da.',
    typeInvalid: 'Mota izen baliogabea.', tagInvalid: 'Etiketa izen baliogabea.',
    typesHint: 'Mota lehenetsiek ID finkoa dute hizkuntza guztietan; haien etiketa ikusgai aldatu edo mota berriak sor ditzakezu.',
    tagsHint: 'Gune batean etiketa berri bat idazterakoan, automatikoki gehituko da hemen.',
    typeLabelCol: 'Etiketa', typeIdCol: 'ID',
    defaultTypes: 'Lehenetsiak', customTypes: 'Pertsonalizatuak',
    exportWarningVersion: 'Inportatutako fitxategia beste bertsio batekoa da. Dena den inportatzen saiatuko da.',
    settingsFabTitle: 'Ezarpenak eta hedabideak',
    addFabTitle: 'Gehitu hedabide hau zerrendara',
    catalog: 'Katalogoa',
    catalogInfo: 'Arakatu {N} hedabide aurrez zehaztuak. Zure zerrendara gehitu, fitxa berri batean ireki, edo blokeatu ditzakezu, botoi flotagarriak ager ez daitezen. Zure hedabideak ere gehi ditzakezu.',
    filterAdded: 'Gehituta', filterNotAdded: 'Gehitu gabe', filterBlocked: 'Blokeatuta',
    searchCatalog: 'Bilatu domeinua edo izena…',
    inYourList: 'Zure zerrendan', blocked: 'Blokeatuta', unblock: 'Desblokeatu',
    addToMyList: 'Nire zerrendara gehitu', visitSite: 'Bisitatu',
    yourList: 'Zure zerrenda', allMedia: 'Hedabide guztiak',
    catalogSubMedia: 'Hedabideak', catalogSubTypes: 'Motak eta etiketak',
    extraction: 'Erauzketa',
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
    extractionExtractAllBtn: 'Testu osoa atera',
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
    extractionClear: 'Garbitu',
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
    shortcutInvalid: 'Konbinazio baliogabea.',
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
    serviciosFab: '«Ireki honekin…» botoi mugikorra albisteetan',
    serviciosFabMenu: 'erakutsi edo ezkutatu botoia',
    serviciosFabOculto: '«Ireki honekin…» botoia ezkutatuta',
    serviciosFabVisible: '«Ireki honekin…» botoia ikusgai',
    btnTitulares: 'IZENBURUAK',
  }
};

/* ============================================================
   4. TIPOS DE SITIO POR DEFECTO
   ============================================================ */
const DEFAULT_SITE_TYPES = {
  es: [
    { id:'diario',     label:'Diario' },     { id:'digital',   label:'Digital' },
    { id:'revista',    label:'Revista' },    { id:'deportivo', label:'Deportivo' },
    { id:'economico',  label:'Económico' },  { id:'tecnologia',label:'Tecnología' },
    { id:'cultural',   label:'Cultural' },   { id:'tv',        label:'TV' },
    { id:'radio',      label:'Radio' },      { id:'agencia',   label:'Agencia' },
    { id:'otro',       label:'Otro' }
  ],
  gl: [
    { id:'diario',     label:'Diario' },     { id:'digital',   label:'Dixital' },
    { id:'revista',    label:'Revista' },    { id:'deportivo', label:'Deportivo' },
    { id:'economico',  label:'Económico' },  { id:'tecnologia',label:'Tecnoloxía' },
    { id:'cultural',   label:'Cultural' },   { id:'tv',        label:'TV' },
    { id:'radio',      label:'Radio' },      { id:'agencia',   label:'Axencia' },
    { id:'otro',       label:'Outro' }
  ],
  ca: [
    { id:'diario',     label:'Diari' },      { id:'digital',   label:'Digital' },
    { id:'revista',    label:'Revista' },    { id:'deportivo', label:'Esportiu' },
    { id:'economico',  label:'Econòmic' },   { id:'tecnologia',label:'Tecnologia' },
    { id:'cultural',   label:'Cultural' },   { id:'tv',        label:'TV' },
    { id:'radio',      label:'Ràdio' },      { id:'agencia',   label:'Agència' },
    { id:'otro',       label:'Altre' }
  ],
  en: [
    { id:'diario',     label:'Newspaper' },  { id:'digital',   label:'Digital' },
    { id:'revista',    label:'Magazine' },   { id:'deportivo', label:'Sports' },
    { id:'economico',  label:'Business' },   { id:'tecnologia',label:'Tech' },
    { id:'cultural',   label:'Culture' },    { id:'tv',        label:'TV' },
    { id:'radio',      label:'Radio' },      { id:'agencia',   label:'Agency' },
    { id:'otro',       label:'Other' }
  ],
  eu: [
    { id:'diario',     label:'Egunkaria' },  { id:'digital',   label:'Digitala' },
    { id:'revista',    label:'Aldizkaria' }, { id:'deportivo', label:'Kirola' },
    { id:'economico',  label:'Ekonomia' },   { id:'tecnologia',label:'Teknologia' },
    { id:'cultural',   label:'Kultura' },    { id:'tv',        label:'TB' },
    { id:'radio',      label:'Irratia' },    { id:'agencia',   label:'Agentzia' },
    { id:'otro',       label:'Bestea' }
  ]
};

function defaultLabelForType(id, lang){
  const map = DEFAULT_SITE_TYPES[lang] || DEFAULT_SITE_TYPES.es;
  const found = map.find(tt => tt.id === id);
  return found ? found.label : id;
}

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
  siteTypes: null,
  siteTags: [],
  disabledDomains: [],
  customCatalog: [],
  readLater: [],
  perfilActualizado: 0,
  configActualizado: 0,
  readerAutoAll: false,
  readerSettings: {
    keepReadItems: true
  },
  fab: { left: null, top: null },
  servicios: [],
  serviciosFab: { oculto: false },
  prefs: {
    fs: 18, theme: 'light', width: 720, font: 'georgia', lh: 1.7,
    just: false, bionic: false, focus: false, img: true,
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

  if (!Array.isArray(cfg.customCatalog)) cfg.customCatalog = [];
  cfg.customCatalog.forEach(it => {
    if (!it.d) it.d = '';
    if (!it.n) it.n = it.d;
    if (!it.lang) it.lang = 'auto';
    if (!it.type) it.type = '';
    if (!Array.isArray(it.tags)) it.tags = [];
    if (!it.group) it.group = 'Personalizados';
  });
  cfg.customCatalog = cfg.customCatalog.filter(it => it.d);

  cfg.sites.forEach(s => {
    if (!Array.isArray(s.ignorePatterns)) s.ignorePatterns = [];
    if (!s.mode) s.mode = 'prompt';
    if (!s.domain) s.domain = '';
    if (!s.lang || !SITE_LANGS.includes(s.lang)) s.lang = 'auto';
    if (!s.type) s.type = '';
    if (!Array.isArray(s.tags)) s.tags = [];
    if (typeof s.textOnly !== 'boolean') s.textOnly = false;
    const oldSel = typeof s.customSelector === 'string' ? s.customSelector : '';
    s.extraction = normalizeExtraction(s.extraction, oldSel);
    delete s.customSelector;
    if (!s.readerSource || !READER_SOURCES.includes(s.readerSource)) s.readerSource = 'auto';

  });
  cfg.sites = cfg.sites.filter(s => s.domain);

  if (!Array.isArray(cfg.siteTags)) cfg.siteTags = [];
  cfg.siteTags = Array.from(new Set(cfg.siteTags.map(x => String(x).trim()).filter(Boolean)));

  const langKey = (DEFAULT_SITE_TYPES[cfg.lang] ? cfg.lang : 'es');
  const userTypes = Array.isArray(cfg.siteTypes) ? cfg.siteTypes.slice() : [];
  const existingById = new Map();
  userTypes.forEach(tt => {
    if (!tt.id) tt.id = 't-' + Math.random().toString(36).slice(2, 8);
    if (!tt.label) tt.label = tt.id;
    if (!existingById.has(tt.id)) existingById.set(tt.id, tt);
  });

  const universalTypes = DEFAULT_SITE_TYPES[langKey];
  universalTypes.forEach(def => {
    if (!existingById.has(def.id)){
      existingById.set(def.id, { id: def.id, label: def.label, builtin: true });
    } else {
      const cur = existingById.get(def.id);
      if (!cur.builtin) cur.builtin = true;
    }
  });

  cfg.siteTypes = Array.from(existingById.values());

  const baseDomains = new Set(CATALOG_FLAT.map(x => x.d));
  const customDomains = new Set(cfg.customCatalog.map(x => x.d));
  cfg.sites.forEach(s => {
    if (!baseDomains.has(s.domain) && !customDomains.has(s.domain)){
      cfg.customCatalog.push({
        d: s.domain, n: s.domain, lang: s.lang || 'auto',
        type: s.type || '', tags: (s.tags||[]).slice(),
        group: 'Personalizados'
      });
      customDomains.add(s.domain);
    }
  });
  cfg.disabledDomains.forEach(d => {
    if (!baseDomains.has(d) && !customDomains.has(d)){
      cfg.customCatalog.push({
        d, n: d, lang: 'auto', type: '', tags: [],
        group: 'Personalizados'
      });
      customDomains.add(d);
    }
  });

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
  return JSON.stringify([cfg.lang, p.theme, p.font, p.fs, !!p.just, !!p.bionic, !!p.focus]);
}
function perfilDelLector(){
  const p = CFG.prefs || {};
  return limpiarPerfil({
    lang: CFG.lang, tema: p.theme, fuente: p.font === 'georgia' ? 'serif' : p.font,
    fs: p.fs, just: !!p.just, bionic: !!p.bionic, focus: !!p.focus,
    actualizado: CFG.perfilActualizado || 0
  });
}
function aplicarPerfilAlLector(perfil){
  const p = CFG.prefs;
  if (UI_LANGS.includes(perfil.lang)) CFG.lang = perfil.lang;
  if (['light', 'sepia', 'dark', 'contrast'].includes(perfil.tema)) p.theme = perfil.tema;
  if (perfil.fuente) p.font = perfil.fuente === 'serif' ? 'georgia' : perfil.fuente;
  if (typeof perfil.fs === 'number') p.fs = Math.min(UI.fsMax, Math.max(UI.fsMin, perfil.fs));
  ['just', 'bionic', 'focus'].forEach(k => { if (perfil[k] !== undefined) p[k] = !!perfil[k]; });
  CFG.perfilActualizado = perfil.actualizado;
  __perfilFirma = firmaPerfilLector(CFG);   // ya sellado: no es un cambio de aquí
}

// Configuración propia del lector que viaja a otros dispositivos (por
// Voceiro y su sincronización): reglas por sitio, catálogo propio,
// diccionarios, servicios de «Abrir en…», atajos… Todo menos Pendientes, el
// perfil común (va aparte), los sellos y la posición de los botones.
const CFG_NO_VIAJA = ['readLater', 'voceiro', 'lang', 'perfilActualizado', 'configActualizado', 'fab'];
const PREFS_DEL_PERFIL = ['theme', 'font', 'fs', 'just', 'bionic', 'focus'];
let __configFirma = null;

function configCompartida(cfg){
  const out = {};
  for (const k of Object.keys(cfg)){
    if (!CFG_NO_VIAJA.includes(k)) out[k] = cfg[k];
  }
  if (out.prefs){
    const p = { ...out.prefs };
    PREFS_DEL_PERFIL.forEach(k => delete p[k]);
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
        if (!PREFS_DEL_PERFIL.includes(pk)) p[pk] = pv;
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
  const firma = firmaPerfilLector(cfg);
  if (__perfilFirma !== null && firma !== __perfilFirma) cfg.perfilActualizado = Date.now();
  __perfilFirma = firma;
  const firmaC = firmaConfig(cfg);
  if (__configFirma !== null && firmaC !== __configFirma) cfg.configActualizado = Date.now();
  __configFirma = firmaC;
  PLATAFORMA.guardar(CFG_KEY, cfg);
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
  for (const it of (CFG.customCatalog || [])){
    if (domainMatches(host, it.d)) return true;
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
  for (const it of (CFG.customCatalog || [])){
    if (domainMatches(host, it.d)) return it;
  }
  for (const s of (CFG.sites || [])){
    if (domainMatches(host, s.domain)){
      return { d: s.domain, n: s.domain, lang: s.lang, type: s.type, tags: s.tags };
    }
  }
  return null;
}

function getCustomCatalogEntry(domain){
  const d = normalizeDomain(domain);
  if (!d) return null;
  return (CFG.customCatalog || []).find(x => x.d === d) || null;
}
function addOrUpdateCustomCatalogEntry(domain, opts){
  const d = normalizeDomain(domain);
  if (!d) return;
  opts = opts || {};
  if (!Array.isArray(CFG.customCatalog)) CFG.customCatalog = [];
  const existing = CFG.customCatalog.find(x => x.d === d);
  if (existing){
    if (opts.lang) existing.lang = opts.lang;
    if (opts.type !== undefined) existing.type = opts.type;
    if (opts.tags) existing.tags = opts.tags.slice();
    if (opts.n) existing.n = opts.n;
  } else {
    CFG.customCatalog.push({
      d: d,
      n: opts.n || d,
      lang: opts.lang || 'auto',
      type: opts.type || '',
      tags: Array.isArray(opts.tags) ? opts.tags.slice() : [],
      group: 'Personalizados'
    });
  }
}
function removeCustomCatalogEntry(domain){
  const d = normalizeDomain(domain);
  if (!d) return;
  CFG.customCatalog = (CFG.customCatalog || []).filter(x => x.d !== d);
}
function isBaseCatalogDomain(domain){
  const d = normalizeDomain(domain);
  if (!d) return false;
  if (CATALOG_BY_DOMAIN.has(d)) return true;
  let idx = d.indexOf('.');
  while (idx !== -1){
    const suf = d.slice(idx + 1);
    if (CATALOG_BY_DOMAIN.has(suf)) return true;
    idx = d.indexOf('.', idx + 1);
  }
  return false;
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
    domain: d, mode: 'prompt', ignorePatterns: [], readerSource: 'auto', lang: 'auto',
    type: '', tags: [], textOnly: false,
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
    const f = document.getElementById('il-fab'); if (f) f.remove();
    return true;
  }
  return false;
}
function getTypeLabel(id){
  if (!id) return '';
  const tt = (CFG.siteTypes || []).find(x => x.id === id);
  return tt ? tt.label : id;
}
function getAllKnownTags(){
  const set = new Set(CFG.siteTags || []);
  CFG.sites.forEach(s => (s.tags || []).forEach(tg => set.add(tg)));
  (CFG.customCatalog || []).forEach(it => (it.tags || []).forEach(tg => set.add(tg)));
  return Array.from(set).sort();
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

function addSiteFromCatalog(entry){
  const d = normalizeDomain(entry.d);
  if (!d) return false;
  if (CFG.sites.some(s => s.domain === d)) return false;
  CFG.sites.push({
    domain: d,
    mode: 'prompt',
    ignorePatterns: [],
    readerSource: 'auto',
    lang: entry.lang || 'auto',
    type: entry.type || '',
    tags: Array.isArray(entry.tags) ? entry.tags.slice() : [],
    textOnly: false,
    extraction: deepClone(DEFAULT_EXTRACTION)
  });
  CFG.sites.sort((a, b) => a.domain.localeCompare(b.domain));
  enableDomain(d);
  if (!isBaseCatalogDomain(d)){
    addOrUpdateCustomCatalogEntry(d, {
      n: entry.n || d, lang: entry.lang || 'auto',
      type: entry.type || '', tags: entry.tags || []
    });
  }
  return true;
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
    type: opts.type !== undefined ? opts.type : (cat.type || ''),
    tags: opts.tags || (cat.tags ? cat.tags.slice() : []),
    textOnly: false,
    extraction: deepClone(DEFAULT_EXTRACTION)
  });
  CFG.sites.sort((a, b) => a.domain.localeCompare(b.domain));
  enableDomain(d);
  if (!isBaseCatalogDomain(d)){
    addOrUpdateCustomCatalogEntry(d, {
      n: opts.n || d, lang: opts.lang || cat.lang || 'auto',
      type: opts.type !== undefined ? opts.type : (cat.type || ''),
      tags: opts.tags || (cat.tags ? cat.tags.slice() : [])
    });
  }
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
  const fab = document.getElementById('il-fab'); if (fab) fab.remove();
  const bfab = document.getElementById('il-servicios-fab'); if (bfab) bfab.remove();
  const afab = document.getElementById('il-add-fab'); if (afab) afab.remove();
  repositionStackFABs();
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




/* ============================================================
   10. TOAST + DIÁLOGO
   ============================================================ */
function toast(msg, ms, action){
  ms = ms || 2400;
  if (action) ms = Math.max(ms, 6000);
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%) translateY(20px);' +
    'background:#222;color:#fff;padding:12px 18px;border-radius:8px;' +
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
    btn.style.cssText = 'background:transparent;color:#ffb4b4;border:1px solid #ffb4b4;' +
      'padding:4px 10px;border-radius:4px;cursor:pointer;font-size:13px;font-weight:bold;' +
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
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483647;' +
      'display:flex;align-items:center;justify-content:center;padding:20px;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;color:#222;border-radius:12px;max-width:460px;width:100%;' +
      'padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.4)';
    box.innerHTML =
      '<h3 style="margin:0 0 10px;font-size:17px">' + esc(t('addSiteTitle')) + '</h3>' +
      '<p style="margin:0 0 18px;font-size:14px;line-height:1.5;color:#444">' +
        esc(t('addSiteQuestion').replace('{X}', domain).replace('{Y}', srcLabel)) +
      '</p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end">' +
        '<button class="il-dlg-cancel" style="padding:9px 14px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer;font-size:14px">' + esc(t('btnCancel')) + '</button>' +
        '<button class="il-dlg-once" style="padding:9px 14px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer;font-size:14px">' + esc(t('btnOnlyOnce')) + '</button>' +
        '<button class="il-dlg-add" style="padding:9px 14px;background:#d32f2f;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:bold">' + esc(t('btnAddList')) + '</button>' +
      '</div>';
    overlay.appendChild(box);
    (parentEl || document.body).appendChild(overlay);
    let resolved = false;
    function cleanup(val){
      if (resolved) return;
      resolved = true;
      document.removeEventListener('keydown', escCapture, true);
      overlay.remove();
      resolve(val);
    }
    function escCapture(e){
      if (e.key === 'Escape'){ e.stopImmediatePropagation(); e.preventDefault(); cleanup('cancel'); }
    }
    document.addEventListener('keydown', escCapture, true);
    box.querySelector('.il-dlg-cancel').onclick = () => cleanup('cancel');
    box.querySelector('.il-dlg-once').onclick   = () => cleanup('once');
    box.querySelector('.il-dlg-add').onclick    = () => cleanup('add');
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
  style.textContent = '.il-picker-hover{outline:2px dashed #d32f2f !important;outline-offset:-2px !important;background:rgba(211,47,47,.08) !important;cursor:crosshair !important}';
  document.head.appendChild(style);

  const bar = document.createElement('div');
  bar.id = 'il-picker-bar';
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#222;color:#fff;' +
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

function ensureReaderFAB(){
  if (!shouldShowReaderFAB()) return;
  if (document.getElementById('il-fab')) return;
  if (document.getElementById('il-full')) return;
  createFAB();
}

/* ============================================================
   16. CSS DEL LECTOR
   ============================================================ */
function buildReaderCSS(){
  return `
#il-full{--bg:#fff;--fg:#222;--muted:#888;--accent:#d32f2f;--border:#eee;--quote-bg:#f9f9f9;--btn-bg:#f7f7f7;--btn-border:#ccc;--shadow:rgba(0,0,0,.08);--ambi-op:.25;position:fixed;inset:0;background:var(--bg);color:var(--fg);z-index:2147483646;overflow:auto;-webkit-text-size-adjust:100%}
#il-full[data-theme="sepia"]{--bg:#f4ecd8;--fg:#3b2f1e;--muted:#8a7a5c;--accent:#a0522d;--border:#e0d5b8;--quote-bg:#ede0c4;--btn-bg:#ede0c4;--btn-border:#c8b88a;--shadow:rgba(59,47,30,.15)}
#il-full[data-theme="dark"]{--bg:#1a1a1a;--fg:#e0e0e0;--muted:#999;--accent:#ff6b6b;--border:#333;--quote-bg:#252525;--btn-bg:#2a2a2a;--btn-border:#444;--shadow:rgba(0,0,0,.5);--ambi-op:.4}
#il-full[data-theme="contrast"]{--bg:#000;--fg:#fff;--muted:#ff0;--accent:#0ff;--border:#fff;--quote-bg:#111;--btn-bg:#111;--btn-border:#fff;--shadow:rgba(255,255,255,.2);--ambi-op:.5}
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
#il-full button.il-primary{background:var(--accent);color:#fff;border-color:var(--accent);font-size:15px;font-weight:bold}
#il-full button.il-active{background:var(--accent);color:#fff;border-color:var(--accent)}
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
#il-full .il-source-badge{color:var(--muted);opacity:.75;margin-left:4px}
#il-full .il-top-btn{position:fixed;bottom:24px;right:24px;z-index:20;width:48px;height:48px;padding:0;border-radius:50%;font-size:22px;line-height:1;background:var(--accent);color:#fff;border:1px solid var(--accent);box-shadow:0 4px 12px var(--shadow);opacity:0;pointer-events:none;transform:translateY(12px);transition:opacity .25s,transform .25s}
#il-full .il-top-btn.il-show{opacity:1;pointer-events:auto;transform:translateY(0)}
#il-full .il-dict-popup{position:fixed;background:var(--bg);color:var(--fg);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.35);z-index:30;padding:8px;display:flex;flex-direction:column;gap:4px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;min-width:180px}
#il-full .il-dict-popup-title{padding:6px 10px;font-size:12px;color:var(--muted);border-bottom:1px solid var(--border);margin-bottom:4px}
#il-full .il-dict-popup button{text-align:left;padding:8px 10px;border:none;background:transparent;color:var(--fg);cursor:pointer;border-radius:4px;font-size:14px;font-family:inherit}
#il-full .il-dict-popup button:hover{background:var(--quote-bg)}
@media print{#il-full .il-top-btn{display:none!important}}
`;
}

/* ============================================================
   17. DESPLEGABLE «ABRIR EN…»
   ============================================================ */
function crearDesplegableServicios(opts){
  opts = opts || {};
  const dd = document.createElement('div');
  dd.className = 'il-servicios-dropdown';
  dd.setAttribute('role', 'menu');
  if (opts.position === 'fixed-top-right'){
    dd.style.cssText = 'position:fixed;top:60px;right:20px;' +
      'background:var(--bg,#fff);color:var(--fg,#222);border:1px solid var(--border,#ddd);' +
      'border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.35);padding:6px;' +
      'z-index:2147483647;min-width:210px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
  } else if (opts.position === 'below-left'){
    dd.style.cssText = 'position:absolute;top:' + (UI.fabSize + 12) + 'px;left:0;background:#fff;color:#222;' +
      'border:1px solid #ddd;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.25);' +
      'padding:6px;min-width:210px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
  } else {
    dd.style.cssText = 'position:absolute;bottom:64px;left:0;background:#fff;color:#222;' +
      'border:1px solid #ddd;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.25);' +
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
      'font-weight:' + (secundario ? '400' : '500') + (secundario ? ';opacity:.75' : '');
    btn.onmouseenter = () => { btn.style.background = 'rgba(0,0,0,.06)'; };
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
    vacio.style.cssText = 'padding:8px 12px;font-size:13px;opacity:.75;max-width:260px';
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

  const root = document.createElement('div');
  root.id = 'il-extract-tool';
  root.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483647;' +
    'display:flex;align-items:center;justify-content:center;padding:20px;' +
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;color:#222;border-radius:12px;max-width:1000px;width:100%;' +
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
          '<tr style="border-bottom:1px solid #f0f0f0">' +
            '<td style="padding:6px 8px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:#0a7d00">' + esc(c.selector) + '</td>' +
            '<td style="padding:6px 8px;text-align:right">' + c.count + '</td>' +
            '<td style="padding:6px 8px;text-align:right">' + c.words + ' ' + esc(t('extractionWordsShort')) + '</td>' +
            '<td style="padding:6px 8px;text-align:right">' + c.imgs + ' ' + esc(t('extractionImgsShort')) + '</td>' +
            '<td style="padding:6px 8px"><button class="il-diag-use" data-sel="' + esc(c.selector) + '" ' +
              'style="padding:3px 8px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;font-size:11px">' +
              esc(t('extractionUseThis')) + '</button></td>' +
          '</tr>').join('')
      : '<tr><td colspan="5" style="padding:12px;color:#888;font-size:12px;text-align:center">' + esc(t('extractionNoCandidates')) + '</td></tr>';
    const overlays = (diag.overlays || []).length
      ? diag.overlays.map(o => '<code style="font-size:11px;background:#f4f4f4;padding:2px 6px;border-radius:3px;margin:2px 4px 2px 0;display:inline-block">' +
          esc(o.tag + (o.id ? '#' + o.id : '') + (o.cls ? '.' + o.cls.split(/\s+/)[0] : '')) + ' (z-index: ' + esc(o.zIndex) + ')</code>').join('')
      : '<span style="color:#888;font-size:12px">—</span>';
    const paywall = diag.paywall.detected
      ? '<span style="color:#c00;font-weight:bold">' + esc(t('extractionPaywallYes')) + '</span>' +
        ' <span style="color:#888;font-size:12px">(' + diag.paywall.indicators.map(esc).join(', ') + ')</span>'
      : '<span style="color:#0a7d00;font-weight:bold">' + esc(t('extractionPaywallNo')) + '</span>';

    return (
      '<div style="border:1px solid #eee;border-radius:8px;padding:14px;margin-bottom:16px;background:#fafafa">' +
        '<h4 style="margin:0 0 10px;font-size:13px;color:#666;text-transform:uppercase;letter-spacing:.5px">' +
          esc(t('extractionDiagnostics')) + '</h4>' +
        '<div style="font-size:13px;line-height:1.9">' +
          '<strong>' + esc(t('extractionTitleLbl')) + ':</strong> ' + esc(diag.title.text) +
            ' <span style="color:#888;font-size:11px">(' + esc(diag.title.source) + ')</span><br>' +
          '<strong>' + esc(t('extractionMetricsLbl')) + ':</strong> ' +
            diag.metrics.p + ' &lt;p&gt; · ' + diag.metrics.img + ' img · ' +
            diag.metrics.words + ' ' + esc(t('extractionWordsShort')) + ' · ' +
            diag.metrics.textLen + ' ' + esc(t('extractionCharsShort')) + '<br>' +
          '<strong>' + esc(t('extractionPaywallLbl')) + ':</strong> ' + paywall + '<br>' +
          '<strong>' + esc(t('extractionOverlaysLbl')) + ':</strong> ' +
            (diag.overlays.length ? diag.overlays.length + ' ' + overlays : '<span style="color:#888;font-size:12px">—</span>') +
        '</div>' +
        '<div style="margin-top:12px">' +
          '<div style="font-size:12px;color:#666;margin-bottom:6px"><strong>' + esc(t('extractionCandidatesLbl')) + '</strong></div>' +
          '<div style="border:1px solid #eee;border-radius:6px;background:#fff;overflow:hidden">' +
            '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
              '<thead><tr style="background:#f7f7f7;font-size:11px;color:#666">' +
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
      return '<div style="border:1px dashed #ccc;border-radius:8px;padding:16px;color:#888;font-size:13px;text-align:center">' +
        esc(t('extractionPreviewEmpty')) + (lastError ? ' · ' + esc(lastError) : '') +
      '</div>';
    }
    const words = countWords(art.rawBody);
    const chars = art.rawBody.length;
    const preview = art.rawBody.slice(0, 800).replace(/\s+/g,' ').trim() + (art.rawBody.length > 800 ? '…' : '');
    return (
      '<div style="border:1px solid #eee;border-radius:8px;padding:14px;background:#fff">' +
        '<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:#666;margin-bottom:8px">' +
          '<span><strong>' + esc(t('extractionTitleLbl')) + ':</strong> ' + esc(art.headline || '—') + '</span>' +
          '<span><strong>' + esc(t('extractionMetricsLbl')) + ':</strong> ' + words + ' ' + esc(t('extractionWordsShort')) + ' · ' + chars + ' ' + esc(t('extractionCharsShort')) + '</span>' +
          '<span><strong>' + esc(t('extractionSourcePrefix')) + ':</strong> ' + esc(art._source || '—') + '</span>' +
        '</div>' +
        '<div style="font-size:13px;line-height:1.5;color:#333;max-height:180px;overflow:auto;padding:10px;background:#fafafa;border-radius:6px;white-space:pre-wrap">' +
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
          '<div style="font-size:12px;color:#666;margin-top:2px">' + esc(site.domain) + '</div>' +
        '</div>' +
        '<button class="il-et-close" style="padding:8px 14px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer">' + esc(t('close')) + '</button>' +
      '</div>' +

      '<div style="margin-bottom:16px">' +
        '<label style="display:block;font-size:12px;color:#666;text-transform:uppercase;margin-bottom:6px">' + esc(t('extractionMode')) + '</label>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button class="il-et-mode" data-mode="auto" style="flex:1;min-width:180px;text-align:left;padding:10px 12px;' +
            (work.mode === 'auto' ? 'border:2px solid #d32f2f;' : 'border:1px solid #ccc;') +
            'background:#fff;border-radius:8px;cursor:pointer">' +
            '<div style="font-weight:bold;font-size:13px">' + esc(t('extractionModeAuto')) + '</div>' +
            '<div style="font-size:11px;color:#666;margin-top:3px">' + esc(t('extractionHintAuto')) + '</div>' +
          '</button>' +
          '<button class="il-et-mode" data-mode="selector" style="flex:1;min-width:180px;text-align:left;padding:10px 12px;' +
            (work.mode === 'selector' ? 'border:2px solid #d32f2f;' : 'border:1px solid #ccc;') +
            'background:#fff;border-radius:8px;cursor:pointer">' +
            '<div style="font-weight:bold;font-size:13px">' + esc(t('extractionModeSelector')) + '</div>' +
            '<div style="font-size:11px;color:#666;margin-top:3px">' + esc(t('extractionHintSelector')) + '</div>' +
          '</button>' +
          '<button class="il-et-mode" data-mode="all" style="flex:1;min-width:180px;text-align:left;padding:10px 12px;' +
            (work.mode === 'all' ? 'border:2px solid #d32f2f;' : 'border:1px solid #ccc;') +
            'background:#fff;border-radius:8px;cursor:pointer">' +
            '<div style="font-weight:bold;font-size:13px">' + esc(t('extractionModeAll')) + '</div>' +
            '<div style="font-size:11px;color:#666;margin-top:3px">' + esc(t('extractionHintAll')) + '</div>' +
          '</button>' +
        '</div>' +
      '</div>' +

      (work.mode === 'selector' ?
      '<div style="border:1px solid #eee;border-radius:8px;padding:12px;margin-bottom:16px">' +
        '<div style="margin-bottom:10px">' +
          '<label style="display:block;font-size:12px;color:#666;text-transform:uppercase;margin-bottom:4px">' + esc(t('extractionRoot')) + '</label>' +
          '<div style="display:flex;gap:6px">' +
            '<input class="il-et-root" value="' + esc(work.root) + '" placeholder="' + esc(t('extractionRootPh')) + '" ' +
              'style="flex:1;padding:8px 12px;border:1px solid #ccc;border-radius:6px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px">' +
            '<button class="il-et-pick" style="padding:8px 14px;background:#d32f2f;color:#fff;border:none;border-radius:6px;cursor:pointer;white-space:nowrap">' +
              esc(t('extractionPickBtn')) + '</button>' +
          '</div>' +
        '</div>' +
        '<div style="margin-bottom:10px">' +
          '<label style="display:block;font-size:12px;color:#666;text-transform:uppercase;margin-bottom:4px">' + esc(t('extractionExclude')) + '</label>' +
          '<input class="il-et-exclude" value="' + esc(work.exclude) + '" placeholder="' + esc(t('extractionExcludePh')) + '" ' +
            'style="width:100%;padding:8px 12px;border:1px solid #ccc;border-radius:6px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px">' +
        '</div>' +
        '<div>' +
          '<label style="display:block;font-size:12px;color:#666;text-transform:uppercase;margin-bottom:4px">' + esc(t('extractionMinChars')) + '</label>' +
          '<input type="number" class="il-et-min" value="' + work.minChars + '" min="20" max="10000" ' +
            'style="width:120px;padding:8px 12px;border:1px solid #ccc;border-radius:6px;font-size:13px">' +
        '</div>' +
      '</div>' : '') +

      renderDiagnosticsHTML(diag) +

      '<div style="margin-bottom:10px">' +
        '<div style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">' +
          esc(t('extractionPreviewLbl')) + '</div>' +
        renderPreviewHTML() +
      '</div>' +

      '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:16px;border-top:1px solid #eee;padding-top:14px">' +
        '<button class="il-et-refresh" style="padding:8px 14px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer">' +
          esc(t('extractionDiagnoseBtn')) + '</button>' +
        '<button class="il-et-test" style="padding:8px 14px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer">' +
          esc(t('extractionTestBtn')) + '</button>' +
        '<button class="il-et-cancel" style="padding:8px 14px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer">' +
          esc(t('extractionCancelBtn')) + '</button>' +
        '<button class="il-et-save" style="padding:8px 14px;background:#d32f2f;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold">' +
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
function openReader(art){
  if (document.getElementById('il-full')) return;

  const prefs = CFG.prefs;
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

  const parrafos = useHTML ? buildBlocksFromHTML(rawHTML) : buildBlocksFromText(rawBody);
  const srcKey = art._source || (rawHTML ? 'readability' : 'jsonld');
  const srcName = srcKey === 'jsonld' ? t('srcJsonld')
                : srcKey === 'custom' ? t('srcCustom')
                : srcKey === 'all' ? t('extractionModeAll')
                : t('srcReadability');
  const wordsCount = countWords(plainBody);

  const iu = String(art.image || '');
  const iuHi = iu.replace('_16-9-discover-', '_source-');
  const iuFinal = iuHi !== iu ? iuHi : iu;
  const iuFallback = iuHi !== iu ? iu : '';
  const cap = art.imageCaption || '';
  const auImg = art.imageAuthor || '';

  function renderBlock(b){
    const process = html => prefs.bionic ? bionicizeHTML(html) : html;
    if (b.tipo === 'img'){
      return '<figure class="il-inline-figure">' +
        '<img src="' + esc(b.src) + '" alt="' + esc(b.alt || '') + '" loading="lazy">' +
        (b.caption ? '<figcaption>' + esc(b.caption) + '</figcaption>' : '') +
      '</figure>';
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
  const serviciosHTML = servicios.map(svc =>
    '<button class="il-servicio" data-servicio="' + esc(svc.id) + '">' + esc(svc.nombre) + '</button>'
  ).join('');

  const progressHTML =
    '<div class="il-progress"><div class="il-progress-bar"></div></div>';

  const toolbarHTML =
    progressHTML +
    '<div class="il-topbar">' +
      '<div class="il-nav-row">' +
        '<button class="il-back il-primary">' + esc(t('back')) + '</button>' +
        '<button class="il-voceiro-btn il-primary">' + esc(t('btnTitulares')) + '</button>' +
        '<button class="il-toggle-text">' + esc(t('options')) + '</button>' +
        '<button class="il-toggle-actions">' + esc(t('actions')) + '</button>' +
        '<button class="il-textonly-btn" title="' + esc(t('textOnlyShort')) + '">🖼</button>' +
        '<button class="il-pendientes-btn" title="' + esc(t('pendientesShort')) + '">📚</button>' +
        (servicios.length
          ? '<button class="il-servicios-btn" title="' + esc(t('abrirEn')) + '" aria-label="' + esc(t('abrirEn')) + '">↗</button>'
          : '') +
        '<button class="il-settings-btn" title="' + esc(t('settingsShort')) + '">⚙️</button>' +
        '<button class="il-close-tab" title="' + esc(t('closeTab')) + '">✕</button>' +
        '<button class="il-close il-primary">' + esc(t('close')) + '</button>' +
      '</div>' +
      '<div class="il-settings-bar" id="il-panel-text" style="display:none">' +
        '<div class="il-group"><label>' + esc(t('theme')) + '</label>' +
          '<button data-set-theme="light" title="' + esc(t('light')) + '">☀</button>' +
          '<button data-set-theme="sepia" title="' + esc(t('sepia')) + '">📖</button>' +
          '<button data-set-theme="dark" title="' + esc(t('dark')) + '">🌙</button>' +
          '<button data-set-theme="contrast" title="' + esc(t('contrast')) + '">◐</button>' +
        '</div>' +
        '<div class="il-group"><label>' + esc(t('font')) + '</label>' +
          '<button data-set-font="georgia">' + esc(t('serif')) + '</button>' +
          '<button data-set-font="sans">' + esc(t('sans')) + '</button>' +
          '<button data-set-font="dyslexic">' + esc(t('dyslexic')) + '</button>' +
        '</div>' +
        '<div class="il-group"><label>' + esc(t('size')) + '</label>' +
          '<button class="il-fs-minus">A−</button>' +
          '<span class="il-fs-val" style="font-weight:bold;margin:0 4px">' + prefs.fs + '</span>' +
          '<button class="il-fs-plus">A+</button>' +
        '</div>' +
        '<div class="il-group"><label>' + esc(t('width')) + '</label>' +
          '<button class="il-w-minus">−</button>' +
          '<span class="il-w-val" style="font-weight:bold;margin:0 4px">' + prefs.width + '</span>' +
          '<button class="il-w-plus">+</button>' +
        '</div>' +
        '<div class="il-group"><label>' + esc(t('extra')) + '</label>' +
          '<button class="il-toggle" data-pref="just">' + esc(t('justify')) + '</button>' +
          '<button class="il-toggle" data-pref="bionic">' + esc(t('bionic')) + '</button>' +
          '<button class="il-toggle" data-pref="focus">' + esc(t('focus')) + '</button>' +
          '<button class="il-toggle" data-pref="img" title="' + esc(t('coverImageTitle')) + '">' + esc(t('coverImage')) + '</button>' +
        '</div>' +
        '<div class="il-group"><label>' + esc(t('source')) + '</label>' +
          '<button class="il-source" data-src="auto">' + esc(t('srcAuto')) + '</button>' +
          '<button class="il-source" data-src="jsonld">' + esc(t('srcJsonld')) + '</button>' +
          '<button class="il-source" data-src="readability">' + esc(t('srcReadability')) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="il-settings-bar" id="il-panel-actions" style="display:none;background:var(--quote-bg)">' +
        serviciosHTML +
        '<button class="il-copytxt">' + esc(t('copyText')) + '</button>' +
        '<button class="il-print">' + esc(t('print')) + '</button>' +
        '<button class="il-mail">' + esc(t('email')) + '</button>' +
        '<button class="il-share">' + esc(t('share')) + '</button>' +
        '<button class="il-ignore-section">' + esc(t('ignoreSection')) + '</button>' +
      '</div>' +
    '</div>';

  const figura = iuFinal
    ? '<figure class="il-figure"><img src="' + esc(iuFinal) + '"' +
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
      '<button class="il-save-meta" title="' + esc(t('saveLater')) + '">🕒 ' + esc(t('saveLater')) + '</button>' +
      '<button class="il-rsvp-meta" title="' + esc(t('teleprompter')) + '">' + esc(t('teleprompter')) + '</button>' +
    '</div>';

  const contentHTML =
    '<div class="il-wrap"><div class="il-content">' +
      '<h1>' + esc(headline) + '</h1>' +
      (description ? '<p class="il-desc">' + esc(description) + '</p>' : '') +
      '<div class="il-meta">' + esc(fecha) +
        (articleSection ? ' · ' + esc(articleSection) : '') +
        (autores ? ' · ' + esc(autores) : '') +
      '</div>' +
      metaActions +
      figura +
      '<div class="il-body">' + renderBody() + '</div>' +
      '<div class="il-footer">' +
        '<button class="il-footer-top">' + esc(t('up')) + '</button> · ' +
        '<button class="il-footer-back">' + esc(t('back')) + '</button> · ' +
        '<button class="il-dict-hint">' + esc(t('raeHint')) + ' ' + esc(defaultDictName) + '</button>' +
        sourceBadge +
      '</div>' +
    '</div></div>';

  const ambi = iuFinal ? '<img id="il-ambi-img" src="' + esc(iuFinal) + '"' +
    (iuFallback ? ' data-fallback="' + esc(iuFallback) + '"' : '') + ' alt="">' : '';

  const full = '<div id="il-full" data-theme="' + prefs.theme + '" data-font="' + prefs.font +
    '" data-just="' + (prefs.just ? '1' : '0') + '">' +
    '<style>' + buildReaderCSS() + '</style>' + ambi +
    '<div style="position:relative;z-index:1">' + toolbarHTML + contentHTML + '</div>' +
    '<button class="il-top-btn" title="' + esc(t('up')) + '">↑</button>' +
    '</div>';

  document.body.insertAdjacentHTML('beforeend', full);
  const ov = document.getElementById('il-full');

  function currentSiteTextOnly(){
    const rule = findSiteRule();
    return !!(rule && rule.textOnly);
  }

  function applyPrefs(){
    ov.setAttribute('data-theme', prefs.theme);
    ov.setAttribute('data-font', prefs.font);
    ov.setAttribute('data-just', prefs.just ? '1' : '0');
    ov.style.setProperty('--w', prefs.width + 'px');
    ov.style.setProperty('--fs', prefs.fs + 'px');
    ov.style.setProperty('--lh', prefs.lh);
    ov.classList.toggle('il-hideimg', !prefs.img);
    ov.classList.toggle('il-focus', prefs.focus);
    const siteTextOnly = currentSiteTextOnly();
    ov.classList.toggle('il-textonly', siteTextOnly);

    const toBtn = ov.querySelector('.il-textonly-btn');
    if (toBtn){
      toBtn.textContent = siteTextOnly ? '📝' : '🖼';
      toBtn.title = siteTextOnly ? t('textOnlyOn') : t('textOnlyOff');
      toBtn.classList.toggle('il-active', siteTextOnly);
    }

    ov.querySelector('.il-fs-val').textContent = prefs.fs;
    ov.querySelector('.il-w-val').textContent = prefs.width;
    ov.querySelectorAll('[data-set-theme]').forEach(b =>
      b.classList.toggle('il-active', b.getAttribute('data-set-theme') === prefs.theme));
    ov.querySelectorAll('[data-set-font]').forEach(b =>
      b.classList.toggle('il-active', b.getAttribute('data-set-font') === prefs.font));
    ov.querySelectorAll('.il-toggle').forEach(b =>
      b.classList.toggle('il-active', !!prefs[b.getAttribute('data-pref')]));
    const srcCurrent = currentReaderSource();
    ov.querySelectorAll('.il-source').forEach(b =>
      b.classList.toggle('il-active', b.getAttribute('data-src') === srcCurrent));
    const pText = ov.querySelector('#il-panel-text');
    const pAct = ov.querySelector('#il-panel-actions');
    const bText = ov.querySelector('.il-toggle-text');
    const bAct = ov.querySelector('.il-toggle-actions');
    pText.style.display = prefs.panelText ? 'flex' : 'none';
    pAct.style.display = prefs.panelActions ? 'flex' : 'none';
    bText.classList.toggle('il-active', prefs.panelText);
    bAct.classList.toggle('il-active', prefs.panelActions);
    saveCfg(CFG);
    if (prefs.focus) setTimeout(updateFocus, 60);
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

  function wireImages(){
    ov.querySelectorAll('.il-figure img, .il-inline-figure img, #il-ambi-img').forEach(im => {
      if (im.dataset.ilWired === '1') return;
      im.dataset.ilWired = '1';
      im.addEventListener('error', function(){
        const fb = this.getAttribute('data-fallback');
        if (fb && this.src !== fb){ this.removeAttribute('data-fallback'); this.src = fb; }
        else this.style.display = 'none';
      });
      if (im.closest('.il-figure') || im.closest('.il-inline-figure')){
        im.addEventListener('click', function(){
          const lb = document.createElement('div');
          lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:30;' +
            'display:flex;align-items:center;justify-content:center;cursor:zoom-out;padding:20px';
          const big = document.createElement('img');
          big.src = this.src;
          big.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain';
          lb.appendChild(big);
          lb.onclick = () => lb.remove();
          ov.appendChild(lb);
        });
      }
    });
  }

  applyPrefs();
  wireImages();



  const topBtn = ov.querySelector('.il-top-btn');
  topBtn.onclick = () => ov.scrollTo({ top: 0, behavior: 'smooth' });

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
    ov.remove();
    setTimeout(() => ensureReaderFAB(), 100);
  }

  function goBack(){
    saveScroll();
    const before = location.href;
    if (history.length > 1){
      history.back();
      setTimeout(() => {
        if (location.href === before && document.getElementById('il-full')) closeOverlay();
      }, 250);
    } else {
      closeOverlay();
    }
  }

  const bText = ov.querySelector('.il-toggle-text');
  const bAct = ov.querySelector('.il-toggle-actions');
  bText.onclick = function(e){
    e.stopPropagation();
    prefs.panelText = !prefs.panelText;
    prefs.panelActions = false;
    applyPrefs();
  };
  bAct.onclick = function(e){
    e.stopPropagation();
    prefs.panelActions = !prefs.panelActions;
    prefs.panelText = false;
    applyPrefs();
  };
  ov.querySelector('.il-wrap').addEventListener('click', e => {
    if (!(e.ctrlKey || e.metaKey)){
      prefs.panelActions = false;
      applyPrefs();
    }
  });

  ov.querySelectorAll('.il-close').forEach(b => b.onclick = closeOverlay);
  ov.querySelector('.il-close-tab').onclick = () => {
    // 1. Intentar cerrar la pestaña
    try { window.close(); } catch(e){}
    // 2. Si en 200 ms sigue abierta, volver a Voceiro
    setTimeout(() => {
      if (!window.closed){
        location.href = VOCEIRO_URL;
      }
    }, 200);
  };
  ov.querySelectorAll('.il-back').forEach(b => b.onclick = goBack);
  ov.querySelector('.il-settings-btn').onclick = (e) => { e.stopPropagation(); openSettings('sites'); };
  ov.querySelector('.il-pendientes-btn').onclick = (e) => { e.stopPropagation(); openSettings('pendientes'); };
  ov.querySelector('.il-voceiro-btn').onclick = (e) => {
    e.stopPropagation();
    window.open(VOCEIRO_URL, '_blank', 'noopener,noreferrer');
  };

  ov.querySelector('.il-textonly-btn').onclick = (e) => {
    e.stopPropagation();
    const rule = ensureSiteRule();
    rule.textOnly = !rule.textOnly;
    saveCfg(CFG);
    applyPrefs();
    toast(rule.textOnly ? t('textOnlyOn') : t('textOnlyOff'), 1500);
  };

  function copyText(txt, btn, label){
    const orig = btn.textContent;
    const done = () => { btn.textContent = '✅ ' + label; setTimeout(() => btn.textContent = orig, 1500); };
    const fb = () => {
      const ta = document.createElement('textarea');
      ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch(e){ toast(t('copyFailed')); }
      ta.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fb);
    else fb();
  }
  ov.querySelector('.il-copytxt').onclick = function(){ copyText(buildText(), this, t('copied')); };
  ov.querySelector('.il-print').onclick = () => window.print();
  ov.querySelector('.il-footer-top').onclick = () => ov.scrollTo({ top: 0, behavior: 'smooth' });
  ov.querySelector('.il-footer-back').onclick = goBack;
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

  const btnServicios = ov.querySelector('.il-servicios-btn');
  if (btnServicios) btnServicios.onclick = (e) => {
    e.stopPropagation();
    const existing = ov.querySelector('.il-servicios-dropdown');
    if (existing){ existing.remove(); return; }
    const dd = crearDesplegableServicios({ position: 'fixed-top-right', onClose: () => dd.remove() });
    ov.appendChild(dd);
    setTimeout(() => {
      const close = (ev) => {
        if (!dd.contains(ev.target)){
          dd.remove();
          document.removeEventListener('mousedown', close);
        }
      };
      document.addEventListener('mousedown', close);
    }, 0);
  };

  ov.querySelector('.il-ignore-section').onclick = () => { ignoreCurrentSection(); };
  ov.querySelector('.il-rsvp-meta').onclick = () => openRSVP(ov, rawBody);
  ov.querySelector('.il-dict-hint').onclick = () => { openSettings('dict'); };

  ov.querySelectorAll('[data-set-theme]').forEach(b =>
    b.onclick = () => { prefs.theme = b.getAttribute('data-set-theme'); applyPrefs(); });
  ov.querySelectorAll('[data-set-font]').forEach(b =>
    b.onclick = () => { prefs.font = b.getAttribute('data-set-font'); applyPrefs(); });
  ov.querySelector('.il-fs-minus').onclick = () => { prefs.fs = Math.max(UI.fsMin, prefs.fs - 1); applyPrefs(); };
  ov.querySelector('.il-fs-plus').onclick  = () => { prefs.fs = Math.min(UI.fsMax, prefs.fs + 1); applyPrefs(); };
  ov.querySelector('.il-w-minus').onclick  = () => { prefs.width = Math.max(UI.wMin, prefs.width - UI.wStep); applyPrefs(); };
  ov.querySelector('.il-w-plus').onclick   = () => { prefs.width = Math.min(UI.wMax, prefs.width + UI.wStep); applyPrefs(); };
  ov.querySelectorAll('.il-toggle').forEach(b => b.onclick = () => {
    const p = b.getAttribute('data-pref');
    prefs[p] = !prefs[p];
    if (p === 'bionic'){
      ov.querySelector('.il-body').innerHTML = renderBody();
      wireImages();
    }
    applyPrefs();
  });

  ov.querySelectorAll('.il-source').forEach(b => b.onclick = async () => {
    const v = b.getAttribute('data-src');
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
      if (choice === 'cancel') return;
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
    function pintarBotonGuardar(){
    const btn = ov.querySelector('.il-save-meta');
    if (!btn) return;
    const ex = findLaterItem(location.href);
    if (!ex){
      // No está → neutro
      btn.style.background = '';
      btn.style.color = '';
      btn.style.borderColor = '';
      btn.textContent = '🕒 ' + t('saveLater');
    } else if (ex.read){
      // Leída → verde (puedes volver a pendientes)
      btn.style.background = '#0a7d00';
      btn.style.color = '#fff';
      btn.style.borderColor = '#0a7d00';
      btn.textContent = '🕒 ' + t('saveToPending');
    } else {
      // Pendiente → naranja (ya está en cola)
      btn.style.background = '#e67e22';
      btn.style.color = '#fff';
      btn.style.borderColor = '#e67e22';
      btn.textContent = '🕒 ' + t('saveRemove');
    }
  }

  ov.querySelector('.il-save-meta').onclick = function(){
    saveForLater(art);
    pintarBotonGuardar();
  };

  // Estado inicial al abrir el lector
  pintarBotonGuardar();

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
      case 'scrollTop':    ov.scrollTo({ top: 0, behavior: 'smooth' }); break;
      case 'scrollBottom': ov.scrollTo({ top: ov.scrollHeight, behavior: 'smooth' }); break;
      case 'toggleBionic':
        prefs.bionic = !prefs.bionic;
        ov.querySelector('.il-body').innerHTML = renderBody();
        wireImages();
        applyPrefs();
        break;
      case 'toggleFocus':   prefs.focus = !prefs.focus; applyPrefs(); break;
      case 'toggleJustify': prefs.just  = !prefs.just;  applyPrefs(); break;
      case 'toggleImages':  prefs.img   = !prefs.img;   applyPrefs(); break;
      case 'toggleWide':    prefs.width = prefs.width >= 900 ? 720 : 1100; applyPrefs(); break;
      case 'saveLater':     saveForLater(art); break;
      case 'openSites':     openSettings('sites'); break;
      case 'openQueue':     openSettings('pendientes'); break;
      case 'openRSVP':      openRSVP(ov, rawBody); break;
      case 'copyText':
        copyText(buildText(), ov.querySelector('.il-copytxt'), t('copied'));
        break;
    }
  }

  function keyHandler(e){
    if (!document.getElementById('il-full')) return;
    if (document.getElementById('il-settings')) return;
    if (document.getElementById('il-extract-tool')) return;
    if (isPickerActive()) return;
    const tg = e.target;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;

    const nk = normalizeKey(e);
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
   20b. HELPERS DE POSICIONAMIENTO DE FABs
   ============================================================ */
const STACK_FAB_IDS = ['il-settings-fab', 'il-add-fab'];

function countStackFABs(){
  return STACK_FAB_IDS.filter(id => document.getElementById(id)).length;
}

function repositionStackFABs(){
  const M = UI.fabMargin, S = UI.fabSize, GAP = UI.fabGap;
  let offset = 0;
  for (const id of STACK_FAB_IDS){
    const el = document.getElementById(id);
    if (!el) continue;
    el.style.bottom = (M + offset * (S + GAP)) + 'px';
    el.style.left = M + 'px';
    offset++;
  }
}

/* ============================================================
   21. FAB (lector)
   ============================================================ */
function paintReaderFAB(){
  const fab = document.getElementById('il-fab');
  if (!fab) return;
  if (CFG.readerAutoAll){
    fab.style.setProperty('background', 'linear-gradient(135deg,#43a047,#1b5e20)', 'important');
    fab.style.setProperty('box-shadow', '0 4px 14px rgba(67,160,71,.65)', 'important');
  } else {
    fab.style.setProperty('background', 'linear-gradient(135deg,#d32f2f,#b71c1c)', 'important');
    fab.style.setProperty('box-shadow', '0 4px 14px rgba(0,0,0,.3)', 'important');
  }
}
function createFAB(){
  if (document.getElementById('il-fab')) return;
  const fab = document.createElement('button');
  fab.id = 'il-fab';
  fab.title = t('fabTitle') + '\n' + t('fabHidden');
  fab.textContent = '📖';
  fab.style.cssText = 'position:fixed;z-index:2147483645;width:' + UI.fabSize + 'px;height:' + UI.fabSize + 'px;' +
    'border-radius:50%;border:none;' +
    'background:linear-gradient(135deg,#d32f2f,#b71c1c);color:#fff;font-size:24px;cursor:grab;' +
    'box-shadow:0 4px 14px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;' +
    'user-select:none;touch-action:none;transition:transform .15s,box-shadow .15s;font-family:-apple-system,sans-serif;padding:0';
  document.body.appendChild(fab);

  const M = UI.fabMargin, S = UI.fabSize, GAP = UI.fabGap;
  let left, top;
  if (CFG.fab.left == null || CFG.fab.top == null){
    left = M;
    const n = countStackFABs();
    top  = window.innerHeight - M - S - n * (S + GAP);
  } else { left = CFG.fab.left; top = CFG.fab.top; }
  const clamp = () => {
    left = Math.max(4, Math.min(window.innerWidth  - S - 4, left));
    top  = Math.max(4, Math.min(window.innerHeight - S - 4, top));
  };
  clamp();
  fab.style.left = left + 'px';
  fab.style.top  = top  + 'px';

  let dragging = false, moved = false, startX = 0, startY = 0, offX = 0, offY = 0;
  function onDown(e){
    const p = e.touches ? e.touches[0] : e;
    dragging = true; moved = false;
    startX = p.clientX; startY = p.clientY;
    offX = p.clientX - left; offY = p.clientY - top;
    fab.style.cursor = 'grabbing';
    fab.style.transition = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  }
  function onMove(e){
    if (!dragging) return;
    const p = e.touches ? e.touches[0] : e;
    if (Math.abs(p.clientX - startX) > 4 || Math.abs(p.clientY - startY) > 4) moved = true;
    left = p.clientX - offX; top = p.clientY - offY;
    clamp();
    fab.style.left = left + 'px';
    fab.style.top  = top  + 'px';
    if (e.cancelable) e.preventDefault();
  }
  function onUp(){
    if (!dragging) return;
    dragging = false;
    fab.style.cursor = 'grab';
    fab.style.transition = 'transform .15s,box-shadow .15s';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
    if (moved){ CFG.fab.left = left; CFG.fab.top = top; saveCfg(CFG); }
    else activateReader();
  }
  fab.addEventListener('mousedown', onDown);
  fab.addEventListener('touchstart', onDown, { passive: true });
  fab.addEventListener('contextmenu', e => { e.preventDefault(); fab.remove(); toast(t('fabHidden')); });
  window.addEventListener('resize', () => {
    clamp();
    fab.style.left = left + 'px';
    fab.style.top  = top  + 'px';
  });

  paintReaderFAB();   // ← AQUÍ, al final de todo
}

/* ============================================================
   22. FAB «Abrir en…» (arriba-izquierda)
   Solo aparece si hay servicios configurados. Clic derecho: ocultar.
   ============================================================ */
function crearFabServicios(){
  if (document.getElementById('il-servicios-fab')) return;
  if (!debeMostrarFabServicios()) return;

  const container = document.createElement('div');
  container.id = 'il-servicios-fab';
  container.style.cssText = 'position:fixed;top:' + UI.fabMargin + 'px;left:' + UI.fabMargin + 'px;' +
    'z-index:2147483644;' +
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';

  const dd = crearDesplegableServicios({ position: 'below-left' });
  dd.id = 'il-servicios-dd';
  dd.style.display = 'none';

  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'il-servicios-btn';
  button.title = t('abrirEn');
  button.setAttribute('aria-label', t('abrirEn'));
  button.textContent = '↗';
  button.style.cssText = 'width:' + UI.fabSize + 'px;height:' + UI.fabSize + 'px;border-radius:50%;border:none;' +
    'background:linear-gradient(135deg,#555,#222);color:#fff;font-size:22px;cursor:pointer;' +
    'box-shadow:0 4px 14px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;' +
    'user-select:none;transition:transform .15s,box-shadow .15s;padding:0';
  button.onmouseenter = () => { button.style.transform = 'scale(1.08)'; };
  button.onmouseleave = () => { button.style.transform = 'scale(1)'; };
  button.onclick = e => {
    e.stopPropagation();
    dd.style.display = dd.style.display === 'block' ? 'none' : 'block';
  };
  button.addEventListener('contextmenu', e => {
    e.preventDefault();
    CFG.serviciosFab = CFG.serviciosFab || {};
    CFG.serviciosFab.oculto = true;
    saveCfg(CFG);
    document.removeEventListener('mousedown', closeHandler);
    container.remove();
    toast(t('serviciosFabOculto'), 2000);
  });

  container.appendChild(dd);
  container.appendChild(button);
  document.body.appendChild(container);

  function closeHandler(e){
    if (!container.contains(e.target)) dd.style.display = 'none';
  }
  document.addEventListener('mousedown', closeHandler);
}

/* ============================================================
   22b. FAB settings
   ============================================================ */
function createSettingsFAB(){
  if (document.getElementById('il-settings-fab')) return;
  if (isDomainDisabled(location.hostname)) return;
  if (!isKnownMediaDomain(location.hostname) && !findSiteRule()) return;

  const fab = document.createElement('button');
  fab.id = 'il-settings-fab';
  fab.type = 'button';
  fab.title = t('settingsFabTitle');
  fab.textContent = '⚙️';
  fab.style.cssText = 'position:fixed;bottom:' + UI.fabMargin + 'px;left:' + UI.fabMargin + 'px;' +
    'z-index:2147483644;width:' + UI.fabSize + 'px;height:' + UI.fabSize + 'px;border-radius:50%;border:none;' +
    'background:linear-gradient(135deg,#4a4a4a,#1f1f1f);color:#fff;font-size:22px;cursor:pointer;' +
    'box-shadow:0 4px 14px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;' +
    'user-select:none;transition:transform .15s,box-shadow .15s;padding:0;' +
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
  fab.onmouseenter = () => { fab.style.transform = 'scale(1.08)'; };
  fab.onmouseleave = () => { fab.style.transform = 'scale(1)'; };
  fab.onclick = () => openSettings('sites');
  document.body.appendChild(fab);
  repositionStackFABs();
}

/* ============================================================
   22c. FAB añadir sitio actual
   ============================================================ */
function createAddFAB(){
  if (document.getElementById('il-add-fab')) return;
  if (findSiteRule()) return;
  if (isDomainDisabled(location.hostname)) return;
  if (isPlainDomain()) return;
  if (!isKnownMediaDomain(location.hostname)) return;

  const fab = document.createElement('button');
  fab.id = 'il-add-fab';
  fab.type = 'button';
  fab.title = t('addFabTitle');
  fab.textContent = '＋';
  fab.style.cssText = 'position:fixed;bottom:' + UI.fabMargin + 'px;left:' + UI.fabMargin + 'px;' +
    'z-index:2147483644;width:' + UI.fabSize + 'px;height:' + UI.fabSize + 'px;border-radius:50%;border:none;' +
    'background:linear-gradient(135deg,#2e7d32,#1b5e20);color:#fff;font-size:26px;cursor:pointer;' +
    'box-shadow:0 4px 14px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;' +
    'user-select:none;transition:transform .15s,box-shadow .15s;padding:0;line-height:1;' +
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-weight:bold';
  fab.onmouseenter = () => { fab.style.transform = 'scale(1.08)'; };
  fab.onmouseleave = () => { fab.style.transform = 'scale(1)'; };
  fab.onclick = () => {
    const d = normalizeDomain(location.hostname);
    if (!d) return;
    if (CFG.sites.some(s => s.domain === d)){
      toast(t('alreadyInList'));
      fab.remove(); repositionStackFABs();
      return;
    }
    const cat = getCatalogEntry(d) || {};
    addSiteAnywhere(d, {
      n: cat.n || d,
      lang: cat.lang || 'auto',
      type: cat.type || '',
      tags: cat.tags || []
    });
    saveCfg(CFG);
    toast(t('addedTo') + ' ' + d, 6000,
      { label: t('btnUndo'), onClick: () => {
        if (removeSiteRule(d)){
          toast(t('siteRemovedToast').replace('{X}', d), 1800);
          setTimeout(() => { ensureAddFAB(); repositionStackFABs(); }, 50);
        }
      } });
    fab.remove();
    repositionStackFABs();
    if (!document.getElementById('il-fab')) ensureReaderFAB();
    if (!document.getElementById('il-servicios-fab') && debeMostrarFabServicios()) crearFabServicios();
  };
  document.body.appendChild(fab);
  repositionStackFABs();
}

function ensureAddFAB(){
  if (findSiteRule()) return;
  if (isDomainDisabled(location.hostname)) return;
  if (isPlainDomain()) return;
  if (!isKnownMediaDomain(location.hostname)) return;
  if (document.getElementById('il-add-fab')) return;
  createAddFAB();
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
function openSettings(initialTab){
  if (document.getElementById('il-settings')) return;
  const root = document.createElement('div');
  root.id = 'il-settings';
  root.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2147483647;' +
    'display:flex;align-items:center;justify-content:center;padding:20px;' +
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;color:#222;border-radius:12px;max-width:960px;width:100%;' +
    'max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.4);padding:24px';
  root.appendChild(box);
  document.body.appendChild(root);

  let activeSection = initialTab || 'sites';
  let activeCatalogSub = 'media';
  let searchQuery = '';
  let filterLang = '';
  let filterType = '';
  let filterTag = '';
  let catalogQuery = '';
  let catalogFilter = 'all';
  let catalogLangFilter = '';
  let catalogTypeFilter = '';
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
  document.addEventListener('keydown', escHandler, true);
  root.addEventListener('click', e => { if (e.target === root) closeSettings(); });

  function dictRow(d, lang, isDefault, isBuiltin){
    const canDelete = !isBuiltin;
    return '<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #f0f0f0">' +
      '<div style="flex:1;font-size:13px">' + esc(d.name) + '</div>' +
      '<div style="font-size:11px;color:#888;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(d.url) + '</div>' +
      '<input type="radio" name="def-' + lang + '" value="' + esc(d.id) + '"' + (isDefault ? ' checked' : '') +
        ' data-lang="' + lang + '" class="il-dict-setdef" style="cursor:pointer" title="Predeterminado">' +
      (canDelete ? '<button data-lang="' + lang + '" data-id="' + esc(d.id) + '" class="il-dict-del" ' +
        'style="border:none;background:transparent;cursor:pointer;color:#c00;font-size:12px;padding:2px 6px">🗑</button>' : '') +
    '</div>';
  }

  function tabBtn(id, label){
    return '<button class="il-set-tab" data-tab="' + id + '" style="padding:8px 16px;border:none;' +
      'border-bottom:2px solid ' + (activeSection === id ? '#d32f2f' : 'transparent') + ';' +
      'background:transparent;cursor:pointer;font-weight:bold;color:' +
      (activeSection === id ? '#d32f2f' : '#666') + '">' + esc(label) + '</button>';
  }

  function subTabBtn(parent, id, label){
    const active = activeCatalogSub === id;
    return '<button class="il-cat-subtab" data-subtab="' + id + '" style="padding:6px 14px;border:1px solid ' +
      (active ? '#d32f2f' : '#ccc') + ';background:' + (active ? '#d32f2f' : '#fff') +
      ';color:' + (active ? '#fff' : '#444') + ';border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;' +
      'margin-right:6px">' + esc(label) + '</button>';
  }

  function extractionBadge(ex){
    if (!ex || ex.mode === 'auto') return '';
    const label = ex.mode === 'selector' ? '🎯' : ex.mode === 'all' ? '📄' : '';
    const title = ex.mode === 'selector' ? ('Selector: ' + (ex.root || '—'))
                : ex.mode === 'all' ? 'Todo el texto'
                : '';
    return ' · <span style="color:#0a7d00;font-weight:bold" title="' + esc(title) + '">' + label + '</span>';
  }

  function langLabel(lang){
    if (lang === 'auto') return t('langAuto');
    const key = 'lang' + lang.charAt(0).toUpperCase() + lang.slice(1);
    return t(key) || lang;
  }

  function renderSitesTab(){
    const currentDomain = normalizeDomain(location.hostname);
    const currentDomainInList = currentDomain && CFG.sites.some(s => s.domain === currentDomain);

    const sitesFiltered = CFG.sites.filter(s => {
      if (searchQuery && !s.domain.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterLang && s.lang !== filterLang) return false;
      if (filterType && s.type !== filterType) return false;
      if (filterTag && !(s.tags || []).includes(filterTag)) return false;
      return true;
    });
    const knownTags = getAllKnownTags();

    const siteRows = sitesFiltered.map((s) => {
      const realIdx = CFG.sites.indexOf(s);
      const pats = (s.ignorePatterns || []).map((p, pi) =>
        '<span style="display:inline-flex;align-items:center;gap:4px;background:#f1f1f1;' +
          'border-radius:12px;padding:2px 4px 2px 10px;font-family:monospace;font-size:11px;margin:2px 4px 2px 0">' +
          esc(p) +
          '<button data-idx="' + realIdx + '" data-pi="' + pi + '" class="il-set-delpat" ' +
            'style="border:none;background:transparent;cursor:pointer;font-size:12px;padding:0 4px;color:#c00">✕</button>' +
        '</span>').join('');
      const patBlock = '<div style="margin-top:4px;font-size:11px;color:#666">' +
        '<span style="text-transform:uppercase;letter-spacing:.5px">' + esc(t('ignoredSections')) + ':</span> ' +
        (pats || '<span style="color:#aaa">' + esc(t('noIgnoredSections')) + '</span>') +
      '</div>';
      const tagsStr = (s.tags || []).join(', ');
      const typeLabel = s.type ? getTypeLabel(s.type) : '—';
      const textOnlyBadge = s.textOnly ? ' · <span style="color:#d32f2f;font-weight:bold">📝</span>' : '';
      const exBadge = extractionBadge(s.extraction);
      return '<div class="il-site-row" data-idx="' + realIdx + '" data-domain="' + esc(s.domain) + '" style="padding:8px 0;border-bottom:1px solid #eee;cursor:pointer">' +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
          '<div style="flex:1;min-width:140px;font-family:monospace;font-size:13px">' + esc(s.domain) + '</div>' +
          '<select data-idx="' + realIdx + '" class="il-set-mode" style="padding:6px 10px;border:1px solid #ccc;border-radius:6px;font-size:13px">' +
            '<option value="off"'    + (s.mode==='off'   ?' selected':'') + '>' + esc(t('modeOff'))    + '</option>' +
            '<option value="prompt"' + (s.mode==='prompt'?' selected':'') + '>' + esc(t('modePrompt')) + '</option>' +
            '<option value="auto"'   + (s.mode==='auto'  ?' selected':'') + '>' + esc(t('modeAuto'))   + '</option>' +
          '</select>' +
          '<select data-idx="' + realIdx + '" class="il-set-src" style="padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px">' +
            '<option value="auto"' + (s.readerSource==='auto'?' selected':'') + '>' + esc(t('srcAuto')) + '</option>' +
            '<option value="jsonld"' + (s.readerSource==='jsonld'?' selected':'') + '>' + esc(t('srcJsonld')) + '</option>' +
            '<option value="readability"' + (s.readerSource==='readability'?' selected':'') + '>' + esc(t('srcReadability')) + '</option>' +
          '</select>' +
          '<select data-idx="' + realIdx + '" class="il-set-lang" style="padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-size:12px">' +
            SITE_LANGS.map(l => '<option value="' + l + '"' + (s.lang===l?' selected':'') + '>' + esc(langLabel(l)) + '</option>').join('') +
          '</select>' +
          '<button data-idx="' + realIdx + '" class="il-set-extract" title="' + esc(t('extractionTitle')) + '" ' +
            'style="padding:6px 10px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer">🔬</button>' +
          '<button data-idx="' + realIdx + '" class="il-set-visit" title="' + esc(t('openSite')) + '" ' +
            'style="padding:6px 10px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer">🔗</button>' +
          '<button data-idx="' + realIdx + '" class="il-set-edit" title="Editar" ' +
            'style="padding:6px 10px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer">✏️</button>' +
          '<button data-idx="' + realIdx + '" class="il-set-del" style="padding:6px 10px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer">🗑</button>' +
        '</div>' +
        '<div style="margin-top:4px;font-size:11px;color:#666">' +
          '<span style="text-transform:uppercase;letter-spacing:.5px">' + esc(t('colLang')) + ':</span> ' + esc(langLabel(s.lang)) +
          ' · <span style="text-transform:uppercase;letter-spacing:.5px">' + esc(t('colType')) + ':</span> ' + esc(typeLabel) +
          (tagsStr ? ' · <span style="text-transform:uppercase;letter-spacing:.5px">' + esc(t('colTags')) + ':</span> ' + esc(tagsStr) : '') +
          textOnlyBadge + exBadge +
        '</div>' +
        patBlock +
      '</div>';
    }).join('');

    const langFilterOpts = '<option value="">' + esc(t('filterAll')) + ' ' + esc(t('filterLang')) + '</option>' +
      SITE_LANGS.map(l => '<option value="' + l + '"' + (filterLang===l?' selected':'') + '>' + esc(langLabel(l)) + '</option>').join('');
    const typeFilterOpts = '<option value="">' + esc(t('filterAll')) + ' ' + esc(t('filterType')) + '</option>' +
      CFG.siteTypes.map(tt => '<option value="' + esc(tt.id) + '"' + (filterType===tt.id?' selected':'') + '>' + esc(tt.label) + '</option>').join('');
    const tagFilterOpts = '<option value="">' + esc(t('filterAll')) + ' ' + esc(t('filterTag')) + '</option>' +
      knownTags.map(tg => '<option value="' + esc(tg) + '"' + (filterTag===tg?' selected':'') + '>' + esc(tg) + '</option>').join('');

    const addCurrentBanner = currentDomain && !currentDomainInList
      ? '<div style="background:#e8f5e9;border:1px solid #a5d6a7;border-radius:8px;padding:10px 14px;' +
          'margin-bottom:12px;display:flex;align-items:center;gap:10px;font-size:13px;flex-wrap:wrap">' +
          '<span style="flex:1;min-width:140px">📍 ' + esc(t('currentSiteHint')) + ': <strong style="font-family:monospace">' + esc(currentDomain) + '</strong></span>' +
          '<button class="il-set-add-current" style="padding:6px 14px;background:#0a7d00;color:#fff;border:none;' +
            'border-radius:6px;cursor:pointer;font-size:13px;font-weight:bold;white-space:nowrap">+ ' + esc(t('addCurrentShort')) + '</button>' +
        '</div>'
      : '';

    const html =
      addCurrentBanner +
      '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">' +
        '<input class="il-set-search" placeholder="' + esc(t('searchPlaceholder')) + '" value="' + esc(searchQuery) + '" ' +
          'style="flex:1;min-width:140px;padding:8px 12px;border:1px solid #ccc;border-radius:6px">' +
        '<select class="il-filter-lang" style="padding:8px 12px;border:1px solid #ccc;border-radius:6px">' + langFilterOpts + '</select>' +
        '<select class="il-filter-type" style="padding:8px 12px;border:1px solid #ccc;border-radius:6px">' + typeFilterOpts + '</select>' +
        '<select class="il-filter-tag" style="padding:8px 12px;border:1px solid #ccc;border-radius:6px">' + tagFilterOpts + '</select>' +
      '</div>' +
      '<div style="margin-bottom:10px">' +
        '<div style="border:1px solid #eee;border-radius:8px;padding:8px 12px;max-height:340px;overflow:auto">' +
          (siteRows || '<div style="color:#888;padding:8px 0;font-size:13px">' + esc(t('noSites')) + '</div>') +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap">' +
        '<input class="il-set-domain" placeholder="' + esc(t('domainPh')) + '" style="flex:1;min-width:180px;padding:8px 12px;border:1px solid #ccc;border-radius:6px">' +
        '<select class="il-set-newmode" style="padding:8px 12px;border:1px solid #ccc;border-radius:6px">' +
          '<option value="prompt" selected>' + esc(t('modePrompt')) + '</option>' +
          '<option value="auto">' + esc(t('modeAuto')) + '</option>' +
          '<option value="off">' + esc(t('modeOff')) + '</option>' +
        '</select>' +
        '<button class="il-set-add" style="padding:8px 14px;background:#d32f2f;color:#fff;border:none;border-radius:6px;cursor:pointer">' + esc(t('add')) + '</button>' +
      '</div>';

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
      const typeSel = box.querySelector('.il-filter-type');
      if (typeSel) typeSel.onchange = e => { filterType = e.target.value; render(); };
      const tagSel = box.querySelector('.il-filter-tag');
      if (tagSel) tagSel.onchange = e => { filterTag = e.target.value; render(); };

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
          if (!isBaseCatalogDomain(CFG.sites[idx].domain)){
            addOrUpdateCustomCatalogEntry(CFG.sites[idx].domain, {
              lang: CFG.sites[idx].lang,
              type: CFG.sites[idx].type,
              tags: CFG.sites[idx].tags,
              n: CFG.sites[idx].domain
            });
            saveCfg(CFG);
          }
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
      box.querySelectorAll('.il-set-edit').forEach(btn => {
        btn.onclick = e => {
          e.stopPropagation();
          const idx = +btn.dataset.idx;
          const site = CFG.sites[idx];
          if (!site) return;
          const row = box.querySelector('.il-site-row[data-idx="' + idx + '"]');
          if (!row) return;
          const existing = row.querySelector('.il-edit-block');
          if (existing) { existing.remove(); return; }
          const block = document.createElement('div');
          block.className = 'il-edit-block';
          block.style.cssText = 'margin-top:8px;padding:10px;background:#f9f9f9;border-radius:6px;display:flex;flex-wrap:wrap;gap:8px;align-items:center';
          const typeOpts = '<option value=""' + (!site.type?' selected':'') + '>—</option>' +
            CFG.siteTypes.map(tt => '<option value="' + esc(tt.id) + '"' + (site.type===tt.id?' selected':'') + '>' + esc(tt.label) + '</option>').join('');
          const datalistId = 'il-known-tags-' + idx;
          const datalist = '<datalist id="' + datalistId + '">' +
            getAllKnownTags().map(tg => '<option value="' + esc(tg) + '"></option>').join('') + '</datalist>';
          block.innerHTML =
            '<label style="font-size:11px;color:#666;text-transform:uppercase">' + esc(t('siteType')) + '</label>' +
            '<select class="il-edit-type" style="padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px">' + typeOpts + '</select>' +
            '<label style="font-size:11px;color:#666;text-transform:uppercase">' + esc(t('siteTags')) + '</label>' +
            '<input class="il-edit-tags" list="' + datalistId + '" value="' + esc((site.tags||[]).join(', ')) + '" ' +
              'style="flex:1;min-width:140px;padding:6px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px">' +
            datalist +
            '<button class="il-edit-save" style="padding:6px 10px;background:#d32f2f;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;margin-left:auto">' + esc(t('saveBtn')) + '</button>' +
            '<button class="il-edit-cancel" style="padding:6px 10px;border:1px solid #ccc;background:#fff;border-radius:4px;cursor:pointer;font-size:12px">' + esc(t('cancelBtn')) + '</button>';
          row.appendChild(block);
          block.querySelector('.il-edit-save').onclick = () => {
            const type = block.querySelector('.il-edit-type').value;
            const rawTags = block.querySelector('.il-edit-tags').value.split(',').map(x => x.trim()).filter(Boolean);
            const uniqueTags = Array.from(new Set(rawTags));
            CFG.sites[idx].type = type;
            CFG.sites[idx].tags = uniqueTags;
            const global = new Set(CFG.siteTags || []);
            uniqueTags.forEach(tg => global.add(tg));
            CFG.siteTags = Array.from(global).sort();
            if (!isBaseCatalogDomain(CFG.sites[idx].domain)){
              addOrUpdateCustomCatalogEntry(CFG.sites[idx].domain, {
                lang: CFG.sites[idx].lang, type: type, tags: uniqueTags,
                n: CFG.sites[idx].domain
              });
            }
            saveCfg(CFG);
            render();
          };
          block.querySelector('.il-edit-cancel').onclick = () => block.remove();
        };
      });
      box.querySelectorAll('.il-set-del').forEach(btn => {
        btn.onclick = e => {
          e.stopPropagation();
          const removed = CFG.sites[+btn.dataset.idx];
          CFG.sites.splice(+btn.dataset.idx, 1);
          if (removed && isBaseCatalogDomain(removed.domain)){
            disableDomain(removed.domain);
          } else if (removed){
            disableDomain(removed.domain);
          }
          saveCfg(CFG); render();
          if (removed && removed.domain === currentDomain){
            const f = document.getElementById('il-fab'); if (f) f.remove();
            const bf = document.getElementById('il-servicios-fab'); if (bf) bf.remove();
            ensureAddFAB();
            repositionStackFABs();
          }
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
        const cat = getCatalogEntry(currentDomain) || {};
        addSiteAnywhere(currentDomain, {
          n: cat.n || currentDomain,
          lang: cat.lang || 'auto',
          type: cat.type || '',
          tags: cat.tags || []
        });
        saveCfg(CFG);
        toast(t('addedTo') + ' ' + currentDomain);
        render();
        const afab = document.getElementById('il-add-fab'); if (afab) afab.remove();
        if (!document.getElementById('il-fab') && !isPlainDomain()){
          const rule = findSiteRule();
          if (rule && rule.mode !== 'off' && !isIgnoredSection(rule)) createFAB();
        }
        if (!document.getElementById('il-servicios-fab') && debeMostrarFabServicios()) crearFabServicios();
        repositionStackFABs();
      };

      const addBtn = box.querySelector('.il-set-add');
      if (addBtn) addBtn.onclick = () => {
        const inp = box.querySelector('.il-set-domain');
        const mode = box.querySelector('.il-set-newmode').value;
        const d = normalizeDomain(inp.value);
        if (!d || !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(d)){ toast(t('siteInvalid')); return; }
        if (CFG.sites.some(s => s.domain === d)){ toast(t('siteAlready')); return; }
        const cat = getCatalogEntry(d) || {};
        addSiteAnywhere(d, {
          mode: mode, n: cat.n || d,
          lang: cat.lang || 'auto',
          type: cat.type || '',
          tags: cat.tags || []
        });
        saveCfg(CFG);
        render();
        if (d === currentDomain){
          const afab = document.getElementById('il-add-fab'); if (afab) afab.remove();
          if (!document.getElementById('il-fab') && !isPlainDomain()){
            const rule = findSiteRule();
            if (rule && rule.mode === 'prompt' && !isIgnoredSection(rule)) createFAB();
          }
          if (!document.getElementById('il-servicios-fab') && debeMostrarFabServicios()) crearFabServicios();
          repositionStackFABs();
        }
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
          row.style.background = '#fffbe6';
          row.style.boxShadow = '0 0 0 2px #d32f2f inset';
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

  function renderCatalogTab(){
    const currentDomain = normalizeDomain(location.hostname);

    const subTabsHTML =
      '<div style="margin-bottom:14px">' +
        subTabBtn('catalog', 'media', '📚 ' + t('catalogSubMedia')) +
        subTabBtn('catalog', 'types', '🏷 ' + t('catalogSubTypes')) +
      '</div>';

    function renderCatalogMedia(){
      const allGroups = MEDIA_CATALOG.map(g => ({ group: g.group, items: g.items.slice() }));
      if ((CFG.customCatalog || []).length){
        allGroups.push({ group: 'Personalizados', items: CFG.customCatalog.slice() });
      }

      const filteredGroups = allGroups.map(g => {
        const items = g.items.filter(it => {
          if (catalogLangFilter && it.lang !== catalogLangFilter) return false;
          if (catalogTypeFilter && it.type !== catalogTypeFilter) return false;
          if (catalogQuery){
            const q = catalogQuery.toLowerCase();
            if (!it.d.toLowerCase().includes(q) && !(it.n||'').toLowerCase().includes(q)) return false;
          }
          const inList = CFG.sites.some(s => s.domain === it.d);
          const isBlocked = isDomainDisabled(it.d);
          if (catalogFilter === 'added' && !inList) return false;
          if (catalogFilter === 'notadded' && inList) return false;
          if (catalogFilter === 'blocked' && !isBlocked) return false;
          return true;
        });
        return { group: g.group, items };
      }).filter(g => g.items.length);

      const totalShown = filteredGroups.reduce((a, g) => a + g.items.length, 0);
      const totalBase = CATALOG_TOTAL + (CFG.customCatalog||[]).length;

      const langOpts = '<option value="">' + esc(t('filterAll')) + ' ' + esc(t('filterLang')) + '</option>' +
        CATALOG_LANGS.map(l => '<option value="' + esc(l) + '"' + (catalogLangFilter===l?' selected':'') + '>' +
          esc(l.toUpperCase()) + '</option>').join('');
      const typeOpts = '<option value="">' + esc(t('filterAll')) + ' ' + esc(t('filterType')) + '</option>' +
        CFG.siteTypes.map(tt => '<option value="' + esc(tt.id) + '"' + (catalogTypeFilter===tt.id?' selected':'') + '>' +
          esc(tt.label) + '</option>').join('');
      const filterBtns =
        '<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">' +
          ['all','notadded','added','blocked'].map(f => {
            const labels = { all: t('allMedia'), notadded: t('filterNotAdded'), added: t('filterAdded'), blocked: t('filterBlocked') };
            const active = catalogFilter === f;
            return '<button class="il-cat-filter" data-filter="' + f + '" style="padding:6px 12px;border:1px solid ' +
              (active ? '#d32f2f' : '#ccc') + ';background:' + (active ? '#d32f2f' : '#fff') +
              ';color:' + (active ? '#fff' : '#444') + ';border-radius:6px;cursor:pointer;font-size:12px">' +
              esc(labels[f]) + '</button>';
          }).join('') +
        '</div>';

      const groupsHTML = filteredGroups.map(g => {
        const rows = g.items.map(it => {
          const inList = CFG.sites.some(s => s.domain === it.d);
          const isBlocked = isDomainDisabled(it.d);
          const isCurrent = it.d === currentDomain;

          let actionBtns = '';
          if (inList){
            actionBtns =
              '<button class="il-cat-remove" data-d="' + esc(it.d) + '" title="' + esc(t('remove')) + '" ' +
                'style="padding:4px 10px;border:1px solid #c00;background:#fff;color:#c00;border-radius:5px;cursor:pointer;font-size:12px">✕</button>';
          } else if (isBlocked){
            actionBtns =
              '<button class="il-cat-unblock" data-d="' + esc(it.d) + '" title="' + esc(t('unblock')) + '" ' +
                'style="padding:4px 10px;border:1px solid #0a7d00;background:#fff;color:#0a7d00;border-radius:5px;cursor:pointer;font-size:12px">↺</button>';
          } else {
            actionBtns =
              '<button class="il-cat-add" data-d="' + esc(it.d) + '" title="' + esc(t('addToMyList')) + '" ' +
                'style="padding:4px 10px;border:none;background:#0a7d00;color:#fff;border-radius:5px;cursor:pointer;font-size:12px;font-weight:bold">＋</button>';
          }

          const statusBadge = inList
            ? '<span style="color:#0a7d00;font-size:11px;font-weight:bold">✅ ' + esc(t('inYourList')) + '</span>'
            : isBlocked
            ? '<span style="color:#c00;font-size:11px;font-weight:bold">🚫 ' + esc(t('blocked')) + '</span>'
            : '';

          return '<div class="il-cat-row" data-d="' + esc(it.d) + '" style="display:flex;gap:10px;align-items:center;padding:7px 4px;border-bottom:1px solid #f0f0f0' + (isCurrent ? ';background:#fffbe6' : '') + '">' +
            '<div style="flex:1;min-width:0">' +
              '<div style="font-family:monospace;font-size:12px;font-weight:bold;color:#222">' + esc(it.d) + (isCurrent ? ' 📍' : '') + '</div>' +
              '<div style="font-size:11px;color:#666">' + esc(it.n || '') +
                ' · ' + esc((it.lang||'').toUpperCase()) +
                (it.type ? ' · ' + esc(getTypeLabel(it.type)) : '') +
                ((it.tags||[]).length ? ' · ' + esc(it.tags.join(', ')) : '') +
              '</div>' +
            '</div>' +
            statusBadge +
            '<button class="il-cat-visit" data-d="' + esc(it.d) + '" title="' + esc(t('visitSite')) + '" ' +
              'style="padding:4px 10px;border:1px solid #ccc;background:#fff;border-radius:5px;cursor:pointer;font-size:12px">🔗</button>' +
            actionBtns +
          '</div>';
        }).join('');
        return '<div style="margin-bottom:18px">' +
          '<div style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;font-weight:bold">' +
            esc(g.group) + ' <span style="color:#aaa">(' + g.items.length + ')</span></div>' +
          '<div style="border:1px solid #eee;border-radius:8px;padding:4px 10px">' + rows + '</div>' +
        '</div>';
      }).join('');

      const html =
        '<div style="background:#e8f5e9;border:1px solid #a5d6a7;border-radius:8px;padding:10px 14px;' +
          'margin-bottom:14px;font-size:12px;color:#333;line-height:1.5">' +
          '💡 ' + esc(t('catalogInfo').replace('{N}', totalBase)) +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">' +
          '<input class="il-cat-search" placeholder="' + esc(t('searchCatalog')) + '" value="' + esc(catalogQuery) + '" ' +
            'style="flex:1;min-width:180px;padding:8px 12px;border:1px solid #ccc;border-radius:6px">' +
          '<select class="il-cat-lang" style="padding:8px 12px;border:1px solid #ccc;border-radius:6px">' + langOpts + '</select>' +
          '<select class="il-cat-type" style="padding:8px 12px;border:1px solid #ccc;border-radius:6px">' + typeOpts + '</select>' +
        '</div>' +
        filterBtns +
        '<div style="font-size:11px;color:#888;margin-bottom:10px">' +
          totalShown + ' / ' + totalBase + ' ' + esc(t('allMedia').toLowerCase()) +
        '</div>' +
        (groupsHTML || '<div style="color:#888;padding:20px;text-align:center;font-size:13px">—</div>');

      function wire(){
        const searchInp = box.querySelector('.il-cat-search');
        if (searchInp) searchInp.oninput = e => {
          const pos = e.target.selectionStart;
          catalogQuery = e.target.value;
          render();
          const ni = box.querySelector('.il-cat-search');
          if (ni){ ni.focus(); ni.setSelectionRange(pos, pos); }
        };
        const langSel = box.querySelector('.il-cat-lang');
        if (langSel) langSel.onchange = e => { catalogLangFilter = e.target.value; render(); };
        const typeSel = box.querySelector('.il-cat-type');
        if (typeSel) typeSel.onchange = e => { catalogTypeFilter = e.target.value; render(); };

        box.querySelectorAll('.il-cat-filter').forEach(b => {
          b.onclick = () => { catalogFilter = b.dataset.filter; render(); };
        });
        box.querySelectorAll('.il-cat-visit').forEach(b => {
          b.onclick = () => window.open('https://' + b.dataset.d, '_blank', 'noopener');
        });
        box.querySelectorAll('.il-cat-add').forEach(b => {
          b.onclick = () => {
            const d = b.dataset.d;
            const entry = getCatalogEntry(d) || (CFG.customCatalog||[]).find(x => x.d === d);
            if (!entry) return;
            if (addSiteFromCatalog(entry)){
              saveCfg(CFG);
              toast(t('addedTo') + ' ' + entry.d, 2000);
              render();
              if (entry.d === currentDomain){
                const af = document.getElementById('il-add-fab'); if (af) af.remove();
                ensureReaderFAB();
                if (debeMostrarFabServicios()) crearFabServicios();
                repositionStackFABs();
              }
            }
          };
        });
        box.querySelectorAll('.il-cat-remove').forEach(b => {
          b.onclick = () => {
            const d = b.dataset.d;
            if (removeSiteForDomain(d)){
              disableDomain(d);
              saveCfg(CFG);
              toast(t('removedFrom') + ' ' + d, 2000);
              render();
              if (d === currentDomain){
                const f = document.getElementById('il-fab'); if (f) f.remove();
                const bf = document.getElementById('il-servicios-fab'); if (bf) bf.remove();
                repositionStackFABs();
              }
            }
          };
        });
        box.querySelectorAll('.il-cat-unblock').forEach(b => {
          b.onclick = () => {
            enableDomain(b.dataset.d);
            saveCfg(CFG);
            toast(t('unblock') + ': ' + b.dataset.d, 1800);
            render();
          };
        });
      }

      return { html, wire };
    }

    function renderCatalogTypes(){
      const builtin = (CFG.siteTypes || []).filter(tt => tt.builtin);
      const custom = (CFG.siteTypes || []).filter(tt => !tt.builtin);

      function typeRow(tt){
        const idx = CFG.siteTypes.indexOf(tt);
        const affected = CFG.sites.filter(s => s.type === tt.id).length;
        return '<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #f0f0f0">' +
          '<code style="font-size:11px;color:#999;min-width:90px">' + esc(tt.id) + '</code>' +
          '<input class="il-type-label" data-idx="' + idx + '" value="' + esc(tt.label) + '" ' +
            'style="flex:1;padding:6px 10px;border:1px solid #ccc;border-radius:6px;font-size:13px">' +
          '<span style="font-size:11px;color:#888;min-width:80px;text-align:right">' +
            (affected ? affected + ' sitios' : '') + '</span>' +
          (tt.builtin
            ? '<span style="font-size:11px;color:#999;min-width:24px;text-align:center" title="Predefinido">🔒</span>'
            : '<button class="il-type-del" data-idx="' + idx + '" ' +
                'style="border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer;padding:4px 8px;font-size:12px">🗑</button>'
          ) +
        '</div>';
      }

      const builtinRows = builtin.map(typeRow).join('');
      const customRows = custom.map(typeRow).join('');

      const tagChips = (CFG.siteTags || []).map((tg, i) =>
        '<span style="display:inline-flex;align-items:center;gap:4px;background:#f1f1f1;border-radius:12px;padding:3px 4px 3px 10px;font-size:12px;margin:3px 4px 3px 0">' +
          esc(tg) +
          '<button class="il-tag-del" data-idx="' + i + '" style="border:none;background:transparent;cursor:pointer;font-size:12px;padding:0 4px;color:#c00">✕</button>' +
        '</span>').join('');

      const html =
        '<div style="background:#fffbe6;border:1px solid #ffe58f;border-radius:8px;padding:10px 14px;' +
          'margin-bottom:16px;font-size:12px;color:#555;line-height:1.5">' +
          esc(t('typesHint')) +
        '</div>' +
        '<div style="margin-bottom:22px">' +
          '<label style="display:block;font-size:12px;color:#666;text-transform:uppercase;margin-bottom:6px">' +
            esc(t('defaultTypes')) + ' <span style="color:#aaa">(' + builtin.length + ')</span></label>' +
          '<div style="border:1px solid #eee;border-radius:8px;padding:4px 12px;margin-bottom:12px">' +
            (builtinRows || '<div style="color:#888;padding:8px 0;font-size:13px">' + esc(t('noTypes')) + '</div>') +
          '</div>' +
          '<label style="display:block;font-size:12px;color:#666;text-transform:uppercase;margin-bottom:6px">' +
            esc(t('customTypes')) + ' <span style="color:#aaa">(' + custom.length + ')</span></label>' +
          '<div style="border:1px solid #eee;border-radius:8px;padding:4px 12px;margin-bottom:8px">' +
            (customRows || '<div style="color:#888;padding:8px 0;font-size:13px">' + esc(t('noTypes')) + '</div>') +
          '</div>' +
          '<div style="display:flex;gap:8px">' +
            '<input class="il-new-type" placeholder="' + esc(t('newTypePh')) + '" style="flex:1;padding:8px 12px;border:1px solid #ccc;border-radius:6px">' +
            '<button class="il-add-type" style="padding:8px 14px;background:#d32f2f;color:#fff;border:none;border-radius:6px;cursor:pointer">' + esc(t('add')) + '</button>' +
          '</div>' +
        '</div>' +
        '<div style="border-top:1px solid #eee;padding-top:16px">' +
          '<label style="display:block;font-size:12px;color:#666;text-transform:uppercase;margin-bottom:6px">' +
            esc(t('tagsSection')) + ' <span style="color:#aaa">(' + (CFG.siteTags||[]).length + ')</span></label>' +
          '<div style="background:#f9f9f9;border-radius:8px;padding:8px 12px;margin-bottom:8px;font-size:12px;color:#666">' +
            esc(t('tagsHint')) +
          '</div>' +
          '<div style="border:1px solid #eee;border-radius:8px;padding:10px 12px;margin-bottom:8px;min-height:40px">' +
            (tagChips || '<div style="color:#888;font-size:13px">' + esc(t('noTags')) + '</div>') +
          '</div>' +
          '<div style="display:flex;gap:8px">' +
            '<input class="il-new-tag" placeholder="' + esc(t('newTagPh')) + '" style="flex:1;padding:8px 12px;border:1px solid #ccc;border-radius:6px">' +
            '<button class="il-add-tag" style="padding:8px 14px;background:#d32f2f;color:#fff;border:none;border-radius:6px;cursor:pointer">' + esc(t('add')) + '</button>' +
          '</div>' +
        '</div>';

      function wire(){
        box.querySelectorAll('.il-type-label').forEach(inp => {
          inp.onchange = () => {
            const idx = +inp.dataset.idx;
            const val = inp.value.trim();
            if (!val){ toast(t('typeInvalid')); inp.value = CFG.siteTypes[idx].label; return; }
            CFG.siteTypes[idx].label = val;
            saveCfg(CFG);
          };
        });
        box.querySelectorAll('.il-type-del').forEach(btn => {
          btn.onclick = () => {
            const idx = +btn.dataset.idx;
            const tt = CFG.siteTypes[idx];
            if (!tt || tt.builtin) return;
            const affected = CFG.sites.filter(s => s.type === tt.id).length;
            const msg = t('deleteTypeConfirm').replace('{X}', tt.label).replace('{N}', affected);
            if (!confirm(msg)) return;
            CFG.sites.forEach(s => { if (s.type === tt.id) s.type = ''; });
            CFG.siteTypes.splice(idx, 1);
            saveCfg(CFG);
            toast(t('typeDeleted').replace('{X}', tt.label).replace('{N}', affected), 2400);
            render();
          };
        });
        const addTypeBtn = box.querySelector('.il-add-type');
        if (addTypeBtn) addTypeBtn.onclick = () => {
          const inp = box.querySelector('.il-new-type');
          const label = inp.value.trim();
          if (!label){ toast(t('typeInvalid')); return; }
          const exists = (CFG.siteTypes || []).some(tt => tt.label.toLowerCase() === label.toLowerCase());
          if (exists){ toast(t('typeAlreadyExists')); return; }
          const slug = label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
            .replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || ('t-' + Date.now().toString(36));
          if ((CFG.siteTypes || []).some(tt => tt.id === slug)){
            CFG.siteTypes.push({ id: 't-' + Date.now().toString(36), label: label });
          } else {
            CFG.siteTypes.push({ id: slug, label: label });
          }
          saveCfg(CFG);
          render();
        };
        box.querySelectorAll('.il-tag-del').forEach(btn => {
          btn.onclick = () => {
            const idx = +btn.dataset.idx;
            const tg = CFG.siteTags[idx];
            if (tg == null) return;
            const affected = CFG.sites.filter(s => (s.tags || []).includes(tg)).length;
            const msg = t('deleteTagConfirm').replace('{X}', tg).replace('{N}', affected);
            if (!confirm(msg)) return;
            CFG.sites.forEach(s => { s.tags = (s.tags || []).filter(x => x !== tg); });
            (CFG.customCatalog || []).forEach(it => {
              it.tags = (it.tags || []).filter(x => x !== tg);
            });
            CFG.siteTags.splice(idx, 1);
            saveCfg(CFG);
            toast(t('tagDeleted').replace('{X}', tg).replace('{N}', affected), 2400);
            render();
          };
        });
        const addTagBtn = box.querySelector('.il-add-tag');
        if (addTagBtn) addTagBtn.onclick = () => {
          const inp = box.querySelector('.il-new-tag');
          const tag = inp.value.trim();
          if (!tag){ toast(t('tagInvalid')); return; }
          if ((CFG.siteTags || []).includes(tag)){ toast(t('tagAlreadyExists')); return; }
          CFG.siteTags.push(tag);
          CFG.siteTags.sort();
          saveCfg(CFG);
          render();
        };
      }

      return { html, wire };
    }

    const inner = activeCatalogSub === 'types' ? renderCatalogTypes() : renderCatalogMedia();
    const html = subTabsHTML + inner.html;

    function wire(){
      box.querySelectorAll('.il-cat-subtab').forEach(b => {
        b.onclick = () => { activeCatalogSub = b.dataset.subtab; render(); };
      });
      inner.wire();
    }

    return { html, wire };
  }

  function renderPendientesTab(){
    const keepRead = !(CFG.readerSettings && CFG.readerSettings.keepReadItems === false);
    const noLeidas = pendientesVisibles().filter(r => !r.read);
    const leidas   = pendientesVisibles().filter(r => r.read);

    function fila(r, esLeida){
      return '<div style="display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid #eee' +
        (esLeida ? ';opacity:.55' : '') + '">' +
          '<div style="flex:1;min-width:0">' +
            '<a href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer" ' +
              'style="color:#d32f2f;text-decoration:none;font-weight:bold;font-size:14px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' +
              (esLeida ? ';text-decoration:line-through' : '') + '">' + esc(r.title || r.url) + '</a>' +
            '<div style="font-size:11px;color:#888;margin-top:2px">' +
              esc(r.domain || '') + ' · ' + esc((r.date || '').slice(0,10)) +
              (esLeida && r.readAt ? ' · ✓ ' + esc(r.readAt.slice(0,10)) : '') +
            '</div>' +
          '</div>' +
          '<button data-url="' + esc(r.url) + '" class="il-rl-toggle" title="' + esc(esLeida ? t('markUnread') : t('markRead')) + '" ' +
            'style="border:1px solid #0a7d00;background:#fff;color:#0a7d00;border-radius:6px;cursor:pointer;padding:4px 8px;font-size:12px">' +
            (esLeida ? '↺' : '✓') + '</button>' +
          '<button data-url="' + esc(r.url) + '" class="il-rl-del" title="' + esc(t('remove')) + '" ' +
            'style="border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer;padding:4px 8px;font-size:12px">✕</button>' +
        '</div>';
    }

    const rowsNoLeidas = noLeidas.map(r => fila(r, false)).join('');
    const rowsLeidas   = leidas.map(r => fila(r, true)).join('');

    const html =
      '<div style="margin-bottom:14px">' +
        '<div style="border:1px solid #eee;border-radius:8px;padding:8px 12px;max-height:400px;overflow:auto">' +
          (rowsNoLeidas || '<div style="color:#888;padding:8px 0;font-size:13px">' + esc(t('noReadLater')) + '</div>') +
        '</div>' +
      '</div>' +
      (keepRead && leidas.length ?
        '<div style="margin-bottom:14px">' +
          '<div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">' +
            esc(t('readItems')) + ' (' + leidas.length + ')</div>' +
          '<div style="border:1px solid #eee;border-radius:8px;padding:8px 12px;max-height:200px;overflow:auto;background:#fafafa">' +
            rowsLeidas +
          '</div>' +
        '</div>'
        : '') +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<label style="font-size:12px;color:#666;display:flex;align-items:center;gap:6px;cursor:pointer">' +
          '<input type="checkbox" class="il-keep-read"' + (keepRead ? ' checked' : '') + '>' +
          esc(t('keepReadItems')) +
        '</label>' +
        (keepRead && leidas.length ?
          '<button class="il-clear-read" style="padding:6px 12px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer;font-size:12px;color:#c00">' +
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
        '<label style="display:block;font-size:12px;color:#666;text-transform:uppercase;margin-bottom:6px">' + esc(l.label) + '</label>' +
        '<div style="border:1px solid #eee;border-radius:8px;padding:8px 12px">' + rows + '</div>' +
      '</div>';
    }).join('');

    const html =
      '<div style="margin-bottom:16px">' +
        '<label style="display:block;font-size:12px;color:#666;text-transform:uppercase;margin-bottom:6px">' + esc(t('dictMode')) + '</label>' +
        '<select class="il-dict-mode" style="padding:8px 12px;border:1px solid #ccc;border-radius:6px;width:100%">' +
          '<option value="direct"' + (CFG.dict.mode === 'direct' ? ' selected' : '') + '>' + esc(t('dictModeDirect')) + '</option>' +
          '<option value="popup"' + (CFG.dict.mode === 'popup' ? ' selected' : '') + '>' + esc(t('dictModePopup')) + '</option>' +
        '</select>' +
      '</div>' +
      blocks +
      '<div style="background:#fffbe6;border:1px solid #ffe58f;border-radius:8px;padding:12px;margin-bottom:16px;font-size:12px;color:#666">' +
        esc(t('dictUrlHint')) +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">' +
        '<input class="il-dict-new-name" placeholder="' + esc(t('dictName')) + '" style="flex:1;min-width:120px;padding:8px 12px;border:1px solid #ccc;border-radius:6px">' +
        '<input class="il-dict-new-url" placeholder="' + esc(t('dictUrl')) + '" style="flex:2;min-width:200px;padding:8px 12px;border:1px solid #ccc;border-radius:6px">' +
        '<select class="il-dict-new-lang" style="padding:8px 12px;border:1px solid #ccc;border-radius:6px">' +
          langs.map(l => '<option value="' + l.code + '">' + l.code.toUpperCase() + '</option>').join('') +
        '</select>' +
        '<button class="il-dict-add" style="padding:8px 14px;background:#d32f2f;color:#fff;border:none;border-radius:6px;cursor:pointer">' + esc(t('add')) + '</button>' +
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
      '<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid #f0f0f0">' +
        '<div style="flex:1;font-size:13px">' + esc(svc.nombre) + '</div>' +
        '<div style="flex:2;font-size:11px;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' +
          esc(svc.plantilla) + '">' + esc(svc.plantilla) + '</div>' +
        '<button data-id="' + esc(svc.id) + '" class="il-svc-del" title="' + esc(t('serviciosQuitar')) +
          '" aria-label="' + esc(t('serviciosQuitar')) + '" ' +
          'style="border:none;background:transparent;cursor:pointer;color:#c00;font-size:12px;padding:2px 6px">🗑</button>' +
      '</div>'
    ).join('');

    const html =
      '<div style="background:#fffbe6;border:1px solid #ffe58f;border-radius:8px;padding:12px;margin-bottom:16px;' +
        'font-size:12px;color:#666;line-height:1.6">' + esc(t('serviciosAyuda')) + '</div>' +
      '<div style="border:1px solid #eee;border-radius:8px;padding:8px 12px;margin-bottom:16px">' +
        (filas || '<div style="padding:8px 0;font-size:13px;color:#999">' + esc(t('serviciosVacio')) + '</div>') +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">' +
        '<input class="il-svc-nombre" placeholder="' + esc(t('serviciosNombre')) + '" ' +
          'style="flex:1;min-width:120px;padding:8px 12px;border:1px solid #ccc;border-radius:6px">' +
        '<input class="il-svc-plantilla" placeholder="https://…{url}" ' +
          'style="flex:2;min-width:200px;padding:8px 12px;border:1px solid #ccc;border-radius:6px">' +
        '<button class="il-svc-add" style="padding:8px 14px;background:#d32f2f;color:#fff;border:none;border-radius:6px;cursor:pointer">' +
          esc(t('add')) + '</button>' +
      '</div>' +
      '<label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-bottom:16px;cursor:pointer">' +
        '<input type="checkbox" class="il-svc-fab"' + (CFG.serviciosFab && CFG.serviciosFab.oculto ? '' : ' checked') + '> ' +
        esc(t('serviciosFab')) +
      '</label>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="il-svc-import" style="padding:8px 14px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer">' +
          esc(t('serviciosImportar')) + '</button>' +
        '<button class="il-svc-export" style="padding:8px 14px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer"' +
          (servicios.length ? '' : ' disabled') + '>' + esc(t('serviciosExportar')) + '</button>' +
      '</div>';

    function refrescarFab(){
      const f = document.getElementById('il-servicios-fab'); if (f) f.remove();
      crearFabServicios();
      repositionStackFABs();
    }

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
        return '<em style="color:#999">' + esc(t('shortcutEmpty')) + '</em>';
      }
      return keys.map(k =>
        '<kbd style="display:inline-block;padding:2px 7px;border:1px solid #ccc;border-radius:4px;' +
        'background:#f7f7f7;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;margin:0 4px 0 0">' +
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
        ? '<em style="color:#d32f2f">' + esc(t('shortcutCapture')) + '</em>'
        : keysHTML(keys);
      return '<div class="il-sc-row" data-scope="' + scope + '" data-action="' + action + '" ' +
        'style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid #f0f0f0">' +
        '<div style="flex:1;font-size:13px">' + esc(shortcutActionLabel(action)) + '</div>' +
        '<div style="flex:1;text-align:right">' + display + '</div>' +
        (isReserved
          ? '<span style="font-size:11px;color:#999;min-width:180px">' + esc(t('shortcutReservedNote')) + '</span>'
          : '<button class="il-sc-edit" data-scope="' + scope + '" data-action="' + action + '" ' +
              'style="border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer;padding:4px 8px;font-size:12px">✏️</button>' +
            '<button class="il-sc-del" data-scope="' + scope + '" data-action="' + action + '" ' +
              'style="border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer;padding:4px 8px;font-size:12px">🗑</button>'
        ) +
      '</div>';
    }

    const readerActions = Object.keys(DEFAULT_CFG.shortcuts.reader);
    const globalActions = Object.keys(DEFAULT_CFG.shortcuts.global);

    const html =
      '<div style="background:#fffbe6;border:1px solid #ffe58f;border-radius:8px;padding:12px;' +
        'margin-bottom:16px;font-size:12px;color:#555;line-height:1.7">' +
        '<strong>' + esc(t('shortcutNoteTitle')) + '</strong><br>' +
        '• ' + esc(t('shortcutNoteReader')) + '<br>' +
        '• ' + esc(t('shortcutNoteGlobal')) + '<br>' +
        '• ' + esc(t('shortcutNoteCapture')) + '<br>' +
        '• ' + esc(t('shortcutReservedNote')) +
      '</div>' +
      '<div style="display:flex;justify-content:flex-end;margin-bottom:16px">' +
        '<button class="il-sc-reset" style="padding:6px 12px;border:1px solid #ccc;background:#fff;' +
          'border-radius:6px;cursor:pointer;font-size:12px;color:#c00">' + esc(t('shortcutReset')) + '</button>' +
      '</div>' +
      '<div style="margin-bottom:22px">' +
        '<h3 style="font-size:13px;margin:0 0 8px;color:#666;text-transform:uppercase;letter-spacing:.5px">' +
          esc(t('shortcutReader')) + '</h3>' +
        '<div style="border:1px solid #eee;border-radius:8px;padding:0 12px">' +
          readerActions.map(a => rowHTML('reader', a)).join('') +
        '</div>' +
      '</div>' +
      '<div>' +
        '<h3 style="font-size:13px;margin:0 0 8px;color:#666;text-transform:uppercase;letter-spacing:.5px">' +
          esc(t('shortcutGlobal')) + '</h3>' +
        '<div style="border:1px solid #eee;border-radius:8px;padding:0 12px">' +
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
        '<label style="display:block;font-size:12px;color:#666;text-transform:uppercase;margin-bottom:6px">' + esc(t('language')) + '</label>' +
        '<select class="il-set-lang-app" style="padding:8px 12px;border:1px solid #ccc;border-radius:6px">' +
          '<option value="es"' + (CFG.lang==='es'?' selected':'') + '>Español</option>' +
          '<option value="gl"' + (CFG.lang==='gl'?' selected':'') + '>Galego</option>' +
          '<option value="ca"' + (CFG.lang==='ca'?' selected':'') + '>Català</option>' +
          '<option value="en"' + (CFG.lang==='en'?' selected':'') + '>English</option>' +
          '<option value="eu"' + (CFG.lang==='eu'?' selected':'') + '>Euskara</option>' +
        '</select>' +
      '</div>' +
      '<div style="margin-bottom:18px;padding:14px;border:2px solid ' + (CFG.readerAutoAll ? '#43a047' : '#ccc') + ';border-radius:8px;background:' + (CFG.readerAutoAll ? '#e8f5e9' : '#fafafa') + '">' +
        '<label style="display:flex;align-items:flex-start;gap:12px;cursor:pointer">' +
          '<input type="checkbox" class="il-set-auto-all"' + (CFG.readerAutoAll ? ' checked' : '') + ' style="margin-top:3px;width:18px;height:18px;cursor:pointer;flex:0 0 auto">' +
          '<span>' +
            '<span style="display:block;font-weight:bold;font-size:14px;color:' + (CFG.readerAutoAll ? '#1b5e20' : '#222') + '">' +
              (CFG.readerAutoAll ? '🟢 ACTIVADO — ' : '⚪ DESACTIVADO — ') +
              esc(t('readerAutoAllLabel')) +
            '</span>' +
            '<span style="display:block;font-size:12px;color:#555;margin-top:4px">' + esc(t('readerAutoAllHint')) + '</span>' +
          '</span>' +
        '</label>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid #eee;padding-top:14px">' +
        '<button class="il-set-export" style="padding:8px 14px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer">' + esc(t('exportBtn')) + '</button>' +
        '<button class="il-set-import" style="padding:8px 14px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer">' + esc(t('importBtn')) + '</button>' +
        '<button class="il-set-reset"  style="padding:8px 14px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer;color:#c00;margin-left:auto">' + esc(t('resetBtn')) + '</button>' +
      '</div>';

    function wire(){
      const appLangSel = box.querySelector('.il-set-lang-app');
      if (appLangSel) appLangSel.onchange = e => {
        const newLang = e.target.value;
        if (DEFAULT_SITE_TYPES[newLang]){
          const map = new Map(DEFAULT_SITE_TYPES[newLang].map(tt => [tt.id, tt.label]));
          (CFG.siteTypes || []).forEach(tt => {
            if (tt.builtin && map.has(tt.id)) tt.label = map.get(tt.id);
          });
        }
        CFG.lang = newLang;
        saveCfg(CFG);
        render();
        const fab = document.getElementById('il-fab');
        if (fab){ fab.title = t('fabTitle') + '\n' + t('fabHidden'); }
        const sfab = document.getElementById('il-settings-fab');
        if (sfab) sfab.title = t('settingsFabTitle');
        const afab = document.getElementById('il-add-fab');
        if (afab) afab.title = t('addFabTitle');
      };

      const autoAllChk = box.querySelector('.il-set-auto-all');
      if (autoAllChk) autoAllChk.onchange = () => {
        CFG.readerAutoAll = autoAllChk.checked;
        saveCfg(CFG);
        paintReaderFAB();
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
      '<div style="display:flex;gap:4px;border-bottom:1px solid #eee;margin-bottom:18px;flex-wrap:wrap">' +
        tabBtn('sites', t('sites')) +
        tabBtn('catalog', t('catalog')) +
        tabBtn('pendientes', t('pendientes')) +
        tabBtn('dict', t('dictionaries')) +
        tabBtn('servicios', t('abrirEn')) +
        tabBtn('shortcuts', t('shortcuts')) +
        tabBtn('general', t('settings')) +
      '</div>';

    const headerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
        '<h2 style="margin:0;font-size:20px">' + esc(t('settings')) + '</h2>' +
        '<button class="il-set-close" style="padding:8px 14px;border:1px solid #ccc;background:#fff;border-radius:6px;cursor:pointer">' + esc(t('close')) + '</button>' +
      '</div>';

    let payload;
    if (activeSection === 'sites')         payload = renderSitesTab();
    else if (activeSection === 'catalog')  payload = renderCatalogTab();
    else if (activeSection === 'pendientes') payload = renderPendientesTab();
    else if (activeSection === 'dict')       payload = renderDictTab();
    else if (activeSection === 'servicios')  payload = renderServiciosTab();
    else if (activeSection === 'shortcuts')  payload = renderShortcutsTab();
    else                                     payload = renderGeneralTab();

    box.innerHTML = headerHTML + tabsHTML + payload.html;

    box.querySelector('.il-set-close').onclick = closeSettings;
    box.querySelectorAll('.il-set-tab').forEach(b => {
      b.onclick = () => { activeSection = b.dataset.tab; render(); };
    });

    payload.wire();
  }

  render();
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
      const rule = ensureSiteRule();
      rule.textOnly = !rule.textOnly;
      saveCfg(CFG);
      const ov2 = document.getElementById('il-full');
      if (ov2){
        ov2.classList.toggle('il-textonly', rule.textOnly);
        const btn = ov2.querySelector('.il-textonly-btn');
        if (btn){
          btn.textContent = rule.textOnly ? '📝' : '🖼';
          btn.title = rule.textOnly ? t('textOnlyOn') : t('textOnlyOff');
          btn.classList.toggle('il-active', rule.textOnly);
        }
      }
      toast(rule.textOnly ? t('textOnlyOn') : t('textOnlyOff'), 1500);
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
  PLATAFORMA.menu(t('catalog'), () => openSettings('catalog'));
  PLATAFORMA.menu(t('pendientes'), () => openSettings('pendientes'));
  PLATAFORMA.menu(t('openSettings'), () => openSettings());
  PLATAFORMA.menu(t('addCurrent'), () => {
    const d = normalizeDomain(location.hostname);
    if (CFG.sites.some(s => s.domain === d)){ toast(t('alreadyInList')); return; }
    const cat = getCatalogEntry(d) || {};
    addSiteAnywhere(d, {
      n: cat.n || d,
      lang: cat.lang || 'auto',
      type: cat.type || '',
      tags: cat.tags || []
    });
    saveCfg(CFG);
    toast(t('addedTo') + ' ' + d);
    const afab = document.getElementById('il-add-fab'); if (afab) afab.remove();
    if (!isPlainDomain() && !isIgnoredSection(findSiteRule())) createFAB();
    if (!document.getElementById('il-servicios-fab') && debeMostrarFabServicios()) crearFabServicios();
    repositionStackFABs();
  });
  PLATAFORMA.menu(t('removeCurrent'), () => {
    const d = normalizeDomain(location.hostname);
    const before = CFG.sites.length;
    CFG.sites = CFG.sites.filter(s => s.domain !== d);
    if (CFG.sites.length < before){
      disableDomain(d);
      saveCfg(CFG);
      toast(t('removedFrom') + ' ' + d);
      const f = document.getElementById('il-fab'); if (f) f.remove();
      const bf = document.getElementById('il-servicios-fab'); if (bf) bf.remove();
      ensureAddFAB();
      repositionStackFABs();
    } else {
      toast(t('notInList'));
    }
  });
  PLATAFORMA.menu(t('ignoreSectionMenu'), () => ignoreCurrentSection());
  PLATAFORMA.menu('↗ ' + t('abrirEn') + ' — ' + t('serviciosFabMenu'), () => {
    CFG.serviciosFab = CFG.serviciosFab || { oculto: false };
    CFG.serviciosFab.oculto = !CFG.serviciosFab.oculto;
    saveCfg(CFG);
    if (CFG.serviciosFab.oculto){
      const el = document.getElementById('il-servicios-fab');
      if (el) el.remove();
      toast(t('serviciosFabOculto'), 2000);
    } else {
      crearFabServicios();
      toast(t('serviciosFabVisible'), 2000);
    }
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

function ensureSettingsFAB(){
  if (document.getElementById('il-settings-fab')) return;
  if (isDomainDisabled(location.hostname)) return;
  if (!isKnownMediaDomain(location.hostname) && !findSiteRule()) return;
  createSettingsFAB();
}

function init(){
  registerMenus();

  if (isDomainDisabled(location.hostname)) return;
  if (!isPlainDomain()) ensureSettingsFAB();

  if (debeMostrarFabServicios()){
    const goServicios = () => crearFabServicios();
    if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(goServicios, 300);
    else window.addEventListener('load', () => setTimeout(goServicios, 300));
  }

  if (shouldShowReaderFAB()){
    const goFab = () => ensureReaderFAB();
    if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(goFab, 250);
    else window.addEventListener('load', () => setTimeout(goFab, 250));
  }

  if (shouldActivateHere()){
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
  const fab = document.getElementById('il-fab');
  if (fab) fab.remove();
  const bfab = document.getElementById('il-servicios-fab');
  if (bfab) bfab.remove();
  const sfab = document.getElementById('il-settings-fab');
  if (sfab) sfab.remove();
  const afab = document.getElementById('il-add-fab');
  if (afab) afab.remove();

  const attempt = (delay) => setTimeout(() => {
    if (document.getElementById('il-full')) return;
    if (isDomainDisabled(location.hostname)) return;
    if (!isPlainDomain() && !document.getElementById('il-settings-fab')){
      ensureSettingsFAB();
    }
    if (!isPlainDomain()) ensureAddFAB();
    if (debeMostrarFabServicios() && !document.getElementById('il-servicios-fab')){
      crearFabServicios();
    }
    ensureReaderFAB();
    repositionStackFABs();
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
     · 'voceiro-estado' Voceiro → lector {v, respuesta, pendientes, perfil, lector}.
     · 'lector-estado'  lector → Voceiro, igual.
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
    pendientes: CFG.readLater || [], perfil: perfilDelLector(), lector: bloqueConfigLector()
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

(function initVoceiroBridge(){
  if (window.__voceiroBridgeReady) return;
  window.__voceiroBridgeReady = true;

  // Cambios hechos en otra pestaña: CFG se refresca en todas las páginas;
  // a Voceiro se le mandan solo en la suya (enviarEstado lo comprueba).
  PLATAFORMA.alCambiar(CFG_KEY, nuevo => {
    CFG = mergeCfg(DEFAULT_CFG, nuevo);
    __perfilFirma = firmaPerfilLector(CFG);
    __configFirma = firmaConfig(CFG);
    enviarEstado(false);
  });

  // Lo demás solo existe en Voceiro.
  if (!esVoceiro()) return;

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

    saveCfg(CFG);
    if (!d.respuesta && comparableEstado(estadoDelLector()) !== comparableEstado(d)){
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