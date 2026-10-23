import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { atender, huellaIpDiaria, normalizarIp, MAX_BYTES, MAX_FILAS, limpiar } from '../../workers/comun/sync.js';
import { crearCliente } from '../../shared/sync/cliente.js';
import { generarCodigo } from '../../shared/sync/cripto.js';
import { d1Local, SECRETO, migracion } from './soporte.mjs';
import qrcode from '../../front/vendor/qrcode-1.4.4.js';

const T = Date.parse('2026-10-23T12:00:00Z'), DIA = '2026-10-23';
const TOKEN = 'A'.repeat(43), IP = '192.0.2.1';
const id = i => i.toString(16).padStart(32, '0');
function pedir(i, method = 'PUT', { token = TOKEN, body = new Uint8Array([1]), base = 0 } = {}){
  return new Request(`https://local/v1/s/${id(i)}`, { method,
    headers: { Authorization: 'Bearer ' + token, 'If-Match': String(base) },
    ...(method === 'PUT' ? { body, duplex: 'half' } : {}) });
}
const usar = (alm, i, method, opciones, ip = IP, secreto = SECRETO) =>
  atender(pedir(i, method, opciones), alm, T, ip, secreto);

test('HMAC compatible, separado por día y secreto, y direcciones equivalentes', async () => {
  const h = await huellaIpDiaria(IP, DIA, SECRETO);
  assert.equal(h, createHmac('sha256', Buffer.from(SECRETO, 'hex'))
    .update(`voceiro-altas-v1\n${DIA}\n${IP}`).digest('hex'));
  assert.notEqual(h, await huellaIpDiaria(IP, '2026-10-24', SECRETO));
  assert.notEqual(h, await huellaIpDiaria(IP, DIA, 'cd'.repeat(32)));
  assert.equal(h, await huellaIpDiaria('::ffff:c000:201', DIA, SECRETO));
  assert.equal(normalizarIp('2001:0DB8:0:0:0:0:0:1'), '2001:db8::1');
  for (const ip of ['', 'sin-ip', '1.2.3.999', '::1,::2', '::1%eth0']) assert.equal(normalizarIp(ip), null);
});

for (const plataforma of ['cf', 'http']){
  test(`${plataforma}: sin secreto/IP fiables se cierran las altas, no los datos existentes`, async () => {
    const f = d1Local(), alm = f[plataforma];
    try {
      assert.equal((await usar(alm, 1, 'PUT')).status, 200);
      for (const secreto of ['', 'mal']){
        assert.equal((await usar(alm, 2, 'PUT', {}, IP, secreto)).status, 503);
        assert.equal((await usar(alm, 1, 'GET', {}, IP, secreto)).status, 200);
      }
      assert.equal((await usar(alm, 2, 'PUT', {}, '')).status, 503);
      assert.equal(f.filas.size, 1);
    } finally { f.db.close(); }
  });

  test(`${plataforma}: cortar y cancelar subidas sin Content-Length al superar el máximo`, async () => {
    const f = d1Local();
    let trozos = 0, cancelado = false;
    const body = new ReadableStream({ pull(c){ trozos++; c.enqueue(new Uint8Array(64 * 1024)); },
      cancel(){ cancelado = true; } }, { highWaterMark: 0 });
    try {
      assert.equal((await usar(f[plataforma], 1, 'PUT', { body })).status, 413);
      assert.equal(cancelado, true);
      assert.equal(trozos, MAX_BYTES / (64 * 1024) + 1);
      assert.equal(f.filas.size, 0);
      assert.equal((await usar(f[plataforma], 1, 'PUT', { body: new Uint8Array(MAX_BYTES) })).status, 200);
    } finally { f.db.close(); }
  });
}

test('20 altas simultáneas entre CF y Deno comparten un único cupo de diez', async () => {
  const f = d1Local();
  try {
    const resultados = await Promise.all(Array.from({ length: 20 }, (_, i) => usar(i % 2 ? f.cf : f.http, i, 'PUT')));
    assert.equal(resultados.filter(r => r.status === 200).length, 10);
    assert.equal(resultados.filter(r => r.status === 429).length, 10);
    assert.equal(f.filas.size, 10);
    assert.equal(f.db.prepare('SELECT n FROM altas').get().n, 10);
    assert.equal(f.db.prepare("SELECT valor FROM estado WHERE clave='filas_v2'").get().valor, 10);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM sync_crear').get().n, 0);
  } finally { f.db.close(); }
});

test('el cupo global también se respeta con altas simultáneas', async () => {
  const f = d1Local();
  try {
    // Simular una base a una fila del límite, sin generar 20.000 bloques.
    f.db.prepare("UPDATE estado SET valor=? WHERE clave='filas_v2'").run(MAX_FILAS - 1);
    const respuestas = await Promise.all(Array.from({ length: 10 }, (_, i) => usar(i % 2 ? f.cf : f.http, i, 'PUT')));
    assert.equal(respuestas.filter(r => r.status === 200).length, 1);
    assert.equal(respuestas.filter(r => r.status === 503).length, 9);
    assert.equal(f.db.prepare('SELECT n FROM altas').get().n, 1);
  } finally { f.db.close(); }
});

