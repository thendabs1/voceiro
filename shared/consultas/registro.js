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
};
export const admiteConsultaESPN = (tipo, codigo) => Object.hasOwn(CAPACIDADES_ESPN, codigo)
  && CAPACIDADES_ESPN[codigo].includes(tipo);
