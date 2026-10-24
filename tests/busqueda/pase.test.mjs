import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerAplicacion } from '../soporte/frontend.mjs';
import { runInNewContext } from 'node:vm';

// Ejecuta el controlador real con un reloj y elementos mínimos, sin red.
function preparar(visible = 0, { tapa = 0, alto = 100 } = {}) {
  const html = leerAplicacion();
  const codigo = html.slice(html.indexOf('let PASE = null;'), html.indexOf('\nfunction renderizar(){'));
  assert.ok(codigo.startsWith('let PASE = null;'));
  const vistas = [], leidas = [], guardadas = [], timers = new Map(), eventos = {}, almacen = new Map();
  let id = 0, filtrados = 0, repintados = 0;
  function elemento() {
    const hijos = new Map(), listeners = {};
    return {
      style: {}, dataset: {}, scrollHeight: 100, clientHeight: 100,
      querySelector(s) { if (!hijos.has(s)) hijos.set(s, elemento()); return hijos.get(s); },
      setAttribute() {}, removeAttribute() {}, matches() { return false; }, closest() { return null; },
      addEventListener(tipo, fn) { listeners[tipo] = fn; },
      emitir(tipo, e) { listeners[tipo]?.(e); },
      focus() {}, showModal() { this.open = true; }, close() { this.open = false; },
      remove() { this.removed = true; },
      getBoundingClientRect: () => ({ top: 0, bottom: tapa }),
    };
  }
  const tarjetas = Array.from({ length: 3 }, (_, i) => ({
    dataset: { idx: String(i) },
    getBoundingClientRect: () => ({ top: (i - visible) * 100, bottom: (i - visible + 1) * 100 }),
  }));
  const body = elemento();
  body.appendChild = () => {};
  const ctx = {
    document: {
      body, hidden: false, createElement: elemento,
      querySelectorAll: () => tarjetas,
      addEventListener: (tipo, fn) => { eventos[tipo] = fn; },
    },
    window: { innerHeight: alto, addEventListener: (tipo, fn) => { eventos[tipo] = fn; } },
    ULT_FILTRADAS: Array.from({ length: 3 }, (_, i) => ({
      titular: `Titular ${i}`, enlace: `https://medio.test/${i}`, medio: 'Medio',
    })),
    t: s => s, escapeHtml: s => s, bionicize: s => { repintados++; return s; },
    localStorage: {
      getItem: k => almacen.get(k) ?? null,
      setItem: (k, v) => almacen.set(k, v),
    },
    PENDIENTES_MAP: new Map(), normalizeUrlForMatch: s => s,
    $: () => elemento(), cerrarMenuMas() {},
    marcarVistaLocal: url => vistas.push(url), persistirVistas() {},
    marcarLeidaLocal: url => leidas.push(url), registrarLeido() {}, pintarLeidasEnLista() {},
    guardarParaLeerDespues: n => guardadas.push(n.enlace),
    aplicarFiltros: () => { filtrados++; },
    setTimeout: (fn, ms) => { timers.set(++id, { fn, ms }); return id; },
    clearTimeout: id => timers.delete(id),
  };
  runInNewContext(`${codigo}\nthis.pase = { abrirPase, moverPase, cerrarPase, get actual(){ return PASE; } };`, ctx);
  return { pase: ctx.pase, ctx, vistas, leidas, guardadas, timers, eventos, almacen,
    get filtrados() { return filtrados; }, get repintados() { return repintados; } };
}

test(`el pase usa los resultados visibles y el ritmo elegido`, () => {
  const s = preparar(1);
  s.pase.abrirPase();
  assert.equal(s.pase.actual.lista.length, 2);
  assert.equal([...s.timers.values()][0].ms, 8000);
  [...s.timers.values()][0].fn();
  assert.equal(s.pase.actual.pos, 1);
  assert.deepEqual(s.vistas, ['https://medio.test/1']);
  assert.deepEqual(s.leidas, []);
  assert.equal(s.filtrados, 0);
  s.pase.actual.root.querySelector('[data-pase-ritmo]').oninput({ target: { value: '3' } });
  assert.equal([...s.timers.values()][0].ms, 3000);
});

test(`el deslizador muestra el tiempo y lo recuerda al volver a abrir`, () => {
  const s = preparar();
  s.pase.abrirPase();
  const root = s.pase.actual.root;
  const ritmo = root.querySelector('[data-pase-ritmo]');
  ritmo.oninput({ target: { value: '11' } });
  assert.equal(String(root.querySelector('[data-pase-segundos]').textContent), '11');
  assert.equal([...s.timers.values()][0].ms, 11000);
  assert.equal(s.almacen.size, 0);
  ritmo.onchange();
  assert.equal(s.almacen.get('voceiro-pase-segundos'), '11');
  s.pase.cerrarPase();
  s.pase.abrirPase();
  assert.equal(s.pase.actual.segundos, 11);
  assert.equal([...s.timers.values()][0].ms, 11000);
  assert.match(s.pase.actual.root.innerHTML, /value="11" data-pase-ritmo/);
});

