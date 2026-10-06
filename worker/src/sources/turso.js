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
      conditions.push('noticias_fts MATCH ?');
      args.push(ftsQ);
    }

    if (parsed.desde) { conditions.push('f.fecha_dia >= ?'); args.push(parsed.desde); }
    if (parsed.hasta) { conditions.push('f.fecha_dia <= ?'); args.push(parsed.hasta); }

    // ── Dominios: exacta (valores cortos, sin ambigüedad) ──
    if (parsed.dominios.length) {
      conditions.push(`f.dominio IN (${parsed.dominios.map(() => '?').join(',')})`);
      args.push(...parsed.dominios);
    }

    // ── Grupos / tipos: LIKE sobre la clave normalizada ──
    // LIKE permite "grupo:nacionales" matchear "espananacionales",
    // y "grupo:espana" matchear todos los grupos españoles.
    const needsJoin = parsed.grupos.length
                   || parsed.tipos.length
                   || (parsed.lang?.length ?? 0) > 0;

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

    // ── Lang: exacta (es/gl/ca/eu/en, sin ambigüedad) ──
    if (parsed.lang?.length) {
      conditions.push(`m.lang_norm IN (${parsed.lang.map(() => '?').join(',')})`);
      args.push(...parsed.lang);
    }

    // ── Tags: LIKE sobre el string JSON de medios.tags ──
    // Los tags viven en medios.tags como '["politica","deportes"]'.
    // LIKE es suficiente para el volumen actual; si algún día crece,
    // migrar a tabla medios_tags(dominio, tag_norm).
    if (parsed.tags?.length) {
      for (const tg of parsed.tags) {
        conditions.push(`m.tags LIKE '%' || ? || '%' ESCAPE '\\'`);
        args.push(escapeLike(tg));
      }
    }

    const where = conditions.length ? conditions.join(' AND ') : '1=1';

    let orderBy;
    if (parsed.order === 'relevancia' && ftsQ) {
      orderBy = 'ORDER BY bm25(noticias_fts) ASC';
    } else if (parsed.order === 'antiguos') {
      orderBy = 'ORDER BY n.fecha_pub ASC, f.enlace ASC';
    } else {
      orderBy = 'ORDER BY n.fecha_pub DESC, f.enlace ASC';
    }

    const sql = `
      SELECT f.titular, f.enlace, f.dominio,
             n.fecha_pub, n.fecha_est, n.fuente, f.fecha_dia
      FROM noticias_fts f
      JOIN noticias n ON n.enlace = f.enlace
      ${needsJoin ? 'JOIN medios m ON m.dominio = f.dominio' : ''}
      WHERE ${where}
      ${orderBy}
      LIMIT ? OFFSET ?
    `;

    const countSql = `
      SELECT COUNT(*) AS n
      FROM noticias_fts f
      JOIN noticias n ON n.enlace = f.enlace
      ${needsJoin ? 'JOIN medios m ON m.dominio = f.dominio' : ''}
      WHERE ${where}
    `;

    const itemArgs = [...args, parsed.limit, parsed.offset];
    const countArgs = args;

    const payload = {
      requests: [
        { type: 'execute', stmt: { sql,       args: itemArgs.map(toArg)  } },
        { type: 'execute', stmt: { sql: countSql, args: countArgs.map(toArg) } },
        { type: 'close' }
      ]
    };

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
    const total = parseScalar(results[1]) ?? rows.length;

    const items = rows.map(r => ({
      t: r[0] || '',
      u: shortenUrl(r[1], r[2]),
      d: r[2] || '',
      p: r[3] || '',
      e: r[4] || '',
      f: r[5] || 'TURSO',
    }));

    return { items, total };
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