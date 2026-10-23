import { readFileSync, readdirSync } from 'node:fs';

// Las pruebas de comportamiento leen las piezas reales de la aplicación.
// test_front.py comprueba que el módulo publicado conserva ese código.
export function leerAplicacion(){
  const carpeta = new URL('../../front/app/', import.meta.url);
  return readdirSync(carpeta).filter(nombre => nombre.endsWith('.js')).sort()
    .map(nombre => readFileSync(new URL(nombre, carpeta), 'utf8')).join('');
}
