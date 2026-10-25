// Contrato de publicación Python → reglas JS comunes → filas SQL derivadas.
import { prepararLectura } from '../shared/calendario/proyeccion.js';
let entrada = '';
for await (const trozo of process.stdin) {
  entrada += trozo;
  if (entrada.length > 64_000_000) throw new Error('Publicación demasiado grande');
}
process.stdout.write(JSON.stringify(prepararLectura(JSON.parse(entrada))));
