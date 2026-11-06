import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeQuery } from '../../shared/parser.js';
import { leerConsultaCalendario, AMBITOS } from '../../shared/calendario/consulta.js';
import { PREFIJOS_CONSULTAS, admiteConsultaESPN, admiteConsultaMotor } from '../../shared/consultas/registro.js';
import { traducir } from '../../front/idiomas/index.js';

const leer = n => readFileSync(new URL(`../../front/app/${n}`, import.meta.url), 'utf8');
const codigo = leer('14-accesos.js') + '\n' + leer('14-deportes.js');
const CAL_DEPORTES = { futbol: ['primera', 'segunda'], baloncesto: ['nba', 'wnba'], motor: ['f1', 'motogp'], tenis: ['atp', 'wta'] };
const NOMBRES = { f1: 'F1', motogp: 'MotoGP', primera: 'LaLiga', segunda: 'Segunda', nba: 'NBA', wnba: 'WNBA', atp: 'ATP', wta: 'WTA' };

function escenario({ sigo = [], buscar = '' } = {}){
  const el = () => ({ innerHTML: '', hidden: true, atributos: {}, setAttribute(k, v){ this.atributos[k] = v; },
    focus(){}, querySelector: () => null, addEventListener(){} });
  const ids = { 'accesos-panel': el(), 'buscar-accesos': el(), buscar: { value: buscar } };
  const escritas = [];
  const c = {
    $: sel => ids[sel.slice(1)], t: (k, v) => traducir('es', k, v), tokenizeQuery, leerConsultaCalendario, AMBITOS, PREFIJOS_CONSULTAS,
    calEsc: s => String(s), escapeHtml: s => String(s), calNombreCompeticion: x => NOMBRES[x] || x, CONSULTA_DEPORTES: NOMBRES,
    calPreferencias: () => ({ competiciones: sigo }), CAL_DEPORTES: structuredClone(CAL_DEPORTES),
    CAL_NOMBRES_DEPORTE: { futbol: 'calFutbol', baloncesto: 'calBaloncesto', motor: 'calMotor', tenis: 'calTenis' },
    codigoDeporte: (tipo, x) => admiteConsultaESPN(tipo, x) || admiteConsultaMotor(tipo, x),
    calPedir: async () => ({ disponibilidad: { circuitos: {} } }),
    partirConsulta: raw => ({ antes: raw, consulta: '' }), cerrarSugerencias(){},
    PUNTUAL: {}, escribirBusqueda: v => escritas.push(v), document: { addEventListener(){} },
  };
  runInNewContext(codigo, c);
  return { c, ids, escritas, html: () => ids['accesos-panel'].innerHTML, run: expr => runInNewContext(expr, c) };
}
const ordenes = s => [...s.html().matchAll(/data-orden="([^"]*)"/g)].map(m => m[1]);

test('sin nada seguido: unas pocas competiciones y el camino a todos los deportes', () => {
  const s = escenario();
  s.run('pintarAccesos()');
  assert.deepEqual(ordenes(s), ['resultados:f1', 'calendario:f1', 'clasificacion:f1',
    'resultados:primera', 'calendario:primera', 'clasificacion:primera',
    'resultados:nba', 'calendario:nba', 'clasificacion:nba', 'deportes:']);
  assert.match(s.html(), /data-orden="deportes:">Todos los deportes ›/);
  assert.match(s.html(), /data-deportes>Calendario de deportes ›/);
  assert.doesNotMatch(s.html(), /data-pantalla|data-volver/);
});

test('lo seguido va primero, hasta cuatro; sin citas pierde el calendario, no sus resultados', () => {
  const s = escenario({ sigo: ['motogp', 'atp', 'wnba'] });
  s.run('DEPORTES_DISP.circuitos = { motogp: 24, atp: 4, wnba: 0, f1: 5, primera: 20, segunda: 33, nba: 106 }; pintarAccesos()');
  assert.deepEqual([...s.html().matchAll(/class="dep-nombre"[^>]*>([^<]+?) </g)].map(m => m[1]), ['MotoGP', 'ATP', 'WNBA', 'F1']);
  assert.ok(ordenes(s).includes('calendario:motogp'));
  assert.ok(!ordenes(s).includes('calendario:wnba'));
  assert.ok(ordenes(s).includes('resultados:wnba'));
});

