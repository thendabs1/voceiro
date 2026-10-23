// Almacén de la sincronización sobre el mismo D1 que el worker de CF, por
// la API HTTP de Cloudflare: desde Deno no hay binding. Es la misma base,
// así que no hay dos copias que reconciliar (ver workers/cf-sync/schema.sql).
//
// Los BLOB no viajan en JSON: se suben en hexadecimal con unhex(?) y se leen
// con hex(datos). D1 admite parámetros de hasta 2 MB; un bloque de 512 KB
// ocupa 1 MB en hexadecimal.

const API = 'https://api.cloudflare.com/client/v4/accounts';
const TIMEOUT_MS = 10000;

function aHex(datos){
  let s = '';
  for (const b of datos) s += b.toString(16).padStart(2, '0');
  return s;
}
function deHex(hex){
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

export function almacenD1Http({ cuenta, base, token, fetch: pedirFetch = globalThis.fetch }){
  const url = `${API}/${cuenta}/d1/database/${base}/query`;

  // Una sentencia; devuelve { results, meta } como el binding.
  async function consultar(sql, params = []){
    const r = await pedirFetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    let cuerpo = null;
    try { cuerpo = await r.json(); } catch(e){}
    const res = cuerpo && Array.isArray(cuerpo.result) ? cuerpo.result[0] : null;
    if (!r.ok || !cuerpo || !cuerpo.success || !res || res.success === false){
      const error = cuerpo && cuerpo.errors && cuerpo.errors[0];
      throw new Error(`D1 HTTP ${r.status}: ${(error && error.message) || 'sin respuesta'}`.slice(0, 200));
    }
    return { results: res.results || [], meta: res.meta || {} };
  }
  async function primera(sql, params){
    return (await consultar(sql, params)).results[0] || null;
  }

  return {
    async leer(id){
      const f = await primera(
        'SELECT id, token_hash, version, hex(datos) AS datos, creado, actualizado, accedido FROM sync WHERE id = ?',
        [id]);
      if (f) f.datos = deHex(f.datos);
      else return primera('SELECT id, token_hash, 1 AS revocado FROM revocados WHERE id = ?', [id]);
      return f;
    },

    async tocar(id, ahora){
      await consultar('UPDATE sync SET accedido = ? WHERE id = ?', [ahora, id]);
    },

    // La vista y sus triggers comprueban límites y escriben todo atómicamente.
    async crear({ id, token_hash, datos, ahora, ip, dia, maxAltas, maxFilas }){
      const sql = 'INSERT INTO sync_crear (id, token_hash, datos, ahora, ip, dia, max_altas, max_filas) ' +
        'VALUES (?, ?, unhex(?), ?, ?, ?, ?, ?)';
      try {
        await consultar(sql, [id, token_hash, aHex(datos), ahora, ip, dia, maxAltas, maxFilas]);
        return 'creado';
      } catch (e) {
        const motivo = String(e.message).match(/\bsync_(altas|lleno|existe|revocado)\b/);
        if (motivo) return motivo[1];
        throw e;
      }
    },

    // Solo si la versión sigue siendo la de base: si no, otro escribió antes.
    async actualizar({ id, token_hash, version, datos, ahora }){
      const { meta } = await consultar(
        'UPDATE sync SET datos = unhex(?), version = version + 1, actualizado = ?, accedido = ? ' +
        'WHERE id = ? AND version = ? AND token_hash = ?',
        [aHex(datos), ahora, ahora, id, version, token_hash]);
      return meta.changes === 1;
    },

    async borrar(id, tokenHash){
      await consultar('INSERT OR IGNORE INTO revocados (id, token_hash) ' +
        'SELECT id, token_hash FROM sync WHERE id = ? AND token_hash = ?', [id, tokenHash]);
    },

    // La limpieza diaria (borrarInactivos, borrarAltasAntes) la hace el cron de CF.
  };
}
