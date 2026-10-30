// Generado desde workers/comun/calendario.js por scripts/sync-workers.mjs. No editar.
// API pública sobre la proyección seleccionada. Nunca carga núcleo ni historial.
import { tokenizeQuery } from '../../shared/parser.js';
import { compilarTexto } from '../../shared/busqueda/texto.js';
import { AMBITOS, leerConsultaCalendario, temasDescendientes, sumarDisponibilidad } from '../../shared/calendario/consulta.js';
import { fechaValida, sumarDiasCalendario, diaEnZona } from '../../shared/calendario/fechas.js';
import { crearLimite, claveIp, respuesta429 } from './limite.js';
import { consultarTurso } from './calendario-turso.js';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, If-None-Match', 'Access-Control-Expose-Headers': 'ETag, Retry-After' };
const limitar = crearLimite({ max: 30, ventanaMs: 60000 });
const error = (codigo, mensaje) => Object.assign(new Error(mensaje), { codigo });
const json = (dato, status = 200, headers = {}) => new Response(JSON.stringify(dato), { status,
  headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const PRESENTACIONES = ['cita', 'programa', 'prolongada'];
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
    'fuente', 'objetivo', 'lugar', 'municipio', 'territorio', 'etiqueta', 'formatos', 'precio', 'presentacion', 'muestras',
    'pendientes', 'resultados', 'revision', 'tipo', 'disponibilidad', 'barras', 'chips']);
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
  if (p.get('chips') === '1' && pendientes) throw error(400, 'Los chips requieren fechas');
  const limite = p.has('limite') ? Number(p.get('limite')) : 20;
  if (!Number.isInteger(limite) || limite < 1 || limite > 50) throw error(400, 'Límite entre 1 y 50');
  const muestras = p.has('muestras') ? Number(p.get('muestras')) : 2;
  if (!Number.isInteger(muestras) || muestras < 0 || muestras > 5) throw error(400, 'Muestras entre 0 y 5');
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
  const c = { zona, desde, hasta, pendientes, limite, muestras, orden, resto, texto,
    temas: lista(p.get('temas')), circuitos: lista(p.get('circuitos')),
    objetivos: ['objetivo', 'lugar', 'municipio'].map(k => p.get(k) || '').filter(Boolean),
    fuente: p.get('fuente') || '', territorio: p.get('territorio') || '', etiqueta: p.get('etiqueta') || '',
    formatos: lista(p.get('formatos')), precio: p.get('precio') || '', presentaciones: lista(p.get('presentacion')),
    tipos: lista(p.get('tipo')), disponibilidad: p.get('disponibilidad') === '1', barras: p.get('barras') === '1', chips: p.get('chips') === '1',
    resultados: p.get('resultados') === '1' || Boolean(orden.tipos?.includes('resultados') && !orden.tipos.includes('calendario')) };
  if ([c.temas, c.circuitos, c.formatos, c.orden.ambitos || [], c.orden.circuitos || []].some(a => a.length > 20)) throw error(400, 'Demasiados filtros');
  // «gratis» no incluye «mixto»: el filtro no promete lo que solo vale para una tarifa.
  if (c.precio && !['gratis', 'pago', 'mixto'].includes(c.precio)) throw error(400, 'Precio desconocido');
  if (c.presentaciones.some(v => !PRESENTACIONES.includes(v))) throw error(400, 'Presentación desconocida');
  if (c.tipos.some(t => !['evento', 'actividad', 'agrupacion', 'participante', 'lugar', 'territorio'].includes(t))) throw error(400, 'Tipo desconocido');
  return c;
}

// Presentación de la tarjeta en la zona pedida; una sola cadena si coincide en todas.
function presentacionSql(zona, args) {
  args.push(`$.presentacion."${zona}"`);
  return "coalesce(json_extract(e.tarjeta_json,?),json_extract(e.tarjeta_json,'$.presentacion'))";
}

