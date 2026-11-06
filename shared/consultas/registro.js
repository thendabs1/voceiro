// Prefijos de consultas puntuales. No seleccionan noticias ni agenda.
export const CONSULTAS = {
  libro: ['libro', 'llibre', 'liburua', 'book'],
  autor: ['autor', 'autora', 'egilea', 'author'],
  pelicula: ['pelicula', 'película', 'pel·lícula', 'filme', 'filma', 'film', 'movie'],
  serie: ['serie', 'sèrie', 'series', 'telesaila'],
  clasificacion: ['clasificacion', 'clasificación', 'clasificacións', 'classificacio', 'classificació', 'sailkapena', 'standings'],
  resultados: ['resultados', 'resultats', 'emaitzak', 'results'],
  partido: ['partido', 'partit', 'partida', 'match'],
  contexto: ['contexto', 'context', 'testuingurua', 'wiki'],
};

export const PREFIJOS_CONSULTAS = Object.fromEntries(
  Object.entries(CONSULTAS).flatMap(([tipo, alias]) => alias.map(a => [a, tipo])),
);

// Solo circuitos con equivalencia conocida. El calendario conserva sus ámbitos.
export const ESPN = {
  primera: ['soccer', 'esp.1'], segunda: ['soccer', 'esp.2'],
  'copa-del-rey': ['soccer', 'esp.copa_del_rey'], champions: ['soccer', 'uefa.champions'],
  'liga-f': ['soccer', 'esp.w.1'],
  nba: ['basketball', 'nba'], wnba: ['basketball', 'wnba'],
  f1: ['racing', 'f1'],
  atp: ['tennis', 'atp'], wta: ['tennis', 'wta'],
};

// Capacidades acreditadas por competición. Standings es una tabla, nunca un cuadro.
export const CAPACIDADES_ESPN = {
  primera: ['resultados', 'partido', 'clasificacion'],
  segunda: ['resultados', 'partido', 'clasificacion'],
  'copa-del-rey': ['resultados', 'partido'],
  champions: ['resultados', 'partido', 'clasificacion'],
  'liga-f': ['resultados', 'partido'],
  nba: ['resultados', 'partido', 'clasificacion'],
  wnba: ['resultados', 'partido', 'clasificacion'],
  f1: ['clasificacion'],
  atp: ['resultados', 'partido'], wta: ['resultados', 'partido'],
};
export const admiteConsultaESPN = (tipo, codigo) => Object.hasOwn(CAPACIDADES_ESPN, codigo)
  && CAPACIDADES_ESPN[codigo].includes(tipo);

// Resultados por sesión; la clasificación F1 sigue en ESPN.
export const MOTOR = { f1: 'openf1', motogp: 'motogp' };
export const admiteConsultaMotor = (tipo, codigo) => tipo === 'resultados' && Object.hasOwn(MOTOR, codigo);

// Panel de resultados de una tarjeta: su competición en el día que se mira. Sin
// partido exacto: fútbol y WTA no traen referencias con las que cruzar la ficha.
// ESPN agrupa NBA y WNBA por día de EE. UU.; la madrugada de Madrid cae en el anterior.
const ZONA_RESULTADOS = { nba: 'America/New_York', wnba: 'America/New_York' };
export function destinoResultados(tarjeta, dia) {
  const codigo = (tarjeta.competiciones || []).find(c => c === 'euroliga'
    || admiteConsultaMotor('resultados', c) || admiteConsultaESPN('resultados', c));
  if (!codigo) return null;
  const id = codigo === 'euroliga' ? 'euroliga:resultados'
    : MOTOR[codigo] ? `${MOTOR[codigo]}:resultados/${codigo}` : `espn:resultados/${codigo}`;
  const instante = tarjeta.programacion?.valor?.cuando?.inicio?.instante, zona = ZONA_RESULTADOS[codigo];
  return { id, codigo, fecha: zona && instante ? new Intl.DateTimeFormat('en-CA',
    { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instante)) : dia };
}
