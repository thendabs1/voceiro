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

test('una ImageGallery suelta no sustituye una noticia con articleBody propio', () => {
  const noticia = { '@type': 'NewsArticle', articleBody: 'Texto propio de la noticia. '.repeat(20) };
  for (const nodos of [[noticia, galeria()], [galeria(), noticia]]){
    for (const datos of [nodos, [{ '@graph': nodos }]]){
      for (const fuente of ['readability', 'jsonld', 'mixto', 'selector']){
        const art = { headline: 'Noticia', rawBody: 'Texto extraído de la noticia. '.repeat(20),
          rawHTML: '<p>Texto con formato.</p>', bloques: [{ tipo: 'p', html: 'Texto' }], _source: fuente };
        const r = completar(art, datos);
        assert.equal(r.galeriaPrincipal, false);
        assert.equal(r.galerias[0].principal, false);
        assert.equal(r.galerias.length, 1);
        assert.equal(r.rawBody, art.rawBody);
        assert.equal(r.rawHTML, art.rawHTML);
        assert.equal(r.bloques, art.bloques);
        assert.equal(r._source, fuente);
      }
    }
  }
});

test('una ImageGallery suelta puede abrirse sin texto ni artículo propietario', () => {
  const r = completar(null, [galeria({ name: 'Fotogalería' })]);
  assert.equal(r.galeriaPrincipal, true);
  assert.equal(r.galerias[0].imagenes.length, 3);
  assert.equal(r.rawBody, '');
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

// JSON-LD real recortado de las muestras del 2 de noviembre de 2026:
// se omiten organización, navegación y fotos posteriores a las dos primeras.
test('Diario de León: el breadcrumb no pisa la definición tipada del mismo @id', () => {
  const articulo = {
    "@type": "NewsArticle",
    "@id": "https://www.diariodeleon.es/deportes/cultural-deportiva-leonesa/261101/2101961/mejores-fotos-derrota-cultural-couto.html#article",
    "articleBody": "",
    "mainEntityOfPage": {
      "@type": "ImageGallery",
      "@id": "https://www.diariodeleon.es/deportes/cultural-deportiva-leonesa/261101/2101961/mejores-fotos-derrota-cultural-couto.html",
      "image": [
        {
          "@type": "ImageObject",
          "contentUrl": "https://imagenes.diariodeleon.es/files/og_thumbnail/uploads/2026/11/01/6ae79ef163a99.jpeg",
          "creditText": "Alejandro Camba",
          "position": 1
        },
        {
          "@type": "ImageObject",
          "contentUrl": "https://imagenes.diariodeleon.es/files/og_thumbnail/uploads/2026/11/01/6ae79ef39c149.jpeg",
          "creditText": "Alejandro Camba",
          "position": 2
        }
      ]
    }
  };
  const breadcrumb = {
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 4,
        "item": {
          "@id": "https://www.diariodeleon.es/deportes/cultural-deportiva-leonesa/261101/2101961/mejores-fotos-derrota-cultural-couto.html",
          "name": "Las mejores fotos de la derrota de la Cultural en O Couto"
        }
      }
    ]
  };
  for (const nodos of [[articulo, breadcrumb], [breadcrumb, articulo]]){
    for (const datos of [nodos, [{ '@graph': nodos }]]){
      const [g] = galeriasDeJSONLD(datos, articulo.mainEntityOfPage['@id']);
      assert.equal(g.imagenes.length, 2);
      assert.equal(g.principal, true);
      assert.equal(g.imagenes[0].autor, 'Alejandro Camba');
      assert.equal(g.metadata.articleBody, '');
    }
  }
});

