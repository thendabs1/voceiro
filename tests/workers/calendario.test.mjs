import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { prepararLectura } from '../../shared/calendario/proyeccion.js';
import { atenderCalendario, normalizarConsulta, consultaEventos, consultaResumen } from '../../workers/comun/calendario.js';
import { consultarTurso } from '../../workers/comun/calendario-turso.js';
import { seleccionCalendario, leerConsultaCalendario } from '../../shared/calendario/consulta.js';
import { agruparPorDiaCalendario, presentacionCalendario, sumarDiasCalendario, TRAMO_MAX_DIAS } from '../../shared/calendario/fechas.js';

const env = { CALENDARIO_TURSO_URL: 'libsql://prueba.turso.io', CALENDARIO_TURSO_TOKEN_LECTURA: 'solo-prueba' };
const extremo = (fecha, instante = null) => ({ fecha, instante, certeza_fecha: fecha ? 'confirmado' : 'desconocido',
  certeza_hora: instante ? 'confirmado' : 'desconocido' });
function muestra() {
  const catalogo = { version: 1, conceptos: { cultura: { padres: [] }, teatro: { padres: ['cultura'] },
    deportes: { padres: [] }, tenis: { padres: ['deportes'] } } };
  const entidades = {}, eventos = [];
  for (let i = 0; i < 90; i++) {
    const id = String(i).padStart(3, '0'), k = 'evento:' + id;
    entidades[k] = { id, tipo: 'evento', clase: 'funcion', nombres: { es: i < 65 ? 'Teatro de proba' : 'Música na Coruña' },
      temas: [i < 65 ? 'teatro' : 'tenis'], codigos: i < 65 ? [] : ['wta'], objetivos: [k] };
    eventos.push({ ...entidades[k], programacion: { valor: { modalidad: 'puntual', cuando: {
      inicio: extremo('2026-10-25'), fin: extremo(null) } } },
      territorios: [{ territorio: 'es:municipio:36038', papel: 'celebracion', ancestros: ['es:provincia:36', 'es:autonomia:12', 'pais:ES'] }],
      fuentes: [{ fuente: 'galicia', comprobado: '2026-10-24T12:00:00Z' }], resultado: i === 89 ? { condicion: 'final' } : null,
      participaciones: [] });
  }
  // Actividad prolongada con días excluidos y fin exclusivo.
  eventos[0].programacion.valor.cuando = { inicio: extremo('2026-10-23'), fin: extremo('2026-10-28'),
    fin_exclusivo: true, dias_excluidos: ['2026-10-24'], dias_semana: [0, 1, 2, 3, 4, 6] };
  eventos[1].programacion.valor.cuando = { inicio: extremo('2026-10-25', '2026-10-25T00:30:00Z'), fin: extremo(null) };
  eventos[2].programacion.valor.cuando = { inicio: extremo('2026-10-25', '2026-10-25T23:30:00Z'), fin: extremo(null) };
  eventos[3].programacion.valor.cuando = { inicio: extremo(null), fin: extremo(null) };
  return { version: 1, nucleo_version: 2, revision: false, generado: '2026-10-25T12:00:00Z',
    catalogo, entidades, eventos, clasificaciones: [], fuentes: { galicia: { nombre: 'Galicia' } }, territorios_catalogo: { version: [1, 1] } };
}

function base(datos = muestra()) {
  const p = prepararLectura(datos), db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(readFileSync(new URL('../../agenda/lectura.sql', import.meta.url), 'utf8'));
  const meta = Object.fromEntries(Object.entries(p).filter(([k]) => !['eventos', 'facetas', 'tramos', 'chips', 'entidades'].includes(k)));
  meta.revision = 'revision-1';
  db.prepare('INSERT INTO agenda_lectura_control VALUES (1,1,?,0,?)').run(meta.revision, JSON.stringify(meta));
  for (const [tabla, n] of [['eventos', 5], ['facetas', 3], ['tramos', 4], ['chips', 7], ['entidades', 4]]) {
    const s = db.prepare(`INSERT INTO agenda_lectura_${tabla} VALUES (${Array(n).fill('?').join(',')})`);
    for (const f of p[tabla]) s.run(...f);
  }
  let peticiones = 0;
  const sql = [];
  const consultar = async (_, sentencias) => {
    peticiones++;
    db.exec('BEGIN');
    try {
      return sentencias.map(s => { sql.push(s.sql); return db.prepare(s.sql).all(...s.args); });
    } finally { db.exec('COMMIT'); }
  };
  const pedir = async (ruta, opciones = {}) => {
    const r = await atenderCalendario(new Request('https://datos.test' + ruta, opciones), env, { consultar });
    return { status: r.status, headers: r.headers, dato: opciones.method === 'HEAD' ? null : await r.json() };
  };
  return { db, meta, datos, pedir, consultar, sql, peticiones: () => peticiones };
}
const ventana = '/calendario/eventos?desde=2026-10-23&hasta=2026-10-29';

// Como Deno: conserva las entradas sin interpretar max-age.
function cacheSinCaducidad() {
  const valores = new Map(), borradas = [];
  return { valores, borradas, match: async k => valores.get(k.url)?.clone(),
    put: async (k, v) => valores.set(k.url, v.clone()),
    delete: async k => { borradas.push(k.url); return valores.delete(k.url); } };
}

function muestraGP(pendiente = false) {
  const datos = muestra();
  const gp = { id: 'gp', tipo: 'evento', clase: 'actividad_continua', nombres: { es: 'GP de prueba' },
    temas: ['deportes'], codigos: ['f1'], objetivos: ['evento:gp', 'evento:fp1', 'evento:carrera'],
    territorios: [], fuentes: [{ fuente: 'motogp', comprobado: '2026-10-26T12:00:00Z' }],
    participaciones: [], resultado: null, agenda: { rol: 'principal' },
    programacion: { valor: { cuando: { inicio: extremo(pendiente ? null : '2026-10-23'),
      fin: extremo(pendiente ? null : '2026-10-25'), fin_exclusivo: false } } } };
  const sesion = (id, instante) => ({ id, tipo: 'evento', clase: 'sesion', nombres: { es: id },
    temas: ['deportes'], codigos: [], objetivos: ['evento:gp', 'evento:' + id],
    programacion: { valor: { cuando: { inicio: extremo(instante.slice(0, 10), instante), fin: extremo(null) } } } });
  // Instantes sintéticos que caen en días distintos en UTC y España.
  gp.programa = [sesion('fp1', '2026-10-22T23:30:00Z'), sesion('carrera', '2026-10-25T23:30:00Z')];
  datos.eventos = [gp];
  datos.entidades = Object.fromEntries([gp, ...gp.programa].map(e => ['evento:' + e.id, e]));
  datos.fuentes = { motogp: { nombre: 'MotoGP' } };
  return datos;
}