test('el nombre abre lo primero que haya o lo pedido, y lo demás queda al lado', () => {
  const s = escenario();
  const fila = c => s.run(`filaCompeticion('${c}')`);
  assert.match(fila('f1'), /class="dep-nombre" data-accion="orden" data-orden="resultados:f1"[^>]*>F1 <small>· Resultados<\/small>/);
  assert.match(fila('f1'), /class="dep-accion"[^>]*data-orden="calendario:f1"/);
  // En clasificacion:, el nombre basta y Resultados pasa a alternativa.
  const tabla = s.run("filaCompeticion('f1', 'clasificacion')");
  assert.match(tabla, /class="dep-nombre"[^>]*data-orden="clasificacion:f1"[^>]*>F1<\/button>/);
  assert.match(tabla, /class="dep-accion"[^>]*data-orden="resultados:f1"/);
  // Sin lo pedido no hay fila; sin resultados, el nombre lleva a su calendario.
  assert.equal(s.run("filaCompeticion('wrc', 'resultados')"), '');
  assert.match(s.run("DEPORTES_DISP.circuitos = { 'feb-endesa': 3 }; CAL_DEPORTES.baloncesto.push('feb-endesa'); filaCompeticion('feb-endesa')"), /class="dep-nombre"[^>]*data-orden="calendario:feb-endesa"/);
  assert.equal(s.run("filaCompeticion('no-existe')"), '');
});

test('un acceso escribe su orden en la barra y sustituye la de agenda anterior; el resto se queda', () => {
  const s = escenario({ buscar: 'medio:elpais teatro: alonso' });
  s.run("ACCESOS.abierto = true; escribirAcceso('calendario:f1')");
  assert.deepEqual(s.escritas, ['medio:elpais alonso calendario:f1']);
  assert.equal(s.ids['accesos-panel'].hidden, true);
});

test('un acceso sustituye también una consulta deportiva, que ya no va al final de la línea', () => {
  const s = escenario({ buscar: 'resultados:primera levante' });
  s.run("escribirAcceso('clasificacion:nba')");
  assert.deepEqual(s.escritas, ['levante clasificacion:nba']);
});

test('deportes seguidos: una fila de noticias por deporte; escribe sus prefijos con espacio', () => {
  const s = escenario({ sigo: ['nba', 'f1', 'motogp'], buscar: 'medio:as' });
  s.run('pintarAccesos()');
  assert.match(s.html(), /data-orden="nba:">Baloncesto · noticias/);
  assert.match(s.html(), /data-orden="f1: motogp:">Motor · noticias/);
  s.run("escribirAcceso('f1: motogp:')");
  assert.equal(s.escritas.at(-1), 'medio:as f1: motogp: ');
  const vacio = escenario();
  vacio.run('pintarAccesos()');
  assert.doesNotMatch(vacio.html(), /noticias</);
});

test('la lista por deporte incluye Euroliga junto a su deporte, sin ser capa del calendario', () => {
  const s = escenario();
  assert.deepEqual([...s.run("competicionesDeporte('baloncesto')")], ['nba', 'wnba', 'euroliga']);
  assert.deepEqual([...CAL_DEPORTES.baloncesto], ['nba', 'wnba']);
});

test('repintar al llegar los datos conserva el botón con el foco', () => {
  const s = escenario();
  let enfocado = '';
  s.c.document = { activeElement: { dataset: { orden: 'resultados:nba' } }, querySelector: sel => ({ focus(){ enfocado = sel; } }) };
  let pintado = 0;
  s.c.pintar = () => { pintado++; };
  s.run('conservandoFoco(pintar)');
  assert.equal(pintado, 1);
  assert.equal(enfocado, '[data-orden="resultados:nba"]');
});

