import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

for (const archivo of ['plantilla.html', 'public/index.html']) {
  const html = readFileSync(new URL(`../../${archivo}`, import.meta.url), 'utf8');
  const funcion = nombre => html.slice(
    html.indexOf(`function ${nombre}(`),
    html.indexOf('\n}', html.indexOf(`function ${nombre}(`)) + 2,
  );
  const elemento = (value = '') => ({
    value, dataset: {}, classList: { toggle() {} }, setAttribute() {},
  });
  const crearContexto = () => {
    const elementos = Object.fromEntries([
      'grupo', 'tipo', 'rango', 'orden', 'fecha-desde', 'fecha-hasta',
      'filtros-count', 'btn-filtros', 'lectura-activa',
    ].map(id => [`#${id}`, elemento(id === 'orden' ? 'recientes' : '')]));
    const ctx = { $: id => elementos[id], HIDE_MODE: 'off', t: key => key };
    runInNewContext(funcion('actualizarFiltrosCount'), ctx);
    return { ctx, elementos };
  };

  test(`${archivo}: fechas cuentan sin duplicar período y fecha desde`, () => {
    const { ctx, elementos: e } = crearContexto();
    ctx.actualizarFiltrosCount();
    assert.equal(e['#filtros-count'].dataset.count, '0');
    e['#fecha-desde'].value = '2026-10-01';
    e['#fecha-hasta'].value = '2026-10-20';
    ctx.actualizarFiltrosCount();
    assert.equal(e['#filtros-count'].dataset.count, '2');
    e['#rango'].value = '1';
    ctx.actualizarFiltrosCount();
    assert.equal(e['#filtros-count'].dataset.count, '2');
  });

  test(`${archivo}: lectura deja un indicador visible y se puede restablecer`, () => {
    const { ctx, elementos: e } = crearContexto();
    for (const modo of ['read', 'viewed', 'both']) {
      ctx.HIDE_MODE = modo;
      ctx.actualizarFiltrosCount();
      assert.equal(e['#lectura-activa'].hidden, false);
      assert.equal(e['#filtros-count'].dataset.count, '1');
    }
    ctx.HIDE_MODE = 'off';
    ctx.actualizarFiltrosCount();
    assert.equal(e['#lectura-activa'].hidden, true);
    assert.equal(e['#filtros-count'].dataset.count, '0');
  });

  test(`${archivo}: cambiar lectura sincroniza Filtros y Ajustes y persiste`, () => {
    const { ctx } = crearContexto();
    const llamadas = [];
    Object.assign(ctx, {
      HIDE_MODES: ['off', 'read', 'viewed', 'both'],
      guardarHideMode: () => llamadas.push(`guardar:${ctx.HIDE_MODE}`),
      pintarFiltroLectura: () => llamadas.push('filtros'),
      ajPintarVista: () => llamadas.push('ajustes'),
      aplicarFiltros: () => llamadas.push('resultados'),
    });
    runInNewContext(funcion('ponerHideMode'), ctx);
    ctx.ponerHideMode('read');
    assert.deepEqual(llamadas, ['guardar:read', 'filtros', 'ajustes', 'resultados']);
    ctx.ponerHideMode('invalido');
    assert.equal(ctx.HIDE_MODE, 'read');
    assert.equal(llamadas.length, 4);
  });
}
