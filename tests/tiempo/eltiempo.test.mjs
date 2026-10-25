// node --test 'tests/**/*.test.mjs'
// eltiempo:: parser, municipios del cliente, nombres del maestro de AEMET y
// normalización de AEMET y Open-Meteo en el worker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery } from '../../shared/parser.js';
import { interpretarConsulta, paraPrensa } from '../../shared/busqueda/consulta.js';
import { MUNICIPIOS } from '../../shared/tiempo/municipios.js';
import { MUNICIPIOS as MUNICIPIOS_WORKER, SIN_PREVISION } from '../../workers/deno-buscar/src/tiempo/municipios.js';
import { esMunicipioSinPrevision, handleTiempo } from '../../workers/deno-buscar/src/tiempo/index.js';
import { indexar, sugerirMunicipios, municipiosExactos, provinciaDe } from '../../shared/tiempo/lugares.js';
import { nombreVisible } from '../../scripts/generar-municipios.mjs';
import {
  cieloAemet, cieloWmo, zonaHoraria, desdeAemet, desdeOpenMeteo, municipioCercano,
} from '../../workers/deno-buscar/src/tiempo/normalizar.js';

const indice = indexar(MUNICIPIOS);

test('eltiempo: es un lugar, no texto ni filtro', () => {
  const p = parseQuery('eltiempo:"A Coruña"');
  assert.equal(p.eltiempo, 'A Coruña');
  assert.deepEqual(p.titulo, []);
  assert.deepEqual(p.chips.map(c => c.type), ['eltiempo']);

  const q = parseQuery('eltiempo:Vigo transporte');
  assert.equal(q.eltiempo, 'Vigo');
  assert.deepEqual(q.titulo, ['transporte']);
  assert.equal(parseQuery('eltiempo:').eltiempo, '');          // el panel con los sitios guardados
  assert.equal(parseQuery('incendio').eltiempo, null);
  assert.equal(parseQuery('tiempo:Vigo').eltiempo, 'Vigo');      // tiempo: es lo mismo
  assert.equal(parseQuery('TIEMPO:"A Coruña"').eltiempo, 'A Coruña');
  for (const prefijo of ['t', 'tempo', 'otempo', 'temps', 'eltemps', 'weather', 'eguraldia']) {
    const alias = parseQuery(`${prefijo}:"A Coruña"`);
    assert.equal(alias.eltiempo, 'A Coruña', prefijo);
    assert.deepEqual(alias.chips.map(c => c.type), ['eltiempo'], prefijo);
    assert.equal(parseQuery(`${prefijo}:`).eltiempo, '', prefijo);
  }
});

test('eltiempo: no llega a la prensa ni deja la consulta con texto', () => {
  const c = interpretarConsulta('eltiempo:Vigo');
  assert.equal(c.vacia, true);
  assert.equal(paraPrensa(interpretarConsulta('eltiempo:Vigo incendio')), 'incendio');
  assert.equal(paraPrensa(interpretarConsulta('t:Vigo incendio')), 'incendio');
});

test('nombres del maestro: el artículo va delante', () => {
  assert.equal(nombreVisible('Coruña, A'), 'A Coruña');
  assert.equal(nombreVisible("Hospitalet de Llobregat, L'"), "L'Hospitalet de Llobregat");
  assert.equal(nombreVisible('Alqueries, les/Alquerías del Niño Perdido'), 'les Alqueries/Alquerías del Niño Perdido');
  assert.equal(nombreVisible('Palmas de Gran Canaria, Las'), 'Las Palmas de Gran Canaria');
  // Lo que va tras la coma no siempre es un artículo.
  assert.equal(nombreVisible("Forallac, Monells i Sant Sadurní de l'Heura"), "Forallac, Monells i Sant Sadurní de l'Heura");
});

test('municipios: con y sin artículo, bilingües y sin tildes', () => {
  assert.deepEqual(municipiosExactos(indice, 'coruña').map(m => m.ine), ['15030']);
  assert.deepEqual(municipiosExactos(indice, 'A CORUNA').map(m => m.ine), ['15030']);
  assert.deepEqual(municipiosExactos(indice, 'San Sebastián').map(m => m.nombre), ['Donostia/San Sebastián']);
  assert.deepEqual(municipiosExactos(indice, 'Hospitalet de Llobregat').map(m => m.ine), ['08101']);
  assert.equal(provinciaDe('36057'), 'Pontevedra');
});

