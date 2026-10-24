import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeQuery, normalize, normDomain } from '../../shared/parser.js';
import { interpretarConsulta, paraPrensa } from '../../shared/busqueda/consulta.js';

const codigo = readFileSync(new URL('../../front/app/14-estadisticas.js', import.meta.url), 'utf8');
const catalogo = {
  'a.es': { n: 'A', g: 'Nacional' }, 'b.es': { n: 'B', g: 'Nacional' },
  'c.gal': { n: 'C', g: 'Regional · Galicia' }, 'd.es': { n: 'D', g: 'Nacional' },
};
const indice = () => ({ generado: '2026-10-24T04:00:00+02:00', medios: catalogo,
  dias: [{ fecha: '2026-10-23' }, { fecha: '2026-10-22' }], serie_dias: ['2026-10-22', '2026-10-23'],
  serie: { 'a.es': { titulares: [null, 0] }, 'b.es': { titulares: [2, 3] } },
});
const dia = fecha => ({ fecha, medios: { 'a.es': { pub: { titulares: 0 } }, 'b.es': { pub: { titulares: 3, fechas: { solo_dia: 2, con_hora: 1 } } } } });
const copia = v => JSON.parse(JSON.stringify(v));
function contexto(){
  const c = { tokenizeQuery, normalize, normDomain, ACCES: { lang: 'es' }, Intl, Date, AbortController, AbortSignal, structuredClone,
    DATA_BASE: 'https://datos.example', BACKENDS: { cf: { data: 'https://datos.example' }, deno: { data: 'https://alternativo.example' } },
    PRESETS: { lista: [], activo: '' }, PRESET_ACTIVO: false,
  };
  runInNewContext(codigo + '\nthis.api = { s: ESTADISTICAS, seleccionEstadisticas, sumarEstadisticas, serieEstadisticas, ordenEstadisticas, validarIndiceEstadisticas, cargarEstadisticas, pedirEstadisticas, cerrarEstadisticas, estResumen, estFicha, estEvolucion, estDirectorio, estListaMedios, familiasEstadisticas, estAmbito, estDominios }; pintarEstadisticas = () => {};', c);
  const s = c.api.s;
  s.abierto = true; s.fecha = '2026-10-23';
  return c;
}

test('un modo resuelve grupos, incluidos y priorizados; ignore gana, las palabras no añaden medios', () => {
  const { api } = contexto();
  const modo = { grupos: ['Nacional'], palabras: ['grupo:Regional'], overrides: { 'a.es': 'ignore', 'c.gal': 'include', 'externo.es': 'first' } };
  const modos = [{ id: 'm', ...modo }, { id: 'p', grupos: [], palabras: ['vivienda'] }];
  assert.deepEqual(copia(api.seleccionEstadisticas(catalogo, 'modo:m', modos)), ['b.es', 'c.gal', 'd.es', 'externo.es']);
  assert.deepEqual(copia(api.seleccionEstadisticas(catalogo, 'modo:p', modos)), []);
  assert.deepEqual(copia(api.seleccionEstadisticas(catalogo, 'modo:borrado', modos)), []);
});

test('los totales y las series distinguen cero real, falta de datos y muestra parcial', () => {
  const { api } = contexto(), datos = dia('2026-10-23');
  const total = api.sumarEstadisticas(datos.medios, Object.keys(catalogo));
  assert.equal(total.titulares, 3); assert.equal(total.disponibles, 2); assert.equal(total.conTitulares, 1);
  assert.equal(total.seleccionados, 4);
  assert.equal(api.sumarEstadisticas(datos.medios, ['c.gal']).titulares, null);
  assert.deepEqual(copia(api.serieEstadisticas(indice(), ['a.es'])),
    [{ fecha: '2026-10-22', valor: null, medios: 0 }, { fecha: '2026-10-23', valor: 0, medios: 1 }]);
});

