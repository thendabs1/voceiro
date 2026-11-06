import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearConsultas, crearPresupuesto } from '../../workers/deno-buscar/src/consultas/index.js';
import { leerIdMotor, baseF1, baseMoto, filasF1, filasMoto, claveSesionMoto } from '../../workers/deno-buscar/src/consultas/motor-normalizar.js';

const muestra = n => JSON.parse(readFileSync(new URL(`./muestras/${n}.json`, import.meta.url)));
const evento = muestra('motogp-eventos')[0];
const sesionMoto = muestra('motogp-sesiones').find(s => s.type === 'RAC');
const idMoto = `motogp:sesion/2026/${evento.id}/${sesionMoto.id}`;
const idF1 = 'openf1:sesion/2026/11404';
function banco({ resultadoF1, carreraMoto } = {}) {
  let tiempo = Date.parse('2026-11-06T12:00:00Z');
  const peticiones = [], guardadas = new Map(), pausas = [];
  const ahora = () => tiempo;
  const presupuesto = crearPresupuesto({ ahora, dormir: async ms => { pausas.push(ms); tiempo += ms; } });
  const consultar = crearConsultas({ ahora, presupuesto, entorno: () => undefined, abrirCache: async () => ({
    match: async r => guardadas.get(r.url)?.clone(), put: async (r, d) => { guardadas.set(r.url, d); },
  }), fetch: async (direccion, opciones) => {
    const u = new URL(direccion); peticiones.push(u);
    assert.match(opciones.headers['User-Agent'], /^Voceiro/);
    assert.deepEqual(Object.keys(opciones.headers).sort(), ['Accept', 'User-Agent']);
    if (u.host === 'api.openf1.org') {
      if (u.pathname === '/v1/sessions') return Response.json(muestra('openf1-sesiones'));
      if (u.pathname === '/v1/meetings') return Response.json(muestra('openf1-gp'));
      if (u.pathname === '/v1/session_result') return resultadoF1?.() || Response.json(muestra(u.searchParams.get('session_key') === '11400' ? 'openf1-qualifying' : 'openf1-race'));
      if (u.pathname === '/v1/drivers') return Response.json(muestra(u.searchParams.get('session_key') === '11400' ? 'openf1-pilotos-qualifying' : 'openf1-pilotos-race'));
    }
    const ruta = u.pathname.split('/results/')[1];
    const archivos = { seasons: 'motogp-temporadas', categories: 'motogp-categorias', events: 'motogp-eventos', sessions: 'motogp-sesiones' };
    if (archivos[ruta]) {
      if (['categories', 'events'].includes(ruta)) assert.equal(u.searchParams.get('seasonUuid'), evento.season.id);
      if (ruta === 'sessions') {
        assert.equal(u.searchParams.get('eventUuid'), evento.id);
        assert.equal(u.searchParams.get('categoryUuid'), sesionMoto.category.id);
      }
      return Response.json(muestra(archivos[ruta]));
    }
    if (ruta === `session/${sesionMoto.id}/classification`) {
      assert.equal(u.searchParams.get('test'), 'false');
      return carreraMoto?.() || Response.json(muestra('motogp-carrera'));
    }
    assert.fail(`Petición no prevista: ${direccion}`);
  } });
  return { peticiones, guardadas, pausas, async pedir(id, fecha) {
    const r = await consultar(new URL(`https://voceiro.test/consulta/ficha?${new URLSearchParams({ id, ...(fecha === undefined ? {} : { fecha }) })}`));
    return { r, d: await r.json() };
  } };
}

test('F1: conserva posición, duración y diferencia null en DNF; Q1/Q2/Q3 mantienen orden y huecos', () => {
  const filas = filasF1(muestra('openf1-race'), muestra('openf1-pilotos-race'));
  assert.equal(filas[0].piloto, 'Max VERSTAPPEN');
  assert.equal(filas[0].puntos, 25);
  assert.deepEqual([filas[2].posicion, filas[2].tiempo, filas[2].diferencia], [null, null, null]);
  assert.equal(filas[2].condicion, 'retirada'); assert.equal(filas[2].condicion_original, 'dnf');
  const q = filasF1(muestra('openf1-qualifying'), muestra('openf1-pilotos-qualifying'));
  assert.deepEqual(q[0].tiempo, [77.341, 76.953, 76.514]);
  assert.deepEqual(q[0].diferencia, [0, 0.225, 0]);
  assert.equal(q[0].puntos, null);
  assert.ok(q.some(r => r.tiempo.includes(null)));
});

