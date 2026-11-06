import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { ESPN, admiteConsultaESPN, MOTOR, admiteConsultaMotor } from '../../shared/consultas/registro.js';
import { parseQuery, normalize } from '../../shared/parser.js';
import { fechaValida, sumarDiasCalendario } from '../../shared/calendario/fechas.js';
import { traducir } from '../../front/idiomas/index.js';
import { baseF1, baseMoto, filasF1, filasMoto } from '../../workers/deno-buscar/src/consultas/motor-normalizar.js';
import { codigoDeportes, stubsDeportes } from './deportes-contexto.mjs';

const muestra = n => JSON.parse(readFileSync(new URL(`./muestras/${n}.json`, import.meta.url)));
const codigo = ['14-consultas.js', '14-motor.js', '14-tenis.js'].map(n => readFileSync(new URL(`../../front/app/${n}`, import.meta.url), 'utf8')).join('\n');
const esperar = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };
function fichaReal(competicion) {
  if (competicion === 'f1') {
    const s = muestra('openf1-sesiones').find(s => s.session_key === 11400);
    return { ...baseF1(s, muestra('openf1-gp').find(g => g.meeting_key === s.meeting_key)),
      filas: filasF1(muestra('openf1-qualifying'), muestra('openf1-pilotos-qualifying')) };
  }
  const s = muestra('motogp-sesiones').find(s => s.type === 'RAC');
  return { ...baseMoto(s, muestra('motogp-eventos')[0], 2026), filas: filasMoto(muestra('motogp-carrera')) };
}
function banco(competicion, { idioma = 'es', transformar = f => f } = {}) {
  const ficha = transformar(fichaReal(competicion)), pedidos = [];
  const panel = { dataset: {}, innerHTML: '', addEventListener(tipo, fn) { this[tipo] = fn; }, querySelector() { return null; } };
  const ctx = { ...stubsDeportes(), ESPN, admiteConsultaESPN, MOTOR, admiteConsultaMotor, BACKENDS: { deno: { buscar: 'https://consulta.test' } },
    ACCES: { lang: idioma }, normalize, fechaValida, sumarDiasCalendario,
    t: (k, v) => traducir(idioma, k, v), ico: () => '',
    escapeHtml: s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
    setTimeout: () => 0, clearTimeout() {}, URLSearchParams, AbortSignal,
    document: { getElementById: () => panel },
    fetch: async direccion => {
      const u = new URL(direccion); pedidos.push(u);
      const id = u.searchParams.get('id'), detalle = id === ficha.id;
      const fecha = u.searchParams.get('fecha') || '2026-10-31';
      const cuerpo = { tipo: detalle ? 'partido' : 'resultados', estado: !detalle && fecha === '2026-11-02' ? 'vacio' : 'ok', candidatos: [],
        // La atribución de la ficha debe prevalecer sobre este envoltorio antiguo.
        fuente: 'ESPN', enlace: 'https://www.espn.com', licencia: { nombre: 'Condiciones de ESPN', enlace: 'https://disneytermsofuse.com/' },
        ficha: detalle ? ficha : { competicion, temporada: 2026, fecha, partidos: [ficha], fuente: ficha.fuente },
        consultado: new Date().toISOString(), caduca: new Date(Date.now() + 3600000).toISOString() };
      return { status: 200, ok: true, json: async () => cuerpo };
    } };
  runInNewContext(codigo + '\n' + codigoDeportes + '\nthis.api = { actualizarConsultaPuntual, idSesionMotorValido };', ctx);
  return { panel, ficha, pedidos,
    activar: () => ctx.api.actualizarConsultaPuntual(parseQuery(`resultados:${competicion}`)),
    pulsar: dataset => panel.click({ target: { closest: () => ({ dataset }) } }),
    fecha: value => panel.change({ target: { dataset: { fechaResultados: '' }, value } }),
    validar: ctx.api.idSesionMotorValido };
}
for (const competicion of ['f1', 'motogp']) {
  test(`${competicion}: selector, sesión sin equipos, atribución propia y vuelta a la misma fecha sin red`, async () => {
    const b = banco(competicion); b.activar(); await esperar();
    assert.equal(b.pedidos.length, 1);
    assert.equal(b.pedidos[0].searchParams.get('id'), `${MOTOR[competicion]}:resultados/${competicion}`);
    assert.match(b.panel.innerHTML, /data-fecha-resultados value="2026-10-31"/);
    assert.match(b.panel.innerHTML, /data-accion="partido"/);
    assert.doesNotMatch(b.panel.innerHTML, /Por determinar|undefined|Invalid Date|ESPN/);
    b.fecha('2026-11-01'); await esperar();
    b.pulsar({ accion: 'partido', id: b.ficha.id }); await esperar();
    assert.equal(b.pedidos.length, 3); assert.equal(b.pedidos[2].searchParams.has('fecha'), false);
    assert.match(b.panel.innerHTML, /Volver a resultados/); assert.match(b.panel.innerHTML, /‹ Resultados/);
    assert.doesNotMatch(b.panel.innerHTML, /data-fecha-resultados|ESPN/);
    assert.ok(b.panel.innerHTML.includes(b.ficha.fuente.licencia_url));
    if (competicion === 'f1') assert.match(b.panel.innerHTML, /Q1: 77.341 · Q2: 76.953 · Q3: 76.514/);
    else { assert.match(b.panel.innerHTML, /No clasificado/); assert.match(b.panel.innerHTML, /3 vueltas/); }
    b.pulsar({ accion: 'volver' });
    assert.match(b.panel.innerHTML, /data-fecha-resultados value="2026-11-01"/); assert.equal(b.pedidos.length, 3);
    b.pulsar({ accion: 'partido', id: b.ficha.id }); await esperar(); assert.equal(b.pedidos.length, 3);
    b.pulsar({ accion: 'volver' }); b.fecha('2026-11-02'); await esperar();
    assert.match(b.panel.innerHTML, /No hay sesiones para esta fecha/);
  });
}

