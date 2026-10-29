// node --test 'tests/**/*.test.mjs'
// Panel de consultas puntuales (front/app/14-consultas.js) contra un fetch
// simulado: qué se pide, cuántas veces, y qué se pinta con cada estado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parseQuery, tokenizeQuery, normalize } from '../../shared/parser.js';
import { ESPN } from '../../shared/consultas/registro.js';
import { traducir } from '../../front/idiomas/index.js';

const codigo = readFileSync(new URL('../../front/app/14-consultas.js', import.meta.url), 'utf8');
const BASE = 'https://buscar.example';
const futuro = () => new Date(Date.now() + 3600e3).toISOString();
const envoltorio = (tipo, extra) => ({
  tipo, estado: 'ok', candidatos: [], ficha: null, fuente: 'TMDB', enlace: 'https://www.themoviedb.org',
  licencia: { nombre: 'Condiciones de TMDB', enlace: 'https://www.themoviedb.org/terms-of-use' },
  consultado: new Date().toISOString(), caduca: futuro(), incompleto: false, ...extra,
});

function contexto({ buscar = '', responder }) {
  const panel = {
    hidden: true, innerHTML: '', dataset: {}, oyente: null,
    addEventListener(_, fn) { this.oyente = fn; }, querySelector: () => null,
  };
  const entrada = { value: buscar };
  const pedidas = [];
  const ctx = {
    BACKENDS: { deno: { buscar: BASE } }, ESPN, ACCES: { lang: 'es' },
    t: (k, v) => traducir('es', k, v), ico: n => `<${n}>`,
    escapeHtml: s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    normalize, tokenizeQuery, Intl, Date, URLSearchParams, AbortSignal, Promise, Map, Set, JSON, Object, Error, isNaN,
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
  runInNewContext(codigo + '\nthis.api = { PUNTUAL, actualizarConsultaPuntual };', ctx);
  const actualizar = raw => { entrada.value = raw; ctx.api.actualizarConsultaPuntual(parseQuery(raw)); };
  // Un toque: lo que llegaría a closest('button[data-accion]').
  const pulsar = dataset => panel.oyente({ target: { closest: () => ({ dataset }) } });
  return { ctx, panel, entrada, pedidas, actualizar, pulsar };
}
const json = (cuerpo, status = 200) => ({ status, ok: status >= 200 && status < 300, json: async () => cuerpo });
const esperar = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };

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
  assert.deepEqual(pedidas, ['/consulta/ficha?id=espn%3Aclasificacion%2Fnba&idioma=es']);
  assert.equal(panel.hidden, false);
  assert.match(panel.innerHTML, /NBA · 2026-27/);
  assert.match(panel.innerHTML, /Este: Detroit Pistons · 4–1/);
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
  assert.deepEqual(pedidas, ['/consulta?tipo=pelicula&texto=La+infiltrada&idioma=es']);
  assert.match(panel.innerHTML, /data-accion="candidato" data-i="0"/);
  assert.match(panel.innerHTML, /<span class="consulta-cand-det">2024<\/span>/);   // el original igual no se repite
  pulsar({ accion: 'candidato', i: '0' });
  await esperar();
  assert.equal(pedidas.length, 2);
  assert.match(pedidas[1], /^\/consulta\/ficha\?id=tmdb%3Amovie%2F1215185&idioma=es$/);
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
  assert.deepEqual(pedidas, ['/consulta?tipo=pelicula&texto=Up&idioma=es']);
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