test('el ámbito sigue al modo activo hasta que se elige otro; un modo borrado vuelve a él', () => {
  const c = contexto();
  c.api.s.indice = indice();
  c.PRESETS.lista = [{ id: 'm', grupos: ['Nacional'], overrides: { 'a.es': 'ignore' } }, { id: 'n', grupos: [], overrides: { 'c.gal': 'include' } }];
  assert.equal(c.api.estAmbito(), 'todos');
  c.PRESETS.activo = 'm'; c.PRESET_ACTIVO = true;
  assert.deepEqual(copia(c.api.estDominios()), ['b.es', 'd.es']);
  c.api.s.ambito = 'modo:n';
  assert.deepEqual(copia(c.api.estDominios()), ['c.gal']);
  c.PRESETS.lista.pop();
  assert.equal(c.api.estAmbito(), 'modo:m');
  c.api.s.ambito = 'grupo:Regional';
  assert.deepEqual(copia(c.api.estDominios()), ['c.gal']);
});

test('la orden usa el último destino, respeta las comillas y conserva filtros para el feed y la prensa', () => {
  const { api } = contexto();
  const orden = api.ordenEstadisticas('"stats:a.es" stats:b.es vivienda grupo:Nacional estadisticas:"A"');
  assert.equal(orden.destino, 'A');
  assert.equal(orden.resto, '"stats:a.es" vivienda grupo:Nacional');
  assert.equal(api.ordenEstadisticas('estadísticas vivienda'), null);
  assert.equal(api.ordenEstadisticas('stats:').destino, '');
  assert.equal(api.ordenEstadisticas('vivienda estadisticas:"El Pa').resto, 'vivienda');
  assert.equal(api.ordenEstadisticas('"mención stats:a.es"'), null);
  const consulta = interpretarConsulta(api.ordenEstadisticas('vivienda stats:a.es grupo:Nacional').resto, { catalogo });
  assert.equal(consulta.pasa({ dominio: 'a.es', titular: 'Nueva vivienda' }), true);
  assert.doesNotMatch(JSON.stringify(paraPrensa(consulta)), /stats:/);
});

test('el formato incompatible se rechaza antes de usar datos parciales', () => {
  const { api } = contexto();
  assert.equal(api.validarIndiceEstadisticas(indice()).dias.length, 2);
  assert.throws(() => api.validarIndiceEstadisticas({ ...indice(), serie_dias: ['2026-02-30'] }));
  assert.throws(() => api.validarIndiceEstadisticas({ ...indice(), serie: { 'a.es': { titulares: [1] } } }));
});

test('carga bajo demanda y reutiliza el día; una fecha ausente no se sustituye ni se pide', async () => {
  const c = contexto(), pedidos = [];
  c.fetch = async url => { pedidos.push(url); return { ok: true, json: async () => url.endsWith('estadisticas.json') ? indice() : dia('2026-10-23') }; };
  await c.api.cargarEstadisticas();
  await c.api.cargarEstadisticas();
  assert.equal(pedidos.length, 2);
  c.api.s.fecha = '2026-10-24';
  await c.api.cargarEstadisticas();
  assert.equal(pedidos.length, 2); assert.equal(c.api.s.fecha, '2026-10-24'); assert.equal(c.api.s.dia, null);
});

test('una renovación fallida conserva juntos el índice y el detalle anteriores', async () => {
  const c = contexto(), anterior = indice(), detalle = dia('2026-10-23');
  c.api.s.indice = anterior; c.api.s.dia = detalle;
  c.fetch = async url => {
    if (url.endsWith('estadisticas.json')) return { ok: true, json: async () => ({ ...indice(), generado: '2026-10-24T05:00:00+02:00' }) };
    throw new Error('sin red');
  };
  await c.api.cargarEstadisticas(true);
  assert.equal(c.api.s.indice, anterior); assert.equal(c.api.s.dia, detalle); assert.equal(c.api.s.error, true);
});

