// Generado desde shared/consultas/registro.js por scripts/sync-workers.mjs. No editar.
// Prefijos de consultas puntuales. No seleccionan noticias ni agenda.
export const CONSULTAS = {
  libro: ['libro', 'llibre', 'liburua', 'book'],
  autor: ['autor', 'autora', 'egilea', 'author'],
  pelicula: ['pelicula', 'película', 'pel·lícula', 'filme', 'filma', 'film', 'movie'],
  serie: ['serie', 'sèrie', 'series', 'telesaila'],
  clasificacion: ['clasificacion', 'clasificación', 'clasificacións', 'classificacio', 'classificació', 'sailkapena', 'standings'],
  resultados: ['resultados', 'resultats', 'emaitzak', 'results'],
  contexto: ['contexto', 'context', 'testuingurua', 'wiki'],
};

export const PREFIJOS_CONSULTAS = Object.fromEntries(
  Object.entries(CONSULTAS).flatMap(([tipo, alias]) => alias.map(a => [a, tipo])),
);

// Solo circuitos con equivalencia conocida. El calendario conserva sus ámbitos.
export const ESPN = {
  primera: ['soccer', 'esp.1'], segunda: ['soccer', 'esp.2'],
  nba: ['basketball', 'nba'], wnba: ['basketball', 'wnba'],
  f1: ['racing', 'f1'],
};
