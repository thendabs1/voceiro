import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearDeduplicador, urlCanonica } from '../../shared/busqueda/identidad.js';
import { comparador } from '../../shared/busqueda/orden.js';
import { unirVentanas, pasaVentana } from '../../shared/busqueda/tiempo.js';

const noticia = (url, titular = 'El Gobierno presenta los presupuestos') => ({
  url, dominio: 'telecinco.es', titular,
});

test('identidad: el mismo medio y titular unen URL distintas y registran el nuevo enlace', () => {
  const d = crearDeduplicador(), original = { id: 'primera' };
  assert.equal(d.añadir(original, noticia('https://www.telecinco.es/noticias/presupuestos.html')), null);
  assert.equal(d.añadir({}, noticia('https://telecinco.es/politica/presupuestos.html')), original);
  assert.equal(d.añadir({}, noticia('https://telecinco.es/politica/presupuestos.html', 'Titular actualizado')), original);
});

test('identidad: un redirector no une dos noticias distintas y un subdominio conserva su identidad', () => {
  const d = crearDeduplicador();
  const url = 'https://news.google.com/rss/articles/CBMi';
  assert.equal(d.añadir({}, { url, dominio: 'cambio16.com', titular: 'Presupuesto municipal' }), null);
  assert.equal(d.añadir({}, { url, dominio: 'telecinco.es', titular: 'Nuevo calendario escolar' }), null);
  assert.notEqual(urlCanonica('https://chile.as.com/futbol/noticia'), urlCanonica('https://as.com/futbol/noticia'));
  assert.notEqual(urlCanonica('https://as.com/noticia?id=1'), urlCanonica('https://as.com/noticia?id=2'));
});

test('orden por relevancia: menor rango primero; empates y rangos ausentes usan la fecha', () => {
  const items = [{ titular: 'sin rango viejo', ts: 1 },
    { titular: 'tercero', ts: 30, rango: 3 }, { titular: 'segundo', ts: 2, rango: 0 },
    { titular: 'sin rango reciente', ts: 40, rango: NaN }, { titular: 'primero', ts: 4, rango: 0 }];
  assert.deepEqual(items.sort(comparador('relevancia')).map(n => n.titular),
    ['primero', 'segundo', 'tercero', 'sin rango reciente', 'sin rango viejo']);
});

test('desempates de fecha por dominio y titular, independientemente del orden de llegada', () => {
  const items = [{ dominio: 'marca.com', titular: 'A', ts: 1 },
    { dominio: 'as.com', titular: 'B', ts: 1 }, { dominio: 'as.com', titular: 'A', ts: 1 }];
  for (const orden of ['recientes', 'antiguos', 'relevancia']) {
    for (const entrada of [items, [...items].reverse()]) {
      assert.deepEqual([...entrada].sort(comparador(orden)).map(n => `${n.dominio}:${n.titular}`),
        ['as.com:A', 'as.com:B', 'marca.com:A']);
    }
  }
});

test('la intersección temporal elige ambos límites más restrictivos sin depender del orden', () => {
  const a = { desde: { ms: 10 }, hasta: { ms: 40 } };
  const b = { desde: { ms: 20 }, hasta: { ms: 50 } };
  for (const ventana of [unirVentanas(a, b), unirVentanas(b, a)]) {
    assert.deepEqual(ventana, { desde: { ms: 20 }, hasta: { ms: 40 } });
    for (const ts of [20, 30, 40]) assert.equal(pasaVentana(ts, ventana), true);
    for (const ts of [19, 41, NaN]) assert.equal(pasaVentana(ts, ventana), false);
  }
  assert.deepEqual(a, { desde: { ms: 10 }, hasta: { ms: 40 } });
});

test('intersecciones abiertas y vacías no amplían el rango elegido', () => {
  const desde = { desde: { ms: 30 }, hasta: null };
  const hasta = { desde: null, hasta: { ms: 20 } };
  assert.deepEqual(unirVentanas(null, desde), desde);
  assert.deepEqual(unirVentanas(desde, null), desde);
  assert.deepEqual(unirVentanas(null, null), { desde: null, hasta: null });
  for (const ts of [19, 20, 25, 30, 31, NaN]) {
    assert.equal(pasaVentana(ts, unirVentanas(desde, hasta)), false);
  }
});
