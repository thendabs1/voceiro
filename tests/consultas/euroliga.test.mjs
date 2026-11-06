import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearConsultas, crearPresupuesto } from '../../workers/deno-buscar/src/consultas/index.js';
import { temporadaEuroliga, resultadosEuroliga, partidoEuroliga } from '../../workers/deno-buscar/src/consultas/euroliga.js';

const muestra = nombre => JSON.parse(readFileSync(new URL(`./muestras/${nombre}.json`, import.meta.url)));
const listado = () => muestra('euroliga-juegos-E2026');

test('el catálogo oficial filtra por fecha, conserva identidad y oculta el 0–0 previo', () => {
  assert.equal(temporadaEuroliga('2027-04-16'), 'E2026');
  assert.equal(temporadaEuroliga('2026-09-24'), 'E2026');
  const final = resultadosEuroliga(listado(), '2026-09-24', 'E2026').partidos[0];
  assert.equal(final.id, 'euroliga:partido/E2026/1');
  assert.equal(final.estado, 'final');
  assert.deepEqual(final.marcador, { local: '77', visitante: '83' });
  const antes = Date.parse('2026-11-01T00:00:00Z');
  assert.equal(resultadosEuroliga(listado(), '2026-11-06', 'E2026', antes).partidos[0].estado, 'programado');
  const previo = resultadosEuroliga(listado(), '2026-11-06', 'E2026', Date.parse('2026-11-07T00:00:00Z')).partidos[0];
  assert.equal(previo.id, 'euroliga:partido/E2026/97');
  assert.equal(previo.estado, 'desconocido');
  assert.equal(previo.marcador, null);
});

test('la ficha usa cuartos parciales reales y reconoce la prórroga sin sumar acumulados', () => {
  const f = partidoEuroliga(muestra('euroliga-juego-E2026-1'), 'E2026', '1');
  assert.equal(f.fuente.nombre, 'EuroLeague Basketball');
  assert.deepEqual(f.parciales.map(p => p.local), ['21', '24', '12', '20']);
  assert.deepEqual(f.parciales.map(p => p.visitante), ['28', '15', '16', '24']);
  const prorroga = listado().data.find(j => j.gameCode === 91);
  const extra = partidoEuroliga(prorroga, 'E2026', '91').parciales.at(-1);
  assert.deepEqual(extra, { periodo: 5, local: '11', visitante: '14' });
  const previo = partidoEuroliga(muestra('euroliga-juego-E2026-97'), 'E2026', '97', Date.parse('2027-01-01T00:00:00Z'));
  assert.equal(previo.estado, 'desconocido');
  assert.equal(previo.marcador, null);
  assert.deepEqual(previo.parciales, []);
  assert.throws(() => partidoEuroliga(prorroga, 'E2026', '1'), /distinto/);
});

test('consulta sin red: fecha, ficha, atribución y separación de peticiones', async () => {
  let tiempo = Date.parse('2026-11-06T11:00:00Z');
  const peticiones = [];
  const cache = new Map();
  const consultar = crearConsultas({ ahora: () => tiempo,
    presupuesto: crearPresupuesto({ ahora: () => tiempo, dormir: async ms => { tiempo += ms; } }),
    abrirCache: async () => ({ match: async req => cache.get(req.url)?.clone(), put: async (req, r) => cache.set(req.url, r) }),
    fetch: async (url, opciones) => {
      peticiones.push({ url, tiempo, opciones });
      assert.equal(opciones.headers.Origin, undefined);
      return Response.json(url.endsWith('/games/1') ? muestra('euroliga-juego-E2026-1') : listado());
    },
  });
  const pedir = async parametros => {
    const r = await consultar(new URL(`https://voceiro.test/consulta/ficha?${new URLSearchParams(parametros)}`));
    return { r, d: await r.json() };
  };
  const dia = await pedir({ id: 'euroliga:resultados', fecha: '2026-09-24' });
  assert.equal(dia.d.estado, 'ok');
  assert.equal(dia.d.ficha.fecha, '2026-09-24');
  assert.equal(dia.d.fuente, 'EuroLeague Basketball');
  assert.equal(dia.d.licencia, null);
  assert.equal(peticiones[0].url, 'https://api-live.euroleague.net/v2/competitions/E/seasons/E2026/games');
  assert.equal((await pedir({ id: 'euroliga:resultados', fecha: '2026-09-24' })).r.headers.get('x-cache'), 'HIT');
  const partido = await pedir({ id: dia.d.ficha.partidos[0].id });
  assert.equal(partido.d.ficha.fuente.nombre, 'EuroLeague Basketball');
  assert.ok(peticiones[1].tiempo - peticiones[0].tiempo >= 1000);
  assert.equal((await pedir({ id: 'euroliga:partido/E2026/1', fecha: '2026-09-24' })).r.status, 400);
  assert.equal(peticiones.length, 2);
});
