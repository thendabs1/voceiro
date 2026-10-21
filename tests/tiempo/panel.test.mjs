// node --test 'tests/**/*.test.mjs'
// Panel del tiempo en plantilla.html: el sol y las pestañas cambian el
// prefijo del buscador, los avisos de un sitio (con su costa) y el sol
// coloreado solo por avisos naranjas o rojos de mis sitios.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { PESO, empezado } from '../../shared/tiempo/avisos.js';

const html = readFileSync(new URL('../../plantilla.html', import.meta.url), 'utf8');
const funcion = nombre => html.slice(
  html.indexOf(`function ${nombre}(`),
  html.indexOf('\n}', html.indexOf(`function ${nombre}(`)) + 2,
);
const linea = inicio => html.slice(html.indexOf(inicio), html.indexOf('\n', html.indexOf(inicio)));

function contexto({ buscar = '', sitios = [], avisos = [] } = {}) {
  const guardado = new Map([['voceiro-tiempo-sitios-v1', JSON.stringify(sitios)]]);
  const nodo = (extra = {}) => ({
    dataset: {}, attrs: {}, hidden: false, classList: { add() {} },
    setAttribute(k, v) { this.attrs[k] = v; }, ...extra,
  });
  const el = {
    '#buscar': nodo({ value: buscar, focus() {}, setSelectionRange() {} }),
    '.filtros-wrap': nodo(), '#btn-buscar': nodo(), '#buscar-clear': nodo(),
  };
  const sol = nodo();
  const ctx = {
    $: s => el[s], t: k => k, ico: n => `<${n}>`, escapeHtml: x => String(x),
    PESO, empezado, Date, JSON, String, Array,
    TIEMPO_ACTIVO: true, AVISOS_CABECERA: true, TIEMPO_SITIOS_KEY: 'voceiro-tiempo-sitios-v1', TIEMPO_MAX_SITIOS: 5,
    AVISOS: { datos: { avisos } }, filtrados: 0,
    avisosVigentes: () => avisos,
    aplicarFiltros() { ctx.filtrados++; },
    document: { getElementById: id => (id === 'btn-tiempo' ? sol : null) },
    localStorage: { getItem: k => guardado.get(k) ?? null, setItem: (k, v) => guardado.set(k, v) },
  };
  runInNewContext([
    linea('const RX_TOKENS_TIEMPO'), linea('const RX_HAY_TIEMPO'),
    ...['sitiosTiempo', 'ponerTiempo', 'enfocarBuscador', 'abrirSitios', 'abrirTiempo', 'avisosDeZona',
      'pintarBotonTiempo'].map(funcion),
  ].join('\n') + '\nthis.abrirTiempo = abrirTiempo; this.ponerTiempo = ponerTiempo; this.avisosDeZona = avisosDeZona; this.pintarBotonTiempo = pintarBotonTiempo;', ctx);
  return { ctx, buscar: el['#buscar'], sol };
}

test('el sol abre Mis sitios y lo cierra sin tocar el resto de la búsqueda', () => {
  const { ctx, buscar } = contexto({ buscar: 'incendio medio:elpais' });
  ctx.abrirTiempo();
  assert.equal(buscar.value, 'incendio medio:elpais eltiempo:');
  ctx.abrirTiempo();
  assert.equal(buscar.value, 'incendio medio:elpais');
  assert.equal(ctx.filtrados, 2);
});

test('las pestañas cambian un prefijo del tiempo por otro', () => {
  const { ctx, buscar } = contexto({ buscar: 'tiempo:"A Coruña" incendio alertas:Galicia' });
  ctx.ponerTiempo('alertas:');
  assert.equal(buscar.value, 'incendio alertas:');
  ctx.ponerTiempo('eltiempo:Vigo');
  assert.equal(buscar.value, 'incendio eltiempo:Vigo');
});

const aviso = (zona, nivel, inicio = '2026-10-21T08:00:00Z') =>
  ({ zona, nivel, fen: 'PR', area: zona, inicio, fin: '2026-10-22T08:00:00Z' });

test('avisos de un sitio: su zona y su costa, lo más grave primero', () => {
  const { ctx } = contexto({ avisos: [aviso('713601', 'amarillo'), aviso('713601C', 'naranja'), aviso('713602', 'rojo')] });
  assert.deepEqual(ctx.avisosDeZona('713601').map(a => a.zona), ['713601C', '713601']);
});

test('el sol se colorea solo con naranja o rojo en mis sitios', () => {
  const sitios = [{ nombre: 'Vigo', lugar: { ine: '36057' }, zona: '713601' }];
  const amarillo = contexto({ sitios, avisos: [aviso('713601', 'amarillo'), aviso('659601', 'rojo')] });
  amarillo.ctx.pintarBotonTiempo();
  assert.equal(amarillo.sol.dataset.nivel, undefined);
  assert.equal(amarillo.sol.attrs['aria-label'], 'ajTiempoTit');

  const naranja = contexto({ sitios, avisos: [aviso('713601C', 'naranja')] });
  naranja.ctx.pintarBotonTiempo();
  assert.equal(naranja.sol.dataset.nivel, 'naranja');
  assert.equal(naranja.sol.attrs['aria-label'], 'ajTiempoTit · avisoNivelnaranja: Vigo');

  const apagado = contexto({ sitios, avisos: [aviso('713601', 'rojo')] });
  apagado.ctx.AVISOS_CABECERA = false;
  apagado.ctx.pintarBotonTiempo();
  assert.equal(apagado.sol.dataset.nivel, undefined);
});

