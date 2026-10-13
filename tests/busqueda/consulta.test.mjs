// node --test 'tests/**/*.test.mjs'
// Identidad (regla 5), orden (reglas 2, 8, 27), clave de búsqueda (caso 31),
// y que lo que se envía al worker significa lo mismo que el filtro local.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { parseQuery, buildFtsQuery } from '../../shared/parser.js';
import { interpretarConsulta, paraArchivo, paraPrensa } from '../../shared/busqueda/consulta.js';
import { urlCanonica, crearDeduplicador, crearIndiceNombres } from '../../shared/busqueda/identidad.js';
import { comparador } from '../../shared/busqueda/orden.js';

const CATALOGO = {
  'elpais.com':        { n: 'El País', g: 'Nacional', t: 'diario', l: 'es', tags: [] },
  'lavozdegalicia.es': { n: 'La Voz de Galicia', g: 'Regional · Galicia', t: 'diario', l: 'es', tags: [] },
  'praza.gal':         { n: 'Praza', g: 'Regional · Galicia', t: 'digital', l: 'gl', tags: [] },
};
const A = Date.parse('2026-10-12T22:30:00Z');

test('5 · URL canónica: sin rastreo, sin www, sin barra final, http = https', () => {
  assert.equal(
    urlCanonica('https://www.elpais.com/espana/2026-10-12/x.html/?utm_source=tw&id=3#c'),
    'elpais.com/espana/2026-10-12/x.html?id=3');
  assert.equal(urlCanonica('/espana/x.html', 'elpais.com'), urlCanonica('http://elpais.com/espana/x.html'));
  assert.equal(urlCanonica('https://news.google.com/rss/articles/CBMi...'), '');   // redirección
});

test('5 · deduplicar: URL, medio + titular, o solo titular si el medio es desconocido', () => {
  const dd = crearDeduplicador();
  const local = { id: 'local' };
  assert.equal(dd.añadir(local, { url: '/a.html', dominio: 'elpais.com', titular: 'Sánchez anuncia elecciones' }), null);
  // Mismo artículo desde Turso con otra forma de la URL.
  assert.equal(dd.añadir({}, { url: 'https://www.elpais.com/a.html?utm_medium=rss', dominio: 'elpais.com', titular: 'x' }), local);
  // Google News: URL de redirección y medio no resuelto → por titular.
  assert.equal(dd.añadir({}, { url: 'https://news.google.com/rss/articles/X', dominio: '', titular: 'Sánchez anuncia elecciones' }), local);
  // Mismo titular en OTRO medio conocido: es otra noticia (agruparlas es cosa de la vista).
  assert.equal(dd.añadir({ id: 'otro' }, { url: '/b.html', dominio: 'lavozdegalicia.es', titular: 'Sánchez anuncia elecciones' }), null);
});

test('5 · nombre de fuente de Google News → dominio del catálogo', () => {
  const dominioDe = crearIndiceNombres(CATALOGO);
  assert.equal(dominioDe('El País'), 'elpais.com');
  assert.equal(dominioDe('LA VOZ DE GALICIA'), 'lavozdegalicia.es');
  assert.equal(dominioDe('Medio Inventado'), '');
});

test('2 · 27 · 32 · orden por fecha, sin fecha al final, antiguos invierte', () => {
  const items = [
    { titular: 'b', ts: 2 }, { titular: 'sin', ts: NaN }, { titular: 'c', ts: 3 }, { titular: 'a', ts: 1 },
  ];
  assert.deepEqual([...items].sort(comparador('recientes')).map(x => x.titular), ['c', 'b', 'a', 'sin']);
  assert.deepEqual([...items].sort(comparador('antiguos')).map(x => x.titular), ['a', 'b', 'c', 'sin']);
  assert.equal(interpretarConsulta('sanchez orden:antiguos').orden, 'antiguos');
});

test('31 · cada búsqueda tiene su clave; un espacio o el paso del tiempo no la cambian', () => {
  const k = (q, t = A) => interpretarConsulta(q, { catalogo: CATALOGO, ahora: t }).clave;
  assert.notEqual(k('sanchez'), k('feijoo'));
  assert.equal(k('sanchez'), k('sanchez '));
  assert.equal(k('Sánchez'), k('sanchez'));
  assert.equal(k('sanchez desde:3h'), k('sanchez desde:3h', A + 60e3));
});

