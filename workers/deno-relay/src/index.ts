// Relay de Voceiro: pide feeds y sitemaps desde la IP de Deno Deploy para
// los medios que bloquean la de GitHub Actions.
//
// Solo sirve hosts de permitidos.json, que genera scripts/sync_relay.py a
// partir de las fuentes con 'relay' de medios.py (sync-relay.yml tras el
// merge). No se edita a mano.
//
// agenda.json sí se edita a mano: fuentes de la agenda (no de medios.py) que
// bloquean la IP de Actions. A esas se les pide con el agente de Voceiro, no
// con el de Chrome, para que la fuente vea quién pide y pueda escribirnos.

import PERMITIDOS from "./permitidos.json" with { type: "json" };
import AGENDA from "./agenda.json" with { type: "json" };

function enLista(lista: string[], hostname: string): boolean {
  const h = hostname.toLowerCase();
  return lista.some((base: string) => h === base || h.endsWith("." + base));
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
           "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const UA_VOCEIRO = "Voceiro/1.0 (+https://voceiro.eu)";

Deno.serve(async (req) => {
  const u = new URL(req.url);

  if (u.pathname === "/") {
    return new Response("relay ok", { status: 200 });
  }

  if (u.pathname !== "/rss") {
    return new Response("not found", { status: 404 });
  }

  // Lo llama solo el recolector: con RELAY_CLAVE puesta en Deno, sin su
  // cabecera no se atiende.
  const clave = Deno.env.get("RELAY_CLAVE");
  if (clave && req.headers.get("X-Voceiro-Relay") !== clave) {
    return new Response("forbidden", { status: 403 });
  }

  const target = u.searchParams.get("u");
  if (!target) {
    return new Response("missing u", { status: 400 });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch {
    return new Response("invalid u", { status: 400 });
  }

  const agenda = enLista(AGENDA, targetUrl.hostname);
  if (!agenda && !enLista(PERMITIDOS, targetUrl.hostname)) {
    return new Response("host not allowed", { status: 403 });
  }

  try {
    const r = await fetch(targetUrl.toString(), {
      signal: AbortSignal.timeout(20000),
      headers: {
        "User-Agent": agenda ? UA_VOCEIRO : UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      },
    });

    const body = await r.arrayBuffer();
    return new Response(body, {
      status: r.status,
      headers: {
        "content-type": r.headers.get("content-type") ?? "application/octet-stream",
        "x-relay-status": String(r.status),
      },
    });
  } catch (e) {
    return new Response("relay error: " + (e as Error).message, { status: 502 });
  }
});
