// RSS de búsqueda de Google News → JSON. Lo usa el relay y lo prueban los
// tests (tests/busqueda/relay-buscar.test.mjs).
//
// Mismo formato que el proxy anterior ({ status, feed, items }), más
// sourceUrl: el dominio del medio (<source url="…">), que el proxy anterior
// descartaba y sin el que el buscador tenía que adivinar el medio por su nombre.

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodificar(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return ENTIDADES[e.toLowerCase()] ?? m;
  });
}

// Texto de la primera etiqueta <nombre> del bloque (con o sin CDATA).
function texto(bloque, nombre) {
  const m = bloque.match(new RegExp(`<${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</${nombre}>`));
  if (!m) return '';
  const cdata = m[1].match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return (cdata ? cdata[1] : decodificar(m[1])).trim();
}

function atributo(bloque, nombre, attr) {
  const m = bloque.match(new RegExp(`<${nombre}\\s[^>]*\\b${attr}="([^"]*)"`));
  return m ? decodificar(m[1]).trim() : '';
}

export function rssAJson(xml, url = '') {
  // Google a veces responde 200 con su página «Sorry» (bloqueo): es un error,
  // no una búsqueda sin resultados (que se cachearía como tal).
  if (!xml.includes('<rss')) return { status: 'error', message: 'Google no devolvió RSS (¿bloqueo?)' };
  const canal = xml.split('<item>')[0];
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const b = m[1];
    items.push({
      title: texto(b, 'title'),
      link: texto(b, 'link'),
      pubDate: texto(b, 'pubDate'),
      source: texto(b, 'source'),
      sourceUrl: atributo(b, 'source', 'url'),
      guid: texto(b, 'guid'),
    });
  }
  return {
    status: 'ok',
    feed: { url, title: texto(canal, 'title'), link: texto(canal, 'link') },
    items,
  };
}
