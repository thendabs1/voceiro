export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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
    const cacheControl = _cacheControlFor(key);

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

function _cacheControlFor(key) {
  // Índice general: 60s
  if (key === 'manifest.json') return 'public, max-age=60';

  // Portada rodante: 60s
  if (key.startsWith('portada-')) return 'public, max-age=60';

  // Slice por dominio (nombre estable): 60s, coherente con el manifest
  if (/^d-[a-z0-9.-]+-\d{4}-\d{2}-\d{2}\.json$/.test(key)) {
    return 'public, max-age=60';
  }

  // Día completo "all": YYYY-MM-DD-<hash>.json → inmutable
  if (/^\d{4}-\d{2}-\d{2}-[a-f0-9]{10}\.json$/.test(key)) {
    return 'public, max-age=31536000, immutable';
  }

  // Slice por grupo: YYYY-MM-DD-g-<slug>-<hash>.json → inmutable
  if (/^\d{4}-\d{2}-\d{2}-g-[a-z0-9-]+-[a-f0-9]{10}\.json$/.test(key)) {
    return 'public, max-age=31536000, immutable';
  }

  // Compat: dominios.json (obsoleto, ya no se genera)
  if (key === 'dominios.json') return 'public, max-age=300';

  // Fallback
  return 'public, max-age=3600';
}