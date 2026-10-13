// shared/busqueda/consulta.js
// Punto de entrada del núcleo: la consulta se interpreta UNA vez (en el
// navegador, que tiene el catálogo y el reloj) y todos los consumidores usan
// el resultado: filtro local, petición al archivo (Turso) y petición a prensa.
//
//   const c = interpretarConsulta(raw, { catalogo, ahora });
//   c.pasa({ dominio, titular, ts, palabras })  → ¿entra en la lista?
//     (palabras = palabrasDe(titular), opcional; conviene cachearlo por item)
//   c.clave                                      → identidad de la búsqueda
//   paraArchivo(c) / paraPrensa(c)               → texto para /buscar?raw=

import { parseQuery, tokenizeQuery } from '../parser.js?v=2b0fc10b35';
import { compilarTexto, coincide, palabrasDe, textoVacio } from './texto.js?v=2b0fc10b35';
import { resolverMedios, pasaMedios } from './filtros.js?v=2b0fc10b35';
import { resolverVentana, pasaVentana, hayVentana } from './tiempo.js?v=2b0fc10b35';

const ORDENES = new Set(['recientes', 'antiguos', 'relevancia']);

export function interpretarConsulta(raw, { catalogo = {}, ahora = Date.now() } = {}) {
  const parsed = parseQuery(raw || '');
  // El texto libre sale de los tokens (necesita saber qué va entre comillas);
  // los que parseQuery tomó como dominio no son texto.
  const tokensTexto = tokenizeQuery(raw || '').filter(tk => {
    if (tk.prefix) return false;
    return !parsed.chips.some(ch => ch.type === 'dominio' && ch.raw === tk.raw);
  });
  const texto = compilarTexto(tokensTexto);
  const medios = resolverMedios(parsed, catalogo);
  const ventana = resolverVentana(parsed, ahora);
  const orden = ORDENES.has(parsed.order) ? parsed.order : 'recientes';

  // Clave estable: lo que el usuario pidió, no los instantes ya resueltos
  // (desde:3h no cambia de clave con el paso del tiempo; un espacio tampoco).
  const filtros = parsed.chips
    .map(ch => `${ch.type}:${palabrasDe(ch.value).map(x => x.t).join(' ')}`)
    .sort();
  const clave = JSON.stringify([texto.incluir, texto.excluir, filtros, orden]);

  const pasa = ({ dominio, titular, ts, palabras }) =>
    pasaMedios(dominio, medios)
    && pasaVentana(ts, ventana)
    && coincide(palabras || palabrasDe(titular), texto);

  // Para fuentes externas (prensa): medios y fechas sí, el texto no, porque
  // el proveedor busca también en el cuerpo y exigir las palabras en el
  // titular descartaría resultados buenos.
  const pasaFiltros = ({ dominio, ts }) => pasaMedios(dominio, medios) && pasaVentana(ts, ventana);

  return {
    raw: raw || '', parsed, texto, medios, ventana, orden, clave, pasa, pasaFiltros,
    vacia: textoVacio(texto) && medios.dominios === null && !hayVentana(ventana),
    // Un filtro de medio sin coincidencias (medio:noexiste) da 0 resultados:
    // no hay que pedir nada fuera (sin web: el worker devolvería de todo).
    imposible: medios.dominios !== null && medios.dominios.size === 0,
  };
}

const _comillas = partes => `"${partes.join(' ')}"`;
const _fechas = c => [
  c.ventana.desde ? `desde:${c.ventana.desde.dia}` : '',
  c.ventana.hasta ? `hasta:${c.ventana.hasta.dia}` : '',
];

// Para el archivo (worker → Turso). El worker construye el FTS con
// buildFtsQuery: 'x*' → "x"* (inicio de palabra), '"a b"' → frase.
// Las exclusiones no se envían (el worker no tiene NOT): se aplican al
// filtrar el resultado con c.pasa. Los medios viajan como lista exacta de
// dominios; las fechas como días de Madrid (cota gruesa: se afina con c.pasa).
export function paraArchivo(c) {
  const partes = c.texto.incluir.map(t =>
    t.prefijo ? `${t.partes.join('-')}*` : _comillas(t.partes));
  if (c.medios.dominios) for (const d of c.medios.dominios) partes.push(`web:${d}`);
  partes.push(..._fechas(c));
  if (c.orden !== 'recientes') partes.push(`order:${c.orden}`);
  return partes.filter(Boolean).join(' ');
}

// Para prensa externa (Google News, FreeNews): sintaxis del proveedor.
// Palabras tal cual, frases entre comillas, -exclusiones; dominios solo si
// son pocos (site:); el resto de filtros se aplica al filtrar con c.pasa.
export function paraPrensa(c) {
  const partes = c.texto.incluir.map(t => t.prefijo ? t.partes.join(' ') : _comillas(t.partes));
  for (const t of c.texto.excluir) partes.push(`-${t.partes.join(' ')}`);
  const doms = c.medios.dominios ? [...c.medios.dominios] : [];
  if (doms.length && doms.length <= 3) for (const d of doms) partes.push(`web:${d}`);
  partes.push(..._fechas(c));
  return partes.filter(Boolean).join(' ');
}
