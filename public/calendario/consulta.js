// Selección estructurada compartida por el feed, la agenda y sus tres vistas.
import { tokenizeQuery, normalize } from '../parser.js?v=4c0fbd6fe5';
import { compilarTexto, coincide, palabrasDe, textoVacio } from '../busqueda/texto.js?v=4c0fbd6fe5';

// Prefijos del buscador. Todos seleccionan agenda; solo las competiciones, cuyo
// nombre propio no es ambiguo, suman noticias por su titular (las noticias no se
// clasifican). El texto sin prefijo no pasa por la agenda.
export const AMBITOS = {
  tenis: { tema: 'tenis' },
  baloncesto: { tema: 'baloncesto' },
  automovilismo: { tema: 'automovilismo' },
  atletismo: { tema: 'atletismo' },
  deportes: { tema: 'deportes' },
  cultura: { tema: 'cultura' },
  teatro: { tema: 'teatro' },
  musica: { tema: 'musica' },
  cine: { tema: 'cine' },
  danza: { tema: 'danza' },
  literatura: { tema: 'literatura' },
  patrimonio: { tema: 'patrimonio' },
  'artes-visuales': { tema: 'artes-visuales' },
  circo: { tema: 'circo' },
  magia: { tema: 'magia' },
  'cultura-popular': { tema: 'cultura-popular' },
  'medio-ambiente': { tema: 'medio-ambiente' },
  gastronomia: { tema: 'gastronomia' },
  tecnologia: { tema: 'tecnologia' },
  atp: { codigo: 'atp', noticias: ['ATP'] },
  wta: { codigo: 'wta', noticias: ['WTA'] },
  f1: { codigo: 'f1', noticias: ['F1', 'Fórmula 1'] },
  motogp: { codigo: 'motogp', noticias: ['MotoGP'] },
  wrc: { codigo: 'wrc', noticias: ['WRC', 'Mundial de Rallies'] },
  // «LaLiga Hypermotion» es Segunda: no cuenta como Primera aunque empiece por LaLiga.
  primera: { codigo: 'primera', noticias: ['LaLiga', 'Primera División'], noticiasNo: ['LaLiga Hypermotion'] },
  segunda: { codigo: 'segunda', noticias: ['Segunda División', 'LaLiga Hypermotion'] },
  nba: { codigo: 'nba', noticias: ['NBA'] },
  wnba: { codigo: 'wnba', noticias: ['WNBA'] },
  'feb-endesa': { codigo: 'feb-endesa', noticias: ['Liga Femenina Endesa'] },
  'feb-primera': { codigo: 'feb-primera', noticias: ['Primera FEB'] },
  'feb-challenge': { codigo: 'feb-challenge', noticias: ['Liga Femenina Challenge'] },
};
// Resultados y clasificaciones son consultas puntuales, no parte del calendario.
const TIPOS = { agenda: 'calendario', calendario: 'calendario', eventos: 'calendario', noticias: 'noticias' };
const lista = s => normalize(s).split(',').map(v => v.trim()).filter(Boolean);

export function leerConsultaCalendario(raw){
  const ambitos = new Set(), tipos = new Set(), circuitos = new Set(), desconocidos = [], resto = [];
  let activa = false;
  for (const tk of tokenizeQuery(raw)){
    const p = normalize(tk.prefix), v = normalize(tk.text);
    if (Object.hasOwn(AMBITOS, p)){
      activa = true; ambitos.add(p);
      if (v){
        if (Object.hasOwn(TIPOS, v)) tipos.add(TIPOS[v]);
        else desconocidos.push(tk.raw);
      }
    } else if (Object.hasOwn(TIPOS, p) || p === 'deporte' || p === 'circuito'){
      activa = true;
      if (Object.hasOwn(TIPOS, p)) tipos.add(TIPOS[p]);
      for (const a of lista(tk.text)){
        if (!Object.hasOwn(AMBITOS, a) || (p === 'circuito' && !AMBITOS[a].codigo)) desconocidos.push(a);
        else (p === 'circuito' ? circuitos : ambitos).add(a);
      }
    } else resto.push(tk.raw);
  }
  // Noticias solo si cada prefijo las admite: un titular no cumple media consulta.
  const conNoticias = [...ambitos, ...circuitos].every(a => AMBITOS[a].noticias);
  if (tipos.has('noticias') && !conNoticias) desconocidos.push(raw);
  return activa ? { ambitos: [...ambitos], circuitos: [...circuitos], tipos: [...tipos],
    desconocidos, resto: resto.join(' '), noticias: (!tipos.size || tipos.has('noticias')) && conNoticias } : null;
}

