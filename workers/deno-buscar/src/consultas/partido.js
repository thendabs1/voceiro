import { estadoPartido, referenciaPartido } from './normalizar.js';

const texto = v => typeof v === 'string' && v.trim() ? v.trim().slice(0, 160) : null;
const valor = v => typeof v === 'number' && Number.isFinite(v) ? String(v) : texto(v);
const nombre = p => texto(p?.athlete?.displayName || p?.athlete?.fullName);
const ESTADISTICAS = {
  soccer: [
    ['posesion', 'possessionPct'], ['tiros', 'totalShots'], ['puerta', 'shotsOnTarget'],
    ['corners', 'wonCorners'], ['faltas', 'foulsCommitted'],
    ['amarillas', 'yellowCards'], ['rojas', 'redCards'],
  ],
  basketball: [
    ['tirosCampo', 'fieldGoalsMade-fieldGoalsAttempted'], ['triples', 'threePointFieldGoalsMade-threePointFieldGoalsAttempted'],
    ['libres', 'freeThrowsMade-freeThrowsAttempted'], ['rebotes', 'totalRebounds'],
    ['asistencias', 'assists'], ['perdidas', 'totalTurnovers', 'turnovers'], ['robos', 'steals'], ['tapones', 'blocks'],
  ],
};

// Selección estructurada: no reenviar comentarios, noticias ni la respuesta completa.
export function normalizarPartido(d, codigo, deporte, liga, evento) {
  const h = d.header, c = h?.competitions?.[0];
  const lados = c?.competitors || [];
  const local = lados.find(p => p.homeAway === 'home');
  const visitante = lados.find(p => p.homeAway === 'away');
  if (String(h?.id) !== evento || String(c?.id) !== evento || h?.league?.slug !== liga || h.competitions.length !== 1
      || lados.length !== 2 || !texto(local?.team?.displayName) || !texto(visitante?.team?.displayName)
      || local.id == null || visitante.id == null
      || String(local.id) === String(visitante.id) || !referenciaPartido(codigo, evento)) {
    throw new Error('ESPN: identidad o lados del partido no válidos');
  }
  const lado = id => String(id) === String(local.id) ? 'local' : String(id) === String(visitante.id) ? 'visitante' : null;
  const estado = estadoPartido(c.status || h.status);
  const enMarcador = ['en_juego', 'final', 'suspendido'].includes(estado);
  const equipos = Object.fromEntries((d.boxscore?.teams || []).map(t => [lado(t.team?.id),
    Object.fromEntries((t.statistics || []).map(s => [s.name, valor(s.displayValue ?? s.value)]))]));
  const estadisticas = (ESTADISTICAS[deporte] || []).map(([id, ...nombres]) => ({ id,
    local: nombres.map(n => equipos.local?.[n]).find(v => v != null) ?? null,
    visitante: nombres.map(n => equipos.visitante?.[n]).find(v => v != null) ?? null,
  })).filter(s => s.local != null || s.visitante != null);

  const tipos = { goal: 'gol', 'own-goal': 'propia', 'penalty---scored': 'penalti',
    'yellow-card': 'amarilla', 'red-card': 'roja', 'yellow-red-card': 'segundaAmarilla', substitution: 'cambio' };
  const incidencias = deporte === 'soccer' ? (d.keyEvents || []).flatMap(e => {
    const tipo = Object.hasOwn(tipos, e.type?.type) ? tipos[e.type.type] : null, equipo = lado(e.team?.id);
    if (!tipo || !equipo) return [];
    return [{ tipo, equipo, minuto: texto(e.clock?.displayValue),
      jugadores: (e.participants || []).map(nombre).filter(Boolean).slice(0, 3) }];
  }) : [];

  const alineaciones = deporte === 'soccer' ? (d.rosters || []).flatMap(r => {
    const equipo = lado(r.team?.id);
    if (!equipo) return [];
    const jugadores = (r.roster || []).filter(p => nombre(p)).slice(0, 50).map(p => ({
      nombre: nombre(p), dorsal: valor(p.jersey), posicion: texto(p.position?.abbreviation), titular: p.starter === true,
    }));
    return jugadores.length ? [{ equipo, formacion: texto(r.formation), jugadores }] : [];
  }) : [];

  const parciales = deporte === 'basketball' && enMarcador
    ? Array.from({ length: Math.min(12, Math.max(local.linescores?.length || 0, visitante.linescores?.length || 0)) }, (_, i) => ({
      periodo: i + 1, local: valor(local.linescores?.[i]?.displayValue ?? local.linescores?.[i]?.value),
      visitante: valor(visitante.linescores?.[i]?.displayValue ?? visitante.linescores?.[i]?.value),
    })) : [];
  const jugadores = deporte === 'basketball' ? (d.boxscore?.players || []).flatMap(t => {
    const equipo = lado(t.team?.id);
    if (!equipo) return [];
    const filas = (t.statistics || []).flatMap(g => (g.athletes || []).flatMap(p => {
      if (!nombre(p) || p.didNotPlay || !p.stats?.length) return [];
      const stats = Object.fromEntries((g.names || []).map((n, i) => [n, valor(p.stats[i])]));
      return [{ nombre: nombre(p), minutos: stats.MIN ?? null, puntos: stats.PTS ?? null,
        rebotes: stats.REB ?? null, asistencias: stats.AST ?? null }];
    })).slice(0, 50);
    return filas.length ? [{ equipo, filas }] : [];
  }) : [];
  const categorias = { points: 'puntos', rebounds: 'rebotes', assists: 'asistencias' };
  const destacados = deporte === 'basketball' ? (d.leaders || []).flatMap(t => {
    const equipo = lado(t.team?.id);
    if (!equipo) return [];
    return (t.leaders || []).flatMap(g => Object.hasOwn(categorias, g.name) ? (g.leaders || []).slice(0, 3).flatMap(p =>
      nombre(p) && valor(p.displayValue) != null ? [{ equipo, tipo: categorias[g.name], nombre: nombre(p), valor: valor(p.displayValue) }] : []) : []);
  }) : [];

  return {
    id: referenciaPartido(codigo, evento), competicion: codigo, temporada: h.season?.year ?? null,
    inicio: c.date || null, estado, reloj: estado === 'en_juego' ? texto(c.status?.displayClock) : null,
    local: texto(local.team.displayName), visitante: texto(visitante.team.displayName),
    marcador: enMarcador ? { local: valor(local.score), visitante: valor(visitante.score) } : null,
    lugar: texto(d.gameInfo?.venue?.fullName), ciudad: texto(d.gameInfo?.venue?.address?.city),
    estadisticas, incidencias, alineaciones, parciales, jugadores, destacados,
  };
}
