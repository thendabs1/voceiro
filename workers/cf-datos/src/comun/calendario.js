// Generado desde workers/comun/calendario.js por scripts/sync-workers.mjs. No editar.
// API pública sobre la proyección seleccionada. Nunca carga núcleo ni historial.
import { tokenizeQuery } from '../../shared/parser.js';
import { compilarTexto } from '../../shared/busqueda/texto.js';
import { AMBITOS, leerConsultaCalendario, temasDescendientes } from '../../shared/calendario/consulta.js';
import { fechaValida, sumarDiasCalendario } from '../../shared/calendario/fechas.js';
import { crearLimite, claveIp, respuesta429 } from './limite.js';
import { consultarTurso } from './calendario-turso.js';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, If-None-Match', 'Access-Control-Expose-Headers': 'ETag, Retry-After' };
const limitar = crearLimite({ max: 30, ventanaMs: 60000 });
const error = (codigo, mensaje) => Object.assign(new Error(mensaje), { codigo });
const json = (dato, status = 200, headers = {}) => new Response(JSON.stringify(dato), { status,
  headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const lista = s => [...new Set((s || '').split(',').filter(Boolean))].sort();
const escaparLike = s => s.replace(/[\\%_]/g, '\\$&');

// Predicados exactos sobre palabras normalizadas con el módulo común al publicar.
// Se aplican ANTES de LIMIT, incluso las búsquedas que solo excluyen palabras.
export function predicadosTexto(texto, columna, args) {
  const c = compilarTexto(tokenizeQuery(texto));
  const resultado = [];
  for (const [terminos, excluir] of [[c.incluir, false], [c.excluir, true]]) for (const t of terminos) {
    const expresion = t.prefijo ? `${columna} LIKE ? ESCAPE '\\'` : `instr(${columna}, ?) > 0`;
    args.push(t.prefijo ? '% ' + escaparLike(t.partes.join(' ')) + '%' : ' ' + t.partes.join(' ') + ' ');
    resultado.push(excluir ? `NOT (${expresion})` : `(${expresion})`);
  }
  return resultado;
}

export function normalizarConsulta(url) {
  const p = url.searchParams;
  const admitidos = new Set(['desde', 'hasta', 'zona', 'limite', 'cursor', 'q', 'texto', 'temas', 'circuitos',
    'fuente', 'objetivo', 'lugar', 'municipio', 'territorio', 'pendientes', 'resultados', 'revision', 'tipo']);
  for (const [k, v] of p) {
    if (!admitidos.has(k) || p.getAll(k).length !== 1 || v.length > 1024) throw error(400, 'Parámetro inválido: ' + k);
  }
  const zona = p.get('zona') || 'Europe/Madrid';
  if (!['Europe/Madrid', 'Atlantic/Canary', 'UTC'].includes(zona)) throw error(400, 'Zona no preparada');
  const desde = p.get('desde') || '', hasta = p.get('hasta') || '';
  const pendientes = p.get('pendientes') === '1';
  if (pendientes && (desde || hasta)) throw error(400, 'La lista pendiente no admite ventana de fechas');
  if (p.has('pendientes') && !['0', '1'].includes(p.get('pendientes'))
      || p.has('resultados') && !['0', '1'].includes(p.get('resultados'))) throw error(400, 'Indicador inválido');
  const esLista = url.pathname === '/calendario/eventos' || url.pathname === '/calendario/resumen';
  if (esLista && (!pendientes || desde || hasta) && (!fechaValida(desde) || !fechaValida(hasta)
      || hasta <= desde || hasta > sumarDiasCalendario(desde, 42))) throw error(400, 'Ventana requerida de 1 a 42 días [desde,hasta)');
  if (url.pathname === '/calendario/resumen' && pendientes) throw error(400, 'El resumen requiere fechas');
  const limite = p.has('limite') ? Number(p.get('limite')) : 20;
  if (!Number.isInteger(limite) || limite < 1 || limite > 50) throw error(400, 'Límite entre 1 y 50');
  const raw = p.get('q') || '', orden = leerConsultaCalendario(raw) || {};
  if (orden.desconocidos?.length) throw error(400, 'Selección de calendario desconocida');
  if (esLista && orden.tipos?.length && !orden.tipos.some(t => ['calendario', 'resultados'].includes(t))) throw error(400, 'Esta ruta consulta eventos y resultados');
  const resto = orden.resto ?? raw;
  // Las fechas de HTTP tienen fin exclusivo; no interpretar otra ventana en q.
  if (tokenizeQuery(resto).some(t => t.prefix)) throw error(400, 'Usa los parámetros estructurados para fechas y filtros');
  const texto = p.get('texto') || '';
  if (tokenizeQuery(texto).some(t => t.prefix)) throw error(400, 'El filtro texto solo admite texto libre');
  const terminos = [resto, texto].map(t => compilarTexto(tokenizeQuery(t)));
  if (terminos.reduce((n, t) => n + t.incluir.length + t.excluir.length, 0) > 20) throw error(400, 'Máximo 20 términos de búsqueda');
  const c = { zona, desde, hasta, pendientes, limite, orden, resto, texto,
    temas: lista(p.get('temas')), circuitos: lista(p.get('circuitos')),
    objetivos: ['objetivo', 'lugar', 'municipio'].map(k => p.get(k) || '').filter(Boolean),
    fuente: p.get('fuente') || '', territorio: p.get('territorio') || '', tipo: p.get('tipo') || '',
    resultados: p.get('resultados') === '1' || Boolean(orden.tipos?.includes('resultados') && !orden.tipos.includes('calendario')) };
  if ([c.temas, c.circuitos, c.orden.ambitos || [], c.orden.circuitos || []].some(a => a.length > 20)) throw error(400, 'Demasiados filtros');
  if (c.tipo && !['evento', 'actividad', 'agrupacion', 'participante', 'lugar', 'territorio'].includes(c.tipo)) throw error(400, 'Tipo desconocido');
  return c;
}

export function filtrosSql(c, meta, args) {
  const condiciones = [];
  const faceta = (tipo, valores) => {
    if (!valores.length) return;
    args.push(tipo, ...valores);
    condiciones.push(`e.id IN (SELECT evento FROM agenda_lectura_facetas WHERE tipo=? AND valor IN (${valores.map(() => '?').join(',')}))`);
  };
  faceta('tema', [...temasDescendientes(meta.catalogo, c.temas)]);
  for (const cs of [c.circuitos, c.orden.circuitos || []]) faceta('circuito', cs);
  for (const objetivo of c.objetivos) faceta('objetivo', [objetivo]);
  faceta('fuente', c.fuente ? [c.fuente] : []);
  faceta('territorio', c.territorio ? [c.territorio] : []);
  if (c.orden.ambitos?.length) {
    const porAmbito = [];
    for (const ambito of c.orden.ambitos) {
      const a = AMBITOS[ambito], valores = a.codigo ? [a.codigo] : [...temasDescendientes(meta.catalogo, [a.tema])];
      args.push(a.codigo ? 'circuito' : 'tema', ...valores);
      porAmbito.push(`e.id IN (SELECT evento FROM agenda_lectura_facetas WHERE tipo=? AND valor IN (${valores.map(() => '?').join(',')}))`);
    }
    condiciones.push('(' + porAmbito.join(' OR ') + ')');
  }
  if (c.resultados) condiciones.push('e.resultado=1');
  condiciones.push(...predicadosTexto(c.resto, 'e.texto', args), ...predicadosTexto(c.texto, 'e.texto', args));
  return condiciones.length ? ' AND ' + condiciones.join(' AND ') : '';
}

const codificar = v => btoa(JSON.stringify(v)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
function leerCursor(s) {
  if (!s) return null;
  try {
    const v = JSON.parse(atob(s.replaceAll('-', '+').replaceAll('_', '/')));
    if (!Array.isArray(v) || v.length !== 4 || v.some(x => typeof x !== 'string' || x.length > 1024)) throw 0;
    return v;
  } catch { throw error(400, 'Cursor inválido'); }
}
async function firma(c) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(c)));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function consultaEventos(c, meta, cursor) {
  const args = c.pendientes ? [c.zona, '', ''] : [c.desde, c.zona, c.desde, c.hasta];
  const dia = c.pendientes ? 'd.desde' : 'max(d.desde,?)';
  const dias = c.pendientes ? 'd.hasta=? AND d.desde=?' : 'd.hasta>? AND d.desde<?';
  const filtros = filtrosSql(c, meta, args);
  let continuacion = '';
  if (cursor) { continuacion = ' WHERE (dia,id)>(?,?)'; args.push(cursor[2], cursor[3]); }
  args.push(c.limite + 1);
  return { sql: `WITH seleccion AS (
    SELECT e.id, min(${dia}) AS dia FROM agenda_lectura_tramos d
    JOIN agenda_lectura_eventos e ON e.id=d.evento
    WHERE d.zona=? AND ${dias}${filtros} GROUP BY e.id)
    SELECT id,dia,(SELECT tarjeta_json FROM agenda_lectura_eventos WHERE id=seleccion.id) AS tarjeta
    FROM seleccion${continuacion} ORDER BY dia,id LIMIT ?`, args };
}

export function consultaResumen(c, meta) {
  const dias = [];
  for (let dia = c.desde; dia < c.hasta; dia = sumarDiasCalendario(dia, 1)) dias.push(dia);
  const args = [...dias, c.zona];
  const filtros = filtrosSql(c, meta, args);
  return { sql: `WITH dias(dia) AS (VALUES ${dias.map(() => '(?)').join(',')}), seleccion AS (
    SELECT v.dia,e.id,ROW_NUMBER() OVER(PARTITION BY v.dia ORDER BY e.id) AS orden,
      count(*) OVER(PARTITION BY v.dia) AS cantidad
    FROM dias v JOIN agenda_lectura_tramos d ON d.zona=? AND d.hasta>v.dia AND d.desde<=v.dia
    JOIN agenda_lectura_eventos e ON e.id=d.evento WHERE 1=1${filtros})
    SELECT dia,id,cantidad,(SELECT tarjeta_json FROM agenda_lectura_eventos WHERE id=seleccion.id) AS tarjeta
    FROM seleccion WHERE orden<=2 ORDER BY dia,id`, args };
}

// consultar se inyecta en las pruebas; ambos adaptadores usan el mismo transporte.
export async function atenderCalendario(request, env, { ip = '', consultar = consultarTurso,
    abrirCache, guardarCache = tarea => { tarea.catch(() => {}); } } = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/calendario/')) return null;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Método no permitido' }, 405, { Allow: 'GET, HEAD, OPTIONS' });
  try {
    const ruta = url.pathname;
    const detalle = ruta.match(/^\/calendario\/eventos\/([^/]+)$/);
    if (!detalle && !['/calendario/eventos', '/calendario/resumen', '/calendario/catalogo', '/calendario/objetivos'].includes(ruta)) return json({ error: 'Recurso desconocido' }, 404);
    const c = normalizarConsulta(url), cursor = leerCursor(url.searchParams.get('cursor'));
    if (!env.CALENDARIO_TURSO_URL || !env.CALENDARIO_TURSO_TOKEN_LECTURA) throw error(503, 'Lectura de calendario no activada');
    const espera = limitar(claveIp(ip));
    if (espera) return respuesta429(espera, CORS);
    let cache;
    try { cache = await abrirCache?.(); } catch { /* La caché es opcional. */ }
    const guardar = (clave, respuesta) => {
      if (cache) guardarCache(Promise.resolve().then(() => cache.put(clave, respuesta)).catch(() => {}));
    };
    const controlClave = new Request(url.origin + '/__calendario/control/' + await firma(env.CALENDARIO_TURSO_URL));
    let guardado;
    try { guardado = await cache?.match(controlClave); } catch { /* Consultar Turso. */ }
    // Una primera lectura pequeña permite compilar los temas; el segundo batch
    // comprueba la MISMA revisión dentro de su snapshot junto a las filas.
    const control = { sql: 'SELECT datos_json FROM agenda_lectura_control WHERE id=1', args: [] };
    const leerControl = async () => {
      const [[fila]] = await consultar(env, [control]);
      if (!fila) throw error(503, 'Lectura de calendario aún no publicada');
      const valor = JSON.parse(fila.datos_json);
      guardar(controlClave, json(valor, 200, { 'Cache-Control': 'public, max-age=15' }));
      return valor;
    };
    let meta = guardado ? await guardado.json() : await leerControl();
    if (meta.version !== 1) throw error(503, 'Versión de lectura incompatible');
    const huella = await firma({ ruta, ...c });
    const revisionPedida = url.searchParams.get('revision');
    if (guardado && (revisionPedida && revisionPedida !== meta.revision || cursor && cursor[0] !== meta.revision)) meta = await leerControl();
    if (revisionPedida && revisionPedida !== meta.revision || cursor && (cursor[0] !== meta.revision || cursor[1] !== huella)) throw error(409, 'La publicación o la selección cambió; reinicia la consulta');
    if (!c.pendientes && ['/calendario/eventos', '/calendario/resumen'].includes(ruta)
        && (c.desde < meta.desde || c.hasta > meta.hasta)) throw error(422, 'Ventana fuera del horizonte publicado');
    const etag = await firma([meta.revision, huella, url.searchParams.get('cursor') || '']);
    const clave = new Request(url.origin + '/__calendario/respuesta/' + etag);
    const entregar = respuesta => {
      if (request.headers.get('If-None-Match')?.replace(/^W\//, '') === respuesta.headers.get('ETag')) return new Response(null, { status: 304, headers: respuesta.headers });
      return request.method === 'HEAD' ? new Response(null, { status: respuesta.status, headers: respuesta.headers }) : respuesta;
    };
    let acierto;
    try { acierto = await cache?.match(clave); } catch { /* Consultar Turso. */ }
    if (acierto) return entregar(acierto);
    let sentencia;
    if (detalle) sentencia = { sql: 'SELECT detalle_json FROM agenda_lectura_eventos WHERE id=?', args: [decodeURIComponent(detalle[1])] };
    else if (ruta === '/calendario/eventos') sentencia = consultaEventos(c, meta, cursor);
    else if (ruta === '/calendario/resumen') sentencia = consultaResumen(c, meta);
    else if (ruta === '/calendario/objetivos') {
      const args = [], condiciones = ['1=1', ...predicadosTexto(c.texto || c.resto, 'texto', args)];
      if (c.tipo) { condiciones.push('tipo=?'); args.push(c.tipo); }
      if (cursor) { condiciones.push('id>?'); args.push(cursor[3]); }
      args.push(c.limite + 1);
      sentencia = { sql: 'SELECT id,datos_json FROM agenda_lectura_entidades WHERE ' + condiciones.join(' AND ') + ' ORDER BY id LIMIT ?', args };
    }
    let filas = [];
    if (sentencia) {
      const [actual, respuesta] = await consultar(env, [control, sentencia]);
      if (!actual[0] || JSON.parse(actual[0].datos_json).revision !== meta.revision) {
        try { await cache?.delete(controlClave); } catch { /* Expira en 15 segundos. */ }
        throw error(409, 'La publicación cambió; reinicia la consulta');
      }
      filas = respuesta;
    }
    const base = { version: 1, revision: meta.revision, generado: meta.generado,
      horizonte: { desde: meta.desde, hasta: meta.hasta }, cobertura: meta.cobertura,
      colecciones: meta.colecciones || [] };
    let salida;
    if (detalle) {
      if (!filas.length) throw error(404, 'Evento desconocido');
      salida = { ...base, ...JSON.parse(filas[0].detalle_json) };
    } else if (ruta === '/calendario/catalogo') salida = { ...base, catalogo: meta.catalogo,
      fuentes: meta.fuentes, territorios_catalogo: meta.territorios_catalogo, zonas: meta.zonas };
    else if (ruta === '/calendario/resumen') {
      const porDia = new Map();
      for (let dia = c.desde; dia < c.hasta; dia = sumarDiasCalendario(dia, 1)) porDia.set(dia, { dia, cantidad: 0, muestras: [] });
      for (const f of filas) { const d = porDia.get(f.dia); d.cantidad = f.cantidad; d.muestras.push(JSON.parse(f.tarjeta)); }
      salida = { ...base, dias: [...porDia.values()] };
    } else {
      const hayMas = filas.length > c.limite, pagina = filas.slice(0, c.limite), ultima = pagina.at(-1);
      // dia: primer día visible en la ventana pedida ('' en la lista pendiente),
      // para agrupar en el cliente con la misma regla que la consulta.
      salida = { ...base, [ruta.endsWith('/objetivos') ? 'entidades' : 'eventos']:
        pagina.map(f => f.tarjeta ? { ...JSON.parse(f.tarjeta), dia: f.dia } : JSON.parse(f.datos_json)),
        siguiente: hayMas ? codificar([meta.revision, huella, ultima.dia || '', ultima.id]) : null };
    }
    const respuesta = json(salida, 200, { 'Cache-Control': 'public, max-age=30', ETag: '"' + etag + '"' });
    guardar(clave, respuesta.clone());
    return entregar(respuesta);
  } catch (e) {
    return json({ error: e.codigo ? e.message : 'No se pudo consultar el calendario' }, e.codigo || 503);
  }
}
