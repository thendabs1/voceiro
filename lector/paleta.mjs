// Paleta común de Voceiro y del lector. Vive en plantilla.html, entre
// «═══ PALETA ═══» y «═══ FIN DE LA PALETA ═══»; build.mjs la copia al
// lector y tests/tema/paleta.test.mjs comprueba sus contrastes.

const RX_BLOQUE = /\/\* ═══ PALETA ═══[\s\S]*?\*\/([\s\S]*?)\/\* ═══ FIN DE LA PALETA ═══ \*\//;

// El bloque tal cual está en plantilla.html (sin los comentarios marcadores).
export function leerPaleta(html){
  const m = RX_BLOQUE.exec(html);
  if (!m) throw new Error('plantilla.html: no se encuentra el bloque PALETA');
  return m[1].trim();
}

// Lo mismo para el lector: los temas cuelgan de #il-full, no de la página.
export function paletaParaLector(bloque){
  const css = bloque
    .replace(/^\s*:root\s*\{/gm, '#il-full{')
    .replace(/^\s*(\[data-theme="[a-z]+"\])\s*\{/gm, '#il-full$1{');
  if (/:root|^\s*\[/m.test(css)) throw new Error('paleta: hay un selector que no se sabe pasar al lector');
  // Va dentro de una plantilla de texto (`…`) en 20-css-del-lector.js.
  if (/[`\\]|\$\{/.test(css)) throw new Error('paleta: no puede llevar ` ni \\ ni ${');
  return css;
}

// { light: {bg:'#fff', …}, sepia: {…}, dark: {…}, contrast: {…} }; los
// temas heredan de :root lo que no redefinen, como en CSS.
export function temasDePaleta(bloque){
  const temas = {};
  const rx = /(:root|\[data-theme="([a-z]+)"\])\s*\{([^}]*)\}/g;
  let m;
  while ((m = rx.exec(bloque))){
    const nombre = m[2] || 'light';
    const vars = {};
    for (const d of m[3].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) vars[d[1]] = d[2].trim();
    const esquema = /color-scheme\s*:\s*(\w+)/.exec(m[3]);
    if (esquema) vars['color-scheme'] = esquema[1];
    temas[nombre] = { ...(temas.light || {}), ...vars };
  }
  return temas;
}
