import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { normalizarPendiente, urlWebValida } from '../../shared/sync/fusion.js';

const leer = f => readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const fusion = leer('shared/sync/fusion.js').replace(/^export /gm, '');
const fuente = fusion + ['01-constantes.js','04-servicios.js','07-configuracion.js',
  '08-diccionarios.js','09-dominios-y-reglas.js','11-pendientes.js',
  '17-extractores-de-articulo.js','31-panel-de-configuracion.js',
  '32-atajos-globales.js','33-menus-gm-init-spa.js']
  .map(f => leer('lector/src/' + f)).join('\n');

function lector(){
  const valores = new Map(), abiertos = [], programados = [], eventos = new Map();
  const contexto = vm.createContext({
    URL, URLSearchParams, console, I18N: { es: {} },
    location: { href: 'https://medio.example/a', hostname: 'medio.example', pathname: '/a', origin: 'https://medio.example', hash: '' },
    PLATAFORMA: { leer: (k,d) => valores.get(k) || d, guardar: (k,v) => valores.set(k, v) },
    document: { addEventListener(){}, getElementById: () => null, querySelector: () => null },
    window: { open: u => abiertos.push(u), addEventListener: (n,f) => eventos.set(n,f) },
    setTimeout: f => { programados.push(f); }, setInterval: f => { eventos.set('interval', f); }, clearInterval(){},
    toast(){}, enviarEstado(){}, sincronizarLectorPronto(){}, apuntarLeidaEnSync(){},
    actualizarBoton(){}, activateReader(){}, __lectorAbierto: null,
  });
  vm.runInContext(fuente, contexto);
  return { contexto, valores, abiertos, programados, eventos,
    run: codigo => vm.runInContext(codigo, contexto) };
}
const plano = valor => JSON.parse(JSON.stringify(valor));

test('los destinos importados solo admiten URLs web absolutas sin credenciales', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,x', '/relativa', 'https://', 'https://usuario:secreto@medio.example/a']){
    assert.equal(urlWebValida(url), '');
    assert.equal(normalizarPendiente({ url }), null);
  }
  assert.equal(urlWebValida('https://medio.example/a?x=1#b'), 'https://medio.example/a?x=1#b');
});

test('diccionarios y servicios validan también al abrir, no solo al importarlos', () => {
  const l = lector();
  assert.equal(l.run('buildDictUrl({ url: \'javascript:void("{palabra}")\' }, "hola")'), null);
  assert.equal(l.run('plantillaServicioValida("https://user:pass@medio.example/?q={url_cod}")'), false);
  l.run('openDictionary({ url: "https://diccionario.example/?q={palabra}" }, "a b");');
  assert.deepEqual(l.abiertos, ['https://diccionario.example/?q=a%20b']);
});

test('la importación descarta reglas y diccionarios inválidos y limita preferencias', () => {
  const l = lector();
  const cfg = plano(l.run(`mergeCfg(DEFAULT_CFG, {
    sites: [null, 2, { domain: 'HTTPS://WWW.MEDIO.EXAMPLE/a', mode: 'inventado' }],
    customCatalog: [{ d: 'otro.example' }],
    prefs: { fs: -10, width: 'ancho', focus: 'sí' },
    dict: { customEs: [null, { id: 'malo', name: 'Malo', url: 'javascript:{palabra}' }] },
    readLater: [{ url: 'javascript:alert(1)' }, { url: 'https://medio.example/a' }],
    ajeno: 'no se guarda'
  })`));
  assert.deepEqual(cfg.sites.map(s => s.domain), ['medio.example', 'otro.example']);
  assert.equal(cfg.sites[0].mode, 'prompt');
  assert.equal(cfg.prefs.fs, 14);
  assert.equal(cfg.prefs.width, 720);
  assert.equal(cfg.prefs.focus, false);
  assert.deepEqual(cfg.dict.customEs, []);
  assert.equal(cfg.readLater.length, 1);
  assert.equal(cfg.ajeno, undefined);
});

test('solo Escape viene asignado y se conservan los atajos elegidos anteriormente', () => {
  const l = lector();
  const nueva = plano(l.run('DEFAULT_CFG.shortcuts'));
  assert.deepEqual(nueva.reader.close, ['escape']);
  assert.ok(Object.entries(nueva.reader).every(([k,v]) => k === 'close' || v.length === 0));
  assert.ok(Object.values(nueva.global).every(v => v.length === 0));
  assert.deepEqual(plano(l.run('mergeCfg(DEFAULT_CFG, {shortcuts:{global:{openReader:["alt+l"]}}}).shortcuts.global.openReader')), ['alt+l']);
});

test('gana la regla del subdominio; el bloqueo explícito del padre sigue siendo global', () => {
  const l = lector();
  l.run(`CFG.sites = [{domain:'example',mode:'off'}, {domain:'medio.example',mode:'auto'}];`);
  assert.equal(l.run('findSiteRule().mode'), 'auto');
  l.run("CFG.disabledDomains = ['example'];");
  assert.equal(l.run('isDomainDisabled(location.hostname)'), true);
});