test('municipios: los nombres repetidos dan varias opciones', () => {
  const r = municipiosExactos(indice, 'Arroyomolinos');
  assert.equal(r.length, 2);
  assert.deepEqual(r.map(m => provinciaDe(m.ine)).sort(), ['Cáceres', 'Madrid']);
});

test('municipios revisados: los cuatro vigentes son seleccionables y los antiguos no', () => {
  for (const [nombre, codigo, zona] of [
    ['Balanegra', '04904', '610403'],
    ['Játar', '18106', '611801'],
    ['Domingo Pérez de Granada', '18915', '611801'],
    ['Cerdedo-Cotobade', '36902', '713602'],
  ]) {
    assert.deepEqual(municipiosExactos(indice, nombre).map(m => m.ine), [codigo]);
    assert.equal(MUNICIPIOS_WORKER[codigo][3], zona);
  }
  for (const codigo of ['36011', '36012', '18916']) {
    assert.equal(MUNICIPIOS.some(m => m[1] === codigo), false);
    assert.equal(Object.hasOwn(MUNICIPIOS_WORKER, codigo), false);
  }
});

test('municipios sin previsión: el geocodificador no los reactiva como municipios actuales', () => {
  assert.equal(SIN_PREVISION.length, 8);
  for (const nombre of SIN_PREVISION) assert.equal(esMunicipioSinPrevision(nombre, 'ES'), true);
  assert.equal(esMunicipioSinPrevision('Usánsolo', 'ES'), true);
  assert.equal(esMunicipioSinPrevision('Palmar de Troya', 'ES'), true);
  assert.equal(esMunicipioSinPrevision('Fornes', 'FR'), false);
  assert.equal(esMunicipioSinPrevision('Cerdedo-Cotobade', 'ES'), false);
});

test('la ruta de lugares oculta un municipio sin previsión y la ruta directa lo rechaza', async () => {
  const fetchAnterior = globalThis.fetch, cachesAnteriores = globalThis.caches;
  globalThis.caches = { open: async () => ({ match: async () => null, put: async () => {} }) };
  globalThis.fetch = async () => new Response(JSON.stringify({ results: [
    { name: 'Usánsolo', country_code: 'ES', latitude: 43.22166, longitude: -2.81567 },
    { name: 'Bilbao', country_code: 'ES', latitude: 43.263, longitude: -2.935 },
  ] }), { headers: { 'content-type': 'application/json' } });
  try {
    const lugares = await handleTiempo(new URL('https://ejemplo.test/tiempo/lugares?q=Usansolo'), {});
    assert.equal(lugares.status, 200);
    assert.deepEqual((await lugares.json()).lugares.map(x => x.nombre), ['Bilbao']);
    const directo = await handleTiempo(new URL('https://ejemplo.test/tiempo?lat=43.22166&lon=-2.81567&cc=ES&nombre=Usansolo'), {});
    assert.equal(directo.status, 404);
  } finally {
    globalThis.fetch = fetchAnterior;
    globalThis.caches = cachesAnteriores;
  }
});

test('sugerencias: primero los que empiezan, de más a menos habitantes', () => {
  const s = sugerirMunicipios(indice, 'vig');
  assert.equal(s[0].nombre, 'Vigo');
  assert.ok(s.length <= 6);
  // Desde 3 letras, también los que contienen el texto.
  assert.ok(sugerirMunicipios(indice, 'llobregat').some(m => m.ine === '08101'));
  assert.deepEqual(sugerirMunicipios(indice, ''), []);
});

