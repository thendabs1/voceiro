// Relay de búsquedas de Voceiro: pide el RSS de búsqueda de Google News desde
// Deno Deploy (Google bloquea la IP de Cloudflare) y lo devuelve como JSON.
// Lo llaman los adaptadores gnews de cf-buscar y deno-buscar.
//
// Distinto del relay del recolector (deno-relay): ese sirve feeds de medios
// con su allowlist; este solo sirve news.google.com/rss.
//
//   GET /?url=<URL de news.google.com/rss/search?…>

import { rssAJson } from './rss.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const TIMEOUT_MS = 6000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  if (u.pathname !== '/') return new Response('not found', { status: 404 });

  const target = u.searchParams.get('url');
  if (!target) return new Response('relay ok', { status: 200 });

  let destino;
  try {
    destino = new URL(target);
  } catch {
    return json({ status: 'error', message: 'url no válida' }, 400);
  }
  if (destino.protocol !== 'https:' || destino.hostname !== 'news.google.com'
      || !destino.pathname.startsWith('/rss')) {
    return json({ status: 'error', message: 'url no permitida' }, 403);
  }

  try {
    const r = await fetch(destino.toString(), {
      headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml,application/xml;q=0.9,*/*;q=0.8' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) return json({ status: 'error', message: `Google News HTTP ${r.status}` }, 502);
    const datos = rssAJson(await r.text(), destino.toString());
    return json(datos, datos.status === 'ok' ? 200 : 502);
  } catch (e) {
    return json({ status: 'error', message: String(e?.message || e) }, 502);
  }
});
