import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerAplicacion } from '../soporte/frontend.mjs';
import { runInNewContext } from 'node:vm';
import { parseQuery } from '../../shared/parser.js';
import { interpretarConsulta } from '../../shared/busqueda/consulta.js';
import { I18N, traducir } from '../../front/idiomas/index.js';

const html = leerAplicacion();
const paginacion = html.slice(html.indexOf('let DIAS_ACTUAL = 0;'), html.indexOf('let _cargandoMas'));
const carga = html.slice(html.indexOf('async function solicitarMas('), html.indexOf('function actualizarBotonCargarMas()'));
const boton = html.slice(html.indexOf('function actualizarBotonCargarMas()'), html.indexOf('\n\nfunction wireResultadosDelegation()', html.indexOf('function actualizarBotonCargarMas()')));
const funcion = nombre => {
  const i = html.indexOf(`function ${nombre}(`);
  return html.slice(html.slice(i - 6, i) === 'async ' ? i - 6 : i, html.indexOf('\n}', i) + 2);
};
const catalogo = {
  'a.test': { n: 'Medio A', g: 'Nacional' },
  'b.test': { n: 'Medio B', g: 'Nacional' },
};
function preparar(){
  const btn = { disabled: false, textContent: '' }, wrap = { style: {} };
  let filtrados = 0, raw;
  const avisos = [];
  const ctx = {
    DIAS_MEMORIA: 3, _manifest: { dias: Array.from({length: 30}, (_, i) => ({ fecha: String(i) })) },
    _scopeGeneration: 1, _cargandoMas: false, LAYERS: new Map(), AbortController,
    document: { getElementById: id => id === 'btn-cargar-mas' ? btn : wrap },
    $: () => ({ value: raw }), preprocesarInput: x => x, parseQuery,
    asegurarCapas: async () => {}, extenderCapasR2: async () => {},
    aplicarFiltros: () => { filtrados++; },
    t: (k, v) => traducir('es', k, v), toast: msg => avisos.push(msg),
    console: { warn() {} },
  };
  runInNewContext(`${paginacion}\n${carga}\n${boton}
    this.ajustar = ajustarDiasActual; this.historico = capasHistorico;
    this.solicitar = solicitarMas; this.actualizar = actualizarBotonCargarMas;
    this.cargar = cargarMas; this.estado = () => DIAS_ACTUAL;`, ctx);
  const buscar = q => {
    raw = q;
    ctx.ULT_CTX = { consulta: interpretarConsulta(q, { catalogo }) };
    const capas = ctx.historico(parseQuery(q));
    for (const c of capas) ctx.LAYERS.set(c, {});
    ctx.ajustar(capas);
    ctx.actualizar();
  };
  buscar('web:a.test');
  return { ctx, btn, wrap, buscar, avisos, get filtrados(){ return filtrados; } };
}

test('solo un medio explícito ofrece histórico: ni Todo, ni grupos, ni varios medios', () => {
  const s = preparar();
  for (const q of ['', 'elecciones', 'grupo:nacional', 'web:a.test web:b.test', 'medio:inexistente']) {
    s.buscar(q);
    assert.equal(s.wrap.style.display, 'none', q);
  }
  for (const q of ['web:a.test', 'medio:"Medio A"', 'web:a.test elecciones desde:2026-10-01']) {
    s.buscar(q);
    assert.equal(s.wrap.style.display, '', q);
    assert.equal(s.btn.textContent, I18N.es.historicoAnteriores);
  }
});

test('el histórico ignora los grupos del modo y carga solo el dominio elegido', () => {
  const s = preparar();
  s.ctx.PRESET_ACTIVO = true;
  s.ctx.PRESET = { grupos: ['Nacional'], overrides: { 'b.test': 'include' } };
  assert.deepEqual([...s.ctx.historico(parseQuery('web:a.test'))], ['dominio:a.test']);
});

test('amplía de siete en siete, conserva el tramo al buscar en el mismo medio y se oculta al agotar', async () => {
  const s = preparar();
  const rangos = [];
  s.ctx.extenderCapasR2 = async (capas, desde, hasta) => rangos.push([[...capas], desde, hasta]);
  await s.ctx.cargar();
  assert.equal(s.ctx.estado(), 10);
  s.buscar('web:a.test elecciones');
  assert.equal(s.ctx.estado(), 10);
  await s.ctx.cargar(); await s.ctx.cargar(); await s.ctx.cargar();
  assert.equal(s.ctx.estado(), 30);
  assert.deepEqual(rangos.map(x => x.slice(1)), [[3,10],[10,17],[17,24],[24,30]]);
  s.ctx.actualizar();
  assert.equal(s.wrap.style.display, 'none');
  s.buscar('web:b.test');
  assert.equal(s.ctx.estado(), 3);
});