export function temasDescendientes(catalogo, seleccion){
  const temas = new Set(seleccion);
  let prev;
  do {
    prev = temas.size;
    for (const [i, t] of Object.entries(catalogo.conceptos)) if (t.padres.some(p => temas.has(p))) temas.add(i);
  } while (temas.size !== prev);
  return temas;
}

// Disponibilidad de un sitio a partir de filas { tipo, valor, n }: «temas» con
// valor = JSON de los temas de un evento (una fila por combinación) y
// «circuito» con su código. La comparten la consulta en vivo y la precalculada.
export function sumarDisponibilidad(catalogo, filas){
  const d = { temas: {}, raices: {}, sin_subcategoria: {}, circuitos: {} };
  const raices = Object.keys(catalogo?.conceptos || {}).filter(k => !catalogo.conceptos[k].padres?.length)
    .map(k => [k, temasDescendientes(catalogo, [k])]);
  const sumar = (o, k, n) => { o[k] = (o[k] || 0) + n; };
  for (const f of filas) {
    if (f.tipo === 'circuito'){ sumar(d.circuitos, f.valor, f.n); continue; }
    const temas = new Set(JSON.parse(f.valor));
    for (const tema of temas) sumar(d.temas, tema, f.n);
    for (const [raiz, rama] of raices) {
      if ([...temas].some(t => rama.has(t))) sumar(d.raices, raiz, f.n);
      if (temas.has(raiz) && ![...temas].some(t => t !== raiz && rama.has(t))) sumar(d.sin_subcategoria, raiz, f.n);
    }
  }
  return d;
}

export function seleccionCalendario(datos, orden = {}, filtros = {}){
  const temas = temasDescendientes(datos.catalogo, filtros.temas || []);
  const texto = compilarTexto(tokenizeQuery(orden.resto || '').filter(t => !t.prefix));
  const busqueda = compilarTexto(tokenizeQuery(filtros.texto || ''));
  const buscarTexto = !textoVacio(texto) || !textoVacio(busqueda);
  const porAmbito = new Map((orden.ambitos || []).map(a => [a,
    AMBITOS[a] && temasDescendientes(datos.catalogo, [AMBITOS[a].tema])]));
  const casaAmbito = (objetivos, a) => {
    const s = AMBITOS[a];
    return s && objetivos.some(e => s.codigo ? e.codigos.includes(s.codigo)
      : e.temas.some(t => porAmbito.get(a).has(t)));
  };
  const casa = (dato, esTabla = false) => {
    if (orden.desconocidos?.length) return false;
    const objetivos = (dato.objetivos || []).map(k => datos.entidades[k]).filter(Boolean);
    if (orden.ambitos?.length && !orden.ambitos.some(a => casaAmbito(objetivos, a))) return false;
    for (const circuitos of [orden.circuitos || [], filtros.circuitos || []]){
      if (circuitos.length && !objetivos.some(e => circuitos.some(c => e.codigos.includes(c)))) return false;
    }
    if (temas.size && !objetivos.some(e => e.temas.some(t => temas.has(t)))) return false;
    if (filtros.objetivo && !dato.objetivos.includes(filtros.objetivo)) return false;
    if (filtros.lugar && !dato.objetivos.includes(filtros.lugar)) return false;
    if (filtros.municipio && !dato.objetivos.includes(filtros.municipio)) return false;
    const fuente = esTabla ? dato.seleccion?.procedencia?.fuente : dato.fuentes.map(f => f.fuente);
    if (filtros.fuente && !(Array.isArray(fuente) ? fuente.includes(filtros.fuente) : fuente === filtros.fuente)) return false;
    if (!buscarTexto) return true;
    const nombres = objetivos.flatMap(e => Object.values(e.nombres)).join(' ');
    const palabras = palabrasDe(nombres);
    return coincide(palabras, texto) && coincide(palabras, busqueda);
  };
  return { eventos: datos.eventos.filter(e => casa(e)), clasificaciones: datos.clasificaciones.filter(e => casa(e, true)) };
}

// Hasta que exista clasificación de artículos, las noticias se seleccionan
// por texto del titular. Eso no crea enlaces con encuentros o participantes.
export function noticiaEnAmbitos(titular, orden){
  if (!orden) return true;
  if (!orden.noticias || orden.desconocidos.length) return false;
  // Palabras completas: «F15» no es F1 ni «NBATV» la NBA.
  const palabras = normalize(titular).match(/[\p{L}\p{N}]+/gu) || [];
  const en = (frase, i) => normalize(frase).split(' ').every((p, j) => palabras[i + j] === p);
  const casa = a => palabras.some((_, i) => AMBITOS[a].noticias.some(n => en(n, i)) && !(AMBITOS[a].noticiasNo || []).some(n => en(n, i)));
  return (!orden.ambitos.length || orden.ambitos.some(casa))
    && (!orden.circuitos.length || orden.circuitos.some(casa));
}
