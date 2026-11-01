import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const fuente = readFileSync(new URL('../../front/app/09-pendientes-cabecera.js', import.meta.url), 'utf8');
const inicio = fuente.indexOf('function wireMenuCabecera(');
const codigo = fuente.slice(inicio, fuente.indexOf('\nfunction wireCabecera(', inicio));

function escenario(){
  let document;
  class Elemento {
    hijos = []; eventos = {}; open = false;
    classList = { remove() {} };
    get parentElement(){ return this.padre; }
    append(el){
      if (el.padre) el.padre.hijos = el.padre.hijos.filter(h => h !== el);
      el.padre = this; this.hijos.push(el);
    }
    contains(el){ return this === el || this.hijos.some(h => h.contains(el)); }
    addEventListener(nombre, fn){ this.eventos[nombre] = fn; }
    focus(){ document.activeElement = this; }
    querySelector(){ return this.hijos[0]; }
    closest(){ return this; }
  }
  const ids = Object.fromEntries(['cab-menu', 'cab-menu-panel', 'cab-meta-home', 'cab-est-home',
    'cab-feed-home', 'btn-estadisticas', 'btn-recargar'].map(id => [id, new Elemento()]));
  const resumen = new Elemento(), meta = new Elemento(), barra = new Elemento();
  const controles = [new Elemento(), new Elemento()];
  ids['cab-menu'].append(resumen); ids['cab-menu'].append(ids['cab-menu-panel']);
  ids['cab-meta-home'].append(meta); ids['cab-est-home'].append(ids['btn-estadisticas']);
  controles.forEach(el => ids['cab-feed-home'].append(el));
  document = new Elemento(); document.activeElement = new Elemento();
  document.getElementById = id => ids[id];
  document.querySelector = () => meta;
  document.querySelectorAll = () => controles;
  let resize;
  runInNewContext(codigo + '\nwireMenuCabecera(barra);', {
    document, barra, queueMicrotask,
    ResizeObserver: class { constructor(fn){ resize = fn; } observe(){} },
  });
  return { ids, resumen, meta, controles, document,
    ancho: width => resize([{ contentRect: { width } }]),
    menu: ids['cab-menu'], panel: ids['cab-menu-panel'] };
}

test('la columna estrecha lleva los mismos controles al menú y conserva su foco al ensanchar', () => {
  const s = escenario();
  s.ancho(700);
  assert.equal(s.panel.contains(s.meta), true);
  for (const el of s.controles) assert.equal(s.panel.contains(el), true);
  s.document.activeElement = s.controles[0];
  s.menu.open = true;
  s.ancho(1100);
  assert.equal(s.ids['cab-meta-home'].contains(s.meta), true);
  for (const el of s.controles) assert.equal(s.ids['cab-feed-home'].contains(el), true);
  assert.equal(s.document.activeElement, s.controles[0]);
  assert.equal(s.menu.open, false);
});

test('pasar del resumen a una opción no cierra el menú antes de poder pulsarla', async () => {
  const s = escenario(); s.ancho(390); s.menu.open = true;
  // Durante el cambio de foco el navegador puede tener body como activo.
  s.menu.eventos.focusout({ relatedTarget: s.controles[0] });
  await Promise.resolve();
  assert.equal(s.menu.open, true);
  s.menu.eventos.focusout({ relatedTarget: s.ids['btn-recargar'] });
  assert.equal(s.menu.open, false);
});

test('Escape y las acciones cierran el menú y devuelven el foco a un control visible', () => {
  const s = escenario(); s.ancho(390); s.menu.open = true;
  let detenido = false;
  s.menu.eventos.keydown({ key: 'Escape', preventDefault(){}, stopPropagation(){ detenido = true; } });
  assert.equal(s.menu.open, false); assert.equal(detenido, true);
  assert.equal(s.document.activeElement, s.resumen);
  s.menu.open = true; s.document.activeElement = s.controles[0];
  s.panel.eventos.click({ target: s.controles[0] });
  assert.equal(s.menu.open, false);
  assert.equal(s.document.activeElement, s.resumen);
});
