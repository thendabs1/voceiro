// Respaldo de la sincronización en Deno: comun/sync.js sobre el almacén D1
// por la API HTTP (workers/deno-sync), contra un SQLite con el esquema real
// (workers/cf-sync/schema.sql) que contesta como la API de Cloudflare.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { almacenD1Http } from '../../workers/deno-sync/src/almacen-d1-http.js';
import { atender, ORIGEN, ALTAS_POR_IP_DIA } from '../../workers/comun/sync.js';
import { crearCliente } from '../../shared/sync/cliente.js';
import { generarCodigo } from '../../shared/sync/cripto.js';

const ESQUEMA = readFileSync(new URL('../../workers/cf-sync/schema.sql', import.meta.url), 'utf8');

// La API de D1: POST …/query {sql, params} → {success, result: [{results, meta}]}.
function d1Falso(){
  const db = new DatabaseSync(':memory:');
  db.exec(ESQUEMA);
  const consultas = [];
  const fetch = async (url, opciones) => {
    assert.match(url, /\/accounts\/cuenta\/d1\/database\/base\/query$/);
    assert.equal(opciones.headers.Authorization, 'Bearer secreto');
    const { sql, params } = JSON.parse(opciones.body);
    consultas.push(sql);
    try {
      const st = db.prepare(sql);
      const lee = /^\s*SELECT/i.test(sql);
      const results = lee ? st.all(...params).map(f => ({ ...f })) : [];
      const meta = lee ? { changes: 0 } : { changes: Number(st.run(...params).changes) };
      return Response.json({ success: true, errors: [], result: [{ success: true, results, meta }] });
    } catch (e) {
      return Response.json({ success: false, errors: [{ message: e.message }], result: [] }, { status: 400 });
    }
  };
  const almacen = almacenD1Http({ cuenta: 'cuenta', base: 'base', token: 'secreto', fetch });
  return { db, almacen, consultas };
}

const ID = 'b'.repeat(32);
const TOKEN = 'K'.repeat(43);
const T0 = Date.parse('2026-10-23T10:00:00Z');

function pedir(metodo, { base, cuerpo, cabeceras = {} } = {}){
  const headers = { Origin: ORIGEN, Authorization: 'Bearer ' + TOKEN, ...cabeceras };
  if (base !== undefined) headers['If-Match'] = String(base);
  return new Request('https://sync.ejemplo/v1/s/' + ID, { method: metodo, headers, body: cuerpo });
}

test('crear, leer, actualizar y borrar guardan los bytes tal cual', async () => {
  const { db, almacen } = d1Falso();
  const bloque = new Uint8Array(4096).map((_, i) => (i * 37) % 256);   // todos los bytes, ceros incluidos

  let r = await atender(pedir('PUT', { base: 0, cuerpo: bloque }), almacen, T0, '1.2.3.4');
  assert.equal(r.status, 200);
  assert.equal(db.prepare("SELECT valor FROM estado WHERE clave = 'filas'").get().valor, 1);
  assert.equal(db.prepare('SELECT typeof(datos) AS t FROM sync').get().t, 'blob');

  r = await atender(pedir('GET'), almacen, T0 + 1000, '1.2.3.4');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('X-Version'), '1');
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), bloque);

  const otro = new Uint8Array([0, 1, 2, 255]);
  r = await atender(pedir('PUT', { base: 1, cuerpo: otro }), almacen, T0 + 5000, '1.2.3.4');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('X-Version'), '2');
  // Con la versión vieja, otro escribió antes.
  r = await atender(pedir('PUT', { base: 1, cuerpo: otro }), almacen, T0 + 9000, '1.2.3.4');
  assert.equal(r.status, 409);
  r = await atender(pedir('GET'), almacen, T0 + 10000, '1.2.3.4');
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), otro);

  r = await atender(pedir('DELETE'), almacen, T0 + 11000, '1.2.3.4');
  assert.equal(r.status, 204);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sync').get().n, 0);
  assert.equal(db.prepare("SELECT valor FROM estado WHERE clave = 'filas'").get().valor, 0);
});

test('el límite de altas cuenta la IP que da la plataforma, no la cabecera', async () => {
  const { almacen } = d1Falso();
  const alta = (i, cabeceras) => new Request(`https://sync.ejemplo/v1/s/${String(i).padStart(32, 'c')}`, {
    method: 'PUT', body: new Uint8Array([1]),
    headers: { Origin: ORIGEN, Authorization: 'Bearer ' + TOKEN, 'If-Match': '0', ...cabeceras },
  });
  for (let i = 0; i < ALTAS_POR_IP_DIA; i++){
    // Cambiar CF-Connecting-IP no sirve para saltarse el límite en Deno.
    const r = await atender(alta(i, { 'CF-Connecting-IP': `10.0.0.${i}` }), almacen, T0, '5.6.7.8');
    assert.equal(r.status, 200);
  }
  const r = await atender(alta(99, { 'CF-Connecting-IP': '10.0.0.99' }), almacen, T0, '5.6.7.8');
  assert.equal(r.status, 429);
});

test('un error de la API de D1 no se toma por un dato vacío', async () => {
  const fetch = async () => Response.json(
    { success: false, errors: [{ message: 'Authentication error' }], result: [] }, { status: 403 });
  const almacen = almacenD1Http({ cuenta: 'c', base: 'b', token: 't', fetch });
  await assert.rejects(almacen.leer(ID), /D1 HTTP 403: Authentication error/);
});

test('dos dispositivos, uno por CF y otro por el respaldo, acaban con lo mismo', async () => {
  const { almacen } = d1Falso();
  let reloj = T0;
  const servidor = async (url, opciones = {}) => {
    reloj += 3000;
    return atender(new Request(url, opciones), almacen, reloj, '1.2.3.4');
  };
  const bloqueado = async (url, opciones) => {
    if (url.startsWith('https://cf.test')) throw new TypeError('bloqueado');
    return servidor(url, opciones);
  };
  const T = Date.parse('2026-10-23T09:00:00Z');
  const pend = url => ({ url, title: url, date: T, read: false, actualizado: T });
  const codigo = generarCodigo();
  const servidores = ['https://cf.test', 'https://deno.test'];
  const enCasa = crearCliente({ servidores, fetch: servidor });
  const enElBar = crearCliente({ servidores, fetch: bloqueado });

  await enCasa.sincronizar(codigo, { pendientes: [pend('https://a.es/1')] });
  const { documento } = await enElBar.sincronizar(codigo, { pendientes: [pend('https://b.es/2')] });
  assert.deepEqual(documento.pendientes.map(p => p.url).sort(), ['https://a.es/1', 'https://b.es/2']);
  const final = await enCasa.sincronizar(codigo, { pendientes: [pend('https://a.es/1')] });
  assert.deepEqual(final.documento.pendientes.map(p => p.url).sort(), ['https://a.es/1', 'https://b.es/2']);
});
