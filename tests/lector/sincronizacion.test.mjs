// Sincronización propia del lector: lector/src/28-sincronizacion.js con la
// plataforma de verdad (02-plataforma.js, PLATAFORMA.pedir sobre un
// GM_xmlhttpRequest falso) y los módulos de shared/sync, como los junta
// lector/build.mjs, contra la lógica del servidor (workers/comun/sync.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { atender, d1Local } from '../sync/soporte.mjs';
import { crearCliente } from '../../shared/sync/cliente.js';
import { generarCodigo } from '../../shared/sync/cripto.js';
import { normalizeUrlForMatch } from '../../shared/sync/fusion.js';

const leer = rel => readFileSync(new URL('../../' + rel, import.meta.url), 'utf8');
const sinModulo = f => f.replace(/^import\s*\{[^}]*\}\s*from\s*'[^']+';\s*\n/gm, '').replace(/^export\s+/gm, '');
const FUENTE = [
  leer('lector/src/02-plataforma.js'),
  ...['fusion', 'cripto', 'cliente'].map(m => sinModulo(leer(`shared/sync/${m}.js`))),
  leer('lector/src/28-sincronizacion.js'),
  // Lo que en el lector ponen 07-configuracion.js y el puente (34), en corto.
  `var CFG = { readLater: [] };
   function perfilDelLector(){ return null; }
   function bloqueConfigLector(){ return { datos: { sites: CFG.sites || [] }, actualizado: CFG.configActualizado || 0 }; }
   function adoptarEnLector(d){
     CFG.readLater = fusionarPendientes(CFG.readLater, d.pendientes);
     if (d.lector && (d.lector.actualizado || 0) > (CFG.configActualizado || 0)){
       CFG.sites = d.lector.datos.sites; CFG.configActualizado = d.lector.actualizado;
     }
   }
   function saveCfg(){ guardados++; }
   var guardados = 0, __lectorAbierto = null;
   function actualizarBoton(){}
   var enVoceiro = false;
   function esVoceiro(){ return enVoceiro; }
   globalThis.lector = { sincronizarLector, activarSyncLector, codigoDesdeVoceiro, apuntarLeidaEnSync,
     sincronizarLectorPronto, estadoSyncLector, codigoSyncLector, get sync(){ return __syncLector; }, haySyncSinSubir,
     get CFG(){ return CFG; }, set CFG(c){ CFG = c; }, set enVoceiro(v){ enVoceiro = v; } };`,
].join('\n');

function servidor(){
  const { cf: almacen, filas } = d1Local();
  let reloj = Date.parse('2026-10-23T10:00:00Z');
  const peticiones = [];
  // Como el servidor de verdad, contesta a Voceiro (fetch) y al gestor.
  async function atenderUrl(url, opciones = {}){
    reloj += 3000;
    peticiones.push(`${opciones.method || 'GET'} ${new URL(url).host}`);
    return atender(new Request(url, opciones), almacen, reloj, '1.2.3.4');
  }
  return { filas, peticiones, atenderUrl };
}

// GM_xmlhttpRequest como lo dan Violentmonkey y Tampermonkey: cabeceras en
// texto, cuerpo en ArrayBuffer, sin CORS (Origin de la extensión).
function gestor(srv, { caidos = [] } = {}){
  return details => {
    let abortada = false;
    (async () => {
      if (caidos.some(h => details.url.startsWith(h))){ details.onerror({}); return; }
      const body = details.data ? new Uint8Array(await details.data.arrayBuffer()) : undefined;
      const r = await srv.atenderUrl(details.url, {
        method: details.method, body,
        headers: { ...details.headers, Origin: 'moz-extension://abcd-1234' },
      });
      if (abortada) return;
      const responseHeaders = [...r.headers].map(([k, v]) => `${k}: ${v}`).join('\r\n');
      details.onload({ status: r.status, responseHeaders, response: await r.arrayBuffer() });
    })();
    return { abort(){ abortada = true; } };
  };
}

function nuevoLector(srv, opciones){
  const valores = new Map();
  const ctx = {
    GM_getValue: (k, d) => valores.has(k) ? structuredClone(valores.get(k)) : d,
    GM_setValue: (k, v) => valores.set(k, structuredClone(v)),
    GM_xmlhttpRequest: gestor(srv, opciones),
    window: { isSecureContext: true },
    crypto, TextEncoder, TextDecoder, Blob, Response, Headers, Request, AbortSignal,
    CompressionStream, DecompressionStream, btoa, console, URL,
    // Lo que el lector deja programado no retiene la prueba; programados
    // dice cuántas esperas quedan vivas.
    setTimeout: (f, ms) => {
      const t = setTimeout(() => { programados.delete(t); f(); }, ms);
      t.unref(); programados.add(t); return t;
    },
    clearTimeout: t => { programados.delete(t); clearTimeout(t); },
  };
  const programados = new Set();
  ctx.window.crypto = crypto;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(FUENTE, ctx);
  return { lector: ctx.lector, valores, programados };
}

