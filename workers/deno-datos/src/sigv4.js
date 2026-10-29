// worker-deno-datos/src/sigv4.js
// Firma SigV4 para AWS S3 / Cloudflare R2. Solo GET/HEAD (sin body).

const enc = new TextEncoder();

function toHex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(data) {
  const buf = typeof data === 'string' ? enc.encode(data) : data;
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return toHex(hash);
}

async function hmac(key, data) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    typeof key === 'string' ? enc.encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const dataBuf = typeof data === 'string' ? enc.encode(data) : data;
  return await crypto.subtle.sign('HMAC', cryptoKey, dataBuf);
}

function amzDate() {
  const iso = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { full: iso, date: iso.slice(0, 8) };
}

function uriEncode(s) {
  return encodeURIComponent(s)
    .replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

// Canonical URI: cada segmento, ya codificado por URL, se decodifica antes de
// recodificarlo; si no, «a%20b» se firmaría como «a%2520b» y R2 daría 403.
export function rutaCanonica(pathname) {
  return pathname.split('/').map(seg => uriEncode(decodeURIComponent(seg))).join('/') || '/';
}

/**
 * Firma una petición GET/HEAD a R2.
 * Devuelve el objeto de headers a enviar al fetch.
 */
export async function signR2Request({ method, url, accessKeyId, secretAccessKey }) {
  const u = new URL(url);
  const { full: amzDateFull, date: amzDateShort } = amzDate();
  const host = u.host;

  const canonicalUri = rutaCanonica(u.pathname);

  // Canonical query (ordenada)
  const params = [...u.searchParams.entries()].sort(([a], [b]) => a < b ? -1 : 1);
  const canonicalQuery = params
    .map(([k, v]) => uriEncode(k) + '=' + uriEncode(v))
    .join('&');

  // Para GET sin body, UNSIGNED-PAYLOAD es válido en S3/R2
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDateFull}\n`;

  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest =
    `${method}\n` +
    `${canonicalUri}\n` +
    `${canonicalQuery}\n` +
    `${canonicalHeaders}\n` +
    `${signedHeaders}\n` +
    `${payloadHash}`;

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${amzDateShort}/auto/s3/aws4_request`;
  const stringToSign =
    `${algorithm}\n` +
    `${amzDateFull}\n` +
    `${credentialScope}\n` +
    `${await sha256Hex(canonicalRequest)}`;

  const kDate    = await hmac('AWS4' + secretAccessKey, amzDateShort);
  const kRegion  = await hmac(kDate, 'auto');
  const kService = await hmac(kRegion, 's3');
  const kSigning = await hmac(kService, 'aws4_request');

  const signature = toHex(await hmac(kSigning, stringToSign));

  const authorization =
    `${algorithm} Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, ` +
    `Signature=${signature}`;

  return {
    'Authorization': authorization,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDateFull,
  };
}

