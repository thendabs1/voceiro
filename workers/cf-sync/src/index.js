// Worker de sincronización de Voceiro (voceiro-sync). La lógica está en
// comun/sync.js; aquí solo se conecta con D1 y con el cron de limpieza.
import { atender, limpiar, ORIGEN } from './comun/sync.js';
import { almacenD1 } from './almacen-d1.js';

export default {
  async fetch(request, env){
    try {
      return await atender(request, almacenD1(env.DB));
    } catch (e) {
      console.error('[sync]', e && e.stack || e);
      return new Response(JSON.stringify({ error: 'interno' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'Access-Control-Allow-Origin': ORIGEN,
          'Vary': 'Origin',
        },
      });
    }
  },

  async scheduled(evento, env, ctx){
    ctx.waitUntil(limpiar(almacenD1(env.DB)));
  },
};
