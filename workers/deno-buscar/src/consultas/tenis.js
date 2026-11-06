import { fechaResultadosValida } from './normalizar.js';

const CIRCUITOS = { atp: '851', wta: '900' };
const texto = v => typeof v === 'string' && v.trim() ? v.trim().slice(0, 160) : null;
const numero = v => (typeof v === 'number' || typeof v === 'string') && /^\d+(?:\.0+)?$/.test(String(v)) ? Number(v) : null;
const ESTADOS = { STATUS_SCHEDULED: 'programado', STATUS_IN_PROGRESS: 'en_juego', STATUS_FINAL: 'final',
  STATUS_RETIRED: 'final', STATUS_WALKOVER: 'final', STATUS_CANCELED: 'cancelado', STATUS_CANCELLED: 'cancelado',
  STATUS_POSTPONED: 'aplazado', STATUS_DELAYED: 'retrasado', STATUS_SUSPENDED: 'suspendido', STATUS_ABANDONED: 'suspendido' };

// La fecha permite resolver la ficha en frío con un único scoreboard, sin buscar
// otros días ni usar el summary de equipos. Se comprueba también el UID de origen.
export function leerIdTenis(id) {
  const p = /^espn:tenis\/(atp|wta)\/(\d{4})(\d{2})(\d{2})\/([1-9]\d{0,8}-\d{4})\/([1-9]\d{0,11})$/.exec(id || '');
  if (!p || p[0] !== id) return null;
  const fecha = `${p[2]}-${p[3]}-${p[4]}`;
  return fechaResultadosValida(fecha) && fecha >= '0001-01-01'
    ? { circuito: p[1], fecha, torneo: p[5], encuentro: p[6] } : null;
}

export function normalizarTenis(d, circuito, fecha) {
  if (!Object.hasOwn(CIRCUITOS, circuito) || d.leagues?.[0]?.slug !== circuito || !Array.isArray(d.events)
      || !fechaResultadosValida(fecha)) throw new Error('ESPN: marcador de tenis no válido');
  const fuente = { nombre: 'ESPN', url: 'https://www.espn.com/tennis/',
    licencia: 'Condiciones de ESPN', licencia_url: 'https://disneytermsofuse.com/' };
  const partidos = [], vistos = new Set();
  for (const torneo of d.events) {
    for (const grupo of torneo.groupings || []) {
      for (const c of grupo.competitions || []) {
        // El parámetro dates selecciona torneos completos, no el día del encuentro.
        // Sin hora válida conservamos el día declarado, pero nunca su hora ficticia.
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?Z$/.test(c.date || '')
            || isNaN(Date.parse(c.date)) || c.date.slice(0, 10) !== fecha) continue;
        const id = `espn:tenis/${circuito}/${fecha.replaceAll('-', '')}/${torneo.id}/${c.id}`;
        if (!leerIdTenis(id) || torneo.uid !== `s:850~l:${CIRCUITOS[circuito]}~e:${torneo.id}`
            || c.uid !== `${torneo.uid}~c:${c.id}` || vistos.has(c.uid)
            || c.competitors?.length !== 2 || !/^\d+$/.test(grupo.grouping?.id || '')) {
          throw new Error('ESPN: identidad o lados de tenis no válidos');
        }
        vistos.add(c.uid);
        const original = typeof c.status?.type?.name === 'string' ? c.status.type.name : null;
        const lados = c.competitors.map(p => {
          const atletas = p.type === 'athlete' ? [p.athlete] : p.type === 'team' ? p.roster?.athletes : null;
          if (!atletas || atletas.length !== (p.type === 'athlete' ? 1 : 2)) throw new Error('ESPN: participantes de tenis no válidos');
          return { participantes: atletas.map(a => a?.displayName === 'TBD' ? null : texto(a?.displayName)),
            ganador: typeof p.winner === 'boolean' ? p.winner : null,
            sets: (p.linescores || []).map(s => ({ juegos: numero(s.value), desempate: numero(s.tiebreak) })) };
        });
        partidos.push({ id, vista: 'encuentro_tenis', competicion: circuito, temporada: torneo.season?.year ?? null,
          inicio: c.timeValid === true ? c.date : null, estado: ESTADOS[original] || 'desconocido', estado_original: original,
          condicion: original === 'STATUS_RETIRED' ? 'retirada' : original === 'STATUS_WALKOVER' ? 'incomparecencia' : null,
          referencias_agenda: circuito === 'atp' ? ['tournament_uid', 'tournament_calendar_uid'].map(tipo =>
            ({ proveedor: 'espn-atp', tipo, id: torneo.uid })) : [],
          fuente, torneo: { id: torneo.uid, nombre: texto(torneo.name) },
          cuadro: { id: grupo.grouping.id, nombre: texto(grupo.grouping.displayName) },
          ronda: texto(c.round?.displayName), lados });
      }
    }
  }
  return { competicion: circuito, temporada: d.season?.year ?? null, fecha, fuente, partidos };
}