test('un fallo a mitad del alta revierte bloque y ambos contadores', async () => {
  const f = d1Local();
  try {
    f.db.exec("CREATE TRIGGER fallo BEFORE INSERT ON altas BEGIN SELECT RAISE(ABORT, 'fallo simulado'); END;");
    await assert.rejects(usar(f.http, 1, 'PUT'), /fallo simulado/);
    assert.equal(f.filas.size, 0);
    assert.equal(f.db.prepare("SELECT valor FROM estado WHERE clave='filas_v2'").get().valor, 0);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM altas').get().n, 0);
  } finally { f.db.close(); }
});

test('reintentar la misma alta no consume cupo dos veces', async () => {
  const f = d1Local();
  try {
    const respuestas = await Promise.all([usar(f.cf, 1, 'PUT'), usar(f.http, 1, 'PUT')]);
    assert.deepEqual(respuestas.map(r => r.status).sort(), [200, 409]);
    assert.equal(f.db.prepare('SELECT n FROM altas').get().n, 1);
  } finally { f.db.close(); }
});

test('borrado autenticado, idempotente y definitivo, incluso frente a PUT antiguos', async () => {
  const f = d1Local();
  try {
    await usar(f.cf, 1, 'PUT');
    assert.equal((await usar(f.http, 1, 'DELETE', { token: 'B'.repeat(43) })).status, 403);
    assert.equal((await usar(f.http, 1, 'DELETE')).status, 204);
    assert.equal((await usar(f.cf, 1, 'DELETE')).status, 204);
    for (const method of ['GET', 'PUT']) assert.equal((await usar(f.cf, 1, method)).status, 410);
    assert.equal(f.filas.size, 0);
    assert.equal(f.db.prepare("SELECT valor FROM estado WHERE clave='filas_v2'").get().valor, 0);
    assert.deepEqual(Object.keys(f.db.prepare('SELECT * FROM revocados').get()), ['id', 'token_hash']);
    // Ni una escritura de la versión antigua del servidor puede recrearlo.
    assert.throws(() => f.db.prepare('INSERT INTO sync VALUES (?, ?, 1, ?, ?, ?, ?)')
      .run(id(1), TOKEN, new Uint8Array([1]), T, T, T), /sync_revocado/);
    await usar(f.cf, 2, 'DELETE');
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM revocados').get().n, 1);
    // El mantenimiento no elimina las revocaciones ni rompe el contador.
    await usar(f.cf, 3, 'PUT');
    await limpiar(f.cf, T + 367 * 86400000);
    assert.equal(f.filas.size, 0);
    assert.equal(f.db.prepare("SELECT valor FROM estado WHERE clave='filas_v2'").get().valor, 0);
    assert.equal((await usar(f.http, 1, 'PUT')).status, 410);
  } finally { f.db.close(); }
});

test('un PUT que leyó la fila antes del borrado tampoco la recrea', async () => {
  const f = d1Local();
  try {
    await usar(f.cf, 1, 'PUT');
    const antiguo = await f.cf.leer(id(1));
    await usar(f.http, 1, 'DELETE');
    const alm = { ...f.cf, leer: async () => antiguo };
    assert.equal((await atender(pedir(1, 'PUT', { base: 1 }), alm, T + 3000, IP, SECRETO)).status, 409);
    assert.equal(f.filas.size, 0);
  } finally { f.db.close(); }
});

test('otro dispositivo recibe revocación y no vuelve a subir el documento', async () => {
  const f = d1Local();
  let reloj = T, subidas = 0;
  const fetch = (url, opciones = {}) => {
    if (opciones.method === 'PUT') subidas++;
    return atender(new Request(url, opciones), f.cf, reloj += 3000, IP, SECRETO);
  };
  const a = crearCliente({ servidores: ['https://local'], fetch });
  const b = crearCliente({ servidores: ['https://local'], fetch });
  try {
    const codigo = generarCodigo();
    await a.sincronizar(codigo, {});
    await a.borrar(codigo);
    await assert.rejects(b.sincronizar(codigo, {}), { code: 'SYNC_REVOCADO' });
    assert.equal(subidas, 1);
    assert.equal(f.filas.size, 0);
  } finally { f.db.close(); }
});

test('la migración se puede repetir sin cambiar los datos ni el contador', async () => {
  const f = d1Local();
  try {
    await usar(f.cf, 1, 'PUT');
    f.db.exec(migracion);
    assert.equal((await usar(f.http, 1, 'GET')).status, 200);
    assert.equal(f.db.prepare("SELECT valor FROM estado WHERE clave='filas_v2'").get().valor, 1);
  } finally { f.db.close(); }
});

test('el QR local genera el SVG del enlace de sincronización sin red', () => {
  const qr = qrcode(0, 'M');
  qr.addData('https://thendabs1.github.io/voceiro/#sync=ABCDE-ABCDE-ABCDE-ABCDE-ABCDE');
  qr.make();
  assert.ok(qr.getModuleCount() > 0);
  assert.match(qr.createSvgTag(4, 2), /^<svg /);
});


test('borrar revoca también si la limpieza elimina la fila después de autenticarla', async () => {
  const f = d1Local();
  try {
    await usar(f.cf, 1, 'PUT');
    const almacen = { ...f.cf, async borrar(id, token){
      f.db.prepare('DELETE FROM sync WHERE id = ?').run(id);
      await f.http.borrar(id, token);
    } };
    assert.equal((await usar(almacen, 1, 'DELETE')).status, 204);
    assert.equal((await usar(f.http, 1, 'PUT')).status, 410);
  } finally { f.db.close(); }
});
