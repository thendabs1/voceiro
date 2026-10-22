import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const plantilla = readFileSync(new URL('../../plantilla.html', import.meta.url), 'utf8');
const publicado = readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
const arranque = html => html.match(/<head>[\s\S]*?<script>([\s\S]*?)<\/script>\s*<link rel="stylesheet"/)?.[1];

test('el tema se restaura en el head, antes de los estilos y del body', () => {
  assert.ok(arranque(plantilla));
  assert.equal(arranque(publicado), arranque(plantilla));
  for (const ruta of ['front/estilos/01-base-cabecera.css', 'public/estilos.css'])
    assert.match(readFileSync(new URL(`../../${ruta}`, import.meta.url), 'utf8'), /html\{background:var\(--bg\)\}/);
});

function pintar(perfil, oscuroSistema = false, legado = false){
  const datos = {};
  if (perfil !== undefined) datos['voceiro-acces-v2'] = JSON.stringify(perfil);
  if (legado) datos['voceiro-antiguo'] = '1';
  const localStorage = { ...datos };
  Object.defineProperty(localStorage, 'getItem', { value: k => datos[k] ?? null });
  const vars = {};
  const h = { dataset: { theme: 'light' }, style: { setProperty: (k, v) => { vars[k] = v; } } };
  runInNewContext(arranque(plantilla), {
    localStorage, document: { documentElement: h },
    matchMedia: () => ({ matches: oscuroSistema }),
  });
  return { tema: h.dataset.theme, vars };
}

test('se recuperan los temas guardados antes de cargar el módulo', () => {
  for (const tema of ['light', 'sepia', 'dark', 'contrast'])
    assert.equal(pintar({ tema }).tema, tema);
});

test('el tema personalizado pinta su fondo y elige la base correcta', () => {
  for (const [fondo, base] of [['#171717', 'dark'], ['#f4ecd8', 'light']]) {
    const { tema, vars } = pintar({ tema: 'custom', colores: {
      fondo, texto: '#eeeeee', enlaces: '#aabbcc', titulos: '#dddddd',
    } });
    assert.equal(tema, base);
    assert.equal(vars['--bg'], fondo);
    assert.equal(vars['color-scheme'], base);
  }
});

test('la primera visita sigue la preferencia del sistema; un perfil antiguo conserva el claro', () => {
  assert.equal(pintar(undefined, true).tema, 'dark');
  assert.equal(pintar(undefined, true, true).tema, 'light');
});
