// node --test 'tests/**/*.test.mjs'
// Panel de consultas puntuales (front/app/14-consultas.js) contra un fetch
// simulado: qué se pide, cuántas veces, y qué se pinta con cada estado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parseQuery, tokenizeQuery, normalize } from '../../shared/parser.js';
import { interpretarConsulta } from '../../shared/busqueda/consulta.js';
import { rangosResaltado } from '../../shared/busqueda/texto.js';
import { ESPN, admiteConsultaESPN } from '../../shared/consultas/registro.js';
import { fechaValida, sumarDiasCalendario } from '../../shared/calendario/fechas.js';
import { traducir } from '../../front/idiomas/index.js';
import { resultadosEuroliga, partidoEuroliga } from '../../workers/deno-buscar/src/consultas/euroliga.js';

const codigo = readFileSync(new URL('../../front/app/14-consultas.js', import.meta.url), 'utf8');
const BASE = 'https://buscar.example';
const futuro = () => new Date(Date.now() + 3600e3).toISOString();
const envoltorio = (tipo, extra) => ({
  tipo, estado: 'ok', candidatos: [], ficha: null, fuente: 'TMDB', enlace: 'https://www.themoviedb.org',
  licencia: { nombre: 'Condiciones de TMDB', enlace: 'https://www.themoviedb.org/terms-of-use' },
  consultado: new Date().toISOString(), caduca: futuro(), incompleto: false, ...extra,
});

function contexto({ buscar = '', responder }) {
  // La ficha (<details class="consulta-ficha">) se recrea con cada innerHTML, como en el DOM.
  const panel = {
    hidden: true, _html: '', ficha: null, dataset: {}, oyente: null,
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; this.ficha = /class="consulta-ficha"/.test(v) ? { open: /class="consulta-ficha" open/.test(v) } : null; },
    oyentes: {},
    addEventListener(tipo, fn) { this.oyentes[tipo] = fn; if (tipo === 'click') this.oyente = fn; },
    querySelector(sel) { return sel === '.consulta-ficha' ? this.ficha : null; },
  };
  const entrada = { value: buscar };
  const pedidas = [];
  const ctx = {
    BACKENDS: { deno: { buscar: BASE } }, ESPN, admiteConsultaESPN, ACCES: { lang: 'es' },
    t: (k, v) => traducir('es', k, v), ico: n => `<${n}>`,
    escapeHtml: s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    normalize, tokenizeQuery, rangosResaltado, fechaValida, sumarDiasCalendario, Intl, Date, URLSearchParams, AbortSignal, Promise, Map, Set, JSON, Object, Error, isNaN,
    setTimeout: () => 0, clearTimeout() {},
    document: { getElementById: id => (id === 'consulta-panel' ? panel : null) },
    $: s => (s === '#buscar' ? entrada : null),
    aplicarFiltrosDebounced: { cancel() {} },
    aplicarFiltros() { ctx.filtrados++; }, filtrados: 0,
    fetch: async url => {
      pedidas.push(url.replace(BASE, ''));
      return responder(url.replace(BASE, ''));
    },
  };
  // resaltarTitular vive en 06-acciones-titulares.js: la misma marca que el feed.
  ctx.resaltarTitular = (texto, compilado) => {
    let out = '', last = 0;
    for (const [i, j] of rangosResaltado(texto, compilado)){ out += ctx.escapeHtml(texto.slice(last, i)) + '<mark>' + ctx.escapeHtml(texto.slice(i, j)) + '</mark>'; last = j; }
    return out + ctx.escapeHtml(texto.slice(last));
  };
  runInNewContext(codigo + '\nthis.api = { PUNTUAL, actualizarConsultaPuntual };', ctx);
  // Como aplicarFiltros: la consulta recibe el texto compilado de la búsqueda.
  const actualizar = raw => {
    entrada.value = raw;
    ctx.api.actualizarConsultaPuntual(parseQuery(raw), interpretarConsulta(raw, { catalogo: {}, ahora: Date.now() }).texto);
  };
  // Un toque: lo que llegaría a closest('button[data-accion]').
  const pulsar = dataset => panel.oyente({ target: { closest: () => ({ dataset }) } });
  const elegirFecha = value => panel.oyentes.change({ target: { dataset: { fechaResultados: '' }, value } });
  return { ctx, panel, entrada, pedidas, actualizar, pulsar, elegirFecha };
}
const json = (cuerpo, status = 200) => ({ status, ok: status >= 200 && status < 300, json: async () => cuerpo });
const esperar = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };

test('Euroliga: fecha, marcador y ficha por ID con vuelta al listado', async () => {
  const datos = JSON.parse(readFileSync(new URL('./muestras/euroliga-juegos-E2026.json', import.meta.url)));
  const juego = JSON.parse(readFileSync(new URL('./muestras/euroliga-juego-E2026-1.json', import.meta.url)));
  const resultados = resultadosEuroliga(datos, '2026-09-24', 'E2026');
  const partido = partidoEuroliga(juego, 'E2026', '1');
  const { panel, pedidas, actualizar, pulsar } = contexto({ responder: ruta => json(envoltorio(
    ruta.includes('partido') ? 'partido' : 'resultados',
    { ficha: ruta.includes('partido') ? partido : resultados, fuente: 'EuroLeague Basketball', licencia: null },
  )) });
  actualizar('resultados:euroliga');
  await esperar();
  assert.match(pedidas[0], /id=euroliga%3Aresultados/);
  assert.match(panel.innerHTML, /data-fecha-resultados/);
  assert.match(panel.innerHTML, /data-id="euroliga:partido\/E2026\/1"/);
  pulsar({ accion: 'partido', id: 'euroliga:partido/E2026/1' });
  await esperar();
  assert.match(pedidas[1], /id=euroliga%3Apartido%2FE2026%2F1/);
  assert.match(panel.innerHTML, /<strong class="consulta-titulo">Crvena Zvezda Meridianbet Belgrade · Zalgiris Kaunas<\/strong>/);
  assert.match(panel.innerHTML, /<caption>Parciales<\/caption>/);
  pulsar({ accion: 'volver' });
  assert.equal(pedidas.length, 2);
  assert.match(panel.innerHTML, /data-fecha-resultados/);
});

test('un código deportivo pide la ficha directamente, sin candidatos', async () => {
  const ficha = { competicion: 'nba', temporada: '2026-27', grupos: [
    { nombre: 'Este', filas: [{ pos: 1, equipo: 'Detroit Pistons', g: 4, p: 1, pj: 5, pts: null }] },
    { nombre: 'Oeste', filas: [{ pos: 1, equipo: 'Oklahoma City Thunder', g: 5, p: 0, pj: 5, pts: null }] },
  ] };
  const { panel, pedidas, actualizar } = contexto({ responder: () => json(envoltorio('clasificacion', {
    ficha, fuente: 'ESPN', enlace: 'https://www.espn.com', licencia: { nombre: 'Condiciones de ESPN', enlace: 'https://disneytermsofuse.com/' },
  })) });
  actualizar('clasificacion:NBA');
  await esperar();
  assert.deepEqual(pedidas, ['/consulta/ficha?id=espn%3Aclasificacion%2Fnba&idioma=es&v=3']);
  assert.equal(panel.hidden, false);
  assert.match(panel.innerHTML, /NBA · 2026-27/);
  assert.match(panel.innerHTML, /data-accion="grupo" data-i="0" aria-pressed="true"/);
  assert.match(panel.innerHTML, /Oeste \(1\)/);
  assert.match(panel.innerHTML, /ESPN<\/a> · <a [^>]+>Condiciones<\/a> · Consultado a las/);
  // Vigente: sin Actualizar, que no forzaría nada.
  assert.doesNotMatch(panel.innerHTML, /data-accion="actualizar"/);
});

test('resultados:f1 y un código desconocido no piden nada y ofrecen competiciones', async () => {
  const { panel, pedidas, actualizar, pulsar, entrada } = contexto({ responder: () => assert.fail('no debe pedir') });
  actualizar('incendio resultados:f1');
  await esperar();
  assert.deepEqual(pedidas, []);
  assert.match(panel.innerHTML, /Elige una competición/);
  assert.doesNotMatch(panel.innerHTML, /data-valor="f1"/);
  assert.match(panel.innerHTML, /data-valor="wnba"/);
  pulsar({ accion: 'valor', valor: 'primera' });
  assert.equal(entrada.value, 'incendio resultados:primera');
});

test('un candidato también se elige; la ficha y la vuelta no repiten peticiones', async () => {
  const candidatos = [{ id: 'tmdb:movie/1215185', titulo: 'La infiltrada', detalle: 'La infiltrada', anio: 2024, imagen: null, enlace: 'https://www.themoviedb.org/movie/1215185' }];
  const ficha = {
    titulo: 'La infiltrada', titulo_original: 'La infiltrada', anio: 2024, duracion: 119, generos: ['Drama'], direccion: ['Arantxa Echevarría'],
    reparto: [{ nombre: 'Carolina Yuste', personaje: 'Arantxa' }], sinopsis: 'Una agente…', poster: 'https://image.tmdb.org/t/p/w500/x.jpg',
    donde_ver: [{ nombre: 'Movistar Plus+', modo: 'suscripcion' }, { nombre: 'Apple TV', modo: 'alquiler' }],
    enlace_donde_ver: 'https://www.themoviedb.org/movie/1215185/watch?locale=ES', atribucion: 'JustWatch',
  };
  const { panel, pedidas, actualizar, pulsar } = contexto({ responder: ruta => json(ruta.startsWith('/consulta/ficha')
    ? envoltorio('pelicula', { ficha }) : envoltorio('pelicula', { candidatos })) });
  actualizar('pelicula:La infiltrada');
  await esperar();
  assert.deepEqual(pedidas, ['/consulta?tipo=pelicula&texto=La+infiltrada&idioma=es&v=3']);
  assert.match(panel.innerHTML, /data-accion="candidato" data-i="0"/);
  assert.match(panel.innerHTML, /<span class="consulta-cand-det">2024<\/span>/);   // el original igual no se repite
  pulsar({ accion: 'candidato', i: '0' });
  await esperar();
  assert.equal(pedidas.length, 2);
  assert.match(pedidas[1], /^\/consulta\/ficha\?id=tmdb%3Amovie%2F1215185&idioma=es&v=3$/);
  assert.match(panel.innerHTML, /<strong class="consulta-titulo">La infiltrada<\/strong><span class="consulta-linea">2024 · 119 min<\/span>/);
  assert.match(panel.innerHTML, /\/t\/p\/w185\/x\.jpg/);
  assert.match(panel.innerHTML, /Suscripción \(1\)/);
  assert.match(panel.innerHTML, /<summary>Alquiler \(1\)<\/summary>/);
  assert.match(panel.innerHTML, /Datos de JustWatch · <a /);
  assert.match(panel.innerHTML, /no lo respalda ni lo certifica/);
  pulsar({ accion: 'cambiar' });
  assert.match(panel.innerHTML, /data-accion="candidato"/);
  pulsar({ accion: 'candidato', i: '0' });
  await esperar();
  assert.equal(pedidas.length, 2);
  assert.match(panel.innerHTML, /consulta-ficha/);
});