export function filtrosSql(c, meta, args) {
  const condiciones = [];
  const faceta = (tipo, valores) => {
    if (!valores.length) return;
    args.push(tipo, ...valores);
    condiciones.push(`e.id IN (SELECT evento FROM agenda_lectura_facetas WHERE tipo=? AND valor IN (${valores.map(() => '?').join(',')}))`);
  };
  // Temas; «otra:<raíz>» es lo de esa raíz sin ninguna subcategoría (p. ej. la
  // cultura sin más clase). Se combinan con OR.
  const otras = c.temas.filter(t => t.startsWith('otra:')).map(t => t.slice(5));
  const normales = c.temas.filter(t => !t.startsWith('otra:'));
  if (otras.length) {
    const ramas = [];
    if (normales.length) {
      const valores = [...temasDescendientes(meta.catalogo, normales)];
      args.push(...valores);
      ramas.push(`e.id IN (SELECT evento FROM agenda_lectura_facetas WHERE tipo='tema' AND valor IN (${valores.map(() => '?').join(',')}))`);
    }
    for (const raiz of otras) {
      const hijos = [...temasDescendientes(meta.catalogo, [raiz])].filter(t => t !== raiz);
      args.push(raiz, ...hijos);
      ramas.push(`(e.id IN (SELECT evento FROM agenda_lectura_facetas WHERE tipo='tema' AND valor=?)`
        + (hijos.length ? ` AND e.id NOT IN (SELECT evento FROM agenda_lectura_facetas WHERE tipo='tema' AND valor IN (${hijos.map(() => '?').join(',')})))` : ')'));
    }
    condiciones.push('(' + ramas.join(' OR ') + ')');
  } else faceta('tema', [...temasDescendientes(meta.catalogo, normales)]);
  for (const cs of [c.circuitos, c.orden.circuitos || []]) faceta('circuito', cs);
  for (const objetivo of c.objetivos) faceta('objetivo', [objetivo]);
  faceta('fuente', c.fuente ? [c.fuente] : []);
  faceta('territorio', c.territorio ? [c.territorio] : []);
  faceta('etiqueta', c.etiqueta ? [c.etiqueta] : []);
  faceta('formato', c.formatos);
  faceta('precio', c.precio ? [c.precio] : []);
  if (c.orden.ambitos?.length) {
    const porAmbito = [];
    for (const ambito of c.orden.ambitos) {
      const a = AMBITOS[ambito], valores = a.codigo ? [a.codigo] : [...temasDescendientes(meta.catalogo, [a.tema])];
      args.push(a.codigo ? 'circuito' : 'tema', ...valores);
      porAmbito.push(`e.id IN (SELECT evento FROM agenda_lectura_facetas WHERE tipo=? AND valor IN (${valores.map(() => '?').join(',')}))`);
    }
    condiciones.push('(' + porAmbito.join(' OR ') + ')');
  }
  if (c.presentaciones.length) {
    const expresion = presentacionSql(c.zona, args);
    args.push(...c.presentaciones);
    condiciones.push(`${expresion} IN (${c.presentaciones.map(() => '?').join(',')})`);
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
    // El orden es un julianday en decimal: sin exponentes ni signo, que Turso rechazaría.
    // Seis piezas en la lista de chips: la última es la ocurrencia.
    if (!Array.isArray(v) || ![5, 6].includes(v.length) || v.some(x => typeof x !== 'string' || x.length > 1024)
      || !/^\d{1,9}(\.\d+)?$/.test(v[3])) throw 0;
    return v;
  } catch { throw error(400, 'Cursor inválido'); }
}
async function firma(c) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(c)));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
}

// Fin máximo de los tramos que solapan la ventana. Una lectura anterior a los
// tramos partidos no lo anota: entonces no se acota.
const topeVentana = (c, meta) => (meta.tramo_max_dias ? sumarDiasCalendario(c.hasta, meta.tramo_max_dias) : '9999-12-31');

