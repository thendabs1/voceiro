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

// La capa de datos se prueba encendida también si se apagara el cliente.
const fuente = readFileSync(new URL('../../front/app/14-calendario.js', import.meta.url), 'utf8');
// «Hoy» lo fija cada prueba (c.hoy), no el reloj.
const codigo = fuente.replace(/^const CALENDARIO_ACTIVO = (true|false);$/m, 'const CALENDARIO_ACTIVO = true;')
  .replace(/^const calHoy = .*$/m, 'const calHoy = () => globalThis.hoy;');
assert.notEqual(codigo.match(/^const CALENDARIO_ACTIVO = true;$/m), null);
const BASES = { cf: { data: 'https://cf.test' }, deno: { data: 'https://deno.test' } };
const extremo = (fecha, hora = null) => ({ fecha, certeza_fecha: fecha ? 'confirmado' : 'desconocida',
  ...(hora ? { instante: `${fecha}T${hora}:00Z`, certeza_hora: 'confirmado' } : { certeza_hora: 'desconocida' }) });
const tarjeta = (id, dia, { hora = null, presentacion = 'cita', ...extra } = {}) => ({ id, clase: 'actividad', nombres: { es: id }, territorios: [],
  programacion: { valor: { modalidad: presentacion === 'prolongada' ? 'intervalo' : 'puntual',
    cuando: { inicio: extremo(dia || null, hora), fin: extremo(presentacion === 'prolongada' && dia ? fechas.sumarDiasCalendario(dia, 60) : null) } } },
  lugar: { nombre: 'Sala', municipio: 'Vigo' }, resultado_disponible: false, fuentes: ['galicia'], presentacion, dia, ...extra });
const META = { version: 1, revision: 'r1', generado: '2026-10-25T06:00:00Z',
  horizonte: { desde: '2026-09-10', hasta: '2027-10-27' }, cobertura: [{ fuente: 'galicia', comprobado: '2026-10-25T05:00:00Z' }],
  colecciones: [{ coleccion: 'nba', calendario_completo: false }, { coleccion: 'f1', calendario_completo: true }] };
const CONCEPTOS = { cultura: { nombres: { es: 'Cultura' }, padres: [] }, teatro: { nombres: { es: 'Teatro' }, padres: ['cultura'] },
  deportes: { nombres: { es: 'Deportes' }, padres: [] }, tenis: { nombres: { es: 'Tenis' }, padres: ['deportes'] },
  economia: { nombres: { es: 'Economía' }, padres: [] } };
const esperar = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)); };

