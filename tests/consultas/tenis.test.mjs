import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { crearConsultas, crearPresupuesto } from '../../workers/deno-buscar/src/consultas/index.js';
import { leerIdTenis, normalizarTenis } from '../../workers/deno-buscar/src/consultas/tenis.js';
import { ESPN, admiteConsultaESPN } from '../../shared/consultas/registro.js';
import { fechaValida, sumarDiasCalendario } from '../../shared/calendario/fechas.js';
import { traducir } from '../../front/idiomas/index.js';

const leer = ruta => readFileSync(new URL(ruta, import.meta.url), 'utf8');
const muestra = circuito => JSON.parse(leer(`./muestras/espn-tenis-${circuito}.json`));
const encuentros = d => d.events.flatMap(t => t.groupings.flatMap(g => g.competitions));
const lista = (circuito, fecha) => normalizarTenis(muestra(circuito), circuito, fecha);
const idLista = circuito => `espn:resultados/${circuito}`;

function banco({ respuestas = [muestra('atp')], maxDiario = 1000 } = {}) {
  let tiempo = Date.parse('2026-11-05T12:00Z');
  const cache = new Map(), peticiones = [];
  const ahora = () => tiempo;
  const opciones = { ahora, entorno: () => maxDiario,
    presupuesto: crearPresupuesto({ ahora }),
    abrirCache: async () => ({ match: async req => cache.get(req.url)?.clone(),
      put: async (req, r) => { cache.set(req.url, r.clone()); } }),
    fetch: async (url, opciones) => {
      peticiones.push({ url, opciones });
      assert.equal(opciones.headers.Origin, undefined);
      assert.equal(opciones.headers['User-Agent'], 'Voceiro/1.0 (+https://thendabs1.github.io/voceiro/; consultas puntuales)');
      assert.ok(respuestas.length, 'petición de origen imprevista');
      const r = respuestas.shift();
      return r instanceof Response ? r : Response.json(r);
    } };
  const crear = () => crearConsultas(opciones);
  const manejador = crear();
  const pedir = async (params, handler = manejador, ruta = '/consulta/ficha') => {
    const r = await handler(new URL(`https://voceiro.test${ruta}?${new URLSearchParams(params)}`));
    return { r, d: await r.json() };
  };
  return { pedir, buscar: params => pedir(params, manejador, '/consulta'), crear, cache, peticiones, avanzar: ms => { tiempo += ms; } };
}

test('ATP y WTA: fechas filtradas, cuadros y dos lados sin local ni visitante', () => {
  for (const circuito of ['atp', 'wta']) {
    assert.deepEqual(ESPN[circuito], ['tennis', circuito]);
    assert.ok(admiteConsultaESPN('resultados', circuito));
    assert.ok(admiteConsultaESPN('partido', circuito));
    assert.equal(admiteConsultaESPN('clasificacion', circuito), false);
    const d = muestra(circuito), f = normalizarTenis(d, circuito, '2026-11-05');
    assert.ok(encuentros(d).some(c => !c.date.startsWith(f.fecha)));
    assert.equal(f.partidos.length, encuentros(d).filter(c => c.date.startsWith(f.fecha)).length);
    assert.ok(f.partidos.length);
    for (const p of f.partidos) {
      assert.equal(p.vista, 'encuentro_tenis');
      assert.equal(leerIdTenis(p.id).fecha, f.fecha);
      assert.ok(p.inicio === null || p.inicio.startsWith(f.fecha));
      assert.equal(p.lados.length, 2);
      assert.ok(p.torneo.id && p.cuadro.id && p.ronda);
      assert.equal('local' in p || 'visitante' in p || 'marcador' in p, false);
      assert.equal(p.referencias_agenda.length, circuito === 'atp' ? 2 : 0);
      if (circuito === 'atp') assert.deepEqual(p.referencias_agenda.map(r => [r.proveedor, r.tipo, r.id]), [
        ['espn-atp', 'tournament_uid', p.torneo.id], ['espn-atp', 'tournament_calendar_uid', p.torneo.id],
      ]);
    }
    assert.ok(!JSON.stringify(f).includes('competitors'));
  }
});

