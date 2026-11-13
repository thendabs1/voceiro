import test from 'node:test';
import assert from 'node:assert/strict';
import { AMBITOS, leerConsultaCalendario, seleccionCalendario } from '../../shared/calendario/consulta.js';

test('Liga F admite agenda y circuito con su nombre propio', () => {
  assert.equal(AMBITOS['liga-f'].nombre, 'Liga F');
  assert.deepEqual(leerConsultaCalendario('liga-f:agenda').ambitos, ['liga-f']);
  assert.deepEqual(leerConsultaCalendario('circuito:liga-f').circuitos, ['liga-f']);
  assert.deepEqual(leerConsultaCalendario('liga-f:noticias').desconocidos, ['liga-f:noticias']);
  assert.equal(leerConsultaCalendario('resultados:liga-f'), null);
});

test('el calendario selecciona Liga F por código sin mezclarla con Primera', () => {
  const entidades = Object.fromEntries(['liga-f', 'primera'].map(c => [`agrupacion:${c}`, { tipo: 'agrupacion', codigos: [c] }]));
  const eventos = ['liga-f', 'primera'].map(c => ({ id: c, objetivos: [`agrupacion:${c}`], fuentes: [{ fuente: 'espn-futbol' }] }));
  const seleccion = seleccionCalendario({ catalogo: { conceptos: {} }, entidades, eventos, clasificaciones: [] }, leerConsultaCalendario('liga-f:agenda'));
  assert.deepEqual(seleccion.eventos.map(e => e.id), ['liga-f']);
});
