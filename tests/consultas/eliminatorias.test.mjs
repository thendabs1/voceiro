import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resultados, clasificacion } from '../../workers/deno-buscar/src/consultas/normalizar.js';
import { normalizarPartido } from '../../workers/deno-buscar/src/consultas/partido.js';
import { ESPN } from '../../shared/consultas/registro.js';

const muestra = n => JSON.parse(readFileSync(new URL(`./muestras/${n}.json`, import.meta.url)));
const ficha = (d, codigo) => normalizarPartido(d, codigo, ...ESPN[codigo], d.header.id);

test('Copa temprana: partido normal, prórroga y penaltis sin leg ni series', () => {
  const d = muestra('espn-resultados-copa-del-rey');
  const partidos = resultados(d, 'copa-del-rey').partidos;
  assert.equal(partidos.length, 3);
  assert.ok(partidos.every(p => p.estado === 'final' && p.eliminatoria.ida_vuelta === null && p.eliminatoria.global === null));
  assert.equal(partidos[0].eliminatoria.resolucion, null);
  assert.equal(partidos[1].eliminatoria.resolucion, 'prorroga');
  assert.equal(partidos[2].eliminatoria.resolucion, 'penaltis');
  assert.deepEqual(partidos[2].marcador, { local: '3', visitante: '3' });
  assert.deepEqual(partidos[2].eliminatoria.penaltis, { local: '4', visitante: '2' });
  assert.equal(partidos[2].eliminatoria.ganador, 'local');
  assert.deepEqual(ficha(muestra('espn-partido-copa-del-rey'), 'copa-del-rey').eliminatoria, partidos[2].eliminatoria);
  assert.ok(!JSON.stringify(partidos).includes('penalties'));
});

test('Champions: scoreboard con serie objeto y summary con serie lista dan el mismo global y clasificado', () => {
  const p = resultados(muestra('espn-resultados-champions'), 'champions').partidos[0];
  const f = ficha(muestra('espn-partido-champions'), 'champions');
  assert.deepEqual(f.eliminatoria, p.eliminatoria);
  assert.deepEqual(p.eliminatoria.global, { local: '5', visitante: '6' });
  assert.equal(p.eliminatoria.ida_vuelta, 'vuelta');
  assert.equal(p.eliminatoria.clasificado, 'visitante');
  assert.equal(p.eliminatoria.ganador, null);
  assert.deepEqual(p.marcador, { local: '1', visitante: '1' });
});

test('ganar la vuelta 2–0 no cambia el global 2–3 ni quién pasa; lados por ID, no por orden', () => {
  const s = muestra('espn-partido-champions');
  const c = s.header.competitions[0];
  c.competitors.find(p => p.homeAway === 'home').score = '2';
  c.competitors.find(p => p.homeAway === 'home').winner = true;
  c.competitors.find(p => p.homeAway === 'away').score = '0';
  c.competitors.find(p => p.homeAway === 'away').winner = false;
  c.series[0].competitors[0].aggregateScore = 2;
  c.series[0].competitors[1].aggregateScore = 3;
  c.competitors.reverse(); c.series[0].competitors.reverse();
  c.notes = [{ headline: 'Bayern Munich advance 99-0 on aggregate' }];
  const f = ficha(s, 'champions');
  assert.deepEqual(f.marcador, { local: '2', visitante: '0' });
  assert.deepEqual(f.eliminatoria.global, { local: '2', visitante: '3' });
  assert.equal(f.eliminatoria.clasificado, 'visitante');
  assert.equal(f.eliminatoria.ganador, null);
  const b = { events: [{ id: s.header.id, competitions: [{ ...c, series: c.series[0] }] }] };
  assert.deepEqual(resultados(b, 'champions').partidos[0].eliminatoria, f.eliminatoria);
});

test('la ida y una vuelta en juego no anuncian clasificado ni ganador de la eliminatoria', () => {
  for (const jugar of [false, true]) {
    const d = muestra('espn-partido-champions'), c = d.header.competitions[0];
    c.leg.value = jugar ? 2 : 1;
    // Una consulta histórica de la ida puede traer la serie ya completada.
    c.series[0].completed = !jugar;
    if (jugar) c.status.type = { name: 'STATUS_IN_PROGRESS', state: 'in', completed: false };
    const e = ficha(d, 'champions').eliminatoria;
    assert.equal(e.ida_vuelta, jugar ? 'vuelta' : 'ida');
    assert.equal(e.clasificado, null); assert.equal(e.ganador, null);
  }
});

