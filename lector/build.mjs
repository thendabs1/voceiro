#!/usr/bin/env node
// Construye el lector: concatena src/*.js por orden de nombre y pone la
// versión en la cabecera y en SCRIPT_VERSION.
//
// Uso: node build.mjs [salida]   (por defecto, dist/lector.user.js)
//
// Catálogo de medios: el de Voceiro, sacado de medios.py con catalogo.py
// (necesita python3) y puesto en src/03 en lugar de /*{{CATALOGO}}*/[].
//
// Paleta: shared/tema/paleta.css. Iconos: plantilla.html (plantilla.mjs).
// y puestos en src/20 en lugar de /*{{PALETA}}*/{} y /*{{ICONOS}}*/{}. De
// los iconos van solo los que usa el lector (icono('…')); si falta alguno en
// el sprite de Voceiro, no se construye.
//
// Versión: 2.0.N, con N = número de commits que han tocado este directorio,
// shared/sync, shared/tema, medios.py o plantilla.html (si están en el mismo repo). Así sube sola con cada cambio y
// Violentmonkey ve la actualización. LECTOR_VERSION la fuerza. Necesita la
// historia completa: en CI, checkout con fetch-depth: 0.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerIconos, leerPaleta, temasDePaleta } from './plantilla.mjs';

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
    for (const otra of [resolve(raiz, '..', 'shared', 'sync'), resolve(raiz, '..', 'shared', 'tema'),
                        resolve(raiz, '..', 'medios.py'), resolve(raiz, '..', 'plantilla.html')]){
      if (existsSync(otra) && !relative(top, otra).startsWith('..')) rutas.push(relative(raiz, otra));
    }
    return '2.0.' + git('rev-list', '--count', 'HEAD', '--', ...rutas);
  } catch(e){
    return '2.0.0';
  }
}

// Módulos que entran en el lector, sin los `export`, justo después de la
// plataforma. Solo pueden importar de otro de la lista que vaya antes (todo
// queda en el mismo ámbito: el import se quita). Los de shared/ los comparte
// con Voceiro; los de modulos/ son solo del lector, pero aparte para
// probarlos con node --test (tests/lector).
const COMPARTIDOS = ['../shared/sync/fusion.js', '../shared/sync/cripto.js', '../shared/sync/cliente.js',
                     '../shared/tema/personalizado.js',
                     'modulos/codigo-incrustado.js', 'modulos/mixto.js'];
const TRAS = '02-plataforma.js';

function compartido(rel, n){
  const antes = COMPARTIDOS.slice(0, n).map(r => resolve(raiz, r));
  const fuente = readFileSync(resolve(raiz, rel), 'utf8')
    .replace(/^import\s*\{[^}]*\}\s*from\s*'([^']+)';[ \t]*\n/gm, (linea, de) => {
      if (!antes.includes(resolve(raiz, dirname(rel), de))) throw new Error(`${rel}: importa ${de}, que no va antes`);
      return '';
    });
  if (/^\s*import\b/m.test(fuente)) throw new Error(`${rel}: un módulo compartido no puede importar`);
  const codigo = fuente.replace(/^export\s+(?=(?:async\s+)?function\b|const\b|let\b|class\b)/gm, '');
  if (/^\s*export\b/m.test(codigo)) throw new Error(`${rel}: hay un export que no se sabe quitar`);
  const origen = rel.startsWith('../') ? `${rel.slice(3)} (compartido con Voceiro)` : `lector/${rel}`;
  return `/* ── ${origen} ── */\n${codigo}\n`;
}

const catalogo = execFileSync('python3', ['-I', join(raiz, 'catalogo.py')],
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
if (!Array.isArray(JSON.parse(catalogo))) throw new Error('catálogo de medios vacío');

const plantilla = readFileSync(resolve(raiz, '..', 'plantilla.html'), 'utf8');
const cssPaleta = readFileSync(resolve(raiz, '..', 'shared/tema/paleta.css'), 'utf8');
const paleta = JSON.stringify(temasDePaleta(leerPaleta(cssPaleta)));

const v = version();
const partes = readdirSync(src).filter(f => f.endsWith('.js')).sort();
if (!partes.includes(TRAS)) throw new Error(`falta src/${TRAS}`);
const trozos = [];
for (const f of partes){
  trozos.push(readFileSync(join(src, f), 'utf8'));
  if (f === TRAS) trozos.push(...COMPARTIDOS.map((rel, n) => compartido(rel, n)));
}
let codigo = trozos.join('').replaceAll('{{VERSION}}', v);

const sprite = leerIconos(plantilla);
const usados = [...new Set([...codigo.matchAll(/\bicono\('([a-z0-9-]+)'/g)].map(m => m[1]))].sort();
const faltan = usados.filter(n => !sprite[n]);
if (faltan.length) throw new Error(`iconos que no están en el sprite de plantilla.html: ${faltan.join(', ')}`);
const iconos = JSON.stringify(Object.fromEntries(usados.map(n => [n, sprite[n]])));

for (const [hueco, valor] of [['/*{{CATALOGO}}*/[]', catalogo], ['/*{{PALETA}}*/{}', paleta],
                              ['/*{{ICONOS}}*/{}', iconos]]){
  if (!codigo.includes(hueco)) throw new Error(`falta ${hueco} en src/`);
  codigo = codigo.replace(hueco, () => valor);
}

mkdirSync(dirname(salida), { recursive: true });
writeFileSync(salida, codigo);
console.log(`${salida} · versión ${v} · ${partes.length} partes + ${COMPARTIDOS.length} compartidos · ${codigo.length} caracteres`);