test('cielo: códigos de AEMET y WMO a las mismas categorías', () => {
  assert.equal(cieloAemet('11'), 'despejado');
  assert.equal(cieloAemet('12n'), 'poco');
  assert.equal(cieloAemet('14'), 'nuboso');
  assert.equal(cieloAemet('16'), 'cubierto');
  assert.equal(cieloAemet('45'), 'lluvia');
  assert.equal(cieloAemet('36'), 'nieve');
  assert.equal(cieloAemet('62'), 'tormenta');
  assert.equal(cieloAemet('81'), 'niebla');
  assert.equal(cieloAemet(''), null);
  assert.equal(cieloWmo(0), 'despejado');
  assert.equal(cieloWmo(3), 'cubierto');
  assert.equal(cieloWmo(61), 'lluvia');
  assert.equal(cieloWmo(95), 'tormenta');
});

test('Canarias va con su hora', () => {
  assert.equal(zonaHoraria('38038'), 'Atlantic/Canary');
  assert.equal(zonaHoraria('35016'), 'Atlantic/Canary');
  assert.equal(zonaHoraria('36057'), 'Europe/Madrid');
});

const diaria = [{
  nombre: 'Vigo', provincia: 'Pontevedra', elaborado: '2026-10-21T09:05:09',
  origen: { enlace: 'https://www.aemet.es/es/eltiempo/prediccion/municipios/vigo-id36057' },
  prediccion: { dia: [
    { fecha: '2026-10-20T00:00:00', temperatura: { maxima: 16, minima: 9 }, estadoCielo: [], probPrecipitacion: [] },
    // Tramos pasados vacíos: el cielo sale del de la tarde.
    { fecha: '2026-10-21T00:00:00', temperatura: { maxima: 17, minima: 11 },
      estadoCielo: [{ value: '', periodo: '00-24' }, { value: '14', periodo: '12-24' }],
      probPrecipitacion: [{ value: 0, periodo: '00-24' }, { value: 10, periodo: '12-18' }] },
    { fecha: '2026-10-22T00:00:00', temperatura: { maxima: 17, minima: 10 },
      estadoCielo: [{ value: '25', periodo: '00-24' }], probPrecipitacion: [{ value: 100 }] },
  ] },
}];
const horaria = [{ prediccion: { dia: [{
  fecha: '2026-10-21T00:00:00', orto: '08:54', ocaso: '19:44',
  temperatura: [{ value: '12', periodo: '09' }, { value: '14', periodo: '11' }, { value: '16', periodo: '13' }],
  estadoCielo: [{ value: '12', periodo: '09' }, { value: '14', periodo: '11' }, { value: '11n', periodo: '13' }],
}] } }];

test('AEMET: días desde hoy y «ahora» con la última hora empezada', () => {
  // 12:30 en Madrid (10:30 UTC).
  const p = desdeAemet(diaria, horaria, { ahora: Date.parse('2026-10-21T10:30:00Z') });
  assert.equal(p.fuente, 'aemet');
  assert.deepEqual(p.lugar, { nombre: 'Vigo', region: 'Pontevedra', pais: 'España' });
  assert.deepEqual(p.dias.map(d => d.fecha), ['2026-10-21', '2026-10-22']);
  assert.deepEqual(p.dias[0], { fecha: '2026-10-21', max: 17, min: 11, cielo: 'nuboso', lluvia: 10 });
  assert.equal(p.dias[1].cielo, 'lluvia');
  assert.deepEqual(p.ahora, { temp: 14, cielo: 'nuboso', noche: false });
  assert.deepEqual(p.sol, { orto: '08:54', ocaso: '19:44' });
});

test('AEMET: sin la horaria, la tarjeta sale sin «ahora»', () => {
  const p = desdeAemet(diaria, null, { ahora: Date.parse('2026-10-21T10:30:00Z') });
  assert.equal(p.ahora, null);
  assert.equal(p.sol, null);
  assert.equal(p.dias.length, 2);
});

test('AEMET: en Canarias, las 12:30 peninsulares son las 11:30', () => {
  const p = desdeAemet(diaria, horaria, { ahora: Date.parse('2026-10-21T10:30:00Z'), tz: 'Atlantic/Canary' });
  assert.equal(p.ahora.temp, 14);
  const q = desdeAemet(diaria, horaria, { ahora: Date.parse('2026-10-21T12:30:00Z'), tz: 'Atlantic/Canary' });
  assert.deepEqual(q.ahora, { temp: 16, cielo: 'despejado', noche: true });
});