test('retirada 6–1, 2–1: conserva parciales y condición; completed no la convierte en victoria normal', () => {
  const p = lista('wta', '2026-10-31').partidos.find(p => p.id.endsWith('/187324'));
  assert.equal(p.estado, 'final');
  assert.equal(p.estado_original, 'STATUS_RETIRED');
  assert.equal(p.condicion, 'retirada');
  assert.deepEqual(p.lados.map(l => l.sets.map(s => s.juegos)), [[6, 2], [1, 1]]);
  assert.deepEqual(p.lados.map(l => l.ganador), [true, false]);
});

test('las consultas ATP y WTA ofrecen resultados sin red y candidatos de encuentro con las mismas identidades', async () => {
  for (const circuito of ['atp', 'wta']) {
    const b = banco({ respuestas: [muestra(circuito)] });
    const resultado = await b.buscar({ tipo: 'resultados', texto: circuito });
    assert.equal(resultado.d.candidatos[0].id, idLista(circuito));
    assert.equal(b.peticiones.length, 0);
    const candidatos = await b.buscar({ tipo: 'partido', texto: circuito });
    assert.equal(candidatos.d.estado, 'ok');
    assert.ok(candidatos.d.candidatos.length);
    assert.ok(candidatos.d.candidatos.every(c => leerIdTenis(c.id)?.circuito === circuito));
    const detalle = await b.pedir({ id: candidatos.d.candidatos[0].id });
    assert.equal(detalle.d.ficha.vista, 'encuentro_tenis');
    assert.equal(b.peticiones.length, 1);
  }
});

test('walkover sin sets, dobles, desempate y superdesempate sin inventar juegos', () => {
  const wo = lista('atp', '2026-11-05').partidos.filter(p => p.condicion === 'incomparecencia');
  assert.ok(wo.length);
  assert.ok(wo.every(p => p.estado_original === 'STATUS_WALKOVER' && p.lados.every(l => !l.sets.length)));
  const doble = lista('atp', '2026-11-02').partidos.find(p => p.id.endsWith('/187298'));
  assert.ok(doble.lados.every(l => l.participantes.length === 2));
  assert.deepEqual(doble.lados.map(l => l.sets[2]), [{ juegos: 1, desempate: 10 }, { juegos: 0, desempate: 7 }]);
  const simple = lista('atp', '2026-10-31').partidos[0];
  assert.deepEqual(simple.lados.map(l => l.sets[1]), [{ juegos: 7, desempate: 7 }, { juegos: 6, desempate: 3 }]);
});

test('timeValid:false conserva el día declarado sin fabricar hora; el estado del torneo no se hereda', () => {
  const f = lista('atp', '2026-11-07');
  assert.ok(f.partidos.length);
  assert.ok(f.partidos.every(p => p.inicio === null && p.estado === 'programado'));
  assert.ok(f.partidos.every(p => p.lados.every(l => l.ganador === null && !l.sets.length)));
  assert.equal(muestra('atp').events[0].status.type.name, 'STATUS_FINAL');
  const cancelado = lista('wta', '2026-11-08').partidos.find(p => p.estado === 'cancelado');
  assert.ok(cancelado);
  assert.equal(cancelado.condicion, null);
});

test('ausencias y estados desconocidos quedan nulos o desconocidos, sin inferir del marcador ni de completed', () => {
  const d = muestra('atp'), c = encuentros(d).find(c => c.id === '187334');
  delete c.status.type.name;
  delete d.events[0].season;
  for (const p of c.competitors) { delete p.winner; delete p.linescores[0].value; }
  const p = normalizarTenis(d, 'atp', '2026-10-31').partidos[0];
  assert.equal(p.estado, 'desconocido'); assert.equal(p.estado_original, null);
  assert.equal(p.temporada, null); assert.equal(p.condicion, null);
  assert.ok(p.lados.every(l => l.ganador === null && l.sets[0].juegos === null));
  assert.throws(() => normalizarTenis(d, 'wta', '2026-10-31'), /no válido/);
  c.uid += 'otra';
  assert.throws(() => normalizarTenis(d, 'atp', '2026-10-31'), /identidad/);
});

