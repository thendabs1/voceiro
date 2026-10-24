import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { codigoFondo } from '../../lector/extension/fuentes.mjs';
import { fusionarCambiosCfg } from '../../lector/extension/estado.js';
import { fusionarPendientes } from '../../shared/sync/fusion.js';
import { generarCodigo } from '../../shared/sync/cripto.js';
import { atender, d1Local } from '../sync/soporte.mjs';

function fondo(){
  const datos = {}, alarmas = new Map(), cambios = [], registros = [], eventos = new Map();
  let mensaje, permitir = false;
  const srv = d1Local(), peticiones = [];
  const evento = nombre => ({addListener: fn => eventos.set(nombre,fn)});
  const api = {
    runtime:{id:'lector-test',getURL: p => 'moz-extension://lector-test/'+p,
      onMessage:{addListener:fn => { mensaje=fn; }},onStartup:evento('inicio')},
    storage:{local:{async get(){return structuredClone(datos);},async set(o){Object.assign(datos,structuredClone(o)); cambios.push(Object.keys(o)[0]);}}},
    permissions:{async getAll(){return {origins:['https://voceiro-sync.toriorecorda.workers.dev/*','https://voceiro-sync.thendabs1.deno.net/*'], data_collection:permitir ? ['browsingActivity','websiteContent'] : []};},
      async contains(){return true;},onAdded:evento('permisos+'),onRemoved:evento('permisos-')},
    scripting:{async getRegisteredContentScripts(){return [];},async registerContentScripts(s){registros.push(s);},async unregisterContentScripts(){}},
    alarms:{create:(n,o)=>alarmas.set(n,o),onAlarm:evento('alarma')},
    tabs:{async query(){return [{id:10,url:'https://thendabs1.github.io/voceiro/',windowId:1}];},async update(id,o){cambios.push(['actualizar',id,o]);},async remove(id){cambios.push(['cerrar',id]);}},
    windows:{async update(){}},
  };
  const ctx = vm.createContext({browser:api, URL,URLSearchParams,crypto,structuredClone,console,
    TextEncoder,TextDecoder,Blob,Response,Headers,Request,AbortSignal,CompressionStream,DecompressionStream,btoa,
    location:{origin:'moz-extension://lector-test',pathname:'/_generated_background_page.html'},isSecureContext:true,
    setTimeout,clearTimeout,fetch:async (url,o) => {
      peticiones.push(url);
      return atender(new Request(url,o),srv.cf,Date.now(),'1.2.3.4');
    }});
  vm.runInContext(codigoFondo('2.0.1'),ctx);
  const propia = {id:api.runtime.id,url:api.runtime.getURL('opciones.html')};
  const tab = id => ({id:api.runtime.id,url:'https://medio.example/a',tab:{id},frameId:0});
  const enviar = (m,s=propia) => new Promise(resolve => mensaje(m,s,resolve));
  return {enviar,propia,tab,datos,alarmas,cambios,peticiones,permitir:()=>{permitir=true;}};
}

test('el fondo inicia con lectura manual y no entrega el código a las páginas', async () => {
  const f=fondo();
  const inicial=await f.enviar({tipo:'lector:iniciar'},f.tab(1));
  assert.equal(inicial.ok,true);
  assert.equal(inicial.cfg.fab.visible,false);
  const codigo=generarCodigo();
  assert.equal((await f.enviar({tipo:'lector:sync',accion:'vincular',codigo})).ok,true);
  const lector=await f.enviar({tipo:'lector:iniciar'},f.tab(1));
  assert.equal(lector.estado.activo,true);
  assert.equal(JSON.stringify(lector).includes(codigo.replaceAll('-','')),false);
  assert.equal(f.peticiones.length,0);
});

test('el fondo rechaza códigos ajenos a Voceiro, claves privadas y subframes', async () => {
  const f=fondo();
  for (const m of [{tipo:'lector:sync',accion:'voceiro',codigo:generarCodigo()},
    {tipo:'lector:guardar',clave:'lector-sync',valor:{codigo:generarCodigo()}},
    {tipo:'lector:sync',accion:'vincular',codigo:generarCodigo()}]){
    assert.equal((await f.enviar(m,f.tab(1))).ok,false);
  }
  assert.equal((await f.enviar({tipo:'lector:iniciar'},{...f.tab(1),frameId:2})).ok,false);
});