// Lo que sale del contexto del lector, con arrays y objetos de aquí.
const plano = x => JSON.parse(JSON.stringify(x));
const T = Date.parse('2026-10-23T09:00:00Z');
const pend = url => ({ url, title: url, date: T, read: false, actualizado: T });

test('el lector sube y baja por el gestor, y conserva lo que no usa', async () => {
  const srv = servidor();
  const codigo = generarCodigo();
  const voceiro = crearCliente({ servidores: ['https://cf.test'], fetch: srv.atenderUrl });
  const modos = { lista: [{ id: 'm1', nombre: 'Deportes', actualizado: T }], borrados: {} };
  await voceiro.sincronizar(codigo, { pendientes: [pend('https://a.es/1')], modos,
                                      leidas: { 'a.es/viejo': T } });

  const { lector, valores } = nuevoLector(srv);
  lector.CFG = { readLater: [pend('https://b.es/2')] };
  assert.equal(lector.activarSyncLector(codigo, false), true);
  await lector.sincronizarLector();

  assert.deepEqual(plano(lector.CFG.readLater.map(p => p.url).sort()), ['https://a.es/1', 'https://b.es/2']);
  const doc = valores.get('lector-sync-doc');
  assert.deepEqual(plano(doc.modos.lista.map(m => m.id)), ['m1'], 'los modos de Voceiro siguen en el documento');
  assert.ok(doc.leidas['a.es/viejo']);
  assert.ok(lector.estadoSyncLector().subido > 0);

  // Lo terminado en el lector llega a Voceiro en otro dispositivo.
  lector.apuntarLeidaEnSync('https://www.c.es/noticia?utm_source=x');
  await lector.sincronizarLector();
  const { documento } = await voceiro.sincronizar(codigo, {});
  assert.deepEqual(documento.pendientes.map(p => p.url).sort(), ['https://a.es/1', 'https://b.es/2']);
  assert.deepEqual(documento.modos.lista.map(m => m.id), ['m1']);
  assert.equal(Object.keys(documento.leidas).length, 2);
});

test('con CF bloqueado va por el respaldo; sin nada nuevo no sube', async () => {
  const srv = servidor();
  const codigo = generarCodigo();
  const { lector } = nuevoLector(srv, { caidos: ['https://sync.voceiro.eu'] });
  lector.CFG = { readLater: [pend('https://a.es/1')] };
  lector.activarSyncLector(codigo, false);
  await lector.sincronizarLector();
  assert.equal(srv.filas.size, 1);
  assert.ok(srv.peticiones.every(p => p.endsWith('voceiro-sync.thendabs1.deno.net')));

  srv.peticiones.length = 0;
  await lector.sincronizarLector();
  assert.deepEqual(srv.peticiones, ['GET voceiro-sync.thendabs1.deno.net']);
});

test('sigue el código de Voceiro; uno escrito a mano solo lo cambia Voceiro con otro', async () => {
  const srv = servidor();
  const { lector, valores } = nuevoLector(srv);
  const deVoceiro = generarCodigo(), aMano = generarCodigo(), otro = generarCodigo();

  lector.codigoDesdeVoceiro(deVoceiro);
  assert.equal(lector.codigoSyncLector(), deVoceiro.replace(/-/g, ''));
  lector.codigoDesdeVoceiro(null);                 // desvinculado en Voceiro
  assert.equal(lector.codigoSyncLector(), null);

  lector.activarSyncLector(aMano, false);
  valores.set('lector-sync-doc', { leidas: { 'x.es/1': T } });
  lector.codigoDesdeVoceiro(null);                 // Voceiro sin código: el de aquí se queda
  assert.equal(lector.codigoSyncLector(), aMano.replace(/-/g, ''));
  lector.codigoDesdeVoceiro(otro);                 // Voceiro con otro: manda el suyo
  assert.equal(lector.codigoSyncLector(), otro.replace(/-/g, ''));
  assert.equal(valores.get('lector-sync-doc'), null, 'lo de la otra cuenta no se mezcla');
  assert.equal(lector.activarSyncLector('no-vale', false), false);
});