test('una respuesta que llega tarde no pisa la consulta nueva', async () => {
  const pendientes = [];
  const { panel, actualizar } = contexto({ responder: ruta => new Promise(r => pendientes.push(() => r(json(envoltorio('libro', {
    candidatos: [{ id: 'openlibrary:OL1W', titulo: ruta.includes('Dune') ? 'Dune' : 'Viejo', detalle: '', anio: null }],
  }))))) });
  actualizar('libro:Viejo título');
  actualizar('libro:Dune');
  pendientes[1]();
  await esperar();
  pendientes[0]();
  await esperar();
  assert.match(panel.innerHTML, />Dune</);
  assert.doesNotMatch(panel.innerHTML, />Viejo</);
});

test('un texto corto espera a que se pida; sin texto, ayuda sin red', async () => {
  const { panel, pedidas, actualizar, pulsar } = contexto({ responder: () => json(envoltorio('pelicula', { estado: 'vacio' })) });
  actualizar('pelicula:');
  assert.match(panel.innerHTML, /Escribe detrás de «pelicula:» lo que buscas. Por ejemplo: pelicula:La infiltrada/);
  actualizar('pelicula:Up');
  assert.match(panel.innerHTML, /Buscar «Up»/);
  assert.deepEqual(pedidas, []);
  pulsar({ accion: 'forzar' });
  await esperar();
  assert.deepEqual(pedidas, ['/consulta?tipo=pelicula&texto=Up&idioma=es&v=3']);
  assert.match(panel.innerHTML, /Sin coincidencias para «Up»/);
});

test('el límite y un proveedor caído permiten reintentar y no se guardan', async () => {
  let respuesta = json({ error: 'límite' }, 429);
  const { panel, pedidas, actualizar, pulsar } = contexto({ responder: () => respuesta });
  actualizar('autor:Almudena Grandes');
  await esperar();
  assert.match(panel.innerHTML, /Demasiadas consultas seguidas/);
  respuesta = json(envoltorio('autor', { estado: 'no_disponible', fuente: 'Open Library', caduca: null }));
  pulsar({ accion: 'reintentar' });
  await esperar();
  assert.match(panel.innerHTML, /No se ha podido consultar Open Library/);
  pulsar({ accion: 'reintentar' });
  await esperar();
  assert.equal(pedidas.length, 3);
});

