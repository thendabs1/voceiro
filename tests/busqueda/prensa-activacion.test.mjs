import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { interpretarConsulta } from '../../shared/busqueda/consulta.js';

// Ejecutar la función real del frontal sin hacer peticiones ni arrancar el DOM.
for (const archivo of ['plantilla.html', 'public/index.html']) {
  const html = readFileSync(new URL(`../../${archivo}`, import.meta.url), 'utf8');
  const inicio = html.indexOf('function programarPrensa(');
  const fin = html.indexOf('\n// Texto, medios y fechas:', inicio);
  assert.ok(inicio >= 0 && fin > inicio);
  const codigo = html.slice(inicio, fin);

  function programar({ activa = false, manualOff = false, locales = 0 } = {}) {
    let pendientes = 0;
    const ctx = {
      PRENSA_TIMER: null, PRENSA_CLAVE: null,
      PRENSA_ACTIVA: activa, PRENSA_USER_MANUAL_OFF: manualOff,
      PRENSA_MIN_RESULTADOS: 5, PRENSA_DEBOUNCE_MS: 300,
      document: { getElementById: () => null },
      setTimeout: () => ++pendientes, clearTimeout: () => {},
    };
    runInNewContext(`${codigo}\nthis.programar = programarPrensa;`, ctx);
    ctx.programar(interpretarConsulta('incendio'), locales);
    return { pendientes, activa: ctx.PRENSA_ACTIVA };
  }

  test(`${archivo}: apagar prensa impide buscar aunque haya pocos resultados`, () => {
    assert.deepEqual(programar({ manualOff: true }), { pendientes: 0, activa: false });
  });
  test(`${archivo}: pocos resultados permiten la activación automática`, () => {
    assert.deepEqual(programar(), { pendientes: 1, activa: true });
  });
  test(`${archivo}: activación explícita busca aunque haya muchos resultados`, () => {
    assert.deepEqual(programar({ activa: true, locales: 20 }), { pendientes: 1, activa: true });
  });
  test(`${archivo}: suficientes resultados no activan prensa automáticamente`, () => {
    assert.deepEqual(programar({ locales: 20 }), { pendientes: 0, activa: false });
  });
}
