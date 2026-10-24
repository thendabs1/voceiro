import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fuente = ['09-dominios-y-reglas.js', '22-herramienta-de-analisis-de-extraccion.js']
  .map(f => readFileSync(new URL('../../lector/src/' + f, import.meta.url), 'utf8')).join('\n');

test('el extractor no inspecciona otra página ni cambia la regla del medio', () => {
  for (const hostname of ['thendabs1.github.io', 'otro.example', 'medio.example.otro.example']){
    const site = { domain: 'medio.example', extraction: { mode: 'auto' } };
    const avisos = [];
    const contexto = vm.createContext({
      CFG: { sites: [site] }, location: { hostname }, PLATAFORMA: {},
      t: () => 'Abre una noticia de {X}', toast: texto => avisos.push(texto),
      document: new Proxy({}, { get(){ throw new Error('No debe inspeccionar el documento'); } })
    });
    vm.runInContext(fuente + '\nopenExtractionTool(0);', contexto);
    assert.deepEqual(avisos, ['Abre una noticia de medio.example']);
    assert.deepEqual(site.extraction, { mode: 'auto' });
  }
});

test('el extractor admite el medio y sus subdominios', () => {
  for (const hostname of ['medio.example', 'www.medio.example']){
    let consultas = 0;
    const contexto = vm.createContext({
      CFG: { sites: [{ domain: 'medio.example' }] }, location: { hostname }, PLATAFORMA: {},
      document: { getElementById(){ consultas++; return {}; } },
      toast(){ assert.fail('No debe rechazar el medio actual'); }
    });
    vm.runInContext(fuente + '\nopenExtractionTool(0);', contexto);
    assert.equal(consultas, 1);
  }
});

test('el aviso de abrir el medio solo sale donde el análisis no funciona', () => {
  const casos = [
    [{}, 'thendabs1.github.io', false],
    [{}, 'www.medio.example', true],
    [{ esPaginaPropia: true, analizar(){} }, 'extension-id', true],
    [{ esPaginaPropia: true }, 'extension-id', false],
  ];
  for (const [PLATAFORMA, hostname, esperado] of casos){
    const contexto = vm.createContext({ PLATAFORMA, location: { hostname } });
    vm.runInContext(fuente, contexto);
    assert.equal(vm.runInContext('analisisDisponible("medio.example")', contexto), esperado, hostname);
  }
});
