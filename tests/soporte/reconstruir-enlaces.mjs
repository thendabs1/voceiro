import { datosEnlaces } from './datos-enlaces.mjs';

let entrada = '';
for await (const fragmento of process.stdin) entrada += fragmento;
const { ficheros, orden, extender } = JSON.parse(entrada);
console.log(JSON.stringify(await datosEnlaces().cargar(ficheros, orden, extender)));
