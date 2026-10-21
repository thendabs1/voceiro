// workers/deno-buscar/src/tiempo/normalizar.js
// AEMET y Open-Meteo → un mismo formato para la tarjeta de eltiempo:.
// Sin red ni Deno: lo prueban los tests de Node (tests/tiempo/).
//
//   { lugar: { nombre, region, pais }, fuente, enlace, elaborado, tz,
//     ahora: { temp, cielo, noche } | null,
//     dias: [{ fecha, max, min, cielo, lluvia }],   // lluvia: probabilidad %
//     horas: [{ fecha, hora, temp, cielo, noche, lluvia }],   // 24, desde la hora en curso
//     sol: { orto, ocaso } | null }
//
// cielo: despejado, poco, nuboso, cubierto, lluvia, nieve, tormenta, niebla.
// El cliente pone el texto en su idioma y el icono.

import { MUNICIPIOS } from './municipios.js';

// Códigos de estadoCielo de AEMET: decena = tipo, unidad = nubosidad;
// 'n' al final, de noche. 11 despejado, 12-17 nubes, 2x/4x lluvia,
// 3x/7x nieve, 5x/6x tormenta, 81-83 niebla, bruma, calima.
export function cieloAemet(codigo) {
  const n = parseInt(codigo, 10);
  if (!n) return null;
  const d = Math.floor(n / 10);
  if (d === 1) {
    if (n === 11) return 'despejado';
    if (n === 12 || n === 13 || n === 17) return 'poco';
    return n === 16 ? 'cubierto' : 'nuboso';
  }
  if (d === 2 || d === 4) return 'lluvia';
  if (d === 3 || d === 7) return 'nieve';
  if (d === 5 || d === 6) return 'tormenta';
  if (d === 8) return 'niebla';
  return null;
}

// Códigos WMO de Open-Meteo.
export function cieloWmo(codigo) {
  const n = Number(codigo);
  if (n === 0) return 'despejado';
  if (n === 1 || n === 2) return 'poco';
  if (n === 3) return 'cubierto';
  if (n === 45 || n === 48) return 'niebla';
  if ((n >= 51 && n <= 67) || (n >= 80 && n <= 82)) return 'lluvia';
  if ((n >= 71 && n <= 77) || n === 85 || n === 86) return 'nieve';
  if (n >= 95) return 'tormenta';
  return null;
}

// Canarias va una hora por detrás; AEMET da las horas en la local de cada sitio.
export const zonaHoraria = ine => (/^(35|38)/.test(ine) ? 'Atlantic/Canary' : 'Europe/Madrid');

// Fecha (AAAA-MM-DD) y hora locales de un instante en una zona.
export function fechaHoraEn(ms, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: parseInt(p.hour, 10) };
}

const numero = v => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));

// Del día de la previsión diaria: el cielo del día entero si lo hay y, si
// no (AEMET vacía los tramos ya pasados), el de la tarde o el de la mañana.
function cieloDelDia(dia) {
  const tramos = dia.estadoCielo || [];
  const por = p => tramos.find(x => x.periodo === p && x.value);
  const t = por('00-24') || por('12-24') || por('00-12') || tramos.find(x => x.value);
  return t ? cieloAemet(t.value) : null;
}

function lluviaDelDia(dia) {
  const v = (dia.probPrecipitacion || []).map(x => numero(x.value)).filter(x => x !== null);
  return v.length ? Math.max(...v) : null;
}

// Probabilidad de lluvia de una hora: AEMET la da por tramos («0208», de 2
// a 8; «2002» pasa la medianoche).
function lluviaEnHora(tramos, hora) {
  const t = (tramos || []).find(x => {
    const a = parseInt(String(x.periodo).slice(0, 2), 10), b = parseInt(String(x.periodo).slice(2, 4), 10);
    return a < b ? hora >= a && hora < b : hora >= a || hora < b;
  });
  return t ? numero(t.value) : null;
}

// Las 24 horas de la horaria desde la que está en curso.
function horasAemet(horaria, hoy) {
  const horas = [];
  for (const x of horaria?.[0]?.prediccion?.dia || []) {
    const fecha = String(x.fecha).slice(0, 10);
    const cielos = new Map((x.estadoCielo || []).map(c => [parseInt(c.periodo, 10), c.value]));
    for (const tt of x.temperatura || []) {
      const hora = parseInt(tt.periodo, 10);
      if (numero(tt.value) === null || fecha < hoy.fecha || (fecha === hoy.fecha && hora < hoy.hora)) continue;
      const c = cielos.get(hora);
      horas.push({
        fecha, hora, temp: numero(tt.value),
        cielo: c ? cieloAemet(c) : null, noche: !!c && String(c).endsWith('n'),
        lluvia: lluviaEnHora(x.probPrecipitacion, hora),
      });
    }
  }
  return horas.slice(0, 24);
}

