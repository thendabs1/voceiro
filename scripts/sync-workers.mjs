// Fuente única en workers/comun; copias locales para despliegues independientes.
// Deno Deploy sube cada workers/deno-*/ sin depender de archivos fuera de él.
// Uso: node scripts/sync-workers.mjs [--check]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const comprobar = process.argv.includes('--check');
if (process.argv.slice(2).some(arg => arg !== '--check')) {
  throw new Error('Uso: node scripts/sync-workers.mjs [--check]');
}

const archivos = {
  buscar: ['buscar.js', 'turso.js', 'gnews.js', 'limite.js'],
  datos: ['datos-cache.js'],
  sync: ['sync.js', 'limite.js'],
};
const pendientes = [];
let total = 0;
for (const [servicio, nombres] of Object.entries(archivos)) {
  for (const nombre of nombres) {
    const origen = `workers/comun/${nombre}`;
    const contenido = `// Generado desde ${origen} por scripts/sync-workers.mjs. No editar.\n`
      + readFileSync(resolve(raiz, origen), 'utf8');
    for (const plataforma of ['cf', 'deno']) {
      const rel = `workers/${plataforma}-${servicio}/src/comun/${nombre}`;
      const destino = resolve(raiz, rel);
      if (comprobar) {
        let actual;
        try { actual = readFileSync(destino, 'utf8'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (actual !== contenido) pendientes.push(rel);
      } else {
        mkdirSync(dirname(destino), { recursive: true });
        writeFileSync(destino, contenido);
      }
      total++;
    }
  }
}
if (pendientes.length) {
  console.error(`Copias desactualizadas:\n${pendientes.join('\n')}\nEjecuta node scripts/sync-workers.mjs`);
  process.exitCode = 1;
} else {
  console.log(`${total} módulos de workers ${comprobar ? 'comprobados' : 'sincronizados'}`);
}
