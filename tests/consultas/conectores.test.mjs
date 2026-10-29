import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearConsultas, crearPresupuesto } from '../../workers/deno-buscar/src/consultas/index.js';
import worker from '../../workers/deno-buscar/src/index.js';

const muestra = nombre => JSON.parse(readFileSync(new URL(`./muestras/${nombre}.json`, import.meta.url)));
function banco({ respuestas = [], entorno = {}, maxDiario, presupuesto: propio } = {}) {
  let tiempo = Date.parse('2026-10-29T12:00:00Z');
  const peticiones = [], guardadas = new Map(), pausas = [];
  const ahora = () => tiempo;
  const presupuesto = propio || crearPresupuesto({ ahora, dormir: async ms => { pausas.push(ms); tiempo += ms; } });
  const consultar = crearConsultas({ ahora, presupuesto, entorno: n => ({
    TMDB_API_READ_ACCESS_TOKEN: 'secreto-de-prueba', ESPN_MAX_PETICIONES_DIA: maxDiario, ...entorno,
  })[n], abrirCache: async () => ({
    match: async req => guardadas.get(req.url)?.clone(),
    put: async (req, r) => { guardadas.set(req.url, r); },
  }), fetch: async (u, opciones) => {
    peticiones.push({ url: new URL(u), opciones, tiempo });
    assert.ok(opciones.headers['User-Agent'].includes('Voceiro'));
    assert.ok(opciones.signal);
    if (!respuestas.length) throw new Error('Petición imprevista');
    const respuesta = respuestas.shift();
    if (respuesta instanceof Error) throw respuesta;
    if (respuesta instanceof Response) return respuesta;
    return Response.json(typeof respuesta === 'string' ? muestra(respuesta) : respuesta);
  } });
  return { peticiones, guardadas, pausas, avanzar: ms => { tiempo += ms; },
    async pedir(params, ficha = false) {
      const r = await consultar(new URL(`https://voceiro.test/consulta${ficha ? '/ficha' : ''}?${new URLSearchParams(params)}`));
      return { r, d: await r.json() };
    } };
}
const ficha = (b, id, idioma = 'es') => b.pedir({ id, idioma }, true);
const buscar = (b, tipo, texto = 'Almudena Grandes', idioma = 'es') => b.pedir({ tipo, texto, idioma });

function envoltorio(d, tipo) {
  assert.equal(d.tipo, tipo);
  for (const k of ['estado','candidatos','ficha','fuente','enlace','licencia','atribucion','consultado','caduca','incompleto']) assert.ok(k in d, k);
  assert.ok(Date.parse(d.consultado));
}

test('libro: candidatos deduplicados, sin elección automática y ficha por identidad', async () => {
  const b = banco({ respuestas: ['ol-buscar-libro', 'ol-obra', 'ol-buscar-libro'] });
  const { d } = await buscar(b, 'libro', 'Los besos en el pan');
  envoltorio(d, 'libro'); assert.equal(d.estado, 'ok'); assert.equal(d.ficha, null);
  assert.equal(d.candidatos.length, 1); assert.equal(d.candidatos[0].id, 'openlibrary:OL17317015W');
  assert.deepEqual(Object.keys(d.candidatos[0]), ['id','titulo','detalle','anio','imagen','enlace']);
  const f = await ficha(b, d.candidatos[0].id);
  assert.deepEqual(f.d.ficha.autores, [{ id: 'openlibrary:OL340785A', nombre: 'Almudena Grandes' }]);
  assert.equal(f.d.ficha.primer_anio, 2016); assert.equal(f.d.ficha.ediciones, 1);
  assert.deepEqual(f.d.ficha.idiomas, ['spa']); assert.match(f.d.ficha.portada, /7395640/);
  assert.equal(f.r.headers.get('cache-control'), 'public, max-age=604800');
  assert.equal(b.peticiones[2].url.searchParams.get('q'), 'key:/works/OL17317015W');
  assert.ok(b.peticiones.slice(1).every((p, i) => p.tiempo - b.peticiones[i].tiempo >= 1000));
});

