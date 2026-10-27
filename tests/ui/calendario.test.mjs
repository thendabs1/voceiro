import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fechas from '../../shared/calendario/fechas.js';
import * as consulta from '../../shared/calendario/consulta.js';
import { parseQuery, tokenizeQuery, normalize } from '../../shared/parser.js';
import { indexar, sugerirMunicipios, provinciaDe } from '../../shared/tiempo/lugares.js';
import { ADMINISTRACION } from '../../shared/territorios/administracion.js';
import { traducir } from '../../front/idiomas/index.js';

// El cliente está apagado hasta rehacer la interfaz; la capa de datos se prueba encendida.
const fuente = readFileSync(new URL('../../front/app/14-calendario.js', import.meta.url), 'utf8');
const codigo = fuente.replace(/^const CALENDARIO_ACTIVO = (true|false);$/m, 'const CALENDARIO_ACTIVO = true;');
assert.notEqual(codigo.match(/^const CALENDARIO_ACTIVO = true;$/m), null);
const BASES = { cf: { data: 'https://cf.test' }, deno: { data: 'https://deno.test' } };
const extremo = fecha => ({ fecha, certeza_fecha: fecha ? 'confirmado' : 'desconocida', certeza_hora: 'desconocida' });
const tarjeta = (id, dia, modalidad = 'puntual') => ({ id, clase: 'actividad', nombres: { es: id }, territorios: [],
  programacion: { valor: { modalidad, cuando: { inicio: extremo(dia || null), fin: extremo(dia || null) } } },
  lugar: { nombre: 'Sala', municipio: 'Vigo' }, resultado_disponible: false, fuentes: ['galicia'], dia });
const META = { version: 1, revision: 'r1', generado: '2026-10-25T06:00:00Z',
  horizonte: { desde: '2026-09-10', hasta: '2027-10-27' }, cobertura: [{ fuente: 'galicia', comprobado: '2026-10-25T05:00:00Z' }], colecciones: [] };
const CONCEPTOS = { cultura: { nombres: { es: 'Cultura' }, padres: [] }, teatro: { nombres: { es: 'Teatro' }, padres: ['cultura'] },
  deportes: { nombres: { es: 'Deportes' }, padres: [] }, tenis: { nombres: { es: 'Tenis' }, padres: ['deportes'] },
  economia: { nombres: { es: 'Economía' }, padres: [] } };
const esperar = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)); };

