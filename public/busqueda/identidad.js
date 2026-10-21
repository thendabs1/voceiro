// shared/busqueda/identidad.js
// ¿Cuándo dos resultados son la misma noticia? (regla 5 de la especificación)
//   1. Misma URL canónica, o
//   2. mismo medio + mismo titular normalizado, o
//   3. si no se conoce el medio (Google News da redirecciones a
//      news.google.com y el nombre de la fuente no siempre está en el
//      catálogo), mismo titular normalizado.
// Agrupar varios medios que publican el mismo titular es otra cosa (la
// opción de agrupar duplicados de la vista) y no se decide aquí.
//
// Ojo: las claves de leídas/vistas siguen usando normalizeUrlForMatch de la
// plantilla; urlCanonica es solo para deduplicar y no las sustituye.

import { palabrasDe } from './texto.js?v=b3413f596c';
import { limpiarDominio } from './filtros.js?v=b3413f596c';

// Unión de las listas del front (normalizeUrlForMatch) y del recolector (_QUERY_RUIDO).
const PARAMS_RASTREO = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'mc_cid', 'mc_eid', 'igshid', '_ga', '_gl',
  'ref', 'referrer', 'rss', 'at_medium', 'at_campaign',
]);

// Hosts que no identifican la noticia (redirecciones de agregadores).
const REDIRECTORES = new Set(['news.google.com']);

export function esRedireccion(url) {
  try { return REDIRECTORES.has(limpiarDominio(new URL(url).hostname)); }
  catch (e) { return false; }
}

// u puede ser relativa al dominio (formato corto de R2 y del worker: "/ruta").
export function urlCanonica(u, dominio = '') {
  if (!u) return '';
  const s = String(u);
  const completa = /^https?:\/\//i.test(s) ? s
    : s.startsWith('/') ? `https://${dominio}${s}` : s;
  try {
    const url = new URL(completa);
    const host = limpiarDominio(url.hostname);
    if (REDIRECTORES.has(host)) return '';
    for (const k of [...url.searchParams.keys()]) {
      if (PARAMS_RASTREO.has(k.toLowerCase())) url.searchParams.delete(k);
    }
    let path = url.pathname;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    const q = url.searchParams.toString();
    return `${host}${path}${q ? '?' + q : ''}`;   // sin esquema: http y https son la misma
  } catch (e) {
    return '';
  }
}

export function titularNormalizado(titular) {
  return palabrasDe(titular).map(x => x.t).join(' ');
}

// Nombre de fuente (p. ej. el que da Google News: "El País") → dominio del
// catálogo, por nombre exacto sin tildes ni espacios. '' si no se conoce.
export function crearIndiceNombres(catalogo) {
  const idx = new Map();
  for (const d of Object.keys(catalogo || {})) {
    const k = palabrasDe(catalogo[d].n || '').map(x => x.t).join('');
    if (k && !idx.has(k)) idx.set(k, limpiarDominio(d));
  }
  return nombre => idx.get(palabrasDe(nombre || '').map(x => x.t).join('')) || '';
}

// Deduplicador incremental: añadir(item, { url, dominio, titular }) devuelve
// el item ya visto con el que coincide, o null si es nuevo (y lo registra).
// dominio vacío = medio desconocido (se identifica solo por titular).
export function crearDeduplicador() {
  const porUrl = new Map();
  const porMedioTitular = new Map();
  const porTitular = new Map();
  return {
    añadir(item, { url = '', dominio = '', titular = '' } = {}) {
      const d = limpiarDominio(dominio);
      const kUrl = urlCanonica(url, d);
      const t = titularNormalizado(titular);
      const kMT = d && t ? `${d}|${t}` : '';

      const previo = (kUrl && porUrl.get(kUrl))
        || (kMT && porMedioTitular.get(kMT))
        || (!d && t && porTitular.get(t))
        || null;
      if (previo) {
        // Que el previo también sea localizable por las claves nuevas.
        if (kUrl && !porUrl.has(kUrl)) porUrl.set(kUrl, previo);
        return previo;
      }
      if (kUrl) porUrl.set(kUrl, item);
      if (kMT) porMedioTitular.set(kMT, item);
      if (t && !porTitular.has(t)) porTitular.set(t, item);
      return null;
    },
  };
}
