import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nombresSesion, nombresEvento, enMinusculas, LUGARES, clave } from '../../shared/calendario/nombres.js';

test('sesiones: los alias de cada fuente dan el mismo nombre en los cinco idiomas; lo desconocido, nada', () => {
  assert.deepEqual(nombresSesion('Sprint Q'), nombresSesion('SS'));
  assert.deepEqual(nombresSesion('Race'), nombresSesion('RAC2'));
  assert.equal(nombresSesion('SPR').es, 'Sprint');
  assert.equal(nombresSesion('FP1').ca, 'Lliures 1');
  for (const tipo of ['FP1', 'PR', 'Q1', 'WUP', 'Qualifying', 'Race']) assert.deepEqual(Object.keys(nombresSesion(tipo)), ['es', 'gl', 'ca', 'eu', 'en']);
  for (const tipo of ['MEDIA', 'race', '', null, 'toString']) assert.equal(nombresSesion(tipo), null);
});

test('mayúsculas: solo se rebaja lo que llega todo en mayúsculas', () => {
  assert.equal(enMinusculas('RIO DE JANEIRO'), 'Rio de Janeiro');
  assert.equal(enMinusculas('BEIJING'), 'Beijing');
  assert.equal(enMinusculas('Basel, Switzerland'), 'Basel, Switzerland');
  assert.equal(enMinusculas('F1'), 'F1');
});

test('GP: sin patrocinio ni mayúsculas; con traducción si el lugar está en la tabla', () => {
  assert.deepEqual(nombresEvento({ und: 'ZZTEST GRAND PRIX OF THE ZZLAND ' }), { und: 'Grand Prix of Zzland' });
  assert.deepEqual(nombresEvento({ und: 'Zzcity Grand Prix' }), { und: 'Zzcity Grand Prix' });
  for (const [k, nombres] of Object.entries(LUGARES)){
    assert.equal(k, clave(k), `clave normalizada: ${k}`);
    assert.deepEqual(Object.keys(nombres).sort(), ['ca', 'en', 'es', 'eu', 'gl'], k);
  }
});

test('nombres reales: GP de MotoGP y F1 (también con patrocinio de ESPN) y rallies; un rally local no se toca', () => {
  const es = x => nombresEvento({ und: x })?.es;
  assert.equal(es('PETRONAS GRAND PRIX OF MALAYSIA '), 'GP de Malasia');
  assert.equal(es('ESTRELLA GALICIA 0,0 GRAND PRIX OF SPAIN '), 'GP de España');
  assert.equal(es('Mexico City Grand Prix'), 'GP de Ciudad de México');
  assert.equal(es('Heineken Dutch Grand Prix'), 'GP de los Países Bajos');
  assert.equal(es('FORUM8 Rally Japan'), 'Rally de Japón');
  assert.equal(es('Safari Rally Kenya'), 'Rally Safari de Kenia');
  assert.equal(nombresEvento({ und: 'MOTUL GRAND PRIX OF VALENCIA' }).ca, 'GP de València');
  assert.equal(nombresEvento({ es: 'Rally de Ourense' }), null);
});

test('tenis: se quita la ciudad repetida solo si coincide con el lugar', () => {
  assert.deepEqual(nombresEvento({ und: 'Toray Pan Pacific Open Tennis - Tokyo, JPN' }, ['TOKYO']), { und: 'Toray Pan Pacific Open Tennis' });
  assert.deepEqual(nombresEvento({ und: 'Río Ladies Open by MundoTênis Tours  - Rio De Janeiro, BRA' }, ['RIO DE JANEIRO']),
    { und: 'Río Ladies Open by MundoTênis Tours' });
  assert.equal(nombresEvento({ und: 'Copa Coca-Cola - Fase final' }, ['Madrid']), null);
  assert.equal(nombresEvento({ es: 'Concierto de otoño' }, ['Vigo']), null);
  assert.equal(nombresEvento(null), null);
});
