import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const leer = f => readFileSync(new URL('../../lector/' + f, import.meta.url), 'utf8');
const CFG = 'lector-universal-cfg-v8', STATUS = 'lector-extension-estado';

async function plataforma(refrescar){
  let cambio, lecturas=0;
  const cfg={prefs:{fs:18}}, estado={activo:false};
  const api={
    runtime:{getURL:p=>'moz-extension://prueba/'+p,async sendMessage(m){
      if (m.tipo==='lector:iniciar'){
        if (++lecturas>1 && refrescar) return refrescar();
        return {ok:true,cfg:structuredClone(cfg),estado:structuredClone(estado)};
      }
      return {ok:true,cfg:structuredClone(m.valor)};
    }},
    storage:{onChanged:{addListener:fn=>{cambio=fn;}}}
  };
  const ctx=vm.createContext({browser:api,structuredClone,console,location:{href:'https://medio.example/a'}});
  vm.runInContext(leer('extension/plataforma.js'),ctx);
  const p=await vm.runInContext('crearPlataformaExtension()',ctx);
  return {p,cambio:(clave,valor)=>cambio({[clave]:{newValue:valor}},'local')};
}

test('el estado de sincronización idéntico no vuelve a notificar a las opciones', async () => {
  const {p,cambio}=await plataforma();
  let avisos=0;
  p.alCambiar(STATUS,()=>avisos++);
  cambio(STATUS,{activo:false});
  cambio(STATUS,{activo:true});
  cambio(STATUS,{activo:true});
  assert.equal(avisos,1);
});

test('una lectura atrasada del fondo no sustituye una edición local más reciente', async () => {
  const inicio=Promise.withResolvers(), respuesta=Promise.withResolvers();
  const {p,cambio}=await plataforma(()=>{inicio.resolve(); return respuesta.promise;});
  cambio(CFG,{prefs:{fs:20}});
  await inicio.promise;
  await p.guardar(CFG,{prefs:{fs:24}});
  respuesta.resolve({ok:true,cfg:{prefs:{fs:20}}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(p.leer(CFG).prefs.fs,24);
});

test('los cambios remotos no borran un campo de opciones mientras se está escribiendo', () => {
  const oyentes=new Map(), eventos=new Map(), tareas=[];
  const campo={value:''}, controles=new Map();
  for (const s of ['.il-set-sync-codigo','.il-set-sync-usar','.il-set-fab-visible',
    '.il-set-lang-app','.il-set-auto-all','.il-set-export','.il-set-import','.il-set-reset']){
    controles.set(s,s==='.il-set-sync-codigo'?campo:{});
  }
  let repintados=0;
  const box={style:{},querySelector:s=>controles.get(s)||null,querySelectorAll:()=>[],
    set innerHTML(v){repintados++; campo.value='';}};
  const root={style:{},isConnected:true,classList:{add(){}},appendChild(){},
    contains:el=>el===campo,addEventListener:(n,fn)=>eventos.set(n,fn)};
  const elementos=[root,box];
  const document={activeElement:null,createElement:()=>elementos.shift()};
  const ctx=vm.createContext({document,console,setTimeout:fn=>tareas.push(fn),
    PLATAFORMA:{esPaginaPropia:true,alCambiar:(k,fn)=>{oyentes.set(k,fn);}},
    CFG_KEY:CFG,CFG:{lang:'es',readerAutoAll:false,fab:{visible:false}},esVoceiro:()=>false,
    temaDe:el=>el,t:s=>s,esc:String,estadoSyncLector:()=>({}),codigoSyncLector:()=>null,
    dentro:{querySelector:()=>null,appendChild(){}}});
  vm.runInContext(leer('src/31-panel-de-configuracion.js'),ctx);
  vm.runInContext("openSettings('general',{dentro})",ctx);
  campo.value='https://diccionario.example/{palabra}';
  document.activeElement=campo;
  oyentes.get(CFG)();
  oyentes.get(STATUS)();
  assert.equal(repintados,1);
  assert.equal(campo.value,'https://diccionario.example/{palabra}');
  document.activeElement=null;
  eventos.get('focusout')();
  tareas.forEach(fn=>fn());
  assert.equal(repintados,2);
});
