// shared/parser.js
// Parser de query compartido front + Worker.
// Convierte "sanchez web:elpais.com desde:7d" en objeto estructurado.
//
// Campos que este parser NO produce intencionadamente:
//   region:  parámetro de los adapters externos (GNews hl/gl), no un filtro
//            del catálogo. No lo produce el parser.
//   pais:    idem.
//
// Normalización:
//   dominios → normDomain (lowercase, sin acentos, sin símbolos raros)
//   medios   → normStrict
//   grupos   → normStrict
//   tipos    → normStrict
//   tags     → normStrict
//   lang     → normStrict
//   titulo   → normalize (lowercase + sin acentos, conserva espacios)
//
// El chip siempre lleva el valor tal cual lo escribió el usuario (`value`
// y `raw`), para poder mostrarlo en la UI. La resolución a valor canónico
// vive en los campos del objeto `parsed`, no en el chip.

const PREFIX_ALIASES = {
  medio: 'medio', medios: 'medio',
  dominio: 'dominio', domain: 'dominio', dom: 'dominio',
  web: 'dominio', webs: 'dominio',
  grupo: 'grupo', grupos: 'grupo',
  tipo: 'tipo', tipos: 'tipo',
  tag: 'tag', tags: 'tag',
  lang: 'lang', idioma: 'lang', idiomas: 'lang',
  desde: 'desde',
  hasta: 'hasta',
  fuentes: 'fuentes',
  order: 'order',
  limit: 'limit',
  offset: 'offset',
};

export function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normStrict(s) {
  return normalize(s).replace(/[^a-z0-9]/g, '');
}

export function normDomain(s) {
  return normalize(s).replace(/[^a-z0-9.\-]/g, '');
}

export function tokenizeQuery(raw) {
  const re = /([a-z][a-z]*):"([^"]*)"|"([^"]*)"|([^\s"]+)/gi;
  const tokens = [];
  let m;
  while ((m = re.exec(raw)) !== null) {
    if (m[1] !== undefined) {
      tokens.push({ prefix: m[1].toLowerCase(), text: m[2], raw: m[0], quoted: true });
    } else if (m[3] !== undefined) {
      tokens.push({ prefix: '', text: m[3], raw: m[0], quoted: true });
    } else {
      const word = m[4];
      const pi = word.indexOf(':');
      if (pi > 0 && /^[a-z]+$/i.test(word.slice(0, pi))) {
        tokens.push({ prefix: word.slice(0, pi).toLowerCase(), text: word.slice(pi + 1), raw: word, quoted: false });
      } else {
        tokens.push({ prefix: '', text: word, raw: word, quoted: false });
      }
    }
  }
  return tokens;
}

// Comprueba que (y, mo, d) forman una fecha real del calendario.
// Rechaza 31/02, 30/02, etc.
function fechaReal(y, mo, d) {
  if (y < 1900 || y > 2100) return false;
  if (mo < 1 || mo > 12)    return false;
  if (d  < 1 || d  > 31)    return false;
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function parseRelativeDate(s) {
  const v = (s || '').trim().toLowerCase();
  if (!v) return null;

  // ── ISO: 2026-10-05 ──
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, mo, d] = v.split('-').map(Number);
    if (!fechaReal(y, mo, d)) return null;
    return v;
  }

  // ── DD/MM/YYYY o DD-MM-YYYY (año de 2 o 4 cifras) ──
  let m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/);
  if (m) {
    const d  = +m[1], mo = +m[2];
    const y  = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    if (!fechaReal(y, mo, d)) return null;
    return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }

  // ── DD/MM o DD-MM (sin año → año actual) ──
  m = v.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (m) {
    const d  = +m[1], mo = +m[2];
    const y  = new Date().getFullYear();
    if (!fechaReal(y, mo, d)) return null;
    return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }

  // ── YYYY/MM/DD ──
  m = v.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3];
    if (!fechaReal(y, mo, d)) return null;
    return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }

  // ── Relativos y palabras clave ──
  const now = new Date();
  if (v === 'hoy')  return fmtDate(now);
  if (v === 'ayer') { const d = new Date(now); d.setDate(d.getDate() - 1); return fmtDate(d); }

  m = v.match(/^(\d+)([dhm])$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const d = new Date(now);
  if      (m[2] === 'd') d.setDate(d.getDate() - n);
  else if (m[2] === 'h') d.setHours(d.getHours() - n);
  else if (m[2] === 'm') d.setMinutes(d.getMinutes() - n);
  return fmtDate(d);
}

