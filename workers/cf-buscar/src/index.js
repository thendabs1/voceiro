import { buscar, CORS, json } from './comun/buscar.js';
import { parseQuery } from '../../../shared/parser.js';
import { PARSER_SOURCE } from './parser-source.js';
import { turso } from './sources/turso.js';
import { gnews } from './sources/gnews.js';

const ADAPTERS = { turso, gnews };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // ── Parser compartido servido como módulo ES ──
    // El frontend hace:
    //   import { parseQuery } from 'https://.../parser.js'
    // Esto es lo que cierra el problema del parser duplicado.
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
      parseQuery, adapters: ADAPTERS, env,
      abrirCache: () => caches.default,
      guardarCache: tarea => ctx.waitUntil(tarea),
      cacheControl: 'public, max-age=60, s-maxage=300',
    });
    if (url.pathname === '/health') return json({ ok: true, ts: Date.now() });

    return new Response('Not found', { status: 404, headers: CORS });
  }
};