test('lo que llega del proveedor se escapa y solo se enlaza https', async () => {
  const ficha = { titulo: '<img src=x onerror=alert(1)>', resumen: 'Texto', enlace: 'javascript:alert(1)', qid: 'Q1"', ids: { openlibrary: ['OL1A'] } };
  const { panel, actualizar, pulsar } = contexto({ responder: ruta => json(ruta.startsWith('/consulta/ficha')
    ? envoltorio('contexto', { ficha, fuente: 'Wikipedia + Wikidata', licencia: { nombre: 'CC BY-SA', enlace: 'https://creativecommons.org/licenses/by-sa/4.0/' } })
    : envoltorio('contexto', { candidatos: [{ id: 'wikipedia:Prueba', titulo: '<b>x</b>', detalle: 'Escritora', anio: null }] })) });
  actualizar('contexto:prueba');
  await esperar();
  assert.match(panel.innerHTML, /&lt;b&gt;x&lt;\/b&gt;/);
  pulsar({ accion: 'candidato', i: '0' });
  await esperar();
  assert.match(panel.innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(panel.innerHTML, /javascript:/);
  assert.doesNotMatch(panel.innerHTML, /wikidata\.org/);   // un QID raro no se enlaza
  assert.match(panel.innerHTML, /<span class="consulta-linea">Escritora<\/span>/);
  assert.match(panel.innerHTML, /data-id="openlibrary:OL1A"/);
  assert.match(panel.innerHTML, /title=Prueba&amp;action=history"[^>]*>Autores<\/a>/);
  assert.doesNotMatch(panel.innerHTML, /<p>\s*<\/p>/);
});

test('cerrar quita la consulta y conserva el resto de la búsqueda', async () => {
  const { ctx, entrada, actualizar, pulsar } = contexto({ responder: () => json(envoltorio('libro', { estado: 'vacio' })) });
  actualizar('incendio lang:es libro:Breve historia del tiempo: del big bang');
  await esperar();
  pulsar({ accion: 'cerrar' });
  assert.equal(entrada.value, 'incendio lang:es');
  assert.equal(ctx.filtrados, 1);
});

test('deportes: al caducar se ofrece Actualizar; si falla, se queda la ficha anterior', async () => {
  let respuesta = json(envoltorio('resultados', {
    fuente: 'ESPN', caduca: new Date(Date.now() - 1000).toISOString(),
    ficha: { competicion: 'nba', partidos: [
      { inicio: '2026-10-29T23:30:00Z', estado: 'final', local: 'Toronto Raptors', visitante: 'Orlando Magic', marcador: { local: '129', visitante: '99' } },
      { inicio: '2026-10-30T20:00:00Z', estado: 'programado', local: 'Villarreal', visitante: 'Espanyol', marcador: null },
    ] },
  }));
  const { panel, pedidas, actualizar, pulsar } = contexto({ responder: () => respuesta });
  actualizar('resultados:nba');
  await esperar();
  assert.match(panel.innerHTML, /NBA · 2 partidos/);
  assert.match(panel.innerHTML, /1 finalizado · 1 programado/);
  assert.match(panel.innerHTML, /<b>129<\/b>/);
  assert.match(panel.innerHTML, /data-accion="actualizar"/);
  respuesta = json({}, 503);
  pulsar({ accion: 'actualizar' });
  await esperar();
  assert.equal(pedidas.length, 2);
  assert.match(panel.innerHTML, /Toronto Raptors/);
  assert.match(panel.innerHTML, /No se pudo actualizar; se muestra la anterior/);
});

test('las palabras detrás de una consulta deportiva marcan los equipos sin filtrar ni volver a pedir', async () => {
  const ficha = { competicion: 'primera', partidos: [
    { estado: 'final', inicio: '2026-10-31T15:00:00Z', local: 'Levante', visitante: 'Atlético Madrid', marcador: { local: 0, visitante: 2 } },
    { estado: 'final', inicio: '2026-10-31T17:00:00Z', local: 'Celta', visitante: 'Getafe', marcador: { local: 1, visitante: 1 } },
  ] };
  const { panel, pedidas, actualizar } = contexto({ responder: () => json(envoltorio('resultados', {
    ficha, fuente: 'ESPN', enlace: 'https://www.espn.com', licencia: { nombre: 'Condiciones de ESPN', enlace: 'https://disneytermsofuse.com/' },
  })) });
  actualizar('resultados:primera');
  await esperar();
  assert.doesNotMatch(panel.innerHTML, /<mark>|consulta-marcada/);
  actualizar('resultados:primera levante');
  await esperar();
  assert.equal(pedidas.length, 1);
  assert.match(panel.innerHTML, /<li class="consulta-marcada" data-estado="final">.*<mark>Levante<\/mark>/);
  assert.match(panel.innerHTML, /<li data-estado="final"><span class="consulta-estado">[^<]*<\/span><span>Celta<\/span>/);
  actualizar('resultados:primera');
  assert.doesNotMatch(panel.innerHTML, /<mark>/);
  // Plegada por el lector, cambiar las palabras no la vuelve a abrir.
  panel.ficha.open = false;
  actualizar('resultados:primera celta');
  assert.match(panel.innerHTML, /<mark>Celta<\/mark>/);
  assert.equal(panel.ficha.open, false);
});

test('los grupos cambian sin red, conservan su elección al actualizar y la búsqueda revela el equipo', async () => {
  const ficha = { competicion: 'nba', grupos: [
    { nombre: 'Eastern Conference', filas: [{ equipo: 'Detroit Pistons', g: 4, p: 1 }] },
    { nombre: 'Western Conference', filas: [{ equipo: 'Denver Nuggets', g: 5, p: 0 }] },
  ] };
  const { panel, pedidas, actualizar, pulsar } = contexto({ responder: () => json(envoltorio('clasificacion', { ficha })) });
  actualizar('clasificacion:nba');
  await esperar();
  assert.match(panel.innerHTML, /data-i="0" aria-pressed="true">Este \(1\)/);
  assert.match(panel.innerHTML, /data-i="1" aria-pressed="false">Oeste \(1\)/);
  pulsar({ accion: 'grupo', i: '1' });
  assert.match(panel.innerHTML, /data-i="1" aria-pressed="true"/);
  pulsar({ accion: 'actualizar' });
  await esperar();
  assert.match(panel.innerHTML, /data-i="1" aria-pressed="true"/);
  assert.equal(pedidas.length, 1);
  actualizar('clasificacion:nba detroit');
  assert.match(panel.innerHTML, /data-i="0" aria-pressed="true"/);
  assert.match(panel.innerHTML, /<mark>Detroit<\/mark>/);
  // La marca no impide consultar voluntariamente el otro grupo.
  pulsar({ accion: 'grupo', i: '1' });
  assert.match(panel.innerHTML, /data-i="1" aria-pressed="true"/);
  pulsar({ accion: 'grupo', i: '99' });
  assert.match(panel.innerHTML, /data-i="1" aria-pressed="true"/);
  actualizar('clasificacion:wnba');
  await esperar();
  assert.match(panel.innerHTML, /data-i="0" aria-pressed="true"/);
});

const partidoReal = async codigo => {
  const { normalizarPartido } = await import('../../workers/deno-buscar/src/consultas/partido.js');
  const d=JSON.parse(readFileSync(new URL(`./muestras/espn-partido-${codigo}.json`,import.meta.url)));
  return normalizarPartido(d,codigo,...ESPN[codigo],d.header.id);
};

for (const [codigo, nombre, esperado] of [['copa-del-rey', 'Copa del Rey', /Penaltis 4–2 · Gana Numancia/],
  ['champions', 'Champions', /Vuelta · Global 5–6 · Pasa Paris Saint-Germain/], ['liga-f', 'Liga F', /Alavés/]]) {
  test(`${nombre}: abre tarjeta, conserva el contexto al volver y acepta partido por ID`, async () => {
    const partido = await partidoReal(codigo);
    const { panel, pedidas, actualizar, pulsar, elegirFecha } = contexto({ responder: ruta => {
      const u = new URL(ruta, BASE), detalle = u.searchParams.get('id').startsWith('espn:partido/');
      return json(envoltorio(detalle ? 'partido' : 'resultados', { fuente: 'ESPN',
        ficha: detalle ? partido : { competicion: codigo, fecha: u.searchParams.get('fecha') || '2026-11-01', partidos: [partido] } }));
    } });
    actualizar(`resultados:${codigo}`); await esperar();
    assert.ok(panel.innerHTML.includes(`${nombre} · 1 partido`));
    assert.ok(panel.innerHTML.includes(`data-accion="partido" data-id="${partido.id}"`));
    assert.match(panel.innerHTML, esperado);
    assert.doesNotMatch(panel.innerHTML, /on aggregate|advance|penalties|2nd Leg/);
    elegirFecha('2026-10-29'); await esperar();
    pulsar({ accion: 'partido', id: partido.id }); await esperar();
    assert.equal(pedidas.length, 3);
    assert.match(panel.innerHTML, /Volver a resultados/);
    assert.match(panel.innerHTML, esperado);
    assert.ok(panel.innerHTML.includes(nombre));
    pulsar({ accion: 'volver' });
    assert.match(panel.innerHTML, /data-fecha-resultados value="2026-10-29"/);
    assert.equal(pedidas.length, 3);
    actualizar(`partido:${codigo}/${partido.id.split('/').pop()}`); await esperar();
    assert.match(panel.innerHTML, esperado); assert.equal(pedidas.length, 3);
    assert.doesNotMatch(panel.innerHTML, /Elige una competición/);
  });
}

test('la tarjeta y la ficha distinguen el 2–0 de la vuelta del global 2–3', async () => {
  const partido = await partidoReal('champions');
  partido.marcador = { local: '2', visitante: '0' };
  partido.eliminatoria.global = { local: '2', visitante: '3' };
  const { panel, actualizar, pulsar } = contexto({ responder: ruta => json(envoltorio(ruta.includes('partido') ? 'partido' : 'resultados', {
    ficha: ruta.includes('partido') ? partido : { competicion: 'champions', partidos: [partido] },
  })) });
  actualizar('resultados:champions'); await esperar();
  assert.match(panel.innerHTML, /<b>2<\/b>[\s\S]*<b>0<\/b>/);
  assert.match(panel.innerHTML, /Global 2–3 · Pasa Paris Saint-Germain/);
  pulsar({ accion: 'partido', id: partido.id }); await esperar();
  assert.match(panel.innerHTML, /Global 2–3 · Pasa Paris Saint-Germain/);
  assert.doesNotMatch(panel.innerHTML, /Pasa Bayern Munich/);
});

test('prórroga, penaltis sin tanteo y plazas pendientes se explican en castellano', async () => {
  const partido = await partidoReal('copa-del-rey');
  partido.local = null; partido.visitante = null; partido.marcador = null;
  partido.eliminatoria = { resolucion: 'prorroga' };
  const { panel, actualizar, pulsar } = contexto({ responder: ruta => json(envoltorio(ruta.includes('partido') ? 'partido' : 'resultados', {
    ficha: ruta.includes('partido') ? partido : { competicion: 'copa-del-rey', partidos: [partido] },
  })) });
  actualizar('resultados:copa-del-rey'); await esperar();
  assert.match(panel.innerHTML, /Por determinar/); assert.match(panel.innerHTML, /Tras prórroga/);
  assert.doesNotMatch(panel.innerHTML, /null|undefined|TBD/);
  partido.eliminatoria = { resolucion: 'penaltis' };
  pulsar({ accion: 'partido', id: partido.id }); await esperar();
  assert.match(panel.innerHTML, /Por determinar · Por determinar/);
  assert.match(panel.innerHTML, /Tras penaltis/);
  assert.doesNotMatch(panel.innerHTML, /Penaltis 0|Gana |Pasa /);
});

test('clasificación de Champions: fase liga, 36 equipos y DG solo si hay dato; Copa no se ofrece', async () => {
  const { clasificacion } = await import('../../workers/deno-buscar/src/consultas/normalizar.js');
  const datos = JSON.parse(readFileSync(new URL('./muestras/espn-clasificacion-champions.json', import.meta.url)));
  const ficha = clasificacion(datos, 'champions', 'soccer');
  const { panel, pedidas, actualizar } = contexto({ responder: () => json(envoltorio('clasificacion', { ficha })) });
  actualizar('clasificacion:copa-del-rey'); await esperar();
  assert.equal(pedidas.length, 0);
  assert.doesNotMatch(panel.innerHTML, /data-valor="copa-del-rey"|data-valor="liga-f"/);
  assert.match(panel.innerHTML, /data-valor="champions"/);
  actualizar('clasificacion:champions'); await esperar();
  assert.match(panel.innerHTML, /Champions/); assert.match(panel.innerHTML, /Fase liga/);
  assert.match(panel.innerHTML, /<abbr title="Diferencia de goles">DG<\/abbr>/);
  assert.equal((panel.innerHTML.match(/<tr/g) || []).length, 37);
  assert.doesNotMatch(panel.innerHTML, /League Phase|Qualifies|on aggregate|cuadro/);
  const primera = contexto({ responder: () => json(envoltorio('clasificacion', { ficha: { ...ficha, competicion: 'primera' } })) });
  primera.actualizar('clasificacion:primera'); await esperar();
  assert.doesNotMatch(primera.panel.innerHTML, /Diferencia de goles|>DG</);
  const sinDG = structuredClone(ficha);
  for (const fila of sinDG.grupos[0].filas) delete fila.dg;
  const otra = contexto({ responder: () => json(envoltorio('clasificacion', { ficha: sinDG })) });
  otra.actualizar('clasificacion:champions'); await esperar();
  assert.doesNotMatch(otra.panel.innerHTML, /Diferencia de goles|>DG</);
  actualizar('partido:champions_qual/123'); await esperar();
  assert.equal(pedidas.length, 1);
});

test('resultados: del lunes al domingo, estadísticas y vuelta al mismo día sin red',async()=>{
  const partido=await partidoReal('segunda');
  const {panel,pedidas,actualizar,pulsar}=contexto({responder:ruta=>{
    const u=new URL(ruta,BASE);
    if(u.searchParams.get('id').startsWith('espn:partido/')) return json(envoltorio('partido',{ficha:partido}));
    return json(envoltorio('resultados',{ficha:{competicion:'segunda',
      fecha:u.searchParams.get('fecha')||'2026-11-02',partidos:[partido]}}));
  }});
  actualizar('resultados:segunda'); await esperar();
  assert.match(panel.innerHTML,/data-fecha-resultados value="2026-11-02"/);
  assert.equal(pedidas.length,1);
  pulsar({accion:'dia',direccion:'-1'}); await esperar();
  assert.equal(new URL(pedidas[1],BASE).searchParams.get('fecha'),'2026-11-01');
  assert.match(panel.innerHTML,/data-fecha-resultados value="2026-11-01"/);
  pulsar({accion:'partido',id:partido.id}); await esperar();
  assert.equal(new URL(pedidas[2],BASE).searchParams.has('fecha'),false);
  assert.match(panel.innerHTML,/Volver a resultados/);
  assert.doesNotMatch(panel.innerHTML,/data-fecha-resultados/);
  pulsar({accion:'volver'});
  assert.match(panel.innerHTML,/data-fecha-resultados value="2026-11-01"/);
  assert.equal(pedidas.length,3);
});

test('resultados: fecha concreta, día vacío y navegación civil al cambiar de mes',async()=>{
  const {panel,pedidas,actualizar,pulsar,elegirFecha}=contexto({responder:ruta=>{
    const fecha=new URL(ruta,BASE).searchParams.get('fecha')||'2026-03-01';
    return json(envoltorio('resultados',{estado:'vacio',ficha:{competicion:'primera',fecha,partidos:[]}}));
  }});
  actualizar('resultados:primera'); await esperar();
  assert.match(panel.innerHTML,/No hay partidos/);
  pulsar({accion:'dia',direccion:'-1'}); await esperar();
  assert.equal(new URL(pedidas[1],BASE).searchParams.get('fecha'),'2026-02-28');
  elegirFecha('2024-02-29'); await esperar();
  assert.match(panel.innerHTML,/value="2024-02-29"/);
  pulsar({accion:'dia',direccion:'1'}); await esperar();
  assert.equal(new URL(pedidas[3],BASE).searchParams.get('fecha'),'2024-03-01');
  elegirFecha('2026-02-30'); elegirFecha(''); await esperar();
  assert.equal(pedidas.length,4);
});

test('NBA: fecha del proveedor sin deducirla de la madrugada local y sin peticiones adicionales',async()=>{
  const partido={id:'espn:partido/nba/401909905',inicio:'2026-11-02T01:30Z',estado:'final',local:'Warriors',visitante:'Clippers'};
  const {panel,pedidas,actualizar}=contexto({responder:()=>json(envoltorio('resultados',{
    ficha:{competicion:'nba',fecha:'2026-11-01',partidos:[partido]},
  }))});
  actualizar('resultados:nba'); await esperar();
  assert.match(panel.innerHTML,/value="2026-11-01"/);
  assert.match(panel.innerHTML,/Los partidos de madrugada/);
  assert.equal(pedidas.length,1);
});

test('al fallar otra fecha se conserva el día visible y Actualizar reintenta el solicitado',async()=>{
  let n=0;
  const {panel,pedidas,actualizar,elegirFecha,pulsar}=contexto({responder:ruta=>{
    n++;
    if(n===2) return json(envoltorio('resultados',{estado:'no_disponible',ficha:null,caduca:null}));
    return json(envoltorio('resultados',{ficha:{competicion:'primera',partidos:[],
      fecha:new URL(ruta,BASE).searchParams.get('fecha')||'2026-11-02'}}));
  }});
  actualizar('resultados:primera'); await esperar();
  elegirFecha('2026-11-01'); await esperar();
  assert.match(panel.innerHTML,/value="2026-11-02"/);
  assert.match(panel.innerHTML,/No se pudo actualizar/);
  pulsar({accion:'actualizar'}); await esperar();
  assert.match(panel.innerHTML,/value="2026-11-01"/);
  assert.equal(pedidas[1],pedidas[2]);
});

test('una fecha pendiente no sustituye los resultados de otra competición al llegar tarde',async()=>{
  let resolver;
  const pendiente=new Promise(r=>{resolver=r;});
  const {panel,actualizar,elegirFecha}=contexto({responder:ruta=>{
    const u=new URL(ruta,BASE);
    if(u.searchParams.has('fecha')) return pendiente;
    const competicion=u.searchParams.get('id').split('/')[1];
    return json(envoltorio('resultados',{ficha:{competicion,fecha:'2026-11-02',partidos:[]}}));
  }});
  actualizar('resultados:primera'); await esperar();
  elegirFecha('2026-11-01');
  actualizar('resultados:nba'); await esperar();
  resolver(json(envoltorio('resultados',{ficha:{competicion:'primera',fecha:'2026-11-01',partidos:[]}})));
  await esperar();
  assert.match(panel.innerHTML,/value="2026-11-02"/);
  assert.match(panel.innerHTML,/Los partidos de madrugada/);
});

test('una respuesta de otro día no se muestra ni se cachea bajo la fecha solicitada',async()=>{
  let n=0;
  const {panel,pedidas,actualizar,elegirFecha,pulsar}=contexto({responder:()=>json(envoltorio('resultados',{
    ficha:{competicion:'primera',fecha:++n<3?'2026-11-02':'2026-11-01',partidos:[]},
  }))});
  actualizar('resultados:primera'); await esperar();
  elegirFecha('2026-11-01'); await esperar();
  assert.match(panel.innerHTML,/value="2026-11-02"/);
  assert.match(panel.innerHTML,/No se pudo actualizar/);
  pulsar({accion:'actualizar'}); await esperar();
  assert.match(panel.innerHTML,/value="2026-11-01"/);
  assert.equal(pedidas.length,3);
});

test('NBA: una respuesta HTTP antigua sin IDs no impide abrir los partidos',async()=>{
  const partido=await partidoReal('nba');
  const {id,...sinId}=partido;
  const antigua='/consulta/ficha?id=espn%3Aresultados%2Fnba&idioma=es';
  // El navegador ya tiene una respuesta aún vigente de antes del despliegue.
  const cacheHttp=new Map([[antigua,json(envoltorio('resultados',{
    ficha:{competicion:'nba',partidos:[sinId]},
  }))]]);
  const {panel,pedidas,actualizar,pulsar}=contexto({responder:ruta=>cacheHttp.get(ruta)
    || json(envoltorio(ruta.includes('partido')?'partido':'resultados',{
      ficha:ruta.includes('partido')?partido:{competicion:'nba',partidos:[partido]},
    }))});
  actualizar('resultados:nba'); await esperar();
  assert.match(panel.innerHTML,/data-accion="partido"/);
  pulsar({accion:'partido',id}); await esperar();
  assert.equal(pedidas.length,2);
  assert.match(panel.innerHTML,/Parciales/);
  assert.match(panel.innerHTML,/Volver a resultados/);
});

test('un marcador abre su ficha, permite volver sin red y reutiliza el detalle cacheado',async()=>{
  const partido=await partidoReal('nba');
  const lista={competicion:'nba',partidos:[partido]};
  const {panel,pedidas,actualizar,pulsar}=contexto({responder:ruta=>json(envoltorio(ruta.includes('partido')?'partido':'resultados',{
    fuente:'ESPN',ficha:ruta.includes('partido')?partido:lista,
  }))});
  actualizar('resultados:nba'); await esperar();
  assert.equal(pedidas.length,1);
  assert.match(panel.innerHTML,/data-accion="partido" data-id="espn:partido\/nba\/401909903"/);
  pulsar({accion:'partido',id:partido.id}); await esperar();
  assert.equal(pedidas.length,2);
  assert.match(panel.innerHTML,/<span class="consulta-tipo">Partido<\/span>/);
  assert.match(panel.innerHTML,/Volver a resultados/);
  assert.match(panel.innerHTML,/Period|Parciales/);
  assert.match(panel.innerHTML,/Estadísticas de jugadores/);
  assert.match(panel.innerHTML,/Orlando Magic/); assert.match(panel.innerHTML,/<b>97<\/b>/);
  pulsar({accion:'volver'});
  assert.match(panel.innerHTML,/NBA · 1 partido/); assert.equal(pedidas.length,2);
  assert.doesNotMatch(panel.innerHTML,/Volver a resultados/);
  pulsar({accion:'partido',id:partido.id}); await esperar();
  assert.equal(pedidas.length,2); assert.match(panel.innerHTML,/Parciales/);
  actualizar('clasificacion:nba'); await esperar();
  assert.doesNotMatch(panel.innerHTML,/Volver a resultados/);
});

test('partido: ofrece encuentros elegibles y permite cambiar después de ver el detalle',async()=>{
  const partido=await partidoReal('primera');
  const candidatos=[{id:partido.id,titulo:'Villarreal · Espanyol',detalle:'0–1',inicio:partido.inicio,estado:'final'}];
  const {panel,pedidas,actualizar,pulsar}=contexto({responder:ruta=>json(envoltorio('partido',ruta.startsWith('/consulta/ficha')?{ficha:partido}:{candidatos}))});
  actualizar('partido:primera'); await esperar();
  assert.match(pedidas[0],/tipo=partido&texto=primera/);
  assert.match(panel.innerHTML,/Villarreal · Espanyol/); assert.match(panel.innerHTML,/Final · 0–1/);
  pulsar({accion:'candidato',i:'0'}); await esperar();
  assert.equal(pedidas.length,2); assert.match(panel.innerHTML,/Incidencias/);
  assert.match(panel.innerHTML,/Alineaciones/); assert.match(panel.innerHTML,/Posesión/);
  assert.doesNotMatch(panel.innerHTML,/Parciales|conStat|conInc/);
  pulsar({accion:'cambiar'}); assert.match(panel.innerHTML,/data-accion="candidato"/);
  assert.equal(pedidas.length,2);
});

test('partido por identidad va directo al resumen; los vacíos y competiciones ajenas no inventan fichas',async()=>{
  const partido=await partidoReal('wnba');
  const {panel,pedidas,actualizar}=contexto({responder:()=>json(envoltorio('partido',{ficha:partido}))});
  actualizar('partido:wnba/401918311'); await esperar();
  assert.deepEqual(pedidas,['/consulta/ficha?id=espn%3Apartido%2Fwnba%2F401918311&idioma=es&v=3']);
  assert.match(panel.innerHTML,/WNBA/);
  actualizar('partido:f1'); assert.equal(pedidas.length,1);
  assert.match(panel.innerHTML,/Elige una competición/); assert.doesNotMatch(panel.innerHTML,/data-valor="f1"/);
  const vacio=contexto({responder:()=>json(envoltorio('partido',{estado:'vacio'}))});
  vacio.actualizar('partido:nba'); await esperar();
  assert.match(vacio.panel.innerHTML,/No hay partidos/);
});

test('partido: una respuesta no_disponible al actualizar conserva la última ficha buena',async()=>{
  const partido=await partidoReal('segunda'); let n=0;
  const {panel,pedidas,actualizar,pulsar}=contexto({responder:()=>json(envoltorio('partido',++n===1
    ? {ficha:partido,caduca:new Date(Date.now()-1000).toISOString()}
    : {estado:'no_disponible',ficha:null,caduca:null}))});
  actualizar('partido:segunda/401883124'); await esperar();
  assert.match(panel.innerHTML,/Granada/); assert.match(panel.innerHTML,/data-accion="actualizar"/);
  pulsar({accion:'actualizar'}); await esperar();
  assert.equal(pedidas.length,2); assert.match(panel.innerHTML,/Granada/);
  assert.match(panel.innerHTML,/No se pudo actualizar; se muestra la anterior/);
});

test('partido: escapa los textos del proveedor y omite los bloques ausentes',async()=>{
  const partido={competicion:'primera',estado:'programado',inicio:'sin hora',local:'<img onerror=1>',visitante:'& visitante',lugar:'<script>1</script>'};
  const {panel,actualizar}=contexto({responder:()=>json(envoltorio('partido',{ficha:partido}))});
  actualizar('partido:primera/123'); await esperar();
  assert.match(panel.innerHTML,/&lt;img onerror=1&gt;/); assert.match(panel.innerHTML,/&lt;script&gt;1&lt;\/script&gt;/);
  assert.doesNotMatch(panel.innerHTML,/<img onerror|<script>|Invalid Date|Estadísticas|Alineaciones|Parciales/);
});

test('volver desde un partido pendiente impide que su respuesta tardía sustituya la parrilla',async()=>{
  const partido=await partidoReal('nba'); let resolver;
  const pendiente=new Promise(resolve=>{resolver=resolve;});
  const {panel,pedidas,actualizar,pulsar}=contexto({responder:ruta=>ruta.includes('partido')?pendiente
    :json(envoltorio('resultados',{ficha:{competicion:'nba',partidos:[partido]}}))});
  actualizar('resultados:nba'); await esperar();
  pulsar({accion:'partido',id:partido.id});
  assert.match(panel.innerHTML,/Consultando/); assert.match(panel.innerHTML,/Volver a resultados/);
  pulsar({accion:'volver'});
  resolver(json(envoltorio('partido',{ficha:partido}))); await esperar();
  assert.equal(pedidas.length,2); assert.match(panel.innerHTML,/NBA · 1 partido/);
  assert.doesNotMatch(panel.innerHTML,/Parciales|Volver a resultados/);
});