test('dos pestañas que guardan pendientes desde la misma base conservan ambas noticias', async () => {
  const f=fondo(), base=(await f.enviar({tipo:'lector:iniciar'})).cfg;
  const a=structuredClone(base), b=structuredClone(base);
  a.readLater=[{url:'https://medio.example/a',title:'A',date:Date.now()}];
  b.readLater=[{url:'https://medio.example/b',title:'B',date:Date.now()}];
  const r=await Promise.all([f.enviar({tipo:'lector:guardar',clave:'lector-universal-cfg-v8',base,valor:a},f.tab(1)),
    f.enviar({tipo:'lector:guardar',clave:'lector-universal-cfg-v8',base,valor:b},f.tab(2))]);
  assert.ok(r.every(x=>x.ok));
  const cfg=(await f.enviar({tipo:'lector:iniciar'})).cfg;
  assert.deepEqual(new Set(cfg.readLater.map(p=>p.url)),new Set(['https://medio.example/a','https://medio.example/b']));
});

test('la fusión conserva preferencias y reglas cambiadas en otras pestañas', () => {
  const base={prefs:{fs:18,width:720},sites:[],readLater:[]};
  const actual={...base,prefs:{fs:24,width:720},sites:[{domain:'a.example',mode:'auto'}]};
  const nuevo={...base,prefs:{fs:18,width:900},sites:[{domain:'b.example',mode:'prompt'}]};
  const r=fusionarCambiosCfg(actual,base,nuevo,fusionarPendientes);
  assert.deepEqual(r.prefs,{fs:24,width:900});
  assert.deepEqual(r.sites.map(s=>s.domain).sort(),['a.example','b.example']);
});

test('volver a las imágenes generales retira la excepción del medio y conserva otras ediciones', async () => {
  const f=fondo(), clave='lector-universal-cfg-v8';
  const inicial=(await f.enviar({tipo:'lector:iniciar'})).cfg;
  const configurada=structuredClone(inicial);
  configurada.sites=[{domain:'medio.example',imagenes:'ninguna'}];
  const base=(await f.enviar({tipo:'lector:guardar',clave,base:inicial,valor:configurada})).cfg;
  const otra=structuredClone(base);
  otra.sites[0].mode='auto';
  await f.enviar({tipo:'lector:guardar',clave,base,valor:otra},f.tab(2));
  const general=structuredClone(base);
  delete general.sites[0].imagenes;
  const r=await f.enviar({tipo:'lector:guardar',clave,base,valor:general},f.tab(1));
  assert.equal(r.ok,true);
  assert.equal(Object.hasOwn(r.cfg.sites[0],'imagenes'),false);
  assert.equal(r.cfg.sites[0].mode,'auto');
});

test('confirmar avisos de lectura los retira sin perder los nuevos de otra pestaña', async () => {
  const f=fondo(), clave='lector-universal-cfg-v8';
  const inicial=(await f.enviar({tipo:'lector:iniciar'})).cfg;
  const primero={url:'https://medio.example/a',fecha:1};
  const segundo={url:'https://medio.example/b',fecha:2};
  const base=(await f.enviar({tipo:'lector:guardar',clave,base:inicial,
    valor:{...inicial,leidasParaVoceiro:[primero]}})).cfg;
  await f.enviar({tipo:'lector:guardar',clave,base,valor:{...base,leidasParaVoceiro:[primero,segundo]}},f.tab(2));
  const r=await f.enviar({tipo:'lector:guardar',clave,base,valor:{...base,leidasParaVoceiro:[]}},f.tab(1));
  assert.equal(r.ok,true);
  assert.deepEqual(structuredClone(r.cfg.leidasParaVoceiro),[segundo]);
});

test('la siguiente pendiente se guarda por pestaña y antes de responder', async () => {
  const f=fondo();
  const r=await f.enviar({tipo:'lector:guardar',clave:'lector-abrir-al-llegar',valor:{url:'https://medio.example/b'}},f.tab(1));
  assert.equal(r.ok,true);
  assert.ok(f.datos['lector-extension-siguientes']['1']);
  assert.equal((await f.enviar({tipo:'lector:iniciar'},f.tab(2))).siguiente,null);
});

test('el fondo solo sincroniza después del permiso y conserva los datos cifrados', async () => {
  const f=fondo();
  await f.enviar({tipo:'lector:sync',accion:'vincular',codigo:generarCodigo()});
  assert.equal((await f.enviar({tipo:'lector:sync',accion:'ahora'})).ok,false);
  assert.equal(f.peticiones.length,0);
  f.permitir();
  await f.enviar({tipo:'lector:permisos',online:true});
  assert.equal((await f.enviar({tipo:'lector:sync',accion:'ahora'})).ok,true);
  assert.ok(f.peticiones.length>=2);
  assert.ok(f.alarmas.has('lector-sync'));
});

test('volver a Voceiro activa su pestaña y cierra solamente la noticia emisora', async () => {
  const f=fondo();
  assert.equal((await f.enviar({tipo:'lector:volver'},f.tab(7))).ok,true);
  const acciones=f.cambios.filter(Array.isArray);
  assert.deepEqual(acciones.map(x=>x.slice(0,2)),[['actualizar',10],['cerrar',7]]);
});