test('GP con sesiones fuera de sus días locales: SQL, resumen y agrupación coinciden sin duplicarlo', async t => {
  const datos = muestraGP(), b = base(datos); t.after(() => b.db.close());
  for (const zona of ['UTC', 'Europe/Madrid', 'Atlantic/Canary']) {
    const ruta = '/calendario/resumen?desde=2026-10-22&hasta=2026-10-28&zona=' + zona;
    const r = await b.pedir(ruta);
    assert.equal(r.status, 200);
    const local = agruparPorDiaCalendario(datos.eventos, r.dato.dias.map(d => d.dia), zona);
    for (const d of r.dato.dias) {
      const esperado = d.dia >= (zona === 'UTC' ? '2026-10-22' : '2026-10-23')
        && d.dia <= (zona === 'Europe/Madrid' ? '2026-10-26' : '2026-10-25');
      assert.equal(d.cantidad, Number(esperado), `${zona} ${d.dia}`);
      assert.equal(local.get(d.dia).length, d.cantidad);
      const hasta = new Date(Date.parse(d.dia) + 86400000).toISOString().slice(0, 10);
      const lista = await b.pedir(`/calendario/eventos?desde=${d.dia}&hasta=${hasta}&zona=${zona}&texto=fp1&limite=1`);
      assert.deepEqual(lista.dato.eventos.map(e => e.id), esperado ? ['gp'] : []);
      assert.equal(lista.dato.siguiente, null);
      if (esperado) assert.equal(lista.dato.eventos[0].programacion.valor.cuando.inicio.fecha, '2026-10-23');
    }
  }
  const d = await b.pedir('/calendario/eventos/gp');
  assert.equal(d.dato.evento.programa.length, 2);
  assert.deepEqual((await b.pedir('/calendario/eventos?pendientes=1')).dato.eventos, []);
});

test('la tarjeta lleva la obra de sus funciones y se filtran por objetivo', async t => {
  const datos = muestra();
  datos.entidades['actividad:obra'] = { id: 'obra', tipo: 'actividad', clase: 'ficha',
    nombres: { gl: 'Os Bolechas' }, temas: [], codigos: [], objetivos: ['actividad:obra'] };
  for (const i of [5, 6]) datos.eventos[i].objetivos = [...datos.eventos[i].objetivos, 'actividad:obra'];
  const b = base(datos); t.after(() => b.db.close());
  const r = await b.pedir(ventana + '&objetivo=actividad:obra');
  assert.deepEqual(r.dato.eventos.map(e => [e.id, e.obra]), ['005', '006'].map(id =>
    [id, { id: 'actividad:obra', nombres: { gl: 'Os Bolechas' } }]));
  const otras = b.db.prepare("SELECT tarjeta_json FROM agenda_lectura_eventos WHERE id NOT IN ('005','006')").all();
  assert.ok(otras.every(f => !('obra' in JSON.parse(f.tarjeta_json))));
});

test('tramos iguales en todas las zonas se guardan una vez y la lectura no lleva «comprobado» por cita', async t => {
  const b = base(); t.after(() => b.db.close());
  const zonas = id => b.db.prepare('SELECT DISTINCT zona FROM agenda_lectura_tramos WHERE evento=? ORDER BY zona').all(id).map(f => f.zona);
  assert.deepEqual(zonas('004'), ['*']);
  assert.deepEqual(zonas('003'), ['*']);
  // 00:30Z cae el 25 en las tres zonas; 23:30Z del 25 es ya el 26 en Madrid.
  assert.deepEqual(zonas('001'), ['*']);
  assert.deepEqual(zonas('002'), ['Atlantic/Canary', 'Europe/Madrid', 'UTC']);
  for (const zona of ['Europe/Madrid', 'Atlantic/Canary', 'UTC']) {
    const ids = [];
    for (let cursor = ''; ;) {
      const r = await b.pedir(ventana + '&limite=50&zona=' + encodeURIComponent(zona) + (cursor ? '&cursor=' + cursor : ''));
      ids.push(...r.dato.eventos.map(e => e.id));
      if (!(cursor = r.dato.siguiente)) break;
    }
    assert.deepEqual(['001', '002', '004'].map(id => ids.includes(id)), [true, true, true], zona);
    assert.equal(new Set(ids).size, ids.length, zona);
    const p = await b.pedir('/calendario/eventos?pendientes=1&zona=' + encodeURIComponent(zona));
    assert.deepEqual(p.dato.eventos.map(e => e.id), ['003'], zona);
  }
  const lectura = b.db.prepare('SELECT tarjeta_json || detalle_json AS j FROM agenda_lectura_eventos').all();
  assert.ok(lectura.every(f => !f.j.includes('comprobado')));
});

test('GP con días oficiales pendientes conserva sesiones consultables sin rellenar huecos', async t => {
  const datos = muestraGP(true), b = base(datos); t.after(() => b.db.close());
  const r = await b.pedir('/calendario/resumen?desde=2026-10-22&hasta=2026-10-28&zona=UTC');
  assert.deepEqual(r.dato.dias.map(d => d.cantidad), [1, 0, 0, 1, 0, 0]);
  const lista = await b.pedir('/calendario/eventos?desde=2026-10-22&hasta=2026-10-28&zona=UTC&limite=1');
  // El cliente agrupa por el primer día visible de la ventana, no por el inicio.
  assert.deepEqual(lista.dato.eventos.map(e => [e.id, e.dia]), [['gp', '2026-10-22']]);
  assert.equal(lista.dato.siguiente, null);
  const tarde = await b.pedir('/calendario/eventos?desde=2026-10-23&hasta=2026-10-28&zona=UTC');
  assert.deepEqual(tarde.dato.eventos.map(e => [e.id, e.dia]), [['gp', '2026-10-25']]);
  assert.deepEqual((await b.pedir('/calendario/eventos?pendientes=1')).dato.eventos.map(e => [e.id, e.dia]), [['gp', '']]);
  const local = agruparPorDiaCalendario(datos.eventos, r.dato.dias.map(d => d.dia), 'UTC');
  assert.deepEqual([...local.values()].map(v => v.length), [1, 0, 0, 1, 0, 0]);
});

test('paginación completa, filtros antes de LIMIT y revisión en todas las páginas', async t => {
  const b = base(); t.after(() => b.db.close());
  let ruta = ventana, ids = [], etags = new Set();
  do {
    const r = await b.pedir(ruta); assert.equal(r.status, 200);
    etags.add(r.headers.get('etag'));
    assert.ok(r.dato.eventos.length <= 20);
    ids.push(...r.dato.eventos.map(e => e.id));
    ruta = r.dato.siguiente ? ventana + '&cursor=' + r.dato.siguiente : '';
  } while (ruta);
  assert.equal(ids.length, 89); assert.equal(new Set(ids).size, 89); assert.equal(etags.size, 5);
  const r = await b.pedir(ventana + '&texto=musica%20-coruna');
  assert.deepEqual(r.dato.eventos, []);
  const filtrado = await b.pedir(ventana + '&texto=musica');
  assert.equal(filtrado.dato.eventos.length, 20); assert.ok(filtrado.dato.siguiente);
  const a = await b.pedir(ventana + '&texto=%22musica%20na%22');
  assert.equal(a.dato.eventos.length, 20);
  assert.ok(b.sql.every(s => !/agenda_(observaciones|documentos|entidades)\b/.test(s)));
});

