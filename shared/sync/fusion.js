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

export const BORRADO_DIAS = 60;
export const PENDIENTES_MAX = 1000;   // sin leer que se conservan
export const LEIDOS_MAX = 300;        // leídos que se conservan
export const CAMPOS_PERFIL = ['lang', 'tema', 'fuente', 'fs', 'just', 'bionic', 'focus'];

const DIA_MS = 86400000;

// Clave de una URL para comparar: sin #, sin www., sin parámetros de
// seguimiento y sin barra final.
export function normalizeUrlForMatch(u){
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
export function fusionMs(v){
  if (typeof v === 'number' && isFinite(v)) return v;
  const n = Date.parse(v);
  return isFinite(n) ? n : 0;
}

// Huella para comparar estados (mismo contenido → misma cadena).
export function huella(x){
  return JSON.stringify(x === undefined ? null : x);
}

// Un pendiente con la forma común. Acepta la de Voceiro (date en ms) y la
// del lector (date en ISO). Devuelve null si no vale.
export function normalizarPendiente(i){
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
export function fusionarPendientes(a, b, ahora = Date.now()){
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
export function masReciente(a, b){
  if (!a) return b || null;
  if (!b) return a;
  const ta = fusionMs(a.actualizado), tb = fusionMs(b.actualizado);
  if (ta !== tb) return ta > tb ? a : b;
  return huella(a) >= huella(b) ? a : b;
}

// Perfil de lectura común: los campos de CAMPOS_PERFIL más `actualizado`.
export function limpiarPerfil(p){
  if (!p || typeof p !== 'object') return null;
  const out = {};
  for (const k of CAMPOS_PERFIL) if (p[k] !== undefined) out[k] = p[k];
  out.actualizado = fusionMs(p.actualizado);
  return out;
}

export function fusionarPerfil(a, b){
  return masReciente(limpiarPerfil(a), limpiarPerfil(b));
}

// ── Sincronización entre dispositivos: el documento entero ──────────
// El documento que se guarda (cifrado) en el servidor reúne Pendientes,
// leídas, perfil, modos y el bloque del lector. Su fusión es simétrica:
// da lo mismo en qué orden se junten, para que dos dispositivos no se
// pisen en bucle. La cortesía de «lo que nadie ha tocado (sello 0) no se
// impone» se aplica al volcarlo en cada dispositivo, no aquí.

export const LEIDAS_MAX = 5000;
export const MODO_BORRADO_DIAS = 365;

function canonico(x){
  if (Array.isArray(x)) return x.map(canonico);
  if (x && typeof x === 'object'){
    const o = {};
    for (const k of Object.keys(x).sort()) o[k] = canonico(x[k]);
    return o;
  }
  return x;
}

// Huella de un modo sin su sello: sirve para saber si cambió.
export function huellaModo(m){
  if (!m || typeof m !== 'object') return '';
  const { actualizado, ...resto } = m;
  return JSON.stringify(canonico(resto));
}

// Leídas: { url: ms }. Gana la fecha más reciente y se quedan las
// LEIDAS_MAX más recientes. (Desmarcar no viaja: una leída de más no estorba.)
export function fusionarLeidas(a, b){
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
export function fusionarModos(a, b, ahora = Date.now()){
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

export function fusionarDocumento(a, b, ahora = Date.now()){
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
