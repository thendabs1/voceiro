// node --test tests/
// Temas de un modo (shared/busqueda/temas.js): cada línea es una búsqueda
// pequeña con la regla del buscador; OR entre líneas; siglas cortas exactas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { palabrasDe, rangosResaltado } from '../../shared/busqueda/texto.js';
import {
  compilarTemas, temasQueCasan, compiladoDeTemas, etiquetaVisible,
} from '../../shared/busqueda/temas.js';

const casan = (lineas, titular) => temasQueCasan(palabrasDe(titular), compilarTemas(lineas), titular);

test('inicio de palabra: incendio casa «Incendios»', () => {
  assert.deepEqual(casan(['incendio'], 'Incendios en Ourense'), ['incendio']);
});

test('"frase exacta": palabras seguidas y completas', () => {
  assert.deepEqual(casan(['"san salvador"'], 'San Martín de Salvador'), []);
  assert.deepEqual(casan(['"san salvador"'], 'Fiestas en San Salvador de Poio'), ['"san salvador"']);
});

test('varias palabras sin comillas: todas, en cualquier orden', () => {
  assert.deepEqual(casan(['san salvador'], 'Salvador Illa visita San Sebastián'), ['san salvador']);
  assert.deepEqual(casan(['san salvador'], 'Salvador Illa visita Poio'), []);
});

test('sin tildes ni mayúsculas, también con ñ', () => {
  assert.deepEqual(casan(['Coruña'], 'Lluvia en A CORUNA'), ['Coruña']);
  assert.deepEqual(casan(['coruna'], 'Lluvia en A Coruña'), ['coruna']);
  assert.deepEqual(casan(['españa'], 'La selección de España gana'), ['españa']);
});

test('=Palabra exige palabra completa y conserva mayúsculas', () => {
  const xacobeo = 'A Xunta fixa os límites oficiais ás portas do Xacobeo 2027';
  const municipio = 'Melloras de infraestruturas e servizos en Ribadumia e Portas';
  assert.deepEqual(casan(['Portas', '"Portas"'], xacobeo), ['Portas', '"Portas"']);
  assert.deepEqual(casan(['=Portas'], xacobeo), []);
  assert.deepEqual(casan(['=Portas'], municipio), ['=Portas']);
  assert.deepEqual(casan(['=Portas'], 'Portasvivas prepara unha festa'), []);
  assert.deepEqual(casan(['=portas'], xacobeo), ['=portas']);
  assert.deepEqual(casan(['=Portas galicia'], 'Galicia celebra unha festa en Portas'), ['=Portas galicia']);
  assert.deepEqual(casan(['=Portas galicia'], 'Galicia está ás portas dunha festa'), []);
  assert.equal(etiquetaVisible('=Portas'), 'Portas');
});

test('=Palabra conserva mayúsculas al resaltar, incluso si aparece también en minúsculas', () => {
  const titular = 'ás portas de Portas';
  const temas = compilarTemas(['=Portas']);
  const etiquetas = temasQueCasan(palabrasDe(titular), temas, titular);
  assert.deepEqual(etiquetas, ['=Portas']);
  const rangos = rangosResaltado(titular, compiladoDeTemas(temas, etiquetas));
  assert.deepEqual(rangos.map(([i, j]) => titular.slice(i, j)), ['Portas']);
});

test('siglas de 1-2 letras: palabra completa, no se ignoran', () => {
  assert.deepEqual(casan(['PP'], 'El PP pide elecciones'), ['PP']);
  assert.deepEqual(casan(['PP'], 'PPK dimite en Perú'), []);
  assert.deepEqual(casan(['IA'], 'La IA llega a los juzgados'), ['IA']);
  assert.deepEqual(casan(['IA'], 'Iago Aspas marca'), []);
});

test('excluir, también siglas cortas', () => {
  assert.deepEqual(casan(['incendio -forestal'], 'Incendio forestal en Ourense'), []);
  assert.deepEqual(casan(['incendio -forestal'], 'Incendio en una nave de Vigo'), ['incendio -forestal']);
  assert.deepEqual(casan(['galicia -PP'], 'El PP gana en Galicia'), []);
  assert.deepEqual(casan(['galicia -PP'], 'Llueve en Galicia'), ['galicia -PP']);
  // -PP excluye la sigla, no lo que empieza por pp
  assert.deepEqual(casan(['galicia -PP'], 'PPK visita Galicia'), ['galicia -PP']);
});

test('una línea sin nada que incluir no es un tema', () => {
  assert.deepEqual(compilarTemas(['-forestal']), []);
  assert.deepEqual(compilarTemas(['medio:lavozdegalicia.es']), []);
  assert.deepEqual(compilarTemas(['', '   ']), []);
  assert.deepEqual(casan(['-forestal'], 'Sale el sol en Vigo'), []);
});

test('varias líneas: OR, y se devuelven las que casaron, en orden', () => {
  const lineas = ['incendio', 'PP', 'celta'];
  assert.deepEqual(casan(lineas, 'El Celta gana en Balaídos'), ['celta']);
  assert.deepEqual(casan(lineas, 'El PP critica la gestión del incendio'), ['incendio', 'PP']);
  assert.deepEqual(casan(lineas, 'Sale el sol en Vigo'), []);
});

test('la etiqueta es la línea tal como se escribió (sin espacios alrededor)', () => {
  assert.deepEqual(compilarTemas(['  Incendio  ']).map(t => t.etiqueta), ['Incendio']);
});

test('resaltado: solo los términos incluidos de los temas que casaron', () => {
  const temas = compilarTemas(['incendio -forestal', 'PP', 'celta']);
  const titular = 'El PP pide medios para el incendio de Vigo';
  const etiquetas = temasQueCasan(palabrasDe(titular), temas);
  assert.deepEqual(etiquetas, ['incendio -forestal', 'PP']);
  const rangos = rangosResaltado(titular, compiladoDeTemas(temas, etiquetas));
  assert.deepEqual(rangos.map(([i, j]) => titular.slice(i, j)), ['PP', 'incendio']);
  // Solo los temas pedidos: con ['PP'], «incendio» no se marca aunque esté.
  const soloPP = rangosResaltado(titular, compiladoDeTemas(temas, ['PP']));
  assert.deepEqual(soloPP.map(([i, j]) => titular.slice(i, j)), ['PP']);
  assert.deepEqual(compiladoDeTemas(temas, []).incluir, []);
});

test('etiqueta visible: sin exclusiones ni prefijos', () => {
  assert.equal(etiquetaVisible('incendio -forestal'), 'incendio');
  assert.equal(etiquetaVisible('"san salvador"  poio'), '"san salvador" poio');
  assert.equal(etiquetaVisible('galicia -PP medio:lavoz.es'), 'galicia');
});
