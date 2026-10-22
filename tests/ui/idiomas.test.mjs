import { test } from 'node:test';
import assert from 'node:assert/strict';
import { I18N, traducir } from '../../front/idiomas/index.js';

test('la traducción conserva el respaldo al castellano y a la propia clave', () => {
  assert.equal(traducir('gl', 'contadorFueraModo', { n: 4 }), ' · 4 fuera del modo');
  assert.equal(traducir('desconocido', 'fechaAhora'), I18N.es.fechaAhora);
  assert.equal(traducir('es', 'claveInexistente'), 'claveInexistente');
});

test('las traducciones conservan las variables del texto castellano', () => {
  const variables = texto => [...texto.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
  for (const [idioma, textos] of Object.entries(I18N)){
    for (const [clave, texto] of Object.entries(textos)){
      assert.ok(clave in I18N.es, `${idioma}: clave desconocida ${clave}`);
      assert.deepEqual(variables(texto), variables(I18N.es[clave]), `${idioma}: ${clave}`);
    }
  }
});

test('cada llamada usa su idioma y sustituye las variables sin modificar los diccionarios', () => {
  for (const idioma of Object.keys(I18N)){
    const plantilla = I18N[idioma].fechaHaceMin;
    assert.equal(traducir(idioma, 'fechaHaceMin', { n: 7 }), plantilla.replace('{n}', '7'));
    assert.equal(I18N[idioma].fechaHaceMin, plantilla);
  }
});
