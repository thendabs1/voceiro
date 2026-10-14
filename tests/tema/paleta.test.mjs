// Contrastes de la paleta común (plantilla.html, bloque PALETA), la que usan
// Voceiro y el lector. Mínimos de WCAG 2.2 AA: 4,5:1 para texto y 3:1 para
// los bordes y el foco de los controles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { leerPaleta, paletaParaLector, temasDePaleta } from '../../lector/paleta.mjs';

const html = readFileSync(new URL('../../plantilla.html', import.meta.url), 'utf8');
const bloque = leerPaleta(html);
const temas = temasDePaleta(bloque);

function luminancia(hex){
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map(c => c + c).join('');
  assert.match(h, /^[0-9a-f]{6}$/i, `color sin entender: ${hex}`);
  const [r, g, b] = [0, 2, 4].map(i => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a, b){
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const TEXTO = 4.5, CONTROL = 3;
// [texto o borde, fondo, mínimo]
const PARES = [
  ['fg', 'bg', TEXTO], ['fg', 'btn-bg', TEXTO], ['fg', 'quote-bg', TEXTO],
  ['muted', 'bg', TEXTO], ['muted', 'btn-bg', TEXTO], ['muted', 'quote-bg', TEXTO],
  ['accent', 'bg', TEXTO], ['accent', 'btn-bg', TEXTO],
  ['preset', 'bg', TEXTO], ['preset', 'preset-bg', TEXTO],
  ['block', 'bg', TEXTO], ['block', 'block-bg', TEXTO],
  ['save', 'bg', TEXTO], ['save', 'save-bg', TEXTO],
  ['on-solid', 'accent', TEXTO], ['on-solid', 'preset', TEXTO],
  ['on-solid', 'block', TEXTO], ['on-solid', 'save', TEXTO],
  ['mark-fg', 'mark', TEXTO],
  ['btn-border', 'bg', CONTROL], ['focus', 'bg', CONTROL], ['focus', 'btn-bg', CONTROL],
];

test('están los cuatro temas', () => {
  assert.deepEqual(Object.keys(temas).sort(), ['contrast', 'dark', 'light', 'sepia']);
});

for (const [nombre, t] of Object.entries(temas)){
  test(`contrastes del tema ${nombre}`, () => {
    const fallos = [];
    for (const [a, b, min] of PARES){
      assert.ok(t[a] && t[b], `${nombre}: falta --${a} o --${b}`);
      const r = contraste(t[a], t[b]);
      if (r < min) fallos.push(`--${a} sobre --${b}: ${r.toFixed(2)} (mín. ${min})`);
    }
    assert.deepEqual(fallos, []);
  });

  test(`color-scheme del tema ${nombre} va con su fondo`, () => {
    const oscuro = luminancia(t.bg) < 0.2;
    assert.equal(t['color-scheme'], oscuro ? 'dark' : 'light');
  });
}

test('el lector recibe la paleta colgada de #il-full', () => {
  const css = paletaParaLector(bloque);
  assert.ok(!css.includes(':root'));
  assert.match(css, /^#il-full\{/);
  for (const t of ['sepia', 'dark', 'contrast']) assert.ok(css.includes(`#il-full[data-theme="${t}"]{`));
});
