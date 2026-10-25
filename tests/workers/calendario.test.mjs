import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { prepararLectura } from '../../shared/calendario/proyeccion.js';
import { atenderCalendario, normalizarConsulta, consultaEventos, consultaResumen } from '../../workers/comun/calendario.js';
import { consultarTurso } from '../../workers/comun/calendario-turso.js';
import { seleccionCalendario, leerConsultaCalendario } from '../../shared/calendario/consulta.js';
import { agruparPorDiaCalendario } from '../../shared/calendario/fechas.js';

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
  const meta = Object.fromEntries(Object.entries(p).filter(([k]) => !['eventos', 'facetas', 'tramos', 'entidades'].includes(k)));
  meta.revision = 'revision-1';
  db.prepare('INSERT INTO agenda_lectura_control VALUES (1,1,?,0,?)').run(meta.revision, JSON.stringify(meta));
  for (const [tabla, n] of [['eventos', 5], ['facetas', 3], ['tramos', 4], ['entidades', 4]]) {
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
  for (const [q, texto] of [['cultura:calendario', '-prob'], ['deportes:resultados', 'musica'],
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
});

test('validación antes de Turso; fallos de transporte y cambios entre snapshots no dan vacíos', async () => {
  let consultas = 0;
  const consultar = async () => { consultas++; throw new Error('secreto no publicable'); };
  for (const ruta of ['/calendario/eventos', ventana + '&limite=100', ventana + '&zona=incorrecta', ventana + '&desde=2026-10-23',
    ventana + '&q=desde:2026-10-01', ventana + '&q=clasificaciones:', ventana + '&cursor=***', ventana + '&sql=DROP']) {
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
    cuerpo = JSON.parse(opciones.body);
    return Response.json({ results: [{ type: 'ok', response: { type: 'batch', result: {
      step_results: [{ cols: [], rows: [] }, { cols: [{ name: 'id' }], rows: [[{ type: 'integer', value: '12' }]] }, { cols: [], rows: [] }],
      step_errors: [null, null, null] } } }, { type: 'ok', response: { type: 'close' } }] });
  };
  assert.deepEqual(await consultarTurso(env, [{ sql: 'SELECT ? AS id', args: [12] }], simular), [[{ id: 12 }]]);
  assert.equal(cuerpo.requests[0].batch.steps[0].stmt.sql, 'BEGIN');
  assert.equal(cuerpo.requests[0].batch.steps.at(-1).stmt.sql, 'COMMIT');
  assert.equal(cuerpo.requests[1].type, 'close');
  assert.deepEqual(cuerpo.requests[0].batch.steps[1].condition, { type: 'ok', step: 0 });
  await assert.rejects(consultarTurso(env, [], async () => Response.json({ results: [] })));
  await assert.rejects(consultarTurso({ ...env, CALENDARIO_TURSO_URL: 'https://host/path' }, [], simular));
});

test('caché por revisión y selección, revalidación y 429 antes de Turso', async t => {
  const b = base(); t.after(() => b.db.close());
  const valores = new Map();
  const cache = { match: async k => valores.get(k.url)?.clone(), put: async (k, v) => valores.set(k.url, v.clone()),
    delete: async k => valores.delete(k.url) };
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
  for (let i = 0; i < 30; i++) assert.equal((await atenderCalendario(new Request('https://datos.test' + ventana), env,
    { ...opciones, ip: '192.0.2.55' })).status, 200);
  const bloqueada = await atenderCalendario(new Request('https://datos.test' + ventana), env, { ...opciones, ip: '192.0.2.55' });
  assert.equal(bloqueada.status, 429); assert.ok(bloqueada.headers.get('retry-after'));
  assert.equal(b.peticiones(), antes);
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