test('Prensa Ibérica: associatedMedia aporta la colección aunque image solo sea la portada', () => {
  const muestras = [
    {
      "@type": "NewsArticle",
      "articleBody": "Familiares y allegados acuden con flores a los cementerios de la ciudad para recordar a sus seres queridos en el Día de Todos los Santos que se celebra este domingo, 1 de noviembre.",
      "url": "https://www.laopinioncoruna.es/fotos/a-coruna-metro/2026/11/01/dia-santos-coruna-135973105.html",
      "associatedMedia": [
        {
          "@type": "ImageObject",
          "contentUrl": "https://estaticos-cdn.prensaiberica.es/clip/64f800d0-30d0-404b-8608-7de0da7277da_alta-libre-aspect-ratio_default_0_x1024y455.jpg",
          "caption": "Cementerio de Feáns"
        },
        {
          "@type": "ImageObject",
          "contentUrl": "https://estaticos-cdn.prensaiberica.es/clip/e9376f0a-a272-4b00-bad7-4fc42998a0f2_alta-libre-aspect-ratio_default_0_x1024y455.jpg",
          "caption": "Cementerio de Sada"
        }
      ],
      "image": {
        "@type": "ImageObject",
        "url": "https://estaticos-cdn.prensaiberica.es/clip/dca22330-d0cb-4cfb-b97a-e091a6292d79_alta-libre-aspect-ratio_default_0_x1024y455.jpg"
      }
    },
    {
      "@type": "NewsArticle",
      "articleBody": "La cita, aplazada del sábado al domingo por el luto nacional oficial, volvió a ofrecer rutas terroríficas, música y diversión familiar",
      "url": "https://www.farodevigo.es/fotos/pontevedra/2026/11/01/mejores-imagenes-samain-briz-marin-135983349.html",
      "associatedMedia": [
        {
          "@type": "ImageObject",
          "contentUrl": "https://estaticos-cdn.prensaiberica.es/clip/4d5ad06c-bb44-45df-9b69-69b1f8fce58a_alta-libre-aspect-ratio_default_0_x480y213.jpg",
          "caption": "Las mejores imágenes del Samaín Briz de Marín"
        },
        {
          "@type": "ImageObject",
          "contentUrl": "https://estaticos-cdn.prensaiberica.es/clip/7aeca57a-e0f5-4221-b4bf-fb9ae0c555f2_alta-libre-aspect-ratio_default_0.jpg",
          "caption": "La alcaldesa y algunos concejales, «de miedo»."
        }
      ],
      "image": {
        "@type": "ImageObject",
        "url": "https://estaticos-cdn.prensaiberica.es/clip/b107049e-0f9c-48ad-895e-d1d29ecb2d23_alta-libre-aspect-ratio_default_0_x480y213.jpg"
      }
    },
    {
      "@type": "NewsArticle",
      "articleBody": "Al contrario que en el resto de los 364 días del año, este domingo 1 de noviembre, Día de Todos los Santos, el cementerio de Boisaca, en Santiago, se ha llenado de vida con el trasiego de miles de compostelanos que han acudido a visitar a sus seres queridos.",
      "url": "https://www.elcorreogallego.es/fotos/santiago/2026/11/01/cementerio-boisaca-santiago-visitas-dia-todos-santos-135978905.html",
      "associatedMedia": [
        {
          "@type": "ImageObject",
          "contentUrl": "https://estaticos-cdn.prensaiberica.es/clip/32736611-7375-4306-bfba-d8e5e496d3b6_alta-libre-aspect-ratio_default_0_x832y369.jpg",
          "caption": "261101ECG_Antonio Hernández Rios_247309873"
        },
        {
          "@type": "ImageObject",
          "contentUrl": "https://estaticos-cdn.prensaiberica.es/clip/0fbde390-e086-434d-a6aa-e1adbce5feb6_alta-libre-aspect-ratio_default_0_x824y366.jpg",
          "caption": "261101ECG_Antonio Hernández Rios_247309874"
        }
      ],
      "image": {
        "@type": "ImageObject",
        "url": "https://estaticos-cdn.prensaiberica.es/clip/11d3f5d4-b052-4405-9a86-32cc6169398d_alta-libre-aspect-ratio_default_0_x797y354.jpg"
      }
    }
  ];
  for (const noticia of muestras){
    const [g] = galeriasDeJSONLD([noticia], noticia.url);
    assert.equal(g.principal, true);
    assert.equal(g.imagenes.length, 2);
    assert.equal(g.imagenes[0].src, noticia.associatedMedia[0].contentUrl);
    assert.equal(g.imagenes[0].caption, noticia.associatedMedia[0].caption);
    assert.equal(g.metadata.articleBody, noticia.articleBody);
    assert.ok(g.imagenes.every(im => im.src !== noticia.image.url));
    // La misma colección en una noticia normal no acredita una fotogalería.
    const url = noticia.url.replace('/fotos/', '/noticia/');
    assert.deepEqual(galeriasDeJSONLD([{ ...noticia, url }], url), []);
  }
});

test('20minutos: ImageGallery.hasPart contiene las fotos y sus posiciones', () => {
  const muestra = {
    "@type": "ImageGallery",
    "url": "https://www.20minutos.es/madrid/transformacion-estacion-bernabeu-metro-madrid-imagenes_7052720_1.html",
    "hasPart": [
      {
        "@type": "ImageObject",
        "contentUrl": "https://www.20minutos.es/files/image_1920_1080/uploads/imagenes/2026/10/23/6adb637369ed02-99989170.jpeg",
        "position": 1,
        "caption": "La configuración antigua de la estación de Santiago Bernabéu ha desaparecido por completo tras la demolición en andenes, pasillos y vestíbulos."
      },
      {
        "@type": "ImageObject",
        "contentUrl": "https://www.20minutos.es/files/image_1920_1080/uploads/imagenes/2026/10/23/6adb63ac132352-66062173.jpeg",
        "position": 2,
        "caption": "La remodelación de la estación permitirá triplicar su superficie e incorporar 12 ascensores y 24 escaleras mecánicas."
      }
    ]
  };
  const [g] = galeriasDeJSONLD([{ ...muestra, hasPart: [...muestra.hasPart].reverse() }], muestra.url);
  assert.equal(g.principal, true);
  assert.equal(g.imagenes.length, 2);
  assert.equal(g.imagenes[0].src, muestra.hasPart[0].contentUrl);
  assert.equal(g.imagenes[0].caption, muestra.hasPart[0].caption);
  assert.equal(g.imagenes[1].posicion, 2);
});

test('PontevedraViva: type sin @ reconoce el artículo y veta una galería huérfana principal', () => {
  const noticia = {
    "type": "NewsArticle",
    "articleBody": "Los Reyes Magos llegaron este lunes al concello de Pontevedra subidos a modernos vehículos eléctricos, elegantemente decorados con enormes coronas reales, demostrando que la magia también puede ser sostenible."
  };
  const art = { headline: 'Recepción', rawBody: noticia.articleBody, rawHTML: '<p>Recepción</p>', _source: 'readability' };
  for (const datos of [[noticia, galeria()], [galeria(), noticia]]){
    const r = completar(art, datos);
    assert.equal(r.galeriaPrincipal, false);
    assert.equal(r.galerias[0].principal, false);
    assert.equal(r.rawBody, art.rawBody);
    assert.equal(r.rawHTML, art.rawHTML);
    assert.equal(r._source, art._source);
  }
  const { '@type': tipo, ...fotos } = galeria();
  const [g] = galeriasDeJSONLD([{ type: 'NewsArticle', hasPart: { ...fotos, type: tipo } }], URL_ART);
  assert.equal(g.principal, false);
  assert.equal(g.imagenes.length, 3);
});
