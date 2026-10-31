import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AMBITOS, leerConsultaCalendario, seleccionCalendario, noticiaEnAmbitos } from '../../shared/calendario/consulta.js';
import { extremoVisible, enDia, agruparPorDiaCalendario, ventanaCalendario, moverFecha } from '../../shared/calendario/fechas.js';
import { readFileSync, readdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

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
  assert.deepEqual(orden('calendario:tenis web:ejemplo.es "dobles femenino"'), {
    ambitos: ['tenis'], circuitos: [], tipos: ['calendario'], desconocidos: [],
    resto: 'web:ejemplo.es "dobles femenino"', noticias: false,
  });
  assert.deepEqual(orden('f1:agenda').tipos, ['calendario']);
  assert.deepEqual(orden('agenda:f1').ambitos, ['f1']);
  // Resultados y clasificaciones ya no son tipos del calendario.
  assert.deepEqual(orden('f1:clasificación').desconocidos, ['f1:clasificación']);
  assert.equal(orden('resultados:tenis'), null);
  assert.deepEqual(orden('circuito:"atp,wta"').circuitos, ['atp','wta']);
  assert.deepEqual(orden('circuito:primera,feb-endesa,wrc').circuitos, ['primera','feb-endesa','wrc']);
  assert.deepEqual(orden('motogp: nba:').ambitos, ['motogp','nba']);
  assert.equal(orden('"tenis:" Wimbledon'), null);
  assert.equal(orden('tenis Wimbledon'), null);
  assert.deepEqual(orden('calendario:desconocido').desconocidos, ['desconocido']);
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
  assert.equal(seleccionCalendario(datos, orden('f1:')).clasificaciones.length, 1);
});
test('solo las competiciones suman noticias por texto; los temas solo seleccionan agenda', () => {
  assert.equal(noticiaEnAmbitos('La final WTA de dobles', orden('tenis:')), false);
  assert.equal(noticiaEnAmbitos('El teatro vuelve', orden('teatro:')), false);
  assert.equal(noticiaEnAmbitos('La final WTA de dobles', orden('wta: tenis:')), false);
  assert.deepEqual(orden('teatro:noticias').desconocidos, ['teatro:noticias']);
  assert.deepEqual(orden('noticias:wta').desconocidos, []);
  assert.equal(noticiaEnAmbitos('La final WTA de dobles', orden('atp:')), false);
  assert.equal(noticiaEnAmbitos('La final WTA de dobles', orden('atp: wta:')), true);
  assert.equal(noticiaEnAmbitos('Carrera de Fórmula 1', orden('f1:')), true);
  assert.equal(noticiaEnAmbitos('ATP anuncia su calendario', orden('calendario:tenis')), false);
});
test('una competición se reconoce por palabras completas; LaLiga Hypermotion no es Primera', () => {
  assert.equal(noticiaEnAmbitos('El nuevo F15 de Ford', orden('f1:')), false);
  assert.equal(noticiaEnAmbitos('NBATV emitirá el partido', orden('nba:')), false);
  assert.equal(noticiaEnAmbitos('La WNBA abre la temporada', orden('nba:')), false);
  assert.equal(noticiaEnAmbitos('Alonso, cuarto en la F1', orden('f1:')), true);
  assert.equal(noticiaEnAmbitos('LaLiga Hypermotion: el Celta Fortuna gana', orden('primera:')), false);
  assert.equal(noticiaEnAmbitos('LaLiga Hypermotion: el Celta Fortuna gana', orden('segunda:')), true);
  assert.equal(noticiaEnAmbitos('LaLiga y LaLiga Hypermotion reparten los derechos', orden('primera:')), true);
  assert.equal(noticiaEnAmbitos('El Madrid lidera LaLiga', orden('primera:')), true);
  assert.equal(noticiaEnAmbitos('Récord en la Primera División', orden('primera:')), true);
});
test('cada tema que usan las tablas de la agenda tiene su prefijo', () => {
  const dir = new URL('../../agenda/tablas/', import.meta.url), temas = new Set();
  for (const f of readdirSync(dir)) {
    const t = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    for (const c of Object.values(t.campos)) for (const v of Object.values(c.valores)) for (const x of v.temas || []) temas.add(x);
    for (const c of t.combinaciones || []) temas.add(c.si_tema);
  }
  const conPrefijo = new Set(Object.values(AMBITOS).map(a => a.tema));
  assert.deepEqual([...temas].filter(x => !conPrefijo.has(x)), []);
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
test('programaciones culturales respetan días de semana y exclusiones en cualquier zona', () => {
  const c = { inicio: extremo('2026-10-19'), fin: extremo('2026-10-31'), fin_exclusivo: false,
    dias_semana: [0, 2, 4], dias_excluidos: ['2026-10-23'] };
  for (const zona of ['Europe/Madrid', 'America/New_York']){
    assert.equal(enDia(c, '2026-10-19', zona), true);
    assert.equal(enDia(c, '2026-10-20', zona), false);
    assert.equal(enDia(c, '2026-10-23', zona), false);
    assert.equal(enDia(c, '2026-10-30', zona), true);
  }
});
test('participante y lugar se cruzan con fuente y texto sin ampliar la selección', () => {
  const d = structuredClone(datos), partido = d.eventos[1];
  d.entidades['participante:ana'] = { ...e('ana', []), tipo: 'participante', nombres: { es: 'Ana' } };
  d.entidades['territorio:lugar'] = { ...e('lugar', []), tipo: 'territorio' };
  partido.objetivos.push('participante:ana', 'territorio:lugar');
  const filtros = { objetivo: 'participante:ana', lugar: 'territorio:lugar', fuente: 'prueba' };
  assert.deepEqual(seleccionCalendario(d, orden('tenis: Ana'), filtros).eventos.map(e => e.id), ['WTA dobles']);
  assert.deepEqual(seleccionCalendario(d, orden('tenis:'), { ...filtros, lugar: 'otro' }).eventos, []);
});

test('los códigos de competición del catálogo funcionan y no sustituyen la consulta', () => {
  const d = structuredClone(datos);
  d.entidades['agrupacion:a'].codigos.push('competicion-local');
  const ids = (q, circuitos) => seleccionCalendario(d, orden(q), { circuitos }).eventos.map(e => e.id);
  assert.deepEqual(ids('tenis:', ['competicion-local']), ['ATP final']);
  assert.deepEqual(ids('tenis: circuito:wta', ['atp']), []);
  assert.deepEqual(ids('tenis: circuito:wta', ['atp', 'wta']), ['WTA dobles']);
});

test('la búsqueda propia del calendario se cruza con texto, categoría y fuente', () => {
  const ids = (q, filtros) => seleccionCalendario(datos, orden(q), filtros).eventos.map(e => e.id);
  assert.deepEqual(ids('tenis: dobles', { texto: 'WTA', temas: ['tenis'], fuente: 'prueba' }), ['WTA dobles']);
  assert.deepEqual(ids('tenis: dobles', { texto: 'ATP' }), []);
  assert.deepEqual(ids('tenis:', { texto: '"WTA dobles"' }), ['WTA dobles']);
});

test('municipio se cruza con recinto, tema y fuente usando su identidad publicada', () => {
  const d = structuredClone(datos);
  d.entidades['territorio:uno'] = { ...e('uno', []), tipo: 'territorio', clase: 'municipio' };
  d.entidades['lugar:sala'] = { ...e('sala', []), tipo: 'lugar', clase: 'recinto' };
  d.eventos[0].objetivos.push('territorio:uno', 'lugar:sala');
  d.eventos[1].objetivos.push('territorio:uno');
  const ids = filtros => seleccionCalendario(d, orden('tenis:'), filtros).eventos.map(e => e.id);
  assert.deepEqual(ids({ municipio: 'territorio:uno' }), ['ATP final', 'WTA dobles']);
  assert.deepEqual(ids({ municipio: 'territorio:uno', lugar: 'lugar:sala', fuente: 'prueba', temas: ['tenis'] }), ['ATP final']);
  assert.deepEqual(ids({ municipio: 'territorio:otro', lugar: 'lugar:sala' }), []);
});

test('la agrupación conserva exclusiones, fin exclusivo, fechas pendientes y cambios de zona', () => {
  const horarios = [
    { inicio: extremo('2026-10-19'), fin: extremo('2026-11-05'), dias_semana: [0,2,4], dias_excluidos: ['2026-10-23'] },
    { inicio: extremo('2026-10-24'), fin: extremo('2026-10-26'), fin_exclusivo: true },
    { inicio: extremo('2026-10-25'), fin: extremo(null) },
    { inicio: extremo(null), fin: extremo(null) },
    { inicio: extremo('2026-10-25', { instante: '2026-10-25T00:30:00Z', certeza_hora: 'confirmado' }),
      fin: extremo('2026-10-25', { instante: '2026-10-25T01:30:00Z', certeza_hora: 'confirmado' }) },
  ];
  const eventos = horarios.map((cuando, id) => ({ id, programacion: { valor: { cuando } } }));
  for (const zona of ['Europe/Madrid', 'America/New_York', 'UTC']){
    const dias = ventanaCalendario('2026-10-25', 'mes');
    const grupos = agruparPorDiaCalendario(eventos, dias, zona);
    for (const dia of dias) assert.deepEqual(grupos.get(dia), eventos.filter(e => enDia(e.programacion.valor.cuando, dia, zona)));
  }
  assert.equal(agruparPorDiaCalendario(eventos, [], 'UTC').size, 0);
});

test('miles de conversiones reutilizan Intl por zona sin crear formatos por evento o día', () => {
  let construidos = 0;
  const c = { Intl: { DateTimeFormat: function(...args){ construidos++; return new Intl.DateTimeFormat(...args); } } };
  const codigo = readFileSync(new URL('../../shared/calendario/fechas.js', import.meta.url), 'utf8').replace(/^export /gm, '');
  runInNewContext(codigo + '\nthis.visible = extremoVisible;', c);
  const x = extremo('2026-10-25', { instante: '2026-10-25T00:30:00Z', certeza_hora: 'confirmado' });
  for (let i = 0; i < 1000; i++){
    assert.equal(c.visible(x, 'Europe/Madrid').hora, '02:30');
    assert.equal(c.visible(x, 'America/New_York').fecha, '2026-10-24');
  }
  assert.equal(construidos, 4);
});
