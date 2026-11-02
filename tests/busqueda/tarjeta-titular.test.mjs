import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerAplicacion } from '../soporte/frontend.mjs';
import { runInNewContext } from 'node:vm';
import { palabrasDe } from '../../shared/busqueda/texto.js';

// Un medio cambia el titular de una URL: el histórico guarda cada titular como
// entrada propia y el frontal las une por URL. La tarjeta debe quedarse con el
// titular que se recogió más tarde, llegue en el orden que llegue.
// Funciones reales del frontal.
const html = leerAplicacion();
const funcion = nombre => {
  const i = html.indexOf(`function ${nombre}(`);
  assert.ok(i >= 0, nombre);
  return html.slice(i, html.indexOf('\n}', i) + 2);
};

function crear() {
  const ctx = {
    NOTICIAS: [], _itemPorUrl: new Map(), _itemPorTitulo: new Map(),
    _urlsCargadas: new Set(), _titulosCargados: new Set(), _titularesCambiados: 0,
    _OFFSET_MADRID: new Map(),
    _FMT_MADRID: new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Madrid', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }),
    normalizeUrlForMatch: s => s, normalize: s => s.toLowerCase(),
    HORIZONTE_FUTURO_MS: 3600e3,
  };
  for (const f of ['_mergearItemsEnNoticias', '_claveUrl', '_adoptarPublicacion',
                   '_adoptarTitularMasReciente', '_vistoTitular', '_calcularFechas',
                   'reconstruirFecha', '_offsetMadrid', '_horaMadridComoUTC', 'parseFecha',
                   'escapeHtml', 'limpiarCdata']) {
    runInNewContext(funcion(f), ctx);
  }
  // Lo que hace hidratarNoticias con los campos que se miran aquí.
  const hidratar = () => {
    for (const x of ctx.NOTICIAS) {
      if (x._hidratada) continue;
      x._hidratada = true;
      x.titular = x.t;
      x._titularEsc = runInNewContext('escapeHtml', ctx)(x.t);
    }
  };
  const meter = (items, capa = 'grupo:deportes') =>
    runInNewContext('_mergearItemsEnNoticias', ctx)(items, capa);
  return { ctx, meter, hidratar };
}

// Caso real (AS, 27-10-2026): mismas `p`; en el fichero va primero el de 10 por
// orden alfabético, aunque el de 17 se recogió más tarde.
const U = '/futbol/laliga-denuncia-incidentes-clasico/';
const v10 = () => ({ d: 'as.com', u: U, t: 'LaLiga denuncia 10 incidentes en el Clásico', p: '15:58', c: '16:31', _dia: '2026-10-27' });
const v17 = () => ({ d: 'as.com', u: U, t: 'LaLiga denuncia 17 incidentes en el Clásico', p: '15:58', c: '17:03', _dia: '2026-10-27' });

test('una URL con dos titulares muestra el recogido más tarde, en cualquier orden', () => {
  for (const orden of [[v10(), v17()], [v17(), v10()]]) {
    const { ctx, meter, hidratar } = crear();
    assert.equal(meter(orden), 1);
    hidratar();
    assert.equal(ctx.NOTICIAS.length, 1);
    assert.equal(ctx.NOTICIAS[0].titular, 'LaLiga denuncia 17 incidentes en el Clásico');
  }
});

test('el titular nuevo que llega en otra capa actualiza la tarjeta ya pintada', () => {
  const { ctx, meter, hidratar } = crear();
  meter([v10()], 'base');
  hidratar();
  const n = ctx.NOTICIAS[0];
  n._palabras = palabrasDe(n.titular);
  n._temas = [{ id: 'x', etiqueta: '10' }];
  n._temasVer = 3;

  assert.equal(meter([v17()]), 0);                       // no es otra noticia…
  assert.equal(ctx._titularesCambiados, 1);              // …pero hay que repintar
  assert.equal(n.titular, 'LaLiga denuncia 17 incidentes en el Clásico');
  assert.equal(n._titularEsc, 'LaLiga denuncia 17 incidentes en el Clásico');
  assert.equal(n._palabras, undefined);                  // cachés del titular viejo, fuera
  assert.notEqual(n._temasVer, 3);
  assert.equal(ctx._itemPorTitulo.get('laliga denuncia 17 incidentes en el clásico'), n);
  // La hora y la publicación de la tarjeta no cambian: no sube en el feed.
  assert.equal(n.p, '15:58');
  assert.equal(n.c, '16:31');

  meter([v10()]);                                        // el viejo, otra vez: nada
  assert.equal(n.titular, 'LaLiga denuncia 17 incidentes en el Clásico');
  assert.equal(ctx._titularesCambiados, 1);
});

test('la recogida cuenta en el día de su fichero (otro día, hora menor)', () => {
  const { ctx, meter, hidratar } = crear();
  meter([
    { d: 'rtve.es', u: '/directo/', t: 'Día siguiente', c: '08:00', _dia: '2026-10-29' },
    { d: 'rtve.es', u: '/directo/', t: 'Primer día', c: '21:30', _dia: '2026-10-28' },
  ]);
  hidratar();
  assert.equal(ctx.NOTICIAS[0].titular, 'Día siguiente');
});

test('sin recogida fechada (prensa, ficheros viejos) o con empate, se queda el que había', () => {
  const { ctx, meter, hidratar } = crear();
  meter([{ d: 'as.com', u: U, t: 'De la prensa', p: '2026-10-27T15:58:00+01:00' }], 'prensa');
  meter([v17()]);
  hidratar();
  assert.equal(ctx.NOTICIAS[0].titular, 'De la prensa');

  const b = crear();
  b.meter([v10(), { ...v17(), c: '16:31' }]);
  b.hidratar();
  assert.equal(b.ctx.NOTICIAS[0].titular, 'LaLiga denuncia 10 incidentes en el Clásico');
  assert.equal(b.ctx._titularesCambiados, 0);
});