test('MotoGP: OUTSTND solo significa no clasificado, sin inventar retirada o cero vueltas', () => {
  const filas = filasMoto(muestra('motogp-carrera'));
  assert.equal(filas[0].piloto, 'Marc Marquez'); assert.equal(filas[0].dorsal, 93);
  assert.equal(filas[0].condicion, null); assert.equal(filas[0].condicion_original, 'INSTND');
  assert.deepEqual(filas[2].diferencia, { tiempo: '0.000', vueltas: '3' });
  assert.equal(filas[2].posicion, null); assert.equal(filas[2].vueltas, 17);
  assert.equal(filas[2].condicion, 'no clasificado'); assert.equal(filas[2].condicion_original, 'OUTSTND');
  assert.ok(!/dnf|dns|dsq/i.test(JSON.stringify(filas)));
  const s = baseMoto(sesionMoto, evento, 2026);
  assert.equal(s.inicio, null); assert.equal(s.estado, 'final'); assert.equal(s.estado_original, 'FINISHED');
  assert.deepEqual(s.referencias_agenda, [
    { proveedor: 'motogp', tipo: 'grand_prix_calendar_id', id: evento.toad_api_uuid },
    { proveedor: 'motogp', tipo: 'tipo_sesion', id: 'RAC' },
  ]);
  assert.notEqual(evento.id, evento.toad_api_uuid);
  assert.deepEqual(muestra('motogp-sesiones').map(claveSesionMoto), ['FP1','PR','FP2','Q1','Q2','SPR','WUP','RAC']);
});

test('IDs de motor estrictos y separados: no aceptan parámetros, rutas ni categorías no expuestas', async () => {
  const b = banco();
  for (const id of ['openf1:sesion/2026/0', 'openf1:sesion/26/11404', `${idF1}?x=1`, `${idMoto}/x`, idMoto.toUpperCase(),
    'motogp:resultados/moto2', 'openf1:resultados/motogp', 'espn:resultados/f1', 'espn:partido/f1/11404']) {
    assert.equal((await b.pedir(id)).r.status, 400, id);
    assert.equal(leerIdMotor(id), null);
  }
  assert.equal(b.peticiones.length, 0);
  for (const fecha of ['', '2026-02-30', '2026-11-01T12:00:00Z']) assert.equal((await b.pedir('openf1:resultados/f1', fecha)).r.status, 400);
  assert.equal((await b.pedir(idMoto, '2026-11-01')).r.status, 400);
});

test('F1: lista por fecha cuesta 2 GET y abrir sesión añade 2; vuelta y repetición usan caché', async () => {
  const b = banco();
  const lista = await b.pedir('openf1:resultados/f1', '2026-11-01');
  assert.equal(lista.d.ficha.partidos.length, 1); assert.equal(lista.d.ficha.partidos[0].vista, 'sesion_motor');
  assert.equal(lista.d.ficha.fecha, '2026-11-01'); assert.equal(b.peticiones.length, 2);
  const { d } = await b.pedir(idF1);
  assert.equal(d.ficha.vista, 'sesion_motor'); assert.equal(d.ficha.estado, 'final');
  assert.equal(d.ficha.estado_original, null); assert.equal(d.ficha.filas.length, 3);
  assert.equal(d.fuente, 'OpenF1'); assert.equal(d.licencia.nombre, 'CC BY-NC-SA 4.0');
  assert.equal(d.ficha.fuente.nombre, 'OpenF1'); assert.equal(b.peticiones.length, 4);
  assert.equal((await b.pedir(idF1)).r.headers.get('X-Cache'), 'HIT');
  await b.pedir('openf1:resultados/f1', '2026-11-01'); assert.equal(b.peticiones.length, 4);
  const vacio = await b.pedir('openf1:resultados/f1', '2026-11-02');
  assert.equal(vacio.d.estado, 'vacio'); assert.equal(b.peticiones.length, 4);
  assert.ok(!/headshot|country_flag|records/.test(JSON.stringify(d.ficha)));
});

test('F1: detalle frío cuesta 4 GET y clasificación conserva las tres tandas', async () => {
  const b = banco(); const { d } = await b.pedir('openf1:sesion/2026/11400');
  assert.equal(b.peticiones.length, 4); assert.equal(d.estado, 'ok');
  assert.deepEqual(d.ficha.filas[0].tiempo, [77.341,76.953,76.514]);
});

