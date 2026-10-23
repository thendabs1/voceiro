// Lógica del servicio de sincronización, sin nada de Cloudflare: el almacén
// se inyecta (D1 por binding en CF, D1 por la API HTTP en Deno, uno en
// memoria en los tests) y la IP del cliente la da cada plataforma.
//
// API (todo con Authorization: Bearer <token>):
//   GET    /v1/s/:id   → 200 bloque cifrado + X-Version | 404
//   PUT    /v1/s/:id   If-Match: <versión> (0 para crearlo)
//                      → 200 {version} | 409 {version} si otro escribió antes
//   DELETE /v1/s/:id   → 204
//   GET    /v1/salud   → 200 {ok: true}
// id y token salen del código de sincronización en el navegador; el bloque
// llega cifrado, así que aquí no se puede leer lo que guarda.

export const ORIGEN = 'https://thendabs1.github.io';
// El lector (userscript o extensión) pide desde el gestor o la extensión:
// llega con su origen propio, que no es una web. No necesita CORS.
const RE_ORIGEN_EXTENSION = /^(moz|chrome|safari-web)-extension:\/\//;
export const MAX_BYTES = 512 * 1024;
export const INTERVALO_MIN_MS = 2000;     // entre subidas del mismo código
export const ALTAS_POR_IP_DIA = 10;       // códigos nuevos por IP y día
export const MAX_FILAS = 20000;           // tope de códigos guardados
export const CADUCIDAD_MS = 365 * 86400000;
const DIA_MS = 86400000;

const RE_RUTA = /^\/v1\/s\/([0-9a-f]{32})$/;
const RE_TOKEN = /^[A-Za-z0-9_-]{43}$/;   // 32 bytes en base64url, sin relleno

function cabecerasCors(origen){
  const h = {
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, If-Match, Content-Type',
    'Access-Control-Expose-Headers': 'X-Version',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (origen === ORIGEN) h['Access-Control-Allow-Origin'] = ORIGEN;
  return h;
}

function responder(origen, status, cuerpo, extra = {}){
  const h = { ...cabecerasCors(origen), 'Cache-Control': 'no-store', ...extra };
  if (cuerpo === null || cuerpo === undefined){
    return new Response(null, { status, headers: h });
  }
  if (cuerpo instanceof Uint8Array){
    h['Content-Type'] = 'application/octet-stream';
    return new Response(cuerpo, { status, headers: h });
  }
  h['Content-Type'] = 'application/json';
  return new Response(JSON.stringify(cuerpo), { status, headers: h });
}

export async function sha256hex(texto){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// La IP solo se usa en memoria. Unifica IPv6 y las IPv4 mapeadas antes del HMAC.
export function normalizarIp(ip){
  if (typeof ip !== 'string' || !ip || ip !== ip.trim()) return null;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)){
    const partes = ip.split('.').map(Number);
    return partes.every(n => n <= 255) ? partes.join('.') : null;
  }
  if (!/^[0-9a-f:.]+$/i.test(ip) || !ip.includes(':')) return null;
  try {
    const canonica = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
    const mapeada = canonica.match(/^::ffff:([0-9a-f]+):([0-9a-f]+)$/);
    if (mapeada){
      const a = parseInt(mapeada[1], 16), b = parseInt(mapeada[2], 16);
      return [a >> 8, a & 255, b >> 8, b & 255].join('.');
    }
    return canonica;
  } catch { return null; }
}