// API simulada: cada día, 26 citas (la primera a las 17:00, concierto gratis) y
// 4 en curso, de cultura; el 27, además un GP en curso (deportes). Listas
// paginadas por un cursor que es el desplazamiento.
function api(u){
  const p = u.searchParams, ruta = u.pathname;
  if (ruta === '/calendario/catalogo') return { ...META, catalogo: { conceptos: CONCEPTOS }, fuentes: { galicia: { nombre: 'Galicia' } },
    ...(p.get('disponibilidad') ? { disponibilidad: { territorio: p.get('territorio') || null, temas: { teatro: 12 }, raices: { cultura: 15, deportes: 2 },
      sin_subcategoria: { cultura: 3 }, circuitos: { f1: 23, nba: 113 } } } : {}) };
  if (ruta === '/calendario/resumen') {
    const dias = [], n = Number(p.get('muestras') ?? 2);
    for (let d = p.get('desde'); d < p.get('hasta'); d = fechas.sumarDiasCalendario(d, 1)) {
      const categorias = { cultura: { citas: 25, programas: 1, en_curso: 4 } }, competiciones = { wta: { citas: 0, programas: 0, en_curso: 2 } };
      if (d === '2026-10-27'){
        categorias.deportes = { citas: 0, programas: 0, en_curso: 1 };
        Object.assign(competiciones, { nba: { citas: 9, programas: 0, en_curso: 0 }, f1: { citas: 0, programas: 1, en_curso: 0 }, atp: { citas: 1, programas: 0, en_curso: 0 } });
      }
      dias.push({ dia: d, cantidad: 30, citas: 25, programas: 1, en_curso: 4, categorias, competiciones, chips: 26, muestras: [
        tarjeta('A' + d, d, { hora: '17:00', formatos: ['concierto'], precio: 'gratis', categoria: 'cultura' }), tarjeta('B' + d, d), tarjeta('C' + d, d)].slice(0, n) });
    }
    return { ...META, dias, ...(p.get('barras') ? { barras: [{ ...tarjeta('GP de México', '2026-10-30', { presentacion: 'programa', competiciones: ['f1'], categoria: 'deportes' }),
      programacion: { valor: { modalidad: 'puntual', cuando: { inicio: extremo('2026-10-30'), fin: extremo('2026-11-01') } } },
      desde: '2026-10-30', hasta: '2026-11-02' }] } : {}) };
  }
  if (ruta.startsWith('/calendario/eventos/')) return { ...META, entidades: {}, evento: { ...tarjeta(decodeURIComponent(ruta.slice(20)), '2026-10-25'),
    lugar: { valor: { nombre: 'Circuito', municipio_literal: 'Jerez' }, conflicto: false },
    participaciones: [], enlaces: [], fuentes: [{ fuente: 'galicia', url: 'https://galicia.test/1' }],
    programa: [tarjeta('Libres 1', '2026-10-24'), tarjeta('Carrera', '2026-10-26')] } };
  const dia = p.get('desde');
  if (p.get('circuitos')) return { ...META, siguiente: null, eventos: [
    tarjeta('GP de México', '2026-10-30', { presentacion: 'programa', competiciones: ['f1'] }),
    ...Array.from({ length: 6 }, (_, i) => tarjeta('Torneo ' + i, '2026-10-0' + (i + 1), { presentacion: 'prolongada', competiciones: ['wta'] }))] };
  const todos = p.get('pendientes') === '1' ? Array.from({ length: 26 }, (_, i) => tarjeta('Pendiente ' + i, ''))
    : p.get('presentacion') === 'prolongada' ? Array.from({ length: 4 }, (_, i) => tarjeta(`Expo ${i} ${dia}`, dia, { presentacion: 'prolongada' }))
    : Array.from({ length: 26 }, (_, i) => tarjeta(`Cita ${String(i).padStart(2, '0')} ${dia}`, dia, i < 20 ? { hora: `${String(8 + (i >> 1)).padStart(2, '0')}:00` } : {}));
  const desde = Number(p.get('cursor') || 0), limite = Number(p.get('limite'));
  return { ...META, eventos: todos.slice(desde, desde + limite), siguiente: desde + limite < todos.length ? String(desde + limite) : null };
}
function contexto({ intl = Intl, responder = api, sitios = [], almacen = {}, guardarFalla = false } = {}){
  const listeners = {}, pedidas = [], sugerencias = {}, buscar = { value: '', addEventListener(){} }, aplicadas = [];
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
    DATA_BASE: BASES.cf.data, BACKENDS: BASES, sitiosTiempo: () => sitios, toast(){},
    localStorage: { getItem: k => almacen[k] ?? null, setItem: (k, v) => { if (guardarFalla) throw new Error('lleno'); almacen[k] = String(v); } },
    TIEMPO: { indice: indexar([['Vigo', '36057', 293652], ['Vilagarcía de Arousa', '36060', 37479]]) }, municipiosTiempo: async () => {},
    escapeHtml: s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'),
    partirConsulta: raw => ({ antes: raw, consulta: '' }), aplicarFiltros: () => aplicadas.push(buscar.value),
    document: { activeElement: null, getElementById: id => id === 'calendario-panel' ? panel : id === 'cal-evento-dialogo' ? dialogo : id === 'buscar' ? buscar
      : id.startsWith('cal-sug-') ? (sugerencias[id] ??= { innerHTML: '' }) : { addEventListener(){}, setAttribute(){}, focus(){} } },
  };
  runInNewContext(codigo + `\nthis.api = { s: CALENDARIO, calContenido, calChips, calDonde, calAsistente, wireCalendario, abrirCalendario,
    actualizarConsultaCalendario }; pintarCalendario = () => {};`, c);
  c.api.wireCalendario();
  c.api.s.zona = 'Europe/Madrid';
  c.hoy = '2026-10-25';
  c.almacen = almacen; c.panel = panel; c.pedidas = pedidas; c.dialogo = dialogo; c.sugerencias = sugerencias; c.buscar = buscar; c.aplicadas = aplicadas;
  c.ultima = () => pedidas.at(-1);
  c.resumen = () => pedidas.findLast(u => u.pathname === '/calendario/resumen').searchParams;
  c.click = async (cal, valor = '', extra = {}) => {
    listeners.click({ target: { closest: () => ({ dataset: { cal, valor, ...extra } }) } }); await esperar();
  };
  c.listeners = listeners;
  c.escribir = async (id, value) => { listeners.input({ target: { id, value } }); await esperar(); };
  c.marcar = async (name, value, checked = true, nombre = '') => { listeners.change({ target: { name, value, checked, id: '', dataset: { nombre } } }); await esperar(); };
  c.abrir = async () => { c.api.s.fecha = c.hoy; c.api.abrirCalendario(); await esperar(); };
  c.deportes = async () => { c.api.s.fecha = c.hoy; c.api.abrirCalendario(null, 'deportes'); await esperar(); };
  return c;
}
const cantidad = html => (html.match(/class="cal-cita"/g) || []).length;
const secciones = html => (html.match(/<section class="cal-dia[^"]*"/g) || []).length;

test('la lista pide una semana desde hoy con tres muestras; un día abre sus citas de 20 en 20', async () => {
  const c = contexto();
  await c.abrir();
  assert.deepEqual(c.pedidas.map(u => u.pathname), ['/calendario/catalogo', '/calendario/resumen']);
  const p = c.ultima().searchParams;
  assert.deepEqual([p.get('desde'), p.get('hasta'), p.get('muestras'), p.get('zona')], ['2026-10-25', '2026-11-01', '3', 'Europe/Madrid']);
  let html = c.api.calContenido();
  assert.equal(secciones(html), 7);
  assert.equal(cantidad(html), 21);
  assert.match(html, /Hoy · domingo, 25 oct[\s\S]*?26 citas/);
  // Tarjeta: hora en su columna, lugar y tipo de plan con precio; sin hora, bajo su rótulo.
  assert.match(html, /<span class="cal-hora">18:00<\/span>[\s\S]*?Sala · Vigo[\s\S]*?<p class="cal-plan">Concierto · Gratis<\/p>/);
  assert.match(html, /<p class="cal-sin-hora">Sin hora confirmada<\/p>/);
  // La agenda no pide barras: solo las tienen las competiciones, que van en Deportes.
  assert.equal(p.get('barras'), null);
  assert.doesNotMatch(html, /cal-todo-dia/);
  // Abrir un día pide sus chips (los mismos que cuenta y muestra), no los eventos padre.
  await c.click('ver-dia', '2026-10-26');
  let q = c.ultima().searchParams;
  assert.deepEqual([c.ultima().pathname, q.get('desde'), q.get('hasta'), q.get('chips'), q.get('limite')],
    ['/calendario/eventos', '2026-10-26', '2026-10-27', '1', '20']);
  await c.click('mas-dia', '2026-10-26');
  assert.equal(c.ultima().searchParams.get('cursor'), '20');
  html = c.api.calContenido();
  assert.equal(new Set(html.match(/data-valor="2026-10-26~~Cita \d+ 2026-10-26"/g)).size, 26);
  assert.doesNotMatch(html, /data-cal="mas-dia"/);
  await c.click('ocultar-dia', '2026-10-26');
  assert.match(c.api.calContenido(), /data-cal="ver-dia" data-valor="2026-10-26"/);
  // Una categoría rehace el resumen y cierra las listas abiertas.
  await c.click('categoria', 'cultura');
  q = c.ultima().searchParams;
  assert.deepEqual([c.ultima().pathname, q.get('temas')], ['/calendario/resumen', 'cultura']);
  assert.equal(c.api.s.dias.size, 0);
  // Repetir la misma consulta no vuelve a pedirla.
  const antes = c.pedidas.length;
  c.api.abrirCalendario(); await c.click('categoria', 'cultura');
  assert.equal(c.pedidas.length, antes);
  // Más días: la semana siguiente, hasta cuatro.
  await c.click('mas-semanas');
  assert.deepEqual([c.resumen().get('desde'), c.resumen().get('hasta')], ['2026-10-25', '2026-11-08']);
  assert.equal(secciones(c.api.calContenido()), 14);
});

test('una muestra de chip usa su hora del día y lleva encima su GP', async () => {
  const c = contexto({ responder: u => u.pathname === '/calendario/resumen' ? { ...META, dias: [{ dia: '2026-10-25', citas: 0, programas: 1, en_curso: 0,
    categorias: {}, competiciones: {}, chips: 1, muestras: [tarjeta('gp', '2026-10-23', { presentacion: 'cita', tiene_programa: true,
      hora_muestra: '20:00', nombres: { es: 'Carrera' }, padre: { es: 'GP de México' } })] }] } : api(u) });
  await c.abrir();
  assert.match(c.api.calContenido(), /<span class="cal-hora">20:00<\/span>[\s\S]*?cal-padre">GP de México<\/p>[\s\S]*?>Carrera<\/button>/);
});

test('En cartel: plegado con su cuenta; al abrirlo pide lo prolongado del día', async () => {
  const c = contexto();
  await c.abrir();
  assert.match(c.api.calContenido(), /data-cal="curso" data-valor="2026-10-25" aria-expanded="false">▸ En cartel · 4/);
  await c.click('curso', '2026-10-25');
  assert.deepEqual([c.ultima().searchParams.get('presentacion'), c.ultima().searchParams.get('desde')], ['prolongada', '2026-10-25']);
  const html = c.api.calContenido();
  assert.equal((html.match(/data-valor="2026-10-25~~Expo \d 2026-10-25"/g) || []).length, 4);
  assert.match(html, /aria-expanded="true"/);
  const antes = c.pedidas.length;
  await c.click('curso', '2026-10-25');
  await c.click('curso', '2026-10-25');
  assert.equal(c.pedidas.length, antes, 'cerrar y volver a abrir no repite la petición');
});

test('si la publicación cambia entre páginas, la lista del día se rehace desde el principio', async () => {
  const c = contexto({ responder: u => u.searchParams.get('cursor')
    ? Response.json({ error: 'La publicación cambió' }, { status: 409 }) : api(u) });
  await c.abrir();
  await c.click('ver-dia', '2026-10-25');
  await c.click('mas-dia', '2026-10-25');
  assert.deepEqual(c.pedidas.slice(-2).map(u => u.searchParams.get('cursor')), ['20', null]);
  assert.equal(c.api.s.dias.get('2026-10-25|citas').eventos.length, 20);
  assert.equal(c.api.s.error, '');
});

test('tira: la semana con puntos por categoría y el pasado atenuado; se despliega en mes', async () => {
  const c = contexto();
  c.hoy = '2026-10-27';
  await c.abrir();
  let html = c.api.calContenido();
  // Lunes 26 ya pasó y no tiene cuentas; el 27 (hoy) lleva cultura y el GP (deportes, en curso).
  assert.match(html, /class="cal-celda cal-pasado" data-cal="dia" data-valor="2026-10-26"\s+aria-pressed="false"/);
  assert.match(html, /data-valor="2026-10-27"\s+aria-pressed="true" aria-current="date" aria-label="martes, 27 de octubre: 26 citas · 4 en curso · Cultura, Deportes">[\s\S]*?cal-cat-cultura[\s\S]*?cal-cat-deportes/);
  // Lo prolongado de cultura no pinta punto por sí solo; el de deportes sí.
  assert.doesNotMatch(html.match(/data-valor="2026-10-28"[\s\S]*?<\/button>/)[0], /cal-cat-deportes/);
  assert.equal((html.match(/data-cal="dia"/g) || []).length, 7);
  await c.click('mes');
  assert.deepEqual([c.resumen().get('desde'), c.resumen().get('hasta'), c.resumen().get('muestras')], ['2026-09-28', '2026-11-09', '0']);
  html = c.api.calContenido();
  assert.equal((html.match(/data-cal="dia"/g) || []).length, 42);
  assert.match(html, /title="lunes"/);
  // Tocar un día lo elige, pliega el mes y la lista empieza en él.
  await c.click('dia', '2026-10-30');
  assert.deepEqual([c.api.s.fecha, c.api.s.mesAbierto, c.resumen().get('desde')], ['2026-10-30', false, '2026-10-30']);
  // Semanas vecinas: su lunes, u hoy si cae en ellas.
  await c.click('siguiente');
  assert.equal(c.api.s.fecha, '2026-11-02');
  await c.click('anterior');
  assert.equal(c.api.s.fecha, '2026-10-27');
});

test('atajos de fecha: hoy, mañana y el finde enseñan solo sus días', async () => {
  const c = contexto();
  c.hoy = '2026-10-22';   // jueves
  await c.abrir();
  await c.click('rango', 'manana', { dia: '2026-10-23' });
  assert.deepEqual([c.api.s.fecha, secciones(c.api.calContenido())], ['2026-10-23', 1]);
  await c.click('rango', 'finde');
  assert.equal(c.api.s.fecha, '2026-10-24');
  assert.deepEqual(c.api.calContenido().match(/id="cal-dia-[\d-]+"/g), ['id="cal-dia-2026-10-24"', 'id="cal-dia-2026-10-25"']);
  // Pulsar otra vez el atajo activo vuelve a hoy sin atajo.
  await c.click('rango', 'finde');
  assert.deepEqual([c.api.s.fecha, c.api.s.rango], ['2026-10-22', '']);
});

test('chips: Todo, categorías con su segunda fila, deporte local y Gratis', async () => {
  const c = contexto();
  await c.abrir();
  let chips = c.api.calChips();
  assert.match(chips, /data-valor="" class="" aria-pressed="true">Todo/);
  assert.match(chips, /data-valor="cultura" class="cal-cat cal-cat-cultura" aria-pressed="false">Cultura/);
  assert.doesNotMatch(chips, /Economía|cal-subchips/);
  await c.click('categoria', 'cultura');
  assert.match(c.api.calChips(), /cal-subchips[\s\S]*data-valor="teatro"/);
  await c.click('tema', 'teatro');
  assert.equal(c.resumen().get('temas'), 'teatro');
  await c.click('tema', 'teatro');
  assert.equal(c.resumen().get('temas'), 'cultura');
  // En la agenda, «Deportes» es el deporte del sitio, con sus subcategorías; las competiciones tienen su vista.
  assert.match(c.api.calChips(), /data-valor="deportes" class="cal-cat cal-cat-deportes" aria-pressed="false">Deporte local/);
  await c.click('categoria', 'deportes');
  assert.match(c.api.calChips(), /cal-subchips[\s\S]*data-valor="tenis"/);
  assert.deepEqual([c.resumen().get('temas'), c.resumen().get('q'), c.resumen().get('barras')], ['deportes', null, null]);
  assert.equal(c.api.s.capas, null);
  await c.click('gratis');
  assert.equal(c.resumen().get('precio'), 'gratis');
  await c.click('categoria', '');
  assert.deepEqual([c.resumen().get('temas'), c.resumen().get('q'), c.resumen().get('precio')], [null, null, 'gratis']);
});

test('Deportes abre el mes con marcas por competición y «Este mes en deportes»', async () => {
  const c = contexto();
  c.hoy = '2026-10-26';
  await c.deportes();
  assert.equal(c.api.s.mesAbierto, true);
  const temporada = c.pedidas.findLast(u => u.searchParams.get('circuitos'));
  assert.deepEqual([temporada.searchParams.get('desde'), temporada.searchParams.get('hasta'), temporada.searchParams.get('presentacion')],
    ['2026-10-01', '2026-11-01', 'prolongada,programa']);
  const html = c.api.calContenido();
  // El 27: F1 primero, NBA con sus partidos; ATP y WTA en «+2». Sin puntos ni leyenda.
  const celda = html.match(/data-valor="2026-10-27"[\s\S]*?<\/button>/)[0];
  assert.match(celda, /aria-label="martes, 27 de octubre: [^"]*F1, NBA · 9 partidos, ATP · 1 partido, WTA"/);
  assert.match(celda, /<span class="cal-marca">F1<\/span><span class="cal-marca">NBA 9<\/span>[\s\S]*\+2/);
  assert.doesNotMatch(html, /cal-leyenda/);
  // El bloque del mes: partidos por liga, programación parcial y los torneos (cuatro y «y 2 más»).
  assert.match(html, /Este mes en deportes · octubre/);
  assert.match(html, /data-valor="f1"[^>]*>F1<\/button>[\s\S]*?GP de México/);
  assert.match(html, /data-valor="nba"[^>]*>NBA<\/button>\s*<span class="cal-nota">9 partidos<\/span><span class="cal-nota">· programación parcial/);
  assert.match(html, /Torneo 3[\s\S]*y 2 más/);
  // Tocar una competición del bloque deja solo su capa.
  await c.click('solo', 'nba');
  assert.equal(c.resumen().get('q'), 'nba:');
  assert.match(c.api.calContenido(), /data-cal="solo" data-valor="nba" aria-pressed="true"/);
});

test('calendario deportivo: capas con casillas por deporte, sin ciudad; desplegable en estrecho y columna en ancho', async () => {
  const c = contexto({ sitios: [{ nombre: 'Vigo', lugar: { ine: '36057' } }] });
  await c.deportes();
  let html = c.api.calContenido();
  // Estrecho: desplegable cerrado con la cuenta de capas: las 12 competiciones, sin capa de ciudad.
  assert.match(html, /data-cal="lateral"[^>]*aria-expanded="false"[^>]*>Competiciones · 12 de 12 ▾/);
  assert.match(html, /class="cal-lateral-cuerpo" hidden/);
  assert.deepEqual([c.resumen().get('territorio'), c.resumen().get('temas')], [null, null]);
  await c.click('lateral');
  html = c.api.calContenido();
  assert.match(html, /<legend>Fútbol<\/legend>[\s\S]*value="primera" checked/);
  assert.doesNotMatch(html, /Deporte en|<legend>Cerca/);
  // Desmarcar una competición la quita de la consulta.
  await c.marcar('cal-capa', 'nba', false);
  assert.ok(!c.resumen().get('q').split(' ').includes('nba:'));
  assert.match(c.api.calContenido(), /Competiciones · 11 de 12/);
  // Con una sola capa, su casilla no se puede desmarcar.
  await c.click('solo', 'f1');
  html = c.api.calContenido();
  assert.match(html, /value="f1" checked disabled/);
  assert.deepEqual([c.resumen().get('q'), c.resumen().get('territorio')], ['f1:', null]);
  await c.click('capas-todas');
  assert.deepEqual([c.resumen().get('q').split(' ').length, c.resumen().get('territorio')], [12, null]);
  // Ancho: columna fija a la izquierda, sin desplegable.
  c.panel.clientWidth = 1000;
  html = c.api.calContenido();
  assert.match(html, /cal-con-lateral cal-fijo[\s\S]*<h2>Competiciones · 12 de 12<\/h2>/);
  assert.doesNotMatch(html, /data-cal="lateral"/);
  // La agenda no tiene barra lateral y va a su sitio.
  await c.abrir();
  assert.doesNotMatch(c.api.calContenido(), /cal-lateral/);
  assert.deepEqual([c.resumen().get('territorio'), c.resumen().get('q')], ['es:provincia:36', null]);
});

test('en Deportes, el GP va arriba de cada día suyo como «todo el día»', async () => {
  const c = contexto();
  await c.deportes();
  assert.equal(c.resumen().get('barras'), '1');
  const html = c.api.calContenido();
  assert.match(html, /id="cal-dia-2026-10-31"><h2>[\s\S]*?<article class="cal-cita cal-todo-dia"><span class="cal-hora cal-cat-deportes">Todo el día<\/span>[\s\S]*?GP de México[\s\S]*?Día 2 de 3/);
  assert.equal((html.match(/cal-todo-dia/g) || []).length, 2);
  // La fila «todo el día» es un desplegable propio.
  assert.match(html, /data-valor="2026-10-30~\*~GP de México"/);
});

test('sin configurar, el calendario invita al asistente; «Ahora no» lo recuerda', async () => {
  const c = contexto();
  await c.abrir();
  assert.match(c.api.calContenido(), /Tu calendario, a tu manera[\s\S]*data-cal="ahora-no"/);
  await c.click('ahora-no');
  assert.deepEqual(JSON.parse(c.almacen['voceiro-calendario-preferencias-v1']), { v: 1, estado: 'omitido' });
  assert.doesNotMatch(c.api.calContenido(), /cal-invitacion/);
});

test('asistente: sitio de Mis sitios, intereses y competiciones con datos, y «Lo mío» al guardar', async () => {
  const c = contexto({ sitios: [{ nombre: 'Vigo', lugar: { ine: '36057' } }] });
  await c.abrir();
  await c.click('asistente', '0');
  let html = c.api.calAsistente();
  assert.match(html, /Paso 1 de 4[\s\S]*value="es:municipio:36057" data-nombre="Vigo"[\s\S]*value="es:provincia:36" data-nombre="Provincia de Pontevedra"[\s\S]*Sin sitio/);
  await c.marcar('cal-as-sitio', 'es:municipio:36057', true, 'Vigo');
  await c.click('as-siguiente');
  const q = c.ultima().searchParams;
  assert.deepEqual([c.ultima().pathname, q.get('disponibilidad'), q.get('territorio')], ['/calendario/catalogo', '1', 'es:municipio:36057']);
  html = c.api.calAsistente();
  // Solo lo que hay: Teatro (12), Otra cultura (3) y Deporte local (2); no el resto del catálogo.
  assert.match(html, /¿Qué te interesa en Vigo\?[\s\S]*value="teatro"[^>]*>\s*<span>Teatro <small>· 12/);
  assert.match(html, /value="otra"[^>]*checked[\s\S]*Otra cultura <small>· 3/);
  assert.match(html, /Deporte local <small>· 2/);
  await c.marcar('cal-as-interes', 'teatro');
  await c.click('as-siguiente');
  assert.match(c.api.calAsistente(), /Baloncesto[\s\S]*value="nba"[\s\S]*Motor[\s\S]*value="f1"/);
  assert.doesNotMatch(c.api.calAsistente(), /value="wta"/);
  await c.marcar('cal-as-comp', 'f1');
  await c.click('as-siguiente');
  assert.match(c.api.calAsistente(), /Vigo[\s\S]*Teatro, Otra cultura[\s\S]*F1/);
  await c.click('as-guardar');
  const guardado = JSON.parse(c.almacen['voceiro-calendario-preferencias-v1']);
  assert.deepEqual([guardado.estado, guardado.sitio, guardado.intereses, guardado.competiciones],
    ['configurado', { id: 'es:municipio:36057', nombre: 'Vigo' }, { cultura: ['teatro'], otraCultura: true, deporteLocal: false }, ['f1']]);
  assert.deepEqual([c.api.s.asistente, c.api.s.mio, c.resumen().get('temas'), c.resumen().get('territorio')],
    [null, true, 'teatro,otra:cultura', 'es:municipio:36057']);
  assert.match(c.api.calChips(), /data-valor="mio" class="" aria-pressed="true">Lo mío[\s\S]*data-valor="" class="" aria-pressed="false">Todo/);
  // Deportes: las competiciones que sigo, sin ciudad ni temas.
  await c.deportes();
  assert.deepEqual([[...c.api.s.capas], c.resumen().get('q'), c.resumen().get('territorio'), c.resumen().get('temas')], [['f1'], 'f1:', null, null]);
  // Otra sesión: arranca con lo guardado.
  const d = contexto({ almacen: c.almacen });
  await d.abrir();
  assert.deepEqual([d.resumen().get('temas'), d.resumen().get('territorio')], ['teatro,otra:cultura', 'es:municipio:36057']);
});

test('«Sin sitio» son solo competiciones: el asistente salta los intereses y no los guarda', async () => {
  const c = contexto();
  await c.abrir();
  await c.click('asistente', '0');
  await c.marcar('cal-as-sitio', '', true);
  await c.click('as-siguiente');
  assert.equal(c.api.s.asistente.paso, 2);
  await c.marcar('cal-as-comp', 'f1');
  await c.click('as-siguiente');
  assert.doesNotMatch(c.api.calAsistente(), /data-valor="1"/);
  await c.click('as-anterior'); await c.click('as-anterior');
  assert.equal(c.api.s.asistente.paso, 0);
  await c.click('as-ir', '3');
  await c.click('as-guardar');
  const guardado = JSON.parse(c.almacen['voceiro-calendario-preferencias-v1']);
  // «Otra cultura» venía marcada de inicio: sin sitio no se guarda.
  assert.deepEqual([guardado.sitio, guardado.intereses, guardado.competiciones],
    [null, { cultura: [], otraCultura: false, deporteLocal: false }, ['f1']]);
});

test('sin competiciones seguidas, Deportes ofrece elegirlas; guardar sin nada avisa', async () => {
  const c = contexto();
  await c.deportes();
  assert.match(c.api.calContenido(), /cal-lateral[\s\S]*data-cal="asistente" data-valor="2"[^>]*>Elegir competiciones/);
  await c.click('asistente', '2');
  assert.equal(c.api.s.asistente.paso, 2);
  await c.marcar('cal-as-interes', 'otra', false);
  await c.click('as-ir', '3');
  await c.click('as-guardar');
  assert.match(c.api.calAsistente(), /Elige al menos un interés o una competición/);
  assert.equal(c.almacen['voceiro-calendario-preferencias-v1'], undefined);
  await c.click('as-cancelar');
  assert.equal(c.api.s.asistente, null);
});

test('mes con títulos en ancho: chips con hora, «+N» y, en Deportes, la barra del GP cortada por semanas', async () => {
  const c = contexto();
  c.panel.clientWidth = 1000;
  c.hoy = '2026-10-26';
  await c.deportes();
  const mes = c.pedidas.find(u => u.pathname === '/calendario/resumen' && u.searchParams.get('muestras') === '4').searchParams;
  assert.equal(mes.get('barras'), '1');
  const html = c.api.calContenido();
  assert.equal((html.match(/class="cal-mg-semana"/g) || []).length, 6);
  // El día: hora y título de cada muestra, coloreados por categoría, y el resto en «+N».
  const dia = html.match(/data-valor="2026-10-28"[\s\S]*?<\/button>/)[0];
  assert.match(dia, /<span class="cal-mg-chip cal-cat-cultura"><b>18:00<\/b> A2026-10-28<\/span>/);
  assert.match(dia, /\+23 más/);
  // Ventana baja: las semanas se encogen para que quepa el mes y todo va a «+N».
  c.window.innerHeight = 500;
  const bajo = c.api.calContenido().match(/data-valor="2026-10-28"[\s\S]*?<\/button>/)[0];
  assert.doesNotMatch(bajo, /cal-mg-chip/);
  assert.match(bajo, /\+26 más/);
  delete c.window.innerHeight;
  // GP del 30-10 al 1-11: del viernes al domingo de esa semana, y nada en la siguiente.
  assert.match(html, /class="cal-mg-barra cal-cat-deportes" style="grid-column:5\/8;grid-row:2"[^>]*>GP de México/);
  assert.equal((html.match(/cal-mg-barra/g) || []).length, 1);
  // La agenda, con títulos pero sin barras: no tiene competiciones.
  await c.abrir(); await c.click('mes');
  assert.deepEqual([c.resumen().get('muestras'), c.resumen().get('barras')], ['4', null]);
  // En estrecho, la tira con puntos de siempre (y sin pedir títulos).
  c.panel.clientWidth = 360;
  await c.click('mes'); await c.click('mes');
  assert.deepEqual([c.resumen().get('muestras'), c.resumen().get('barras')], ['0', null]);
  assert.doesNotMatch(c.api.calContenido(), /cal-mg-semana/);
});

const PREF = 'voceiro-calendario-preferencias-v1';
const preferencias = extra => ({ [PREF]: JSON.stringify({ v: 1, estado: 'configurado', sitio: { id: 'es:municipio:36057', nombre: 'Vigo' },
  intereses: { cultura: ['teatro'], otraCultura: false, deporteLocal: false }, competiciones: ['f1'], ...extra }) });

test('abrir por primera vez con un prefijo no hereda «Lo mío»', async () => {
  const c = contexto({ almacen: preferencias() });
  c.api.actualizarConsultaCalendario(consulta.leerConsultaCalendario('f1:'));
  await esperar();
  assert.deepEqual([c.resumen().get('q'), c.resumen().get('temas'), c.api.s.mio], ['f1:', null, false]);
  // Desde la cabecera, sin prefijo, sí.
  const d = contexto({ almacen: preferencias() });
  await d.abrir();
  assert.deepEqual([d.resumen().get('temas'), d.api.s.mio], ['teatro', true]);
});

test('con solo competiciones guardadas, la agenda no tiene «Lo mío» y Deportes abre con ellas', async () => {
  const c = contexto({ almacen: preferencias({ sitio: null, intereses: { cultura: [], otraCultura: false, deporteLocal: false } }) });
  await c.abrir();
  assert.deepEqual([c.api.s.mio, c.resumen().get('q'), c.resumen().get('temas'), c.resumen().get('territorio')], [false, null, null, null]);
  assert.doesNotMatch(c.api.calChips(), /Lo mío/);
  await c.deportes();
  assert.deepEqual([[...c.api.s.capas], c.resumen().get('q')], [['f1'], 'f1:']);
});

test('si el dispositivo no guarda, lo elegido en el asistente vale para la sesión', async () => {
  const c = contexto({ almacen: preferencias(), guardarFalla: true });
  await c.abrir();
  await c.click('asistente', '0');
  await c.marcar('cal-as-sitio', 'es:provincia:28', true, 'Madrid');
  await c.click('as-siguiente');
  await c.marcar('cal-as-interes', 'teatro', false);
  await c.marcar('cal-as-interes', 'otra', true);
  await c.click('as-ir', '3');
  await c.click('as-guardar');
  assert.deepEqual([c.resumen().get('territorio'), c.resumen().get('temas')], ['es:provincia:28', 'otra:cultura']);
});

test('«Actualizar» vuelve a pedir el mes; un 409 del resumen se reintenta una vez', async () => {
  let cambio = 1;
  const c = contexto({ responder: u => u.pathname === '/calendario/resumen' && cambio-- > 0 && u.searchParams.get('muestras') === '3'
    ? Response.json({ error: 'cambió' }, { status: 409 }) : api(u) });
  await c.abrir();
  assert.equal(c.pedidas.filter(u => u.pathname === '/calendario/resumen').length, 2);
  assert.equal(c.api.s.error, '');
  await c.click('mes');
  const antes = c.pedidas.filter(u => u.searchParams.get('muestras') === '0').length;
  await c.click('renovar');
  assert.equal(c.pedidas.filter(u => u.searchParams.get('muestras') === '0').length, antes + 1);
});

test('la ventana se recorta al horizonte publicado y fuera de él no se pide nada', async () => {
  const c = contexto();
  c.hoy = '2026-09-05';
  await c.abrir();
  assert.equal(c.ultima().searchParams.get('desde'), '2026-09-10');
  const antes = c.pedidas.length;
  await c.click('dia', '2027-12-01');
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
  // Una orden solo de noticias no pide la agenda.
  c.api.actualizarConsultaCalendario(consulta.leerConsultaCalendario('tenis:noticias'));
  await esperar();
  assert.equal(c.pedidas.length, antes);
  // La vista que abrió un prefijo se cierra al quitarlo.
  assert.equal(c.api.s.abierto, true);
  c.api.actualizarConsultaCalendario(null);
  await esperar();
  assert.equal(c.api.s.abierto, false);
});

test('un prefijo de agenda abre la vista completa; cerrada a mano, sigue cerrada con la misma consulta', async () => {
  const c = contexto();
  const orden = consulta.leerConsultaCalendario('f1:');
  c.api.actualizarConsultaCalendario(orden);
  await esperar();
  assert.equal(c.api.s.abierto, true);
  await c.click('cerrar');
  assert.equal(c.api.s.abierto, false);
  c.api.actualizarConsultaCalendario(consulta.leerConsultaCalendario('f1:'));
  await esperar();
  assert.equal(c.api.s.abierto, false);
  // Con una agenda solo temática, salir quita sus prefijos y deja lo demás.
  c.buscar.value = 'teatro: eltiempo:Vigo jazz';
  c.api.actualizarConsultaCalendario(consulta.leerConsultaCalendario(c.buscar.value));
  await esperar();
  assert.equal(c.api.s.abierto, true);
  await c.click('cerrar');
  assert.deepEqual([c.api.s.abierto, c.aplicadas.at(-1)], [false, 'eltiempo:Vigo jazz']);
  // Abierta desde la cabecera, quitar el prefijo no la cierra.
  await c.abrir();
  c.api.actualizarConsultaCalendario(null);
  await esperar();
  assert.equal(c.api.s.abierto, true);
});

test('editar el texto o añadir otros servicios conserva filtros, fecha y apertura', async () => {
  const c = contexto();
  c.api.actualizarConsultaCalendario(consulta.leerConsultaCalendario('f1:'));
  await esperar();
  await c.click('elegir-donde', 'es:municipio:36057', { nombre: 'Vigo' });
  await c.click('siguiente');
  const fecha = c.api.s.fecha;
  await c.click('cerrar');
  c.api.actualizarConsultaCalendario(consulta.leerConsultaCalendario('f1: jazz eltiempo:Vigo'));
  await esperar();
  assert.deepEqual([c.api.s.donde?.id, c.api.s.fecha, c.api.s.abierto], ['es:municipio:36057', fecha, false]);
  // Otro prefijo de agenda es otra consulta: filtros nuevos y vista abierta;
  // la ciudad es del usuario y se queda.
  await c.click('gratis');
  c.api.actualizarConsultaCalendario(consulta.leerConsultaCalendario('teatro: jazz'));
  await esperar();
  assert.deepEqual([c.api.s.precio, c.api.s.donde?.id, c.api.s.abierto], ['', 'es:municipio:36057', true]);
});

test('dónde: la ciudad arriba; sugiere comunidad, provincia y municipio y filtra por su territorio', async () => {
  const c = contexto();
  await c.abrir();
  assert.match(c.api.calDonde(), /data-cal="editar-donde"[^>]*>📍 Toda España ▾/);
  await c.click('editar-donde');
  assert.match(c.api.calDonde(), /id="cal-donde"/);
  await c.escribir('cal-donde', 'Gal');
  assert.match(c.sugerencias['cal-sug-donde'].innerHTML, /data-valor="es:autonomia:12"/);
  await c.escribir('cal-donde', 'vig');
  assert.match(c.sugerencias['cal-sug-donde'].innerHTML, /data-valor="es:municipio:36057"[^>]*>Vigo <small>Pontevedra/);
  await c.click('elegir-donde', 'es:municipio:36057', { nombre: 'Vigo' });
  assert.equal(c.ultima().searchParams.get('territorio'), 'es:municipio:36057');
  assert.match(c.api.calDonde(), /📍 Vigo ▾[\s\S]*data-cal="quitar-donde"/);
  await c.click('quitar-donde');
  assert.equal(c.ultima().searchParams.get('territorio'), null);
});

test('la ciudad por defecto es la provincia del primer sitio del tiempo, una vez', async () => {
  const c = contexto({ sitios: [{ nombre: 'Casa', lugar: { lat: 1, lon: 2 } }, { nombre: 'Vigo', lugar: { ine: '36057' } }] });
  await c.abrir();
  assert.equal(c.resumen().get('territorio'), 'es:provincia:36');
  assert.match(c.api.calDonde(), /📍 Pontevedra ▾/);
  await c.click('quitar-donde');
  await c.abrir();
  assert.equal(c.resumen().get('territorio'), null);
});

test('la agenda va siempre a su sitio; las competiciones, en Deportes y sin ciudad', async () => {
  const c = contexto({ sitios: [{ nombre: 'Vigo', lugar: { ine: '36057' } }] });
  await c.abrir();
  assert.equal(c.resumen().get('territorio'), 'es:provincia:36');
  // El deporte del sitio: territorio estricto, sin competiciones.
  await c.click('categoria', 'deportes');
  assert.deepEqual([c.resumen().get('temas'), c.resumen().get('territorio'), c.resumen().get('q'), c.resumen().get('local')],
    ['deportes', 'es:provincia:36', null, null]);
  // Deportes: todas las competiciones, sin ciudad.
  await c.deportes();
  assert.deepEqual([c.api.s.vista, c.resumen().get('territorio'), c.resumen().get('temas'), c.resumen().get('q').split(' ').length],
    ['deportes', null, null, 12]);
  // Un prefijo de competición abre Deportes con solo esa; uno de tema, la agenda.
  c.api.actualizarConsultaCalendario(consulta.leerConsultaCalendario('f1:'));
  await esperar();
  assert.deepEqual([c.api.s.vista, c.api.s.capas, c.resumen().get('q'), c.resumen().get('territorio')], ['deportes', null, 'f1:', null]);
  c.api.actualizarConsultaCalendario(consulta.leerConsultaCalendario('teatro:'));
  await esperar();
  assert.deepEqual([c.api.s.vista, c.resumen().get('q'), c.resumen().get('territorio')], ['agenda', 'teatro:', 'es:provincia:36']);
});

test('el botón de la otra vista quita los prefijos de agenda del buscador', async () => {
  const c = contexto();
  c.buscar.value = 'f1: carrera';
  c.api.actualizarConsultaCalendario(consulta.leerConsultaCalendario('f1: carrera'));
  await esperar();
  assert.equal(c.api.s.vista, 'deportes');
  // Desde Deportes por prefijo, el botón de la agenda la abre limpia.
  c.api.abrirCalendario(null, 'agenda');
  await esperar();
  assert.deepEqual([c.buscar.value, c.aplicadas.at(-1), c.api.s.vista], ['carrera', 'carrera', 'agenda']);
});

test('la ciudad fija la hora (Canarias, la suya) y cada entrada empieza hoy', async () => {
  const c = contexto();
  await c.abrir();
  await c.click('elegir-donde', 'es:municipio:38038', { nombre: 'Santa Cruz de Tenerife' });
  assert.deepEqual([c.resumen().get('territorio'), c.resumen().get('zona')], ['es:municipio:38038', 'Atlantic/Canary']);
  await c.click('elegir-donde', 'es:autonomia:12', { nombre: 'Galicia' });
  assert.equal(c.resumen().get('zona'), 'Europe/Madrid');
  await c.click('dia', '2026-10-29');
  await c.click('cerrar');
  c.api.abrirCalendario(); await esperar();
  assert.equal(c.resumen().get('desde'), '2026-10-25');
});

test('un fallo del primer backend pasa al segundo; un error de la consulta no se repite', async () => {
  const c = contexto({ responder: u => u.hostname === 'cf.test' ? Response.json({ error: 'No activada' }, { status: 503 }) : api(u) });
  await c.abrir();
  assert.deepEqual(c.pedidas.map(u => u.hostname + u.pathname), ['cf.test/calendario/catalogo', 'deno.test/calendario/catalogo',
    'cf.test/calendario/resumen', 'deno.test/calendario/resumen']);
  assert.equal(cantidad(c.api.calContenido()), 21);
  const d = contexto({ responder: u => u.pathname === '/calendario/resumen' ? Response.json({ error: 'x' }, { status: 400 }) : api(u) });
  await d.abrir();
  assert.equal(d.pedidas.filter(u => u.pathname === '/calendario/resumen').length, 1);
  assert.equal(d.api.s.error, 'calError');
});

test('un 429 no pasa al otro backend y se espera lo que pide Retry-After', async () => {
  let limitado = false;
  const c = contexto({ responder: u => limitado && u.pathname === '/calendario/resumen'
    ? new Response(JSON.stringify({ error: 'demasiadas peticiones' }), { status: 429, headers: { 'Retry-After': '30' } }) : api(u) });
  await c.abrir();
  limitado = true;
  await c.click('categoria', 'cultura');
  assert.deepEqual(c.pedidas.slice(-1).map(u => u.hostname + u.pathname), ['cf.test/calendario/resumen']);
  assert.equal(c.api.s.error, 'calError');
  const antes = c.pedidas.length;
  await c.click('categoria', 'deportes');
  assert.equal(c.pedidas.length, antes);
});

test('si falla la renovación se conserva el resumen anterior; otra consulta no lo hereda', async () => {
  let falla = false;
  const c = contexto({ responder: u => falla && u.pathname === '/calendario/resumen'
    ? Response.json({ error: 'caída' }, { status: 503 }) : api(u) });
  await c.abrir();
  falla = true;
  await c.click('renovar');
  assert.equal(c.api.s.error, 'calError');
  assert.equal(cantidad(c.api.calContenido()), 21);
  await c.click('categoria', 'cultura');
  assert.equal(c.api.s.resumen, null);
});

test('sin fecha se pide al pulsar y pagina; el detalle trae lugar, programa y fuente', async () => {
  const c = contexto();
  await c.abrir();
  assert.match(c.api.calContenido(), /data-cal="pendientes"/);
  await c.click('pendientes');
  assert.equal(c.ultima().searchParams.get('pendientes'), '1');
  await c.click('mas-pendientes');
  assert.equal(c.ultima().searchParams.get('cursor'), '20');
  assert.equal((c.api.calContenido().match(/data-valor="~~Pendiente \d+"/g) || []).length, 26);
  await c.click('evento', 'GP de prueba');
  assert.equal(c.ultima().pathname, '/calendario/eventos/GP%20de%20prueba');
  assert.ok(c.dialogo.open);
  assert.match(c.dialogo.innerHTML, /Circuito · Jerez/);
  assert.match(c.dialogo.innerHTML, /Programa<\/h4><ul><li><span>Libres 1/);
  assert.match(c.dialogo.innerHTML, /href="https:\/\/galicia.test\/1"/);
  // Todo a la vista: la fuente al pie, sin desplegable.
  assert.match(c.dialogo.innerHTML, /<footer class="cal-evento-fuente"><p class="cal-nota">Fuente: <a[^>]*href="https:\/\/galicia.test\/1"/);
  assert.doesNotMatch(c.dialogo.innerHTML, /<details/);
});

test('un evento de la lista se despliega bajo su tarjeta con todo su detalle; la ficha se pide una vez', async () => {
  const c = contexto();
  await c.abrir();
  const clave = '2026-10-25~~A2026-10-25', abrir = (k, id) => c.click('desplegar', k, { id });
  assert.match(c.api.calContenido(), /data-cal="desplegar" data-valor="2026-10-25~~A2026-10-25" data-id="A2026-10-25" aria-expanded="false">/);
  await abrir(clave, 'A2026-10-25');
  assert.equal(c.ultima().pathname, '/calendario/eventos/A2026-10-25');
  assert.ok(!c.dialogo.open);
  let html = c.api.calContenido();
  // Bajo la tarjeta: cuándo, el lugar del detalle (distinto del de la tarjeta), programa y fuente.
  assert.match(html, /aria-expanded="true"[\s\S]*?<div class="cal-desplegado" id="cal-det-2026-10-25__A2026-10-25">[\s\S]*?Circuito · Jerez[\s\S]*?Programa<\/h4>[\s\S]*?Fuente: <a/);
  assert.equal((html.match(/cal-desplegado/g) || []).length, 1);
  // Cerrar y volver a abrir no pide otra vez la ficha.
  const pedidas = c.pedidas.length;
  await abrir(clave, 'A2026-10-25');
  assert.doesNotMatch(c.api.calContenido(), /cal-desplegado/);
  await abrir(clave, 'A2026-10-25');
  assert.equal(c.pedidas.length, pedidas);
  assert.match(c.api.calContenido(), /cal-desplegado/);
  // Abrir otro cierra el anterior.
  await abrir('2026-10-26~~A2026-10-26', 'A2026-10-26');
  html = c.api.calContenido();
  assert.equal((html.match(/class="cal-desplegado"/g) || []).length, 1);
  assert.match(html, /aria-controls="cal-det-2026-10-26__A2026-10-26"[\s\S]*id="cal-det-2026-10-26__A2026-10-26"/);
  // «Actualizar» cierra el desplegado y olvida las fichas.
  await c.click('renovar');
  assert.deepEqual([c.api.s.desplegado, c.api.s.detalles.size], ['', 0]);
});

test('moverse por semanas y meses reutiliza los formatos de fecha de la interfaz', async () => {
  let construidos = 0;
  const c = contexto({ intl: { DateTimeFormat: function(...args){ construidos++; return new Intl.DateTimeFormat(...args); } } });
  await c.abrir();
  for (let i = 0; i < 5; i++) for (const accion of ['siguiente', 'mes', 'siguiente', 'mes']){
    await c.click(accion); c.api.calContenido();
  }
  assert.ok(construidos <= 10, `se crearon ${construidos} formatos`);
  const antes = construidos;
  c.ACCES.lang = 'en';
  assert.match(c.api.calContenido(), /title="Monday"/);
  assert.ok(construidos > antes);
});
