// node --test 'tests/**/*.test.mjs'
// Casos 11-21 de la especificación: filtros por medio, grupo, tipo, tag, lang.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery } from '../../shared/parser.js';
import { resolverMedios, pasaMedios } from '../../shared/busqueda/filtros.js';

// Nombres reales de medios.py (_derivar_grupo, REGION_DISPLAY, COUNTRY_DISPLAY).
const CATALOGO = {
  'elpais.com':           { n: 'El País', g: 'Nacional', t: 'diario', l: 'es', tags: ['generalista', 'nacional'] },
  'elmundo.es':           { n: 'El Mundo', g: 'Nacional', t: 'diario', l: 'es', tags: ['generalista'] },
  'eldiario.es':          { n: 'elDiario.es', g: 'Nacional', t: 'digital', l: 'es', tags: [] },
  'lavozdegalicia.es':    { n: 'La Voz de Galicia', g: 'Regional · Galicia', t: 'diario', l: 'es', tags: ['galicia'] },
  'nos.gal':              { n: 'Nós Diario', g: 'Regional · Galicia', t: 'diario', l: 'gl', tags: ['galicia'] },
  'praza.gal':            { n: 'Praza', g: 'Regional · Galicia', t: 'digital', l: 'gl', tags: ['galicia'] },
  'laopinioncoruna.es':   { n: 'La Opinión A Coruña', g: 'Regional · Galicia', t: 'diario', l: 'es', tags: ['galicia', 'coruña'] },
  'lne.es':               { n: 'La Nueva España', g: 'Regional · Asturias', t: 'diario', l: 'es', tags: ['asturias'] },
  'levante-emv.com':      { n: 'Levante-EMV', g: 'Regional · Comunidad Valenciana', t: 'diario', l: 'es', tags: ['valencia'] },
  'lemonde.fr':           { n: 'Le Monde', g: 'Internacional · Francia', t: 'diario', l: 'fr', tags: ['oriente medio'] },
  'clarin.com':           { n: 'Clarín', g: 'Internacional · Argentina', t: 'diario', l: 'es', tags: [] },
  'marca.com':            { n: 'Marca', g: 'Deportes', t: 'diario', l: 'es', tags: ['deportes'] },
};

const dominios = q => {
  const r = resolverMedios(parseQuery(q), CATALOGO);
  return r.dominios === null ? null : [...r.dominios].sort();
};

test('sin filtros de medio → null (no filtra)', () => {
  assert.equal(dominios('sanchez'), null);
});

test('11 · medio:elpais → solo El País', () => {
  assert.deepEqual(dominios('medio:elpais elecciones'), ['elpais.com']);
  assert.deepEqual(dominios('medio:"la voz"'), ['lavozdegalicia.es']);
});

test('12-13 · web: exacto o subdominio, nunca por trozos', () => {
  assert.deepEqual(dominios('web:elpais.com'), ['elpais.com']);
  const r = resolverMedios(parseQuery('web:elpais.com'), CATALOGO);
  assert.ok(pasaMedios('cincodias.elpais.com', r));
  assert.ok(!pasaMedios('otroelpais.com', r));
  assert.deepEqual(dominios('web:pais.com'), ['pais.com']);   // no captura elpais.com
});

test('14 · grupo:galicia → Regional · Galicia', () => {
  assert.deepEqual(dominios('grupo:galicia'),
    ['laopinioncoruna.es', 'lavozdegalicia.es', 'nos.gal', 'praza.gal']);
});

test('15 · grupo:nacional no casa con Internacional · …', () => {
  assert.deepEqual(dominios('grupo:nacional'), ['eldiario.es', 'elmundo.es', 'elpais.com']);
});

test('16 · grupo:valencia → Comunidad Valenciana', () => {
  assert.deepEqual(dominios('grupo:valencia'), ['levante-emv.com']);
});

test('17 · mismo filtro = OR', () => {
  assert.deepEqual(dominios('grupo:galicia grupo:asturias'),
    ['laopinioncoruna.es', 'lavozdegalicia.es', 'lne.es', 'nos.gal', 'praza.gal']);
});

test('18 · filtros distintos = AND', () => {
  assert.deepEqual(dominios('grupo:galicia tipo:diario'),
    ['laopinioncoruna.es', 'lavozdegalicia.es', 'nos.gal']);
});

test('19 · tag:coruña con ñ, y tags de varias palabras', () => {
  assert.deepEqual(dominios('tag:coruña'), ['laopinioncoruna.es']);
  assert.deepEqual(dominios('tag:"oriente medio"'), ['lemonde.fr']);
});

test('20 · lang:gl → idioma principal gallego', () => {
  assert.deepEqual(dominios('lang:gl'), ['nos.gal', 'praza.gal']);
});

test('21 · medio desconocido → 0 resultados y aviso', () => {
  const r = resolverMedios(parseQuery('medio:noexiste'), CATALOGO);
  assert.deepEqual([...r.dominios], []);
  assert.deepEqual(r.desconocidos, [{ tipo: 'medio', valor: 'noexiste' }]);
  assert.ok(!pasaMedios('elpais.com', r));
});
