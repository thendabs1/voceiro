// node --test 'tests/**/*.test.mjs'
// alertas:: parser, extracción de avisos del tar de AEMET y del Atom de
// MeteoAlarm en el worker, y nombres, filtro y grupos en el cliente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery } from '../../shared/parser.js';
import { interpretarConsulta } from '../../shared/busqueda/consulta.js';
import { desdeCap, desdeTar, desdeAtom, vigentes } from '../../workers/deno-buscar/src/tiempo/avisos.js';
import {
  comunidadDeZona, provinciaDeZona, zonaHorariaAviso, filtrarAvisos, agruparAvisos,
  resumenAvisos, busquedaNoticias,
} from '../../shared/tiempo/avisos.js';

test('alertas: vacío es toda España; con valor, un filtro; no filtra noticias', () => {
  assert.equal(parseQuery('alertas:').alertas, '');
  assert.equal(parseQuery('alertas:Galicia').alertas, 'Galicia');
  assert.equal(parseQuery('avisos:"Castilla y León"').alertas, 'Castilla y León');
  assert.equal(parseQuery('incendio').alertas, null);
  assert.deepEqual(parseQuery('alertas:lluvia temporal').titulo, ['temporal']);
  assert.equal(interpretarConsulta('alertas:Galicia').vacia, true);
});

// Un CAP como los de AEMET, reducido.
function cap({ id, nivel = 'naranja', fen = 'PR;Lluvias', zona = '713601', area = 'Rias Baixas',
  onset = '2026-10-22T00:00:00+02:00', expires = '2026-10-22T23:59:59+02:00', msgType = 'Alert', references = '' }) {
  const info = (lang, desc) => `<info>
    <language>${lang}</language>
    <eventCode><valueName>AEMET-Meteoalerta fenomeno</valueName><value>${fen}</value></eventCode>
    <onset>${onset}</onset><expires>${expires}</expires>
    <description>${desc}</description>
    <parameter><valueName>AEMET-Meteoalerta nivel</valueName><value>${nivel}</value></parameter>
    <area><areaDesc>${area}</areaDesc>
      <geocode><valueName>AEMET-Meteoalerta zona</valueName><value>${zona}</value></geocode></area>
  </info>`;
  return `<?xml version="1.0" encoding="UTF-8"?><alert><identifier>${id}</identifier><msgType>${msgType}</msgType>
    ${references ? `<references>${references}</references>` : ''}
    ${info('es-ES', 'Precipitación acumulada en 12 horas: 80 mm. Tormentas &amp; granizo.')}
    ${info('en-GB', 'Twelve-hours accumulated precipitation: 80 mm.')}</alert>`;
}

// Tar mínimo: cabecera de 512 bytes con el tamaño en octal y el contenido
// rellenado hasta 512; al final, dos bloques a cero.
function tar(ficheros) {
  const partes = [];
  for (const texto of ficheros) {
    const datos = new TextEncoder().encode(texto);
    const cab = new Uint8Array(512);
    cab.set(new TextEncoder().encode('aviso.xml'), 0);
    cab.set(new TextEncoder().encode(datos.length.toString(8).padStart(11, '0') + '\0'), 124);
    partes.push(cab, datos, new Uint8Array((512 - datos.length % 512) % 512));
  }
  partes.push(new Uint8Array(1024));
  const out = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of partes) { out.set(p, off); off += p.length; }
  return out;
}

test('CAP de AEMET: nivel, zona, horas y texto en los dos idiomas; los verdes no', () => {
  const [a] = desdeCap(cap({ id: 'x1' }));
  assert.deepEqual(a, {
    zona: '713601', area: 'Rias Baixas', fen: 'PR', nivel: 'naranja',
    inicio: '2026-10-22T00:00:00+02:00', fin: '2026-10-22T23:59:59+02:00',
    texto: { es: 'Precipitación acumulada en 12 horas: 80 mm. Tormentas & granizo.', en: 'Twelve-hours accumulated precipitation: 80 mm.' },
  });
  assert.deepEqual(desdeCap(cap({ id: 'x2', nivel: 'verde' })), []);
  assert.deepEqual(desdeCap(cap({ id: 'x3', msgType: 'Cancel' })), []);
});

test('tar: todos los CAP, sin las versiones sustituidas', () => {
  const bytes = tar([
    cap({ id: 'viejo', nivel: 'amarillo' }),
    cap({ id: 'nuevo', msgType: 'Update', references: 'http://www.aemet.es,viejo,2026-10-21T09:00:00-00:00' }),
    cap({ id: 'otro', fen: 'VI;Vientos', zona: '659303', area: 'Este de La Palma' }),
  ]);
  const r = desdeTar(bytes);
  assert.deepEqual(r.map(a => [a.zona, a.fen, a.nivel]), [['713601', 'PR', 'naranja'], ['659303', 'VI', 'naranja']]);
});

test('Atom de MeteoAlarm: nivel por severidad y zona por el identificador', () => {
  const entrada = (sev, id, area) => `<entry><cap:areaDesc>${area}</cap:areaDesc><cap:severity>${sev}</cap:severity>
    <cap:onset>2026-10-21T22:00:00+00:00</cap:onset><cap:expires>2026-10-22T21:59:59+00:00</cap:expires>
    <cap:identifier>2.49.0.0.724.0.ES.261021093209.${id}</cap:identifier></entry>`;
  const xml = `<feed>${entrada('Severe', '659601PRP1220575129', 'Norte de Tenerife')}
    ${entrada('Moderate', '663901COCO2122', 'Costa - Litoral cántabro')}
    ${entrada('Minor', '713601VIRM2117', 'Rias Baixas')}</feed>`;
  assert.deepEqual(desdeAtom(xml).map(a => [a.zona, a.fen, a.nivel, a.texto]), [
    ['659601', 'PR', 'naranja', null],
    ['663901C', 'CO', 'amarillo', null],   // los costeros no llevan la C en el identificador
  ]);
});

