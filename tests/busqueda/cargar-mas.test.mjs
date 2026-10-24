import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerAplicacion } from '../soporte/frontend.mjs';
import { runInNewContext } from 'node:vm';

const html = leerAplicacion();
const paginacion = html.slice(html.indexOf('let DIAS_ACTUAL = 0;'), html.indexOf('let TURSO_OFFSET = 0;'));
const carga = html.slice(html.indexOf('async function solicitarMas('), html.indexOf('// ─── Paginación Turso ───'));
const boton = html.slice(html.indexOf('function actualizarBotonCargarMas()'), html.indexOf('\n\nfunction wireResultadosDelegation()', html.indexOf('function actualizarBotonCargarMas()')));
const archivo = html.slice(html.indexOf('async function ampliarArchivo()'), html.indexOf('function actualizarBotonCargarMas()'));

function preparar(){
  const btn = { dataset: {}, disabled: false, textContent: '' };
  const wrap = { style: {} };
  let filtrados = 0;
  const ctx = {
    DIAS_MEMORIA: 3, _manifest: { dias: Array(100) },
    _cargandoMas: false, ARCHIVO_ACTIVO: false,
    TURSO_RAW: 'incendio*', TURSO_HAY_MAS: false, TURSO_AMPLIAR_HASTA: '', TURSO_OFFSET: 0,
    ULT_QUERY_KEY: 'incendio', ULT_CTX: {},
    buscarEnWorker: async () => ({ items: [], nextOffset: null }),
    _mergearItemsEnNoticias: () => 0, _anexarItemsIncremental: () => false,
    document: { getElementById: id => id === 'btn-cargar-mas' ? btn : wrap },
    $: () => ({ value: 'consulta' }),
    preprocesarInput: x => x, parseQuery: x => x,
    capasRequeridas: () => new Set(['grupo:galicia']),
    extenderCapasR2: async () => {}, aplicarFiltros: () => { filtrados++; },
    console,
  };
  runInNewContext(`${paginacion}\n${carga}\n${archivo}\n${boton}
    this.ajustar = ajustarDiasActual;
    this.solicitar = solicitarMas;
    this.actualizar = actualizarBotonCargarMas;
    this.cargar = cargarMas;
    this.ampliar = ampliarArchivo;
    this.cargarArchivo = cargarMasDeTurso;
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

test('el histórico se amplía solo al pulsar y sin repetir el tramo reciente', async () => {
  const s = preparar();
  s.ctx.ARCHIVO_ACTIVO = true;
  s.ctx.capasRequeridas = () => new Set();
  s.ctx.TURSO_AMPLIAR_HASTA = '2026-09-24';
  s.ctx.TURSO_OFFSET = 100;
  const pedidas = [];
  s.ctx.buscarEnWorker = async (raw, opciones) => {
    pedidas.push({ raw, ...opciones });
    return { items: [{ u: '/antigua' }], nextOffset: 50 };
  };
  s.ctx.actualizar();
  assert.equal(s.btn.dataset.modo, 'historico');
  assert.equal(s.btn.textContent, 'Ampliar al histórico');
  assert.equal(pedidas.length, 0, 'repintar no consulta el histórico');
  await s.ctx.solicitar(s.ctx.ampliar);
  assert.equal(pedidas[0].raw, 'incendio* hasta:2026-09-24');
  assert.equal(pedidas[0].offset, 0);
  assert.equal(s.ctx.TURSO_AMPLIAR_HASTA, '');
  assert.equal(s.ctx.TURSO_OFFSET, 50);
  assert.equal(s.btn.dataset.modo, 'archivo');
  await s.ctx.solicitar(s.ctx.ampliar);
  assert.equal(pedidas.length, 1, 'ampliar dos veces no reinicia el histórico');
});

test('primero se paginan los 30 días y luego se ofrece ampliar', async () => {
  const s = preparar();
  s.ctx.ARCHIVO_ACTIVO = true;
  s.ctx.capasRequeridas = () => new Set();
  s.ctx.TURSO_HAY_MAS = true;
  s.ctx.TURSO_AMPLIAR_HASTA = '2026-09-24';
  s.ctx.actualizar();
  assert.equal(s.btn.dataset.modo, 'archivo');
  await s.ctx.ampliar();
  assert.equal(s.ctx.TURSO_RAW, 'incendio*');
  await s.ctx.cargarArchivo();
  assert.equal(s.btn.dataset.modo, 'historico');
});

test('una respuesta del histórico no cambia una búsqueda que ya es otra', async () => {
  const s = preparar();
  s.ctx.ARCHIVO_ACTIVO = true;
  s.ctx.TURSO_AMPLIAR_HASTA = '2026-09-24';
  let terminar;
  s.ctx.buscarEnWorker = () => new Promise(resolve => { terminar = resolve; });
  const pendiente = s.ctx.ampliar();
  s.ctx.TURSO_RAW = 'otra*';
  s.ctx.TURSO_OFFSET = 0;
  terminar({ items: [{ u: '/antigua' }], nextOffset: 50 });
  await pendiente;
  assert.equal(s.ctx.TURSO_OFFSET, 0);
  assert.equal(s.filtrados, 0);
});

test('la primera respuesta ofrece histórico incluso sin resultados recientes, salvo error', async () => {
  const inicio = html.indexOf('  const rawArchivo = consulta.imposible');
  const fin = html.indexOf('  // ── Filtrado', inicio);
  const codigo = html.slice(inicio, fin);
  for (const errorArchivo of [false, true]) {
    const s = preparar();
    s.ctx.ARCHIVO_ACTIVO = true;
    s.ctx.TURSO_RAW = '';
    s.ctx.capasRequeridas = () => new Set();
    let terminar;
    let ejecutar;
    Object.assign(s.ctx, {
      consulta: { imposible: false }, usarTurso: true,
      paraArchivo: () => 'incendio*', _archivoTimer: null, ARCHIVO_PAUSA_MS: 700,
      setTimeout: fn => { ejecutar = fn; return 1; }, clearTimeout() {},
      buscarEnWorker: () => new Promise(resolve => { terminar = resolve; }),
    });
    runInNewContext(codigo, s.ctx);
    ejecutar();
    terminar({ items: [], archivoDesde: '2026-03-01', errorArchivo });
    await Promise.resolve();
    assert.equal(s.ctx.TURSO_AMPLIAR_HASTA, errorArchivo ? '' : '2026-02-28');
    assert.equal(s.wrap.style.display, errorArchivo ? 'none' : '');
  }
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