export function parseQuery(raw) {
  const tokens = tokenizeQuery(raw || '');
  const out = {
    q: '', titulo: [],
    dominios: [], medios: [], grupos: [], tipos: [], tags: [], lang: [],
    desde: null, hasta: null,
    fuentes: ['turso'],
    order: 'recientes',
    limit: 50, offset: 0,
    chips: [],
  };

  for (const tk of tokens) {
    const kind = tk.prefix ? PREFIX_ALIASES[tk.prefix] : '';
    if (tk.prefix && !kind) { out.titulo.push(normalize(tk.raw)); continue; }

    switch (kind) {
      case 'medio':
        out.medios.push(normStrict(tk.text));
        out.chips.push({ type:'medio', value: tk.text, raw: tk.raw });
        break;

      case 'dominio':
        out.dominios.push(normDomain(tk.text));
        out.chips.push({ type:'dominio', value: tk.text, raw: tk.raw });
        break;

      case 'grupo':
        out.grupos.push(normStrict(tk.text));
        out.chips.push({ type:'grupo', value: tk.text, raw: tk.raw });
        break;

      case 'tipo':
        out.tipos.push(normStrict(tk.text));
        out.chips.push({ type:'tipo', value: tk.text, raw: tk.raw });
        break;

      case 'tag':
        out.tags.push(normStrict(tk.text));
        out.chips.push({ type:'tag', value: tk.text, raw: tk.raw });
        break;

      case 'lang':
        out.lang.push(normStrict(tk.text));
        out.chips.push({ type:'lang', value: tk.text, raw: tk.raw });
        break;

      case 'desde': {
        const v = parseRelativeDate(tk.text);
        if (v) {
          out.desde = v;
          out.chips.push({ type:'desde', value: tk.text, raw: tk.raw });
        }
        break;
      }

      case 'hasta': {
        const v = parseRelativeDate(tk.text);
        if (v) {
          out.hasta = v;
          out.chips.push({ type:'hasta', value: tk.text, raw: tk.raw });
        }
        break;
      }

      case 'fuentes':
        out.fuentes = tk.text.split(',').map(s => s.trim()).filter(Boolean);
        break;

      case 'order':
        if (['recientes','antiguos','relevancia'].includes(tk.text)) out.order = tk.text;
        break;

      case 'limit':
        out.limit = Math.min(parseInt(tk.text, 10) || 50, 200);
        break;

      case 'offset':
        out.offset = Math.max(parseInt(tk.text, 10) || 0, 0);
        break;

      default:
        // Token sin prefijo. ¿Es un dominio?
        if (/^[a-z0-9.\-]+\.[a-z]{2,}$/i.test(tk.text)) {
          out.dominios.push(normDomain(tk.text));
          out.chips.push({ type:'dominio', value: tk.text, raw: tk.raw });
        } else {
          out.titulo.push(normalize(tk.text));
        }
    }
  }

  out.q = out.titulo.join(' ');
  return out;
}

// Convierte tokens de título en query FTS5 segura.
// "sanchez feijoo" → '"sanchez" AND "feijoo"'
// "\"cambio climatico\"" → '"cambio climatico"' (frase)
// "eleccion*" → '"eleccion"*' (prefijo)
export function buildFtsQuery(titulo) {
  if (!titulo || !titulo.length) return '';
  const parts = titulo.map(t => {
    const hasStar = t.endsWith('*') && t.length > 1;
    const clean = hasStar ? t.slice(0, -1) : t;
    const safe = '"' + clean.replace(/"/g, '""') + '"';
    return hasStar ? safe + '*' : safe;
  });
  return parts.join(' AND ');
}