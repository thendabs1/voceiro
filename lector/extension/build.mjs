#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codigoFondo } from './fuentes.mjs';

const raiz = dirname(fileURLToPath(import.meta.url));
const lector = resolve(raiz, '..');
const navegador = process.argv[2] || 'firefox';
if (!['firefox','chrome'].includes(navegador)) throw new Error('Usa firefox o chrome');
const salida = resolve(process.argv[3] || join(lector,'dist',navegador));
mkdirSync(join(salida,'vendor'),{recursive:true});
const leer = f => readFileSync(join(raiz,f),'utf8');
const src = f => readFileSync(join(lector,'src',f),'utf8');
const userscript = join(salida,'..',navegador+'-base.user.js');
execFileSync(process.execPath,[join(lector,'build.mjs'),userscript],{stdio:'pipe'});
let codigo = readFileSync(userscript,'utf8');
const version = codigo.match(/const SCRIPT_VERSION = '([^']+)'/)[1];
codigo = codigo.slice(codigo.indexOf('(function(){'));
codigo = codigo.replace('(function(){', 'globalThis.__lectorExtensionListo ||= (async function(){');
for (const [f, texto] of [['02-plataforma.js','const PLATAFORMA = await crearPlataformaExtension();\n'],['28-sincronizacion.js',leer('sync-contenido.js')]]){
  if (!codigo.includes(src(f))) throw new Error('No se encuentra '+f+' en la construcción');
  codigo = codigo.replace(src(f), () => texto);
}
writeFileSync(join(salida,'lector.js'),codigo);

const catalogo = JSON.parse(execFileSync('python3',['-I',join(lector,'catalogo.py')],{encoding:'utf8'}));
writeFileSync(join(salida,'fondo.js'),codigoFondo(version,catalogo));
for (const f of ['plataforma.js','opciones.html','opciones.js','interfaz.css','popup.html','popup.js','icono.svg']){
  copyFileSync(join(raiz,f),join(salida,f));
}
for (const f of ['Readability.js','LICENSE-Readability','Apache-2.0.txt']) copyFileSync(join(raiz,'vendor',f),join(salida,'vendor',f));
copyFileSync(join(lector,'LICENSE'),join(salida,'LICENSE'));
const manifest = {
  manifest_version:3, name:'Lector Universal', version,
  description:'Lectura accesible de noticias, pendientes, diccionarios y sincronización cifrada con Voceiro.',
  // storage.local es compartido: no conservar datos de navegación privada.
  incognito:'not_allowed',
  permissions:['activeTab','scripting','storage','alarms'],
  host_permissions:['https://voceiro-sync.toriorecorda.workers.dev/*','https://voceiro-sync.thendabs1.deno.net/*'],
  optional_host_permissions:['http://*/*','https://*/*'],
  action:{default_title:'Lector Universal',default_popup:'popup.html'},
  options_ui:{page:'opciones.html',open_in_tab:true},
  background: navegador === 'firefox' ? {scripts:['fondo.js']} : {service_worker:'fondo.js'},
};
if (navegador === 'firefox'){
  manifest.icons = {48:'icono.svg',96:'icono.svg'};
  manifest.browser_specific_settings = {gecko:{
    id:'lector-universal@voceiro', strict_min_version:'140.0',
    data_collection_permissions:{required:['none'],optional:['browsingActivity','websiteContent']}
  },gecko_android:{strict_min_version:'142.0'}};
}
writeFileSync(join(salida,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`${salida} · ${navegador} · ${version}`);
