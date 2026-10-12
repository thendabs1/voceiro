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

    let r2Res;
    try {
      r2Res = await fetch(r2Url, { method, headers: sigHeaders });
    } catch (e) {
      return new Response(`R2 fetch error: ${e.message}`, { status: 502, headers: CORS });
    }

    if (r2Res.status === 404) return _notFound();
    if (!r2Res.ok) {
      const txt = await r2Res.text().catch(() => '');
      return new Response(`R2 error ${r2Res.status}: ${txt.slice(0, 200)}`, {
        status: 502,
        headers: CORS,
      });
    }

    const cacheControl = _cacheControlFor(key);

    return new Response(method === 'HEAD' ? null : r2Res.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': cacheControl,
        ...CORS,
      },
    });
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

