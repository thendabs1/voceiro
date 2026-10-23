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
      return f;
    },

    async tocar(id, ahora){
      await consultar('UPDATE sync SET accedido = ? WHERE id = ?', [ahora, id]);
    },

    // false si ya existía (alta simultánea desde otro dispositivo).
    async crear({ id, token_hash, datos, ahora }){
      const { meta } = await consultar(
        'INSERT INTO sync (id, token_hash, version, datos, creado, actualizado, accedido) ' +
        'VALUES (?, ?, 1, unhex(?), ?, ?, ?) ON CONFLICT(id) DO NOTHING',
        [id, token_hash, aHex(datos), ahora, ahora, ahora]);
      if (meta.changes !== 1) return false;
      await consultar("UPDATE estado SET valor = valor + 1 WHERE clave = 'filas'");
      return true;
    },

    // Solo si la versión sigue siendo la de base: si no, otro escribió antes.
    async actualizar({ id, token_hash, version, datos, ahora }){
      const { meta } = await consultar(
        'UPDATE sync SET datos = unhex(?), version = version + 1, actualizado = ?, accedido = ? ' +
        'WHERE id = ? AND version = ? AND token_hash = ?',
        [aHex(datos), ahora, ahora, id, version, token_hash]);
      return meta.changes === 1;
    },

    async borrar(id){
      const { meta } = await consultar('DELETE FROM sync WHERE id = ?', [id]);
      if (meta.changes){
        await consultar("UPDATE estado SET valor = MAX(valor - ?, 0) WHERE clave = 'filas'", [meta.changes]);
      }
    },

    async contar(){
      const r = await primera("SELECT valor FROM estado WHERE clave = 'filas'");
      return r ? r.valor : 0;
    },

    async altasHoy(ip, dia){
      const r = await primera('SELECT n FROM altas WHERE ip = ? AND dia = ?', [ip, dia]);
      return r ? r.n : 0;
    },

    async sumarAlta(ip, dia){
      await consultar(
        'INSERT INTO altas (ip, dia, n) VALUES (?, ?, 1) ON CONFLICT(ip, dia) DO UPDATE SET n = n + 1',
        [ip, dia]);
    },
    // La limpieza diaria (borrarInactivos, borrarAltasAntes) la hace el cron de CF.
  };
}