test('semántica del parser, ámbitos, circuitos y filtros coincide con selección local', async t => {
  const b = base(); t.after(() => b.db.close());
  for (const [q, texto] of [['cultura:calendario', '-prob'], ['deportes:agenda', 'musica'],
    ['circuito:wta', 'coru'], ['', '"teatro de"'], ['', '-teatro']]) {
    const orden = leerConsultaCalendario(q) || {};
    let esperado = seleccionCalendario(b.datos, orden, { texto }).eventos.filter(e => e.id !== '003');
    if (orden.tipos?.includes('resultados')) esperado = esperado.filter(e => e.resultado);
    const r = await b.pedir(ventana + '&limite=50&q=' + encodeURIComponent(q) + '&texto=' + encodeURIComponent(texto));
    assert.equal(r.status, 200, q);
    const observados = r.dato.eventos.map(e => e.id);
    // Una segunda página si el filtro contiene más de 50 eventos.
    if (r.dato.siguiente) {
      const s = await b.pedir(ventana + '&limite=50&q=' + encodeURIComponent(q) + '&texto=' + encodeURIComponent(texto) + '&cursor=' + r.dato.siguiente);
      observados.push(...s.dato.eventos.map(e => e.id));
    }
    assert.deepEqual(observados.sort(), esperado.map(e => e.id).sort(), [q, texto].join(' / '));
  }
  for (const filtro of ['temas=cultura', 'circuitos=wta', 'objetivo=evento%3A088', 'territorio=es%3Aprovincia%3A36', 'fuente=oculta']) {
    const r = await b.pedir(ventana + '&' + filtro); assert.equal(r.status, 200);
    if (filtro.endsWith('oculta')) assert.deepEqual(r.dato.eventos, []);
  }
});

test('resumen y agenda aplican los mismos días, exclusiones, medianoche y zonas', async t => {
  const b = base(); t.after(() => b.db.close());
  for (const zona of ['Europe/Madrid', 'Atlantic/Canary', 'UTC']) {
    const r = await b.pedir('/calendario/resumen?desde=2026-10-23&hasta=2026-10-29&zona=' + zona);
    assert.equal(r.status, 200);
    const dias = r.dato.dias.map(d => d.dia), local = agruparPorDiaCalendario(b.datos.eventos, dias, zona);
    for (const d of r.dato.dias) {
      assert.equal(d.cantidad, local.get(d.dia).length, `${zona} ${d.dia}`);
      assert.ok(d.muestras.length <= 2);
      const a = await b.pedir(`/calendario/eventos?desde=${d.dia}&hasta=${new Date(Date.parse(d.dia) + 86400000).toISOString().slice(0, 10)}&zona=${zona}&limite=50`);
      const c = a.dato.siguiente ? await b.pedir(`/calendario/eventos?desde=${d.dia}&hasta=${new Date(Date.parse(d.dia) + 86400000).toISOString().slice(0, 10)}&zona=${zona}&limite=50&cursor=${a.dato.siguiente}`) : null;
      assert.equal(a.dato.eventos.length + (c?.dato.eventos.length || 0), d.cantidad);
    }
  }
  const pendiente = await b.pedir('/calendario/eventos?pendientes=1');
  assert.deepEqual(pendiente.dato.eventos.map(e => e.id), ['003']);
});

test('cursor de otra selección y publicación nueva se rechazan; detalle acotado, HEAD y catálogo', async t => {
  const b = base(); t.after(() => b.db.close());
  const a = await b.pedir(ventana);
  assert.equal((await b.pedir(ventana + '&texto=teatro&cursor=' + a.dato.siguiente)).status, 409);
  b.meta.revision = 'revision-2';
  b.db.prepare('UPDATE agenda_lectura_control SET datos_json=?').run(JSON.stringify(b.meta));
  assert.equal((await b.pedir(ventana + '&cursor=' + a.dato.siguiente)).status, 409);
  assert.equal((await b.pedir('/calendario/eventos/000?revision=revision-1')).status, 409);
  const d = await b.pedir('/calendario/eventos/000');
  assert.equal(d.status, 200); assert.deepEqual(Object.keys(d.dato.entidades), ['evento:000']);
  assert.equal((await b.pedir('/calendario/eventos/ausente')).status, 404);
  const h = await b.pedir('/calendario/eventos/000', { method: 'HEAD' });
  assert.equal(h.status, 200); assert.equal(h.headers.get('etag'), d.headers.get('etag'));
  const catalogo = await b.pedir('/calendario/catalogo');
  assert.deepEqual(Object.keys(catalogo.dato.fuentes), ['galicia']);
  assert.equal(catalogo.dato.cobertura[0].completa, false);
  const objetivos = await b.pedir('/calendario/objetivos?texto=musica&tipo=evento');
  assert.equal(objetivos.dato.entidades.length, 20); assert.ok(objetivos.dato.siguiente);
  // Varios tipos se filtran en SQL, antes del límite.
  const varios = await b.pedir('/calendario/objetivos?texto=musica&tipo=participante,evento&limite=5');
  assert.equal(varios.dato.entidades.length, 5); assert.ok(varios.dato.siguiente);
  assert.deepEqual((await b.pedir('/calendario/objetivos?texto=musica&tipo=participante,lugar')).dato.entidades, []);
  assert.equal((await b.pedir('/calendario/objetivos?tipo=evento,otro')).status, 400);
});

test('validación antes de Turso; fallos de transporte y cambios entre snapshots no dan vacíos', async () => {
  let consultas = 0;
  const consultar = async () => { consultas++; throw new Error('secreto no publicable'); };
  for (const ruta of ['/calendario/eventos', ventana + '&limite=100', ventana + '&zona=incorrecta', ventana + '&desde=2026-10-23',
    ventana + '&q=desde:2026-10-01', ventana + '&q=clasificaciones:', ventana + '&cursor=***', ventana + '&sql=DROP',
    // Órdenes que Number() acepta pero Turso no: entero inseguro, exponente, signo.
    ...['99999999999999999999', '1e5', '-0'].map(o => ventana + '&cursor=' + Buffer.from(JSON.stringify(['r', 'h', '', o, 'x'])).toString('base64url')),
    '/calendario/eventos/%E0%A4%A']) {
    const r = await atenderCalendario(new Request('https://datos.test' + ruta), env, { consultar });
    assert.equal(r.status, 400, ruta);
  }
  assert.equal(consultas, 0);
  const r = await atenderCalendario(new Request('https://datos.test' + ventana), env, { consultar });
  assert.equal(r.status, 503); assert.ok(!(await r.text()).includes('secreto'));
  const b = base();
  try {
    const cambiante = async (e, ss) => {
      const resultado = await b.consultar(e, ss);
      if (ss.length === 1) {
        b.meta.revision = 'nueva'; b.db.prepare('UPDATE agenda_lectura_control SET datos_json=?').run(JSON.stringify(b.meta));
      }
      return resultado;
    };
    assert.equal((await atenderCalendario(new Request('https://datos.test' + ventana), env, { consultar: cambiante })).status, 409);
    assert.equal((await b.pedir('/calendario/eventos?desde=2025-01-01&hasta=2025-01-02')).status, 422);
  } finally { b.db.close(); }
});

