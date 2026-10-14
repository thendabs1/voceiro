// Tema personalizado: lo que se calcula a partir de los cuatro colores
// elegidos cumple los contrastes, y los colores viajan limpios en el perfil.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paletaPersonalizada, contraste, VARS_PERSONALIZADAS } from '../../shared/tema/personalizado.js';
import { limpiarColores, limpiarPerfil, fusionarPerfil } from '../../shared/sync/fusion.js';

const CASOS = [
  { fondo: '#fdf6e3', texto: '#1f2a33', enlaces: '#0b5cad', titulos: '#1f2a33' },   // crema
  { fondo: '#101418', texto: '#e6edf3', enlaces: '#7cc4ff', titulos: '#ffd866' },   // oscuro
  { fondo: '#e8f0fe', texto: '#202124', enlaces: '#1a0dab', titulos: '#174ea6' },   // azulado
  { fondo: '#ffffff', texto: '#777777', enlaces: '#cccccc', titulos: '#999999' },   // mal elegido
  { fondo: '#000000', texto: '#ffff00', enlaces: '#00ffff', titulos: '#ffffff' },   // contraste
];

for (const c of CASOS){
  test(`lo derivado cumple con fondo ${c.fondo} y texto ${c.texto}`, () => {
    const { base, vars } = paletaPersonalizada(c);
    assert.equal(vars.bg, c.fondo);
    assert.equal(vars.fg, c.texto);
    assert.equal(base, vars['color-scheme']);
    assert.ok(contraste(vars.muted, vars.bg) >= 4.5, 'muted');
    assert.ok(contraste(vars['btn-border'], vars.bg) >= 3, 'btn-border');
    assert.ok(contraste(vars['on-solid'], vars.accent) >= 4.5, 'on-solid');
    for (const k of VARS_PERSONALIZADAS) assert.ok(vars[k], k);
  });
}

test('fondo oscuro → base oscura; claro → clara', () => {
  assert.equal(paletaPersonalizada(CASOS[1]).base, 'dark');
  assert.equal(paletaPersonalizada(CASOS[0]).base, 'light');
});

test('limpiarColores: siempre las cuatro claves, en orden y en minúsculas; si falta una, nada', () => {
  assert.deepEqual(
    limpiarColores({ titulos: '#AABBCC', enlaces: '#112233', texto: '#000000', fondo: '#FFFFFF', extra: 1 }),
    { fondo: '#ffffff', texto: '#000000', enlaces: '#112233', titulos: '#aabbcc' });
  assert.equal(limpiarColores({ fondo: '#fff', texto: '#000000', enlaces: '#112233', titulos: '#aabbcc' }), null);
  assert.equal(limpiarColores(null), null);
});

test('los colores viajan en el perfil y gana el más reciente', () => {
  const a = { tema: 'custom', colores: CASOS[0], actualizado: 1000 };
  const b = { tema: 'custom', colores: CASOS[1], actualizado: 2000 };
  assert.deepEqual(fusionarPerfil(a, b).colores, CASOS[1]);
  assert.deepEqual(fusionarPerfil(b, a).colores, CASOS[1]);
  assert.equal(limpiarPerfil({ colores: { fondo: 'rojo' }, actualizado: 1 }).colores, undefined);
});