// zona '*': tramos iguales en todas las zonas (citas con solo fecha), una sola fila.
export function consultaEventos(c, meta, cursor) {
  // Ningún tramo pasa de tramo_max_dias: los que solapan la ventana terminan
  // antes de su fin más ese margen, y el índice solo recorre esa franja.
  const args = c.pendientes ? [c.zona, '', ''] : [c.desde, c.zona, c.desde, topeVentana(c, meta), c.hasta];
  const dia = c.pendientes ? 'd.desde' : 'max(d.desde,?)';
  const dias = c.pendientes ? 'd.hasta=? AND d.desde=?' : 'd.hasta>? AND d.hasta<=? AND d.desde<?';
  const filtros = filtrosSql(c, meta, args);
  const presentacion = presentacionSql(c.zona, args);
  let continuacion = '';
  if (cursor) { continuacion = ' WHERE (dia,orden,id)>(?,?,?)'; args.push(cursor[2], Number(cursor[3]), cursor[4]); }
  args.push(c.limite + 1);
  // Dentro del día, por instante de inicio (absoluto, válido en cualquier zona):
  // primero las citas con hora; al final las que no la tienen y los programas,
  // cuyo inicio puede ser de otro día. 9999999 cabe en el cursor decimal.
  return { sql: `WITH seleccion AS (
    SELECT e.id, min(${dia}) AS dia FROM agenda_lectura_tramos d
    JOIN agenda_lectura_eventos e ON e.id=d.evento
    WHERE d.zona IN (?,'*') AND ${dias}${filtros} GROUP BY e.id),
    ordenada AS (SELECT s.id, s.dia, e.tarjeta_json AS tarjeta,
      CASE WHEN ${presentacion} IS 'programa' THEN 9999999
        ELSE coalesce(julianday(json_extract(e.tarjeta_json,'$.programacion.valor.cuando.inicio.instante')),9999999) END AS orden
      FROM seleccion s JOIN agenda_lectura_eventos e ON e.id=s.id)
    SELECT id,dia,orden,tarjeta FROM ordenada${continuacion} ORDER BY dia,orden,id LIMIT ?`, args };
}

// La marca aparece al publicar los tramos activos (sin cancelados), el estado
// de cada sesión y el orden por instante. Hasta republicar, la lectura anterior
// se sirve como antes: los cancelados cuentan y el orden es el minuto del día.
const lecturaActual = meta => meta.proyeccion_calendario === 2;
// Estado de la ocurrencia; la cancelación del evento entero vale para todas.
function expresionesChip(meta) {
  const principal = "json_extract(e.tarjeta_json,'$.programacion.valor.programacion')";
  const estado = lecturaActual(meta) ? `CASE WHEN ${principal} IN ('cancelado','aplazado') THEN ${principal}
    ELSE coalesce(json_extract(x.sesion_json,'$.estado'),${principal}) END` : principal;
  return { estado, orden: 'x.orden' };
}

function filasChips(c, meta, cursor, soloActivos = false) {
  const args = [], { estado, orden } = expresionesChip(meta);
  if (cursor && cursor.length !== 6) throw error(400, 'Cursor inválido');
  // Dos recorridos ordenados permiten mezclar zona concreta y '*' sin ordenar
  // todos los chips. ORDER BY usa columnas de salida, también en libSQL.
  const partes = [c.zona, '*'].map(zona => {
    args.push(zona, c.desde, c.hasta);
    const filtros = filtrosSql(c, meta, args);
    let continuacion = '';
    if (cursor) {
      continuacion = ` AND (x.dia,${orden},x.evento,x.ocurrencia)>(?,?,?,?)`;
      args.push(cursor[2], Number(cursor[3]), cursor[4], cursor[5]);
    }
    return `SELECT x.dia AS dia, ${orden} AS orden, x.evento AS id, x.ocurrencia AS ocurrencia,
      x.hora AS hora, x.sesion_json AS sesion, e.tarjeta_json AS tarjeta, ${estado} AS estado
      FROM agenda_lectura_chips x ${lecturaActual(meta) ? 'INDEXED BY agenda_lectura_chips_orden' : ''}
      JOIN agenda_lectura_eventos e ON e.id=x.evento
      WHERE x.zona=? AND x.dia>=? AND x.dia<?${filtros}${continuacion}
      ${soloActivos && lecturaActual(meta) ? `AND coalesce(${estado},'') NOT IN ('cancelado','aplazado')` : ''}`;
  });
  return { sql: partes.join(' UNION ALL ') + ' ORDER BY 1,2,3,4', args };
}

