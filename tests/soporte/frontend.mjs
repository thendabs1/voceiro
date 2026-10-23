import { readFileSync, readdirSync } from 'node:fs';

// Código fuente o módulo publicado, según la variante que prueba cada suite.
// Las pruebas de comportamiento siguen ejecutando las funciones reales con
// sus relojes y elementos simulados, sin arrancar toda la aplicación.
export function leerAplicacion(archivo = 'plantilla.html'){
  if (archivo === 'public/index.html')
    return readFileSync(new URL('../../public/app.js', import.meta.url), 'utf8');
  if (archivo !== 'plantilla.html') throw new Error(`Frontend desconocido: ${archivo}`);
  const carpeta = new URL('../../front/app/', import.meta.url);
  return readdirSync(carpeta).filter(nombre => nombre.endsWith('.js')).sort()
    .map(nombre => readFileSync(new URL(nombre, carpeta), 'utf8')).join('');
}
