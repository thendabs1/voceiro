import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { leerAplicacion } from '../soporte/frontend.mjs';
import { normalizarRegla, compilarRegla } from '../../shared/busqueda/reglas.js';
import { compilarTemas, temasQueCasan } from '../../shared/busqueda/temas.js';
import { palabrasDe } from '../../shared/busqueda/texto.js';
import { fusionarModos } from '../../shared/sync/fusion.js';

const codigo = leerAplicacion();
const copia = v => JSON.parse(JSON.stringify(v));
function cargar(ctx, ...nombres){
  for (const nombre of nombres){
    const inicio = codigo.indexOf(`function ${nombre}(`);
    assert.ok(inicio >= 0, nombre);
    runInNewContext(codigo.slice(inicio, codigo.indexOf('\n}', inicio) + 2), ctx);
  }
}
function contexto(){
  const ctx = { normalizarRegla, compilarRegla, compilarTemas, temasQueCasan, palabrasDe,
    t: k => k, crypto: { randomUUID: () => 'prueba' },
    ASISTENTE_MODO: { paso: 0, tipo: 'temas', fuentes: 'elegidas', grupos: ['Economía'],
      overrides: {}, textoTemas: 'vivienda', nombre: 'Vivienda' },
  };
  cargar(ctx, 'parseLista', 'overrideIncluye', 'normalizarPreset', 'pasosAsistente', 'modoAsistente', 'errorAsistente');
  return ctx;
}

test('un borrador se puede corregir y probar sin tocar los modos ni compartir sus objetos', () => {
  const ctx = contexto(), guardado = { id: 'actual', grupos: ['Deportes'], palabras: ['futbol'] };
  ctx.PRESETS = { lista: [guardado] };
  const m = ctx.modoAsistente();
  m.grupos.push('Ciencia'); m.overrides['otro.es'] = 'include'; m.palabras.push('alquiler');
  assert.deepEqual(copia(ctx.PRESETS.lista), [guardado]);
  assert.deepEqual(copia(ctx.ASISTENTE_MODO.grupos), ['Economía']);
  assert.deepEqual(copia(ctx.ASISTENTE_MODO.overrides), {});
  assert.equal(ctx.ASISTENTE_MODO.textoTemas, 'vivienda');
});

test('la guía rechaza fuentes vacías y cada línea de tema inválida antes de guardar', () => {
  const ctx = contexto(), b = ctx.ASISTENTE_MODO;
  b.grupos = []; b.overrides = { 'callado.es': 'ignore' };
  assert.equal(ctx.errorAsistente('fuentes'), 'asSinFuentes');
  b.fuentes = 'todas';
  assert.equal(ctx.errorAsistente('fuentes'), '');
  for (const texto of ['', '-forestal', 'vivienda\nmedio:diario.es']){
    b.textoTemas = texto;
    assert.equal(ctx.errorAsistente('temas'), 'asTemasInvalidos');
  }
  b.textoTemas = 'vivienda\nIA -PP';
  assert.equal(ctx.errorAsistente('temas'), '');
  b.nombre = '   ';
  assert.equal(ctx.errorAsistente('resumen'), 'asNombreFalta');
});

test('seguir medios omite palabras de un intento anterior y no exige el paso de temas', () => {
  const ctx = contexto(); ctx.ASISTENTE_MODO.tipo = 'medios';
  assert.deepEqual(copia(ctx.pasosAsistente()), ['intencion', 'fuentes', 'resumen']);
  assert.deepEqual(copia(ctx.modoAsistente().palabras), []);
  assert.equal(ctx.errorAsistente('resumen'), '');
});

test('confirmar crea exactamente un modo con la misma regla probada y lo activa', () => {
  const ctx = contexto(), elementos = { '#as-error': {} }, activados = [];
  ctx.$ = s => elementos[s]; ctx.PRESETS = { lista: [{ id: 'anterior' }] };
  ctx.AJ_PILA = ['modos', 'asistente'];
  ctx.activarModo = id => activados.push(id); ctx.ajPintar = () => {}; ctx.toast = () => {};
  cargar(ctx, 'guardarAsistenteModo');
  const antes = ctx.modoAsistente();
  ctx.guardarAsistenteModo(); ctx.guardarAsistenteModo();
  assert.equal(ctx.PRESETS.lista.length, 2);
  assert.deepEqual(copia(ctx.PRESETS.lista[1]), { id: 'm-prueba', ...copia(antes) });
  assert.deepEqual(activados, ['m-prueba']);
  assert.equal(ctx.ASISTENTE_MODO, null);
  assert.equal(ctx.AJ_PILA[1], 'modo');
});

