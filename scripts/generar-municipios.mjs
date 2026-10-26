// scripts/generar-municipios.mjs
// Genera las dos tablas a partir del maestro de AEMET y la revisión local:
//   1. shared/tiempo/municipios.js               (cliente: autocompletado de eltiempo:)
//      [nombre, INE, habitantes], de más a menos habitantes.
//   2. workers/deno-buscar/src/tiempo/municipios.js  (worker: INE → lugar)
//      INE → [nombre, lat, lon, zona de avisos].
//
// El maestro conserva dos municipios extinguidos y omite productos vigentes.
// La revisión documentada evita reintroducirlos al regenerar.
// Uso: AEMET_API_KEY=… node scripts/generar-municipios.mjs
//      (sin la variable, la lee de .env)

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REVISION = JSON.parse(readFileSync(resolve(ROOT, 'scripts/municipios-aemet-revisados.json'), 'utf-8'));

function clave() {
  if (process.env.AEMET_API_KEY) return process.env.AEMET_API_KEY;
  const env = readFileSync(resolve(ROOT, '.env'), 'utf-8');
  const m = env.match(/^AEMET_API_KEY=(.+)$/m);
  if (!m) throw new Error('Falta AEMET_API_KEY');
  return m[1].trim();
}

// El maestro pone el artículo detrás: «Coruña, A», «Palma d'Ebre, La».
const ARTICULOS = new Set(['el', 'la', 'los', 'las', 'a', 'o', 'as', 'os', "l'", 'les', 'els', 'es', 'sa', 'ses']);

export function nombreVisible(nombre) {
  return nombre.split('/').map(parte => {
    const i = parte.lastIndexOf(', ');
    if (i < 0) return parte;
    const art = parte.slice(i + 2);
    if (!ARTICULOS.has(art.toLowerCase())) return parte;
    return art.endsWith("'") ? art + parte.slice(0, i) : `${art} ${parte.slice(0, i)}`;
  }).join('/');
}

async function maestro() {
  const r = await fetch('https://opendata.aemet.es/opendata/api/maestro/municipios', {
    headers: { api_key: clave(), accept: 'application/json' },
  });
  const paso1 = await r.json();
  if (!paso1.datos) throw new Error(`AEMET: ${paso1.descripcion || r.status}`);
  const r2 = await fetch(paso1.datos);
  if (!/text\/plain|json/.test(r2.headers.get('content-type') || '')) {
    throw new Error(`AEMET: respuesta inesperada (${r2.status}); suele ser el límite de uso, reintentar en un minuto`);
  }
  return JSON.parse(new TextDecoder('iso-8859-15').decode(await r2.arrayBuffer()));
}

function escribir(rel, cabecera, lineas, apertura, cierre) {
  const dst = resolve(ROOT, rel);
  mkdirSync(dirname(dst), { recursive: true });
  writeFileSync(dst, `${cabecera}\n${apertura}\n${lineas.join(',\n')},\n${cierre}\n`, 'utf-8');
  console.log(`✓ ${rel} (${lineas.length} municipios)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const descartados = new Set([...REVISION.obsoletos, ...REVISION.sin_prevision.map(m => m.codigo)]);
  const lista = (await maestro())
    .filter(m => !descartados.has(m.id.replace(/^id/, '')))
    .map(m => ({
      nombre: nombreVisible(m.nombre),
      ine: m.id.replace(/^id/, ''),
      hab: parseInt(m.num_hab, 10) || 0,
      lat: Math.round(parseFloat(m.latitud_dec) * 1000) / 1000,
      lon: Math.round(parseFloat(m.longitud_dec) * 1000) / 1000,
      zona: m.zona_comarcal,
    }));
  const presentes = new Set(lista.map(m => m.ine));
  for (const m of REVISION.activos_fuera_del_maestro) {
    if (!presentes.has(m.codigo)) lista.push({ nombre: m.nombre, ine: m.codigo, hab: 0,
      lat: m.lat, lon: m.lon, zona: m.zona });
  }
  lista.sort((a, b) => b.hab - a.hab || a.nombre.localeCompare(b.nombre, 'es'));

  const aviso = '// Generado por scripts/generar-municipios.mjs desde AEMET y municipios-aemet-revisados.json. No editar a mano.';
  escribir('shared/tiempo/municipios.js', aviso,
    lista.map(m => JSON.stringify([m.nombre, m.ine, m.hab])),
    'export const MUNICIPIOS = [', '];');
  escribir('workers/deno-buscar/src/tiempo/municipios.js', aviso,
    lista.map(m => `${JSON.stringify(m.ine)}:${JSON.stringify([m.nombre, m.lat, m.lon, m.zona])}`),
    'export const MUNICIPIOS = {', `};\nexport const SIN_PREVISION = ${JSON.stringify(REVISION.sin_prevision.map(m => m.nombre))};`);
}
