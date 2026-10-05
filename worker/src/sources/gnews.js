// worker/src/sources/gnews.js
// Google News vía proxy Deno (necesario: CF bloqueada por Google News).

const GNEWS_PROXY  = 'https://silly-snail-8721.thendabs1.deno.net/?url=';
const GN_MAX_ITEMS = 60;
const GN_TIMEOUT_MS = 7000;

export const gnews = {
  name: 'gnews',
  cacheTTL: 600,

  async search(parsed, env) {
    const q = _buildQuery(parsed);
    if (!q) return { items: [], total: 0 };

    const lang = parsed.lang || 'es';
    const country = parsed.region || 'ES';
    const feedUrl = 'https://news.google.com/rss/search?q='
      + encodeURIComponent(q)
      + '&hl=' + lang + '&gl=' + country + '&ceid=' + country + ':' + lang;

    const url = GNEWS_PROXY + encodeURIComponent(feedUrl);

    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), GN_TIMEOUT_MS);

    let res;
    try {
      res = await fetch(url, { signal: ctrl.signal });
    } finally {
      clearTimeout(tid);
    }

    if (!res.ok) throw new Error(`GNews proxy HTTP ${res.status}`);

    let data;
    try { data = await res.json(); } catch(e){ throw new Error('GNews proxy: JSON inválido'); }
    if (data.status !== 'ok') throw new Error('GNews: ' + (data.message || 'error'));

    const items = (data.items || [])
    .slice(0, GN_MAX_ITEMS)
    .map(it => {
        const sourceName = String(it.source || '').trim();
        let titulo = _limpiarCdata(it.title);
        // El proxy suele devolver el título con " - Medio" al final
        if (sourceName){
        const sufijo = ' - ' + sourceName;
        if (titulo.endsWith(sufijo)) titulo = titulo.slice(0, -sufijo.length).trim();
        }
        return {
        t: titulo,
        u: String(it.link || '').trim(),
        d: _dominioDe(sourceName) || 'news.google.com',
        p: _toIso(it.pubDate),
        e: '',
        f: sourceName || 'Google News',
        _src: 'gnews',
        };
    })
    .filter(x => x.t && x.u);

    return { items, total: items.length };
  }
};

function _buildQuery(parsed){
  const partes = [];
  if (parsed.titulo.length) partes.push(parsed.titulo.join(' '));
  if (parsed.dominios.length){
    const sites = parsed.dominios.slice(0, 3).map(d => 'site:' + d);
    partes.push(sites.length === 1 ? sites[0] : '(' + sites.join(' OR ') + ')');
  }
  const dias = _diasDesde(parsed.desde);
  if (dias){
    if (dias <= 1) partes.push('when:1d');
    else if (dias <= 7) partes.push('when:7d');
    else if (dias <= 30) partes.push('when:30d');
  }
  return partes.join(' ').trim();
}

function _diasDesde(iso){
  if (!iso) return 0;
  try {
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return 0;
    return Math.max(1, Math.round((Date.now() - d.getTime()) / 86400000));
  } catch(e){ return 0; }
}

function _dominioDe(name){
  if (!name) return '';
  const s = String(name).trim().toLowerCase();
  if (/^[a-z0-9.\-]+\.[a-z]{2,}$/.test(s)) return s.replace(/^www\./, '');
  return ''; // No siempre viene el dominio; el front lo rellenará luego
}
function _limpiarCdata(s){
  if (!s) return '';
  let x = String(s).trim();
  let changed = true;
  while (changed){
    changed = false;
    if (x.startsWith('<![CDATA[')){ x = x.slice(9); changed = true; }
    if (x.endsWith(']]>')){ x = x.slice(0, -3); changed = true; }
    x = x.trim();
  }
  x = x.replace(/&amp;/g, '&')
       .replace(/&lt;/g, '<')
       .replace(/&gt;/g, '>')
       .replace(/&quot;/g, '"')
       .replace(/&#39;/g, "'")
       .replace(/&apos;/g, "'")
       .replace(/&nbsp;/g, ' ');
  x = x.replace(/\s+/g, ' ').trim();
  return x;
}

function _toIso(raw){
  if (!raw) return '';
  try {
    const d = new Date(raw);
    if (isNaN(d)) return String(raw);
    return d.toISOString();
  } catch(e){ return String(raw); }
}