export function consultaChips(c, meta, cursor) {
  const s = filasChips(c, meta, cursor);
  return { sql: s.sql + ' LIMIT ?', args: [...s.args, c.limite + 1] };
}

// estado es el de la ocurrencia; la cancelación del principal afecta a todas.
function comoChip(t, f) {
  const sesion = f.sesion && JSON.parse(f.sesion), nombres = sesion?.nombres || sesion;
  return { ...t, presentacion: 'cita', hora_muestra: f.hora, ocurrencia: f.ocurrencia,
    estado: f.estado || null, ...(nombres ? { nombres, padre: t.nombres } : {}) };
}

// Una sola selección temporal de eventos. Las facetas se buscan por evento;
// ni las raíces ni «otra» vuelven a recorrer las facetas históricas.
export function consultaDisponibilidad(c, meta) {
  const hoy = diaEnZona(new Date(Date.now()), c.zona);
  const desde = hoy > meta.desde ? hoy : meta.desde;
  const args = [c.zona, desde, topeVentana({ hasta: meta.hasta }, meta), meta.hasta, ...(c.territorio ? [c.territorio] : [])];
  // Una fila por combinación de temas (cientos, no un evento por fila: la
  // respuesta se acota a 2 MB); las raíces se suman después con el catálogo.
  // Las competiciones cuentan en toda la agenda, aunque se elija un sitio.
  return { sql: `WITH vigentes AS MATERIALIZED (SELECT DISTINCT d.evento FROM agenda_lectura_${lecturaActual(meta) ? 'activos' : 'tramos'} d
      WHERE d.zona IN (?,'*') AND d.hasta>? AND d.hasta<=? AND d.desde<?),
    locales AS (SELECT v.evento FROM vigentes v${c.territorio ? ` WHERE EXISTS (SELECT 1 FROM agenda_lectura_facetas t
      WHERE t.evento=v.evento AND t.tipo='territorio' AND t.valor=?)` : ''}),
    por_evento AS (SELECT evento, json_group_array(valor) AS temas FROM (SELECT f.evento, f.valor FROM agenda_lectura_facetas f
      JOIN locales l ON l.evento=f.evento WHERE f.tipo='tema' ORDER BY f.evento, f.valor) GROUP BY evento)
    SELECT 'temas' AS tipo, temas AS valor, count(*) AS n FROM por_evento GROUP BY temas
    UNION ALL SELECT 'circuito', f.valor, count(*) FROM agenda_lectura_facetas f JOIN vigentes v ON v.evento=f.evento
      WHERE f.tipo='circuito' GROUP BY f.valor`, args };
}

// Precalculada al publicar (lectura_disponibilidad): una fila por territorio y
// '' para toda la agenda, que lleva también las competiciones. Las cuentas son
// del día de la publicación y de la hora peninsular; otra zona usa la de arriba.
const disponibilidadPrecalculada = (c, meta) => Boolean(meta.lectura_disponibilidad) && c.zona === 'Europe/Madrid';
export function consultaDisponibilidadPrecalculada(c) {
  return { sql: `SELECT territorio, datos_json FROM agenda_lectura_disponibilidad WHERE territorio IN ('',?)`,
    args: [c.territorio || ''] };
}