test('las reglas sobreviven a normalización, exportación JSON y fusión entre dispositivos', () => {
  const ctx = contexto();
  const a = ctx.normalizarPreset({ ...ctx.modoAsistente(), id: 'vivienda', actualizado: 100 });
  const b = ctx.normalizarPreset({ ...a, palabras: ['alquiler'], actualizado: 200 });
  const fusion = fusionarModos({ lista: [JSON.parse(JSON.stringify(a))] }, { lista: [b] }, 300);
  const restaurado = ctx.normalizarPreset(fusion.lista[0]);
  assert.deepEqual(copia(restaurado.regla), { v: 1, fuentes: 'elegidas' });
  assert.equal(compilarRegla(restaurado).pasa({ dominio: 'a.es', grupo: 'Economía', titular: 'Sube el alquiler' }), true);
  assert.equal(compilarRegla(restaurado).pasa({ dominio: 'a.es', grupo: 'Economía', titular: 'Nueva vivienda' }), false);
  assert.equal('regla' in ctx.normalizarPreset({ id: 'viejo', grupos: ['Economía'] }), false);
});

test('la prueba usa los datos propios cargados e ignora la prensa de una consulta', () => {
  const ctx = contexto(), elementos = Object.fromEntries([
    '#as-seleccion-resumen', '#as-preview-count', '#as-preview',
  ].map(k => [k, {}]));
  ctx.$ = s => elementos[s];
  ctx.escapeHtml = s => String(s).replaceAll('<', '&lt;');
  ctx._soloDeConsulta = n => n._capas.size === 1 && n._capas.has('prensa');
  ctx.NOTICIAS = [
    { dominio: 'a.es', grupo: 'Economía', titular: 'Nueva vivienda', _capas: new Set(['base']) },
    { dominio: 'a.es', grupo: 'Economía', titular: 'Vivienda externa', _capas: new Set(['prensa']) },
    { dominio: 'a.es', grupo: 'Economía', titular: 'Sube la bolsa', _capas: new Set(['base']) },
    { dominio: 'b.es', grupo: 'Nacional', titular: 'Vivienda nacional', _capas: new Set(['base']) },
  ];
  cargar(ctx, 'pintarPruebaAsistente');
  ctx.pintarPruebaAsistente();
  assert.match(elementos['#as-preview'].innerHTML, /Nueva vivienda/);
  assert.doesNotMatch(elementos['#as-preview'].innerHTML, /externa|bolsa|nacional/);
});

test('feed y vista Temas respetan las fuentes de la regla y los modos anteriores conservan la suma', () => {
  const ctx = contexto();
  const viejo = { id: 'viejo', grupos: ['Economía'], palabras: ['vivienda'], overrides: {} };
  const nuevo = { ...viejo, id: 'nuevo', regla: { v: 1, fuentes: 'elegidas' } };
  ctx.PRESETS = { lista: [viejo, nuevo] }; ctx.PRESET = nuevo;
  ctx.SET_GRUPOS = new Set(); ctx.TEMAS_VER = 0; ctx.TEMAS_TODOS = [];
  cargar(ctx, 'getOverride', 'recompilarTemas', 'recompilarPreset', '_temasDe', 'cumplePreset');
  ctx.recompilarPreset();
  const fuera = { dominio: 'otro.es', grupo: 'Nacional', titular: 'Nueva vivienda' };
  assert.equal(ctx.cumplePreset(fuera), false);
  assert.deepEqual(copia(ctx._temasDe(fuera)), [{ id: 'viejo', etiqueta: 'vivienda' }]);
  const dentro = { dominio: 'economico.es', grupo: 'Economía', titular: 'Sube la bolsa' };
  assert.equal(ctx.cumplePreset(dentro), false);
  ctx.PRESET = viejo; ctx.recompilarPreset();
  assert.equal(ctx.cumplePreset(fuera), true);
  assert.equal(ctx.cumplePreset(dentro), true);
  ctx.PRESET = nuevo; ctx.recompilarPreset();
  nuevo.overrides['otro.es'] = 'include'; ctx.recompilarTemas();
  assert.equal(ctx.cumplePreset(fuera), true);
  nuevo.overrides['otro.es'] = 'ignore'; ctx.recompilarTemas();
  assert.equal(ctx.cumplePreset(fuera), false);
});
