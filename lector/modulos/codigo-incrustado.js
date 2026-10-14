// Código incrustado en el articleBody del JSON-LD.
//
// Algunos CMS sacan el articleBody quitando las etiquetas al HTML del
// cuerpo, pero sin quitar antes <style> ni <script>. Así, el CSS y el JS de
// un gráfico interactivo acaban dentro del texto, en la misma línea que la
// prosa (Onm, en Nós Diario). Aquí se quitan esos tramos.
//
// Un tramo empieza en algo que solo puede ser código: una regla CSS
// («sel{prop:»), «(function(», «var x =» o «function f(». Termina cuando,
// fuera de cadenas y con todo cerrado, vienen palabras sin símbolos de
// código. Hay que seguir las comillas porque el JS lleva prosa en sus
// cadenas ('Pasa o rato polo gráfico…'), y esa prosa, sola, parece texto.
//
// Sin DOM ni nada de fuera: lector/build.mjs lo mete tal cual en el lector
// y tests/lector lo prueba con node --test.

// Una palabra (lo que hay entre espacios) que delata código.
const SIMBOLOS = /[{}=<>[\]]|;\S|\(\)|=>|&&|\|\||^(?:var|function|return|if|const|let|else)$|[a-z]\(|\d+px|:#|--\w|[+,([]'|'[,)+\];]/;
// Dónde empieza un tramo; el grupo 1 es el código, sin el espacio de antes.
const INICIO = /(?:^|\s)((?:[.#@*>][\w.#:>*-]*,?\s+)*[.#@]?[\w.#:>*-]+\{[\w-]+:|\(function\s*\(|var \w+\s*=|function \w+\s*\()/gi;
const PALABRAS_LIMPIAS = 6;   // las que cierran un tramo
const PROSA_LARGA = 12;       // respaldo si las llaves o las comillas no cuadran

function esCodigo(palabra){ return SIMBOLOS.test(palabra); }

function sigueProsa(texto, desde){
  return !texto.slice(desde, desde + 400).split(/\s+/).filter(Boolean)
    .slice(0, PALABRAS_LIMPIAS).some(esCodigo);
}

// Si nada cuadra (una comilla o una llave sin cerrar), el tramo acaba en la
// última palabra de código antes de PROSA_LARGA palabras limpias seguidas.
function finPorPalabras(texto, inicio){
  const re = /\S+/g;
  re.lastIndex = inicio;
  let ultimo = inicio, limpias = 0, m;
  while ((m = re.exec(texto))){
    if (esCodigo(m[0])){ ultimo = m.index + m[0].length; limpias = 0; }
    else if (++limpias >= PROSA_LARGA) break;
  }
  return ultimo;
}

function finDelTramo(texto, inicio){
  let abiertas = 0, comilla = null;
  for (let j = inicio; j < texto.length; j++){
    const ch = texto[j];
    if (comilla){
      if (ch === '\\') j++;
      else if (ch === comilla) comilla = null;
      continue;
    }
    if (ch === '"' || ch === "'"){ comilla = ch; continue; }
    if (ch === '{' || ch === '(' || ch === '['){ abiertas++; continue; }
    if (ch === '}' || ch === ')' || ch === ']') abiertas = Math.max(0, abiertas - 1);
    if (abiertas === 0 && (ch === ';' || ch === '}' || ch === ')')){
      let k = j + 1;
      while (texto[k] === ';') k++;
      if (sigueProsa(texto, k)) return k;
    }
  }
  return finPorPalabras(texto, inicio);
}

export function limpiarCodigoIncrustado(texto){
  texto = String(texto || '');
  const re = new RegExp(INICIO.source, INICIO.flags);
  const trozos = [];
  let pos = 0, m;
  while ((m = re.exec(texto))){
    const ini = m.index + m[0].length - m[1].length;
    const fin = finDelTramo(texto, ini);
    if (fin <= ini){ re.lastIndex = ini + 1; continue; }
    trozos.push(texto.slice(pos, ini));
    pos = re.lastIndex = fin;
  }
  if (!trozos.length) return texto;
  trozos.push(texto.slice(pos));
  return trozos.join('').replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').trim();
}