test('AEMET: las horas desde la que está en curso, con la lluvia de su tramo', () => {
  const h = (dia, horas) => ({
    fecha: `2026-10-${dia}T00:00:00`,
    temperatura: horas.map(x => ({ value: String(x), periodo: String(x).padStart(2, '0') })),
    estadoCielo: horas.map(x => ({ value: x >= 20 ? '11n' : '12', periodo: String(x).padStart(2, '0') })),
    probPrecipitacion: [{ value: '0', periodo: '0208' }, { value: '10', periodo: '0814' },
      { value: '40', periodo: '1420' }, { value: '90', periodo: '2002' }],
  });
  const todas = [...Array(24).keys()];
  const horariaLarga = [{ prediccion: { dia: [h(21, todas), h(22, todas)] } }];
  // 12:30 en Madrid: desde las 12 de hoy hasta las 11 de mañana.
  const p = desdeAemet(diaria, horariaLarga, { ahora: Date.parse('2026-10-21T10:30:00Z') });
  assert.equal(p.horas.length, 24);
  assert.deepEqual(p.horas[0], { fecha: '2026-10-21', hora: 12, temp: 12, cielo: 'poco', noche: false, lluvia: 10 });
  assert.deepEqual(p.horas.at(-1), { fecha: '2026-10-22', hora: 11, temp: 11, cielo: 'poco', noche: false, lluvia: 10 });
  assert.deepEqual(p.horas.map(x => x.lluvia).slice(8, 15), [90, 90, 90, 90, 90, 90, 0]);   // 20–01 y las 2
  assert.equal(p.horas[8].noche, true);
  assert.deepEqual(desdeAemet(diaria, null).horas, []);
});

test('Open-Meteo: mismo formato, con la zona del lugar', () => {
  const j = {
    timezone: 'America/Argentina/Buenos_Aires',
    current: { temperature_2m: 13.8, weather_code: 1, is_day: 1 },
    daily: {
      time: ['2026-10-20', '2026-10-21', '2026-10-22'],
      weather_code: [3, 61, 0], temperature_2m_max: [18.4, 19.2, 20.6], temperature_2m_min: [12, 14.4, 13.5],
      precipitation_probability_max: [10, 60, 0],
      sunrise: ['2026-10-20T06:04', '2026-10-21T06:03', '2026-10-22T06:02'],
      sunset: ['2026-10-20T19:12', '2026-10-21T19:13', '2026-10-22T19:14'],
    },
    hourly: {
      time: ['2026-10-21T11:00', '2026-10-21T12:00', '2026-10-21T13:00'],
      temperature_2m: [15.2, 16.6, null], weather_code: [1, 61, 0], precipitation_probability: [5, 70, 0], is_day: [1, 1, 1],
    },
  };
  const lugar = { nombre: 'Buenos Aires', region: 'CABA', pais: 'Argentina' };
  const p = desdeOpenMeteo(j, lugar, { ahora: Date.parse('2026-10-21T15:00:00Z') });
  assert.equal(p.fuente, 'open-meteo');
  assert.deepEqual(p.lugar, lugar);
  assert.deepEqual(p.ahora, { temp: 14, cielo: 'poco', noche: false });
  assert.deepEqual(p.dias[0], { fecha: '2026-10-21', max: 19, min: 14, cielo: 'lluvia', lluvia: 60 });
  assert.deepEqual(p.sol, { orto: '06:03', ocaso: '19:13' });
  // Las 15:00 UTC son las 12 en Buenos Aires: desde esa hora, sin las vacías.
  assert.deepEqual(p.horas, [{ fecha: '2026-10-21', hora: 12, temp: 17, cielo: 'lluvia', noche: false, lluvia: 70 }]);
});

test('el municipio más cercano, para usar AEMET con un lugar geocodificado', () => {
  assert.equal(municipioCercano(42.4, -8.807), '36051');      // «Sangenjo» → Sanxenxo
  assert.equal(municipioCercano(43.0, -12.0), null);          // en el mar
});
