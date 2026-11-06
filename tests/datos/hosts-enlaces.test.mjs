import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datosEnlaces } from '../soporte/datos-enlaces.mjs';

const { hostDeRuta } = datosEnlaces();

test('hostDeRuta conserva el host propio y los subdominios de tablas antiguas', () => {
  for (const [h, d] of [['www.telecinco.es', 'telecinco.es'], ['telecinco.es', 'telecinco.es'],
    ['chile.as.com', 'as.com'], ['rurales.elpais.com.uy', 'elpais.com.uy'],
    ['es.motorsport.com', 'es.motorsport.com']]) assert.equal(hostDeRuta(h, d), h);
});

test('hostDeRuta descarta hosts ajenos, vacíos y coincidencias sin límite de dominio', () => {
  for (const [h, d] of [['news.google.com', 'cambio16.com'], ['www.cuatro.com', 'telecinco.es'],
    ['falsoas.com', 'as.com'], ['as.com.otro.es', 'as.com'], ['', 'as.com'],
    [null, 'as.com'], [undefined, 'as.com']]) assert.equal(hostDeRuta(h, d), `www.${d}`);
});

test('hidratar noticias y alternativas usa hostDeRuta, y respeta las URL absolutas', async () => {
  for (const extender of [false, true]) {
    const leidas = await datosEnlaces().cargar([{
      fecha: '2026-11-06', generado: '2026-11-06T12:00:00+01:00',
      medios: { 'cambio16.com': { h: 'news.google.com' }, 'telecinco.es': { h: 'www.cuatro.com' },
        'as.com': { h: 'chile.as.com' } },
      noticias: [{ d: 'cambio16.com', t: 'Presupuesto del Gobierno', u: '/presupuesto/', a: [
        { d: 'telecinco.es', u: '/noticias/presupuesto.html' }, { d: 'as.com', u: '/futbol/presupuesto-n/' },
      ] }, { d: 'telecinco.es', t: 'Otra noticia', u: 'https://www.cuatro.com/noticias/otra.html' }],
    }], [0], extender);
    assert.deepEqual(leidas, [
      { dominio: 'cambio16.com', enlace: 'https://www.cambio16.com/presupuesto/' },
      { dominio: 'telecinco.es', enlace: 'https://www.telecinco.es/noticias/presupuesto.html' },
      { dominio: 'as.com', enlace: 'https://chile.as.com/futbol/presupuesto-n/' },
      { dominio: 'telecinco.es', enlace: 'https://www.cuatro.com/noticias/otra.html' },
    ]);
  }
});
