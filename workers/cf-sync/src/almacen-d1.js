// Almacén de la sincronización sobre D1 (ver schema.sql).

// D1 guarda un ArrayBuffer como BLOB; al leer puede devolver ArrayBuffer o
// un array de números: quien lo usa lo pasa por new Uint8Array().
function aBuffer(datos){
  return datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength);
}

export function almacenD1(db){
  return {
    async leer(id){
      const fila = await db.prepare(
        'SELECT id, token_hash, version, datos, creado, actualizado, accedido FROM sync WHERE id = ?'
      ).bind(id).first();
      return fila || db.prepare('SELECT id, token_hash, 1 AS revocado FROM revocados WHERE id = ?').bind(id).first();
    },

    async tocar(id, ahora){
      await db.prepare('UPDATE sync SET accedido = ? WHERE id = ?').bind(ahora, id).run();
    },

    // La vista y sus triggers comprueban límites y escriben todo atómicamente.
    async crear({ id, token_hash, datos, ahora, ip, dia, maxAltas, maxFilas }){
      const sql = 'INSERT INTO sync_crear (id, token_hash, datos, ahora, ip, dia, max_altas, max_filas) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
      try {
        await db.prepare(sql).bind(id, token_hash, aBuffer(datos), ahora, ip, dia, maxAltas, maxFilas).run();
        return 'creado';
      } catch (e) {
        const motivo = String(e.message).match(/\bsync_(altas|lleno|existe|revocado)\b/);
        if (motivo) return motivo[1];
        throw e;
      }
    },

    // Solo si la versión sigue siendo la de base: si no, otro escribió antes.
    async actualizar({ id, token_hash, version, datos, ahora }){
      const r = await db.prepare(
        'UPDATE sync SET datos = ?, version = version + 1, actualizado = ?, accedido = ? ' +
        'WHERE id = ? AND version = ? AND token_hash = ?'
      ).bind(aBuffer(datos), ahora, ahora, id, version, token_hash).run();
      return !!(r.meta && r.meta.changes === 1);
    },

    // El servicio ya autenticó la fila. Mantener la revocación incluso si
    // la limpieza la eliminó entre esa lectura y esta sentencia.
    async borrar(id, tokenHash){
      await db.prepare('INSERT OR IGNORE INTO revocados (id, token_hash) ' +
        'SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM sync WHERE id = ? AND token_hash <> ?)').bind(id, tokenHash, id, tokenHash).run();
    },

    // El trigger de DELETE mantiene el contador también durante la limpieza.
    async borrarInactivos(limite){
      await db.prepare('DELETE FROM sync WHERE accedido < ?').bind(limite).run();
    },

    async borrarAltasAntes(dia){
      await db.prepare('DELETE FROM altas WHERE dia < ?').bind(dia).run();
    },
  };
}
