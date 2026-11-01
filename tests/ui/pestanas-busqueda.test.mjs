// Pestañas Modo / Toda la búsqueda (front/app/23-chips.js): con las mismas
// cifras, «Toda la búsqueda» son las mismas noticias y se oculta, salvo si
// es la elegida.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traducir } from '../../front/idiomas/index.js';

const codigo = readFileSync(new URL('../../front/app/23-chips.js', import.meta.url), 'utf8');
const inicio = codigo.indexOf('function renderPestanasPreset(){');
const funcion = codigo.slice(inicio, codigo.indexOf('\n}', inicio) + 2);

function escenario(info){
  const boton = pestana => ({ dataset: { pestana }, hidden: false, textContent: '', attrs: {}, setAttribute(k, v){ this.attrs[k] = v; } });
  const modo = boton('modo'), todo = boton('todo');
  const el = { hidden: true, querySelectorAll: () => [modo, todo] };
  const c = { document: { getElementById: () => el }, ULT_PESTANAS: info, PRESET: { nombre: 'LOCAL' }, t: (k, v) => traducir('es', k, v) };
  runInNewContext(funcion, c);
  c.renderPestanasPreset();
  return { el, modo, todo };
}

test('cifras distintas: las dos pestañas', () => {
  const { el, modo, todo } = escenario({ pestana: 'modo', nModo: 64, nTodo: 72 });
  assert.equal(el.hidden, false);
  assert.equal(modo.hidden, false);
  assert.equal(todo.hidden, false);
  assert.equal(todo.textContent, 'Toda la búsqueda · 72');
});

test('mismas cifras en el modo: «Toda la búsqueda» se oculta', () => {
  const { modo, todo } = escenario({ pestana: 'modo', nModo: 59, nTodo: 59 });
  assert.equal(modo.hidden, false);
  assert.equal(modo.textContent, 'LOCAL · 59');
  assert.equal(todo.hidden, true);
});

test('mismas cifras con «Toda la búsqueda» elegida: no desaparece la pestaña en la que se está', () => {
  const { modo, todo } = escenario({ pestana: 'todo', nModo: 59, nTodo: 59 });
  assert.equal(modo.hidden, false);
  assert.equal(todo.hidden, false);
  assert.equal(todo.attrs['aria-selected'], 'true');
});
