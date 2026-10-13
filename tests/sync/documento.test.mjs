// Fusión del documento de sincronización: leídas, modos y el documento entero.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fusionarLeidas, fusionarModos, fusionarDocumento, huella, huellaModo, LEIDAS_MAX, MODO_BORRADO_DIAS,
} from '../../shared/sync/fusion.js';

const T0 = Date.parse('2026-10-01T10:00:00Z');
const H = 3600000;

test('leídas: gana la fecha más reciente y se quedan las más recientes', () => {
  const r = fusionarLeidas({ 'https://a.es/1': T0 }, { 'https://a.es/1': T0 + H, 'https://a.es/2': T0 });
  assert.deepEqual(r, { 'https://a.es/1': T0 + H, 'https://a.es/2': T0 });
  const muchas = Object.fromEntries(Array.from({ length: LEIDAS_MAX + 10 }, (_, i) => [`https://a.es/${i}`, T0 + i]));
  const c = fusionarLeidas(muchas, {});
  assert.equal(Object.keys(c).length, LEIDAS_MAX);
  assert.ok(!('https://a.es/0' in c));
  assert.deepEqual(fusionarLeidas(muchas, {}), fusionarLeidas({}, muchas));
});

const modo = (id, extra = {}) => ({ id, nombre: id, grupos: [], palabras: [], overrides: {}, ...extra });

test('modos: por modo gana el más reciente; el borrado gana a lo anterior', () => {
  const a = { lista: [modo('m1', { nombre: 'viejo', actualizado: T0 }), modo('m2', { actualizado: T0 })], borrados: {} };
  const b = { lista: [modo('m1', { nombre: 'nuevo', actualizado: T0 + H })], borrados: { m2: T0 + H } };
  const r = fusionarModos(a, b, T0 + 2 * H);
  assert.deepEqual(r.lista.map(m => [m.id, m.nombre]), [['m1', 'nuevo']]);
  assert.deepEqual(r.borrados, { m2: T0 + H });
  assert.deepEqual(fusionarModos(b, a, T0 + 2 * H), r);
});

test('modos: guardar de nuevo después de borrar gana; los borrados caducan', () => {
  const borrado = { lista: [], borrados: { m1: T0 } };
  const vuelto = { lista: [modo('m1', { actualizado: T0 + H })], borrados: {} };
  assert.equal(fusionarModos(borrado, vuelto, T0 + H).lista.length, 1);
  const lejos = T0 + (MODO_BORRADO_DIAS + 1) * 86400000;
  assert.deepEqual(fusionarModos(borrado, null, lejos).borrados, {});
});

test('modos sin sello: el documento decide siempre igual, sea cual sea el orden', () => {
  const a = { lista: [modo('general', { palabras: ['a'] })] };
  const b = { lista: [modo('general', { palabras: ['b'] })] };
  assert.deepEqual(fusionarModos(a, b, T0), fusionarModos(b, a, T0));
});

test('huellaModo no depende del orden de las claves ni del sello', () => {
  const x = modo('m', { overrides: { 'a.es': 'first', 'b.es': 'ignore' }, actualizado: 1 });
  const y = { ...modo('m'), overrides: { 'b.es': 'ignore', 'a.es': 'first' }, actualizado: 2 };
  assert.equal(huellaModo(x), huellaModo(y));
});

test('el documento entero: fusionar en cualquier orden da lo mismo', () => {
  const a = {
    pendientes: [{ url: 'https://a.es/1', date: T0, read: false, actualizado: T0 }],
    leidas: { 'https://a.es/9': T0 },
    perfil: { tema: 'dark', fs: 20, actualizado: T0 + H },
    modos: { lista: [modo('m1', { actualizado: T0 })], borrados: {} },
    lector: { datos: { dict: 1 }, actualizado: T0 },
  };
  const b = {
    pendientes: [{ url: 'https://a.es/2', date: T0, read: true, readAt: T0, actualizado: T0 }],
    leidas: { 'https://a.es/8': T0 },
    perfil: { tema: 'light', fs: 18, actualizado: T0 },
    modos: { lista: [modo('m2', { actualizado: T0 })], borrados: {} },
    lector: { datos: { dict: 2 }, actualizado: T0 + H },
  };
  const ab = fusionarDocumento(a, b, T0 + 2 * H);
  assert.equal(huella(ab), huella(fusionarDocumento(b, a, T0 + 2 * H)));
  assert.equal(ab.pendientes.length, 2);
  assert.equal(ab.perfil.tema, 'dark');
  assert.deepEqual(ab.lector.datos, { dict: 2 });
  assert.deepEqual(ab.modos.lista.map(m => m.id), ['m1', 'm2']);
  assert.equal(huella(fusionarDocumento(ab, ab, T0 + 2 * H)), huella(ab));
});
