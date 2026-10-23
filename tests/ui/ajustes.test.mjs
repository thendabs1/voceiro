import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { leerAplicacion } from '../soporte/frontend.mjs';

const codigo = leerAplicacion();
function cargar(ctx, ...nombres){
  for (const nombre of nombres){
    const inicio = codigo.indexOf(`function ${nombre}(`);
    assert.ok(inicio >= 0, nombre);
    runInNewContext(codigo.slice(inicio, codigo.indexOf('\n}', inicio) + 2), ctx);
  }
}

test('el catálogo y los dominios propios se pueden gestionar juntos sin duplicados', () => {
  const ctx = {
    MEDIOS_UNICOS: [{ dominio: 'diario.es', medio: 'Diario', grupo: 'Nacional' }],
    t: k => k,
  };
  cargar(ctx, 'mediosDelPanel');
  const medios = ctx.mediosDelPanel({ overrides: { 'diario.es': 'first', 'propio.es': 'ignore' } });
  assert.deepEqual(Array.from(medios, m => m.dominio), ['diario.es', 'propio.es']);
  assert.equal(medios[0].medio, 'Diario');
  assert.equal(medios[1].medio, 'propio.es');
  assert.equal(ctx.mediosDelPanel(null).length, 1);
});

test('buscar medios combina nombre, grupo y comportamiento del modo editado', () => {
  const filas = [
    { dataset: { dominio: 'uno.es', buscar: 'diario uno', grupo: 'Nacional' }, style: {} },
    { dataset: { dominio: 'dos.es', buscar: 'diario dos', grupo: 'Regional' }, style: {} },
    { dataset: { dominio: 'tres.es', buscar: 'revista tres', grupo: 'Nacional' }, style: {} },
  ];
  const elementos = {
    '#filtro-medio': { value: '' }, '#filtro-grupo-medio': { value: '' },
    '#filtro-estado-medio': { value: 'configurados' }, '#medios-vacio': {},
  };
  let visibles;
  const ctx = {
    $: s => elementos[s], normalize: s => s,
    document: { querySelectorAll: s => s.endsWith('.medio-fila') ? filas : [] },
    modoEnPanel: () => ({ overrides: { 'uno.es': 'first', 'dos.es': 'ignore' } }),
    actualizarResumen: n => { visibles = n; }, actualizarAddBar() {},
  };
  cargar(ctx, 'getOverride', 'filtrarMedios');
  ctx.filtrarMedios();
  assert.equal(visibles, 2);
  elementos['#filtro-grupo-medio'].value = 'Nacional';
  ctx.filtrarMedios();
  assert.equal(visibles, 1);
  assert.equal(filas[0].style.display, '');
  elementos['#filtro-estado-medio'].value = 'ignore';
  ctx.filtrarMedios();
  assert.equal(visibles, 0);
  assert.equal(elementos['#medios-vacio'].hidden, false);
  elementos['#filtro-grupo-medio'].value = '';
  elementos['#filtro-estado-medio'].value = '';
  elementos['#filtro-medio'].value = 'revista';
  ctx.filtrarMedios();
  assert.equal(visibles, 1);
  assert.equal(filas[2].style.display, '');
});

test('un dominio del catálogo oculto por los filtros no se ofrece como medio nuevo', () => {
  const elementos = {
    '#filtro-medio': { value: 'diario.es' },
    '#filtro-medio-add': { hidden: false }, '#filtro-medio-add-label': {},
  };
  const ctx = {
    $: s => elementos[s], MEDIOS_UNICOS: [{ dominio: 'diario.es' }],
    modoEnPanel: () => ({ overrides: {} }),
  };
  cargar(ctx, 'normalizarDominioInput', 'actualizarAddBar');
  ctx.actualizarAddBar(0);
  assert.equal(elementos['#filtro-medio-add'].hidden, true);
});

test('cambiar de editor guarda los temas pendientes en su modo antes de abrir otro', () => {
  const primero = { id: 'a', palabras: [] }, segundo = { id: 'b', palabras: ['deportes'] };
  const elementos = Object.fromEntries([
    '#filtro-medio', '#filtro-grupo-medio', '#filtro-estado-medio', '#ov-pegar',
    '#aj-bloque-temas', '#aj-bloque-medios', '#aj-bloque-grupos',
  ].map(k => [k, { value: 'anterior' }]));
  elementos['#aj-temas'] = { dataset: { modoId: 'a' }, value: 'cultura\nciencia' };
  let guardados = 0, pintados = 0;
  const ctx = {
    $: s => elementos[s], PRESETS: { lista: [primero, segundo] }, MODO_EDITADO: 'a',
    _ajTemasTimer: 123, clearTimeout() {},
    guardarPresets: () => guardados++, ajModoCambiado() {},
    ajRuta: () => 'modo', ajPintar: () => pintados++,
  };
  cargar(ctx, 'parseLista', 'ajGuardarTemas', 'ajEditarModo');
  ctx.ajEditarModo('b');
  assert.deepEqual(Array.from(primero.palabras), ['cultura', 'ciencia']);
  assert.deepEqual(segundo.palabras, ['deportes']);
  assert.equal(ctx.MODO_EDITADO, 'b');
  assert.equal(guardados, 1);
  assert.equal(pintados, 1);
  assert.equal(elementos['#filtro-estado-medio'].value, '');
  assert.equal(elementos['#aj-bloque-medios'].open, true);
});