test('HTTP Turso usa batch condicional en un snapshot, liga parámetros y cierra', async () => {
  let cuerpo;
  const simular = async (url, opciones) => {
    assert.equal(url, 'https://prueba.turso.io/v2/pipeline');
    assert.equal(opciones.headers.Authorization, 'Bearer solo-prueba');
    // Cloudflare rechaza redirect 'error' antes de enviar la petición.
    assert.equal(opciones.redirect, 'manual');
    cuerpo = JSON.parse(opciones.body);
    return Response.json({ results: [{ type: 'ok', response: { type: 'batch', result: {
      step_results: [{ cols: [], rows: [] }, { cols: [{ name: 'id' }], rows: [[{ type: 'integer', value: '12' }]] }, { cols: [], rows: [] }],
      step_errors: [null, null, null] } } }, { type: 'ok', response: { type: 'close' } }] });
  };
  assert.deepEqual(await consultarTurso(env, [{ sql: 'SELECT ? AS id', args: [12] }], simular), [[{ id: 12 }]]);
  await consultarTurso(env, [{ sql: 'SELECT ?, ?, ?', args: [2461077.2916666665, 0, 'texto'] }], simular);
  assert.deepEqual(cuerpo.requests[0].batch.steps[1].stmt.args, [
    { type: 'float', value: 2461077.2916666665 }, { type: 'integer', value: '0' }, { type: 'text', value: 'texto' }]);
  assert.equal(cuerpo.requests[0].batch.steps[0].stmt.sql, 'BEGIN');
  assert.equal(cuerpo.requests[0].batch.steps.at(-1).stmt.sql, 'COMMIT');
  assert.equal(cuerpo.requests[1].type, 'close');
  assert.deepEqual(cuerpo.requests[0].batch.steps[1].condition, { type: 'ok', step: 0 });
  await assert.rejects(consultarTurso(env, [], async () => Response.json({ results: [] })));
  await assert.rejects(consultarTurso(env, [], async () => new Response(null, { status: 307, headers: { Location: 'https://otro.test/' } })));
  await assert.rejects(consultarTurso({ ...env, CALENDARIO_TURSO_URL: 'https://host/path' }, [], simular));
});

test('caché por revisión y selección; los aciertos no gastan cupo y la 31.ª sin caché da 429', async t => {
  const b = base(); t.after(() => b.db.close());
  const cache = cacheSinCaducidad(), { valores } = cache;
  const opciones = { consultar: b.consultar, abrirCache: async () => cache };
  const pedir = (headers = {}) => atenderCalendario(new Request('https://datos.test' + ventana, { headers }), env, opciones);
  const primera = await pedir(); assert.equal(primera.status, 200);
  const n = b.peticiones();
  const repetida = await pedir(); assert.equal(repetida.status, 200); assert.equal(b.peticiones(), n);
  assert.equal((await pedir({ 'If-None-Match': repetida.headers.get('etag') })).status, 304);
  assert.equal(b.peticiones(), n);
  // Simular expiración del puntero pequeño y publicar otra revisión.
  for (const clave of valores.keys()) if (clave.includes('/control/')) valores.delete(clave);
  b.meta.revision = 'nueva'; b.db.prepare('UPDATE agenda_lectura_control SET datos_json=?').run(JSON.stringify(b.meta));
  assert.equal((await (await pedir()).json()).revision, 'nueva');
  const antes = b.peticiones();
  for (let i = 0; i < 40; i++) assert.equal((await atenderCalendario(new Request('https://datos.test' + ventana), env,
    { ...opciones, ip: '192.0.2.55' })).status, 200);
  assert.equal(b.peticiones(), antes);
  // Control y consulta cuentan juntos una vez, incluso sin caché.
  const sinCache = { consultar: b.consultar, ip: '192.0.2.55' };
  for (let i = 0; i < 30; i++) assert.equal((await atenderCalendario(new Request('https://datos.test' + ventana), env, sinCache)).status, 200);
  assert.equal(b.peticiones(), antes + 60);
  const bloqueada = await atenderCalendario(new Request('https://datos.test' + ventana), env, sinCache);
  assert.equal(bloqueada.status, 429); assert.ok(bloqueada.headers.get('retry-after'));
  assert.equal(b.peticiones(), antes + 60);
});

test('el control caduca a los 15 s aunque la caché lo conserve; a los 16 s ve la revisión nueva', async t => {
  const b = base(); t.after(() => b.db.close());
  let ahora = Date.now(); t.mock.method(Date, 'now', () => ahora);
  const cache = cacheSinCaducidad(), opciones = { consultar: b.consultar, abrirCache: async () => cache };
  const pedir = () => atenderCalendario(new Request('https://datos.test' + ventana), env, opciones);
  assert.equal((await (await pedir()).json()).revision, 'revision-1');
  assert.equal(b.peticiones(), 2);
  b.meta.revision = 'nueva'; b.db.prepare('UPDATE agenda_lectura_control SET datos_json=?').run(JSON.stringify(b.meta));
  ahora += 14999;
  assert.equal((await (await pedir()).json()).revision, 'revision-1');
  assert.equal(b.peticiones(), 2);
  ahora += 1001;
  assert.equal((await (await pedir()).json()).revision, 'nueva');
  assert.equal(b.peticiones(), 4);
  assert.equal(cache.borradas.length, 1); assert.ok(cache.borradas[0].includes('/control/'));
});

test('la respuesta caduca a la hora; la cabecera interna no sale en GET, HEAD ni 304', async t => {
  const b = base(); t.after(() => b.db.close());
  let ahora = Date.now(); t.mock.method(Date, 'now', () => ahora);
  const inicio = ahora, cache = cacheSinCaducidad();
  const opciones = { consultar: b.consultar, abrirCache: async () => cache };
  const pedir = (ruta = ventana, peticion = {}) => atenderCalendario(new Request('https://datos.test' + ruta, peticion), env, opciones);
  const primera = await pedir(), etag = primera.headers.get('etag');
  assert.equal(primera.headers.get('X-Calendario-Caduca'), null);
  assert.equal(primera.headers.get('Cache-Control'), 'public, max-age=30');
  const clave = [...cache.valores.keys()].find(k => k.includes('/respuesta/'));
  assert.equal(Number(cache.valores.get(clave).headers.get('X-Calendario-Caduca')), inicio + 3600000);
  assert.equal(cache.valores.get(clave).headers.get('Cache-Control'), 'public, max-age=3600');
  // Renovar solo el control para aislar el vencimiento de la respuesta.
  ahora = inicio + 3599000;
  assert.equal((await pedir('/calendario/catalogo')).status, 200);
  assert.equal(b.peticiones(), 3);
  for (const [peticion, estado] of [[{}, 200], [{ method: 'HEAD' }, 200], [{ headers: { 'If-None-Match': etag } }, 304]]) {
    const r = await pedir(ventana, peticion);
    assert.equal(r.status, estado); assert.equal(r.headers.get('X-Calendario-Caduca'), null);
    assert.equal(r.headers.get('Cache-Control'), 'public, max-age=30');
  }
  assert.equal(b.peticiones(), 3);
  ahora = inicio + 3600000;
  const renovada = await pedir();
  assert.equal(renovada.status, 200); assert.equal(renovada.headers.get('etag'), etag);
  assert.equal(renovada.headers.get('X-Calendario-Caduca'), null);
  assert.equal(b.peticiones(), 4); assert.ok(cache.borradas.includes(clave));
});