test('cambiar de medio y volver mientras carga no adelanta el cursor (A → B → A)', async () => {
  const s = preparar();
  let terminar;
  let iniciada;
  const inicio = new Promise(resolve => { iniciada = resolve; });
  s.ctx.extenderCapasR2 = () => new Promise(resolve => { terminar = resolve; iniciada(); });
  const pedido = s.ctx.cargar();
  await inicio;
  s.buscar('web:b.test'); s.buscar('web:a.test');
  terminar(); await pedido;
  assert.equal(s.ctx.estado(), 3);
  assert.equal(s.filtrados, 0);
});

test('fallar permite reintentar el mismo tramo y un doble clic no duplica la carga', async () => {
  const s = preparar();
  let terminar, llamadas = 0;
  s.ctx.extenderCapasR2 = () => { llamadas++; return new Promise((resolve, reject) => { terminar = reject; }); };
  const pedido = s.ctx.solicitar(s.ctx.cargar);
  await Promise.resolve();
  await s.ctx.solicitar(s.ctx.cargar);
  s.ctx.actualizar();
  assert.equal(llamadas, 1);
  assert.equal(s.btn.disabled, true);
  assert.equal(s.btn.textContent, I18N.es.historicoCargando);
  terminar(new Error('red')); await pedido;
  assert.equal(s.ctx.estado(), 3);
  assert.equal(s.btn.disabled, false);
  assert.equal(s.btn.textContent, I18N.es.historicoReintentar);
  assert.equal(s.avisos.length, 1);
  s.ctx.extenderCapasR2 = async () => {};
  await s.ctx.solicitar(s.ctx.cargar);
  assert.equal(s.ctx.estado(), 10);
});

function extension(){
  const s = preparar();
  const mezclas = [];
  Object.assign(s.ctx, {
    _ficheroDeCapaEnDia: d => d.fecha, MEDIOS: {},
    _fetchJSON: async () => ({ noticias: [{}] }),
    _mergearItemsEnNoticias: items => { mezclas.push(items); return items.length; },
    hidratarNoticias(){}, construirMediosUnicos(){}, construirIndicesBusqueda(){},
    ajRuta: () => '', _itemsCargadosDeCapas: 0, LAYER_MAX_ITEMS: 40000,
  });
  runInNewContext(funcion('extenderCapasR2'), s.ctx);
  return { ...s, mezclas };
}

test('una descarga parcial fallida no mezcla ni adelanta; reintentar recupera todos los días', async () => {
  const s = extension();
  s.ctx._fetchJSON = async f => { if (f === '5') throw new Error('red'); return { noticias: [{}] }; };
  await s.ctx.solicitar(s.ctx.cargar);
  assert.equal(s.ctx.estado(), 3);
  assert.equal(s.mezclas.length, 0);
  s.ctx._fetchJSON = async () => ({ noticias: [{}] });
  await s.ctx.solicitar(s.ctx.cargar);
  assert.equal(s.ctx.estado(), 10);
  assert.equal(s.mezclas[0].length, 7);
});

test('la ampliación no rebasa el límite ni incorpora resultados de otra vista', async () => {
  const s = extension();
  s.ctx._itemsCargadosDeCapas = 39999;
  await s.ctx.solicitar(s.ctx.cargar);
  assert.equal(s.ctx.estado(), 3);
  assert.equal(s.mezclas.length, 0);
  assert.equal(s.avisos[0], I18N.es.historicoLimite);
  s.ctx._itemsCargadosDeCapas = 0;
  s.ctx._fetchJSON = async () => { s.buscar('web:b.test'); return { noticias: [{}] }; };
  await s.ctx.solicitar(s.ctx.cargar);
  assert.equal(s.mezclas.length, 0);
});

