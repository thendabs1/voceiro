import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, tokenizeQuery } from '../../shared/parser.js';
import { AMBITOS, leerConsultaCalendario } from '../../shared/calendario/consulta.js';
import { PREFIJOS_CONSULTAS, admiteConsultaESPN, admiteConsultaMotor } from '../../shared/consultas/registro.js';
import { traducir } from '../../front/idiomas/index.js';

const leer = n => readFileSync(new URL(`../../front/app/${n}`, import.meta.url), 'utf8');
const sugerenciasCalendario = leer('14-calendario.js').match(/function sugerenciasCalendario[\s\S]*?\n}\n/)[0];
const entrada = { value: '', style: {} }, escritas = [];
const c = {
  normalize, tokenizeQuery, AMBITOS, leerConsultaCalendario, PREFIJOS_CONSULTAS, CALENDARIO_ACTIVO: true, TIEMPO_ACTIVO: false,
  t: (k, v) => traducir('es', k, v), MEDIOS_UNICOS: [{ medio: 'Diario de Noticias', dominio: 'dn.es' }, { medio: 'Marca', dominio: 'marca.com', grupo: 'Deportes · España' }],
  partirConsulta: raw => ({ consulta: tokenizeQuery(raw).find(x => x.resto)?.raw || '' }), sugerenciasEstadisticas: () => null, fragmentoTiempo: () => null,
  CAL_DEPORTES: { futbol: ['primera', 'segunda'], baloncesto: ['nba'] }, CONSULTA_DEPORTES: { primera: 'LaLiga', nba: 'NBA' }, calNombreCompeticion: x => x,
  codigoDeporte: (tipo, x) => admiteConsultaESPN(tipo, x) || admiteConsultaMotor(tipo, x), nombreConsulta: tipo => traducir('es', 'con' + tipo[0].toUpperCase() + tipo.slice(1)),
  document: { getElementById: () => entrada }, escribirAcceso: orden => escritas.push([entrada.value, orden]), pasoDeSugerencia: fn => fn(), cerrarSugerencias(){},
};
runInNewContext(leer('13-autocompletado.js') + '\n' + leer('14-deportes.js') + '\n' + sugerenciasCalendario, c);
const valores = raw => Array.from(runInNewContext(`sugerenciasBuscar(${JSON.stringify(raw)})`, c), s => s.value);
const abre = raw => runInNewContext(`haySugerencias(sugerenciasBuscar(${JSON.stringify(raw)}))`, c);

test('tras una competición se sugiere lo que admite', () => {
  assert.ok(valores('f1:h').includes('f1:hoy'));
  assert.ok(valores('f1:h').includes('f1:horarios'));
  assert.ok(valores('fin').includes('finde:'));
});

test('una sola coincidencia de calendario abre la lista y no esconde los medios', () => {
  for (const raw of ['f1', 'de', 'ma']) assert.equal(abre(raw), true, raw);
  assert.ok(valores('f1').includes('f1:'));
  assert.ok(valores('dep').includes('deportes:'));
  assert.ok(valores('diario de').includes('dn.es'));
  assert.ok(valores('ma').includes('marca.com'));
});

test('los prefijos de consulta se ofrecen sin saberlos', () => {
  assert.ok(valores('res').includes('resultados:'));
  assert.ok(valores('clasif').includes('clasificacion:'));
  assert.ok(valores('lib').includes('libro:'));
  assert.ok(!valores('re').includes('resultados:'));
});

test('una competición ofrece sus resultados y su tabla por su nombre', () => {
  assert.deepEqual(valores('lali').slice(1, 3), ['resultados:primera', 'clasificacion:primera']);
  assert.ok(valores('nba').includes('nba:'));
  assert.ok(valores('nba').includes('resultados:nba'));
});

test('un prefijo ya empezado enseña lo que admite y una consulta no sugiere nada', () => {
  assert.deepEqual(Array.from(valores('f1:')), ['f1:', 'f1:hoy', 'f1:manana', 'f1:finde', 'f1:horarios', 'f1:noticias']);
  assert.deepEqual(valores('resultados:pri'), []);
});

test('una orden sustituye la palabra escrita, con espacio detrás o tras una consulta vacía', () => {
  const elegir = (raw, value) => {
    entrada.value = raw;
    runInNewContext(`SUG_STATE.items = [{ kind: 'orden', value: ${JSON.stringify(value)} }]; aplicarSugerencia(0)`, c);
    return escritas.at(-1);
  };
  assert.deepEqual(elegir('res ', 'resultados:'), ['', 'resultados:']);
  assert.deepEqual(elegir('noticias res', 'resultados:'), ['noticias ', 'resultados:']);
  assert.deepEqual(elegir('resultados: nba', 'resultados:nba'), ['resultados: ', 'resultados:nba']);
});

