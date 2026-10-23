// Servicio de sincronización (workers/cf-sync), con los adaptadores y SQLite local.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  limpiar, ORIGEN, MAX_BYTES, INTERVALO_MIN_MS, ALTAS_POR_IP_DIA, CADUCIDAD_MS, sha256hex,
} from '../../workers/comun/sync.js';

import { atender, d1Local } from './soporte.mjs';
function almacenLocal(){
  const { cf, filas } = d1Local();
  return { ...cf, filas };
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
  const alm = almacenLocal();
  let r = await atender(pedir('OPTIONS'), alm, T0);
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGEN);
  r = await atender(pedir('GET', { ruta: 'v1/salud' }), alm, T0);
  assert.equal(r.status, 200);
  r = await atender(pedir('GET', { origen: 'https://otra.web' }), alm, T0);
  assert.equal(r.status, 403);
  // El lector pide desde el gestor de userscripts o su extensión: sin CORS.
  for (const origen of ['moz-extension://1234-abcd', 'chrome-extension://abcdefgh']){
    r = await atender(pedir('GET', { origen }), alm, T0);
    assert.equal(r.status, 404);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), null);
  }
  r = await atender(pedir('GET', { origen: 'https://moz-extension.otra.web' }), alm, T0);
  assert.equal(r.status, 403);
});

test('sin token válido no hay nada', async () => {
  const alm = almacenLocal();
  assert.equal((await atender(pedir('GET', { token: '' }), alm, T0)).status, 401);
  assert.equal((await atender(pedir('GET', { token: 'corto' }), alm, T0)).status, 401);
  assert.equal((await atender(pedir('GET', { ruta: 'v1/s/xyz' }), alm, T0)).status, 404);
});

test('crear, leer y actualizar con versión', async () => {
  const alm = almacenLocal();
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
  const alm = almacenLocal();
  await atender(pedir('PUT', { base: 0, cuerpo: new Uint8Array([1]) }), alm, T0);
  const otro = 'U'.repeat(43);
  assert.equal((await atender(pedir('GET', { token: otro }), alm, T0)).status, 403);
  assert.equal((await atender(pedir('PUT', { token: otro, base: 1, cuerpo: new Uint8Array([2]) }), alm, T0 + 5000)).status, 403);
  assert.equal((await atender(pedir('DELETE', { token: otro }), alm, T0)).status, 403);
  assert.equal(alm.filas.size, 1);
});

test('tamaño, If-Match y borrado', async () => {
  const alm = almacenLocal();
  assert.equal((await atender(pedir('PUT', { base: 0, cuerpo: new Uint8Array(MAX_BYTES + 1) }), alm, T0)).status, 413);
  assert.equal((await atender(pedir('PUT', { cuerpo: new Uint8Array([1]) }), alm, T0)).status, 428);
  await atender(pedir('PUT', { base: 0, cuerpo: new Uint8Array([1]) }), alm, T0);
  assert.equal((await atender(pedir('DELETE'), alm, T0)).status, 204);
  assert.equal((await atender(pedir('GET'), alm, T0)).status, 410);
});

test('altas por IP y día limitadas', async () => {
  const alm = almacenLocal();
  for (let i = 0; i < ALTAS_POR_IP_DIA; i++){
    const id = i.toString(16).padStart(32, '0');
    assert.equal((await atender(pedir('PUT', { id, base: 0, cuerpo: new Uint8Array([1]) }), alm, T0)).status, 200);
  }
  const otra = 'f'.repeat(32);
  assert.equal((await atender(pedir('PUT', { id: otra, base: 0, cuerpo: new Uint8Array([1]) }), alm, T0)).status, 429);
  assert.equal((await atender(pedir('PUT', { id: otra, base: 0, cuerpo: new Uint8Array([1]), ip: '5.6.7.8' }), alm, T0)).status, 200);
});

test('la limpieza borra lo que lleva un año sin usarse', async () => {
  const alm = almacenLocal();
  await atender(pedir('PUT', { base: 0, cuerpo: new Uint8Array([1]) }), alm, T0);
  await limpiar(alm, T0 + CADUCIDAD_MS - 1000);
  assert.equal(alm.filas.size, 1);
  await limpiar(alm, T0 + CADUCIDAD_MS + 1000);
  assert.equal(alm.filas.size, 0);
});