test('el transporte distingue un 404 de un fallo y conserva el comportamiento de las otras cargas', async () => {
  const ctx = { DATA_BASE: 'https://datos.test', BACKEND_TIMEOUT_CF_MS: 10, BACKEND_ACTIVO: 'deno',
    _signalConTimeout(){}, fetch: async () => ({status:404}),
  };
  runInNewContext(funcion('_fetchJSON'), ctx);
  assert.equal(await ctx._fetchJSON('d-a.test.json', undefined, true), null);
  ctx.fetch = async () => ({status:503, ok:false});
  await assert.rejects(ctx._fetchJSON('x', undefined, true), /HTTP 503/);
  assert.equal(await ctx._fetchJSON('x'), null);
  ctx.fetch = async () => ({status:429, ok:false});
  await assert.rejects(ctx._fetchJSON('x', undefined, true), /HTTP 429/);
});

test('el transporte conserva el respaldo a Deno antes de declarar un fallo', async () => {
  let llamadas = 0;
  const ctx = { DATA_BASE: 'https://datos.test', BACKEND_TIMEOUT_CF_MS: 10, BACKEND_ACTIVO: 'cf',
    _signalConTimeout(){}, _conmutarBackendPorFallo: async () => { ctx.BACKEND_ACTIVO = 'deno'; },
    fetch: async () => ++llamadas === 1 ? {status:503,ok:false} : {status:200,ok:true,json:async()=>({noticias:[]})},
  };
  runInNewContext(funcion('_fetchJSON'), ctx);
  assert.ok(await ctx._fetchJSON('x', undefined, true));
  assert.equal(llamadas, 2);
});

test('el scroll añade los lotes locales y nunca pide histórico automáticamente', () => {
  let callback, retirado = false, peticiones = 0;
  const sentinel = { insertAdjacentHTML(){}, remove(){ retirado = true; } };
  const resultados = { innerHTML: '', appendChild(){} };
  const ctx = {
    PASE: null, ULT_FILTRADAS: [{},{}], NOTICIAS: [{},{}], RENDER_BATCH: 1,
    SENTINEL_OBSERVER: null, ACCES: {}, renderTotalR2(){}, pintarEstadoPrensa(){},
    t: () => '', $: id => id === '#resultados' ? resultados : {},
    document: { createElement: () => sentinel, getElementById: () => sentinel },
    IntersectionObserver: class { constructor(fn){callback=fn;} observe(){} disconnect(){} },
    renderItemHtml: () => '', observarNoticias(){}, actualizarBotonCargarMas(){},
    solicitarMas(){peticiones++;},
  };
  runInNewContext(funcion('renderizar')+'\n'+funcion('appendBatch')+'\nrenderizar();',ctx);
  assert.equal(ctx.RENDER_OFFSET, 1);
  callback([{isIntersecting:true}]);
  assert.equal(ctx.RENDER_OFFSET, 2);
  assert.equal(retirado, true);
  assert.equal(peticiones, 0);
});

test('espera a la capa inicial y descarta la ampliación si se recargó la base', async () => {
  const s = preparar();
  let liberar, extensiones = 0;
  s.ctx.asegurarCapas = () => new Promise(resolve => { liberar = resolve; });
  s.ctx.extenderCapasR2 = async () => { extensiones++; };
  const pedido = s.ctx.cargar();
  assert.equal(extensiones, 0);
  s.ctx._scopeGeneration++;
  liberar(); await pedido;
  assert.equal(extensiones, 0);
  assert.equal(s.ctx.estado(), 3);
});

test('un día sin fichero no bloquea el histórico y el tramo final avanza aunque esté vacío', async () => {
  const s = extension();
  s.ctx._fetchJSON = async () => null;
  await s.ctx.solicitar(s.ctx.cargar);
  assert.equal(s.ctx.estado(), 10);
  assert.equal(s.mezclas[0].length, 0);
});

test('una capa inicial vacía se registra y un fallo inicial no se da por cargado', async () => {
  const ctx = { console: {count(){}}, _manifest: {dias:[{}]}, DIAS_MEMORIA:3, DIAS_MEMORIA_MAX_SCOPE:30,
    _ficheroDeCapaEnDia:()=>'', _mergearItemsEnNoticias:()=>0, LAYERS:new Map(), _itemsCargadosDeCapas:0,
  };
  runInNewContext(funcion('_cargarCapa'), ctx);
  await ctx._cargarCapa('dominio:a.test', new AbortController().signal);
  assert.ok(ctx.LAYERS.has('dominio:a.test'));
  ctx.LAYERS.clear();
  ctx._ficheroDeCapaEnDia = () => 'x.json';
  ctx._fetchJSON = async () => { throw new Error('red'); };
  await assert.rejects(ctx._cargarCapa('dominio:a.test', new AbortController().signal), /red/);
  assert.equal(ctx.LAYERS.size, 0);
});
