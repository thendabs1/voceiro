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

  function crear({ activa = false, manualOff = false } = {}) {
    const estado = { programadas: 0, canceladas: 0, abortadas: 0 };
    const ctx = {
      PRENSA_TIMER: null, PRENSA_CLAVE: null, PRENSA_HECHA: null, PRENSA_ABORT: null,
      PRENSA_ACTIVA: activa, PRENSA_USER_MANUAL_OFF: manualOff,
      PRENSA_LANG: 'es', PRENSA_PAIS: 'ES',
      PRENSA_MIN_RESULTADOS: 5, PRENSA_DEBOUNCE_MS: 300,
      document: { getElementById: () => null },
      setTimeout: () => ++estado.programadas, clearTimeout: () => { estado.canceladas++; },
    };
    runInNewContext(`${codigo}\nthis.programar = programarPrensa; this.clave = _clavePrensa;`, ctx);
    const programar = (q = 'incendio', locales = 0) => ctx.programar(interpretarConsulta(q), locales);
    const enCurso = () => { ctx.PRENSA_ABORT = { abort: () => { estado.abortadas++; } }; };
    return { ctx, estado, programar, enCurso };
  }

  function programar({ activa = false, manualOff = false, locales = 0 } = {}) {
    const { ctx, estado, programar } = crear({ activa, manualOff });
    programar('incendio', locales);
    return { pendientes: estado.programadas, activa: ctx.PRENSA_ACTIVA };
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

  // Cada llegada (R2, archivo, la propia prensa) vuelve a llamar a aplicarFiltros
  // y, con él, a programarPrensa: no debe volver a pedir lo mismo.
  test(`${archivo}: la misma consulta no se vuelve a programar ni se repite una vez hecha`, () => {
    const { ctx, estado, programar } = crear({ activa: true });
    programar();
    programar();
    assert.equal(estado.programadas, 1);
    ctx.PRENSA_CLAVE = null;                       // llegó la respuesta
    ctx.PRENSA_HECHA = ctx.clave(interpretarConsulta('incendio'));
    programar();
    assert.equal(estado.programadas, 1);
    programar('incendio forestal');                // otra consulta: sí
    assert.equal(estado.programadas, 2);
  });

  test(`${archivo}: otro idioma o país es otra petición`, () => {
    const { ctx, estado, programar } = crear({ activa: true });
    programar();
    ctx.PRENSA_LANG = 'gl';
    programar();
    assert.equal(estado.programadas, 2);
    assert.match(ctx.PRENSA_CLAVE, /\|gl\|ES$/);
  });

  test(`${archivo}: apagar cancela la petición programada y la que está en camino`, () => {
    const { ctx, estado, programar, enCurso } = crear({ activa: true });
    programar();
    enCurso();
    ctx.PRENSA_ACTIVA = false;
    ctx.PRENSA_USER_MANUAL_OFF = true;
    programar();
    assert.equal(estado.abortadas, 1);
    assert.equal(ctx.PRENSA_CLAVE, null);
    assert.equal(ctx.PRENSA_TIMER, null);
  });
}
