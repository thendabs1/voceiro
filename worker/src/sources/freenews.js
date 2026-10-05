// worker/src/sources/freenews.js
// Adaptador FreeNewsAPI. Va directo (no bloquea CF).

const FN_URL = 'https://freenewsapi.ai/v1/search';
const FN_MAX_ITEMS = 40;
const FN_TIMEOUT_MS = 7000;

export const freenews = {
  name: 'freenews',
  cacheTTL: 900,

  async search(parsed, env) {
    const q = parsed.titulo.join(' ') || '';
    if (!q) return { items: [], total: 0 };

    const p = new URLSearchParams();
    p.set('q', q);
    p.set('size', String(FN_MAX_ITEMS));
    p.set('offset', '0');
    p.set('sort', 'date');

    // Rango de fechas
    const dias = _diasDesde(parsed.desde);
    if (dias){
      if (dias <= 1) p.set('date', '24h');
      else if (dias <= 2) p.set('date', '48h');
      else if (dias <= 7) p.set('date', '7d');
      else if (dias <= 30) p.set('date', '30d');
    }

    // Dominio específico → tld
    if (parsed.dominios.length === 1){
      p.set('tld', parsed.dominios[0]);
    } else {
      p.set('country', parsed.country || 'ES');
      p.set('tld', 'es,cat,gal');
    }

    if (parsed.lang) p.set('lang', parsed.lang);

    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), FN_TIMEOUT_MS);

    let res;
    try {
      res = await fetch(`${FN_URL}?${p}`, { signal: ctrl.signal });
    } finally {
      clearTimeout(tid);
    }

    if (!res.ok) throw new Error(`FreeNews HTTP ${res.status}`);

    let data;
    try { data = await res.json(); } catch(e){ throw new Error('FreeNews: JSON inválido'); }

        const items = (data.results || [])
        .map(r => ({
            t: _limpiarCdata(r.title),
        u: String(r.url || '').trim(),
        d: _cleanHost(r.host),
        p: String(r.published_at || ''),
        e: '',
        f: 'FreeNews',
        _src: 'freenews',
      }))
      .filter(x => x.t && x.u)
      .slice(0, FN_MAX_ITEMS);

    return { items, total: items.length };
  }
};

function _diasDesde(iso){
  if (!iso) return 0;
  try {
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return 0;
    return Math.max(1, Math.round((Date.now() - d.getTime()) / 86400000));
  } catch(e){ return 0; }
}

function _cleanHost(h){
  return String(h || '').replace(/^www\./, '').toLowerCase();
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
  // Entidades HTML
  x = x.replace(/&amp;/g, '&')
       .replace(/&lt;/g, '<')
       .replace(/&gt;/g, '>')
       .replace(/&quot;/g, '"')
       .replace(/&#39;/g, "'")
       .replace(/&apos;/g, "'")
       .replace(/&nbsp;/g, ' ');
  // Colapsar espacios
  x = x.replace(/\s+/g, ' ').trim();
  return x;
}