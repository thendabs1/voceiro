// shared/tiempo/avisos.js
// Avisos de AEMET en el navegador (alertas:): nombres de las zonas, filtro,
// agrupación para el panel y resumen para el icono de la cabecera. Los
// avisos llegan del worker de Deno (/avisos), ya sin verdes ni caducados.
//
// La zona de AEMET lleva comunidad, provincia (o isla) y zona: 71 36 01 es
// Galicia, Pontevedra, Rías Baixas; las costeras acaban en C.

import { normalize } from '../parser.js';
import { PROVINCIAS } from './lugares.js';

export const COMUNIDADES = {
  61: 'Andalucía', 62: 'Aragón', 63: 'Asturias', 64: 'Illes Balears', 65: 'Canarias',
  66: 'Cantabria', 67: 'Castilla y León', 68: 'Castilla-La Mancha', 69: 'Cataluña',
  70: 'Extremadura', 71: 'Galicia', 72: 'Madrid', 73: 'Murcia', 74: 'Navarra',
  75: 'País Vasco', 76: 'La Rioja', 77: 'Comunitat Valenciana', 78: 'Ceuta', 79: 'Melilla',
};

// Las islas tienen código propio en vez del de su provincia.
const ISLAS = { 53: '07', 54: '07', 55: '07', 90: '35', 91: '35', 92: '35', 93: '38', 94: '38', 95: '38', 96: '38' };

export const comunidadDeZona = zona => COMUNIDADES[String(zona).slice(0, 2)] || '';
export function provinciaDeZona(zona) {
  const p = String(zona).slice(2, 4);
  return PROVINCIAS[ISLAS[p] || p] || '';
}
// AEMET da las horas en la de cada sitio: Canarias, una menos.
export const zonaHorariaAviso = zona => (String(zona).startsWith('65') ? 'Atlantic/Canary' : 'Europe/Madrid');

export const FENOMENOS = ['PR', 'TO', 'VI', 'CO', 'NE', 'AT', 'BT', 'NI', 'VS', 'GA', 'RI', 'DH', 'AL'];
export const NIVELES = ['amarillo', 'naranja', 'rojo'];
export const PESO = { amarillo: 1, naranja: 2, rojo: 3 };

export const empezado = (a, ahora = Date.now()) => Date.parse(a.inicio) <= ahora;

// alertas:Galicia, alertas:Pontevedra, alertas:lluvia, alertas:naranja…
// nombres: { fen: { PR: ['Lluvias', 'Choivas'] }, nivel: { naranja: [...] } }
// con los textos del idioma de la página y del castellano.
export function filtrarAvisos(avisos, texto, nombres = {}) {
  const q = normalize(texto).trim();
  if (!q) return avisos;
  const casa = s => normalize(s).includes(q);
  return avisos.filter(a =>
    [a.area, comunidadDeZona(a.zona), provinciaDeZona(a.zona)].some(casa)
    || (nombres.fen?.[a.fen] || []).some(casa)
    || (nombres.nivel?.[a.nivel] || []).some(casa));
}

// Por fenómeno: primero el de nivel más alto; dentro, lo más grave, lo que
// ya ha empezado y por comunidad y zona.
export function agruparAvisos(avisos, ahora = Date.now()) {
  const por = new Map();
  for (const a of avisos) {
    if (!por.has(a.fen)) por.set(a.fen, []);
    por.get(a.fen).push(a);
  }
  const max = lista => Math.max(...lista.map(a => PESO[a.nivel]));
  return [...por.entries()]
    .map(([fen, lista]) => ({
      fen,
      nivel: NIVELES[max(lista) - 1],
      avisos: lista.sort((a, b) => PESO[b.nivel] - PESO[a.nivel]
        || empezado(b, ahora) - empezado(a, ahora)
        || a.zona.localeCompare(b.zona)
        || Date.parse(a.inicio) - Date.parse(b.inicio)),
    }))
    .sort((a, b) => PESO[b.nivel] - PESO[a.nivel] || b.avisos.length - a.avisos.length);
}

// Para el icono: solo naranja y rojo. null si no hay.
export function resumenAvisos(avisos, ahora = Date.now()) {
  const graves = avisos.filter(a => PESO[a.nivel] >= 2);
  if (!graves.length) return null;
  return {
    nivel: graves.some(a => a.nivel === 'rojo') ? 'rojo' : 'naranja',
    total: graves.length,
    ahora: graves.filter(a => empezado(a, ahora)).length,
  };
}

// «Ver noticias» desde un aviso naranja o rojo: palabra del fenómeno y
// comunidad, desde ayer.
const PALABRA = {
  PR: 'lluvia*', TO: 'tormenta*', VI: 'viento*', CO: 'temporal', NE: 'nev*', AT: 'calor',
  BT: 'frio', NI: 'niebla*', VS: 'calima', GA: 'galerna*', RI: 'rissaga*', DH: 'deshielo*', AL: 'alud*',
};
// Como lo suelen escribir los titulares, cuando no es el nombre oficial.
const EN_TITULARES = { 64: 'Baleares', 77: 'valencia*' };
export function busquedaNoticias(a) {
  const ccaa = EN_TITULARES[String(a.zona).slice(0, 2)] || comunidadDeZona(a.zona);
  const lugar = /\s/.test(ccaa) ? `"${ccaa}"` : ccaa;
  return [PALABRA[a.fen], lugar, 'desde:ayer'].filter(Boolean).join(' ');
}
