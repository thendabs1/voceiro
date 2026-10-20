import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Ejecuta el controlador real con reloj y DOM mínimos, sin red.
function preparar(archivo, { visible = 0, cargadas = 3 } = {}) {
  const html = readFileSync(new URL(`../../${archivo}`, import.meta.url), 'utf8');
  const codigo = html.slice(html.indexOf('let PASE = null;'), html.indexOf('\nfunction renderizar(){'));
  assert.ok(codigo.startsWith('let PASE = null;'));
  const vistas = [], leidas = [], guardadas = [], timers = new Map(), eventos = {};
  let id = 0, filtrados = 0;
  function elemento() {
    const clases = new Set(), hijos = new Map();
    return {
      style: {}, dataset: {},
      classList: { add: (...c) => c.forEach(x => clases.add(x)), remove: (...c) => c.forEach(x => clases.delete(x)), contains: c => clases.has(c) },
      querySelector(s) { if (!hijos.has(s)) hijos.set(s, elemento()); return hijos.get(s); },
      setAttribute() {}, removeAttribute() {}, addEventListener() {}, matches() { return false; },
      focus() {}, scrollIntoView() {}, showModal() { this.open = true; },
      close() { this.open = false; }, remove() { this.removed = true; },
    };
  }
  const tarjetas = Array.from({ length: 3 }, (_, i) => ({ ...elemento(), dataset: { idx: String(i) }, getBoundingClientRect: () => ({ top: (i - visible) * 100, bottom: (i - visible + 1) * 100 }) }));
  const body = elemento();
  body.appendChild = () => {};
  const ctx = {
    document: {
      body, hidden: false, createElement: elemento,
      querySelector(s) { return tarjetas[Number(s.match(/data-idx="(\d+)"/)?.[1])]; },
      querySelectorAll: s => s.startsWith('#resultados') ? tarjetas : tarjetas.filter(el => el.classList.contains('pase-consumida') || el.classList.contains('pase-actual')),
      getElementById: () => ctx.RENDER_OFFSET < 3 ? {} : null,
      addEventListener: (tipo, fn) => { eventos[tipo] = fn; },
    },
    window: { innerHeight: 100, addEventListener: (tipo, fn) => { eventos[tipo] = fn; } },
    ULT_FILTRADAS: Array.from({ length: 3 }, (_, i) => ({ titular: `Titular ${i}`, enlace: `https://medio.test/${i}`, medio: 'Medio' })),
    RENDER_OFFSET: cargadas,
    appendBatch: () => { ctx.RENDER_OFFSET = 3; },
    t: s => s, escapeHtml: s => s, bionicize: s => s,
    PENDIENTES_MAP: new Map(), normalizeUrlForMatch: s => s,
    $: () => elemento(), cerrarViewSettingsMenu() {}, cerrarMenuMas() {},
    marcarVistaLocal: url => vistas.push(url), persistirVistas() {},
    marcarLeidaLocal: url => leidas.push(url), registrarLeido() {}, pintarLeidasEnLista() {},
    guardarParaLeerDespues: n => guardadas.push(n.enlace),
    aplicarFiltros: () => { filtrados++; },
    setTimeout: (fn, ms) => { timers.set(++id, { fn, ms }); return id; },
    clearTimeout: id => timers.delete(id),
  };
  runInNewContext(`${codigo}\nthis.pase = { abrirPase, moverPase, cerrarPase, pausarPase, get actual(){ return PASE; } };`, ctx);
  return { ...ctx.pase, control: ctx.pase, ctx, tarjetas, vistas, leidas, guardadas, timers, eventos, get filtrados() { return filtrados; } };
}

for (const archivo of ['plantilla.html', 'public/index.html']) {
  for (const modo of ['tarjetas', 'capa']) {
    test(`${archivo}: ${modo} avanza al ritmo elegido y marca solo como visto`, () => {
      const s = preparar(archivo);
      s.abrirPase(modo);
      assert.equal(s.timers.size, 1);
      assert.equal([...s.timers.values()][0].ms, 8000);
      [...s.timers.values()][0].fn();
      assert.equal(s.control.actual.pos, 1);
      assert.deepEqual(s.vistas, ['https://medio.test/0']);
      assert.deepEqual(s.leidas, []);
      assert.equal(s.filtrados, 0);
      assert.equal(s.tarjetas[0].classList.contains('pase-consumida'), modo === 'tarjetas');
      const ritmo = s.control.actual.root.querySelector('[data-pase-ritmo]');
      ritmo.onchange({ target: { value: '3' } });
      assert.equal([...s.timers.values()][0].ms, 3000);
    });

    test(`${archivo}: ${modo} pausa al ocultarse y no recupera el avance solo`, () => {
      const s = preparar(archivo);
      s.abrirPase(modo);
      s.ctx.document.hidden = true;
      s.eventos.visibilitychange();
      assert.equal(s.timers.size, 0);
      assert.equal(s.control.actual.jugando, false);
      s.ctx.document.hidden = false;
      s.eventos.visibilitychange();
      assert.equal(s.timers.size, 0);
      assert.deepEqual(s.vistas, []);
    });

    test(`${archivo}: ${modo} permite retroceder desde el final y cerrar limpia todo`, () => {
      const s = preparar(archivo);
      s.abrirPase(modo);
      for (let i = 0; i < 3; i++) s.moverPase(1);
      assert.equal(s.control.actual.pos, 3);
      assert.equal(s.timers.size, 0);
      s.moverPase(-1);
      assert.equal(s.control.actual.pos, 2);
      assert.equal(s.tarjetas[2].classList.contains('pase-consumida'), false);
      s.cerrarPase();
      assert.equal(s.control.actual, null);
      assert.equal(s.timers.size, 0);
      assert.equal(s.filtrados, 1);
      assert.ok(s.tarjetas.every(el => !el.classList.contains('pase-consumida')));
      assert.equal(s.ctx.document.body.style.overflow, undefined);
    });
  }

  test(`${archivo}: empieza en la tarjeta visible y usa una instantánea`, () => {
    const s = preparar(archivo, { visible: 1, cargadas: 1 });
    s.abrirPase('tarjetas');
    assert.equal(s.control.actual.lista.length, 2);
    assert.equal(s.ctx.RENDER_OFFSET, 3);
    s.ctx.ULT_FILTRADAS.push({ titular: 'Nuevo' });
    assert.equal(s.control.actual.lista.length, 2);
    s.moverPase(1);
    assert.deepEqual(s.vistas, ['https://medio.test/1']);
    s.cerrarPase(false);
    assert.equal(s.filtrados, 0);
    assert.equal(s.timers.size, 0);
  });

  test(`${archivo}: abrir o guardar en la capa pausa y actúa sobre la noticia actual`, () => {
    const s = preparar(archivo);
    s.abrirPase('capa');
    const root = s.control.actual.root;
    root.querySelector('[data-pase-guardar]').onclick();
    assert.deepEqual(s.guardadas, ['https://medio.test/0']);
    assert.equal(s.timers.size, 0);
    s.moverPase(1);
    root.querySelector('.pase-titular').onclick();
    assert.deepEqual(s.leidas, ['https://medio.test/1']);
    assert.equal(s.timers.size, 0);
  });
}
