// Selección estructurada compartida por el feed, la agenda y sus tres vistas.
import { tokenizeQuery, normalize } from '../parser.js?v=4c28597024';
import { compilarTexto, coincide, palabrasDe } from '../busqueda/texto.js?v=4c28597024';

export const AMBITOS = {
  tenis: { tema: 'tenis', noticias: ['tenis', 'ATP', 'WTA'] },
  baloncesto: { tema: 'baloncesto', noticias: ['baloncesto', 'FEB', 'NBA', 'WNBA'] },
  automovilismo: { tema: 'automovilismo', noticias: ['automovilismo', 'F1', 'Fórmula 1'] },
  deportes: { tema: 'deportes', noticias: ['deporte', 'tenis', 'baloncesto', 'F1'] },
  cultura: { tema: 'cultura', noticias: ['cultura', 'teatro', 'música', 'cine'] },
  teatro: { tema: 'teatro', noticias: ['teatro'] },
  musica: { tema: 'musica', noticias: ['música'] },
  cine: { tema: 'cine', noticias: ['cine'] },
  danza: { tema: 'danza', noticias: ['danza'] },
  exposiciones: { tema: 'exposiciones', noticias: ['exposición'] },
  literatura: { tema: 'literatura', noticias: ['literatura'] },
  patrimonio: { tema: 'patrimonio', noticias: ['patrimonio'] },
  atp: { codigo: 'atp', noticias: ['ATP'] },
  wta: { codigo: 'wta', noticias: ['WTA'] },
  f1: { codigo: 'f1', noticias: ['F1', 'Fórmula 1'] },
};
const TIPOS = { agenda: 'calendario', calendario: 'calendario', eventos: 'calendario',
  resultado: 'resultados', resultados: 'resultados',
  clasificacion: 'clasificaciones', clasificaciones: 'clasificaciones', noticias: 'noticias' };
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
  return activa ? { ambitos: [...ambitos], circuitos: [...circuitos], tipos: [...tipos],
    desconocidos, resto: resto.join(' '), noticias: !tipos.size || tipos.has('noticias') } : null;
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

export function seleccionCalendario(datos, orden = {}, filtros = {}){
  const temas = temasDescendientes(datos.catalogo, filtros.temas || []);
  const texto = compilarTexto(tokenizeQuery(orden.resto || '').filter(t => !t.prefix));
  const casaAmbito = (objetivos, a) => {
    const s = AMBITOS[a];
    return s && objetivos.some(e => s.codigo ? e.codigos.includes(s.codigo)
      : e.temas.some(t => temasDescendientes(datos.catalogo, [s.tema]).has(t)));
  };
  const casa = (dato, esTabla = false) => {
    if (orden.desconocidos?.length) return false;
    const objetivos = (dato.objetivos || []).map(k => datos.entidades[k]).filter(Boolean);
    if (orden.ambitos?.length && !orden.ambitos.some(a => casaAmbito(objetivos, a))) return false;
    const circuitos = filtros.circuitos?.length ? filtros.circuitos : orden.circuitos || [];
    if (circuitos.length && !circuitos.some(a => casaAmbito(objetivos, a))) return false;
    if (temas.size && !objetivos.some(e => e.temas.some(t => temas.has(t)))) return false;
    if (filtros.objetivo && !dato.objetivos.includes(filtros.objetivo)) return false;
    const fuente = esTabla ? dato.seleccion?.procedencia?.fuente : dato.fuentes.map(f => f.fuente);
    if (filtros.fuente && !(Array.isArray(fuente) ? fuente.includes(filtros.fuente) : fuente === filtros.fuente)) return false;
    const nombres = objetivos.flatMap(e => Object.values(e.nombres)).join(' ');
    return coincide(palabrasDe(nombres), texto);
  };
  return { eventos: datos.eventos.filter(e => casa(e)), clasificaciones: datos.clasificaciones.filter(e => casa(e, true)) };
}

// Hasta que exista clasificación de artículos, las noticias se seleccionan
// por texto del titular. Eso no crea enlaces con encuentros o participantes.
export function noticiaEnAmbitos(titular, orden){
  if (!orden) return true;
  if (!orden.noticias || orden.desconocidos.length) return false;
  const palabras = normalize(titular).match(/[\p{L}\p{N}]+/gu) || [];
  const casa = a => AMBITOS[a].noticias.some(n => {
    const partes = normalize(n).split(' ');
    return palabras.some((_, i) => partes.every((p, j) => palabras[i + j]?.startsWith(p)));
  });
  return (!orden.ambitos.length || orden.ambitos.some(casa))
    && (!orden.circuitos.length || orden.circuitos.some(casa));
}
