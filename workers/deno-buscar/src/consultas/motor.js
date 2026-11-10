import { leerIdMotor, UUID_MOTOR, FUENTES_MOTOR, baseF1, baseMoto, filasF1, filasMoto, claveSesionMoto } from './motor-normalizar.js';

const OPENF1 = 'https://api.openf1.org/v1';
const MOTOGP = 'https://api.pulselive.motogp.com/motogp/v1/results';
const uuid = new RegExp(`^${UUID_MOTOR}$`);
const lista = d => { if (!Array.isArray(d)) throw new Error('Motor: respuesta sin lista'); return d; };
const url = (base, parametros) => `${base}?${new URLSearchParams(parametros)}`;
// Los nombres de categoría se resuelven por temporada.
// Un vacío puede dejar de serlo en minutos: guardarlo aquí alargaría el TTL de la ficha.
const sinDatos = d => Array.isArray(d) ? !d.length : Array.isArray(d?.classification) && !d.classification.length;
const CATEGORIAS = { motogp: 'MotoGP™', moto2: 'Moto2™', moto3: 'Moto3™' };

export function crearMotor({ pedir, ahora, abrirCache }) {
  const enCurso = new Map();
  async function recurso(proveedor, direccion, ttl = 3600) {
    const req = new Request(direccion), cache = await abrirCache();
    const hit = await cache.match(req);
    if (hit) {
      const d = await hit.json();
      if (d.caduca > ahora()) return d.datos;
    }
    if (enCurso.has(direccion)) return enCurso.get(direccion);
    const tarea = (async () => {
      const datos = await pedir(proveedor, direccion);
      if (!sinDatos(datos)) await cache.put(req, Response.json({ datos, caduca: ahora() + ttl * 1000 })).catch(() => {});
      return datos;
    })();
    enCurso.set(direccion, tarea);
    try { return await tarea; } finally { enCurso.delete(direccion); }
  }
  async function f1(id, fecha) {
    const year = id.temporada || Number(fecha.slice(0, 4));
    const sesiones = lista(await recurso('openf1', url(`${OPENF1}/sessions`, { year })));
    if (sesiones.some(s => s.year !== year)) throw new Error('OpenF1: temporada distinta');
    const elegidas = sesiones.filter(s => /^(Practice [1-3]|Qualifying|Sprint Qualifying|Sprint|Race)$/.test(s.session_name)
      && leerIdMotor(`openf1:sesion/${s.year}/${s.session_key}`)
      && (id.lista ? s.date_start?.slice(0, 10) === fecha : String(s.session_key) === id.sesion));
    // Fuera de un fin de semana no hace falta pedir los nombres de GP.
    const gps = elegidas.length ? lista(await recurso('openf1', url(`${OPENF1}/meetings`, { year }))) : [];
    const bases = elegidas.map(s => baseF1(s, gps.find(g => g.meeting_key === s.meeting_key), ahora()));
    if (id.lista) return { ficha: { competicion: 'f1', temporada: year, fecha, partidos: bases, fuente: FUENTES_MOTOR.openf1 }, vacio: !bases.length, ttl: 900 };
    if (elegidas.length !== 1) throw new Error('OpenF1: sesión no encontrada');
    const s = elegidas[0], base = bases[0];
    let filas = [];
    // La ventana en directo requiere suscripción. No se intenta acceder a ella.
    if (s.is_cancelled !== true && Number.isFinite(Date.parse(s.date_end)) && ahora() >= Date.parse(s.date_end) + 30 * 60000) {
      const resultados = lista(await recurso('openf1', url(`${OPENF1}/session_result`, { session_key: s.session_key }), 300));
      if (resultados.some(r => r.session_key !== s.session_key || r.meeting_key !== s.meeting_key)) throw new Error('OpenF1: resultado de otra sesión');
      if (resultados.length) {
        const pilotos = lista(await recurso('openf1', url(`${OPENF1}/drivers`, { session_key: s.session_key })));
        if (pilotos.some(p => p.session_key !== s.session_key || p.meeting_key !== s.meeting_key)) throw new Error('OpenF1: pilotos de otra sesión');
        filas = filasF1(resultados, pilotos);
      }
    }
    // Una clasificación publicada sí acredita que la sesión terminó.
    return { ficha: { ...base, ...(filas.length ? { estado: 'final' } : {}), filas }, ttl: filas.length ? 3600 : 300 };
  }
  async function moto(id, fecha) {
    const year = id.temporada || Number(fecha.slice(0, 4));
    const temporadas = lista(await recurso('motogp', `${MOTOGP}/seasons`, 86400));
    const temporada = temporadas.find(s => s.year === year && uuid.test(s.id));
    const vacia = { ficha: { competicion: id.competicion, temporada: year, fecha, partidos: [], fuente: FUENTES_MOTOR.motogp }, vacio: true, ttl: 900 };
    if (!temporada) { if (id.lista) return vacia; throw new Error('MotoGP: temporada no encontrada'); }
    const eventos = lista(await recurso('motogp', url(`${MOTOGP}/events`, { seasonUuid: temporada.id, isFinished: 'true' })));
    // Primero el intervalo de días del evento, nunca su hora de sesión como UTC.
    const elegidos = eventos.filter(e => e.test === false && e.season?.id === temporada.id && e.season?.year === year && uuid.test(e.id)
      && (id.lista ? e.date_start <= fecha && e.date_end >= fecha : e.id === id.evento));
    if (!elegidos.length) { if (id.lista) return vacia; throw new Error('MotoGP: evento no encontrado'); }
    const categorias = lista(await recurso('motogp', url(`${MOTOGP}/categories`, { seasonUuid: temporada.id }), 86400));
    const categoria = categorias.find(c => c.name === CATEGORIAS[id.competicion] && uuid.test(c.id));
    if (!categoria) throw new Error('MotoGP: categoría no encontrada');
    const bases = [];
    for (const e of elegidos) {
      const sesiones = lista(await recurso('motogp', url(`${MOTOGP}/sessions`, { eventUuid: e.id, categoryUuid: categoria.id })));
      for (const s of sesiones) {
        if (s.event?.id !== e.id || s.category?.id !== categoria.id || s.event?.test !== false
            || !uuid.test(s.id) || !claveSesionMoto(s)) continue;
        // El prefijo es el día local publicado, sin aceptar el offset falso.
        if (id.lista ? s.date?.slice(0, 10) !== fecha : s.id !== id.sesion) continue;
        bases.push(baseMoto(s, e, year, id.competicion));
      }
    }
    if (id.lista) return { ...vacia, ficha: { ...vacia.ficha, partidos: bases }, vacio: !bases.length };
    if (bases.length !== 1) throw new Error('MotoGP: sesión no encontrada');
    const d = await recurso('motogp', `${MOTOGP}/session/${id.sesion}/classification?test=false`, 300);
    if (!Array.isArray(d.classification)) throw new Error('MotoGP: clasificación no válida');
    return { ficha: { ...bases[0], filas: filasMoto(d) }, ttl: d.classification.length ? 3600 : 300 };
  }
  return async (texto, identificador, fecha) => {
    const id = leerIdMotor(identificador);
    const proveedor = id?.proveedor || (texto === 'f1' ? 'openf1' : 'motogp');
    const fuente = FUENTES_MOTOR[proveedor];
    const datos = id ? await (proveedor === 'openf1' ? f1 : moto)(id, fecha || new Date(ahora()).toISOString().slice(0, 10))
      : { candidatos: [{ id: `${proveedor}:resultados/${texto}`, titulo: texto, detalle: 'resultados', anio: null, imagen: null, enlace: fuente.url }] };
    return { ...datos, fuente: fuente.nombre, enlace: fuente.url, licencia: { nombre: fuente.licencia, enlace: fuente.licencia_url }, atribucion: fuente.nombre };
  };
}
