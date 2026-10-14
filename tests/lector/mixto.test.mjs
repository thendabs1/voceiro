// Modo mixto: los bloques de Readability que están en el JSON-LD se
// quedan; lo que se cuela (newsletter, relacionados, avisos) sale. Más la
// clave de imagen y la limpieza de bloques. Los casos imitan artículos
// reales (Atlántico, La Opinión, Nós Diario, Ecología Verde).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidirMixto, claveImagen, sinImagenesRepetidas, sinPromosEnBordes, agruparGalerias } from '../../lector/modulos/mixto.js';

const textoDe = b => b.tipo === 'list' ? b.items.join(' ') : (b.html || '');
const p = html => ({ tipo: 'p', html });
const h = html => ({ tipo: 'h', html, level: 2 });
const img = (src, caption = '') => ({ tipo: 'img', src, alt: '', caption });

const P1 = 'El ciclista ponteareano se impuso el pasado domingo en la categoría élite masculina de la prueba de Marín, segunda de la Copa de España.';
const P2 = 'En la categoría femenina, la francesa se llevó la victoria en solitario tras distanciarse de sus rivales en la segunda vuelta.';
const P3 = 'La competición se completó con las carreras máster. La Copa de España continuará el 31 de octubre en Amurrio.';
const INTER = 'Las otras categorías';
// El JSON pega el intertítulo al párrafo y cambia comillas y espacios.
const JSON = `${P1} ${P2} ${INTER} ${P3}`.replace('Copa de España.', 'Copa  de “España”.');

test('quita la newsletter y los relacionados y deja intertítulos e imágenes del artículo', () => {
  const bloques = [
    img('https://x.es/clip/foto.jpg', 'El podio'), p(P1), p(P2),
    { tipo: 'list', ordered: false, items: ['La Xunta reconoce el estado crítico de los murales', '¿Qué hacer este miércoles en A Coruña?'] },
    h(INTER), img('https://x.es/clip/otra.jpg'), p(P3),
    p('¡Anótate a las newsletters de Atlántico!'), p('Recibe de manera GRATUITA en tu correo las principales noticias.'), p('APUNTARME')
  ];
  const r = decidirMixto(bloques, JSON, textoDe);
  assert.equal(r.origen, 'mixto');
  assert.deepEqual(r.conservar, [0, 1, 2, 4, 5, 6]);
});

test('el aviso de carga de un gráfico, entre dos párrafos, sale', () => {
  const r = decidirMixto([p(P1), p('Cargando gráfico…'), p(P2)], `${P1} ${P2}`, textoDe);
  assert.deepEqual(r, { origen: 'mixto', conservar: [0, 2] });
});

test('una tabla con texto del JSON cuenta para la cobertura y se queda con sus párrafos', () => {
  // El JSON trae las celdas como texto; sin contarlas, a Readability le
  // faltaría más del 20 % del JSON y saldría «jsonld», sin la tabla.
  const CELDAS = 'Muíños Requiás 22,8 hectáreas A Laracha Caión 33,49 hectáreas Ourol O Sisto 32,83 hectáreas ' +
    'Carballo Noicela 186,5 hectáreas Arbo Cabeiras 33 hectáreas Rodeiro A Portela 15,16 hectáreas';
  const tabla = { tipo: 'tabla', html: '<table>…</table>', caption: '', texto: CELDAS };
  const deTexto = b => b.tipo === 'tabla' ? b.texto : textoDe(b);
  const r = decidirMixto([p(P1), tabla, p(P2), p('¡Anótate a las newsletters de Atlántico!')], `${P1} ${CELDAS} ${P2}`, deTexto);
  assert.deepEqual(r, { origen: 'mixto', conservar: [0, 1, 2] });
});

test('si no sobra nada, es Readability', () => {
  assert.equal(decidirMixto([p(P1), p(P2)], `${P1} ${P2}`, textoDe).origen, 'readability');
});

test('sin JSON, Readability', () => {
  assert.equal(decidirMixto([p(P1)], '', textoDe).origen, 'readability');
});

