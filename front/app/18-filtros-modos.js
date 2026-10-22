/* ═══════════════════════════════════════════════════════════════
   CUMPLE PRESET
   ═══════════════════════════════════════════════════════════════ */
let SET_GRUPOS = new Set();
// Temas: las palabras de cada modo, una búsqueda pequeña por línea
// (shared/busqueda/temas.js). Se compilan los de TODOS los modos: el modo
// activo los usa para ampliar su feed y la vista 🔖 Temas los junta.
// TEMAS_VER invalida la caché de cada noticia (n._temas) al recompilar.
let TEMAS_TODOS = [];   // [{ id, nombre, temas, ignorar: Set(dominios) }]
let TEMAS_VER = 0;

function recompilarPreset(){
  SET_GRUPOS = new Set(PRESET.grupos);
  recompilarTemas();
}
// Depende de toda la lista de modos: la llaman recompilarPreset y
// guardarPresets (renombrar, duplicar, borrar, silenciar un medio…).
function recompilarTemas(){
  const lista = (PRESETS && PRESETS.lista) || [];
  TEMAS_TODOS = lista.map(p => {
    const ov = p.overrides || {};
    return {
      id: p.id,
      nombre: p.nombre,
      temas: compilarTemas(p.palabras),
      ignorar: new Set(Object.keys(ov).filter(d => ov[d] === 'ignore')),
    };
  }).filter(m => m.temas.length);
  TEMAS_VER++;
}
// Temas que casan con la noticia, de todos los modos: [{ id, etiqueta }].
// Un modo no aporta temas en los medios que tiene silenciados.
function _temasDe(n){
  if (n._temasVer === TEMAS_VER) return n._temas;
  const palabras = n._palabras || (n._palabras = palabrasDe(n.titular));
  const out = [];
  for (const m of TEMAS_TODOS){
    if (m.ignorar.has(n.dominio)) continue;
    for (const etiqueta of temasQueCasan(palabras, m.temas, n.titular)) out.push({ id: m.id, etiqueta });
  }
  n._temas = out;
  n._temasVer = TEMAS_VER;
  return out;
}
// Lo que filtra el feed: los temas en la vista 🔖 Temas (con el chip de
// modo, si hay), o el modo activo; y encima, el chip de tema.
function cumpleFiltro(n, ctx){
  if (ctx && ctx.vistaTemas){
    const ts = _temasDe(n);
    if (!(ctx.chipTemas ? ts.some(x => x.id === ctx.chipTemas) : ts.length > 0)) return false;
  } else if (!cumplePreset(n)) return false;
  return !(ctx && ctx.chipTema) || _pasaChipTema(n, ctx.chipTema);
}
function _pasaChipTema(n, chip){
  if (chip.medios) return _entraPorMedios(n);
  return _temasDe(n).some(x => x.id === chip.modo && x.etiqueta === chip.etiqueta);
}
// Lo que entra en el modo activo por sus medios (grupos o incluidos), no
// por sus temas.
function _entraPorMedios(n){
  return overrideIncluye(getOverride(n.dominio)) || SET_GRUPOS.has(n.grupo);
}
function _modoTieneMedios(){
  const ov = PRESET.overrides || {};
  return SET_GRUPOS.size > 0 || Object.keys(ov).some(d => overrideIncluye(ov[d]));
}
function cumplePreset(n){
  const ov = getOverride(n.dominio);
  if (ov === 'ignore') return false;
  if (overrideIncluye(ov)) return true;
  if (SET_GRUPOS.has(n.grupo)) return true;
  return _temasDe(n).some(x => x.id === PRESET.id);
}
