import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerConsultaCalendario, seleccionCalendario, noticiaEnAmbitos } from '../../shared/calendario/consulta.js';
import { extremoVisible, enDia, ventanaCalendario, moverFecha } from '../../shared/calendario/fechas.js';

const orden = leerConsultaCalendario;
const e = (id, temas, codigos = [], objetivos = []) => ({ id, tipo: codigos.length ? 'agrupacion' : 'evento',
  nombres: { es: id }, temas, codigos, objetivos });
const atp = e('a', ['tenis'], ['atp'], ['agrupacion:a']);
const wta = e('w', ['tenis'], ['wta'], ['agrupacion:w']);
const f1 = e('f', ['automovilismo'], ['f1'], ['agrupacion:f']);
const partido = (id, padre, temas) => ({ ...e(id, temas, [], ['evento:' + id, padre]), fuentes: [{ fuente: 'prueba' }] });
const datos = {
  catalogo: { conceptos: { deportes: { padres: [] }, tenis: { padres: ['deportes'] }, automovilismo: { padres: ['deportes'] } } },
  entidades: { 'agrupacion:a': atp, 'agrupacion:w': wta, 'agrupacion:f': f1 },
  eventos: [partido('ATP final', 'agrupacion:a', ['tenis']), partido('WTA dobles', 'agrupacion:w', ['tenis']), partido('F1 carrera', 'agrupacion:f', ['automovilismo'])],
  clasificaciones: [{ id: 'tabla', objetivos: ['agrupacion:f'], seleccion: { procedencia: { fuente: 'prueba' } } }],
};
for (const e of datos.eventos) datos.entidades['evento:' + e.id] = e;

test('órdenes de deporte, circuito y contenido conservan filtros, comillas y texto', () => {
  assert.deepEqual(orden('resultados:tenis web:ejemplo.es "dobles femenino"'), {
    ambitos: ['tenis'], circuitos: [], tipos: ['resultados'], desconocidos: [],
    resto: 'web:ejemplo.es "dobles femenino"', noticias: false,
  });
  assert.deepEqual(orden('f1:clasificación').tipos, ['clasificaciones']);
  assert.deepEqual(orden('clasificación:f1').ambitos, ['f1']);
  assert.deepEqual(orden('circuito:"atp,wta"').circuitos, ['atp','wta']);
  assert.equal(orden('"tenis:" Wimbledon'), null);
  assert.equal(orden('tenis Wimbledon'), null);
  assert.deepEqual(orden('resultados:desconocido').desconocidos, ['desconocido']);
});
test('los ámbitos se suman sin duplicar eventos; circuitos, tema, fuente y texto se cruzan', () => {
  const ids = (o, f) => seleccionCalendario(datos, orden(o), f).eventos.map(e => e.id);
  assert.deepEqual(ids('tenis:'), ['ATP final','WTA dobles']);
  assert.deepEqual(ids('atp: wta:'), ['ATP final','WTA dobles']);
  assert.deepEqual(ids('tenis: atp:'), ['ATP final','WTA dobles']);
  assert.deepEqual(ids('tenis: circuito:wta'), ['WTA dobles']);
  assert.deepEqual(ids('deportes:', { circuitos: ['atp','wta'] }), ['ATP final','WTA dobles']);
  assert.deepEqual(ids('tenis: dobles'), ['WTA dobles']);
  assert.deepEqual(ids('tenis:', { temas: ['automovilismo'] }), []);
  assert.deepEqual(ids('tenis:', { fuente: 'otra' }), []);
  assert.equal(seleccionCalendario(datos, orden('f1:clasificación')).clasificaciones.length, 1);
});
test('noticias por texto sin confundir una búsqueda temática con un enlace a un partido', () => {
  assert.equal(noticiaEnAmbitos('La final WTA de dobles', orden('tenis:')), true);
  assert.equal(noticiaEnAmbitos('La final WTA de dobles', orden('atp:')), false);
  assert.equal(noticiaEnAmbitos('La final WTA de dobles', orden('atp: wta:')), true);
  assert.equal(noticiaEnAmbitos('Carrera de Fórmula 1', orden('f1:')), true);
  assert.equal(noticiaEnAmbitos('ATP anuncia su calendario', orden('resultados:tenis')), false);
});
const extremo = (fecha, extras = {}) => ({ fecha, hora_local: null, instante: null, zona: null,
  certeza_fecha: fecha ? 'confirmado' : 'desconocida', certeza_hora: 'desconocida', ...extras });
test('fechas sin hora, TBD y horas sin zona no se convierten en instantes', () => {
  assert.deepEqual(extremoVisible(extremo('2026-10-25'), 'America/New_York'), { fecha: '2026-10-25', hora: null, sinZona: false });
  assert.equal(extremoVisible(extremo('2026-10-25', { certeza_fecha: 'provisional' }), 'UTC').fecha, null);
  assert.deepEqual(extremoVisible(extremo('2026-10-25', { hora_local: '17:00:00', certeza_hora: 'confirmado' }), 'UTC'), {
    fecha: '2026-10-25', hora: '17:00', sinZona: true,
  });
  const x = extremo('2026-10-25', { instante: '2026-10-25T00:30:00Z', certeza_hora: 'confirmado' });
  assert.equal(extremoVisible(x, 'America/New_York').fecha, '2026-10-24');
});
test('intervalos exclusivos, fin desconocido y cambio de hora conservan los días de celebración', () => {
  const c = { inicio: extremo('2026-10-24'), fin: extremo('2026-10-26'), fin_exclusivo: true };
  assert.equal(enDia(c, '2026-10-25', 'Europe/Madrid'), true);
  assert.equal(enDia(c, '2026-10-26', 'Europe/Madrid'), false);
  c.fin = extremo(null);
  assert.equal(enDia(c, '2026-10-25', 'Europe/Madrid'), false);
  assert.equal(enDia(c, '2026-10-24', 'Europe/Madrid'), true);
  assert.equal(ventanaCalendario('2026-10-25','semana')[0], '2026-10-19');
  assert.equal(ventanaCalendario('2026-10-25','mes').length, 42);
  assert.equal(moverFecha('2026-01-31', 'mes', 1), '2026-02-01');
});