test('F1: sin resultados o dentro de la ventana no gratuita conserva ficha sin error', async () => {
  for (const respuesta of [() => Response.json([]), () => new Response(null, { status: 404 })]) {
    const b = banco({ resultadoF1: respuesta }); const { d } = await b.pedir(idF1);
    assert.equal(d.estado, 'ok'); assert.deepEqual(d.ficha.filas, []); assert.equal(b.peticiones.length, 3);
  }
  const futuro = banco(); const { d } = await futuro.pedir('openf1:sesion/2026/11436');
  assert.equal(d.estado, 'ok'); assert.deepEqual(d.ficha.filas, []); assert.equal(futuro.peticiones.length, 2);
  const sesion = muestra('openf1-sesiones').find(s => s.is_cancelled);
  const cancelado = banco(); const f = await cancelado.pedir(`openf1:sesion/2026/${sesion.session_key}`);
  assert.equal(f.d.ficha.estado, 'cancelado'); assert.deepEqual(f.d.ficha.filas, []); assert.equal(cancelado.peticiones.length, 2);
  const pruebas = await futuro.pedir('openf1:resultados/f1', '2026-02-11'); assert.equal(pruebas.d.estado, 'vacio');
});

test('F1: el nombre del GP sale de meeting_key, sin unir country_name y location', () => {
  const s = muestra('openf1-sesiones').find(s => s.meeting_key === 1308);
  const gp = muestra('openf1-gp').find(g => g.meeting_key === s.meeting_key);
  assert.equal(baseF1(s, gp).gp.nombre, gp.meeting_name);
  assert.equal(baseF1(s).gp.nombre, null);
});

test('MotoGP: lista fría 4 GET, detalle añade 1; metadatos y fechas comparten caché', async () => {
  const b = banco(); const { d } = await b.pedir('motogp:resultados/motogp', '2026-11-01');
  assert.equal(d.estado, 'ok'); assert.equal(d.ficha.partidos.length, 2); assert.equal(b.peticiones.length, 4);
  assert.ok(d.ficha.partidos.every(p => p.inicio === null && p.vista === 'sesion_motor'));
  const detalle = await b.pedir(idMoto); assert.equal(b.peticiones.length, 5);
  assert.equal(detalle.d.fuente, 'MotoGP'); assert.equal(detalle.d.ficha.filas.length, 4);
  assert.equal(detalle.d.ficha.id, idMoto); assert.equal(detalle.d.ficha.sesion.nombre, 'RAC');
  const otroDia = await b.pedir('motogp:resultados/motogp', '2026-10-31');
  assert.equal(otroDia.d.ficha.partidos.length, 4); assert.equal(b.peticiones.length, 5);
  const vacio = await b.pedir('motogp:resultados/motogp', '2026-11-02');
  assert.equal(vacio.d.estado, 'vacio'); assert.equal(b.peticiones.length, 5);
  const prueba = muestra('motogp-eventos')[1];
  assert.equal((await b.pedir('motogp:resultados/motogp', prueba.date_start)).d.estado, 'vacio');
  assert.ok(!/records|session_files|constructor|event_files/.test(JSON.stringify(detalle.d.ficha)));
});

test('MotoGP: detalle frío 5 GET y un día sin GP 2 GET; sin clasificación conserva ficha', async () => {
  const b = banco(); await b.pedir(idMoto); assert.equal(b.peticiones.length, 5);
  const vacio = banco(); assert.equal((await vacio.pedir('motogp:resultados/motogp', '2026-11-02')).d.estado, 'vacio');
  assert.equal(vacio.peticiones.length, 2);
  const sinFilas = banco({ carreraMoto: () => Response.json({ classification: [] }) });
  const { d } = await sinFilas.pedir(idMoto); assert.equal(d.estado, 'ok'); assert.deepEqual(d.ficha.filas, []);
});

test('un fallo real de clasificación no se presenta como vacío ni se cachea como ficha', async () => {
  let llamadas = 0;
  const b = banco({ carreraMoto: () => ++llamadas === 1 ? new Response(null, { status: 503 }) : Response.json(muestra('motogp-carrera')) });
  const fallo = await b.pedir(idMoto); assert.equal(fallo.d.estado, 'no_disponible'); assert.equal(fallo.d.fuente, 'MotoGP');
  assert.equal((await b.pedir(idMoto)).d.estado, 'ok'); assert.equal(llamadas, 2);
});

test('presupuestos: OpenF1 queda por debajo de 30/min y MotoGP a una petición/segundo', async () => {
  let t = 0; const inicios = [];
  const presupuesto = crearPresupuesto({ ahora: () => t, dormir: async ms => { t += ms; } });
  for (let i = 0; i < 31; i++) await presupuesto('openf1', async () => { inicios.push(t); });
  assert.equal(inicios[30], 63000);
  for (const inicio of inicios) assert.ok(inicios.filter(t => t >= inicio && t < inicio + 60000).length <= 30);
  const moto = []; for (let i = 0; i < 3; i++) await presupuesto('motogp', async () => { moto.push(t); });
  assert.deepEqual(moto.map(t => t - moto[0]), [0, 1000, 2000]);
});
