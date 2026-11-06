import { fechaResultadosValida } from './normalizar.js';

export const FUENTE_EUROLIGA = { nombre: 'EuroLeague Basketball', url: 'https://www.euroleaguebasketball.net/euroleague/', licencia: null, licencia_url: null };
const BASE = 'https://api-live.euroleague.net/v2/competitions/E/seasons';
const texto = v => typeof v === 'string' && v.trim() ? v.trim().slice(0, 160) : null;
const puntos = v => Number.isInteger(v) && v >= 0 ? String(v) : null;

export const temporadaEuroliga = fecha => `E${Number(fecha.slice(0, 4)) - (Number(fecha.slice(5, 7)) < 7 ? 1 : 0)}`;
export const urlJuegosEuroliga = temporada => `${BASE}/${temporada}/games`;
export const urlJuegoEuroliga = (temporada, codigo) => `${urlJuegosEuroliga(temporada)}/${codigo}`;

const referencia = juego => Number.isInteger(juego?.gameCode) && juego.gameCode > 0
  && /^E\d{4}$/.test(juego.season?.code || '')
  && juego.identifier === `${juego.season.code}_${juego.gameCode}`
  ? `euroliga:partido/${juego.season.code}/${juego.gameCode}` : null;

function validar(juego, temporada) {
  if (!referencia(juego) || juego.season.code !== temporada || !fechaResultadosValida(juego.utcDate?.slice(0, 10))
      || !Number.isFinite(Date.parse(juego.utcDate)) || !juego.local || !juego.road) {
    throw new Error('EuroLeague: identidad, fecha o equipos no válidos');
  }
}

const equipo = lado => lado?.club?.isVirtual ? null : texto(lado?.club?.name);
const marcador = juego => juego.played === true
  ? { local: puntos(juego.local.score), visitante: puntos(juego.road.score) } : null;

function parciales(juego) {
  if (juego.played !== true) return [];
  const local = juego.local.partials || {}, visitante = juego.road.partials || {};
  const periodos = [1, 2, 3, 4].map(n => [n, local[`partials${n}`], visitante[`partials${n}`]]);
  const extras = Object.keys(local.extraPeriods || {}).filter(k => /^[1-9]\d*$/.test(k)
    && Object.hasOwn(visitante.extraPeriods || {}, k)).sort((a, b) => Number(a) - Number(b));
  for (const n of extras.slice(0, 8)) periodos.push([4 + Number(n), local.extraPeriods[n], visitante.extraPeriods[n]]);
  return periodos.flatMap(([periodo, a, b]) => puntos(a) != null && puntos(b) != null
    ? [{ periodo, local: puntos(a), visitante: puntos(b) }] : []);
}

// Sin `played` solo se sabe que aún no ha empezado si su hora es futura; después
// podría estar en juego, y el listado no lo dice.
const estado = (juego, ahora) => juego.played === true ? 'final'
  : Date.parse(juego.utcDate) > ahora ? 'programado' : 'desconocido';

function partido(juego, ahora) {
  return {
    id: referencia(juego), inicio: juego.utcDate, estado: estado(juego, ahora),
    local: equipo(juego.local), visitante: equipo(juego.road), marcador: marcador(juego),
  };
}

export function resultadosEuroliga(datos, fecha, temporada, ahora) {
  if (!Array.isArray(datos?.data)) throw new Error('EuroLeague: listado no válido');
  const partidos = datos.data.filter(juego => juego.utcDate?.slice(0, 10) === fecha).map(juego => {
    validar(juego, temporada);
    return partido(juego, ahora);
  }).sort((a, b) => a.inicio.localeCompare(b.inicio));
  return { competicion: 'euroliga', temporada: Number(temporada.slice(1)), fecha, fuente: FUENTE_EUROLIGA, partidos };
}

export function partidoEuroliga(juego, temporada, codigo, ahora) {
  validar(juego, temporada);
  if (juego.gameCode !== Number(codigo)) throw new Error('EuroLeague: partido distinto del solicitado');
  return {
    ...partido(juego, ahora), competicion: 'euroliga', temporada: Number(temporada.slice(1)),
    reloj: null, lugar: texto(juego.venue?.name), ciudad: null,
    estadisticas: [], incidencias: [], alineaciones: [], parciales: parciales(juego), jugadores: [], destacados: [],
    fuente: FUENTE_EUROLIGA,
  };
}