// Mis sitios con previsiones que llegan cuando el test quiere.
function contextoSitios(sitios) {
  const guardado = new Map([['voceiro-tiempo-sitios-v1', JSON.stringify(sitios)]]);
  const pintados = [], pendientes = [];
  const ctx = {
    t: k => k, ico: n => `<${n}>`, escapeHtml: x => String(x), normalize: x => String(x).toLowerCase(),
    provinciaDe: ine => ({ 27: 'Lugo', 32: 'Ourense' })[ine.slice(0, 2)] || '',
    cieloTiempo: () => ({ ico: '', txt: '' }), grados: v => `${v}°`, nombreFen: f => f,
    avisosDeZona: () => [], htmlPestanasTiempo: () => '', msgTiempo: k => k,
    pedirAvisos: () => Promise.resolve(), pintarBotonTiempo() {},
    document: { querySelector: () => null },
    TIEMPO: { valor: '', sitios: new Map(), fallos: new Set() }, AVISOS: { datos: null },
    TIEMPO_SITIOS_KEY: 'voceiro-tiempo-sitios-v1', TIEMPO_MAX_SITIOS: 5, JSON, Array, String,
    localStorage: { getItem: k => guardado.get(k) ?? null, setItem: (k, v) => guardado.set(k, v) },
    pintarTiempo: html => pintados.push(html),
    previsionSitio: s => new Promise((ok, mal) => pendientes.push({ s, ok, mal })),
  };
  runInNewContext([
    linea('const claveLugar'), linea('const htmlReintentar'), linea('const regionSitio'),
    ...['sitiosTiempo', 'guardarSitios', 'pintarSitios', 'htmlSitios', 'quitarSitio'].map(funcion),
  ].join('\n') + '\nthis.pintarSitios = pintarSitios; this.htmlSitios = htmlSitios; this.quitarSitio = quitarSitio;', ctx);
  return { ctx, pintados, pendientes };
}
const vigo = { nombre: 'Vigo', lugar: { ine: '36057' } };
const madrid = { nombre: 'Madrid', lugar: { ine: '28079' } };

test('Mis sitios: una previsión que llega tarde no devuelve un sitio quitado', async () => {
  const { ctx, pintados, pendientes } = contextoSitios([vigo, madrid]);
  ctx.pintarSitios();
  ctx.quitarSitio('36057');
  const p = { dias: [{ max: 20, min: 10 }] };
  ctx.TIEMPO.sitios.set('36057', { p });
  pendientes[0].ok(p);
  await new Promise(r => setTimeout(r));
  const ultimo = pintados.at(-1);
  assert.doesNotMatch(ultimo, /Vigo/);
  assert.match(ultimo, /data-k="28079"/);
});

test('Mis sitios: los homónimos llevan su provincia; un fallo, guion y Reintentar', () => {
  const { ctx } = contextoSitios([]);
  const castros = [{ nombre: 'Castro', lugar: { ine: '27011' } }, { nombre: 'Castro', lugar: { ine: '32021' } }, vigo];
  const html = ctx.htmlSitios(castros);
  assert.match(html, /Castro \(Lugo\)/);
  assert.match(html, /Castro \(Ourense\)/);
  assert.match(html, /<strong>Vigo<\/strong>/);
  assert.doesNotMatch(html, /tiempo-reintentar/);

  ctx.TIEMPO.fallos.add('36057');
  const fallo = ctx.htmlSitios([vigo]);
  assert.match(fallo, /tiempo-min">–</);
  assert.match(fallo, /tiempo-reintentar/);
});

// Los avisos dentro de la tarjeta: la fuente, solo si algo va mal.
function avisosLugar(AVISOS) {
  const ctx = {
    t: k => k, escapeHtml: x => String(x), msgTiempo: k => `<p>${k}</p>`, htmlAviso: a => `<li>${a.zona}</li>`,
    avisosDeZona: () => (AVISOS.datos?.avisos || []), ACCES: { lang: 'es' }, Date, isNaN,
    TIEMPO_AVISOS_KEY: 'voceiro-tiempo-avisos', AVISOS, localStorage: { getItem: () => null },
  };
  runInNewContext(['htmlAvisosLugar', 'pieAvisos'].map(funcion).join('\n') + '\nthis.f = htmlAvisosLugar;', ctx);
  return ctx.f({ zonaAviso: '713601' });
}

test('avisos del sitio: el fallo y MeteoAlarm se dicen; con AEMET, sin pie', () => {
  assert.equal(avisosLugar({ datos: null, error: false }), '');
  assert.match(avisosLugar({ datos: null, error: true }), /avisosError/);
  const aemet = { fuente: 'aemet', consultado: '2026-10-21T10:00:00Z', avisos: [] };
  assert.doesNotMatch(avisosLugar({ datos: aemet, error: false }), /tiempo-pie/);
  assert.match(avisosLugar({ datos: aemet, error: true }), /tiempo-pie.*avisosError/s);
  const meteoalarm = { fuente: 'meteoalarm', incompleto: true, avisos: [aviso('713601', 'amarillo')] };
  const html = avisosLugar({ datos: meteoalarm, error: false });
  assert.match(html, /avisosBotonTxt \(1\)/);
  assert.match(html, /MeteoAlarm.*avisosIncompleto/s);
});
