// Contrato HTTP de los dos despliegues: mismos resultados, transportes locales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import cf from '../../workers/cf-buscar/src/index.js';
import deno from '../../workers/deno-buscar/src/index.js';
import { MAX_OFFSET } from '../../workers/comun/buscar.js';

function globalTemporal(t, nombre, valor) {
  const anterior = Object.getOwnPropertyDescriptor(globalThis, nombre);
  Object.defineProperty(globalThis, nombre, { value: valor, configurable: true, writable: true });
  t.after(() => {
    if (anterior) Object.defineProperty(globalThis, nombre, anterior);
    else delete globalThis[nombre];
  });
}

function preparar(t, plataforma, responder, credenciales = true) {
  const entradas = new Map();
  const escrituras = [];
  const llamadas = [];
  const key = r => typeof r === 'string' ? r : r.url;
  const cache = {
    async match(r) { return entradas.get(key(r))?.clone(); },
    async put(r, respuesta) {
      escrituras.push(key(r));
      entradas.set(key(r), respuesta.clone());
    },
  };
  globalTemporal(t, 'caches', { default: cache, open: async () => cache });
  const env = credenciales ? {
    WORKER_TURSO_URL: `https://${plataforma}-turso.test`,
    WORKER_TURSO_TOKEN: `${plataforma}-prueba`,
    TURSO_PAUSADO: '',
  } : {};
  globalTemporal(t, 'Deno', { env: { get: k => env[k] } });
  t.mock.method(globalThis, 'fetch', async (url, opciones) => {
    llamadas.push({ url: String(url), ...opciones });
    return responder(String(url), opciones);
  });
  const pendientes = [];
  const worker = plataforma === 'cf' ? cf : deno;
  return {
    llamadas, escrituras,
    async pedir(query) {
      const r = await worker.fetch(new Request(`https://${plataforma}.test${query}`), env,
        { waitUntil: p => pendientes.push(p) });
      await Promise.all(pendientes);
      return r;
    },
  };
}

function pipeline(filas, total = filas.length) {
  const resultado = rows => ({ type: 'ok', response: { type: 'execute', result: {
    rows: rows.map(f => f.map(value => ({ type: 'text', value: String(value) }))),
  } } });
  return new Response(JSON.stringify({ results: [resultado(filas), resultado([[total]])] }));
}

const fila = ['Titular', 'https://www.ejemplo.test/a', 'ejemplo.test', '2026-10-23T10:00:00Z', '', 'RSS'];

test('CF y Deno conservan filtros, consulta SQL y credenciales independientes', async t => {
  const consultas = [];
  const respuestas = [];
  for (const plataforma of ['cf', 'deno']) await t.test(plataforma, async t => {
    const s = preparar(t, plataforma, (url, opciones) => {
      assert.equal(url, `https://${plataforma}-turso.test/v2/pipeline`);
      assert.equal(opciones.headers.Authorization, `Bearer ${plataforma}-prueba`);
      consultas.push(JSON.parse(opciones.body));
      return pipeline([fila], 9);
    });
    const params = new URLSearchParams({
      raw: 'incendio grupo:galicia tipo:diario medio:elpais.com desde:2026-10-20 hasta:2026-10-23',
      fuentes: 'turso', lang: 'gl', region: 'ES', order: 'relevancia', offset: '4', limit: '7',
    });
    const r = await s.pedir(`/buscar?${params}`);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), '*');
    const { _ms, ...datos } = await r.json();
    respuestas.push(datos);
    assert.equal(datos.total, 9);
    assert.equal(datos.items[0].u, '/a');
    assert.equal(datos.items[0]._src, 'turso');
  });
  assert.deepEqual(consultas[0], consultas[1]);
  assert.deepEqual(respuestas[0], respuestas[1]);
  const sql = consultas[0].requests[0].stmt;
  assert.match(sql.sql, /noticias_fts MATCH/);
  assert.match(sql.sql, /bm25/);
  assert.ok(sql.args.some(a => a.value === '2026-10-20'));
  assert.deepEqual(sql.args.slice(-2), [
    { type: 'integer', value: '7' }, { type: 'integer', value: '4' },
  ]);
});

