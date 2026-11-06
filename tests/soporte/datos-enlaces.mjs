// Ejecuta la carga y la hidratación reales; solo sustituye red y UI.
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { normalize, normStrict, normDomain } from '../../shared/parser.js';
import { normalizeUrlForMatch } from '../../shared/sync/fusion.js';

const codigo = ['03-utilidades-fechas.js', '10-capas.js', '11-datos.js'].map(nombre =>
  readFileSync(new URL(`../../front/app/${nombre}`, import.meta.url), 'utf8')).join('\n');

export function datosEnlaces() {
  const contexto = createContext({
    console: { log() {}, count() {} }, normalize, normStrict, normDomain,
    normalizeUrlForMatch,
    DIAS_MEMORIA: 2, DIAS_MEMORIA_MAX_SCOPE: 30,
    ajRuta: () => '',
  });
  runInContext(codigo + '\nthis.hostDeRuta = hostDeRuta;', contexto);
  return {
    hostDeRuta: contexto.hostDeRuta,
    async cargar(ficheros, orden = ficheros.map((_, i) => i), extender = false) {
      orden ??= ficheros.map((_, i) => i);
      // Las promesas controladas permiten variar el orden de llegada sin temporizadores.
      const pendientes = new Map();
      contexto._fetchJSON = f => new Promise(resolve => pendientes.set(f, resolve));
      contexto.ficheros = structuredClone(ficheros);
      runInContext(`_manifest = { dias: ficheros.map((f, i) => ({
        fecha: f.fecha, grupos: { Pruebas: 'f' + i }
      })) };`, contexto);
      const carga = runInContext(extender
        ? "extenderCapasR2(new Set(['grupo:Pruebas']), 0, ficheros.length)"
        : "_cargarCapa('grupo:Pruebas', { aborted: false })", contexto);
      for (const i of orden) pendientes.get('f' + i)(contexto.ficheros[i]);
      await carga;
      runInContext('construirGruposDuplicados()', contexto);
      return JSON.parse(runInContext(`JSON.stringify(NOTICIAS.flatMap(n => [
        { dominio: n.dominio, enlace: n.enlace },
        ...(n._dupHidden || []).map(o => ({ dominio: o.dominio, enlace: o.enlace }))
      ]))`, contexto));
    },
  };
}