test('vigentes: sin caducados, juntos los repetidos y lo más grave primero', () => {
  const base = { zona: '659303', area: 'Este de La Palma', fen: 'PR', nivel: 'naranja',
    inicio: '2026-10-22T00:00:00+01:00', fin: '2026-10-22T17:59:59+01:00' };
  const r = vigentes([
    { ...base, zona: '713601', nivel: 'amarillo', texto: null },
    { ...base, texto: { es: 'En una hora: 30 mm. Chubascos fuertes.', en: null } },
    { ...base, texto: { es: 'En 12 horas: 100 mm. Chubascos fuertes.', en: null } },
    { ...base, zona: '610401', fin: '2026-10-21T10:00:00+02:00', texto: null },
  ], Date.parse('2026-10-21T12:00:00Z'));
  assert.deepEqual(r.map(a => [a.zona, a.nivel]), [['659303', 'naranja'], ['713601', 'amarillo']]);
  assert.equal(r[0].texto.es, 'En una hora: 30 mm. Chubascos fuertes. En 12 horas: 100 mm.');
});

test('zonas: comunidad, provincia (también en las islas) y hora', () => {
  assert.equal(comunidadDeZona('713601'), 'Galicia');
  assert.equal(provinciaDeZona('713601'), 'Pontevedra');
  assert.equal(provinciaDeZona('663901C'), 'Cantabria');
  assert.equal(provinciaDeZona('659303'), 'Santa Cruz de Tenerife');   // La Palma
  assert.equal(provinciaDeZona('659004'), 'Las Palmas');               // Gran Canaria
  assert.equal(provinciaDeZona('645301'), 'Illes Balears');            // Ibiza
  assert.equal(zonaHorariaAviso('659303'), 'Atlantic/Canary');
  assert.equal(zonaHorariaAviso('713601'), 'Europe/Madrid');
});

const AVISOS = [
  { zona: '713601', area: 'Rias Baixas', fen: 'VI', nivel: 'amarillo', inicio: '2026-10-21T10:00:00+02:00', fin: '2026-10-22T00:00:00+02:00' },
  { zona: '659303', area: 'Este de La Palma', fen: 'PR', nivel: 'naranja', inicio: '2026-10-22T00:00:00+01:00', fin: '2026-10-22T18:00:00+01:00' },
  { zona: '659601', area: 'Norte de Tenerife', fen: 'PR', nivel: 'rojo', inicio: '2026-10-21T10:00:00+01:00', fin: '2026-10-22T05:00:00+01:00' },
  { zona: '711504C', area: 'Costa - Suroeste de A Coruña', fen: 'CO', nivel: 'amarillo', inicio: '2026-10-21T10:00:00+02:00', fin: '2026-10-22T00:00:00+02:00' },
];
const NOMBRES = { fen: { PR: ['Choivas', 'Lluvias'], VI: ['Ventos', 'Vientos'], CO: ['Costeiros', 'Costeros'] },
  nivel: { amarillo: ['Amarelo', 'Amarillo'], naranja: ['Laranxa', 'Naranja'], rojo: ['Vermello', 'Rojo'] } };
const AHORA = Date.parse('2026-10-21T12:00:00Z');

test('filtro: comunidad, provincia, zona, fenómeno o nivel, sin tildes y en dos idiomas', () => {
  const zonas = q => filtrarAvisos(AVISOS, q, NOMBRES).map(a => a.zona);
  assert.deepEqual(zonas(''), AVISOS.map(a => a.zona));
  assert.deepEqual(zonas('galicia'), ['713601', '711504C']);
  assert.deepEqual(zonas('A Coruña'), ['711504C']);
  assert.deepEqual(zonas('tenerife'), ['659303', '659601']);   // la provincia de La Palma
  assert.deepEqual(zonas('lluvia'), ['659303', '659601']);
  assert.deepEqual(zonas('choiva'), ['659303', '659601']);
  assert.deepEqual(zonas('rojo'), ['659601']);
});

test('grupos: por fenómeno, el de nivel más alto primero; dentro, lo grave y lo que ya empezó', () => {
  const g = agruparAvisos(AVISOS, AHORA);
  assert.deepEqual(g.map(x => [x.fen, x.nivel]), [['PR', 'rojo'], ['VI', 'amarillo'], ['CO', 'amarillo']]);
  assert.deepEqual(g[0].avisos.map(a => a.zona), ['659601', '659303']);
});

test('icono: solo naranja y rojo, con los que ya están en vigor', () => {
  assert.deepEqual(resumenAvisos(AVISOS, AHORA), { nivel: 'rojo', total: 2, ahora: 1 });
  assert.equal(resumenAvisos(AVISOS.filter(a => a.nivel === 'amarillo'), AHORA), null);
});

test('«Ver noticias»: fenómeno y comunidad desde ayer', () => {
  assert.equal(busquedaNoticias(AVISOS[1]), 'lluvia* Canarias desde:ayer');
  assert.equal(busquedaNoticias({ zona: '673401', fen: 'NE' }), 'nev* "Castilla y León" desde:ayer');
  assert.equal(busquedaNoticias({ zona: '774601', fen: 'TO' }), 'tormenta* valencia* desde:ayer');
  const p = parseQuery(busquedaNoticias({ zona: '673401', fen: 'NE' }));
  assert.ok(p.desde);
});
