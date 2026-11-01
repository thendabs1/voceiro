// shared/busqueda/tiempo.js
// Fechas del buscador, siempre en hora de Madrid (sea cual sea la zona del
// navegador o del worker). Ver la especificación del buscador:
//   hoy, ayer, Nd       → días naturales de Madrid (desde las 00:00)
//   Nh, Nm              → instantes exactos (desde:3h = las últimas 3 horas)
//   fechas absolutas    → días de Madrid; hasta: incluye el día entero
//   noticias sin fecha  → fuera cuando hay filtro de fecha
// Cada límite se devuelve como { ms, dia }: ms para el filtro local y dia
// (YYYY-MM-DD de Madrid) para la cota gruesa que se manda a la prensa.

import { parseRelativeDate } from '../parser.js?v=3fa3a2b905';

const _FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Madrid', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function _partes(ms) {
  const p = {};
  for (const x of _FMT.formatToParts(new Date(ms))) p[x.type] = x.value;
  return p;
}

// Hora de Madrid en ese instante, leída como si fuera UTC (para restar offsets).
function _comoUTC(ms) {
  const p = _partes(ms);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}

export function diaMadrid(ms) {
  const p = _partes(ms);
  return `${p.year}-${p.month}-${p.day}`;
}

export function sumarDias(dia, n) {
  const [y, m, d] = dia.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

// Instante de las 00:00 de Madrid de ese día. Las 00:00 nunca caen en un
// cambio de hora en Madrid (los cambios son a las 02:00/03:00).
export function inicioDiaMadrid(dia) {
  const [y, m, d] = dia.split('-').map(Number);
  const local = Date.UTC(y, m - 1, d);
  let t = local - (_comoUTC(local) - local);
  t = local - (_comoUTC(t) - t);
  return t;
}

const H = 3600e3;

// valor: lo que el usuario escribió tras desde:/hasta: (p. ej. 'ayer', '3h').
export function resolverLimite(valor, ahora, esHasta = false) {
  const v = String(valor || '').trim().toLowerCase();
  if (!v) return null;

  let m = v.match(/^(\d+)([hm])$/);
  if (m) {
    const ms = ahora - parseInt(m[1], 10) * (m[2] === 'h' ? H : 60e3);
    return { ms, dia: diaMadrid(ms) };
  }

  let dia = null;
  const hoy = diaMadrid(ahora);
  if (v === 'hoy') dia = hoy;
  else if (v === 'ayer') dia = sumarDias(hoy, -1);
  else if ((m = v.match(/^(\d+)d$/))) dia = sumarDias(hoy, -parseInt(m[1], 10));
  else dia = parseRelativeDate(v);       // absolutas: no dependen de la zona
  if (!dia) return null;

  const ms = esHasta ? inicioDiaMadrid(sumarDias(dia, 1)) - 1 : inicioDiaMadrid(dia);
  return { ms, dia };
}

// parsed: salida de parseQuery. Si se repite desde:/hasta:, gana el último
// (como en el parser).
export function resolverVentana(parsed, ahora) {
  let desde = null, hasta = null;
  for (const ch of parsed.chips || []) {
    if (ch.type === 'desde') desde = resolverLimite(ch.value, ahora, false) || desde;
    if (ch.type === 'hasta') hasta = resolverLimite(ch.value, ahora, true) || hasta;
  }
  return { desde, hasta };
}

// Selector de rango del panel (24 h, 48 h…): ventana móvil, distinta de desde:ayer.
export function ultimasHoras(horas, ahora) {
  const ms = ahora - horas * H;
  return { desde: { ms, dia: diaMadrid(ms) }, hasta: null };
}

export function hayVentana(v) {
  return !!(v && (v.desde || v.hasta));
}

// ts: instante de la noticia en ms (NaN si no tiene fecha).
export function pasaVentana(ts, v) {
  if (!hayVentana(v)) return true;
  if (!Number.isFinite(ts)) return false;
  if (v.desde && ts < v.desde.ms) return false;
  if (v.hasta && ts > v.hasta.ms) return false;
  return true;
}

// Intersección de dos ventanas (p. ej. desde: escrito + selector de rango).
export function unirVentanas(a, b) {
  const max = (x, y) => (!x ? y : !y ? x : (x.ms >= y.ms ? x : y));
  const min = (x, y) => (!x ? y : !y ? x : (x.ms <= y.ms ? x : y));
  return {
    desde: max(a && a.desde, b && b.desde),
    hasta: min(a && a.hasta, b && b.hasta),
  };
}
