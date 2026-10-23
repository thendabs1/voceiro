// Cada workflow de despliegue vigila justo los módulos de workers/comun que
// importa su worker: si falta uno, un cambio ahí no se despliega; si sobra,
// gasta un despliegue (Deno permite 15 por hora en toda la cuenta).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../../', import.meta.url));

const WORKFLOWS = {
  'cf-buscar': 'deploy-worker.yml',
  'cf-datos': 'deploy-worker-datos.yml',
  'cf-sync': 'deploy-worker-sync.yml',
  'deno-buscar': 'deploy-deno-buscar.yml',
  'deno-datos': 'deploy-deno-datos.yml',
  'deno-sync': 'deploy-deno-sync.yml',
};

function archivosJs(dir){
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'comun' ? [] : archivosJs(ruta);
    return e.name.endsWith('.js') ? [ruta] : [];
  });
}

// Los módulos de comun/ que importa el worker (sin mirar las copias).
function importados(worker){
  const mods = new Set();
  for (const f of archivosJs(join(raiz, 'workers', worker, 'src'))){
    for (const m of readFileSync(f, 'utf8').matchAll(/from\s+'(?:\.\.?\/)+comun\/([a-z-]+\.js)'/g)) mods.add(m[1]);
  }
  return [...mods].sort();
}

function vigilados(workflow){
  const yml = readFileSync(join(raiz, '.github/workflows', workflow), 'utf8');
  return [...yml.matchAll(/^\s*-\s*'workers\/comun\/([^']+)'/gm)].map(m => m[1]).sort();
}

for (const [worker, workflow] of Object.entries(WORKFLOWS)){
  test(`${workflow} vigila los módulos comunes de ${worker}`, () => {
    const usa = importados(worker);
    assert.ok(usa.length, `${worker} no importa nada de comun/`);
    assert.deepEqual(vigilados(workflow), usa);
  });
}

test('todo módulo de workers/comun lo usa algún worker', () => {
  const usados = new Set(Object.keys(WORKFLOWS).flatMap(importados));
  const hay = readdirSync(join(raiz, 'workers/comun')).filter(f => f.endsWith('.js')).sort();
  assert.deepEqual(hay.filter(f => !usados.has(f)), []);
});
