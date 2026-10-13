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
