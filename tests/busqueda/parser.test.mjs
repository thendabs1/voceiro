// node --test 'tests/**/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery } from '../../shared/parser.js';

test('7 · EE.UU es texto, no dominio', () => {
  const p = parseQuery('EE.UU aranceles');
  assert.deepEqual(p.dominios, []);
  assert.deepEqual(p.titulo, ['ee.uu', 'aranceles']);
});

test('una palabra con dominio conocido sí es dominio', () => {
  assert.deepEqual(parseQuery('elpais.com incendio').dominios, ['elpais.com']);
  assert.deepEqual(parseQuery('berria.eus').dominios, ['berria.eus']);
});

test('entre comillas nunca es dominio', () => {
  const p = parseQuery('"elpais.com"');
  assert.deepEqual(p.dominios, []);
  assert.deepEqual(p.titulo, ['elpais.com']);
});

test('32 · orden: es alias de order:', () => {
  assert.equal(parseQuery('sanchez orden:antiguos').order, 'antiguos');
  assert.deepEqual(parseQuery('sanchez orden:antiguos').titulo, ['sanchez']);
  assert.equal(parseQuery('x order:relevancia').order, 'relevancia');
});
