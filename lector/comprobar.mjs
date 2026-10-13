#!/usr/bin/env node
// Comprueba el lector construido, en la CI y antes de publicarlo en Pages:
// - que lleva la cabecera del userscript;
// - que todo dominio al que enlaza (https://…) está en dominios-permitidos.txt.
// Así ningún servicio externo entra en el lector sin decidirlo a propósito.
// Uso: node comprobar.mjs [archivo]   (por defecto, dist/lector.user.js)
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = dirname(fileURLToPath(import.meta.url));
const archivo = resolve(process.argv[2] || join(raiz, 'dist', 'lector.user.js'));
const codigo = readFileSync(archivo, 'utf8');

const permitidos = new Set(
  readFileSync(join(raiz, 'dominios-permitidos.txt'), 'utf8')
    .split('\n')
    .map(l => l.replace(/#.*/, '').trim().toLowerCase())
    .filter(Boolean)
);

if (!codigo.startsWith('// ==UserScript==')){
  console.error(`${archivo}: falta la cabecera del userscript`);
  process.exit(1);
}

const enlazados = new Set();
for (const m of codigo.matchAll(/https?:\/\/((?:[a-z0-9-]+\.)+[a-z]{2,})/gi)){
  enlazados.add(m[1].toLowerCase());
}
const fuera = [...enlazados].filter(d => !permitidos.has(d)).sort();
if (fuera.length){
  console.error('Dominios que no están en dominios-permitidos.txt:\n  ' + fuera.join('\n  '));
  process.exit(1);
}
console.log(`${archivo}: ${enlazados.size} dominios, todos permitidos`);
