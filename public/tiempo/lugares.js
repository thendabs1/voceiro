// shared/tiempo/lugares.js
// Búsqueda de municipios para eltiempo: en el navegador, sobre la lista que
// genera scripts/generar-municipios.mjs (shared/tiempo/municipios.js, que se
// carga solo al escribir eltiempo:). El cliente busca; el worker resuelve el
// INE a coordenadas y zona.

import { normalize } from '../parser.js?v=6b49a74614';

export const PROVINCIAS = {
  '01': 'Araba/Álava', '02': 'Albacete', '03': 'Alicante/Alacant', '04': 'Almería',
  '05': 'Ávila', '06': 'Badajoz', '07': 'Illes Balears', '08': 'Barcelona',
  '09': 'Burgos', '10': 'Cáceres', '11': 'Cádiz', '12': 'Castellón/Castelló',
  '13': 'Ciudad Real', '14': 'Córdoba', '15': 'A Coruña', '16': 'Cuenca',
  '17': 'Girona', '18': 'Granada', '19': 'Guadalajara', '20': 'Gipuzkoa',
  '21': 'Huelva', '22': 'Huesca', '23': 'Jaén', '24': 'León',
  '25': 'Lleida', '26': 'La Rioja', '27': 'Lugo', '28': 'Madrid',
  '29': 'Málaga', '30': 'Murcia', '31': 'Navarra', '32': 'Ourense',
  '33': 'Asturias', '34': 'Palencia', '35': 'Las Palmas', '36': 'Pontevedra',
  '37': 'Salamanca', '38': 'Santa Cruz de Tenerife', '39': 'Cantabria', '40': 'Segovia',
  '41': 'Sevilla', '42': 'Soria', '43': 'Tarragona', '44': 'Teruel',
  '45': 'Toledo', '46': 'Valencia/València', '47': 'Valladolid', '48': 'Bizkaia',
  '49': 'Zamora', '50': 'Zaragoza', '51': 'Ceuta', '52': 'Melilla',
};

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
