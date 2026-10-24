const TURSO_TIMEOUT_MS = 10000;

// buildFtsQuery viene del parser local de cada despliegue.
export function crearTurso(buildFtsQuery) {
  return {
    name: 'turso',
    cacheTTL: 300,

    async search(parsed, env) {
      // Pausa del archivo en el servidor (con el front sin pedirlo, como con
      // ARCHIVO_ACTIVO = false): la URL del worker es pública.
      if (env.TURSO_PAUSADO) throw new Error('archivo en pausa');
      const conditions = [];
      const args = [];

      const ftsQ = buildFtsQuery(parsed.titulo);
      // La navegación por medio/fecha se sirve de R2. También en la API,
      // exigir texto evita barrer el catálogo para un filtro poco frecuente.
      if (!ftsQ) return { items: [], total: 0, hayMas: false };
      conditions.push('noticias_fts MATCH ?');
      args.push(ftsQ);

      if (parsed.desde) { conditions.push('n.fecha_dia >= ?'); args.push(parsed.desde); }
      if (parsed.hasta) { conditions.push('n.fecha_dia <= ?'); args.push(parsed.hasta); }

      // ── Dominios: exacta ──
      if (parsed.dominios.length) {
        conditions.push(`n.dominio IN (${parsed.dominios.map(() => '?').join(',')})`);
        args.push(...parsed.dominios);
      }

      // La subconsulta resuelve el catálogo de medios una vez, sin añadir
      // otro JOIN a cada coincidencia del índice de texto.
      const mediosConds = [];
      const mediosArgs = [];
      // ── Filtros de facet: OR dentro del facet, AND entre facets ──
      // Ver shared/parser.js y la nota de semántica del frontend.
      if (parsed.grupos.length) {
        const ors = parsed.grupos.map(
          () => `grupo_norm LIKE '%' || ? || '%' ESCAPE '\\'`
        );
        mediosConds.push(`(${ors.join(' OR ')})`);
        mediosArgs.push(...parsed.grupos.map(escapeLike));
      }
      if (parsed.tipos.length) {
        const ors = parsed.tipos.map(
          () => `tipo_norm LIKE '%' || ? || '%' ESCAPE '\\'`
        );
        mediosConds.push(`(${ors.join(' OR ')})`);
        mediosArgs.push(...parsed.tipos.map(escapeLike));
      }
      if (parsed.lang?.length) {
        // IN = OR. Ya estaba bien.
        mediosConds.push(`lang_norm IN (${parsed.lang.map(() => '?').join(',')})`);
        mediosArgs.push(...parsed.lang);
      }
      if (parsed.tags?.length) {
        const ors = parsed.tags.map(
          () => `tags LIKE '%' || ? || '%' ESCAPE '\\'`
        );
        mediosConds.push(`(${ors.join(' OR ')})`);
        mediosArgs.push(...parsed.tags.map(escapeLike));
      }

      if (mediosConds.length) {
        conditions.push(
          `n.dominio IN (SELECT dominio FROM medios WHERE ${mediosConds.join(' AND ')})`
        );
        args.push(...mediosArgs);
      }

      // ── ORDER BY ──
      // Fecha + enlace dan un orden estable para las páginas. Con FTS, ordenar
      // por fecha aún puede examinar todas las coincidencias antes de LIMIT.
      const orderByItems = parsed.order === 'antiguos'
        ? 'ORDER BY n.fecha_dia ASC,  n.enlace ASC'
        : 'ORDER BY n.fecha_dia DESC, n.enlace ASC';

      // rank permite que FTS entregue las coincidencias ordenadas y corte en
      // LIMIT; ORDER BY bm25() obliga a SQLite a ordenarlas fuera de FTS.
      // Fijarlo por consulta conserva bm25() aunque la tabla tenga otro default.
      if (parsed.order === 'relevancia') conditions.push("f.rank MATCH 'bm25()'");
      const where = conditions.join(' AND ');
      const orderByFts = parsed.order === 'relevancia'
        ? 'ORDER BY f.rank ASC'
        : orderByItems;

      const sql = `
          SELECT n.titular, n.enlace, n.dominio,
                 n.fecha_pub, n.fecha_est, n.fuente, n.fecha_dia
          FROM noticias_fts f
          JOIN noticias n ON n.enlace = f.enlace
          WHERE ${where}
          ${orderByFts}
          LIMIT ? OFFSET ?
        `;

      // Una fila de más resuelve la paginación sin COUNT ni página vacía final.
      const itemArgs = [...args, parsed.limit + 1, parsed.offset];
      const requests = [
        { type: 'execute', stmt: { sql, args: itemArgs.map(toArg) } },
      ];
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
      const hayMas = rows.length > parsed.limit;
      // Solo conocemos el total al agotar una página; un offset fuera del
      // archivo tampoco permite deducirlo. El front pagina con next_offset.
      const total = hayMas || (!rows.length && parsed.offset > 0)
        ? null : parsed.offset + rows.length;

      const items = rows.slice(0, parsed.limit).map(r => ({
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
}

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