test('autor: candidato y ficha con fechas, foto ausente y hasta diez obras sin duplicados', async () => {
  const b = banco({ respuestas: ['ol-buscar-autor','ol-autor','ol-autor-obras'] });
  const { d } = await buscar(b, 'autor');
  assert.equal(d.candidatos[0].titulo, 'Almudena Grandes'); assert.equal(d.ficha, null);
  const { d: f } = await ficha(b, d.candidatos[0].id);
  assert.equal(f.ficha.nacimiento, '1960'); assert.equal(f.ficha.fallecimiento, '2021');
  assert.equal(f.ficha.foto, null); assert.ok(f.ficha.obras_principales.length <= 10);
  assert.equal(f.ficha.obras_principales.filter(o => o.titulo === 'Escalera interior').length, 1);
});

test('Open Library: un título compartido por autores distintos conserva ambos candidatos', async () => {
  const datos = muestra('ol-buscar-libro');
  datos.docs.push({ ...datos.docs[0], key:'/works/OL123W', author_key:['OL123A'], author_name:['Otro autor'] });
  const b = banco({respuestas:[datos]});
  const { d } = await buscar(b,'libro');
  assert.equal(d.candidatos.length,2); assert.equal(d.ficha,null);
  assert.equal(d.candidatos[1].detalle,'Otro autor');
});

for (const [tipo, ruta, id] of [['pelicula','movie','1215185'], ['serie','tv','201420']]) {
  test(`${tipo}: búsqueda, ficha, reparto y proveedores de España con Bearer`, async () => {
    const b = banco({ respuestas: [`tmdb-buscar-${tipo}`,`tmdb-${tipo}`] });
    const { d } = await buscar(b, tipo, 'La infiltrada');
    assert.ok(d.candidatos.length); assert.equal(d.ficha, null);
    const { d: f, r } = await ficha(b, `tmdb:${ruta}/${id}`);
    envoltorio(f, tipo); assert.equal(f.estado, 'ok'); assert.ok(f.ficha.titulo_original);
    assert.equal(f.ficha.anio, tipo === 'serie' ? 2023 : 2024);
    assert.ok(f.ficha.reparto.length > 0 && f.ficha.reparto.length <= 8);
    assert.ok(f.ficha[ tipo === 'serie' ? 'creacion' : 'direccion' ].length);
    assert.ok(f.ficha.donde_ver.some(p => p.modo === 'suscripcion'));
    assert.equal(f.ficha.atribucion, 'JustWatch'); assert.match(f.atribucion, /JustWatch/);
    assert.equal(r.headers.get('cache-control'), 'public, max-age=86400');
    assert.ok(b.peticiones.every(p => p.opciones.headers.Authorization === 'Bearer secreto-de-prueba'));
    assert.match(b.peticiones[1].url.searchParams.get('append_to_response'), /watch\/providers/);
    assert.ok(!JSON.stringify(f).includes('secreto-de-prueba'));
  });
}

for (const [codigo, grupos] of [['primera',1], ['nba',2], ['f1',2]]) {
  test(`clasificación ${codigo}: estructura real, posiciones y puntos`, async () => {
    const b = banco({ respuestas: [{ events: [] },`espn-clasificacion-${codigo}`] });
    const candidatos = await buscar(b, 'clasificacion', codigo);
    assert.equal(b.peticiones.length, 0);
    const { d, r } = await ficha(b, candidatos.d.candidatos[0].id);
    assert.equal(d.estado, 'ok'); assert.equal(d.ficha.competicion, codigo);
    assert.equal(d.ficha.grupos.length, grupos); assert.ok(d.ficha.temporada);
    const filas = d.ficha.grupos[0].filas;
    assert.equal(filas[0].pos, 1); assert.equal(filas[0].pts === null, codigo === 'nba');
    assert.equal(r.headers.get('cache-control'), 'public, max-age=900');
    if (codigo === 'primera') assert.deepEqual(filas[0], { pos:1,equipo:'Barcelona',pj:10,g:9,e:0,p:1,pts:27 });
    if (codigo === 'f1') {
      assert.equal(filas[0].equipo, 'Kimi Antonelli'); assert.equal(filas[0].pts, 365);
      assert.equal(d.ficha.grupos[1].filas[0].equipo, 'Mercedes'); assert.equal(d.ficha.grupos[1].filas[0].pts, 607);
    }
  });
}