test('paginación, deduplicación y caché se conservan en las dos plataformas', async t => {
  for (const plataforma of ['cf', 'deno']) await t.test(plataforma, async t => {
    const repetida = [...fila];
    repetida[1] = 'https://ejemplo.test/a?utm_source=rss';
    const s = preparar(t, plataforma, () => pipeline([fila, repetida], 12));
    const ruta = '/buscar?raw=incendio&fuentes=turso&limit=2&offset=4';
    const primera = await s.pedir(ruta);
    const datos = await primera.json();
    assert.equal(datos.items.length, 1);
    assert.equal(datos.total, 12);
    assert.equal(datos.next_offset, 6);
    assert.equal(primera.headers.get('Cache-Control'), 'public, max-age=60, s-maxage=300');
    const segunda = await s.pedir(ruta);
    assert.equal(segunda.headers.get('X-Cache'), 'HIT');
    assert.deepEqual(await segunda.json(), datos);
    assert.equal(s.llamadas.length, 1);
    assert.equal(s.escrituras.length, 1);
  });
});

test('un fallo de Turso conserva la prensa por relay y no guarda el error en caché', async t => {
  for (const plataforma of ['cf', 'deno']) await t.test(plataforma, async t => {
    const s = preparar(t, plataforma, url => {
      if (url.includes('/v2/pipeline')) return new Response('bloqueado', { status: 503 });
      const relay = new URL(url);
      assert.match(relay.hostname, /\.deno\.net$/);
      assert.match(relay.searchParams.get('url'), /^https:\/\/news\.google\.com\/rss\/search/);
      return new Response(JSON.stringify({ status: 'ok', items: [{
        title: 'Noticia por relay - Ejemplo', link: 'https://ejemplo.test/b',
        source: 'Ejemplo', sourceUrl: 'https://ejemplo.test',
      }] }));
    });
    const r = await s.pedir('/buscar?raw=incendio&fuentes=turso,gnews');
    const datos = await r.json();
    assert.deepEqual(datos.fuentes, ['gnews']);
    assert.equal(datos.items[0].t, 'Noticia por relay');
    assert.match(datos._errores.turso, /503/);
    assert.equal(r.headers.get('Cache-Control'), 'no-store, max-age=0');
    assert.equal(s.escrituras.length, 0);
    assert.equal(s.llamadas.length, 2);
  });
});

test('en Deno la falta de credenciales de Turso permite responder con la prensa', async t => {
  const s = preparar(t, 'deno', () => new Response(JSON.stringify({ status: 'ok', items: [] })), false);
  const datos = await (await s.pedir('/buscar?raw=incendio&fuentes=turso,gnews')).json();
  assert.deepEqual(datos.fuentes, ['gnews']);
  assert.match(datos._errores.turso, /Faltan WORKER_TURSO/);
  assert.equal(s.escrituras.length, 0);
});

test('preflight y parser no requieren credenciales; el tiempo sigue disponible solo en Deno', async t => {
  for (const worker of [cf, deno]) {
    const preflight = await worker.fetch(new Request('https://worker.test/buscar', { method: 'OPTIONS' }));
    assert.equal(preflight.status, 204);
    const parser = await worker.fetch(new Request('https://worker.test/parser.js'));
    assert.match(await parser.text(), /export function parseQuery/);
  }
  assert.equal((await cf.fetch(new Request('https://worker.test/tiempo?ine=invalido'))).status, 404);
  const r = await deno.fetch(new Request('https://worker.test/tiempo?ine=invalido'));
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { error: 'INE no válido' });
});

test('el archivo en pausa no llama a Turso y no se cachea', async t => {
  for (const plataforma of ['cf', 'deno']) await t.test(plataforma, async t => {
    const s = preparar(t, plataforma, () => { throw new Error('Turso no debía llamarse'); });
    const env = { WORKER_TURSO_URL: 'https://x.test', WORKER_TURSO_TOKEN: 'x', TURSO_PAUSADO: '1' };
    globalTemporal(t, 'Deno', { env: { get: k => env[k] } });
    const r = plataforma === 'cf'
      ? await cf.fetch(new Request('https://cf.test/buscar?raw=incendio&fuentes=turso'), env, { waitUntil() {} })
      : await s.pedir('/buscar?raw=incendio&fuentes=turso');
    const datos = await r.json();
    assert.match(datos._errores.turso, /archivo en pausa/);
    assert.equal(r.headers.get('Cache-Control'), 'no-store, max-age=0');
    assert.equal(s.llamadas.length, 0);
  });
});