test('una respuesta tardía no cambia la nueva fecha ni borra su resultado', async () => {
  const c = contexto(), pendientes = new Map();
  c.api.s.indice = indice();
  c.fetch = url => new Promise(resolve => pendientes.set(url.split('/').at(-1), resolve));
  const primera = c.api.cargarEstadisticas();
  c.api.s.fecha = '2026-10-22';
  const segunda = c.api.cargarEstadisticas();
  pendientes.get('estadisticas-dia-2026-10-22.json')({ ok: true, json: async () => dia('2026-10-22') });
  await segunda;
  pendientes.get('estadisticas-dia-2026-10-23.json')({ ok: true, json: async () => dia('2026-10-23') });
  await primera;
  assert.equal(c.api.s.dia.fecha, '2026-10-22'); assert.equal(c.api.s.error, false);
});

test('si falla un backend se prueba el alternativo, pero abortar no provoca otra petición', async () => {
  const c = contexto(), urls = [];
  c.fetch = async url => { urls.push(url); return { ok: !url.startsWith('https://datos.'), status: 500, json: async () => indice() }; };
  await c.api.pedirEstadisticas('estadisticas.json', new AbortController().signal);
  assert.equal(urls.length, 2);
  const controller = new AbortController();
  c.fetch = async () => { controller.abort(); throw new Error('abort'); };
  await assert.rejects(c.api.pedirEstadisticas('estadisticas.json', controller.signal));
  assert.equal(urls.length, 2);
});

test('cerrar cancela la carga, devuelve foco y scroll y conserva los filtros del feed', () => {
  const c = contexto(); let foco = false, scroll;
  c.api.s.origen = { isConnected: true, getClientRects: () => [1], focus: () => { foco = true; } };
  c.api.s.scroll = 730; c.api.s.controller = new AbortController();
  c.window = { scrollTo: p => { scroll = p.top; } };
  c.api.cerrarEstadisticas();
  assert.equal(c.api.s.abierto, false); assert.equal(c.api.s.controller.signal.aborted, true);
  assert.equal(foco, true); assert.equal(scroll, 730);
});

const html = c => { c.escapeHtml = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
  c.t = (k, vars) => k + (vars ? JSON.stringify(vars) : ''); c.ico = () => ''; c.normalize = normalize; return c; };

test('nombres y secciones del JSON se escapan, y el total del resumen coincide con sus grupos', () => {
  const c = html(contexto());
  c.api.s.indice = indice(); c.api.s.dia = dia('2026-10-23');
  c.api.s.indice.medios = { ...catalogo, 'a.es': { n: '<img src=x onerror=alert(1)>', g: 'Nacional' } };
  c.api.s.dia.medios['a.es'].pub = { titulares: 4, secciones: { '<img src=x>': 3, b: 1 }, fuentes: { '<b>': 4 } };
  c.api.s.dominio = 'a.es';
  assert.doesNotMatch(c.api.estFicha(), /<img|<b>4/);
  assert.match(c.api.estFicha(), /&lt;img/); assert.match(c.api.estFicha(), /&lt;b>/);
  assert.match(c.api.estResumen(), /<dd>7<\/dd>/);
});

test('cada barra abre su día, la del día consultado se marca y un día sin datos no se puede pulsar', () => {
  const c = html(contexto());
  c.api.s.indice = indice(); c.api.s.dia = dia('2026-10-23');
  const barras = c.api.estEvolucion(['a.es']).match(/<button[^>]*data-est="fecha"[^>]*>/g);
  assert.equal(barras.length, 2);
  assert.match(barras[0], /disabled/);
  assert.match(barras[1], /data-valor="2026-10-23"[^>]*aria-current="date"/);
  assert.equal(c.api.estEvolucion(['c.gal']), '');
});