test(`el pase tolera valores guardados inválidos y almacenamiento bloqueado`, () => {
  for (const valor of ['0', '2', '21', '-4', 'NaN', 'Infinity', '5.5', '']){
    const s = preparar();
    s.almacen.set('voceiro-pase-segundos', valor);
    s.pase.abrirPase();
    assert.equal(s.pase.actual.segundos, 8, valor);
  }
  const s = preparar();
  s.ctx.localStorage.getItem = s.ctx.localStorage.setItem = () => { throw new Error('bloqueado'); };
  s.pase.abrirPase();
  assert.equal(s.pase.actual.segundos, 8);
  const ritmo = s.pase.actual.root.querySelector('[data-pase-ritmo]');
  ritmo.oninput({ target: { value: '12' } });
  assert.doesNotThrow(() => ritmo.onchange());
  assert.equal([...s.timers.values()][0].ms, 12000);
});

test(`el pase salta la tarjeta tapada a medias por la barra`, () => {
  // Tarjetas en 0–100, 100–200 y 200–300 con la barra hasta 40 o 60.
  let s = preparar(0, { tapa: 40, alto: 300 });
  s.pase.abrirPase();
  assert.equal(s.pase.actual.lista[0].titular, 'Titular 0');
  s = preparar(0, { tapa: 60, alto: 300 });
  s.pase.abrirPase();
  assert.equal(s.pase.actual.lista[0].titular, 'Titular 1');
});

test(`mover el ratón no pausa; tocar el contenido sí, sin rehacer el titular`, () => {
  const s = preparar();
  s.pase.abrirPase();
  const root = s.pase.actual.root;
  root.emitir('pointermove', { pointerType: 'touch' });
  assert.equal(s.timers.size, 1);
  root.emitir('pointermove', { pointerType: 'mouse' });
  assert.equal(s.timers.size, 1);
  assert.equal(s.pase.actual.jugando, true);
  root.emitir('pointerdown', { target: { closest: () => null } });
  assert.equal(s.timers.size, 0);
  root.emitir('pointerdown', { target: { closest: () => null } });
  s.eventos.blur();
  assert.equal(s.repintados, 1);
  root.querySelector('[data-pase-play]').onclick();
  root.emitir('pointermove', { pointerType: 'mouse' });
  assert.equal(s.pase.actual.jugando, true);
  assert.equal(s.repintados, 1);
  root.emitir('pointerdown', { target: { closest: () => ({}) } });
  assert.equal(s.timers.size, 1);
});

test(`las cuatro flechas navegan y el deslizador conserva sus teclas`, () => {
  const s = preparar();
  s.pase.abrirPase();
  let prevenido = 0;
  const tecla = (key, target = { closest: () => null }) =>
    s.eventos.keydown({ key, target, preventDefault: () => prevenido++ });
  tecla('ArrowRight');
  assert.equal(s.pase.actual.pos, 1);
  tecla('ArrowLeft');
  assert.equal(s.pase.actual.pos, 0);
  tecla('ArrowLeft');
  assert.equal(s.pase.actual.pos, 0);
  tecla('ArrowDown');
  assert.equal(s.pase.actual.pos, 1);
  tecla('ArrowUp');
  assert.equal(s.pase.actual.pos, 0);
  tecla('ArrowUp');
  assert.equal(s.pase.actual.pos, 0);
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']){
    tecla(key, { closest: () => ({}) });
    assert.equal(s.pase.actual.pos, 0);
  }
  assert.equal(prevenido, 6);
});

test(`si el titular no cabe, ↑ ↓ desplazan y pausan; ← → siguen navegando`, () => {
  const s = preparar();
  s.pase.abrirPase();
  const root = s.pase.actual.root;
  root.scrollHeight = root.clientHeight + 100;
  let prevenido = 0;
  const tecla = key => s.eventos.keydown({ key, target: { closest: () => null }, preventDefault: () => prevenido++ });
  tecla('ArrowDown');
  tecla('ArrowUp');
  assert.equal(s.pase.actual.pos, 0);
  assert.equal(prevenido, 0);
  assert.equal(s.pase.actual.jugando, false);
  tecla('ArrowRight');
  assert.equal(s.pase.actual.pos, 1);
  assert.equal(prevenido, 1);
});

// Emite las fases reales del gesto, incluida la propagación a document.
// control: el deslizador; boton: otro control de la fila.
function gesto(s, dx, dy, { control = false, boton = false, varios = false, cancelar = false } = {}){
  const root = s.pase.actual.root;
  const target = { closest: sel => control || (boton && !sel.includes('data-pase-ritmo')) ? {} : null };
  const dedo = (x, y) => ({ identifier: 1, clientX: x, clientY: y });
  let prevenidos = 0;
  const evento = { target, cancelable: true, preventDefault: () => { prevenidos++; } };
  root.emitir('pointerdown', { target });
  root.emitir('touchstart', { ...evento, touches: [dedo(100, 200)] });
  const movimiento = { ...evento, touches: varios ? [dedo(100 + dx, 200 + dy), dedo(0, 0)] : [dedo(100 + dx, 200 + dy)] };
  root.emitir('touchmove', movimiento);
  s.eventos.touchmove(movimiento);
  if (cancelar) root.emitir('touchcancel', evento);
  const antesDeSoltar = prevenidos;
  root.emitir('touchend', { ...evento, touches: [], changedTouches: [dedo(100 + dx, 200 + dy)] });
  return { prevenidos, clickCancelado: prevenidos > antesDeSoltar };
}

