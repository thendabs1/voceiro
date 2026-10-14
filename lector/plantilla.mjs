// Lo que el lector toma de plantilla.html (Voceiro) al construirse, para que
// haya un solo juego de cada cosa:
// - la paleta: el bloque entre «═══ PALETA ═══» y «═══ FIN DE LA PALETA ═══»,
//   como datos ({ light: {bg:'#fff', …}, sepia: {…}, … }); el lector genera
//   el CSS para cada sitio donde la usa (#il-full, Ajustes, el botón…);
// - los iconos: los <symbol id="i-…"> del sprite (trazados de Lucide).
// tests/tema/paleta.test.mjs comprueba los contrastes de la paleta.

const RX_BLOQUE = /\/\* ═══ PALETA ═══[\s\S]*?\*\/([\s\S]*?)\/\* ═══ FIN DE LA PALETA ═══ \*\//;

// El bloque tal cual está en plantilla.html (sin los comentarios marcadores).
export function leerPaleta(html){
  const m = RX_BLOQUE.exec(html);
  if (!m) throw new Error('plantilla.html: no se encuentra el bloque PALETA');
  return m[1].trim();
}

// { light: {bg:'#fff', …, 'color-scheme':'light'}, sepia: {…}, … }; los
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
  if (!temas.light) throw new Error('paleta: falta :root');
  for (const t of Object.values(temas)){
    for (const v of Object.values(t)){
      if (!/^[#\w(),.\s-]+$/.test(v)) throw new Error(`paleta: valor raro «${v}»`);
    }
  }
  return temas;
}

// { 'arrow-left': '<path d="…" />…', … }: lo de dentro de cada <symbol>.
export function leerIconos(html){
  const iconos = {};
  for (const m of html.matchAll(/<symbol id="i-([a-z0-9-]+)" viewBox="0 0 24 24">([\s\S]*?)<\/symbol>/g)){
    if (/<(?!\/?(path|line|polyline|circle|rect|polygon|ellipse)\b)/.test(m[2])){
      throw new Error(`icono i-${m[1]}: solo se admiten formas simples`);
    }
    iconos[m[1]] = m[2];
  }
  return iconos;
}
