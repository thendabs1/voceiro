import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerAplicacion } from '../soporte/frontend.mjs';
import { runInNewContext } from 'node:vm';

const html = leerAplicacion();
const paginacion = html.slice(html.indexOf('let DIAS_ACTUAL = 0;'), html.indexOf('let _cargandoMas'));
const carga = html.slice(html.indexOf('async function solicitarMas('), html.indexOf('function actualizarBotonCargarMas()'));
const boton = html.slice(html.indexOf('function actualizarBotonCargarMas()'), html.indexOf('\n\nfunction wireResultadosDelegation()', html.indexOf('function actualizarBotonCargarMas()')));

function preparar(){
  const btn = { dataset: {}, disabled: false, textContent: '' };
  const wrap = { style: {} };
  let filtrados = 0;
  const ctx = {
    DIAS_MEMORIA: 3, _manifest: { dias: Array(100) },
    _cargandoMas: false,
    document: { getElementById: id => id === 'btn-cargar-mas' ? btn : wrap },
    $: () => ({ value: 'consulta' }),
    preprocesarInput: x => x, parseQuery: x => x,
    capasRequeridas: () => new Set(['grupo:galicia']),
    extenderCapasR2: async () => {}, aplicarFiltros: () => { filtrados++; },
    console,
  };
  runInNewContext(`${paginacion}\n${carga}\n${boton}
    this.ajustar = ajustarDiasActual;
    this.solicitar = solicitarMas;
    this.actualizar = actualizarBotonCargarMas;
    this.cargar = cargarMas;
    this.estado = () => ({ dias: DIAS_ACTUAL, clave: DIAS_CAPAS_KEY });`, ctx);
  return { ctx, btn, wrap, get filtrados(){ return filtrados; } };
}

test('cambiar de modo reinicia el tramo pendiente; refiltrar el mismo modo lo conserva', async () => {
  const s = preparar();
  s.ctx.ajustar(new Set(['grupo:galicia']));
  assert.equal(s.ctx.estado().dias, 3);
  await s.ctx.cargar();
  assert.equal(s.ctx.estado().dias, 33);
  s.ctx.ajustar(new Set(['grupo:galicia']));
  assert.equal(s.ctx.estado().dias, 33);
  s.ctx.ajustar(new Set(['grupo:andalucia']));
  assert.equal(s.ctx.estado().dias, 3);
});

test('una carga antigua no adelanta el contador del modo nuevo', async () => {
  const s = preparar();
  s.ctx.ajustar(new Set(['grupo:galicia']));
  let terminar;
  s.ctx.extenderCapasR2 = () => new Promise(resolve => { terminar = resolve; });
  const pedido = s.ctx.cargar();
  s.ctx.ajustar(new Set(['grupo:andalucia']));
  terminar();
  await pedido;
  assert.equal(s.ctx.estado().dias, 3);
  assert.equal(s.filtrados, 0);
});

test('el botón muestra la carga incluso si otro filtrado lo repinta', async () => {
  const s = preparar();
  s.ctx.ajustar(new Set(['grupo:galicia']));
  let terminar;
  const pedido = s.ctx.solicitar(() => new Promise(resolve => { terminar = resolve; }));
  assert.equal(s.btn.disabled, true);
  assert.equal(s.btn.textContent, 'Cargando…');
  s.ctx.actualizar();
  assert.equal(s.btn.disabled, true);
  terminar();
  await pedido;
  assert.equal(s.btn.disabled, false);
  assert.match(s.btn.textContent, /3\/100 días/);
});