export async function huellaIpDiaria(ip, dia, secreto){
  const normalizada = normalizarIp(ip);
  // 32 bytes aleatorios representados en hexadecimal, iguales en CF y Deno.
  if (!normalizada || !/^[0-9a-f]{64}$/i.test(secreto || '')) return null;
  const bytes = Uint8Array.from(secreto.match(/../g), b => parseInt(b, 16));
  const clave = await crypto.subtle.importKey('raw', bytes,
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const firma = await crypto.subtle.sign('HMAC', clave,
    new TextEncoder().encode(`voceiro-altas-v1\n${dia}\n${normalizada}`));
  return [...new Uint8Array(firma)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function leerCuerpo(request){
  if (!request.body) return new Uint8Array();
  const lector = request.body.getReader();
  const partes = [];
  let total = 0;
  try {
    for (;;){
      const { done, value } = await lector.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES){
        await lector.cancel().catch(() => {});
        return null;
      }
      partes.push(value);
    }
  } finally { lector.releaseLock(); }
  const datos = new Uint8Array(total);
  let offset = 0;
  for (const parte of partes){ datos.set(parte, offset); offset += parte.byteLength; }
  return datos;
}

// Comparación en tiempo constante (las dos huellas miden lo mismo).
function iguales(a, b){
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// ip: la del cliente según la plataforma. En CF, CF-Connecting-IP es fiable;
// en Deno esa cabecera la podría mandar cualquiera, así que se pasa aparte.
export async function atender(request, almacen, ahora = Date.now(),
                              ip = request.headers.get('CF-Connecting-IP'), secretoIp){
  const origen = request.headers.get('Origin') || '';
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') return responder(origen, 204, null);
  // Otra web, desde un navegador: fuera. (Sin Origin o desde una extensión,
  // la llave es el token.)
  if (origen && origen !== ORIGEN && !RE_ORIGEN_EXTENSION.test(origen)) return responder(origen, 403, { error: 'origen' });

  if (url.pathname === '/v1/salud' && request.method === 'GET'){
    return responder(origen, 200, { ok: true });
  }

  const ruta = url.pathname.match(RE_RUTA);
  if (!ruta) return responder(origen, 404, { error: 'ruta' });
  const id = ruta[1];

  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!RE_TOKEN.test(token)) return responder(origen, 401, { error: 'token' });
  const huellaToken = await sha256hex(token);

  const fila = await almacen.leer(id);
  if (fila && !iguales(fila.token_hash, huellaToken)) return responder(origen, 403, { error: 'token' });
  if (fila?.revocado){
    return request.method === 'DELETE' ? responder(origen, 204, null)
      : responder(origen, 410, { error: 'revocado' });
  }

  if (request.method === 'GET'){
    if (!fila) return responder(origen, 404, { error: 'no existe' });
    // «Último uso» como mucho una vez al día: una escritura por GET saldría cara.
    if (ahora - fila.accedido > DIA_MS) await almacen.tocar(id, ahora);
    return responder(origen, 200, new Uint8Array(fila.datos), { 'X-Version': String(fila.version) });
  }

  if (request.method === 'DELETE'){
    if (fila) await almacen.borrar(id, huellaToken);
    return responder(origen, 204, null);
  }

  if (request.method !== 'PUT') return responder(origen, 405, { error: 'método' });

  // Sin If-Match no se escribe (Number(null) sería 0, «crear», y no lo es).
  const ifMatch = (request.headers.get('If-Match') || '').trim();
  const base = /^\d+$/.test(ifMatch) ? Number(ifMatch) : NaN;
  if (!Number.isSafeInteger(base)) return responder(origen, 428, { error: 'If-Match' });
  if (Number(request.headers.get('Content-Length') || 0) > MAX_BYTES){
    return responder(origen, 413, { error: 'tamaño' });
  }
  const datos = await leerCuerpo(request);
  if (!datos) return responder(origen, 413, { error: 'tamaño' });
  if (!datos.length) return responder(origen, 400, { error: 'vacío' });

  if (!fila){
    if (base !== 0) return responder(origen, 409, { version: 0 }, { 'X-Version': '0' });
    const dia = new Date(ahora).toISOString().slice(0, 10);
    const huellaIp = await huellaIpDiaria(ip, dia, secretoIp);
    if (!huellaIp) return responder(origen, 503, { error: 'altas no disponibles' });
    // Comprobación, alta y contadores se confirman juntos en D1.
    const resultado = await almacen.crear({ id, token_hash: huellaToken, datos, ahora,
      ip: huellaIp, dia, maxAltas: ALTAS_POR_IP_DIA, maxFilas: MAX_FILAS });
    if (resultado === 'altas') return responder(origen, 429, { error: 'altas' });
    if (resultado === 'lleno') return responder(origen, 503, { error: 'lleno' });
    if (resultado === 'revocado') return responder(origen, 410, { error: 'revocado' });
    if (resultado === 'existe'){
      const otra = await almacen.leer(id);   // se creó a la vez desde otro sitio
      return responder(origen, 409, { version: otra ? otra.version : 0 });
    }
    if (resultado !== 'creado') throw new Error('Resultado de alta desconocido');
    return responder(origen, 200, { version: 1 }, { 'X-Version': '1' });
  }

  if (base !== fila.version){
    return responder(origen, 409, { version: fila.version }, { 'X-Version': String(fila.version) });
  }
  if (ahora - fila.actualizado < INTERVALO_MIN_MS){
    return responder(origen, 429, { error: 'espera' }, { 'Retry-After': '2' });
  }
  if (!await almacen.actualizar({ id, token_hash: huellaToken, version: base, datos, ahora })){
    const otra = await almacen.leer(id);
    if (otra?.revocado) return responder(origen, 410, { error: 'revocado' });
    return responder(origen, 409, { version: otra ? otra.version : 0 });
  }
  return responder(origen, 200, { version: base + 1 }, { 'X-Version': String(base + 1) });
}

// Limpieza diaria: códigos sin uso en CADUCIDAD_MS y contadores de altas viejos.
export async function limpiar(almacen, ahora = Date.now()){
  await almacen.borrarInactivos(ahora - CADUCIDAD_MS);
  await almacen.borrarAltasAntes(new Date(ahora - 2 * DIA_MS).toISOString().slice(0, 10));
}
