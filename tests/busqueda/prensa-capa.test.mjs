import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { interpretarConsulta } from '../../shared/busqueda/consulta.js';
import { palabrasDe } from '../../shared/busqueda/texto.js';

// La prensa entra en NOTICIAS como capa de la consulta y la filtra el mismo
// predicado que todo lo demás (_pasaVista). Funciones reales del frontal.
const CATALOGO = { 'elpais.com': { n: 'El País' }, 'abc.es': { n: 'ABC' } };
const A = Date.parse('2026-10-21T12:00:00Z');

for (const archivo of ['plantilla.html', 'public/index.html']) {
  const html = readFileSync(new URL(`../../${archivo}`, import.meta.url), 'utf8');
  const funcion = nombre => {
    const i = html.indexOf(`function ${nombre}(`);
    assert.ok(i >= 0, nombre);
    return html.slice(i, html.indexOf('\n}', i) + 2);
  };

  function crear() {
    const ctx = {
      NOTICIAS: [], _itemPorUrl: new Map(), _itemPorTitulo: new Map(),
      _urlsCargadas: new Set(), _titulosCargados: new Set(),
      PRENSA_ACTIVA: true, PRENSA_LANG: 'es', PRENSA_PAIS: 'ES',
      normalizeUrlForMatch: s => s, normalize: s => s.toLowerCase(), palabrasDe,
    };
    for (const f of ['_mergearItemsEnNoticias', '_claveUrl', '_pasaVista', '_pasaConsulta',
                     '_pasaExterno', '_soloDeConsulta', '_clavePrensa', '_ocultaPorLectura']) {
      runInNewContext(funcion(f), ctx);
    }
    // Lo que hace hidratarNoticias con los campos que mira el filtro.
    const meter = (items, capa, clave) => {
      const n = runInNewContext('_mergearItemsEnNoticias', ctx)(items, capa, clave);
      for (const x of ctx.NOTICIAS) {
        if (x.dominio === undefined) x.dominio = x.d;
        if (x.titular === undefined) x.titular = x.t;
        x._tsOrden = Date.parse(x.p);
      }
      return n;
    };
    const vista = (q) => {
      const consulta = interpretarConsulta(q, { catalogo: CATALOGO, ahora: A });
      const c = { consulta, clavePrensa: runInNewContext('_clavePrensa', ctx)(consulta), HIDE_MODE: 'off' };
      return ctx.NOTICIAS.filter(n => runInNewContext('_pasaVista', ctx)(n, c) === true).map(n => n.titular);
    };
    const clave = q => runInNewContext('_clavePrensa', ctx)(interpretarConsulta(q, { catalogo: CATALOGO, ahora: A }));
    return { ctx, meter, vista, clave };
  }
  const hace = h => new Date(A - h * 3600e3).toISOString();
  const propio = (t, d = 'elpais.com', h = 1) => ({ u: `https://${d}/${t}`, d, t, p: hace(h) });

  test(`${archivo}: lo de la prensa no exige las palabras en el titular, pero sí exclusiones, medio y fecha`, () => {
    const { meter, vista, clave } = crear();
    meter([propio('Arde una nave en Lugo')], 'r2', null);
    const respuesta = [
      { u: 'https://news.google.com/a', d: 'abc.es', t: 'Arde un almacén', p: hace(2) },
      { u: 'https://news.google.com/b', d: 'abc.es', t: 'Balance forestal del verano', p: hace(2) },
      { u: 'https://news.google.com/c', d: 'abc.es', t: 'Otro fuego', p: hace(30) },
    ];
    // Cada variante es otra consulta (otra clave): se le da la misma respuesta.
    const ver = q => { meter(respuesta, 'prensa', clave(q)); return vista(q); };
    const q = 'incendio -forestal';
    assert.deepEqual(ver(q), ['Arde un almacén', 'Otro fuego']);         // el propio no dice «incendio»
    assert.deepEqual(ver(`${q} web:elpais.com`), []);                    // otro medio
    assert.deepEqual(ver(`${q} desde:24h`), ['Arde un almacén']);         // 30 h: fuera de la ventana móvil
    assert.deepEqual(ver(`${q} desde:1d`), ['Arde un almacén', 'Otro fuego']);  // desde ayer a las 00:00
  });

  test(`${archivo}: la prensa de otra consulta, otro idioma o apagada no se ve`, () => {
    const { ctx, meter, vista, clave } = crear();
    meter([{ u: 'https://news.google.com/a', d: 'abc.es', t: 'Arde un almacén', p: hace(2) }], 'prensa', clave('incendio'));
    assert.deepEqual(vista('incendio'), ['Arde un almacén']);
    assert.deepEqual(vista('arde'), []);                                 // otra consulta
    ctx.PRENSA_LANG = 'gl';
    assert.deepEqual(vista('incendio'), []);                             // otra edición
    ctx.PRENSA_LANG = 'es';
    ctx.PRENSA_ACTIVA = false;
    assert.deepEqual(vista('incendio'), []);
  });

  test(`${archivo}: un propio que también trajo la prensa se ve por ella mientras está encendida`, () => {
    const { ctx, meter, vista, clave } = crear();
    meter([propio('Arde una nave en Lugo')], 'r2', null);
    meter([{ u: 'https://elpais.com/Arde una nave en Lugo', d: 'elpais.com', t: 'Arde una nave en Lugo', p: hace(1) }],
          'prensa', clave('incendio'));
    assert.equal(ctx.NOTICIAS.length, 1);
    assert.deepEqual(vista('incendio'), ['Arde una nave en Lugo']);
    ctx.PRENSA_ACTIVA = false;
    assert.deepEqual(vista('incendio'), []);                             // vuelve a la regla del titular
    assert.deepEqual(vista('arde'), ['Arde una nave en Lugo']);          // y sigue en el feed
  });

  test(`${archivo}: mismo titular en otro medio es otra noticia; con el medio sin resolver, se une`, () => {
    const { ctx, meter, clave } = crear();
    meter([propio('Muere el actor X')], 'r2', null);
    const k = clave('actor');
    assert.equal(meter([{ u: 'https://news.google.com/a', d: 'abc.es', t: 'Muere el actor X', p: hace(1) }], 'prensa', k), 1);
    assert.equal(meter([{ u: 'https://news.google.com/b', d: 'news.google.com', t: 'Muere el actor X', p: hace(1) }], 'prensa', k), 0);
    assert.equal(meter([{ u: 'https://news.google.com/c', d: 'elpais.com', t: 'Muere el actor X', p: hace(1) }], 'prensa', k), 0);
    assert.equal(ctx.NOTICIAS.length, 2);
    assert.ok(ctx.NOTICIAS[0]._prensaPara.has(k));                       // el propio queda marcado
  });
}
