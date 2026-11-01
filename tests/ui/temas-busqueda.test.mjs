import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerAplicacion } from '../soporte/frontend.mjs';
import { runInNewContext } from 'node:vm';

const textos = {
  temaChipTodo: 'Todo',
  temaChipMedios: 'Medios del modo',
  temaChipSinFiltro: 'Sin filtro',
  temaChipSoloMedios: 'Solo medios',
  temaChipTema: 'Tema: {X}',
};

const html = leerAplicacion();
const inicio = html.indexOf('function renderChipsTemas(){');
const funcion = html.slice(inicio, html.indexOf('\n}', inicio) + 2);

function crearContexto({ buscando = true, elegido = 'pontevedra' } = {}) {
  const elemento = { hidden: true, innerHTML: '' };
  const contexto = {
    document: { getElementById: () => elemento },
    ULT_PESTANAS: buscando ? { pestana: 'modo' } : null,
    ULT_CHIPS: {
      totalModo: 34, modo: 'local', porModo: null, nMedios: 32,
      porTema: new Map([['pontevedra', 5], ['caldas', 0], ['portas', 0]]),
    },
    PRESET: { nombre: 'LOCAL' },
    CHIP_TEMA: elegido ? { modo: 'local', etiqueta: elegido } : null,
    CHIP_TEMAS: null,
    TEMAS_TODOS: [],
    etiquetaVisible: x => x,
    escapeHtml: x => String(x).replaceAll('&', '&amp;'),
    t: (clave, variables = {}) => Object.entries(variables).reduce(
      (texto, [nombre, valor]) => texto.replaceAll(`{${nombre}}`, valor), textos[clave],
    ),
  };
  runInNewContext(funcion, contexto);
  return { elemento, contexto };
}

test(`buscando en un modo solo salen los temas con noticias, sin etiqueta`, () => {
  const { elemento, contexto } = crearContexto();
  contexto.renderChipsTemas();
  assert.equal(elemento.hidden, false);
  assert.doesNotMatch(elemento.innerHTML, /Filtrar dentro|sin coincidencias/);
  assert.match(elemento.innerHTML, /Sin filtro · 34/);
  assert.match(elemento.innerHTML, /Solo medios · 32/);
  assert.match(elemento.innerHTML, /Tema: pontevedra · 5/);
  assert.doesNotMatch(elemento.innerHTML, /caldas|portas/);
});

test(`un tema seleccionado sigue visible aunque tenga cero resultados`, () => {
  const { elemento, contexto } = crearContexto({ elegido: 'caldas' });
  contexto.renderChipsTemas();
  assert.match(elemento.innerHTML, /Tema: caldas · 0/);
  assert.match(elemento.innerHTML, /data-tema="caldas"[^>]*aria-pressed="true"/);
  assert.doesNotMatch(elemento.innerHTML, /data-tema="caldas"[^>]*disabled/);
  assert.doesNotMatch(elemento.innerHTML, /portas/);
});

test(`sin temas con noticias no queda un «Sin filtro» suelto`, () => {
  const { elemento, contexto } = crearContexto({ elegido: null });
  contexto.ULT_CHIPS.porTema = new Map([['caldas', 0], ['portas', 0]]);
  contexto.ULT_CHIPS.nMedios = 0;
  contexto.renderChipsTemas();
  assert.equal(elemento.hidden, true);
  assert.equal(elemento.innerHTML, '');
  contexto.ULT_CHIPS.nMedios = null;
  contexto.renderChipsTemas();
  assert.equal(elemento.hidden, true);
});

test(`fuera de la búsqueda se conservan todos los temas`, () => {
  const { elemento, contexto } = crearContexto({ buscando: false });
  contexto.renderChipsTemas();
  assert.doesNotMatch(elemento.innerHTML, /temas-chips-contexto|temas-chips-cero/);
  assert.match(elemento.innerHTML, /Todo · 34/);
  assert.match(elemento.innerHTML, /Medios del modo · 32/);
  assert.match(elemento.innerHTML, /caldas · 0/);
});

test(`ordena modos y temas por resultados, manteniendo Todo primero`, () => {
  const { elemento, contexto } = crearContexto({ buscando: false });
  contexto.ULT_CHIPS = {
    total: 40, porModo: new Map([['local', 8], ['general', 32]]),
    modo: 'local', totalModo: 8, nMedios: 3,
    porTema: new Map([['pontevedra', 5], ['caldas', 0], ['poio', 6], ['portas', 0]]),
  };
  contexto.TEMAS_TODOS = [{ id: 'local', nombre: 'Local' }, { id: 'general', nombre: 'General' }];
  contexto.renderChipsTemas();
  const [modos, temas] = elemento.innerHTML.match(/<div class="temas-chips-fila(?: hija)?">.*?<\/div>/g);
  assert.ok(modos.indexOf('Todo · 40') < modos.indexOf('General · 32'));
  assert.ok(modos.indexOf('General · 32') < modos.indexOf('Local · 8'));
  assert.ok(temas.indexOf('poio · 6') < temas.indexOf('pontevedra · 5'));
  assert.ok(temas.indexOf('pontevedra · 5') < temas.indexOf('Medios del modo · 3'));
  assert.ok(temas.indexOf('Medios del modo · 3') < temas.indexOf('caldas · 0'));
});
