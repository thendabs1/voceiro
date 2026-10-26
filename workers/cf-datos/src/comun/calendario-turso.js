// Generado desde workers/comun/calendario-turso.js por scripts/sync-workers.mjs. No editar.
// Solo SELECT preparados por calendario.js. Token de solo lectura separado.
// Protocolo: https://docs.turso.tech/sdk/http/reference
export async function consultarTurso(env, sentencias, fetchImpl = fetch) {
  const url = new URL(env.CALENDARIO_TURSO_URL.replace(/^libsql:\/\//, 'https://'));
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('URL Turso inválida');
  const operaciones = [{ sql: 'BEGIN', args: [] }, ...sentencias, { sql: 'COMMIT', args: [] }];
  const pasos = operaciones.map((s, i) => ({ stmt: { sql: s.sql, args: s.args.map(v =>
    typeof v === 'number' ? { type: 'integer', value: String(v) } : { type: 'text', value: v }) },
    ...(i ? { condition: { type: 'ok', step: i - 1 } } : {}) }));
  // Cloudflare no admite redirect 'error'; con 'manual' un 3xx no es ok y se rechaza abajo.
  const r = await fetchImpl(url.origin + '/v2/pipeline', { method: 'POST', redirect: 'manual',
    signal: AbortSignal.timeout(5000), headers: { Authorization: 'Bearer ' + env.CALENDARIO_TURSO_TOKEN_LECTURA,
      'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ type: 'batch', batch: { steps: pasos } }, { type: 'close' }] }) });
  if (!r.ok) throw new Error('Turso no disponible');
  // Acotar bytes antes de decodificar; no publicar errores ni credenciales remotas.
  const lector = r.body.getReader();
  const trozos = []; let cantidad = 0;
  try {
    while (true) {
      const { done, value } = await lector.read(); if (done) break;
      cantidad += value.byteLength;
      if (cantidad > 2_000_000) throw new Error('Respuesta demasiado grande');
      trozos.push(value);
    }
  } finally { await lector.cancel(); }
  const bytes = new Uint8Array(cantidad); let offset = 0;
  for (const t of trozos) { bytes.set(t, offset); offset += t.length; }
  const dato = JSON.parse(new TextDecoder().decode(bytes));
  const rs = dato.results;
  if (rs?.length !== 2 || rs[0].type !== 'ok' || rs[0].response.type !== 'batch'
      || rs[1].type !== 'ok' || rs[1].response.type !== 'close') throw new Error('Respuesta Turso incompatible');
  const lote = rs[0].response.result;
  if (lote.step_results?.length !== pasos.length || lote.step_errors?.length !== pasos.length
      || lote.step_errors.some(Boolean) || lote.step_results.some(s => !s)) throw new Error('Consulta Turso incompleta');
  return lote.step_results.slice(1, -1).map(s => s.rows.map(f => Object.fromEntries(s.cols.map((col, i) => {
    const v = f[i];
    return [col.name, v.type === 'null' ? null : ['integer', 'float'].includes(v.type) ? Number(v.value) : v.value];
  }))));
}