test('en la página de Voceiro no sincroniza: lo hace Voceiro', async () => {
  const srv = servidor();
  const { lector } = nuevoLector(srv);
  lector.enVoceiro = true;
  lector.codigoDesdeVoceiro(generarCodigo());
  await lector.sincronizarLector();
  assert.equal(srv.peticiones.length, 0);
  assert.ok(lector.estadoSyncLector().cambio > 0, 'queda apuntado para la próxima web');
});

test('una leída pisada por otra pestaña sigue en la cola y sube igual', async () => {
  const srv = servidor();
  const codigo = generarCodigo();
  const { lector, valores } = nuevoLector(srv);
  lector.activarSyncLector(codigo, false);
  lector.apuntarLeidaEnSync('https://a.es/1');
  // Otra pestaña guardó su copia del documento sin esta leída.
  valores.set('lector-sync-doc', { leidas: { 'b.es/2': T } });
  lector.CFG = { readLater: [], leidasParaVoceiro: [
    { url: 'https://a.es/1', fecha: T + 1 },
    { url: 'https://c.es/3', fecha: T + 2 }, { url: 'https://c.es/3', fecha: T + 3, quitar: true },
  ] };
  await lector.sincronizarLector();
  const voceiro = crearCliente({ servidores: ['https://cf.test'], fetch: srv.atenderUrl });
  const { documento } = await voceiro.sincronizar(codigo, {});
  assert.deepEqual(Object.keys(documento.leidas).sort(), ['b.es/2', normalizeUrlForMatch('https://a.es/1')].sort());
});

test('un cambio mientras sincroniza deja otra vuelta programada', async () => {
  const srv = servidor();
  const { lector } = nuevoLector(srv);
  lector.activarSyncLector(generarCodigo(), false);
  const primera = lector.sincronizarLector();
  lector.sincronizarLectorPronto();       // cambio de aquí mientras va
  await lector.sincronizarLector();       // y vence su espera antes de terminar
  await primera;
  assert.ok(lector.haySyncSinSubir(), 'el cambio sigue pendiente');
  assert.ok(lector.sync.diferido, 'queda programada otra vuelta');
});

test('con varios cambios mientras sincroniza queda una sola vuelta programada', async () => {
  const srv = servidor();
  const { lector, programados } = nuevoLector(srv);
  lector.activarSyncLector(generarCodigo(), false);
  const primera = lector.sincronizarLector();
  lector.sincronizarLectorPronto();       // un cambio mientras va…
  lector.sincronizarLector();             // …cuya espera vence antes de terminar
  lector.sincronizarLectorPronto();       // y otro cambio, aún en espera
  await primera;
  assert.equal(programados.size, 1);
});

test('el lector detiene un código revocado y conserva su documento local', async () => {
  const srv = servidor(), codigo = generarCodigo();
  const { lector, valores } = nuevoLector(srv);
  lector.activarSyncLector(codigo, false);
  await lector.sincronizarLector();
  const documento = valores.get('lector-sync-doc');
  const web = crearCliente({ servidores: ['https://cf.test'], fetch: srv.atenderUrl });
  await web.borrar(codigo);
  await lector.sincronizarLector();
  assert.equal(lector.codigoSyncLector(), null);
  assert.deepEqual(valores.get('lector-sync-doc'), documento);
  const n = srv.peticiones.length;
  await lector.sincronizarLector();
  assert.equal(srv.peticiones.length, n);
});

test('un código revocado no vuelve por el puente mientras Voceiro no se entera', async () => {
  const srv = servidor(), codigo = generarCodigo();
  const { lector, valores } = nuevoLector(srv);
  lector.codigoDesdeVoceiro(codigo);
  await lector.sincronizarLector();
  const documento = valores.get('lector-sync-doc');
  const web = crearCliente({ servidores: ['https://cf.test'], fetch: srv.atenderUrl });
  await web.borrar(codigo);
  await lector.sincronizarLector();
  lector.codigoDesdeVoceiro(codigo);               // Voceiro aún lo tiene
  assert.equal(lector.codigoSyncLector(), null);
  assert.deepEqual(valores.get('lector-sync-doc'), documento);
  lector.codigoDesdeVoceiro(null);                 // ya se enteró
  assert.equal(valores.get('lector-sync-doc'), null);
  const otro = generarCodigo();
  lector.codigoDesdeVoceiro(otro);                 // y con uno nuevo, sigue
  assert.equal(lector.codigoSyncLector(), otro.replace(/-/g, ''));
});