test('las consultas con control en caché gastan cupo; un acierto sigue pasando con el cupo agotado', async t => {
  const b = base(); t.after(() => b.db.close());
  const cache = cacheSinCaducidad(), opciones = { consultar: b.consultar, abrirCache: async () => cache, ip: '192.0.2.56' };
  await atenderCalendario(new Request('https://datos.test/calendario/catalogo'), env, { ...opciones, ip: '' });
  for (let i = 1; i <= 30; i++) assert.equal((await atenderCalendario(new Request('https://datos.test' + ventana + '&limite=' + i), env, opciones)).status, 200);
  assert.equal(b.peticiones(), 31);
  const bloqueada = await atenderCalendario(new Request('https://datos.test' + ventana + '&limite=31'), env, opciones);
  assert.equal(bloqueada.status, 429); assert.ok(bloqueada.headers.get('Retry-After'));
  const acierto = await atenderCalendario(new Request('https://datos.test' + ventana + '&limite=1'), env, opciones);
  assert.equal(acierto.status, 200); assert.equal(b.peticiones(), 31);
});

test('una entrada sin vencimiento se relee aunque falle o no termine su borrado', { timeout: 2000 }, async t => {
  const b = base(); t.after(() => b.db.close());
  const cache = cacheSinCaducidad(), opciones = { consultar: b.consultar, abrirCache: async () => cache };
  const pedir = () => atenderCalendario(new Request('https://datos.test' + ventana), env, opciones);
  assert.equal((await pedir()).status, 200);
  for (const respuesta of cache.valores.values()) respuesta.headers.delete('X-Calendario-Caduca');
  cache.delete = async () => { throw new Error('Borrado no disponible'); };
  assert.equal((await pedir()).status, 200); assert.equal(b.peticiones(), 4);
  for (const respuesta of cache.valores.values()) respuesta.headers.set('X-Calendario-Caduca', 'inválido');
  cache.delete = () => new Promise(() => {});
  assert.equal((await pedir()).status, 200); assert.equal(b.peticiones(), 6);
});

test('los planes de consulta usan índices por fecha y faceta, sin leer detalles para contar', t => {
  const b = base(); t.after(() => b.db.close());
  const c = normalizarConsulta(new URL('https://datos.test' + ventana + '&territorio=es:provincia:36'));
  for (const s of [consultaEventos(c, b.meta), consultaResumen(c, b.meta)]) {
    const plan = b.db.prepare('EXPLAIN QUERY PLAN ' + s.sql).all(...s.args).map(f => f.detail).join('\n');
    assert.match(plan, /SEARCH d USING COVERING INDEX/);
    assert.match(plan, /SEARCH agenda_lectura_facetas USING COVERING INDEX/);
    assert.doesNotMatch(plan, /SCAN agenda_lectura_eventos/);
  }
});

test('dentro del día se pagina por instante de inicio: con hora primero; sin hora y programas al final', async t => {
  const datos = muestra();
  // IDs en orden inverso a la hora; el desfase horario no altera el orden absoluto.
  const horas = { '010': '2026-10-25T20:00:00Z', '011': '2026-10-25T19:30:00+01:00', '012': '2026-10-25T09:00:00+01:00' };
  for (const e of datos.eventos) if (horas[e.id]) e.programacion.valor.cuando = { inicio: extremo('2026-10-25', horas[e.id]), fin: extremo(null) };
  const b = base(datos); t.after(() => b.db.close());
  const ids = [];
  for (let cursor = ''; ;) {
    const r = await b.pedir('/calendario/eventos?desde=2026-10-25&hasta=2026-10-26&zona=UTC&limite=7' + (cursor ? '&cursor=' + cursor : ''));
    ids.push(...r.dato.eventos.map(e => e.id));
    if (!(cursor = r.dato.siguiente)) break;
  }
  assert.equal(new Set(ids).size, ids.length);
  const pos = id => ids.indexOf(id);
  assert.ok(pos('012') < pos('011') && pos('011') < pos('010') && pos('010') < pos('005'), ids.join());
  assert.ok(pos('001') < pos('012') && pos('002') > pos('010') && pos('002') < pos('005'));
});

test('las etiquetas van en la tarjeta y se filtran por su clave', async t => {
  const datos = muestra(), etiqueta = { id: 'cultura-galicia:ciclo:50', nombres: { gl: 'Festival' } };
  for (const i of [7, 8]) datos.eventos[i].etiquetas = [etiqueta];
  const b = base(datos); t.after(() => b.db.close());
  const r = await b.pedir(ventana + '&etiqueta=' + encodeURIComponent(etiqueta.id));
  assert.deepEqual(r.dato.eventos.map(e => [e.id, e.etiquetas]), [['007', [etiqueta]], ['008', [etiqueta]]]);
  const otras = b.db.prepare("SELECT tarjeta_json FROM agenda_lectura_eventos WHERE id NOT IN ('007','008')").all();
  assert.ok(otras.every(f => !('etiquetas' in JSON.parse(f.tarjeta_json))));
});

test('formato y precio son facetas; sin clasificar, ninguna fila', () => {
  const datos = muestra();
  Object.assign(datos.eventos[0], { formatos: ['concierto'], precio: 'gratis', publico: ['infancia'] });
  const facetas = prepararLectura(datos).facetas;
  const de = id => facetas.filter(([e, tipo]) => e === id && ['formato', 'precio', 'publico'].includes(tipo));
  assert.deepEqual(de(datos.eventos[0].id), [[datos.eventos[0].id, 'formato', 'concierto'], [datos.eventos[0].id, 'precio', 'gratis']]);
  assert.deepEqual(de(datos.eventos[1].id), []);
});

test('formatos y precio filtran por faceta; gratis no incluye mixto', async t => {
  const datos = muestra();
  Object.assign(datos.eventos[4], { formatos: ['concierto'], precio: 'gratis' });
  Object.assign(datos.eventos[5], { formatos: ['concierto', 'festival'], precio: 'mixto' });
  Object.assign(datos.eventos[6], { formatos: ['representacion'], precio: 'pago' });
  const b = base(datos); t.after(() => b.db.close());
  const ids = async q => (await b.pedir(ventana + q)).dato.eventos.map(e => e.id);
  assert.deepEqual(await ids('&formatos=concierto'), ['004', '005']);
  assert.deepEqual(await ids('&formatos=festival,representacion'), ['005', '006']);
  assert.deepEqual(await ids('&precio=gratis'), ['004']);
  assert.deepEqual(await ids('&formatos=concierto&precio=mixto'), ['005']);
  assert.equal((await b.pedir(ventana + '&precio=barato')).status, 400);
});

