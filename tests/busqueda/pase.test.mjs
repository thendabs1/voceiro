import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerAplicacion } from '../soporte/frontend.mjs';
import { runInNewContext } from 'node:vm';

// Ejecuta el controlador real con un reloj y elementos mínimos, sin red.
function preparar(visible = 0, { tapa = 0, alto = 100 } = {}) {
  const html = leerAplicacion();
  const codigo = html.slice(html.indexOf('let PASE = null;'), html.indexOf('\nfunction renderizar(){'));
  assert.ok(codigo.startsWith('let PASE = null;'));
  const vistas = [], leidas = [], guardadas = [], timers = new Map(), eventos = {};
  let id = 0, filtrados = 0;
  function elemento() {
    const hijos = new Map(), listeners = {};
    return {
      style: {}, dataset: {},
      querySelector(s) { if (!hijos.has(s)) hijos.set(s, elemento()); return hijos.get(s); },
      setAttribute() {}, removeAttribute() {}, matches() { return false; }, closest() { return null; },
      addEventListener(tipo, fn) { listeners[tipo] = fn; },
      emitir(tipo, e) { listeners[tipo](e); },
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
    t: s => s, escapeHtml: s => s, bionicize: s => s,
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
  return { pase: ctx.pase, ctx, vistas, leidas, guardadas, timers, eventos, get filtrados() { return filtrados; } };
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
  s.pase.actual.root.querySelector('[data-pase-ritmo]').onchange({ target: { value: '3' } });
  assert.equal([...s.timers.values()][0].ms, 3000);
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

test(`mover el ratón o tocar la capa pausa`, () => {
  const s = preparar();
  s.pase.abrirPase();
  const root = s.pase.actual.root;
  root.emitir('pointermove', { pointerType: 'touch' });
  assert.equal(s.timers.size, 1);
  root.emitir('pointermove', { pointerType: 'mouse' });
  assert.equal(s.timers.size, 0);
  assert.equal(s.pase.actual.jugando, false);
  root.querySelector('[data-pase-play]').onclick();
  assert.equal(s.timers.size, 1);
  root.emitir('pointerdown', { target: { closest: () => null } });
  assert.equal(s.timers.size, 0);
  root.querySelector('[data-pase-play]').onclick();
  root.emitir('pointerdown', { target: { closest: () => ({}) } });
  assert.equal(s.timers.size, 1);
});

test(`las flechas navegan y el selector conserva sus teclas`, () => {
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
  tecla('ArrowRight', { closest: () => ({}) });
  assert.equal(s.pase.actual.pos, 0);
  assert.equal(prevenido, 3);
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
