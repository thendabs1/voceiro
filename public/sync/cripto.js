// Código de sincronización y cifrado, con WebCrypto (navegador y Node).
//
// El código (25 caracteres, 125 bits) solo vive en los dispositivos. De él
// salen, con HKDF:
//   · id     → en qué fila del servidor está el bloque;
//   · token  → la llave para leerlo y escribirlo (el servidor guarda su huella);
//   · clave  → AES-GCM, para cifrar el bloque antes de que salga del navegador.
// El servidor nunca ve el código ni la clave: lo que guarda no lo puede leer.

// Base32 de Crockford: sin I, L, O ni U, para no confundir al dictarlo o
// copiarlo a mano.
const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const LARGO_CODIGO = 25;
const FORMATO = 1;    // primer byte del bloque cifrado
const SAL = 'voceiro-sync-v1';

export function generarCodigo(){
  const azar = crypto.getRandomValues(new Uint8Array(LARGO_CODIGO));
  return formatearCodigo([...azar].map(b => ALFABETO[b & 31]).join(''));
}

// De lo que escribe la persona al código limpio, o null si no vale. Admite
// minúsculas, espacios y guiones, y lee I/L como 1 y O como 0.
export function limpiarCodigo(texto){
  const s = String(texto || '').toUpperCase().replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1').replace(/O/g, '0');
  return s.length === LARGO_CODIGO && [...s].every(c => ALFABETO.includes(c)) ? s : null;
}

export function formatearCodigo(codigo){
  return String(codigo).match(/.{1,5}/g).join('-');
}

const texto = s => new TextEncoder().encode(s);

async function hkdf(codigo, info, bits){
  const base = await crypto.subtle.importKey('raw', texto(codigo), 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: texto(SAL), info: texto(info) }, base, bits));
}

function hex(bytes){
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

function base64url(bytes){
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function derivar(codigo){
  const c = limpiarCodigo(codigo);
  if (!c) throw new Error('código no válido');
  const id = hex(await hkdf(c, 'id', 128));
  const token = base64url(await hkdf(c, 'token', 256));
  const clave = await crypto.subtle.importKey(
    'raw', await hkdf(c, 'clave', 256), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { id, token, clave };
}

async function pasar(bytes, transformador){
  const stream = new Blob([bytes]).stream().pipeThrough(transformador);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Objeto → JSON → gzip → AES-GCM. Bloque: [formato][iv (12)][cifrado].
export async function cifrar(clave, objeto){
  const comprimido = await pasar(texto(JSON.stringify(objeto)), new CompressionStream('gzip'));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, clave, comprimido));
  const bloque = new Uint8Array(1 + iv.length + cifrado.length);
  bloque[0] = FORMATO;
  bloque.set(iv, 1);
  bloque.set(cifrado, 1 + iv.length);
  return bloque;
}

export async function descifrar(clave, bloque){
  const b = new Uint8Array(bloque);
  if (b[0] !== FORMATO) throw new Error('formato desconocido');
  const plano = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(1, 13) }, clave, b.slice(13));
  const json = await pasar(new Uint8Array(plano), new DecompressionStream('gzip'));
  return JSON.parse(new TextDecoder().decode(json));
}