test('lista y fichas comparten un GET entre idiomas e instancias; caducan sin ampliar el TTL de origen', async () => {
  const b = banco({ respuestas: [muestra('atp'), muestra('atp')] });
  const l = await b.pedir({ id: idLista('atp'), fecha: '2026-11-05' });
  assert.equal(l.r.headers.get('cache-control'), 'public, max-age=3600');
  const ids = l.d.ficha.partidos.map(p => p.id);
  b.avanzar(10000);
  const fichas = await Promise.all(ids.map(id => b.pedir({ id, idioma: 'gl' }, b.crear())));
  assert.ok(fichas.every(f => f.d.estado === 'ok' && f.r.headers.get('cache-control') === 'public, max-age=3590'));
  assert.ok(fichas.every(f => f.d.enlace === f.d.ficha.fuente.url && f.d.licencia.enlace === f.d.ficha.fuente.licencia_url));
  assert.equal(b.peticiones.length, 1);
  assert.equal(b.peticiones[0].url, 'https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard?dates=20261105');
  b.avanzar(3600e3);
  await b.pedir({ id: ids[0] });
  assert.equal(b.peticiones.length, 2);
});

test('ficha en frío y lista simultánea comparten scoreboard; vacío, en juego y programado tienen caché acotada', async () => {
  const b = banco();
  const id = lista('atp', '2026-11-05').partidos[0].id;
  const [a, l] = await Promise.all([b.pedir({ id }), b.pedir({ id: idLista('atp') })]);
  assert.equal(a.d.ficha.id, id); assert.equal(l.d.ficha.fecha, '2026-11-05');
  assert.equal(b.peticiones.length, 1);
  for (const [circuito, fecha, ttl, estado] of [['wta', '2026-11-06', 60, 'ok'], ['atp', '2026-11-07', 900, 'ok'], ['atp', '2026-09-01', 900, 'vacio']]) {
    const prueba = banco({ respuestas: [muestra(circuito)] });
    const r = await prueba.pedir({ id: idLista(circuito), fecha });
    assert.equal(r.d.estado, estado);
    assert.equal(r.r.headers.get('cache-control'), `public, max-age=${ttl}`);
    assert.equal(r.d.ficha.fecha, fecha);
  }
});

test('ID estrictos y capacidades se validan antes de red; no acepta el espacio de nombres de equipos', async () => {
  const b = banco({ respuestas: [] });
  for (const id of ['espn:tenis/atp/20260230/13-2026/187334', 'espn:tenis/atp/00000101/13-2026/187334',
    'espn:tenis/atp/20261105/13-2026/187334/extra', 'espn:tenis/atp/20261105/13-2026/0',
    'espn:tenis/atp/20261105/../187334', 'espn:tenis/otra/20261105/13-2026/187334',
    'espn:tenis/atp/20261105/13-2026/187334\n',
    'espn:partido/atp/187334', 'espn:clasificacion/wta']) {
    assert.equal((await b.pedir({ id })).r.status, 400, id);
  }
  assert.equal(b.peticiones.length, 0);
  const p = banco();
  const id = lista('atp', '2026-10-31').partidos[0].id.replace('/187334', '/999999');
  assert.equal((await p.pedir({ id })).d.estado, 'no_disponible');
  assert.equal(p.peticiones.length, 1);
  assert.equal([...p.cache.keys()].filter(k => !k.includes('origen-tenis')).length, 0);
});

test('presupuesto de ESPN y errores de origen no se reintentan ni se cachean como resultados', async () => {
  const agotado = banco({ respuestas: [], maxDiario: 0 });
  assert.match((await agotado.pedir({ id: idLista('atp') })).d.motivo, /Presupuesto/);
  assert.equal(agotado.peticiones.length, 0);
  for (const status of [403, 429]) {
    const b = banco({ respuestas: [new Response('', { status })] });
    assert.equal((await b.pedir({ id: idLista('atp') })).d.estado, 'no_disponible');
    assert.equal(b.peticiones.length, 1); assert.equal(b.cache.size, 0);
  }
});