test('si a Readability le falta buena parte del JSON (DOM recortado), JSON', () => {
  assert.equal(decidirMixto([p(P1), p('Hazte socio para seguir leyendo.')], JSON, textoDe).origen, 'jsonld');
});

test('si tras el final del JSON siguen párrafos largos (JSON recortado), Readability', () => {
  const largo = n => p(`Párrafo ${n} del artículo completo que el JSON-LD no trae porque el medio lo corta para los que no pagan; ` +
    'sigue con más texto del cuerpo para que pase de las cuarenta palabras que pide la comprobación, como un párrafo normal de una noticia ' +
    'con sus datos, sus declaraciones y sus fuentes, que es lo que hay detrás del muro.');
  const r = decidirMixto([p(P1), largo(1), largo(2), largo(3)], P1, textoDe);
  assert.equal(r.origen, 'readability');
});

test('claveImagen: la misma foto en otro tamaño da la misma clave', () => {
  const uuid = '4dc122ab-2e73-4d50-ba61-e06d0c56d457';
  assert.equal(claveImagen(`https://static.laregion.es/clip/${uuid}_source-aspect-ratio_1600w_0.jpg`),
               claveImagen(`https://static.laregion.es/clip/${uuid}_facebook-aspect-ratio_default_0.jpg`));
  const base = 'https://cdn0.ecologiaverde.com/es/posts/0/0/1/el_ornitorrinco_8100';
  assert.equal(claveImagen(base + '_1200.jpg'), claveImagen(base + '_orig.jpg'));
  assert.equal(claveImagen('https://x.com/a/foto-1024x768.webp?w=300'), claveImagen('https://x.com/a/foto.webp'));
  assert.notEqual(claveImagen(base + '_0_600.jpg'), claveImagen(base + '_1_600.jpg'));
  assert.notEqual(claveImagen('https://x.com/a/foto.jpg'), claveImagen('https://x.com/b/foto.jpg'));
  assert.equal(claveImagen(''), '');
});

test('sinImagenesRepetidas: fuera la copia, y su pie pasa a la primera', () => {
  const r = sinImagenesRepetidas([img('https://x.com/a/foto_1200.jpg'), p(P1), img('https://x.com/a/foto_orig.jpg', 'El pie'), img('https://x.com/a/otra.jpg')]);
  assert.deepEqual(r.map(b => b.tipo), ['img', 'p', 'img']);
  assert.equal(r[0].caption, 'El pie');
});

test('sinPromosEnBordes: quita las promos cortas del principio y del final, no las de en medio', () => {
  const bloques = [
    img('https://x.com/a/portada.jpg'), p('¿Ya nos sigues? Márcanos como medio preferente'),
    p(P1), p('Síguenos en el canal de WhatsApp, decía el cartel de la protesta, que reunió a cientos de personas.'), p(P2),
    p('Si deseas leer más artículos parecidos a este, te recomendamos que entres en nuestra categoría de Curiosidades.')
  ];
  assert.deepEqual(sinPromosEnBordes(bloques, textoDe).map(textoDe), [
    '', P1, 'Síguenos en el canal de WhatsApp, decía el cartel de la protesta, que reunió a cientos de personas.', P2
  ]);
});

test('sinPromosEnBordes: un artículo sin promos no cambia', () => {
  const bloques = [p(P1), p(P2)];
  assert.equal(sinPromosEnBordes(bloques, textoDe), bloques);
});

test('agruparGalerias: tres imágenes seguidas o más son una galería; dos, no', () => {
  const a = img('https://x.com/a.jpg'), b = img('https://x.com/b.jpg'), c = img('https://x.com/c.jpg'), d = img('https://x.com/d.jpg');
  const r = agruparGalerias([p(P1), a, b, c, p(P2), d, a, p(P3)]);
  assert.deepEqual(r.map(x => x.tipo), ['p', 'galeria', 'p', 'img', 'img', 'p']);
  assert.deepEqual(r[1].imagenes, [a, b, c]);
  assert.deepEqual(agruparGalerias([p(P1), a, b, c, d]).map(x => x.tipo), ['p', 'galeria']);
});