// API simulada: 47 citas repartidas en tres días, paginadas por un cursor que es el desplazamiento.
function api(u){
  const p = u.searchParams, ruta = u.pathname;
  if (ruta === '/calendario/catalogo') return { ...META, catalogo: { conceptos: CONCEPTOS }, fuentes: { galicia: { nombre: 'Galicia' } } };
  if (ruta === '/calendario/resumen') {
    const dias = [];
    for (let d = p.get('desde'); d < p.get('hasta'); d = fechas.sumarDiasCalendario(d, 1))
      dias.push({ dia: d, cantidad: 5, muestras: [tarjeta('A' + d, d), tarjeta('B' + d, d)] });
    return { ...META, dias };
  }
  if (ruta === '/calendario/objetivos') return { ...META, siguiente: null, entidades: [
    { tipo: 'agrupacion', id: 'liga', nombres: { es: 'Liga gallega' }, temas: ['teatro'] },
    { tipo: 'territorio', id: 'vigo', nombres: { es: 'Vigo' }, temas: [] }].filter(e => !p.get('tipo') || p.get('tipo').split(',').includes(e.tipo)) };
  if (ruta.startsWith('/calendario/eventos/')) return { ...META, entidades: {}, evento: { ...tarjeta(decodeURIComponent(ruta.slice(20)), '2026-10-25'),
    lugar: { valor: { nombre: 'Circuito', municipio_literal: 'Jerez' }, conflicto: false },
    participaciones: [], enlaces: [], fuentes: [{ fuente: 'galicia', url: 'https://galicia.test/1' }],
    programa: [tarjeta('Libres 1', '2026-10-24'), tarjeta('Carrera', '2026-10-26')] } };
  const pendientes = p.get('pendientes') === '1';
  const todos = pendientes ? Array.from({ length: 26 }, (_, i) => tarjeta('Pendiente ' + i, ''))
    : Array.from({ length: 47 }, (_, i) => tarjeta('Cita ' + String(i).padStart(2, '0'), fechas.sumarDiasCalendario(p.get('desde'), i % 3)));
  const desde = Number(p.get('cursor') || 0), limite = Number(p.get('limite'));
  return { ...META, eventos: todos.slice(desde, desde + limite), siguiente: desde + limite < todos.length ? String(desde + limite) : null };
}
function contexto({ intl = Intl, responder = api } = {}){
  const listeners = {}, pedidas = [], sugerencias = {};
  const panel = { addEventListener: (tipo, fn) => { listeners[tipo] = fn; }, querySelector: () => null, querySelectorAll: () => [] };
  const dialogo = { innerHTML: '', open: false, showModal(){ this.open = true; }, setAttribute(){}, removeAttribute(){},
    addEventListener(){}, querySelector: () => ({ focus(){} }) };
  const fetch = async url => {
    const u = new URL(url);
    pedidas.push(u);
    const r = responder(u);
    return r instanceof Response ? r : Response.json(r);
  };
  const c = { ...fechas, ...consulta, parseQuery, tokenizeQuery, normalize, sugerirMunicipios, provinciaDe, ADMINISTRACION,
    Intl: intl, ACCES: { lang: 'es' }, t: (k, v) => traducir('es', k, v), fetch, URL, URLSearchParams, AbortController, AbortSignal,
    setTimeout: fn => { fn(); return 0; }, clearTimeout(){}, requestAnimationFrame(){}, cerrarEstadisticas(){}, window: { scrollY: 0, scrollTo(){} },
    DATA_BASE: BASES.cf.data, BACKENDS: BASES,
    TIEMPO: { indice: indexar([['Vigo', '36057', 293652], ['Vilagarcía de Arousa', '36060', 37479]]) }, municipiosTiempo: async () => {},
    escapeHtml: s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
    document: { activeElement: null, getElementById: id => id === 'calendario-panel' ? panel : id === 'cal-evento-dialogo' ? dialogo
      : id.startsWith('cal-sug-') ? (sugerencias[id] ??= { innerHTML: '' }) : { addEventListener(){}, setAttribute(){}, focus(){} } },
  };
  runInNewContext(codigo + `\nthis.api = { s: CALENDARIO, calContenido, calFiltros, wireCalendario, abrirCalendario,
    actualizarConsultaCalendario }; pintarCalendario = () => {};`, c);
  c.api.wireCalendario();
  c.api.s.zona = 'Europe/Madrid';
  c.hoy = '2026-10-25';
  c.pedidas = pedidas; c.dialogo = dialogo; c.sugerencias = sugerencias;
  c.ultima = () => pedidas.at(-1);
  c.click = async (cal, valor = '', extra = {}) => {
    listeners.click({ target: { closest: () => ({ dataset: { cal, valor, ...extra } }) } }); await esperar();
  };
  c.escribir = async (id, value) => { listeners.input({ target: { id, value } }); await esperar(); };
  c.abrir = async () => { c.api.s.fecha = c.hoy; c.api.abrirCalendario(); await esperar(); };
  return c;
}
const cantidad = html => (html.match(/class="cal-evento cal-evento-compacto"/g) || []).length;

test('la agenda pide 14 días de 20 en 20, sigue el cursor y reinicia al cambiar un filtro', async () => {
  const c = contexto();
  await c.abrir();
  assert.deepEqual(c.pedidas.map(u => u.pathname), ['/calendario/catalogo', '/calendario/eventos']);
  const p = c.ultima().searchParams;
  assert.deepEqual([p.get('desde'), p.get('hasta'), p.get('limite'), p.get('zona')], ['2026-10-25', '2026-11-08', '20', 'Europe/Madrid']);
  let html = c.api.calContenido();
  assert.equal(cantidad(html), 20);
  assert.equal((html.match(/<section class="cal-dia">/g) || []).length, 3);
  assert.match(html, /Sala · Vigo/);
  await c.click('mas');
  assert.equal(c.ultima().searchParams.get('cursor'), '20');
  await c.click('mas');
  html = c.api.calContenido();
  assert.equal(cantidad(html), 47);
  assert.equal(new Set(html.match(/data-valor="Cita \d+"/g)).size, 47);
  assert.doesNotMatch(html, /data-cal="mas"/);
  await c.click('tema', 'teatro');
  assert.equal(c.ultima().searchParams.get('temas'), 'teatro');
  assert.equal(c.ultima().searchParams.get('cursor'), null);
  assert.equal(cantidad(c.api.calContenido()), 20);
  // Repetir la misma consulta no vuelve a pedirla.
  const antes = c.pedidas.length;
  c.api.abrirCalendario(); await c.click('vista', 'agenda');
  assert.equal(c.pedidas.length, antes);
});

test('si la publicación cambia entre páginas, la consulta se rehace desde el principio', async () => {
  const c = contexto({ responder: u => u.searchParams.get('cursor')
    ? Response.json({ error: 'La publicación cambió' }, { status: 409 }) : api(u) });
  await c.abrir();
  await c.click('mas');
  const ultimas = c.pedidas.slice(-2).map(u => u.searchParams.get('cursor'));
  assert.deepEqual(ultimas, ['20', null]);
  assert.equal(cantidad(c.api.calContenido()), 20);
  assert.equal(c.api.s.error, '');
});

