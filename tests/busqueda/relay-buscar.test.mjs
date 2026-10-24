import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rssAJson } from '../../workers/deno-relay-buscar/src/rss.js';
import { gnews } from '../../workers/cf-buscar/src/sources/gnews.js';

// Item real de news.google.com/rss/search (descripción recortada), más uno con
// CDATA y entidades.
const XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><rss version="2.0"><channel>`
  + `<title>"vivienda" - Google News</title><link>https://news.google.com/search?q=vivienda&amp;hl=es</link>`
  + `<item><title>Piazza Maricarmen: la lucha por la vivienda prende en Roma - El Salto</title>`
  + `<link>https://news.google.com/rss/articles/CBMiiAFB?oc=5</link><guid isPermaLink="false">CBMiiAFB</guid>`
  + `<pubDate>Wed, 21 Oct 2026 04:00:00 GMT</pubDate><description>&lt;a href="x"&gt;…&lt;/a&gt;</description>`
  + `<source url="https://www.elsaltodiario.com">El Salto</source></item>`
  + `<item><title><![CDATA[Alquiler & "vivienda" - Diario Sur]]></title><link>https://news.google.com/rss/articles/B</link>`
  + `<pubDate>Tue, 20 Oct 2026 10:00:00 GMT</pubDate><source url="https://www.diariosur.es">Diario Sur &amp; Co</source></item>`
  + `</channel></rss>`;

test('relay: el RSS de Google sale con el formato del proxy y el dominio del medio', () => {
  const r = rssAJson(XML, 'https://news.google.com/rss/search?q=vivienda');
  assert.equal(r.status, 'ok');
  assert.equal(r.feed.title, '"vivienda" - Google News');
  assert.equal(r.feed.link, 'https://news.google.com/search?q=vivienda&hl=es');
  assert.deepEqual(r.items[0], {
    title: 'Piazza Maricarmen: la lucha por la vivienda prende en Roma - El Salto',
    link: 'https://news.google.com/rss/articles/CBMiiAFB?oc=5',
    pubDate: 'Wed, 21 Oct 2026 04:00:00 GMT',
    source: 'El Salto',
    sourceUrl: 'https://www.elsaltodiario.com',
    guid: 'CBMiiAFB',
  });
  assert.equal(r.items[1].title, 'Alquiler & "vivienda" - Diario Sur');
  assert.equal(r.items[1].source, 'Diario Sur & Co');
  assert.equal(r.items[1].guid, '');
});

test('relay: la página «Sorry» de Google es un error, no cero resultados', () => {
  const r = rssAJson('<html><body>Sorry... unusual traffic</body></html>');
  assert.equal(r.status, 'error');
});

async function buscarCon(items) {
  const original = globalThis.fetch;
  let pedida = '';
  globalThis.fetch = async (url) => {
    pedida = decodeURIComponent(String(url).split('?url=')[1]);
    return new Response(JSON.stringify({ status: 'ok', items }));
  };
  try {
    const r = await gnews.search({ titulo: ['vivienda'], dominios: [], lang: ['es'], region: 'GB' });
    return { r, pedida };
  } finally {
    globalThis.fetch = original;
  }
}

test('gnews: el dominio sale de sourceUrl y, sin él, del nombre', async () => {
  const { r, pedida } = await buscarCon([
    { title: 'Uno - El Salto', link: 'https://news.google.com/a', pubDate: 'Wed, 21 Oct 2026 04:00:00 GMT',
      source: 'El Salto', sourceUrl: 'https://www.elsaltodiario.com' },
    { title: 'Dos', link: 'https://news.google.com/b', source: 'El Salto' },
    { title: 'Tres', link: 'https://news.google.com/c', source: 'eldiario.es' },
  ]);
  assert.match(pedida, /&gl=GB&ceid=GB:es$/);
  assert.deepEqual(r.items.map(x => [x.t, x.d, x.f]), [
    ['Uno', 'elsaltodiario.com', 'El Salto'],
    ['Dos', 'news.google.com', 'El Salto'],
    ['Tres', 'eldiario.es', 'eldiario.es'],
  ]);
});

// La lógica es la de comun/gnews.js en los dos (sync-workers.mjs comprueba
// las copias); Deno la envuelve solo para leer RELAY_CLAVE de Deno.env.
test('gnews: CF y Deno usan el mismo adaptador común', () => {
  const leer = w => readFileSync(new URL(`../../workers/${w}/src/sources/gnews.js`, import.meta.url), 'utf8');
  for (const w of ['cf-buscar', 'deno-buscar']) assert.match(leer(w), /from '\.\.\/comun\/gnews\.js'/);
});
