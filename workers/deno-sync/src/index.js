// Respaldo en Deno Deploy de la sincronización (voceiro-sync): la misma
// lógica que el worker de CF (comun/sync.js) y la misma base D1, por su API
// HTTP. Sirve cuando Cloudflare está bloqueado durante los partidos: el
// bloqueo afecta a las IP de Cloudflare desde España, no a Deno hablando con
// la API de Cloudflare. La limpieza diaria la hace el cron de CF.
import { atender, ORIGEN } from './comun/sync.js';
import { almacenD1Http } from './almacen-d1-http.js';

// Es la de workers/cf-sync/wrangler.toml.
const D1_BASE = '1db3d775-d97d-454a-891e-346a56eef456';

export default {
  async fetch(request, info) {
    try {
      const cuenta = Deno.env.get('CF_ACCOUNT_ID');
      const token = Deno.env.get('CF_D1_TOKEN');
      if (!cuenta || !token) throw new Error('Faltan CF_ACCOUNT_ID o CF_D1_TOKEN');
      const almacen = almacenD1Http({ cuenta, base: D1_BASE, token });
      return await atender(request, almacen, Date.now(), info?.remoteAddr?.hostname || '');
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
};
