// Ejecuta la SQL del adaptador contra SQLite FTS5, sin consumir cuota remota.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { crearTurso } from '../../workers/comun/turso.js';
import { parseQuery, buildFtsQuery } from '../../shared/parser.js';

function preparar(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`
    CREATE TABLE noticias (
      enlace TEXT PRIMARY KEY, dominio TEXT, titular TEXT,
      fecha_pub TEXT, fecha_est TEXT, fuente TEXT, fecha_dia TEXT
    ) WITHOUT ROWID;
    CREATE VIRTUAL TABLE noticias_fts USING fts5(titular, enlace UNINDEXED);
    CREATE TABLE medios (dominio TEXT PRIMARY KEY, grupo_norm TEXT);
    INSERT INTO medios VALUES ('ejemplo.test', 'galicia'), ('otro.test', 'otro');
  `);
  const insertar = db.prepare('INSERT INTO noticias VALUES (?, ?, ?, ?, ?, ?, ?)');
  const indexar = db.prepare('INSERT INTO noticias_fts(titular, enlace) VALUES (?, ?)');
  for (let i = 1; i <= 6; i++) {
    const enlace = `https://${i % 2 ? 'ejemplo' : 'otro'}.test/${i}`;
    const titular = i === 1 ? 'Incendio incendio incendio' : `Incendio forestal ${i}`;
    const dia = `2026-10-${String(i).padStart(2, '0')}`;
    insertar.run(enlace, i % 2 ? 'ejemplo.test' : 'otro.test', titular, `${dia}T10:00:00Z`, '', 'RSS', dia);
    indexar.run(titular, enlace);
  }
  const consultas = [];
  t.mock.method(globalThis, 'fetch', async (url, opciones) => {
    const peticiones = JSON.parse(opciones.body).requests.filter(r => r.type === 'execute');
    assert.equal(peticiones.length, 1, 'no hay una segunda consulta para contar');
    const { sql, args } = peticiones[0].stmt;
    const valores = args.map(a => a.type === 'integer' ? Number(a.value) : a.value);
    consultas.push({ sql, valores });
    const rows = db.prepare(sql).all(...valores).map(r => Object.values(r).map(value => ({ value })));
    return new Response(JSON.stringify({ results: [{ type: 'ok', response: {
      type: 'execute', result: { rows },
    } }] }));
  });
  return {
    db, consultas,
    buscar(raw) {
      return crearTurso(buildFtsQuery).search(parseQuery(raw), {
        WORKER_TURSO_URL: 'https://turso.test', WORKER_TURSO_TOKEN: 'simulado',
      });
    },
  };
}

test('el archivo pagina por fecha sin contar y detecta la última página llena', async t => {
  const s = preparar(t);
  const primera = await s.buscar('incendio limit:2');
  assert.deepEqual(primera.items.map(i => i.u), ['/6', '/5']);
  assert.equal(primera.hayMas, true);
  assert.equal(primera.total, null);
  const segunda = await s.buscar('incendio limit:2 offset:2');
  assert.deepEqual(segunda.items.map(i => i.u), ['/4', '/3']);
  const ultima = await s.buscar('incendio limit:2 offset:4');
  assert.deepEqual(ultima.items.map(i => i.u), ['/2', '/1']);
  assert.equal(ultima.hayMas, false);
  assert.equal(ultima.total, 6);
  const fuera = await s.buscar('incendio limit:2 offset:100');
  assert.equal(fuera.hayMas, false);
  assert.equal(fuera.total, null);
  const vacia = await s.buscar('inexistente');
  assert.equal(vacia.total, 0);
});

test('fechas, dominios y catálogo filtran antes de paginar en los dos sentidos', async t => {
  const s = preparar(t);
  const recientes = await s.buscar('incendio grupo:galicia desde:2026-10-02 hasta:2026-10-06 limit:1');
  assert.deepEqual(recientes.items.map(i => i.u), ['/5']);
  assert.equal(recientes.hayMas, true);
  const antiguos = await s.buscar('incendio web:ejemplo.test desde:2026-10-02 order:antiguos limit:2');
  assert.deepEqual(antiguos.items.map(i => i.u), ['/3', '/5']);
  assert.equal(antiguos.hayMas, false);
  assert.equal(antiguos.total, 2);
});

test('rank conserva bm25 y permite ordenar dentro de FTS sin árbol temporal', async t => {
  const s = preparar(t);
  // Una configuración persistente distinta no debe cambiar nuestra relevancia.
  s.db.exec("INSERT INTO noticias_fts(noticias_fts, rank) VALUES('rank', 'bm25(0.0)')");
  const esperado = s.db.prepare(`
    SELECT n.enlace FROM noticias_fts f JOIN noticias n ON n.enlace = f.enlace
    WHERE noticias_fts MATCH 'incendio' ORDER BY bm25(noticias_fts) LIMIT 2
  `).all().map(r => new URL(r.enlace).pathname);
  const respuesta = await s.buscar('incendio order:relevancia limit:2');
  assert.deepEqual(respuesta.items.map(i => i.u), esperado);
  const { sql, valores } = s.consultas.at(-1);
  const plan = s.db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...valores);
  assert.ok(!plan.some(r => /TEMP B-TREE/.test(r.detail)), JSON.stringify(plan));
  const filtrada = await s.buscar('incendio order:relevancia web:ejemplo.test desde:2026-10-02 limit:1');
  assert.equal(filtrada.items.length, 1);
  assert.equal(filtrada.items[0].d, 'ejemplo.test');
  assert.equal(filtrada.hayMas, true);
});