test('resultados: programados y finales; marcador sigue local/visitante, no el orden del proveedor', async () => {
  const b = banco({ respuestas: ['espn-resultados-primera','espn-resultados-nba'] });
  const a = await ficha(b, 'espn:resultados/primera');
  assert.equal(a.d.ficha.partidos[0].estado, 'programado'); assert.equal(a.d.ficha.partidos[0].marcador, null);
  const n = await ficha(b, 'espn:resultados/nba');
  assert.equal(n.d.ficha.partidos[0].estado, 'final');
  assert.deepEqual(n.d.ficha.partidos[0].marcador, { local:'117',visitante:'129' });
  assert.equal(n.r.headers.get('cache-control'), 'public, max-age=3600');
});

test('ESPN en juego: caché de 60 segundos para resultados y clasificación', async () => {
  const jugando = muestra('espn-resultados-primera');
  jugando.events[0].status.type.state = 'in'; jugando.events[0].competitions[0].status.type.state = 'in';
  const b = banco({ respuestas: [jugando,jugando,'espn-clasificacion-primera'] });
  for (const tipo of ['resultados','clasificacion']) {
    const { d, r } = await ficha(b, `espn:${tipo}/primera`);
    assert.equal(r.headers.get('cache-control'), 'public, max-age=60');
    assert.equal(Date.parse(d.caduca) - Date.parse(d.consultado), 60000);
    if (tipo === 'resultados') assert.equal(d.ficha.partidos[0].estado, 'en_juego');
  }
});

test('contexto: homónimos, resumen y Wikidata con licencia enlazada', async () => {
  const b = banco({ respuestas: ['wp-buscar','wp-resumen','wd-entidad'] });
  const a = await buscar(b, 'contexto');
  assert.equal(a.d.candidatos.length, 5); assert.equal(a.d.ficha, null);
  const { d, r } = await ficha(b, a.d.candidatos[0].id);
  assert.equal(d.ficha.qid, 'Q274348'); assert.ok(d.ficha.resumen.includes('escritora'));
  assert.deepEqual(d.ficha.ids.openlibrary, ['OL340785A']); assert.deepEqual(d.ficha.ids.tmdb, []);
  assert.equal(d.licencia.nombre, 'CC BY-SA'); assert.match(d.licencia.enlace, /by-sa/);
  assert.equal(r.headers.get('cache-control'), 'public, max-age=604800');
});

test('Wikidata: extrae las propiedades TMDB, Open Library y MusicBrainz', async () => {
  const wd = muestra('wd-entidad');
  for (const [p, valor] of [['P4947','123'],['P4983','456'],['P434','mbid']]) wd.entities.Q274348.claims[p] = [{ mainsnak: { datavalue: { value: valor } } }];
  const b = banco({ respuestas: ['wp-resumen',wd] });
  const { d } = await ficha(b, 'wikipedia:Almudena_Grandes');
  assert.deepEqual(d.ficha.ids, { tmdb:['123','456'],openlibrary:['OL340785A'],musicbrainz:['mbid'] });
});

test('vacío no es un fallo de proveedor; errores HTTP, JSON y de red no se cachean', async () => {
  for (const [tipo, respuesta] of [['libro',{docs:[]}],['autor',{docs:[]}],['pelicula',{results:[]}],['serie',{results:[]}],['contexto',{pages:[]}]]) {
    const b = banco({ respuestas:[respuesta] }); const { d } = await buscar(b, tipo);
    assert.equal(d.estado, 'vacio'); assert.equal(b.guardadas.size, 1);
  }
  for (const respuesta of [new Response('fallo',{status:500}),new Error('sin red'),new Response('no JSON'),{}]) {
    const b = banco({ respuestas:[respuesta] }); const { d, r } = await buscar(b, 'libro');
    assert.equal(d.estado, 'no_disponible'); assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store'); assert.equal(b.guardadas.size, 0);
  }
  const b = banco({ respuestas:[{events:[]}] }); assert.equal((await ficha(b,'espn:resultados/nba')).d.estado,'vacio');
});

test('validación: competiciones explícitas, tipos, idiomas e identificadores', async () => {
  const b = banco();
  for (const texto of ['Barcelona','atp','motogp','nba?x=1','__proto__']) {
    const { r, d } = await buscar(b, 'clasificacion', texto); assert.equal(r.status,400); assert.match(d.motivo,/equivalencia/);
  }
  assert.equal((await buscar(b,'otro')).r.status,400);
  assert.equal((await buscar(b,'libro','hola','xx')).r.status,400);
  assert.equal((await ficha(b,'tmdb:../../x')).r.status,400);
  assert.equal((await ficha(b,'espn:resultados/f1')).r.status,400);
  assert.equal(b.peticiones.length,0);
});

