// shared/busqueda/temas.js
// Temas de un modo: cada línea de «palabras» es una búsqueda pequeña con la
// regla del buscador (texto.js): inicio de palabra, todas las palabras de la
// línea, "frase exacta", -excluir. =Portas exige palabra completa y las mismas
// mayúsculas/minúsculas (las tildes se siguen ignorando). Una noticia casa si casa con
// alguno (OR entre líneas).
//
// Única diferencia con la caja de búsqueda: las palabras sueltas de 1-2 letras
// (PP, IA, UE) no se ignoran; casan como palabra completa, también al excluir
// (-PP). Un tema son pocas palabras escritas a propósito.
// Una línea sin nada que incluir (solo -excluir, o solo prefijos medio:…) no
// es un tema: no casaría nada.

import { tokenizeQuery } from '../parser.js?v=4c0fbd6fe5';
import { compilarTexto, coincide, palabrasDe, tokenizar } from './texto.js?v=4c0fbd6fe5';

const MIN_LONGITUD = 3;   // la de texto.js: por debajo, compilarTexto la ignora
const PALABRA_LITERAL = /^=[\p{L}\p{N}]+$/u;

// Token sin comillas de una sola palabra corta → término exacto.
// null si el token no es de ese tipo (lo compila texto.js).
function _corto(tk) {
  if (tk.prefix || tk.quoted) return null;
  let texto = tk.text;
  let excluir = false;
  if (texto.length > 1 && texto[0] === '-') { texto = texto.slice(1); excluir = true; }
  const partes = palabrasDe(texto.replace(/\*+$/, '')).map(x => x.t);
  if (partes.length !== 1 || partes[0].length >= MIN_LONGITUD) return null;
  const termino = { partes, prefijo: false };
  return excluir ? { incluir: [], excluir: [termino] } : { incluir: [termino], excluir: [] };
}

// lineas: las palabras del modo, una por elemento (parseLista).
// Devuelve [{ etiqueta, compilado }]; etiqueta es la línea tal como se escribió.
export function compilarTemas(lineas) {
  const out = [];
  for (const linea of lineas || []) {
    const etiqueta = String(linea || '').trim();
    if (!etiqueta) continue;
    const incluir = [];
    const excluir = [];
    for (const tk of tokenizeQuery(etiqueta)) {
      if (!tk.prefix && !tk.quoted && PALABRA_LITERAL.test(tk.text)) {
        const palabra = tk.text.slice(1);
        incluir.push({ partes: palabrasDe(palabra).map(x => x.t), prefijo: false,
          caso: palabra.normalize('NFD').replace(/[̀-ͯ]/g, '') });
        continue;
      }
      const c = _corto(tk) || compilarTexto([tk]);
      incluir.push(...c.incluir);
      excluir.push(...c.excluir);
    }
    if (incluir.length) out.push({ etiqueta, compilado: { incluir, excluir },
      sensible: incluir.some(t => t.caso) });
  }
  return out;
}

// Etiqueta para mostrar: la línea sin exclusiones ni prefijos
// («incendio -forestal» → «incendio»).
export function etiquetaVisible(etiqueta) {
  return tokenizeQuery(etiqueta || '')
    .filter(tk => !tk.prefix && (tk.quoted || !(tk.text.length > 1 && tk.text[0] === '-')))
    .map(tk => tk.raw.replace(/^=/, ''))
    .join(' ');
}

// titular es necesario si hay términos =Palabra; solo entonces se tokeniza
// de nuevo para disponer de las posiciones originales.
// Devuelve las etiquetas de los temas que casan, en el orden de las líneas.
export function temasQueCasan(palabras, temas, titular) {
  const out = [];
  let palabrasCaso;
  for (const tema of temas || []) {
    if (tema.sensible && titular && !palabrasCaso) palabrasCaso = tokenizar(titular);
    if (coincide(tema.sensible ? palabrasCaso || palabras : palabras, tema.compilado, titular))
      out.push(tema.etiqueta);
  }
  return out;
}

// Compilado para rangosResaltado con los términos incluidos de los temas
// indicados (los que casaron). Las exclusiones no se resaltan.
export function compiladoDeTemas(temas, etiquetas) {
  const quiero = new Set(etiquetas || []);
  const incluir = [];
  for (const tema of temas || []) {
    if (quiero.has(tema.etiqueta)) incluir.push(...tema.compilado.incluir);
  }
  return { incluir, excluir: [] };
}