test('predicado combinado: texto + medios + fechas', () => {
  const c = interpretarConsulta('eleccion grupo:galicia desde:hoy', { catalogo: CATALOGO, ahora: A });
  const ok = { dominio: 'praza.gal', titular: 'Eleccións en Galicia', ts: A - 60e3 };
  assert.ok(c.pasa(ok));                                    // «Eleccións» (gallego) empieza por «eleccion»
  assert.ok(c.pasa({ ...ok, titular: 'Elecciones en Galicia' }));
  assert.ok(!c.pasa({ ...ok, titular: 'Votaciones en Galicia' }));
  assert.ok(!c.pasa({ ...ok, titular: 'Elecciones en Galicia', dominio: 'elpais.com' }));
  assert.ok(!c.pasa({ ...ok, titular: 'Elecciones en Galicia', ts: A - 3 * 3600e3 }));  // ayer en Madrid
});

test('21 · medio desconocido: consulta imposible, no se pide nada fuera', () => {
  const c = interpretarConsulta('medio:noexiste sanchez', { catalogo: CATALOGO, ahora: A });
  assert.ok(c.imposible);
  assert.ok(!interpretarConsulta('sanchez', { catalogo: CATALOGO, ahora: A }).imposible);
});

test('paraArchivo: tras pasar por el parser y buildFtsQuery del worker, FTS5 da lo mismo que el filtro local', () => {
  const TIT = [
    'Pedro Sánchez anuncia elecciones', 'El sanchismo responde', 'San Salvador de Poio celebra',
    'Salvador Illa visita Poio y San Sebastián', 'Nuevo repunte de covid-19', 'El covid 19 vuelve',
    'EE.UU. sube los aranceles', 'Incendio en Vigo', 'Incendio forestal en Ourense',
  ];
  const db = new DatabaseSync(':memory:');
  db.exec("CREATE VIRTUAL TABLE t USING fts5(titular, tokenize='unicode61 remove_diacritics 2')");
  const ins = db.prepare('INSERT INTO t(rowid, titular) VALUES (?, ?)');
  TIT.forEach((x, i) => ins.run(i + 1, x));
  for (const q of ['sanch', 'san salvador poio', '"san salvador"', 'covid-19', 'EE.UU aranceles', 'incendio -forestal']) {
    const c = interpretarConsulta(q, { catalogo: CATALOGO, ahora: A });
    const enviado = paraArchivo(c);
    const fts = buildFtsQuery(parseQuery(enviado).titulo);       // lo que hace el worker hoy
    const remoto = db.prepare('SELECT titular FROM t WHERE t MATCH ? ORDER BY rowid').all(fts).map(r => r.titular);
    // El worker no tiene NOT: lo que devuelve se filtra después con c.pasa.
    const remotoFiltrado = remoto.filter(x => c.pasa({ dominio: 'elpais.com', titular: x, ts: A }));
    const local = TIT.filter(x => c.pasa({ dominio: 'elpais.com', titular: x, ts: A }));
    assert.deepEqual(remotoFiltrado, local, `${q} → ${enviado} → ${fts}`);
  }
});

test('paraArchivo / paraPrensa: medios como dominios exactos, fechas absolutas de Madrid', () => {
  const c = interpretarConsulta('sanchez grupo:galicia desde:hoy', { catalogo: CATALOGO, ahora: A });
  assert.equal(paraArchivo(c), 'sanchez* web:lavozdegalicia.es web:praza.gal desde:2026-10-13');
  assert.equal(paraPrensa(c), 'sanchez web:lavozdegalicia.es web:praza.gal desde:2026-10-13');
  const p = parseQuery(paraArchivo(c));
  assert.deepEqual(p.dominios.sort(), ['lavozdegalicia.es', 'praza.gal']);
  assert.equal(p.desde, '2026-10-13');
  assert.equal(paraPrensa(interpretarConsulta('incendio -forestal')), 'incendio -forestal');
});
