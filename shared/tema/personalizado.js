// Tema personalizado, común a Voceiro y al lector (lector/build.mjs lo
// incluye). La persona elige cuatro colores (fondo, texto, enlaces y títulos,
// ya limpios con limpiarColores de shared/sync/fusion.js) y de ellos sale el
// resto de la paleta, con el contraste de lo derivado garantizado: gris
// secundario a 4,5:1, bordes a 3:1, texto sobre color a 4,5:1. Lo elegido no
// se corrige: quien lo pinta avisa si baja de 4,5:1 (contraste()).
// Los colores de estado (modos, guardar, bloquear, resaltado) vienen del tema
// base, claro u oscuro según el fondo: quien lo aplica pone ese data-theme y
// encima estas variables.
// No puede importar nada (el lector lo mete tal cual).

function canales(hex){
  const h = String(hex).replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
function aHex(rgb){
  return '#' + rgb.map(c => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('');
}

export function luminancia(hex){
  const [r, g, b] = canales(hex).map(c => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Contraste WCAG entre dos #rrggbb (1 a 21).
export function contraste(a, b){
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

// De a hacia b: t = 0 es a; t = 1, b.
function mezcla(a, b, t){
  const ca = canales(a), cb = canales(b);
  return aHex(ca.map((c, i) => c + (cb[i] - c) * t));
}

// Negro o blanco, lo que más contraste con c.
function extremo(c){
  return contraste('#000000', c) >= contraste('#ffffff', c) ? '#000000' : '#ffffff';
}

// Acerca color hacia el texto hasta que contraste con el fondo lo pedido; si
// ni el texto llega (lo eligió con poco contraste), hacia el negro o el blanco.
function hastaContraste(color, fondo, minimo, hacia){
  for (const destino of [hacia, extremo(fondo)]){
    for (let i = 0; i <= 20; i++){
      const c = mezcla(color, destino, i / 20);
      if (contraste(c, fondo) >= minimo) return c;
    }
  }
  return extremo(fondo);
}

// { base: 'light' | 'dark', vars: { bg, fg, accent, titulos, muted, … } }.
// 'color-scheme' va entre las vars: quien la aplica la pone como propiedad.
export function paletaPersonalizada(colores){
  const { fondo, texto, enlaces, titulos } = colores;
  const oscuro = luminancia(fondo) < 0.18;
  return {
    base: oscuro ? 'dark' : 'light',
    vars: {
      'color-scheme': oscuro ? 'dark' : 'light',
      bg: fondo, fg: texto, accent: enlaces, titulos,
      muted: hastaContraste(mezcla(texto, fondo, 0.35), fondo, 4.5, texto),
      border: mezcla(fondo, texto, 0.15),
      'quote-bg': mezcla(fondo, texto, 0.05),
      'btn-bg': mezcla(fondo, texto, 0.06),
      'btn-border': hastaContraste(mezcla(fondo, texto, 0.45), fondo, 3, texto),
      'on-solid': extremo(enlaces),
      focus: contraste(enlaces, fondo) >= 3 ? enlaces : texto,
      shadow: oscuro ? 'rgba(0,0,0,.5)' : 'rgba(0,0,0,.08)',
    }
  };
}

// Variables que pone el tema personalizado (para quitarlas al cambiar de tema).
export const VARS_PERSONALIZADAS = ['bg', 'fg', 'accent', 'titulos', 'muted', 'border', 'quote-bg',
  'btn-bg', 'btn-border', 'on-solid', 'focus', 'shadow'];
