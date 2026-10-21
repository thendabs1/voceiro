import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { interpretarConsulta, paraPrensa } from '../../shared/busqueda/consulta.js';

// Ejecutar la función real del frontal sin hacer peticiones ni arrancar el DOM.
for (const archivo of ['plantilla.html', 'public/index.html']) {
  const html = readFileSync(new URL(`../../${archivo}`, import.meta.url), 'utf8');
  const inicio = html.indexOf('function programarPrensa(');
  const fin = html.indexOf('\n// Texto, medios y fechas:', inicio);
  assert.ok(inicio >= 0 && fin > inicio);
  const codigo = html.slice(inicio, fin);

  function crear({ activa = true, cache = false } = {}) {
    const estado = { timers: [], canceladas: 0, abortadas: 0, filtrados: 0, pintados: 0, respuesta: null };
    const ctx = {
      PRENSA_TIMER: null, PRENSA_CLAVE: null, PRENSA_HECHA: null, PRENSA_FALLO: null, PRENSA_ABORT: null,
      PRENSA_ACTIVA: activa, PRENSA_LANG: 'es', PRENSA_PAIS: 'ES', PRENSA_DEBOUNCE_MS: 1500,
      ULT_FILTRADAS: [], ULT_CTX: null,
      paraPrensa, prensaCacheKey: s => s, prensaCacheGet: () => (cache ? [] : null),
      buscarEnPrensa: () => ({ then: fn => fn(estado.respuesta) }),
      _itemDePrensa: it => it, _mergearItemsEnNoticias: items => items.length, hidratarNoticias() {},
      aplicarFiltros: () => { estado.filtrados++; }, renderizar: () => { estado.pintados++; },
      t: s => s, document: { getElementById: () => null },
      setTimeout: (fn, ms) => estado.timers.push({ fn, ms }), clearTimeout: () => { estado.canceladas++; },
    };
    runInNewContext(`${codigo}\nthis.programar = programarPrensa; this.clave = _clavePrensa; this.estadoPrensa = _estadoPrensa;`, ctx);
    const programar = (q = 'incendio') => {
      const c = interpretarConsulta(q);
      ctx.ULT_CTX = { clavePrensa: ctx.clave(c) };   // lo que deja aplicarFiltros
      ctx.programar(c);
    };
    const enCurso = () => { ctx.PRENSA_ABORT = { abort: () => { estado.abortadas++; } }; };
    const responder = res => { estado.respuesta = res; estado.timers.at(-1).fn(); };
    return { ctx, estado, programar, enCurso, responder };
  }

  test(`${archivo}: encendida busca siempre, con la espera de tecleo; apagada, nunca`, () => {
    const s = crear();
    s.programar();
    assert.equal(s.estado.timers.length, 1);
    assert.equal(s.estado.timers[0].ms, 1500);
    assert.equal(s.ctx.estadoPrensa(), 'prensaBuscando');
    const off = crear({ activa: false });
    off.programar();
    assert.equal(off.estado.timers.length, 0);
    assert.equal(off.ctx.estadoPrensa(), '');
  });

  test(`${archivo}: lo que está en caché no espera`, () => {
    const s = crear({ cache: true });
    s.programar();
    assert.equal(s.estado.timers[0].ms, 0);
  });

  // Cada llegada (R2, archivo, la propia prensa) vuelve a llamar a aplicarFiltros
  // y, con él, a programarPrensa: no debe volver a pedir lo mismo.
  test(`${archivo}: la misma consulta no se vuelve a programar ni se repite una vez hecha`, () => {
    const s = crear();
    s.programar();
    s.programar();
    assert.equal(s.estado.timers.length, 1);
    s.responder({ items: [{ t: 'Arde una nave' }] });
    assert.equal(s.estado.filtrados, 1);
    assert.equal(s.ctx.estadoPrensa(), '');
    s.programar();
    assert.equal(s.estado.timers.length, 1);
    s.programar('incendio forestal');                // otra consulta: sí
    assert.equal(s.estado.timers.length, 2);
  });

  test(`${archivo}: sin noticias, el vacío deja de «buscar» sin volver a filtrar`, () => {
    const s = crear();
    s.programar();
    s.responder({ items: [] });
    assert.equal(s.estado.filtrados, 0);
    assert.equal(s.estado.pintados, 1);
    assert.equal(s.ctx.PRENSA_HECHA, s.ctx.ULT_CTX.clavePrensa);
  });

  test(`${archivo}: un fallo se indica y no se repite solo; otra búsqueda o volver a ella lo reintenta`, () => {
    const s = crear();
    s.programar();
    s.responder(null);
    assert.equal(s.ctx.estadoPrensa(), 'prensaFallo');
    s.programar();                                   // llega el archivo: no se insiste
    assert.equal(s.estado.timers.length, 1);
    s.programar('arde');
    s.programar();
    assert.equal(s.estado.timers.length, 3);
    assert.equal(s.ctx.estadoPrensa(), 'prensaBuscando');
  });

  test(`${archivo}: otro idioma o país es otra petición`, () => {
    const s = crear();
    s.programar();
    s.ctx.PRENSA_LANG = 'gl';
    s.programar();
    assert.equal(s.estado.timers.length, 2);
    assert.match(s.ctx.PRENSA_CLAVE, /\|gl\|ES$/);
  });

  test(`${archivo}: apagar cancela la petición programada y la que está en camino`, () => {
    const s = crear();
    s.programar();
    s.enCurso();
    s.ctx.PRENSA_ACTIVA = false;
    s.programar();
    assert.equal(s.estado.abortadas, 1);
    assert.equal(s.ctx.PRENSA_CLAVE, null);
    assert.equal(s.ctx.PRENSA_TIMER, null);
    assert.equal(s.ctx.estadoPrensa(), '');
  });
}
