import { buscar, CORS, json } from './comun/buscar.js';
import { parseQuery } from './shared/parser.js';
import { PARSER_SOURCE } from './parser-source.js';
import { turso } from './sources/turso.js';
import { gnews } from './sources/gnews.js';
import { handleTiempo } from './tiempo/index.js';
import { crearLimite, claveIp, respuesta429 } from './comun/limite.js';

const ADAPTERS = { turso, gnews };
// Por IP y minuto: las consultas que llegan a las fuentes (las de caché no
// cuentan) y las del tiempo (AEMET y Open-Meteo tienen cuota por clave o IP).
const limiteBuscar = crearLimite({ max: 30, ventanaMs: 60e3 });
const limiteTiempo = crearLimite({ max: 30, ventanaMs: 60e3 });

const CACHE_NAME = 'voceiro-buscar-v1';

export default {
  async fetch(request, info) {
    const url = new URL(request.url);
    // La IP de la conexión: aquí una cabecera la podría mandar cualquiera.
    const ip = claveIp(info?.remoteAddr?.hostname || '');

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
      limitar: () => limiteBuscar(ip),
    });
    if (url.pathname === '/tiempo' || url.pathname === '/tiempo/lugares' || url.pathname === '/avisos') {
      const espera = limiteTiempo(ip);
      if (espera) return respuesta429(espera, CORS);
      return handleTiempo(url, CORS);
    }
    if (url.pathname === '/health') return json({ ok: true, ts: Date.now() });

    return new Response('Not found', { status: 404, headers: CORS });
  }
};
