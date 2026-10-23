import { buscar, CORS, json } from './comun/buscar.js';
import { parseQuery } from './shared/parser.js';
import { PARSER_SOURCE } from './parser-source.js';
import { turso } from './sources/turso.js';
import { gnews } from './sources/gnews.js';
import { handleTiempo } from './tiempo/index.js';

const ADAPTERS = { turso, gnews };

const CACHE_NAME = 'voceiro-buscar-v1';

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (url.pathname === '/parser.js') {
      return new Response(PARSER_SOURCE, {
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Cache-Control': 'public, max-age=300',
        },
      });
    }

    if (url.pathname === '/buscar') return buscar(request, {
      parseQuery, adapters: ADAPTERS,
      abrirCache: () => caches.open(CACHE_NAME),
      guardarCache: tarea => { tarea.catch(() => {}); },
      cacheControl: 'public, max-age=60',
    });
    if (url.pathname === '/tiempo' || url.pathname === '/tiempo/lugares' || url.pathname === '/avisos') {
      return handleTiempo(url, CORS);
    }
    if (url.pathname === '/health') return json({ ok: true, ts: Date.now() });

    return new Response('Not found', { status: 404, headers: CORS });
  }
};
