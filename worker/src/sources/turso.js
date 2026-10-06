import { buildFtsQuery } from '../../../shared/parser.js';

const TURSO_TIMEOUT_MS = 10000;

export const turso = {
  name: 'turso',
  cacheTTL: 300,

  async search(parsed, env) {
    const conditions = [];
    const args = [];

    const ftsQ = buildFtsQuery(parsed.titulo);
    if (ftsQ) {
      conditions.push('f MATCH ?');
      args.push(ftsQ);
    }

    if (parsed.desde) { conditions.push('n.fecha_dia >= ?'); args.push(parsed.desde); }
    if (parsed.hasta) { conditions.push('n.fecha_dia <= ?'); args.push(parsed.hasta); }

    // ── Dominios: exacta ──
    if (parsed.dominios.length) {
      conditions.push(`n.dominio IN (${parsed.dominios.map(() => '?').join(',')})`);
      args.push(...parsed.dominios);
    }

    // ── Grupos / tipos / lang: requieren JOIN con medios ──
    const needsJoin = parsed.grupos.length
                   || parsed.tipos.length
                   || (parsed.lang?.length ?? 0) > 0
                   || (parsed.tags?.length ?? 0) > 0;

    if (parsed.grupos.length) {
      for (const g of parsed.grupos) {
        conditions.push(`m.grupo_norm LIKE '%' || ? || '%' ESCAPE '\\'`);
        args.push(escapeLike(g));
      }
    }
    if (parsed.tipos.length) {
      for (const t of parsed.tipos) {
        conditions.push(`m.tipo_norm LIKE '%' || ? || '%' ESCAPE '\\'`);
        args.push(escapeLike(t));
      }
    }
    if (parsed.lang?.length) {
      conditions.push(`m.lang_norm IN (${parsed.lang.map(() => '?').join(',')})`);
      args.push(...parsed.lang);
    }
    if (parsed.tags?.length) {
      for (const tg of parsed.tags) {
        conditions.push(`m.tags LIKE '%' || ? || '%' ESCAPE '\\'`);
        args.push(escapeLike(tg));
      }
    }

    // ── Ventana por defecto cuando no hay FTS ni rango explícito ──
    // Sin texto, el usuario navega el catálogo por grupo/tipo/lang.
    // 30 días es suficiente y el índice idx_noticias_dia lo resuelve.
    if (!ftsQ && !parsed.desde && !parsed.hasta) {
      const hace30 = new Date(Date.now() - 30 * 86400 * 1000)
        .toISOString().slice(0, 10);
      conditions.push('n.fecha_dia >= ?');
      args.push(hace30);
    }

    const where = conditions.length ? conditions.join(' AND ') : '1=1';

    // ── ORDER BY ──
    // fecha_dia primero: tiene índice (idx_noticias_dia). fecha_pub desempata
    // dentro del día. enlace desempata totalmente (paginación determinista).
    const orderByItems = parsed.order === 'antiguos'
      ? 'ORDER BY n.fecha_dia ASC,  n.fecha_pub ASC,  n.enlace ASC'
      : 'ORDER BY n.fecha_dia DESC, n.fecha_pub DESC, n.enlace ASC';

    const orderByFts = (parsed.order === 'relevancia' && ftsQ)
      ? 'ORDER BY bm25(f) ASC'
      : orderByItems;

    // ── Dos caminos ──
    // Con FTS: noticias_fts MATCH para filtrar, JOIN a noticias por enlace.
    // Sin FTS: noticias directo. noticias_fts es standalone (sin índices
    //          B-tree), escanearla sin MATCH es el cuello de botella.
    const sql = ftsQ
      ? `
        SELECT n.titular, n.enlace, n.dominio,
               n.fecha_pub, n.fecha_est, n.fuente, n.fecha_dia
        FROM noticias_fts f
        JOIN noticias n ON n.enlace = f.enlace
        ${needsJoin ? 'JOIN medios m ON m.dominio = n.dominio' : ''}
        WHERE ${where}
        ${orderByFts}
        LIMIT ? OFFSET ?
      `
      : `
        SELECT n.titular, n.enlace, n.dominio,
               n.fecha_pub, n.fecha_est, n.fuente, n.fecha_dia
        FROM noticias n
        ${needsJoin ? 'JOIN medios m ON m.dominio = n.dominio' : ''}
        WHERE ${where}
        ${orderByItems}
        LIMIT ? OFFSET ?
      `;

    const countSql = ftsQ
      ? `
        SELECT COUNT(*) AS n FROM (
          SELECT 1
          FROM noticias_fts f
          JOIN noticias n ON n.enlace = f.enlace
          ${needsJoin ? 'JOIN medios m ON m.dominio = n.dominio' : ''}
          WHERE ${where}
          LIMIT 5001
        )
      `
      : `
        SELECT COUNT(*) AS n FROM (
          SELECT 1
          FROM noticias n
          ${needsJoin ? 'JOIN medios m ON m.dominio = n.dominio' : ''}
          WHERE ${where}
          LIMIT 5001
        )
      `;

    const itemArgs = [...args, parsed.limit, parsed.offset];
    const countArgs = args;

    // ── Solo COUNT si hay FTS ──
    // Sin FTS no lo necesitamos (el usuario está navegando el catálogo, no
    // buscando algo concreto). Con FTS el MATCH filtra mucho y es rápido.
    const hacerCount = !!ftsQ;

    const requests = [
      { type: 'execute', stmt: { sql, args: itemArgs.map(toArg) } },
    ];
    if (hacerCount) {
      requests.push({ type: 'execute', stmt: { sql: countSql, args: countArgs.map(toArg) } });
    }
    requests.push({ type: 'close' });

    const payload = { requests };

    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), TURSO_TIMEOUT_MS);

    let res;
    try {
      res = await fetch(`${env.WORKER_TURSO_URL}/v2/pipeline`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.WORKER_TURSO_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(tid);
    }

    if (!res.ok) {
      throw new Error(`Turso HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }

    const data = await res.json();
    const results = data.results || [];

    for (const r of results) {
      if (r.type === 'error') {
        throw new Error(`Turso: ${r.error?.message || JSON.stringify(r.error).slice(0, 200)}`);
      }
    }

    const rows = parseRows(results[0]);
    let total = rows.length;
    if (hacerCount) {
      total = parseScalar(results[1]) ?? rows.length;
      if (total > 5000) total = 5000;
    }

    const hayMas = rows.length === parsed.limit;

    const items = rows.map(r => ({
      t: r[0] || '',
      u: shortenUrl(r[1], r[2]),
      d: r[2] || '',
      p: r[3] || '',
      e: r[4] || '',
      f: r[5] || 'TURSO',
    }));

    return { items, total, hayMas };
  }
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function escapeLike(s) {
  return String(s).replace(/[\\%_]/g, c => '\\' + c);
}

function toArg(v) {
  if (v === null || v === undefined) return { type: 'null' };
  if (typeof v === 'number' || Number.isInteger(v)) {
    return { type: 'integer', value: String(v) };
  }
  return { type: 'text', value: String(v) };
}

function parseRows(result) {
  if (!result || result.type !== 'ok') return [];
  const resp = result.response;
  if (!resp || resp.type !== 'execute') return [];
  return (resp.result?.rows || []).map(row => row.map(c => c.value));
}

function parseScalar(result) {
  const rows = parseRows(result);
  if (!rows.length) return null;
  const n = parseInt(rows[0][0], 10);
  return Number.isFinite(n) ? n : null;
}

function shortenUrl(url, dominio) {
  if (!url) return '';
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (host === dominio || host.endsWith('.' + dominio)) {
      return u.pathname + (u.search || '');
    }
    return url;
  } catch {
    return url;
  }
}