test('presentación: programa, prolongada (intervalo, continua o varios días) o cita', () => {
  const cita = (inicio, fin, extra = {}) => ({ clase: 'funcion', programacion: { valor: { cuando: { inicio, fin, ...extra } } } });
  const z = 'Europe/Madrid';
  assert.equal(presentacionCalendario({ ...cita(extremo('2026-10-25'), extremo(null)), programa: [{}] }, z), 'programa');
  assert.equal(presentacionCalendario(cita(extremo('2026-10-25'), extremo(null)), z), 'cita');
  assert.equal(presentacionCalendario({ ...cita(extremo('2026-10-25'), extremo(null)), clase: 'actividad_continua' }, z), 'prolongada');
  const intervalo = cita(extremo('2026-10-25'), extremo(null));
  intervalo.programacion.valor.modalidad = 'intervalo';
  assert.equal(presentacionCalendario(intervalo, z), 'prolongada');
  assert.equal(presentacionCalendario(cita(extremo('2026-10-25'), extremo('2026-10-27')), z), 'prolongada');
  // Fin exclusivo a medianoche: el límite del día, no un día más.
  assert.equal(presentacionCalendario(cita(extremo('2026-10-25'), extremo('2026-10-26'), { fin_exclusivo: true }), z), 'cita');
  assert.equal(presentacionCalendario(cita(extremo(null), extremo(null)), z), 'cita');
});

test('la tarjeta lleva formatos, precio, programa, competiciones y presentación; por zona si difiere', () => {
  const datos = muestra();
  Object.assign(datos.eventos[4], { formatos: ['concierto'], precio: 'gratis' });
  // 23:30-00:30 UTC: dos días en UTC y Canarias, uno en la península (UTC+1 tras el cambio de hora).
  datos.eventos[5].programacion.valor.cuando = { inicio: extremo('2026-10-25', '2026-10-25T23:30:00Z'), fin: extremo('2026-10-26', '2026-10-26T00:30:00Z') };
  const tarjetas = Object.fromEntries(prepararLectura(datos).eventos.map(e => [e[0], JSON.parse(e[3])]));
  assert.deepEqual([tarjetas['004'].formatos, tarjetas['004'].precio], [['concierto'], 'gratis']);
  assert.ok(!('formatos' in tarjetas['010']) && !('precio' in tarjetas['010']) && !('tiene_programa' in tarjetas['010']));
  assert.deepEqual(tarjetas['070'].competiciones, ['wta']);
  assert.ok(!('competiciones' in tarjetas['010']));
  assert.equal(tarjetas['000'].presentacion, 'prolongada');
  assert.equal(tarjetas['010'].presentacion, 'cita');
  assert.deepEqual(tarjetas['005'].presentacion, { 'Europe/Madrid': 'cita', 'Atlantic/Canary': 'prolongada', UTC: 'prolongada' });
  const gp = JSON.parse(prepararLectura(muestraGP()).eventos[0][3]);
  assert.equal(gp.tiene_programa, true); assert.equal(gp.presentacion, 'programa'); assert.deepEqual(gp.competiciones, ['f1']);
});

test('categoría: la raíz del catálogo de sus temas; con varias, la primera del catálogo; sin ninguna, sin clave', () => {
  const datos = muestra();
  // 080: tenis y teatro (cultura va antes que deportes en el catálogo); 081: sin temas; 082: tema desconocido.
  datos.entidades['evento:080'].temas = ['teatro', 'tenis'];
  datos.entidades['evento:081'].temas = [];
  datos.entidades['evento:082'].temas = ['inventado'];
  const tarjetas = Object.fromEntries(prepararLectura(datos).eventos.map(e => [e[0], JSON.parse(e[3])]));
  assert.deepEqual([tarjetas['010'].categoria, tarjetas['070'].categoria, tarjetas['080'].categoria], ['cultura', 'deportes', 'cultura']);
  assert.ok(!('categoria' in tarjetas['081']) && !('categoria' in tarjetas['082']));
});

test('resumen: cuentas por categoría que suman las del día, también lo en curso', async t => {
  const datos = muestra();
  datos.entidades['evento:081'].temas = [];
  datos.eventos[70].programacion.valor.cuando = { inicio: extremo('2026-10-20'), fin: extremo('2026-11-05') };
  datos.entidades['evento:071'].codigos = ['wta', 'atp'];
  const b = base(datos); t.after(() => b.db.close());
  const r = await b.pedir('/calendario/resumen?desde=2026-10-23&hasta=2026-10-27&zona=UTC&muestras=0');
  for (const d of r.dato.dias) {
    for (const k of ['citas', 'programas', 'en_curso'])
      assert.equal(Object.values(d.categorias).reduce((n, c) => n + c[k], 0), d[k], `${d.dia} ${k}`);
  }
  const d25 = r.dato.dias.find(d => d.dia === '2026-10-25');
  assert.deepEqual(d25.categorias.sin_clasificar, { citas: 1, programas: 0, en_curso: 0 });
  assert.equal(d25.categorias.deportes.en_curso, 1);
  // Por competición: lo de deportes es WTA, y también el 081, que sin temas no
  // tiene categoría; el 071 lleva además ATP y suma a las dos, una vez al día.
  const dep = d25.categorias.deportes;
  assert.deepEqual(d25.competiciones.wta, { ...dep, citas: dep.citas + 1 });
  assert.deepEqual(d25.competiciones.atp, { citas: 1, programas: 0, en_curso: 0 });
  assert.ok(!('competiciones' in r.dato.dias[0]) || !r.dato.dias[0].competiciones.atp);
  // El 23 solo hay lo prolongado: la exposición 000 (cultura) y el 070 (deportes).
  assert.deepEqual(r.dato.dias[0].categorias, { cultura: { citas: 0, programas: 0, en_curso: 1 }, deportes: { citas: 0, programas: 0, en_curso: 1 } });
});

test('local: lo que se celebra en el territorio más las competiciones, que no tienen territorio', async t => {
  const b = base(); t.after(() => b.db.close());
  // Pocas peticiones: el límite por IP es común a todo el fichero.
  const total = async q => {
    const [d] = (await b.pedir('/calendario/resumen?desde=2026-10-25&hasta=2026-10-26&zona=UTC&muestras=0' + q)).dato.dias;
    return d.citas + d.programas + d.en_curso;
  };
  // Todo está en Pontevedra (36); los 25 de la WTA, además, son competición.
  assert.equal(await total('&territorio=es:provincia:28'), 0);
  assert.equal(await total('&local=es:provincia:28'), 25);
  assert.equal(await total('&local=es:provincia:36'), await total(''));
  // Con competiciones elegidas (capas), solo esas además de lo del territorio.
  assert.equal(await total('&local=es:provincia:28&q=wta:'), 25);
  assert.equal(await total('&local=es:provincia:28&q=atp:'), 0);
});

