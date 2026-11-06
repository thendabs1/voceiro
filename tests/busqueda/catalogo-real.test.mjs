import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogoReal } from '../soporte/catalogo-real.mjs';
import { parseQuery } from '../../shared/parser.js';
import { resolverMedios, pasaMedios } from '../../shared/busqueda/filtros.js';
import { interpretarConsulta, paraPrensa } from '../../shared/busqueda/consulta.js';

const catalogo = await catalogoReal();
const resolver = q => resolverMedios(parseQuery(q), catalogo);
const dominios = q => [...resolver(q).dominios].sort();
const FUTBOL = ['as.com', 'marca.com', 'mundodeportivo.com', 'sport.es'];

test('catálogo real: tag:futbol selecciona cuatro medios mixtos y deja pasar titulares de otros deportes', () => {
  assert.deepEqual(dominios('tag:fútbol'), FUTBOL);
  assert.deepEqual(dominios('tag:fut'), FUTBOL);
  const consulta = interpretarConsulta('tag:futbol', { catalogo });
  // El tag describe al medio: no promete que la noticia trate de fútbol.
  assert.equal(consulta.pasa({ dominio: 'as.com', titular: 'Carlos Alcaraz gana el torneo de tenis', ts: NaN }), true);
  assert.equal(consulta.pasa({ dominio: 'relevo.com', titular: 'La selección de fútbol gana', ts: NaN }), false);
  assert.equal(interpretarConsulta('futbol tag:futbol', { catalogo }).pasa({
    dominio: 'as.com', titular: 'Carlos Alcaraz gana el torneo de tenis', ts: NaN,
  }), false);
  // Más de tres medios: la prensa busca amplio y el filtro de vuelta debe seguir activo.
  assert.equal(paraPrensa(consulta), '');
  assert.equal(consulta.pasaExterno({ dominio: 'relevo.com', titular: 'Fútbol', ts: NaN }), false);
});

test('catálogo real: grupo:deportes incluye medios sin tag:futbol; nacional no coincide con internacional', () => {
  assert.deepEqual(dominios('grupo:deportes'), ['2playbook.com', 'as.com', 'dxtcampeon.com',
    'eldesmarque.com', 'estadiodeportivo.com', 'marca.com', 'mundodeportivo.com',
    'palco23.com', 'relevo.com', 'riazor.org', 'sport.es', 'superdeporte.es']);
  const nacional = resolver('grupo:nacional');
  assert.equal(pasaMedios('elpais.com', nacional), true);
  assert.equal(pasaMedios('elpais.com.uy', nacional), false);
  assert.equal(pasaMedios('bbc.com', nacional), false);
  assert.deepEqual(dominios('tag:futbol grupo:nacional'), []);
  const galicia = resolver('grupo:galicia');
  for (const d of ['nosdiario.gal', 'praza.gal', 'lavozdegalicia.es']) assert.equal(pasaMedios(d, galicia), true, d);
  for (const d of ['as.com', 'lne.es', 'elpais.com']) assert.equal(pasaMedios(d, galicia), false, d);
});

test('catálogo real: medio: admite prefijos y nombres, no es un dominio exacto', () => {
  assert.deepEqual(dominios('medio:as'), ['apnews.com', 'as.com', 'lavozdeasturias.es']);
  assert.deepEqual(dominios('medio:"el país"'), ['elpais.com', 'elpais.com.uy']);
  assert.deepEqual(dominios('medio:"mundo deportivo"'), ['mundodeportivo.com']);
  assert.deepEqual(dominios('web:as.com'), ['as.com']);
  assert.deepEqual(dominios('tag:futbol medio:marca'), ['marca.com']);
});

test('catálogo real: OR dentro de faceta, AND entre facetas y aviso si no se conoce el valor', () => {
  assert.deepEqual(dominios('tag:futbol medio:marca medio:sport'), ['marca.com', 'sport.es']);
  assert.deepEqual(dominios('medio:marca web:as.com'), ['as.com', 'marca.com']);
  for (const tipo of ['tag', 'grupo', 'medio']) {
    const resuelto = resolver(`${tipo}:sin-correspondencia-voceiro`);
    assert.deepEqual([...resuelto.dominios], []);
    assert.deepEqual(resuelto.desconocidos, [{ tipo, valor: 'sin-correspondencia-voceiro' }]);
    assert.equal(pasaMedios('as.com', resuelto), false);
  }
  const as = resolver('tag:futbol');
  assert.equal(pasaMedios('chile.as.com', as), true);
  assert.equal(pasaMedios('falsoas.com', as), false);
  assert.equal(pasaMedios('as.com.otro.es', as), false);
});
