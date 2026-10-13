// Servicio de sincronización (workers/cf-sync), con un almacén en memoria.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  atender, limpiar, ORIGEN, MAX_BYTES, INTERVALO_MIN_MS, ALTAS_POR_IP_DIA, CADUCIDAD_MS, sha256hex,
} from '../../workers/cf-sync/src/sync.js';

function almacenEnMemoria(){
  const filas = new Map();
  const altas = new Map();
  return {
    filas,
    async leer(id){ return filas.get(id) || null; },
    async tocar(id, ahora){ filas.get(id).accedido = ahora; },
    async crear({ id, token_hash, datos, ahora }){
      if (filas.has(id)) return false;
      filas.set(id, { id, token_hash, version: 1, datos: [...datos], creado: ahora, actualizado: ahora, accedido: ahora });
      return true;
    },
    async actualizar({ id, token_hash, version, datos, ahora }){
      const f = filas.get(id);
      if (!f || f.version !== version || f.token_hash !== token_hash) return false;
      Object.assign(f, { datos: [...datos], version: version + 1, actualizado: ahora, accedido: ahora });
      return true;
    },
    async borrar(id){ filas.delete(id); },
    async contar(){ return filas.size; },
    async altasHoy(ip, dia){ return altas.get(ip + dia) || 0; },
    async sumarAlta(ip, dia){ altas.set(ip + dia, (altas.get(ip + dia) || 0) + 1); },
    async borrarInactivos(limite){ for (const [id, f] of filas) if (f.accedido < limite) filas.delete(id); },
    async borrarAltasAntes(){},
  };
}

const ID = 'a'.repeat(32);
const TOKEN = 'T'.repeat(43);
const T0 = Date.parse('2026-10-14T10:00:00Z');

function pedir(metodo, { id = ID, token = TOKEN, base, cuerpo, origen = ORIGEN, ip = '1.2.3.4', ruta } = {}){
  const headers = { 'CF-Connecting-IP': ip };
  if (origen) headers.Origin = origen;
  if (token) headers.Authorization = 'Bearer ' + token;
  if (base !== undefined) headers['If-Match'] = String(base);
  if (cuerpo) headers['Content-Type'] = 'application/octet-stream';
  return new Request('https://sync.ejemplo/' + (ruta || 'v1/s/' + id), { method: metodo, headers, body: cuerpo });
}

test('preflight y salud, con CORS solo para Voceiro', async () => {
  const alm = almacenEnMemoria();
  let r = await atender(pedir('OPTIONS'), alm, T0);
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGEN);
  r = await atender(pedir('GET', { ruta: 'v1/salud' }), alm, T0);
  assert.equal(r.status, 200);
  r = await atender(pedir('GET', { origen: 'https://otra.web' }), alm, T0);
  assert.equal(r.status, 403);
});

test('sin token válido no hay nada', async () => {
  const alm = almacenEnMemoria();
  assert.equal((await atender(pedir('GET', { token: '' }), alm, T0)).status, 401);
  assert.equal((await atender(pedir('GET', { token: 'corto' }), alm, T0)).status, 401);
  assert.equal((await atender(pedir('GET', { ruta: 'v1/s/xyz' }), alm, T0)).status, 404);
});

test('crear, leer y actualizar con versión', async () => {
  const alm = almacenEnMemoria();
  assert.equal((await atender(pedir('GET'), alm, T0)).status, 404);

  let r = await atender(pedir('PUT', { base: 0, cuerpo: new Uint8Array([1, 2, 3]) }), alm, T0);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { version: 1 });
  assert.equal(alm.filas.get(ID).token_hash, await sha256hex(TOKEN));

  r = await atender(pedir('GET'), alm, T0);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('X-Version'), '1');
  assert.deepEqual([...new Uint8Array(await r.arrayBuffer())], [1, 2, 3]);

  // Otro escribió antes (versión vieja) → 409 con la vigente.
  r = await atender(pedir('PUT', { base: 0, cuerpo: new Uint8Array([9]) }), alm, T0 + 5000);
  assert.equal(r.status, 409);
  assert.deepEqual(await r.json(), { version: 1 });

  // Demasiado seguido → 429; luego sí.
  r = await atender(pedir('PUT', { base: 1, cuerpo: new Uint8Array([4]) }), alm, T0 + 500);
  assert.equal(r.status, 429);
  r = await atender(pedir('PUT', { base: 1, cuerpo: new Uint8Array([4]) }), alm, T0 + INTERVALO_MIN_MS);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { version: 2 });
});

test('con otro token no se lee, ni se pisa, ni se borra', async () => {
  const alm = almacenEnMemoria();
  await atender(pedir('PUT', { base: 0, cuerpo: new Uint8Array([1]) }), alm, T0);
  const otro = 'U'.repeat(43);
  assert.equal((await atender(pedir('GET', { token: otro }), alm, T0)).status, 403);
  assert.equal((await atender(pedir('PUT', { token: otro, base: 1, cuerpo: new Uint8Array([2]) }), alm, T0 + 5000)).status, 403);
  assert.equal((await atender(pedir('DELETE', { token: otro }), alm, T0)).status, 403);
  assert.equal(alm.filas.size, 1);
});

test('tamaño, If-Match y borrado', async () => {
  const alm = almacenEnMemoria();
  assert.equal((await atender(pedir('PUT', { base: 0, cuerpo: new Uint8Array(MAX_BYTES + 1) }), alm, T0)).status, 413);
  assert.equal((await atender(pedir('PUT', { cuerpo: new Uint8Array([1]) }), alm, T0)).status, 428);
  await atender(pedir('PUT', { base: 0, cuerpo: new Uint8Array([1]) }), alm, T0);
  assert.equal((await atender(pedir('DELETE'), alm, T0)).status, 204);
  assert.equal((await atender(pedir('GET'), alm, T0)).status, 404);
});

test('altas por IP y día limitadas', async () => {
  const alm = almacenEnMemoria();
  for (let i = 0; i < ALTAS_POR_IP_DIA; i++){
    const id = i.toString(16).padStart(32, '0');
    assert.equal((await atender(pedir('PUT', { id, base: 0, cuerpo: new Uint8Array([1]) }), alm, T0)).status, 200);
  }
  const otra = 'f'.repeat(32);
  assert.equal((await atender(pedir('PUT', { id: otra, base: 0, cuerpo: new Uint8Array([1]) }), alm, T0)).status, 429);
  assert.equal((await atender(pedir('PUT', { id: otra, base: 0, cuerpo: new Uint8Array([1]), ip: '5.6.7.8' }), alm, T0)).status, 200);
});

test('la limpieza borra lo que lleva un año sin usarse', async () => {
  const alm = almacenEnMemoria();
  await atender(pedir('PUT', { base: 0, cuerpo: new Uint8Array([1]) }), alm, T0);
  await limpiar(alm, T0 + CADUCIDAD_MS - 1000);
  assert.equal(alm.filas.size, 1);
  await limpiar(alm, T0 + CADUCIDAD_MS + 1000);
  assert.equal(alm.filas.size, 0);
});
