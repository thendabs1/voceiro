// Generado desde workers/comun/buscar.js por scripts/sync-workers.mjs. No editar.
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Las plataformas aportan su caché, su entorno y cómo retener la escritura.
// No llama al otro backend: cada despliegue resuelve la consulta por sí mismo.
export async function buscar(request, { parseQuery, adapters, env, abrirCache,
                                        guardarCache, cacheControl }) {
  const url = new URL(request.url);
  const raw = url.searchParams.get('raw') ?? url.searchParams.get('q') ?? '';
  const parsed = parseQuery(raw);

  // Overrides desde query string
  const fuentesQ = url.searchParams.get('fuentes');
  if (fuentesQ) parsed.fuentes = fuentesQ.split(',').map(s => s.trim()).filter(Boolean);

  const limitQ = url.searchParams.get('limit');
  if (limitQ) parsed.limit = Math.min(parseInt(limitQ, 10) || 50, 200);

  const offsetQ = url.searchParams.get('offset');
  if (offsetQ) parsed.offset = Math.max(parseInt(offsetQ, 10) || 0, 0);

  const orderQ = url.searchParams.get('order');
  if (orderQ && ['recientes','antiguos','relevancia'].includes(orderQ)) parsed.order = orderQ;

  const langQ = url.searchParams.get('lang');
  if (langQ && !parsed.lang?.length) parsed.lang = [langQ];

  const regionQ = url.searchParams.get('region');
  if (regionQ && !parsed.region) parsed.region = regionQ;

  const activas = parsed.fuentes.filter(f => adapters[f]);
  if (!activas.length) {
    return json({ total: 0, items: [], next_offset: null, fuentes: [] }, CORS);
  }

  // ── Cache ──
  const cacheKeyUrl = new URL(request.url);
  cacheKeyUrl.searchParams.set('fuentes', [...activas].sort().join(','));
  cacheKeyUrl.searchParams.set('limit',  String(parsed.limit));
  cacheKeyUrl.searchParams.set('offset', String(parsed.offset));
  cacheKeyUrl.searchParams.set('order',  parsed.order);
  const cacheKey = new Request(cacheKeyUrl.toString(), { method: 'GET' });

  const cache = await abrirCache();
  const cached = await cache.match(cacheKey);
  if (cached) {
    const r = new Response(cached.body, cached);
    r.headers.set('X-Cache', 'HIT');
    return r;
  }

  // ── Fan-out paralelo ──
  const t0 = Date.now();
  const settled = await Promise.allSettled(
    activas.map(name => adapters[name].search(parsed, env))
  );
  const ms = Date.now() - t0;

  const itemsAll = [];
  let totalTurso = 0;
  let hayMasTurso = false;
  const fuentesOk = [];
  const fuentesErr = {};

  settled.forEach((r, i) => {
    const name = activas[i];
    if (r.status === 'fulfilled') {
      const items = r.value.items || [];
      for (const it of items){
        if (!it._src) it._src = name;
      }
      itemsAll.push(...items);
      fuentesOk.push(name);
      if (name === 'turso') {
        totalTurso = r.value.total ?? items.length;
        hayMasTurso = r.value.hayMas ?? false;
      }
    } else {
      fuentesErr[name] = String(r.reason?.message || r.reason).slice(0, 200);
    }
  });

  // ── Dedup por URL normalizada ──
  const seen = new Set();
  const deduped = [];
  for (const item of itemsAll) {
    const key = normalizeUrl(item.u, item.d);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  // ── Orden final ──
  if (parsed.order !== 'relevancia') {
    deduped.sort((a, b) => {
      const ta = Date.parse(a.p) || 0;
      const tb = Date.parse(b.p) || 0;
      return parsed.order === 'antiguos' ? ta - tb : tb - ta;
    });
  }

  const soloTurso = activas.length === 1 && activas[0] === 'turso';
  const next_offset = (soloTurso && hayMasTurso)
    ? parsed.offset + parsed.limit
    : null;

  const body = {
    total: soloTurso ? totalTurso : deduped.length,
    items: deduped,
    next_offset,
    fuentes: fuentesOk,
    _ms: ms,
  };
  if (Object.keys(fuentesErr).length) body._errores = fuentesErr;

  const tieneErrores = Object.keys(fuentesErr).length > 0;
  const response = json(body, {
    ...CORS,
    'Cache-Control': tieneErrores
      ? 'no-store, max-age=0'
      : cacheControl,
  });

  if (!tieneErrores) {
    guardarCache(cache.put(cacheKey, response.clone()));
  }
  return response;
}

function normalizeUrl(u, d) {
  if (!u) return '';
  let full = u;
  if (u.startsWith('/')) full = `https://${d}${u}`;
  try {
    const url = new URL(full);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content',
     'fbclid','gclid','mc_cid','mc_eid','igshid'].forEach(k => url.searchParams.delete(k));
    return url.href;
  } catch {
    return full;
  }
}

export function json(data, extra = {}) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}
