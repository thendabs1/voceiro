// node --test 'tests/**/*.test.mjs'
// Resumen de medios de una búsqueda (front/app/23-chips.js): chip plegable
// con cuentas por medio; la lista solo se pinta abierta.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traducir } from '../../front/idiomas/index.js';
import { normStrict } from '../../shared/parser.js';

const codigo = readFileSync(new URL('../../front/app/23-chips.js', import.meta.url), 'utf8');
const MEDIOS = {
  'elpais.com': { n: 'El País', g: 'Nacional' }, 'abc.es': { n: 'ABC', g: 'Nacional' },
  'farodevigo.es': { n: 'Faro de Vigo', g: 'Galicia' },
};

function escenario(){
  const nodo = () => ({ innerHTML: '', textContent: '', contains: () => false, querySelector: () => null, querySelectorAll: () => [] });
  const summary = nodo(), cuerpo = nodo();
  const el = {
    hidden: true, open: false, _html: '', firstElementChild: null, lastElementChild: null, addEventListener(){},
    get innerHTML(){ return this._html; },
    set innerHTML(v){ this._html = v; this.firstElementChild = v ? summary : null; this.lastElementChild = v ? cuerpo : null; },
  };
  const c = {
    document: { getElementById: id => (id === 'medios-resumen' ? el : null), activeElement: null },
    t: (k, v) => traducir('es', k, v), escapeHtml: s => String(s).replace(/[&<>"]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[x])),
    MEDIOS, ACCES: { lang: 'es' }, CSS: { escape: s => s }, normStrict,
  };
  runInNewContext(codigo, c);
  return { c, el, summary, cuerpo, run: e => runInNewContext(e, c) };
}
const noticias = reparto => Object.entries(reparto).flatMap(([d, n]) => Array.from({ length: n }, () => ({ dominio: d })));

test('sin búsqueda o con un solo medio no sale; buscando, el chip cuenta medios y cerrado no pinta la lista', () => {
  const s = escenario();
  s.run('renderResumenMedios(null)');
  assert.equal(s.el.hidden, true);
  s.c.lista = noticias({ 'elpais.com': 3 });
  s.run('renderResumenMedios(lista)');
  assert.equal(s.el.hidden, true);
  s.c.lista = noticias({ 'elpais.com': 3, 'abc.es': 5, 'google-solo.com': 1 });
  s.run('renderResumenMedios(lista)');
  assert.equal(s.el.hidden, false);
  assert.equal(s.summary.textContent, 'Medios · 3');
  assert.equal(s.cuerpo.innerHTML, '');
});

test('abierto: por noticias, A–Z y por grupo; un dominio fuera del catálogo también filtra', () => {
  const s = escenario();
  s.c.lista = noticias({ 'elpais.com': 3, 'abc.es': 5, 'farodevigo.es': 1, 'google-solo.com': 2 });
  s.el.open = true;
  s.run('renderResumenMedios(lista)');
  const orden = () => [...s.cuerpo.innerHTML.matchAll(/<li>.*?<span>([^<]+)<\/span>/g)].map(m => m[1]);
  assert.deepEqual(orden(), ['ABC', 'El País', 'google-solo.com', 'Faro de Vigo']);
  assert.match(s.cuerpo.innerHTML, /data-dominio="abc.es" title="Ver noticias de ABC"/);
  assert.match(s.cuerpo.innerHTML, /data-dominio="google-solo.com"/);
  s.run("RESUMEN_MEDIOS.orden = 'az'; renderResumenMedios()");
  assert.deepEqual(orden(), ['ABC', 'El País', 'Faro de Vigo', 'google-solo.com']);
  s.run("RESUMEN_MEDIOS.orden = 'grupo'; renderResumenMedios()");
  assert.deepEqual([...s.cuerpo.innerHTML.matchAll(/data-grupo="([^"]+)"/g)].map(m => m[1]), ['Nacional', 'Otros', 'Galicia']);
  assert.match(s.cuerpo.innerHTML, /data-grupo="Nacional"><summary><span>Nacional<\/span><span class="medios-resumen-n">8<\/span>/);
});

test('más de 12 medios: «Ver todos (N)» y luego la lista entera', () => {
  const s = escenario();
  const reparto = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`m${i}.es`, i + 1]));
  s.c.lista = noticias(reparto);
  s.el.open = true;
  s.run('renderResumenMedios(lista)');
  assert.equal((s.cuerpo.innerHTML.match(/<li>/g) || []).length, 12);
  assert.match(s.cuerpo.innerHTML, /data-todos>Ver todos \(15\)</);
  s.run('RESUMEN_MEDIOS.todos = true; renderResumenMedios()');
  assert.equal((s.cuerpo.innerHTML.match(/<li>/g) || []).length, 15);
  assert.doesNotMatch(s.cuerpo.innerHTML, /data-todos/);
});

test('con más de 12 medios, el buscador filtra por nombre o dominio y avisa si no hay ninguno', () => {
  const s = escenario();
  const reparto = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`m${i}.es`, i + 1]));
  reparto['farodevigo.es'] = 4;
  s.c.lista = noticias(reparto);
  s.el.open = true;
  s.run('renderResumenMedios(lista)');
  assert.match(s.cuerpo.innerHTML, /class="medios-resumen-buscar" placeholder="Filtrar medios"/);
  s.run("RESUMEN_MEDIOS.q = 'Fáro'; renderResumenMedios()");
  assert.deepEqual([...s.cuerpo.innerHTML.matchAll(/data-dominio="([^"]+)"/g)].map(m => m[1]), ['farodevigo.es']);
  s.run("RESUMEN_MEDIOS.q = 'm1'; renderResumenMedios()");
  assert.equal((s.cuerpo.innerHTML.match(/<li>/g) || []).length, 6);
  assert.doesNotMatch(s.cuerpo.innerHTML, /data-todos/);
  s.run("RESUMEN_MEDIOS.q = 'zzz'; renderResumenMedios()");
  assert.match(s.cuerpo.innerHTML, /Ningún medio coincide/);
});

test('con pocos medios no hay buscador', () => {
  const s = escenario();
  s.c.lista = noticias({ 'elpais.com': 3, 'abc.es': 5 });
  s.el.open = true;
  s.run('renderResumenMedios(lista)');
  assert.doesNotMatch(s.cuerpo.innerHTML, /medios-resumen-buscar/);
});

test('fuentes de Google News sin dominio propio (news.google.com) se cuentan por nombre, sin filtrar', () => {
  const s = escenario();
  s.c.lista = [{ dominio: 'elpais.com', medio: 'El País' },
    { dominio: 'news.google.com', medio: 'Diario A' }, { dominio: 'news.google.com', medio: 'Diario B' }, { dominio: 'news.google.com', medio: 'Diario B' }];
  s.el.open = true;
  s.run('renderResumenMedios(lista)');
  assert.equal(s.summary.textContent, 'Medios · 3');
  assert.match(s.cuerpo.innerHTML, /<span>Diario B<\/span><span class="medios-resumen-n">2<\/span>/);
  assert.match(s.cuerpo.innerHTML, /<span>Diario A<\/span><span class="medios-resumen-n">1<\/span>/);
  assert.doesNotMatch(s.cuerpo.innerHTML, /data-dominio="(news.google.com|~)/);
});
