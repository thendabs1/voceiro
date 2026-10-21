// workers/deno-buscar/src/tiempo/index.js
// Rutas de eltiempo: (solo en Deno: Cloudflare se bloquea en España).
//
//   GET /tiempo?ine=36057                  → municipio de España (AEMET; si falla, Open-Meteo)
//   GET /tiempo?lat=&lon=&cc=&nombre=&region=&pais=
//                                          → lugar geocodificado; en España, el municipio
//                                            más cercano con AEMET
//   GET /tiempo/lugares?q=Buenos%20Aires&lang=es → candidatas (Open-Meteo)
//
// La clave de AEMET va en la variable de entorno AEMET_API_KEY. Se cachea
// la respuesta en bruto y se normaliza en cada petición, para que «ahora»
// sea la hora de la petición y no la de la caché.

import { MUNICIPIOS } from './municipios.js';
import { desdeAemet, desdeOpenMeteo, zonaHoraria, municipioCercano } from './normalizar.js';

const CACHE_NAME = 'voceiro-tiempo-v1';
const MIN = 60e3;
// AEMET elabora la previsión pocas veces al día.
const TTL = { aemet: 60 * MIN, openMeteo: 30 * MIN, lugares: 7 * 24 * 60 * MIN };
const AEMET = 'https://opendata.aemet.es/opendata/api';
const IDIOMAS = new Set(['es', 'gl', 'ca', 'en', 'eu']);

export async function handleTiempo(url, cabeceras) {
  try {
    const datos = url.pathname === '/tiempo/lugares' ? await lugares(url) : await prevision(url);
    return responder(datos, 200, { ...cabeceras, 'Cache-Control': 'public, max-age=300' });
  } catch (e) {
    const status = e.status || 502;
    return responder({ error: String(e.message || e).slice(0, 200) }, status, { ...cabeceras, 'Cache-Control': 'no-store' });
  }
}

function responder(datos, status, cabeceras) {
  return new Response(JSON.stringify(datos), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cabeceras },
  });
}

function fallo(status, mensaje) {
  return Object.assign(new Error(mensaje), { status });
}

// Guarda solo lo que se produjo bien: un error no se cachea.
async function conCache(clave, ttl, producir) {
  const cache = await caches.open(CACHE_NAME);
  const req = new Request(`https://cache.voceiro.invalid/${clave}`);
  const hit = await cache.match(req);
  if (hit && Date.now() - Number(hit.headers.get('X-Guardado')) < ttl) return hit.json();
  const datos = await producir();
  cache.put(req, new Response(JSON.stringify(datos), {
    headers: {
      'Content-Type': 'application/json',
      'X-Guardado': String(Date.now()),
      'Cache-Control': `public, max-age=${Math.round(ttl / 1000)}`,
    },
  })).catch(() => {});
  return datos;
}

// AEMET en dos pasos: la API devuelve una URL «datos» con el contenido.
async function aemet(ruta) {
  const clave = Deno.env.get('AEMET_API_KEY');
  if (!clave) throw new Error('AEMET sin clave');
  const r = await fetch(AEMET + ruta, {
    headers: { api_key: clave, accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`AEMET ${r.status}`);
  const paso1 = await r.json();
  if (paso1.estado !== 200 || !paso1.datos) throw new Error(`AEMET ${paso1.estado}: ${paso1.descripcion}`);
  const r2 = await fetch(paso1.datos, { signal: AbortSignal.timeout(8000) });
  // Al pasar el límite de uso, el paso 1 dice «éxito» y el 429 llega aquí
  // como una página HTML con estado 500: hay que mirar el tipo.
  const tipo = r2.headers.get('content-type') || '';
  if (!r2.ok || !/json|text\/plain/.test(tipo)) throw new Error(`AEMET datos ${r2.status}`);
  const texto = new TextDecoder(/8859-15/i.test(tipo) ? 'iso-8859-15' : 'utf-8').decode(await r2.arrayBuffer());
  return JSON.parse(texto);
}

async function openMeteo(lat, lon) {
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  u.search = new URLSearchParams({
    latitude: lat.toFixed(3), longitude: lon.toFixed(3),
    current: 'temperature_2m,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    timezone: 'auto', forecast_days: '6',
  });
  const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
  return r.json();
}

async function porIne(ine) {
  const m = MUNICIPIOS[ine];
  if (!m) throw fallo(404, 'Municipio desconocido');
  const [nombre, lat, lon] = m;
  try {
    const bruto = await conCache(`aemet/${ine}`, TTL.aemet, async () => {
      // La horaria solo aporta «ahora» y el sol: si falla, la tarjeta sale igual.
      const [diaria, horaria] = await Promise.allSettled([
        aemet(`/prediccion/especifica/municipio/diaria/${ine}`),
        aemet(`/prediccion/especifica/municipio/horaria/${ine}`),
      ]);
      if (diaria.status === 'rejected') throw diaria.reason;
      return { diaria: diaria.value, horaria: horaria.status === 'fulfilled' ? horaria.value : null };
    });
    return { ...desdeAemet(bruto.diaria, bruto.horaria, { tz: zonaHoraria(ine) }), ine };
  } catch (e) {
    // Sin AEMET (límite de uso, clave caducada…), Open-Meteo con las
    // coordenadas del municipio. La tarjeta muestra la fuente que se usó.
    const bruto = await conCache(`om/${lat},${lon}`, TTL.openMeteo, () => openMeteo(lat, lon));
    return { ...desdeOpenMeteo(bruto, { nombre, region: '', pais: 'España' }), ine, sinAemet: true };
  }
}

async function prevision(url) {
  const ine = url.searchParams.get('ine');
  if (ine) {
    if (!/^\d{5}$/.test(ine)) throw fallo(400, 'INE no válido');
    return porIne(ine);
  }
  const lat = Number(url.searchParams.get('lat'));
  const lon = Number(url.searchParams.get('lon'));
  if (!url.searchParams.has('lat') || !url.searchParams.has('lon')
      || !(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) {
    throw fallo(400, 'Faltan ine o lat y lon');
  }
  if ((url.searchParams.get('cc') || '').toUpperCase() === 'ES') {
    const cercano = municipioCercano(lat, lon);
    if (cercano) return porIne(cercano);
  }
  const texto = k => (url.searchParams.get(k) || '').slice(0, 80);
  const bruto = await conCache(`om/${lat.toFixed(3)},${lon.toFixed(3)}`, TTL.openMeteo, () => openMeteo(lat, lon));
  return desdeOpenMeteo(bruto, { nombre: texto('nombre'), region: texto('region'), pais: texto('pais') });
}

async function lugares(url) {
  const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
  if (q.length < 2) throw fallo(400, 'Texto demasiado corto');
  const lang = IDIOMAS.has(url.searchParams.get('lang')) ? url.searchParams.get('lang') : 'es';
  return conCache(`lugares/${lang}/${encodeURIComponent(q.toLowerCase())}`, TTL.lugares, async () => {
    const u = new URL('https://geocoding-api.open-meteo.com/v1/search');
    u.search = new URLSearchParams({ name: q, count: '8', language: lang, format: 'json' });
    const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
    const j = await r.json();
    return {
      lugares: (j.results || []).map(x => ({
        nombre: x.name, region: x.admin1 || '', pais: x.country || '', cc: x.country_code || '',
        lat: x.latitude, lon: x.longitude, hab: x.population || 0,
      })),
    };
  });
}
