import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compilarRegla, normalizarRegla } from '../../shared/busqueda/reglas.js';

const modo = () => ({ regla: { v: 1, fuentes: 'elegidas' }, grupos: ['Economía'],
  palabras: ['vivienda', 'alquiler -turistico'],
  overrides: { 'general.es': 'include', 'rapido.es': 'first', 'silencio.es': 'ignore' } });
const noticia = (dominio = 'economico.es', titular = 'Nueva vivienda', grupo = 'Economía') => ({ dominio, titular, grupo });

test('los modos anteriores no se convierten en selecciones por accidente', () => {
  assert.equal(compilarRegla({ grupos: ['Economía'], palabras: ['vivienda'] }), null);
  assert.equal(normalizarRegla({ v: 2, fuentes: 'elegidas' }), null);
  assert.equal(normalizarRegla({ v: 1, fuentes: 'desconocidas' }), null);
  assert.deepEqual(normalizarRegla({ v: 1, fuentes: 'todas', noticias: ['no viajan'] }), { v: 1, fuentes: 'todas' });
});

test('fuentes y temas se cruzan; ni incluir ni destacar un medio permite saltarse las palabras', () => {
  const r = compilarRegla(modo());
  assert.equal(r.pasa(noticia()), true);
  assert.equal(r.pasa(noticia('otro.es', 'Nueva vivienda', 'Deportes')), false);
  assert.equal(r.pasa(noticia('economico.es', 'Sube la bolsa')), false);
  assert.equal(r.pasa(noticia('general.es', 'Nueva vivienda', 'Nacional')), true);
  assert.equal(r.pasa(noticia('general.es', 'Sube la bolsa', 'Nacional')), false);
  assert.equal(r.pasa(noticia('rapido.es', 'Sube la bolsa', 'Nacional')), false);
  assert.equal(r.pasa(noticia('rapido.es', 'Nueva vivienda', 'Nacional')), true);
});

test('los silencios ganan al grupo y se aplican también al buscar en todas las fuentes', () => {
  const m = modo();
  assert.equal(compilarRegla(m).pasa(noticia('silencio.es')), false);
  m.regla.fuentes = 'todas';
  const r = compilarRegla(m);
  assert.equal(r.pasa(noticia('otro.es', 'Nueva vivienda', 'Deportes')), true);
  assert.equal(r.pasa(noticia('silencio.es')), false);
  assert.equal(r.pasa(noticia('otro.es', 'Sube la bolsa', 'Deportes')), false);
});

test('sin temas se siguen las fuentes; sin fuentes elegidas no se amplía a todos los medios', () => {
  const m = { regla: { v: 1, fuentes: 'elegidas' }, grupos: [], palabras: [], overrides: {} };
  assert.equal(compilarRegla(m).pasa(noticia()), false);
  m.grupos = ['Economía'];
  assert.equal(compilarRegla(m).pasa(noticia('economico.es', 'Sube la bolsa')), true);
  assert.equal(compilarRegla(m).pasa(noticia('otro.es', 'Sube la bolsa', 'Nacional')), false);
});

test('los temas conservan alternativas entre líneas, exclusiones, frases y siglas cortas', () => {
  const m = { ...modo(), palabras: ['"vivienda publica"', 'alquiler -turistico', 'IA'] };
  const r = compilarRegla(m);
  assert.deepEqual(r.temasDe(noticia('economico.es', 'La vivienda pública llega al barrio')), ['"vivienda publica"']);
  assert.equal(r.pasa(noticia('economico.es', 'El alquiler turístico crece')), false);
  assert.equal(r.pasa(noticia('economico.es', 'La IA reduce el precio del alquiler')), true);
  assert.equal(r.pasa(noticia('economico.es', 'Iago visita una vivienda')), false);
  assert.deepEqual(r.temasDe(noticia('otro.es', 'La IA llega', 'Deportes')), []);
});
