// Límite por IP en memoria (workers/comun/limite.js) y su clave: IPv4 tal
// cual, IPv6 por su /64.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearLimite, claveIp, respuesta429 } from '../../workers/comun/limite.js';

test('deja pasar hasta el máximo por ventana y dice cuánto esperar', () => {
  const limite = crearLimite({ max: 2, ventanaMs: 60e3 });
  assert.equal(limite('a', 0), 0);
  assert.equal(limite('a', 1000), 0);
  assert.equal(limite('a', 2000), 58);
  assert.equal(limite('b', 2000), 0, 'cada clave cuenta por su lado');
  assert.equal(limite('a', 59999), 1);
  assert.equal(limite('a', 60000), 0, 'la ventana nueva empieza de cero');
});

test('sin clave no limita: una IP desconocida compartida bloquearía a todos', () => {
  const limite = crearLimite({ max: 1, ventanaMs: 60e3 });
  for (let i = 0; i < 5; i++) assert.equal(limite('', i), 0);
});

test('no crece sin fin: con muchas claves se olvidan las de ventanas pasadas', () => {
  const limite = crearLimite({ max: 1, ventanaMs: 1000 });
  for (let i = 0; i < 10000; i++) limite(`ip${i}`, 0);
  assert.equal(limite('ip0', 500), 1, 'dentro de la ventana se recuerda');
  limite('nueva', 2000);
  assert.equal(limite('ip0', 2000), 0, 'tras la purga empieza de cero');
});

test('IPv6 se agrupa por /64; IPv4 y mapeadas no', () => {
  assert.equal(claveIp('192.0.2.1'), '192.0.2.1');
  assert.equal(claveIp('2001:db8:1:2:aaaa::1'), '2001:db8:1:2::/64');
  assert.equal(claveIp('2001:DB8:1:2:bbbb:0:0:2'), '2001:db8:1:2::/64');
  assert.equal(claveIp('2001:db8::1'), '2001:db8:0:0::/64');
  assert.notEqual(claveIp('2001:db8:1:3::1'), claveIp('2001:db8:1:2::1'));
  assert.equal(claveIp('::ffff:192.0.2.1'), '::ffff:c000:201');
  assert.notEqual(claveIp('::ffff:192.0.2.1'), claveIp('::ffff:192.0.2.2'));
  assert.equal(claveIp(''), '');
  assert.equal(claveIp(undefined), '');
});

test('el 429 lleva Retry-After, no se cachea y conserva las cabeceras dadas', async () => {
  const r = respuesta429(7, { 'Access-Control-Allow-Origin': '*' });
  assert.equal(r.status, 429);
  assert.equal(r.headers.get('Retry-After'), '7');
  assert.equal(r.headers.get('Cache-Control'), 'no-store');
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), '*');
  assert.deepEqual(await r.json(), { error: 'demasiadas peticiones' });
});
