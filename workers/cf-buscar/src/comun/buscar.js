// Generado desde workers/comun/buscar.js por scripts/sync-workers.mjs. No editar.
import { respuesta429 } from './limite.js';

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Hasta dónde se pagina el archivo. OFFSET lee y descarta las filas que se
// salta, y Turso cobra las leídas: sin tope, una petición podía leer miles.
export const MAX_OFFSET = 1000;

// Las plataformas aportan su caché, su entorno y cómo retener la escritura.
// No llama al otro backend: cada despliegue resuelve la consulta por sí mismo.
// limitar: segundos de espera para quien pide (0: adelante); solo cuenta lo
// que no está en caché, que es lo que gasta las cuotas de las fuentes.
export async function buscar(request, { parseQuery, adapters, env, abrirCache,
                                        guardarCache, cacheControl, limitar }) {
  const url = new URL(request.url);
  const raw = url.searchParams.get('raw') ?? url.searchParams.get('q') ?? '';
  const parsed = parseQuery(raw);

  // Overrides desde query string
  const fuentesQ = url.searchParams.get('fuentes');
  if (fuentesQ) parsed.fuentes = fuentesQ.split(',').map(s => s.trim()).filter(Boolean);

  const limitQ = url.searchParams.get('limit');
  if (limitQ) parsed.limit = Math.min(parseInt(limitQ, 10) || 50, 200);
  // También se aplica a limit: dentro de raw. En SQLite LIMIT -1 no tiene tope.
  parsed.limit = Math.max(1, Math.min(Number.isSafeInteger(parsed.limit) ? parsed.limit : 50, 200));

  const offsetQ = url.searchParams.get('offset');
  if (offsetQ) parsed.offset = Math.max(parseInt(offsetQ, 10) || 0, 0);

  const orderQ = url.searchParams.get('order');
  if (orderQ && ['recientes','antiguos','relevancia'].includes(orderQ)) parsed.order = orderQ;

  const langQ = url.searchParams.get('lang');
  if (langQ && !parsed.lang?.length) parsed.lang = [langQ];

  const regionQ = url.searchParams.get('region');
  if (regionQ && !parsed.region) parsed.region = regionQ;

  const activas = [...new Set(parsed.fuentes)].filter(f => Object.hasOwn(adapters, f)).sort();
  if (!activas.length || parsed.offset > MAX_OFFSET) {
    return json({ total: 0, items: [], next_offset: null, fuentes: [] }, CORS);
  }

  // Sin fechas expresas, el archivo empieza en los últimos 30 días de Madrid.
  // El front puede ampliar enviando hasta: con el día anterior a este corte.
  // No se añade esta ventana a Google News, que mantiene su propia consulta.
  let archivoDesde = null;
  if (activas.includes('turso') && !parsed.desde && !parsed.hasta) {
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
    const inicio = new Date(`${hoy}T00:00:00Z`);
    inicio.setUTCDate(inicio.getUTCDate() - 29);
    archivoDesde = inicio.toISOString().slice(0, 10);
  }

  // ── Cache ──
  // La consulta efectiva, no la URL escrita: q/raw, espacios, overrides y
  // parámetros ajenos no deben multiplicar las lecturas de una misma búsqueda.
  const cacheKeyUrl = new URL('/buscar', url);
  cacheKeyUrl.searchParams.set('v', '2');
  cacheKeyUrl.searchParams.set('consulta', JSON.stringify({
    titulo: parsed.titulo, dominios: parsed.dominios, medios: parsed.medios,
    grupos: parsed.grupos, tipos: parsed.tipos, tags: parsed.tags,
    lang: parsed.lang, region: parsed.region,
    desde: parsed.desde, hasta: parsed.hasta, archivoDesde,
    fuentes: activas, limit: parsed.limit, offset: parsed.offset, order: parsed.order,
  }));
  const cacheKey = new Request(cacheKeyUrl.toString(), { method: 'GET' });

  const cache = await abrirCache();
  const cached = await cache.match(cacheKey);
  if (cached) {
    const r = new Response(cached.body, cached);
    r.headers.set('X-Cache', 'HIT');
    return r;
  }

  const espera = limitar ? limitar() : 0;
  if (espera) return respuesta429(espera, CORS);

  // ── Fan-out paralelo ──
  const t0 = Date.now();
  const settled = await Promise.allSettled(
    activas.map(name => adapters[name].search(
      name === 'turso' && archivoDesde ? { ...parsed, desde: archivoDesde } : parsed, env))
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
        // null significa que no se ha contado todo el archivo.
        totalTurso = r.value.total === undefined ? items.length : r.value.total;
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
  const next_offset = (soloTurso && hayMasTurso && parsed.offset + parsed.limit <= MAX_OFFSET)
    ? parsed.offset + parsed.limit
    : null;

  const body = {
    total: soloTurso ? totalTurso : deduped.length,
    items: deduped,
    next_offset,
    fuentes: fuentesOk,
    _ms: ms,
  };
  if (activas.includes('turso')) body.archivo_desde = archivoDesde;
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
