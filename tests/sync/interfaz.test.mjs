import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const fuente = readFileSync(new URL('../../front/app/08-sincronizacion.js', import.meta.url), 'utf8');
function interfaz(cliente){
  const valores = new Map([['voceiro-sync-codigo', 'codigo']]);
  const eventos = new Map(), avisos = [], temporizadores = new Set();
  const contexto = vm.createContext({
    localStorage: { getItem:k=>valores.get(k), setItem:(k,v)=>valores.set(k,v), removeItem:k=>valores.delete(k) },
    setTimeout:f=>{ temporizadores.add(f); return f; }, clearTimeout:f=>temporizadores.delete(f),
    toast:t=>avisos.push(t), t:k=>k, confirm:()=>true,
    document:{ addEventListener(){} }, enviarEstadoAlLector(){},
    $:selector=>({ addEventListener:(evento,fn)=>eventos.set(selector+':'+evento,fn) }),
  });
  vm.runInContext(fuente, contexto);
  contexto.cliente = cliente;
  vm.runInContext(`SYNC_CODIGO = 'codigo'; _sync.cliente = cliente;
    documentoLocal = () => ({ pendientes: ['local'] });
    volcarDocumento = () => { throw new Error('No debe volcar datos'); };
    ajPintarSync = () => {}; ajPintarSyncEstado = () => {}; wireSync();`, contexto);
  return { contexto, valores, avisos, temporizadores, eventos };
}

test('la interfaz olvida un código revocado sin reintentos ni borrar datos locales', async () => {
  const f = interfaz({ async sincronizar(){ throw Object.assign(new Error('revocado'), { code:'SYNC_REVOCADO' }); } });
  f.valores.set('pendientes', 'datos locales');
  await f.contexto.sincronizarAhora();
  assert.equal(f.contexto.SYNC_CODIGO, null);
  assert.equal(f.valores.get('pendientes'), 'datos locales');
  assert.equal(f.valores.has('voceiro-sync-codigo'), false);
  assert.equal(f.temporizadores.size, 0);
  assert.deepEqual(f.avisos, ['syncRevocado']);
});

test('borrar espera una primera subida y bloquea nuevas sincronizaciones', async () => {
  let terminar, borrados = 0;
  const pendiente = new Promise(resolve=>{ terminar=resolve; });
  const f = interfaz({ async borrar(codigo){ assert.equal(codigo, 'codigo'); borrados++; },
    async sincronizar(){ throw new Error('No debe subir mientras borra'); } });
  f.contexto._sync.enCurso = pendiente;
  const borrado = f.eventos.get('#sync-borrar:click')();
  await f.contexto.sincronizarAhora();
  assert.equal(borrados, 0);
  terminar();
  await borrado;
  assert.equal(borrados, 1);
  assert.equal(f.contexto.SYNC_CODIGO, null);
  assert.equal(f.contexto._sync.borrando, false);
});