test('sesión vacía conserva la ficha; identificadores ajenos no generan botones ni peticiones', async () => {
  const b = banco('f1', { transformar: f => ({ ...f, filas: [] }) }); b.activar(); await esperar();
  b.pulsar({ accion: 'partido', id: b.ficha.id }); await esperar();
  assert.match(b.panel.innerHTML, /Aún no hay resultados disponibles para esta sesión/);
  assert.doesNotMatch(b.panel.innerHTML, /<table|ESPN/);
  for (const id of [`${b.ficha.id}?x=1`, 'openf1:sesion/2026/0', 'motogp:sesion/2026/no/uuid']) assert.equal(b.validar(id), false);
  const invalido = banco('motogp', { transformar: f => ({ ...f, id: 'espn:partido/f1/123' }) }); invalido.activar(); await esperar();
  assert.doesNotMatch(invalido.panel.innerHTML, /data-accion="partido"/);
  invalido.pulsar({ accion: 'partido', id: invalido.ficha.id }); await esperar(); assert.equal(invalido.pedidos.length, 1);
});

test('sesión escapa nombres, condiciones y tiempos de fuente; no crea bloques vacíos', async () => {
  const b = banco('motogp', { transformar: f => ({ ...f, gp: { ...f.gp, nombre: '<img src=x>' },
    filas: f.filas.map(r => ({ ...r, piloto: '<script>x</script>', tiempo: '<svg onload=x>', condicion: '<b>x</b>' })) }) });
  b.activar(); await esperar(); b.pulsar({ accion: 'partido', id: b.ficha.id }); await esperar();
  assert.match(b.panel.innerHTML, /&lt;script&gt;x&lt;\/script&gt;/); assert.match(b.panel.innerHTML, /&lt;svg onload=x&gt;/);
  assert.doesNotMatch(b.panel.innerHTML, /<img src=x>|<script>|<svg onload|<p>\s*<\/p>/);
});

test('los cinco idiomas tienen todas las etiquetas de motor', () => {
  const claves = [...readFileSync(new URL('../../front/idiomas/es.js', import.meta.url), 'utf8').matchAll(/"(conMotor\w+)":/g)].map(m => m[1]);
  for (const idioma of ['es','gl','ca','eu','en']) for (const clave of claves) {
    assert.notEqual(traducir(idioma, clave, { n: 3 }), clave, `${idioma}: ${clave}`);
  }
});
