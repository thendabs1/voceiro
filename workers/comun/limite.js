// Límite de peticiones por IP, en memoria. Cada instancia (isolate en CF,
// instancia en Deno) cuenta por su lado y se pierde al reciclarse: es
// aproximado. Frena a quien martillea desde una IP las cuotas de detrás
// (Turso, D1, Google, AEMET); no frena ataques distribuidos ni ahorra la
// invocación del worker (eso, reglas de la plataforma delante del worker).

const MAX_CLAVES = 10000;

// Devuelve una función clave → segundos de espera (0: adelante). Sin clave
// (la plataforma no dio IP) no se limita: compartirla bloquearía a todos.
export function crearLimite({ max, ventanaMs }) {
  const cuentas = new Map();
  return (clave, ahora = Date.now()) => {
    if (!clave) return 0;
    let c = cuentas.get(clave);
    if (!c || ahora - c.inicio >= ventanaMs) {
      if (cuentas.size >= MAX_CLAVES) {
        for (const [k, v] of cuentas) if (ahora - v.inicio >= ventanaMs) cuentas.delete(k);
        if (cuentas.size >= MAX_CLAVES) cuentas.clear();
      }
      c = { inicio: ahora, n: 0 };
      cuentas.set(clave, c);
    }
    c.n++;
    return c.n <= max ? 0 : Math.max(1, Math.ceil((c.inicio + ventanaMs - ahora) / 1000));
  };
}

// IPv4 tal cual; IPv6 por su /64, que es lo que suele tener una conexión
// (cambiar de dirección dentro de él no da otro cupo). Las IPv4 mapeadas
// (::ffff:…) no se agrupan: su /64 sería el de todas.
export function claveIp(ip) {
  if (typeof ip !== 'string' || !ip.includes(':')) return ip || '';
  let canonica;
  try { canonica = new URL(`http://[${ip}]/`).hostname.slice(1, -1); } catch { return ip; }
  if (/^::ffff:/.test(canonica)) return canonica;
  const [izq, der] = canonica.split('::');
  const a = izq ? izq.split(':') : [];
  const b = der ? der.split(':') : [];
  const grupos = der === undefined ? a : [...a, ...Array(8 - a.length - b.length).fill('0'), ...b];
  return grupos.slice(0, 4).join(':') + '::/64';
}

export function respuesta429(espera, cabeceras = {}) {
  return new Response(JSON.stringify({ error: 'demasiadas peticiones' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Retry-After': String(espera),
      ...cabeceras,
    },
  });
}
