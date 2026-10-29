// shared/busqueda/filtros.js
// Filtros por medio: medio:, web:/dominio:, grupo:, tipo:, tag:, lang:.
// Se resuelven UNA vez contra el catálogo a un conjunto exacto de dominios,
// que sirve igual para el filtro local, para pedir a la prensa (site:) y
// para post-filtrar fuentes externas.
//
// Semántica (ver la especificación del buscador):
//   - OR dentro del mismo filtro, AND entre filtros distintos.
//   - medio: y web: son el mismo filtro ("fuente"): OR entre ellos.
//   - grupo/tipo/tag/medio casan por inicio de palabra, con la misma regla
//     que el texto libre: grupo:valencia → «Comunidad Valenciana»,
//     grupo:nacional → «Nacional» pero no «Internacional · …».
//   - medio: casa también con el nombre sin espacios (medio:elpais → «El País»).
//   - web:x.com → ese dominio y sus subdominios; web:x (sin punto) → dominios
//     que empiezan por x.
//   - lang: idioma principal del medio, por código exacto.

import { palabrasDe, coincide } from './texto.js?v=f5f36294d8';

const _termino = valor => ({
  incluir: [{ partes: palabrasDe(valor).map(x => x.t), prefijo: true }],
  excluir: [],
});
const _compacto = s => palabrasDe(s).map(x => x.t).join('');

function _casaNombre(nombre, valor) {
  const t = _termino(valor);
  if (!t.incluir[0].partes.length) return false;
  return coincide(palabrasDe(nombre || ''), t);
}

export function limpiarDominio(d) {
  return String(d || '').toLowerCase().trim().replace(/^www\./, '');
}

function _casaDominio(dominio, valor) {
  const v = limpiarDominio(valor);
  if (!v) return false;
  if (v.includes('.')) return dominio === v || dominio.endsWith('.' + v);
  return dominio.startsWith(v);
}

// parsed: salida de parseQuery (los valores ya vienen normalizados, pero aquí
// se trabaja con el texto tal cual lo escribió el usuario, que llega en chips).
// catalogo: { dominio: { n, g, t, l, tags } }
// Devuelve { dominios: Set | null, desconocidos: [{ tipo, valor }] }
//   dominios = null → no hay filtro de medio.
export function resolverMedios(parsed, catalogo) {
  const valores = { fuente: [], grupo: [], tipo: [], tag: [], lang: [] };
  for (const ch of parsed.chips || []) {
    if (ch.type === 'medio') valores.fuente.push({ tipo: 'medio', valor: ch.value });
    else if (ch.type === 'dominio') valores.fuente.push({ tipo: 'dominio', valor: ch.value });
    else if (valores[ch.type]) valores[ch.type].push({ tipo: ch.type, valor: ch.value });
  }

  const dominiosCat = Object.keys(catalogo || {}).map(limpiarDominio);
  const info = d => (catalogo[d] || catalogo['www.' + d] || {});
  const desconocidos = [];
  let resultado = null;

  for (const faceta of Object.keys(valores)) {
    const lista = valores[faceta];
    if (!lista.length) continue;
    const conjunto = new Set();
    for (const { tipo, valor } of lista) {
      let algun = false;
      for (const d of dominiosCat) {
        const m = info(d);
        let ok = false;
        if (tipo === 'medio') {
          ok = _casaNombre(m.n, valor) || _compacto(m.n).startsWith(_compacto(valor));
        } else if (tipo === 'dominio') {
          ok = _casaDominio(d, valor);
        } else if (tipo === 'grupo') {
          ok = _casaNombre(m.g, valor);
        } else if (tipo === 'tipo') {
          ok = _casaNombre(m.t, valor);
        } else if (tipo === 'tag') {
          ok = (m.tags || []).some(tg => _casaNombre(tg, valor));
        } else if (tipo === 'lang') {
          ok = _compacto(m.l) === _compacto(valor);
        }
        if (ok) { conjunto.add(d); algun = true; }
      }
      // web:x.com fuera del catálogo: se respeta tal cual (puede venir de fuentes externas).
      if (tipo === 'dominio' && limpiarDominio(valor).includes('.')) {
        conjunto.add(limpiarDominio(valor)); algun = true;
      }
      if (!algun) desconocidos.push({ tipo, valor });
    }
    resultado = resultado === null
      ? conjunto
      : new Set([...resultado].filter(d => conjunto.has(d)));
  }
  return { dominios: resultado, desconocidos };
}

// ¿Pasa un dominio el filtro resuelto? Acepta subdominios de un dominio del conjunto.
export function pasaMedios(dominio, resuelto) {
  if (!resuelto || resuelto.dominios === null) return true;
  let d = limpiarDominio(dominio);
  while (d) {
    if (resuelto.dominios.has(d)) return true;
    const i = d.indexOf('.');
    if (i < 0) break;
    d = d.slice(i + 1);
  }
  return false;
}
