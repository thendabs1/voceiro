import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { limpiarPromosTextoFinal } from '../../lector/modulos/mixto.js';
import { limpiarCodigoIncrustado } from '../../lector/modulos/codigo-incrustado.js';

// Texto de las dos cajas que PontevedraViva añade al HTML y al JSON-LD.
const WHATSAPP = 'Subscríbete á nosa canle de WhatsApp\n\n' +
  'Recibe as noticias de actualidade directamente no teu móbil.\n\nSubscribirse';
const GOOGLE = 'Engade Pontevedra Viva como fonte preferida de Google de balde\n\n' +
  'Mantente informado coas últimas noticias de actualidade.\n\nActivar agora';
const CUERPO = 'A noticia explica os cambios nas canles de WhatsApp e nas fontes preferidas de Google. '.repeat(4).trim();

test('quita las dos promociones completas del final del JSON, juntas o por separado', () => {
  for (const promo of [WHATSAPP, GOOGLE, WHATSAPP + '\n\n' + GOOGLE, GOOGLE + '\n\n' + WHATSAPP]){
    for (const separar of [s => s, s => s.replace(/\s+/g, ' ')]){
      assert.equal(limpiarPromosTextoFinal(CUERPO + '\n\n' + separar(promo) + '\n  '), CUERPO);
    }
  }
});

test('conserva menciones, llamadas aisladas, cajas incompletas y promociones dentro del artículo', () => {
  for (const texto of [CUERPO, CUERPO + '\nActivar agora', CUERPO + '\nSubscribirse',
    CUERPO + '\n' + GOOGLE.replace('Activar agora', ''),
    CUERPO + '\n' + WHATSAPP.replace('Recibe as noticias', 'Recibe outras noticias'),
    WHATSAPP + '\n' + CUERPO, CUERPO + '\n' + GOOGLE + '\nO artigo continúa.',
    '  Texto sen promocións.\n\n']){
    assert.equal(limpiarPromosTextoFinal(texto), texto);
  }
});

const fuente = readFileSync(new URL('../../lector/src/17-extractores-de-articulo.js', import.meta.url), 'utf8');
function extractor(extra = {}){
  const contexto = vm.createContext({ limpiarPromosTextoFinal, limpiarCodigoIncrustado,
    metaContent: () => '', UI: { extractMinChars: 100 }, ...extra });
  vm.runInContext(fuente, contexto);
  // Sin HTML en esta muestra JSON: no hace falta un DOM para decodificarlo.
  contexto.decodeEnt = s => s;
  return codigo => vm.runInContext(codigo, contexto);
}

test('buildFromJSONLD limpia las promociones antes de crear los párrafos', () => {
  const run = extractor({ ld: { headline: 'Noticia', articleBody: CUERPO + '\n' + WHATSAPP + '\n' + GOOGLE } });
  assert.equal(run('buildFromJSONLD(ld).rawBody'), CUERPO);
  assert.equal(run('buildFromJSONLD(ld).headline'), 'Noticia');
});

// Doble del DOM: los nodos mantienen el texto y las clases; cada clon tiene
// sus propios nodos. Permite comprobar qué recibe cada ruta de extracción.
function raiz(){
  const nodos = [
    { clase: '', texto: CUERPO },
    { clase: 'c-whatsapp-subscribe', texto: WHATSAPP },
    { clase: 'c-fonts-preferred', texto: GOOGLE }
  ];
  return {
    get textContent(){ return nodos.map(n => n.texto).join('\n'); },
    get innerHTML(){ return nodos.map(n => '<p>' + n.texto + '</p>').join(''); },
    cloneNode: () => raiz(),
    querySelector: () => null,
    querySelectorAll(sel){
      return nodos.filter(n => n.clase && sel.split(',').includes('.' + n.clase))
        .map(n => ({ remove(){ nodos.splice(nodos.indexOf(n), 1); } }));
    }
  };
}

test('Readability, Todo y el selector reciben HTML sin las dos cajas; el original se conserva', () => {
  for (const llamada of ['extractFromReadability()', 'extractFromAll()', 'extractFromSelector(".cuerpo", "", 100)']){
    const original = raiz();
    const document = { cloneNode: () => original.cloneNode(true),
      querySelector: sel => sel === '.cuerpo' ? original : null };
    const run = extractor({ document,
      Readability: class {
        constructor(clone){ this.clone = clone; }
        parse(){ return { textContent: this.clone.textContent, content: this.clone.innerHTML }; }
      }
    });
    assert.equal(run(llamada).rawBody, CUERPO);
    assert.match(original.textContent, /Subscríbete/);
    assert.match(original.textContent, /Activar agora/);
  }
});