// Caché de origen normalizada, compartida entre idiomas, lista y fichas. Un fallo
// cuesta un GET por circuito/día y pasa siempre por el presupuesto común de ESPN.
export function crearTenis({ pedir, abrirCache, ahora }) {
  const enCurso = new Map();
  async function cargar(circuito, fecha) {
    const req = new Request(`https://voceiro.invalid/consulta/origen-tenis/v1/${circuito}/${fecha}`);
    const cache = await abrirCache();
    const hit = await cache.match(req);
    if (hit) {
      const datos = await hit.json(), ttl = Math.floor((datos.caduca - ahora()) / 1000);
      if (ttl > 0) return { ficha: datos.ficha, ttl };
    }
    if (enCurso.has(req.url)) return enCurso.get(req.url);
    const trabajo = (async () => {
      const d = await pedir('espn', `https://site.api.espn.com/apis/site/v2/sports/tennis/${circuito}/scoreboard?dates=${fecha.replaceAll('-', '')}`);
      const ficha = normalizarTenis(d, circuito, fecha);
      const ttl = ficha.partidos.some(p => p.estado === 'en_juego') ? 60
        : ficha.partidos.some(p => p.estado === 'programado') || !ficha.partidos.length ? 900 : 3600;
      await cache.put(req, Response.json({ ficha, caduca: ahora() + ttl * 1000 })).catch(() => {});
      return { ficha, ttl };
    })();
    enCurso.set(req.url, trabajo);
    try { return await trabajo; } finally { enCurso.delete(req.url); }
  }
  return async ({ tipo, id, circuito, fecha }) => {
    if (tipo === 'resultados' && !id) return { candidatos: [{ id: `espn:resultados/${circuito}`, titulo: circuito.toUpperCase(),
      detalle: tipo, anio: null, imagen: null, enlace: 'https://www.espn.com/tennis/' }] };
    const identidad = id && tipo === 'partido' ? leerIdTenis(id) : null;
    const dia = identidad?.fecha || fecha || new Date(ahora()).toISOString().slice(0, 10);
    const { ficha, ttl } = await cargar(circuito, dia);
    if (tipo === 'resultados') return { ficha, ttl, vacio: !ficha.partidos.length };
    if (!id) return { ttl, candidatos: ficha.partidos.map(p => ({ id: p.id,
      titulo: p.lados.map(l => l.participantes.filter(Boolean).join(' / ')).join(' · '), detalle: p.ronda,
      inicio: p.inicio, estado: p.estado, anio: p.temporada, imagen: null, enlace: p.fuente.url })) };
    const encuentro = ficha.partidos.find(p => p.id === id);
    if (!encuentro) throw new Error('ESPN: encuentro de tenis no disponible en la fecha');
    return { ficha: encuentro, ttl };
  };
}
