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