test('guardar, terminar y deshacer usan la URL del artículo aunque cambie la página', () => {
  const l = lector();
  l.run(`location.href = 'https://medio.example/b';
    saveForLater({headline:'Artículo A', url:'https://medio.example/a'});
    globalThis.deshacer = marcarLeidaAlTerminar('https://medio.example/a');`);
  assert.equal(l.run('CFG.readLater[0].url'), 'https://medio.example/a');
  assert.equal(l.run('CFG.readLater[0].read'), true);
  assert.equal(l.run('CFG.leidasParaVoceiro[0].url'), 'https://medio.example/a');
  l.run('deshacer()');
  assert.equal(l.run('CFG.readLater[0].read'), false);
});

test('guardar respeta la elección de no conservar las leídas', () => {
  const l = lector();
  l.run(`CFG.readerSettings.keepReadItems = false;
    saveForLater({headline:'A'}); saveForLater({headline:'A'});`);
  assert.equal(l.run('pendientesVisibles().length'), 0);
});

test('un cambio de URL cierra el lector anterior y no modifica history', () => {
  const l = lector();
  let cerrados = 0;
  l.contexto.__lectorAbierto = { cerrar(){ cerrados++; l.contexto.__lectorAbierto = null; } };
  l.run("location.href = 'https://medio.example/b'; checkUrlChange();");
  assert.equal(cerrados, 1);
  assert.equal(l.programados.length, 2);
  assert.ok(l.eventos.has('interval'));
});

test('los ajustes abiertos sobre un medio se trasladan a Voceiro sin pintar datos en el medio', () => {
  const l = lector();
  l.contexto.document = new Proxy({}, { get(){ assert.fail('No debe acceder al DOM del medio'); } });
  l.run('openSettings("pendientes")');
  const u = new URL(l.abiertos[0]);
  assert.equal(u.origin, 'https://thendabs1.github.io');
  assert.equal(new URLSearchParams(u.hash.slice(1)).get('lector'), 'pendientes');
});

test('los eventos de teclado sintéticos no activan acciones privilegiadas', () => {
  const l = lector();
  l.contexto.document = new Proxy({}, { get(){ assert.fail('Evento rechazado antes de inspeccionar el DOM'); } });
  l.run('globalKeyHandler({isTrusted:false,key:"p",altKey:true})');
});

test('los embebidos se convierten en tarjetas dentro de un clon desconectado', () => {
  const l = lector();
  let tarjetas = 0;
  const video = { isConnected: false, getAttribute: n => n === 'src' ? 'https://www.youtube.com/embed/abcdefgh' : '', replaceWith(){ tarjetas++; } };
  l.contexto.raiz = {
    contains: el => el === video,
    ownerDocument: { createElement: () => ({ setAttribute(){} }) },
    querySelectorAll: sel => sel.startsWith('iframe[src*="youtube.com/embed/"]') ? [video] : []
  };
  l.contexto.absUrl = u => u;
  l.run('marcarEmbebidos(raiz)');
  assert.equal(tarjetas, 1);
});

test('el teleprompter no se duplica y cierra sus temporizadores con Escape', () => {
  const l = lector(), temporizadores = new Set(), rafs = new Map(), controles = new Map();
  l.contexto.esc = s => String(s);
  let siguiente = 0, root;
  const linea = { style: {}, getBoundingClientRect: () => ({ height: 20, top: 0, bottom: 20 }) };
  for (const id of ['il-tp-viewport','il-tp-inner','il-rsvp-pl','il-rsvp-v','il-rsvp-bar','il-rsvp-sl','il-rsvp-fs','il-rsvp-cls']){
    controles.set('#'+id, { style: {}, clientHeight: 100, querySelectorAll: () => [linea], getBoundingClientRect: () => ({top:0}) });
  }
  const eventos = new Map();
  l.contexto.document.createElement = () => (root = {
    style: {}, setAttribute(){}, focus(){}, remove(){ this.isConnected = false; },
    querySelector: s => controles.get(s), addEventListener: (s,f) => eventos.set(s,f)
  });
  const ov = { isConnected: true, querySelector: () => root?.isConnected ? root : null, appendChild: el => { el.isConnected = true; } };
  l.contexto.ov = ov;
  l.contexto.requestAnimationFrame = f => { const n=++siguiente; rafs.set(n,f); return n; };
  l.contexto.cancelAnimationFrame = n => rafs.delete(n);
  l.contexto.setTimeout = f => { temporizadores.add(f); return f; };
  l.contexto.clearTimeout = f => temporizadores.delete(f);
  vm.runInContext(leer('lector/src/24-rsvp.js'), l.contexto);
  l.run('openRSVP(ov, "una noticia que se puede leer con calma");');
  const primero = root;
  l.run('openRSVP(ov, "otra");');
  assert.equal(root, primero);
  // Ejecuta las dos fases iniciales, sin hacer avanzar la animación.
  const sacar = () => { const [n,f] = rafs.entries().next().value; rafs.delete(n); f(); };
  sacar(); sacar();
  assert.equal(temporizadores.size, 1);
  eventos.get('keydown')({key:'Escape',preventDefault(){},stopPropagation(){}});
  assert.equal(temporizadores.size, 0);
  assert.equal(rafs.size, 0);
  assert.equal(root.isConnected, false);
  assert.equal(ov.__cerrarRSVP, undefined);
});
