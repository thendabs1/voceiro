// Almacén de la sincronización sobre D1 (ver schema.sql).

// D1 guarda un ArrayBuffer como BLOB; al leer puede devolver ArrayBuffer o
// un array de números: quien lo usa lo pasa por new Uint8Array().
function aBuffer(datos){
  return datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength);
}

export function almacenD1(db){
  return {
    async leer(id){
      return db.prepare(
        'SELECT id, token_hash, version, datos, creado, actualizado, accedido FROM sync WHERE id = ?'
      ).bind(id).first();
    },

    async tocar(id, ahora){
      await db.prepare('UPDATE sync SET accedido = ? WHERE id = ?').bind(ahora, id).run();
    },

    // false si ya existía (alta simultánea desde otro dispositivo).
    async crear({ id, token_hash, datos, ahora }){
      const r = await db.prepare(
        'INSERT INTO sync (id, token_hash, version, datos, creado, actualizado, accedido) ' +
        'VALUES (?, ?, 1, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING'
      ).bind(id, token_hash, aBuffer(datos), ahora, ahora, ahora).run();
      if (!r.meta || r.meta.changes !== 1) return false;
      await db.prepare("UPDATE estado SET valor = valor + 1 WHERE clave = 'filas'").run();
      return true;
    },

    // Solo si la versión sigue siendo la de base: si no, otro escribió antes.
    async actualizar({ id, token_hash, version, datos, ahora }){
      const r = await db.prepare(
        'UPDATE sync SET datos = ?, version = version + 1, actualizado = ?, accedido = ? ' +
        'WHERE id = ? AND version = ? AND token_hash = ?'
      ).bind(aBuffer(datos), ahora, ahora, id, version, token_hash).run();
      return !!(r.meta && r.meta.changes === 1);
    },

    async borrar(id){
      const r = await db.prepare('DELETE FROM sync WHERE id = ?').bind(id).run();
      if (r.meta && r.meta.changes){
        await db.prepare("UPDATE estado SET valor = MAX(valor - ?, 0) WHERE clave = 'filas'")
          .bind(r.meta.changes).run();
      }
    },

    async contar(){
      const r = await db.prepare("SELECT valor FROM estado WHERE clave = 'filas'").first();
      return r ? r.valor : 0;
    },

    async altasHoy(ip, dia){
      const r = await db.prepare('SELECT n FROM altas WHERE ip = ? AND dia = ?').bind(ip, dia).first();
      return r ? r.n : 0;
    },

    async sumarAlta(ip, dia){
      await db.prepare(
        'INSERT INTO altas (ip, dia, n) VALUES (?, ?, 1) ON CONFLICT(ip, dia) DO UPDATE SET n = n + 1'
      ).bind(ip, dia).run();
    },

    // Una vez al día: borra lo caducado y recuenta las filas.
    async borrarInactivos(limite){
      await db.prepare('DELETE FROM sync WHERE accedido < ?').bind(limite).run();
      await db.prepare("UPDATE estado SET valor = (SELECT COUNT(*) FROM sync) WHERE clave = 'filas'").run();
    },

    async borrarAltasAntes(dia){
      await db.prepare('DELETE FROM altas WHERE dia < ?').bind(dia).run();
    },
  };
}