test('chips: una cita es su chip; de un GP solo la carrera, en su día de cada zona; de un programa, sus funciones', () => {
  const gp = muestraGP();
  gp.eventos[0].programa[1].agenda = { rol: 'sesion', tipo_sesion: 'Race' };
  gp.eventos[0].programa[0].agenda = { rol: 'sesion', tipo_sesion: 'FP1' };
  const chips = prepararLectura(gp).chips;
  // Carrera a las 23:30 UTC del 25: el 25 en UTC y Canarias (WET, UTC+0), el 26 en la península.
  assert.deepEqual(chips.map(c => c.slice(0, 6)), [
    ['Europe/Madrid', '2026-10-26', 'gp', 'carrera', 30, '00:30'],
    ['Atlantic/Canary', '2026-10-25', 'gp', 'carrera', 1410, '23:30'],
    ['UTC', '2026-10-25', 'gp', 'carrera', 1410, '23:30']]);
  assert.deepEqual(JSON.parse(chips[0][6]), { es: 'carrera' });
  // Un programa sin competición (un festival) da todas sus funciones.
  delete gp.entidades['evento:gp'].codigos; gp.eventos[0].codigos = [];
  assert.equal(new Set(prepararLectura(gp).chips.map(c => c[3])).size, 2);
  // Citas: un chip por cita con fecha, en todas las zonas si coincide; ni prolongadas ni pendientes.
  const p = prepararLectura(muestra()), porEvento = id => p.chips.filter(c => c[2] === id);
  assert.deepEqual(porEvento('010'), [['*', '2026-10-25', '010', '010', 1440, null, null]]);
  assert.deepEqual([porEvento('000'), porEvento('003')], [[], []]);
  assert.equal(porEvento('001').length, 3);
  // Una cita cuyo único día está excluido no tiene chip (ni tramo).
  const excluida = muestra();
  excluida.eventos[10].programacion.valor.cuando = { inicio: extremo('2026-10-25'), fin: extremo(null), dias_excluidos: ['2026-10-25'] };
  const q = prepararLectura(excluida);
  assert.deepEqual([q.chips.filter(c => c[2] === '010'), q.tramos.filter(t => t[3] === '010')], [[], []]);
});

test('resumen con chips: la carrera es muestra de su día con el nombre del GP; lectura sin chips, como antes', async t => {
  const datos = muestraGP();
  datos.eventos[0].programa[1].agenda = { rol: 'sesion', tipo_sesion: 'Race' };
  const b = base(datos); t.after(() => b.db.close());
  const r = await b.pedir('/calendario/resumen?desde=2026-10-25&hasta=2026-10-27&zona=Europe/Madrid&muestras=3');
  const [d25, d26] = r.dato.dias;
  assert.deepEqual([d25.chips, d25.muestras], [0, []]);
  assert.equal(d26.chips, 1);
  assert.deepEqual([d26.muestras[0].id, d26.muestras[0].ocurrencia, d26.muestras[0].nombres, d26.muestras[0].padre, d26.muestras[0].hora_muestra, d26.muestras[0].presentacion],
    ['gp', 'carrera', { es: 'carrera' }, { es: 'GP de prueba' }, '00:30', 'cita']);
  // Sin muestras no hay chips que contar.
  assert.ok(!('chips' in (await b.pedir('/calendario/resumen?desde=2026-10-25&hasta=2026-10-27&zona=UTC&muestras=0')).dato.dias[0]));
  // Lectura publicada antes de los chips: muestras por inicio de tramo.
  const viejo = base(); t.after(() => viejo.db.close());
  const meta = JSON.parse(viejo.db.prepare('SELECT datos_json FROM agenda_lectura_control').get().datos_json);
  delete meta.lectura_chips;
  viejo.db.prepare('UPDATE agenda_lectura_control SET datos_json=?').run(JSON.stringify(meta));
  viejo.db.exec('DELETE FROM agenda_lectura_chips');
  const v = await viejo.pedir('/calendario/resumen?desde=2026-10-25&hasta=2026-10-26&zona=UTC&muestras=2');
  assert.deepEqual([v.dato.dias[0].muestras.map(m => m.id), 'chips' in v.dato.dias[0]], [['001', '002'], false]);
  // Sin chips, «Ver las N» lista citas y programas como antes: ni la exposición prolongada (000).
  const l = await viejo.pedir('/calendario/eventos?desde=2026-10-25&hasta=2026-10-26&zona=UTC&chips=1&limite=50');
  assert.ok(l.dato.eventos.length && !l.dato.eventos.some(e => e.id === '000'));
});

test('eventos?chips=1: las ocurrencias del día en el orden de las muestras, paginadas con la ocurrencia', async t => {
  const b = base(); t.after(() => b.db.close());
  const ventana = 'desde=2026-10-25&hasta=2026-10-26&zona=Europe/Madrid';
  const [d] = (await b.pedir('/calendario/resumen?' + ventana + '&muestras=3')).dato.dias;
  const uno = await b.pedir('/calendario/eventos?' + ventana + '&chips=1&limite=50');
  const dos = await b.pedir('/calendario/eventos?' + ventana + '&chips=1&limite=50&cursor=' + uno.dato.siguiente);
  const todos = [...uno.dato.eventos, ...dos.dato.eventos];
  assert.equal(dos.dato.siguiente, null);
  // Lo mismo que cuenta el día y, al principio, sus muestras tal cual.
  assert.equal(todos.length, d.chips);
  assert.deepEqual(todos.slice(0, 3), d.muestras.map(m => ({ ...m, dia: '2026-10-25' })));
  assert.deepEqual([todos[0].id, todos[0].hora_muestra, todos[0].presentacion], ['001', '02:30', 'cita']);
  // Sin repetidos entre páginas; la prolongada (000) y la pendiente (003) no son chips.
  assert.equal(new Set(todos.map(e => e.id)).size, todos.length);
  assert.ok(!todos.some(e => ['000', '003'].includes(e.id)));
});

test('disponibilidad: eventos por tema, raíz y sin subcategoría en el sitio, y por competición', async t => {
  const datos = muestra();
  // 010–012: solo «cultura» (sin subcategoría); 013 en otra provincia.
  for (const id of ['010', '011', '012']) datos.entidades['evento:' + id].temas = ['cultura'];
  datos.eventos[13].territorios = [{ territorio: 'es:municipio:28079', papel: 'celebracion', ancestros: ['es:provincia:28'] }];
  const b = base(datos); t.after(() => b.db.close());
  const d = (await b.pedir('/calendario/catalogo?disponibilidad=1&territorio=es:provincia:36')).dato.disponibilidad;
  // 65 de cultura en Pontevedra menos el 013; tres sin subcategoría.
  assert.deepEqual([d.territorio, d.temas.teatro, d.temas.cultura, d.raices.cultura, d.sin_subcategoria.cultura, d.raices.deportes],
    ['es:provincia:36', 61, 3, 64, 3, 25]);
  assert.deepEqual(d.circuitos, { wta: 25 });
  // Sin sitio, toda la agenda; sin disponibilidad=1, el catálogo de siempre.
  assert.equal((await b.pedir('/calendario/catalogo?disponibilidad=1')).dato.disponibilidad.raices.cultura, 65);
  assert.ok(!('disponibilidad' in (await b.pedir('/calendario/catalogo')).dato));
  // «otra:cultura» filtra lo de cultura sin subcategoría, en OR con los demás temas.
  const n = async q => {
    const [x] = (await b.pedir('/calendario/resumen?desde=2026-10-25&hasta=2026-10-26&zona=UTC&muestras=0&' + q)).dato.dias;
    return x.citas + x.programas + x.en_curso;
  };
  const [otra, tenis, ambos] = [await n('temas=otra:cultura'), await n('temas=tenis'), await n('temas=otra:cultura,tenis')];
  assert.deepEqual([otra, ambos], [3, 3 + tenis]);
});

