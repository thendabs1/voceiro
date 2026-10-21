// worker-deno-datos/src/index.js — Deno Deploy
import { signR2Request } from './sigv4.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const key = decodeURIComponent(url.pathname.slice(1));
    if (!key) return _notFound();

    const accountId       = Deno.env.get('R2_ACCOUNT_ID');
    const accessKeyId     = Deno.env.get('R2_ACCESS_KEY_ID');
    const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY');
    const bucket          = Deno.env.get('R2_BUCKET') || 'voceiro-datos';

    if (!accountId || !accessKeyId || !secretAccessKey) {
      return new Response('Missing R2 credentials', { status: 500, headers: CORS });
    }

    const method = request.method === 'HEAD' ? 'HEAD' : 'GET';
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    const r2Url = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${encodedKey}`;

    const sigHeaders = await signR2Request({
      method,
      url: r2Url,
      accessKeyId,
      secretAccessKey,
    });

    // Revalidación: R2 contesta 304 si el ETag coincide. El nuestro va
    // débil (W/"…") porque el cuerpo puede ir comprimido; a R2, sin W/.
    const inm = request.headers.get('If-None-Match');
    if (inm) sigHeaders['If-None-Match'] = inm.trim().replace(/^W\//, '');

    let r2Res;
    try {
      r2Res = await fetch(r2Url, { method, headers: sigHeaders });
    } catch (e) {
      return new Response(`R2 fetch error: ${e.message}`, { status: 502, headers: CORS });
    }

    const cacheControl = _cacheControlFor(key);
    const etag = r2Res.headers.get('ETag');
    const etagDebil = etag ? 'W/' + etag.replace(/^W\//, '') : null;

    if (r2Res.status === 304) {
      const h304 = { 'Cache-Control': cacheControl, 'Vary': 'Accept-Encoding', ...CORS };
      if (etagDebil) h304['ETag'] = etagDebil;
      return new Response(null, { status: 304, headers: h304 });
    }
    if (r2Res.status === 404) return _notFound();
    if (!r2Res.ok) {
      const txt = await r2Res.text().catch(() => '');
      return new Response(`R2 error ${r2Res.status}: ${txt.slice(0, 200)}`, {
        status: 502,
        headers: CORS,
      });
    }

    // Deno Deploy no comprime estas respuestas: gzip aquí (JSON ≈ 5× menos).
    const gzip = method === 'GET' &&
      /\bgzip\b/.test(request.headers.get('Accept-Encoding') || '');
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl,
      'Vary': 'Accept-Encoding',
      ...CORS,
    };
    if (etagDebil) headers['ETag'] = etagDebil;
    if (gzip) headers['Content-Encoding'] = 'gzip';

    let body = null;
    if (method === 'GET') {
      body = gzip ? r2Res.body.pipeThrough(new CompressionStream('gzip')) : r2Res.body;
    }
    return new Response(body, { status: 200, headers });
  },
};

function _notFound() {
  return new Response('Not found', { status: 404, headers: CORS });
}

function _cacheControlFor(key) {
  if (key === 'manifest.json') return 'public, max-age=60';
  if (key.startsWith('portada-')) return 'public, max-age=60';
  if (/^d-[a-z0-9.-]+-\d{4}-\d{2}-\d{2}\.json$/.test(key)) return 'public, max-age=60';
  if (/^\d{4}-\d{2}-\d{2}-[a-f0-9]{10}\.json$/.test(key)) return 'public, max-age=31536000, immutable';
  if (/^\d{4}-\d{2}-\d{2}-g-[a-z0-9-]+-[a-f0-9]{10}\.json$/.test(key)) return 'public, max-age=31536000, immutable';
  if (key === 'dominios.json') return 'public, max-age=300';
  return 'public, max-age=3600';
}