test('no inventa un clasificado ni tanteos cuando faltan campos, aunque haya notas', () => {
  const d = muestra('espn-partido-champions'), c = d.header.competitions[0];
  delete c.series[0].competitors[0].aggregateScore;
  delete c.series[0].competitors[1].winner;
  const e = ficha(d, 'champions').eliminatoria;
  assert.deepEqual(e.global, { local: null, visitante: '6' });
  assert.equal(e.clasificado, null);
  const copa = muestra('espn-partido-copa-del-rey');
  for (const p of copa.header.competitions[0].competitors) { delete p.shootoutScore; delete p.winner; }
  const penal = ficha(copa, 'copa-del-rey').eliminatoria;
  assert.equal(penal.penaltis, null); assert.equal(penal.ganador, null);
  assert.equal(penal.resolucion, 'penaltis');
});

test('la final de Champions conserva empate y tanda; no se presenta como ida/vuelta', () => {
  const p = resultados(muestra('espn-final-champions'), 'champions').partidos[0];
  assert.deepEqual(p.marcador, { local: '1', visitante: '1' });
  assert.deepEqual(p.eliminatoria.penaltis, { local: '4', visitante: '3' });
  assert.equal(p.eliminatoria.ganador, 'local');
  assert.equal(p.eliminatoria.ida_vuelta, null);
});

test('plazas sin team y dos centinelas iguales conservan parrilla y summary sin mezclar estadísticas', () => {
  const d = muestra('espn-partido-champions'), c = d.header.competitions[0];
  c.status.type = { name: 'STATUS_SCHEDULED', state: 'pre', completed: false };
  delete c.series; delete c.leg;
  for (const p of c.competitors) { p.id = '-1'; delete p.team; }
  d.boxscore.teams.push({ team: { id: '-1' }, statistics: [{ name: 'totalShots', displayValue: '99' }] });
  d.keyEvents.push({ team: { id: '-1' }, type: { type: 'goal' } });
  const partidos = resultados({ events: [{ id: d.header.id, competitions: [c] }, ...muestra('espn-resultados-champions').events] }, 'champions').partidos;
  assert.equal(partidos.length, 2);
  assert.equal(partidos[0].local, null); assert.equal(partidos[0].visitante, null);
  assert.ok(partidos[1].local);
  const f = ficha(d, 'champions');
  assert.equal(f.estado, 'programado'); assert.equal(f.marcador, null);
  assert.equal(f.local, null); assert.equal(f.visitante, null);
  assert.deepEqual(f.estadisticas, []); assert.deepEqual(f.incidencias, []);
  assert.equal(f.eliminatoria.clasificado, null);
  c.competitors[0].team = { displayName: 'TBD' };
  assert.equal(ficha(d, 'champions').local, null);
  c.status.type = { name: 'STATUS_POSTPONED', state: 'pre', completed: false };
  assert.equal(ficha(d, 'champions').estado, 'aplazado');
  // La excepción de las plazas pendientes no acepta dos equipos reales iguales.
  for (const p of c.competitors) p.id = '160';
  assert.throws(() => ficha(d, 'champions'), /identidad o lados/);
});

test('Champions: tabla de fase liga con 36 posiciones y diferencia de goles; sin cuadro', () => {
  const f = clasificacion(muestra('espn-clasificacion-champions'), 'champions', 'soccer');
  assert.equal(f.grupos.length, 1);
  assert.equal(f.grupos[0].filas.length, 36);
  assert.deepEqual(f.grupos[0].filas[0], { pos: 1, equipo: 'Paris Saint-Germain', pj: 4, g: 4, e: 0, p: 0, pts: 12, dg: 15 });
  assert.deepEqual(f.grupos[0].filas.map(f => f.pos), Array.from({ length: 36 }, (_, i) => i + 1));
  assert.ok(f.grupos[0].filas.some(f => f.dg < 0));
  assert.equal('cuadro' in f, false);
});


test('en la ida el global no repite el marcador', () => {
  const d = muestra('espn-partido-champions');
  const c = d.header.competitions[0];
  c.leg = { value: 1 };
  c.series = [{ completed: false, competitors: c.competitors.map(p => ({ id: p.id, aggregateScore: 1 })) }];
  const e = ficha(d, 'champions').eliminatoria;
  assert.equal(e.ida_vuelta, 'ida');
  assert.equal(e.global, null);
});
