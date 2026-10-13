#!/usr/bin/env node
// Construye el lector: concatena src/*.js por orden de nombre y pone la
// versión en la cabecera y en SCRIPT_VERSION.
//
// Uso: node build.mjs [salida]   (por defecto, dist/lector.user.js)
//
// Versión: 2.0.N, con N = número de commits que han tocado este directorio
// (y shared/sync, si está en el mismo repo). Así sube sola con cada cambio y
// Violentmonkey ve la actualización. LECTOR_VERSION la fuerza. Necesita la
// historia completa: en CI, checkout con fetch-depth: 0.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = dirname(fileURLToPath(import.meta.url));
const src = join(raiz, 'src');
const salida = resolve(process.argv[2] || join(raiz, 'dist', 'lector.user.js'));

function git(...args){
  return execFileSync('git', ['-C', raiz, ...args],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function version(){
  if (process.env.LECTOR_VERSION) return process.env.LECTOR_VERSION;
  try {
    const top = git('rev-parse', '--show-toplevel');
    const rutas = ['.'];
    const compartido = resolve(raiz, '..', 'shared', 'sync');
    if (existsSync(compartido) && !relative(top, compartido).startsWith('..')){
      rutas.push(relative(raiz, compartido));
    }
    return '2.0.' + git('rev-list', '--count', 'HEAD', '--', ...rutas);
  } catch(e){
    return '2.0.0';
  }
}

// Módulos compartidos con Voceiro que entran en el lector, sin los
// `export`, justo después de la plataforma. No pueden importar nada.
const COMPARTIDOS = ['../shared/sync/fusion.js'];
const TRAS = '02-plataforma.js';

function compartido(rel){
  const fuente = readFileSync(resolve(raiz, rel), 'utf8');
  if (/^\s*import\b/m.test(fuente)) throw new Error(`${rel}: un módulo compartido no puede importar`);
  const codigo = fuente.replace(/^export\s+(?=(?:async\s+)?function\b|const\b|let\b|class\b)/gm, '');
  if (/^\s*export\b/m.test(codigo)) throw new Error(`${rel}: hay un export que no se sabe quitar`);
  return `/* ── ${rel.replace(/^\.\.\//, '')} (compartido con Voceiro) ── */\n${codigo}\n`;
}

const v = version();
const partes = readdirSync(src).filter(f => f.endsWith('.js')).sort();
if (!partes.includes(TRAS)) throw new Error(`falta src/${TRAS}`);
const trozos = [];
for (const f of partes){
  trozos.push(readFileSync(join(src, f), 'utf8'));
  if (f === TRAS) trozos.push(...COMPARTIDOS.map(compartido));
}
const codigo = trozos.join('').replaceAll('{{VERSION}}', v);

mkdirSync(dirname(salida), { recursive: true });
writeFileSync(salida, codigo);
console.log(`${salida} · versión ${v} · ${partes.length} partes + ${COMPARTIDOS.length} compartidos · ${codigo.length} caracteres`);