// Barras visibles: unir solo tramos contiguos, incluidos los partidos por mes.
export const BARRAS_MAX = 60;
export function consultaBarras(c, meta) {
  const args = [];
  const presentacion = presentacionSql(c.zona, args);
  args.push(c.zona, c.desde, topeVentana(c, meta), c.hasta);
  const filtros = filtrosSql(c, meta, args);
  args.push(BARRAS_MAX + 1);
  return { sql: `WITH seleccion AS (SELECT d.evento AS id, d.desde, d.hasta, e.tarjeta_json AS tarjeta
      FROM agenda_lectura_tramos d JOIN agenda_lectura_eventos e ON e.id=d.evento
      WHERE ${presentacion} IN ('prolongada','programa') AND json_extract(e.tarjeta_json,'$.competiciones') IS NOT NULL
        AND d.zona IN (?,'*') AND d.hasta>? AND d.hasta<=? AND d.desde<?${filtros}),
    limites AS (SELECT *, CASE WHEN lag(hasta) OVER(PARTITION BY id ORDER BY desde)=desde THEN 0 ELSE 1 END AS nuevo FROM seleccion),
    grupos AS (SELECT *, sum(nuevo) OVER(PARTITION BY id ORDER BY desde) AS grupo FROM limites)
    SELECT id, min(desde) AS desde, max(hasta) AS hasta, tarjeta FROM grupos
    GROUP BY id,grupo ORDER BY 2,3,1 LIMIT ?`, args };
}

