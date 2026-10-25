import { cacheControlFor } from './comun/datos-cache.js';
import { atenderCalendario } from './comun/calendario.js';
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const calendario = await atenderCalendario(request, env, { ip: request.headers.get('CF-Connecting-IP') || '',
      abrirCache: () => caches.default, guardarCache: tarea => ctx?.waitUntil(tarea) });
    if (calendario) return calendario;

    // ── CORS preflight ──
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // ── Servir ficheros de R2 ──
    const key = url.pathname.slice(1);
    if (!key) return _notFound();

    // ── Revalidación: si el ETag coincide, R2 no manda el cuerpo → 304 ──
    // Cloudflare debilita el ETag al comprimir (W/"…"): se compara sin W/.
    const inm = _etagPedido(request);
    const obj = await env.BUCKET.get(key,
      inm ? { onlyIf: { etagDoesNotMatch: inm } } : undefined);
    if (!obj) return _notFound();

    // ── Cache-Control según el tipo de fichero ──
    const cacheControl = cacheControlFor(key);

    if (!('body' in obj)) {
      return new Response(null, {
        status: 304,
        headers: {
          'ETag': obj.httpEtag,
          'Cache-Control': cacheControl,
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    return new Response(obj.body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': cacheControl,
        'ETag': obj.httpEtag,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  },
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function _notFound() {
  return new Response('Not found', {
    status: 404,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// ETag de If-None-Match sin W/ ni comillas (el navegador manda uno solo).
function _etagPedido(request) {
  const h = request.headers.get('If-None-Match');
  if (!h) return null;
  return h.trim().replace(/^W\//, '').replace(/^"|"$/g, '') || null;
}
