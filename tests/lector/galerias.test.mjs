import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { galeriasDeJSONLD, detectarGalerias, claveImagenGaleria, separarImagenesDeGalerias,
  pieImagenGaleria } from '../../lector/modulos/galerias.js';
import { limpiarCodigoIncrustado } from '../../lector/modulos/codigo-incrustado.js';
import { limpiarPromosTextoFinal } from '../../lector/modulos/mixto.js';

const URL_ART = 'https://medio.example/deportes/partido.html';
const imagen = (n, extra = {}) => ({ '@type': 'ImageObject', contentUrl: '/fotos/partido-' + n + '.jpg', ...extra });
const galeria = (extra = {}) => ({ '@type': 'ImageGallery', image: [imagen(1), imagen(2), imagen(3)], ...extra });

test('Diario de León: recupera 125 fotos en mainEntityOfPage aunque articleBody esté vacío', () => {
  const datos = [{ '@type': 'NewsArticle', headline: 'El partido', articleBody: '',
    author: { name: 'Redacción' }, description: 'La entradilla',
    mainEntityOfPage: galeria({ image: Array.from({ length: 125 }, (_, n) => imagen(n + 1, { position: n + 1, creditText: 'Virginia Moran' })) }) }];
  const [g] = galeriasDeJSONLD(datos, URL_ART);
  assert.equal(g.imagenes.length, 125);
  assert.equal(g.principal, true);
  assert.equal(g.imagenes[124].src, 'https://medio.example/fotos/partido-125.jpg');
  assert.equal(g.imagenes[0].autor, 'Virginia Moran');
  assert.equal(g.metadata.description, 'La entradilla');
  assert.equal(g.metadata.author.name, 'Redacción');
});

test('las variantes de una portada no se interpretan como galería de una noticia', () => {
  const datos = [{ '@type': 'NewsArticle', articleBody: 'Texto de la noticia',
    image: [imagen(1), imagen(2), imagen(3)] }];
  assert.deepEqual(galeriasDeJSONLD(datos, URL_ART), []);
  const variantes = [320, 600, 1200].map(n => imagen(1, { contentUrl: '/fotos/portada_' + n + 'x400.jpg' }));
  assert.deepEqual(galeriasDeJSONLD([{ '@type': 'NewsArticle', image: variantes }], 'https://medio.example/fotos/reportaje.html'), []);
});

test('admite la lista image de una noticia publicada en la sección fotos', () => {
  const [g] = galeriasDeJSONLD([{ '@type': 'NewsArticle', image: [imagen(1), imagen(2)] }],
    'https://medio.example/fotos/2026/reportaje.html');
  assert.equal(g.principal, true);
  assert.equal(g.imagenes.length, 2);
});

test('hasPart identifica una galería adicional, incluso con referencias y otro orden en @graph', () => {
  for (const orden of [false, true]){
    const g = galeria({ '@id': URL_ART + '#galeria' });
    const art = { '@type': 'NewsArticle', headline: 'Noticia con fotos', articleBody: 'Texto propio', hasPart: { '@id': g['@id'] } };
    const [r] = galeriasDeJSONLD([{ '@graph': orden ? [art, g] : [g, art] }], URL_ART);
    assert.equal(r.principal, false);
    assert.equal(r.metadata.articleBody, 'Texto propio');
  }
});

test('ordena por posición y conserva pies y créditos al eliminar variantes repetidas', () => {
  const [g] = galeriasDeJSONLD([galeria({ image: [
    imagen(2, { position: 2 }), imagen(1, { position: 1, contentUrl: '/fotos/a_600x400.jpg' }),
    imagen(1, { position: 1, contentUrl: '/fotos/a_1200x800.jpg', caption: 'El podio', creator: { name: 'Ana' } })
  ] })], URL_ART);
  assert.match(g.imagenes[0].src, /a_600/);
  assert.equal(pieImagenGaleria(g.imagenes[0]), 'El podio — Ana');
  assert.equal(g.imagenes.length, 2);
});

