import { gnews as adapter } from '../comun/gnews.js';

export const gnews = {
  ...adapter,
  search(parsed) {
    return adapter.search(parsed, { RELAY_CLAVE: Deno.env.get('RELAY_CLAVE') });
  },
};