// El panel se ejecuta con sus módulos reales y un DOM mínimo, sin navegador ni red.
function panelTenis(idioma = 'es') {
  const peticiones = [];
  const panel = { dataset: {}, html: '', hidden: true, addEventListener() {}, querySelector() { return null; },
    set innerHTML(v) { this.html = v; } };
  const ctx = { ESPN, admiteConsultaESPN, fechaValida, sumarDiasCalendario, ACCES: { lang: idioma },
    BACKENDS: { deno: { buscar: 'https://voceiro.test' } },
    t: (k, v) => traducir(idioma, k, v), ico: () => '',
    escapeHtml: v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    Date, Intl, URLSearchParams, AbortSignal, setTimeout: () => 0, clearTimeout() {},
    document: { getElementById: () => panel },
    fetch: async url => {
      const u = new URL(url), id = u.searchParams.get('id'); peticiones.push(u);
      const fecha = u.searchParams.get('fecha') || '2026-11-05';
      const f = id.startsWith('espn:tenis/') ? lista('atp', leerIdTenis(id).fecha).partidos.find(p => p.id === id) : lista('atp', fecha);
      return { ok: true, status: 200, json: async () => ({ tipo: id.startsWith('espn:tenis/') ? 'partido' : 'resultados',
        estado: 'ok', ficha: f, candidatos: [], fuente: 'Atribución incorrecta', enlace: 'https://incorrecta.test',
        caduca: new Date(Date.now() + 3600e3).toISOString() }) };
    } };
  runInNewContext(leer('../../front/app/14-consultas.js') + '\n' + leer('../../front/app/14-tenis.js')
    + '\nthis.api = { PUNTUAL, abrirFichaConsulta, pulsarConsulta, consultarFechaResultados, idPartidoConsultaValido, ficha: VISTAS_CONSULTA.encuentro_tenis.ficha };', ctx);
  ctx.api.PUNTUAL.activa = { tipo: 'resultados', texto: 'atp' };
  const pulsar = dataset => ctx.api.pulsarConsulta({ target: { closest: () => ({ dataset }) } });
  return { ...ctx.api, panel, peticiones, pulsar };
}
const esperar = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };

test('panel: fecha, dobles, apertura y vuelta sin GET adicional ni campos de equipos', async () => {
  const p = panelTenis();
  await p.abrirFichaConsulta(idLista('atp'));
  assert.match(p.panel.html, /data-fecha-resultados value="2026-11-05"/);
  assert.match(p.panel.html, /UTC/); assert.match(p.panel.html, /Hora sin confirmar/);
  assert.match(p.panel.html, /Incomparecencia/); assert.match(p.panel.html, /Christian Harrison \/ Neal Skupski/);
  assert.doesNotMatch(p.panel.html, /Atribución incorrecta|incorrecta.test|Por determinar|1970/);
  const id = lista('atp', '2026-11-05').partidos.find(p => p.lados[0].participantes.length === 2).id;
  p.pulsar({ accion: 'partido', id }); await esperar();
  assert.match(p.panel.html, /Volver a resultados/); assert.match(p.panel.html, /Hora sin confirmar/);
  assert.doesNotMatch(p.panel.html, /data-fecha-resultados|<table|0–0|6–0/);
  p.pulsar({ accion: 'volver' });
  assert.match(p.panel.html, /data-fecha-resultados value="2026-11-05"/);
  assert.equal(p.peticiones.length, 2);
  p.consultarFechaResultados('2026-11-02', ''); await esperar();
  assert.equal(p.peticiones[2].searchParams.get('fecha'), '2026-11-02');
});

test('panel: retirada, desempates, traducciones y validación estricta en los cinco idiomas', () => {
  for (const idioma of ['es', 'gl', 'ca', 'eu', 'en']) {
    const p = panelTenis(idioma), f = lista('wta', '2026-10-31').partidos.find(p => p.id.endsWith('/187324'));
    const vista = p.ficha(f);
    assert.ok(vista.linea.includes(traducir(idioma, 'conRetiradaTenis')));
    assert.match(vista.cuerpo, /<td>6<\/td><td>2<\/td>/);
    assert.match(vista.cuerpo, /STATUS_RETIRED/);
    const doble = p.ficha(lista('atp', '2026-11-02').partidos.find(p => p.id.endsWith('/187298')));
    assert.match(doble.cuerpo, /<sup [^>]+>10<\/sup>/);
    assert.ok(doble.cuerpo.includes(traducir(idioma, 'conDesempateTenis', { n: 10 })));
    assert.doesNotMatch(doble.cuerpo, /undefined|null|con[A-Z]/);
    assert.ok(p.idPartidoConsultaValido(f.id));
    for (const id of [f.id + '/extra', f.id + '\n', f.id.replace('20261031', '20260230'), 'espn:partido/atp/187334']) assert.equal(p.idPartidoConsultaValido(id), false);
    const malicioso = structuredClone(f); malicioso.lados[0].participantes = ['<script>'];
    assert.doesNotMatch(p.ficha(malicioso).cuerpo, /<script>/);
  }
});