test('rechaza URLs ejecutables, credenciales, píxeles y galerías de otras páginas', () => {
  const datos = galeria({ image: [imagen(1), imagen(2),
    imagen(3, { contentUrl: 'javascript:alert(1)' }), imagen(4, { contentUrl: 'data:image/png,x' }),
    imagen(5, { contentUrl: 'https://user:password@medio.example/a.jpg' }),
    imagen(6, { contentUrl: 'https://medio.example/pixel.gif' })] });
  assert.equal(galeriasDeJSONLD([datos], URL_ART)[0].imagenes.length, 2);
  assert.deepEqual(galeriasDeJSONLD([galeria({ url: 'https://medio.example/otra-noticia.html' })], URL_ART), []);
  assert.deepEqual(galeriasDeJSONLD([{ '@type': 'ItemList', itemListElement: [galeria()] }], URL_ART), []);
});

test('deduplica las transformaciones del CMS de Diario de León', () => {
  assert.equal(claveImagenGaleria('https://imagenes.diariodeleon.es/files/image_composite_mobile/uploads/2026/foto.jpeg'),
    claveImagenGaleria('https://imagenes.diariodeleon.es/uploads/2026/foto.jpeg'));
});

test('las fotos intercaladas ajenas a la galería conservan su posición y no se agrupan', () => {
  const bloques = [{ tipo: 'p', html: 'Inicio' }, { tipo: 'img', src: 'https://medio.example/intercalada.jpg' },
    { tipo: 'p', html: 'Texto' }, { tipo: 'img', src: 'https://medio.example/fotos/partido-1.jpg' }];
  assert.deepEqual(separarImagenesDeGalerias(bloques, galeriasDeJSONLD([galeria()], URL_ART)), bloques.slice(0, 3));
});

function documento(datos){
  return { title: 'Noticia', querySelector: () => null,
    querySelectorAll(sel){ return sel === 'script[type="application/ld+json"]' ? datos.map(x => ({ textContent: x })) : []; } };
}

test('tolera JSON roto y solo recorre el contenido elegido con un selector manual', () => {
  const doc = documento(['{roto', JSON.stringify(galeria())]);
  assert.equal(detectarGalerias(doc, URL_ART).galerias.length, 1);
  const root = { querySelectorAll: () => [], matches: () => false };
  assert.deepEqual(detectarGalerias(doc, URL_ART, { root }).galerias, []);
});

const extractor = readFileSync(new URL('../../lector/src/17-extractores-de-articulo.js', import.meta.url), 'utf8');
function completar(art, datos){
  const ctx = vm.createContext({ document: documento(datos.map(JSON.stringify)), location: { href: URL_ART },
    detectarGalerias, limpiarCodigoIncrustado, limpiarPromosTextoFinal, currentExtraction: () => ({ mode: 'auto' }), art });
  vm.runInContext(extractor, ctx);
  vm.runInContext('decodeEnt = s => s || ""; extractTextWithConfig = () => art;', ctx);
  return vm.runInContext('extractArticleWithConfig()', ctx);
}

test('añade una galería declarada sin cambiar el texto ni el origen elegido', () => {
  const art = { headline: 'Noticia', rawBody: 'El texto seleccionado.', rawHTML: '', _source: 'jsonld' };
  const r = completar(art, [{ '@type': 'NewsArticle', hasPart: galeria() }]);
  assert.equal(r.rawBody, art.rawBody);
  assert.equal(r._source, 'jsonld');
  assert.equal(r.galeriaPrincipal, false);
  assert.equal(r.galerias.length, 1);
});

test('una fotogalería puede abrirse sin artículo de Readability ni articleBody', () => {
  const r = completar(null, [{ '@type': 'NewsArticle', headline: 'Partido en fotos', description: 'Entradilla',
    articleBody: '', mainEntityOfPage: galeria() }]);
  assert.equal(r.galeriaPrincipal, true);
  assert.equal(r.headline, 'Partido en fotos');
  assert.equal(r.description, 'Entradilla');
  assert.equal(r.rawBody, '');
  assert.equal(r.galerias[0].imagenes.length, 3);
  assert.equal('metadata' in r.galerias[0], false);
});