test('la lista va de más a menos titulares, con su miniatura, y buscar solo la filtra', () => {
  const c = html(contexto());
  c.api.s.indice = indice(); c.api.s.dia = dia('2026-10-23');
  const orden = [...c.api.estListaMedios().matchAll(/data-est="medio" data-valor="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(orden, ['b.es', 'a.es', 'c.gal', 'd.es']);
  assert.match(c.api.estListaMedios(), /class="est-mini"/);
  c.api.s.consulta = 'b.es';
  assert.match(c.api.estListaMedios(), /data-valor="b\.es"/);
  assert.doesNotMatch(c.api.estListaMedios(), /data-valor="a\.es"|est-buscar-medio/);
});

test('la ficha da el histórico de nuevo a antiguo y no pinta cifras que no existen', () => {
  const c = html(contexto());
  c.api.s.indice = { ...indice(), serie_dias: ['2026-10-21', '2026-10-22', '2026-10-23'],
    serie: { 'b.es': { titulares: [4, null, 3], con_hora: [4, null, 1] } } };
  c.api.s.dia = dia('2026-10-23'); c.api.s.dominio = 'b.es';
  const ficha = c.api.estFicha(), historico = ficha.slice(ficha.indexOf('estHistorico'));
  assert.deepEqual([...historico.matchAll(/data-valor="(\d{4}-\d{2}-\d{2})"/g)].map(m => m[1]), ['2026-10-23', '2026-10-21']);
  assert.match(historico, /33 %/);
  assert.match(ficha, /estMediaDiaria<\/dt><dd>4<\/dd>/);
  assert.doesNotMatch(ficha, /estHorario|estRetraso|estSecciones|estPorHora/);
  c.api.s.dia.medios['b.es'].pub = { ...c.api.s.dia.medios['b.es'].pub, primera: '06:55', ultima: '22:50', retraso_min: { p50: 54 },
    por_hora: Array.from({ length: 24 }, (_, h) => h === 14 ? 3 : 0) };
  assert.match(c.api.estFicha(), /06:55–22:50/);
  assert.match(c.api.estFicha(), /54 min/);
  assert.match(c.api.estFicha(), /estPico\{&quot;hora&quot;:14,&quot;n&quot;:&quot;3&quot;\}/);
});

test('los grupos «Familia · grupo» se pliegan bajo su familia, ordenados por titulares', () => {
  const c = contexto(), cat = { ...catalogo, 'e.gal': { n: 'E', g: 'Regional · Galicia' }, 'f.cat': { n: 'F', g: 'Regional · Cataluña' } };
  const familias = c.api.familiasEstadisticas(cat, Object.keys(cat), 'Sin grupo');
  assert.deepEqual([...familias.keys()], ['Nacional', 'Regional']);
  assert.deepEqual(copia([...familias.get('Regional')]), [['Regional · Galicia', ['c.gal', 'e.gal']], ['Regional · Cataluña', ['f.cat']]]);
  html(c);
  c.api.s.indice = { ...indice(), medios: cat }; c.api.s.dia = dia('2026-10-23');
  c.api.s.dia.medios['f.cat'] = { pub: { titulares: 5 } };
  const plegado = c.api.estResumen();
  assert.match(plegado, /data-est="familia" data-valor="Regional" aria-expanded="false">Regional<\/button><\/th><td>5<\/td><td>estNDe\{"n":"1","total":"3"\}<\/td>/);
  assert.ok(plegado.indexOf('Regional') < plegado.indexOf('>Nacional<'));
  assert.doesNotMatch(plegado, /est-subgrupo/);
  assert.ok(plegado.indexOf('estEvolucion') < plegado.indexOf('estPorGrupo'));
  c.api.s.familias.add('Regional');
  assert.match(c.api.estResumen(), /est-subgrupo">Cataluña<\/span><\/th><td>5<\/td>/);
  c.api.s.ambito = 'grupo:Nacional';
  assert.doesNotMatch(c.api.estResumen(), /estPorGrupo/);
});

test('sin día elegido se abre el último calculado, no hoy', async () => {
  const c = contexto(), pedidos = [];
  c.api.s.fecha = '';
  c.fetch = async url => { pedidos.push(url); return { ok: true, json: async () => url.endsWith('estadisticas.json') ? indice() : dia('2026-10-23') }; };
  await c.api.cargarEstadisticas();
  assert.equal(c.api.s.fecha, '2026-10-23'); assert.equal(c.api.s.dia.fecha, '2026-10-23');
  assert.match(pedidos[1], /estadisticas-dia-2026-10-23\.json$/);
});
