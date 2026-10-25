// Inventario local: contrasta los catálogos versionados sin red ni escrituras.
// Los códigos sin correspondencia se informan; no se fusionan ni se corrigen.
// Uso: node scripts/revisar-base-territorial.mjs
import { readFileSync } from 'node:fs';
import { crearCatalogo } from '../shared/territorios/codigos.js';
import { MUNICIPIOS as sugerencias } from '../shared/tiempo/municipios.js';
import { MUNICIPIOS as tiempo } from '../workers/deno-buscar/src/tiempo/municipios.js';

if (process.argv.length !== 2) throw new Error('Uso: node scripts/revisar-base-territorial.mjs');

const municipios = JSON.parse(readFileSync(new URL('../shared/territorios/municipios.json', import.meta.url), 'utf8'));
const catalogo = crearCatalogo(municipios);
const codigosTiempo = Object.keys(tiempo).sort();
const codigosCliente = new Set(), repetidosCliente = new Set();
for (const [, codigo] of sugerencias) {
  if (codigosCliente.has(codigo)) repetidosCliente.add(codigo);
  codigosCliente.add(codigo);
}
const describirTiempo = codigo => ({ codigo, nombre: tiempo[codigo][0] });

const informe = {
  version: 1,
  catalogo_territorial: { version: catalogo.version, fecha_referencia: catalogo.fecha_referencia },
  alcance: 'archivos_versionados; no verifica vigencia del proveedor ni cobertura geográfica de las zonas',
  recuentos: {
    municipios_ine: municipios.municipios.length,
    municipios_tiempo: codigosTiempo.length,
    sugerencias_tiempo: sugerencias.length,
    zonas_declaradas: new Set(Object.values(tiempo).map(m => m[3]).filter(Boolean)).size,
  },
  diferencias_cliente_worker: {
    solo_cliente: [...codigosCliente].filter(c => !Object.hasOwn(tiempo, c)).sort(),
    solo_worker: codigosTiempo.filter(c => !codigosCliente.has(c)),
    codigos_repetidos_cliente: [...repetidosCliente].sort(),
  },
  pendientes: {
    tiempo_sin_correspondencia_ine: codigosTiempo
      .filter(c => !catalogo.resolver('ine:municipio', c)).map(describirTiempo),
    ine_sin_punto_tiempo: municipios.municipios
      .filter(([c]) => !Object.hasOwn(tiempo, c)).map(([codigo, , nombre]) => ({ codigo, nombre })),
    tiempo_sin_zona: codigosTiempo.filter(c => !tiempo[c][3]).map(describirTiempo),
  },
};

console.log(JSON.stringify(informe, null, 2));
