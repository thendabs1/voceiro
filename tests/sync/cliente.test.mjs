// Cliente de sincronización contra la lógica real del servidor
// (workers/comun/sync.js), con los adaptadores y SQLite local.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearCliente } from '../../shared/sync/cliente.js';
import { generarCodigo } from '../../shared/sync/cripto.js';
import { atender, d1Local } from './soporte.mjs';

function servidorFalso(){
  const { cf: almacen, filas } = d1Local();
  let reloj = Date.parse('2026-10-23T10:00:00Z');
  const peticiones = [];
  const fetch = async (url, opciones = {}) => {
    reloj += 3000;   // más que el intervalo mínimo entre subidas
    peticiones.push(opciones.method || 'GET');
    return atender(new Request(url, opciones), almacen, reloj);
  };
  return { fetch, filas, peticiones };
}

const T = Date.parse('2026-10-14T09:00:00Z');
const pend = (url, extra = {}) => ({ url, title: url, date: T, read: false, actualizado: T, ...extra });

test('dos dispositivos con el mismo código acaban con lo mismo', async () => {
  const srv = servidorFalso();
  const codigo = generarCodigo();
  const movil = crearCliente({ servidores: ['https://sync.test'], fetch: srv.fetch });
  const portatil = crearCliente({ servidores: ['https://sync.test'], fetch: srv.fetch });

  const r1 = await movil.sincronizar(codigo, { pendientes: [pend('https://a.es/1')] });
  assert.equal(r1.subido, true);
  assert.equal(srv.filas.size, 1);

  const r2 = await portatil.sincronizar(codigo, { pendientes: [pend('https://a.es/2')] });
  assert.equal(r2.subido, true);
  assert.equal(r2.documento.pendientes.length, 2);

  // El móvil no tiene nada nuevo: solo baja lo del portátil, sin subir.
  srv.peticiones.length = 0;
  const r3 = await movil.sincronizar(codigo, r1.documento);
  assert.equal(r3.subido, false);
  assert.deepEqual(srv.peticiones, ['GET']);
  assert.deepEqual(r3.documento.pendientes.map(p => p.url).sort(), ['https://a.es/1', 'https://a.es/2']);
});

test('si otro escribe entre medias (409), se vuelve a fusionar y se sube', async () => {
  const srv = servidorFalso();
  const codigo = generarCodigo();
  const a = crearCliente({ servidores: ['https://sync.test'], fetch: srv.fetch });
  await a.sincronizar(codigo, { pendientes: [pend('https://a.es/1')] });

  // Un fetch que, justo antes del primer PUT, deja que otro dispositivo suba.
  const b = crearCliente({ servidores: ['https://sync.test'], fetch: srv.fetch });
  let colado = false;
  const fetchConCarrera = async (url, opciones = {}) => {
    if (opciones.method === 'PUT' && !colado){
      colado = true;
      await b.sincronizar(codigo, { pendientes: [pend('https://a.es/3')] });
    }
    return srv.fetch(url, opciones);
  };
  const c = crearCliente({ servidores: ['https://sync.test'], fetch: fetchConCarrera });
  const r = await c.sincronizar(codigo, { pendientes: [pend('https://a.es/2')] });
  assert.deepEqual(r.documento.pendientes.map(p => p.url).sort(),
    ['https://a.es/1', 'https://a.es/2', 'https://a.es/3']);
});

test('si el primer servidor no responde, se usa el siguiente; borrar lo quita', async () => {
  const srv = servidorFalso();
  let alCaido = 0;
  const fetch = async (url, opciones) => {
    assert.ok(opciones.signal, 'cada petición lleva su tiempo máximo');
    if (url.startsWith('https://caido')){ alCaido++; throw new TypeError('sin red'); }
    return srv.fetch(url, opciones);
  };
  const codigo = generarCodigo();
  const cli = crearCliente({ servidores: ['https://caido.test', 'https://sync.test'], fetch });
  await cli.sincronizar(codigo, { pendientes: [pend('https://a.es/1')] });
  assert.equal(srv.filas.size, 1);
  // Ya sabe cuál responde: no vuelve a esperar al caído.
  await cli.sincronizar(codigo, { pendientes: [pend('https://a.es/2')] });
  assert.equal(alCaido, 1);
  await cli.borrar(codigo);
  assert.equal(srv.filas.size, 0);
});
