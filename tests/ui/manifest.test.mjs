import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerAplicacion } from '../soporte/frontend.mjs';
import { runInNewContext } from 'node:vm';

// Solo la plantilla: public/index.html lo regenera el recolector, y con un
// test que aún no pasa ahí el front se quedaría congelado.
const html = leerAplicacion();
const funcion = nombre => html.slice(
  html.indexOf(`function ${nombre}(`),
  html.indexOf('\n}', html.indexOf(`function ${nombre}(`)) + 2,
);

const contexto = manifest => {
  const ctx = {
    _manifest: manifest, DIAS_MEMORIA_MAX_SCOPE: 30,
    normStrict: s => s.toLowerCase(), normDomain: s => s,
  };
  for (const f of ['_buscarGrupoEnDia', '_ficheroDeCapaEnDia', 'estimarCarga']) {
    runInNewContext(funcion(f), ctx);
  }
  return ctx;
};

test('manifest nuevo: grupo por nombre de fichero, medio deducido si tiene noticias en la ventana', () => {
  const dia = { fecha: '2026-10-21', n: 10, grupos: { Pruebas: '2026-10-21-g-pruebas-0123456789.json' } };
  const ctx = contexto({ dias: [dia], medias: { grupos: {}, dominios: { 'a.test': [6, 3] } } });
  assert.equal(ctx._ficheroDeCapaEnDia(dia, 'grupo', 'pruebas'), '2026-10-21-g-pruebas-0123456789.json');
  assert.equal(ctx._ficheroDeCapaEnDia(dia, 'grupo', 'otro'), '');
  assert.equal(ctx._ficheroDeCapaEnDia(dia, 'dominio', 'a.test'), 'd-a.test-2026-10-21.json');
  assert.equal(ctx._ficheroDeCapaEnDia(dia, 'dominio', 'x.test'), '');
  // Día de antes del troceado: no hay ficheros por medio que pedir.
  assert.equal(ctx._ficheroDeCapaEnDia({ fecha: '2026-09-25', n: 5, grupos: {} }, 'dominio', 'a.test'), '');
});

test('manifest de antes: ficheros de grupo y medio listados por día', () => {
  const dia = { fecha: '2026-10-21', all: { n: 10 },
    grupos: { Pruebas: { file: 'g.json', n: 4, kb: 2 } },
    dominios: { 'a.test': { file: 'd.json', n: 6, kb: 3 } } };
  const ctx = contexto({ dias: [dia] });
  assert.equal(ctx._ficheroDeCapaEnDia(dia, 'grupo', 'Pruebas'), 'g.json');
  assert.equal(ctx._ficheroDeCapaEnDia(dia, 'dominio', 'a.test'), 'd.json');
  assert.deepEqual({ ...ctx.estimarCarga({ grupos: ['Pruebas'], overrides: { 'a.test': 'first' } }, 7) },
    { n: 10, kb: 5 });
});

test('estimación con las medias diarias, hasta los días que hay', () => {
  const dias = ['2026-10-21', '2026-10-20', '2026-10-19'].map(fecha => ({ fecha, n: 1, grupos: {} }));
  const ctx = contexto({ dias, medias: { grupos: { Pruebas: [4, 2] }, dominios: { 'a.test': [6, 3] } } });
  const modo = { grupos: ['Pruebas'], overrides: { 'a.test': 'first' } };
  assert.deepEqual({ ...ctx.estimarCarga(modo, 7) }, { n: 30, kb: 15 });
  assert.deepEqual({ ...ctx.estimarCarga(modo, 1) }, { n: 10, kb: 5 });
});
