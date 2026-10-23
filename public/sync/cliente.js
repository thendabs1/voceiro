// Cliente de la sincronización entre dispositivos (servidor: workers/cf-sync).
//
// sincronizar() baja el bloque del servidor, lo descifra, lo fusiona con lo
// local (fusionarDocumento) y, si el resultado no es lo que ya había, lo
// sube cifrado. Si otro dispositivo escribió entre medias (409), vuelve a
// empezar. Devuelve el documento fusionado: quien llama lo vuelca en local.
import { derivar, cifrar, descifrar } from './cripto.js?v=e4cb42a377';
import { fusionarDocumento, huella } from './fusion.js?v=e4cb42a377';

export const MAX_SUBIDA = 500 * 1024;   // el servidor admite 512 KB
const INTENTOS = 4;

const esperarMs = ms => new Promise(r => setTimeout(r, ms));

export function crearCliente({ servidores, fetch: pedirFetch = globalThis.fetch,
                               esperar = esperarMs, ahora = () => Date.now() }){
  // Cada servidor de la lista, por orden, si el anterior no responde (para
  // poder añadir un respaldo en Deno sin tocar nada más).
  async function pedir(ruta, opciones){
    let fallo;
    for (const base of servidores){
      try { return await pedirFetch(base + ruta, opciones); }
      catch (e){ fallo = e; }
    }
    throw fallo || new Error('sin servidor');
  }

  // Si el bloque no cabe, se recortan las leídas (lo que más ocupa). Devuelve
  // también el documento que de verdad se sube.
  async function bloqueQueQuepa(clave, documento){
    let doc = documento;
    for (let i = 0; i < 4; i++){
      const bloque = await cifrar(clave, doc);
      if (bloque.length <= MAX_SUBIDA) return { bloque, doc };
      const leidas = Object.entries(doc.leidas || {}).sort((x, y) => y[1] - x[1]);
      doc = { ...doc, leidas: Object.fromEntries(leidas.slice(0, Math.floor(leidas.length / 2))) };
    }
    throw new Error('demasiados datos');
  }

  return {
    async sincronizar(codigo, local){
      const { id, token, clave } = await derivar(codigo);
      const auth = { Authorization: 'Bearer ' + token };
      for (let i = 0; i < INTENTOS; i++){
        const r = await pedir(`/v1/s/${id}`, { headers: auth, cache: 'no-store' });
        let remoto = null, version = 0;
        if (r.status === 200){
          version = Number(r.headers.get('X-Version')) || 0;
          remoto = await descifrar(clave, await r.arrayBuffer());
        } else if (r.status !== 404){
          throw new Error('servidor ' + r.status);
        }

        const documento = fusionarDocumento(local, remoto, ahora());
        if (remoto && huella(documento) === huella(fusionarDocumento(remoto, null, ahora()))){
          return { documento, subido: false };
        }
        const { bloque, doc } = await bloqueQueQuepa(clave, documento);
        const p = await pedir(`/v1/s/${id}`, {
          method: 'PUT',
          headers: { ...auth, 'If-Match': String(version), 'Content-Type': 'application/octet-stream' },
          body: bloque,
        });
        if (p.status === 200) return { documento: doc, subido: true };
        if (p.status === 409) continue;                      // otro escribió antes
        if (p.status === 429){ await esperar(2100); continue; }
        throw new Error('servidor ' + p.status);
      }
      throw new Error('demasiados conflictos');
    },

    async borrar(codigo){
      const { id, token } = await derivar(codigo);
      const r = await pedir(`/v1/s/${id}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
      if (r.status !== 204) throw new Error('servidor ' + r.status);
    },
  };
}
