// node --test tests/
// Casos de texto de la especificación del buscador (1-10) y equivalencia
// entre el filtro local (coincide) y FTS5 (compilarFts) sobre los mismos titulares.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { tokenizeQuery } from '../../shared/parser.js';
import {
  tokenizar, compilarTexto, coincide, compilarFts, rangosResaltado,
} from '../../shared/busqueda/texto.js';

const TITULARES = [
  'Pedro Sánchez anuncia elecciones anticipadas',
  'El sanchismo responde a Feijóo',
  'Elecciones en Galicia: el PP gana por mayoría',
  'Las elecciones gallegas, en el aire',
  'San Salvador de Poio celebra sus fiestas',
  'Salvador Illa visita Poio y San Sebastián',
  'Fiestas en Lalín y Vilalba este fin de semana',
  'Sanxenxo bate récord de turistas',
  'Incendio en una nave industrial de Vigo',
  'Incendio forestal en Ourense: 200 hectáreas',
  'EE.UU. sube los aranceles al acero europeo',
  'Los aranceles de EEUU preocupan a Bruselas',
  'Nuevo repunte de covid-19 en residencias',
  'El covid 19 vuelve a las urgencias',
  'Covidiota detenido en Madrid',
  'Vigo estrena autobuses eléctricos',
  'El Celta de Vigo pierde en casa',
  "L'Hospitalet aprueba el presupuesto",
];

const busca = q => {
  const c = compilarTexto(tokenizeQuery(q));
  return TITULARES.filter(t => coincide(tokenizar(t), c));
};

test('1-2 · inicio de palabra, sin acentos ni mayúsculas', () => {
  assert.deepEqual(busca('sanchez'), ['Pedro Sánchez anuncia elecciones anticipadas']);
  assert.deepEqual(busca('Sánchez'), busca('sanchez'));
  assert.deepEqual(busca('sanch'), [
    'Pedro Sánchez anuncia elecciones anticipadas',
    'El sanchismo responde a Feijóo',
  ]);
});

test('3 · todas las palabras (AND), cada una por inicio', () => {
  assert.deepEqual(busca('eleccion galicia'), ['Elecciones en Galicia: el PP gana por mayoría']);
  assert.deepEqual(busca('eleccion gal'), [
    'Elecciones en Galicia: el PP gana por mayoría',
    'Las elecciones gallegas, en el aire',
  ]);
});

test('4 · san salvador poio: solo con las tres palabras', () => {
  assert.deepEqual(busca('san salvador poio'), [
    'San Salvador de Poio celebra sus fiestas',
    'Salvador Illa visita Poio y San Sebastián',
  ]);
  assert.ok(!busca('san salvador poio').some(t => /Lalín|Vilalba/.test(t)));
});

test('5 · frase entre comillas: palabras seguidas y completas', () => {
  assert.deepEqual(busca('"san salvador"'), ['San Salvador de Poio celebra sus fiestas']);
  assert.deepEqual(busca('"sanx"'), []);           // entre comillas no es prefijo
});

test('6 · -palabra excluye', () => {
  assert.deepEqual(busca('incendio -forestal'), ['Incendio en una nave industrial de Vigo']);
});

test('7 · EE.UU es texto: sus partes seguidas', () => {
  assert.deepEqual(busca('EE.UU aranceles'), ['EE.UU. sube los aranceles al acero europeo']);
});

test('8 · covid-19 encuentra «covid-19» y «covid 19», no «covidiota»', () => {
  assert.deepEqual(busca('covid-19'), [
    'Nuevo repunte de covid-19 en residencias',
    'El covid 19 vuelve a las urgencias',
  ]);
});

test('9 · vigo es texto, de cualquier medio', () => {
  assert.deepEqual(busca('vigo'), [
    'Incendio en una nave industrial de Vigo',
    'Vigo estrena autobuses eléctricos',
    'El Celta de Vigo pierde en casa',
  ]);
});

test('10 · palabras de 1-2 letras se ignoran salvo entre comillas', () => {
  assert.deepEqual(busca('incendio de vigo'), busca('incendio vigo'));
  assert.deepEqual(busca('"de vigo"'), [
    'Incendio en una nave industrial de Vigo',
    'El Celta de Vigo pierde en casa',
  ]);
  assert.equal(busca('de').length, TITULARES.length);  // solo palabras cortas = sin filtro de texto
});

test('apóstrofo separa como en FTS5', () => {
  assert.deepEqual(busca('hospitalet'), ["L'Hospitalet aprueba el presupuesto"]);
});

test('resaltado: exactamente lo que casó, con la posición original', () => {
  const t = 'Pedro Sánchez anuncia elecciones anticipadas';
  const c = compilarTexto(tokenizeQuery('sanchez eleccion -anticipadas'));
  const r = rangosResaltado(t, c).map(([i, j]) => t.slice(i, j));
  assert.deepEqual(r, ['Sánchez', 'elecciones']);
  const t2 = 'San Salvador de Poio celebra sus fiestas';
  const r2 = rangosResaltado(t2, compilarTexto(tokenizeQuery('"san salvador"'))).map(([i, j]) => t2.slice(i, j));
  assert.deepEqual(r2, ['San Salvador']);
});

test('equivalencia con FTS5: compilarFts + MATCH == coincide', () => {
  const db = new DatabaseSync(':memory:');
  db.exec("CREATE VIRTUAL TABLE t USING fts5(titular, tokenize='unicode61 remove_diacritics 2')");
  const ins = db.prepare('INSERT INTO t(rowid, titular) VALUES (?, ?)');
  TITULARES.forEach((x, i) => ins.run(i + 1, x));
  const consultas = [
    'sanchez', 'sanch', 'eleccion galicia', 'eleccion gal', 'san salvador poio',
    '"san salvador"', 'incendio -forestal', 'EE.UU aranceles', 'covid-19', 'vigo',
    'incendio de vigo', '"de vigo"', 'hospitalet', 'fiestas -lalin', 'aranceles -eeuu',
  ];
  for (const q of consultas) {
    const c = compilarTexto(tokenizeQuery(q));
    const fts = compilarFts(c);
    const local = TITULARES.filter(x => coincide(tokenizar(x), c));
    const remoto = db.prepare('SELECT titular FROM t WHERE t MATCH ? ORDER BY rowid')
      .all(fts).map(r => r.titular);
    assert.deepEqual(remoto, local, `consulta ${q} → ${fts}`);
  }
});

test('palabrasDe (rápida, para filtrar) parte igual que tokenizar', async () => {
  const { palabrasDe } = await import('../../shared/busqueda/texto.js');
  const extra = ['Incêndio destrói mercado', 'Çà et là: l’été', 'Ñandú—pingüino…  ¡ya!', 'İstanbul ß ǅ', 'Covid-19/2026_x', ''];
  for (const t of [...TITULARES, ...extra]) {
    assert.deepEqual(palabrasDe(t).map(x => x.t), tokenizar(t).map(x => x.t), t);
  }
});
