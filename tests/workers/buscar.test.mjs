// Contrato HTTP de los dos despliegues: mismos resultados, transportes locales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import cf from '../../workers/cf-buscar/src/index.js';
import deno from '../../workers/deno-buscar/src/index.js';

function globalTemporal(t, nombre, valor) {
  const anterior = Object.getOwnPropertyDescriptor(globalThis, nombre);
  Object.defineProperty(globalThis, nombre, { value: valor, configurable: true, writable: true });
  t.after(() => {
    if (anterior) Object.defineProperty(globalThis, nombre, anterior);
    else delete globalThis[nombre];
  });
}

function preparar(t, plataforma, responder) {
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
  const env = {};
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

// Respuesta del relay de Google News.
function relay(items) {
  return new Response(JSON.stringify({ status: 'ok', items }));
}

const noticia = {
  title: 'Noticia por relay - Ejemplo', link: 'https://www.ejemplo.test/a',
  source: 'Ejemplo', sourceUrl: 'https://ejemplo.test', pubDate: 'Fri, 23 Oct 2026 10:00:00 GMT',
};

// La consulta que llegó a Google News a través del relay.
function consultaGoogle(llamada) {
  return new URL(new URL(llamada.url).searchParams.get('url'));
}

test('CF y Deno piden lo mismo a Google News por el relay y responden igual', async t => {
  const respuestas = [];
  const google = [];
  for (const plataforma of ['cf', 'deno']) await t.test(plataforma, async t => {
    const s = preparar(t, plataforma, url => {
      const r = new URL(url);
      assert.match(r.hostname, /\.deno\.net$/);
      assert.match(r.searchParams.get('url'), /^https:\/\/news\.google\.com\/rss\/search/);
      return relay([noticia]);
    });
    const params = new URLSearchParams({
      raw: 'incendio web:ejemplo.test desde:2026-10-20 hasta:2026-10-23',
      fuentes: 'gnews', lang: 'gl', region: 'ES',
    });
    const r = await s.pedir(`/buscar?${params}`);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), '*');
    assert.equal(r.headers.get('Cache-Control'), 'public, max-age=60, s-maxage=300');
    const { _ms, ...datos } = await r.json();
    respuestas.push(datos);
    google.push(consultaGoogle(s.llamadas[0]).href);
    assert.equal(datos.total, 1);
    assert.equal(datos.next_offset, null);
    assert.equal(datos.items[0].t, 'Noticia por relay');
    assert.equal(datos.items[0].d, 'ejemplo.test');
    assert.equal(datos.items[0]._src, 'gnews');
  });
  assert.deepEqual(respuestas[0], respuestas[1]);
  assert.equal(google[0], google[1]);
  const q = new URL(google[0]);
  assert.equal(q.searchParams.get('q'), 'incendio site:ejemplo.test after:2026-10-20 before:2026-10-23');
  assert.equal(q.searchParams.get('hl'), 'gl');
});

test('deduplicación y caché se conservan en las dos plataformas', async t => {
  for (const plataforma of ['cf', 'deno']) await t.test(plataforma, async t => {
    const repetida = { ...noticia, link: 'https://ejemplo.test/a?utm_source=rss' };
    const s = preparar(t, plataforma, () => relay([noticia, repetida]));
    const ruta = '/buscar?raw=incendio&fuentes=gnews';
    const primera = await s.pedir(ruta);
    const datos = await primera.json();
    assert.equal(datos.items.length, 1);
    const segunda = await s.pedir(ruta);
    assert.equal(segunda.headers.get('X-Cache'), 'HIT');
    assert.deepEqual(await segunda.json(), datos);
    assert.equal(s.llamadas.length, 1);
    assert.equal(s.escrituras.length, 1);
  });
});

test('fuentes repetidas y URLs equivalentes comparten una sola consulta y caché', async t => {
  for (const plataforma of ['cf', 'deno']) await t.test(plataforma, async t => {
    const s = preparar(t, plataforma, () => relay([noticia]));
    const primera = await s.pedir('/buscar?raw=Incendio&fuentes=gnews,gnews&ruido=1');
    assert.deepEqual((await primera.json()).fuentes, ['gnews']);
    // limit y offset no cambian lo que da Google News: misma caché.
    const segunda = await s.pedir('/buscar?q=%20incendio%20&fuentes=gnews&limit=50&order=recientes&offset=40&ruido=2');
    assert.equal(segunda.headers.get('X-Cache'), 'HIT');
    assert.equal(s.llamadas.length, 1);
    // Las diferencias que afectan al resultado sí necesitan otra consulta.
    await s.pedir('/buscar?raw=incendio&fuentes=gnews&order=antiguos');
    await s.pedir('/buscar?raw=incendio%20desde:2026-10-20&fuentes=gnews');
    await s.pedir('/buscar?raw=incendio%20web:ejemplo.test&fuentes=gnews');
    await s.pedir('/buscar?raw=incendio&fuentes=gnews&lang=gl');
    assert.equal(s.llamadas.length, 5);
  });
});

test('sin fuentes, o con el archivo de los clientes antiguos, no se consulta nada', async t => {
  for (const plataforma of ['cf', 'deno']) await t.test(plataforma, async t => {
    const s = preparar(t, plataforma, () => { throw new Error('no debía llamarse a ninguna fuente'); });
    for (const ruta of ['/buscar?raw=incendio', '/buscar?raw=incendio&fuentes=turso',
                        '/buscar?raw=incendio%20fuentes:turso']) {
      const datos = await (await s.pedir(ruta)).json();
      assert.deepEqual(datos, { total: 0, items: [], next_offset: null, fuentes: [] });
    }
    assert.equal(s.llamadas.length, 0);
    assert.equal(s.escrituras.length, 0);
  });
});

test('un fallo del relay se indica y no se guarda en caché', async t => {
  for (const plataforma of ['cf', 'deno']) await t.test(plataforma, async t => {
    const s = preparar(t, plataforma, () => new Response('bloqueado', { status: 503 }));
    const r = await s.pedir('/buscar?raw=incendio&fuentes=gnews');
    const datos = await r.json();
    assert.deepEqual(datos.fuentes, []);
    assert.match(datos._errores.gnews, /503/);
    assert.equal(r.headers.get('Cache-Control'), 'no-store, max-age=0');
    assert.equal(s.escrituras.length, 0);
  });
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
