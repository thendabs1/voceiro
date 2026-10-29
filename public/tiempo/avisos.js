// shared/tiempo/avisos.js
// Avisos de AEMET en el navegador (alertas:): nombres de las zonas, filtro,
// agrupación para el panel y resumen para el icono de la cabecera. Los
// avisos llegan del worker de Deno (/avisos), ya sin verdes ni caducados.
//
// La zona de AEMET lleva comunidad, provincia (o isla) y zona: 71 36 01 es
// Galicia, Pontevedra, Rías Baixas; las costeras acaban en C.

import { normalize } from '../parser.js?v=470aa3766d';
import { PROVINCIAS } from './lugares.js?v=470aa3766d';

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

// Una línea por comunidad, con todos sus niveles juntos («[GALICIA] Naranja
// Lluvias · Amarillo Vientos · 3 zonas»): primero lo más grave y lo que ya
// ha empezado. Dentro, los avisos por nivel, por lo que ya empezó, por hora,
// fenómeno y zona. Las horas de la línea son las del nivel más alto;
// varios: si entre ellas hay huecos (6-12 y 18-23), que no se lean como
// un periodo seguido.
export function agruparAvisos(avisos, ahora = Date.now()) {
  const por = new Map();
  for (const a of avisos) {
    const k = String(a.zona).slice(0, 2);
    if (!por.has(k)) por.set(k, []);
    por.get(k).push(a);
  }
  return [...por.entries()]
    .map(([clave, lista]) => {
      lista.sort((a, b) => PESO[b.nivel] - PESO[a.nivel]
        || empezado(b, ahora) - empezado(a, ahora)
        || Date.parse(a.inicio) - Date.parse(b.inicio)
        || FENOMENOS.indexOf(a.fen) - FENOMENOS.indexOf(b.fen)
        || a.zona.localeCompare(b.zona));
      const iso = ms => new Date(ms).toISOString();
      const nivel = lista[0].nivel;
      const alto = lista.filter(a => a.nivel === nivel);
      let hasta = -Infinity, varios = false;
      for (const a of [...alto].sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio))) {
        if (hasta > -Infinity && Date.parse(a.inicio) > hasta) varios = true;
        hasta = Math.max(hasta, Date.parse(a.fin));
      }
      const niveles = [...new Set(lista.map(a => a.nivel))]
        .map(n => ({ nivel: n, fens: [...new Set(lista.filter(a => a.nivel === n).map(a => a.fen))] }));
      return {
        clave, zona: lista[0].zona, comunidad: comunidadDeZona(lista[0].zona),
        nivel, niveles,
        zonas: new Set(lista.map(a => a.zona)).size,
        inicio: iso(Math.min(...alto.map(a => Date.parse(a.inicio)))),
        fin: iso(Math.max(...alto.map(a => Date.parse(a.fin)))),
        varios,
        avisos: lista,
      };
    })
    .sort((a, b) => PESO[b.nivel] - PESO[a.nivel]
      || empezado(b, ahora) - empezado(a, ahora)
      || Date.parse(a.inicio) - Date.parse(b.inicio)
      || a.comunidad.localeCompare(b.comunidad));
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

// «Buscar noticias relacionadas» (aplazado, 21-10-2026): se probó con la
// palabra del fenómeno y la comunidad, desde ayer, en el corpus. Pierde lo
// que solo nombra la ciudad (Vigo y no Galicia) y trae ruido («temporal»
// casa con «empleo temporal»). Para retomarlo: lanzarla con la prensa
// externa activada solo para esa búsqueda, palabras menos ambiguas
// («temporal marítimo», «oleaje») y provincia además de comunidad.
