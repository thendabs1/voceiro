// Código de sincronización y cifrado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generarCodigo, limpiarCodigo, formatearCodigo, derivar, cifrar, descifrar, LARGO_CODIGO,
} from '../../shared/sync/cripto.js';

test('el código: 25 caracteres en grupos de 5, sin letras confusas', () => {
  const c = generarCodigo();
  assert.match(c, /^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){4}$/);
  assert.notEqual(generarCodigo(), c);
  assert.equal(limpiarCodigo(c).length, LARGO_CODIGO);
});

test('limpiarCodigo admite minúsculas, espacios y I/L/O; rechaza lo que no vale', () => {
  const c = limpiarCodigo(generarCodigo());
  assert.equal(limpiarCodigo(formatearCodigo(c).toLowerCase().replace(/-/g, ' ')), c);
  assert.equal(limpiarCodigo('ILO' + c.slice(3)), '110' + c.slice(3));
  assert.equal(limpiarCodigo('corto'), null);
  assert.equal(limpiarCodigo('U'.repeat(LARGO_CODIGO)), null);
});

test('derivar: siempre lo mismo para el mismo código, distinto para otro', async () => {
  const c = generarCodigo();
  const a = await derivar(c), b = await derivar(c.toLowerCase());
  assert.match(a.id, /^[0-9a-f]{32}$/);
  assert.match(a.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(a.id, b.id);
  assert.equal(a.token, b.token);
  const otro = await derivar(generarCodigo());
  assert.notEqual(otro.id, a.id);
  await assert.rejects(derivar('no vale'));
});

test('cifrar y descifrar; con otra clave o tocado, no se abre', async () => {
  const { clave } = await derivar(generarCodigo());
  const doc = { v: 1, pendientes: [{ url: 'https://a.es/1', title: 'Ñandú y acentos' }] };
  const bloque = await cifrar(clave, doc);
  assert.deepEqual(await descifrar(clave, bloque), doc);
  const { clave: otra } = await derivar(generarCodigo());
  await assert.rejects(descifrar(otra, bloque));
  const tocado = bloque.slice();
  tocado[tocado.length - 1] ^= 1;
  await assert.rejects(descifrar(clave, tocado));
});
