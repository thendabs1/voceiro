import { buildFtsQuery } from '../shared/parser.js';
import { crearTurso } from '../comun/turso.js';

const adapter = crearTurso(buildFtsQuery);

export const turso = {
  ...adapter,
  async search(parsed) {
    const env = {
      WORKER_TURSO_URL: Deno.env.get('WORKER_TURSO_URL'),
      WORKER_TURSO_TOKEN: Deno.env.get('WORKER_TURSO_TOKEN'),
    };
    if (!env.WORKER_TURSO_URL || !env.WORKER_TURSO_TOKEN) {
      throw new Error('Faltan WORKER_TURSO_URL o WORKER_TURSO_TOKEN');
    }
    return adapter.search(parsed, env);
  },
};
