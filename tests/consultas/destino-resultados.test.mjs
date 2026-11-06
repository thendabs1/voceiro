import test from 'node:test';
import assert from 'node:assert/strict';
import { destinoResultados } from '../../shared/consultas/registro.js';

const tarjeta = (competiciones, instante = null) =>
  ({ competiciones, programacion: { valor: { cuando: { inicio: { instante } } } } });

test('la tarjeta abre el panel de su competición en el día que se mira', () => {
  assert.deepEqual(destinoResultados(tarjeta(['primera'], '2026-11-02T20:00:00+00:00'), '2026-11-02'),
    { id: 'espn:resultados/primera', codigo: 'primera', fecha: '2026-11-02' });
  assert.deepEqual(destinoResultados(tarjeta(['atp']), '2026-11-05'), { id: 'espn:resultados/atp', codigo: 'atp', fecha: '2026-11-05' });
  assert.deepEqual(destinoResultados(tarjeta(['liga-f']), '2026-11-07'), { id: 'espn:resultados/liga-f', codigo: 'liga-f', fecha: '2026-11-07' });
});

test('motor usa su proveedor de resultados y no el de clasificación', () => {
  assert.equal(destinoResultados(tarjeta(['f1']), '2026-10-30').id, 'openf1:resultados/f1');
  assert.equal(destinoResultados(tarjeta(['motogp']), '2026-10-30').id, 'motogp:resultados/motogp');
});

test('NBA y WNBA piden el día de EE. UU.: casos reales del 3/11 y el 1/11 en Madrid', () => {
  assert.deepEqual(destinoResultados(tarjeta(['nba'], '2026-11-03T00:30:00+00:00'), '2026-11-03'),
    { id: 'espn:resultados/nba', codigo: 'nba', fecha: '2026-11-02' });
  assert.equal(destinoResultados(tarjeta(['wnba'], '2026-11-01T01:00:00+00:00'), '2026-11-01').fecha, '2026-10-31');
  // Tarde en EE. UU., misma fecha; sin instante se queda el día mirado.
  assert.equal(destinoResultados(tarjeta(['nba'], '2026-11-03T22:00:00+00:00'), '2026-11-03').fecha, '2026-11-03');
  assert.equal(destinoResultados(tarjeta(['nba']), '2026-11-03').fecha, '2026-11-03');
});

test('sin competición con resultados no hay enlace', () => {
  assert.equal(destinoResultados(tarjeta(['atletismo-rfea']), '2026-11-03'), null);
  assert.equal(destinoResultados(tarjeta(['feb-endesa', 'wrc']), '2026-11-03'), null);
  assert.equal(destinoResultados({}, '2026-11-03'), null);
});
