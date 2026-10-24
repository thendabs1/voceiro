import { readFileSync } from 'node:fs';

const leer = ruta => readFileSync(new URL(ruta, import.meta.url), 'utf8');
function sinExport(s){
  return s.replace(/^import\s*\{[^}]*\}\s*from\s*'[^']+';[^\n]*\n/gm,'').replace(/^export\s+/gm,'');
}
export function codigoFondo(version, catalogo = []){
  const compartidos = ['fusion','cripto','cliente'].map(f => sinExport(leer('../../shared/sync/'+f+'.js'))).join('\n');
  const piezas = ['01-constantes.js','03-catalogo-de-medios.js','04-servicios.js','07-configuracion.js','08-diccionarios.js',
    '09-dominios-y-reglas.js','11-pendientes.js','28-sincronizacion.js'].map(f => leer('../src/'+f)).join('\n');
  const puente = leer('../src/34-puente-con-voceiro.js').split('// Volver a Voceiro:')[0];
  const comun = [compartidos,sinExport(leer('./estado.js')),piezas,puente].join('\n')
    .replaceAll('{{VERSION}}',version).replace('/*{{CATALOGO}}*/[]', () => JSON.stringify(catalogo));
  return leer('./fondo.js').replace('/*{{COMUN}}*/', () => comun);
}
