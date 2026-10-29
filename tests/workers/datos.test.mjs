// El reparto de código conserva R2 por binding en CF y S3 firmado en Deno.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import cf from '../../workers/cf-datos/src/index.js';
import deno from '../../workers/deno-datos/src/index.js';

function entornoDeno(t) {
  const anterior = Object.getOwnPropertyDescriptor(globalThis, 'Deno');
  const env = { R2_ACCOUNT_ID: 'cuenta', R2_ACCESS_KEY_ID: 'acceso',
    R2_SECRET_ACCESS_KEY: 'secreto-prueba', R2_BUCKET: 'datos' };
  Object.defineProperty(globalThis, 'Deno', { configurable: true, value: { env: { get: k => env[k] } } });
  t.after(() => {
    if (anterior) Object.defineProperty(globalThis, 'Deno', anterior);
    else delete globalThis.Deno;
  });
}

test('la política de caché coincide al servir datos por CF o por Deno', async t => {
  entornoDeno(t);
  t.mock.method(Date, 'now', () => Date.parse('2026-10-23T12:00:00Z'));
  t.mock.method(globalThis, 'fetch', async () => new Response('{}', { headers: { ETag: '"hash"' } }));
  const bucket = { get: async () => ({ body: '{}', httpEtag: '"hash"' }) };
  for (const [nombre, cache] of [
    ['manifest.json', 'public, max-age=60'],
    ['inventario.json', 'public, max-age=60'],
    ['calendario.json', 'public, max-age=60'],
    ['portada-0123456789.json', 'public, max-age=60'],
    ['d-ejemplo.test-2026-10-23.json', 'public, max-age=60'],
    ['d-ejemplo.test-2026-10-10.json', 'public, max-age=86400'],
    ['2026-10-23-0123456789.json', 'public, max-age=31536000, immutable'],
    ['2026-10-23-g-galicia-0123456789.json', 'public, max-age=31536000, immutable'],
  ]) {
    const request = new Request(`https://datos.test/${nombre}`);
    const a = await cf.fetch(request, { BUCKET: bucket });
    const b = await deno.fetch(request);
    for (const r of [a, b]) {
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('Cache-Control'), cache, nombre);
      assert.equal(r.headers.get('Access-Control-Allow-Origin'), '*');
      assert.equal(await r.text(), '{}');
    }
  }
});

test('la revalidación conserva los ETags y el transporte propio de cada plataforma', async t => {
  entornoDeno(t);
  let recibido;
  const request = new Request('https://datos.test/manifest.json', { headers: { 'If-None-Match': 'W/"hash"' } });
  const a = await cf.fetch(request, { BUCKET: {
    async get(key, opciones) {
      assert.equal(key, 'manifest.json');
      assert.deepEqual(opciones, { onlyIf: { etagDoesNotMatch: 'hash' } });
      return { httpEtag: '"hash"' };
    },
  } });
  t.mock.method(globalThis, 'fetch', async (url, opciones) => {
    recibido = { url, opciones };
    return new Response(null, { status: 304, headers: { ETag: '"hash"' } });
  });
  const b = await deno.fetch(request);
  assert.equal(recibido.url, 'https://cuenta.r2.cloudflarestorage.com/datos/manifest.json');
  assert.equal(recibido.opciones.headers['If-None-Match'], '"hash"');
  assert.match(recibido.opciones.headers.Authorization, /^AWS4-HMAC-SHA256 /);
  for (const r of [a, b]) {
    assert.equal(r.status, 304);
    assert.equal(r.body, null);
    assert.equal(r.headers.get('Cache-Control'), 'public, max-age=60');
  }
  assert.equal(b.headers.get('ETag'), 'W/"hash"');
});

test('Deno conserva gzip y HEAD sin depender del worker de Cloudflare', async t => {
  entornoDeno(t);
  const metodos = [];
  t.mock.method(globalThis, 'fetch', async (url, opciones) => {
    assert.equal(new URL(url).hostname, 'cuenta.r2.cloudflarestorage.com');
    metodos.push(opciones.method);
    return new Response(opciones.method === 'HEAD' ? null : '{"noticias":[]}', { headers: { ETag: '"hash"' } });
  });
  const r = await deno.fetch(new Request('https://datos.test/manifest.json', { headers: { 'Accept-Encoding': 'gzip' } }));
  assert.equal(r.headers.get('Content-Encoding'), 'gzip');
  const texto = await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text();
  assert.equal(texto, '{"noticias":[]}');
  const head = await deno.fetch(new Request('https://datos.test/manifest.json', { method: 'HEAD' }));
  assert.equal(head.body, null);
  assert.deepEqual(metodos, ['GET', 'HEAD']);
});

test('Deno no firma rutas que salen del bucket configurado', async t => {
  entornoDeno(t);
  const pedidas = [];
  t.mock.method(globalThis, 'fetch', async url => {
    pedidas.push(new URL(url).pathname);
    return new Response('{}');
  });
  for (const ruta of ['/..%2Fprivado%2Fnucleo%2Fv1%2Findice.json', '/a/..%2F..%2Fprivado%2Fx.json',
                      '/.%2F..%2Fprivado%2Fx.json', '/%E0%A4%A']) {
    assert.equal((await deno.fetch(new Request('https://datos.test' + ruta))).status, 404, ruta);
  }
  assert.deepEqual(pedidas, []);
  assert.equal((await deno.fetch(new Request('https://datos.test/dias/2026-10-29.json'))).status, 200);
  assert.deepEqual(pedidas, ['/datos/dias/2026-10-29.json']);
});
