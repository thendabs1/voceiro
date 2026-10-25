import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearCatalogo } from '../../shared/territorios/codigos.js';
import { provinciaDe } from '../../shared/tiempo/lugares.js';

const leer = ruta => JSON.parse(readFileSync(new URL(ruta, import.meta.url), 'utf8'));
const municipios = leer('../../shared/territorios/municipios.json');
const catalogo = crearCatalogo(municipios);

test('INE, códigos editoriales y jerarquías usan los mismos casos que Python', () => {
  for (const caso of leer('./casos.json')) {
    const dato = catalogo.resolver(caso.sistema, caso.codigo);
    assert.equal(dato?.id ?? null, caso.id, JSON.stringify(caso));
    if (dato) assert.deepEqual(dato.ancestros, caso.ancestros);
  }
  assert.equal(provinciaDe('01001'), 'Araba/Álava');
  assert.equal(provinciaDe('36038'), 'Pontevedra');
});

test('la respuesta no permite alterar relaciones de consultas posteriores', () => {
  const dato = catalogo.resolver('ine:municipio', '36038');
  dato.ancestros.length = 0;
  dato.nombre = 'Alterado';
  assert.equal(catalogo.resolver('ine:municipio', '36038').ancestros.length, 3);
  assert.equal(catalogo.resolver('ine:municipio', '36038').nombre, 'Pontevedra');
});
