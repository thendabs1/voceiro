// Fusión de Pendientes, perfil y modos entre Voceiro y el lector.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeUrlForMatch, normalizarPendiente, fusionarPendientes,
  fusionarPerfil, masReciente, limpiarPerfil,
  BORRADO_DIAS, LEIDOS_MAX,
} from '../../shared/sync/fusion.js';

const T0 = Date.parse('2026-10-01T10:00:00Z');
const H = 3600000;

function p(url, extra = {}){
  return { url, title: 't ' + url, date: T0, read: false, ...extra };
}

test('normalizeUrlForMatch: sin www, #, seguimiento ni barra final (y sin location)', () => {
  assert.equal(
    normalizeUrlForMatch('https://www.Ejemplo.com/a/b/?utm_source=x&id=3#c'),
    'https://ejemplo.com/a/b?id=3');
  assert.equal(normalizeUrlForMatch('no es una url'), 'no es una url');
});

test('normalizarPendiente acepta la forma de Voceiro y la del lector', () => {
  const v = normalizarPendiente({ url: 'https://a.es/1', title: 'A', date: T0, read: false, readAt: null });
  const l = normalizarPendiente({ url: 'https://a.es/1', title: 'A', date: new Date(T0).toISOString(), read: false });
  assert.deepEqual(v, l);
  assert.equal(v.actualizado, T0);
  assert.equal(normalizarPendiente({ title: 'sin url' }), null);
});

test('una URL, un elemento: las variantes de la misma URL se unen', () => {
  const r = fusionarPendientes(
    [p('https://www.a.es/1/?utm_source=voceiro')],
    [p('https://a.es/1')], T0);
  assert.equal(r.length, 1);
});

test('gana el cambio más reciente (marcar como leído)', () => {
  const sinLeer = p('https://a.es/1', { actualizado: T0 });
  const leido = p('https://a.es/1', { read: true, readAt: T0 + H, actualizado: T0 + H });
  const r = fusionarPendientes([sinLeer], [leido], T0 + H);
  assert.equal(r.length, 1);
  assert.equal(r[0].read, true);
});

test('el borrado viaja y gana a lo anterior; volver a guardar gana al borrado', () => {
  const vivo = p('https://a.es/1', { actualizado: T0 });
  const borrado = { ...vivo, borrado: true, actualizado: T0 + H };
  let r = fusionarPendientes([vivo], [borrado], T0 + H);
  assert.equal(r.length, 1);
  assert.equal(r[0].borrado, true);
  const otraVez = p('https://a.es/1', { date: T0 + 2 * H, actualizado: T0 + 2 * H });
  r = fusionarPendientes(r, [otraVez], T0 + 2 * H);
  assert.equal(r[0].borrado, undefined);
});

test('la marca de borrado caduca', () => {
  const borrado = p('https://a.es/1', { borrado: true, actualizado: T0 });
  const despues = T0 + (BORRADO_DIAS + 1) * 86400000;
  assert.equal(fusionarPendientes([borrado], [], despues).length, 0);
  assert.equal(fusionarPendientes([borrado], [], T0 + H).length, 1);
});

test('fusionar es conmutativo, idempotente y asociativo', () => {
  const a = [p('https://a.es/1', { actualizado: T0 }), p('https://a.es/2', { read: true, readAt: T0 + H, actualizado: T0 + H })];
  const b = [p('https://a.es/1', { borrado: true, actualizado: T0 + 2 * H }), p('https://a.es/3', { date: T0 + H })];
  const c = [p('https://a.es/2', { actualizado: T0 + 3 * H }), p('https://a.es/4')];
  const ahora = T0 + 4 * H;
  const ab = fusionarPendientes(a, b, ahora);
  assert.deepEqual(ab, fusionarPendientes(b, a, ahora));
  assert.deepEqual(fusionarPendientes(ab, ab, ahora), ab);
  assert.deepEqual(
    fusionarPendientes(fusionarPendientes(a, b, ahora), c, ahora),
    fusionarPendientes(a, fusionarPendientes(b, c, ahora), ahora));
});

test('empate exacto: decide un orden fijo, no el orden de llegada', () => {
  const x = p('https://a.es/1', { title: 'x', actualizado: T0 });
  const y = p('https://a.es/1', { title: 'y', actualizado: T0 });
  assert.deepEqual(fusionarPendientes([x], [y], T0), fusionarPendientes([y], [x], T0));
});

test('los leídos tienen su propio tope y no echan a los sin leer', () => {
  const leidos = Array.from({ length: LEIDOS_MAX + 50 }, (_, i) =>
    p(`https://a.es/l${i}`, { read: true, readAt: T0 + i, date: T0 + i }));
  const sinLeer = [p('https://a.es/viejo', { date: T0 - 1000 * H })];
  const r = fusionarPendientes(leidos, sinLeer, T0);
  assert.equal(r.filter(i => i.read).length, LEIDOS_MAX);
  assert.ok(r.some(i => i.url === 'https://a.es/viejo'));
});

test('perfil: gana el más reciente y solo viajan los campos comunes', () => {
  const voceiro = { lang: 'gl', tema: 'dark', fuente: 'dyslexic', fs: 22, width: 900, actualizado: T0 + H };
  const lector = { lang: 'es', tema: 'light', fuente: 'sans', fs: 18, lh: 1.7, actualizado: T0 };
  const r = fusionarPerfil(voceiro, lector);
  assert.equal(r.tema, 'dark');
  assert.equal(r.width, undefined);
  assert.equal(r.lh, undefined);
  assert.deepEqual(fusionarPerfil(lector, voceiro), r);
  assert.deepEqual(limpiarPerfil(null), null);
});

test('masReciente: con un lado vacío devuelve el otro', () => {
  const m = { presets: [], actualizado: T0 };
  assert.equal(masReciente(null, m), m);
  assert.equal(masReciente(m, undefined), m);
  assert.equal(masReciente(null, null), null);
});
