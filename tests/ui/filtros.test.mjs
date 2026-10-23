import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerAplicacion } from '../soporte/frontend.mjs';
import { runInNewContext } from 'node:vm';

for (const archivo of ['plantilla.html', 'public/index.html']) {
  const html = leerAplicacion(archivo);
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
      'filtros-count', 'btn-filtros',
    ].map(id => [`#${id}`, elemento(id === 'orden' ? 'recientes' : '')]));
    const icono = { href: '', setAttribute(_, v) { this.href = v; } };
    elementos['#btn-lectura'] = {
      attrs: {}, activo: false, title: '',
      classList: { toggle(_, v) { elementos['#btn-lectura'].activo = v; } },
      setAttribute(k, v) { this.attrs[k] = v; },
      querySelector: () => icono,
    };
    const guardado = new Map();
    const ctx = {
      $: id => elementos[id], HIDE_MODE: 'off', t: key => key,
      HIDE_MODES: ['off', 'read', 'viewed', 'both'], HIDE_ULTIMO_KEY: 'ultimo',
      localStorage: {
        getItem: k => guardado.get(k) ?? null,
        setItem: (k, v) => guardado.set(k, v),
      },
    };
    runInNewContext(funcion('actualizarFiltrosCount'), ctx);
    runInNewContext(funcion('hideModeUltimo'), ctx);
    runInNewContext(funcion('pintarBotonLectura'), ctx);
    return { ctx, elementos, icono, guardado };
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

  test(`${archivo}: el ojo marca la lectura activa y no suma en Filtros`, () => {
    const { ctx, elementos: e, icono } = crearContexto();
    const ojo = e['#btn-lectura'];
    for (const modo of ['read', 'viewed', 'both']) {
      ctx.HIDE_MODE = modo;
      ctx.pintarBotonLectura();
      ctx.actualizarFiltrosCount();
      assert.equal(ojo.activo, true);
      assert.equal(ojo.attrs['aria-pressed'], 'true');
      assert.equal(icono.href, '#i-eye-off');
      assert.equal(e['#filtros-count'].dataset.count, '0');
    }
    ctx.HIDE_MODE = 'off';
    ctx.pintarBotonLectura();
    assert.equal(ojo.activo, false);
    assert.equal(ojo.attrs['aria-pressed'], 'false');
    assert.equal(icono.href, '#i-eye');
  });

  test(`${archivo}: el ojo vuelve al último modo de ocultar, o a leídos`, () => {
    const { ctx, guardado } = crearContexto();
    assert.equal(ctx.hideModeUltimo(), 'read');
    guardado.set('ultimo', 'both');
    assert.equal(ctx.hideModeUltimo(), 'both');
    guardado.set('ultimo', 'off');
    assert.equal(ctx.hideModeUltimo(), 'read');
  });

  test(`${archivo}: cambiar lectura sincroniza Filtros y Ajustes y persiste`, () => {
    const { ctx, guardado } = crearContexto();
    const llamadas = [];
    Object.assign(ctx, {
      guardarHideMode: () => llamadas.push(`guardar:${ctx.HIDE_MODE}`),
      pintarFiltroLectura: () => llamadas.push('filtros'),
      ajPintarVista: () => llamadas.push('ajustes'),
      pintarBotonLectura: () => llamadas.push('ojo'),
      aplicarFiltros: () => llamadas.push('resultados'),
    });
    runInNewContext(funcion('ponerHideMode'), ctx);
    ctx.ponerHideMode('viewed');
    assert.deepEqual(llamadas, ['guardar:viewed', 'filtros', 'ajustes', 'ojo', 'resultados']);
    assert.equal(guardado.get('ultimo'), 'viewed');
    ctx.ponerHideMode('off');
    assert.equal(guardado.get('ultimo'), 'viewed');
    ctx.ponerHideMode('invalido');
    assert.equal(ctx.HIDE_MODE, 'off');
    assert.equal(llamadas.length, 10);
  });
}
