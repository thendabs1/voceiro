// Generado desde shared/busqueda/texto.js por scripts/sync-workers.mjs. No editar.
// shared/busqueda/texto.js
// Regla única del texto libre: la usan el filtro local y el resaltado.
// Ver la especificación del buscador.
//
// Semántica:
//   palabra        → alguna palabra del titular EMPIEZA por ella ("eleccion" → "elecciones")
//   palabra-compuesta (covid-19, EE.UU) → sus partes seguidas; la última, por inicio
//   "frase"        → esas palabras seguidas y completas
//   -palabra       → excluye los titulares con alguna palabra que empiece por ella
//   Todas las palabras/frases tienen que aparecer (AND).
//   Las palabras sueltas de 1-2 letras se ignoran (salvo entre comillas).
//
// Partir palabras: igual que FTS5 con tokenize='unicode61 remove_diacritics 2':
// minúsculas, sin tildes, y cualquier carácter que no sea letra o número separa.

const ES_PALABRA = /[\p{L}\p{N}]/u;
const MIN_LONGITUD = 3;

function _plegar(c) {
  return c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Devuelve [{ t, i, j }]: palabra normalizada y su posición [i, j) en el texto original.
export function tokenizar(texto) {
  const out = [];
  const s = texto || '';
  let actual = '';
  let inicio = -1;
  let k = 0;
  for (const c of s) {               // por code points
    if (ES_PALABRA.test(c)) {
      if (inicio < 0) inicio = k;
      actual += _plegar(c);
    } else if (inicio >= 0) {
      out.push({ t: actual, i: inicio, j: k });
      actual = ''; inicio = -1;
    }
    k += c.length;
  }
  if (inicio >= 0) out.push({ t: actual, i: inicio, j: k });
  return out;
}

// Versión rápida para filtrar (sin posiciones): normaliza y parte el texto
// entero de una vez. Parte igual que tokenizar (hay un test que lo comprueba);
// tokenizar queda para el resaltado, que necesita las posiciones.
const SEPARADOR = /[^\p{L}\p{N}]+/u;
export function palabrasDe(texto) {
  const s = (texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const out = [];
  for (const t of s.split(SEPARADOR)) if (t) out.push({ t });
  return out;
}

const _partes = s => palabrasDe(s).map(x => x.t);

// tokens: salida de tokenizeQuery (shared/parser.js) SIN prefijo, es decir,
// los que el parser trata como texto libre.
// Devuelve { incluir: [termino], excluir: [termino] } con
// termino = { partes: [...], prefijo: bool } (prefijo se aplica a la última parte).
export function compilarTexto(tokens) {
  const incluir = [];
  const excluir = [];
  for (const tk of tokens || []) {
    if (tk.prefix) continue;
    if (tk.quoted) {
      const partes = _partes(tk.text);
      if (partes.length) incluir.push({ partes, prefijo: false });
      continue;
    }
    let texto = tk.text;
    let destino = incluir;
    if (texto.length > 1 && texto[0] === '-') {
      texto = texto.slice(1);
      destino = excluir;
    }
    const partes = _partes(texto.replace(/\*+$/, ''));
    if (!partes.length) continue;
    // Palabra suelta corta: demasiado común como inicio de palabra ("de" → deporte, decreto…).
    if (partes.length === 1 && partes[0].length < MIN_LONGITUD) continue;
    destino.push({ partes, prefijo: true });
  }
  return { incluir, excluir };
}

export function textoVacio(c) {
  return !c || (!c.incluir.length && !c.excluir.length);
}

// ¿Aparece el término en la lista de palabras? Los temas =Palabra aportan
// «caso» y necesitan posiciones del titular para comprobar la capitalización.
// Devuelve el índice de inicio o -1.
function _buscar(palabras, termino, titular) {
  const { partes, prefijo } = termino;
  const n = partes.length;
  for (let i = 0; i + n <= palabras.length; i++) {
    let ok = true;
    for (let k = 0; k < n; k++) {
      const w = palabras[i + k].t;
      const p = partes[k];
      const ultima = k === n - 1;
      if (ultima && prefijo ? !w.startsWith(p) : w !== p) { ok = false; break; }
      if (termino.caso && (!titular ||
          titular.slice(palabras[i + k].i, palabras[i + k].j)
            .normalize('NFD').replace(/[̀-ͯ]/g, '') !== termino.caso)) { ok = false; break; }
    }
    if (ok) return i;
  }
  return -1;
}

// palabras: palabrasDe(titular) o tokenizar(titular) (se puede cachear por item).
export function coincide(palabras, compilado, titular) {
  if (textoVacio(compilado)) return true;
  for (const t of compilado.incluir) if (_buscar(palabras, t, titular) < 0) return false;
  for (const t of compilado.excluir) if (_buscar(palabras, t, titular) >= 0) return false;
  return true;
}

// Rangos [i, j) del titular original que hay que resaltar: todas las
// apariciones de los términos incluidos (no los excluidos). Un término
// `debil` (una palabra vacía de un tema: «de» en «caldas de reis») solo se
// resalta pegado a otro resaltado: «Caldas de Reis» sí, «más de dos» no.
export function rangosResaltado(titular, compilado) {
  if (!compilado || !compilado.incluir.length) return [];
  const palabras = tokenizar(titular);
  const fuertes = [];
  const debiles = [];
  for (const t of compilado.incluir) {
    const n = t.partes.length;
    for (let i = 0; i + n <= palabras.length; i++) {
      if (_buscar(palabras.slice(i, i + n), t, titular) === 0) (t.debil ? debiles : fuertes).push([i, i + n]);
    }
  }
  // En índices de palabra; las débiles se suman mientras toquen algo marcado
  // («de la» entre dos términos).
  const marcadas = new Set();
  for (const [a, b] of fuertes) for (let k = a; k < b; k++) marcadas.add(k);
  for (let cambio = true; cambio;) {
    cambio = false;
    for (let x = debiles.length - 1; x >= 0; x--) {
      const [a, b] = debiles[x];
      if (!marcadas.has(a - 1) && !marcadas.has(b)) continue;
      for (let k = a; k < b; k++) marcadas.add(k);
      fuertes.push(debiles[x]);
      debiles.splice(x, 1);
      cambio = true;
    }
  }
  const rangos = fuertes.map(([a, b]) => [palabras[a].i, palabras[b - 1].j]);
  rangos.sort((a, b) => a[0] - b[0]);
  const unidos = [];
  for (const r of rangos) {
    const u = unidos[unidos.length - 1];
    if (u && r[0] <= u[1]) u[1] = Math.max(u[1], r[1]);
    else unidos.push([...r]);
  }
  return unidos;
}

// Expresión FTS5 equivalente (tabla con tokenize='unicode61 remove_diacritics 2').
// FTS5 no admite un NOT sin nada a la izquierda: si solo hay exclusiones, se
// devuelve '' y la exclusión se aplica después con coincide().
export function compilarFts(compilado) {
  if (!compilado || !compilado.incluir.length) return '';
  const fts = t => '"' + t.partes.join(' ').replace(/"/g, '""') + '"' + (t.prefijo ? '*' : '');
  let q = compilado.incluir.map(fts).join(' AND ');
  for (const t of compilado.excluir) q += ' NOT ' + fts(t);
  return q;
}
