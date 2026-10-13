// node --test 'tests/**/*.test.mjs'
// Casos 22-27 de la especificación: fechas en hora de Madrid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { parseQuery } from '../../shared/parser.js';
import {
  resolverVentana, resolverLimite, ultimasHoras, pasaVentana, inicioDiaMadrid,
} from '../../shared/busqueda/tiempo.js';

const iso = ms => new Date(ms).toISOString();
// 00:30 del 13-10 en Madrid (CEST), que en UTC todavía es el 12-10.
const A = Date.parse('2026-10-12T22:30:00Z');
const H = 3600e3;

test('22 · desde:hoy → 00:00 de hoy en Madrid, aunque en UTC sea otro día', () => {
  const v = resolverVentana(parseQuery('desde:hoy'), A);
  assert.equal(v.desde.dia, '2026-10-13');
  assert.equal(iso(v.desde.ms), '2026-10-12T22:00:00.000Z');
});

test('23 · desde:ayer → 00:00 de ayer, no las últimas 24 h', () => {
  const v = resolverVentana(parseQuery('desde:ayer'), A);
  assert.equal(iso(v.desde.ms), '2026-10-11T22:00:00.000Z');
  // A = 00:30 del 13. Las 00:15 del 12 son hace 24 h 15 min: fuera de "las
  // últimas 24 h", pero dentro de desde:ayer.
  const a0015del12 = Date.parse('2026-10-11T22:15:00Z');
  assert.ok(pasaVentana(a0015del12, v));
  assert.ok(!pasaVentana(a0015del12, ultimasHoras(24, A)));
  assert.ok(!pasaVentana(Date.parse('2026-10-11T21:30:00Z'), v));  // 23:30 del 11: fuera
});

test('24 · desde:3h → las últimas 3 horas exactas', () => {
  const v = resolverVentana(parseQuery('desde:3h'), A);
  assert.equal(v.desde.ms, A - 3 * H);
  assert.ok(pasaVentana(A - 2 * H, v));
  assert.ok(!pasaVentana(A - 4 * H, v));
});

test('25 · desde y hasta absolutos, ambos incluidos', () => {
  const v = resolverVentana(parseQuery('desde:2026-10-01 hasta:2026-10-05'), A);
  assert.equal(iso(v.desde.ms), '2026-09-30T22:00:00.000Z');
  assert.equal(iso(v.hasta.ms), '2026-10-05T21:59:59.999Z');
  assert.equal(v.desde.dia, '2026-10-01');
  assert.equal(v.hasta.dia, '2026-10-05');
  assert.ok(pasaVentana(Date.parse('2026-10-05T21:30:00Z'), v));   // 23:30 del 5 en Madrid
  assert.ok(!pasaVentana(Date.parse('2026-10-05T22:30:00Z'), v));  // 00:30 del 6 en Madrid
});

test('25 · el cambio de hora del 25-10 no desplaza los días', () => {
  assert.equal(iso(inicioDiaMadrid('2026-10-25')), '2026-10-24T22:00:00.000Z');  // CEST
  assert.equal(iso(inicioDiaMadrid('2026-10-26')), '2026-10-25T23:00:00.000Z');  // CET
  const h = resolverLimite('2026-10-25', A, true);
  assert.equal(iso(h.ms), '2026-10-25T22:59:59.999Z');
});

test('26 · selector de 24 h = ventana móvil, distinta de desde:ayer', () => {
  const r = ultimasHoras(24, A);
  assert.equal(r.desde.ms, A - 24 * H);
  const ayer = resolverVentana(parseQuery('desde:ayer'), A);
  assert.notEqual(r.desde.ms, ayer.desde.ms);
});

test('27 · sin fecha: fuera con filtro de fecha, dentro sin filtro', () => {
  const v = resolverVentana(parseQuery('desde:hoy'), A);
  assert.ok(!pasaVentana(NaN, v));
  assert.ok(pasaVentana(NaN, resolverVentana(parseQuery('sanchez'), A)));
});

test('no depende de la zona horaria del sistema', () => {
  const codigo = `
    import { resolverLimite } from './shared/busqueda/tiempo.js';
    const A = ${A};
    console.log(JSON.stringify([resolverLimite('hoy', A), resolverLimite('ayer', A), resolverLimite('7d', A)]));`;
  const correr = tz => execFileSync(process.execPath, ['--input-type=module', '-e', codigo],
    { env: { ...process.env, TZ: tz }, cwd: new URL('../..', import.meta.url).pathname }).toString();
  const base = correr('Europe/Madrid');
  for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) assert.equal(correr(tz), base, tz);
});