test('en Deno el archivo está en pausa si el panel no dice otra cosa', async t => {
  const s = preparar(t, 'deno', () => { throw new Error('Turso no debía llamarse'); });
  const env = { WORKER_TURSO_URL: 'https://x.test', WORKER_TURSO_TOKEN: 'x' };
  globalTemporal(t, 'Deno', { env: { get: k => env[k] } });
  const datos = await (await s.pedir('/buscar?raw=incendio&fuentes=turso')).json();
  assert.match(datos._errores.turso, /archivo en pausa/);
  assert.equal(s.llamadas.length, 0);
});

test('más allá del tope de offset no se consulta el archivo ni se ofrece otra página', async t => {
  for (const plataforma of ['cf', 'deno']) await t.test(plataforma, async t => {
    const s = preparar(t, plataforma, () => pipeline([fila], 5000));
    const lejos = await (await s.pedir(`/buscar?raw=incendio&fuentes=turso&offset=${MAX_OFFSET + 1}`)).json();
    assert.deepEqual(lejos.items, []);
    assert.equal(lejos.next_offset, null);
    // El tope vale también para el operador offset: de la consulta.
    await s.pedir(`/buscar?fuentes=turso&raw=${encodeURIComponent(`incendio offset:${MAX_OFFSET + 50}`)}`);
    assert.equal(s.llamadas.length, 0);
    const ultima = await (await s.pedir(`/buscar?raw=incendio&fuentes=turso&limit=1&offset=${MAX_OFFSET}`)).json();
    assert.equal(ultima.items.length, 1);
    assert.equal(ultima.next_offset, null);
  });
});

test('el límite por IP frena las consultas a las fuentes, no las de caché', async t => {
  for (const plataforma of ['cf', 'deno']) await t.test(plataforma, async t => {
    const s = preparar(t, plataforma, () => new Response(JSON.stringify({ status: 'ok', items: [] })));
    const ip = plataforma === 'cf' ? '198.51.100.7' : '2001:db8:7::1';
    const pedir = (i, otra = ip) => {
      const req = new Request(`https://${plataforma}.test/buscar?fuentes=gnews&raw=consulta${i}`,
        { headers: plataforma === 'cf' ? { 'CF-Connecting-IP': otra } : {} });
      return plataforma === 'cf'
        ? cf.fetch(req, {}, { waitUntil() {} })
        : deno.fetch(req, { remoteAddr: { hostname: otra } });
    };
    for (let i = 0; i < 30; i++) assert.equal((await pedir(i)).status, 200);
    const frenada = await pedir(30);
    assert.equal(frenada.status, 429);
    assert.ok(Number(frenada.headers.get('Retry-After')) >= 1);
    assert.equal(frenada.headers.get('Access-Control-Allow-Origin'), '*');
    assert.equal(s.llamadas.length, 30);
    assert.equal((await pedir(0)).headers.get('X-Cache'), 'HIT');
    // Otra IP (en Deno, otro /64) tiene su propio cupo.
    assert.equal((await pedir(31, plataforma === 'cf' ? '198.51.100.8' : '2001:db8:8::1')).status, 200);
  });
});

test('el tiempo en Deno tiene su propio límite por IP', async t => {
  const pedir = () => deno.fetch(new Request('https://deno.test/tiempo?ine=invalido'),
    { remoteAddr: { hostname: '203.0.113.9' } });
  for (let i = 0; i < 30; i++) assert.equal((await pedir()).status, 400);
  const r = await pedir();
  assert.equal(r.status, 429);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), '*');
});

test('la prensa manda la clave del relay solo si está configurada', async t => {
  for (const plataforma of ['cf', 'deno']) await t.test(plataforma, async t => {
    const s = preparar(t, plataforma, () => new Response(JSON.stringify({ status: 'ok', items: [] })));
    const env = { RELAY_CLAVE: 'clave-relay' };
    globalTemporal(t, 'Deno', { env: { get: k => env[k] } });
    const ruta = `/buscar?fuentes=gnews&raw=clave${plataforma}`;
    if (plataforma === 'cf') await cf.fetch(new Request(`https://cf.test${ruta}`), env, { waitUntil() {} });
    else await s.pedir(ruta);
    assert.equal(s.llamadas[0].headers['X-Voceiro-Relay'], 'clave-relay');
    await s.pedir(`/buscar?fuentes=gnews&raw=sinclave${plataforma}`);
    assert.equal(s.llamadas[1].headers['X-Voceiro-Relay'], plataforma === 'cf' ? undefined : 'clave-relay');
  });
});
