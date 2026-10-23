// D1 local: los dos adaptadores reales ejecutan el mismo esquema en SQLite.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { almacenD1 } from '../../workers/cf-sync/src/almacen-d1.js';
import { almacenD1Http } from '../../workers/deno-sync/src/almacen-d1-http.js';
import { atender as atenderReal } from '../../workers/comun/sync.js';
export const SECRETO = 'ab'.repeat(32);
export const esquema = readFileSync(new URL('../../workers/cf-sync/schema.sql', import.meta.url), 'utf8');
export const migracion = readFileSync(new URL('../../workers/cf-sync/migrations/0001_seguridad_sync.sql', import.meta.url), 'utf8');
export function atender(request, almacen, ahora, ip = request.headers.get('CF-Connecting-IP') || '192.0.2.1', secreto = SECRETO){
  return atenderReal(request, almacen, ahora, ip, secreto);
}
export function d1Local(){
  const db = new DatabaseSync(':memory:');
  db.exec(esquema + migracion);
  const consultas = [];
  const ejecutar = (sql, params = []) => {
    consultas.push(sql);
    const st = db.prepare(sql);
    const valores = params.map(p => p instanceof ArrayBuffer ? new Uint8Array(p) : p);
    if (/^\s*SELECT/i.test(sql)) return { results: st.all(...valores), meta: { changes: 0 } };
    return { results: [], meta: { changes: Number(st.run(...valores).changes) } };
  };
  const binding = { prepare(sql){
    return { bind(...params){
      return { async first(){ return ejecutar(sql, params).results[0] || null; },
        async run(){ return ejecutar(sql, params); } };
    }, async run(){ return ejecutar(sql); } };
  } };
  const fetch = async (url, opciones) => {
    if (url !== 'https://api.cloudflare.com/client/v4/accounts/cuenta/d1/database/base/query' ||
        opciones.headers.Authorization !== 'Bearer secreto') throw new Error('Credenciales o URL incorrectas');
    const { sql, params } = JSON.parse(opciones.body);
    try { return Response.json({ success: true, result: [{ success: true, ...ejecutar(sql, params) }] }); }
    catch (e){ return Response.json({ success: false, errors: [{ message: e.message }] }, { status: 400 }); }
  };
  const cf = almacenD1(binding);
  const http = almacenD1Http({ cuenta: 'cuenta', base: 'base', token: 'secreto', fetch });
  const filas = { get size(){ return db.prepare('SELECT COUNT(*) AS n FROM sync').get().n; },
    get(id){ return db.prepare('SELECT * FROM sync WHERE id = ?').get(id); } };
  return { db, cf, http, binding, filas, consultas };
}