test('semana y mes usan el resumen; un día abre solo su fecha con navegación diaria', async () => {
  const c = contexto();
  await c.abrir();
  await c.click('vista', 'semana');
  let p = c.ultima().searchParams;
  assert.equal(c.ultima().pathname, '/calendario/resumen');
  assert.deepEqual([p.get('desde'), p.get('hasta'), p.get('limite')], ['2026-10-19', '2026-10-26', null]);
  assert.equal(cantidad(c.api.calContenido()), 14);
  assert.match(c.api.calContenido(), /\+3 más/);
  await c.click('vista', 'mes');
  p = c.ultima().searchParams;
  assert.deepEqual([p.get('desde'), p.get('hasta')], ['2026-09-28', '2026-11-09']);
  assert.equal((c.api.calContenido().match(/class="cal-mini-evento"/g) || []).length, 84);
  assert.match(c.api.calContenido(), /title="lunes"/);
  await c.click('dia', '2026-10-26');
  p = c.ultima().searchParams;
  assert.deepEqual([c.ultima().pathname, p.get('desde'), p.get('hasta')], ['/calendario/eventos', '2026-10-26', '2026-10-27']);
  await c.click('anterior');
  assert.equal(c.api.s.fecha, '2026-10-25');
  assert.equal(c.ultima().searchParams.get('hasta'), '2026-10-26');
});

test('la ventana se recorta al horizonte publicado y fuera de él no se pide nada', async () => {
  const c = contexto();
  c.hoy = '2026-09-05';
  await c.abrir();
  assert.equal(c.ultima().searchParams.get('desde'), '2026-09-10');
  const antes = c.pedidas.length;
  c.api.s.fecha = '2027-12-01';
  await c.click('vista', 'agenda');
  assert.equal(c.pedidas.length, antes);
  assert.match(c.api.calContenido(), /fuera de las fechas publicadas/);
});

test('la consulta del buscador pasa ámbitos y texto libre, sin prefijos ni selecciones desconocidas', async () => {
  const c = contexto();
  c.api.actualizarConsultaCalendario(consulta.leerConsultaCalendario('tenis: circuito:wta Alcaraz web:ejemplo.es'));
  await esperar();
  const p = c.ultima().searchParams;
  assert.deepEqual([p.get('q'), p.get('texto')], ['tenis: circuito:wta', 'Alcaraz']);
  const antes = c.pedidas.length;
  c.api.actualizarConsultaCalendario(consulta.leerConsultaCalendario('tenis:resultados'));
  await esperar();
  assert.equal(c.pedidas.length, antes);
  assert.match(c.api.calContenido(), /Selección no reconocida/);
  // Una orden solo de noticias no abre la agenda.
  c.api.actualizarConsultaCalendario(consulta.leerConsultaCalendario('tenis:noticias'));
  await esperar();
  assert.equal(c.pedidas.length, antes);
});

test('dónde sugiere comunidad, provincia y municipio y filtra por su territorio común', async () => {
  const c = contexto();
  await c.abrir();
  await c.escribir('cal-donde', 'Gal');
  assert.match(c.sugerencias['cal-sug-donde'].innerHTML, /data-valor="es:autonomia:12"/);
  await c.escribir('cal-donde', 'vig');
  assert.match(c.sugerencias['cal-sug-donde'].innerHTML, /data-valor="es:municipio:36057"[^>]*>Vigo <small>Pontevedra/);
  await c.click('elegir-donde', 'es:municipio:36057', { nombre: 'Vigo' });
  assert.equal(c.ultima().searchParams.get('territorio'), 'es:municipio:36057');
  assert.match(c.api.calFiltros(), /data-cal="quitar-donde"/);
  assert.doesNotMatch(c.api.calFiltros(), /id="cal-donde"/);
  await c.click('quitar-donde');
  assert.equal(c.ultima().searchParams.get('territorio'), null);
});

test('qué consulta entidades publicadas sin territorios y filtra por objetivo', async () => {
  const c = contexto();
  await c.abrir();
  await c.escribir('cal-que', 'li');
  assert.notEqual(c.ultima().pathname, '/calendario/objetivos');
  await c.escribir('cal-que', 'liga');
  assert.deepEqual([c.ultima().pathname, c.ultima().searchParams.get('texto')], ['/calendario/objetivos', 'liga']);
  // Los tipos se filtran en el servidor, antes del límite.
  assert.deepEqual([c.ultima().searchParams.get('tipo'), c.ultima().searchParams.get('limite')], ['agrupacion,actividad,participante,lugar', '8']);
  const html = c.sugerencias['cal-sug-que'].innerHTML;
  assert.match(html, /data-valor="agrupacion:liga"[^>]*>Liga gallega <small>Teatro/);
  assert.doesNotMatch(html, /territorio:vigo/);
  await c.click('elegir-que', 'agrupacion:liga', { nombre: 'Liga gallega' });
  assert.equal(c.ultima().searchParams.get('objetivo'), 'agrupacion:liga');
  const filtros = c.api.calFiltros();
  assert.ok(filtros.indexOf('id="cal-texto"') < filtros.indexOf('<details'));
  assert.ok(filtros.indexOf('id="cal-donde"') < filtros.indexOf('<details'));
  assert.ok(filtros.indexOf('data-cal="tema"') < filtros.indexOf('<details'));
  assert.doesNotMatch(filtros, /Economía/);
});

