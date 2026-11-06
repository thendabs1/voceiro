import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resultados } from '../../workers/deno-buscar/src/consultas/normalizar.js';
import { normalizarPartido } from '../../workers/deno-buscar/src/consultas/partido.js';
import { ESPN } from '../../shared/consultas/registro.js';

const muestra = n => JSON.parse(readFileSync(new URL(`./muestras/${n}.json`, import.meta.url)));
const ficha = (d, codigo) => normalizarPartido(d, codigo, ...ESPN[codigo], d.header.id);

test('Liga F usa el contrato ordinario de fútbol sin campos de eliminatoria', () => {
  const f = ficha(muestra('espn-partido-liga-f'), 'liga-f');
  assert.equal(f.estado, 'final'); assert.equal(f.local, 'Alavés'); assert.equal(f.visitante, 'Real Sociedad');
  assert.deepEqual(f.marcador, { local: '1', visitante: '1' });
  assert.ok(f.estadisticas.length); assert.equal('eliminatoria' in f, false);
  const p = resultados(muestra('espn-resultados-liga-f'), 'liga-f').partidos;
  assert.ok(p.some(p => p.id === f.id));
});