test('barras: competiciones de varios días que solapan la ventana; ni exposiciones ni partidos', async t => {
  const gp = base(muestraGP()); t.after(() => gp.db.close());
  const r = await gp.pedir('/calendario/resumen?desde=2026-10-24&hasta=2026-10-31&zona=UTC&muestras=0&barras=1');
  assert.deepEqual(r.dato.barras.map(b => [b.id, b.desde, b.hasta, b.competiciones]), [['gp', '2026-10-22', '2026-10-26', ['f1']]]);
  assert.ok(!('barras' in (await gp.pedir('/calendario/resumen?desde=2026-10-24&hasta=2026-10-31&zona=UTC&muestras=0')).dato));
  // En la muestra: la 000 es una exposición (cultura) y la 070, un torneo de la WTA de varios días.
  const datos = muestra();
  datos.eventos[70].programacion.valor.cuando = { inicio: extremo('2026-10-20'), fin: extremo('2026-11-05') };
  const b = base(datos); t.after(() => b.db.close());
  const x = await b.pedir('/calendario/resumen?desde=2026-10-25&hasta=2026-10-26&zona=UTC&muestras=0&barras=1');
  assert.deepEqual(x.dato.barras.map(v => [v.id, v.desde, v.hasta]), [['070', '2026-10-20', '2026-11-06']]);
});

test('los tramos largos se parten por meses y el rango acotado encuentra todos sus días', async t => {
  const datos = muestra();
  // Exposición de cuatro meses: un tramo de más de TRAMO_MAX_DIAS.
  datos.eventos[0].programacion.valor.cuando = { inicio: extremo('2026-09-10'), fin: extremo('2027-01-15') };
  const p = prepararLectura(datos);
  const suyos = p.tramos.filter(t => t[3] === '000');
  assert.deepEqual(suyos.map(t => [t[1], t[2]]), [['2026-09-10', '2026-10-01'], ['2026-10-01', '2026-11-01'],
    ['2026-11-01', '2026-12-01'], ['2026-12-01', '2027-01-01'], ['2027-01-01', '2027-01-16']]);
  assert.ok(p.tramos.every(([, d, h]) => !d || sumarDiasCalendario(d, TRAMO_MAX_DIAS) >= h));
  const b = base(datos); t.after(() => b.db.close());
  const r = await b.pedir('/calendario/resumen?desde=2026-10-20&hasta=2026-11-30');
  assert.ok(r.dato.dias.every(d => d.en_curso >= 1), 'la exposición cuenta todos los días');
  const ids = (await b.pedir('/calendario/eventos?desde=2026-11-20&hasta=2026-11-27')).dato.eventos.map(e => e.id);
  assert.deepEqual(ids, ['000']);
});

test('resumen: citas, programas y en curso por separado; muestras sin prolongadas y por hora', async t => {
  const datos = muestra();
  const horas = { '012': '2026-10-25T18:00:00Z', '011': '2026-10-25T09:00:00Z' };
  for (const e of datos.eventos) if (horas[e.id]) e.programacion.valor.cuando = { inicio: extremo('2026-10-25', horas[e.id]), fin: extremo(null) };
  datos.eventos[6].programacion.valor.cuando = { inicio: extremo('2026-10-20'), fin: extremo('2026-11-05') };
  const b = base(datos); t.after(() => b.db.close());
  const r = await b.pedir('/calendario/resumen?desde=2026-10-25&hasta=2026-10-26&zona=UTC');
  const [d] = r.dato.dias;
  assert.equal(d.cantidad, d.citas + d.programas + d.en_curso);
  assert.equal(d.en_curso, 2);   // el 000 (23-28) y el 006
  // Con hora primero (001 a las 00:30, 011 a las 09:00); las prolongadas, nunca.
  assert.deepEqual(d.muestras.map(m => m.id), ['001', '011']);
  const tres = await b.pedir('/calendario/resumen?desde=2026-10-25&hasta=2026-10-26&zona=UTC&muestras=3');
  assert.deepEqual(tres.dato.dias[0].muestras.map(m => m.id), ['001', '011', '012']);
  const ninguna = await b.pedir('/calendario/resumen?desde=2026-10-25&hasta=2026-10-26&zona=UTC&muestras=0');
  assert.deepEqual([ninguna.dato.dias[0].muestras, ninguna.dato.dias[0].cantidad], [[], d.cantidad]);
  assert.equal((await b.pedir('/calendario/resumen?desde=2026-10-25&hasta=2026-10-26&muestras=6')).status, 400);
  // El filtro de presentación separa la lista de «En curso».
  const ids = async q => {
    const todos = [];
    for (let cursor = ''; ;) {
      const r = await b.pedir('/calendario/eventos?desde=2026-10-25&hasta=2026-10-26&zona=UTC&limite=50' + q + (cursor ? '&cursor=' + cursor : ''));
      todos.push(...r.dato.eventos.map(e => e.id));
      if (!(cursor = r.dato.siguiente)) return todos;
    }
  };
  assert.deepEqual(await ids('&presentacion=prolongada'), ['000', '006']);
  assert.equal((await ids('&presentacion=cita,programa')).length, d.citas + d.programas);
  assert.equal((await b.pedir(ventana + '&presentacion=larga')).status, 400);
});

test('el resumen y la lista recorren solo la franja acotada del índice, sin cruzar días', t => {
  const b = base(); t.after(() => b.db.close());
  const c = normalizarConsulta(new URL('https://datos.test/calendario/resumen?desde=2026-10-01&hasta=2026-11-12'));
  for (const s of [consultaEventos(c, b.meta), consultaResumen(c, b.meta)]) {
    const plan = b.db.prepare('EXPLAIN QUERY PLAN ' + s.sql).all(...s.args).map(f => f.detail).join('\n');
    assert.match(plan, /SEARCH d USING COVERING INDEX \S+ \(zona=\? AND hasta>\? AND hasta<\?\)/);
    assert.doesNotMatch(plan, /SCAN v\b/);
    assert.ok(s.args.includes('2026-12-13'), 'fin de la ventana más 31 días');
  }
  // Una lectura publicada antes de partir los tramos no anota el tope: sin acotar.
  const { tramo_max_dias, ...anterior } = b.meta;
  assert.equal(tramo_max_dias, TRAMO_MAX_DIAS);
  for (const s of [consultaEventos(c, anterior), consultaResumen(c, anterior)]) assert.ok(s.args.includes('9999-12-31'));
});