test('sin token TMDB: respuesta no_disponible, sin salida ni caché', async () => {
  const b = banco({entorno:{TMDB_API_READ_ACCESS_TOKEN:''}});
  const { d } = await buscar(b,'pelicula'); assert.equal(d.estado,'no_disponible');
  assert.equal(b.peticiones.length,0); assert.equal(b.guardadas.size,0);
});

test('presupuesto ESPN diario configurable y reinicio al día siguiente', async () => {
  const b = banco({maxDiario:1,respuestas:['espn-resultados-nba','espn-resultados-nba']});
  assert.equal((await ficha(b,'espn:resultados/nba')).d.estado,'ok');
  assert.equal((await ficha(b,'espn:resultados/primera')).d.estado,'no_disponible');
  assert.equal(b.peticiones.length,1);
  b.avanzar(86400000);
  assert.equal((await ficha(b,'espn:resultados/nba')).d.estado,'ok');
  const cero = banco({maxDiario:0}); assert.equal((await ficha(cero,'espn:resultados/nba')).d.estado,'no_disponible');
});

test('Open Library: cola acotada y separación incluso con peticiones concurrentes', async () => {
  let t = 0; const inicios = [];
  const presupuesto = crearPresupuesto({ahora:()=>t,dormir:async ms=>{t+=ms;}});
  const tareas = Array.from({length:7},()=>presupuesto('openlibrary',async()=>{inicios.push(t);}));
  const r = await Promise.allSettled(tareas);
  assert.equal(r.filter(x=>x.status==='fulfilled').length,6);
  assert.equal(r[6].status,'rejected'); assert.deepEqual(inicios,[0,1000,2000,3000,4000,5000]);
  const b = banco({presupuesto:async()=>{throw new Error('Presupuesto agotado');}});
  assert.equal((await buscar(b,'libro')).d.estado,'no_disponible'); assert.equal(b.guardadas.size,0);
});

test('caché: misma consulta efectiva, separación por tipo, idioma e ID y caducidad real', async () => {
  const b = banco({respuestas:['ol-buscar-libro','ol-buscar-libro','ol-buscar-autor','ol-buscar-libro']});
  await buscar(b,'libro','  Los  besos en el pan ');
  const hit = await buscar(b,'libro','Los besos en el pan');
  assert.equal(hit.r.headers.get('x-cache'),'HIT'); assert.equal(b.peticiones.length,1);
  await buscar(b,'libro','Los besos en el pan','gl'); await buscar(b,'autor');
  assert.equal(b.peticiones.length,3); b.avanzar(7*86400000);
  await buscar(b,'libro','Los besos en el pan'); assert.equal(b.peticiones.length,4);
  const f = banco({respuestas:['tmdb-pelicula','tmdb-pelicula','tmdb-serie']});
  await ficha(f,'tmdb:movie/1215185');
  f.avanzar(1000);
  assert.equal((await ficha(f,'tmdb:movie/1215185')).r.headers.get('cache-control'),'public, max-age=86399');
  await ficha(f,'tmdb:movie/1215185','en'); await ficha(f,'tmdb:tv/201420');
  assert.equal(f.peticiones.length,3);
});

test('rutas del worker: límite por IP, CORS y método', async () => {
  const req = () => new Request('https://voceiro.test/consulta?tipo=incorrecto&texto=x');
  for (let n=0;n<30;n++) assert.equal((await worker.fetch(req(),{remoteAddr:{hostname:'192.0.2.45'}})).status,400);
  const limitado = await worker.fetch(req(),{remoteAddr:{hostname:'192.0.2.45'}});
  assert.equal(limitado.status,429); assert.equal(limitado.headers.get('access-control-allow-origin'),'*');
  assert.equal((await worker.fetch(req(),{remoteAddr:{hostname:'192.0.2.46'}})).status,400);
  assert.equal((await worker.fetch(new Request(req(),{method:'POST'}))).status,405);
  assert.equal((await worker.fetch(new Request(req(),{method:'OPTIONS'}))).status,204);
});
