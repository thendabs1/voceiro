// Generado desde shared/calendario/fechas.js por scripts/sync-workers.mjs. No editar.
// Fechas civiles: nunca pasan por la zona local del navegador.
export function fechaValida(s){
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
    && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
}
export function sumarDiasCalendario(dia, cantidad){
  const d = new Date(dia + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + cantidad);
  return d.toISOString().slice(0, 10);
}
// Intl retiene recursos nativos costosos: reutilizar formatos, no uno por cita/día.
const formatosPorZona = new Map();
function formatosZona(zona){
  if (!formatosPorZona.has(zona)){
    if (formatosPorZona.size >= 8) formatosPorZona.clear();
    formatosPorZona.set(zona, {
      dia: new Intl.DateTimeFormat('en-CA', {
        timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit',
      }),
      hora: new Intl.DateTimeFormat('en-GB', {
        timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }),
    });
  }
  return formatosPorZona.get(zona);
}
export function diaEnZona(instante, zona){
  const partes = Object.fromEntries(formatosZona(zona).dia
    .formatToParts(new Date(instante)).map(p => [p.type, p.value]));
  return `${partes.year}-${partes.month}-${partes.day}`;
}
export function extremoVisible(e, zona){
  if (!e || e.certeza_fecha !== 'confirmado') return { fecha: null, hora: null, sinZona: false };
  if (e.instante && e.certeza_hora === 'confirmado') return {
    fecha: diaEnZona(e.instante, zona), hora: formatosZona(zona).hora.format(new Date(e.instante)), sinZona: false,
  };
  return { fecha: e.fecha, hora: e.certeza_hora === 'confirmado' ? e.hora_local?.slice(0, 5) || null : null,
    sinZona: Boolean(e.hora_local && !e.zona && !e.instante) };
}
export function enDia(cuando, dia, zona){
  if (!cuando) return false;
  return enDiaVisible(cuando, dia, extremoVisible(cuando.inicio, zona), extremoVisible(cuando.fin, zona));
}
function enDiaVisible(cuando, dia, a, b, semana){
  if (cuando.dias_excluidos?.includes(dia)) return false;
  if (cuando.dias_semana && !cuando.dias_semana.includes(semana ?? (new Date(dia + 'T12:00:00Z').getUTCDay() + 6) % 7)) return false;
  if (!a.fecha || a.fecha > dia) return false;
  if (!b.fecha) return a.fecha === dia;
  // Un fin a medianoche es el límite del día, no parte de él.
  if (cuando.fin_exclusivo && b.fecha === dia && (!b.hora || b.hora === '00:00')) return false;
  return b.fecha >= dia;
}
// Resolver los extremos una vez por evento y ordenar antes de agrupar.
export function agruparPorDiaCalendario(eventos, dias, zona){
  const grupos = new Map(dias.map(dia => [dia, []]));
  const semanas = new Map(dias.map(dia => [dia, (new Date(dia + 'T12:00:00Z').getUTCDay() + 6) % 7]));
  for (const e of eventos){
    const cuando = e.programacion?.valor?.cuando;
    if (!cuando) continue;
    const a = extremoVisible(cuando.inicio, zona), b = extremoVisible(cuando.fin, zona);
    if (!a.fecha || !dias.length || a.fecha > dias.at(-1) || (b.fecha || a.fecha) < dias[0]) continue;
    for (const [dia, lista] of grupos) if (enDiaVisible(cuando, dia, a, b, semanas.get(dia))) lista.push(e);
  }
  return grupos;
}
export function ventanaCalendario(fecha, vista){
  if (!fechaValida(fecha)) throw new Error('Fecha de calendario inválida');
  let inicio = fecha;
  if (vista === 'mes') inicio = fecha.slice(0, 8) + '01';
  if (vista === 'semana' || vista === 'mes'){
    const semana = (new Date(inicio + 'T12:00:00Z').getUTCDay() + 6) % 7;
    inicio = sumarDiasCalendario(inicio, -semana);
  }
  const cantidad = vista === 'mes' ? 42 : vista === 'semana' ? 7 : 14;
  return Array.from({ length: cantidad }, (_, i) => sumarDiasCalendario(inicio, i));
}
export function moverFecha(fecha, vista, direccion){
  if (vista !== 'mes') return sumarDiasCalendario(fecha, direccion * (vista === 'semana' ? 7 : 14));
  const d = new Date(fecha.slice(0, 8) + '01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + direccion);
  return d.toISOString().slice(0, 10);
}