test('un fallo del primer backend pasa al segundo; un error de la consulta no se repite', async () => {
  const c = contexto({ responder: u => u.hostname === 'cf.test' ? Response.json({ error: 'No activada' }, { status: 503 }) : api(u) });
  await c.abrir();
  assert.deepEqual(c.pedidas.map(u => u.hostname + u.pathname), ['cf.test/calendario/catalogo', 'deno.test/calendario/catalogo',
    'cf.test/calendario/eventos', 'deno.test/calendario/eventos']);
  assert.equal(cantidad(c.api.calContenido()), 20);
  const d = contexto({ responder: u => u.pathname === '/calendario/eventos' ? Response.json({ error: 'x' }, { status: 400 }) : api(u) });
  await d.abrir();
  assert.equal(d.pedidas.filter(u => u.pathname === '/calendario/eventos').length, 1);
  assert.equal(d.api.s.error, 'calError');
});

test('un 429 no pasa al otro backend y se espera lo que pide Retry-After', async () => {
  let limitado = false;
  const c = contexto({ responder: u => limitado && u.pathname === '/calendario/eventos'
    ? new Response(JSON.stringify({ error: 'demasiadas peticiones' }), { status: 429, headers: { 'Retry-After': '30' } }) : api(u) });
  await c.abrir();
  limitado = true;
  await c.click('tema', 'teatro');
  assert.deepEqual(c.pedidas.slice(-1).map(u => u.hostname + u.pathname), ['cf.test/calendario/eventos']);
  assert.equal(c.api.s.error, 'calError');
  const antes = c.pedidas.length;
  await c.click('tema', 'tenis');
  assert.equal(c.pedidas.length, antes);
});

test('si falla la renovación se conserva la lista anterior; otra consulta no la hereda', async () => {
  let falla = false;
  const c = contexto({ responder: u => falla && u.pathname === '/calendario/eventos'
    ? Response.json({ error: 'caída' }, { status: 503 }) : api(u) });
  await c.abrir();
  await c.click('mas');
  falla = true;
  await c.click('renovar');
  assert.equal(c.api.s.error, 'calError');
  assert.equal(cantidad(c.api.calContenido()), 40);
  assert.equal(c.api.s.lista.cargando, false);
  await c.click('tema', 'teatro');
  assert.equal(c.api.s.lista, null);
});

test('sin fecha se pide al pulsar y pagina; el detalle trae lugar, programa y fuente', async () => {
  const c = contexto();
  await c.abrir();
  assert.match(c.api.calContenido(), /data-cal="pendientes"/);
  await c.click('pendientes');
  assert.equal(c.ultima().searchParams.get('pendientes'), '1');
  await c.click('mas-pendientes');
  assert.equal(c.ultima().searchParams.get('cursor'), '20');
  assert.equal((c.api.calContenido().match(/data-valor="Pendiente \d+"/g) || []).length, 26);
  await c.click('evento', 'GP de prueba');
  assert.equal(c.ultima().pathname, '/calendario/eventos/GP%20de%20prueba');
  assert.ok(c.dialogo.open);
  assert.match(c.dialogo.innerHTML, /Circuito · Jerez/);
  assert.match(c.dialogo.innerHTML, /Programa<\/h4><ul><li><span>Libres 1/);
  assert.match(c.dialogo.innerHTML, /href="https:\/\/galicia.test\/1"/);
});

test('cambiar de vista reutiliza los formatos de fecha de la interfaz', async () => {
  let construidos = 0;
  const c = contexto({ intl: { DateTimeFormat: function(...args){ construidos++; return new Intl.DateTimeFormat(...args); } } });
  await c.abrir();
  for (let i = 0; i < 5; i++) for (const vista of ['agenda', 'semana', 'mes']){
    await c.click('vista', vista); c.api.calContenido();
  }
  assert.ok(construidos <= 8, `se crearon ${construidos} formatos`);
  const antes = construidos;
  c.ACCES.lang = 'en';
  assert.match(c.api.calContenido(), /title="Monday"/);
  assert.ok(construidos > antes);
});