test(`deslizar arriba avanza y abajo retrocede, sin abrir el enlace`, () => {
  const s = preparar();
  s.pase.abrirPase();
  assert.equal(gesto(s, 5, -80).clickCancelado, true);
  assert.equal(s.pase.actual.pos, 1);
  assert.equal(s.pase.actual.jugando, false);
  assert.equal(s.timers.size, 0);
  assert.deepEqual(s.vistas, ['https://medio.test/0']);
  assert.deepEqual(s.leidas, []);
  gesto(s, 0, 80);
  assert.equal(s.pase.actual.pos, 0);
  gesto(s, 0, 80);
  assert.equal(s.pase.actual.pos, 0);
  for (let i = 0; i < 4; i++) gesto(s, 0, -80);
  assert.equal(s.pase.actual.pos, 3);
  gesto(s, 0, 80);
  assert.equal(s.pase.actual.pos, 2);
});

test(`los gestos conservan los controles, el scroll y el zoom`, () => {
  const s = preparar();
  s.pase.abrirPase();
  // Arrastrar el deslizador no debe detener el pase ni cambiar de titular.
  assert.equal(gesto(s, 0, -100, { control: true }).prevenidos, 0);
  assert.equal(s.pase.actual.jugando, true);
  assert.equal(s.pase.actual.pos, 0);
  // Desplazarse empezando en otro control sí pausa, sin cambiar de titular.
  assert.equal(gesto(s, 0, -100, { boton: true }).prevenidos, 0);
  assert.equal(s.pase.actual.jugando, false);
  assert.equal(s.pase.actual.pos, 0);
  for (const [dx, dy, opciones] of [[0, -20], [100, -60], [0, -100, { varios: true }], [0, -100, { cancelar: true }]]){
    assert.equal(gesto(s, dx, dy, opciones).clickCancelado, false);
    assert.equal(s.pase.actual.pos, 0);
  }
  const root = s.pase.actual.root;
  root.scrollHeight = root.clientHeight + 100;
  assert.equal(gesto(s, 0, -100).prevenidos, 0);
  assert.equal(s.pase.actual.pos, 0);
});

test(`cambiar el ritmo en pausa no reanuda el pase`, () => {
  const s = preparar();
  s.pase.abrirPase();
  const root = s.pase.actual.root;
  root.querySelector('[data-pase-play]').onclick();
  root.querySelector('[data-pase-ritmo]').oninput({ target: { value: '15' } });
  assert.equal(s.timers.size, 0);
  root.querySelector('[data-pase-play]').onclick();
  assert.equal([...s.timers.values()][0].ms, 15000);
});

test(`abrir marca como leída y deja el siguiente titular pausado`, () => {
  const s = preparar();
  s.pase.abrirPase();
  const root = s.pase.actual.root;
  root.querySelector('.pase-titular').onclick();
  assert.deepEqual(s.leidas, ['https://medio.test/0']);
  assert.deepEqual(s.vistas, ['https://medio.test/0']);
  assert.equal(s.pase.actual.pos, 1);
  assert.equal(root.querySelector('.pase-titular').href, 'https://medio.test/1');
  assert.equal(s.timers.size, 0);
  s.ctx.document.hidden = true;
  s.eventos.visibilitychange();
  s.ctx.document.hidden = false;
  s.eventos.visibilitychange();
  assert.equal(s.pase.actual.pos, 1);
  assert.equal(s.timers.size, 0);
});

test(`guardar pausa sin avanzar`, () => {
  const s = preparar();
  s.pase.abrirPase();
  s.pase.actual.root.querySelector('[data-pase-guardar]').onclick();
  assert.deepEqual(s.guardadas, ['https://medio.test/0']);
  assert.equal(s.pase.actual.pos, 0);
  assert.equal(s.timers.size, 0);
});

test(`terminar, retroceder y cerrar limpian el temporizador`, () => {
  const s = preparar();
  s.pase.abrirPase();
  for (let i = 0; i < 3; i++) s.pase.moverPase(1);
  assert.equal(s.pase.actual.pos, 3);
  assert.equal(s.timers.size, 0);
  s.pase.moverPase(-1);
  assert.equal(s.pase.actual.pos, 2);
  s.pase.cerrarPase();
  assert.equal(s.pase.actual, null);
  assert.equal(s.timers.size, 0);
  assert.equal(s.filtrados, 1);
  assert.equal(s.ctx.document.body.style.overflow, undefined);
});
