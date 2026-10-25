import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fechas from '../../shared/calendario/fechas.js';
import * as consulta from '../../shared/calendario/consulta.js';
import { parseQuery } from '../../shared/parser.js';
import { traducir } from '../../front/idiomas/index.js';

const codigo = readFileSync(new URL('../../front/app/14-calendario.js', import.meta.url), 'utf8');
const extremo = fecha => ({ fecha, certeza_fecha: fecha ? 'confirmado' : 'desconocida', certeza_hora: 'desconocida' });
function evento(id, inicio = '2026-10-25', fin = inicio, modalidad = 'cita'){
  return { id, tipo: 'evento', nombres: { es: id }, temas: ['teatro'], codigos: [], objetivos: ['evento:' + id],
    fuentes: [], participaciones: [], programacion: { valor: { modalidad,
      cuando: { inicio: extremo(inicio), fin: extremo(fin) } } } };
}
function contexto(eventos){
  const listeners = {};
  const panel = { addEventListener: (tipo, fn) => { listeners[tipo] = fn; }, querySelectorAll: () => [] };
  const c = { ...fechas, ...consulta, parseQuery, Intl, ACCES: { lang: 'es' },
    t: (k, v) => traducir('es', k, v), escapeHtml: s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
    document: { getElementById: id => id === 'calendario-panel' ? panel : { addEventListener() {} } },
  };
  runInNewContext(codigo + '\nthis.api = { s: CALENDARIO, calContenido, calFiltros, wireCalendario }; pintarCalendario = () => {};', c);
  const { s } = c.api;
  s.fecha = '2026-10-25'; s.zona = 'Europe/Madrid';
  s.datos = { eventos, clasificaciones: [], fuentes: {}, entidades: Object.fromEntries(eventos.map(e => ['evento:' + e.id, e])),
    catalogo: { conceptos: { teatro: { nombres: { es: 'Teatro' }, padres: [] } } } };
  c.api.wireCalendario();
  c.click = (cal, valor = '') => listeners.click({ target: { closest: () => ({ dataset: { cal, valor } }) } });
  return c;
}
const cantidad = html => (html.match(/class="cal-evento cal-evento-compacto"/g) || []).length;

test('la agenda limita a 20, amplía sin duplicar y reinicia al cambiar filtros o período', () => {
  const c = contexto(Array.from({ length: 47 }, (_, i) => evento('Cita ' + i, '2026-10-25', '2026-10-27')));
  assert.equal(cantidad(c.api.calContenido()), 20);
  assert.match(c.api.calContenido(), /Mostrando 20 de 47/);
  c.click('mas');
  assert.equal(cantidad(c.api.calContenido()), 40);
  c.click('mas');
  assert.equal(cantidad(c.api.calContenido()), 47);
  assert.doesNotMatch(c.api.calContenido(), /data-cal="mas"/);
  c.click('tema', 'teatro');
  assert.equal(cantidad(c.api.calContenido()), 20);
  c.click('mas'); c.click('siguiente');
  assert.equal(c.api.s.limite, 20);
});

test('las programaciones prolongadas comparten el límite y no se pierden entre tandas', () => {
  const c = contexto([
    ...Array.from({ length: 15 }, (_, i) => evento('Cita ' + i)),
    ...Array.from({ length: 12 }, (_, i) => evento('Programa ' + i, '2026-10-20', '2026-11-30', 'intervalo')),
  ]);
  const primera = c.api.calContenido();
  assert.equal(cantidad(primera), 20);
  assert.match(primera, /cal-intervalos/);
  c.click('mas');
  assert.equal(cantidad(c.api.calContenido()), 27);
  for (let i = 0; i < 12; i++) assert.equal(c.api.calContenido().split(`data-valor="Programa ${i}"`).length - 1, 1);
});

test('mes y semana acotan sus citas y un día abre solo su fecha, con navegación diaria', () => {
  const c = contexto(Array.from({ length: 25 }, (_, i) => evento('Cita ' + i)));
  c.click('vista', 'semana');
  assert.equal(cantidad(c.api.calContenido()), 3);
  assert.match(c.api.calContenido(), /\+22 más/);
  c.click('vista', 'mes');
  assert.equal((c.api.calContenido().match(/class="cal-mini-evento"/g) || []).length, 2);
  assert.match(c.api.calContenido(), /title="lunes"/);
  c.click('dia', '2026-10-26');
  assert.equal(c.api.s.soloDia, true);
  assert.equal(cantidad(c.api.calContenido()), 0);
  c.click('anterior');
  assert.equal(c.api.s.fecha, '2026-10-25');
  assert.equal(cantidad(c.api.calContenido()), 20);
  c.click('vista', 'agenda');
  assert.equal(c.api.s.soloDia, false);
});

test('sin fecha también pagina y las categorías quedan fuera de los filtros plegados', () => {
  const c = contexto(Array.from({ length: 26 }, (_, i) => evento('Pendiente ' + i, null)));
  assert.equal(cantidad(c.api.calContenido()), 20);
  c.click('mas-pendientes');
  assert.equal(cantidad(c.api.calContenido()), 26);
  const filtros = c.api.calFiltros();
  assert.ok(filtros.indexOf('data-cal="tema"') < filtros.indexOf('<details'));
  assert.ok(filtros.indexOf('id="cal-texto"') < filtros.indexOf('<details'));
});
