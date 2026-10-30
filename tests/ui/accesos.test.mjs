import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeQuery } from '../../shared/parser.js';
import { leerConsultaCalendario } from '../../shared/calendario/consulta.js';
import { ESPN } from '../../shared/consultas/registro.js';
import { traducir } from '../../front/idiomas/index.js';

const codigo = readFileSync(new URL('../../front/app/14-accesos.js', import.meta.url), 'utf8');
const CAL_DEPORTES = { futbol: ['primera', 'segunda'], baloncesto: ['nba', 'wnba'], motor: ['f1', 'motogp'], tenis: ['atp', 'wta'] };
const NOMBRES = { f1: 'F1', motogp: 'MotoGP', primera: 'Primera', segunda: 'Segunda', nba: 'NBA', wnba: 'WNBA', atp: 'ATP', wta: 'WTA' };

function escenario({ sigo = [], buscar = '' } = {}){
  const el = () => ({ innerHTML: '', hidden: true, atributos: {}, setAttribute(k, v){ this.atributos[k] = v; },
    focus(){}, querySelector: () => null, addEventListener(){} });
  const ids = { 'accesos-panel': el(), 'buscar-accesos': el(), buscar: { value: buscar } };
  const escritas = [];
  const c = {
    $: sel => ids[sel.slice(1)], t: (k, v) => traducir('es', k, v), tokenizeQuery, leerConsultaCalendario,
    calEsc: s => String(s), calNombreCompeticion: x => NOMBRES[x] || x,
    calPreferencias: () => ({ competiciones: sigo }), CAL_DEPORTES, CAL_COMPETICIONES: Object.values(CAL_DEPORTES).flat(),
    codigoDeporte: (tipo, x) => Object.hasOwn(ESPN, x) && !(tipo === 'resultados' && x === 'f1'),
    calPedir: async () => ({ disponibilidad: { circuitos: {} } }),
    partirConsulta: raw => ({ antes: raw, consulta: '' }), cerrarSugerencias(){},
    escribirBusqueda: v => escritas.push(v), document: { addEventListener(){} },
  };
  runInNewContext(codigo, c);
  return { c, ids, escritas, html: () => ids['accesos-panel'].innerHTML,
    run: expr => runInNewContext(expr, c), pantalla: p => { runInNewContext(`ACCESOS.pantalla = ${JSON.stringify(p)}; pintarAccesos()`, c); } };
}

test('sin nada seguido: horarios de F1, Primera y NBA, fútbol junto, resultados y competiciones', () => {
  const s = escenario();
  s.run('pintarAccesos()');
  const ordenes = [...s.html().matchAll(/data-orden="([^"]+)">([^<]+)</g)].map(m => [m[1], m[2]]);
  assert.deepEqual(ordenes, [['calendario:f1', 'F1 · horarios'], ['calendario:primera', 'Primera · horarios'],
    ['calendario:nba', 'NBA · horarios'], ['calendario:primera,segunda', 'Fútbol · horarios']]);
  assert.match(s.html(), /data-pantalla="resultados">Resultados…[\s\S]*data-pantalla="competiciones">Competiciones y más…/);
  assert.doesNotMatch(s.html(), /Las que sigo/);
});

test('lo seguido va primero y «Las que sigo» las junta; lo que no tiene datos no se ofrece', () => {
  const s = escenario({ sigo: ['motogp', 'atp', 'wnba'] });
  s.run('ACCESOS.disp = { motogp: 24, atp: 4, wnba: 0, f1: 5, primera: 20, segunda: 33, nba: 106 }; pintarAccesos()');
  const ordenes = [...s.html().matchAll(/data-orden="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(ordenes, ['calendario:motogp,atp', 'calendario:motogp', 'calendario:atp', 'calendario:f1', 'calendario:primera', 'calendario:primera,segunda']);
});

test('una competición enseña solo lo que admite: F1 sin resultados; ATP solo horarios', () => {
  const s = escenario();
  s.pantalla('c:f1');
  assert.deepEqual([...s.html().matchAll(/data-orden="([^"]+)"/g)].map(m => m[1]), ['calendario:f1', 'clasificacion:f1']);
  s.pantalla('c:atp');
  assert.deepEqual([...s.html().matchAll(/data-orden="([^"]+)"/g)].map(m => m[1]), ['calendario:atp']);
  assert.match(s.html(), /data-volver="competiciones"/);
  s.pantalla('resultados');
  assert.deepEqual([...s.html().matchAll(/data-orden="([^"]+)"/g)].map(m => m[1]), ['resultados:primera', 'resultados:segunda', 'resultados:nba', 'resultados:wnba']);
});

test('un acceso escribe su orden en la barra y sustituye la de agenda anterior; el resto se queda', () => {
  const s = escenario({ buscar: 'medio:elpais teatro: alonso' });
  s.run("ACCESOS.abierto = true; escribirAcceso('calendario:f1')");
  assert.deepEqual(s.escritas, ['medio:elpais alonso calendario:f1']);
  assert.equal(s.ids['accesos-panel'].hidden, true);
});