// diaria y horaria: el JSON de AEMET (un array de un elemento). horaria
// puede faltar: entonces no hay «ahora» ni horas.
export function desdeAemet(diaria, horaria, { ahora = Date.now(), tz = 'Europe/Madrid' } = {}) {
  const d = diaria[0];
  const hoy = fechaHoraEn(ahora, tz);
  const dias = (d.prediccion?.dia || [])
    .map(x => ({
      fecha: String(x.fecha).slice(0, 10),
      max: numero(x.temperatura?.maxima),
      min: numero(x.temperatura?.minima),
      cielo: cieloDelDia(x),
      lluvia: lluviaDelDia(x),
    }))
    .filter(x => x.fecha >= hoy.fecha);

  let actual = null, sol = null;
  const hdia = horaria?.[0]?.prediccion?.dia?.find(x => String(x.fecha).slice(0, 10) === hoy.fecha);
  if (hdia) {
    // La última hora ya empezada; si la previsión aún no llega a ahora, la primera.
    const enHora = lista => {
      const conHora = (lista || []).filter(x => x.value !== '' && x.value != null);
      const pasadas = conHora.filter(x => parseInt(x.periodo, 10) <= hoy.hora);
      return pasadas.length ? pasadas[pasadas.length - 1] : conHora[0];
    };
    const temp = enHora(hdia.temperatura);
    const cielo = enHora(hdia.estadoCielo);
    if (temp) {
      actual = {
        temp: numero(temp.value),
        cielo: cielo ? cieloAemet(cielo.value) : null,
        noche: !!cielo && String(cielo.value).endsWith('n'),
      };
    }
    if (hdia.orto && hdia.ocaso) sol = { orto: hdia.orto, ocaso: hdia.ocaso };
  }

  return {
    lugar: { nombre: d.nombre, region: d.provincia || '', pais: 'España' },
    fuente: 'aemet',
    enlace: d.origen?.enlace || 'https://www.aemet.es/',
    elaborado: d.elaborado || null,
    tz,
    ahora: actual,
    dias,
    horas: horasAemet(horaria, hoy),
    sol,
  };
}

// j: respuesta de /v1/forecast con current, hourly, daily y timezone=auto.
export function desdeOpenMeteo(j, lugar, { ahora = Date.now() } = {}) {
  const tz = j.timezone || 'UTC';
  const hoy = fechaHoraEn(ahora, tz).fecha;
  const dl = j.daily || {};
  const dias = (dl.time || []).map((fecha, i) => ({
    fecha,
    max: numero(dl.temperature_2m_max?.[i]) === null ? null : Math.round(dl.temperature_2m_max[i]),
    min: numero(dl.temperature_2m_min?.[i]) === null ? null : Math.round(dl.temperature_2m_min[i]),
    cielo: cieloWmo(dl.weather_code?.[i]),
    lluvia: numero(dl.precipitation_probability_max?.[i]),
  })).filter(x => x.fecha >= hoy);
  const i = (dl.time || []).indexOf(hoy);
  const c = j.current;
  const hl = j.hourly || {};
  const enCurso = fechaHoraEn(ahora, tz);
  const horas = (hl.time || []).map((t, k) => ({
    fecha: t.slice(0, 10), hora: parseInt(t.slice(11, 13), 10),
    temp: numero(hl.temperature_2m?.[k]) === null ? null : Math.round(hl.temperature_2m[k]),
    cielo: cieloWmo(hl.weather_code?.[k]), noche: hl.is_day?.[k] === 0,
    lluvia: numero(hl.precipitation_probability?.[k]),
  })).filter(h => h.temp !== null
    && (h.fecha > enCurso.fecha || (h.fecha === enCurso.fecha && h.hora >= enCurso.hora))).slice(0, 24);
  return {
    lugar,
    fuente: 'open-meteo',
    enlace: 'https://open-meteo.com/',
    elaborado: null,
    tz,
    ahora: c ? { temp: Math.round(c.temperature_2m), cielo: cieloWmo(c.weather_code), noche: c.is_day === 0 } : null,
    dias,
    horas,
    sol: i >= 0 && dl.sunrise?.[i] ? { orto: dl.sunrise[i].slice(11, 16), ocaso: dl.sunset[i].slice(11, 16) } : null,
  };
}

// Municipio más cercano a unas coordenadas (para usar AEMET con un lugar
// de España que llegó por geocodificación: «Sangenjo», una parroquia…).
// null si el más cercano está a más de maxKm.
export function municipioCercano(lat, lon, maxKm = 15) {
  let mejor = null, mejorD = Infinity;
  const k = Math.cos(lat * Math.PI / 180);
  for (const ine in MUNICIPIOS) {
    const m = MUNICIPIOS[ine];
    const dy = m[1] - lat, dx = (m[2] - lon) * k;
    const d = dx * dx + dy * dy;
    if (d < mejorD) { mejorD = d; mejor = ine; }
  }
  return Math.sqrt(mejorD) * 111 <= maxKm ? mejor : null;
}