export function consultaResumen(c, meta) {
  const args = [c.desde];
  const presentacion = presentacionSql(c.zona, args);
  args.push(c.zona, c.desde, topeVentana(c, meta), c.hasta);
  const filtros = filtrosSql(c, meta, args);
  let muestras = '';
  if (c.muestras && meta.lectura_chips) {
    const chips = filasChips(c, meta, null, true);
    args.push(...chips.args);
    muestras = `, muestras AS (SELECT dia, id, ocurrencia, hora, sesion, tarjeta, estado,
      ROW_NUMBER() OVER(PARTITION BY dia ORDER BY orden,id,ocurrencia) AS orden,
      COUNT(*) OVER(PARTITION BY dia ORDER BY orden,id,ocurrencia ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS total
      FROM (${chips.sql}))`;
  } else if (c.muestras) {
    muestras = `, muestras AS (SELECT desde AS dia, id, NULL AS ocurrencia, NULL AS hora, NULL AS sesion, tarjeta, estado,
      ROW_NUMBER() OVER(PARTITION BY desde ORDER BY presentacion IS 'programa' OR hora IS NULL, hora, id) AS orden, NULL AS total
      FROM ventana WHERE presentacion IS NOT 'prolongada'${lecturaActual(meta) ? " AND coalesce(estado,'') NOT IN ('cancelado','aplazado')" : ''})`;
  }
  // Turso cuenta también las filas de las tablas temporales: nada de cruzar cada
  // día con la ventana. Cada tramo suma +1 el primer día que cubre y -1 al
  // terminar, y las cuentas por día salen de acumular esos cambios.
  args.push(c.hasta);
  const cuentas = `SELECT dia, presentacion, sum(n) AS n, NULL AS tarjeta, 0 AS muestra, categoria, competiciones,
      NULL AS ocurrencia, NULL AS hora, NULL AS sesion, NULL AS total, NULL AS estado FROM (
      SELECT desde AS dia, presentacion, categoria, competiciones, 1 AS n FROM ventana
      UNION ALL SELECT hasta, presentacion, categoria, competiciones, -1 FROM ventana WHERE hasta<?)
      GROUP BY dia, presentacion, categoria, competiciones`;
  if (muestras) args.push(c.muestras);
  return { sql: `WITH ventana AS MATERIALIZED (SELECT d.evento AS id, max(d.desde,?) AS desde, d.hasta,
      ${presentacion} AS presentacion, e.tarjeta_json AS tarjeta,
      julianday(json_extract(e.tarjeta_json,'$.programacion.valor.cuando.inicio.instante')) AS hora,
      json_extract(e.tarjeta_json,'$.programacion.valor.programacion') AS estado,
      json_extract(e.tarjeta_json,'$.categoria') AS categoria,
      json_extract(e.tarjeta_json,'$.competiciones') AS competiciones
      FROM agenda_lectura_${lecturaActual(meta) ? 'activos' : 'tramos'} d JOIN agenda_lectura_eventos e ON e.id=d.evento
      WHERE d.zona IN (?,'*') AND d.hasta>? AND d.hasta<=? AND d.desde<?${filtros})${muestras}
    ${cuentas}
    ${muestras ? `UNION ALL SELECT dia, NULL, orden, tarjeta, 1, NULL, NULL, ocurrencia, hora, sesion, total, estado
      FROM muestras WHERE orden<=?` : ''}
    ORDER BY 1,5,3`, args };
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
    let id;
    try { id = detalle && decodeURIComponent(detalle[1]); } catch { throw error(400, 'Identificador inválido'); }
    if (!env.CALENDARIO_TURSO_URL || !env.CALENDARIO_TURSO_TOKEN_LECTURA) throw error(503, 'Lectura de calendario no activada');
    let contado = false;
    const consultarConLimite = sentencias => {
      if (!contado) {
        const espera = limitar(claveIp(ip));
        if (espera) throw Object.assign(error(429, 'demasiadas peticiones'), { espera });
        contado = true;
      }
      return consultar(env, sentencias);
    };
    let cache;
    try { cache = await abrirCache?.(); } catch { /* La caché es opcional. */ }
    const guardar = (clave, respuesta, segundos) => {
      if (!cache) return;
      respuesta.headers.set('X-Calendario-Caduca', String(Date.now() + segundos * 1000));
      respuesta.headers.set('Cache-Control', 'public, max-age=' + segundos);
      guardarCache(Promise.resolve().then(() => cache.put(clave, respuesta)).catch(() => {}));
    };
    const leerCache = async clave => {
      try {
        const respuesta = await cache?.match(clave);
        if (!respuesta) return;
        const caduca = Number(respuesta.headers.get('X-Calendario-Caduca'));
        if (Number.isFinite(caduca) && caduca > Date.now()) return respuesta;
        guardarCache(Promise.resolve().then(() => cache.delete(clave)).catch(() => {}));
      } catch { /* Consultar Turso. */ }
    };
    const controlClave = new Request(url.origin + '/__calendario/control/' + await firma(env.CALENDARIO_TURSO_URL));
    const guardado = await leerCache(controlClave);
    // Una primera lectura pequeña permite compilar los temas; el segundo batch
    // comprueba la MISMA revisión dentro de su snapshot junto a las filas.
    const control = { sql: 'SELECT datos_json FROM agenda_lectura_control WHERE id=1', args: [] };
    const leerControl = async () => {
      const [[fila]] = await consultarConLimite([control]);
      if (!fila) throw error(503, 'Lectura de calendario aún no publicada');
      const valor = JSON.parse(fila.datos_json);
      guardar(controlClave, json(valor), 15);
      return valor;
    };
    let meta = guardado ? await guardado.json() : await leerControl();
    if (meta.version !== 1) throw error(503, 'Versión de lectura incompatible');
    const huella = await firma({ api_calendario: 2, ruta, ...c,
      ...(c.disponibilidad ? { hoy: diaEnZona(new Date(Date.now()), c.zona) } : {}) });
    const revisionPedida = url.searchParams.get('revision');
    if (guardado && (revisionPedida && revisionPedida !== meta.revision || cursor && cursor[0] !== meta.revision)) meta = await leerControl();
    if (revisionPedida && revisionPedida !== meta.revision || cursor && (cursor[0] !== meta.revision || cursor[1] !== huella)) throw error(409, 'La publicación o la selección cambió; reinicia la consulta');
    if (!c.pendientes && ['/calendario/eventos', '/calendario/resumen'].includes(ruta)
        && (c.desde < meta.desde || c.hasta > meta.hasta)) throw error(422, 'Ventana fuera del horizonte publicado');
    const etag = await firma([meta.revision, huella, url.searchParams.get('cursor') || '']);
    const clave = new Request(url.origin + '/__calendario/respuesta/' + etag);
    const entregar = respuesta => {
      const cabeceras = new Headers(respuesta.headers);
      cabeceras.delete('X-Calendario-Caduca');
      cabeceras.set('Cache-Control', 'public, max-age=30');
      if (request.headers.get('If-None-Match')?.replace(/^W\//, '') === cabeceras.get('ETag')) return new Response(null, { status: 304, headers: cabeceras });
      return new Response(request.method === 'HEAD' ? null : respuesta.body, { status: respuesta.status, headers: cabeceras });
    };
    // El control fresco (15 s) fija la revisión de esta clave; la respuesta es inmutable en ella.
    const acierto = await leerCache(clave);
    if (acierto) return entregar(acierto);
    let sentencia;
    if (detalle) sentencia = { sql: 'SELECT detalle_json FROM agenda_lectura_eventos WHERE id=?', args: [id] };
    // Lecturas sin chips: la lista de eventos de siempre.
    else if (ruta === '/calendario/eventos' && c.chips && meta.lectura_chips) sentencia = consultaChips(c, meta, cursor);
    else if (ruta === '/calendario/eventos') sentencia = consultaEventos(c.chips && !c.presentaciones.length
      ? { ...c, presentaciones: ['cita', 'programa'] } : c, meta, cursor);
    else if (ruta === '/calendario/resumen') sentencia = consultaResumen(c, meta);
    else if (ruta === '/calendario/catalogo' && c.disponibilidad) sentencia = disponibilidadPrecalculada(c, meta)
      ? consultaDisponibilidadPrecalculada(c) : consultaDisponibilidad(c, meta);
    else if (ruta === '/calendario/objetivos') {
      const args = [], condiciones = ['1=1', ...predicadosTexto(c.texto || c.resto, 'texto', args)];
      // Varios tipos a la vez: filtrar antes del límite, no después en el cliente.
      if (c.tipos.length) { condiciones.push(`tipo IN (${c.tipos.map(() => '?').join(',')})`); args.push(...c.tipos); }
      if (cursor) { condiciones.push('id>?'); args.push(cursor[4]); }
      args.push(c.limite + 1);
      sentencia = { sql: 'SELECT id,datos_json FROM agenda_lectura_entidades WHERE ' + condiciones.join(' AND ') + ' ORDER BY id LIMIT ?', args };
    }
    let filas = [], barras = null;
    if (sentencia) {
      const extra = ruta === '/calendario/resumen' && c.barras ? [consultaBarras(c, meta)] : [];
      const [actual, respuesta, conBarras] = await consultarConLimite([control, sentencia, ...extra]);
      if (extra.length) barras = conBarras;
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
    } else if (ruta === '/calendario/catalogo') {
      salida = { ...base, catalogo: meta.catalogo,
        fuentes: meta.fuentes, territorios_catalogo: meta.territorios_catalogo, zonas: meta.zonas };
      if (c.disponibilidad && disponibilidadPrecalculada(c, meta)) {
        // Un territorio sin eventos no tiene fila: cuentas vacías.
        const fila = t => JSON.parse(filas.find(f => f.territorio === t)?.datos_json || '{}');
        const global = fila(''), propia = c.territorio ? fila(c.territorio) : global;
        salida.disponibilidad = { territorio: c.territorio || null, temas: propia.temas || {}, raices: propia.raices || {},
          sin_subcategoria: propia.sin_subcategoria || {}, circuitos: global.circuitos || {} };
      } else if (c.disponibilidad) salida.disponibilidad = { territorio: c.territorio || null, ...sumarDisponibilidad(meta.catalogo, filas) };
    }
    else if (ruta === '/calendario/resumen') {
      const porDia = new Map();
      const cambios = new Map(), muestras = new Map(), totales = new Map();
      // Las cuentas llegan como altas y bajas por día; también por categoría
      // («sin_clasificar» sin ella, o en lecturas anteriores a ella).
      const nuevas = () => ({ citas: 0, programas: 0, en_curso: 0 });
      for (const f of filas) {
        if (f.tarjeta) {
          const t = JSON.parse(f.tarjeta), m = meta.lectura_chips ? comoChip(t, f) : t;
          if (!muestras.has(f.dia)) muestras.set(f.dia, []);
          muestras.get(f.dia).push(m);
          if (f.total != null) totales.set(f.dia, f.total);
          continue;
        }
        // Sin presentación (lecturas anteriores a ella) cuenta como cita.
        const clave = { programa: 'programas', prolongada: 'en_curso' }[f.presentacion] || 'citas';
        if (!cambios.has(f.dia)) cambios.set(f.dia, []);
        // Una fila puede sumar a varias competiciones; a las cuentas del día, una vez.
        let codigos = [];
        try { codigos = f.competiciones ? JSON.parse(f.competiciones) : []; } catch { /* Sin competición. */ }
        cambios.get(f.dia).push([f.categoria || 'sin_clasificar', Array.isArray(codigos) ? codigos : [], clave, f.n]);
      }
      const acumulado = nuevas(), porCategoria = {}, porCompeticion = {};
      const conAlgo = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v.citas || v.programas || v.en_curso).map(([k, v]) => [k, { ...v }]));
      for (let dia = c.desde; dia < c.hasta; dia = sumarDiasCalendario(dia, 1)) {
        for (const [categoria, codigos, k, n] of cambios.get(dia) || []) {
          acumulado[k] += n; (porCategoria[categoria] ||= nuevas())[k] += n;
          for (const codigo of codigos) (porCompeticion[codigo] ||= nuevas())[k] += n;
        }
        porDia.set(dia, { dia, cantidad: acumulado.citas + acumulado.programas + acumulado.en_curso,
          ...acumulado, categorias: conAlgo(porCategoria), competiciones: conAlgo(porCompeticion), muestras: muestras.get(dia) || [],
          // chips: cuántas cosas pasan ese día (las muestras son las primeras).
          ...(meta.lectura_chips && c.muestras ? { chips: totales.get(dia) || 0 } : {}) });
      }
      salida = { ...base, dias: [...porDia.values()] };
      if (barras) {
        salida.barras = barras.slice(0, BARRAS_MAX).map(f => ({ ...JSON.parse(f.tarjeta), desde: f.desde, hasta: f.hasta }));
        salida.barras_truncadas = barras.length > BARRAS_MAX;
      }
    } else {
      const hayMas = filas.length > c.limite, pagina = filas.slice(0, c.limite), ultima = pagina.at(-1);
      // dia: primer día visible en la ventana pedida ('' en la lista pendiente),
      // para agrupar en el cliente con la misma regla que la consulta.
      salida = { ...base, [ruta.endsWith('/objetivos') ? 'entidades' : 'eventos']:
        pagina.map(f => f.ocurrencia != null ? { ...comoChip(JSON.parse(f.tarjeta), f), dia: f.dia }
          : f.tarjeta ? { ...JSON.parse(f.tarjeta), dia: f.dia } : JSON.parse(f.datos_json)),
        siguiente: hayMas ? codificar([meta.revision, huella, ultima.dia || '', String(ultima.orden ?? 0), ultima.id,
          ...(ultima.ocurrencia != null ? [ultima.ocurrencia] : [])]) : null };
    }
    const respuesta = json(salida, 200, { 'Cache-Control': 'public, max-age=30', ETag: '"' + etag + '"' });
    guardar(clave, respuesta.clone(), 3600);
    return entregar(respuesta);
  } catch (e) {
    if (e.codigo === 429) return respuesta429(e.espera, CORS);
    return json({ error: e.codigo ? e.message : 'No se pudo consultar el calendario' }, e.codigo || 503);
  }
}
