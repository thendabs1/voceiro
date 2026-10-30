// shared/tiempo/lugares.js
// Búsqueda de municipios para eltiempo: en el navegador, sobre la lista que
// genera scripts/generar-municipios.mjs (shared/tiempo/municipios.js, que se
// carga solo al escribir eltiempo:). El cliente busca; el worker resuelve el
// INE a coordenadas y zona.

import { normalize } from '../parser.js?v=ec7da24eed';
import { PROVINCIAS } from '../territorios/administracion.js?v=ec7da24eed';

export { PROVINCIAS };

export const provinciaDe = ine => PROVINCIAS[String(ine).slice(0, 2)] || '';

// «A Coruña» también se encuentra por «Coruña»; «L'Hospitalet», por «Hospitalet».
const ARTICULO = /^(el|la|los|las|a|o|as|os|l'|les|els|es|sa|ses) +|^l'/;

// Cada municipio con sus claves: una por nombre (los bilingües van con
// barra) y otra sin el artículo inicial.
export function indexar(lista) {
  return lista.map(([nombre, ine, hab]) => {
    const claves = new Set();
    for (const parte of nombre.split('/')) {
      const k = normalize(parte).trim();
      claves.add(k);
      claves.add(k.replace(ARTICULO, ''));
    }
    return { nombre, ine, hab, claves: [...claves] };
  });
}

// Primero los que empiezan por el texto y luego, desde 3 letras, los que lo
// contienen. La lista viene de más a menos habitantes: ese es el orden.
export function sugerirMunicipios(indice, texto, max = 6) {
  const q = normalize(texto).trim();
  if (!q) return [];
  const empieza = [], contiene = [];
  for (const m of indice) {
    if (m.claves.some(k => k.startsWith(q))) {
      empieza.push(m);
      if (empieza.length >= max) break;
    } else if (q.length >= 3 && contiene.length < max && m.claves.some(k => k.includes(q))) {
      contiene.push(m);
    }
  }
  return [...empieza, ...contiene].slice(0, max);
}

// Coincidencias exactas. Puede haber varias: hay nombres repetidos en
// provincias distintas (Arroyomolinos, Castejón…).
export function municipiosExactos(indice, texto) {
  const q = normalize(texto).trim();
  if (!q) return [];
  return indice.filter(m => m.claves.includes(q));
}
